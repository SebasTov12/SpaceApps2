# Data and Scientific Method

## NISAR products

SAROS inventories NISAR products through ASF DAAC / NASA Earthdata. Products include Level 2 Geocoded Unwrapped Interferogram (GUNW) and complementary products such as GCOV. Catalog metadata identifies acquisition pairs, orbit, frame, polarization, collection, maturity, and spatial footprint. A catalog entry is not itself a displacement observation.

GUNW phase is measured in radians. To interpret line-of-sight (LOS) displacement, the processing workflow must establish compatible product metadata, phase convention, wavelength, masks, coherence, connected components, a defensible reference area, and correction assumptions. A provisional candidate phase layer without a stable reference and independent check must remain exploratory.

## Colombian context

Public UNGRD and other Colombian open-data sources contribute event and reported-impact history. DANE and other official territorial datasets provide administrative profiles and exposure context. Dataset vintage, geographic resolution, completeness, duplicate risk, and licensing should be recorded for each source snapshot.

Historical reports are not complete observations of all disasters, and a municipal impact profile is not a household survey. National economic statistics do not directly measure local event losses. Do not infer causal impact from spatial coincidence alone.

## Analysis stages

1. **Acquire:** download catalog metadata or public source records and keep the source URL, retrieval timestamp, source identifier, and raw hash.
2. **Normalize:** map fields to documented units and preserve the source payload.
3. **Quality-check:** inspect coordinate reference system, geotransform, valid-data mask, nodata, dimensions, acquisition dates, and raster alignment.
4. **Screen change:** compare compatible radar features using the track-specific baseline. Treat anomaly outputs as relative screening.
5. **Assess exposure:** intersect the selected area with population, housing, services, roads, and livelihood data where available.
6. **Backtest:** use a time-separated holdout and compare against a simple baseline; report effective sample counts.
7. **Communicate:** return sources, dates, version, uncertainty, and limitations with every result.

## LOS observations and forecast eligibility

An accepted LOS row must include one AOI and compatible stack, acquisition date, LOS in millimetres, valid fraction, uncertainty when known, stable-reference method, source granules and collection, processing version, and source-raster checksums with quality evidence. The ingestion API rejects demo records and observations without a documented stable reference. Duplicate AOI/stack/date/version rows are ignored.

Forecast code accepts real observations only. It runs a rolling temporal backtest against persistence and labels a trend result exploratory. A minimum count of distinct targets is a screening condition, not proof of operational skill. SAROS does not predict earthquakes.
