# Shared 3D model shelf (#637)

One shelf of CC0 models every game in the arcade can browse and reuse.
The index is `shelf.json` — one entry per model with name, what it is,
category, pack, author, license, source, path, format, size and bounds.

- **categories:** `characters` (rigged KayKit bodies), `vehicles`, `scenery`
  (nature + racing props).
- **browse:** open `/retrogames/models/shelf.json`, or in a game
  `import { browse, loadModel } from 'utils/modelShelf.js'`.
- **conventions:** 1 unit = 1 metre, +Y up, origin on the ground. CC0 only.

`scripts/build-shelf.mjs` regenerates the `scenery/` kit and rewrites
`shelf.json`; `scripts/shelfcheck.mjs` gates the index and the models.
