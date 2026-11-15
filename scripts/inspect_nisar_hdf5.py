#!/usr/bin/env python3
"""Inventory NISAR HDF5 datasets and metadata without loading raster arrays."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import h5py


def scalar(value: Any) -> Any:
    if hasattr(value, "tolist"):
        value = value.tolist()
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def inventory(path: Path) -> dict[str, Any]:
    datasets: list[dict[str, Any]] = []
    groups: list[str] = []
    with h5py.File(path, "r") as h5:
        root_attrs = {str(key): scalar(value) for key, value in h5.attrs.items()}

        def visit(name: str, item: h5py.Group | h5py.Dataset) -> None:
            if isinstance(item, h5py.Group):
                groups.append("/" + name)
                return
            datasets.append({
                "path": "/" + name,
                "shape": list(item.shape),
                "dtype": str(item.dtype),
                "chunks": list(item.chunks) if item.chunks else None,
                "compression": item.compression,
                "attrs": {str(key): scalar(value) for key, value in item.attrs.items()},
            })

        h5.visititems(visit)

    hints = {
        "phase_or_displacement_name_candidates": [],
        "coherence_name_candidates": [],
        "mask_or_quality_name_candidates": [],
    }
    for item in datasets:
        label = item["path"].lower()
        if any(token in label for token in ("phase", "displacement", "unwrapped", "los")):
            hints["phase_or_displacement_name_candidates"].append(item["path"])
        if "coherence" in label or "correlation" in label:
            hints["coherence_name_candidates"].append(item["path"])
        if any(token in label for token in ("mask", "connected_components", "quality", "water")):
            hints["mask_or_quality_name_candidates"].append(item["path"])
    return {
        "file": path.name,
        "file_size_bytes": path.stat().st_size,
        "root_attributes": root_attrs,
        "group_count": len(groups),
        "dataset_count": len(datasets),
        "groups": groups,
        "datasets": datasets,
        "name_based_candidates_only": hints,
        "note": "Candidates use dataset names only. Confirm product documentation, units, attributes, grids, and quality semantics before processing.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="+", type=Path, help="HDF5 files or directories to inspect")
    parser.add_argument("--output", type=Path, help="Optional JSON report path")
    parser.add_argument("--max-files", type=int, default=3, help="Maximum number of files (default: 3)")
    args = parser.parse_args()
    if args.max_files < 1:
        parser.error("--max-files must be at least 1")
    files: list[Path] = []
    for source in args.paths:
        if source.is_dir():
            files.extend(sorted(p for p in source.rglob("*") if p.is_file() and p.suffix.lower() in {".h5", ".hdf5"}))
        elif source.is_file():
            files.append(source)
        else:
            parser.error(f"Path does not exist: {source}")
    files = sorted(set(p.resolve() for p in files))[:args.max_files]
    if not files:
        parser.error("No HDF5 files found")
    report = {"inspected_files": [inventory(path) for path in files]}
    serialized = json.dumps(report, ensure_ascii=False, indent=2, default=scalar)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(serialized + "\n", encoding="utf-8")
    print(serialized)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
