from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset


REQUIRED_COLUMNS = {"sample_id", "sample_path", "split", "spatial_group", "temporal_group"}
VALID_SPLITS = {"train", "validation", "test"}


def read_manifest(path: Path, split_strategy: str) -> pd.DataFrame:
    if not path.is_file():
        raise FileNotFoundError(f"Training manifest not found: {path}")
    frame = pd.read_parquet(path) if path.suffix.lower() in {".parquet", ".pq"} else pd.read_csv(path)
    missing = REQUIRED_COLUMNS - set(frame.columns)
    if missing:
        raise ValueError(f"Manifest is missing required columns: {', '.join(sorted(missing))}")
    if frame.empty:
        raise ValueError("Manifest has no samples")
    if frame["sample_id"].isna().any() or frame["sample_id"].duplicated().any():
        raise ValueError("Manifest sample_id values must be non-empty and unique")
    if not set(frame["split"].dropna().astype(str)).issubset(VALID_SPLITS):
        raise ValueError("Manifest split values must be train, validation, or test")
    if frame[["sample_path", "split", "spatial_group", "temporal_group"]].isna().any().any():
        raise ValueError("Manifest paths, split, spatial_group, and temporal_group cannot be empty")

    present_splits = set(frame["split"].astype(str))
    if not {"train", "validation"}.issubset(present_splits):
        raise ValueError("Manifest must include train and validation samples")
    if split_strategy == "spatiotemporal":
        for group_column in ("spatial_group", "temporal_group"):
            owners = frame.groupby(group_column)["split"].nunique()
            leaked = owners[owners > 1]
            if not leaked.empty:
                raise ValueError(
                    f"Spatiotemporal leakage: {group_column} values occur in multiple splits "
                    f"(examples: {', '.join(map(str, leaked.index[:5]))})"
                )
    return frame.reset_index(drop=True)


class NisarPairDataset(Dataset[dict[str, torch.Tensor]]):
    def __init__(self, rows: pd.DataFrame, manifest_dir: Path, input_channels: int) -> None:
        self.rows = rows.reset_index(drop=True)
        self.manifest_dir = manifest_dir
        self.input_channels = input_channels

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, index: int) -> dict[str, torch.Tensor]:
        row: Any = self.rows.iloc[index]
        sample_path = Path(str(row["sample_path"]))
        if not sample_path.is_absolute():
            sample_path = self.manifest_dir / sample_path
        with np.load(sample_path, allow_pickle=False) as sample:
            required = {"before", "after", "label"}
            if not required.issubset(sample.files):
                raise ValueError(f"{sample_path} must contain arrays: before, after, label")
            before = np.asarray(sample["before"], dtype=np.float32)
            after = np.asarray(sample["after"], dtype=np.float32)
            label = np.asarray(sample["label"], dtype=np.float32)

        if before.ndim != 3 or after.shape != before.shape:
            raise ValueError(f"{sample_path}: before and after must share [channels, height, width]")
        if before.shape[0] != self.input_channels:
            raise ValueError(
                f"{sample_path}: expected {self.input_channels} channels, found {before.shape[0]}"
            )
        if label.shape == (1, *before.shape[-2:]):
            label = label[0]
        if label.shape != before.shape[-2:]:
            raise ValueError(f"{sample_path}: label must match the image height and width")
        if not np.isfinite(before).all() or not np.isfinite(after).all():
            raise ValueError(f"{sample_path}: image arrays contain NaN or infinite values")
        if not np.isfinite(label).all() or not np.isin(label, (0, 1)).all():
            raise ValueError(f"{sample_path}: label values must be binary 0/1")

        return {
            "before": torch.from_numpy(np.ascontiguousarray(before)),
            "after": torch.from_numpy(np.ascontiguousarray(after)),
            "label": torch.from_numpy(np.ascontiguousarray(label[None, ...])),
        }

