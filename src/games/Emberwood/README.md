# EMBERWOOD — an original HD-2D action-adventure (#738)

Jon's brief: a fancier Zelda-like that is *ours* — the genre and its mechanics,
never Nintendo's names, art or music. Hero **Ash**, the vale of **Emberwood**,
currency **embers**, bosses the **Bramble Maw** and the **Cinder Wyrm**.
Bar: **MODERN** (docs/ART.md): pixel art inside a lit 3D diorama.

## Layout

- `world.js` — all maps. 16x11 screens of 16px tiles (256x176 units).
  A 2x2 overworld + town, two 4–5-room dungeons. Entities (chests, doors,
  switches, plates, push-blocks, cracks, NPCs, warps, exits) are meta per
  screen; tiles carry only the static legend.
- `sim.js` — THE game. Pure, deterministic (`mulberry32(seed)`), no DOM, no
  THREE, no `Math.random`. `createSim(seed)`, `stepSim(sim, input)`,
  `simState(sim)`, `hashState(sim)`. The renderer, the contract, the attract
  autopilot and the Node harness all drive this one module.
- `solver.js` — `tilePath` (BFS, shared with the attract bot) and
  `proveGame(startKit)`: a logical proof over the whole game. It answers
  "can the dungeons be finished with ONLY the items owned at that point?"
  Killing is abstracted to sword-owns-fights; push-blocks and arrow lines are
  verified as geometric reachability.
- `art.js` — every texture painted at runtime into 8–30px canvases (original
  pixel art; dusk-amber vale palette), wrapped as NearestFilter textures.
- `render.js` — three.js HD-2D stage: tilted orthographic camera, sun +
  hemisphere light with real shadow maps, torch point lights + hero lantern in
  the dark, billboarded pixel entities tinted by a JS light probe, animated
  water, and a post chain: bright → blur → bloom, big-radius soft blur mixed
  by tilt-shift focus on the hero, vignette. `?lite=1` skips post + shadows.
  Orientation: the stage is Z-up and the camera looks north-down with
  `up=(0,-1,0)` — north on top, but that mirrors X — so every view-space x
  passes through `FX(x) = SW*TS - x`. East then reads right, matching tile
  data (#772); sprites and the hero draw unmirrored.
- `index.jsx` — the shell: fixed-timestep loop (GAME-SHELL), attract bot,
  pause, VirtualControls, HUD (hearts/embers/items/shop), audio map
  (every fx event has a synthesized sound), contract + DebugKit + `__emberwoodTest`.

## Rules the sim enforces

- Tap A slashes (arc hitbox, knockback, hitstop flash); **hold A ≥12 ticks
  draws the bow** (needs arrows), release looses. B bombs (destroys cracks,
  blasts monsters). C drinks. Standing at a shopkeeper and pressing A trades.
- Keys are consumable currency; one mossy door wants the BIG KEY.
- The husk deflects frontal hits (arrows and steel) — kill it from behind.
- The Maw is armored until its thorn-cycle opens; the Wyrm is scale-cloaked —
  an arrow into the open maw staggers it so the sword can reach the core.
- Grass respawns nothing (cuts are permanent) but monsters respawn on re-entry
  and drop-tables are seeded-derterministic, so embers are always farmable.
- Death respawns at the current dungeon's entrance (or town) keeping progress.
- **Hit-stop**: the world freezes for a few frames on a kill (3, bosses 6) and
  on every bomb blast (4) — `sim.hitStop` short-circuits `stepSim` after
  `tick++`, so the hero/enemies/bombs/particles hold while the tick advances.
  Deterministic (seed-preserved); `emberwoodcheck` asserts the freeze, the hero
  pin, its release, seed-equality, and a blast with nothing to kill.
- **Swipe arc**: a slash sets `sim.arc` to 12 frames — two longer than the
  10-frame blade — in `sim.arcDir`/`sim.arcId`, so the render draws an additive
  crescent (`render.js` `arcMesh`) that sweeps past the hero after the sword has
  left. It freezes with `sim.hitStop` and clears on room entry. The trail is
  exposed on `simState().arc` (`{dir,id,frames,p}` or `null`); `emberwoodcheck`
  asserts it spawns facing-correct, outlives the blade, clears, tracks facing, is
  seed-deterministic, and that a bomb blast never fakes one.

- **Composite encodes sRGB (#773)**: the scene RT samples back linear (sRGB
  RT + hardware decode), the canvas blit is raw, so `compMat` must run
  `lin2srgb` before output or the whole diorama ships near-black (measured:
  town mean 15.8/255 pre-fix, ~55 post-fix, lite path 58). `emberwoodcheck`
  pins it: overworld mean ≥35/30, dark-pixel fraction ≤0.35, dungeon mean in
  8..0.8×town (moody by construction).
- **Portrait canvas (#773)**: portrait viewports render at 480x360 (4:3)
  instead of 480x288 — the ortho window (viewH 210 ⊃ the 11-row screen) is
  orientation-agnostic, so portrait just gets ~25% bigger pixels. The blur
  kernel normalizes by a `res` uniform for this reason.
- **Music (#781)**: two ORIGINAL beds in `AudioController.MUSIC` —
  `emberwoodVale` (D-major overworld) / `emberwoodDeep` (A-minor dungeon,
  slower grid) — switched per screen darkness from the shell loop; silent on
  attract/pause/death/win; `duckMusic` on hits/booms/stagger/boss-die;
  fanfare on win, stop on unmount.

## Verify

```bash
npm run dev
npm run emberwoodcheck          # boots the page, drives the sim, proves dungeons + brightness + beds
node --input-type=module -e "import('./src/games/Emberwood/solver.js').then(m=>console.log(m.proveGame({bombs:true}).win))"   # true
node --input-type=module -e "import('./src/games/Emberwood/solver.js').then(m=>console.log(m.proveGame({bombs:false}).bowGot))" # false — bombs gate the bow
```

## Honest gaps (QA polish pass will own these)

- The attract autopilot wanders one screen and slashes; the *proven route bot*
  (solver-route played in attract) is the polish-pass goal.
- The Wyrm tail segments ride the drop-pool quads (visible but cheap).
- No save system; no secret second shop; the elder hints but gives nothing.
- Portrait is 4:3, not full-bleed: a taller window would crop the 16-tile
  screen's east/west columns at viewH 210.
- No tempo lift on the beds (SSX's `setMusicStep` seam is unused here); no
  attract-mode music (contract keeps attract silent).
