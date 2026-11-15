#!/usr/bin/env python3
"""Load an ASF NISAR AOI catalog into PostgreSQL without downloading HDF5 granules."""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
COLUMNS = (
    "granule_name", "aoi_id", "processing_level", "collection", "maturity",
    "orbit_direction", "relative_orbit", "frame", "polarization", "reference_date",
    "secondary_date", "size_bytes", "geometry_geojson", "source_properties", "source",
    "inventoried_at", "data_mode",
)


def json_text(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def maturity(collection: str) -> str:
    upper = collection.upper()
    for known in ("VALIDATED", "PROVISIONAL", "BETA"):
        if known in upper:
            return known
    return "OTHER"


def values(feature: dict[str, Any], aoi_id: str, inventoried_at: str) -> list[Any]:
    props = feature["properties"]
    name = str(props.get("fileID") or props.get("sceneName") or "")
    if not name:
        raise ValueError("Catalog feature has no fileID/sceneName")
    collection = str(props.get("collectionName") or "UNKNOWN")
    level = str(props.get("processingLevel") or props.get("saros_processing_level") or "UNKNOWN")
    orbit_match = re.search(r"_(\d{3})_([AD])_(\d{3})_", name)
    timestamps = re.findall(r"(20\d{6})T\d{6}", name)
    size = None
    for filename, detail in (props.get("bytes") or {}).items():
        if str(filename).endswith(".h5") and "QA_STATS" not in str(filename):
            size = detail.get("bytes") if isinstance(detail, dict) else None
            break
    direction = props.get("flightDirection")
    if not direction and orbit_match:
        direction = "ASCENDING" if orbit_match.group(2) == "A" else "DESCENDING"
    polarization = props.get("mainBandPolarization") or props.get("polarization")
    if isinstance(polarization, list):
        polarization = ",".join(str(item) for item in polarization)
    return [
        name, aoi_id, level, collection, maturity(collection), direction,
        orbit_match.group(1) if orbit_match else None,
        str(props.get("frameNumber")) if props.get("frameNumber") is not None else (orbit_match.group(3) if orbit_match else None),
        polarization,
        datetime.strptime(timestamps[0], "%Y%m%d").date().isoformat() if timestamps else None,
        datetime.strptime(timestamps[1], "%Y%m%d").date().isoformat() if len(timestamps) > 1 else None,
        size, json_text(feature["geometry"]), json_text(props), "ASF DAAC", inventoried_at,
        "real_metadata",
    ]


def make_stream(catalog_path: Path, summary_path: Path, output: Path) -> int:
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    aoi_id = summary.get("aoi_id") or "unknown"
    inventoried_at = summary["retrieved_at"]
    with output.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write("\\set ON_ERROR_STOP on\nBEGIN;\n")
        handle.write("CREATE TEMP TABLE _nisar_catalog AS SELECT * FROM nisar.catalog_assets WITH NO DATA;\n")
        handle.write(f"\\copy _nisar_catalog ({', '.join(COLUMNS)}) FROM STDIN WITH (FORMAT csv, NULL '\\N')\n")
        writer = csv.writer(handle, lineterminator="\n")
        for feature in catalog["features"]:
            row = values(feature, aoi_id, inventoried_at)
            writer.writerow(["\\N" if value is None else value for value in row])
        handle.write("\\.\n")
        handle.write(
            f"INSERT INTO nisar.catalog_assets ({', '.join(COLUMNS)}) "
            f"SELECT {', '.join(COLUMNS)} FROM _nisar_catalog "
            "ON CONFLICT (granule_name) DO UPDATE SET source_properties=EXCLUDED.source_properties, "
            "geometry_geojson=EXCLUDED.geometry_geojson, inventoried_at=EXCLUDED.inventoried_at;\nCOMMIT;\n"
        )
    return len(catalog["features"])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, default=None)
    parser.add_argument("--ssh-host", default=os.getenv("SAROS_SSH_HOST", "admin@orivia"))
    parser.add_argument("--ssh-key", type=Path, default=Path.home() / ".ssh" / "id_ed25519")
    parser.add_argument("--db-container", default="spaceapps2-postgres")
    parser.add_argument("--db-user", default="spaceapps2_admin")
    parser.add_argument("--database", default="spaceapps2")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if args.catalog:
        catalog_path = args.catalog.expanduser().resolve()
    else:
        candidates = sorted((ROOT / "data" / "raw" / "nisar").glob("*/catalog.geojson"))
        if not candidates:
            parser.error("No local NISAR catalog found; run scripts/catalog_nisar_aoi.py")
        catalog_path = candidates[-1]
    summary_path = catalog_path.with_name("summary.json")
    stream_path = catalog_path.with_name("load_nisar_catalog_to_server.psql.sql")
    count = make_stream(catalog_path, summary_path, stream_path)
    print(f"Prepared {count} NISAR catalog records; SQL stream={stream_path}")
    if args.dry_run:
        print("DRY_RUN: no SSH connection or DB changes")
        return 0
    if not args.ssh_key.is_file():
        parser.error(f"SSH key not found: {args.ssh_key}")
    command = ["ssh", "-i", str(args.ssh_key), "-o", "BatchMode=yes", "-o", "ConnectTimeout=15",
               args.ssh_host, f"docker exec -i {args.db_container} psql -X -v ON_ERROR_STOP=1 -U {args.db_user} -d {args.database}"]
    with stream_path.open("rb") as stream:
        result = subprocess.run(command, stdin=stream, capture_output=True, check=False)
    if result.stdout:
        output = result.stdout.decode("utf-8", errors="replace").strip()
        if output:
            print(output[-3000:])
    if result.returncode:
        print(result.stderr.decode("utf-8", errors="replace")[-3000:], file=sys.stderr)
        return result.returncode
    print(f"NISAR_CATALOG_LOAD_OK records={count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
