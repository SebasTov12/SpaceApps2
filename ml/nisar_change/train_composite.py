"""Train an exploratory composite from real NISAR raster data and UNGRD impacts.

The NISAR branch is an unsupervised, per-track Mahalanobis anomaly detector.
The impact branch is a shrinkage estimator trained on 2019-2022 UNGRD outcomes
and evaluated out-of-time on 2025. Neither output is an event probability.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
import torch


ROOT = Path(__file__).resolve().parents[2]
METRICS = ("affected_families", "affected_people", "homes_destroyed", "homes_damaged", "deaths")
TRACK_RE = re.compile(r"_(\d{3})_([AD])_(\d{3})_")
DATE_RE = re.compile(r"(20\d{6})T\d{6}")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_raster(path: Path) -> tuple[np.ndarray, np.ndarray]:
    with rasterio.open(path) as dataset:
        array = dataset.read(1, masked=True).astype(np.float64)
        valid = ~np.ma.getmaskarray(array) & np.isfinite(array.filled(np.nan))
        return array.filled(np.nan), valid


def standardize_phase(phase: np.ndarray, valid: np.ndarray) -> np.ndarray:
    values = phase[valid]
    center = float(np.median(values))
    mad = float(np.median(np.abs(values - center)))
    scale = 1.4826 * mad
    if scale < 1e-6:
        q25, q75 = np.quantile(values, [0.25, 0.75])
        scale = float((q75 - q25) / 1.349)
    if scale < 1e-6:
        scale = 1.0
    return np.clip((phase - center) / scale, -12, 12)


def mahalanobis(samples: np.ndarray, mean: np.ndarray, inverse_covariance: np.ndarray) -> np.ndarray:
    centered = samples - mean
    return np.einsum("ij,jk,ik->i", centered, inverse_covariance, centered)


def percentile(values: list[float], value: float) -> float:
    if not values:
        return 50.0
    arr = np.asarray(values, dtype=np.float64)
    return float(100.0 * (np.searchsorted(np.sort(arr), value, side="right") / len(arr)))


def discover_gunw(catalog_dir: Path) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    for manifest_path in sorted((ROOT / "data/raw/nisar").glob("harmony-stack-*/NISAR_L2_GUNW_PROVISIONAL_V1/batch-*/harmony-manifest.json")):
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        for output in manifest["outputs"]:
            variable = output["variable"].rsplit("/", 1)[-1]
            if variable not in {"unwrappedPhase", "coherenceMagnitude"}:
                continue
            granule = output["granule_name"]
            grouped[granule].setdefault("outputs", {})[variable] = output
            grouped[granule]["collection"] = manifest["collection"]
    by_track: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for granule, item in grouped.items():
        layers = item.get("outputs", {})
        if set(layers) != {"unwrappedPhase", "coherenceMagnitude"}:
            continue
        track = TRACK_RE.search(granule)
        dates = DATE_RE.findall(granule)
        if not track or len(dates) < 4:
            continue
        track_id = f"{track.group(1)}-{track.group(2)}-{track.group(3)}"
        item.update({"granule_name": granule, "track_id": track_id, "sort_date": dates[2]})
        by_track[track_id].append(item)
    for items in by_track.values():
        items.sort(key=lambda row: row["sort_date"])
    return by_track


def train_anomaly(by_track: dict[str, list[dict[str, Any]]], seed: int, device: torch.device) -> tuple[dict[str, Any], dict[str, Any], int, list[str]]:
    rng = np.random.default_rng(seed)
    models: dict[str, Any] = {}
    reports: dict[str, Any] = {}
    total_train_pixels = 0
    hashes: set[str] = set()
    for track_id, observations in by_track.items():
        if len(observations) < 5:
            continue
        split = max(3, len(observations) - 2)
        train_items, validation_items = observations[:split], observations[split:]
        samples: list[np.ndarray] = []
        train_features: list[np.ndarray] = []
        for item in train_items:
            phase_path = Path(item["outputs"]["unwrappedPhase"]["path"])
            coherence_path = Path(item["outputs"]["coherenceMagnitude"]["path"])
            phase, phase_valid = read_raster(phase_path)
            coherence, coherence_valid = read_raster(coherence_path)
            valid = phase_valid & coherence_valid & (coherence >= 0.0) & (coherence <= 1.0)
            if not valid.any():
                continue
            phase_z = standardize_phase(phase, valid)
            matrix = np.column_stack((phase_z[valid], coherence[valid]))
            train_features.append(matrix)
            if matrix.shape[0] > 10000:
                chosen = rng.choice(matrix.shape[0], size=10000, replace=False)
                samples.append(matrix[chosen])
            else:
                samples.append(matrix)
            total_train_pixels += int(matrix.shape[0])
            hashes.update((item["outputs"]["unwrappedPhase"]["sha256"], item["outputs"]["coherenceMagnitude"]["sha256"]))
        if len(samples) < 3:
            continue
        fit = torch.as_tensor(np.concatenate(samples, axis=0), dtype=torch.float32, device=device)
        mean_tensor = fit.mean(dim=0)
        covariance_tensor = torch.cov(fit.T) + torch.eye(fit.shape[1], dtype=fit.dtype, device=device) * 1e-4
        inverse_tensor = torch.linalg.pinv(covariance_tensor)

        def scores_on_accelerator(matrix: np.ndarray) -> torch.Tensor:
            values = torch.as_tensor(matrix, dtype=torch.float32, device=device)
            centered = values - mean_tensor
            return torch.einsum("ij,jk,ik->i", centered, inverse_tensor, centered)

        train_scores = torch.cat([scores_on_accelerator(matrix) for matrix in train_features])
        pixel_threshold_tensor = torch.quantile(train_scores, 0.99)
        pixel_threshold = float(pixel_threshold_tensor.item())
        training_scene_fractions = [
            float((scores_on_accelerator(matrix) >= pixel_threshold_tensor).float().mean().item())
            for matrix in train_features
        ]
        validation_scene_fractions: list[float] = []
        validation_pixels = 0
        for item in validation_items:
            phase, phase_valid = read_raster(Path(item["outputs"]["unwrappedPhase"]["path"]))
            coherence, coherence_valid = read_raster(Path(item["outputs"]["coherenceMagnitude"]["path"]))
            valid = phase_valid & coherence_valid & (coherence >= 0.0) & (coherence <= 1.0)
            if not valid.any():
                continue
            matrix = np.column_stack((standardize_phase(phase, valid)[valid], coherence[valid]))
            scores = scores_on_accelerator(matrix)
            validation_scene_fractions.append(float((scores >= pixel_threshold_tensor).float().mean().item()))
            validation_pixels += int(matrix.shape[0])
            hashes.update((item["outputs"]["unwrappedPhase"]["sha256"], item["outputs"]["coherenceMagnitude"]["sha256"]))
        models[track_id] = {
            "mean": mean_tensor.detach().cpu().numpy().astype(float).tolist(),
            "inverse_covariance": inverse_tensor.detach().cpu().numpy().astype(float).tolist(),
            "pixel_distance_q99": pixel_threshold,
            "scene_changed_fraction_q95": float(np.quantile(training_scene_fractions, 0.95)),
            "feature_order": ["per_scene_robust_unwrapped_phase_z", "coherence_magnitude_0_1"],
            "training_observations": len(train_items),
            "validation_observations": len(validation_scene_fractions),
            "training_valid_pixels": int(sum(matrix.shape[0] for matrix in train_features)),
            "validation_valid_pixels": validation_pixels,
            "training_device": str(device),
            "fitted_feature_samples": int(fit.shape[0]),
        }
        reports[track_id] = {
            "training_observations": len(train_items),
            "validation_observations": len(validation_scene_fractions),
            "training_scene_changed_fraction": training_scene_fractions,
            "validation_scene_changed_fraction": validation_scene_fractions,
            "pixel_q99_threshold": pixel_threshold,
            "validation_interpretation": "unsupervised tail-rate check only; no event labels or predictive skill claim",
        }
    return models, reports, total_train_pixels, sorted(hashes)


def train_impact(records_path: Path, shrinkage: float = 10.0) -> tuple[dict[str, Any], dict[str, Any], int, list[str]]:
    records: list[dict[str, Any]] = []
    source_ids: set[str] = set()
    for line in records_path.open("r", encoding="utf-8"):
        row = json.loads(line)
        if row.get("record_type") != "event_impact" or not row.get("event_date"):
            continue
        event_year = int(row["event_date"][:4])
        if event_year not in range(2019, 2023) and event_year != 2025:
            continue
        metrics = row.get("metrics") or {}
        if any(metrics.get(target) is None for target in METRICS):
            continue
        row["year"] = event_year
        records.append(row)
        source_ids.add(row["source_id"])
    train = [row for row in records if row["year"] <= 2022]
    validation = [row for row in records if row["year"] == 2025]
    if len(train) < 100 or len(validation) < 50:
        raise ValueError(f"Insufficient temporally split event impacts: train={len(train)}, validation={len(validation)}")
    model_targets: dict[str, Any] = {}
    report: dict[str, Any] = {"training_rows": len(train), "validation_rows_2025": len(validation), "targets": {}}
    for target in METRICS:
        global_values = [float(row["metrics"][target]) for row in train]
        global_mean = float(np.mean(global_values))
        by_department: dict[str, list[float]] = defaultdict(list)
        by_municipality: dict[str, list[float]] = defaultdict(list)
        for row in train:
            department = str(row.get("department") or "UNKNOWN").strip().upper()
            municipality = str(row.get("municipality") or "UNKNOWN").strip().upper()
            value = float(row["metrics"][target])
            by_department[department].append(value)
            by_municipality[f"{department}|{municipality}"].append(value)
        dept_means = {
            department: (sum(values) + shrinkage * global_mean) / (len(values) + shrinkage)
            for department, values in by_department.items()
        }
        municipality_means = {}
        for key, values in by_municipality.items():
            department = key.split("|", 1)[0]
            department_mean = dept_means.get(department, global_mean)
            municipality_means[key] = (sum(values) + shrinkage * department_mean) / (len(values) + shrinkage)

        errors: list[float] = []
        baseline_errors: list[float] = []
        predictions: list[float] = []
        actuals: list[float] = []
        for row in validation:
            department = str(row.get("department") or "UNKNOWN").strip().upper()
            municipality = str(row.get("municipality") or "UNKNOWN").strip().upper()
            estimate = municipality_means.get(f"{department}|{municipality}", dept_means.get(department, global_mean))
            actual = float(row["metrics"][target])
            errors.append(abs(estimate - actual))
            baseline_errors.append(abs(global_mean - actual))
            predictions.append(estimate)
            actuals.append(actual)
        q95 = float(np.quantile(global_values, 0.95))
        model_targets[target] = {
            "global_mean": global_mean,
            "department": dept_means,
            "municipality": municipality_means,
            "train_q95": q95,
            "train_count": len(global_values),
        }
        report["targets"][target] = {
            "train_mean": global_mean,
            "train_q95": q95,
            "validation_mae_shrinkage": float(np.mean(errors)),
            "validation_mae_global_baseline": float(np.mean(baseline_errors)),
            "validation_rows": len(actuals),
            "validation_predicted_mean": float(np.mean(predictions)),
            "validation_actual_mean": float(np.mean(actuals)),
        }
    family_q95 = model_targets["affected_families"]["train_q95"]
    bundle = {
        "schema_version": "tobaru-composite-v1",
        "model_version": "nisar-impact-composite-0.2.0",
        "data_mode": "real_exploratory",
        "nisar_anomaly": {"method": "per_track_robust_phase_coherence_mahalanobis", "tracks": {}},
        "impact_model": {
            "method": "department_municipality_empirical_bayes_shrinkage",
            "shrinkage_prior_event_count": shrinkage,
            "training_period": "2019-01 through 2022-12",
            "validation_period": "2025 calendar year, held out by time",
            "targets": model_targets,
            "impact_reference_families_q95": family_q95,
        },
    }
    return bundle, report, len(train), sorted(source_ids)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--records", type=Path, default=ROOT / "data/processed/public-hazards/20261115T052044Z/hazard_records.jsonl")
    parser.add_argument("--output", type=Path, default=ROOT / "models/nisar-change")
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--device", choices=("auto", "cuda", "cpu"), default="auto")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    if args.device == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA was requested but PyTorch cannot access a CUDA device")
    device = torch.device("cuda" if args.device == "auto" and torch.cuda.is_available() else
                          "cpu" if args.device == "auto" else args.device)
    if device.type == "cuda":
        torch.cuda.set_device(device.index or 0)
    torch.manual_seed(args.seed)

    by_track = discover_gunw(ROOT / "data/raw/nisar")
    tracks, nisar_report, nisar_train_pixels, nisar_hashes = train_anomaly(by_track, args.seed, device)
    bundle, impact_report, impact_train_rows, impact_sources = train_impact(args.records)
    if not tracks:
        raise RuntimeError("No trainable GUNW tracks were found")
    bundle["nisar_anomaly"]["tracks"] = tracks
    bundle["nisar_anomaly"]["method"] = "per_track_robust_phase_coherence_mahalanobis"
    bundle["nisar_anomaly"]["training_device"] = str(device)
    bundle["nisar_anomaly"]["training_device_name"] = torch.cuda.get_device_name(device) if device.type == "cuda" else "CPU"
    bundle["nisar_anomaly"]["training_data"] = {
        "collection": "NISAR_L2_GUNW_PROVISIONAL_V1",
        "training_valid_pixels": nisar_train_pixels,
        "observation_tracks": nisar_report,
    }
    bundle["training_provenance"] = {
        "hazard_records_file": (
            args.records.resolve().relative_to(ROOT).as_posix()
            if args.records.resolve().is_relative_to(ROOT)
            else f"external_file:{args.records.name}"
        ),
        "impact_training_source_ids": impact_sources,
        "nisar_input_asset_sha256": nisar_hashes,
        "impact_split": "2019-2022 train; 2025 out-of-time validation",
        "nisar_split": "chronological within each orbit/frame track; last two observations held out for tail-rate diagnostics",
        "nisar_training_device": str(device),
        "nisar_training_device_name": torch.cuda.get_device_name(device) if device.type == "cuda" else "CPU",
    }
    model_path = args.output / "composite_model.json"
    model_path.write_text(json.dumps(bundle, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    report = {
        "model_version": bundle["model_version"],
        "training_device": str(device),
        "training_device_name": torch.cuda.get_device_name(device) if device.type == "cuda" else "CPU",
        "data_mode": "real_exploratory",
        "nisar_training_valid_pixels": nisar_train_pixels,
        "nisar_tracks": nisar_report,
        "impact_training_rows": impact_train_rows,
        "impact_validation": impact_report,
        "input_asset_hashes": nisar_hashes,
        "limitations": [
            "NISAR anomaly scores have no expert-reviewed event labels and are not event probabilities.",
            "The impact estimator predicts historical reported consequences by department and municipality; it is not a household survey or causal vulnerability model.",
            "NISAR observations are provisional. Phase is normalized per granule; atmospheric and external phase corrections are not applied by this baseline.",
            "Output priorities are relative screening recommendations, not evacuation routes or safety guarantees.",
            "CUDA accelerates fitting the NISAR feature distribution; it does not add future-event labels or turn anomaly screening into event forecasting.",
        ],
    }
    report_path = args.output / "composite_training_report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"model": str(model_path), "report": str(report_path),
                      "tracks": len(tracks), "nisar_train_pixels": nisar_train_pixels,
                      "training_device": str(device),
                      "training_device_name": torch.cuda.get_device_name(device) if device.type == "cuda" else "CPU",
                      "impact_train_rows": impact_train_rows,
                      "impact_validation_mae": {name: row["validation_mae_shrinkage"] for name, row in impact_report["targets"].items()}},
                     ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
