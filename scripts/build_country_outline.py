#!/usr/bin/env python3
"""Croquis de un país para el planeta: contorno y límites de departamentos.

Se construye con los polígonos municipales de la propia API (DANE, territorial.municipal_profiles):
se rasterizan en una rejilla fina, se traza el borde de cada región y se simplifica.
Así no hace falta una capa de países externa y el croquis coincide con los datos de la base.

Uso:
  python scripts/build_country_outline.py --api https://saros.tobaru.xyz --country CO \
      --out frontend/public/data/countries/CO.json
  (o --input municipios.json con la respuesta de /api/v1/territorial/municipalities)
"""
from __future__ import annotations

import argparse
import json
import math
import urllib.request
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw

STEP = 0.02  # grados por celda (~2 km)


def polygons(geometry):
    if not geometry:
        return []
    if geometry["type"] == "Polygon":
        return [geometry["coordinates"]]
    if geometry["type"] == "MultiPolygon":
        return geometry["coordinates"]
    return []


def trace(mask: list[list[bool]], width: int, height: int) -> list[list[tuple[int, int]]]:
    """Bordes cerrados de las celdas marcadas (esquinas de la rejilla), con lo marcado a la izquierda."""
    nxt: dict[tuple[int, int], list[tuple[int, int]]] = defaultdict(list)
    filled = lambda x, y: 0 <= x < width and 0 <= y < height and mask[y][x]
    for y in range(height):
        row = mask[y]
        for x in range(width):
            if not row[x]:
                continue
            if not filled(x, y - 1): nxt[(x, y)].append((x + 1, y))
            if not filled(x + 1, y): nxt[(x + 1, y)].append((x + 1, y + 1))
            if not filled(x, y + 1): nxt[(x + 1, y + 1)].append((x, y + 1))
            if not filled(x - 1, y): nxt[(x, y + 1)].append((x, y))
    loops = []
    while nxt:
        start = next(iter(nxt))
        loop = [start]
        cur = start
        while True:
            options = nxt.get(cur)
            if not options:
                break
            nxt_point = options.pop()
            if not options:
                del nxt[cur]
            if nxt_point == start:
                break
            loop.append(nxt_point)
            cur = nxt_point
        if len(loop) >= 4:
            loops.append(loop)
    return loops


def simplify(points: list[tuple[float, float]], tolerance: float) -> list[tuple[float, float]]:
    """Douglas–Peucker iterativo."""
    if len(points) < 4:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = points[a]; bx, by = points[b]
        dx, dy = bx - ax, by - ay
        length = math.hypot(dx, dy) or 1e-12
        best, index = 0.0, -1
        for i in range(a + 1, b):
            px, py = points[i]
            d = abs(dy * (px - ax) - dx * (py - ay)) / length
            if d > best:
                best, index = d, i
        if best > tolerance and index > 0:
            keep[index] = True
            stack += [(a, index), (index, b)]
    return [p for p, k in zip(points, keep) if k]


def outline(features, bbox, width, height, min_cells=6):
    west, south, east, north = bbox
    image = Image.new("1", (width, height), 0)
    draw = ImageDraw.Draw(image)
    for geometry in features:
        for polygon in polygons(geometry):
            ring = [((x - west) / STEP, (north - y) / STEP) for x, y in polygon[0]]
            if len(ring) >= 3:
                draw.polygon(ring, fill=1)
    px = image.load()
    mask = [[bool(px[x, y]) for x in range(width)] for y in range(height)]
    result = []
    for loop in trace(mask, width, height):
        if len(loop) < min_cells:
            continue
        coords = [(round(west + x * STEP, 4), round(north - y * STEP, 4)) for x, y in loop]
        # anillo cerrado: se parte en el punto más lejano del inicio y se simplifica cada mitad
        far = max(range(len(coords)), key=lambda i: (coords[i][0] - coords[0][0]) ** 2 + (coords[i][1] - coords[0][1]) ** 2)
        coords = simplify(coords[: far + 1], STEP * 0.7)[:-1] + simplify(coords[far:] + [coords[0]], STEP * 0.7)
        if len(coords) >= 4:
            result.append(coords)
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default=None)
    parser.add_argument("--input", type=Path, default=None)
    parser.add_argument("--country", default="CO")
    parser.add_argument("--name", default="Colombia")
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if args.input:
        data = json.loads(args.input.read_text(encoding="utf-8"))
    else:
        with urllib.request.urlopen(f"{args.api.rstrip('/')}/api/v1/territorial/municipalities", timeout=120) as response:
            data = json.load(response)
    features = data["features"]
    xs, ys = [], []
    for f in features:
        for polygon in polygons(f["geometry"]):
            for x, y in polygon[0]:
                xs.append(x); ys.append(y)
    bbox = (min(xs) - STEP, min(ys) - STEP, max(xs) + STEP, max(ys) + STEP)
    width = math.ceil((bbox[2] - bbox[0]) / STEP)
    height = math.ceil((bbox[3] - bbox[1]) / STEP)

    country = outline([f["geometry"] for f in features], bbox, width, height)
    by_department = defaultdict(list)
    names = {}
    for f in features:
        code = f["properties"]["department_code"]
        by_department[code].append(f["geometry"])
        names[code] = f["properties"]["department_name"]
    departments = []
    for code, geometries in sorted(by_department.items()):
        departments.append({"code": code, "name": names[code], "rings": outline(geometries, bbox, width, height, min_cells=10)})

    out = {
        "country": args.country, "name": args.name, "bbox": [round(v, 3) for v in bbox],
        "center": [round((bbox[0] + bbox[2]) / 2, 3), round((bbox[1] + bbox[3]) / 2, 3)],
        "outline": country, "departments": departments,
        "source": "DANE · polígonos municipales de territorial.municipal_profiles (SAROS API)",
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    print("anillos del país:", len(country), "puntos:", sum(len(r) for r in country),
          "departamentos:", len(departments), "bytes:", args.out.stat().st_size)


if __name__ == "__main__":
    main()
