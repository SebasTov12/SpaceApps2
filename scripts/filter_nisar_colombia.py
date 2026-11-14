from __future__ import annotations

import argparse
import json
import os
import sys
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import asf_search as asf
from dotenv import load_dotenv
from shapely.geometry import box, shape


ROOT = Path(__file__).resolve().parents[1]
AMERICAS_BBOX = (-170.0, -60.0, -25.0, 85.0)  # west, south, east, north
DEFAULT_COLOMBIA_BBOX = (-82.5, -5.0, -66.5, 14.0)


class GeoJSONFeatureWriter:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.file = None
        self.count = 0

    def __enter__(self) -> GeoJSONFeatureWriter:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.file = self.path.open("w", encoding="utf-8", newline="\n")
        self.file.write('{"type":"FeatureCollection","features":[\n')
        return self

    def write(self, feature: dict[str, Any]) -> None:
        assert self.file is not None
        if self.count:
            self.file.write(",\n")
        json.dump(feature, self.file, ensure_ascii=False, default=str)
        self.count += 1

    def __exit__(self, exc_type: Any, exc: Any, traceback: Any) -> None:
        if self.file is not None:
            self.file.write("\n]}\n")
            self.file.close()


def parse_bbox(value: str) -> tuple[float, float, float, float]:
    try:
        coordinates = tuple(float(item.strip()) for item in value.split(","))
    except ValueError as error:
        raise argparse.ArgumentTypeError("bbox debe ser oeste,sur,este,norte") from error
    if len(coordinates) != 4:
        raise argparse.ArgumentTypeError("bbox debe tener 4 coordenadas: oeste,sur,este,norte")
    west, south, east, north = coordinates
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise argparse.ArgumentTypeError("bbox fuera de rango o con límites invertidos")
    return west, south, east, north


def feature_from_product(product: Any) -> dict[str, Any] | None:
    feature = product.geojson()
    if feature.get("type") == "FeatureCollection":
        features = feature.get("features", [])
        return features[0] if features else None
    if feature.get("type") == "Feature":
        return feature
    return None


def search_query(args: argparse.Namespace) -> dict[str, Any]:
    query: dict[str, Any] = {"dataset": asf.DATASET.NISAR}
    processing_level = os.getenv("NISAR_PROCESSING_LEVEL", "GUNW").strip()
    if processing_level:
        query["processingLevel"] = processing_level
    short_name = os.getenv("NISAR_PRODUCT_SHORT_NAME", "").strip()
    maturity = os.getenv("NISAR_DATA_MATURITY", "").strip()
    start = os.getenv("NISAR_START_DATE", "").strip()
    end = os.getenv("NISAR_END_DATE", "").strip()
    if short_name:
        query["shortName"] = short_name
    if maturity:
        query["dataMaturity"] = maturity
    if start:
        query["start"] = start
    if end:
        query["end"] = end
    return query


def search_products(query: dict[str, Any], max_results: int | None = None) -> Iterator[Any]:
    if max_results is not None:
        query = {**query, "maxResults": max_results}

    for page in asf.search_generator(**query):
        yield from page


def main() -> int:
    load_dotenv(ROOT / ".env")
    parser = argparse.ArgumentParser(
        description=(
            "Cuenta huellas NISAR en ASF por etapas y guarda los productos "
            "que intersectan la caja de Colombia. No descarga los rásteres."
        )
    )
    parser.add_argument(
        "--max-results",
        type=int,
        help="Límite opcional de productos colombianos guardados; los conteos del catálogo siguen siendo completos.",
    )
    parser.add_argument(
        "--colombia-bbox",
        type=parse_bbox,
        default=parse_bbox(os.getenv("NISAR_COLOMBIA_BBOX", ",".join(map(str, DEFAULT_COLOMBIA_BBOX)))),
        help="Caja oeste,sur,este,norte. Sobrescribe NISAR_COLOMBIA_BBOX del .env.",
    )
    args = parser.parse_args()
    if args.max_results is not None and args.max_results < 1:
        parser.error("--max-results debe ser mayor que cero")

    output_dir = Path(os.getenv("NISAR_FILTERED_DIR", "./data/filtered"))
    if not output_dir.is_absolute():
        output_dir = ROOT / output_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    colombia = box(*args.colombia_bbox)
    base_query = search_query(args)
    america_query = {**base_query, "intersectsWith": box(*AMERICAS_BBOX).wkt}
    colombia_query = {**base_query, "intersectsWith": colombia.wkt}
    counts = {
        "nisar_product_level": 0,
        "americas_bbox": 0,
        "colombia_bbox": 0,
        "colombia_features_saved": 0,
        "colombia_without_geometry": 0,
    }
    colombia_path = output_dir / "03_colombia_bbox.geojson"

    try:
        # Counts are calculated server-side, so --max-results never turns them into sample counts.
        counts["nisar_product_level"] = asf.search_count(**base_query)
        counts["americas_bbox"] = asf.search_count(**america_query)
        counts["colombia_bbox"] = asf.search_count(**colombia_query)

        with GeoJSONFeatureWriter(colombia_path) as colombia_writer:
            for product in search_products(colombia_query, args.max_results):
                feature = feature_from_product(product)
                if feature is None or not feature.get("geometry"):
                    counts["colombia_without_geometry"] += 1
                    continue
                try:
                    footprint = shape(feature["geometry"])
                except (TypeError, ValueError):
                    counts["colombia_without_geometry"] += 1
                    continue
                if not footprint.intersects(colombia):
                    continue
                colombia_writer.write(feature)
                counts["colombia_features_saved"] += 1
    except Exception as error:
        print(f"Falló la búsqueda ASF: {error}", file=sys.stderr)
        return 1

    summary = {
        "query": "ASF Search API, dataset=NISAR",
        "filters": {
            "processing_level": os.getenv("NISAR_PROCESSING_LEVEL", "GUNW").strip() or None,
            "americas_bbox_wsen": AMERICAS_BBOX,
            "colombia_bbox_wsen": args.colombia_bbox,
            "product_short_name": os.getenv("NISAR_PRODUCT_SHORT_NAME") or None,
            "data_maturity": os.getenv("NISAR_DATA_MATURITY") or None,
            "start": os.getenv("NISAR_START_DATE") or None,
            "end": os.getenv("NISAR_END_DATE") or None,
        },
        "counts": counts,
        "saved_limit": args.max_results,
        "files": [str(colombia_path)],
        "note": "Los conteos son completos del catálogo. Colombia se aproxima con una caja envolvente; incluye zonas de países vecinos.",
    }
    summary_path = output_dir / "00_summary.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
