from __future__ import annotations

import argparse
import json
import statistics
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "data" / "filtered" / "colombia-ladera" / "03_colombia_bbox.geojson"


def label(value: Any) -> str:
    return str(value) if value is not None else "unknown"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Resume metadatos, madurez, geometrías y pares temporales de candidatos GUNW."
    )
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="GeoJSON de productos filtrados.")
    parser.add_argument("--output", type=Path, help="Ruta JSON de salida (por defecto, junto al GeoJSON).")
    args = parser.parse_args()

    document = json.loads(args.input.read_text(encoding="utf-8"))
    features = document.get("features", [])
    products = [feature.get("properties", {}) for feature in features]
    counts_by_collection = Counter(label(product.get("collectionName")) for product in products)
    counts_by_configuration = Counter(label(product.get("productionConfiguration")) for product in products)
    counts_by_direction = Counter(label(product.get("flightDirection")) for product in products)

    provisional = [
        product for product in products
        if "PROVISIONAL" in str(product.get("collectionName", "")).upper()
    ]
    stacks: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for product in provisional:
        key = (
            label(product.get("flightDirection")),
            label(product.get("pathNumber")),
            label(product.get("frameNumber")),
        )
        stacks[key].append(product)

    stack_summary = []
    for (direction, path, frame), stack_products in stacks.items():
        dates = sorted(
            {
                str(product.get(field, ""))[:10]
                for product in stack_products
                for field in ("startTime", "stopTime")
                if product.get(field)
            }
        )
        stack_summary.append(
            {
                "flight_direction": direction,
                "path_number": path,
                "frame_number": frame,
                "product_count": len(stack_products),
                "unique_acquisition_dates": len(dates),
                "first_date": dates[0] if dates else None,
                "last_date": dates[-1] if dates else None,
                "products": sorted(product.get("fileID", "") for product in stack_products),
            }
        )
    stack_summary.sort(key=lambda item: (-item["product_count"], item["flight_direction"], item["path_number"]))

    hdf5_sizes = []
    for product in provisional:
        for filename, metadata in (product.get("bytes") or {}).items():
            if filename.endswith(".h5") and not filename.endswith("_QA_STATS.h5"):
                size = metadata.get("bytes")
                if isinstance(size, int):
                    hdf5_sizes.append(size)
                break

    times = [product[field] for product in products for field in ("startTime", "stopTime") if product.get(field)]
    summary = {
        "input": str(args.input),
        "product": "NISAR L2 GUNW",
        "total_products": len(products),
        "collection_counts": dict(counts_by_collection),
        "production_configuration_counts": dict(counts_by_configuration),
        "flight_direction_counts": dict(counts_by_direction),
        "catalog_time_span_utc": {"first": min(times) if times else None, "last": max(times) if times else None},
        "provisional": {
            "products": len(provisional),
            "stack_count": len(stack_summary),
            "stacks_with_multiple_products": sum(stack["product_count"] >= 2 for stack in stack_summary),
            "largest_stacks": stack_summary[:20],
            "primary_hdf5_size_gb": {
                "count": len(hdf5_sizes),
                "median": round(statistics.median(hdf5_sizes) / 1e9, 3) if hdf5_sizes else None,
                "min": round(min(hdf5_sizes) / 1e9, 3) if hdf5_sizes else None,
                "max": round(max(hdf5_sizes) / 1e9, 3) if hdf5_sizes else None,
                "total": round(sum(hdf5_sizes) / 1e9, 3) if hdf5_sizes else None,
            },
        },
        "caveat": "Catálogo y pares temporales únicamente; esto no es validación de calidad científica ni etiquetas de entrenamiento.",
    }
    output = args.output or args.input.with_name("01_analysis.json")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    print(f"Análisis guardado en: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
