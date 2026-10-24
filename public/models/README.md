# Shared 3D model shelf (#637, grown by #901)

One shelf of CC0 models every game in the arcade can browse and reuse.
The index is `shelf.json` — one entry per model with name, what it is,
category, pack, author, license, source, path, format, size and bounds.

- **categories:** `characters` (rigged KayKit bodies), `vehicles` (the COMET
  DRIFT HD buggy + a Forge market cart), `scenery` (nature, racing props, and a
  village & fantasy kit — cottage, watchtower, windmill, well, campfire, statue,
  crates, barrels, benches, lamp posts, bridges, bushes, stumps, toadstools…).
- **browse:** open `/retrogames/models/shelf.json`, or in a game
  `import { browse, loadModel, facingOf, directionalIds } from 'utils/modelShelf.js'`.
- **conventions:** 1 unit = 1 metre, +Y up, origin on the ground. CC0 only.
- **facing (#901):** every model carries a known forward — `forward = +Z`,
  `up = +Y`. `facing` is `radial` (no meaningful front — spin it freely),
  `+z` (a fronted prop: buildings, vehicles — square +Z toward the player/track)
  or `rigged` (facing lives in the pose, not the static mesh). Vertex-coloured
  kit pieces have their facing **proven from geometry** (`facingVerified`): a dark
  entry feature on +Z and nothing dark on −Z. A front facing backwards (−Z) is a
  build error and `shelfcheck` refuses it.

`scripts/build-shelf.mjs` regenerates the `scenery/` kit and the cart, derives
facing, and rewrites `shelf.json`; `scripts/shelfcheck.mjs` gates the index, the
models, and the facing law.
