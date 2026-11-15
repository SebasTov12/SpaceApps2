#!/usr/bin/env python3
"""Download a short, geometry- and maturity-consistent chain of NISAR GUNW granules."""

from __future__ import annotations

import argparse
import json
import os
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = ROOT / "data" / "filtered" / "colombia-ladera" / "03_colombia_bbox.geojson"
DEFAULT_OUTPUT = ROOT / "pipeline" / "data" / "colombia-ladera"


def parse_pair(product: dict[str, Any], requested_maturity: str) -> dict[str, Any] | None:
    """Parse NISAR pair-product ID fields documented by ASF."""
    granule_id = str(product.get("fileID") or product.get("fileName") or "")
    fields = granule_id.split("_")
    if len(fields) < 16 or fields[:4] != ["NISAR", "L2", "PR", "GUNW"]:
        return None
    collection = str(product.get("collectionName") or "")
    collection_upper = collection.upper()
    if "_PROVISIONAL_" in collection_upper:
        maturity = "PROVISIONAL"
    elif "_BETA_" in collection_upper:
        maturity = "BETA"
    elif collection_upper == "NISAR_L2_GUNW_V1":
        maturity = "VALIDATED"
    else:
        maturity = "UNKNOWN"
    if maturity != requested_maturity:
        return None

    size_bytes = None
    for filename, metadata in (product.get("bytes") or {}).items():
        if filename.endswith(".h5") and not filename.endswith("_QA_STATS.h5"):
            candidate = metadata.get("bytes")
            if isinstance(candidate, int):
                size_bytes = candidate
            break
    return {
        "id": granule_id,
        "collection": collection,
        "maturity": maturity,
        "processing_release": fields[15],
        "cycle": fields[4],
        "relative_orbit": fields[5],
        "direction": fields[6],
        "frame": fields[7],
        "secondary_cycle": fields[8],
        "mode": fields[9],
        "polarization": fields[10],
        "reference": fields[11],
        "secondary": fields[13],
        "size_bytes": size_bytes,
    }


def longest_chain(products: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_reference: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for product in products:
        by_reference[product["reference"]].append(product)
    for items in by_reference.values():
        items.sort(key=lambda item: item["id"])

    memo: dict[str, list[dict[str, Any]]] = {}

    def best_from(reference: str) -> list[dict[str, Any]]:
        if reference in memo:
            return memo[reference]
        candidates = by_reference.get(reference, [])
        if not candidates:
            return []
        best: list[dict[str, Any]] = []
        for product in candidates:
            chain = [product] + best_from(product["secondary"])
            if len(chain) > len(best):
                best = chain
        memo[reference] = best
        return best

    starts = sorted(set(by_reference) - {item["secondary"] for item in products})
    chains = [best_from(start) for start in starts] or [best_from(start) for start in by_reference]
    return max(chains, key=lambda chain: (len(chain), -sum(item["size_bytes"] or 0 for item in chain)))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST, help="GeoJSON generado por filter_nisar_colombia.py")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Directorio donde quedan los HDF5 reales")
    parser.add_argument("--products", type=int, default=2, help="Cantidad mínima de interferogramas consecutivos a descargar")
    parser.add_argument("--maturity", choices=("PROVISIONAL", "BETA", "VALIDATED"), default="PROVISIONAL", help="Madurez de colección; nunca se mezclan madureces")
    parser.add_argument("--dry-run", action="store_true", help="Mostrar el par elegido y tamaño estimado sin autenticarse ni descargar")
    args = parser.parse_args()
    if args.products < 1:
        parser.error("--products debe ser mayor que cero")
    if not args.manifest.is_file():
        parser.error(f"No existe el catálogo filtrado: {args.manifest}")

    document = json.loads(args.manifest.read_text(encoding="utf-8"))
    groups: dict[tuple[str, ...], list[dict[str, Any]]] = defaultdict(list)
    for feature in document.get("features", []):
        product = parse_pair(feature.get("properties") or {}, args.maturity)
        if product is None:
            continue
        key = (
            product["direction"], product["relative_orbit"], product["frame"],
            product["mode"], product["polarization"], product["maturity"],
            product["processing_release"],
        )
        groups[key].append(product)

    candidates = [longest_chain(products) for products in groups.values()]
    candidates = [chain for chain in candidates if len(chain) >= args.products]
    if not candidates:
        raise SystemExit(
            f"No hay una cadena GUNW {args.maturity} de {args.products} pares "
            f"consecutivos y un mismo CRID en {args.manifest}"
        )
    selected = max(candidates, key=lambda chain: (len(chain), -sum(item["size_bytes"] or 0 for item in chain)))[:args.products]
    total_bytes = sum(item["size_bytes"] or 0 for item in selected)
    first = selected[0]
    geometry = {
        "direction": first["direction"],
        "relative_orbit": first["relative_orbit"],
        "frame": first["frame"],
        "mode": first["mode"],
        "polarization": first["polarization"],
        "maturity": first["maturity"],
        "processing_release": first["processing_release"],
    }
    print(json.dumps({
        "mode": "dry-run" if args.dry_run else "download",
        "collection": first["collection"],
        "maturity": first["maturity"],
        "processing_release": first["processing_release"],
        "geometry": geometry,
        "estimated_total_gb": round(total_bytes / 1e9, 3),
        "granules": [{"id": item["id"], "reference": item["reference"], "secondary": item["secondary"], "estimated_bytes": item["size_bytes"]} for item in selected],
    }, indent=2))
    if args.dry_run:
        return 0

    username = os.getenv("EARTHDATA_USERNAME", "").strip()
    password = os.getenv("EARTHDATA_PASSWORD", "").strip()
    if not username or not password:
        raise SystemExit("Falta configurar EARTHDATA_USERNAME y EARTHDATA_PASSWORD en el .env del servidor; los usuarios DIAN/NASA de PostgreSQL no son el login Earthdata.")

    import earthaccess

    earthaccess.login(strategy=os.getenv("EARTHDATA_AUTH_STRATEGY", "environment"), persist=False)
    args.output.mkdir(parents=True, exist_ok=True)
    downloaded: list[str] = []
    for item in selected:
        expected = args.output / f"{item['id']}.h5"
        if expected.exists():
            if item["size_bytes"] is not None and expected.stat().st_size != item["size_bytes"]:
                raise SystemExit(f"Ya existe un archivo con tamaño distinto; se conserva sin tocar: {expected}")
            downloaded.append(str(expected))
            continue
        results = earthaccess.search_data(short_name=item["collection"], granule_name=item["id"], count=5)
        if len(results) != 1:
            raise SystemExit(f"CMR devolvió {len(results)} resultados para un nombre exacto; se cancela la descarga: {item['id']}")
        files = earthaccess.download(results, local_path=str(args.output), show_progress=True)
        downloaded.extend(str(path) for path in files)

    manifest = {
        "mode": "real",
        "source": "NASA-ISRO NISAR / ASF DAAC",
        "collection": first["collection"],
        "maturity": first["maturity"],
        "processing_release": first["processing_release"],
        "geometry": geometry,
        "downloaded_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "files": downloaded,
        "granules": [{"id": item["id"], "reference": item["reference"], "secondary": item["secondary"], "estimated_bytes": item["size_bytes"]} for item in selected],
        "note": "Granules interferométricos reales; no son etiquetas de entrenamiento ni alertas validadas.",
    }
    manifest_path = args.output / "download-manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Manifest de descarga guardado en {manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
