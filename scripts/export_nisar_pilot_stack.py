#!/usr/bin/env python3
"""Export selected AOI-clipped layers for every supported NISAR pilot granule."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LAYERS = {
    "NISAR_L2_GUNW_PROVISIONAL_V1": [
        "/science/LSAR/GUNW/grids/frequencyA/unwrappedInterferogram/HH/unwrappedPhase",
        "/science/LSAR/GUNW/grids/frequencyA/unwrappedInterferogram/HH/coherenceMagnitude",
        "/science/LSAR/GUNW/grids/frequencyA/unwrappedInterferogram/HH/connectedComponents",
        "/science/LSAR/GUNW/grids/frequencyA/unwrappedInterferogram/mask",
    ],
    "NISAR_L2_GCOV_PROVISIONAL_V1": [
        "/science/LSAR/GCOV/grids/frequencyA/HHHH",
        "/science/LSAR/GCOV/grids/frequencyA/HVHV",
        "/science/LSAR/GCOV/grids/frequencyA/mask",
        "/science/LSAR/GCOV/grids/frequencyA/numberOfLooks",
    ],
    "NISAR_L3_SME2_PROVISIONAL_V1": [
        "/science/LSAR/SME2/grids/soilMoisture",
        "/science/LSAR/SME2/grids/soilMoistureUncertainty",
        "/science/LSAR/SME2/grids/retrievalQualityFlag",
        "/science/LSAR/SME2/grids/surfaceQualityFlag",
    ],
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, default=None)
    parser.add_argument("--bbox", default="-75.34,2.88,-75.24,2.98")
    parser.add_argument("--batch-size", type=int, default=3)
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument("--retry-summary", type=Path, default=None,
                        help="Retry only granules listed in a previous stack-export-summary.json failure list")
    args = parser.parse_args()
    if args.batch_size < 1:
        parser.error("--batch-size must be positive")
    if args.catalog:
        catalog_path = args.catalog.expanduser().resolve()
    else:
        catalog_candidates = sorted((ROOT / "data/raw/nisar").glob("*/catalog.geojson"))
        if not catalog_candidates:
            parser.error("No NISAR catalog found")
        catalog_path = catalog_candidates[-1]
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    output_root = args.output or (ROOT / "data/raw/nisar" / ("harmony-stack-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")))
    output_root = output_root.expanduser().resolve()
    output_root.mkdir(parents=True, exist_ok=False)

    grouped: dict[str, list[str]] = {collection: [] for collection in LAYERS}
    if args.retry_summary:
        previous = json.loads(args.retry_summary.expanduser().resolve().read_text(encoding="utf-8"))
        for failure in previous.get("failures", []):
            collection = failure.get("collection")
            if collection in grouped:
                grouped[collection].extend(failure.get("granules", []))
        grouped = {collection: list(dict.fromkeys(names)) for collection, names in grouped.items()}
    else:
        for feature in catalog["features"]:
            props = feature["properties"]
            collection = props.get("collectionName")
            granule = props.get("fileID")
            if collection in grouped and granule:
                grouped[collection].append(granule)

    manifest = {"data_mode": "real", "catalog": str(catalog_path), "requested_bbox_wgs84": args.bbox,
                "selection": LAYERS, "outputs": [], "failures": [], "started_at": datetime.now(timezone.utc).isoformat()}
    script = ROOT / "scripts" / "export_nisar_harmony.py"
    for collection, granules in grouped.items():
        for batch_number, start in enumerate(range(0, len(granules), args.batch_size), start=1):
            batch = granules[start:start + args.batch_size]
            batch_dir = output_root / collection / f"batch-{batch_number:03d}"
            batch_dir.mkdir(parents=True, exist_ok=False)
            command = [sys.executable, str(script), "--collection", collection, "--bbox=" + args.bbox,
                       "--output", str(batch_dir)]
            for granule in batch:
                command.extend(("--granule-name", granule))
            for variable in LAYERS[collection]:
                command.extend(("--variable", variable))
            print(f"EXPORT {collection} batch={batch_number} granules={len(batch)}", flush=True)
            result = subprocess.run(command, text=True, capture_output=True, check=False)
            if result.stdout:
                print(result.stdout[-2500:], flush=True)
            if result.returncode:
                manifest["failures"].append({"collection": collection, "batch": batch_number,
                                               "granules": batch, "return_code": result.returncode,
                                               "stderr": result.stderr[-4000:]})
                print(result.stderr[-2500:], file=sys.stderr, flush=True)
                # Continue with other batches so partial successful data remain useful.
                continue
            output_manifest = json.loads((batch_dir / "harmony-manifest.json").read_text(encoding="utf-8"))
            manifest["outputs"].append({"collection": collection, "batch": batch_number,
                                         "manifest": str(batch_dir / "harmony-manifest.json"),
                                         "granule_count": len(batch), "cog_count": len(output_manifest["outputs"])})
    manifest["finished_at"] = datetime.now(timezone.utc).isoformat()
    summary_path = output_root / "stack-export-summary.json"
    summary_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"SUMMARY {summary_path}", flush=True)
    print(f"BATCHES_OK {len(manifest['outputs'])} FAILED {len(manifest['failures'])}", flush=True)
    return 1 if manifest["failures"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
