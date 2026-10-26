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
- **A qcb counter per fighter (#1106)**: `qcb` (↓←+P) — a fast down-back
  counter with per-fighter frame data (NYX a quick blade, CINDER a close flame
  burst, VESS a rising back-axle, RIV a heavy shoulder check, KRAX a headbutt).
  The engine resolves `qcb` *after* `qcbf` so the finisher's `d,b` prefix isn't
  stolen (its 2nd token, back, also can't be confused with qcf's forward), and
  the CPU throws it at close range.
- **Finisher cinematics (#1106)**: a finisher that ends the round plays out as
  a 3-beat sequence over the KO freeze — the loser is scripted through the
  signature beats (KRAX grab→strike→slam, VESS grab→flip→dry-land, NYX a triple
  stitch, CINDER charge→flare→blast, RIV charge→surge→blast), each beat a
  camera punch-in + a per-beat blow, the per-fighter sting landing on the final
  hit. Presentation only (wall-clock driven) — the engine and netplay hashes are
  untouched.
- **Dark stages**: back alley at 2 a.m., the foundry, the last train — fog,
  procedural asphalt, chain-link, neon signs, silhouetted crowds with phone
  glow, hanging lamps with light cones, drifting embers. The pits are alive
  (#1106 stage life): the foundry's molten pool breathes (slow pulse under a
  fast shimmer) and casts a flickering orange light onto floor and fighters;
  the alley runs falling rain streaks (LineSegments, wind-slanted, wrapping);
  the subway gets an occasional train pass — a headlight PointLight sweeps
  across the pit over ~4.5 s and the car windows flash bright with it. All
  presentation (wall-clock driven, like the lamp flicker) — nothing feeds the
  engine, so netplay hashes are untouched.
- **Sound (#1106)**: every stage runs its own ambient bed (alley crowd murmur
  + rain drips, foundry machinery, subway rail hum + track clacks —
  `MUSIC.viperAlley/viperFoundry/viperSubway`, started with the fight via the
  stage's `bed` key, stopped on unmount). Swing sounds fire at move START via
  the st:move transition (`hearSwings`): launchers whoosh, throws grunt. The
  hit event now carries the move key (`mv`) so a throw's SLAM lands on impact
  (grunt at startup, slam on hit). Each finisher has a per-fighter sting on
  the `finish` event (NYX stitch, CINDER bonfire, VESS dry-land, RIV neon
  zap, KRAX scrap clang). K.O. adds a low-passed crowd-surge swell.
- **Midground (#1106)**: each pit gets a depth layer of props between the
  fighters and the fence (alley crates + barrels, foundry tanks + drums, subway
  booth + benches) — variety beyond the flat backdrop. The props are pivot
  groups that live: a wall-clock breeze, and a kick when a fighter rushes past
  or a forced hit lands (`fx()` sway). Presentation only — netplay hashes
  untouched.

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
  (midpoint + zoom-by-distance) with handheld shake. `buildStage` returns the
  stage-life fx handles (`molten` {mat,light}, `rain` {geo,vel,fallen},
  `sweep` {light,wins,phase,period,force,prog}, `mid` {items,n,maxSway,force});
  `sync` animates them per frame (molten pulse/cast, rain fall + wrap,
  periodic/forced train sweep, midground breeze + fight-rush kick).
  `poseFinisherBeat` scripts the loser through a finisher's beats, and `sync`
  takes a `cine` handle (camera punch-in + victim beat pose) for the FINISH
  cinematic.
- `src/games/ViperPit/index.jsx` — cabinet: attract CPU-vs-CPU demo, select,
  street ladder (NYX→KRAX easy→insane), local 2P, #1039-lobby netplay with the
  9-verb pad wire + hash-every-30, HUD canvas, FINISH flash/letterbox juice.
  DEV `__viperPitTest` also exposes `fx()` (stage-life snapshot), `stage(i)`
  (jump to a pit by index) and `sweep()` (force the train pass) for probes.

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
-   Motions: ↓→+P special (EX@50, super@100 same motion) · →↓↑+P uppercut
  (launches) · ↓←+P qcb counter · ↓←↓→+P at FULL bar FINISHING MOVE · close →+heavy THROW.
- 1 ladder · 2 local 2P · keys 3-7 quick-pick · Esc/? pause.
- Online: `/retrogames/viper-pit?net=host` / `?net=join&room=CODE`.

## Verify

- `npm run viperpitcheck` — the Node rules (guard vs back-walk, low-block,
    throw-through-guard, uppercut launch, FINISH + healthy-foe finisher, qcf/qcbf not stolen, qcb
    counter fires, cancel combo, juggle rules, determinism, every ladder CPU completes
  a match, hit events carry `mv`) + the #1106 audio wiring (source-level
  call-site gates + a stripped-whoosh/sting mutant proving the gate bites) +
  the #1106 stage-life wiring (source gates for the molten pulse/cast, rain
  fall, train sweep + a dead-pulse mutant) + headless Chrome drive
  (attract→select→fight, real keys reach the sim, GUARD hold, K.O. flow, the
  stage bed running and the KO crowd surge reaching the real audio graph,
    stage-life runtime probes via `fx()`: molten opacity actually changes and
    the cast light is on, `rainFallen` advances, a forced subway sweep walks
    0→1, the midground layer present per pit and rocking past its idle breeze
    on a forced `midKick()`, the finisher cinematic running its multi-beat
    sequence via `forceFinish()` + `cine()`, zero page errors).
- `npm run viperpitcheck -- --mutate` — proven-fail: removing the guard gate
  must let heavies smash through GUARD; lifting the juggle cap must let the
  third aerial hit connect.
- `CONTRACT_ONLY=viper-pit npm run contractcheck` — the #377 driving contract.
- `npm run lint:viper` + the three repo gates (`lint:mario`, `lint:fps`,
  `lint:ai`) + `npm run build`.

## Honest gaps (polish-pass candidates)

- No intro/outround dialogue lines; win/lose quotes are QA polish.
- Stage midground + fight-reactive sway landed (#1106); heavier interactivity
  (destructible props, pickups) still open.
- `qcb` counter landed (#1106); guard crush / stun meter not implemented.
- Net select: guest pick reaches the host only if sent before the host starts.
