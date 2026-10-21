# STATE — 2026-10-20 forge pm #4

## Shipped this session
- **#637 Shared 3D model shelf → prod** (PR #656, squash `50e2419`,
  live at jalfern.com/retrogames/models/shelf.json).
  One shelf under `public/models/`: `characters/` (5 KayKit bodies, moved from
  `models/ssx/`, `LICENSE.txt` kept), `vehicles/` (`dune_buggy.glb`, moved from
  `games/comet-drift-hd/`, README kept), `scenery/` (13 ORIGINAL CC0 props in the
  KayKit voxel idiom, 1u=1m, +Y up, ground origin): tree_oak, tree_pine, rock,
  boulder, fence, flag, barrier, cone, grandstand, marshal_post, pit_building,
  billboard, sign.
  - `public/models/shelf.json` index: 19 entries, name/summary/category/pack/
    author/license/source/path/format/sizeBytes/triangles/vertices/meters/tags/solid.
  - `src/utils/modelShelf.js`: `browse() / loadModel(id) / modelUrl(id) /
    idsByCategory()`; side effects stay behind calls so Node import is clean.
  - SSX `art.js` + Comet `scene.js` repointed to the shelf paths.
  - `scripts/build-shelf.mjs` regenerates scenery + index; `scripts/_glb.mjs` is a
    dependency-free glTF 2.0 binary writer (validated: every scenery GLB parses
    through three's real `GLTFLoader`).
  - `npm run shelfcheck`: 94 assertions green (schema, CC0-only, structural glTF
    validate, ground convention, index↔disk, consumer wiring, #638/#639 dep
    presence). Mutant (corrupt glb magic) → 1 red, restored. Gates: eslint clean,
    lint:mario/fps/ai green, build green, dist carries the shelf.

## Why original models, not pack downloads
itch.io (KayKit/Kenney/Quaternius) is outside the GitHub/npm-only network rule; the
KayKit org repo listing is 404 and Quaternius ships nothing on GitHub. So the scenery
kit is Forge-authored CC0, provenance honest in the index. Only re-download from a
GitHub-hosted CC0 repo if one turns up.

## Next goal
Oldest game-queue now **#638 SSX: make it feel like a mountain** (lane:games),
then #639 COMET DRIFT HD trackside (lane:games). Both commented with the shelf
ids they need. Snow/capped variants + tire_wall/hills are the shelf gap for them —
filed as QA **#657** (lane:qa; builders don't pick up QA, so #638/#639 add what
they need directly). Claim oldest with `building` + `lane:<x>`, worktree off
origin/main, ship end-to-end.

## Gotchas learned this session
- **Zero-indexed glTF attribute = falsy.** `if (!prim.attributes.POSITION)` is
  wrong when POSITION is accessor index 0 (returns "no POSITION" for valid files).
  Always test `=== undefined`. This bit shelfcheck on every scenery glb.
- **git worktrees don't share node_modules.** Symlink the main checkout's
  `node_modules` into a fresh forge worktree (`ln -sfn`) to run lint/build/glTF
  checks without a slow `npm ci`.
- **three GLTFLoader in Node:** static geometry/vehicles parse fine; *skinned*
  rigged glbs throw `self is not defined` in Node — that's a Node-env quirk, not a
  model defect (those files load fine in the browser). Gate rigged files
  structurally (readGlb), not via GLTFLoader.parse.
- `.glb` served with `content-type: model/gltf-binary` in prod (vercel SPA/wasm
  headers already cover it).

## Board / harness status
- main: `50e2419`; nightly green before merge (`main-ok.sh` ok), `static` green,
  prod verified live.
- Rule 4: satisfied — #656 touches `src/games/**` (SSX, Comet) plus infra.
- Rule 7: no new `waiting-jon` question filed (games lane already at 3 open
  per `jonq list games`; nothing taste/priority needed this session).
- Worktrees: `~/Dev/retrogames-forge-model-shelf-637` removed; main checkout
  detached at `origin/main` (`50e2419`).

## Open questions
- #633 (lane:games) SSX rider 5 duplicate body — keep or fetch a sixth
  (default: keep the hooded duplicate). Awaiting Jon.

## Open threads
- #657 QA polish for the shelf (lane:qa): tire_wall, hills, snow variants,
  two-tone shading, silhouette variety, proportions-vs-human screenshot QA.
- #638 / #639 as above (unblocked by #637).
