#!/usr/bin/env python3
"""生成带 GPS / 拍摄日期 EXIF 的示例照片，用于体验或压测（需要 Pillow：pip install pillow）。

用法：python3 scripts/make-sample-photos.py [输出目录=./sample-photos] [数量=24]
"""
import math
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFilter

PLACES = [
    ("hangzhou", 30.2590, 120.1388),
    ("tokyo", 35.6595, 139.7005),
    ("paris", 48.8584, 2.2945),
    ("newyork", 40.7580, -73.9855),
    ("sydney", -33.8568, 151.2153),
    ("reykjavik", 64.1466, -21.9426),
    ("lisbon", 38.7139, -9.1394),
    ("cairo", 30.0444, 31.2357),
]
SIZES = [(1600, 1067), (1067, 1600), (1500, 1500), (1800, 1012)]


def dms(value):
    value = abs(value)
    d = int(value)
    m = int((value - d) * 60)
    s = (value - d - m / 60) * 3600
    return (d, m, round(s * 1000) / 1000)


def make_image(rng, size, seed):
    w, h = size
    sw, sh = w // 8, h // 8  # 先画小图再放大，生成速度快很多
    img = Image.new("RGB", (sw, sh))
    px = img.load()
    h0 = rng.random()
    for y in range(sh):
        for x in range(sw):
            t = y / sh
            u = x / sw
            r = int(255 * (0.35 + 0.45 * math.sin((h0 + u) * 3.1 + t)))
            g = int(255 * (0.40 + 0.40 * math.sin((h0 + t) * 2.3 + u * 2)))
            b = int(255 * (0.55 + 0.35 * math.cos((h0 + u + t) * 2.0)))
            px[x, y] = (max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b)))
    img = img.resize(size, Image.BICUBIC)
    d = ImageDraw.Draw(img, "RGBA")
    for _ in range(9):
        cx, cy = rng.randint(0, w), rng.randint(0, h)
        rad = rng.randint(min(w, h) // 12, min(w, h) // 4)
        d.ellipse((cx - rad, cy - rad, cx + rad, cy + rad), fill=(255, 255, 255, rng.randint(20, 70)))
    return img.filter(ImageFilter.GaussianBlur(1.5))


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "sample-photos"
    count = int(sys.argv[2]) if len(sys.argv) > 2 else 24
    os.makedirs(out, exist_ok=True)
    rng = random.Random(7)
    for i in range(count):
        name, lat, lon = PLACES[i % len(PLACES)]
        lat += rng.uniform(-0.01, 0.01)
        lon += rng.uniform(-0.01, 0.01)
        size = SIZES[i % len(SIZES)]
        img = make_image(rng, size, i)
        exif = Image.Exif()
        month = 1 + (i * 5) % 12
        day = 1 + (i * 7) % 28
        exif[0x010F] = "GeoPhotoGraph"
        exif[0x0110] = "Sample"
        if i % 13 == 12:  # 带 EXIF 方向（竖拍）的照片，用于验证自动旋转
            exif[0x0112] = 6
        ifd = exif.get_ifd(0x8769)
        ifd[0x9003] = f"2024:{month:02d}:{day:02d} {8 + i % 10:02d}:{(i * 7) % 60:02d}:00"
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
