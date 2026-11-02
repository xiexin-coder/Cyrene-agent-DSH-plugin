"""Check whether the base picture and the complete picture share the same framing.

Takes the centre strip of each (the part that exists in both), then slides one over the
other to find the integer offset with the smallest difference. Offset (0,0) means the two
pictures are framed identically — which is what makes the side-band overlay line up.
"""
import sys

import numpy as np
from PIL import Image

BASE, OVERLAY = sys.argv[1], sys.argv[2]
WIDTH = 1200


def load(path):
    img = Image.open(path).convert('L')
    height = max(1, round(img.height * WIDTH / img.width))
    return np.asarray(img.resize((WIDTH, height), Image.LANCZOS), dtype=np.float32)


base = load(BASE)
overlay = load(OVERLAY)
print(f'base    {base.shape[1]}x{base.shape[0]}')
print(f'overlay {overlay.shape[1]}x{overlay.shape[0]}')

# Compare the centre strip only: that region carries the shared composition.
h = min(base.shape[0], overlay.shape[0])
x0, x1 = int(WIDTH * 0.35), int(WIDTH * 0.65)
y0, y1 = int(h * 0.25), int(h * 0.75)
patch = base[y0:y1, x0:x1]

best = None
for dy in range(-40, 41, 2):
    for dx in range(-40, 41, 2):
        oy, ox = y0 + dy, x0 + dx
        if oy < 0 or ox < 0 or oy + patch.shape[0] > overlay.shape[0] or ox + patch.shape[1] > overlay.shape[1]:
            continue
        diff = float(np.abs(overlay[oy : oy + patch.shape[0], ox : ox + patch.shape[1]] - patch).mean())
        if best is None or diff < best[0]:
            best = (diff, dx, dy)

print(f'centre strip mean |diff| at zero offset : {float(np.abs(overlay[y0:y1, x0:x1] - patch).mean()):.2f}')
print(f'best match: diff={best[0]:.2f} at dx={best[1]}px dy={best[2]}px (at 1200px width)')
verdict = 'FRAMING MATCHES (offset is within a couple of pixels)' if abs(best[1]) <= 4 and abs(best[2]) <= 4 else 'FRAMING DIFFERS - the overlay would need an offset/scale correction'
print('verdict:', verdict)
