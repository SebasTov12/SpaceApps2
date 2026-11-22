# Validation and Current Results

## Production data coverage

At the production inspection on 22 November 2026, PostgreSQL contained 227 NISAR raster assets, including 18 real GUNW granules. The `nisar.observations` table contained **0 quality-controlled LOS observations**, and `nisar.forecast_runs` contained **0 forecast runs**. Therefore SAROS had no measured NISAR LOS forecast skill to report. The production API reports this state directly; it must not create an LOS forecast from catalog metadata or unreferenced phase candidates.

## Retrospective reported-impact backtest

A fresh out-of-time comparison on stored Colombian event-impact records used 3,315 training records from 2019–2022 and 1,273 held-out records from 2025. It compared department/municipality empirical-Bayes shrinkage (prior count 10) with a baseline that predicts the training-set global mean.

| Target | Holdout MAE, estimator | Holdout MAE, global baseline | Relative MAE improvement |
| --- | ---: | ---: | ---: |
| Affected families | 7.3799 families | 10.3037 families | 28.38% |
| Affected people | 29.1496 people | 37.6695 people | 22.62% |
| Homes damaged | 3.5831 houses | 4.0776 houses | 12.13% |
| Homes destroyed | 0.3956 houses | 0.7811 houses | 49.35% |

These metrics measure retrospective estimation of **reported historical impacts**. They do not measure the accuracy of a future landslide forecast, do not establish causal damage estimates for a new event, and do not justify an alert. Source rows may be incomplete and can contain overlapping source snapshots. No casualty estimate is displayed by SAROS.

## Exploratory NISAR screening

The current composite model was fitted on real raster features, but it has no expert-reviewed event labels. Its held-out pixel-level check assesses anomaly tail rates only; it does not establish event-prediction skill. The stored Neiva screening observed 0.624% relative anomalous pixels and an exploratory relative priority score of 34.43/100 (P3). Those numbers are not event probability or validated hazard severity.

## Requirements for a future forecast claim

- A time series of stable-reference LOS measurements with consistent geometry and version.
- Independent validation against GNSS, field measurements, or a defensible event inventory.
- Spatial and temporal holdouts that prevent nearby or overlapping scenes from leaking across partitions.
- A predefined forecast horizon, decision threshold, calibration assessment, and persistence baseline.
- Enough independent future targets to estimate uncertainty and demonstrate repeatable skill.

Until those requirements are met, user-facing language must say **exploratory screening** and state that no validated NISAR forecast is available.
