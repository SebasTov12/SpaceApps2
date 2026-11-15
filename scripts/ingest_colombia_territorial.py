#!/usr/bin/env python3
"""Download and harmonize nationwide Colombian territorial exposure inputs.

Outputs are real-source snapshots under data/raw/territorial-colombia and
data/processed/territorial-colombia (both gitignored). The national profile is
municipality-level; source years, nulls, geometry and lineage are preserved.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    "dane_mgn2018_municipalities": "https://portalgis.dane.gov.co/mparcgis/rest/services/MGN2018/Serv_CapaMunicipiosInt_2018/MapServer/0",
    "dane_housing_deficit_2018": "https://portalgis.dane.gov.co/mparcgis/rest/services/INDICADORES_COND_DE_VIDA/Serv_Mpios_DH_DeficitHabitacional_2018/MapServer/4",
    "dane_ipm_2018": "https://portalgis.dane.gov.co/mparcgis/rest/services/INDICADORES_COND_DE_VIDA/Serv_Mpios_IndPobrezaMultidimensional_2018/MapServer/4",
    "dane_sise_school_sites": "https://portalgis.dane.gov.co/mparcgis/rest/services/INDICADORES_DE_EDUCACION/Serv_CapasIntegradasSedesEducativas_SISE/MapServer/325",
    "dane_mgn2018_census_blocks": "https://portalgis.dane.gov.co/mparcgis/rest/services/MGN2018/Serv_CapaManzanaInt_2018/MapServer/0",
    "reps_health_sites": "https://www.datos.gov.co/resource/c36g-9fc2.json",
    "invias_national_roads": "https://www.datos.gov.co/resource/ie7y-asdn.json",
    "upra_eva_agricultural": "https://www.datos.gov.co/resource/uejq-wxrr.json",
}


def get_json(session: requests.Session, url: str, params: dict[str, Any] | None = None) -> Any:
    response = session.get(url, params=params, timeout=(20, 180))
    response.raise_for_status()
    return response.json()


def arcgis_features(session: requests.Session, layer: str, *, out_fields: str = "*", batch: int = 1000, geometry: bool = True, max_offset: float | None = None) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    offset = 0
    while True:
        params = {
            "where": "1=1", "outFields": out_fields, "returnGeometry": str(geometry).lower(),
            "outSR": "4326", "f": "json", "resultOffset": offset,
            "resultRecordCount": batch,
        }
        if geometry and max_offset is not None:
            # Geographic degrees; 0.002 is roughly 220 m at the equator, suitable
            # for a national municipal overview, not parcel-scale engineering.
            params["maxAllowableOffset"] = str(max_offset)
        page = get_json(session, f"{layer}/query", params)
        if isinstance(page, dict) and page.get("error"):
            raise RuntimeError(f"ArcGIS error: {page['error'].get('message', 'unknown')}")
        features = page.get("features", [])
        rows.extend(features)
        if len(features) < batch:
            break
        offset += len(features)
    return rows


def _ring_area(ring: list[list[float]]) -> float:
    return sum(ring[i][0] * ring[(i + 1) % len(ring)][1] - ring[(i + 1) % len(ring)][0] * ring[i][1] for i in range(len(ring))) / 2


def _inside(point: list[float], ring: list[list[float]]) -> bool:
    x, y = point[:2]
    inside = False
    j = len(ring) - 1
    for i, (xi, yi, *_) in enumerate(ring):
        xj, yj = ring[j][:2]
        if ((yi > y) != (yj > y)) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-30) + xi:
            inside = not inside
        j = i
    return inside


def arcgis_geometry(geometry: dict[str, Any] | None) -> dict[str, Any] | None:
    if not geometry:
        return None
    if "x" in geometry and "y" in geometry:
        return {"type": "Point", "coordinates": [geometry["x"], geometry["y"]]}
    if "points" in geometry:
        points = geometry["points"]
        return {"type": "MultiPoint", "coordinates": points}
    if "paths" in geometry:
        paths = geometry["paths"]
        return {"type": "LineString", "coordinates": paths[0]} if len(paths) == 1 else {"type": "MultiLineString", "coordinates": paths}
    if "rings" in geometry:
        # ArcGIS outer rings are clockwise and holes counterclockwise.
        polygons: list[list[list[list[float]]]] = []
        for ring in geometry["rings"]:
            if _ring_area(ring) < 0 or not polygons:
                polygons.append([ring])
            else:
                target = next((poly for poly in polygons if _inside(ring[0], poly[0])), None)
                (target if target is not None else polygons[-1]).append(ring)
        return {"type": "Polygon", "coordinates": polygons[0]} if len(polygons) == 1 else {"type": "MultiPolygon", "coordinates": polygons}
    return geometry


def arcgis_feature_collection(features: list[dict[str, Any]]) -> dict[str, Any]:
    return {"type": "FeatureCollection", "features": [
        {"type": "Feature", "id": (f.get("attributes") or {}).get("OBJECTID"), "geometry": arcgis_geometry(f.get("geometry")), "properties": f.get("attributes") or {}}
        for f in features
    ]}


def socrata_rows(session: requests.Session, dataset: str, select: str, group: str | None = None) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    offset = 0
    while True:
        params = {"$select": select, "$limit": "50000", "$offset": str(offset)}
        if group:
            params["$group"] = group
        page = get_json(session, f"https://www.datos.gov.co/resource/{dataset}.json", params)
        rows.extend(page)
        if len(page) < 50000:
            break
        offset += len(page)
    return rows


def props(feature: dict[str, Any]) -> dict[str, Any]:
    return feature.get("properties") or feature.get("attributes") or {}


def code5(value: Any) -> str | None:
    if value is None:
        return None
    digits = "".join(ch for ch in str(value) if ch.isdigit())
    return digits.zfill(5)[-5:] if digits else None


def write_snapshot(folder: Path, name: str, document: Any, url: str, vintage: str | None, retrieved: str) -> dict[str, Any]:
    path = folder / f"{name}.geojson" if isinstance(document, dict) and document.get("type") == "FeatureCollection" else folder / f"{name}.json"
    raw = json.dumps(document, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
    path.write_bytes(raw)
    records = len(document.get("features", [])) if isinstance(document, dict) and document.get("type") == "FeatureCollection" else len(document) if isinstance(document, list) else 1
    return {"source_id": name, "source_url": url, "source_vintage": vintage, "retrieved_at": retrieved,
            "record_count": records, "file_name": path.name, "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw)}


def as_feature_collection(features: list[dict[str, Any]]) -> dict[str, Any]:
    return {"type": "FeatureCollection", "features": features}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "raw" / "territorial-colombia")
    parser.add_argument("--skip-school-sites", action="store_true", help="Skip DANE SISE points if its Geoportal blocks requests")
    parser.add_argument("--skip-road-features", action="store_true", help="Skip the national INVÍAS road geometry layer")
    parser.add_argument("--include-census-blocks", action="store_true", help="Also retrieve all ~505k DANE 2018 census blocks; large download")
    args = parser.parse_args()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    raw_dir = args.output.resolve() / stamp
    processed_dir = ROOT / "data" / "processed" / "territorial-colombia" / stamp
    raw_dir.mkdir(parents=True, exist_ok=False)
    processed_dir.mkdir(parents=True, exist_ok=False)
    session = requests.Session()
    session.headers.update({"User-Agent": "SAROS-Colombia-Territorial-Ingest/1.0", "Accept": "application/json, application/geo+json"})
    manifest: dict[str, Any] = {"retrieved_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "coverage": "Colombia national; municipality profiles; no AOI restriction", "data_mode": "real", "sources": [], "failures": []}

    specs: list[tuple[str, Any, str, str | None]] = [
        ("dane_mgn2018_municipalities", lambda: arcgis_feature_collection(arcgis_features(session, SOURCES["dane_mgn2018_municipalities"], batch=200, max_offset=0.002)), SOURCES["dane_mgn2018_municipalities"], "CNPV/MGN 2018"),
        ("dane_housing_deficit_2018", lambda: arcgis_feature_collection(arcgis_features(session, SOURCES["dane_housing_deficit_2018"], geometry=False)), SOURCES["dane_housing_deficit_2018"], "2018"),
        ("dane_ipm_2018", lambda: arcgis_feature_collection(arcgis_features(session, SOURCES["dane_ipm_2018"], geometry=False)), SOURCES["dane_ipm_2018"], "2018"),
        ("reps_health_sites", lambda: socrata_rows(session, "c36g-9fc2", "municipiosede,municipiosededesc,departamentodededesc,count(*) as facility_count", "municipiosede,municipiosededesc,departamentodededesc"), SOURCES["reps_health_sites"], "Dataset API snapshot; check fecha_corte_reps"),
        ("upra_eva_agricultural", lambda: socrata_rows(session, "uejq-wxrr", "*"), SOURCES["upra_eva_agricultural"], "UPRA EVA 2019-2025"),
    ]
    if not args.skip_school_sites:
        specs.append(("dane_sise_school_sites", lambda: arcgis_feature_collection(arcgis_features(session, SOURCES["dane_sise_school_sites"], out_fields="COD_DANE,NOMBRE_INS,SEDE_PRINC,ESTADO,ID_DEPARTA,DEPARTAMEN,ID_MUNICIP,MUNICIPIO,ZONA,SECTOR,POINT_X,POINT_Y")), SOURCES["dane_sise_school_sites"], "SISE service vintage; see attributes"))
    if not args.skip_road_features:
        specs.append(("invias_national_roads", lambda: socrata_rows(session, "ie7y-asdn", "*"), SOURCES["invias_national_roads"], "Dataset API snapshot"))
    if args.include_census_blocks:
        specs.append(("dane_mgn2018_census_blocks", lambda: as_feature_collection(arcgis_features(session, SOURCES["dane_mgn2018_census_blocks"], batch=2000)), SOURCES["dane_mgn2018_census_blocks"], "CNPV/MGN 2018; manzana level"))

    documents: dict[str, Any] = {}
    for name, fetch, url, vintage in specs:
        try:
            print(f"Downloading {name} ...", flush=True)
            doc = fetch()
            documents[name] = doc
            snap = write_snapshot(raw_dir, name, doc, url, vintage, datetime.now(timezone.utc).isoformat(timespec="seconds"))
            manifest["sources"].append(snap)
            print(f"OK {name}: {snap['record_count']} records, {snap['bytes']} bytes", flush=True)
        except Exception as exc:
            manifest["failures"].append({"source_id": name, "error": f"{type(exc).__name__}: {exc}"})
            print(f"FAILED {name}: {type(exc).__name__}: {exc}", flush=True)

    municipalities = documents.get("dane_mgn2018_municipalities", {}).get("features", [])
    deficits = {code5(props(f).get("MPIO_CCDGO")): props(f) for f in documents.get("dane_housing_deficit_2018", {}).get("features", [])}
    ipm = {code5(props(f).get("MPIO_CCDGO")): props(f) for f in documents.get("dane_ipm_2018", {}).get("features", [])}
    health: dict[str, dict[str, Any]] = {}
    for row in documents.get("reps_health_sites", []):
        key = code5(row.get("municipiosede"))
        if key:
            health[key] = {"count": int(float(row.get("facility_count") or 0)), "department": row.get("departamentodededesc")}
    school_counts: dict[str, int] = {}
    school_features = documents.get("dane_sise_school_sites", {}).get("features", [])
    for feature in school_features:
        p = props(feature)
        key = code5(p.get("ID_MUNICIP") or p.get("COD_DANE"))
        if key:
            school_counts[key] = school_counts.get(key, 0) + 1

    profiles = []
    for feature in municipalities:
        p = props(feature)
        code = code5(p.get("MPIO_CDPMP") or (str(p.get("DPTO_CCDGO", "")).zfill(2) + str(p.get("MPIO_CCDGO", "")).zfill(3)))
        if not code:
            continue
        d = deficits.get(code, {})
        m = ipm.get(code, {})
        activity_fields = [k for k in p if k.startswith("STP9_3_")]
        profiles.append({
            "divipola": code, "department_code": str(p.get("DPTO_CCDGO") or code[:2]).zfill(2),
            "department_name": p.get("DPTO_CNMBR") or m.get("DPTO_CNMBR"), "municipality_name": p.get("MPIO_CNMBR"),
            "census_vintage": "2018", "population_total": p.get("STP27_PERS"),
            "population_male": p.get("STP32_1_SE"), "population_female": p.get("STP32_2_SE"),
            "households_total": p.get("TSP16_HOG"), "dwellings_total": p.get("STVIVIENDA"),
            "occupied_dwellings": p.get("STP15_1_OC"),
            "nonresidential_units": p.get("STP9_3_USO"),
            "nonresidential_activity_counts": {k: p[k] for k in activity_fields if k != "STP9_3_USO"},
            "housing_deficit_count": d.get("N_dvhabitat"), "housing_deficit_percent": d.get("PC_dvhabitat"),
            "housing_deficit_components": {k: v for k, v in d.items() if k.startswith("PC_N_")},
            "multidimensional_poverty_index": m.get("IPM"),
            "health_facility_count": health.get(code, {}).get("count", 0), "school_site_count": school_counts.get(code),
            "geometry": feature.get("geometry"),
            "source_lineage": {"census": "dane_mgn2018_municipalities", "housing_deficit": "dane_housing_deficit_2018", "ipm": "dane_ipm_2018", "health": "reps_health_sites", "schools": "dane_sise_school_sites" if school_features else None, "agriculture": "upra_eva_agricultural" if "upra_eva_agricultural" in documents else None},
            "quality": {"spatial_resolution": "municipality", "population_and_housing_year": 2018, "missing_means": "unavailable; not zero", "economic_fields_are": "counts of non-residential units/use categories, not income, losses or causal estimates"},
            "data_mode": "real",
        })

    profile_doc = as_feature_collection([{"type": "Feature", "id": row["divipola"], "geometry": row.pop("geometry"), "properties": row} for row in profiles])
    processed_path = processed_dir / "colombia_municipal_exposure.geojson"
    processed_path.write_text(json.dumps(profile_doc, ensure_ascii=False, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    manifest["processed"] = {"file": str(processed_path.relative_to(ROOT)), "municipality_count": len(profiles), "sha256": hashlib.sha256(processed_path.read_bytes()).hexdigest(), "bytes": processed_path.stat().st_size}
    manifest["coverage_check"] = {"expected_municipalities_from_dane_service": 1122, "downloaded_municipal_profiles": len(profiles), "national_layer_complete": len(profiles) >= 1000}
    manifest_path = raw_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"PROFILES {processed_path} ({len(profiles)} municipalities)", flush=True)
    print(f"MANIFEST {manifest_path}", flush=True)
    return 0 if len(profiles) >= 1000 and len(manifest["sources"]) >= 4 else 1


if __name__ == "__main__":
    raise SystemExit(main())
