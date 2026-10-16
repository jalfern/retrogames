# PRINCE OF PERSIA

Jordan Mechner's 1989 Brøderbund dungeon escape, rebuilt whole in code — no
assets. One hour of dungeon clock; the deep pass (#316) is taking it to the
original's full height: twelve levels, the real duel, the look.

`https://jalfern.com/retrogames/prince-of-persia`

## Stage 1 of #316 — the rules of 1989

- `sim.js` — the pure deterministic engine, `step(state, input)` at 60 Hz.
  Multi-room dungeons: rooms are 10 tiles wide, the screen **flips** (hard cut)
  at a doorway. **No lives** — death restarts the level while the 60-minute
  clock keeps running; level 3 has a mid-level checkpoint. You start **unarmed**
  (the sword lies in level 1; outside a fight it stays sheathed). The duel is
  timing, not heights: advance/retreat on the arrows, **Strike (X)** and
  **Block (Up)** — a guard's telegraphed lunge is parried by blocking in time,
  and a parry stuns him long enough to counter. Falls are measured in floors:
  one lands safe, two costs blood, three kills. A ledge is caught only by
  **holding Shift** while falling — no auto-grab; Up climbs, Down releases.
  Machinery: raise buttons lift gates that then close slowly (race them), drop
  buttons slam them, chomper jaws snap on a schedule, loose floors fall and
  stay as rubble, the exit plate opens the door for good. The flasks are the
  1989 set: small red +1, large red +1 max, blue poison −1, slow-fall,
  upside-down — no strength potion. Sunrise ends the run (`status='lost'`).
- `levels.js` — rooms as ASCII into one wide grid (legend in the file header;
  gate columns extend to ceiling-height portcullises, room-edge doorways are
  cleared automatically, ground floor is continuous).
- `planner.js` — the autopilot / attract brain: waits for chomper jaws, steps
  on the raise button and races the closing gate, blocks the lunge and strikes
  the recoil. `popcheck` runs this exact code.
- `art.js` — every pixel in code: mortar-grained blue-grey stone; floors read
  as ledges (lit top, dark front face); rooms without torches sit in shadow;
  torches pool trembling light. Portcullis bars lift into the ceiling, chomper
  teeth rise from the floor as a blade drops, loose tiles tremble, crack and
  pile into rubble. HUD: health as little flasks bottom-left, the duel guard's
  flasks bottom-right, room counter + hour on top.

## Stage 2 of #316 — the look and the animation

- **Pose table** (`art.js` `POSES`): the prince runs on an 8-frame cycle of
  two-segment legs (thigh + shin + knee), plus separate start / skid / turn /
  jump-crouch / land / hang-sway / climb (4 frames over ~1 s) / careful-step /
  crouch / drink / draw / sheathe / block / attack poses. The sim carries
  visual-only timers (`drinkT`, `drawT`, `sheatheT`, `startT`, `skidT`,
  `turnT`, `landT`) that never feed the physics — the 75 Stage-1 rule checks
  still pass, plus 24 Stage-2 clauses.
- **Deaths with weight**, one per cause (`DEATH_ANIMS`): impaled bodies stay
  up on the spikes (and drip), a chomper slices the figure into two parting
  halves, a long fall crumples to a heap, the sword cuts you down onto your
  knees; poison curls.
- **Guards rank at a glance**: turban colour by skill (green → red), a wider
  fat-guard frame (`PALETTES.fat.wide`), a bone-and-rib skeleton, Jaffar in
  purple robes with a tall hat; `GUARD_STYLE` in the sim varies footwork,
  wind-up telegraph and cooldown by skill too.
- **Themes**: `levels.js` carries a per-level `theme`; `THE CHECKPOINT` is
  `palace` — pale walls with pillars, moonlit arched windows and tapestries
  (`palaceWall`). Rooms without torches stay visibly darker; torch flames shed
  sparks and tint the stone warm.
- `index.jsx` — attract first, fixed-timestep loop, `'?'` pause,
  `VirtualControls` pad + ⚔ (KeyX) for phones, DEV-only DebugKit (F1) with
  cheats including **prognosis** (re-runs the autopilot solver on the live
  mutated state), synth sfx off sim events.

## Controls

Arrows move · SPACE jump (hold = farther) · SHIFT hold while falling = grab
(run modifier on the ground) · UP block / climb · DOWN crouch / release hang ·
X or Z strike · ? pause · R restart after the hour is lost.

## Verify

```bash
npm run lint:pop     # scoped lint gate
npm run popcheck     # 302 checks: the 75 Stage-1 rules + 24 Stage-2 look
                     # clauses + 67 Stage-3 clauses + 25 Stage-4 sound clauses
                     # + 14 Stage-5 gate/banner/escort clauses + 15 Stage-6
                     # light-model clauses + 17 Stage-7 escort clauses + 16
                     # Stage-8 colour-temperature / floor-bounce / phone-light
                     # clauses + 26 Stage-9 two-source (moon) clauses + 23
                     # Stage-10 interacting-source clauses.
                     # Champion run pinned: autopilot clears all twelve levels at
                     # 0 deaths, the mirror / mouse-held gate / poisoned phantom
                     # shadow / invisible bridge / sheathed merge all fire in that
                     # run, and the event->SFX contract closes both ways.
npm run popplay      # advisory headless drive (needs npm run dev): real keys
                     # start/run/jump, find the sword, die on the traps, the
                     # level restarts under a running clock, R restarts, the
                     # attract screen is silent, the hour rides a music bed
                     # (analyser over the silence), and all twelve levels carry
                     # the right bed — zero page errors
```

Mutant proof at ship time: dropping `parry` from the SFX table turned
`popcheck` red in two clauses (missing voice + orphan) and was restored.
`popplay` 17/17 with audio checks.

## Stage 3 of #316 — all twelve levels (this merge)

- **Twelve named levels**, 4–5 rooms each on an 11-row grid: the ground floor
  is row `GROUND=8` and two pit rows live below it (row 10 auto-solid unless
  authored). `_` opens a shaft through the ground row; row 10 fills solid
  except authored cells.
- **The magic mirror** (`m`/`M`, L4): stepping to the glass teleports you to
  its far side, once per level entry — the barred corridor has other ways.
- **The shadow** (L5+): a black silhouette gathers behind the starting wall
  and re-enacts your inputs `CFG.shadowDelay` ticks late. It never jumps, so
  shafts are its death; it drinks phantom flasks (L5's poison kills it, not
  you — `shadowDrink`/`shadowDown` events); it freezes while your sword is
  drawn; and its touch kills — except in the lair.
- **The princess's mouse** (L8, `h`): scurries to a raise button and holds it
  so the gate stays open for you (`mouseHold` gates the button's room).
- **The feather** (L7): with `lev > 0` a killing drop (≥2.5 floors) costs a
  point of blood instead of the run.
- **The invisible bridge** (L12, `i`): planks that are solid underfoot from
  above but paint nothing until the first step finds them (`bridgeSeen`).
- **The merge** (L12): at the exit threshold the shadow peels off its replay
  and catches up; a touch with the sword sheathed folds it back into you
  (`merge` event, `g.merged`) and the story ends without killing yourself.
- **Interludes**: twelve crossing cards between levels (`INTERLUDES` in
  `index.jsx`); the frame is 10/11 to seat the pit rows.
- Shadow spawn gap is 18 tiles ≈ `shadowDelay × prince speed` — replay-lag
  self-similarity keeps the gap honest: stalls shorter than the delay (a gate
  hold) do NOT let it catch you; longer ones DO, which is the whole threat.

## Stage 4 of #316 — sound & feel (this merge)

The 1989 original is *silence-first*: a dungeon you hear before you see, a
sound on every action, no music on the title. That is what this stage builds.

- **`music.js` — the sound spine (pure).** `trackFor(state)` decides which bed
  the moment deserves: `pop` (dungeon), `popThrone` (palace levels),
  `popJaffar` (while the vizier stands in your room), `null` on the attract
  screen and when you die — the original drops to silence the moment you fall.
  `SFX` is one recipe per event the sim can emit, as tiny synth steps
  (`['tone'|'sweep'|'noise', ...]`); popcheck pins the table against `sim.js`
  **both ways**, so a future event that ships without a voice fails the gate.
- **Three original beds** (`AudioController`), composed for this build in the
  Hijaz / "Persian" mode (D Eb F# G A Bb C#): the drip-stone dungeon, the
  grander throne room an octave up, and Jaffar's fast chromatic-second
  ostinato. Each carries a darbuka lane (1 = dum, 2 = tek) — the synth engine
  grew a `perc` step to play it.
- **The gait is in the sim**: `foot` events off a stride accumulator (one
  footfall per ~42 px of travel), flagged `run`/`soft`, so running hammers,
  careful steps whisper, and standing still is silent. `land` thuds the
  landing; `chain` rattles while a portcullis is actually moving (brighter
  rising, grittier falling, a click on the first tick of travel).
- **Torch ambience** in the shell: a thin crackle every few ticks, denser in
  rooms that carry flame, off on menus and death screens. Deterministic tick
  arithmetic — no `Math.random` anywhere in the spine (pinned).
- **Stings**: the big death descending line and the victory fanfare on the
  last door; the sheathe/parry ring, potion glugs (all five flasks flavoured
  apart), the mirror's glass sweep and the merge's rising fold all come off
  the event table.

## Stage 5 of #316 — the gate, the banner, the stone, and escorts (this merge)

Jon played it and named four things. This stage ships all four.

- **Gates drawn from the truth.** The old `drawGate` hung its bars to
  `lowRow*T + (lowRow+1)*T*(1-open)`, which overshot the floor and left a
  *looks-shut-but-you-walk-through* gate. A gate is now drawn from the same
  number `blocks()` consults: `art.gateBottom(lowRow, open)` hangs the bars to
  the floor while `open < CFG.gateOpen` (the column is solid to your feet) and
  lifts them clear above `CFG.PH` headroom the instant it is passable;
  `gateDrawOpen(open) === open >= CFG.gateOpen` — the drawn state *is* the
  collision state. popcheck pins geometry both ways (reverting the formula turns
  the gate clause red).
- **Attract banner that never covers the demo.** One message at a time on a
  slim band *under* the HUD, framed in gold; the autopilot plays in the clear
  below it. `AUTOPILOT DEMONSTRATION` moved up off the footer watermark.
- **A real art pass.** Cut-stone masonry with mortar coursing, per-brick tone
  jitter, mineral grain, lit/shadow bevels and hairline cracks; a palace of
  ashlar courses with gilding, fluted pillars and lit arched windows; the
  prince and guards pick up a facing rim-light, a shaded back, an eye and a soft
  ground contact shadow. Everything stays deterministic (`sin`-hash noise).
- **Guards escort you between rooms.** Leave a live ground guard behind and it
  takes up the chase through the doorway after you (`follow`), walking toward
  you on its own floor. It stops at a wall or the lip of a shaft (it never
  walks into the void), and re-homes to patrol if it loses the trail. The
  champion autopilot still clears all twelve levels at zero deaths with the
  escorts running.

## Stage 6 of #316 — the second art pass: light, direction, colour (this merge)

Jon asked to keep iterating the graphics until he says stop. This pass turns the
flat, evenly-lit dungeon into one that is *lit* — by named sources, from one
direction, in colour rather than just brightness.

- **A real light model (`art.js`, pure & exported so `popcheck` can pin it).**
  `lightAt(x, y, torchPx)` returns the brightness at any pixel as a cool
  `LIGHT_AMBIENT` floor plus the sum of every torch's `torchGlow(dist)` — a
  smoothstep that is 1 at the flame and 0 at `TORCH_RADIUS`. `darkAlpha` is its
  inverse (the veil laid over the scene). Nothing about the room is one flat
  value: light **pools** around sconces and sinks into shadow at the edges and
  corners. Two torches read brighter between them than either alone.
- **Per-torch pools, not a room-wide wash.** The old flat
  `rgba(0,0,8,0.32)` fill over torchless rooms is gone. Darkness is now a
  centre-weighted radial vignette (deeper for a torchless room), and the warm
  light comes from `lightPool` blooming additively (`globalCompositeOperation =
  'lighter'`) under each sconce — a hot core plus a wide halo that breathes with
  the flame. `popcheck` asserts the flat literal is absent and that the pools are
  radial + additive.
- **One directional key.** `LIGHT_DIR` (upper-left) and `facet(nx, ny)` = dot
  of a surface's normal with the key. Every brick face now carries a lit/dark
  gradient toward that direction; the palace wall gets a matching key wash; pillar
  bodies are shaded as cylinders (gold-lit on the key side, cool in the far
  shade). The whole scene — dungeon and palace alike — agrees where light comes
  from.
- **Deeper colour.** An equal-luminance `tone()` nudge was replaced with a
  per-channel `mix()`: brick mortar moved to a cool violet-blue and each face
  tints warm on its lit corner / cool in its shadow, with a lit top course on the
  masonry. The palette now has hue, not just value.
- **Figures take the light.** Each prince/guard/princess asks `atLight(x, y)` for
  the room light at its feet and gets a `warm` amount plus a `litSide`: the rim
  light runs down whichever side the nearest torch is on, warms near a sconce and
  cools in the dark, and a warm wash crosses the torso under strong flame.
- **Determinism holds** — all of it is `sin`-hash and pure arithmetic; no
  `Math.random`. Stage-6 added 15 `popcheck` clauses (falloff, the directional
  sign, per-torch combination, veil inverse, the wash-gone, chromatic mix,
  figure warm/litSide). Mutant proof at ship time: strip `torchGlow`'s smoothstep
  to a hard cut-off and three clauses go red.

## Stage 7 — the escort feel (door cues, bodies, the pincer)

- **The chase announces itself.** Leaving a room with a live ground guard behind
  emits an `escort` event (a leather-and-mail rustle), and as its feet cross the
  threshold into your room a `doorCross` event rumbles (stone-slide recipe). No
  silent arrivals — the S4 contract pins both voices.
- **The arch fills behind you.** `escortSilhouettes(g)` (pure, exported from
  `art.js`) reports any follower within `DOOR_ZONE = 3` columns of the boundary
  you came through; the scene paints it as a clipped dark figure in the
  door-frame — you see it coming a beat before it enters the room.
- **Bodies hold the corridor.** `bodyBlock` stops the prince at `CFG.bodyGap =
  40` px (blade distance) from a standing guard; a clean running leap still
  clears the head. The pin refuses to land on spikes, chomper cells, or walls —
  a guard can corner you, never shove you onto teeth or into stone.
- **The jaws take both sides.** A live guard standing on a chomper cell when the
  jaws close dies in them (`guardDown`), escort included — traps are the great
  equaliser, as in the original.
- **Duel etiquette.** One blade at a time: the closest engaged guard is the
  elected duelist and only it may wind up, and a second lunge never *starts*
  while another is in flight. Escorts stalk, wait, and cut the corridor — they
  don't spear you from two sides in the same breath.
- **The escort dashes.** Beyond duel range a follower closes at `min(run,
  speed + escortDash)` — it genuinely runs a shuffling prince down instead of
  strolling behind him.
- **Hardened pilot.** The autopilot now refuses to cross or duel-chase across
  jaws unless the jaws will stay up long enough to clear the cell (pixel math,
  skid-aware), and never commits at a short window. Stage-7 added 17
  `popcheck` clauses; the champion (autopilot, no deaths, all twelve levels +
  slack) re-proved with the sim touched. Mutant proof at ship time: relax the
  etiquette gate and two clauses go red.

## Stage 8 — the third art pass: colour temperature, floor bounce, phone light

Jon said keep pushing the graphics. This pass stays on the Stage-6 light spine and
takes it from *how bright* to *what colour the light is*, and fixes two things QA
flagged about small screens.

- **Colour temperature (`art.js`, pure & exported).** Stage 6 measured brightness;
  Stage 8 separates brightness from warmth. `torchSum(x,y,key)` is the flame's
  own contribution, and `tempAt(x,y,key,amb)` = its share of the light — 0 in a
  cold ambient corner, ~1 in a pool. A figure asks `atLight` for `temp` and paints
  its rim amber under a sconce and cool blue-violet where only ambient reaches, so
  warm-fire and cool-dark split by *hue*, not just value. Two distant sconces read
  cooler between them than standing in one flame.
- **Floor bounce (`bounceAt`).** A warm uplight on the flagstones under each torch,
  a 1-D pull on horizontal distance that ignores height — the flame grounds itself
  on the floor instead of floating above a flat dark band. Painted additively.
- **Phone readability (QA relay).** `ambientFor(lite)` lifts the ambient floor from
  `LIGHT_AMBIENT=0.18` to `LIGHT_AMBIENT_LITE=0.27` under `?lite=1` (the 640×426 CI
  / small-screen mode; `index.jsx` reads `?lite`). Torchless rooms stay readable on
  a dim phone, while desktop keeps the deep mood. A lifted ambient also cools the
  temperature (brighter-but-cooler), which is the honest tradeoff, pinned both ways.
- **Bloom vs HUD band (QA relay).** Light pools are now clipped to the playfield
  below `HUD_LINE=22`, and the HUD rides a gradient scrim instead of a flat slab —
  additive bloom no longer washes the clock/room text the demo plays under.
- **Determinism holds** — `tempAt`, `bounceAt`, `torchSum`, `poolVisibleAt` are all
  `sin`-hash-free pure arithmetic; popcheck re-asserts no `Math.random` in `art.js`.
  Stage-8 added 16 `popcheck` clauses (lite floor, ambient-aware `lightAt`, the
  temperature sign + monotonic cool-falloff + ambient dilution, `torchSum` additivity,
  bounce height-invariance + monotonic decay, pool clip + scrim, figures carry `temp`,
  the `?lite` route). Mutant proof at ship time: `ambientFor` forced to ignore lite
   turns the readability clause red; restored → green.

## Stage 9 — the fourth art pass: two light sources, moonlit palace (this merge)

Stage 8 split warm-fire from cool-dark by hue. Stage 9 makes the *source* of the
cool light explicit, so fire and moon become the level language (answers STATE
Q1/Q2: widen the split rather than dim the pool). `sim.js` untouched — the 1989
rules and the champion run are unchanged. All new helpers are pure + exported so
`popcheck` pins them.

- **Moonlight as a cool key (`coolGlow`, `coolAt`, `moonSources`).** Arched palace
  windows are cool light sources: they *brighten* a room (`lightAt`) without ever
  *heating* it (`tempAt` drops to 0 in pure moonlight). `lightAt`/`tempAt` gained an
  optional `moonPx` channel (default `[]`, so every S8 value is bit-identical).
  `moonSources(deco, base)` reads window columns out of a palace band; the scene
  builds cool keys **only** when `lvl.theme === 'palace'`, so the dungeon stays
  firelit. `coolPool` paints each window's cold bloom additively, clipped below the
  HUD by the same rule as the warm pools.
- **Floor bounce is a per-flagstone band (`bandAt`).** The single glow blob is gone:
  the warm uplight is quantised to the flagstone the point stands on, so the lit
  floor steps down tile by tile and reads as stone catching light.
- **Rim hue widened (`rimColor`).** Cool end pushed to violet (b>r>g at temp 0),
  warm end to amber-white (r>g>b at temp 1), monotonic in `temp`. Rim-only, so the
  prince's white tunic never muddies.
- **Props catch the light (`propShade`, `propLight`).** Flasks, the sword pickup and
  the mirror now take the room light (`atLight`) — a cool veil sinks an unlit prop,
  a warm rim grounds a lit one. Light is consistent across the scene, not just figures.

Stage-9 added 26 `popcheck` clauses (279 total): moon reach/strength, `coolGlow`
monotonicity, `coolAt` additivity, `moonSources` window extraction + empty-guard +
room offset, moon-lights-without-heating, cool-dilutes-warmth, the default moon
channel leaves S8 unchanged, `rimColor` violet/amber/monotonic, `bandAt` quantise +
step + reach-death + height-invariance, `propShade` monotonic and bounded, plus the
drawScene wiring (palace-only keys, clipped cool pools, per-tile band, lit props,
`rimColor(temp)` rim, moon-fed `atLight`) and no `Math.random`. Mutant proof at ship
time: dropping `MOON_STRENGTH*coolAt` from the `tempAt` denominator turns the
cool-dilutes-warmth clause red (278/279); restored → 279/279. On-canvas the frame
carries warm fire *and* cool dark/moon pixels; `popplay` 17/17 through the palace
levels with zero page errors.

## Stage 10 — the fifth art pass: sources that interact (this merge)

Stage 9 lit the palace from two kinds of source. Stage 10 makes those sources
*interact* like real light (QA #341): a body no longer greys out between fire and
moon, the windows become a sky, the moon casts onto the floor, steps catch a lit
lip, and violet stops tinting bone. `sim.js` untouched — rules + champion run unchanged.
All new helpers are pure + exported.

- **Warm-dominant overlap (`MOON_DILUTE`).** Cool light still dilutes warmth (the
  S9 proof stands) but *softly* — `tempAt`'s cool term is scaled by `MOON_DILUTE=0.55`
  in the denominator, so a body deep in a torch pool beside a window stays amber on the
  flame side instead of pulling to neutral grey. Default-empty moon keeps every S8/S9
  value identical; the drop at a flame-and-window overlap is <0.2 world-temp.
- **A per-window sky (`moonTint`, seeded).** `moonSources` now carries a third
  channel: a deterministic seed from the window's absolute column (`hash`). `coolPool`
  paints each window with its own cool hue + intensity from `moonTint(seed)` — indigo→
  pale-blue, intensity 0.78–1.0, always blue-dominant (never warm). A row of windows
  reads as a sky, not a stencil. Fully deterministic: same seed → same tint, no `Math.random`.
- **The moon casts (`coolBandAt`).** Under each window the shaft lays a faint cool
  vertical gradient down to the floor and a cool floor band quantised to the flagstone
  (mirroring the warm `bandAt`), so the shaft reads as light *cast* from the pane.
- **Stepped stone (lit front-lip).** Each lit flagstone now gets a brighter 2px top
  lip (warm and cool) so the band reads as a stepped step, not a flat glow.
- **Bone stays bone (`rimAlpha`).** The figure rim alpha is damped to 32% on pale
  palettes (`opts.bone` skeleton + `opts.pale` prince tunic) so the temp-0 violet rim
  never purples bone or the white tunic. Non-pale is byte-for-byte the Stage 8 value.

Stage-10 added 23 `popcheck` clauses (302 total): `MOON_DILUTE` bounds + warm-dominance
(delta<0.2, temp>0.62 at flame+window) + never-reversed + default-moon-unchanged;
`moonTint` determinism/wrap, cool-dominance, hue+intensity span, soft-key bound;
seeded `moonSources` (pane geometry intact, two rooms seed differently); `coolBandAt`
quantise/step/reach-death/height-invariant/empty; `rimAlpha` pale-damp + non-pale parity
+ monotonicity; and the drawScene wiring (seeded `coolPool`, cast shaft + cool band, lit
lips, `pale` rim damp, palace-only) plus no `Math.random`. Mutant proof at ship time:
killing the pale damp in `rimAlpha` turns the "pale takes a damped rim" clause red
(301/302); restored → 302/302.

## Honest gaps (the deep pass continues — see #316)

- Touch: the pad has no Shift, so hang-grab on a phone leans on climbing
  with the d-pad; desktop-first, as the original was.
- Mirror veil (#341-6): `propLight` paints a rectangular veil over the arched
  mirror; the corners hang past the glass onto the frame. Needs an arch-aware clip.
- Chase-sound mix (#341-8): whether the `escort`/`doorCross` cues cut through the
  `pop` bed during a chase is unproven — a headless analyser duck test would settle it.
- Window key height (#341-2): `moonSources` keys every pane at pane-row y=60; this
  level set places all windows on that row. A level that raised/dropped a window would
  mis-key the light — the single-height assumption is baked in, not derived from deco.

