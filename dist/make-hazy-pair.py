"""Make matched pre-blurred pairs: base picture + complete picture.

Both are normalised to ONE common width first, then blurred with the SAME radius, so the
side bands of the overlay end up exactly as hazy as the base they are painted onto —
otherwise the sidebar area shows a softer/sharped patch and the seam is visible.

usage: python make-hazy-pair.py <base image> <complete image> <out dir>
"""
import sys

from PIL import Image, ImageEnhance, ImageFilter

BASE_SRC, OVERLAY_SRC, OUTDIR = sys.argv[1], sys.argv[2], sys.argv[3]

COMMON_WIDTH = 1600
VARIANTS = [
    ('crisp', 0, 1.00, 0.00),
    ('soft', 12, 1.00, 0.00),
    ('haze', 28, 0.97, 0.18),
    ('heavy', 55, 0.93, 0.38),
]


def prepare(path):
    img = Image.open(path).convert('RGB')
    if img.width != COMMON_WIDTH:
        height = max(1, round(img.height * COMMON_WIDTH / img.width))
        img = img.resize((COMMON_WIDTH, height), Image.LANCZOS)
    return img


base = prepare(BASE_SRC)
overlay = prepare(OVERLAY_SRC)
print(f'base    normalised: {base.width}x{base.height}  (from {BASE_SRC})')
print(f'overlay normalised: {overlay.width}x{overlay.height}  (from {OVERLAY_SRC})')


def render(img, blur, brightness, wash):
    out = img.filter(ImageFilter.GaussianBlur(blur)) if blur > 0 else img.copy()
    if brightness != 1.0:
        out = ImageEnhance.Brightness(out).enhance(brightness)
    if wash > 0:
        veil = Image.new('RGB', out.size, (255, 250, 253))
        out = Image.blend(out, veil, wash)
    return out


for name, blur, brightness, wash in VARIANTS:
    for label, source in (('base', base), ('overlay', overlay)):
        path = f'{OUTDIR}/{label}-{name}.jpg'
        render(source, blur, brightness, wash).save(path, quality=88, optimize=True)
        print(f'wrote {path}')
