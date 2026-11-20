# DOUBLE DRAGON — S1 "Walnuts Street" + S2 "the weapons wall" + S3 "the hideout"

Jon's #2795 commission ("both flagships starting with double dragon"), stages 1–3
of Technōs Japan's 1987 arcade belt-scroller. Issue: #2807 (S4 co-op to follow).

## Layout

- `sim.js` — the whole game, DOM-free: waves, enemy FSM (enter/walk/windup/
  attack/back/stagger/down/getup/grab, plus S3's aim/cast for the steel-
  throwers), Billy's move set, stick pickups, the wave-lock camera, scoring,
  the two-stage flow (`enterStage2`, `rescueReady`, Marian's ropes),
  `autopilot` (attract demo + harness brain), `stateHash`. The rng rides IN
  `gs` (`rngState`, `nextId`) so snapshot/restore is byte-exact (#391).
- `art.js` — night-suburb backdrop (sky gradient + stars + moon, parallax house
  silhouettes with lit windows, pylons and sagging wires, chain-link + hedge,
  asphalt with deterministic grain, sodium-lamp glow pools) and the S3 yard —
  corrugated rust wall with riveted sheet joins, transom windows wearing
  sodium light, pipes and valve wheels, swaying chain-lamps, hazard stripes,
  oily concrete, `DD`/`87` graffiti. The pixel fighters
  (one parameterised `fighter()` per palette/pose, incl. the duel lieutenant's
  cap-and-sweep), Marian on the post, HUD, banners, and an original 5×7 arcade
  font (43 glyphs, width-checked).
- `index.jsx` — shell per docs/GAME-SHELL.md: one rAF loop, fixed timestep,
  attract-first, `?` PauseOverlay, `tapStart`, pad, DEV hooks, contract.

## The laws this game lives by (all pinned by `ddragoncheck`)

- **Depth is the dodge.** The street is a band (`DEEP_TOP..DEEP_BOT`); a swing
  only connects when `|dy| <= 8`. That single line IS the genre — `--mutant`
  plants a depth-blind hit and the check names the harm.
- **Arcade lethal.** One clean enemy hit costs a life; 3 lives; 100-tick
  respawn flicker.
- **Telegraphs.** `windup` (12 ticks) precedes every `attack`; hitting a goon
  in the windup staggers their turn away.
- **Crowd law.** At most two goons may windup/attack at once (`attackersMax`).
- **Spin back-heel** fires when a swing is asked for with two live goons within
  radial reach — boots both ways.
- **Grabs** (Amon/Abobo): mash KICK 3× within `grabTimeout` (52 ticks) or the
  knee takes a life.
- **The charge** (#2810): from mid-distance Abobo telegraphs 16 ticks of
  run-up (`chargewind`), then body-checks the lane at 2.8px/t until it leaves
  the frame — depth still decides; a committed dash whooses past an empty lane.
  The autopilot reads the telegraph wider than a punch's and sidesteps.
- **KO flash**: `gs.scoreFlash` rides the HUD (delta popup + three wave ticks);
  juice only — never mixed into `stateHash`.
- **Stick**: armed Amon drops it on KO; reach + damage double; it dies with you.
- **Stage loop**: three waves → banner → Walnuts Street re-runs, score carries.

S2 (the weapons wall, #2807):

- **Contextual PUNCH** — bare = jab; knife = THROW (the delivery, not a wave);
  whip = LASH. KICK stays a kick whatever you hold.
- **Reusable steel** — a thrown knife flies flat down its lane (4 dmg, kills a
  Williams outright) and lands back on the street as a pickup, hit or missed.
- **The whip** — reach 34, catches EVERY standing man on the line, and skips
  downed ones (standing swings don't stomp; the lash doesn't either).
- **Barrels are solid.** Three squat on the street; Billy and the goons must
  ask `blocked()` and walk round them — or hop the waist-high ones (z > 8).
  Three clean hits splinter one: +100, and it spits out the steel inside
  (knife / whip / stick, seeded). Two traps this taught, both pinned: a goon
  slipping off a barrel must move AWAY from its lane (re-deriving the slide
  direction from the current y ping-pongs on the mid-line), and a body in the
  footprint corner has both axes blocked — `stuckFree` slides depth to the
  nearest open lane.
- **One weapon in hand** — walking over a second weapon while armed does
  nothing; death costs what you hold (the stick law, generalized).

S3 (the hideout, #2807):

- **Two stages, one run** — clearing Walnuts Street opens `stage 2`: the
  industrial yard (crates refill where barrels stood, Marian spawns tied at
  the end, banner announces `STAGE 2 / THE HIDEOUT`), score carried.
- **Casters** — an armed Williams holds mid-field and COCKS a 16-tick aim
  before the blade flies flat down its lane. On the line it costs a life;
  ten deep it whizzes past; a crate between you eats it; and every escaped
  blade lands as pickable steel — reusable in both directions. The depth law
  is the only answer, thrown edition (`blade-blind` mutant guards it).
- **The duel** — the arcade's stage-2 boss is Williams himself: 10 hp, 800
  points, faster than his namesakes, a belt full of knives (reload cooldown
  instead of depletion). The duel wave closes only when he falls, and the
  stage does NOT clear yet — the rescue must be earned.
- **Marian's rescue** (`rescueReady`) — the ropes are untouchable while any
  duelist lives (pinned). Two punches after the win free her: +1000, the
  cheer, then the run loops to Walnuts Street with `cleared` earned.
  `rescue-blind` (a run that can never end) is a named mutant.
- **Stage readout** — the HUD wears `1-1` / `2-1` beside the wave ticks;
  the rescue pays the cabinet's THANKS, BILLY.

## Controls

Arrows walk (UP/DOWN = depth) · SPACE jump · X kick · Z punch · ? ops card.
Pad: JUMP / KICK / PUNCH (`thirdAction`, #2324).

## Verify

```bash
npm run dev -- --port 5173 --strictPort   # one terminal
npm run ddragoncheck                    # 74 checks: boots, laws, casters, duel, rescue, winnable, browser leg
npm run ddragoncheck -- --mutant     # depth/charge/blade-blind, barrel-ghost, rescue-blind must go RED (named)
CONTRACT_ONLY=double-dragon npm run contractcheck   # window.__game contract leg
```

Roster notes: joined BOTH lists at once — `scripts/lib/contractGames.mjs`
(and its PATTERNS) and the `nightlybot.mjs` soak roster (#1525 law, the lesson
of nightly 44762398189).

## Honest gaps (S3 by design — the S4 map on #2807)

- One stage left: S4 seats CPU-ally Jimmy by default (Jon's rule), then the
  keyboard drop-in.
- No combos/chain scoring bonuses; the original scores per-KO with a simple
  chain multiplier — carry added, chain not.
- Marian arrives tied (S3) but the game opens without the original's
  kidnapping cutscene — the rescue carries the story instead.
- Enemy knockback is positional, not sprite-true physics; fine at this scale.
- Goons carry knives (S3) but not the whip or stick-and-steel rotations of
  the later arcade waves; the thrown knife is the goon's only cast (and the
  original's goons never threw whip or barrel either).
- The duel's re-arm is a cooldown, not a walk-to-the-body pickup like the
  arcade's knife retrieval.
