#!/usr/bin/env python3
"""Verify Harmony outputs and package COGs plus an idempotent PostgreSQL registry load."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import subprocess
import sys
import tarfile
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
COLUMNS = (
    "granule_name", "variable", "collection", "storage_uri", "file_name", "sha256", "byte_size",
    "width", "height", "dtype", "crs", "units", "transform", "bounds", "valid_pixel_count",
    "valid_fraction", "statistics", "inspected_metadata", "data_mode",
)


def json_text(value: Any) -> str | None:
    return None if value is None else json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--export-root", type=Path, default=None)
    parser.add_argument("--storage-root", default="/home/admin/spaceapps2/data/nisar")
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args()
    if args.export_root:
        export_root = args.export_root.expanduser().resolve()
    else:
        roots = sorted(path for path in (ROOT / "data/raw/nisar").glob("harmony-stack-*") if (path / "stack-export-summary.json").is_file())
        if not roots:
            parser.error("No completed harmony-stack export found")
        # Use latest complete retry run, together with the first run that contains the successful GUNW series.
        export_root = roots[-1]
    if args.output:
        output_dir = args.output.expanduser().resolve()
    else:
        output_dir = ROOT / "data/processed/nisar" / ("verified-" + export_root.name)
    output_dir.mkdir(parents=True, exist_ok=True)
    run_id = "nisar-pilot-" + export_root.name.removeprefix("harmony-stack-")
    remote_root = args.storage_root.rstrip("/") + "/" + run_id

    # Package every successful verified stack run. By default include the earlier GUNW run as well.
    manifest_paths = []
    if args.export_root is None:
        for root in sorted((ROOT / "data/raw/nisar").glob("harmony-stack-*")):
            manifest_paths.extend(root.rglob("harmony-manifest.json"))
    else:
        manifest_paths = list(export_root.rglob("harmony-manifest.json"))
    manifest_paths = sorted(set(path.resolve() for path in manifest_paths))
    if not manifest_paths:
        parser.error(f"No successful Harmony manifests under {export_root}")

    sql_path = output_dir / "register_nisar_rasters.psql.sql"
    archive_path = output_dir / "nisar-cogs.tar.gz"
    package_records: list[dict[str, Any]] = []
    summary: dict[str, Any] = {"run_id": run_id, "export_roots": [], "manifests": 0, "verified_cogs": 0,
                               "missing_pairs": [], "all_nodata_assets": [], "total_bytes": 0}
    with tarfile.open(archive_path, "w:gz", compresslevel=6) as archive:
        for manifest_path in manifest_paths:
            inspect = subprocess.run([sys.executable, str(ROOT / "scripts/inspect_nisar_harmony_cogs.py"), str(manifest_path)],
                                     capture_output=True, text=True, check=False)
            if inspect.returncode:
                raise RuntimeError(f"COG inspection failed for {manifest_path}: {inspect.stderr[-2000:]}")
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            inventory_path = manifest_path.with_name("cog-inventory.json")
            inventory = json.loads(inventory_path.read_text(encoding="utf-8"))
            summary["manifests"] += 1
            summary["missing_pairs"].extend(manifest.get("missing_pairs", []))
            summary["export_roots"].append(str(manifest_path.parents[2]))
            if len(manifest["outputs"]) != len(inventory["layers"]):
                raise ValueError(f"Inventory/manifest layer count mismatch: {manifest_path}")
            for output, layer in zip(manifest["outputs"], inventory["layers"]):
                identity = (output.get("granule_name", manifest.get("granule_name")), output["variable"])
                path = Path(layer["path"]).resolve()
                digest = sha256_file(path)
                if digest != layer["sha256"] or digest != output["sha256"]:
                    raise ValueError(f"Checksum mismatch: {path}")
                relative = Path("nisar") / run_id / manifest["collection"] / manifest_path.parent.name / path.name
                archive.add(path, arcname=relative.as_posix(), recursive=False)
                archive.add(manifest_path, arcname=(relative.parent / "harmony-manifest.json").as_posix(), recursive=False)
                archive.add(inventory_path, arcname=(relative.parent / "cog-inventory.json").as_posix(), recursive=False)
                summary["verified_cogs"] += 1
                summary["total_bytes"] += path.stat().st_size
                if layer.get("valid_pixel_count") == 0:
                    summary["all_nodata_assets"].append({"granule_name": identity[0], "variable": identity[1], "path": str(path)})
                units = output.get("metadata", {}).get("units")
                if units is None and layer.get("units"):
                    units = layer["units"][0]
                package_records.append({
                    "granule_name": identity[0], "variable": identity[1], "collection": manifest["collection"],
                    "storage_uri": "file://" + remote_root + "/" + relative.relative_to(Path("nisar") / run_id).as_posix(),
                    "file_name": path.name, "sha256": digest, "byte_size": path.stat().st_size,
                    "width": layer["width"], "height": layer["height"], "dtype": layer["dtype"],
                    "crs": layer["crs"], "units": units, "transform": layer["transform"], "bounds": layer["bounds"],
                    "valid_pixel_count": layer["valid_pixel_count"], "valid_fraction": layer["valid_fraction"],
                    "statistics": {key: layer[key] for key in ("minimum", "maximum", "mean", "standard_deviation")},
                    "inspected_metadata": {key: layer.get(key) for key in ("driver", "resolution", "nodata", "descriptions", "dataset_tags", "band_tags", "quality_status")},
                    "data_mode": "real",
                })

    # Deduplicate repeated manifests in overlapping run roots by granule, variable and checksum.
    unique: dict[tuple[str, str, str], dict[str, Any]] = {}
    for record in package_records:
        unique[(record["granule_name"], record["variable"], record["sha256"])] = record
    package_records = list(unique.values())
    with sql_path.open("w", encoding="utf-8", newline="\n") as output:
        output.write("\\set ON_ERROR_STOP on\nBEGIN;\n")
        output.write("CREATE TEMP TABLE _nisar_raster_assets AS SELECT * FROM nisar.raster_assets WITH NO DATA;\n")
        output.write(f"\\copy _nisar_raster_assets ({', '.join(COLUMNS)}) FROM STDIN WITH (FORMAT csv, NULL '\\N')\n")
        writer = csv.writer(output, lineterminator="\n")
        for row in package_records:
            writer.writerow(["\\N" if row.get(column) is None else row.get(column) if not isinstance(row.get(column), (dict, list)) else json_text(row[column]) for column in COLUMNS])
        output.write("\\.\n")
        output.write(f"INSERT INTO nisar.raster_assets ({', '.join(COLUMNS)}) SELECT {', '.join(COLUMNS)} FROM _nisar_raster_assets ON CONFLICT (granule_name, variable, sha256) DO NOTHING;\nCOMMIT;\n")

    summary["verified_cogs"] = len(package_records)
    summary["catalog_records_required"] = len({item["granule_name"] for item in package_records})
    summary["missing_pair_count"] = len(summary["missing_pairs"])
    summary_path = output_dir / "package-summary.json"
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"summary": str(summary_path), "archive": str(archive_path), "sql": str(sql_path),
                      "cogs": summary["verified_cogs"], "archive_bytes": archive_path.stat().st_size,
                      "missing_pairs": summary["missing_pair_count"], "all_nodata": len(summary["all_nodata_assets"])}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
