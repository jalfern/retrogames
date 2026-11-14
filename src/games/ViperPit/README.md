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
- **Guard crush (#1106)**: every fighter carries a hidden GUARD gauge (the
  teal strip above the meter). Each blocked hit drains it by the hit's damage;
  when it empties the guard **CRUSHES** — the defender staggers back guardless
  for a long punish window (`st === 'crush'`, ~0.77 s), takes chip damage, and
  a `GUARD BREAK` banner + hard crack + screen jolt sell it. The gauge regens
  while the fighter isn't guarding and resets full when a crush wears off.
  Engine option `createMatch({ guardCrush: true })` — off by default so IRON
  RING sims stay bit-identical; the netplay hash is deterministic either way.
- **Guard feedback (#1106)**: blocking now shows. A blocked hit shimmers — an
  additive teal arc in front of the defender (facing the attacker) plus a cyan
  glow + light sweep across that fighter's guard gauge. A broken guard
  shatters — the gauge flashes white-hot with crack ticks, and a teal ring
  opens at the defender as shards fly off. Both fx are pure-curve driven
  (`guardShimmer`/`guardShatter`, 18/26 frames) and presentation-only — the
  engine and hashes never see them.
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
- **Animation depth (#1106)**: five fighters, five ways to stand. Each carries a
  `stance` profile (lean, breathe amplitude/tempo, guard geometry, leg set) —
  NYX low and bladed, CINDER upright weight-back, VESS light and bouncy on his
  toes, RIV squared classic, KRAX wide-hunched with arms open for the grab.
  Hitstun is directional: front hits snap the head back, a hit from behind
  pitches the body forward (push sign vs facing), lows buckle the knees (the hit
  event's `mv` carries the height into `rig.hitHint`, cleared when the stun
  ends), overheads snap the head up-and-back. Walking in drives the shoulders
  toward the opponent; walking out is a tighter, shorter shuffle. Presentation
  only — fighters.js data + render.js posing; engine and hashes untouched.
- **Walk gait (#1106)**: five fighters, five ways to walk. Each carries a
  `gait` profile (tempo, stride, hip bob, arm swing, toe lift) — KRAX lumbers
  on a slow wide stride, NYX takes quick bladed steps, VESS bobs hardest on
  his toes, RIV strides square, CINDER is even and measured. The cycle
  alternates the legs, lifts the hips once per step, kicks the swinging toe
  up, bends the trail knee as the planted leg takes weight, and counter-swings
  the arms around the fighter's OWN guard geometry instead of dropping into a
  generic tuck. Walking out steps slower and shorter than walking in.
  Presentation only — fighters.js data + render.js walk branch; engine and
  hashes untouched.
- **Midground (#1106)**: each pit gets a depth layer of props between the
  fighters and the fence (alley crates + barrels, foundry tanks + drums, subway
  booth + benches) — variety beyond the flat backdrop. The props are pivot
  groups that live: a wall-clock breeze, and a kick when a fighter rushes past
  or a forced hit lands (`fx()` sway). Presentation only — netplay hashes
  untouched.

## Where the code lives

- `src/engine/fighting.js` — shared core + the #1096 options (`guardButton`,
  move-level `finisher`/`finishAt`, `qcbf` motion, projectile vy/grav for
  arcing kicks, `guardCrush` for the guard gauge + crush state). Every new line
  is behind a flag or a data key the IRON RING roster never sets. Hit events
  carry the move key (`mv`, #1106 audio seam) — an additive field; `matchHash`
  ignores events, IRON RING stays bit-identical.
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
  cinematic. `guardShimmer`/`guardShatter` are pure guard-fx curves; `shield`
  (arc mesh) and `shatter` (ring + 8 shards) spawn them, `sync` animates and
  recycles the pools, and `fxCount()` reports the live pools for probes.
- `src/games/ViperPit/index.jsx` — cabinet: attract CPU-vs-CPU demo, select,
  street ladder (NYX→KRAX easy→insane), local 2P, #1039-lobby netplay with the
  9-verb pad wire + hash-every-30, HUD canvas, FINISH flash/letterbox juice.
  DEV `__viperPitTest` also exposes `fx()` (stage-life snapshot), `stage(i)`
  (jump to a pit by index), `sweep()` (force the train pass) and the guard-fx
  probes `forceBlock(i)`/`forceCrush()`, `blockFx()`, `breakFx()`,
  `shieldFx()` (live GL pool counts).
- **Select screen (#1106, card poses #2172)**: each card shows the fighter's OWN rig rendered by
  `createPortraitRenderer` (a mini 240x187 GL view, preserveDrawingBuffer so
  the HUD `drawImage`s it; card aspect matches the canvas so nothing
  stretches; teal rim light). #2172: every fighter HOLDS their own signature
  pose (`def.card` — NYX deep-bladed with the lead hand out, CINDER weight back
  palms up, VESS on his toes elbows loose, RIV squared high fists, KRAX hunched
  with arms wide for the grab), and each portrait's FRAMING IS COMPUTED from the
  posed rig: `render()` measures the silhouette with a `Box3` and backs the lens
  off until the body fits the 30° frame with ~14% margin (vertical and
  horizontal, so the yaw actually counts), with a slight top-down bias so the
  feet stay in. Hand-tuned per-fighter `camZ` is gone — it could only trade a
  cropped head for cropped feet, and measured portraits were losing the top of
  every head. Names/tags print UNDER the tile (arcade-style) so the text never
  crosses the art; the tap hit-rect grows by a `textBand` so tapping a name
  hovers that card. Portraits
  are frozen into per-fighter snapshot canvases — the GL surface is one
  reusable element and before #2172 all five cards composited the SAME live
  canvas (every tile showed the last-rendered fighter; the old ink/head gates
  couldn't see it because five identical pictures still "painted a fighter").
  Hovering (or tapping another card — tap-to-hover walks the cursor instead of
  picking; tapping the hovered card picks) eases that card's zoom to 1: the
  WHOLE tile pops 1.16x (frame, portrait, name and tag scale together), glows
  teal and draws LAST so it rides over its neighbours. The portrait scales
  inside its tile (12% vs the tile's 16%), never through the frame — grew-only-
  the-portrait pushed every fighter's head above the border. Hovering blips the hovered fighter's `voice` register
  (`voiceNotes` in fighters.js, two notes of base + fifth) and prints their
  intro line under the name row; the pick stings the register's low pair and
  carries `NAME — INTRO` from the pick through the pre-fight intro. The card
  grid sizes from the viewport so all five fit. Zoom eases per select frame and
  resets when select closes. All presentation — the engine and hashes never see
  it. DEV hooks: `selectInfo()` (cursor/id/portraits/line/zoom), `hover(d)`,
  `pick()`, `zoomOf(i)` (per-card zoom), `portraitStats()` (per-portrait ink +
  head-region pixels + head centroid + silhouette hash + head/feet rows `top`/
  `bottom`/`span` — alpha on the transparent canvas is exactly "the fighter", so
  a crop shows up as 0.000 or 1.000), `cardRects()`
  (live card geometry for the on-screen fit + portrait-ink pixel audit).

## Rules worth knowing

- Blocking: only `bk` (guard) blocks in this title; `blockHeld` still covers
  idle/crouch/blockstun. GUARD+DOWN = crouch-block; throws beat guard.
- Guard crush: blocking drains a hidden gauge by the hit's damage; an empty
  gauge CRUSHES the guard (a long helplessness + chip, `GUARD BREAK` banner)
  that the opponent can punish. The gauge regens while not guarding and resets
  full after a crush. Read the teal strip — flash red means you're about to
  crack.
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
- Y — WATCH (#1637 b30): seat 1 fights on its fighter's own ladder-tier CPU
  brain (the seat flips `def.cpu`; fighting.js emits the corner's pads). Any
  driving key or a touch takes the corner back; the seat rides the ladder;
  released at the title and at KING OF THE PIT. 1P ladder only — local 2P and
  the net wire own their pads. Phones seat from the in-run pill (top-right;
  the attract pill is honestly skipped — the fighter picker sits in the boot
  path and the attract already self-drives a CPU bout).
- Online: `/retrogames/viper-pit?net=host` / `?net=join&room=CODE`.

## Verify

- `npm run viperpitcheck` — the Node rules (guard vs back-walk, low-block,
    throw-through-guard, uppercut launch, FINISH + healthy-foe finisher, qcf/qcbf not stolen, qcb
    counter fires, cancel combo, juggle rules, guard crush — a guard that absorbs
    enough blocks breaks into a punish stun, the punch then connects unblocked,
    and the gauge regens — determinism, every ladder CPU completes
  a match, hit events carry `mv`) + the #1637 b30 WATCH seat law (own-tier
  seats vs LIVE rung 1: 60/60 bouts decide, offence on every seed, >= 8
  rounds each — autonomous combat proven, a full-ladder climb explicitly NOT
  claimed: NYX mirrors rung 1 on itself) + the #1106 audio wiring (source-level
  call-site gates + a stripped-whoosh/sting mutant proving the gate bites) +
  the #1106 stage-life wiring (source gates for the molten pulse/cast, rain
  fall, train sweep + a dead-pulse mutant) + headless Chrome drive
  (attract→select→fight, real keys reach the sim, GUARD hold, K.O. flow, the
  stage bed running and the KO crowd surge reaching the real audio graph,
    stage-life runtime probes via `fx()`: molten opacity actually changes and
    the cast light is on, `rainFallen` advances, a forced subway sweep walks
    0→1, the midground layer present per pit and rocking past its idle breeze
     on a forced `midKick()`, the finisher cinematic running its multi-beat
     sequence via `forceFinish()` + `cine()`, the qcb counter live in the sim,
     a forced guard-crush entering and clearing the crush stun with the gauge
     refilling via `forceCrush()` + `guard()`, guard-fx live via
     `forceBlock()`/`forceCrush()` + `blockFx()`/`breakFx()`/`shieldFx()` (arc
     in the GL pool, gauge strip pixel-audited for the cyan shimmer and the
     white-hot break flash), the five idle stances reading
     distinct live and front/back/low/overhead hit reactions differing via
     `pose()` + `forceHit()`, a real ArrowRight hold walking with the gait
     readable live — legs alternating, hips bobbing per step, KRAX striding
     wider than NYX and both keeping their own guard-arm geometry via
     `pose()`'s legR/legL hips, zero page errors) + the #2172 select-card gates
     (five unique silhouette hashes — the shared-canvas kill-shot — head
     centroid spread, hover zoom ease + handoff, tap-to-hover with voice blip,
     zoom reset on exit, warm-ink containment (no portrait above its own
     card frame, with a live `__VIPER_SPILL__` prove-fail), framing from the
     fighter's own extents (nothing cropped, every tile filled) and name-row
     placement (no white text over the art, names present under each tile);
     distinct card-pose
     data; self-biting mutants for the shared canvas, flattened zoom, buried
     hovered card, a portrait outgrowing its tile, the camera shoved into the
     fighter and the stripped pose table).
- `npm run viperpitcheck -- --mutate` — proven-fail: removing the guard gate
  must let heavies smash through GUARD; lifting the juggle cap must let the
  third aerial hit connect.
- `CONTRACT_ONLY=viper-pit npm run contractcheck` — the #377 driving contract.
- `npm run lint:viper` + the three repo gates (`lint:mario`, `lint:fps`,
  `lint:ai`) + `npm run build`.

## Honest gaps (polish-pass candidates)

- **CLOSED by #2158:** KO-card juice — the verdict no longer just appears:
  PERFECT/CLUTCH/IN STYLE **slams in** over 7 frames (2.3x scale-down, ease
  out) with a full-screen tint flash in the judge's own colour; a **PERFECT**
  flares the pit for ~0.5 s (`stageFx.flareUntil` → every crowd phone to full
  brightness + silhouettes bobbing harder, decaying in `sync`); the winner's
  **taunt pose blends** in over ~10 frames (`rig.userData.winK`, captured from
  wherever the KO caught the rig) instead of snapping to the pose table; and
  the loser's answer **slides in** from the left over ~11 frames (frame-counted,
  so the feel is frame-rate independent) with an accent underline drawing on
  under it. Live gates: the DEV card log `koProbe()` records every entrance
  **per render frame** (`wk`/`js`/`jt`/`fl`/`rp`) — wall-clock CDP polling on a
  loaded box straddles whole animations, so the gates judge frames, not poll
  spacing: blend mid-way (<0.95) to held (1.00), verdict peak ≥1.5x with a
  tint peak then settling to 1x/tint 0, flare seen **only** when the round's
  judge is PERFECT (non-PERFECT rounds must log zero flare), reply slide 0→1.
  `outround()` also reports `judgeScale`/`judgeTint`/`flare`/`replySlide` and
  `pose()` reports `winK`. Six source wiring gates + an instant-blend mutant
  marker alongside the instant-reveal one.
- **CLOSED by #2148:** deeper outround replies — per-character taunt-on-win
  (shout in the winner's accent + beckon/flex/point/raise/spit rig poses),
  round-end loser sub-lines (own `roundLose` table), PERFECT/CLUTCH/IN STYLE
  judges, the match-arc line (WITHOUT LOSS / ONES THAT MATTERED) and a
  call-and-response reveal with a loser-register reply sting, all pinned in
  `viperpitcheck`.
- **CLOSED by #2172:** portrait polish — pose-per-card (five signature `card`
  poses + per-fighter camera framing), hover/tap portrait zoom (whole-tile pop
  1.16x + draw-last, portrait contained by its frame), tap-to-hover on the card
  grid, and the fix underneath it all: portraits are frozen into per-fighter
  snapshot canvases (the GL surface was shared, so all five tiles showed one
  fighter). Pinned by silhouette-hash, centroid-spread, zoom-handoff, tap-hover,
  the tile-containment invariant and four self-biting mutants in `viperpitcheck`
  (plus a live `__VIPER_SPILL__` prove-fail for the containment gate).
- Stage midground + fight-reactive sway landed (#1106); heavier interactivity
  (destructible props, pickups) still open.
- `qcb` counter + guard crush landed (#1106): blocking drains a guard gauge;
  an empty gauge CRUSHES into a long punish stun (chip + `GUARD BREAK`), the
  gauge regens and resets full. A live guard/stun meter is drawn above the
  bar, and the feedback reads now too — shimmer arc + gauge cyan sweep on
  every block, white-hot flash + shard burst on the break.
- Net select: guest pick reaches the host only if sent before the host starts.
