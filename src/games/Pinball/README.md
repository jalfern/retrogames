# PINBALL — two cabinets on one engine (issue #3103 rung 1; #3169 rung 2: ramp · lock · multiball; #3199 rung 3: orbit · magnet · DMD; #3217 ball-ball physics; #3232 CABINET TWO + row-of-cabinets select; #3250 KICKBACK ball-save)

The shared table engine plus CABINET ONE and CABINET TWO of the ladder Jon
asked for ("definitely pinball… start simple, work up"). Rung 2 added the
right ramp, firelane, lock tower and MULTIBALL. Rung 3 adds the wraparound
orbit, the magnet post and the dot-matrix insert. #3232 adds a second cabinet
and the row-of-cabinets attract. Deeper rungs are separate issues, filed one
per shipped rung.

## Design

- **Original referenced:** Williams *Black Knight* (1978) — early solid-state
  era — for the cabinet; Williams *Firepower* (1980) for rung 2's
  firelane/lock/multiball idiom; rung 3 references Williams *Black Knight
  2000* (1989) — wraparound loops and a dot-matrix display — with a magnet
  post in the idiom Stern made famous with *Metallica* (2013). Our own name,
  art and rules; nothing copied.
- **MODERN bar** (issue): a lit, reflective cabinet — midnight-indigo field,
  neon-roped rubbers, glowing 7-seg score, bloom/particles/shake juice.
- **CABINET TWO (#3232):** left-hand launch lanes are a real production idiom
  across manufacturers; our second cabinet mirrors OUR field rather than
  referencing a new machine — its identity is the flipped launch, hotter
  economy and ember/gold skin, and its fidelity is pinned as the exact
  x-mirror (see Verify).

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
- **Directions are data too (#3232).** The lane-side literals the engine used
  to carry (in-lane test, guide-curl, RAMP zone, spinner/kicker/curl sides)
  live on the table (`TABLE.lane`, `side` fields: +1 classic right-lane,
  -1 mirrored) plus a derived `tb.view` geometry object (lane/tower/rail
  centres) that the shell and art layer draw from — one renderer, both
  cabinets, cabinet-one pixel-identical.
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
- **KICKBACK** (`TABLE.kb`, #3250) — the free ball-save at the right drain-mouth
  column (x 190..205 on CABINET ONE; EMBER RIDER mirrors it as x 155..170).
  One save per ball: a ball descending faster than `minVy` (150) through the
  zone is fired back up the field (`vx ±40, vy -900`) instead of draining and
  pays 100 (ember 75); the device stays spent until the next ball (re-armed by
  `resetBall`). The `minVy` gate keeps resting balls untouched, so the BALL
  SEARCH law and the stall pins are unaffected, and straight-centre deaths
  (x≈184) stay deaths — the device guards only its own column. Fires, price,
  re-arm, centring and the ember mirror are all pinned (pinballcheck §8), and
  the plunger art + `KICKBACK! +N` DMD announce read sim state.
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

CABINET TWO — "EMBER RIDER" (#3232), the row of cabinets:

- The attract screen is a ROW OF CABINETS: two lit mini-cabinets drawn from
  the painted playfields. ←/→ switch the pick; SPACE starts the selected one;
  tapping a card picks AND starts it in one input (phone path). The pick
  persists across games; GAME OVER + SPACE quick-retries the same cabinet,
  GAME OVER + arrow steps back to the row.
- EMBER RIDER is CABINET ONE's exact x-mirror — same primitives, left launch
  lane — with its OWN economy and skin, not a reskin-only clone:
  bumper 75 · sling 30 · bank clear 300 · MULT x2…x4 · spinner 15 · kicker 75
  · ramp 30 / set 600 · lane 30 / sweep 150 · lock 400 · MULTIBALL 1200
  · orbit 150 / set 600 · magnet 75 · ball save 4 s · TILT decays in 0.7 s.
  Oxblood field, gold lanes, ember-red alerts, teal magnet.
- Proof strategy (why no re-tuning was needed): pinballcheck pins that EVERY
  coordinate of TABLE_TWO is W-x of TABLE (endpoints swapped where the
  one-way face or index mapping matters), that the engine is x-mirror
  equivariant (same seed ⇒ mirrored puck states to ~1e-9 px, identical event
  inventories), and that the ember human line — three medium LEFT-lane
  plunges — still ignites MULTIBALL, while the magnet and a right-rail wrap
  pay literal ember prices (75, 790 chained). Pinball is chaotic: ulp-level
  mirror deviation forks long runs, so the equivariance assertion is scoped
  to the fork-free window and the fork point is printed, not hidden.

## Art kits (#3259)

Real arcades sold **art kits** — the same machine in a new dress. Same here:
a kit is **palette only** (`SKINS` in `art.js`, keyed by table id, index 0 =
house dress). The `#3103` contract holds: a kit never touches table data or
physics — pinballcheck pins the registry shape, full palette key-parity (a
missing key would silently paint `undefined`), real visual difference, the
cycle-wrap law, the `?style` parse, and a bit-identical replay.

- CABINET ONE: **MIDNIGHT** (house) · **TIDAL RUN** (teal field, coral lanes, mint neon) · **NOIR** (#3237: black glass, magenta lanes, violet neon)
- EMBER RIDER: **EMBER** (house) · **TOXIC** (moss field, lime lanes, magenta neon) · **GLACIER** (#3237: ice field, silver lanes, cyan neon)
- Attract row: **B / Shift / ▲▼** cycles the selected cabinet's kit live; the
  marquee shows `TAG · KIT` and a `◆ KIT:` badge sits under the selected card.
- `?style=<id|label>` preselects the kit on every cabinet that ships it
  (unknown name = house dress; per-cabinet, start-pick not lock) — the old
  TidyBot/QBert URL convention, finally honored here.
- The kit lives in the shell (`skinRef`, per cabinet), persists across
  quick-retry, and announces `KIT <NAME>` on the DMD as the ball loads.
  `__pinballTest.setSkin(i)` drives it without keys.

## Attract show-off (#3237 tail)

A row of arcades earns its quarters in attract mode: the machines play
themselves. The row's background and the **selected** mini-card are now a
LIVE demo — a real `makeGame` sim run through `demoPad` (sim.js), the same
4-tick medium-plunge protocol `pinballcheck` proves human-winnable, driven
through the game's own `drawTable`. `drawTable(gs, L)` takes a live-renderer
bundle (`ctx`/flash/trail/particles/rings/shake) — `MAIN` wraps the game refs
through getters so the play path keeps identical pixels; the demo paints into
an offscreen canvas once per frame.

- **Lamp chase at re-deal** (`stepDemo`, ticks 0..84): bumper 3-2-1 chase,
  lane rollover ripple, ramp pad, orbit pad pair, lock-pair slam — the
  cabinet does its trick before the ball earns it. Presentation-only, driven
  by the demo clock.
- **Attract DMD** (`ATTRACT_DMD` in art.js): short crawl lines (kept off the
  shout-word list so they crawl fully), rotated one per demo run; a
  `?style` naming a kit the picked cabinet doesn't ship answers
  `NO SUCH KIT` instead of silence (badge on the card says it too).
- **Restart law** (`demoOver`): the run re-deals when its game ends, or a
  beat after MULTIBALL lands — the money shot, then fresh. Seeds cycle
  deterministically per run (`0xa11ce + runs*7919`).
- Demo is silent (no `sfxFor` in `reactDemo`) and deterministic: `demoPad`
  and `demoOver` are pure sim exports, Node-pinned to MULTIBALL on both
  cabinets (check §#3237), and `__pinballTest.demoState()` exposes sim
  state + lamp flashes to the browser rig.

`#3259 owed, paid`: kit picks persist across reload (`KIT_STORE`,
`kitIndex` — stale ids fall back to house dress; `?style` outranks
memory), the kit cycle has its own `dressflip` sound, the results screen
wears a `◆ KIT <LABEL>` line, and each cabinet ships a third dress —
**NOIR** (CABINET ONE) and **GLACIER** (EMBER RIDER), palette-only.

## TABLE SMITH — the table editor (#3284)

Pinball Construction Set (Evolution Systems, 1983) idiom: build your own
cabinet, playtest it instantly, put your name on the marquee. The third
attract card is the bench — unsaved it is a dashed blueprint (`START OPENS
THE SMITH`), saved it is your machine riding the row, playing itself in the
demo like a stock cabinet (`B = REDESIGN`).

- **Zero new physics — the #3103 contract, playable.** `compileTable(def)`
  (sim.js) turns a layout into a full table object built ONLY from the
  primitives the engine already knows (bumpers, slings, drop bank, magnet on
  the shared chassis: shell/arc/lane/firelane/tower/orbit/outlane/flippers/
  plunger/drain). `makeGame(seed, tb)` accepts the compiled table directly.
  Engine data tolerance grew with it: magnet `null` and an empty bank are now
  legal table data (guards in sim/art/shell), never new physics.
- **Legality is zones, not vibes.** `SMITH_LIMITS` + `bumperZoneOk` keep
  bumpers in the dome (arc's ellipse shrunk by post+ball+2), slings inside
  anchors whose tips hold a 60 px flipper corridor and clear the firelane,
  the bank between dome and slings, the magnet clear of lane/tower/guides and
  neighbours. `sanitizeDef` hardens the localStorage blob. Every refusal is a
  short all-caps line the bench shows; the cursor's ghost uses the SAME law
  (`toolCandidate`), so green commits and red refuses.
- **No-wedge guarantee:** BALL SEARCH is engine law, so no player layout can
  hold a game open — a motionless ball ends the ball at 20 world-seconds.
  `SMITH_REFS` (nova/lone/wild) drive live through the sim in the check:
  launch, score, resolve.
- **Bench UX (pad-first):** arrows walk a 2 px-snapped cursor, `A` places /
  wipes / acts, `B` cycles the 8-slot palette BUMPER · SLING · BANK · MAGNET
  · WIPE · NAME · TEST · SAVE. NAME cycles two word-lists (no keyboard on a
  phone). TEST drops ONE ball and comes home to the bench at game over; SAVE
  writes `{name, def}` to `retrogames.pinball.mytable.v1` (private-mode
  silent), names the card, and re-deals the attract demo onto your table.
  `openEditor` starts from a legal default (`SMITH_REFS.nova`), so the bench
  is never empty-handed. Placements validate the WHOLE candidate — the draft
  on the bench stays globally legal by invariant.

## Verify

```bash
npm run pinballcheck          # 206 literal physics/rules/determinism/mirror/skins/demo/smith pins, plain Node (+9 mutants: seed/economy/mirror/search/kickback/skin/demo/smithzone/smithload)
npm run pinballplay           # headless-Chrome drive (both cabinets: select, plunger, wrap, magnet, kickback, DMD, pixels, kits incl. driven-demo/chase/announce/memory/NO-SUCH-KIT legs)
npm run pinballsmith          # headless-Chrome TABLE SMITH drive (#3284): ghost→bench, refusals, wipe/name/save, saved cabinet plays the row, TEST homes, reload persistence
CONTRACT_ONLY=pinball npm run contractcheck   # game-contract driving
npm run dev -- --port 5173 --strictPort      # then /retrogames/pinball
```

## Honest gaps

- **CLOSED by #3217:** no ball-ball collision. The pack now resolves pairwise
  every substep (`packCollide`, `BALL_E = 0.8`); a magnet-pinned ball is a
  post. Steel-clack sound + chrome sparks, no scoring — the lamp-set pack
  read stays too (multiball machines never needed it to *read* the pack, only
  to *feel* it).
- **CLOSED by #3232:** table-select. The attract screen is a row of cabinets —
  CABINET ONE and the mirrored, hotter EMBER RIDER. Both cabinets are the same
  three-rung field (one plain, one mirrored), so a third cabinet with an
  original layout is still open — that wants the editor rung (#3103).
- **CLOSED by #3250:** no in-lane kick on the right side — CABINET ONE now has a
  KICKBACK, a free save per ball at the right drain-mouth column (x 190..205,
  fires only on a fast descent `vy > minVy`, pays 100; EMBER RIDER mirrors it as
  x 155..170, pays 75). The device is pure TABLE data (`kb`), the plunger art
  reads sim state (`kbUsed`, `kbFlash`), and the DMD announces `KICKBACK! +N`
  deterministically. Straight-centre deaths and resting balls are untouched.
- **CLOSED by #3284:** no table editor — TABLE SMITH is live (see "TABLE
  Smith" above): a pad-first bench compiling onto the primitive shelf, a
  playtest drop, a named cabinet saved per browser riding the attract row.
  The shelf's honest edge moved, it did not vanish: the smith places the
  rung-1 feature set (bumpers/slings/bank/magnet) on a FIXED chassis — ramps,
  spinner/kicker side, tower and orbit placement are still chassis data, not
  player parts — and one cabinet saves per browser (a garage of layouts is
  still owed).
- **CLOSED by #3259:** the `?style` skin override. Each cabinet now ships art
  kits (dress-only palettes, parity-pinned), the attract row cycles them with
  B/▲▼, and `?style=<id|label>` preselects one. See "Art kits" above.
- **CLOSED by #3237:** kit memory (`KIT_STORE`/localStorage per cabinet,
  `?style` outranks it, stale ids fall back), the dedicated `dressflip`
  sound, the results-screen `◆ KIT` line, `NO SUCH KIT` DMD/badge hints for
  a style the picked cabinet doesn't ship, and a third dress per cabinet
  (NOIR, GLACIER).
- **CLOSED by #3237:** the attract demo was a title card with a rolling
  ball; it is now a driven run — the selected machine plays itself
  (`demoPad`, the pinned human line) with a lamp chase, rotate-through
  attract ad lines, and a `demoOver` re-deal. See "Attract show-off".
- Phone-width HUD density and ball-vs-amber-lane-bed contrast have not been
  audited at 375pt/#?lite=1 (the #3237 tail's audit items — pixel thresholds
  need a calibration pass, not a code guess).
- Tilt-to-nudge SHIPPED (#3237): a lean-and-return pays one nudge via a
  tap-granted deviceorientation channel (law pinned in sim.js `tiltImpulse`).
  Extras still owed: a lock-gate slam animation, plunger 3-step power ticks,
  tilt-warning cabinet wobble.
- The music bed covers MULTIBALL only (#3178); single-ball play stays dry.
- The magnet holds one ball and the orbit one loop at a time (real tables run
  both per-ball); the wrap's curl assist is a fixed push, not a shaped rail.
- No left ramp / kickback, and the spinner is still outlane-only.
