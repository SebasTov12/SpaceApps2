# SAROS User Guide

## Explore the map

Open the SAROS website and move through the Earth view. Select one of the available locations to open its analysis panel. The site can show NISAR scene metadata, selected change layers, local administrative context, and socioeconomic exposure where those data are available.

Use the **Data & validation** link to open the live operations report. It shows the latest persisted production snapshot, current data counts, and the historical-impact backtest.

## Read a location assessment

Check these fields before interpreting an output:

1. **Data mode:** `real`, `real_exploratory`, `demo`, or unavailable. Real source data do not by themselves mean a validated model result.
2. **Date and coverage:** note the acquisition date and whether the page has a continuous, processed series.
3. **Anomaly and changed fraction:** these are relative screening quantities from the current exploratory detector. They are not probabilities.
4. **Relative priority:** a prioritization aid based on the current analysis and historical municipal impact context. It is not a calibrated danger level.
5. **Sources and limitations:** inspect the linked sources and any missing layers.

## What to do with the result

Use a high-priority screening result to ask for technical field review, compare it with local reports, and identify infrastructure or services that need inspection. Prepare community plans with local authorities. A SAROS result does not establish that a site is safe or unsafe and must not replace official alerts or emergency instructions.

## Assistant

The assistant can summarize information returned by the SAROS API. It should be read as a summary of available data, not as an independent sensor or forecasting model. Confirm important statements against the cited data and the operations report.

## Missing or stale data

If a location has no assessment, SAROS should say so. A missing value is not zero risk. The operations page reports source counts, LOS observation coverage, forecast-run count, and the time of the last stored snapshot.
