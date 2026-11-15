#!/usr/bin/env python3
"""Contornos de los países con zonas SAROS para la vista de países del planeta.

Fuente: Natural Earth 1:50m (dominio público) en el paquete world-atlas@2.0.2 (countries-50m.json).
Colombia no se genera aquí: usa su croquis con departamentos (scripts/build_country_outline.py).

Uso:
  curl -o countries-50m.json https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json
  python scripts/build_world_outlines.py countries-50m.json frontend/public/data/countries
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

# ISO 3166-1 numérico (ids de world-atlas) -> ISO-2 usado por la app.
# La Antártida queda fuera: su contorno cierra sobre el polo y en el globo se vería mal (su punto sí se muestra).
COUNTRIES = {
    "484": ("MX", "México"), "050": ("BD", "Bangladés"), "304": ("GL", "Groenlandia"), "076": ("BR", "Brasil"),
    "360": ("ID", "Indonesia"), "840": ("US", "Estados Unidos"), "364": ("IR", "Irán"), "380": ("IT", "Italia"),
    "352": ("IS", "Islandia"), "792": ("TR", "Turquía"), "524": ("NP", "Nepal"), "586": ("PK", "Pakistán"),
    "704": ("VN", "Vietnam"), "036": ("AU", "Australia"), "124": ("CA", "Canadá"),
}


def decode_arcs(topology):
    sx, sy = topology["transform"]["scale"]
    tx, ty = topology["transform"]["translate"]
    arcs = []
    for arc in topology["arcs"]:
        x = y = 0
        points = []
        for dx, dy in arc:
            x += dx; y += dy
            points.append((x * sx + tx, y * sy + ty))
        arcs.append(points)
    return arcs


def ring_points(ring, arcs):
    out = []
    for index in ring:
        points = arcs[index] if index >= 0 else arcs[~index][::-1]
        out.extend(points if not out else points[1:])
    return out


def area(points):
    return abs(sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(points, points[1:] + points[:1]))) / 2


def simplify(points, tolerance):
    if len(points) < 4:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = points[a], points[b]
        dx, dy = bx - ax, by - ay
        length = math.hypot(dx, dy)
        best, index = 0.0, -1
        for i in range(a + 1, b):
            px, py = points[i]
            d = abs(dy * (px - ax) - dx * (py - ay)) / length if length > 1e-12 else math.hypot(px - ax, py - ay)
            if d > best:
                best, index = d, i
        if best > tolerance and index > 0:
            keep[index] = True
            stack += [(a, index), (index, b)]
    return [p for p, k in zip(points, keep) if k]


def main():
    source, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
    topology = json.loads(source.read_text(encoding="utf-8"))
    arcs = decode_arcs(topology)
    out_dir.mkdir(parents=True, exist_ok=True)
    for geometry in topology["objects"]["countries"]["geometries"]:
        code = COUNTRIES.get(str(geometry.get("id")).zfill(3))
        if not code:
            continue
        polygons = [geometry["arcs"]] if geometry["type"] == "Polygon" else geometry["arcs"]
        rings = [ring_points(polygon[0], arcs) for polygon in polygons]
        rings = [r[:-1] if r and r[0] == r[-1] else r for r in rings]
        biggest = max(area(r) for r in rings)
        # tolerancia según el tamaño del país; se descartan islotes que no se verían en el planeta
        tolerance = max(0.02, min(0.12, math.sqrt(biggest) / 120))
        kept = [r for r in rings if area(r) >= max(0.02, min(0.4, biggest * 0.002))]  # conserva islas como Hawái
        outline = []
        for ring in kept:
            far = max(range(len(ring)), key=lambda i: (ring[i][0] - ring[0][0]) ** 2 + (ring[i][1] - ring[0][1]) ** 2)
            simple = simplify(ring[: far + 1], tolerance)[:-1] + simplify(ring[far:] + [ring[0]], tolerance)
            simple = [(round(x, 3), round(y, 3)) for x, y in simple]
            if len(simple) >= 4:
                outline.append(simple)
        if not outline:  # piezas sueltas del mismo país (p. ej. territorios con el mismo código) sin anillos útiles
            print(code[0], "sin anillos útiles en esta pieza: se omite")
            continue
        xs = [x for r in outline for x, _ in r]; ys = [y for r in outline for _, y in r]
        main_ring = max(outline, key=area)
        cx = sum(x for x, _ in main_ring) / len(main_ring); cy = sum(y for _, y in main_ring) / len(main_ring)
        data = {
            "country": code[0], "name": code[1], "bbox": [min(xs), min(ys), max(xs), max(ys)], "center": [round(cx, 3), round(cy, 3)],
            "outline": outline, "departments": [], "fill": True,
            "source": "Natural Earth 1:50m (dominio público) · world-atlas@2.0.2",
        }
        path = out_dir / f"{code[0]}.json"
        path.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
        print(code[0], len(outline), "anillos", sum(len(r) for r in outline), "puntos", path.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
