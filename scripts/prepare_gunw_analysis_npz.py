#!/usr/bin/env python3
"""Prepare one bounded, provenance-linked GUNW phase/coherence patch for SAROS analysis."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

MAX_PIXELS = 262_144


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_patch(path: Path, band: int, window: Window | None) -> tuple[np.ndarray, dict[str, object]]:
    import numpy as np
    import rasterio
    from rasterio.windows import Window

    with rasterio.open(path) as dataset:
        if band < 1 or band > dataset.count:
            raise ValueError(f"Band {band} does not exist in {path}")
        selected = window or Window(0, 0, dataset.width, dataset.height)
        values = dataset.read(band, window=selected, masked=True).astype(np.float32)
        array = values.filled(np.nan)
        metadata = {
            "width": int(array.shape[1]), "height": int(array.shape[0]),
            "crs": str(dataset.crs) if dataset.crs else None,
            "transform": list(dataset.window_transform(selected))[:6],
            "band": band, "description": dataset.descriptions[band - 1],
            "nodata": dataset.nodata,
        }
        return array, metadata


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--phase", type=Path, required=True, help="GUNW unwrapped phase GeoTIFF/COG in radians")
    parser.add_argument("--coherence", type=Path, required=True, help="Matching GUNW coherence GeoTIFF/COG in [0,1]")
    parser.add_argument("--output", type=Path, required=True, help="New .npz output path")
    parser.add_argument("--phase-band", type=int, default=1)
    parser.add_argument("--coherence-band", type=int, default=1)
    parser.add_argument("--window", help="Optional pixel window ROW,COL,HEIGHT,WIDTH; choose a scientifically relevant patch")
    parser.add_argument("--track-id", required=True, help="Supported composite-model track, e.g. 083-D-087")
    args = parser.parse_args()

    import numpy as np
    import rasterio
    from rasterio.windows import Window

    phase_path = args.phase.expanduser().resolve()
    coherence_path = args.coherence.expanduser().resolve()
    output_path = args.output.expanduser().resolve()
    if not phase_path.is_file() or not coherence_path.is_file():
        parser.error("Both real GUNW raster files must exist")
    if output_path.suffix.lower() != ".npz":
        parser.error("--output must end in .npz")
    manifest_path = output_path.with_suffix(".json")
    if output_path.exists() or manifest_path.exists():
        parser.error("Output already exists; choose a new path to preserve previous results")

    window = None
    if args.window:
        try:
            row, col, height, width = [int(value.strip()) for value in args.window.split(",")]
            if min(row, col) < 0 or min(height, width) < 1:
                raise ValueError
            window = Window(col, row, width, height)
        except ValueError:
            parser.error("--window must be ROW,COL,HEIGHT,WIDTH using non-negative pixel offsets")

    with rasterio.open(phase_path) as phase_ds, rasterio.open(coherence_path) as coherence_ds:
        same_grid = (
            phase_ds.width == coherence_ds.width and phase_ds.height == coherence_ds.height
            and phase_ds.crs == coherence_ds.crs and phase_ds.transform == coherence_ds.transform
        )
        if not same_grid:
            parser.error("Phase and coherence must share exactly the same dimensions, CRS, and affine transform")
        chosen = window or Window(0, 0, phase_ds.width, phase_ds.height)
        if chosen.col_off + chosen.width > phase_ds.width or chosen.row_off + chosen.height > phase_ds.height:
            parser.error("The selected pixel window falls outside the rasters")
        if chosen.width * chosen.height > MAX_PIXELS:
            parser.error(f"Selected patch exceeds the API limit of {MAX_PIXELS:,} pixels; choose a smaller --window")

    phase, phase_info = read_patch(phase_path, args.phase_band, window)
    coherence, coherence_info = read_patch(coherence_path, args.coherence_band, window)
    valid = np.isfinite(phase) & np.isfinite(coherence) & (coherence >= 0) & (coherence <= 1)
    if valid.mean() < 0.05:
        parser.error("Fewer than 5% of patch pixels have valid phase and 0..1 coherence")
    phase[~valid] = np.nan
    coherence[~valid] = np.nan

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("xb") as stream:
        np.savez_compressed(stream, features=np.stack((phase, coherence)).astype(np.float32))
    manifest = {
        "data_mode": "real", "product": "NISAR_L2_GUNW",
        "track_id": args.track_id, "feature_order": ["unwrapped_phase_rad", "coherence"],
        "valid_fraction": float(valid.mean()), "window_row_col_height_width": [
            int(chosen.row_off), int(chosen.col_off), int(chosen.height), int(chosen.width),
        ],
        "phase": {"path": str(phase_path), "sha256": sha256(phase_path), **phase_info},
        "coherence": {"path": str(coherence_path), "sha256": sha256(coherence_path), **coherence_info},
        "created_at": datetime.now(timezone.utc).isoformat(),
        "interpretation": "Exploratory anomaly screening input. It is not an event label, LOS observation, probability, or alert.",
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"NPZ {output_path}")
    print(f"PROVENANCE {manifest_path}")
    print(f"PATCH {chosen.width}x{chosen.height} valid={valid.mean():.1%}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
