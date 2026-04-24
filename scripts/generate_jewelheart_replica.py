#!/usr/bin/env python3
"""
Vector-style replica of the Jewel Heart mobile logo (flaming Cintamani on lotus).
Renders to PNG for Preview; coordinates tuned to match ~200x361 layout.
"""
from __future__ import annotations

import math
import os

import cairo

W, H = 200, 361

# Palette (approximate to original artwork)
RED = (0.91, 0.33, 0.32)
YELLOW = (0.98, 0.83, 0.29)
BLUE = (0.18, 0.29, 0.56)
GREEN_BLEND = (0.34, 0.59, 0.34)
FLAME_DARK = (0.83, 0.27, 0.21)
FLAME_MID = (0.96, 0.52, 0.35)
FLAME_LIGHT = (0.98, 0.72, 0.55)
LOTUS_WHITE = (0.98, 0.98, 0.99)
LOTUS_PINK = (0.96, 0.88, 0.93)
STROKE = (0.08, 0.06, 0.06)


def setup_top_origin(ctx: cairo.Context) -> None:
    ctx.translate(0, H)
    ctx.scale(1, -1)


def Y(ty: float) -> float:
    """Convert y measured from top of image to cairo y-up user space."""
    return H - ty


def draw_flames(ctx: cairo.Context) -> None:
    """Multi-tongue mandorla (ty from top); many short edges read as jagged flame."""
    ty_pts = [
        (52, 192),
        (44, 182),
        (38, 168),
        (34, 152),
        (32, 136),
        (34, 118),
        (40, 98),
        (50, 78),
        (62, 60),
        (78, 44),
        (92, 34),
        (100, 28),
        (108, 34),
        (122, 44),
        (138, 60),
        (150, 78),
        (160, 98),
        (166, 118),
        (168, 136),
        (166, 152),
        (162, 168),
        (156, 182),
        (148, 192),
        (138, 198),
        (128, 194),
        (118, 188),
        (108, 182),
        (100, 178),
        (92, 182),
        (82, 188),
        (72, 194),
        (62, 198),
    ]
    ctx.new_path()
    ctx.move_to(ty_pts[0][0], Y(ty_pts[0][1]))
    for x, ty in ty_pts[1:]:
        ctx.line_to(x, Y(ty))
    ctx.close_path()

    pat = cairo.LinearGradient(100, Y(200), 100, Y(26))
    pat.add_color_stop_rgba(0, *FLAME_DARK, 1)
    pat.add_color_stop_rgba(0.42, *FLAME_MID, 1)
    pat.add_color_stop_rgba(1, *FLAME_LIGHT, 1)
    ctx.set_source(pat)
    ctx.fill_preserve()
    ctx.set_source_rgb(*STROKE)
    ctx.set_line_width(1.2)
    ctx.set_line_join(cairo.LINE_JOIN_ROUND)
    ctx.set_line_cap(cairo.LINE_CAP_ROUND)
    ctx.stroke()

    # Inner flame tongues + light splits (original has layered orange)
    for side in (-1, 1):
        bx = 100 + side * 18
        ctx.new_path()
        ctx.move_to(bx, Y(172))
        ctx.curve_to(bx + side * 16, Y(138), bx + side * 22, Y(95), 100 + side * 12, Y(58))
        ctx.curve_to(100 + side * 5, Y(48), bx - side * 6, Y(115), bx, Y(172))
        ctx.close_path()
        p = cairo.LinearGradient(bx, Y(172), 100 + side * 10, Y(50))
        p.add_color_stop_rgba(0, *FLAME_MID, 0.55)
        p.add_color_stop_rgba(1, *FLAME_LIGHT, 0.2)
        ctx.set_source(p)
        ctx.fill()

    ctx.set_source_rgba(*FLAME_LIGHT, 0.35)
    ctx.set_line_width(0.55)
    for side in (-1, 1):
        ctx.new_path()
        ctx.move_to(100 + side * 8, Y(165))
        ctx.curve_to(100 + side * 28, Y(120), 100 + side * 20, Y(72), 100 + side * 6, Y(48))
        ctx.stroke()


def draw_lotus_petal(
    ctx: cairo.Context,
    cx: float,
    cy_up: float,
    w: float,
    h: float,
    rot_deg: float,
) -> None:
    """Rounded lotus petal; soft pink at base, single faint mid-vein (no heavy hatch)."""
    ctx.save()
    ctx.translate(cx, cy_up)
    ctx.rotate(math.radians(rot_deg))
    ctx.new_path()
    ctx.move_to(0, 0)
    ctx.curve_to(-w * 0.48, h * 0.18, -w * 0.52, h * 0.55, -w * 0.08, h * 0.92)
    ctx.curve_to(-w * 0.02, h * 0.98, w * 0.02, h * 0.98, w * 0.08, h * 0.92)
    ctx.curve_to(w * 0.52, h * 0.55, w * 0.48, h * 0.18, 0, 0)
    ctx.close_path()
    pat = cairo.LinearGradient(0, 0, 0, h)
    pat.add_color_stop_rgba(0, *LOTUS_PINK, 1)
    pat.add_color_stop_rgba(0.38, *LOTUS_WHITE, 1)
    pat.add_color_stop_rgba(1, *LOTUS_WHITE, 1)
    ctx.set_source(pat)
    ctx.fill_preserve()
    ctx.set_source_rgb(*STROKE)
    ctx.set_line_width(0.95)
    ctx.stroke()
    ctx.set_source_rgba(*STROKE, 0.2)
    ctx.set_line_width(0.35)
    ctx.move_to(0, h * 0.1)
    ctx.line_to(0, h * 0.88)
    ctx.stroke()
    ctx.restore()


def draw_lotus(ctx: cairo.Context) -> None:
    # Raised so petals cradle the jewel (~center ty 142, r ~34)
    base_ty = 248.0
    cx = 100.0
    cy_base = Y(base_ty)
    for rot in [-78, -52, -26, 0, 26, 52, 78]:
        draw_lotus_petal(ctx, cx, cy_base, 28, 62, rot)
    for rot in [-38, -14, 14, 38]:
        draw_lotus_petal(ctx, cx, Y(base_ty - 10), 24, 54, rot)


def _pt(cx: float, cy: float, rad: float, deg: float) -> tuple[float, float]:
    t = math.radians(deg)
    return (cx + rad * math.cos(t), cy + rad * math.sin(t))


def draw_jewel_sphere(ctx: cairo.Context) -> None:
    cx, r = 100.0, 34.0
    cy = Y(142.0)

    ctx.arc(cx, cy, r, 0, 2 * math.pi)
    ctx.set_source_rgb(0.97, 0.97, 0.98)
    ctx.fill()

    ctx.arc(cx, cy, r, 0, 2 * math.pi)
    ctx.clip()

    p30 = _pt(cx, cy, r, 30)
    p150 = _pt(cx, cy, r, 150)
    p270 = _pt(cx, cy, r, 270)

    # Yellow — upper lobe (arc 30° → 150°)
    ctx.new_path()
    ctx.move_to(cx, cy)
    ctx.curve_to(cx + 8, cy + 14, cx + 20, cy + 20, p30[0], p30[1])
    ctx.arc(cx, cy, r, math.pi / 6, 5 * math.pi / 6)
    ctx.curve_to(p150[0] - 6, p150[1] + 2, cx - 8, cy + 14, cx, cy)
    ctx.close_path()
    ctx.set_source_rgb(*YELLOW)
    ctx.fill()

    # Red — left / lower-left (arc 150° → 270°)
    ctx.new_path()
    ctx.move_to(cx, cy)
    ctx.curve_to(cx - 14, cy + 4, cx - 22, cy - 6, p150[0], p150[1])
    ctx.arc(cx, cy, r, 5 * math.pi / 6, 3 * math.pi / 2)
    ctx.curve_to(p270[0] - 4, p270[1] - 10, cx - 6, cy - 12, cx, cy)
    ctx.close_path()
    ctx.set_source_rgb(*RED)
    ctx.fill()

    # Blue — right / lower-right (arc 270° → 360° → 30°)
    ctx.new_path()
    ctx.move_to(cx, cy)
    ctx.curve_to(cx + 14, cy - 10, cx + 22, cy - 2, p270[0], p270[1])
    ctx.arc(cx, cy, r, 3 * math.pi / 2, 2 * math.pi)
    ctx.arc(cx, cy, r, 0, math.pi / 6)
    ctx.curve_to(p30[0] + 6, p30[1] + 2, cx + 8, cy + 14, cx, cy)
    ctx.close_path()
    ctx.set_source_rgb(*BLUE)
    ctx.fill()

    ctx.new_path()
    ctx.arc(cx, cy - 4, 14, 0, 2 * math.pi)
    ctx.set_source_rgba(*GREEN_BLEND, 0.28)
    ctx.fill()

    ctx.reset_clip()

    ctx.arc(cx, cy, r, 0, 2 * math.pi)
    ctx.clip()
    hx, hy = cx, cy + r * 0.38
    hi = cairo.RadialGradient(hx, hy, 0, hx, hy, r * 0.62)
    hi.add_color_stop_rgba(0, 1, 1, 1, 0.32)
    hi.add_color_stop_rgba(0.5, 1, 1, 1, 0.06)
    hi.add_color_stop_rgba(1, 1, 1, 1, 0)
    ctx.set_source(hi)
    ctx.paint()
    ctx.reset_clip()

    ctx.arc(cx, cy, r, 0, 2 * math.pi)
    ctx.set_source_rgb(*STROKE)
    ctx.set_line_width(1.35)
    ctx.stroke()


def main() -> str:
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_dir = os.path.join(root, "assets")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "jewelheart-replica.png")

    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, W, H)
    ctx = cairo.Context(surface)
    ctx.set_source_rgba(0, 0, 0, 0)
    ctx.paint()

    setup_top_origin(ctx)

    draw_flames(ctx)
    draw_lotus(ctx)
    draw_jewel_sphere(ctx)

    surface.write_to_png(out_path)
    return out_path


if __name__ == "__main__":
    p = main()
    print(p)
