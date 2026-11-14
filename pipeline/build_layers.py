#!/usr/bin/env python3
"""
Genera las capas que consume el explorador de TENUA (frontend/public/data).

Para cada sitio de sites.json produce:
  sites/<id>/<fecha>.png   capa coloreada de cada adquisición
  sites/<id>/change.png    cambio entre la primera y la última fecha
  sites/<id>/timeseries.json  rejilla gruesa de valores por fecha (gráfico al hacer clic)
  sites/<id>/manifest.json    fechas, leyenda, estadísticas y procedencia
y un índice sites.json con todos los sitios.

Modos:
  python build_layers.py --demo   datos sintéticos con forma de producto NISAR (marcados como demo)
  python build_layers.py --real   lee los HDF5 descargados en pipeline/data/<id>/ (ver search_nisar.py);
                                  si un sitio no tiene archivos, se genera en modo demo y se indica.
"""

from __future__ import annotations

import argparse
import json
import math
import re
from datetime import date, datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent
CONFIG = ROOT / "sites.json"
DATA_IN = ROOT / "data"
OUT = ROOT.parent / "frontend" / "public" / "data"
MAX_SIDE = 360          # lado mayor de cada PNG (px)
TS_SIDE = 40            # lado mayor de la rejilla de la serie temporal
L_BAND_WAVELENGTH_M = 0.2384  # NISAR banda L (~1.257 GHz)

# ---------------------------------------------------------------------------
# Rejilla geográfica
# ---------------------------------------------------------------------------

def make_grid(bbox, max_side=MAX_SIDE):
    west, south, east, north = bbox
    mid = math.radians((south + north) / 2)
    width_km = (east - west) * 111.32 * math.cos(mid)
    height_km = (north - south) * 110.57
    if width_km >= height_km:
        cols, rows = max_side, max(8, round(max_side * height_km / width_km))
    else:
        rows, cols = max_side, max(8, round(max_side * width_km / height_km))
    lons = np.linspace(west, east, cols)
    lats = np.linspace(north, south, rows)
    lon2d, lat2d = np.meshgrid(lons, lats)
    pixel_km2 = (width_km / cols) * (height_km / rows)
    # coordenadas locales en km respecto al centro
    x_km = (lon2d - (west + east) / 2) * 111.32 * math.cos(mid)
    y_km = (lat2d - (south + north) / 2) * 110.57
    return {"lon": lon2d, "lat": lat2d, "x": x_km, "y": y_km, "pixel_km2": pixel_km2,
            "width_km": width_km, "height_km": height_km, "rows": rows, "cols": cols}


def smooth_noise(shape, scale_px, seed):
    """Ruido suave (filtro gaussiano en frecuencia), media 0 y desviación 1."""
    rng = np.random.default_rng(seed)
    white = rng.standard_normal(shape)
    fy = np.fft.fftfreq(shape[0])[:, None]
    fx = np.fft.fftfreq(shape[1])[None, :]
    kernel = np.exp(-2 * (math.pi ** 2) * (scale_px ** 2) * (fx ** 2 + fy ** 2))
    field = np.real(np.fft.ifft2(np.fft.fft2(white) * kernel))
    return (field - field.mean()) / (field.std() + 1e-9)


def gaussian(g, cx, cy, sx, sy, angle_deg=0.0):
    a = math.radians(angle_deg)
    dx, dy = g["x"] - cx, g["y"] - cy
    u = dx * math.cos(a) + dy * math.sin(a)
    v = -dx * math.sin(a) + dy * math.cos(a)
    return np.exp(-0.5 * ((u / sx) ** 2 + (v / sy) ** 2))


def days_between(a: str, b: str) -> int:
    return (date.fromisoformat(b) - date.fromisoformat(a)).days

# ---------------------------------------------------------------------------
# Campos sintéticos por tipo de cambio (modo demo)
# ---------------------------------------------------------------------------

def demo_colombia(g, dates):
    lobe = gaussian(g, 0.6, 0.4, 1.3, 0.55, 35) * 1.0 + gaussian(g, -1.6, -1.2, 0.7, 0.4, -20) * 0.35
    frames = []
    for k, d in enumerate(dates):
        t = k / (len(dates) - 1)
        accel = t ** 1.5 + 0.08 * math.sin(t * math.pi)
        atmosphere = smooth_noise(lobe.shape, 40, 100 + k) * 2.2 * (k > 0)
        frames.append(-55 * accel * lobe + atmosphere)
    return frames, None


def demo_cdmx(g, dates):
    bowl = (gaussian(g, 6.0, -1.5, 9.0, 6.5, 20) * 0.5 + gaussian(g, 9.0, 2.0, 4.5, 3.5, 0) * 0.42
            + gaussian(g, -1.0, -6.0, 5.5, 3.0, -30) * 0.32 + gaussian(g, -4.0, 3.0, 3.0, 2.5, 0) * 0.12)
    rate_cm_yr = -48 * bowl
    frames = []
    for k, d in enumerate(dates):
        elapsed = days_between(dates[0], d)
        noise = smooth_noise(bowl.shape, 30, 200 + k) * 0.35 * (k > 0)
        frames.append(rate_cm_yr * elapsed / 365 + noise)
    return frames, None


def demo_sylhet(g, dates):
    texture = smooth_noise((g["rows"], g["cols"]), 6, 301) * 1.2
    basins = (gaussian(g, -12, 6, 9, 6, 15) + gaussian(g, 10, -8, 11, 7, -25) * 0.9
              + gaussian(g, 14, 12, 6, 5, 0) * 0.7 + gaussian(g, -8, -14, 7, 5, 30) * 0.8)
    basins += smooth_noise(basins.shape, 25, 302) * 0.08
    river = np.abs(g["y"] - 6 * np.sin(g["x"] / 9) - 2) < 0.45
    river |= np.abs(g["x"] + 0.4 * g["y"] - 8 * np.sin(g["y"] / 7) - 4) < 0.35
    frames = []
    for k, d in enumerate(dates):
        t = k / (len(dates) - 1)
        level = 0.18 + 0.5 * t  # el umbral sube: el agua retrocede
        water = basins > level
        edge = (basins > level - 0.08) & ~water
        speckle = np.random.default_rng(400 + k).normal(0, 0.9, basins.shape)
        db = -7.5 + texture + speckle * 0.6
        db = np.where(edge, -12 + speckle * 0.8, db)
        db = np.where(water | river, -21.5 + speckle * 0.9, db)
        frames.append(db)
    return frames, None


def demo_jakobshavn(g, dates):
    x, y = g["x"], g["y"]
    # el hielo fluye hacia el oeste; frente del glaciar cerca de x = -14 km
    centerline = 1.5 * np.sin(x / 9)
    across = (y - centerline) / (2.2 + 0.08 * (x + 22))
    trunk = np.exp(-0.5 * across ** 2) * np.clip(1 - (x + 14) / 42, 0, 1) ** 1.6
    tributary = gaussian(g, 12, 7, 12, 1.6, -28) * 0.25 + gaussian(g, 14, -8, 12, 1.4, 25) * 0.2
    wobble = smooth_noise(x.shape, 18, 503)
    coast = -16 + 3.5 * wobble                     # al oeste: fiordo y mar, sin hielo
    walls = np.abs(y - centerline) > 3.0 + 0.6 * wobble
    rock = walls & (x < 6 + 7 * smooth_noise(x.shape, 22, 504)) & (np.abs(y) < 12 + 3 * wobble)
    rock |= (gaussian(g, 2, 9, 3, 1.5, 20) + gaussian(g, -4, -9, 2.5, 1.8, -15)) > 0.5  # nunataks
    ice = (x > coast) & ~rock
    sheet = 0.6 + 1.2 * np.clip((x + 14) / 40, 0, 1) * (np.abs(y) > 4)
    frames = []
    for k, d in enumerate(dates):
        season = 1.0 - 0.22 * (k / (len(dates) - 1))
        terminus = -14 + 0.25 * k
        v = 40 * season * trunk * (x > terminus) + tributary * 40 + sheet * (np.abs(y - centerline) > 3)
        v += smooth_noise(v.shape, 12, 500 + k) * 0.8
        frames.append(np.where(ice & (x > np.maximum(coast, terminus - 2 + 1.5 * wobble)), np.clip(v, 0, None), np.nan))
    return frames, None


def demo_rondonia(g, dates):
    x, y = g["x"], g["y"]
    rng = np.random.default_rng(601)
    texture = smooth_noise((g["rows"], g["cols"]), 5, 602) * 0.6
    cleared = np.zeros_like(x, dtype=bool)
    # carreteras principales y ramales en "espina de pescado"
    roads_y = [-15, -6, 3, 12]
    lot_depth = 1.2 + 1.4 * np.clip(smooth_noise(x.shape, 14, 603), -0.8, 1.5)
    lot_gap = smooth_noise(x.shape, 9, 604) > -0.2
    for i, ry in enumerate(roads_y):
        road = ry + 1.2 * np.sin(x / (6 + i))
        cleared |= np.abs(y - road) < 0.14
        cleared |= (np.abs(y - road) < lot_depth) & (np.abs(np.mod(x + 3 * i, 3.4) - 1.7) < 1.25) & lot_gap
    appear = np.full_like(x, np.inf)
    for i in range(34):
        ry = roads_y[i % len(roads_y)] + rng.uniform(-3.5, 3.5)
        cx = rng.uniform(-24, 24)
        patch = gaussian(g, cx, ry, rng.uniform(0.6, 1.6), rng.uniform(0.4, 1.0), rng.uniform(0, 180)) > 0.4
        appear = np.where(patch & np.isinf(appear), rng.integers(1, len(dates)), appear)
    frames = []
    for k, d in enumerate(dates):
        speckle = np.random.default_rng(700 + k).normal(0, 0.7, x.shape)
        now_cleared = cleared | (appear <= k)
        frames.append(np.where(now_cleared, -18.5 + speckle, -11.3 + texture + speckle * 0.5))
    return frames, None


DEMO = {
    "colombia-ladera": demo_colombia,
    "cdmx-subsidencia": demo_cdmx,
    "sylhet-inundacion": demo_sylhet,
    "jakobshavn-glaciar": demo_jakobshavn,
    "rondonia-deforestacion": demo_rondonia,
}

# ---------------------------------------------------------------------------
# Lectura de productos NISAR reales (HDF5)
# ---------------------------------------------------------------------------

DATASET_BY_PRODUCT = {
    # nombre del dataset dentro del HDF5; se busca por sufijo para tolerar cambios de ruta entre versiones
    "GUNW": ["unwrappedPhase"],
    "GCOV": ["HHHH", "HVHV"],
    "GOFF": ["alongTrackOffset", "slantRangeOffset"],
}
DATE_IN_NAME = re.compile(r"(\d{8})T\d{6}")
# geometría de adquisición en el nombre: <track>_<A|D>_<frame>, p. ej. "119_A_005"
GEOMETRY_IN_NAME = re.compile(r"_(\d{3})_([AD])_(\d{3})_")


def same_geometry(files):
    """Se queda con la geometría (track, dirección, frame) más frecuente: no se deben mezclar."""
    groups = {}
    for path in files:
        match = GEOMETRY_IN_NAME.search(path.name)
        groups.setdefault(match.groups() if match else None, []).append(path)
    key = max(groups, key=lambda k: len(groups[k]))
    if len(groups) > 1:
        print(f"    {len(groups)} geometrías distintas; se usa {key} ({len(groups[key])} archivos)")
    return groups[key]


def _find(h5, name):
    found = []
    h5.visititems(lambda path, obj: found.append(path) if path.split("/")[-1] == name and hasattr(obj, "shape") else None)
    return found


def _coords_for(h5, dataset_path):
    """Busca xCoordinates/yCoordinates/projection subiendo desde el grupo del dataset."""
    parts = dataset_path.split("/")[:-1]
    while parts:
        group = h5["/".join(parts)] if parts else h5
        if "xCoordinates" in group and "yCoordinates" in group:
            epsg = None
            if "projection" in group:
                epsg = int(group["projection"].attrs.get("epsg_code", 0)) or None
            return group["xCoordinates"][()], group["yCoordinates"][()], epsg
        parts = parts[:-1]
    raise ValueError(f"No encontré coordenadas para {dataset_path}")


def _sample(h5, dataset_path, grid):
    from pyproj import Transformer

    xs, ys, epsg = _coords_for(h5, dataset_path)
    transformer = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg or 4326}", always_xy=True)
    gx, gy = transformer.transform(grid["lon"], grid["lat"])
    ix = np.rint((gx - xs[0]) / (xs[1] - xs[0])).astype(int)
    iy = np.rint((gy - ys[0]) / (ys[1] - ys[0])).astype(int)
    valid = (ix >= 0) & (ix < xs.size) & (iy >= 0) & (iy < ys.size)
    data = h5[dataset_path]
    out = np.full(grid["lon"].shape, np.nan)
    out[valid] = data[()][iy[valid], ix[valid]]
    return out


def read_real(site, grid, files):
    """Devuelve (fechas, cuadros, granulos) a partir de los HDF5 de un sitio."""
    import h5py

    product = site["product"]
    records = []
    for path in sorted(same_geometry(files)):
        stamps = DATE_IN_NAME.findall(path.name)
        if not stamps:
            continue
        with h5py.File(path, "r") as h5:
            if product == "GUNW":
                ds = _find(h5, "unwrappedPhase")[0]
                phase = _sample(h5, ds, grid)
                field = -phase * L_BAND_WAVELENGTH_M / (4 * math.pi) * (1000 if site["unit"] == "mm" else 100)
            elif product == "GCOV":
                name = "HVHV" if "HV" in site["metric"] else "HHHH"
                ds = _find(h5, name)[0]
                power = _sample(h5, ds, grid)
                field = 10 * np.log10(np.clip(power, 1e-6, None))
            elif product == "GOFF":
                along = _sample(h5, _find(h5, "alongTrackOffset")[0], grid)
                rng = _sample(h5, _find(h5, "slantRangeOffset")[0], grid)
                span = max(1, days_between(_iso(stamps[0]), _iso(stamps[-1])))
                field = np.hypot(along, rng) / span
            else:
                raise ValueError(product)
        records.append((_iso(stamps[-1]), field, path.name))
    records.sort(key=lambda r: r[0])
    if product == "GUNW":
        # pares consecutivos -> desplazamiento acumulado
        acc = np.zeros_like(records[0][1])
        frames = [np.zeros_like(acc)]
        for _, field, _ in records:
            acc = acc + np.nan_to_num(field)
            frames.append(acc.copy())
        first = _iso(DATE_IN_NAME.findall(records[0][2])[0])
        dates = [first] + [r[0] for r in records]
    else:
        frames = [r[1] for r in records]
        dates = [r[0] for r in records]
    return dates, frames, [r[2] for r in records]


def _iso(stamp):
    return f"{stamp[:4]}-{stamp[4:6]}-{stamp[6:8]}"

# ---------------------------------------------------------------------------
# Color y salida
# ---------------------------------------------------------------------------

COLORMAPS = {
    "diverging": ["#b8322a", "#e8805a", "#f6d3b6", "#f3f6f4", "#bfe0ee", "#5aa3cf", "#245f9e"],
    "water": ["#0b2440", "#1d4f7a", "#3f8fb0", "#9cc9b8", "#d8d2a8", "#f2ecd8"],
    "forest": ["#8a5a2b", "#c79a5b", "#e6d6a2", "#9cc98a", "#3f8f52", "#1d5c34"],
    "ice": ["#0f2c57", "#2f6fb0", "#79d3d3", "#e9f6f2", "#f6d58b", "#e8803a"],
    "change": ["#b8322a", "#e8805a", "#f6d3b6", "#f3f6f4", "#bfe0ee", "#5aa3cf", "#245f9e"],
}


def _hex(c):
    return np.array([int(c[i:i + 2], 16) for i in (1, 3, 5)], dtype=float)


def normalize(values, vmin, vmax, diverging):
    if diverging and vmin < 0 < vmax:
        t = np.where(values < 0, 0.5 - 0.5 * values / vmin, 0.5 + 0.5 * values / vmax)
    else:
        t = (values - vmin) / (vmax - vmin)
    return np.clip(t, 0, 1)


def colorize(values, colormap, vmin, vmax, diverging=False, alpha=225):
    stops = np.array([_hex(c) for c in COLORMAPS[colormap]])
    t = normalize(np.nan_to_num(values, nan=vmin), vmin, vmax, diverging)
    pos = t * (len(stops) - 1)
    lo = np.floor(pos).astype(int).clip(0, len(stops) - 2)
    frac = (pos - lo)[..., None]
    rgb = stops[lo] * (1 - frac) + stops[lo + 1] * frac
    if diverging:
        # valores cercanos a cero casi transparentes: deja ver el terreno donde no hay cambio
        strength = np.clip(np.abs(t - 0.5) * 2 * 2.2, 0, 1)
        a = np.where(np.isnan(values), 0, 25 + (alpha - 25) * strength)[..., None]
    else:
        a = np.where(np.isnan(values), 0, alpha)[..., None]
    return np.concatenate([rgb, a], axis=-1).astype(np.uint8)


def save_png(rgba, path):
    Image.fromarray(rgba, "RGBA").save(path, optimize=True)


def downsample(field, rows, cols):
    r_idx = np.linspace(0, field.shape[0] - 1, rows).round().astype(int)
    c_idx = np.linspace(0, field.shape[1] - 1, cols).round().astype(int)
    return field[np.ix_(r_idx, c_idx)]


def stat(label, label_en, value, unit, note, note_en, unit_en=None):
    return {"label": label, "labelEn": label_en, "value": value, "unit": unit, "unitEn": unit_en or unit, "note": note, "noteEn": note_en}


def compute_stats(site, frames, grid):
    """Tres cifras por sitio, con etiquetas en español e inglés."""
    first, last = frames[0], frames[-1]
    px = grid["pixel_km2"]
    unit = site["unit"]
    sid = site["id"]
    d0, d1 = site["dates"][0], site["dates"][-1]
    if site["change"] == "deformation":
        threshold = 10 if unit == "mm" else 3
        moving = np.nansum(last <= -threshold) * px
        rate = np.nanmin(last) / max(1, days_between(d0, d1)) * 30
        return [
            stat("Desplazamiento máximo", "Peak displacement", f"{np.nanmin(last):.1f}", unit, "Alejándose del satélite", "Moving away from the satellite"),
            stat(f"Área con más de {threshold} {unit}", f"Area beyond {threshold} {unit}", f"{moving:.1f}", "km²", "Al final del periodo", "At the end of the period"),
            stat("Ritmo en el punto máximo", "Rate at the peak", f"{rate:.1f}", f"{unit}/mes", "Promedio del periodo", "Period average", f"{unit}/month"),
        ]
    if site["change"] == "backscatter":
        thr = -15 if sid != "rondonia-deforestacion" else -15.5
        a0 = np.nansum(first < thr) * px
        a1 = np.nansum(last < thr) * px
        flood = sid == "sylhet-inundacion"
        es, en = ("Área inundada", "Flooded area") if flood else ("Área sin bosque", "Cleared area")
        return [
            stat(f"{es} al inicio", f"{en} at start", f"{a0:.0f}", "km²", d0, d0),
            stat(f"{es} al final", f"{en} at end", f"{a1:.0f}", "km²", d1, d1),
            stat("Cambio neto", "Net change", f"{a1 - a0:+.0f}", "km²", f"Umbral {thr} dB", f"Threshold {thr} dB"),
        ]
    v0, v1 = np.nanpercentile(first, 99.5), np.nanpercentile(last, 99.5)
    return [
        stat("Velocidad máxima al inicio", "Peak speed at start", f"{v0:.1f}", unit, d0, d0, "m/day"),
        stat("Velocidad máxima al final", "Peak speed at end", f"{v1:.1f}", unit, d1, d1, "m/day"),
        stat("Variación", "Change", f"{(v1 - v0) / v0 * 100:+.0f}", "%", "Desaceleración estacional", "Seasonal slowdown"),
    ]


def change_range(site):
    if site["change"] == "deformation":
        return site["range"][0], abs(site["range"][0]) * 0.3
    if site["change"] == "backscatter":
        return -10.0, 10.0
    return -10.0, 10.0


def build_site(site, mode, global_dates):
    grid = make_grid(site["bbox"])
    granules = []
    source_mode = "demo"
    files = list((DATA_IN / site["id"]).glob("*.h5")) if mode == "real" else []
    if files:
        dates, frames, granules = read_real(site, grid, files)
        source_mode = "real"
    else:
        dates = global_dates
        frames, _ = DEMO[site["id"]](grid, dates)
    site = {**site, "dates": dates}

    out_dir = OUT / "sites" / site["id"]
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("*.png"):
        old.unlink()
    vmin, vmax = site["range"]
    diverging = site["colormap"] == "diverging"
    layers = []
    for d, field in zip(dates, frames):
        save_png(colorize(field, site["colormap"], vmin, vmax, diverging), out_dir / f"{d}.png")
        layers.append({"date": d, "url": f"/data/sites/{site['id']}/{d}.png"})

    delta = frames[-1] - frames[0]
    cmin, cmax = change_range(site)
    save_png(colorize(delta, "change", cmin, cmax, True), out_dir / "change.png")

    rows, cols = grid["rows"], grid["cols"]
    scale = TS_SIDE / max(rows, cols)
    ts_rows, ts_cols = max(4, round(rows * scale)), max(4, round(cols * scale))
    series = [np.round(downsample(f, ts_rows, ts_cols), 2) for f in frames]
    (out_dir / "timeseries.json").write_text(json.dumps({
        "bbox": site["bbox"], "rows": ts_rows, "cols": ts_cols, "dates": dates, "unit": site["unit"],
        "values": [[None if np.isnan(v) else float(v) for v in s.ravel()] for s in series],
    }, separators=(",", ":")), encoding="utf-8")

    stats = compute_stats(site, frames, grid)
    manifest = {
        **{k: site[k] for k in ("id", "name", "place", "lat", "lon", "bbox", "change", "changeLabel", "product", "metric", "unit", "range", "colormap", "story")},
        "en": {**site.get("en", {}), "unit": "m/day" if site["unit"] == "m/día" else site["unit"]},
        "pilot": site.get("pilot", False),
        "dates": dates,
        "layers": layers,
        "changeLayer": {"url": f"/data/sites/{site['id']}/change.png", "range": [cmin, cmax], "unit": site["unit"]},
        "legend": {"colors": COLORMAPS[site["colormap"]], "range": site["range"], "diverging": diverging},
        "changeLegend": {"colors": COLORMAPS["change"], "range": [cmin, cmax], "diverging": True},
        "stats": stats,
        "source": {
            "mode": source_mode,
            "product": f"NISAR L2 {site['product']}",
            "granules": granules,
            "note": "Datos sintéticos con la estructura de un producto NISAR, generados para la demostración." if source_mode == "demo"
            else "Procesado desde productos NISAR descargados de ASF DAAC.",
            "noteEn": "Synthetic data shaped like a NISAR product, generated for the demo." if source_mode == "demo"
            else "Processed from NISAR products downloaded from ASF DAAC.",
        },
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  {site['id']:<24} {source_mode:<5} {len(dates)} fechas  {cols}x{rows}px")
    return {k: manifest[k] for k in ("id", "name", "place", "lat", "lon", "bbox", "change", "changeLabel", "product", "unit", "story", "pilot", "en")} | {
        "mode": source_mode, "headline": stats[0]}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--demo", action="store_true", help="generar datos sintéticos")
    group.add_argument("--real", action="store_true", help="procesar HDF5 en pipeline/data/<sitio>/")
    parser.add_argument("--site", help="procesar solo este sitio")
    args = parser.parse_args()

    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    sites = [s for s in config["sites"] if not args.site or s["id"] == args.site]
    mode = "real" if args.real else "demo"
    print(f"Generando capas ({mode}) en {OUT}")
    summaries = [build_site(site, mode, config["dates"]) for site in sites]
    if not args.site:
        (OUT / "sites.json").write_text(json.dumps({"sites": summaries}, ensure_ascii=False, indent=2), encoding="utf-8")
    print("Listo.")


if __name__ == "__main__":
    main()
