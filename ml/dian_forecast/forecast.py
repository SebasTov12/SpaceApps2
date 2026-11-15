from __future__ import annotations

import argparse
import base64
import csv
import json
import math
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Observation:
    period: date
    amount_million_cop: float
    preliminary: bool


def read_observations(path: Path) -> list[Observation]:
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    observations = [
        Observation(
            period=date.fromisoformat(row["period_start"]),
            amount_million_cop=float(row["total_million_cop"]),
            preliminary=row["is_preliminary"].strip().lower() == "true",
        )
        for row in rows
    ]
    observations.sort(key=lambda row: row.period)
    if len(observations) < 120:
        raise ValueError("At least 120 official monthly observations are required")
    if len({row.period for row in observations}) != len(observations):
        raise ValueError("Duplicate monthly periods must be resolved before fitting")
    for previous, current in zip(observations, observations[1:]):
        expected_month = previous.period.month % 12 + 1
        expected_year = previous.period.year + (1 if previous.period.month == 12 else 0)
        if (current.period.year, current.period.month) != (expected_year, expected_month):
            raise ValueError(f"Gap in monthly DIAN series after {previous.period.isoformat()}")
        if current.amount_million_cop <= 0 or not math.isfinite(current.amount_million_cop):
            raise ValueError(f"Invalid DIAN amount for {current.period.isoformat()}")
    return observations


def fit_month(rows: list[Observation], month: int, target_year: int) -> dict[str, float | int]:
    training = [
        row for row in rows
        if row.period.month == month and row.period.year < target_year
    ]
    if len(training) < 10:
        raise ValueError(f"Month {month} has fewer than ten historical training years")
    x = [row.period.year for row in training]
    y = [math.log(row.amount_million_cop) for row in training]
    x_mean = sum(x) / len(x)
    y_mean = sum(y) / len(y)
    denominator = sum((value - x_mean) ** 2 for value in x)
    slope = sum((xv - x_mean) * (yv - y_mean) for xv, yv in zip(x, y)) / denominator
    intercept = y_mean - slope * x_mean
    return {
        "intercept_log": intercept,
        "slope_log_per_year": slope,
        "n": len(training),
        "first_year": min(x),
        "last_year": max(x),
    }


def predict(month_fit: dict[str, float | int], year: int) -> float:
    return math.exp(float(month_fit["intercept_log"]) + float(month_fit["slope_log_per_year"]) * year)


def _metrics(errors: list[float]) -> dict[str, float | int] | None:
    if not errors:
        return None
    return {
        "n": len(errors),
        "mae_million_cop": sum(abs(error) for error in errors) / len(errors),
        "rmse_million_cop": math.sqrt(sum(error**2 for error in errors) / len(errors)),
    }


def rolling_backtest(observations: list[Observation], months: int = 60) -> dict[str, Any]:
    targets = observations[-months:]
    trend_errors: list[float] = []
    seasonal_naive_errors: list[float] = []
    for target in targets:
        fit = fit_month(observations, target.period.month, target.period.year)
        trend_errors.append(predict(fit, target.period.year) - target.amount_million_cop)
        prior_year = date(target.period.year - 1, target.period.month, 1)
        baseline = next((row for row in observations if row.period == prior_year), None)
        if baseline is not None:
            seasonal_naive_errors.append(baseline.amount_million_cop - target.amount_million_cop)
    trend_metrics = _metrics(trend_errors)
    baseline_metrics = _metrics(seasonal_naive_errors)
    if trend_metrics is None or baseline_metrics is None or trend_metrics["n"] != baseline_metrics["n"]:
        raise ValueError("Backtest could not score the trend and seasonal-naive models on identical targets")
    return {
        "evaluation": "rolling_origin_one_month_ahead; each target used once",
        "target_start": targets[0].period.isoformat(),
        "target_end": targets[-1].period.isoformat(),
        "unique_target_count": len(trend_errors),
        "seasonal_log_linear_ols": trend_metrics,
        "seasonal_naive_last_year": baseline_metrics,
    }


def _jsonb_sql(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    encoded = base64.b64encode(payload).decode("ascii")
    return f"convert_from(decode('{encoded}', 'base64'), 'UTF8')::jsonb"


def _sql_text(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def build_forecast(observations: list[Observation], source: dict[str, str]) -> dict[str, Any]:
    latest = observations[-1]
    target_month = latest.period.month % 12 + 1
    target_year = latest.period.year + (1 if latest.period.month == 12 else 0)
    target_period = date(target_year, target_month, 1)
    fit = fit_month(observations, target_month, target_year)
    forecast_value = predict(fit, target_year)
    prior_period = date(target_year - 1, target_month, 1)
    seasonal_baseline = next((row for row in observations if row.period == prior_period), None)
    if seasonal_baseline is None:
        raise ValueError("Seasonal-naive baseline is missing for the forecast target")
    backtest = rolling_backtest(observations)
    model_mae = float(backtest["seasonal_log_linear_ols"]["mae_million_cop"])
    naive_mae = float(backtest["seasonal_naive_last_year"]["mae_million_cop"])
    reliability = (
        "trend_does_not_beat_seasonal_naive"
        if model_mae >= naive_mae
        else "exploratory_candidate_requires_external_validation"
    )
    month_coefficients = {
        str(month): fit_month(observations, month, target_year + (1 if month < target_month else 0))
        for month in range(1, 13)
    }
    run_id = f"dian-real-seasonal-ols-{target_period:%Y%m}"
    prediction_key = f"CO-national-{target_period:%Y-%m}"
    model_context = {
        "training_status": "trained_on_real_data",
        "model_name": "monthly_seasonal_log_linear_ols",
        "algorithm": "12 calendar_month_specific_log_linear_ols_models",
        "training_run_id": run_id,
        "training_start": observations[0].period.isoformat(),
        "training_end": latest.period.isoformat(),
        "training_sample_count": len(observations),
        "target_month_training_sample_count": int(fit["n"]),
        "coefficients_by_calendar_month": month_coefficients,
        "evaluation_scope": "rolling_origin_out_of_sample",
        "metrics": backtest,
        "reliability_status": reliability,
        "predictors": ["calendar_month", "calendar_year"],
        "trained_on_real_data": True,
        "inflation_adjusted": False,
        "forecast_horizon_months": 1,
    }
    payload = {
        "synthetic": False,
        "data_mode": "real",
        "data_origin": "official_public_DIAN_monthly_gross_collection",
        "geography": {
            "country_code": "CO",
            "country_name": "Colombia",
            "scope_level": "national",
        },
        "period": {
            "start": target_period.isoformat(),
            "granularity": "month",
        },
        "forecast": {
            "target": "monthly_gross_tax_collection",
            "value": forecast_value,
            "unit": "million COP, current pesos",
            "seasonal_naive_last_year": seasonal_baseline.amount_million_cop,
            "uncertainty_interval": None,
        },
        "baseline": {
            "previous_value": seasonal_baseline.amount_million_cop,
            "previous_period": prior_period.isoformat(),
            "unit": "million COP, current pesos",
            "comparison": "same calendar month in previous year",
        },
        "model_context": model_context,
        "source_context": {
            **source,
            "official_data_downloaded": True,
            "national_scope_warning": "This is a national tax collection series and is not a measure of Neiva or Huila economic activity.",
        },
        "limitations": [
            "This is an exploratory nominal revenue forecast; it is not inflation adjusted.",
            "The DIAN source labels 2026 figures as preliminary and is updated through September 2026.",
            "The model uses calendar month and year only; it has no macroeconomic, policy, or tax-calendar predictors.",
            "Use the rolling out-of-sample comparison with the seasonal-naive baseline before operational use.",
        ],
    }
    training_row = {
        "case_id": "CO-national",
        "source": "DIAN",
        "model_name": "monthly_seasonal_log_linear_ols",
        "model_version": "1.0",
        "run_id": run_id,
        "training_start": observations[0].period.isoformat(),
        "training_end": latest.period.isoformat(),
        "sample_count": len(observations),
        "synthetic": False,
        "coefficients": month_coefficients,
        "metrics": backtest,
    }
    prediction_row = {
        "model_name": "monthly_seasonal_log_linear_ols",
        "model_version": "1.0",
        "run_id": run_id,
        "prediction_key": prediction_key,
        "payload": payload,
    }
    sql = f"""BEGIN;
INSERT INTO analysis.model_training_runs (
    case_id, source, model_name, model_version, run_id, training_start, training_end,
    sample_count, synthetic, coefficients, metrics, trained_at
) VALUES (
    {_sql_text(training_row['case_id'])}, {_sql_text(training_row['source'])},
    {_sql_text(training_row['model_name'])}, {_sql_text(training_row['model_version'])},
    {_sql_text(training_row['run_id'])}, DATE {_sql_text(training_row['training_start'])},
    DATE {_sql_text(training_row['training_end'])}, {training_row['sample_count']}, false,
    {_jsonb_sql(training_row['coefficients'])}, {_jsonb_sql(training_row['metrics'])}, now()
)
ON CONFLICT (case_id, source, run_id) DO UPDATE SET
    training_start = EXCLUDED.training_start, training_end = EXCLUDED.training_end,
    sample_count = EXCLUDED.sample_count, synthetic = false,
    coefficients = EXCLUDED.coefficients, metrics = EXCLUDED.metrics, trained_at = EXCLUDED.trained_at;
INSERT INTO dian.predictions (
    model_name, model_version, run_id, prediction_key, predicted_at, payload
) VALUES (
    {_sql_text(prediction_row['model_name'])}, {_sql_text(prediction_row['model_version'])},
    {_sql_text(prediction_row['run_id'])}, {_sql_text(prediction_row['prediction_key'])}, now(),
    {_jsonb_sql(prediction_row['payload'])}
)
ON CONFLICT (run_id, prediction_key) DO UPDATE SET
    model_name = EXCLUDED.model_name, model_version = EXCLUDED.model_version,
    predicted_at = EXCLUDED.predicted_at, payload = EXCLUDED.payload;
COMMIT;
"""
    return {
        "forecast": payload,
        "training_run": training_row,
        "sql": sql,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Train a seasonal DIAN forecast on official monthly observations.")
    parser.add_argument("--observations", type=Path, required=True)
    parser.add_argument("--output-json", type=Path, required=True)
    parser.add_argument("--output-sql", type=Path, required=True)
    args = parser.parse_args()
    observations = read_observations(args.observations)
    source = {
        "source_url": "https://www.dian.gov.co/dian/cifras/Paginas/EstadisticasRecaudo.aspx",
        "source_file_url": "https://www.dian.gov.co/dian/cifras/EstadisticasRecaudo/Recaudo-mensual-por-tipo-de-impuesto-2000-2026.zip",
        "source_sha256": "",
        "source_update_note": "",
    }
    with args.observations.open("r", encoding="utf-8-sig", newline="") as stream:
        first = next(csv.DictReader(stream))
    source["source_sha256"] = first["source_sha256"]
    source["source_update_note"] = first["source_update_note"]
    result = build_forecast(observations, source)
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_sql.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(result["forecast"], ensure_ascii=False, indent=2), encoding="utf-8")
    args.output_sql.write_text(result["sql"], encoding="utf-8")
    summary = {
        "observations": len(observations),
        "training_period": f"{observations[0].period.isoformat()}..{observations[-1].period.isoformat()}",
        "forecast_month": result["forecast"]["period"]["start"],
        "forecast_million_cop": result["forecast"]["forecast"]["value"],
        "seasonal_naive_million_cop": result["forecast"]["baseline"]["previous_value"],
        "backtest": result["forecast"]["model_context"]["metrics"],
        "reliability_status": result["forecast"]["model_context"]["reliability_status"],
        "trained_on_real_data": True,
        "output_json": str(args.output_json),
        "output_sql": str(args.output_sql),
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
