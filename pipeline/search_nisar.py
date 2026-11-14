#!/usr/bin/env python3
"""
Busca productos NISAR en el catálogo CMR de NASA (ASF DAAC) para los sitios de sites.json
y, opcionalmente, los descarga.

La búsqueda es pública (no necesita credenciales). Solo la descarga usa Earthdata Login,
con EARTHDATA_USERNAME / EARTHDATA_PASSWORD del .env de la raíz.

  python search_nisar.py                       disponibilidad por sitio y madurez
  python search_nisar.py --list-collections    colecciones NISAR publicadas
  python search_nisar.py --site cdmx-subsidencia --download --limit 8

Colecciones: NISAR_L2_<PRODUCTO>_<MADUREZ>, con madurez BETA_V1, PROVISIONAL_V1 o V1 (validada).
Por defecto se descarga la madurez con más escenas; se puede forzar con --maturity.

Escribe:
  pipeline/data/search-report.json           detalle con nombres de granulos y enlaces
  frontend/public/data/availability.json     resumen que muestra el explorador
"""

from __future__ import annotations

import argparse
import json
import os
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG = ROOT / "sites.json"
DATA = ROOT / "data"
PUBLIC = ROOT.parent / "frontend" / "public" / "data"
CMR = "https://cmr.earthdata.nasa.gov/search"
MATURITIES = ["V1", "PROVISIONAL_V1", "BETA_V1"]
MATURITY_LABEL = {"V1": "VALIDATED", "PROVISIONAL_V1": "PROVISIONAL", "BETA_V1": "BETA"}


def cmr_get(path: str, params: dict):
    url = f"{CMR}/{path}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers={"User-Agent": "saros-nisar-pipeline"})
    with urllib.request.urlopen(request, timeout=90) as response:
        return int(response.headers.get("CMR-Hits", 0)), json.load(response)["feed"]["entry"]


def data_link(entry):
    for link in entry.get("links", []):
        href = link.get("href", "")
        if link.get("rel", "").endswith("/data#") and href.endswith(".h5"):
            return href
    return None


def search_site(site, start, end, limit):
    west, south, east, north = site["bbox"]
    result = {}
    for maturity in MATURITIES:
        short_name = f"NISAR_L2_{site['product']}_{maturity}"
        params = {
            "short_name": short_name,
            "bounding_box": f"{west},{south},{east},{north}",
            "page_size": 2000,
            "sort_key": "-start_date",
        }
        if start or end:
            params["temporal"] = f"{start + 'T00:00:00Z' if start else ''},{end + 'T23:59:59Z' if end else ''}"
        hits, entries = cmr_get("granules.json", params)
        dates = sorted(entry["time_start"][:10] for entry in entries)
        result[maturity] = {
            "shortName": short_name,
            "maturity": MATURITY_LABEL[maturity],
            "count": hits,
            "first": dates[0] if dates else None,
            "last": dates[-1] if dates else None,
            "granules": [{"name": e.get("producer_granule_id") or e.get("title"), "start": e["time_start"], "url": data_link(e)} for e in entries[:limit]],
        }
    return result


def pick_maturity(found, forced):
    if forced:
        return forced
    return max(MATURITIES, key=lambda m: (found[m]["count"], -MATURITIES.index(m)))


def download(site, entry, limit):
    import earthaccess

    earthaccess.login(strategy=os.environ.get("EARTHDATA_AUTH_STRATEGY", "environment"))
    urls = [g["url"] for g in entry["granules"][:limit] if g["url"]]
    target = DATA / site["id"]
    target.mkdir(parents=True, exist_ok=True)
    earthaccess.download(urls, local_path=str(target))
    print(f"   descargados {len(urls)} archivos en {target}")


def load_env():
    env_file = ROOT.parent / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            if value.strip():
                os.environ.setdefault(key.strip(), value.strip())


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--list-collections", action="store_true", help="listar colecciones NISAR en CMR")
    parser.add_argument("--site", help="solo este sitio")
    parser.add_argument("--start", default=None, help="fecha inicial AAAA-MM-DD")
    parser.add_argument("--end", default=None, help="fecha final AAAA-MM-DD")
    parser.add_argument("--maturity", choices=MATURITIES, help="madurez a descargar (por defecto, la que tenga más escenas)")
    parser.add_argument("--limit", type=int, default=12, help="granulos por sitio a listar/descargar")
    parser.add_argument("--download", action="store_true", help="descargar a pipeline/data/<sitio>/ (requiere Earthdata)")
    args = parser.parse_args()
    load_env()

    if args.list_collections:
        _, entries = cmr_get("collections.json", {"keyword": "NISAR", "provider": "ASF", "page_size": 200})
        for c in sorted(entries, key=lambda e: e.get("short_name", "")):
            print(f"{c.get('short_name', '?'):<34} {c.get('title', '')[:90]}")
        return

    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    report, summary = {}, []
    for site in config["sites"]:
        if args.site and site["id"] != args.site:
            continue
        found = search_site(site, args.start, args.end, args.limit)
        chosen = pick_maturity(found, args.maturity)
        report[site["id"]] = {"product": site["product"], "chosen": chosen, "maturities": found}
        counts = "  ".join(f"{MATURITY_LABEL[m]}:{found[m]['count']}" for m in MATURITIES)
        print(f"[{site['id']}] L2 {site['product']}  {counts}  -> {found[chosen]['shortName']}")
        summary.append({
            "id": site["id"],
            "product": site["product"],
            "total": sum(found[m]["count"] for m in MATURITIES),
            "maturities": [{"maturity": found[m]["maturity"], "shortName": found[m]["shortName"], "count": found[m]["count"], "first": found[m]["first"], "last": found[m]["last"]} for m in MATURITIES if found[m]["count"]],
            "latest": next((found[m]["granules"][0]["name"] for m in MATURITIES if found[m]["granules"]), None),
        })
        if args.download:
            download(site, found[chosen], args.limit)

    DATA.mkdir(exist_ok=True)
    (DATA / "search-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    if not args.site:
        PUBLIC.mkdir(parents=True, exist_ok=True)
        (PUBLIC / "availability.json").write_text(json.dumps({
            "checked": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "source": "NASA CMR · ASF DAAC",
            "sites": summary,
        }, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Resumen para el explorador en {PUBLIC / 'availability.json'}")


if __name__ == "__main__":
    main()
