#!/usr/bin/env python3
"""Verify real Harmony COG hashes and metadata without loading full layers."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
from typing import Any

import numpy as np
import rasterio


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def summarize_layer(item: dict[str, Any]) -> dict[str, Any]:
    path = Path(item["path"])
    if not path.is_file():
        raise FileNotFoundError(f"Missing COG recorded by manifest: {path}")
    digest = sha256_file(path)
    if digest != item.get("sha256"):
        raise ValueError(f"SHA-256 mismatch for {path}")

    with rasterio.open(path, "r") as dataset:
        if dataset.count != 1:
            raise ValueError(f"Expected one band for {item.get('variable')}; found {dataset.count}")
        if dataset.width <= 0 or dataset.height <= 0:
            raise ValueError(f"Invalid raster dimensions for {path}")
        if dataset.crs is None:
            raise ValueError(f"COG has no CRS; refusing to treat pixel coordinates as geographic: {path}")
        if dataset.dtypes[0][0] not in "fiu":
            raise ValueError(f"Unsupported non-numeric COG dtype {dataset.dtypes[0]} for {path}")

        count = 0
        minimum = math.inf
        maximum = -math.inf
        mean = 0.0
        m2 = 0.0
        for _, window in dataset.block_windows(1):
            block = dataset.read(1, window=window, masked=True)
            values = np.asarray(block.compressed())
            if values.size == 0:
                continue
            finite = values[np.isfinite(values)]
            if finite.size == 0:
                continue
            block_count = int(finite.size)
            block_mean = float(finite.mean(dtype=np.float64))
            block_m2 = float(np.square(finite.astype(np.float64) - block_mean).sum(dtype=np.float64))
            delta = block_mean - mean
            combined_count = count + block_count
            m2 += block_m2 + delta * delta * count * block_count / combined_count
            mean += delta * block_count / combined_count
            count = combined_count
            minimum = min(minimum, float(finite.min()))
            maximum = max(maximum, float(finite.max()))

        return {
            "variable": item.get("variable"),
            "path": str(path),
            "bytes": path.stat().st_size,
            "sha256": digest,
            "driver": dataset.driver,
            "width": dataset.width,
            "height": dataset.height,
            "band_count": dataset.count,
            "dtype": dataset.dtypes[0],
            "crs": dataset.crs.to_string() if dataset.crs else None,
            "transform": list(dataset.transform)[:6],
            "bounds": list(dataset.bounds),
            "resolution": list(dataset.res),
            "nodata": (float(dataset.nodata) if dataset.nodata is not None and math.isfinite(dataset.nodata)
                       else None),
            "units": list(dataset.units) if dataset.units else None,
            "descriptions": list(dataset.descriptions),
            "dataset_tags": dataset.tags(),
            "band_tags": dataset.tags(1),
            "valid_pixel_count": count,
            "valid_fraction": count / (dataset.width * dataset.height),
            "minimum": minimum if count else None,
            "maximum": maximum if count else None,
            "mean": mean if count else None,
            "standard_deviation": math.sqrt(m2 / count) if count else None,
            "quality_status": "valid_pixels_present" if count else "all_pixels_masked_or_nodata",
        }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path, help="harmony-manifest.json emitted by export_nisar_harmony.py")
    parser.add_argument("--output", type=Path, help="JSON inventory path (default: cog-inventory.json beside manifest)")
    args = parser.parse_args()

    manifest_path = args.manifest.expanduser().resolve()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("data_mode") != "real":
        parser.error("Manifest is not marked as actual source data")
    outputs = manifest.get("outputs")
    if not isinstance(outputs, list) or not outputs:
        parser.error("Manifest contains no Harmony outputs")
    if any(not isinstance(item, dict) or not item.get("variable") for item in outputs):
        parser.error("Every output must map to a variable from Harmony capabilities")
    identities = [(item.get("granule_name", manifest.get("granule_name")), item["variable"]) for item in outputs]
    if len(set(identities)) != len(identities):
        parser.error("Manifest contains duplicate granule-variable outputs")

    layers = [summarize_layer(item) for item in outputs]
    by_granule: dict[str, list[dict[str, Any]]] = {}
    for item, layer in zip(outputs, layers):
        by_granule.setdefault(item.get("granule_name", manifest.get("granule_name", "unknown")), []).append(layer)
    for granule, granule_layers in by_granule.items():
        reference = granule_layers[0]
        reference_transform = np.asarray(reference["transform"], dtype=np.float64)
        for layer in granule_layers[1:]:
            same_grid = (
                layer["width"] == reference["width"]
                and layer["height"] == reference["height"]
                and layer["crs"] == reference["crs"]
                and np.allclose(layer["transform"], reference_transform, rtol=0, atol=1e-9)
            )
            if not same_grid:
                raise ValueError(
                    "Harmony layers for one granule do not share a grid; do not resample implicitly: "
                    f"{granule}: {reference['variable']} vs {layer['variable']}"
                )

    inventory = {
        "data_mode": "real",
        "source_manifest": str(manifest_path),
        "source_manifest_sha256": sha256_file(manifest_path),
        "collection": manifest.get("collection"),
        "granule_names": manifest.get("granule_names", [manifest.get("granule_name")]),
        "requested_bbox_wgs84": manifest.get("requested_bbox_wgs84"),
        "layers": layers,
        "grid_match": True,
        "interpretation": "Raw COG values and metadata only; no phase-to-LOS conversion or quality decision was applied.",
    }
    output_path = (args.output or manifest_path.with_name("cog-inventory.json")).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(inventory, indent=2, ensure_ascii=False, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"layers": len(layers), "grid_match": True, "inventory": str(output_path)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
