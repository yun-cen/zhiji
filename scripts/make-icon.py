#!/usr/bin/env python3
"""知几图标：磨砂底、飞白「几」、朱砂飞沫。"""

import math
import random
import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
MASTER = 1024
SONGTI = "/System/Library/Fonts/Supplemental/Songti.ttc"


def frost(size, rng):
    px_img = Image.new("RGB", (size, size))
    px = px_img.load()
    cx, cy = size * 0.50, size * 0.46
    for y in range(size):
        dy = (y - cy) / (size * 0.78)
        for x in range(size):
            dx = (x - cx) / (size * 0.78)
            t = min(1.0, math.sqrt(dx * dx + dy * dy)) ** 1.15
            # 磨砂石：中心亮一档，边缘仍是深灰，不是纯黑
            g = 84 * (1 - t) + 36 * t
            px[x, y] = (int(g - 2), int(g), int(g + 1))

    fine = Image.frombytes("L", (size, size), rng.randbytes(size * size))
    fine = fine.filter(ImageFilter.GaussianBlur(0.4))
    coarse = Image.frombytes("L", (72, 72), rng.randbytes(72 * 72)).resize((size, size), Image.BILINEAR)
    coarse = coarse.filter(ImageFilter.GaussianBlur(18))
    base = px_img.convert("L")
    base = ImageChops.add(base, fine.point(lambda p: p // 18))
    base = ImageChops.subtract(base, Image.new("L", (size, size), 6))
    base = ImageChops.add(base, coarse.point(lambda p: p // 14))
    base = ImageChops.subtract(base, Image.new("L", (size, size), 8))
    return Image.merge("RGB", (base, base, base))


def songti_mask(size):
    """用宋体「几」定骨架，保证缩小后仍认得。"""
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    font = ImageFont.truetype(SONGTI, int(size * 0.70), index=0)
    bbox = draw.textbbox((0, 0), "几", font=font)
    x = (size - (bbox[2] - bbox[0])) / 2 - bbox[0]
    y = (size - (bbox[3] - bbox[1])) / 2 - bbox[1] - size * 0.012
    draw.text((x, y), "几", font=font, fill=255)
    return mask


def displace(mask, rng, amp, cells):
    """用低频噪声把轮廓推毛，细锋跟着走，不会被啃断。"""
    w, h = mask.size
    nx = Image.frombytes("L", (cells, cells), rng.randbytes(cells * cells)).resize((w, h), Image.BICUBIC)
    ny = Image.frombytes("L", (cells, cells), rng.randbytes(cells * cells)).resize((w, h), Image.BICUBIC)
    src, nxp, nyp = mask.load(), nx.load(), ny.load()
    out = Image.new("L", (w, h))
    op = out.load()
    for y in range(h):
        for x in range(w):
            dx = (nxp[x, y] - 128) / 128 * amp
            dy = (nyp[x, y] - 128) / 128 * amp
            xx = 0 if x + dx < 0 else (w - 1 if x + dx >= w else int(x + dx))
            yy = 0 if y + dy < 0 else (h - 1 if y + dy >= h else int(y + dy))
            op[x, y] = src[xx, yy]
    return out


def glyph_box(mask):
    w, h = mask.size
    px = mask.load()
    xs, ys = [], []
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            if px[x, y] > 200:
                xs.append(x)
                ys.append(y)
    return min(xs), max(xs), min(ys), max(ys)


def carve_feibai(mask, rng):
    """每笔腹部留两道两头收住的飞白，露出底色。"""
    w, h = mask.size
    px = mask.load()
    x0, x1, y0, y1 = glyph_box(mask)
    bw, bh = max(1, x1 - x0), max(1, y1 - y0)
    holes = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(holes)
    for v in (0.27, 0.44):
        y = int(y0 + bh * v)
        x = 0
        runs = []
        while x < w:
            if px[x, y] < 128:
                x += 1
                continue
            x2 = x + 1
            while x2 < w and px[x2, y] >= 128:
                x2 += 1
            runs.append((x, x2))
            x = x2
        for i, (a, b) in enumerate(runs):
            width = b - a
            if width < 40 or width > bw * 0.30:
                continue
            cy = y + rng.uniform(-18, 18)
            cx = (a + b) / 2 + rng.uniform(-width * 0.12, width * 0.12)
            gap_w = rng.uniform(5.5, 8.5)
            gap_h = rng.uniform(34, 58)
            steps = int(gap_h)
            for k in range(steps):
                t = k / max(1, steps - 1)
                fade = math.sin(t * math.pi)
                r = gap_w * 0.5 * fade
                yy = cy - gap_h / 2 + k
                xx = cx + math.sin(t * 5.2 + i) * 1.4
                draw.ellipse((xx - r, yy - 1.1, xx + r, yy + 1.1), fill=255)
    core = mask.filter(ImageFilter.MinFilter(11))
    holes = ImageChops.multiply(holes, core)
    holes = holes.point(lambda p: 255 if p > 24 else 0)
    return ImageChops.subtract(mask, holes)


def hook_tip(mask):
    """最后一笔：右下弯钩朝上的那个尖。尖下方隔一截才是肥厚的钩肚。"""
    w, h = mask.size
    px = mask.load()
    x0, x1, y0, y1 = glyph_box(mask)
    bw, bh = max(1, x1 - x0), max(1, y1 - y0)
    peaks = []
    y_start = y0 + int(bh * 0.45)
    y_end = y0 + int(bh * 0.75)
    x_start = x0 + int(bw * 0.62)
    for y in range(y_start, y_end):
        for x in range(x_start, x1):
            if px[x, y] < 200 or px[x, max(0, y - 3)] > 30:
                continue
            a = x
            while a > 0 and px[a - 1, y] > 200:
                a -= 1
            b = x
            while b < w - 1 and px[b + 1, y] > 200:
                b += 1
            if b - a > 18:
                continue
            yy = min(h - 1, y + 78)
            if px[x, yy] < 200:
                continue
            left = x
            while left > 0 and px[left - 1, yy] > 200:
                left -= 1
            right = x
            while right < w - 1 and px[right + 1, yy] > 200:
                right += 1
            if right - left < 48:
                continue
            peaks.append((y, -x))
            break
    if not peaks:
        return (x0 + int(bw * 0.78), y0 + int(bh * 0.62))
    peaks.sort()
    y, negx = peaks[0]
    return -negx, y


def splash(base, origin, rng):
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    ox, oy = origin
    # 顺着挑锋向上甩出的一小滴，带几粒更小的飞沫
    drops = [
        (0, 0, 9.5),
        (-7, -8, 4.2),
        (5, -5, 2.6),
        (-2, -14, 1.8),
        (8, 3, 1.5),
    ]
    for dx, dy, radius in drops:
        cx = ox + dx + rng.uniform(-0.8, 0.8)
        cy = oy + dy + rng.uniform(-0.8, 0.8)
        draw.ellipse(
            (cx - radius, cy - radius * 0.78, cx + radius * 0.95, cy + radius * 0.88),
            fill=(120, 22, 18, 150),
        )
        draw.ellipse(
            (cx - radius * 0.92, cy - radius * 0.72, cx + radius * 0.86, cy + radius * 0.78),
            fill=(211, 47, 47, 238),
        )
        if radius > 5:
            hr = radius * 0.34
            draw.ellipse(
                (cx - radius * 0.28 - hr, cy - radius * 0.32 - hr, cx - radius * 0.28 + hr, cy - radius * 0.32 + hr),
                fill=(230, 110, 100, 170),
            )
    return Image.alpha_composite(base.convert("RGBA"), overlay)


def render():
    rng = random.Random(7)
    mask = songti_mask(MASTER * 2).resize((MASTER, MASTER), Image.LANCZOS)
    mask = mask.point(lambda p: 255 if p > 140 else 0)
    # 毛边跟着笔锋走，幅度小，钩尖不会被挤掉
    mask = displace(mask, rng, amp=5.5, cells=34)
    mask = displace(mask, random.Random(19), amp=2.2, cells=70)
    mask = mask.point(lambda p: 255 if p > 128 else 0)
    tip_x, tip_y = hook_tip(mask)
    mask = carve_feibai(mask, random.Random(4))

    ground = frost(MASTER, random.Random(2))
    glow = mask.filter(ImageFilter.GaussianBlur(8)).point(lambda p: int(p * 0.12))
    moon = Image.new("RGBA", (MASTER, MASTER), (255, 255, 255, 0))
    moon.putalpha(glow)
    ink = Image.new("RGBA", (MASTER, MASTER), (246, 246, 246, 0))
    ink.putalpha(mask)
    icon = Image.alpha_composite(ground.convert("RGBA"), moon)
    icon = Image.alpha_composite(icon, ink)

    px = mask.load()
    x, y = tip_x, tip_y
    while y > 2 and px[x, y] > 40:
        y -= 1
    # 飞沫落在挑锋正前方
    icon = splash(icon, (x + 2, y - 6), random.Random(11))
    return icon


def write_svg(path):
    path.write_text(
        """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="知几">
  <defs>
    <radialGradient id="frost" cx="50%" cy="46%" r="70%">
      <stop offset="0%" stop-color="#4a4a4a"/>
      <stop offset="70%" stop-color="#323232"/>
      <stop offset="100%" stop-color="#242424"/>
    </radialGradient>
    <filter id="dry" x="-12%" y="-12%" width="124%" height="124%">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="0.9" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
  </defs>
  <rect width="64" height="64" fill="url(#frost)"/>
  <g fill="none" stroke="#f5f5f5" stroke-linecap="round" stroke-linejoin="round" filter="url(#dry)">
    <path d="M27.5 14.5c-.4 8-.8 18-3.2 28.5C21.2 51.5 16 57 11.5 60.5" stroke-width="5.4"/>
    <path d="M29 18.2h15.2c1.6-.2 3.6.4 4.4 2.4-.6 7-1.8 16-3.2 24.2-1.2 5.6-4.6 8.8-9.4 9.2" stroke-width="5.1"/>
  </g>
  <g fill="#d32f2f">
    <ellipse cx="33.2" cy="49.6" rx="1.55" ry="1.25"/>
    <circle cx="31.4" cy="50.8" r="0.55"/>
    <circle cx="34.6" cy="48.6" r="0.38"/>
  </g>
</svg>
""",
        encoding="utf-8",
    )


def main():
    icon = render()
    ASSETS.mkdir(exist_ok=True)
    png = ASSETS / "zhiji-icon.png"
    icon.convert("RGB").save(png, "PNG")
    write_svg(ASSETS / "zhiji-icon.svg")

    iconset = Path("/tmp/zhiji.iconset")
    if iconset.exists():
        shutil.rmtree(iconset)
    iconset.mkdir()
    slots = {
        "icon_16x16.png": 16,
        "icon_16x16@2x.png": 32,
        "icon_32x32.png": 32,
        "icon_32x32@2x.png": 64,
        "icon_128x128.png": 128,
        "icon_128x128@2x.png": 256,
        "icon_256x256.png": 256,
        "icon_256x256@2x.png": 512,
        "icon_512x512.png": 512,
        "icon_512x512@2x.png": 1024,
    }
    rgb = icon.convert("RGB")
    for name, size in slots.items():
        frame = rgb.resize((size, size), Image.LANCZOS)
        frame.save(iconset / name, "PNG")
    subprocess.check_call(
        ["iconutil", "-c", "icns", str(iconset), "-o", str(ASSETS / "zhiji.icns")]
    )
    shutil.rmtree(iconset)
    print(f"wrote {png}")
    print(f"wrote {ASSETS / 'zhiji.icns'}")


if __name__ == "__main__":
    main()
