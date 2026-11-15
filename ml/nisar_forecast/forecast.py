from __future__ import annotations

import argparse
import csv
import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

import numpy as np


REQUIRED_COLUMNS = {
    "date",
    "los_mm",
    "valid_fraction",
    "aoi_id",
    "stack_id",
    "data_mode",
    "granule_ids",
}


@dataclass(frozen=True)
class Observation:
    day: date
    los_mm: float
    valid_fraction: float
    aoi_id: str
    stack_id: str
    granule_ids: str
    uncertainty_mm: float | None


def read_observations(path: Path, min_valid_fraction: float) -> tuple[list[Observation], dict[str, Any]]:
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        columns = set(reader.fieldnames or [])
        missing = REQUIRED_COLUMNS - columns
        if missing:
            raise ValueError(f"Missing required CSV columns: {sorted(missing)}")

        rows = list(reader)

    if not rows:
        raise ValueError("The observation CSV is empty")
    if any(row["data_mode"].strip().lower() != "real" for row in rows):
        raise ValueError("Only real NISAR observations are accepted for forecasting")

    parsed: list[Observation] = []
    for row in rows:
        valid_fraction = float(row["valid_fraction"])
        los_mm = float(row["los_mm"])
        if not 0 <= valid_fraction <= 1:
            raise ValueError("valid_fraction must be between 0 and 1")
        if valid_fraction < min_valid_fraction:
            continue
        uncertainty_text = row.get("uncertainty_mm", "").strip()
        uncertainty = float(uncertainty_text) if uncertainty_text else None
        if uncertainty is not None and (not np.isfinite(uncertainty) or uncertainty <= 0):
            raise ValueError("uncertainty_mm must be positive when provided")
        if not np.isfinite(los_mm):
            raise ValueError("los_mm must be finite for accepted observations")
        parsed.append(
            Observation(
                day=date.fromisoformat(row["date"]),
                los_mm=los_mm,
                valid_fraction=valid_fraction,
                aoi_id=row["aoi_id"].strip(),
                stack_id=row["stack_id"].strip(),
                granule_ids=row["granule_ids"].strip(),
                uncertainty_mm=uncertainty,
            )
        )

    identities = {(item.aoi_id, item.stack_id) for item in parsed}
    if len(identities) != 1:
        raise ValueError("One CSV must contain exactly one AOI and one consistent NISAR geometry stack")
    parsed.sort(key=lambda item: item.day)
    if len({item.day for item in parsed}) != len(parsed):
        raise ValueError("Duplicate observation dates must be resolved before forecasting")
    if len(parsed) < 2:
        raise ValueError("Fewer than two valid observations remain after quality filtering")

    provenance = {
        "aoi_id": parsed[0].aoi_id,
        "stack_id": parsed[0].stack_id,
        "source_granules": sorted({granule for item in parsed for granule in item.granule_ids.split(";") if granule}),
        "accepted_observations": len(parsed),
        "input_rows": len(rows),
    }
    return parsed, provenance


def fit_robust_trend(observations: list[Observation]) -> tuple[float, float]:
    origin = observations[0].day
    x = np.asarray([(item.day - origin).days for item in observations], dtype=float)
    y = np.asarray([item.los_mm for item in observations], dtype=float)
    design = np.column_stack((np.ones_like(x), x))
    base_weights = np.asarray(
        [1.0 / item.uncertainty_mm**2 if item.uncertainty_mm else 1.0 for item in observations],
        dtype=float,
    )
    coefficients = np.linalg.lstsq(design * np.sqrt(base_weights[:, None]), y * np.sqrt(base_weights), rcond=None)[0]

    for _ in range(30):
        residuals = y - design @ coefficients
        median = np.median(residuals)
        scale = 1.4826 * np.median(np.abs(residuals - median))
        if scale < 1e-9:
            break
        standardized = np.abs(residuals - median) / (1.345 * scale)
        robust_weights = np.ones_like(standardized)
        outliers = standardized > 1
        robust_weights[outliers] = 1.0 / standardized[outliers]
        weights = base_weights * robust_weights
        updated = np.linalg.lstsq(design * np.sqrt(weights[:, None]), y * np.sqrt(weights), rcond=None)[0]
        if np.allclose(updated, coefficients, rtol=1e-9, atol=1e-9):
            coefficients = updated
            break
        coefficients = updated

    return float(coefficients[0]), float(coefficients[1])


def score_errors(errors: list[float]) -> dict[str, float | int] | None:
    if not errors:
        return None
    values = np.asarray(errors, dtype=float)
    return {
        "n": int(values.size),
        "mae_mm": float(np.mean(np.abs(values))),
        "rmse_mm": float(np.sqrt(np.mean(values**2))),
        "bias_mm": float(np.mean(values)),
    }


def rolling_backtest(
    observations: list[Observation],
    horizon_days: int,
    tolerance_days: int,
    min_train_observations: int,
) -> dict[str, Any]:
    persistence_errors: list[float] = []
    trend_errors: list[float] = []
    origins: list[dict[str, Any]] = []

    for origin_index in range(min_train_observations - 1, len(observations) - 1):
        origin = observations[origin_index]
        target_index = min(
            range(origin_index + 1, len(observations)),
            key=lambda index: abs((observations[index].day - origin.day).days - horizon_days),
        )
        target = observations[target_index]
        actual_horizon = (target.day - origin.day).days
        if abs(actual_horizon - horizon_days) > tolerance_days:
            continue

        training = observations[: origin_index + 1]
        intercept, slope = fit_robust_trend(training)
        elapsed = (target.day - training[0].day).days
        trend_prediction = intercept + slope * elapsed
        persistence_error = origin.los_mm - target.los_mm
        trend_error = trend_prediction - target.los_mm
        persistence_errors.append(persistence_error)
        trend_errors.append(trend_error)
        origins.append(
            {
                "origin_date": origin.day.isoformat(),
                "target_date": target.day.isoformat(),
                "horizon_days": actual_horizon,
                "actual_los_mm": target.los_mm,
                "persistence_prediction_mm": origin.los_mm,
                "trend_prediction_mm": trend_prediction,
                "trend_slope_mm_per_day": slope,
            }
        )

    return {
        "requested_horizon_days": horizon_days,
        "tolerance_days": tolerance_days,
        "origins": origins,
        "persistence": score_errors(persistence_errors),
        "robust_linear_trend": score_errors(trend_errors),
        "status": "evaluated" if len(origins) >= 2 else "insufficient_backtest_origins",
    }


def build_forecast(
    observations: list[Observation],
    provenance: dict[str, Any],
    horizon_days: int,
    tolerance_days: int,
    min_train_observations: int,
    min_valid_fraction: float,
) -> dict[str, Any]:
    latest = observations[-1]
    backtest = rolling_backtest(observations, horizon_days, tolerance_days, min_train_observations)
    intercept, slope = fit_robust_trend(observations)
    forecast_date = date.fromordinal(latest.day.toordinal() + horizon_days)
    elapsed = (forecast_date - observations[0].day).days
    forecast_los = intercept + slope * elapsed

    return {
        "schema_version": "1.0",
        "status": "forecast_exploratory" if backtest["status"] != "evaluated" else "forecast_evaluated",
        "model": {
            "name": "robust_linear_trend_by_aoi",
            "version": "1.0",
            "equation": "LOS_mm(t) = beta0 + beta1 * days_since_first_observation",
            "slope_mm_per_day": slope,
            "intercept_mm": intercept,
        },
        "forecast": {
            "origin_date": latest.day.isoformat(),
            "target_date": forecast_date.isoformat(),
            "horizon_days": horizon_days,
            "los_mm": forecast_los,
            "uncertainty_interval": None,
        },
        "quality": {
            "min_valid_fraction": min_valid_fraction,
            "valid_observation_count": len(observations),
            "first_observation_date": observations[0].day.isoformat(),
            "last_observation_date": latest.day.isoformat(),
            "confidence_interval_status": "not_calibrated",
        },
        "backtest": backtest,
        "provenance": provenance,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Forecast a real, quality-filtered NISAR LOS series for one AOI/stack.")
    parser.add_argument("--observations", type=Path, required=True, help="CSV of real NISAR LOS observations, one row per date")
    parser.add_argument("--output", type=Path, required=True, help="JSON output path")
    parser.add_argument("--horizon-days", type=int, default=24)
    parser.add_argument("--tolerance-days", type=int, default=8)
    parser.add_argument("--min-train-observations", type=int, default=5)
    parser.add_argument("--min-valid-fraction", type=float, default=0.5)
    args = parser.parse_args()
    if args.horizon_days < 1 or args.tolerance_days < 0 or args.min_train_observations < 3:
        parser.error("horizon must be positive, tolerance non-negative, and minimum training count at least 3")
    if not 0 <= args.min_valid_fraction <= 1:
        parser.error("min-valid-fraction must be between 0 and 1")

    observations, provenance = read_observations(args.observations, args.min_valid_fraction)
    result = build_forecast(
        observations,
        provenance,
        args.horizon_days,
        args.tolerance_days,
        args.min_train_observations,
        args.min_valid_fraction,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
