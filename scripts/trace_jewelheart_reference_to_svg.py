#!/usr/bin/env python3
"""
Build an SVG from the reference PNG:
  - Embedded raster (pixel-perfect color on white).
  - Posterized region fills with mean RGB sampled from the source (vector color).
  - Edge polylines from Canny (vector line work; approximates black outlines).

Usage:
  python3 scripts/trace_jewelheart_reference_to_svg.py [path/to/reference.png]
"""
from __future__ import annotations

import base64
import io
import os
import sys

import cv2
import numpy as np
from PIL import Image

def _default_ref_path() -> str:
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    local = os.path.join(root, "assets", "jewelheart-reference.png")
    if os.path.isfile(local):
        return local
    return "/Users/kevinwoods/.cursor/projects/Users-kevinwoods-Desktop-JewelHeartAdminFunction/assets/image-050308f6-7e9c-4225-bb32-c5f6206719e6.png"


def composite_on_white(rgba: np.ndarray) -> np.ndarray:
    rgb = rgba[..., :3].astype(np.float32)
    a = rgba[..., 3:4].astype(np.float32) / 255.0
    bg = np.array([255.0, 255.0, 255.0], dtype=np.float32)
    out = rgb * a + bg * (1.0 - a)
    return np.clip(out, 0, 255).astype(np.uint8)


def rgb_to_hex(b: float, g: float, r: float) -> str:
    # cv2.mean returns BGR order
    return "#{:02x}{:02x}{:02x}".format(
        int(round(r)), int(round(g)), int(round(b))
    )


def contour_open_polylines(
    rgb: np.ndarray, t1: int = 38, t2: int = 105
) -> list[str]:
    g = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    g = cv2.GaussianBlur(g, (3, 3), 0)
    e = cv2.Canny(g, t1, t2)
    e = cv2.dilate(e, np.ones((2, 2), np.uint8), iterations=1)
    contours, _ = cv2.findContours(e, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    lines: list[str] = []
    for cnt in contours:
        peri = float(cv2.arcLength(cnt, False))
        if peri < 28:
            continue
        eps = max(0.45, 0.0018 * peri)
        approx = cv2.approxPolyDP(cnt, eps, False)
        if len(approx) < 2:
            continue
        p = approx.reshape(-1, 2)
        parts = [f"M{p[0,0]:.2f},{p[0,1]:.2f}"]
        for x, y in p[1:]:
            parts.append(f"L{x:.2f},{y:.2f}")
        lines.append("".join(parts))
    return lines


def posterized_fill_paths(rgb: np.ndarray, n_colors: int = 46) -> list[tuple[str, str]]:
    """Return [(d, fill_hex), ...] for closed paths."""
    h, w = rgb.shape[:2]
    pil = Image.fromarray(rgb).quantize(
        colors=n_colors, method=Image.Quantize.MEDIANCUT
    )
    idx = np.array(pil, dtype=np.int32)
    pal = np.array(pil.getpalette(), dtype=np.uint8).reshape(-1, 3)

    items: list[tuple[str, str, float]] = []

    for k in range(pal.shape[0]):
        mask = (idx == k).astype(np.uint8) * 255
        if cv2.countNonZero(mask) < 100:
            continue
        ys, xs = np.where(mask > 0)
        samp = rgb[ys, xs]
        if (
            samp[:, 0].mean() > 247
            and samp[:, 1].mean() > 247
            and samp[:, 2].mean() > 247
        ):
            continue
        k3 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k3, iterations=1)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, k3, iterations=1)
        if cv2.countNonZero(mask) < 80:
            continue

        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        for cnt in contours:
            peri = float(cv2.arcLength(cnt, True))
            if peri < 40:
                continue
            eps = max(0.45, 0.0016 * peri)
            approx = cv2.approxPolyDP(cnt, eps, True)
            if len(approx) < 3:
                continue
            m = np.zeros((h, w), dtype=np.uint8)
            cv2.drawContours(m, [approx], -1, 255, thickness=-1)
            mean_bgr = cv2.mean(rgb, mask=m)
            hx = rgb_to_hex(mean_bgr[0], mean_bgr[1], mean_bgr[2])
            p0 = approx[0][0]
            parts = [f"M{p0[0]:.2f},{p0[1]:.2f}"]
            for i in range(1, len(approx)):
                x, y = approx[i][0]
                parts.append(f"L{x:.2f},{y:.2f}")
            parts.append("Z")
            d = "".join(parts)
            mcent = cv2.moments(m, binaryImage=True)
            cy = float(mcent["m01"] / mcent["m00"]) if mcent["m00"] else 0.0
            items.append((d, hx, cy))

    # Back-to-front: upper regions first (smaller y centroid)
    items.sort(key=lambda t: t[2])
    return [(d, hx) for d, hx, _ in items]


def png_data_uri(rgb: np.ndarray) -> str:
    buf = io.BytesIO()
    Image.fromarray(rgb).save(buf, format="PNG", optimize=True)
    b64 = base64.standard_b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


def build_svg(
    rgb: np.ndarray,
    *,
    include_raster: bool,
    include_fills: bool,
    include_lines: bool,
    title: str,
    raster_href: str | None = None,
) -> str:
    h, w = rgb.shape[:2]
    fills = posterized_fill_paths(rgb, n_colors=48) if include_fills else []
    lines = contour_open_polylines(rgb) if include_lines else []

    parts: list[str] = []
    parts.append('<?xml version="1.0" encoding="UTF-8"?>')
    parts.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        'xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
    )
    parts.append(f"  <title>{title}</title>")
    parts.append(
        "  <desc>Paths are auto-traced from the reference PNG: fills use median-cut "
        "regions with mean RGB; lines use Canny edge polylines. Not identical to "
        "hand-authored curves but derived from the bitmap.</desc>"
    )

    if include_raster:
        if raster_href:
            # External file: works in browsers & Preview; many LaTeX SVG tools skip data: URIs
            parts.append(
                f'  <image id="exactRaster" xlink:href="{raster_href}" href="{raster_href}" '
                f'x="0" y="0" width="{w}" height="{h}" preserveAspectRatio="xMidYMid meet"/>'
            )
        else:
            parts.append(
                f'  <image id="exactRaster" xlink:href="{png_data_uri(rgb)}" '
                f'href="{png_data_uri(rgb)}" x="0" y="0" width="{w}" height="{h}" '
                'preserveAspectRatio="xMidYMid meet"/>'
            )

    if include_fills:
        parts.append('  <g id="tracedFills">')
        for d, hx in fills:
            parts.append(f'    <path fill="{hx}" stroke="none" d="{d}"/>')
        parts.append("  </g>")

    if include_lines:
        parts.append(
            '  <g id="tracedLines" fill="none" stroke="#140805" '
            'stroke-width="0.75" stroke-linecap="round" stroke-linejoin="round" '
            'opacity="0.9">'
        )
        for d in lines:
            parts.append(f'    <path d="{d}"/>')
        parts.append("  </g>")
    parts.append("</svg>")
    return "\n".join(parts)


def main() -> str:
    ref = sys.argv[1] if len(sys.argv) > 1 else _default_ref_path()
    if not os.path.isfile(ref):
        raise SystemExit(f"Reference not found: {ref}")

    rgba = np.array(Image.open(ref).convert("RGBA"))
    rgb = composite_on_white(rgba)
    h, w = rgb.shape[:2]

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_dir = os.path.join(root, "assets")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "jewelheart-traced.svg")
    raster_name = "jewelheart-traced-raster.png"
    raster_path = os.path.join(out_dir, raster_name)
    Image.fromarray(rgb).save(raster_path, format="PNG", optimize=True)

    svg_exact = build_svg(
        rgb,
        include_raster=True,
        include_fills=False,
        include_lines=True,
        title="Jewel Heart — exact pixels + traced outline polylines",
        raster_href=raster_name,
    )
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(svg_exact)

    out_vec = os.path.join(out_dir, "jewelheart-traced-vector.svg")
    svg_vec = build_svg(
        rgb,
        include_raster=False,
        include_fills=True,
        include_lines=True,
        title="Jewel Heart — vector fills + traced lines (no embedded bitmap)",
    )
    with open(out_vec, "w", encoding="utf-8") as f:
        f.write(svg_vec)

    print(out_path)
    print(out_vec)
    return out_path


if __name__ == "__main__":
    main()
