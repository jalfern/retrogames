# VIPER PIT (#1096)

An original gritty one-on-one fighter in the spirit of the 1992 arcade shock
that made fighting games dangerous — original IP throughout: names, roster,
stages, moves, look. MODERN bar: articulated 3D fighters, dark atmospheric
pits, fog and hanging lamps. Sits on the shared fighting core from #1095 with
the #1096 options switched on.

## What makes it the gritty one, not IRON RING

- **A dedicated GUARD button** (`pad.bk`, O key / on-screen GUARD): back-walking
  never blocks. GUARD+DOWN blocks lows. Engine option
  `createMatch({ guardButton: true })` — default off, so IRON RING sims are
  bit-identical.
- **Uppercuts that launch**: every fighter's rising `dp` (→↓↑+P) sets a big
  `launch` (0.125+); the victim pops into a juggle window.
- **Juggle rules (#1106)**: engine option `createMatch({ juggle: true })`
  (default off — IRON RING stays bit-identical). Launched victims keep their
  horizontal speed damped so they hang in a pocket instead of flinging away;
  exactly ONE aerial follow-up lands per launch (it re-pops the victim and
  counts in the combo), and every further airborne hit is refused — the lock
  clears when the victim's back hits the floor (hitair→down→getup).
- **A signature finishing move per fighter**: `qcbf` (↓←↓→+P) at a FULL bar.
  Engine checks `qcbf` before `qcf` so its d,f tail can't be stolen. If the hit
  is clean and the victim is at/below `finishAt` (30) HP the round ends with a
  FINISH! banner + the fighter's named finisher over the top (stylized, no
  gore). CPU guards and attempts finishers through the same pad scripts.
- **Dark stages**: back alley at 2 a.m., the foundry, the last train — fog,
  procedural asphalt, chain-link, neon signs, silhouetted crowds with phone
  glow, hanging lamps with light cones, drifting embers.
- **Sound (#1106)**: every stage runs its own ambient bed (alley crowd murmur
  + rain drips, foundry machinery, subway rail hum + track clacks —
  `MUSIC.viperAlley/viperFoundry/viperSubway`, started with the fight via the
  stage's `bed` key, stopped on unmount). Swing sounds fire at move START via
  the st:move transition (`hearSwings`): launchers whoosh, throws grunt. The
  hit event now carries the move key (`mv`) so a throw's SLAM lands on impact
  (grunt at startup, slam on hit). Each finisher has a per-fighter sting on
  the `finish` event (NYX stitch, CINDER bonfire, VESS dry-land, RIV neon
  zap, KRAX scrap clang). K.O. adds a low-passed crowd-surge swell.

## Where the code lives

- `src/engine/fighting.js` — shared core + the #1096 options (`guardButton`,
  move-level `finisher`/`finishAt`, `qcbf` motion, projectile vy/grav for
  arcing kicks). Every new line is behind a flag or a data key the IRON RING
  roster never sets. Hit events carry the move key (`mv`, #1106 audio seam) —
  an additive field; `matchHash` ignores events, IRON RING stays bit-identical.
- `src/games/ViperPit/fighters.js` — 5 fighters (NYX assassin easy, CINDER
  zoner, VESS acrobat, RIV all-round, KRAX grappler insane); each: build/gear,
  palette, stats, specials on engine motion keys + a named `finish`.
- `src/games/ViperPit/stages.js` — 3 pits (fog/light/props/neon data).
- `src/games/ViperPit/render.js` — three.js: articulated limb rigs
  (shoulder/elbow/hip/knee groups, capsule limbs), canvas-texture asphalt,
  chain-link fence, crowd + lamps + embers, hit sparks, SSIV-ish camera
  (midpoint + zoom-by-distance) with handheld shake.
- `src/games/ViperPit/index.jsx` — cabinet: attract CPU-vs-CPU demo, select,
  street ladder (NYX→KRAX easy→insane), local 2P, #1039-lobby netplay with the
  9-verb pad wire + hash-every-30, HUD canvas, FINISH flash/letterbox juice.

## Rules worth knowing

- Blocking: only `bk` (guard) blocks in this title; `blockHeld` still covers
  idle/crouch/blockstun. GUARD+DOWN = crouch-block; throws beat guard.
- Finishers spend the whole bar; they do big damage to healthy foes (dmg 20-26,
  never a reliable KO) and end a wounded one (≤30) outright via the
  `finish` event path in `resolveHit`.
- Determinism unchanged: seed + pads ⇒ identical `matchHash` (checked at
  `viperpitcheck` and via `contractcheck`).

## Controls

- P1: arrows · O or the GUARD button = block · J/Space/A punch-L · K punch-H ·
  U/B kick-L · I kick-H.
- P2 (local 2P): WASD + F/G/V/B, H guards.
- Motions: ↓→+P special (EX@50, super@100 same motion) · →↓↑+P uppercut
  (launches) · ↓←↓→+P at FULL bar FINISHING MOVE · close →+heavy THROW.
- 1 ladder · 2 local 2P · keys 3-7 quick-pick · Esc/? pause.
- Online: `/retrogames/viper-pit?net=host` / `?net=join&room=CODE`.

## Verify

- `npm run viperpitcheck` — 62 gates: the Node rules (guard vs back-walk,
  low-block, throw-through-guard, uppercut launch, FINISH + healthy-foe
  finisher, qcf not stolen, cancel combo, juggle rules, determinism, every
  ladder CPU completes a match, hit events carry `mv`) + the #1106 audio
  wiring (source-level call-site gates + a stripped-whoosh/sting mutant
  proving the gate bites) + headless Chrome drive (attract→select→fight,
  real keys reach the sim, GUARD hold, K.O. flow, the stage bed running and
  the KO crowd surge reaching the real audio graph, zero page errors).
- `npm run viperpitcheck -- --mutate` — proven-fail: removing the guard gate
  must let heavies smash through GUARD; lifting the juggle cap must let the
  third aerial hit connect.
- `CONTRACT_ONLY=viper-pit npm run contractcheck` — the #377 driving contract.
- `npm run lint:viper` + the three repo gates (`lint:mario`, `lint:fps`,
  `lint:ai`) + `npm run build`.

## Honest gaps (polish-pass candidates)

- Finishers are one big hit today; a multi-beat cinematic sequence per finisher
  would sell the signature moment.
- No intro/outround dialogue lines; win/lose quotes are QA polish.
- Sub-zero: no stage interactives or midground variety beyond props.
- `qcb` still unused by any fighter; guard crush / stun meter not implemented.
- Net select: guest pick reaches the host only if sent before the host starts.
