# SAROS API Reference

Base URL: `https://saros.tobaru.xyz/api/v1`.

## Operations report

### `GET /operations/report`

Returns the latest persisted aggregate report. If no snapshot exists yet, it assembles a current report from PostgreSQL without persisting it.

Example sections:

- `service`: API and composite-model readiness.
- `nisar`: catalog, GUNW, raster, real LOS observation, and forecast-run counts.
- `historical_impact_backtest`: train/holdout counts, MAE, global baseline, and improvement for four reported-impact targets.
- `latest_exploratory_assessment`: latest relative NISAR screening, when present.
- `limitations`: statements required to interpret the metrics.

### `POST /operations/refresh`

Requires `Authorization: Bearer <SAROS_PREDICTION_TOKEN>`. Accepts an empty JSON object. Recomputes the aggregate report and stores a timestamped JSON snapshot. Responses contain no source-level personal records and do not expose the token.

## NISAR observation and forecast routes

- `POST /nisar/observations` — protected; accepts only real observations with provenance and stable-reference quality evidence.
- `GET /nisar/observations/checkpoint` — protected; returns an observation checkpoint for a specified AOI, stack, and processing version.
- `POST /nisar/forecasts/run` — protected; runs a temporal backtest and stores an exploratory forecast target from accepted real observations.

The forecast route returns `422 insufficient_real_observations` when the compatible series has too few valid measurements. Catalog assets do not satisfy this requirement.

## Other APIs

- `GET /health` — process health.
- `GET /ready` — checks PostgreSQL and the composite model.
- `GET /datasets` and `GET /manifest` — source inventory and data status.
- `GET /territorial/municipalities` and `GET /territorial/municipalities/{DIVIPOLA}` — territorial exposure.
- `POST /analysis` — protected model-assisted relative NISAR screening.

See `backend/app.py` for request validation and response details. Keep API credentials in the private deployment environment.
