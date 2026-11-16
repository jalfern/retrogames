#!/usr/bin/env python3
# App icons from the game's own pixel sprites (art.js SPRITE_DATA, dumped by
# node) and the fire-world brick: a torch-lit hall (back), the treasure + a
# generator glow (middle), the warrior facing a ghost, demon and grunt (front)
# — the tvOS parallax stack, the top shelf banners, and an iOS AppIcon.
# Rerun after an art change:  python3 scripts/icons.py
import json, os, random, shutil, subprocess
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'App', 'Assets.xcassets')
INFO = {"author": "xcode", "version": 1}
FONT = '/System/Library/Fonts/Supplemental/Impact.ttf'
data = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
    'import { SPRITE_DATA, MATERIALS } from "' + os.path.join(HERE, '../../../src/games/Gauntlet/art.js') + '"; console.log(JSON.stringify({ SPRITE_DATA, MATERIALS }))']))
SP, MAT = data['SPRITE_DATA'], data['MATERIALS']['red']

def hexc(h, a=255): return (int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16), a)
def sprite(name, px, frame=0):
    d = SP[name]; rows = d['frames'][frame]; w = max(len(r) for r in rows)
    im = Image.new('RGBA', (w, len(rows)), (0, 0, 0, 0))
    for y, r in enumerate(rows):
        for x, c in enumerate(r):
            if c != ' ' and c in d['pal']: im.putpixel((x, y), hexc(d['pal'][c]))
    return im.resize((w * px, len(rows) * px), Image.NEAREST)

def back(w, h):
    im = Image.new('RGBA', (w, h), hexc('#171420'))
    d = ImageDraw.Draw(im)
    cell = max(8, h // 6)
    for r in range(-1, h // cell + 2):
        for c in range(-1, w // cell + 2):
            x, y = c * cell, r * cell
            wall = r < 1 or r >= h // cell - 0 or (c % 7 in (0,) and r % 3 != 1)
            if not wall:
                d.rectangle([x, y, x + cell, y + cell], fill=hexc('#1a1723' if (c + r) % 2 else '#171420'))
                continue
            d.rectangle([x, y, x + cell, y + cell], fill=hexc(MAT['dark'] if (c + r) % 2 == 0 else MAT['base']))
            d.rectangle([x, y, x + cell, y + cell // 8], fill=hexc(MAT['lite']))
            d.rectangle([x, y + cell // 2, x + cell, y + cell // 2 + max(1, cell // 16)], fill=hexc(MAT['mortar']))
            d.rectangle([x + cell // 2, y, x + cell // 2 + max(1, cell // 16), y + cell // 2], fill=hexc(MAT['mortar']))
    # the torch: bright at the hero, dark at the edges
    torch = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    td = ImageDraw.Draw(torch)
    for i in range(24, 0, -1):
        rr = max(w, h) * i / 24 * 0.75
        td.ellipse([w / 2 - rr, h * 0.55 - rr, w / 2 + rr, h * 0.55 + rr], fill=(0, 0, 0, int(200 * (i / 24) ** 2)))
    im.alpha_composite(torch)
    return im

def middle(w, h):
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    px = max(2, h // 40)
    glow = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([w * 0.08, h * 0.55, w * 0.32, h * 0.95], fill=(255, 79, 79, 120))
    im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(h * 0.05)))
    im.alpha_composite(sprite('gen', px), (int(w * 0.2 - 5 * px), int(h * 0.75 - 4 * px)))
    for name, fx, fy in (('gold', 0.82, 0.8), ('key', 0.72, 0.22), ('food', 0.9, 0.35), ('potion', 0.12, 0.25)):
        s = sprite(name, px)
        im.alpha_composite(s, (int(w * fx - s.width / 2), int(h * fy - s.height / 2)))
    return im

def front(w, h, title=False):
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    big = max(3, int(h * 0.5 / 8))
    hero = sprite('warrior', big)
    hx = (w - hero.width) // 2 if not title else int(w * 0.14)
    hy = int(h * 0.58 - hero.height / 2)
    sh = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse([hx, hy + hero.height * 0.85, hx + hero.width, hy + hero.height * 1.1], fill=(0, 0, 0, 150))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(h * 0.01)))
    im.alpha_composite(hero, (hx, hy))
    mon = max(2, int(h * 0.24 / 16))
    spots = (('ghost', 0.05, 0.3), ('demon', 0.33, 0.28), ('grunt', 0.33, 0.8)) if title else (('ghost', 0.17, 0.26), ('demon', 0.83, 0.28), ('grunt', 0.82, 0.8))
    for name, fx, fy in spots:
        s = sprite(name, mon)
        im.alpha_composite(s, (int(w * fx - s.width / 2), int(h * fy - s.height / 2)))
    if title:
        f = ImageFont.truetype(FONT, int(h * 0.3))
        d = ImageDraw.Draw(im)
        t = 'GAUNTLET'
        bb = d.textbbox((0, 0), t, font=f)
        tx = int(w * 0.66 - (bb[2] - bb[0]) / 2); ty = int(h * 0.22)
        g = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        ImageDraw.Draw(g).text((tx, ty), t, font=f, fill=(255, 140, 40, 255))
        im.alpha_composite(g.filter(ImageFilter.GaussianBlur(h * 0.02)))
        d.text((tx, ty), t, font=f, fill=hexc('#ffd23f'), stroke_width=max(2, h // 120), stroke_fill=(40, 10, 8, 255))
        f2 = ImageFont.truetype(FONT, int(h * 0.08))
        s2 = 'TEN MAZES · TWO HEROES'
        bb2 = d.textbbox((0, 0), s2, font=f2)
        d.text((int(w * 0.66 - (bb2[2] - bb2[0]) / 2), ty + int(h * 0.36)), s2, font=f2, fill=hexc('#8fa3d8'))
    return im

def write(path, img):
    os.makedirs(os.path.dirname(path), exist_ok=True); img.save(path)
def contents(path, obj):
    os.makedirs(path, exist_ok=True)
    with open(os.path.join(path, 'Contents.json'), 'w') as f: json.dump(obj, f, indent=2)
def stack(root, name, size, scales):
    sd = os.path.join(root, name + '.imagestack')
    contents(sd, {"info": INFO, "layers": [{"filename": n + ".imagestacklayer"} for n in ("Front", "Middle", "Back")]})
    for layer, fn in (("Front", front), ("Middle", middle), ("Back", back)):
        ld = os.path.join(sd, layer + '.imagestacklayer'); contents(ld, {"info": INFO})
        cd = os.path.join(ld, 'Content.imageset'); imgs = []
        for sc in scales:
            f = f"{layer.lower()}{'' if sc == 1 else '@%dx' % sc}.png"
            write(os.path.join(cd, f), fn(size[0] * sc, size[1] * sc))
            imgs.append({"filename": f, "idiom": "tv", "scale": f"{sc}x"})
        contents(cd, {"images": imgs, "info": INFO})
def shelf(root, name, size):
    d = os.path.join(root, name + '.imageset'); imgs = []
    for sc in (1, 2):
        w, h = size[0] * sc, size[1] * sc
        im = back(w, h); im.alpha_composite(middle(w, h)); im.alpha_composite(front(w, h, title=True))
        f = f"shelf{'' if sc == 1 else '@2x'}.png"; write(os.path.join(d, f), im.convert('RGB'))
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
