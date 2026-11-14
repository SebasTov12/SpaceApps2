from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

import earthaccess
from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parents[1]
AMERICAS_BBOX = (-170.0, -60.0, -25.0, 85.0)


def collection_summary(collection: Any) -> dict[str, Any]:
    summary = collection.summary
    if callable(summary):
        summary = summary()
    return summary if isinstance(summary, dict) else {}


def main() -> int:
    load_dotenv(ROOT / ".env")
    parser = argparse.ArgumentParser(
        description="Comprueba Earthdata Login y consulta colecciones/granules NISAR en CMR."
    )
    parser.add_argument(
        "--anonymous",
        action="store_true",
        help="Probar la búsqueda pública de CMR sin autenticar Earthdata Login.",
    )
    parser.add_argument(
        "--short-name",
        default=os.getenv("NISAR_PRODUCT_SHORT_NAME", "").strip(),
        help="Consultar también granules de una colección, por ejemplo NISAR_L2_GCOV_V1.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=10,
        help="Máximo de granules en la consulta de demostración (default: 10).",
    )
    args = parser.parse_args()
    if args.limit < 1:
        parser.error("--limit debe ser mayor que cero")

    authenticated = False
    if not args.anonymous:
        strategy = os.getenv("EARTHDATA_AUTH_STRATEGY", "environment").strip() or "environment"
        try:
            earthaccess.login(strategy=strategy, persist=False)
            authenticated = True
        except Exception as error:
            print(
                "Earthdata Login falló. Comprueba que .env esté en la raíz y tenga "
                "EARTHDATA_USERNAME/EARTHDATA_PASSWORD válidos. No se muestran los valores. "
                f"Detalle: {error}",
                file=sys.stderr,
            )
            return 2

    try:
        collections = earthaccess.search_datasets(keyword="NISAR", count=-1, debug=False)
        nisar_collections = []
        for collection in collections:
            summary = collection_summary(collection)
            short_name = str(summary.get("short-name", ""))
            if short_name.upper().startswith("NISAR"):
                nisar_collections.append(
                    {
                        "short_name": short_name,
                        "concept_id": summary.get("concept-id"),
                        "version": summary.get("version"),
                        "collection": collection,
                    }
                )

        report: dict[str, Any] = {
            "service": "NASA CMR / Earthdata Search catalog",
            "authenticated": authenticated,
            "nisar_collections_found": len(nisar_collections),
            "collections": [
                {key: value for key, value in item.items() if key != "collection"}
                for item in nisar_collections
            ],
        }

        if args.short_name:
            granules = earthaccess.search_data(
                short_name=args.short_name,
                bounding_box=AMERICAS_BBOX,
                count=args.limit,
                debug=False,
            )
            report["granule_query"] = {
                "short_name": args.short_name,
                "americas_bbox_wsen": AMERICAS_BBOX,
                "limit": args.limit,
                "returned": len(granules),
                "granules": [str(granule) for granule in granules],
            }

        print(json.dumps(report, indent=2, ensure_ascii=False, default=str))
        return 0
    except Exception as error:
        print(f"CMR/Earthdata Search query failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
