#!/usr/bin/env python3
"""Download public Colombian hazard/impact datasets from afectaciones.env.

Raw files and the manifest are written under data/ (ignored by Git). Credentials
are neither required nor accepted by these public endpoints.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import requests
from dotenv import dotenv_values


ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "afectaciones.env"
SOURCES = {
    "API_AFECTACIONES_UNGRD_V1": ("ungrd_emergencies_v1", "event_impacts"),
    "API_AFECTACIONES_UNGRD_V2": ("ungrd_emergencies_v2", "event_impacts"),
    "API_DESLIZAMIENTOS_NACIONAL_SGC": ("sgc_mass_movement_inventory", "landslide_inventory"),
    "API_DESLIZAMIENTOS_CALDAS": ("corpocaldas_landslide_inventory", "landslide_inventory"),
    "API_ACTIVIDAD_SISMICA_IGAC": ("igac_geologic_hazard_layer", "geologic_hazard"),
    "API_ALERTAS_SEVILLA_VALLE": ("sevilla_hydromet_alerts", "local_alerts"),
}


def clean_url(value: str) -> str:
    value = value.strip().strip("\"'").strip()
    if "\n" in value or "\r" in value:
        value = "".join(part.strip() for part in value.splitlines())
    parsed = urlsplit(value)
    if parsed.scheme != "https" or not parsed.hostname:
        raise ValueError("source URL must be a valid HTTPS URL")
    return value


def record_count(document: Any) -> int | None:
    if isinstance(document, list):
        return len(document)
    if isinstance(document, dict):
        if isinstance(document.get("features"), list):
            return len(document["features"])
        for key in ("data", "results", "rows"):
            value = document.get(key)
            if isinstance(value, list):
                return len(value)
        return 1
    return None


def extension_for(document: Any, content_type: str) -> str:
    if isinstance(document, dict) and document.get("type") == "FeatureCollection":
        return ".geojson"
    if "geo+json" in content_type.lower():
        return ".geojson"
    return ".json"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=CONFIG, help="Local file with public API URLs")
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "raw" / "public-hazards")
    parser.add_argument("--source", action="append", choices=tuple(SOURCES), help="Download only this env key; repeatable")
    parser.add_argument("--timeout", type=int, default=180)
    args = parser.parse_args()

    config = dotenv_values(args.config, interpolate=False)
    selected = args.source or list(SOURCES)
    missing = [key for key in selected if not str(config.get(key) or "").strip()]
    if missing:
        parser.error(f"Missing public API URL variables in {args.config}: {', '.join(missing)}")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output_dir = args.output.expanduser().resolve() / stamp
    output_dir.mkdir(parents=True, exist_ok=False)
    manifest: dict[str, Any] = {
        "retrieved_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "data_mode": "real",
        "sources": [],
    }

    session = requests.Session()
    session.headers.update({"User-Agent": "SAROS-public-hazard-ingest/1.0", "Accept": "application/json, application/geo+json"})
    failures: list[str] = []
    for key in selected:
        slug, category = SOURCES[key]
        try:
            url = clean_url(str(config[key]))
            response = session.get(url, timeout=args.timeout)
            response.raise_for_status()
            try:
                document = response.json()
            except requests.JSONDecodeError as error:
                raise ValueError(f"API returned non-JSON content type {response.headers.get('Content-Type', 'unknown')}") from error
            if isinstance(document, dict) and document.get("error"):
                raise ValueError("API response contains an error object")
            extension = extension_for(document, response.headers.get("Content-Type", ""))
            path = output_dir / f"{slug}{extension}"
            raw_bytes = response.content
            path.write_bytes(raw_bytes)
            host = urlsplit(url).hostname
            manifest["sources"].append({
                "source_key": key,
                "source_id": slug,
                "category": category,
                "endpoint_host": host,
                "endpoint_path": urlsplit(url).path,
                "status_code": response.status_code,
                "content_type": response.headers.get("Content-Type"),
                "retrieved_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "record_count": record_count(document),
                "sha256": hashlib.sha256(raw_bytes).hexdigest(),
                "file": path.name,
            })
            print(f"OK {slug}: records={record_count(document)} bytes={len(raw_bytes)} sha256={hashlib.sha256(raw_bytes).hexdigest()}")
        except Exception as error:  # keep successfully retrieved sources and report all failures
            failures.append(f"{key}: {type(error).__name__}: {error}")
            print(f"FAILED {key}: {type(error).__name__}: {error}", file=sys.stderr)

    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"MANIFEST {manifest_path}")
    if failures:
        print(f"SOURCES_OK {len(manifest['sources'])}/{len(selected)}", file=sys.stderr)
        return 1
    print(f"SOURCES_OK {len(manifest['sources'])}/{len(selected)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
