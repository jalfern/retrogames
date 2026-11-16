# Writes a port's App/Assets.xcassets from three painted layers: the tvOS
# parallax app icon (Front / Middle / Back image stacks), the two top shelf
# banners, and a flattened 1024px iOS AppIcon — every Contents.json included.
# A port's scripts/icons.py paints the layers from the game's own art and calls
# build(); this file only knows the asset catalog's shape.
#
#   import sys, os; sys.path.insert(0, os.path.join(HERE, '..', '..', 'RetroKit', 'scripts'))
#   import brandassets
#   brandassets.build(OUT, back=back, middle=middle, front=front)
#
# back/middle/front(w, h) -> RGBA PIL image; front also takes title=True for
# the top shelf (the logo goes there). shelf_middle(w, h) overrides middle on
# the shelf (Emberwood scatters its embers with a different seed there).
import json, os, shutil

INFO = {"author": "xcode", "version": 1}


def write(path, img):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)


def contents(path, obj):
    os.makedirs(path, exist_ok=True)
    with open(os.path.join(path, 'Contents.json'), 'w') as f: json.dump(obj, f, indent=2)


def stack(root, name, size, scales, layers):
    sd = os.path.join(root, name + '.imagestack')
    contents(sd, {"info": INFO, "layers": [{"filename": n + ".imagestacklayer"} for n, _ in layers]})
    for layer, fn in layers:
        ld = os.path.join(sd, layer + '.imagestacklayer')
        contents(ld, {"info": INFO})
        cd = os.path.join(ld, 'Content.imageset')
        imgs = []
        for sc in scales:
            f = f"{layer.lower()}{'' if sc == 1 else '@%dx' % sc}.png"
            write(os.path.join(cd, f), fn(size[0] * sc, size[1] * sc))
            imgs.append({"filename": f, "idiom": "tv", "scale": f"{sc}x"})
        contents(cd, {"images": imgs, "info": INFO})


def shelf(root, name, size, compose):
    d = os.path.join(root, name + '.imageset')
    imgs = []
    for sc in (1, 2):
        f = f"shelf{'' if sc == 1 else '@2x'}.png"
        write(os.path.join(d, f), compose(size[0] * sc, size[1] * sc).convert('RGB'))
        imgs.append({"filename": f, "idiom": "tv", "scale": f"{sc}x"})
    contents(d, {"images": imgs, "info": INFO})


def build(out, back, middle, front, shelf_middle=None):
    """Replace `out` (an .xcassets folder) with the full icon set."""
    shelf_middle = shelf_middle or middle

    def banner(w, h):
        im = back(w, h); im.alpha_composite(shelf_middle(w, h)); im.alpha_composite(front(w, h, title=True))
        return im

    layers = (("Front", front), ("Middle", middle), ("Back", back))
    shutil.rmtree(out, ignore_errors=True)
    contents(out, {"info": INFO})
    ba = os.path.join(out, 'App Icon & Top Shelf Image.brandassets')
    contents(ba, {"assets": [
        {"filename": "App Icon - App Store.imagestack", "idiom": "tv", "role": "primary-app-icon", "size": "1280x768"},
        {"filename": "App Icon.imagestack", "idiom": "tv", "role": "primary-app-icon", "size": "400x240"},
        {"filename": "Top Shelf Image Wide.imageset", "idiom": "tv", "role": "top-shelf-image-wide", "size": "2320x720"},
        {"filename": "Top Shelf Image.imageset", "idiom": "tv", "role": "top-shelf-image", "size": "1920x720"},
    ], "info": INFO})
    stack(ba, 'App Icon', (400, 240), (1, 2), layers)
    stack(ba, 'App Icon - App Store', (1280, 768), (1,), layers)
    shelf(ba, 'Top Shelf Image', (1920, 720), banner)
    shelf(ba, 'Top Shelf Image Wide', (2320, 720), banner)
    ai = os.path.join(out, 'AppIcon.appiconset')
    icon = back(1024, 1024); icon.alpha_composite(middle(1024, 1024)); icon.alpha_composite(front(1024, 1024))
    write(os.path.join(ai, 'icon-1024.png'), icon.convert('RGB'))
    contents(ai, {"images": [{"filename": "icon-1024.png", "idiom": "universal", "platform": "ios", "size": "1024x1024"}], "info": INFO})
