# SAROS API

`app.py` is the Flask API packaged as `spaceapps2-api` by `infra/saros/docker-compose.yml`.

## Routes

- `GET /health`: API liveness.
- `GET /ready`: checks PostgreSQL and the loaded NISAR ONNX predictor.
- `GET /api/v1/headlines`: returns database-backed recent NISAR observations and historical event records.
- `GET /api/v1/sites`, `GET /api/v1/sites/{id}/manifest`, `GET /api/v1/sites/{id}/timeseries`, `GET /api/v1/sites/availability`, and `GET /api/v1/sites/{id}/availability`: serve the packaged explorer catalog, layer metadata, time series, and ASF inventory. Existing site layers retain their declared `demo` or `real` provenance.
- `GET /api/v1/regions/{id}/assessment`: returns an explicit unassessed response until reviewed LOS measurements and territorial evidence are joined; it does not promote demo layers or catalog availability into a risk finding.
- `GET /api/v1/manifest` and `GET /api/v1/datasets`: return database provenance counts for DIAN/NASA prediction records, separating synthetic, real and unclassified rows. The NASA table contains forecasts, not source granules.
- `POST /api/v1/predictions`: accepts an NPZ body as `application/octet-stream`, requires `Authorization: Bearer <SAROS_PREDICTION_TOKEN>`, proxies the patch to the private predictor, and stores its result summary in PostgreSQL.
- `POST /api/v1/nisar/observations`: accepts quality-controlled real LOS observations with granule provenance, requires the same bearer token, and inserts idempotently into `nisar.observations`.
- `POST /api/v1/nisar/forecasts/run`: accepts `aoi_id`, `stack_id`, and optional backtest parameters; reads only real observations from PostgreSQL, compares robust linear trend with persistence, and saves the run and forecast in the NISAR tables.
- `POST /api/v1/assistant/chat`: sends the recent database-backed SAROS evidence and a short conversation to Groq; stores the answer and evidence snapshot in `analysis.assistant_interactions`. The LLM explains stored results but does not generate NISAR predictions. Requires `GROQ_API_KEY`, `GROQ_MODEL`, and a private `SAROS_ASSISTANT_TOKEN`.

Prediction inputs must contain finite, co-registered `before` and `after` arrays. See [the model contract](../ml/nisar_change/README.md). The API stores the prediction ID, time, threshold, dimensions, and changed fraction; large pixel masks remain in the response rather than the database.

Set `SAROS_POSTGRES_PASSWORD` to the existing database password and generate a private `SAROS_PREDICTION_TOKEN` in the server's ignored `.env`. The frontend, API, database, model, trainer, and NISAR processor are grouped under one Compose project. Training and processing services start only when their Compose profiles are selected.

Before using the two NISAR routes, apply the schema once from the repository root:

```sh
docker compose -f infra/saros/docker-compose.yml --profile migration run --rm nisar-migrate
```

The processing worker must first produce calibrated, referenced LOS observations from actual ASF GUNW granules. `POST /api/v1/nisar/observations` expects an object with a non-empty `observations` array. Each observation requires `aoi_id`, `stack_id`, ISO `observation_date`, finite `los_mm`, `valid_fraction` greater than zero and at most 1, documented `reference_method`, one or more `NISAR_L2_...GUNW...` granule identifiers, a collection matching its `source_maturity` (`VALIDATED`, `PROVISIONAL`, or `BETA`), `processing_version`, and `data_mode: "real"`. The `quality` object is mandatory and must include `source_asset_sha256` (SHA-256 by role for phase, coherence, mask, and connected components), inspected dataset paths for those layers, `reference_geometry_id`, `stable_reference_applied: true`, `coherence_threshold` in [0, 1], and positive `valid_pixel_count` and `reference_pixel_count`. Dataset paths are recorded from the inspected HDF5 or live Harmony capabilities; the API does not assume fixed internal paths. Optional `uncertainty_mm` must be positive. Duplicate AOI/stack/date/version rows are ignored.

The forecast route body requires `aoi_id`, `stack_id`, and one exact `processing_version` so a series cannot silently mix processing algorithms; optional parameters are `horizon_days`, `tolerance_days`, `min_train_observations`, and `min_valid_fraction`. The API reports backtest errors in millimetres and marks every forecast exploratory. It does not claim reliability from a small number of dates.

Apply `pipeline/sql/008_assistant_interactions.sql` before enabling Groq chat. The Next.js same-origin `/api/assistant` route keeps the assistant token server-side and applies a basic per-IP request limit. Configure `SAROS_INTERNAL_API_URL`, `SAROS_ASSISTANT_TOKEN`, `GROQ_API_KEY`, and `GROQ_MODEL` only in the private server environment; never use `NEXT_PUBLIC_` for secrets.

See [the predictive-model and assistant status](../docs/modelo-predictivo-y-asistente.md) for data requirements and limits before using a forecast operationally.

## Exposición municipal nacional

`GET /api/v1/territorial/municipalities` entrega el GeoJSON nacional (filtro opcional `?department=05`); `GET /api/v1/territorial/municipalities/05001` devuelve un municipio por DIVIPOLA, y `GET /api/v1/territorial/agriculture?divipola=05001&year=2025` entrega la serie EVA. La migración 009 y la carga se explican en [datos-territoriales-colombia](../docs/datos-territoriales-colombia.md).
