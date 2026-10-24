# STATE — 2026-10-23 forge session (MODEL SHELF #901 facing law + village kit shipped)

## Shipped this session
- **#901 → main (PR #938 squash 84cdbde)** — shared 3D model library grown +
  the missing **facing law** closed. Every `shelf.json` entry now declares a
  `facing` (`radial` | `+z` | `rigged`); forward=+Z, up=+Y, declared in the
  index. Vertex-coloured kit pieces have facing **proven from geometry**
  (`facingVerified`): dark entry feature on +Z, nothing dark on −Z. Consumer
  helpers `facingOf(id)` / `directionalIds(category)` in `modelShelf.js`.
  Kit grown 27→45 (2214 KB ≤ 2.5 MB): village+fantasy scenery — cottage,
  watchtower, windmill (fronted +Z), well, crate, barrel, campfire, signpost,
  bench, lamp_post, bridge, statue, bush, stump, log_pile, mushroom,
  flower_patch — + a forge market cart (fronted +Z, geometry-proven). All
  original CC0, same KayKit voxel idiom, ≤40 KB / ≤400 tris, grounded-shaded.
- **shelfcheck 189 → 354/0.** New facing gate: index honesty (declared ==
  derived-from-GLB), **forbid any front at −Z**, radial claims re-checked honest.
  **Proven red** once: cottage door flipped to −Z → "fronted building with a
  geometry-proven +Z front" FAILS; restore → green.
- **#901 closed** (its spec — all categories + proven scale + proven facing +
  checker — is met). Filed **#939** `QA — MODEL SHELF: wire a consumer + …`
  (feedback): wire Emberwood/other puller, textured-model facing, village-kit
  rendered QC, more categories, slim runtime manifest.

## Next goal
- Oldest `game-queue`: **#902 coral-reef demo**, **#903 black-hole demo**
  (self-contained, `/retrogames/demos/…` only — no registry, per Jon 2026-10-19).
- QA holds #928 (MYST graphics), #891 (list hygiene), and now #939. Never touch heldGames.

## Board / harness status
- main = 84cdbde (this ship). `main-ok` green at claim + merge; `static` SUCCESS;
  Vercel live — prod shelf.json serves count 45.
- `lint:mario`/`lint:fps`/`lint:ai` clean; `npm run build` green; `dist/models/`
  carries all 45 GLBs. `build-shelf` regen is deterministic (no diff on re-run).
- `jonq`: nothing AWAITING/ANSWERED/DEFAULTED in lane:games; nothing filed.

## New harness lessons (this session)
- **Facing must be checked against the SHADED colour, not the raw one.**
  `groundShade` multiplies the model's lower band by ~0.72; a "dark-ish" wheel
  grey (lum 0.235) drops to ~0.17 there and leaked into the back slab, turning a
  fronted cart `radial`. Reserve sub-threshold dark (<0.2) for the front feature
  only and keep everything else ≥ ~0.28 pre-shade.
- **Derive-in-build, re-derive-in-check = an honest index.** The generator WRITES
  the facing it intends; the checker RE-derives it from the committed GLB and
  refuses a mismatch and any −Z front. That asymmetry is what makes it load-bearing
  (a future mirrored prop can't silently pass) — don't have both sides derive.
- **Additive shelf fields are safe across siblings.** Nothing outside
  `shelfcheck` asserts exact counts or rejects extra keys, so a new category/field
  grows the library without breaking SSX/Comet consumers — verify by grep.

## Housekeeping owed
- Prune worktrees when idle: `retrogames-forge-model-library` (this session; it
  used a symlinked `node_modules` — worktree-only, never committed) plus the old
  list (momentum-courses, iphone-controller, ssx-*, emberwood-*, qa-863*,
  people-sim, campfire-670).
- STATE.md ships via its own PR (#920 convention) — this session merged, so this
  file ships via its own PR + merge.
