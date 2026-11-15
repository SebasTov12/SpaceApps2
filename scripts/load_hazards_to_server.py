#!/usr/bin/env python3
"""Load normalized public hazard records into the remote SAROS PostgreSQL DB."""

from __future__ import annotations

import argparse
import csv
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT_COLUMNS = (
    "snapshot_id", "source_id", "category", "endpoint_host", "endpoint_path", "content_type",
    "retrieved_at", "source_record_count", "normalized_record_count", "exact_duplicates_removed",
    "normalization_version", "raw_file_name", "raw_sha256", "raw_bytes", "quality", "data_mode",
)
RECORD_COLUMNS = (
    "snapshot_id", "source_id", "source_record_id", "record_hash", "record_type", "event_date",
    "department", "municipality", "divipola", "event_type", "deaths", "injured", "missing",
    "affected_people", "affected_families", "homes_destroyed", "homes_damaged", "roads_damaged",
    "bridges_damaged", "health_centers_affected", "schools_affected", "hectares_affected",
    "economic_support_cop", "normalized_metrics", "geometry_geojson", "quality", "source_payload",
    "normalization_version", "data_mode",
)
METRIC_COLUMNS = (
    "deaths", "injured", "missing", "affected_people", "affected_families", "homes_destroyed",
    "homes_damaged", "roads_damaged", "bridges_damaged", "health_centers_affected",
    "schools_affected", "hectares_affected", "economic_support_cop",
)


def json_text(value: Any) -> str | None:
    return None if value is None else json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def sql_ident_list(columns: tuple[str, ...]) -> str:
    return ", ".join(columns)


def write_copy_row(writer: csv.writer, values: list[Any]) -> None:
    writer.writerow(["\\N" if value is None else value for value in values])


def latest_input() -> Path:
    reports = sorted((ROOT / "data" / "processed" / "public-hazards").glob("*/quality_report.json"))
    if not reports:
        raise FileNotFoundError("Run scripts/normalize_hazard_sources.py first")
    return reports[-1].parent


def build_psql_stream(input_dir: Path, output_path: Path) -> tuple[int, int, str]:
    report = json.loads((input_dir / "quality_report.json").read_text(encoding="utf-8"))
    source_manifest_path = Path(report["source_manifest"])
    if not source_manifest_path.is_absolute():
        source_manifest_path = ROOT / source_manifest_path
    source_manifest = json.loads(source_manifest_path.read_text(encoding="utf-8"))
    source_by_id = {item["source_id"]: item for item in source_manifest["sources"]}
    quality_by_id = {item["source_id"]: item for item in report["sources"]}
    snapshot_by_source: dict[str, str] = {}

    with output_path.open("w", encoding="utf-8", newline="\n") as output:
        output.write("\\set ON_ERROR_STOP on\nBEGIN;\n")
        output.write("CREATE TEMP TABLE _hazard_snapshots AS SELECT * FROM hazards.source_snapshots WITH NO DATA;\n")
        output.write(f"\\copy _hazard_snapshots ({sql_ident_list(SNAPSHOT_COLUMNS)}) FROM STDIN WITH (FORMAT csv, NULL '\\N')\n")
        snapshot_writer = csv.writer(output, lineterminator="\n")
        for source_id, source in source_by_id.items():
            quality = quality_by_id[source_id]
            snapshot_id = f"{source_id}:{source['sha256']}"
            snapshot_by_source[source_id] = snapshot_id
            snapshot_values = [
                snapshot_id,
                source_id,
                source["category"],
                source["endpoint_host"],
                source["endpoint_path"],
                source.get("content_type"),
                source["retrieved_at"],
                source["record_count"],
                quality["normalized_records"],
                quality["exact_duplicates_removed"],
                report["normalization_version"],
                source["file"],
                source["sha256"],
                (source_manifest_path.parent / source["file"]).stat().st_size,
                json_text(quality),
                "real",
            ]
            write_copy_row(snapshot_writer, snapshot_values)
        output.write("\\.\n")
        output.write(
            "INSERT INTO hazards.source_snapshots (" + sql_ident_list(SNAPSHOT_COLUMNS) + ") "
            "SELECT " + sql_ident_list(SNAPSHOT_COLUMNS) + " FROM _hazard_snapshots "
            "ON CONFLICT (snapshot_id) DO NOTHING;\n"
        )

        output.write("CREATE TEMP TABLE _hazard_records AS SELECT * FROM hazards.records WITH NO DATA;\n")
        output.write(f"\\copy _hazard_records ({sql_ident_list(RECORD_COLUMNS)}) FROM STDIN WITH (FORMAT csv, NULL '\\N')\n")
        record_writer = csv.writer(output, lineterminator="\n")
        records_path = input_dir / report["records_file"]
        record_count = 0
        with records_path.open("r", encoding="utf-8") as records_file:
            for line in records_file:
                record = json.loads(line)
                metrics = record.get("metrics") or {}
                values = [
                    snapshot_by_source[record["source_id"]],
                    record["source_id"],
                    record["source_record_id"],
                    record["record_hash"],
                    record["record_type"],
                    record.get("event_date"),
                    record.get("department"),
                    record.get("municipality"),
                    record.get("divipola"),
                    record.get("event_type"),
                    *[metrics.get(column) for column in METRIC_COLUMNS],
                    json_text(metrics) or "{}",
                    json_text(record.get("geometry")),
                    json_text({"invalid_metrics": record.get("invalid_metrics", []), "normalization_version": report["normalization_version"]}),
                    json_text(record.get("raw")) or "{}",
                    report["normalization_version"],
                    record["data_mode"],
                ]
                write_copy_row(record_writer, values)
                record_count += 1
        output.write("\\.\n")
        output.write(
            "INSERT INTO hazards.records (" + sql_ident_list(RECORD_COLUMNS) + ") "
            "SELECT " + sql_ident_list(RECORD_COLUMNS) + " FROM _hazard_records "
            "ON CONFLICT (snapshot_id, source_record_id) DO NOTHING;\nCOMMIT;\n"
        )

    return len(source_by_id), record_count, report["normalization_version"]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=None, help="Normalized public-hazard run directory")
    parser.add_argument("--ssh-host", default=os.getenv("SAROS_SSH_HOST", "admin@orivia"))
    parser.add_argument("--ssh-key", type=Path, default=Path.home() / ".ssh" / "id_ed25519")
    parser.add_argument("--db-container", default="spaceapps2-postgres")
    parser.add_argument("--db-user", default="spaceapps2_admin")
    parser.add_argument("--database", default="spaceapps2")
    parser.add_argument("--dry-run", action="store_true", help="Build the idempotent load stream but do not connect to the server")
    args = parser.parse_args()

    input_dir = args.input.expanduser().resolve() if args.input else latest_input()
    if not (input_dir / "quality_report.json").is_file():
        parser.error(f"No quality_report.json in {input_dir}")
    stream_path = input_dir / "load_hazards_to_server.psql.sql"
    snapshots, records, version = build_psql_stream(input_dir, stream_path)
    print(f"Prepared {snapshots} snapshots and {records} normalized rows ({version}); SQL stream={stream_path}")
    if args.dry_run:
        print("DRY_RUN: no SSH connection or DB changes")
        return 0

    if not args.ssh_key.is_file():
        parser.error(f"SSH key not found: {args.ssh_key}")
    command = [
        "ssh", "-i", str(args.ssh_key), "-o", "BatchMode=yes", "-o", "ConnectTimeout=15",
        args.ssh_host,
        f"docker exec -i {args.db_container} psql -X -v ON_ERROR_STOP=1 -U {args.db_user} -d {args.database}",
    ]
    with stream_path.open("rb") as stream:
        result = subprocess.run(command, stdin=stream, capture_output=True, check=False)
    if result.stdout:
        output = result.stdout.decode("utf-8", errors="replace").strip()
        if output:
            print(output[-4000:])
    if result.returncode != 0:
        error = result.stderr.decode("utf-8", errors="replace").strip()
        print(error[-4000:], file=sys.stderr)
        return result.returncode
    print(f"DB_LOAD_OK snapshots={snapshots} records={records}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
