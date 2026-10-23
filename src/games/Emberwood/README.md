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

- **#781 stage 2 — doors and exits are REAL:** stepping onto an opened dungeon
  door walks you into `d.to` at `d.entry` (before this the doors unlocked onto
  nothing and the game was physically unwinnable — only the logical solver
  reached the Wyrm). Edge exits trigger at border-tile *centers* (`<= 8`),
  because the hero's center stops at ~4 against the wall and the old `< 2`
  bounds were unreachable; post-transition spawns pull inside to avoid ping-pong.
- **Eight species + two bosses.** TUSKROOT (fern hollow, CINDERKEEP IV) stops,
  paws the ground for ~36 frames, then charges in a locked straight line at
  2.7px/f — sidestep the telegraph, slash the flank during the run, punish the
  55-frame rest. CINDER POD bursts into two cinder sparks when it falls (the
  sparks survive the killing swing, they do not split again).
- **Ember Blade (shop, 150 embers):** sword damage 1 -> 2. Deliberately does
  NOT skip boss rules: closed thorns still clank, the scale-cloak still shrugs
  off steel, the Husk still deflects the front. One purchase (re-buy says
  "YE ALREADY CARRY"). HUD shows `EMBER BLADE`; the swipe arc burns orange.
- **Signposts read:** facing an `I` tile (or a sign-posted floor tile) and
  pressing A shows its `signs` message (`signs` was dead data before).
- **Attract = proof route.** `bot.js` plays the solver's route with real
  inputs: bombs the cracks, unlocks doors with real keys, pushes the block via
  a sokoban-BFS over (hero, block) tiles, arrows the wall-switches, fells the
  Maw in its thorn-window, staggers the Wyrm with an arrow and takes the
  Ember Heart at tick 7160 — identical on every seed. The vale lends the demo
  hero provisions (keys/arrows/bombs/blade) and 4 HP regen; no progress flags
  are cheated.
- Tap A slashes (arc hitbox, knockback, hitstop flash); **hold A >=12 ticks
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

- **Living foliage (#789)**: one deterministic wind field (`render.js WIND`)
  sways tree canopies (slow + wide, ceil 0.05 rad), rustles bushes (fast +
  tight, ceil 0.09 rad plus lateral jitter) and shivers tall grass (per-tile
  texture-offset clone, `MirroredRepeatWrapping`, ceil 0.06 uv). Bushes are
  derived from the tile legend only ('.' floor, orthogonally touching 'T',
  `(x*7+y*13)%3`, never on entity/spawn/border tiles) — the sim, solver and
  attract bot never see them, so gameplay determinism is untouched. Cut
  tall-grass tiles swap to plain grass and stop rustling. `emberwoodcheck`
  pins the curves (bounded, gusting, spatially phased, deterministic) and the
  live motion via `__emberwoodTest.foliage()`; the deep screens have no
  trees, so no brush blows underground.

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

- **Graceful attract combat (#874)**: `bot.js` grew a hit-and-run layer on top
  of the proof route. A tuskroot telegraph or locked charge pre-empts the macro
  (`dodgeTick` sidesteps perpendicular to the charge line, free-tile checked;
  the 55-frame rest gets closed and swung at). The husk's frontal deflect
  (`toward = d·(-f) > 0.5`) is respected geometrically: the pose freezes its
  swing axis at engage and holds a steep diagonal (4px off the swing axis,
  13.5px off the minor — outside the 12.5px contact band), so bites land and
  the front never clanks. Trash mobs run close→slash→hop-back. The Maw gets two
  strikes per thorn window then stands off outside 40px; the Wyrm takes an
  align→face→draw→loose→retreat volley and is only carved while staggered (zero
  clanks on both bosses). Safety rails keep the demo alive: fights only engage
  along a BFS-reachable path, one honest attempt per monster (`black`), pin
  detection, a 2400-tick budget, and a panic-break sprint that sheds a
  48-tick contact tail. Deterministic — the Ember Heart lands at tick 11233 on
  every seed.

## Verify

```bash
npm run dev
npm run emberwoodcheck          # boots the page, drives the sim, proves dungeons + brightness + beds
                                # + graceful-fight duel gates (tuskroot/husk/trash/Maw/Wyrm)
node --input-type=module -e "import('./src/games/Emberwood/solver.js').then(m=>console.log(m.proveGame({bombs:true}).win))"   # true
node --input-type=module -e "import('./src/games/Emberwood/solver.js').then(m=>console.log(m.proveGame({bombs:false}).bowGot))" # false — bombs gate the bow
```

## Honest gaps (QA polish pass will own these)

- Tuskroot/pod sprites are first-pass 16x12 paintings; charge-dust and
  split-pop FX are missing.
- The Wyrm tail segments ride the drop-pool quads (visible but cheap).
- No save system; no secret second shop; the elder hints but gives nothing.
- Portrait is 4:3, not full-bleed: a taller window would crop the 16-tile
  screen's east/west columns at viewH 210.
- No tempo lift on the beds (SSX's `setMusicStep` seam is unused here); no
  attract-mode music (contract keeps attract silent).
