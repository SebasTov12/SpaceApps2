#!/usr/bin/env python3
"""Normalize the six downloaded public Colombian hazard/impact datasets."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import unicodedata
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

from dateutil import parser as date_parser


ROOT = Path(__file__).resolve().parents[1]
SOURCE_TYPES = {
    "ungrd_emergencies_v1": "event_impact",
    "ungrd_emergencies_v2": "event_impact",
    "sgc_mass_movement_inventory": "landslide_inventory",
    "corpocaldas_landslide_inventory": "landslide_inventory",
    "igac_geologic_hazard_layer": "geologic_hazard",
    "sevilla_hydromet_alerts": "local_alert",
}
FIELD_ALIASES = {
    "event_date": ("fecha", "eam_fecha", "date", "fecha_evento", ":created_at"),
    "department": ("departamento", "depto", "department"),
    "municipality": ("municipio", "obtener_nombremunicipio", "locali", "municipality"),
    "divipola": ("divipola", "codificaci_n_segun_divipola", "codigo_divipola"),
    "event_type": ("evento", "eam_tipo", "des_tipo", "tipo", "categoria", "variable"),
    "deaths": ("fallecidos", "muertos", "des_muerte"),
    "injured": ("heridos",),
    "missing": ("desaparecidos", "desapa"),
    "affected_people": ("personas", "des_nuviev"),
    "affected_families": ("familias",),
    "homes_destroyed": ("viviendas_destruidas", "viv_destru", "des_edfde"),
    "homes_damaged": ("viviendas_averiadas", "viv_aver", "des_edfafc", "des_vivafec"),
    "roads_damaged": ("vias_averiadas", "vias"),
    "bridges_damaged": ("puentes_vehiculares", "ptes_vehic", "ptes_peat", "puentes_peatonales"),
    "health_centers_affected": ("centros_de_salud", "c_salud"),
    "schools_affected": ("centros_educativos", "c_educat"),
    "hectares_affected": ("hectareas", "des_suefal"),
    "economic_support_cop": ("valor_total_apoyo_del_fngrd", "valor_apoyo_total_del_fngrd", "recursos_ejecutados"),
    "latitude": ("latitude", "lat", "des_coory"),
    "longitude": ("longitude", "lon", "lng", "des_coorx"),
}
NUMERIC_FIELDS = {
    "deaths", "injured", "missing", "affected_people", "affected_families",
    "homes_destroyed", "homes_damaged", "roads_damaged", "bridges_damaged",
    "health_centers_affected", "schools_affected", "hectares_affected", "economic_support_cop",
    "latitude", "longitude",
}


def normalized_key(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value)).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


def tidy_text(value: Any) -> str | None:
    if value is None:
        return None
    text = " ".join(str(value).replace("\u00a0", " ").split())
    return text or None


def parse_decimal(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float, Decimal)):
        number = Decimal(str(value))
    else:
        text = str(value).strip()
        if not text or text.lower() in {"null", "none", "n/a", "na", "s/d", "sin dato", "-", "--"}:
            return None
        text = text.replace("$", "").replace("COP", "").replace(" ", "")
        text = re.sub(r"[^0-9,.-]", "", text)
        if not text or not re.search(r"\d", text):
            return None
        if "," in text and "." in text:
            if text.rfind(",") > text.rfind("."):
                text = text.replace(".", "").replace(",", ".")
            else:
                text = text.replace(",", "")
        elif "," in text:
            tail = text.rsplit(",", 1)[1]
            text = text.replace(",", "." if len(tail) in {1, 2} else "")
        elif text.count(".") == 1 and len(text.rsplit(".", 1)[1]) == 3:
            text = text.replace(".", "")
        try:
            number = Decimal(text)
        except InvalidOperation:
            return None
    if not number.is_finite():
        return None
    return float(number)


def parse_date(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        try:
            if value > 10_000_000_000:
                value = value / 1000
            return datetime.fromtimestamp(value, tz=timezone.utc).date().isoformat()
        except (OverflowError, OSError, ValueError):
            return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return date_parser.parse(text, dayfirst=False, fuzzy=True).date().isoformat()
    except (ValueError, OverflowError, TypeError):
        return None


def first_value(properties: dict[str, Any], canonical: str) -> Any:
    keys = {normalized_key(k): k for k in properties}
    for alias in FIELD_ALIASES[canonical]:
        key = keys.get(normalized_key(alias))
        if key is not None and properties[key] not in (None, ""):
            return properties[key]
    return None


def canonical_record(source_id: str, raw: dict[str, Any]) -> dict[str, Any]:
    feature = raw if raw.get("type") == "Feature" else None
    properties = feature.get("properties") if feature else raw
    if not isinstance(properties, dict):
        properties = {}
    geometry = feature.get("geometry") if feature else raw.get("geometry")
    canonical: dict[str, Any] = {
        "source_id": source_id,
        "record_type": SOURCE_TYPES[source_id],
        "data_mode": "real",
        "event_date": parse_date(first_value(properties, "event_date")),
        "department": tidy_text(first_value(properties, "department")),
        "municipality": tidy_text(first_value(properties, "municipality")),
        "divipola": tidy_text(first_value(properties, "divipola")),
        "event_type": tidy_text(first_value(properties, "event_type")),
        "geometry": geometry,
        "metrics": {},
        "attributes": {str(k): v for k, v in properties.items()},
    }
    if canonical["department"]:
        canonical["department"] = canonical["department"].upper()
    if canonical["municipality"]:
        canonical["municipality"] = canonical["municipality"].upper()
    for field in NUMERIC_FIELDS:
        value = parse_decimal(first_value(properties, field))
        if value is not None:
            if field not in {"latitude", "longitude", "hectares_affected", "economic_support_cop"} and value < 0:
                canonical.setdefault("invalid_metrics", []).append(field)
            else:
                canonical["metrics"][field] = value
    if canonical["divipola"]:
        code = canonical["divipola"].strip()
        if re.fullmatch(r"\d+\.0+", code):
            code = code.split(".", 1)[0]
        canonical["divipola"] = code.zfill(5) if code.isdigit() and len(code) <= 5 else code

    raw_canonical = json.dumps(raw, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)
    canonical["record_hash"] = hashlib.sha256(raw_canonical.encode("utf-8")).hexdigest()
    # Source identifiers are often absent or non-unique; the canonical source
    # row hash is stable across reruns and lets exact duplicate rows be removed.
    canonical["source_record_id"] = canonical["record_hash"]
    return canonical


def extract_rows(document: Any) -> list[dict[str, Any]]:
    if isinstance(document, list):
        return [row for row in document if isinstance(row, dict)]
    if isinstance(document, dict):
        if isinstance(document.get("features"), list):
            return [row for row in document["features"] if isinstance(row, dict)]
        for key in ("data", "results", "rows"):
            if isinstance(document.get(key), list):
                return [row for row in document[key] if isinstance(row, dict)]
        return [document]
    return []


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, help="Timestamped public-hazards raw directory")
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "processed" / "public-hazards")
    args = parser.parse_args()

    input_dir = args.input
    if input_dir is None:
        candidates = sorted((ROOT / "data" / "raw" / "public-hazards").glob("*/manifest.json"))
        if not candidates:
            parser.error("No raw manifest found; run scripts/ingest_hazard_sources.py first")
        input_dir = candidates[-1].parent
    manifest_path = input_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output_dir = args.output.expanduser().resolve() / run_id
    output_dir.mkdir(parents=True, exist_ok=False)

    records_path = output_dir / "hazard_records.jsonl"
    report: dict[str, Any] = {"run_id": run_id, "normalization_version": "hazard-normalize-v1", "source_manifest": str(manifest_path), "sources": []}
    with records_path.open("w", encoding="utf-8", newline="\n") as stream:
        for source in manifest["sources"]:
            source_id = source["source_id"]
            document = json.loads((input_dir / source["file"]).read_text(encoding="utf-8-sig"))
            rows = extract_rows(document)
            quality = {"input_records": len(rows), "normalized_records": 0, "with_date": 0, "with_department": 0, "with_municipality": 0, "with_geometry": 0, "with_event_type": 0, "exact_duplicates_removed": 0, "rows_with_invalid_metrics": 0}
            seen: set[str] = set()
            for raw in rows:
                record = canonical_record(source_id, raw)
                key = record["source_record_id"]
                if key in seen:
                    quality["exact_duplicates_removed"] += 1
                    continue
                seen.add(key)
                quality["rows_with_invalid_metrics"] += bool(record.get("invalid_metrics"))
                quality["normalized_records"] += 1
                quality["with_date"] += record["event_date"] is not None
                quality["with_department"] += record["department"] is not None
                quality["with_municipality"] += record["municipality"] is not None
                quality["with_geometry"] += record["geometry"] is not None
                quality["with_event_type"] += record["event_type"] is not None
                record["normalization_version"] = report["normalization_version"]
                record["raw"] = raw
                stream.write(json.dumps(record, ensure_ascii=False, separators=(",", ":"), default=str) + "\n")
            report["sources"].append({"source_id": source_id, "category": source["category"], **quality})

    report["total_records"] = sum(item["normalized_records"] for item in report["sources"])
    report["records_file"] = records_path.name
    (output_dir / "quality_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"OUTPUT {output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
