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
from urllib.parse import unquote, urlencode, urlsplit
from urllib.request import urlopen

from dotenv import load_dotenv


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


def map_url_to_variable(url: str, variables: list[str]) -> str:
    """Match a Harmony output URL to the exact requested variable path."""
    path_slug = re.sub(r"[^A-Za-z0-9]+", "_", unquote(urlsplit(url).path)).lower()
    matches = [
        variable for variable in variables
        if re.sub(r"[^A-Za-z0-9]+", "_", variable.strip("/")).lower() in path_slug
    ]
    if not matches:
        raise RuntimeError("Could not map a Harmony output to exactly one requested variable")
    longest = max(len(variable) for variable in matches)
    exact = [variable for variable in matches if len(variable) == longest]
    if len(exact) != 1:
        raise RuntimeError("Could not map a Harmony output to exactly one requested variable")
    return exact[0]


def main() -> int:
    # Credentials stay in the ignored local .env and are never emitted by this CLI.
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--collection", required=True, help="Exact NISAR GUNW short name returned by ASF")
    parser.add_argument("--granule-name", action="append", default=[], dest="granule_names",
                        help="Exact ASF NISAR fileID; repeat to export multiple granules together")
    parser.add_argument("--bbox", help="west,south,east,north in WGS84")
    parser.add_argument("--variable", action="append", default=[], dest="variables",
                        help="Exact variable name copied from Harmony capabilities; repeat for each layer")
    parser.add_argument("--output", type=Path, help="Output directory for clipped COGs and manifest")
    parser.add_argument("--list-variables", action="store_true",
                        help="Show current Harmony variables and capabilities; does not require Earthdata credentials")
    args = parser.parse_args()

    if not re.fullmatch(r"NISAR_L[123]_[A-Z0-9]+(?:_[A-Z]+)?_V1", args.collection):
        parser.error("--collection must be a supported NISAR L1/L2/L3 V1 collection short name")

    try:
        caps = capabilities(args.collection)
        variable_map = available_variables(caps)
    except Exception as exc:
        parser.error(f"Cannot inspect Harmony collection capabilities: {exc}")
    if args.list_variables:
        print(json.dumps({
            "collection": args.collection,
            "summary": caps.get("summary"),
            "variables": list(variable_map.values()),
        }, indent=2, ensure_ascii=False))
        return 0

    username = os.getenv("EARTHDATA_USERNAME", "").strip()
    password = os.getenv("EARTHDATA_PASSWORD", "").strip()
    if not username or not password:
        parser.error("Set EARTHDATA_USERNAME and EARTHDATA_PASSWORD in the ignored local .env")
    product_code = args.collection.split("_")[2]
    level_code = args.collection.split("_")[1]
    expected_granule_prefix = f"NISAR_{level_code}_PR_{product_code}_"
    if not args.granule_names or any(not name.startswith(expected_granule_prefix) for name in args.granule_names):
        parser.error(f"--granule-name must be supplied for every granule with prefix {expected_granule_prefix}")
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

    class ShortFilenameClient(Client):
        def get_download_filename_from_url(self, url: str) -> str:
            # Harmony filenames repeat the complete granule and variable path;
            # a stable short name avoids Windows MAX_PATH failures.
            path = urlsplit(url).path
            return f"{hashlib.sha256(path.encode('utf-8')).hexdigest()[:20]}.tif"

    output_dir = args.output.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    if any(output_dir.iterdir()):
        parser.error(f"Output directory is not empty; refusing to overwrite: {output_dir}")

    client = ShortFilenameClient(auth=(username, password))
    jobs: list[dict[str, str | None]] = []
    output_records: list[dict[str, object]] = []
    request = Request(
        collection=Collection(id=args.collection),
        spatial=BBox(*bbox),
        granule_name=args.granule_names,
        variables=args.variables,
        max_results=len(args.granule_names),
        format="image/tiff",
        skip_preview=True,
    )
    if not request.is_valid():
        raise ValueError("Harmony rejected the requested variable set")
    submission = client.submit(request)
    job_id = submission if isinstance(submission, str) else None
    if job_id:
        result_urls = list(client.result_urls(job_id, show_progress=True))
    else:
        result_urls = [
            link["href"] for link in submission.get("links", [])
            if link.get("rel") == "data"
        ]
    if not result_urls:
        raise RuntimeError("Harmony returned no output URLs for the requested variables")
    output_identity_by_filename = {}
    for url in result_urls:
        matching_granules = [name for name in args.granule_names if name in unquote(url)]
        if len(matching_granules) != 1:
            raise RuntimeError("Could not map a Harmony output to exactly one requested granule")
        filename = client.get_download_filename_from_url(url)
        output_identity_by_filename[filename] = (matching_granules[0], map_url_to_variable(url, args.variables))
    if len(output_identity_by_filename) != len(result_urls):
        raise RuntimeError("Harmony returned duplicate output filenames")
    jobs.append({
        "job_id": job_id,
        "variables": ",".join(args.variables),
        "submission_mode": "job" if job_id else "direct_response",
    })
    downloads = client.download_all(submission, directory=str(output_dir), overwrite=False)
    output_files = [Path(item.result()).resolve() for item in downloads]
    cogs = [path for path in output_files if path.suffix.lower() in {".tif", ".tiff"}]
    expected_output_count = len(args.granule_names) * len(args.variables)
    if len(cogs) > expected_output_count:
        raise RuntimeError(
            f"Harmony returned {len(cogs)} GeoTIFF files for only {expected_output_count} requested granule-variable pairs"
        )
    mapped: set[tuple[str, str]] = set()
    for path in cogs:
        identity = output_identity_by_filename.get(path.name)
        if identity is None or identity in mapped:
            raise RuntimeError("Downloaded COG could not be mapped uniquely to its requested variable")
        granule_name, variable = identity
        if not path.is_file() or path.stat().st_size == 0:
            raise RuntimeError(f"Harmony returned a missing or empty output: {path}")
        mapped.add(identity)
        output_records.append({
            "granule_name": granule_name,
            "variable": variable,
            "metadata": variable_map[variable],
            "job_id": job_id,
            "path": str(path),
            "bytes": path.stat().st_size,
            "sha256": sha256_file(path),
        })
    expected_pairs = {(granule, variable) for granule in args.granule_names for variable in args.variables}
    missing_pairs = sorted(
        [{"granule_name": granule, "variable": variable} for granule, variable in expected_pairs - mapped],
        key=lambda item: (item["granule_name"], item["variable"]),
    )

    manifest = {
        "data_mode": "real",
        "source": "NASA-ISRO NISAR via ASF DAAC and NASA Harmony",
        "collection": args.collection,
        "granule_names": args.granule_names,
        "harmony_jobs": jobs,
        "requested_bbox_wgs84": list(bbox),
        "variables": args.variables,
        "submitted_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "outputs": output_records,
        "missing_pairs": missing_pairs,
        "note": "Layer paths come from the live Harmony capabilities response. Inspect COG metadata and grids before analysis.",
    }
    (output_dir / "harmony-manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(json.dumps({"request_count": len(jobs), "cog_count": len(output_records), "manifest": str(output_dir / "harmony-manifest.json")}, indent=2))
    if missing_pairs:
        print(f"WARNING: Harmony did not return {len(missing_pairs)} requested granule-variable pairs", file=sys.stderr)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("Interrupted; any completed Harmony outputs are left intact.", file=sys.stderr)
        raise SystemExit(130)
