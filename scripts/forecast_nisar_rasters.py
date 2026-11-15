#!/usr/bin/env python3
"""Forecast real NISAR LOS raster time series without loading full scenes."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from contextlib import ExitStack
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
from rasterio.windows import Window


SERIES_SCHEMA = "saros.nisar.los-raster-series.v1"
SERIES_SEMANTICS = "per_acquisition_los_relative_to_stable_reference"
NODATA = -9999.0
COLLECTION_BY_MATURITY = {
    "VALIDATED": "NISAR_L2_GUNW_V1",
    "PROVISIONAL": "NISAR_L2_GUNW_PROVISIONAL_V1",
    "BETA": "NISAR_L2_GUNW_BETA_V1",
}


@dataclass(frozen=True)
class RasterObservation:
    day: date
    los_path: Path
    valid_mask_path: Path
    uncertainty_path: Path | None
    granule_ids: tuple[str, ...]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _nonempty_string(value: object, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} must be a non-empty string")
    return value.strip()


def _resolve_path(base: Path, value: object, label: str) -> Path:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} must be a file path")
    path = Path(value)
    if not path.is_absolute():
        path = base / path
    path = path.resolve()
    if not path.is_file():
        raise FileNotFoundError(f"{label} does not exist: {path}")
    return path


def load_series(manifest_path: Path) -> tuple[dict[str, Any], list[RasterObservation]]:
    manifest_path = manifest_path.expanduser().resolve()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("schema_version") != SERIES_SCHEMA:
        raise ValueError(f"manifest schema_version must be {SERIES_SCHEMA!r}")
    if manifest.get("data_mode") != "real":
        raise ValueError("Only real NISAR raster series are accepted")
    if manifest.get("series_semantics") != SERIES_SEMANTICS:
        raise ValueError("LOS rasters must represent acquisition-date displacement relative to one stable reference")
    if manifest.get("pair_network_inverted") is not True:
        raise ValueError("Pair interferograms must be inverted into acquisition-date LOS maps before forecasting")
    if manifest.get("phase_to_los_validated") is not True:
        raise ValueError("The GUNW phase-to-LOS convention must be validated against real product metadata")
    if manifest.get("los_units") != "mm":
        raise ValueError("The raster series must declare los_units='mm'")

    aoi_id = _nonempty_string(manifest.get("aoi_id"), "aoi_id")
    stack_id = _nonempty_string(manifest.get("stack_id"), "stack_id")
    processing_version = _nonempty_string(manifest.get("processing_version"), "processing_version")
    collection = _nonempty_string(manifest.get("source_collection"), "source_collection")
    maturity = _nonempty_string(manifest.get("source_maturity"), "source_maturity").upper()
    if COLLECTION_BY_MATURITY.get(maturity) != collection:
        raise ValueError("source_collection and source_maturity do not identify the same GUNW collection")
    if "GUNW" not in collection:
        raise ValueError("This spatial forecast currently accepts NISAR GUNW only")

    reference = manifest.get("stable_reference")
    if not isinstance(reference, dict):
        raise ValueError("stable_reference evidence is required")
    reference_id = _nonempty_string(reference.get("id"), "stable_reference.id")
    reference_method = _nonempty_string(reference.get("method"), "stable_reference.method")
    phase_evidence = manifest.get("phase_to_los_evidence")
    if not isinstance(phase_evidence, dict):
        raise ValueError("phase_to_los_evidence is required")
    wavelength = phase_evidence.get("wavelength_m")
    sign = phase_evidence.get("phase_sign")
    if not isinstance(wavelength, (int, float)) or not math.isfinite(wavelength) or wavelength <= 0:
        raise ValueError("phase_to_los_evidence.wavelength_m must be a positive finite value")
    if sign not in (-1, 1):
        raise ValueError("phase_to_los_evidence.phase_sign must be explicitly validated as -1 or +1")
    phase_validation = _nonempty_string(phase_evidence.get("validation_method"), "phase_to_los_evidence.validation_method")

    rows = manifest.get("observations")
    if not isinstance(rows, list) or len(rows) < 2:
        raise ValueError("observations must contain at least two acquisition-date rasters")
    observations: list[RasterObservation] = []
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            raise ValueError(f"observations[{index}] must be an object")
        day = date.fromisoformat(_nonempty_string(row.get("date"), f"observations[{index}].date"))
        granules = row.get("granule_ids")
        if not isinstance(granules, list) or not granules or any(
            not isinstance(item, str) or "GUNW" not in item or not item.startswith("NISAR_L2_")
            for item in granules
        ):
            raise ValueError(f"observations[{index}].granule_ids must list real NISAR L2 GUNW granules")
        uncertainty_value = row.get("uncertainty_mm_path")
        observations.append(
            RasterObservation(
                day=day,
                los_path=_resolve_path(manifest_path.parent, row.get("los_mm_path"), f"observations[{index}].los_mm_path"),
                valid_mask_path=_resolve_path(
                    manifest_path.parent, row.get("valid_mask_path"), f"observations[{index}].valid_mask_path"
                ),
                uncertainty_path=(
                    _resolve_path(manifest_path.parent, uncertainty_value, f"observations[{index}].uncertainty_mm_path")
                    if uncertainty_value else None
                ),
                granule_ids=tuple(sorted(set(granules))),
            )
        )
    observations.sort(key=lambda item: item.day)
    if len({item.day for item in observations}) != len(observations):
        raise ValueError("Duplicate acquisition dates must be resolved before forecasting")
    if len({granule for item in observations for granule in item.granule_ids}) == 0:
        raise ValueError("No source granules were recorded")

    provenance = {
        "aoi_id": aoi_id,
        "stack_id": stack_id,
        "processing_version": processing_version,
        "source_collection": collection,
        "source_maturity": maturity,
        "source_granules": sorted({granule for item in observations for granule in item.granule_ids}),
        "series_semantics": SERIES_SEMANTICS,
        "stable_reference": {"id": reference_id, "method": reference_method},
        "phase_to_los_evidence": {
            "wavelength_m": float(wavelength),
            "phase_sign": int(sign),
            "validation_method": phase_validation,
        },
        "manifest_path": str(manifest_path),
        "manifest_sha256": sha256_file(manifest_path),
    }
    return provenance, observations


def validate_grid(datasets: list[rasterio.io.DatasetReader], label: str) -> None:
    reference = datasets[0]
    if reference.count != 1 or reference.crs is None:
        raise ValueError(f"{label} must be a single-band georeferenced raster: {reference.name}")
    for dataset in datasets[1:]:
        same = (
            dataset.count == 1
            and dataset.width == reference.width
            and dataset.height == reference.height
            and dataset.crs == reference.crs
            and np.allclose(tuple(dataset.transform), tuple(reference.transform), rtol=0, atol=1e-9)
        )
        if not same:
            raise ValueError(f"Raster grids differ; implicit reprojection is refused: {reference.name} vs {dataset.name}")


def _fit_weighted_line(times: np.ndarray, values: np.ndarray, valid: np.ndarray,
                       base_weights: np.ndarray, minimum_count: int,
                       prediction_time: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Fit one robust line per pixel column using Huber IRLS."""
    pixel_count = values.shape[1]
    intercept_out = np.full(pixel_count, np.nan, dtype=np.float64)
    slope_out = np.full(pixel_count, np.nan, dtype=np.float64)
    prediction_out = np.full(pixel_count, np.nan, dtype=np.float64)
    selected = np.flatnonzero(valid.sum(axis=0) >= minimum_count)
    if selected.size == 0:
        return intercept_out, slope_out, prediction_out

    y = values[:, selected].astype(np.float64, copy=False)
    mask = valid[:, selected]
    weights0 = np.where(mask, base_weights[:, selected], 0.0).astype(np.float64, copy=False)
    normalizer = np.divide(
        weights0.sum(axis=0), mask.sum(axis=0), out=np.ones(selected.size, dtype=np.float64),
        where=mask.sum(axis=0) > 0,
    )
    weights0 = np.divide(weights0, normalizer[None, :], out=np.zeros_like(weights0), where=normalizer[None, :] > 0)

    def solve(weights: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        sw = weights.sum(axis=0)
        st = np.sum(weights * times[:, None], axis=0)
        stt = np.sum(weights * times[:, None] ** 2, axis=0)
        sy = np.sum(weights * np.where(mask, y, 0.0), axis=0)
        sty = np.sum(weights * np.where(mask, y, 0.0) * times[:, None], axis=0)
        determinant = sw * stt - st * st
        stable = np.isfinite(determinant) & (determinant > 1e-12)
        slope = np.divide(sw * sty - st * sy, determinant, out=np.full_like(sw, np.nan), where=stable)
        intercept = np.divide(sy - slope * st, sw, out=np.full_like(sw, np.nan), where=stable & (sw > 0))
        return intercept, slope

    intercept, slope = solve(weights0)
    for _ in range(30):
        residual = np.where(mask, y - (intercept[None, :] + times[:, None] * slope[None, :]), np.nan)
        center = np.nanmedian(residual, axis=0)
        scale = 1.4826 * np.nanmedian(np.abs(residual - center[None, :]), axis=0)
        cutoff = 1.345 * scale
        absolute = np.abs(residual - center[None, :])
        robust = np.ones_like(absolute)
        outlier = mask & np.isfinite(absolute) & (cutoff[None, :] > 1e-9) & (absolute > cutoff[None, :])
        robust[outlier] = np.broadcast_to(cutoff[None, :], robust.shape)[outlier] / absolute[outlier]
        updated_intercept, updated_slope = solve(weights0 * robust)
        converged = np.all(
            np.isclose(updated_intercept, intercept, rtol=1e-7, atol=1e-7)
            & np.isclose(updated_slope, slope, rtol=1e-7, atol=1e-9)
        )
        intercept, slope = updated_intercept, updated_slope
        if converged:
            break

    intercept_out[selected] = intercept
    slope_out[selected] = slope
    prediction_out[selected] = intercept + prediction_time * slope
    return intercept_out, slope_out, prediction_out


def _read_stack(observations: list[RasterObservation], los_datasets: list[rasterio.io.DatasetReader],
                mask_datasets: list[rasterio.io.DatasetReader], uncertainty_datasets: list[rasterio.io.DatasetReader | None],
                window: Window) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    values: list[np.ndarray] = []
    validities: list[np.ndarray] = []
    weight_rows: list[np.ndarray] = []
    for index, observation in enumerate(observations):
        los_block = los_datasets[index].read(1, window=window, masked=True)
        los = np.asarray(los_block.filled(np.nan), dtype=np.float32)
        mask_block = mask_datasets[index].read(1, window=window, masked=True)
        mask_raw = np.asarray(mask_block.filled(0))
        if not np.isin(mask_raw, (0, 1)).all():
            raise ValueError(f"Valid mask must encode only 0/1: {observation.valid_mask_path}")
        valid = (mask_raw == 1) & ~np.ma.getmaskarray(los_block) & np.isfinite(los)
        uncertainty_dataset = uncertainty_datasets[index]
        if uncertainty_dataset is None:
            weights = np.ones(los.shape, dtype=np.float32)
        else:
            uncertainty_block = uncertainty_dataset.read(1, window=window, masked=True)
            uncertainty = np.asarray(uncertainty_block.filled(np.nan), dtype=np.float32)
            valid &= ~np.ma.getmaskarray(uncertainty_block) & np.isfinite(uncertainty) & (uncertainty > 0)
            weights = np.divide(1.0, uncertainty * uncertainty, out=np.zeros_like(uncertainty), where=valid)
        values.append(los.reshape(-1))
        validities.append(valid.reshape(-1))
        weight_rows.append(weights.reshape(-1))
    return np.stack(values), np.stack(validities), np.stack(weight_rows)


def _metrics(accumulator: dict[str, float | int], total_pixels: int) -> dict[str, float | int | None]:
    count = int(accumulator["count"])
    if count == 0:
        return {"n_valid_pixels": 0, "valid_fraction": 0.0, "mae_mm": None, "rmse_mm": None, "bias_mm": None}
    return {
        "n_valid_pixels": count,
        "valid_fraction": count / total_pixels,
        "mae_mm": float(accumulator["absolute_sum"]) / count,
        "rmse_mm": math.sqrt(float(accumulator["squared_sum"]) / count),
        "bias_mm": float(accumulator["signed_sum"]) / count,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True, type=Path, help="Real per-acquisition LOS raster-series manifest")
    parser.add_argument("--forecast-raster", required=True, type=Path, help="Output GeoTIFF with pixelwise LOS forecast in mm")
    parser.add_argument("--metrics-json", required=True, type=Path, help="Output temporal backtest and provenance JSON")
    parser.add_argument("--horizon-days", type=int, default=24)
    parser.add_argument("--tolerance-days", type=int, default=8)
    parser.add_argument("--min-train-observations", type=int, default=5)
    parser.add_argument("--validation-count", type=int, default=6)
    parser.add_argument("--block-size", type=int, default=256, help="Maximum raster window width/height in pixels")
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()
    if args.horizon_days < 1 or args.tolerance_days < 0:
        parser.error("horizon must be positive and tolerance non-negative")
    if args.min_train_observations < 3 or args.validation_count < 1 or args.block_size < 16:
        parser.error("min training observations must be >=3, validation count >=1, and block size >=16")

    provenance, observations = load_series(args.manifest)
    if len(observations) <= args.min_train_observations:
        parser.error("Need more acquisition-date rasters than the minimum training count")
    forecast_path = args.forecast_raster.expanduser().resolve()
    metrics_path = args.metrics_json.expanduser().resolve()
    if forecast_path == metrics_path:
        parser.error("Forecast raster and metrics JSON must use different paths")
    for path in (forecast_path, metrics_path):
        if path.exists() and not args.overwrite:
            parser.error(f"Refusing to overwrite existing output without --overwrite: {path}")

    with ExitStack() as stack:
        los_datasets = [stack.enter_context(rasterio.open(item.los_path)) for item in observations]
        mask_datasets = [stack.enter_context(rasterio.open(item.valid_mask_path)) for item in observations]
        uncertainty_datasets = [
            stack.enter_context(rasterio.open(item.uncertainty_path)) if item.uncertainty_path else None
            for item in observations
        ]
        all_datasets = [*los_datasets, *mask_datasets, *(item for item in uncertainty_datasets if item is not None)]
        validate_grid(all_datasets, "LOS, validity-mask and uncertainty rasters")
        reference = los_datasets[0]
        width, height = reference.width, reference.height
        if any(not np.issubdtype(np.dtype(dataset.dtypes[0]), np.number) for dataset in all_datasets):
            raise ValueError("All LOS and uncertainty layers must be numeric")

        target_indices: list[tuple[int, int]] = []
        first_test_index = max(args.min_train_observations, len(observations) - args.validation_count)
        for target_index in range(first_test_index, len(observations)):
            candidates = [
                origin_index for origin_index in range(args.min_train_observations - 1, target_index)
                if abs((observations[target_index].day - observations[origin_index].day).days - args.horizon_days)
                <= args.tolerance_days
            ]
            if candidates:
                target_indices.append((max(candidates), target_index))

        target_accumulators = {
            (origin, target): {
                "trend": {"absolute_sum": 0.0, "squared_sum": 0.0, "signed_sum": 0.0, "count": 0},
                "persistence": {"absolute_sum": 0.0, "squared_sum": 0.0, "signed_sum": 0.0, "count": 0},
            }
            for origin, target in target_indices
        }
        forecast_path.parent.mkdir(parents=True, exist_ok=True)
        metrics_path.parent.mkdir(parents=True, exist_ok=True)
        output_profile = reference.profile.copy()
        output_profile.update(driver="GTiff", count=1, dtype="float32", nodata=NODATA,
                              compress="deflate", BIGTIFF="IF_SAFER")
        times = np.asarray([(item.day - observations[0].day).days for item in observations], dtype=np.float64)
        forecast_date = observations[-1].day + timedelta(days=args.horizon_days)

        with rasterio.open(forecast_path, "w", **output_profile) as forecast_dataset:
            forecast_dataset.update_tags(
                units="mm",
                data_mode="real",
                model="pixelwise_robust_linear_trend",
                origin_date=observations[-1].day.isoformat(),
                target_date=forecast_date.isoformat(),
                aoi_id=provenance["aoi_id"],
                stack_id=provenance["stack_id"],
                processing_version=provenance["processing_version"],
            )
            for row_off in range(0, height, args.block_size):
                for col_off in range(0, width, args.block_size):
                    window = Window(col_off, row_off, min(args.block_size, width - col_off),
                                    min(args.block_size, height - row_off))
                    values, valid, base_weights = _read_stack(
                        observations, los_datasets, mask_datasets, uncertainty_datasets, window
                    )
                    _intercept, _slope, prediction = _fit_weighted_line(
                        times, values, valid, base_weights, args.min_train_observations,
                        float(times[-1] + args.horizon_days),
                    )
                    forecast_block = np.where(np.isfinite(prediction), prediction, NODATA).astype(np.float32)
                    forecast_dataset.write(forecast_block.reshape(int(window.height), int(window.width)), 1, window=window)

                    for origin_index, target_index in target_indices:
                        train_values = values[:origin_index + 1]
                        train_valid = valid[:origin_index + 1]
                        train_weights = base_weights[:origin_index + 1]
                        _i, _s, hindcast = _fit_weighted_line(
                            times[:origin_index + 1], train_values, train_valid, train_weights,
                            args.min_train_observations,
                            float(times[target_index]),
                        )
                        target_valid = valid[target_index] & np.isfinite(hindcast)
                        target = values[target_index]
                        trend_error = hindcast - target
                        bucket = target_accumulators[(origin_index, target_index)]["trend"]
                        selected = target_valid
                        bucket["absolute_sum"] += float(np.abs(trend_error[selected]).sum(dtype=np.float64))
                        bucket["squared_sum"] += float(np.square(trend_error[selected]).sum(dtype=np.float64))
                        bucket["signed_sum"] += float(trend_error[selected].sum(dtype=np.float64))
                        bucket["count"] += int(selected.sum())

                        persistence_valid = target_valid & valid[origin_index]
                        persistence_error = values[origin_index] - target
                        bucket = target_accumulators[(origin_index, target_index)]["persistence"]
                        selected = persistence_valid
                        bucket["absolute_sum"] += float(np.abs(persistence_error[selected]).sum(dtype=np.float64))
                        bucket["squared_sum"] += float(np.square(persistence_error[selected]).sum(dtype=np.float64))
                        bucket["signed_sum"] += float(persistence_error[selected].sum(dtype=np.float64))
                        bucket["count"] += int(selected.sum())

    target_reports = []
    for (origin_index, target_index), scores in target_accumulators.items():
        target_pixels = width * height
        target_reports.append({
            "origin_date": observations[origin_index].day.isoformat(),
            "target_date": observations[target_index].day.isoformat(),
            "horizon_days": (observations[target_index].day - observations[origin_index].day).days,
            "trend": _metrics(scores["trend"], target_pixels),
            "persistence": _metrics(scores["persistence"], target_pixels),
        })

    def macro_metric(name: str, metric: str) -> float | None:
        values = [row[name][metric] for row in target_reports if row[name][metric] is not None]
        if not values:
            return None
        if metric == "rmse_mm":
            return float(math.sqrt(np.mean(np.square(values))))
        return float(np.mean(values))

    independent_targets = len(target_reports)
    trend_mae = macro_metric("trend", "mae_mm")
    persistence_mae = macro_metric("persistence", "mae_mm")
    if independent_targets < 6:
        reliability = "insufficient_independent_target_dates"
    elif trend_mae is None or persistence_mae is None or trend_mae >= persistence_mae:
        reliability = "pixelwise_trend_does_not_beat_persistence"
    else:
        reliability = "screening_candidate_requires_external_validation"

    report = {
        "schema_version": "1.0",
        "status": "exploratory_spatial_forecast",
        "model": {
            "name": "pixelwise_robust_linear_trend",
            "equation": "LOS_mm(t, y, x) = beta0(y, x) + beta1(y, x) * days_since_first_acquisition",
            "minimum_training_observations_per_pixel": args.min_train_observations,
            "robust_loss": "Huber M-estimator solved by iteratively reweighted least squares",
            "uncertainty_weights": "inverse variance when per-acquisition uncertainty rasters are provided; otherwise equal weights",
        },
        "forecast": {
            "origin_date": observations[-1].day.isoformat(),
            "target_date": forecast_date.isoformat(),
            "horizon_days": args.horizon_days,
            "raster_path": str(forecast_path),
            "units": "mm relative LOS",
        },
        "backtest": {
            "requested_horizon_days": args.horizon_days,
            "tolerance_days": args.tolerance_days,
            "validation_candidates": args.validation_count,
            "independent_target_dates": independent_targets,
            "target_selection": "one latest eligible training origin per held-out target date",
            "trend_macro_mae_mm": trend_mae,
            "trend_macro_rmse_mm": macro_metric("trend", "rmse_mm"),
            "trend_macro_bias_mm": macro_metric("trend", "bias_mm"),
            "persistence_macro_mae_mm": persistence_mae,
            "persistence_macro_rmse_mm": macro_metric("persistence", "rmse_mm"),
            "persistence_macro_bias_mm": macro_metric("persistence", "bias_mm"),
            "targets": target_reports,
            "reliability_status": reliability,
            "note": "Pixels are spatially correlated; the independent sample count is target acquisition dates, not the number of raster pixels. Six dates are a screening threshold, not proof of reliability.",
        },
        "quality": {
            "first_date": observations[0].day.isoformat(),
            "last_date": observations[-1].day.isoformat(),
            "acquisition_count": len(observations),
            "raster_width": width,
            "raster_height": height,
            "crs": reference.crs.to_string(),
            "transform": list(reference.transform)[:6],
            "block_size_pixels": args.block_size,
        },
        "provenance": provenance,
    }
    metrics_path.write_text(json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": report["status"],
        "forecast_raster": str(forecast_path),
        "metrics_json": str(metrics_path),
        "acquisition_count": len(observations),
        "independent_target_dates": independent_targets,
        "reliability_status": reliability,
    }, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
