"""App icon and Play Store graphics: a white "S" on the SchoolOS blue, like the sign-in screen.

Re-run after a rename or a new brand colour:  python3 apps/mobile/tool/make_icons.py
Needs Pillow and the Inter font (any bold sans works: change FONT).
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

BLUE = '#2F6FEB'
FONT = '/usr/share/fonts/opentype/inter/InterDisplay-Bold.otf'
NAME, TAGLINE = 'SchoolOS', 'For parents and teachers'
here = Path(__file__).resolve().parent
res = here.parent / 'android/app/src/main/res'
store = here.parent.parent.parent / 'docs/play-store'
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}


def letter(img, size, box):
    draw = ImageDraw.Draw(img)
    font = ImageFont.truetype(FONT, size)
    l, t, r, b = draw.textbbox((0, 0), 'S', font=font)
    x0, y0, x1, y1 = box
    draw.text(((x0 + x1 - (r - l)) / 2 - l, (y0 + y1 - (b - t)) / 2 - t), 'S', font=font, fill='white')


def rounded(px, radius=0.22, inset=0.0):
    img = Image.new('RGBA', (px, px), (0, 0, 0, 0))
    pad = round(px * inset)
    ImageDraw.Draw(img).rounded_rectangle((pad, pad, px - pad - 1, px - pad - 1), radius=round((px - 2 * pad) * radius), fill=BLUE)
    letter(img, round((px - 2 * pad) * 0.62), (pad, pad, px - pad, px - pad))
    return img


for name, scale in DENSITIES.items():
    folder = res / f'mipmap-{name}'
    folder.mkdir(exist_ok=True)
    # Older Android: the whole icon, with a little margin like other launcher icons.
    rounded(round(48 * scale), inset=0.04).save(folder / 'ic_launcher.png')
    # Android 8+: the launcher crops a 108dp layer to its own shape; keep the letter in the middle 66dp.
    fg = Image.new('RGBA', (round(108 * scale),) * 2, (0, 0, 0, 0))
    side = fg.size[0]
    letter(fg, round(side * 0.40), (0, 0, side, side))
    fg.save(folder / 'ic_launcher_foreground.png')

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

# Play Store listing: 512×512 icon (Play rounds the corners itself) and the 1024×500 feature graphic.
store.mkdir(parents=True, exist_ok=True)
icon = Image.new('RGB', (512, 512), BLUE)
letter(icon, 320, (0, 0, 512, 512))
icon.save(store / 'icon-512.png')

feature = Image.new('RGB', (1024, 500), BLUE)
mark = rounded(180, radius=0.24)
white = Image.new('RGBA', mark.size, 'white')
badge = Image.new('RGBA', mark.size, (0, 0, 0, 0))
badge.paste(white, mask=mark.split()[3])
letter_layer = Image.new('RGBA', mark.size, (0, 0, 0, 0))
d = ImageDraw.Draw(letter_layer)
f = ImageFont.truetype(FONT, 112)
l, t, r, b = d.textbbox((0, 0), 'S', font=f)
d.text(((180 - (r - l)) / 2 - l, (180 - (b - t)) / 2 - t), 'S', font=f, fill=BLUE)
badge.alpha_composite(letter_layer)
feature.paste(badge, (110, 160), badge)
draw = ImageDraw.Draw(feature)
draw.text((330, 170), NAME, font=ImageFont.truetype(FONT, 96), fill='white')
draw.text((334, 290), TAGLINE, font=ImageFont.truetype(FONT, 40), fill='#DCE6FD')
feature.save(store / 'feature-graphic.png')
print('icons and store graphics written')
