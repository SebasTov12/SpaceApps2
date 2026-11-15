#!/usr/bin/env python3
"""Load a prepared national territorial snapshot into SAROS PostgreSQL over SSH."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

from shapely.geometry import shape, mapping

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT_COLUMNS = ("snapshot_id", "source_id", "source_url", "source_vintage", "retrieved_at", "record_count", "sha256", "file_name", "quality", "data_mode")
PROFILE_COLUMNS = (
    "divipola", "department_code", "department_name", "municipality_name", "census_vintage",
    "population_total", "population_male", "population_female", "households_total", "dwellings_total",
    "occupied_dwellings", "nonresidential_units", "nonresidential_activity_counts", "housing_deficit_count",
    "housing_deficit_percent", "housing_deficit_components", "multidimensional_poverty_index",
    "health_facility_count", "school_site_count", "geometry_geojson", "source_snapshot_ids", "quality", "data_mode",
)
FEATURE_COLUMNS = ("feature_id", "divipola", "source_snapshot_id", "feature_type", "name", "source_vintage", "geometry_geojson", "properties", "quality", "data_mode")
AGRICULTURE_COLUMNS = (
    "snapshot_id", "source_record_id", "divipola", "department_name", "municipality_name", "year", "period",
    "crop_group", "crop_subgroup", "crop_name", "crop_detail", "crop_code", "scientific_name", "crop_cycle",
    "crop_state", "area_sown_ha", "area_harvested_ha", "production_tonnes", "yield_tonnes_per_ha",
    "source_payload", "quality", "data_mode",
)


def json_text(value: Any) -> str | None:
    return None if value is None else json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def write_row(writer: csv.writer, values: list[Any]) -> None:
    writer.writerow(["\\N" if v is None else v for v in values])


def number_or_none(value: Any) -> Any:
    if value is None or value == "":
        return None
    return value


def iter_json_array(path: Path):
    """Read a large Socrata JSON array one feature at a time."""
    decoder = json.JSONDecoder()
    with path.open("r", encoding="utf-8") as source:
        buffer = ""
        eof = False
        started = False
        while True:
            if not buffer and not eof:
                buffer = source.read(1024 * 1024)
                eof = not buffer
            stripped = buffer.lstrip()
            consumed = len(buffer) - len(stripped)
            buffer = stripped
            if not started:
                if not buffer and eof:
                    return
                if buffer.startswith("["):
                    buffer = buffer[1:]
                    started = True
                    continue
                raise ValueError(f"Expected a JSON array in {path}")
            if buffer.startswith("]"):
                return
            if buffer.startswith(","):
                buffer = buffer[1:]
                continue
            try:
                value, end = decoder.raw_decode(buffer)
            except json.JSONDecodeError:
                if eof:
                    raise
                more = source.read(1024 * 1024)
                if not more:
                    eof = True
                buffer += more
                continue
            yield value
            buffer = buffer[end:]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True, help="Raw snapshot manifest.json")
    parser.add_argument("--profiles", type=Path, required=True, help="Processed national municipal GeoJSON")
    parser.add_argument("--ssh-host", default=os.getenv("SAROS_SSH_HOST", "admin@orivia"))
    parser.add_argument("--ssh-key", type=Path, default=Path.home() / ".ssh" / "id_ed25519")
    parser.add_argument("--db-container", default="spaceapps2-postgres")
    parser.add_argument("--db-user", default="spaceapps2_admin")
    parser.add_argument("--database", default="spaceapps2")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    manifest_path = args.manifest.expanduser().resolve()
    profiles_path = args.profiles.expanduser().resolve()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    profiles = json.loads(profiles_path.read_text(encoding="utf-8"))
    if manifest.get("data_mode") != "real" or len(profiles.get("features", [])) < 1000:
        parser.error("Input must be real national data with at least 1,000 municipal profiles")
    snapshot_id_by_source = {s["source_id"]: f'{s["source_id"]}:{s["sha256"]}' for s in manifest["sources"]}
    stream_path = profiles_path.with_name("load_territorial_to_server.psql.sql")
    with stream_path.open("w", encoding="utf-8", newline="\n") as out:
        out.write("\\set ON_ERROR_STOP on\nBEGIN;\n")
        out.write("CREATE TEMP TABLE _territorial_snapshots AS SELECT * FROM territorial.source_snapshots WITH NO DATA;\n")
        out.write(f"\\copy _territorial_snapshots ({', '.join(SNAPSHOT_COLUMNS)}) FROM STDIN WITH (FORMAT csv, NULL '\\N')\n")
        writer = csv.writer(out, lineterminator="\n")
        for source in manifest["sources"]:
            snapshot = dict(source)
            quality = {"bytes": source.get("bytes"), "coverage": manifest.get("coverage"), "normalization_version": "colombia-territorial-v1"}
            write_row(writer, [snapshot_id_by_source[source["source_id"]], source["source_id"], source["source_url"], source.get("source_vintage"), source["retrieved_at"], source["record_count"], source["sha256"], source["file_name"], json_text(quality), "real"])
        out.write("\\.\nINSERT INTO territorial.source_snapshots (" + ",".join(SNAPSHOT_COLUMNS) + ") SELECT " + ",".join(SNAPSHOT_COLUMNS) + " FROM _territorial_snapshots ON CONFLICT (snapshot_id) DO NOTHING;\n")

        out.write("CREATE TEMP TABLE _municipal_profiles AS SELECT * FROM territorial.municipal_profiles WITH NO DATA;\n")
        out.write(f"\\copy _municipal_profiles ({', '.join(PROFILE_COLUMNS)}) FROM STDIN WITH (FORMAT csv, NULL '\\N')\n")
        writer = csv.writer(out, lineterminator="\n")
        for feature in profiles["features"]:
            p = feature["properties"]
            lineage = p.get("source_lineage") or {}
            source_ids = sorted({snapshot_id_by_source[k] for k in lineage.values() if k in snapshot_id_by_source})
            values = [p.get(c) for c in PROFILE_COLUMNS]
            values[12] = json_text(p.get("nonresidential_activity_counts") or {})
            values[15] = json_text(p.get("housing_deficit_components") or {})
            values[19] = json_text(feature.get("geometry"))
            values[20] = "{" + ",".join(source_ids) + "}"
            values[21] = json_text(p.get("quality") or {})
            values[22] = "real"
            write_row(writer, values)
        out.write("\\.\nINSERT INTO territorial.municipal_profiles (" + ",".join(PROFILE_COLUMNS) + ") SELECT " + ",".join(PROFILE_COLUMNS) + " FROM _municipal_profiles ON CONFLICT (divipola) DO UPDATE SET " + ",".join(f"{c}=EXCLUDED.{c}" for c in PROFILE_COLUMNS if c != "divipola") + ",updated_at=now();\n")

        raw_by_name = {source["source_id"]: manifest_path.parent / source["file_name"] for source in manifest["sources"]}
        feature_sources = [(k, kind) for k, kind in (("dane_sise_school_sites", "school"), ("invias_national_roads", "road")) if k in raw_by_name and raw_by_name[k].is_file()]
        feature_rows = 0
        if feature_sources:
            out.write("CREATE TEMP TABLE _exposure_features AS SELECT * FROM territorial.exposure_features WITH NO DATA;\n")
            out.write(f"\\copy _exposure_features ({', '.join(FEATURE_COLUMNS)}) FROM STDIN WITH (FORMAT csv, NULL '\\N')\n")
            writer = csv.writer(out, lineterminator="\n")
            source_vintage = {s["source_id"]: s.get("source_vintage") for s in manifest["sources"]}
            for source_id, kind in feature_sources:
                path = raw_by_name[source_id]
                if kind == "school":
                    rows = json.loads(path.read_text(encoding="utf-8")).get("features", [])
                else:
                    rows = iter_json_array(path)
                snap_id = snapshot_id_by_source[source_id]
                for i, row in enumerate(rows):
                    properties = row.get("properties") or row
                    geometry = row.get("geometry")
                    if not geometry and isinstance(properties.get("multiline"), dict):
                        geometry = properties["multiline"]
                    if not geometry:
                        continue
                    quality = {"source_geometry_simplified": False}
                    if kind == "road":
                        # Keep source linework locally; the DB copy is generalized
                        # to a country-scale map to control storage and response size.
                        simplified = shape(geometry).simplify(0.0005, preserve_topology=False)
                        geometry = mapping(simplified)
                        quality = {"source_geometry_simplified": True, "max_deviation_degrees": 0.0005, "local_raw_source_retained": True}
                        properties = {k: v for k, v in properties.items() if k != "multiline"}
                    code = properties.get("ID_MUNICIP") or properties.get("municipality_code")
                    divipola = str(code).zfill(5) if code else None
                    name = properties.get("NOMBRE_INS") or properties.get("nombre_ruta") or properties.get("nombre_tramo") or properties.get("sector")
                    stable = hashlib.sha256(f"{snap_id}|{kind}|{properties.get('COD_SEDE_P') or properties.get('codigo_tramo') or ''}|{i}".encode()).hexdigest()
                    write_row(writer, [stable, divipola, snap_id, kind, name, source_vintage[source_id], json_text(geometry), json_text(properties), json_text(quality), "real"])
                    feature_rows += 1
            out.write("\\.\nINSERT INTO territorial.exposure_features (" + ",".join(FEATURE_COLUMNS) + ") SELECT " + ",".join(FEATURE_COLUMNS) + " FROM _exposure_features ON CONFLICT (feature_id) DO UPDATE SET divipola=EXCLUDED.divipola,source_snapshot_id=EXCLUDED.source_snapshot_id,feature_type=EXCLUDED.feature_type,name=EXCLUDED.name,source_vintage=EXCLUDED.source_vintage,geometry_geojson=EXCLUDED.geometry_geojson,properties=EXCLUDED.properties,quality=EXCLUDED.quality;\n")
        agriculture_path = raw_by_name.get("upra_eva_agricultural")
        if agriculture_path and agriculture_path.is_file():
            agriculture_snapshot = snapshot_id_by_source["upra_eva_agricultural"]
            out.write("CREATE TEMP TABLE _agricultural_production AS SELECT * FROM territorial.agricultural_production WITH NO DATA;\n")
            out.write(f"\\copy _agricultural_production ({', '.join(AGRICULTURE_COLUMNS)}) FROM STDIN WITH (FORMAT csv, NULL '\\N')\n")
            writer = csv.writer(out, lineterminator="\n")
            for record in iter_json_array(agriculture_path):
                record_hash = hashlib.sha256(json.dumps(record, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")).hexdigest()
                municipality_code = str(record.get("c_digo_dane_municipio") or "").strip()
                divipola = municipality_code.zfill(5) if municipality_code else None
                values = [
                    agriculture_snapshot, record_hash, divipola, record.get("departamento"), record.get("municipio"),
                    number_or_none(record.get("a_o")), record.get("periodo"), record.get("grupo_cultivo"),
                    record.get("subgrupo"), record.get("cultivo"), record.get("desagregaci_n_cultivo"),
                    number_or_none(record.get("c_digo_del_cultivo")), record.get("nombre_cient_fico_del_cultivo"),
                    record.get("ciclo_del_cultivo"), record.get("estado_f_sico_del_cultivo"),
                    number_or_none(record.get("rea_sembrada")), number_or_none(record.get("rea_cosechada")),
                    number_or_none(record.get("producci_n")), number_or_none(record.get("rendimiento")),
                    json_text(record), json_text({"spatial_resolution": "municipality", "economic_loss_label": False}), "real",
                ]
                write_row(writer, values)
                feature_rows += 1
            out.write("\\.\nINSERT INTO territorial.agricultural_production (" + ",".join(AGRICULTURE_COLUMNS) + ") SELECT " + ",".join(AGRICULTURE_COLUMNS) + " FROM _agricultural_production ON CONFLICT (snapshot_id,source_record_id) DO NOTHING;\n")
        out.write("COMMIT;\n")
    agriculture_count = next((s["record_count"] for s in manifest["sources"] if s["source_id"] == "upra_eva_agricultural"), 0)
    spatial_count = feature_rows - agriculture_count
    print(f"Prepared {len(manifest['sources'])} source snapshots, {len(profiles['features'])} profiles, {spatial_count} spatial assets, {agriculture_count} EVA crop rows: {stream_path}")
    if args.dry_run:
        print("DRY_RUN: SQL stream prepared; no SSH connection or DB changes")
        return 0
    if not args.ssh_key.is_file():
        parser.error(f"SSH key not found: {args.ssh_key}")
    command = ["ssh", "-i", str(args.ssh_key), "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", args.ssh_host,
               f"docker exec -i {args.db_container} psql -X -v ON_ERROR_STOP=1 -U {args.db_user} -d {args.database}"]
    with stream_path.open("rb") as stream:
        result = subprocess.run(command, stdin=stream, capture_output=True, check=False)
    if result.stdout:
        print(result.stdout.decode("utf-8", errors="replace")[-3000:])
    if result.returncode:
        print(result.stderr.decode("utf-8", errors="replace")[-3000:], file=sys.stderr)
        return result.returncode
    print("TERRITORIAL_DB_LOAD_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
