"""Generate a soft, hazy pink/violet wallpaper placeholder (no copyright concerns).

usage: python make-wallpaper.py <out.png> [width] [height]
"""
import sys

import numpy as np
from PIL import Image, ImageFilter

OUT = sys.argv[1]
W = int(sys.argv[2]) if len(sys.argv) > 2 else 2560
H = int(sys.argv[3]) if len(sys.argv) > 3 else 1440

rng = np.random.default_rng(20261007)

# Smooth organic blobs: tiny random field, hugely upscaled + blurred.
field = Image.fromarray((rng.random((26, 46)) * 255).astype("uint8"))
field = field.resize((W, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(140))
a = np.asarray(field).astype(np.float32) / 255.0

# Vertical gradient: pearl white at the top, warmer pink at the bottom.
y = np.linspace(0.0, 1.0, H, dtype=np.float32)[:, None]
r = 246 + 6 * a - 12 * y
g = 224 + 22 * a - 26 * y
b = 240 + 10 * a - 4 * y

# Two soft glows to give it depth.
def glow(cx, cy, radius, strength, tint):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.sqrt(((xx - cx * W) / (radius * W)) ** 2 + ((yy - cy * H) / (radius * H)) ** 2)
    f = np.clip(1.0 - d, 0.0, 1.0) ** 2 * strength
    return f[..., None] * np.array(tint, dtype=np.float32)

g1 = glow(0.24, 0.30, 0.55, 0.55, [255, 255, 255])
g2 = glow(0.78, 0.72, 0.60, 0.45, [255, 210, 232])
rgb = np.stack([r, g, b], axis=-1) * (1.0 - g1[..., 0:1] * 0) + g1 * 0  # keep shape explicit
rgb = np.stack([r, g, b], axis=-1)
rgb = rgb * (1.0 - (g1 + g2) * 0.35) + (g1 + g2) * 0.35 * 255

rgb = np.clip(rgb, 0, 255).astype(np.uint8)
img = Image.fromarray(rgb, "RGB").filter(ImageFilter.GaussianBlur(2))
img.save(OUT, optimize=True)
print(f"wrote {OUT} ({W}x{H})")
