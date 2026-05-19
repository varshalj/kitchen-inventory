#!/usr/bin/env python3
"""
Generate PWA splash screens + home-screen icons for Kitchen Inventory.

Reproduces app/icon.svg (orange rounded square + white bowl + 3 steam curves)
in Pillow so no cairosvg dependency is needed.

Outputs:
  public/apple-touch-icon.png         180x180  full icon (orange bg + motif)
  public/icon-192.png                 192x192  full icon
  public/icon-512.png                 512x512  full icon (maskable-safe)
  public/splash/apple-splash-WxH.png  iOS launch images (motif on orange bg)
"""

from __future__ import annotations

import math
import os
from pathlib import Path

from PIL import Image, ImageDraw

BG = (249, 115, 22, 255)   # #f97316 — Tailwind orange-500
FG = (255, 255, 255, 255)  # white

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
SPLASH_DIR = PUBLIC / "splash"

# (width, height) in portrait pixels. CSS dimensions and DPR are encoded
# separately in the HTML media queries.
SPLASH_SIZES: list[tuple[int, int, str]] = [
    # iPhone SE 1st gen
    (640, 1136, "iPhone SE 1st gen"),
    # iPhone 6/7/8
    (750, 1334, "iPhone 6/7/8"),
    # iPhone 6/7/8 Plus
    (1242, 2208, "iPhone 6/7/8 Plus"),
    # iPhone X / XS / 11 Pro
    (1125, 2436, "iPhone X / XS / 11 Pro"),
    # iPhone XR / 11
    (828, 1792, "iPhone XR / 11"),
    # iPhone XS Max / 11 Pro Max
    (1242, 2688, "iPhone XS Max / 11 Pro Max"),
    # iPhone 12 mini
    (1080, 2340, "iPhone 12 mini"),
    # iPhone 12 / 13 / 14
    (1170, 2532, "iPhone 12 / 13 / 14"),
    # iPhone 12 Pro Max / 14 Plus
    (1284, 2778, "iPhone 12 Pro Max / 14 Plus"),
    # iPhone 14 Pro
    (1179, 2556, "iPhone 14 Pro"),
    # iPhone 14 Pro Max / 15 Pro Max
    (1290, 2796, "iPhone 14 Pro Max / 15 Pro Max"),
    # iPhone 16 Pro
    (1206, 2622, "iPhone 16 Pro"),
    # iPhone 16 Pro Max
    (1320, 2868, "iPhone 16 Pro Max"),
    # iPad Mini
    (1536, 2048, "iPad Mini"),
    # iPad Pro 11"
    (1668, 2388, 'iPad Pro 11"'),
    # iPad Pro 12.9"
    (2048, 2732, 'iPad Pro 12.9"'),
]


def _quadratic_bezier(p0, p1, p2, steps=40):
    """Sample a quadratic Bezier curve as a polyline."""
    pts = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0]
        y = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]
        pts.append((x, y))
    return pts


def _draw_motif(draw: ImageDraw.ImageDraw, cx: float, cy: float, motif_size: float) -> None:
    """Draw the bowl + steam motif centred at (cx, cy), sized to fit in motif_size.

    The motif occupies an 18x18 region in the original 32x32 SVG (path from
    x=7..25, y=6..24). We scale that whole region to motif_size and translate
    its centre to (cx, cy).
    """
    # Source coords in the SVG's 32x32 space; motif lives in x=7..25, y=6..24
    src_x0, src_y0, src_x1, src_y1 = 7, 6, 25, 24
    src_w = src_x1 - src_x0  # 18
    src_h = src_y1 - src_y0  # 18
    scale = motif_size / max(src_w, src_h)

    def tx(x):
        return cx + (x - (src_x0 + src_w / 2)) * scale

    def ty(y):
        return cy + (y - (src_y0 + src_h / 2)) * scale

    def pt(x, y):
        return (tx(x), ty(y))

    # --- Bowl body: path d="M7 15h18c0 5-4 9-9 9s-9-4-9-9z"
    # Equivalent: rectangle top at y=15 from x=7..25 (width 18), then a half-bowl
    # underneath. Approximated as an upper rect strip + bottom half-ellipse.
    bowl_left = tx(7)
    bowl_right = tx(25)
    bowl_top = ty(15)
    bowl_bottom = ty(24)
    # The bowl curves down 9 units from y=15 to y=24 with width 18 (half-circle-ish).
    draw.chord(
        [(bowl_left, bowl_top - (bowl_bottom - bowl_top)), (bowl_right, bowl_bottom)],
        start=0,
        end=180,
        fill=FG,
    )

    # --- Bowl rim: rect x=7..25, y=13..15, rounded radius 1 (in SVG units)
    rim_left = tx(7)
    rim_right = tx(25)
    rim_top = ty(13)
    rim_bottom = ty(15)
    rim_radius = max(1.0, 1.0 * scale)
    draw.rounded_rectangle(
        [(rim_left, rim_top), (rim_right, rim_bottom)],
        radius=rim_radius,
        fill=FG,
    )

    # --- 3 Steam curves: quadratic Beziers in SVG space.
    #   M12 10 Q11 8 12 6
    #   M16 10 Q15 8 16 6
    #   M20 10 Q19 8 20 6
    steam_width_svg = 1.5
    steam_width = max(2.0, steam_width_svg * scale)
    for sx in (12, 16, 20):
        p0 = pt(sx, 10)
        p1 = pt(sx - 1, 8)
        p2 = pt(sx, 6)
        polyline = _quadratic_bezier(p0, p1, p2, steps=48)
        draw.line(polyline, fill=FG, width=int(round(steam_width)), joint="curve")
        # Round end caps
        r = steam_width / 2
        draw.ellipse([p0[0] - r, p0[1] - r, p0[0] + r, p0[1] + r], fill=FG)
        draw.ellipse([p2[0] - r, p2[1] - r, p2[0] + r, p2[1] + r], fill=FG)


def render_splash(width: int, height: int) -> Image.Image:
    """Solid orange background with the bowl+steam motif centred."""
    img = Image.new("RGBA", (width, height), BG)
    draw = ImageDraw.Draw(img)
    # Use 28% of the shorter edge for the motif. Generous padding around it so
    # the splash reads as a launch screen rather than a stretched icon.
    motif_size = min(width, height) * 0.28
    _draw_motif(draw, width / 2, height / 2, motif_size)
    return img


def render_icon(size: int, *, maskable_safe: bool = False) -> Image.Image:
    """Full app icon: rounded orange square + motif. For maskable_safe, shrink
    the motif to fit inside the maskable safe zone (inner 80% of the canvas).
    """
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # SVG has rx=8 on a 32x32 → corner radius is 25% of the canvas.
    radius = int(size * 0.25)
    draw.rounded_rectangle([(0, 0), (size, size)], radius=radius, fill=BG)
    motif_size = size * (0.55 if maskable_safe else 0.65)
    _draw_motif(draw, size / 2, size / 2, motif_size)
    return img


def main() -> None:
    SPLASH_DIR.mkdir(parents=True, exist_ok=True)

    # --- Icons ---
    icon_specs = [
        ("apple-touch-icon.png", 180, False),
        ("icon-192.png", 192, True),   # maskable-safe motif sizing
        ("icon-512.png", 512, True),
    ]
    for name, size, maskable in icon_specs:
        out = PUBLIC / name
        render_icon(size, maskable_safe=maskable).save(out, "PNG", optimize=True)
        print(f"  icon  {size:>4}x{size:<4}  {out.relative_to(ROOT)}")

    # --- Splash screens ---
    for w, h, label in SPLASH_SIZES:
        out = SPLASH_DIR / f"apple-splash-{w}x{h}.png"
        render_splash(w, h).save(out, "PNG", optimize=True)
        print(f"  splash {w:>4}x{h:<4} {label:<35} {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
