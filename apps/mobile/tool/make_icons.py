"""Bastaa logo, app icons and Play Store graphics, all from one drawing.

The mark is a round lowercase "b" with a saffron dot in its bowl: a bright face, or a sun coming up.
Re-run after a change to the mark or the colours:  python3 apps/mobile/tool/make_icons.py
Needs Pillow and the Inter font (any bold sans works: change FONT).
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

BLUE, SAFFRON, INK = '#2F6FEB', '#F7A400', '#0F172A'
FONT = '/usr/share/fonts/opentype/inter/InterDisplay-Bold.otf'
NAME, TAGLINE = 'Bastaa', 'School, in your pocket'
here = Path(__file__).resolve().parent
root = here.parent.parent.parent
res = here.parent / 'android/app/src/main/res'
store = root / 'docs/play-store'
brand = root / 'docs/brand'
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
SS = 4  # draw big, then shrink: smooth edges without an SVG renderer

# The "b" inside a unit square: stem, bowl (a ring as thick as the stem) and the dot.
STEM = (0.265, 0.17, 0.405, 0.665)  # ends inside the bowl, so the bottom is one clean curve
BOWL = (0.5, 0.595, 0.235, 0.095)  # centre x, centre y, outer radius, inner radius
DOT = 0.062


def draw_mark(img, box, ink='white', dot=SAFFRON, hole=(0, 0, 0, 0)):
    """The "b" scaled into box (x0, y0, x1, y1) of an RGBA image."""
    x0, y0, x1, y1 = box
    s = x1 - x0
    d = ImageDraw.Draw(img)
    p = lambda v: v * s
    sx0, sy0, sx1, sy1 = STEM
    d.rounded_rectangle((x0 + p(sx0), y0 + p(sy0), x0 + p(sx1), y0 + p(sy1)), radius=p((sx1 - sx0) / 2), fill=ink)
    cx, cy, ro, ri = BOWL
    d.ellipse((x0 + p(cx - ro), y0 + p(cy - ro), x0 + p(cx + ro), y0 + p(cy + ro)), fill=ink)
    d.ellipse((x0 + p(cx - ri), y0 + p(cy - ri), x0 + p(cx + ri), y0 + p(cy + ri)), fill=hole)
    d.ellipse((x0 + p(cx - DOT), y0 + p(cy - DOT), x0 + p(cx + DOT), y0 + p(cy + DOT)), fill=dot)


def render(px, paint):
    """Draw at SS× with paint(img, size), then shrink to px×px."""
    big = Image.new('RGBA', (px * SS, px * SS), (0, 0, 0, 0))
    paint(big, px * SS)
    return big.resize((px, px), Image.LANCZOS)


def tile(px, radius=0.22, inset=0.0, bg=BLUE):
    def paint(img, size):
        pad = round(size * inset)
        inner = size - 2 * pad
        ImageDraw.Draw(img).rounded_rectangle((pad, pad, size - pad - 1, size - pad - 1), radius=round(inner * radius), fill=bg)
        draw_mark(img, (pad, pad, size - pad, size - pad), hole=bg)
    return render(px, paint)


def square(px, bg=BLUE, scale=1.0):
    """Full-bleed square (Play icon, maskable web icon): the platform rounds it."""
    def paint(img, size):
        ImageDraw.Draw(img).rectangle((0, 0, size, size), fill=bg)
        m = (size - size * scale) / 2
        draw_mark(img, (m, m, size - m, size - m), hole=bg)
    return render(px, paint)


def svg_mark(bg=BLUE, radius=0.22, size=512):
    """The same drawing as SVG, for the website and print."""
    s = size
    sx0, sy0, sx1, sy1 = STEM
    cx, cy, ro, ri = BOWL
    r = (sx1 - sx0) / 2
    f = lambda v: f'{v * s:.1f}'.rstrip('0').rstrip('.')
    bowl = (f'M{f(cx - ro)} {f(cy)}a{f(ro)} {f(ro)} 0 1 0 {f(2 * ro)} 0a{f(ro)} {f(ro)} 0 1 0 {f(-2 * ro)} 0z'
            f'M{f(cx - ri)} {f(cy)}a{f(ri)} {f(ri)} 0 1 1 {f(2 * ri)} 0a{f(ri)} {f(ri)} 0 1 1 {f(-2 * ri)} 0z')
    back = f'<rect width="{s}" height="{s}" rx="{f(radius)}" fill="{bg}"/>' if bg else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {s} {s}">{back}'
            f'<rect x="{f(sx0)}" y="{f(sy0)}" width="{f(sx1 - sx0)}" height="{f(sy1 - sy0)}" rx="{f(r)}" fill="#fff"/>'
            f'<path d="{bowl}" fill="#fff" fill-rule="evenodd"/>'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(DOT)}" fill="{SAFFRON}"/></svg>\n')


# Android launcher icons.
for name, scale in DENSITIES.items():
    folder = res / f'mipmap-{name}'
    folder.mkdir(exist_ok=True)
    # Older Android: the whole icon, with a little margin like other launcher icons.
    tile(round(48 * scale), inset=0.04).save(folder / 'ic_launcher.png')
    # Android 8+: the launcher crops a 108dp layer to its own shape; keep the mark in the middle 66dp.
    side = round(108 * scale)
    render(side, lambda img, size: draw_mark(img, (size * 0.2, size * 0.2, size * 0.8, size * 0.8))).save(folder / 'ic_launcher_foreground.png')

(res / 'mipmap-anydpi-v26').mkdir(exist_ok=True)
(res / 'mipmap-anydpi-v26/ic_launcher.xml').write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n'
    '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
    '    <background android:drawable="@color/ic_launcher_background"/>\n'
    '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
    '    <monochrome android:drawable="@mipmap/ic_launcher_foreground"/>\n'
    '</adaptive-icon>\n'
)
(res / 'values/colors.xml').write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
    f'    <color name="ic_launcher_background">{BLUE}</color>\n</resources>\n'
)

# Flutter web (the app in a browser).
web = here.parent / 'web'
tile(64, inset=0.02).save(web / 'favicon.png')
for px in (192, 512):
    tile(px, inset=0.04).save(web / f'icons/Icon-{px}.png')
    square(px, scale=0.8).save(web / f'icons/Icon-maskable-{px}.png')

# Play Store listing: 512×512 icon (Play rounds the corners itself) and the 1024×500 feature graphic.
store.mkdir(parents=True, exist_ok=True)
square(512).convert('RGB').save(store / 'icon-512.png')

feature = Image.new('RGB', (1024, 500), BLUE)
badge = render(180, lambda img, size: (ImageDraw.Draw(img).rounded_rectangle((0, 0, size - 1, size - 1), radius=round(size * 0.24), fill='white'),
                                       draw_mark(img, (0, 0, size, size), ink=BLUE, hole='white')))
feature.paste(badge, (110, 160), badge)
draw = ImageDraw.Draw(feature)
draw.text((330, 168), NAME, font=ImageFont.truetype(FONT, 104), fill='white')
draw.text((334, 296), TAGLINE, font=ImageFont.truetype(FONT, 40), fill='#DCE6FD')
feature.save(store / 'feature-graphic.png')

# Brand kit: the mark (SVG + PNG) and the logo with the name, for letters, slides and the website.
brand.mkdir(parents=True, exist_ok=True)
(brand / 'bastaa-mark.svg').write_text(svg_mark())
tile(1024).save(brand / 'bastaa-mark.png')
for label, ink in (('bastaa-logo.png', INK), ('bastaa-logo-white.png', 'white')):
    font = ImageFont.truetype(FONT, 260 * SS // 2)
    logo = Image.new('RGBA', (1500 * SS // 2, 400 * SS // 2), (0, 0, 0, 0))
    mark = tile(320 * SS // 2)
    logo.alpha_composite(mark, (40 * SS // 2, 40 * SS // 2))
    d = ImageDraw.Draw(logo)
    l, t, r, b = d.textbbox((0, 0), 'bastaa', font=font)
    d.text((410 * SS // 2 - l, 200 * SS // 2 - (b + t) / 2), 'bastaa', font=font, fill=ink)
    logo.crop((0, 0, 410 * SS // 2 + (r - l) + 40 * SS // 2, logo.height)).resize(((410 + (r - l) * 2 // SS + 40), 400), Image.LANCZOS).save(brand / label)
print('logo, icons and store graphics written')
