# SAROS API

`app.py` is the Flask API packaged as `spaceapps2-api` by `infra/saros/docker-compose.yml`.

## Routes

- `GET /health`: API liveness.
- `GET /ready`: checks PostgreSQL and the loaded NISAR ONNX predictor.
- `GET /api/v1/headlines`: returns an empty list while the reviewed publication pipeline is not connected; the frontend then uses its sourced static data.
- `POST /api/v1/predictions`: accepts an NPZ body as `application/octet-stream`, requires `Authorization: Bearer <SAROS_PREDICTION_TOKEN>`, proxies the patch to the private predictor, and stores its result summary in PostgreSQL.

Prediction inputs must contain finite, co-registered `before` and `after` arrays. See [the model contract](../ml/nisar_change/README.md). The API stores the prediction ID, time, threshold, dimensions, and changed fraction; large pixel masks remain in the response rather than the database.

Set `SAROS_POSTGRES_PASSWORD` to the existing database password and generate a private `SAROS_PREDICTION_TOKEN` in the server's ignored `.env`. The frontend, API, database, model, trainer, and NISAR processor are grouped under one Compose project. Training and processing services start only when their Compose profiles are selected.
