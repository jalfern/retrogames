# PINBALL — CABINET ONE (issue #3103 rung 1; #3169 rung 2: ramp · lock · multiball; #3199 rung 3: orbit · magnet · DMD; #3217 ball-ball physics)

The shared table engine plus the first cabinet of the ladder Jon asked for
("definitely pinball… start simple, work up"). Rung 2 added the right ramp,
firelane, lock tower and MULTIBALL. Rung 3 adds the wraparound orbit, the
magnet post and the dot-matrix insert. Deeper rungs are separate issues,
filed one per shipped rung.

## Design

- **Original referenced:** Williams *Black Knight* (1978) — early solid-state
  era — for the cabinet; Williams *Firepower* (1980) for rung 2's
  firelane/lock/multiball idiom; rung 3 references Williams *Black Knight
  2000* (1989) — wraparound loops and a dot-matrix display — with a magnet
  post in the idiom Stern made famous with *Metallica* (2013). Our own name,
  art and rules; nothing copied.
- **MODERN bar** (issue): a lit, reflective cabinet — midnight-indigo field,
  neon-roped rubbers, glowing 7-seg score, bloom/particles/shake juice.

## Engine layout

- `sim.js` — **pure** (zero DOM, zero `Math.random`): physics constants, the
  table as DATA (`TABLE`: walls, arc, bumpers, slings, targets, spinner,
  kicker, flippers, plunger, rules), the fixed-timestep step, state/hash.
  60 Hz shell ticks run `SUB=4` substeps (240 Hz) of circle-vs-segment /
  circle-vs-capsule / circle-vs-ball collision. Flippers are animated *inside*
  the substep loop
  (a 2700°/s sweep must never jump past the ball) and kick via ω×r surface
  velocity plus a lever-scaled impulse — flip TIMING decides aim.
- **Tables are data on that engine.** `stepGame` knows only element primitives;
  scoring goes through `table.rules`. A new cabinet must add data, never physics
  (the engine contract of #3103).
- **Ball-ball collision (#3217)** is the next generic engine primitive, in the
  rung-2/rung-3 tradition: `packCollide` resolves every puck pair once per
  substep — equal-mass impulse exchange along the contact normal (restitution
  `BALL_E = 0.8`: a clack keeps most of itself) plus positional separation.
  A magnet-pinned ball becomes a POST: the free ball bounces off it, the pin
  never moves (the #3199 hold clause stays intact). Physics + feel only — no
  scoring rule lives here; the `ballhit` event carries the impact speed so the
  shell can voice/particle it, silent below a soft tap. Max closing speed
  1600 px/s = 6.7 px/substep against an 18 px contact distance: no
  tunnelling, no wall push-through at these energies.
- `art.js` — palette, seven-segment glyphs, deterministic playfield texture
  (seeded LCG sparkle + chevrons), attract copy.
- `index.jsx` — shell only: loop, scaling, attract, pause, pad, contract hooks.

## Rules (CABINET ONE)

Pop bumper 100 · slingshot 25 · drop target 50 · bank clear +250 and MULT
x2…x5 · spinner 10/turn · outlane kicker 100 · drain pays
BONUS = targets-hit-this-ball × 50 × MULT, then the bank relights.
Three nudges inside ~0.9 s = TILT (flippers dead till the drain).
3 balls. Plunger: hold (Space/↓/A) and release; power sets arrival speed —
any committed release clears the lane (a real spring plunger feeds the ball);
idle lane auto-plunges after 4 s. A launched ball crossing the lane mouth gets
a guide curl left toward the arc apex (lane-rain loop guard).

Rung 2 (#3169), the Firepower idiom:

- **RIGHT RAMP** — the launch lane carries two RAMP rollovers, scored on
  UPWARD crossings only: 25 × MULT each, three hits = +500 × MULT and the
  tower lamp set lights.
- **FIRELANE** — a descending lane down the dome's right flank (x 298..322).
  Enter only from the top: a one-way gate at y=190 bounces rising balls back
  down the lane; the inner guide (x=298) is solid from the playfield, so the
  lane is reached only by rounding the dome (the plunger's medium-power sweet
  spot feeds it — an aim skill, pinned by the scripted human-line check).
  Three LANE rollovers going down score 25 × MULT each; the full sweep pays
  +100 × MULT.
- **LOCK TOWER** — the lane mouth captures the ball (500 × MULT; the ball is
  NOT lost: the lane feeds a fresh ball). Lock 3 → MULTIBALL (+1000).
- **MULTIBALL** — the tower kicks three balls onto the open playfield (never
  back into the firelane). All playfield scoring DOUBLES while the pack is
  down; the first drain inside 5 s auto-RELUAUNCHES (ball save, once); a lock
  during the pack banks an EXTRA BALL (paid when the pack returns to one
  ball); pack drains cost balls-on-playfield only — the last ball home is the
  only one that costs a game ball. Locks reset when the pack ends.
- **MULTIBALL lands (feel, #3178)** — the pack-off fires a white-out blink,
  a hard shake and a ring + spark shower from every kick port (the moment
  reads at phone width), and a sustained A-minor tension bed (MUSIC
  `pinballMb`) runs while the pack is down — keyed off SIM state
  (`gs.multiball`), so its start/stop seam is deterministic (pinned).
  LANE rollovers voice an ascending pitch ladder by rollover index
  (1240 → 1480 → 1720 Hz): the firelane descent teaches its own progress
  by ear.
- Engine note: gate/rollover/capture/multi-ball are generic engine PRIMITIVES;
  CABINET ONE only instantiates them from `TABLE` data (`oneWay` walls,
  `rampRollovers`, `laneRollovers`, `lock`, `mbKick`, `saveTicks`).

Rung 3 (#3199), the *Black Knight 2000* idiom (loops + DMD; magnet in the
*Metallica* sense) — three new generic primitives, instantiated from data:

- **ORBIT** (`TABLE.orbit`) — a directional pad pair + flank curl. The new
  rail wall (x=40, y 320..415) makes the lower-left outlane one lane with two
  directions: downward spinner/kicker as before, upward a climbing channel.
  Crossing the arm pad (40,120) UP arms the ball; the curl (+280 vx while
  x<110 crossing y=160 upward — mirrors the launch-lane guide-curl law)
  sails it over the apex (clears the bumper cluster by ≥30 px); crossing the
  done pad (290,120) DOWN = ORBIT +100 x MULT. The descent lands on the
  firelane top gate, so a wrap chains into the lane sweep and a lock —
  the orbit is CABINET ONE's second lock route. A short wrap falls back down
  the channel into the spinner/kicker: retry, not punishment.
  3 wraps bank ORBIT SET +500 and light the set; while lit, the next wrap
  banks a LOCK outright (extra ball if the pack is already down).
- **MAGNET** (`TABLE.magnet`) — a charged post at (240,350): while charged, a
  ball inside the 24 px field is pulled at 1500 px/s², clamped at the post
  face (0.01 px pin) and held 72 world ticks — the world clock keeps running
  (a hold is not a pause). Release pays 50 x MULT. The charge dies with the
  hold; it re-arms when a ball that touched the field drains (pack drains emit
  `magready` mid-pack; single-ball drains re-arm fresh with the new ball).
  Position clear of every rung-1/2 probe lane and the orbit rail (pinned).
- **DMD** — a 64x8 virtual dot matrix (2 px dots, own 5x7 font, per-dot
  bloom) mounted flush at (116,250) between the bumper cluster and the bank —
  the classic insert position; balls roll over it like glass over LEDs. Event
  text scrolls in/holds/scrolls out; idle crawls live status (score, MULT,
  lock & orbit banks, magnet charge). The TEXT IS SIM STATE (`gs.msg`,
  tick-decayed, reported by `stateOf().dmd`) so Node pins what the display
  says — the shell owns only pixels. The old y=388 plain-text banner retired.

Ball-ball (#3217): steel refuses steel. Balls deflect each other (and a
magnet-pinned ball becomes a post to bounce off), which makes pack play real
— pass one ball into another and the far one flies off. No points ride on it;
this is the physics a table always had.

## Verify

```bash
npm run pinballcheck          # 112 literal physics/rules/determinism checks, plain Node
npm run pinballplay           # headless-Chrome drive (start, plunger, wrap, magnet, DMD pixels)
CONTRACT_ONLY=pinball npm run contractcheck   # game-contract driving
npm run dev -- --port 5176 --strictPort      # then /retrogames/pinball
```

## Honest gaps

- **CLOSED by #3217:** no ball-ball collision. The pack now resolves pairwise
  every substep (`packCollide`, `BALL_E = 0.8`); a magnet-pinned ball is a
  post. Steel-clack sound + chrome sparks, no scoring — the lamp-set pack
  read stays too (multiball machines never needed it to *read* the pack, only
  to *feel* it).
- Table-select screen ("row of cabinets") waits for a second cabinet.
- No table editor (#3103: not yet). No in-lane kick on the right side.
- Single table means the `?style` / skin machinery is unused here.
- The attract demo is a title card with a rolling ball, not a driven run.
- The music bed covers MULTIBALL only (#3178); single-ball play stays dry.
- The magnet holds one ball and the orbit one loop at a time (real tables run
  both per-ball); the wrap's curl assist is a fixed push, not a shaped rail.
- No left ramp / kickback, and the spinner is still outlane-only.
