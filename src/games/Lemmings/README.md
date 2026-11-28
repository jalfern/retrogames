# LEMMINGS-LITE — engine notes

Lemmings (DMA Design, Amiga, 1991), cut to its load-bearing parts: a stream of
mindless walkers, one-click skill assignment, fatal falls and drowning ponds,
and a solver that proves every ledge is actually crossable. The -LITE is by
design (issue #65 asked for a cut-down build). Bar: **RETRO** (docs/ART.md) —
Amiga palette and proportions, 48×27 logical tiles, `imageSmoothingEnabled =
false`. The gate is a Node solver that may only speak like a player
(`{tick,id,skill}` commands, no peeks), so a level it cannot clear with its own
supplies fails the build.

## Engine

- `sim.js` — the whole game as a pure forward model: no DOM, no React, no
  canvas. Plain Node imports it, and that is the gate: every level proof and
  the attract replay run on exactly the code the browser runs.
  - Geometry: a lemming's feet sit on a row boundary (`y = k` ⇒ row `k` is the
    ground under it, body = row `k−1`). The three cells ahead — foot, chest,
    next floor — decide step / wall / fall. Matter: AIR/DIRT/STEEL/WATER/PLANK.
  - Agent-per-entity: each lemming is a small state machine (walk/fall/climb/
    dig/block/bomb/corpse) stepped in id order ⇒ the game is a deterministic
    function of (level, grid, command list). `stateHash` pins that; the attract
    demo IS the solver's recorded script, replayed, hash-checked.
    **Determinism is the contract**: anything the solver can see, the player
    can reproduce.
  - Rules that carry the game: climbers need DIRT handholds (steel refuses,
    overhangs refuse); the digger TUNNELS one tile at a time so the swarm
    follows single file; bombs clear dirt (and splinter planks) only, chain
    other bombers, and corpses block walkers; a fatal fall is > `CFG.maxFall`;
    **water drowns** (#3828) — chest or feet in a WATER cell kills from any
    height, water is not ground, and neither dig nor blast yields it. Planks
    (#3863) are ground but NOT dirt: they support walkers, landings and the
    whole plank-road, climbers refuse their face (no dirt handhold), blasts
    clear them; the digger never chews wood because the mount/turn checks read
    the same row the chest would — wood faces arrive as walls first.
    **Step-down** (#3908): a floor-end with a shelf exactly one row below is
    *walked*, not fallen — the mirror of the one-tile mount. Feet land on the
    shelf at walking pace and no fallDist accumulates; falls begin where the
    shelves run out, and > `CFG.maxFall` still kills.
    **Wind vents** (#3879, terrain-variety family item 1): levels declare
    `vents: [{x, y, dir, reach}]` — a mouth cell blowing a two-row airstream
    downwind. Wind moves CANOPIES ONLY: a FLOATER falling through a stream is
    pushed at `CFG.windSp` (3.4 c/s, faster than a walk), clamped at walls
    (never squeezed through). Walkers, diggers, climbers, blockers and bombers
    hold their line, and `candidates()` never offers FLOATER (#3827 law) — so
    every solve, replay, hash pin and proof rides vents byte-identical. THE
    SPIRE's grate tails floaters onto the exit plinth (overshoot feeds the
    bay); THE MASSIF's shoves them off the plinth doorstep back toward the
    trench. The drift lands on the pre-landing test, so wind decides WHERE a
    canopy lands, not just where it wobbles.
    **Trampolines** (#3879, terrain-variety family item 2): levels declare
    `trampolines: [{x, y}]` — a sprung mat on the face of a cell. ANY body
    arriving on a mat (a faller's landing or a walker's footstep) is launched
    at the FIXED `CFG.padJump` (apex 2.5 cells, fast or slow arrival alike)
    with its fallDist wiped — the mat absorbs the drop, so even a lethal
    landing survives. A body may not re-bounce within `CFG.padHold` ticks
    (flight + crossing a two-cell mat + margin): mats ping once per arrival,
    never ping-pong. A mat whose two rows of sky are not clear is dead steel.
    THE MASSIF lays two mats on its trench floor: what falls in still cannot
    get out (the apex cannot reach the plinth top), so `proves: build` and
    the plank road ride byte-identical — lemcheck pins that the proven script
    never touches a mat — but the trap gains a spring, and vent-shoveled
    canopies land on cloth instead of steel.
  - Skills: BLOCKER, BOMBER, CLIMBER, DIGGER, **FLOATER** (#3827),
    **BUILDER** (#3863). Climber, digger and floater are flags for life —
    re-granting any of them refuses rather than burning supply (#422). The
    floater's parachute caps descent at `CFG.floatSp` and makes no landing
    height fatal. The solver's `candidates()` never offers FLOATER, so every
    level's proven solution, load-bearing proofs and slack margin ride the
    four original mechanics; the two floaters per level are pure player-side
    slack. BUILDER joined the search space in stage 2 (#3866): `candidates()`
    offers it at exactly the cells walker() lays wood (one-tile descent + solid
    shelf, plus #3908's span: a two-row drop whose LOWER row is solid — so the
    solver can never ask for a plank the world would refuse),
    `scoreState` counts standing planks as progress, and THE MASSIF's trench
    makes wood load-bearing there (see Builder below).
- `levels.js` — levels CARVED from solid rock in code (IronKeep lesson), each
  with a `proves:` list lemcheck re-solves at zero supply (a skill you can take
  away is decoration) and a slack pass (one fewer of every supply the winning
  script consumes must still win — lemcheck's slack loop is the reference
  implementation AGENTS.md points at).
- `index.jsx` — canvas painter + shell. Original look: sky gradient, parallax
  ridges, clouds; the floater rides a striped canopy even while walking, as in
  the original (#3827); the skill panel docks at the top edge (`layout.js`,
  clear of the pad zone); attract replays the solver script with a cursor
  ghost; SPACE/tap assigns. All audio synthesized at runtime via
  `audioController` (deploy is a swoosh, the drown a soft splash + descending
  "oooh", never a harsh splat; drowned lemmings sink — no corpse floating).
  #3879 SOUND: the game rides the original's dark-baroque mood — an ORIGINAL
  homage loop (`MUSIC.lemmings`, A-minor lament bass under a chromatic-
  descent lead) that plays low through attract, full in play, and stops on
  pause/over; `M` or the SOUND row on the pause screen mutes the whole title
  (persisted in `lemmings.muted`, restored unmuted on exit so the choice
  never leaks onto another game). Every skill's grant has its own voice —
  thunk, hiss, grunt, rumble, swoosh, knock.
  #3879 LOOK: the painter leans boards into descents — a plank keeps a flat
  tread (feet land on whole cells; the grid never moves) and drops a nose
  toward its nearest downhill neighbour, overhanging columns tucked under
  whatever the row-first scan paints there next. Sprites are the original's
  little brown figures: hair cap with a flick that flutters mid-stride, a
  4-frame walk (stride reaches a column past the body, recovery pulls in,
  body bobs), per-skill poses (digger crouches with a pumping shovel,
  bomber a fuse spark, faller dangled legs, climber alternating arms), and
  landings squash for a beat (`squash`, keyed by id, decayed on the WORLD
  clock like splashes). Wood breaks loudly: a blast that clears PLANK cells
  throws two-tone chips (mask-before-step compare, gravity, fade) and every
  laying shakes loose nail-dust.
- VirtualControls dispatches Arrows/Space; the pad's "A" assigns the selected
  skill; skill buttons ride Digit1–5 / pad slots. DEV hooks:
  `window.__lemTest` (probe/hint/give/teleport/kill) and `exposeGame` per
  docs/GAME-SHELL.md.

## Verify

```bash
npm run lemcheck            # ~2 s, no browser: solve all levels, rule pins
                           # (water rules, float immunity / slow descent /
                           # supply discipline, #3853 attract parachute,
                           # #3863 BUILDER placement/cargo/wood-rules,
                           # #3866 solver-side wood: MASSIF trench road replay,
                           # offer-level pond/deep-hole refusal, block-tamper
                           # determinism), slack, determinism, readability, #470
npm run lemcheck -- --mutate  # planted load-bearing CFG bugs, each must go red
npm run lemcheck -- --map 2 # ASCII view of a level
npm run dev -- --port 5178 --strictPort   # then:
npm run lemplay            # real Chrome: keys/taps only, start→play→die→
                          # restart, pond pixels + live drown, Digit5 → FLOATER,
                          # #3863: Digit6 → BUILDER, plank pixel, panel tap,
                          # #3866: solver's BUILDER rides the aim-bot through
                          # real keys + tan road pixels sampled mid-lay
```

The `--mutate` suite mutates CFG values only; the drown guard and the float
immunity clause were each additionally proved breakable by hand (comment the
guard out → the matching pins go red, restore → green). Keep sim rules
breakable — every pin here has survived a manual mutation.

## Honest gaps

- Float-while-digging (the original's floating lemming chews straight down
  through dirt while descending) does not port to the horizontal-tunnel digger;
  it needs either a second dig mode or a rethink of the dig model.
- Vent wind moves parachutes only (#3879): ground-bound walkers ignore the
  stream, and vents blow forever (no on/off puzzle state). Ground-level drag
  and switched gusts are Lemmings 2 territory and unowned until the family's
  next PR; the wind you can feel today is the canopy's.
- **DISCLAIMER** (#3859): water NEVER flows and never will — the 1991
  original's water is static; draining ponds are a Lemmings 2 mechanic.
  What the original DID have, ponds everywhere, shipped in #3859; flowing
  water is out of scope by fidelity, not an open gap.

## Closed

- #3908 (the sim walks the stair) — descents are now the original's, at both
  ends of the plank: **step-down** mirrors the one-tile mount in `walker()`
  (floor ends, shelf one row below → feet land, walk continues, no `fall`,
  no fallDist — a staircase can be paced forever; two rows with nothing to
  step onto still fall, and >3 still kills, #3849 rides untouched); **the span**
  reaches the lower shelf of a two-row drop, laying wood one row down — the
  board spans the stair at the angle the LOOK already draws, and the crowd
  steps onto it. Three rows stays out of reach; water is not ground at either
  reach. SPIRE got a two-row notch mid-stair (the all-stepped face had no air
  left once steps were free — the notch keeps a survivable fall in the game,
  and #3853's parachute has its stage again). Feel: the `stepdown` event
  plays a heel-plant under the mount chirp. `stateHash` format unchanged —
  no new state fields; solver scripts shift (descents are faster), every hash
  re-derives. Harness: lemcheck 333 → **338** — new SLOPE ROAD section
  (staircase walked: zero fall, zero fallDist, exact step count; leaned boards
  carry the crowd; two-row drop without wood still falls, four-row still kills;
  span refuses deep ponds; sloped road replays to one world and the audit can
  see it), B2 rewritten under this issue's warrant (the two-tile descent IS
  spanned now), and the deep-hole OFFER pin rewritten — wood is now a proposal
  at a two-row hole and still forbidden over a three-row void.
- #3879 (LOOK slice) — the game moves like the original now: boards LEAN into
  descents (render-only: flat tread where feet land, nose toward the nearest
  downhill board at reach 2, overhang tucked under the row-first scan — the
  grid and every hash ride untouched); sprites are little brown figures (hair
  cap with a stride-fluttering flick, 4-frame walk with body bob, per-skill
  poses — pumping digger shovel, fuse-spark bomber, dangled-leg faller,
  two-arm climber), landings squash on the WORLD clock, the canopy rocks on a
  three-step drift, and wood splinters: blasts that clear PLANK cells throw
  arcing two-tone chips (wood mask taken before the step, so dirt blasts stay
  clean), plank layings shake nail-dust. Honest scope: this engine's digger
  never chews wood (#3863 rule), so splintering rides the blast — the way
  wood breaks here; per-plank age would need sim state and is not faked.
  Harness: lemcheck 314 → **333** (LOOK source-audit: lean reads both
  directions at reach 2, nose profile, flat branch intact, sprite pose clocks,
  squash wired on both land events, splinter mask-compare, chips on the world
  clock), lemplay 66 → **71** (attract SPIRE nose-strip pixels — 32 tan px on
  the laid chain, deterministic where the replay guarantees the road; stride/
  recovery foot poses on isolated walkers; live chips and squash counters).
  Hand mutations: diagonal neighbours blind → audit pin AND attract pixel pin
  red (nose px=0), restored green; splinter call neutered → splinter pin red,
  restored green. `--mutate` 355/355.
- #3892 — the replay phase, honest at last: `replay()` fetched
  `byTick.get(g.tick + 1)`, so every scripted command fired **one tick before**
  the phase `solve()` had verified it in (stamp T applies between the steps;
  the step advancing to T+1 moves the body — the same phase a human keypress
  has). On THE DOOR the cascade drowned two walkers the oracle never claimed
  (6/1 solve, 6/3 replay); the attract and WATCH drivers in `index.jsx` and
  lemcheck's demo mirror carried the same `+1` on screen. All three now apply
  stamp T at `g.tick === T` — DOOR replays 6/1, identical to its proof;
  SPIRE 4/0, MASSIF 5/0, LEDGE 5/3 unchanged; replay-vs-replay stays
  bit-identical. BoulderDash/Sonar/ArenaArchery already fetched by the current
  tick; Lemmings was the shelf's only offender. Side effect worth its notice:
  the honest world holds its crowds, so the crowd-falls that #3853's picker
  relied on for its mid-air canopy vanished — the demo float is now
  CERTIFIED, not hoped: `attract.js certifyDemoFloat` scans the replay world
  for the picker's candidates and accepts a grant only when replaying it keeps
  win/exited/dead identical. Result on today's boards: SPIRE deploys TWO
  chutes mid-descent, DOOR catches the post-bomb drop mid-air (better than the
  desync-era demo ever showed), MASSIF and LEDGE grant proof-neutral walker
  stripes. Harness: lemcheck 282 → **314** — a REPLAY PHASE section (per-board
  replay-outcome-equals-solve pins, THE DOOR direct probe demanding every
  command silent at stamp T and live at T+1, shell-source audit of the attract
  and WATCH applies), the rewritten parachute drive (certified grants applied
  exactly as the shell applies them, demo outcome demanded equal to the
  certificate), and the #3876 plant-probe observation moved to plantT+1 — the
  early fetch's old visibility signature was itself the bug encoded in a pin.
  Hand mutation: restore `+ 1` in `replay()` → 5 pins red (phase probe, DOOR
  outcome, demo certificate), restore → green. New product law for this game:
  pins may now compare solve outcomes again — replay runs the oracle's world.
- #3879 (SOUND slice) — the game has a voice: an ORIGINAL Graveyard-era
  homage bed (`MUSIC.lemmings`, 64 steps × 0.16 s, square lead + triangle
  lament bass + two heartbeat kicks) with the bed following the game
  (attract 0.45 → play 1 → out on pause/over, transitions only), `M`/SOUND
  mute persisted per game and lifted on exit, and one grant voice per skill
  replacing the shared ladder blip. Shared plumbing note: `PauseOverlay` now
  takes an optional `mute={{on, toggle}}` prop — games that don't pass it
  render byte-identical help. Harness: lemcheck +23 (tune structure — lengths,
  register, finite notes, perc density — plus wiring pins; removing the tune or
  a skill branch goes red in seconds), lemplay +9 (bed low in attract, full in
  play, out on pause, back on resume, M mutes/unmutes, choice persists across
  visits, zero page errors through the lifecycle; hand mutation: disable the
  `syncMusic` driver → both bed pins red, restore → green).
  Look/animation, terrain variety and board count from #3879 stay open there.
  **CLOSED by PR (sound slice)**
- #3876 — phantom BUILDER hygiene: the autopilot never flashes a skill it
  never uses. `solve()` now certifies its own script against the replay world
  (`stripPhantomBuilds`): every recorded BUILDER commit must attribute to at
  least one `plank` event in replay, or it comes out — DOOR's t240/id2 and
  LEDGE's t1667/id6 are gone from the attract demos. Removal is demanded
  neutral, not assumed: the stripped script must still win with no extra
  deaths, else the full script stands (dead grants touch no grid, no supply
  and no body, so on today's boards the stripped replay is bit-identical —
  pinned). SPIRE's 12-plank road and MASSIF's 4-plank bridge pass through
  untouched; lemcheck plants a live phantom and watches the validator remove
  it, and disabling the validator reddens 3 pins.
- #3866 — stage 2: the solver learns BUILDER. `candidates()` now offers wood
  at exactly the cells walker() lays it (one-tile descent + solid shelf under
  the landing — pond rims and 2-tile holes can never even be proposed; the
  offer is pinned at proposal level, not just commit, because a commit-level
  pin went vacuously green while the offer was still stage-1 empty).
  `scoreState` counts standing planks (+2/wood, with the unspent-supply +25
  end-bonus still dominating — scenery burn loses the ledger). THE MASSIF was
  retrofitted into the proves board: a four-tile trench (row-23 gap over the
  steel floor) at cols 37–40 with a steel west lip, the exit plinth raised to
  (43,21), bomb supply 1→0 (a bomber could otherwise blast the plinth into a
  staircase and wood would be optional); its digger route still delivers and
  now a BUILDER road of 4 planks walks the crowd across — `proves: ['dig',
  'build']` with the build proof verified by taking the offer away (removing
  the build clause reddens the board, 9 pins, restored green). Re-solve of all
  four boards: SPIRE goes 4/3 → **4/0** — the autopilot climbs its tutorial
  climber onto the spire and lays the full 12-plank cargo down the east face,
  a road the whole crowd rides, retiring every death the board used to take
  while `proves: climb` and the one-shot block still hold; MASSIF 5/1 →
  **5/0**; DOOR and LEDGE win unchanged (6/1, 5/3) with optimistic build
  commits they never cash (see gaps). Slack (+1) green everywhere,
  determinism green with wood (two replays bit-identical; the tamper probe
  shifts a BLOCK, since a late BUILD self-corrects — laying is
  position-triggered, not time-triggered). lemcheck 232 → **249** (+17: trench
  road replay pins the four planks at their exact cells, offer-level pond /
  deep-hole refusals with positive controls, build-script determinism,
  solver-spends-cargo); lemplay 47 → **55** (+8: skills 6/12 on the panel,
  the solver's BUILDER command ridden through real keys by the aim-bot, cargo
  spent in the browser sim, tan road pixels sampled during the laying window
  matched to the wood palette — post-win captures race the attract restart and
  flaked until the sampling moved into the drive loop); `--mutate` 270/270;
  recmethods PASS 37 (pointer rec regenerated — SPIRE's script changed).
  **CLOSED by #3866**

- #3864 — blocker-wake: the block is one-shot like the original. A CLIMBER
  treats a blocker ahead as a handhold — mounts his head, lands on the far
  side (ground if ground, the pond if that's what the far side is) — and any
  live body crossing the head line spends the block: `releaseBlocker` puts the
  blocker back to `walk` in the direction he faced when he blocked (at a pond
  rim that walks him under — the original judges the player's shoreline).
  `traffic` keeps turning non-climbers; corpse-blocking untouched. THE SPIRE
  ships `block: 1` so the law is live on the marquee board: the solver spends
  it at the west pond rim (attract shows the line) and SPIRE carries block +
  climb together, so a player can open their own line — climb over your own
  blocker, watch it wake. Re-solve: all four levels win with slack,
  load-bearing proofs and determinism unchanged; three new pins (climb-over +
  release, head-line landing, uncrossed-line-holds) with the release neutered
  as the red drift. **CLOSED by #3864**

- #3863 — BUILDER stage 1 (the sixth skill, player-side): PLANK is placed
  matter — solid for walkers, mountable one-tile steps, soft landings; the
  carrier lays a plank at each one-tile descent while its cargo holds wood
  (12-plank original loadout, `Digit6`, panel slot six), and the plank road
  follows a staircase step-for-step — THE SPIRE's east face is its showcase
  with CLIMBER + BUILDER on one lemming. Economy is the original's panel:
  assigning is FREE (flag for life, re-grant refuses per #422), the counter
  drops per LAYING; empty cargo refuses and lays nothing. Wood is not dirt:
  climbers refuse its face, blasts splinter it, ponds and deep holes take the
  builder instead (no shelf, no plank). `candidates()` never offers it, so
  all solver scripts, proves and slack replay bit-identical — stage 2
  (solver-side) stays on the board as this README's first honest gap.
  lemcheck +17 pins (232/232: placement, one-wood-per-laying, pond/deep-hole
  refusal, staircase tracking, cargo exhaustion, supply law, climb/dig/blast
  interactions, determinism-with-wood, solver-never-builds, cargo per level);
  hand-drift proof: removing the shelf rule reddens 3 pins, removing the
  cargo decrement reddens 3, restored green — every rule is load-bearing.
  lemplay +6 drives (Digit6, Space assign, free-grant through the input path,
  wood pixel paint, panel tap) — 47/47.
- #3859 — ponds everywhere: three of four boards were drought-dead and the
  solver could not even SEE a pond rim (its edge test was AIR-only, so no
  autopilot or attract replay would ever block one). Now every level carries
  open water — THE DOOR and THE LEDGE voids have shores at the walking row,
  so the punishing east walk ends in the original's drown (splash, sink,
  tone) instead of a silent splat below the map; THE SPIRE gained a second
  body, a bay east of the exit plinth; THE MASSIF's pace-ground west of the
  massif drowns dawdlers at the west foot, and the level ships a second
  BLOCKER because holding that rim is now load-bearing solver work (slack
  rule — the solver spends one there in its winning script). The edge rule:
  `candidates()` reads WATER at foot level as floor-gone — a blocker is
  offered at the pond rim, and the blocker's own footing must be `solid`,
  never a pond cell; CLIMB stays AIR-only (nothing to grip across water).
  Winning scripts held: all four levels win with slack, loads-bearing and
  determinism proofs replay unchanged (void deaths switch cause fall→drown,
  counts identical). **CLOSED by #3859**

- #3853 — attract-parachute: the demo now spends its OWN float charges showing
  the fifth skill. `attract.js` exports a pure picker (`demoFloatPick`): an
  unsripted lemming caught airborne gets the canopy first (DOOR opens one
  mid-air at the step-off); after a 5 s grace the first unsripted walker wears
  one, and the canopy auto-opens on its next fall by the sim's own law. Two
  canopies per level cycle, never over the pond (floaters drown — mockery, not
  rescue), never a script target (proven lines are never re-timed), and the
  player's supply is untouched because `startPlay` rebuilds the level.
  lemcheck pins the picker, the per-level demo replays (win + canopy + supply
  cap) and a live Chrome run paints the striped canopy (16 cream + 8 red px).
  **CLOSED by #3853** — superseded in part by #3892: with the replay phase
  fixed, DOOR's airborne pick came from the desync, not the game; the grant is
  now certified per board (`certifyDemoFloat`) and mid-air deploys live on
  SPIRE and DOOR, script targets included (the certificate, not the exclusion,
  guards the proven line).
- #3849 — fatal fall distance: `CFG.maxFall` was 7, the original kills past ~3.
  Now 3 — falls off the spire kill, floaters become precious. THE SPIRE's east
  stair dropped its last step ~6 tiles to the floor (the old lax value hid it);
  carved down to ground level and re-solved (win 4/4, climb still load-bearing,
  slack holds at climb 5; MASSIF/DOOR/LEDGE proved unaffected pre-claim). The
  fatal pin is now **absolute** — 4 tiles must die, a stepped descent lands
  within 3 — because the old relative pin (`maxFall + 1`) stayed green at 7 and
  could not catch drift; mutation `maxFall = 7` covers the same hole. **CLOSED by #3849**
- #3844 — OH NO! death cry: a shared two-syllable synth wail (worried "OH",
  falling "NO!", sawtooth) answers EVERY death batch — fall, drown, bomb — under
  the per-cause stings, and a hand-drawn 5×7 bitmap `OH NO!` sprite pops on the
  corpse, rising and fading on the WORLD clock (FF-true, cap 4, oldest recycled).
  Death events carry `x,y` for the sprite; `lemcheck`'s OH NO! section pins all
  three causes plus the shell wiring. **CLOSED by #3844**
- #3827 — FLOATER skill (parachute: capped descent, no fatal landings, canopy
  on show while walking, Digit5/L1, deploy swoosh). **CLOSED by #3827**
- #3828 — water + drown rule, THE SPIRE's west-foot pond. **CLOSED by #3828**
- #422 — docked skill bar, badges, hover ring, re-grant guard. **CLOSED by #422**
- #432 — press/preview/release pointer gesture. **CLOSED by #432**
- #470 — visible assign result (grant flash, refusal sound, charge accounting).
  **CLOSED by #470**
- #1637 — WATCH autopilot replay with sound. **CLOSED by #1637**
