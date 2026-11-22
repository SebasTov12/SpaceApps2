# SAROS Production Deployment

SAROS runs on Orivia as a Docker Compose project. See the complete [operations manual](../../docs/space-apps-2026/operations-manual.md) for setup, credentials, migrations, the scheduled report, monitoring, and rollback.

## Runtime services

- `spaceapps2-saros`: Next.js web client.
- `spaceapps2-api`: Flask API and operations-report calculation.
- `spaceapps2-model`: NISAR composite/supervised model service.
- `spaceapps2-postgres`: existing SAROS PostgreSQL container and persistent volume.
- Shared Caddy proxy: routes `saros.tobaru.xyz` to the web and API services.

PostgreSQL and the predictor stay on private networks. SAROS must connect to its own `spaceapps2-postgres` container, not the unrelated Orivia database alias.

## Start or update

```bash
docker compose --env-file .env -f infra/saros/docker-compose.yml run --rm nisar-migrate
docker compose --env-file .env -f infra/saros/docker-compose.yml up -d --build --no-deps saros api predictor
docker compose -f infra/saros/docker-compose.yml ps
```

The guarded host auto-deploy timer fast-forwards a clean deploy checkout from `main`, validates service health, pulls commit-tagged GHCR images, applies additive SQL migrations, and updates application containers with health checks and rollback. The `spaceapps2-operations-reporter` container refreshes aggregate production metrics daily. Read [the manual](../../docs/space-apps-2026/operations-manual.md) for monitoring commands.

Do not run `docker compose down -v`; the PostgreSQL volume stores production data.
