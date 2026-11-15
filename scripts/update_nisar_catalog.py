#!/usr/bin/env python3
"""Append new ASF NISAR GUNW metadata after the SAROS processing checkpoint.

This updates a small GeoJSON catalog only. It never downloads HDF5 data and
does not create observations; downstream processing must validate real rasters.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime
from pathlib import Path
from typing import Any

import asf_search as asf
from dotenv import load_dotenv
from shapely.geometry import shape


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_AOI = ROOT / "data" / "aoi" / "neiva-core.geojson"
DEFAULT_MANIFEST = ROOT / "data" / "filtered" / "neiva-core" / "nisar-gunw.geojson"
SHORT_NAMES = {
    "VALIDATED": "NISAR_L2_GUNW_V1",
    "PROVISIONAL": "NISAR_L2_GUNW_PROVISIONAL_V1",
    "BETA": "NISAR_L2_GUNW_BETA_V1",
}


def request_checkpoint(api_url: str, token: str, aoi_id: str, stack_id: str,
                       processing_version: str) -> dict[str, Any]:
    query = urllib.parse.urlencode({
        "aoi_id": aoi_id,
        "stack_id": stack_id,
        "processing_version": processing_version,
    })
    request = urllib.request.Request(
        f"{api_url.rstrip('/')}/api/v1/nisar/observations/checkpoint?{query}",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        detail = exc.read(2000).decode("utf-8", errors="replace")
        raise RuntimeError(f"SAROS API devolvió HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"No fue posible consultar SAROS API: {exc.reason}") from exc


def parse_product(feature: dict[str, Any], maturity: str, stack_id: str,
                  checkpoint: date) -> tuple[str, date] | None:
    props = feature.get("properties") or {}
    granule_id = str(props.get("fileID") or props.get("fileName") or "")
    fields = granule_id.split("_")
    if len(fields) < 16 or fields[:4] != ["NISAR", "L2", "PR", "GUNW"]:
        return None
    collection = str(props.get("collectionName") or "").upper()
    found_maturity = (
        "PROVISIONAL" if "_PROVISIONAL_" in collection
        else "BETA" if "_BETA_" in collection
        else "VALIDATED" if collection == "NISAR_L2_GUNW_V1"
        else "UNKNOWN"
    )
    if found_maturity != maturity:
        return None
    product_stack = f"{fields[6]}-{fields[5]}-{fields[7]}-{fields[9]}-{fields[10]}"
    if product_stack != stack_id:
        return None
    try:
        secondary_day = datetime.strptime(fields[13][:8], "%Y%m%d").date()
    except ValueError:
        return None
    if secondary_day <= checkpoint:
        return None
    return granule_id, secondary_day


def product_feature(product: Any) -> dict[str, Any] | None:
    feature = product.geojson()
    if feature.get("type") == "FeatureCollection":
        features = feature.get("features", [])
        feature = features[0] if features else None
    if not isinstance(feature, dict) or feature.get("type") != "Feature":
        return None
    return feature


def load_aoi(path: Path, expected_aoi_id: str) -> tuple[str, Any]:
    document = json.loads(path.read_text(encoding="utf-8"))
    features = document.get("features", [])
    feature = next((item for item in features
                    if (item.get("properties") or {}).get("aoi_id") == expected_aoi_id), None)
    if feature is None or not feature.get("geometry"):
        raise ValueError(f"AOI {expected_aoi_id!r} sin geometría en {path}")
    return shape(feature["geometry"]).wkt, shape(feature["geometry"])


def main() -> int:
    load_dotenv(ROOT / ".env")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--aoi-id", default="neiva-core")
    parser.add_argument("--stack-id", required=True, help="Formato D-083-087-2000-SH; debe coincidir con la serie real")
    parser.add_argument("--processing-version", required=True, help="Versión del procesador usada en las observaciones existentes")
    parser.add_argument("--aoi-file", type=Path, default=DEFAULT_AOI)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--maturity", choices=tuple(SHORT_NAMES), default="PROVISIONAL")
    args = parser.parse_args()

    api_url = os.getenv("SAROS_API_URL", "").strip()
    token = os.getenv("SAROS_PREDICTION_TOKEN", "").strip()
    if not api_url or not token:
        parser.error("Configura SAROS_API_URL y SAROS_PREDICTION_TOKEN en el entorno seguro del servidor")
    try:
        checkpoint_info = request_checkpoint(api_url, token, args.aoi_id, args.stack_id,
                                             args.processing_version)
        if not checkpoint_info.get("last_processed_date"):
            raise ValueError(
                "No hay observaciones reales procesadas para esta serie. Primero se requiere una carga inicial validada; "
                "este actualizador incremental no inventa una fecha de checkpoint."
            )
        checkpoint = date.fromisoformat(checkpoint_info["last_processed_date"])
        intersects_wkt, aoi_geometry = load_aoi(args.aoi_file, args.aoi_id)
        query = {
            "dataset": asf.DATASET.NISAR,
            "processingLevel": "GUNW",
            "shortName": SHORT_NAMES[args.maturity],
            "intersectsWith": intersects_wkt,
            "start": checkpoint.isoformat(),  # Inclusive; filter pair secondary dates below.
            "maxResults": 250,
        }
        new_features: dict[str, tuple[date, dict[str, Any]]] = {}
        for page in asf.search_generator(**query):
            for product in page:
                feature = product_feature(product)
                if feature is None or not feature.get("geometry"):
                    continue
                parsed = parse_product(feature, args.maturity, args.stack_id, checkpoint)
                if parsed is None:
                    continue
                granule_id, secondary_day = parsed
                if not shape(feature["geometry"]).intersects(aoi_geometry):
                    continue
                new_features[granule_id] = (secondary_day, feature)

        existing: dict[str, dict[str, Any]] = {}
        if args.manifest.exists():
            previous = json.loads(args.manifest.read_text(encoding="utf-8"))
            for feature in previous.get("features", []):
                props = feature.get("properties") or {}
                key = str(props.get("fileID") or props.get("fileName") or "")
                if key:
                    existing[key] = feature
        merged = {**existing, **{key: pair[1] for key, pair in new_features.items()}}
        ordered = sorted(merged.values(), key=lambda feature: (
            str((feature.get("properties") or {}).get("fileID") or "")))
        document = {
            "type": "FeatureCollection",
            "metadata": {
                "source": "ASF DAAC via asf_search",
                "aoi_id": args.aoi_id,
                "stack_id": args.stack_id,
                "maturity": args.maturity,
                "checkpoint_date": checkpoint.isoformat(),
                "processing_version": args.processing_version,
                "incremental_catalog_only": True,
            },
            "features": ordered,
        }
        args.manifest.parent.mkdir(parents=True, exist_ok=True)
        temporary = args.manifest.with_suffix(args.manifest.suffix + ".tmp")
        temporary.write_text(json.dumps(document, ensure_ascii=False, indent=2, default=str) + "\n", encoding="utf-8")
        temporary.replace(args.manifest)
        print(json.dumps({
            "aoi_id": args.aoi_id,
            "stack_id": args.stack_id,
            "checkpoint_date": checkpoint.isoformat(),
            "new_granules": len(new_features),
            "catalog_features": len(ordered),
            "manifest": str(args.manifest),
            "note": "Solo metadatos ASF. Descargue/procese los HDF5 y persista observaciones reales antes de pronosticar.",
        }, ensure_ascii=False, indent=2))
        return 0
    except Exception as exc:
        print(f"Falló la actualización incremental del catálogo: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
