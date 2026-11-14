from __future__ import annotations

import argparse
import json
import re
import statistics
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "data" / "filtered" / "colombia-ladera" / "03_colombia_bbox.geojson"


def label(value: Any) -> str:
    return str(value) if value is not None else "unknown"


def parse_pair_name(name: str) -> dict[str, str] | None:
    """Parse the documented NISAR pair-product filename fields.

    GUNW names encode cycle, relative orbit, direction, frame, secondary cycle,
    mode and polarization. ASF's search metadata can omit `pathNumber`, so use
    the product identifier rather than grouping unrelated tracks as unknown.
    """
    fields = name.split("_")
    if len(fields) < 15 or fields[:4] != ["NISAR", "L2", "PR", "GUNW"]:
        return None
    return {
        "cycle": fields[4],
        "relative_orbit": fields[5],
        "direction": fields[6],
        "frame": fields[7],
        "secondary_cycle": fields[8],
        "mode": fields[9],
        "polarization": fields[10],
        "reference": fields[11],
        "secondary": fields[13],
    }


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
    stacks: dict[tuple[str, str, str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for product in provisional:
        parsed = parse_pair_name(str(product.get("fileID") or product.get("fileName") or ""))
        if parsed is None:
            continue
        key = (parsed["direction"], parsed["relative_orbit"], parsed["frame"], parsed["mode"], parsed["polarization"])
        stacks[key].append({**product, "_pair": parsed})

    stack_summary = []
    for (direction, relative_orbit, frame, mode, polarization), stack_products in stacks.items():
        pairs = sorted({(p["_pair"]["reference"], p["_pair"]["secondary"]) for p in stack_products})
        date_stamps = {stamp[:8] for pair in pairs for stamp in pair if stamp}
        dates = sorted(f"{stamp[:4]}-{stamp[4:6]}-{stamp[6:8]}" for stamp in date_stamps)
        pair_edges = {(reference[:8], secondary[:8]) for reference, secondary in pairs}
        consecutive_links = sum(1 for _reference, secondary in pair_edges if any(next_reference == secondary for next_reference, _ in pair_edges))
        stack_summary.append(
            {
                "flight_direction": direction,
                "relative_orbit": relative_orbit,
                "frame_number": frame,
                "mode": mode,
                "polarization": polarization,
                "product_count": len(stack_products),
                "distinct_pairs": len(pair_edges),
                "consecutive_pair_links": consecutive_links,
                "unique_acquisition_dates": len(dates),
                "first_date": dates[0] if dates else None,
                "last_date": dates[-1] if dates else None,
                "sample_pairs": [
                    {"reference": f"{reference[:4]}-{reference[4:6]}-{reference[6:8]}",
                     "secondary": f"{secondary[:4]}-{secondary[4:6]}-{secondary[6:8]}"}
                    for reference, secondary in pairs[:4]
                ],
                "sample_products": sorted(product.get("fileID", "") for product in stack_products)[:4],
            }
        )
    stack_summary.sort(key=lambda item: (-item["consecutive_pair_links"], -item["product_count"], item["flight_direction"], item["relative_orbit"]))

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
            "stacks_with_consecutive_pairs": sum(stack["consecutive_pair_links"] > 0 for stack in stack_summary),
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
