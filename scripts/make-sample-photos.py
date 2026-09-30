#!/usr/bin/env python3
"""生成带 GPS / 拍摄日期 / 相机与曝光参数 EXIF 的示例照片，用于体验或压测（需要 Pillow：pip install pillow）。

每个地点对应一种程序化绘制的风景（湖光山色、城市天际线、极光、沙漠等），
方便直观检查模板排版。

用法：python3 scripts/make-sample-photos.py [输出目录=./sample-photos] [数量=24]
"""
import math
import os
import random
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter
from PIL.TiffImagePlugin import IFDRational

PLACES = [
    ("hangzhou", 30.2590, 120.1388, "lake"),
    ("tokyo", 35.6595, 139.7005, "city"),
    ("paris", 48.8584, 2.2945, "dusk"),
    ("newyork", 40.7580, -73.9855, "city"),
    ("sydney", -33.8568, 151.2153, "sea"),
    ("reykjavik", 64.1466, -21.9426, "aurora"),
    ("lisbon", 38.7139, -9.1394, "sunset"),
    ("cairo", 30.0444, 31.2357, "desert"),
]
SIZES = [(1600, 1067), (1067, 1600), (1500, 1500), (1800, 1012)]
CAMERAS = [("Apple", "iPhone 15 Pro"), ("Apple", "iPhone 13 mini"), ("SONY", "ILCE-7M4"), ("FUJIFILM", "X100V")]
# 与 CAMERAS 对应：焦距 (分子, 分母)、等效 35mm 焦距、光圈 (分子, 分母)
LENSES = [((676, 100), 24, (178, 100)), ((510, 100), 26, (16, 10)), ((35, 1), 35, (28, 10)), ((23, 1), 35, (2, 1))]
SHUTTERS = [60, 120, 250, 500, 1000]
ISOS = [50, 100, 200, 400]

PALETTES = {
    "lake": [(142, 184, 214), (236, 210, 170)],
    "city": [(28, 32, 74), (232, 124, 92)],
    "dusk": [(62, 72, 138), (246, 180, 140)],
    "sea": [(64, 146, 214), (196, 228, 246)],
    "aurora": [(6, 10, 30), (18, 40, 70)],
    "sunset": [(92, 58, 128), (252, 166, 88)],
    "desert": [(120, 170, 220), (246, 222, 180)],
}


def dms(value):
    value = abs(value)
    d = int(value)
    m = int((value - d) * 60)
    s = (value - d - m / 60) * 3600
    return (d, m, round(s * 1000) / 1000)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(draw, w, y0, y1, top, bottom):
    for y in range(y0, y1):
        t = (y - y0) / max(1, y1 - y0 - 1)
        draw.line([(0, y), (w, y)], fill=lerp(top, bottom, t))


def ridge(rng, w, base, rough, steps=9):
    """中点位移生成山脊线。"""
    pts = [base + rng.uniform(-rough, rough), base + rng.uniform(-rough, rough)]
    amp = rough
    for _ in range(steps):
        nxt = []
        for i in range(len(pts) - 1):
            nxt.append(pts[i])
            nxt.append((pts[i] + pts[i + 1]) / 2 + rng.uniform(-amp, amp))
        nxt.append(pts[-1])
        pts = nxt
        amp *= 0.55
    step = w / (len(pts) - 1)
    return [(i * step, y) for i, y in enumerate(pts)]


def mountains(draw, rng, w, h, horizon, layers, near, far):
    for i in range(layers):
        t = i / max(1, layers - 1)
        color = lerp(far, near, t)
        base = horizon - h * (0.2 - 0.12 * t)
        line = ridge(rng, w, base, h * (0.1 - 0.04 * t))
        draw.polygon(line + [(w, horizon), (0, horizon)], fill=color)


def sun(img, cx, cy, r, color, glow=3.2):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for k in range(10, 0, -1):
        rr = r * (1 + glow * k / 10)
        d.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), fill=color + (int(10 + 6 * (10 - k)),))
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=color + (255,))
    layer = layer.filter(ImageFilter.GaussianBlur(r * 0.35))
    img.alpha_composite(layer)


def water(img, horizon, tint, rng):
    w, h = img.size
    top = img.crop((0, max(0, 2 * horizon - h), w, horizon)).transpose(Image.FLIP_TOP_BOTTOM)
    top = top.resize((w, h - horizon))
    shade = Image.new("RGBA", top.size, tint + (120,))
    top.alpha_composite(shade)
    d = ImageDraw.Draw(top, "RGBA")
    for _ in range(int((h - horizon) / 3)):
        y = rng.uniform(0, h - horizon)
        x = rng.uniform(-w * 0.2, w)
        d.line([(x, y), (x + rng.uniform(w * 0.05, w * 0.3), y)], fill=(255, 255, 255, rng.randint(8, 30)), width=1)
    img.paste(top.filter(ImageFilter.GaussianBlur(1.2)), (0, horizon))


def skyline(draw, rng, w, h, ground, color, windows):
    x = -10
    while x < w:
        bw = rng.uniform(w * 0.04, w * 0.1)
        bh = rng.uniform(h * 0.12, h * 0.45)
        draw.rectangle((x, ground - bh, x + bw, ground), fill=color)
        if rng.random() < 0.25:
            draw.rectangle((x + bw * 0.4, ground - bh - h * 0.04, x + bw * 0.5, ground - bh), fill=color)
        wx = x + 4
        while wx < x + bw - 6:
            wy = ground - bh + 8
            while wy < ground - 6:
                if rng.random() < 0.35:
                    draw.rectangle((wx, wy, wx + 3, wy + 4), fill=windows)
                wy += 11
            wx += 8
        x += bw + rng.uniform(0, w * 0.01)


def scene(kind, size, rng):
    w, h = size
    img = Image.new("RGBA", size)
    d = ImageDraw.Draw(img, "RGBA")
    top, bottom = PALETTES[kind]
    if kind in ("lake", "sunset", "dusk"):
        horizon = int(h * rng.uniform(0.55, 0.64))
        gradient(d, w, 0, horizon, top, bottom)
        sun(img, w * rng.uniform(0.25, 0.75), horizon - h * rng.uniform(0.08, 0.2), min(w, h) * 0.05, (255, 236, 200))
        d = ImageDraw.Draw(img, "RGBA")
        near = (44, 58, 70) if kind == "lake" else (58, 36, 70)
        mountains(d, rng, w, h, horizon, 4, near, lerp(bottom, top, 0.45))
        water(img, horizon, lerp(top, (20, 30, 50), 0.5), rng)
    elif kind == "city":
        ground = int(h * 0.86)
        gradient(d, w, 0, ground, top, bottom)
        for _ in range(80):
            x, y = rng.uniform(0, w), rng.uniform(0, h * 0.4)
            d.point((x, y), fill=(255, 255, 255, rng.randint(80, 200)))
        skyline(d, rng, w, h, ground, (40, 36, 60), (255, 210, 140, 200))
        skyline(d, rng, w, h, ground + 6, (18, 18, 30), (255, 196, 110, 230))
        gradient(d, w, ground, h, (18, 18, 30), (8, 8, 14))
    elif kind == "sea":
        horizon = int(h * 0.5)
        gradient(d, w, 0, horizon, top, bottom)
        for _ in range(7):
            cx, cy = rng.uniform(0, w), rng.uniform(h * 0.08, h * 0.35)
            for k in range(6):
                rx, ry = rng.uniform(40, 110), rng.uniform(16, 34)
                ox, oy = rng.uniform(-80, 80), rng.uniform(-14, 14)
                d.ellipse((cx + ox - rx, cy + oy - ry, cx + ox + rx, cy + oy + ry), fill=(255, 255, 255, 70))
        gradient(d, w, horizon, int(h * 0.8), (24, 96, 150), (70, 170, 190))
        gradient(d, w, int(h * 0.8), h, (232, 214, 176), (214, 190, 150))
        for i in range(12):
            y = int(h * 0.8) - i * 2
            d.line([(0, y), (w, y + rng.uniform(-3, 3))], fill=(255, 255, 255, 60), width=2)
    elif kind == "aurora":
        gradient(d, w, 0, h, top, bottom)
        for _ in range(260):
            x, y = rng.uniform(0, w), rng.uniform(0, h * 0.7)
            s = rng.choice([1, 1, 1, 2])
            d.ellipse((x, y, x + s, y + s), fill=(255, 255, 255, rng.randint(90, 230)))
        glow = Image.new("RGBA", size, (0, 0, 0, 0))
        g = ImageDraw.Draw(glow)
        for band in range(2):
            base = h * (0.2 + band * 0.14)
            color = [(70, 255, 170), (120, 170, 255)][band]
            for x in range(0, w, 3):
                y = base + math.sin(x / w * 5.1 + band * 2) * h * 0.08
                length = h * (0.08 + 0.1 * (0.5 + 0.5 * math.sin(x / w * 17 + band)))
                g.line([(x, y), (x, y + length)], fill=color + (int(40 + 40 * rng.random()),), width=3)
        img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(9)))
        d = ImageDraw.Draw(img, "RGBA")
        mountains(d, rng, w, h, int(h * 0.9), 3, (14, 22, 34), (40, 58, 82))
        snow = ridge(rng, w, h * 0.88, h * 0.02)
        d.polygon(snow + [(w, h), (0, h)], fill=(196, 210, 228))
    else:  # desert
        horizon = int(h * 0.6)
        gradient(d, w, 0, horizon, top, bottom)
        sun(img, w * 0.78, h * 0.18, min(w, h) * 0.045, (255, 250, 230), glow=2.2)
        d = ImageDraw.Draw(img, "RGBA")
        px = w * rng.uniform(0.2, 0.45)
        for k, (ow, oh) in enumerate([(0.34, 0.26), (0.22, 0.17)]):
            bx = px + k * w * 0.3
            d.polygon([(bx - w * ow / 2, horizon), (bx, horizon - h * oh), (bx + w * ow / 2, horizon)], fill=(196, 150, 96))
            d.polygon([(bx, horizon - h * oh), (bx + w * ow / 2, horizon), (bx + w * ow * 0.1, horizon)], fill=(160, 112, 66))
        for i in range(5):
            base = horizon + (h - horizon) * (i / 5)
            color = lerp((226, 180, 120), (186, 128, 70), i / 4)
            pts = [(x, base + math.sin(x / w * 4 + i * 1.7) * h * 0.03) for x in range(0, w + 20, 20)]
            d.polygon(pts + [(w, h), (0, h)], fill=color)
    rgb = img.convert("RGB")
    # 暗角 + 颗粒，让画面更接近真实照片
    vignette = Image.radial_gradient("L").resize(size)
    rgb = ImageChops.multiply(rgb, Image.merge("RGB", [vignette.point(lambda v: 255 - int(v * 0.35))] * 3))
    noise = Image.effect_noise((w // 2, h // 2), 18).resize(size).convert("RGB")
    rgb = Image.blend(rgb, ImageChops.overlay(rgb, noise), 0.18)
    return rgb


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "sample-photos"
    count = int(sys.argv[2]) if len(sys.argv) > 2 else 24
    os.makedirs(out, exist_ok=True)
    rng = random.Random(7)
    for i in range(count):
        name, lat, lon, kind = PLACES[i % len(PLACES)]
        lat += rng.uniform(-0.01, 0.01)
        lon += rng.uniform(-0.01, 0.01)
        size = SIZES[i % len(SIZES)]
        rotated = i % 13 == 12  # 带 EXIF 方向（竖拍）的照片，用于验证自动旋转
        img = scene(kind, (size[1], size[0]) if rotated else size, rng)
        if rotated:
            img = img.rotate(90, expand=True)
        exif = Image.Exif()
        month = 1 + (i * 5) % 12
        day = 1 + (i * 7) % 28
        make, model = CAMERAS[i % len(CAMERAS)]
        exif[0x010F] = make
        exif[0x0110] = model
        if rotated:
            exif[0x0112] = 6
        ifd = exif.get_ifd(0x8769)
        ifd[0x9003] = f"2024:{month:02d}:{day:02d} {8 + i % 10:02d}:{(i * 7) % 60:02d}:00"
        if i % 7 != 6:  # 每 7 张中有 1 张没有曝光参数（如扫描件 / 截图）
            focal, focal35, fnum = LENSES[i % len(LENSES)]
            ifd[0x829A] = IFDRational(1, SHUTTERS[i % len(SHUTTERS)])
            ifd[0x829D] = IFDRational(*fnum)
            ifd[0x8827] = ISOS[i % len(ISOS)]
            ifd[0x920A] = IFDRational(*focal)
            ifd[0xA405] = focal35
        if i % 11 != 10:  # 每 11 张中有 1 张没有 GPS
            gps = exif.get_ifd(0x8825)
            gps[1] = "N" if lat >= 0 else "S"
            gps[2] = dms(lat)
            gps[3] = "E" if lon >= 0 else "W"
            gps[4] = dms(lon)
        path = os.path.join(out, f"{name}-{i + 1:03d}.jpg")
        img.save(path, "JPEG", quality=88, exif=exif)
    print(f"已生成 {count} 张示例照片 -> {out}")


if __name__ == "__main__":
    main()
