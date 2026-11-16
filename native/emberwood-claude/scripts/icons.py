#!/usr/bin/env python3
# App icons from the game's own art (App/Art, painted by art.js): a dusk vale
# behind a treeline (back), drifting embers (middle), Ash with the ember blade
# (front) — the tvOS parallax stack, the top shelf banners, and a flattened
# iOS AppIcon. Rerun after an art change:  python3 scripts/icons.py
import json, math, os, random, shutil
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.join(HERE, '..', 'App', 'Art')
OUT = os.path.join(HERE, '..', 'App', 'Assets.xcassets')
INFO = {"author": "xcode", "version": 1}
FONT = '/System/Library/Fonts/Supplemental/Copperplate.ttc'

def art(name): return Image.open(os.path.join(ART, name + '.png')).convert('RGBA')
def up(img, k): return img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.NEAREST)

def back(w, h):
    im = Image.new('RGBA', (w, h))
    px = im.load()
    stops = [(0, (26, 22, 44)), (0.45, (70, 40, 66)), (0.72, (160, 74, 52)), (0.86, (232, 132, 60)), (1, (60, 34, 24))]
    for y in range(h):
        t = y / (h - 1)
        for i in range(len(stops) - 1):
            if stops[i][0] <= t <= stops[i + 1][0]:
                a, b = stops[i], stops[i + 1]
                u = (t - a[0]) / (b[0] - a[0])
                c = tuple(round(a[1][k] + (b[1][k] - a[1][k]) * u) for k in range(3))
                break
        for x in range(w): px[x, y] = c + (255,)
    # a low ember sun on the horizon
    sun = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(sun)
    r = h * 0.22
    d.ellipse([w * 0.5 - r, h * 0.78 - r, w * 0.5 + r, h * 0.78 + r], fill=(255, 178, 56, 150))
    im.alpha_composite(sun.filter(ImageFilter.GaussianBlur(h * 0.06)))
    # treeline: the game's own trees, nearest-scaled, darkened into silhouette layers
    tree = art('tree')
    for row, (k, shade, y0) in enumerate([(h / 150, 0.35, 0.80), (h / 115, 0.55, 0.92)]):
        t = up(tree, k)
        dark = Image.eval(t, lambda v: v)  # copy
        r_, g_, b_, a_ = dark.split()
        dark = Image.merge('RGBA', [r_.point(lambda v: int(v * shade)), g_.point(lambda v: int(v * shade * 0.9)), b_.point(lambda v: int(v * shade * 0.8)), a_])
        step = int(t.width * 0.62)
        off = (row * step) // 2
        for x in range(-off, w + step, step):
            jitter = int(((x * 7919) % 13 - 6) * h / 400)
            im.alpha_composite(dark, (x, int(h * y0 - t.height + jitter)))
    return im

def middle(w, h, seed=7):
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    rnd = random.Random(seed)
    for _ in range(46):
        x, y = rnd.uniform(0, w), rnd.uniform(h * 0.05, h * 0.85)
        r = rnd.uniform(h * 0.006, h * 0.016)
        d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 190 + rnd.randint(0, 50), 80, 230))
    glow = im.filter(ImageFilter.GaussianBlur(h * 0.012))
    glow.alpha_composite(im)
    return glow

def front(w, h, title=False):
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    hero = art('hero_down_slash')
    k = h * 0.62 / hero.height
    H = up(hero, k)
    hx = (w - H.width) // 2 if not title else int(w * 0.16)
    hy = int(h * 0.88 - H.height)
    shadow = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse([hx + H.width * 0.12, h * 0.85, hx + H.width * 0.88, h * 0.93], fill=(0, 0, 0, 140))
    im.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(h * 0.01)))
    # an ember halo behind the blade hand
    halo = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    r = H.height * 0.42
    cx, cy = hx + H.width * 0.5, hy + H.height * 0.55
    ImageDraw.Draw(halo).ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 154, 60, 120))
    im.alpha_composite(halo.filter(ImageFilter.GaussianBlur(h * 0.05)))
    im.alpha_composite(H, (hx, hy))
    if title:
        f = ImageFont.truetype(FONT, int(h * 0.2), index=1)
        text = 'EMBERWOOD'
        d = ImageDraw.Draw(im)
        bb = d.textbbox((0, 0), text, font=f)
        tx = int(w * 0.6 - (bb[2] - bb[0]) / 2); ty = int(h * 0.32)
        glow = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        ImageDraw.Draw(glow).text((tx, ty), text, font=f, fill=(255, 140, 40, 255))
        im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(h * 0.02)))
        d.text((tx, ty), text, font=f, fill=(255, 214, 122, 255), stroke_width=max(2, h // 160), stroke_fill=(58, 26, 16, 255))
        f2 = ImageFont.truetype(FONT, int(h * 0.07), index=1)
        sub = 'ASH OF THE VALE'
        bb2 = d.textbbox((0, 0), sub, font=f2)
        d.text((int(w * 0.6 - (bb2[2] - bb2[0]) / 2), ty + int(h * 0.27)), sub, font=f2, fill=(232, 217, 184, 255))
    return im

def write(path, img):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)

def contents(path, obj):
    os.makedirs(path, exist_ok=True)
    with open(os.path.join(path, 'Contents.json'), 'w') as f: json.dump(obj, f, indent=2)

def stack(root, name, size, scales):
    sd = os.path.join(root, name + '.imagestack')
    contents(sd, {"info": INFO, "layers": [{"filename": n + ".imagestacklayer"} for n in ("Front", "Middle", "Back")]})
    for layer, fn in (("Front", front), ("Middle", middle), ("Back", back)):
        ld = os.path.join(sd, layer + '.imagestacklayer')
        contents(ld, {"info": INFO})
        cd = os.path.join(ld, 'Content.imageset')
        imgs = []
        for sc in scales:
            w, h = size[0] * sc, size[1] * sc
            f = f"{layer.lower()}{'' if sc == 1 else '@%dx' % sc}.png"
            write(os.path.join(cd, f), fn(w, h))
            imgs.append({"filename": f, "idiom": "tv", "scale": f"{sc}x"})
        contents(cd, {"images": imgs, "info": INFO})

def shelf(root, name, size):
    d = os.path.join(root, name + '.imageset')
    imgs = []
    for sc in (1, 2):
        w, h = size[0] * sc, size[1] * sc
        im = back(w, h); im.alpha_composite(middle(w, h, 11)); im.alpha_composite(front(w, h, title=True))
        f = f"shelf{'' if sc == 1 else '@2x'}.png"
        write(os.path.join(d, f), im.convert('RGB'))
        imgs.append({"filename": f, "idiom": "tv", "scale": f"{sc}x"})
    contents(d, {"images": imgs, "info": INFO})

shutil.rmtree(OUT, ignore_errors=True)
contents(OUT, {"info": INFO})
ba = os.path.join(OUT, 'App Icon & Top Shelf Image.brandassets')
contents(ba, {"assets": [
    {"filename": "App Icon - App Store.imagestack", "idiom": "tv", "role": "primary-app-icon", "size": "1280x768"},
    {"filename": "App Icon.imagestack", "idiom": "tv", "role": "primary-app-icon", "size": "400x240"},
    {"filename": "Top Shelf Image Wide.imageset", "idiom": "tv", "role": "top-shelf-image-wide", "size": "2320x720"},
    {"filename": "Top Shelf Image.imageset", "idiom": "tv", "role": "top-shelf-image", "size": "1920x720"},
], "info": INFO})
stack(ba, 'App Icon', (400, 240), (1, 2))
stack(ba, 'App Icon - App Store', (1280, 768), (1,))
shelf(ba, 'Top Shelf Image', (1920, 720))
shelf(ba, 'Top Shelf Image Wide', (2320, 720))
ai = os.path.join(OUT, 'AppIcon.appiconset')
icon = back(1024, 1024); icon.alpha_composite(middle(1024, 1024)); icon.alpha_composite(front(1024, 1024))
write(os.path.join(ai, 'icon-1024.png'), icon.convert('RGB'))
contents(ai, {"images": [{"filename": "icon-1024.png", "idiom": "universal", "platform": "ios", "size": "1024x1024"}], "info": INFO})
print('icons: tvOS stack + top shelf + iOS AppIcon -> App/Assets.xcassets')
