# SAROS Operations and Deployment Manual

## Runtime topology

Production runs in Docker Compose on Orivia. The existing `spaceapps2-postgres` container and `spaceapps2_postgres_data` volume hold SAROS data. Caddy routes `https://saros.tobaru.xyz/api/*` to Flask and the other requests to Next.js. Do not attach SAROS to Orivia's unrelated `orivia` database.

## Environment

Copy `.env.example` to a private `.env` for local development. On Orivia, retain the current PostgreSQL password and prediction token. Keep Earthdata and Groq credentials in the private host environment. Never put credential values in Git, documentation, logs, or screenshots.

## First-time setup or migration

From the repository root on Orivia:

```bash
docker compose --profile migration --env-file .env -f infra/saros/docker-compose.yml run --rm --no-deps nisar-migrate
docker compose --env-file .env -f infra/saros/docker-compose.yml up -d --build --no-deps saros api predictor operations-reporter
docker compose --env-file .env -f infra/saros/docker-compose.yml ps
```

The migration runner applies idempotent SQL including `011_operational_snapshots.sql`. Do not run `docker compose down -v`; that removes persistent database data.

## Daily operational report

The `spaceapps2-operations-reporter` container starts with the application stack. It reads `SAROS_PREDICTION_TOKEN` from the private Compose environment and sends a protected refresh request to the API once per day. It retries transient failures every five minutes. The token is not written into a systemd unit or printed in logs.

Check the reporter state and latest run:

```bash
docker compose -f infra/saros/docker-compose.yml ps operations-reporter
docker logs --tail 100 spaceapps2-operations-reporter
curl -fsS https://saros.tobaru.xyz/api/v1/operations/report
```

The public GET returns aggregate counts and validation metrics. The authenticated POST refreshes and stores a report in `analysis.operational_snapshots`. The daily job updates NISAR availability counts and recomputes the historical-impact holdout metrics; it does not create LOS observations or synthetic forecasts.

## Automatic code and migration updates

The `spaceapps2-auto-update.timer` checks `origin/main` every ten minutes. It refuses dirty or divergent checkouts, checks service health, pulls commit-tagged GHCR images, applies the idempotent SQL migrations before changing application containers, then waits for health checks. A failed rollout keeps or restores the previous application containers.

```bash
sudo systemctl status spaceapps2-auto-update.timer
journalctl -u spaceapps2-auto-update.service -n 100 --no-pager
```

## Monitoring and troubleshooting

```bash
docker compose -f infra/saros/docker-compose.yml ps
curl -fsS https://saros.tobaru.xyz/ready
curl -fsS https://saros.tobaru.xyz/api/v1/operations/report
docker logs --tail 100 spaceapps2-operations-reporter
```

If the report API returns `503`, verify PostgreSQL health and that migration 011 has completed. If the model is unavailable, inspect the `spaceapps2-model` health state. If LOS count is zero, the status is expected until a quality-controlled processor uploads observations; never bypass the ingestion quality requirements just to populate the forecast table.

## Rollback

Use a reviewed previous Git commit and the standard auto-update path. SQL migration 011 is additive; it creates one aggregate snapshot table. Do not delete database volumes or manually truncate research data during application rollback.

## Data retention

Operational snapshots contain aggregate data counts, score metrics, and current model/data status, not raw raster pixels, source credentials, or personal records. Keep detailed source provenance in the existing catalog, asset, and event-record tables.
