# Data Pipeline Scripts

The scripts in this directory acquire and inspect public hazard, territorial, and NASA NISAR data. They retain source provenance and keep credentials out of tracked files. For the end-to-end project and deployment manuals, see [`docs/space-apps-2026/`](../docs/space-apps-2026/README.md).

## Local environment

Use Python 3.12 and install the script dependencies:

```bash
python -m pip install -r scripts/requirements.txt
```

Create a private root `.env` from `.env.example` and add Earthdata Login credentials if downloading products. Never commit the filled `.env`.

## Common commands

Query the open ASF catalog without logging in:

```bash
python scripts/connect_earthdata.py --anonymous
```

Filter and summarize NISAR GUNW catalog footprints for Colombia:

```bash
python scripts/filter_nisar_colombia.py --max-results 100
python scripts/analyze_nisar_colombia.py --input data/filtered/colombia-ladera/03_colombia_bbox.geojson
```

Inspect the selected catalog entries before downloading:

```bash
python scripts/download_nisar_colombia.py --dry-run
```

When Earthdata is configured, download only the reviewed AOI/stack and retain the generated manifest. For Harmony extraction, list the variables available for the desired collection first, then download one granule at a time and inspect the resulting checksums, raster grid, units, masks, and nodata values.

## Production data loading

Use the packaged `processor` from `infra/saros/docker-compose.yml` for server-side acquisition. Load normalized territorial, hazard, and NISAR catalog metadata with their corresponding `load_*_to_server.py` commands. These ingestors write metadata/provenance and database records; they do not automatically make raw phase rasters into LOS observations.

## Forecast eligibility

The LOS forecast module requires a real observation CSV with compatible AOI/stack, date, millimetres, valid fraction, and source granules. It rejects demo data and duplicate dates. A stable reference and independently reviewed raster quality are required before the backend will accept observations. Read [Data and Scientific Method](../docs/space-apps-2026/data-and-methods.md) and [Validation and Results](../docs/space-apps-2026/validation-and-results.md) before interpreting its output.
