# IRONKEEP — engine notes

A first-person shooter on a hand-written software raycaster: `src/games/IronKeep/`
(route `/ironkeep`). Three halls of a keep, a crossbow, and no image assets of any
kind. Verification lives in `scripts/fpscheck.mjs` (`npm run fpscheck`); see
`AGENTS.md` → *Self-verifying* for the shared harness.

## Why Wolf3D and not Doom or Quake

The brief was "one-shot a first-person shooter". The engine you pick decides whether
that is possible:

| | world model | what it costs you |
|---|---|---|
| **Wolfenstein 3D** | a 2D grid, every wall one unit tall, eye height fixed | DDA per screen column + a depth buffer. A weekend. **Chosen.** |
| Doom | sectors with floor/ceiling heights, slopes, stairs, BSP for occlusion | BSP building, seg clipping, sprite ordering per sector, door/plane math. Not a first pass. |
| Quake | true perspective polygons, lightmaps, model skinning | a real 3D pipeline. Different sport. |

Because a Wolf world is a grid, "geometry" is `grid[y][x]`, collision is three tile
probes per axis, pathfinding is BFS on the same grid, and the whole renderer is
~200 lines. Every hard decision in this file follows from picking the world model
that fits the budget.

## Frame pipeline

Fixed timestep `FIXED_DT = 1000/60` (repo convention), render once per rAF.

1. **Floor + ceiling** — per row. `dist = (EYE * RH) / (y - horizon)`, then march a
   world-space step across the row. Casts at **stride 2** (one texel fetch written to
   two pixels): halves the cost, and 2px columns are invisible at 320x200 upscaled.
2. **Walls** — per column, classic DDA. `lineH = RH / perpWallDist`, `texX` from the
   fractional wall hit, side-shading +1 level on y-sides. Writes `zbuf[x]`.
3. **Billboards** — enemies, corpses, pickups, projectiles, gore. Inverse camera
   matrix → screen x, `RH/ty` scaling, feet anchored on the floor line
   (`horizon + (RH/ty) * EYE`), sorted far→near, and every column depth-tested
   against `zbuf` — that is what makes an enemy disappear behind a corner.
4. **Weapon** — `drawImage` of a generated 80x56 sprite, bobbed off the movement
   integral and kicked on fire.
5. **Status bar** — 40px of vector rects + the bitmap font, below the view.

The framebuffer is a **320x200 `ImageData`** (Wolf's own resolution) written as
`Uint32Array` and put at `(0,0)`; the canvas is `image-rendering: pixelated`.

**Distance shading is table-driven.** `art.shadeTable()` bakes 12 pre-darkened copies
of every texture and sprite at build time, so the inner loops do a table lookup and a
store — no per-pixel multiply. Measured in headless Chrome: **avg 0.6 ms/frame,
max ~3 ms** (`__keepTest.perf()`), i.e. the whole 16.7ms budget is spare. `fpscheck`
gates it at 20ms so a regression on a slow CI box still shows up.

## Everything is generated

`art.js` builds all pixels at startup, seeded, so captures are reproducible:

- **Textures** (11 × 64×64) — brick, stone, moss, iron, tapestry, three doors, exit,
  floor, vault. Drawn into an offscreen canvas with 2D primitives + seeded noise, then
  read back with `getImageData` into a `Uint32Array`.
- **Sprites** (21) — authored through a small DSL (`rect / frame / mr / ell / mell /
  ring / line / outline`) rather than ASCII art. ASCII art looks friendlier but one
  mistyped character silently shifts a row; `mr` mirrors, so humanoids are symmetric
  by construction and there are no row lengths to get wrong.
- **Font** — a 5×5 caps bitmap drawn with `fillRect`. No `fillText` anywhere: it
  antialiases against the pixel grid and looks wrong when upscaled.
- **Audio** — see `src/utils/AudioController.js`: two new tracks (`keep`, a slow
  Phrygian drone; `siege`, the Warden's ostinato) plus ~15 synthesised SFX.

Pixel format is ImageData-native little-endian ABGR: `R = u & 255`,
`G = (u >> 8) & 255`, `B = (u >> 16) & 255`. Getting this backwards is the classic
way to ship a raycaster where every wall is blue.

## Levels are carved, not typed

`levels.js` starts each map as **solid rock** and hollows rooms and corridors out of
it. A hand-typed ASCII maze can leak to the void through one missing wall character,
and a leak in a raycaster means the player sees garbage and walks out of the world.
Carving makes an enclosed level the default; the border-ring check in `fpscheck`
proves it.

Grid chars: `#` brick `=` stone `%` moss `*` tapestry `|` iron `D` door
`L` iron-locked `G` gold-locked `X` exit `.` floor `space` rock. Props (enemies,
pickups, the start) live in a separate list so the grid describes geometry only.

Three halls, each key-gated deeper than the last:

| Hall | Route | Gate |
|---|---|---|
| I · The Gatehouse | courtyard → armoury / gatehouse → crypt → great hall | gold key opens both great-hall doors |
| II · The Undercroft | landing → long hall → west passage → kennels → forge → reliquary → deep cell | iron key → reliquary, gold key → deep cell |
| III · The Black Hall | approach → vault → shrine → black hall (Warden) → throne room | gold key; the Warden does not move aside |

> The audit in `fpscheck` once caught Hall I's gold key being **decorative**: an
> unlocked corridor from the armoury reached the great hall directly, so the locked
> door was scenery. The level is now walked with a *key-gated fixed-point BFS* —
> re-walk until the key set stops growing — which is the only way to notice a key
> sealed behind the door it opens.

## Doors

Doors are wall tiles with an `open` fraction. They **sink into the floor**: the panel
keeps the upper part of the opening, and the texel start is `(y0 - wallTop) * 64/lineH`
— the *same* number as the visible offset, which is why the panel never stretches as
it slides. Making the draw and the collision read one value is the whole trick.

Pushing a door opens it (mobile-friendly: no "use" required); locked doors refuse and
name the key. Enemies shove unlocked doors open on the way through, and the BFS field
treats `D` as passable but never `L`/`G` — so a locked door genuinely stops the horde.

Known artifact: above a *half*-open door you see the near side's floor/ceiling, not
the room beyond. A single ray stops at the first solid tile; Wolf3D has the identical
artifact, and fixing it means portal-receding past the door tile.

## Enemies

Four archetypes (`KINDS`): legionary (bolt), hound (melee, fast), occultist (two
fireballs, keeps its distance), the Warden (3-shot fan, 220hp, charges).

- **Wake** on line of sight, or on gunfire within 11 tiles, or when a nearby ally is
  hit. Once awake, always awake.
- **Pathing is a BFS distance field** from the player, recomputed every 8 frames and
  on tile change; enemies walk downhill toward the lowest neighbour. Greedy
  "steer at the player" gets stuck on the first corner — `fpscheck` has a dedicated
  test for exactly this: a hound 10 tiles away, around a corner, woken by gunfire,
  must come through a door and reach you (measured: **10.0 → 0.6 tiles**).
- **Diagonal moves need both orthogonals open**, or enemies cut corners through walls.
- **Attacks telegraph**: entering `attack` swaps to the `shoot`/`bite` frame and the
  hit lands 0.32s later. The player can break LOS or strafe off it. No hidden damage.
- Pain state flashes a blown-out red "hot" copy of the sprite (also table-built).
- Death sinks the sprite into the floor and swaps to a corpse sprite.
- Light separation keeps a pack from stacking into one silhouette.

## Weapons

| # | Weapon | Rate | Damage | Note |
|---|--------|------|--------|------|
| 1 | Crossbow | 0.42s | 9 | precise, starts with you |
| 2 | Repeater | 0.13s | 6 | spread, found in the armoury |
| 3 | Occult Lancer | 0.85s | 26 | lobbed projectile, 1.8-tile splash |

Bolts are hitscan: segment-vs-circle against every enemy, nearest hit inside the wall
distance from a DDA cast; 14% crit for double damage. The Lancer is a real projectile
(`shots[]`) that detonates on walls and enemies.

## Layout gotcha (shared component)

`VirtualControls` is `position: fixed` across the bottom of the viewport, so a
full-height canvas gets its status bar eaten by the thumb pad. IronKeep sizes its
frame with CSS `min()` instead of `max-w` + `aspect`:

```jsx
style={{ width: 'min(880px, 94vw, calc((100vh - 15rem) * 4 / 3))', aspectRatio: '4 / 3' }}
```

which is the only way to keep a fixed aspect ratio *and* reserve room for the pad.
`VirtualControls` also grew an optional `visible` prop (default `true`, so no other
game changes) so the pad withdraws on the title and death screens — and `fpscheck`
asserts it, the same rule `mariocheck` enforces for Mario.

## DEV hook — `window.__keepTest`

DEV-only (`import.meta.env.DEV`), so every check must target `npm run dev`.

```
start() state() step(n) freeze(b) seed(n) warp(x,y[,ang]) look(a) input(k,v)
give() setWeapon(i) setAmmo(n) setHealth(n) spawn(kind,x,y)->id shoot() hurt(n)
say(t) gotoLevel(i) clearNow() openAll() killAll() wake() list() props()
los(x0,y0,x1,y1) solidAt(x,y) fieldAt(x,y) art() perf()
```

- `freeze(true)` stops the rAF loop; `step(n)` then advances the simulation exactly
  n frames. Movement/AI assertions are arithmetic instead of frame-rate lottery.
- `spawn` returns a **stable id** (not an index) — `loadLevel` rebuilds the array, and
  an index-based assertion silently passes or dies depending on whether the player
  happened to die mid-test.
- `give()` deliberately does **not** touch health. It used to, which made a check
  fail with "hound is missing" when the real story was "the player died and the hall
  reloaded".

## Harness — `npm run fpscheck`

39 checks. Geometry half runs in node (it imports `levels.js` directly — no DOM
there); gameplay half drives Chrome through `openGame(browser, { hook: '__keepTest' })`,
the generalised sibling of `openMario`.

| Group | Examples |
|---|---|
| Level audit (×3) | rectangular, sealed border ring, start on floor, exit has a floor neighbour, no prop inside a wall, **key-gated reachability of the exit and every prop** |
| Shell | attract first, lone Shift must not start, `?` opens/closes the pause overlay, gamepad hidden on menus / shown in play |
| Simulation | wall is impassable (stops at 9.69 of the 9.72 limit), forward motion, door slides open on push, gold door refuses then accepts the key and says so |
| Combat | bolts wound then kill and score, pickups resupply, **hound paths 10 tiles with no LOS**, Warden wakes and dies to the Lancer |
| Flow | exit clears the hall and loads the next, death spends a life and restarts, last exit reaches `win` (not a hang), frame budget, zero page errors |
| Audio | the analyser tap shows signal while the dungeon track plays (same idea as `audcheck`) |

```bash
npm run dev            # another terminal
npm run fpscheck       # or: npm run verify (it is part of the suite)
npm run keepplay       # real-key feel probe (see below)
npm run shot -- --url http://localhost:5173/retrogames/ironkeep \
  --eval "window.__keepTest.gotoLevel(2);window.__keepTest.warp(16.5,16.5,0)" \
  --out scripts/.shots/keep-boss.png
```

### Why there is also a `keepplay`

`fpscheck` freezes the loop and steps it by hand — exact, but it bypasses the input
path. A keydown+keyup that both land between two 60Hz samples never reaches
`update()` under `step(n)`, yet happens constantly in a browser: a quick Space tap
was silently doing nothing and every check stayed green. `scripts/keepplay.mjs` walks,
taps, runs and strafes with real keyboard events only, and asserts the two invariants
that bug violates — a tap registers, and the cooldown still throttles (2–3 shots from
6 fast taps, not 0 and not 6). If you touch input handling, run both.

## Known gaps / next steps

- **No vertical look.** Eye height is fixed at 0.5 tiles (Wolf's own limitation);
  `horizon` shifts for screen shake only. Adding pitch means offsetting floor, wall
  and sprite math consistently — do it as one change or not at all.
- **Half-open doors show near-side floor** through the gap (see Doors).
- **No stairs, slopes, or multi-height sectors** — that is the Doom line, and this
  engine deliberately does not cross it.
- **Enemies never handle locked doors**: they stop and mill about. Correct, but a
  "break down the door" behaviour would read better for the Warden.
- **Floor cast is stride-2** and the far-row cutoff (`FOG * 1.25`) can leave a faint
  band at the horizon in long halls.
- **Sprites are 16×24.** Deliberately chunky; point-blank enemies are blocks of pixels.
- **No difficulty setting, no episode select** beyond pressing 1/2/3 at the title.
- **`lint:mario` and `lint:fps` overlap** on the shared dirs. They should become one
  `lint:games` that widens as the DOS/IF titles get clean.
- **No mouse-look sensitivity option**, and pointer lock is silent if the browser
  refuses (headless Chrome does sometimes) — keyboard turning is the fallback.
