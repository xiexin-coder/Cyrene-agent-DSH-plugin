"""Second pass: background fill + largest-component keep + chroma-based watermark removal.

The watermark ("米游社@diq897") is mid-grey; the artwork is saturated pink/blue,
its outlines near-black and its fills near-white. So inside the bottom-right
region only, drop low-chroma mid-brightness pixels — that removes grey glyphs
without touching hair (saturated) or outlines (near-black).
"""
import sys

import numpy as np
from PIL import Image, ImageDraw

src, dst = sys.argv[1], sys.argv[2]
max_size = int(sys.argv[3]) if len(sys.argv) > 3 else 1024

im = Image.open(src).convert("RGBA")
w, h = im.size
seeds = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]
for seed in seeds:
    if im.getpixel(seed)[3] != 0:
        ImageDraw.floodfill(im, seed, (0, 0, 0, 0), thresh=48)

arr = np.array(im)
alpha = arr[:, :, 3]

# --- largest connected component (row runs + union-find) ---
mask = alpha > 0
parent = {}


def find(x):
    while parent[x] != x:
        parent[x] = parent[parent[x]]
        x = parent[x]
    return x


runs, nid = [], 0
for y in range(h):
    row = mask[y]
    row_runs = []
    if row.any():
        d = np.diff(row.astype(np.int8))
        starts = list(np.where(d == 1)[0] + 1)
        ends = list(np.where(d == -1)[0] + 1)
        if row[0]:
            starts.insert(0, 0)
        if row[-1]:
            ends.append(w)
        for s, e in zip(starts, ends):
            parent[nid] = nid
            row_runs.append((s, e, nid))
            nid += 1
    runs.append(row_runs)
for y in range(1, h):
    for s, e, rid in runs[y]:
        for ps, pe, pid in runs[y - 1]:
            if ps < e and s < pe:
                a, b = find(rid), find(pid)
                if a != b:
                    parent[b] = a
sizes = {}
for row_runs in runs:
    for s, e, rid in row_runs:
        root = find(rid)
        sizes[root] = sizes.get(root, 0) + (e - s)
keep = max(sizes.items(), key=lambda kv: kv[1])[0]
keep_mask = np.zeros((h, w), dtype=bool)
for y, row_runs in enumerate(runs):
    for s, e, rid in row_runs:
        if find(rid) == keep:
            keep_mask[y, s:e] = True
print(f"components: {len(sizes)}; kept {int(keep_mask.sum())} px")

# --- watermark removal: detect grey glyphs in the bottom-right, then dilate ---
rgb = arr[:, :, :3].astype(np.int16)
lum = rgb.mean(axis=2)
chroma = rgb.max(axis=2) - rgb.min(axis=2)
region = np.zeros((h, w), dtype=bool)
region[int(h * 0.85):, int(w * 0.72):] = True
sample = (alpha > 0) & region
print("bottom-right region colour stats (opaque px):")
for label, sel in {
    "grey-ish (chroma<18, 60<lum<240)": sample & (chroma < 18) & (lum > 60) & (lum < 240),
    "very bright (lum>=240)": sample & (lum >= 240),
    "near black (lum<=60)": sample & (lum <= 60),
    "saturated (chroma>=40)": sample & (chroma >= 40),
}.items():
    print(f"  {label}: {int(sel.sum())}")
probe = sample & (chroma < 18)
if probe.any():
    vals = rgb[probe]
    print(f"  grey sample mean RGB: {vals.mean(axis=0).round(0)}")

wm = sample & (chroma < 18) & (lum > 60) & (lum < 240)
for _ in range(3):
    wm = wm | np.roll(wm, 1, 0) | np.roll(wm, -1, 0) | np.roll(wm, 1, 1) | np.roll(wm, -1, 1)
arr[:, :, 3] = np.where(wm, 0, arr[:, :, 3])
print(f"watermark px cleared (after dilation): {int(wm.sum())}")

# --- crop to subject, pad square, resize ---
alpha = arr[:, :, 3]
ys, xs = np.where(alpha > 0)
box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
print(f"subject bbox {box} ({box[2] - box[0]}x{box[3] - box[1]})")
out = Image.fromarray(arr).crop(box)
side = max(out.size)
pad = int(side * 0.04)
canvas = Image.new("RGBA", (side + 2 * pad, side + 2 * pad), (0, 0, 0, 0))
canvas.paste(out, ((canvas.width - out.width) // 2, (canvas.height - out.height) // 2), out)
if canvas.width > max_size:
    canvas = canvas.resize((max_size, max_size), Image.LANCZOS)
canvas.save(dst)
final = np.array(canvas)
print(f"wrote {dst} {canvas.width}x{canvas.height}; transparent border ok: "
      f"{int((final[:20, :, 3] > 0).sum() + (final[-20:, :, 3] > 0).sum() + (final[:, :20, 3] > 0).sum() + (final[:, -20:, 3] > 0).sum()) == 0}")
