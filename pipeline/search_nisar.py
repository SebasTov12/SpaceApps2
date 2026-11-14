#!/usr/bin/env python3
"""
Busca (y opcionalmente descarga) productos NISAR de ASF DAAC para los sitios de sites.json.

Usa Earthdata Login con las variables del .env de la raíz (EARTHDATA_USERNAME / EARTHDATA_PASSWORD).

  python search_nisar.py --list-collections          lista colecciones NISAR y sus short names
  python search_nisar.py                             busca granulos por sitio y producto
  python search_nisar.py --site cdmx-subsidencia --download --limit 8

Los short names de cada producto se configuran con variables de entorno, porque ASF los publica
por colección y madurez (BETA, PROVISIONAL, VALIDATED):
  NISAR_SHORT_NAME_GUNW, NISAR_SHORT_NAME_GCOV, NISAR_SHORT_NAME_GOFF
Si una no está definida se usa NISAR_PRODUCT_SHORT_NAME. Ejecuta --list-collections para elegirlos.

Las descargas quedan en pipeline/data/<sitio>/ y build_layers.py --real las procesa.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG = ROOT / "sites.json"
DATA = ROOT / "data"


def load_env():
    env_file = ROOT.parent / ".env"
    try:
        from dotenv import load_dotenv
        load_dotenv(env_file)
    except ImportError:
        if env_file.exists():
            for line in env_file.read_text(encoding="utf-8").splitlines():
                if "=" in line and not line.lstrip().startswith("#"):
                    key, value = line.split("=", 1)
                    os.environ.setdefault(key.strip(), value.strip())


def short_name_for(product: str) -> str | None:
    return os.environ.get(f"NISAR_SHORT_NAME_{product}") or os.environ.get("NISAR_PRODUCT_SHORT_NAME") or None


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--list-collections", action="store_true", help="listar colecciones NISAR disponibles en CMR")
    parser.add_argument("--site", help="solo este sitio")
    parser.add_argument("--start", default=os.environ.get("NISAR_START_DATE") or None, help="fecha inicial AAAA-MM-DD")
    parser.add_argument("--end", default=os.environ.get("NISAR_END_DATE") or None, help="fecha final AAAA-MM-DD")
    parser.add_argument("--limit", type=int, default=20, help="máximo de granulos por sitio")
    parser.add_argument("--download", action="store_true", help="descargar a pipeline/data/<sitio>/")
    args = parser.parse_args()

    load_env()
    import earthaccess

    earthaccess.login(strategy=os.environ.get("EARTHDATA_AUTH_STRATEGY", "environment"))

    if args.list_collections:
        for collection in earthaccess.search_datasets(keyword="NISAR", count=200):
            umm = collection["umm"]
            print(f"{umm.get('ShortName', '?'):<45} {umm.get('Version', ''):<8} {umm.get('EntryTitle', '')}")
        return

    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    config_dates = config["dates"]
    start = args.start or config_dates[0]
    end = args.end or config_dates[-1]
    report = {}
    for site in config["sites"]:
        if args.site and site["id"] != args.site:
            continue
        short_name = short_name_for(site["product"])
        if not short_name:
            print(f"[{site['id']}] Falta NISAR_SHORT_NAME_{site['product']} (usa --list-collections)")
            continue
        results = earthaccess.search_data(
            short_name=short_name,
            bounding_box=tuple(site["bbox"]),
            temporal=(start, end),
            count=args.limit,
        )
        names = [granule["meta"]["native-id"] for granule in results]
        report[site["id"]] = {"product": site["product"], "short_name": short_name, "granules": names}
        print(f"[{site['id']}] {short_name}: {len(results)} granulos entre {start} y {end}")
        for name in names:
            print(f"   {name}")
        if args.download and results:
            target = DATA / site["id"]
            target.mkdir(parents=True, exist_ok=True)
            earthaccess.download(results, local_path=str(target))

    DATA.mkdir(exist_ok=True)
    (DATA / "search-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Reporte en {DATA / 'search-report.json'}")


if __name__ == "__main__":
    main()
