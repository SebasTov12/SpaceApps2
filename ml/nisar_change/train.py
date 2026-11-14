from __future__ import annotations

import json
import os
import random
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from torch import nn
from torch.utils.data import DataLoader

from .data import NisarPairDataset, read_manifest
from .model import ChangeUNet


@dataclass(frozen=True)
class Config:
    manifest: Path
    output_dir: Path
    input_channels: int
    base_channels: int
    batch_size: int
    epochs: int
    learning_rate: float
    seed: int
    split_strategy: str
    device: str
    threshold: float

    @classmethod
    def from_env(cls) -> Config:
        return cls(
            manifest=Path(os.getenv("ML_MANIFEST", "./data/filtered/manifest.parquet")),
            output_dir=Path(os.getenv("ML_OUTPUT_DIR", "./models/nisar-change")),
            input_channels=int(os.getenv("ML_INPUT_CHANNELS", "2")),
            base_channels=int(os.getenv("ML_BASE_CHANNELS", "16")),
            batch_size=int(os.getenv("ML_BATCH_SIZE", "4")),
            epochs=int(os.getenv("ML_EPOCHS", "30")),
            learning_rate=float(os.getenv("ML_LEARNING_RATE", "0.0003")),
            seed=int(os.getenv("ML_RANDOM_SEED", "42")),
            split_strategy=os.getenv("ML_SPLIT_STRATEGY", "spatiotemporal").lower(),
            device=os.getenv("ML_DEVICE", "auto").lower(),
            threshold=float(os.getenv("ML_THRESHOLD", "0.5")),
        )

    def validate(self) -> None:
        if self.input_channels < 1 or self.base_channels < 4:
            raise ValueError("ML_INPUT_CHANNELS must be positive and ML_BASE_CHANNELS at least 4")
        if self.batch_size < 1 or self.epochs < 1 or self.learning_rate <= 0:
            raise ValueError("Batch size, epochs, and learning rate must be positive")
        if self.split_strategy not in {"spatiotemporal", "preassigned"}:
            raise ValueError("ML_SPLIT_STRATEGY must be spatiotemporal or preassigned")
        if not 0 < self.threshold < 1:
            raise ValueError("ML_THRESHOLD must be between 0 and 1")


def seed_everything(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False


def choose_device(requested: str) -> torch.device:
    if requested == "auto":
        return torch.device("cuda" if torch.cuda.is_available() else "cpu")
    device = torch.device(requested)
    if device.type == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("ML_DEVICE requests CUDA, but CUDA is unavailable")
    return device


def dice_loss(logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
    probabilities = torch.sigmoid(logits)
    dimensions = (1, 2, 3)
    intersection = (probabilities * targets).sum(dim=dimensions)
    denominator = probabilities.sum(dim=dimensions) + targets.sum(dim=dimensions)
    return 1 - ((2 * intersection + 1) / (denominator + 1))


def train_epoch(
    model: ChangeUNet,
    loader: DataLoader,
    optimizer: torch.optim.Optimizer,
    criterion: nn.Module,
    device: torch.device,
) -> float:
    model.train()
    total_loss = 0.0
    for batch in loader:
        before = batch["before"].to(device)
        after = batch["after"].to(device)
        labels = batch["label"].to(device)
        optimizer.zero_grad(set_to_none=True)
        logits = model(before, after)
        loss = criterion(logits, labels) + dice_loss(logits, labels).mean()
        loss.backward()
        optimizer.step()
        total_loss += loss.item() * before.shape[0]
    return total_loss / len(loader.dataset)


@torch.no_grad()
def evaluate(
    model: ChangeUNet,
    loader: DataLoader,
    criterion: nn.Module,
    device: torch.device,
    threshold: float,
) -> dict[str, float]:
    model.eval()
    total_loss = 0.0
    true_positive = false_positive = false_negative = 0
    for batch in loader:
        before = batch["before"].to(device)
        after = batch["after"].to(device)
        labels = batch["label"].to(device)
        logits = model(before, after)
        loss = criterion(logits, labels) + dice_loss(logits, labels).mean()
        total_loss += loss.item() * before.shape[0]
        predicted = torch.sigmoid(logits) >= threshold
        expected = labels >= 0.5
        true_positive += int((predicted & expected).sum().item())
        false_positive += int((predicted & ~expected).sum().item())
        false_negative += int((~predicted & expected).sum().item())
    precision_denominator = true_positive + false_positive
    recall_denominator = true_positive + false_negative
    f1_denominator = 2 * true_positive + false_positive + false_negative
    return {
        "loss": total_loss / len(loader.dataset),
        "pixel_precision": true_positive / precision_denominator if precision_denominator else 0.0,
        "pixel_recall": true_positive / recall_denominator if recall_denominator else 0.0,
        "pixel_f1": 2 * true_positive / f1_denominator if f1_denominator else 0.0,
    }


def export_best_onnx(checkpoint_path: Path, output_path: Path) -> None:
    """Export the selected checkpoint for the small CPU-only inference service."""
    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=True)
    input_channels = int(checkpoint["input_channels"])
    base_channels = int(checkpoint["base_channels"])
    model = ChangeUNet(input_channels, base_channels).cpu().eval()
    model.load_state_dict(checkpoint["state_dict"])
    sample = torch.zeros((1, input_channels, 64, 64), dtype=torch.float32)
    torch.onnx.export(
        model,
        (sample, sample),
        output_path,
        input_names=["before", "after"],
        output_names=["logits"],
        dynamic_axes={
            "before": {0: "batch", 2: "height", 3: "width"},
            "after": {0: "batch", 2: "height", 3: "width"},
            "logits": {0: "batch", 2: "height", 3: "width"},
        },
        opset_version=17,
        dynamo=False,
    )


def main() -> None:
    config = Config.from_env()
    config.validate()
    seed_everything(config.seed)
    device = choose_device(config.device)
    manifest = read_manifest(config.manifest, config.split_strategy)
    manifest_dir = config.manifest.resolve().parent

    datasets = {
        split: NisarPairDataset(
            manifest[manifest["split"].astype(str) == split], manifest_dir, config.input_channels
        )
        for split in ("train", "validation", "test")
    }
    if any(len(datasets[name]) == 0 for name in ("train", "validation")):
        raise ValueError("Training and validation splits must both contain samples")
    loaders = {
        split: DataLoader(
            dataset,
            batch_size=config.batch_size,
            shuffle=split == "train",
            num_workers=0,
            pin_memory=device.type == "cuda",
        )
        for split, dataset in datasets.items()
        if len(dataset) > 0
    }

    model = ChangeUNet(config.input_channels, config.base_channels).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=config.learning_rate)
    criterion = nn.BCEWithLogitsLoss()
    config.output_dir.mkdir(parents=True, exist_ok=True)
    best_f1 = -1.0
    history: list[dict[str, float | int]] = []

    for epoch in range(1, config.epochs + 1):
        training_loss = train_epoch(model, loaders["train"], optimizer, criterion, device)
        validation = evaluate(
            model, loaders["validation"], criterion, device, config.threshold
        )
        record: dict[str, float | int] = {
            "epoch": epoch,
            "train_loss": training_loss,
            "validation_loss": validation["loss"],
            "validation_pixel_f1": validation["pixel_f1"],
        }
        history.append(record)
        print(json.dumps(record), flush=True)
        if validation["pixel_f1"] > best_f1:
            best_f1 = validation["pixel_f1"]
            saved_config = {
                key: str(value) if isinstance(value, Path) else value
                for key, value in asdict(config).items()
            }
            torch.save(
                {
                    "state_dict": model.state_dict(),
                    "config": saved_config,
                    "epoch": epoch,
                    "validation": validation,
                    "input_channels": config.input_channels,
                    "base_channels": config.base_channels,
                    "threshold": config.threshold,
                },
                config.output_dir / "best.pt",
            )

    (config.output_dir / "history.json").write_text(
        json.dumps(history, indent=2), encoding="utf-8"
    )
    export_best_onnx(config.output_dir / "best.pt", config.output_dir / "best.onnx")
    if "test" in loaders:
        checkpoint = torch.load(config.output_dir / "best.pt", map_location=device, weights_only=True)
        model.load_state_dict(checkpoint["state_dict"])
        result = evaluate(model, loaders["test"], criterion, device, config.threshold)
        (config.output_dir / "test_metrics.json").write_text(
            json.dumps(result, indent=2), encoding="utf-8"
        )
        print(json.dumps({"test": result}), flush=True)


if __name__ == "__main__":
    main()
