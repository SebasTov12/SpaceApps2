# SAROS — Space Apps 2026

**Socioeconomic Analysis and Risk Observation System** combines NASA–ISRO NISAR observations with Colombian hazard reports and territorial exposure data. It turns geospatial evidence into traceable screening and planning information for communities, infrastructure, and local livelihoods.

> **Current capability:** SAROS can show exploratory NISAR change screening, territorial exposure, and a measured retrospective estimator of reported disaster impacts. Production currently has NISAR catalog and raster assets, but no quality-controlled LOS observation series or stored NISAR forecast runs. A catalog item or anomaly score is not a validated future-risk forecast.

## Start here

- [Space Apps project brief](docs/space-apps-2026/project-overview.md)
- [Interactive user guide](docs/space-apps-2026/user-guide.md)
- [System architecture](docs/space-apps-2026/architecture.md)
- [Data and scientific method](docs/space-apps-2026/data-and-methods.md)
- [Measured validation and current results](docs/space-apps-2026/validation-and-results.md)
- [Operations and deployment manual](docs/space-apps-2026/operations-manual.md)
- [API reference](docs/space-apps-2026/api-reference.md)
- [Space Apps demo runbook](docs/space-apps-2026/demo-runbook.md)
- [Automated production status page](https://saros.tobaru.xyz/operations)

## What the platform does

1. Retrieves NISAR catalog metadata and processes selected GUNW, GCOV, and other compatible raster products.
2. Screens paired radar observations for relative surface-change signals.
3. Links a selected area with public hazard history and DANE / territorial exposure records.
4. Reports the data mode, source lineage, model version, and limits alongside each assessment.
5. Helps users prioritize field review and preparedness planning. It does not issue evacuation orders or earthquake predictions.

## Repository map

| Path | Purpose |
| --- | --- |
| `frontend/` | Next.js interactive SAROS globe, location views, assistant, and operations report page |
| `backend/` | Flask API for data, territorial exposure, model analysis, and reporting |
| `ml/nisar_change/` | NISAR exploratory composite and supervised change-model code |
| `ml/nisar_forecast/` | Strict real-observation input and temporal backtesting for LOS series |
| `pipeline/sql/` | PostgreSQL schemas and versioned migrations |
| `scripts/` | Source ingestion, catalog, raster inspection, and reproducible data tools |
| `infra/saros/` | Docker Compose, Orivia deployment scripts, and systemd schedules |
| `docs/space-apps-2026/` | English project, science, user, API, validation, and operations manuals |

## Local development

Use the Docker Compose guide in [the operations manual](docs/space-apps-2026/operations-manual.md). Copy `.env.example` to `.env` for local configuration, and keep all credentials out of Git. Never commit `.env`, downloaded private credentials, or raw source data unless a source license and repository policy explicitly allow it.

## Data and validation principles

- Preserve original source, retrieval date, product collection, processing version, and file checksum.
- Keep synthetic examples separate from real observations.
- Expose historical impact regression scores separately from NISAR movement forecasting.
- Show the holdout period, sample counts, MAE, baseline, and known limitations.
- Do not show casualty estimates in the user interface.
- Do not turn relative anomaly scores into event probabilities or operational warnings.

See the [validation and results note](docs/space-apps-2026/validation-and-results.md) for measured production values and scope.
