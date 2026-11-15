#!/usr/bin/env python3
"""Inventory ASF NISAR products intersecting the configured pilot AOI."""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import asf_search as asf
from shapely.geometry import shape
from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_AOI = ROOT / "data" / "aoi" / "neiva-core.geojson"
DEFAULT_LEVELS = ("GUNW", "GCOV", "GOFF", "GSLC", "SME2")


def feature_for_product(product: Any, level: str) -> dict[str, Any] | None:
    feature = product.geojson()
    if feature.get("type") == "FeatureCollection":
        features = feature.get("features", [])
        feature = features[0] if features else None
    if not isinstance(feature, dict) or feature.get("type") != "Feature" or not feature.get("geometry"):
        return None
    properties = feature.setdefault("properties", {})
    properties["saros_processing_level"] = level
    return feature


def get_granule_size(properties: dict[str, Any]) -> int | None:
    size = properties.get("bytes") or {}
    if not isinstance(size, dict):
        return None
    for filename, details in size.items():
        if str(filename).endswith(".h5") and "QA_STATS" not in str(filename):
            value = details.get("bytes") if isinstance(details, dict) else None
            if isinstance(value, int):
                return value
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--aoi", type=Path, default=DEFAULT_AOI)
    parser.add_argument("--levels", nargs="+", default=list(DEFAULT_LEVELS), choices=("GUNW", "GCOV", "GOFF", "GSLC", "SME2"))
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "raw" / "nisar")
    args = parser.parse_args()
    load_dotenv(ROOT / ".env")

    document = json.loads(args.aoi.read_text(encoding="utf-8"))
    features = document.get("features", [])
    if len(features) != 1 or not features[0].get("geometry"):
        parser.error("AOI file must contain exactly one GeoJSON feature with geometry")
    aoi = shape(features[0]["geometry"])
    if aoi.is_empty or not aoi.is_valid:
        parser.error("AOI geometry is empty or invalid")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output_dir = args.output.expanduser().resolve() / stamp
    output_dir.mkdir(parents=True, exist_ok=False)

    catalog: list[dict[str, Any]] = []
    failures: list[dict[str, str]] = []
    for level in args.levels:
        try:
            for page in asf.search_generator(dataset=asf.DATASET.NISAR, processingLevel=level, intersectsWith=aoi.wkt):
                for product in page:
                    feature = feature_for_product(product, level)
                    if feature is None or not shape(feature["geometry"]).intersects(aoi):
                        continue
                    catalog.append(feature)
        except Exception as error:
            failures.append({"processing_level": level, "error": f"{type(error).__name__}: {error}"})

    counts: Counter[str] = Counter()
    collection_counts: Counter[str] = Counter()
    full_sizes: dict[str, int] = defaultdict(int)
    size_counts: Counter[str] = Counter()
    maturity_counts: Counter[str] = Counter()
    for feature in catalog:
        props = feature["properties"]
        level = str(props.get("processingLevel") or props.get("saros_processing_level") or "UNKNOWN")
        collection = str(props.get("collectionName") or props.get("collection") or "UNKNOWN")
        counts[level] += 1
        collection_counts[collection] += 1
        maturity = "VALIDATED" if collection == "NISAR_L2_GUNW_V1" else "PROVISIONAL" if "PROVISIONAL" in collection else "BETA" if "BETA" in collection else "OTHER"
        maturity_counts[f"{level}:{maturity}"] += 1
        size = get_granule_size(props)
        if size is not None:
            full_sizes[level] += size
            size_counts[level] += 1

    catalog_path = output_dir / "catalog.geojson"
    catalog_path.write_text(json.dumps({"type": "FeatureCollection", "features": catalog}, ensure_ascii=False), encoding="utf-8")
    summary = {
        "data_mode": "real_metadata",
        "source": "ASF DAAC Search API via asf_search",
        "retrieved_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "aoi_path": str(args.aoi),
        "aoi_id": (features[0].get("properties") or {}).get("aoi_id"),
        "aoi_bbox_wsen": list(aoi.bounds),
        "processing_levels": list(args.levels),
        "granules_by_level": dict(counts),
        "granules_by_collection": dict(collection_counts),
        "granules_by_level_and_maturity": dict(maturity_counts),
        "estimated_full_hdf5_bytes_by_level": dict(full_sizes),
        "estimated_full_hdf5_gb_by_level": {level: round(value / 1e9, 3) for level, value in full_sizes.items()},
        "granules_with_size_metadata_by_level": dict(size_counts),
        "total_granules": len(catalog),
        "failures": failures,
        "catalog_file": catalog_path.name,
        "note": "This is an AOI inventory only; it does not download granule data. Collections, maturity, tracks and product families remain distinct.",
    }
    (output_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"OUTPUT {output_dir}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
