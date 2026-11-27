# CENTIPEDE — engine notes

Atari 1981. A ten-segment centipede descends through a mushroom garden,
bouncing off anything it touches; you're the zapper at the bottom. Since
#3604 the garden walks: a spider eats it, a scorpion poisons it, and a
flea answers anyone foolish enough to fire into empty sky.

## Rules that are load-bearing
- **Arcade point table**: head 100, body 10, destroyed mushroom 1
  (`scoreForSegment` / `MUSHROOM_POINTS` in `sim.js`). Pre-batch the port's
  `state.score` was dead code — centipedechek pins every line that pays.
- **Chain rule**: every cut turns the shot segment into a mushroom *and the
  segment behind the gap becomes a new head* (heads visibly carry eyes).
  The pre-batch code punted ("keep it simple"); the law now pins the line.
- Three lives. A touch costs one: the zapper returns to the bottom pad after
  ~1 s dark with ~1.5 s blinking grace, **mushrooms persist**, the centipede
  restarts from the top while **the menagerie clears and its cadence
  restarts** (a fair respawn is not a spider pit) — the arcade death, not a
  hard reset. Zero lives = GAME OVER (`done: true`); any key/click/tap
  starts a fresh run (`startRun`: score 0, lives 3, NEW seeded field).
- **Field bands (#1524)**: the opening field stays out of the top band where
  the centipede spawns AND out of the bottom strip the zapper owns — the
  arcade never plants mushrooms in the player zone (a walled-in start).
  `mushroomField` in `sim.js` clamps both edges; centipedechek sweeps 12
  seeds. The flea's mushroom rain obeys the same bands.
- Mushrooms take three hits (port baseline) and shrink per state.

## The menagerie (#3604)
- **Spider** — the bouncing eater. Enters from a side inside its roaming
  band (never on the start pad), re-aims at the nearest mushroom every 90
  ticks, ricochets off walls and band edges, and eats every cap it touches.
  Three shots; the kill pays the bravery bands `SPIDER_POINTS`: <100 manhattan
  from the zapper = 900, <200 = 600, else 300 (arcade values pinned; the
  pixel distances are ours — UNVERIFIED which exact ones the machine used).
- **Scorpion** — the quicksilver streak. Crosses the garden band at 4 px/tick
  with a zigzag dip, poisoning every *full* cap it passes (`poisonMushroom`
  refuses already-chewed ones — the arcade's dying caps don't double-dip).
  Poisoned caps render red; a centipede segment that crosses venom turns red
  (`c.fast`) and races at double pace until the wave rebuilds. One shot, 1000.
  Exits the far side; the cadence restarts.
- **Flea** — the reward you summon. A bullet that flies clear out of the
  field was aimed at empty sky; the sky answers with a flea at that column
  (`bulletEscapes` + a 240-tick cooldown so mashing can't raise a plague).
  It bounces diagonally through the garden eating caps. Two shots — and
  **every hit rains two fresh mushrooms** into the garden: the arcade's
  bonus mushrooms, seeded, on the grid, obeying the field bands. 200 points.
- All three kill the zapper on touch (the respawn grace covers all of them),
  and death clears them. The WATCH seat sidesteps any menace looming within
  reach overhead.
- **Cadence** (spawn `sim.js`): SPIDER_EVERY 420 / SCORPION_EVERY 560 /
  FLEA_COOLDOWN 240 ticks, one of each at a time, every die on the run's
  stream. The arcade's real cadences are unwitnessed in-repo — these are
  the honest shipped spec, pinned by centipedechek.

## Seeding (#1473 batch 16)
One mulberry32 stream per run (`seedRng`), regenerated at every human start
honoring `?seed=N`; the 40-mushroom opening field is the only seeded field
die, and every menagerie die (side, entry column, flea direction, rain
cells) rides the same stream — a seed replays its whole menagerie
byte-identical (centipedadrive's rollout). Leg animation is wall-clock
decor. `init()` clears the gun: a stale bullet crossing a reset was the
divergence centipedadrive caught (a fresh board is a fresh shot). Report
`{tick, score, done, seed, lives}`; QA contract `exposeGame` id
`centipede`, buttons `left/right/up/down/a`, and `state()` also reports
`spider/scorpion/flea` (0/1) and `poisoned` (count) for the harness.

## Verify
```
npm run centipedechek            # field replay + scoring law + menagerie law + wiring + sound grammar (104)
npm run centipedechek -- --mutant  # 31 mutants, all must die
npm run centipedadrive          # real Chrome: sky-shot summon, seeded rollout, honest death
npm run lint:centipede
```
The drive parks the game's own rAF loop behind `?` before the determinism
rollout (one driver per clock, the Zork lesson) — ticks land exact, and two
identical seeded drives answer identically including what was seen en route.

## Honest gaps
- ~~Field is 40 scattered mushrooms, not the original's authored clovers.~~
  #3620: each wave now seats 3 clover blocks (2x2) and 2 five-cap hedges from
  the seeded stream, remainder scattered; formations draw no extra dice, so
  `?seed=N` replays unchanged. Authentic per-wave *layouts* (fixed tables)
  **#BLOCKED** (#3664 ruling): the ROM's placement tables sit outside the
  network boundary ("GitHub, npm, and docs you already use"), and the premise
  itself reads wrong against the sources — Wikipedia describes the arcade's
  field as *accumulating* during play ("at higher levels, the screen can
  become increasingly crowded with mushrooms due to player/enemy actions"),
  a seeded garden that wears in, not a map re-authored per wave. Ours is the
  seeded-shapes reading; the fixed-table reading is no gap, it is a dead end.
- Restored in the #3664 pass: death had left poison and chips in the garden —
  the arcade heals them with the zapper. Wikipedia (verbatim):
  "The Bug Blaster is destroyed when hit by any enemy, after which any
  poisonous or partially damaged mushrooms revert to normal. 5 points are
  awarded for each regenerated mushroom." Poison clears, chips heal, 5 ×
  regenerated on every respawn; caps shot away stay gone (the § names exactly
  those two states). Dice-free, so `?seed=N` replays keep bit-exact.
- ~~One centipede per wave with no speed ladder across waves.~~ #3631: each
  cleared wave spawns ×1.08 faster (capped at ×2) and the rear sub-chain behind
  every cut compounds ×1.25 — dice-free, so `?seed=N` replays the whole ladder.
  The exact rates are this repo's pinned spec; the monotone climb and the
  cut-accelerates-the-rear law are the arcade's.
- ~~Sound is a tone sketch; no arcade munch/click sequence.~~ #3632: the
  swarm munches — a two-syllable clack whose pitch and interval follow the
  column's distance to the zapper (`munchCue` in `sim.js`, pinned), plus a
  re-synthesized grammar: crack zapper, woodblock mushroom chip / filtered
  crunch, layered pew with head sparkle, spider ricochet boing + squelch
  kill, scorpion entry hiss and venom sizzle, flea zoom-in and floor boing,
  three-note wave jingle, three-layer death. All synthesized at runtime via
  `audioController`; the exact machine waveforms are UNVERIFIED — this is our
  arcade-close rendering, not a claim about the original's output.
- **CLOSED by #3726**: The menagerie no longer passes *through* the centipede
  column. The spider devours segments on contact (same 12 px reach as its
  bullets): eaten ≠ shot — the lunch is gone, no mushroom planted where it
  fell, and only the shooter's kill pays (bug-kills bank 0) — while the chain
  splits by the existing cut law (segment behind grows a head, rear takes the
  #3631 boost), one chew per tick. The scorpion stings the column: segments
  its body touches (its 10 px venom reach) turn red and race, obeying the same
  poisoned-segment speed law the caps already keep. Both dice-free
  (`spiderDevours`/`scorpionStings` in `sim.js`), so `?seed=N` replays stay
  bit-exact; `centipedechek` §bite gates the law, `centipedadrive` proves it
  live via the DEV `devour`/`stingSeg` staging hooks; mutants: the eater
  ignores the column, bug-kills pay, the sting never races, the chew mows.
- **DISCLAIMER**: cadences, spider bounce grammar and the poisoned-segment
  speed law are this repo's pinned spec, not claims about the machine — the
  arcade's exact bug-vs-bug frames remain unwitnessed; the shipped reaches
  (`SPIDER_BITE`/`STING_REACH`) and the one-bite-per-tick cadence are ours.
- Kill-pop debris (#3620) is our own juice grammar — fixed radial bursts and
  score digits, render-only; the arcade's exact destruction animation frames
  are UNVERIFIED.
