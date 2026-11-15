#!/usr/bin/env python3
"""Export selected, AOI-clipped NISAR variables through NASA Harmony as COGs."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen


HARMONY_CAPABILITIES = "https://harmony.earthdata.nasa.gov/capabilities"


def parse_bbox(value: str) -> tuple[float, float, float, float]:
    try:
        west, south, east, north = (float(part.strip()) for part in value.split(","))
    except ValueError as exc:
        raise argparse.ArgumentTypeError("bbox must be west,south,east,north") from exc
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise argparse.ArgumentTypeError("bbox coordinates are invalid or out of range")
    return west, south, east, north


def capabilities(short_name: str) -> dict[str, object]:
    query = urlencode({"shortName": short_name})
    with urlopen(f"{HARMONY_CAPABILITIES}?{query}", timeout=30) as response:
        payload = json.load(response)
    if payload.get("shortName") != short_name:
        raise ValueError(f"Harmony returned capabilities for {payload.get('shortName')!r}")
    return payload


def available_variables(document: dict[str, object]) -> dict[str, dict[str, object]]:
    variables = document.get("variables")
    if not isinstance(variables, list):
        raise ValueError("Harmony capabilities did not return a variables list")
    found: dict[str, dict[str, object]] = {}
    for item in variables:
        if isinstance(item, dict) and isinstance(item.get("name"), str):
            found[item["name"]] = item
    if not found:
        raise ValueError("Harmony capabilities returned no named variables")
    return found


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--collection", required=True, help="Exact NISAR GUNW short name returned by ASF")
    parser.add_argument("--granule-name", help="Exact ASF NISAR fileID/readable granule name")
    parser.add_argument("--bbox", help="west,south,east,north in WGS84")
    parser.add_argument("--variable", action="append", default=[], dest="variables",
                        help="Exact variable name copied from Harmony capabilities; repeat for each layer")
    parser.add_argument("--output", type=Path, help="Output directory for clipped COGs and manifest")
    parser.add_argument("--list-variables", action="store_true",
                        help="Show current Harmony variables and capabilities; does not require Earthdata credentials")
    args = parser.parse_args()

    if not re.fullmatch(r"NISAR_L2_GUNW(?:_PROVISIONAL|_BETA)?_V1", args.collection):
        parser.error("--collection must be an NISAR L2 GUNW V1 collection short name")

    try:
        caps = capabilities(args.collection)
        variable_map = available_variables(caps)
    except Exception as exc:
        parser.error(f"Cannot inspect Harmony collection capabilities: {exc}")
    if args.list_variables:
        unwrapped_variables = [
            variable for variable in variable_map.values()
            if "/unwrappedInterferogram/" in str(variable.get("name", ""))
        ]
        print(json.dumps({
            "collection": args.collection,
            "summary": caps.get("summary"),
            "variables": unwrapped_variables,
        }, indent=2, ensure_ascii=False))
        return 0

    username = os.getenv("EARTHDATA_USERNAME", "").strip()
    password = os.getenv("EARTHDATA_PASSWORD", "").strip()
    if not username or not password:
        parser.error("Set EARTHDATA_USERNAME and EARTHDATA_PASSWORD in the private server .env")
    if not args.granule_name or not args.granule_name.startswith("NISAR_L2_PR_GUNW_"):
        parser.error("--granule-name must be the exact NISAR L2 GUNW ASF fileID")
    if not args.bbox:
        parser.error("--bbox is required for the spatial subset")
    try:
        bbox = parse_bbox(args.bbox)
    except argparse.ArgumentTypeError as exc:
        parser.error(str(exc))
    if not args.variables:
        parser.error("Provide one or more --variable values from --list-variables")
    if args.output is None:
        parser.error("--output is required")
    unknown = sorted(set(args.variables) - variable_map.keys())
    if unknown:
        parser.error(f"Variables are not present in current Harmony capabilities: {unknown}")
    if not caps.get("summary", {}).get("subsetting", {}).get("bbox", False):
        parser.error("This collection does not report bounding-box subsetting support")
    if not caps.get("summary", {}).get("subsetting", {}).get("variable", False):
        parser.error("This collection does not report variable-subsetting support")

    try:
        from harmony import BBox, Client, Collection, Request
    except ImportError as exc:
        parser.error("Install the pinned pipeline requirements, including harmony-py")

    output_dir = args.output.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    if any(output_dir.iterdir()):
        parser.error(f"Output directory is not empty; refusing to overwrite: {output_dir}")

    client = Client(auth=(username, password))
    jobs: list[dict[str, str | None]] = []
    output_records: list[dict[str, object]] = []
    for index, variable in enumerate(args.variables, start=1):
        layer_name = re.sub(r"[^A-Za-z0-9._-]+", "_", variable.strip("/"))
        layer_dir = output_dir / f"{index:02d}_{layer_name}"
        layer_dir.mkdir()
        request = Request(
            collection=Collection(id=args.collection),
            spatial=BBox(*bbox),
            granule_name=[args.granule_name],
            variables=[variable],
            max_results=1,
            format="image/tiff",
            skip_preview=True,
        )
        if not request.is_valid():
            raise ValueError(f"Harmony rejected the request for variable {variable}")
        submission = client.submit(request)
        job_id = submission if isinstance(submission, str) else None
        jobs.append({
            "job_id": job_id,
            "variable": variable,
            "submission_mode": "job" if job_id else "direct_response",
        })
        downloads = client.download_all(submission, directory=str(layer_dir), overwrite=False)
        output_files = [Path(item.result()).resolve() for item in downloads]
        cogs = [path for path in output_files if path.suffix.lower() in {".tif", ".tiff"}]
        if len(cogs) != 1:
            raise RuntimeError(
                f"Harmony request {job_id or 'direct-response'} for {variable} "
                f"returned {len(cogs)} GeoTIFF files; expected one"
            )
        path = cogs[0]
        if not path.is_file() or path.stat().st_size == 0:
            raise RuntimeError(f"Harmony returned a missing or empty output: {path}")
        output_records.append({
            "variable": variable,
            "metadata": variable_map[variable],
            "job_id": job_id,
            "path": str(path),
            "bytes": path.stat().st_size,
            "sha256": sha256_file(path),
        })

    manifest = {
        "data_mode": "real",
        "source": "NASA-ISRO NISAR via ASF DAAC and NASA Harmony",
        "collection": args.collection,
        "granule_name": args.granule_name,
        "harmony_jobs": jobs,
        "requested_bbox_wgs84": list(bbox),
        "variables": args.variables,
        "submitted_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "outputs": output_records,
        "note": "Layer paths come from the live Harmony capabilities response. Inspect COG metadata and grids before analysis.",
    }
    (output_dir / "harmony-manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(json.dumps({"request_count": len(jobs), "cog_count": len(output_records), "manifest": str(output_dir / "harmony-manifest.json")}, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("Interrupted; any completed Harmony outputs are left intact.", file=sys.stderr)
        raise SystemExit(130)
