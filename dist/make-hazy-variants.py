"""Make pre-blurred variants of a wallpaper (for the 'paint on the panel' mode,
where the haze is baked in instead of computed live by CSS blur()).

usage: python make-hazy-variants.py <src image> <out dir> [base name]
"""
import sys

from PIL import Image, ImageFilter

SRC = sys.argv[1]
OUTDIR = sys.argv[2]
BASE = sys.argv[3] if len(sys.argv) > 3 else 'hazy'

VARIANTS = [
    ('soft', 12, 1.00, 0.00),   # light haze, image clearly readable
    ('haze', 28, 0.97, 0.18),   # the balanced look
    ('heavy', 55, 0.93, 0.38),  # very misty, mostly colour
]
WIDTH = 1920

src = Image.open(SRC).convert('RGB')
ratio = WIDTH / src.width
if src.width > WIDTH:
    src = src.resize((WIDTH, max(1, round(src.height * ratio))), Image.LANCZOS)
print(f'source prepared: {src.width}x{src.height}')

for name, blur, brightness, wash in VARIANTS:
    img = src.filter(ImageFilter.GaussianBlur(blur))
    if brightness != 1.0:
        from PIL import ImageEnhance
        img = ImageEnhance.Brightness(img).enhance(brightness)
    if wash > 0:
        # A soft white veil on top, so it reads as mist rather than a blurred photo.
        veil = Image.new('RGB', img.size, (255, 250, 253))
        img = Image.blend(img, veil, wash)
    path = f'{OUTDIR}/bg-{name}-{blur}.jpg'
    img.save(path, quality=88, optimize=True)
    print(f'wrote {path}')
