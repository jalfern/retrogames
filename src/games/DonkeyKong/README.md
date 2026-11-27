# DONKEY KONG — engine notes

Williams-style tower climb (1981 lineage): five sloped girders plus the ape's
floor, ladders (four broken ones flicker as bait), barrels that roll down-hill
and randomly dive ladders, jump them for 100, reach her girder, pull her four
rivets and bank the bonus counter you beat. Fixed 224×256 world, integer-step
physics at 60 Hz.

## Layout (since #1637 batch 27)
- `sim.js` — the WHOLE rule set: `makeRun(seed)` builds the level, player,
  barrels and every die on one mulberry32 stream inside `gs` (#1473 seed-param;
  `?seed=N` replays the exact barrel pattern; `rnd(gs)` is step-identical to
  `seedRng`). `tickDonkeyKong(gs, input)` is what `update()` used to be;
  `stateHash(gs)` is the replay witness.
- `watchStep(gs)` — the WATCH route (Y key). Every tick it replays the game's
  own physics on cloned worlds (dice forked from the state, no `Math.random`)
  and ranks the route instinct plus held candidates. The arcade doctrine is
  code: the girder gap is ~32 px and the jump arc ~40 px, so a kangaroo COULD
  hop the whole tower — the original never did, so jump candidates only
  compete when a barrel is actually near (`barrelThreat`), and progress is
  height-monotone so climbing out always beats hanging on.
- `index.jsx` — shell only: canvas, sound (events stamped by the tick), the
  b24/b26 seat chrome (Y with blips, takeover, tap-to-start, never lingers),
  `__dkTest` DEV hooks and the `exposeGame` contract (`donkeykong`).
- `attract.js` — the shared attract copy cycle (#365 rule 6).

## Verify
```
npm run kongcheck            # rules + seat pins + 24-seed watch sweep
npm run kongcheck -- --mutant # 17 planted bugs, every one must turn it red
npm run kongcheck -- --mutant  # determinism + rule gates + rule mutants
npm run kongdrive              # real Chrome: keys, seat, finale crash, restart
npm run watchcheck -- --only donkeykong   # Y seats/steers/re-seats in Chrome
npm run contractcheck        # the exposeGame contract (in contractGames)
```
Ports: the browser checks read `DEV_PORT` (slot a 5173 / slot b 5178 / QA 5176).

## Honest gaps (vs the arcade original)
- **CLOSED by #3598, phantom-retired in #3618:** the arcade screen loops —
  there is no dedicated second stage to port. The rivet finale (#3598) IS the
  arcade structure (pull, crash, lap banks, board rebuilds); the table of a
  25 m second screen with 8 rivets and section-by-section drops was never
  sourceable in-repo, so it stays shipped history, not a spec. The prose
  below is kept for the record.
- **CLOSED by #3754 (walk-past 50):** the obstacle bonus now pays both halves
  of our pair — a barrel crossing Mario's column below his feet while grounded
  and alive pays 50, once per barrel (`passedBarrels` witness, rides the
  hash); the airborne crossing keeps its 100. #3761: each half now also POPS
  its `+50`/`+100` at the barrel (cyan 7px mono, rises and fades over 48
  ticks, deterministic — `gs.popups`, pinned by kongcheck §obstacle-bonus),
  so the bonus is readable on a muted phone.
- Oil drum is decor; the arcade's flame kills (spec unverifiable against ROMs
  in-repo).
- **CLOSED by #3622:** barrels meet ladders mid-air — see Corner pair below.
  (Was: a barrel meeting a ladder mid-air kept rolling; the edge-check could
  never set `falling=true` — gravity beats it to `vy>0` — so no airborne
  barrel state existed at all; fixed to `vy >= 0`.)
- **Item 1 CLOSED by #3657 (span body law):** two barrels sharing one span —
  the arcade's double-board — is now explicit law: `spanBoardY` lets a second
  barrel board an occupied span only by joining above the top rider, settling
  onto its head whenever bodies would overlap (equal descent speed then holds
  the offset — no clipping, ever); an arrival at/below that head is refused with its dice
  already spent, so the gap carries it toward the next rung. Measured on the
  natural stream (400 seeds): arrivals never coincide with an occupied span,
  so seeded floors are byte-identical — the law is enforceable insurance, and
  `kongcheck` §double board gates the unit law, a planted synthetic head-rest
  on R2, and a clip-free scan of the corner seeds. The arcade's *stacking*
  behaviour beyond head-rest (piling, queue slowdown) has no sourceable spec
  in-repo (atari.com/fandom 403; 2600 manual covers the same rule only), so
  it stays retired, not guessed.
- **CLOSED by #3657 item 2:** left-column parity — the arcade's corner fallers
  land on the girder below (its end overlaps the join). Measured trace
  (`scripts/trace-left-corner.mjs`): a barrel leaving girder 2's left end at
  cx≈14.4 drifts −1.2/tick through the slope-crowned ~31px drop and meets
  girder 1's line at cx≈−3.2 — our compressed joins were 3.2px too far in,
  and those barrels fell off the world instead of landing. The catch girders
  (1 and 3) now extend 4px past screen-left: corner fallers land on the
  clipped tip and the slope rolls them back into view, and girder 4's column
  is caught the same way (crossing cx≈−1.6). No extra left rung: a dive roll
  fires only where a barrel lands or crosses a span mid-air, so a girder-1
  survivor rolls right and meets the existing corner pair at the 1→0 gap —
  the same terminal column as every other right-corner faller. kongcheck
  §left-corner pins the measured crossing (cx≈−3.2 inside the 4px tip) and
  scans seeds for a barrel ever leaving the world through screen-left.
- **CLOSED by #3618:** broken ladders climbed part-way — see Half-rungs
  below. (Was: the original let Mario climb part-way some rounds; barrels and
  the player both refused them outright.)

- **CLOSED by #3786 (timer-zero capture law):** the score bonus is now the
  arcade's fuse (Wikipedia, Donkey Kong §Gameplay: points for "completing
  each stage according to a steadily decreasing bonus counter"; "a life is
  lost when … the bonus counter reaches zero"). `BONUS_START` 5000 lights
  with every fresh board, `BONUS_DROP` 100 steps off every real second
  (`BONUS_TICK` 60) while the board is live; the counter freezes with the
  death/win/capture/collapse animations and never runs in attract (the title
  demo must not gamble lives on it). Saving her banks what remains — the flat
  1000 lap fee is gone, `WIN_SCORE` deleted, the payout pops `+<counter>` at
  her perch — and zero fires the capture: `captured`/`captureTimer` 90 ticks
  of the ape lifting Pauline off her girder (her HELP cuts off mid-grab),
  then a life spent, board rebuilt with a fresh fuse, honest terminal at the
  last one. The counter rides `stateHash` and `cloneWorld`; the WATCH seat
  treats the grab as an honest wait, and the 24-seed sweep floors that the
  proven route beats the fuse every lap (lap ≈ 850 ticks of the 3000-tick
  run). Kongdrive proves it in Chrome: real-second countdown, live grab,
  life paid, fresh fuse. The arcade's exact step rate (the ROM ticks the
  counter faster than our once-a-second) is unverifiable in-repo; the LAWS
  — decreasing counter, bank the remainder, zero takes the life — are the
  spec, and all three ship.

## Hammer (#2018 — the attract promise kept)
Two mallets ride the right-hand ends of the ground floor and DK's girder
(`gs.hammers`, positions in `buildLevel`). Walking over one empty-handed and
grounded picks it up; carried, Space SWINGS instead of jumping (up / flat /
down, the original's sequence, `gs.swingSeq % 3`) and the ladders refuse you
(the original's trade). A live swing (12 ticks) deletes a barrel in its lane
for our house 100 — the kill box is untouched, the hammer extends reach,
never safety. Five swings and it shatters (`HAMMER_SWINGS`); death/lap reset
puts fresh mallets back on the girders. The WATCH route never walks within
reach of a mallet (route centre x ≤ ~185 vs pickup x ≈ 205): the seated
driver stays hands-free — kongcheck pins it (seat-hands-free rule), and the
24-seed floors are unchanged because the seat never touches the mechanic.
Durability is swings-not-ticks: the widely-cited arcade rule; the swing-only
limit also gives a player who grabs badly (by a ladder) an honest escape —
wail five times and jump/climb again.

## Half-rungs (#3618 — the broken ladders became the original's trap)
A broken ladder keeps its lower span. `buildLevel` gives every broken ladder a
`breakY` at `BREAK_FRACS` × span (level order — deterministic, the level still
carries no dice); sound ladders get `breakY === yTop`, so the climb rule is
uniform. Mount a broken ladder's foot with UP and you climb to the break line
and HANG: the last rung holds (`ev.hang`, one thud), the span above is gone,
drawn as snapped uprights and a missing rung-field. DOWN climbs back down and
steps you onto the girder. The top never delivers — bait stays bait.
Doctrine: the WATCH seat and attract demo never trust a broken rung. Only
input tagged `human` (the shell's key path) may mount one — rollout candidates
and greedy arrive untagged, so every seeded seat rollout, every replay hash
and the 24-seed floors ride byte-identical. Take the wheel while a runner
hangs on broken rungs and the sim steps him off onto the girder below —
the route never clings to what it cannot prove. `kongcheck` §half-rungs pins
all of it (geometry, hang, descend, seat refusal, seat step-off, per-ladder
break lines); the drive exercises it with real arrows.

## Barrel voices (#3641 — every barrel↔ladder event has a sound)
Pure-law sound grammar in `sim.js` (like centipede's `munchCue`): the sim
stamps descriptors on `ev.barrelVoices`, the shell plays them through
`audioController` — nothing else. `barrelBoardVoice(midAir)` ticks a board
(560 Hz rolled-on, 740 Hz caught mid-air at the corner); `barrelRollClick`
clicks every `BARREL_CLICK_EVERY` ticks while a barrel rides a span and
climbs inside `BARREL_CLICK_RANGE` px of the foot (the descent is never
silent); `barrelDangleVoice` is a lighter sweep + noise clatter for the
dangling-foot exit onto the gap. The stamps write nothing into `gs` — dice
and physics untouched, so every seeded floor is byte-identical. `kongcheck`
§barrel-voices gates the law (pitch order, phase grid, proximity climb) and
mirrors the stamps against real physics on the corner-pair seeds: every stamp
lands on the tick of its transition (boards on span entries, bright ticks only
mid-air, clatter on dangling exits), the corner floors' 3 dangling exits and
2 mid-air catches onto R2 ring, and every ride carries a click trail.

## Corner polish (#3651 — the corner pair reads and moves)
Two visual-only laws ride the corner pair, exported from `sim.js` so the gate
can pin them; physics, dice and `gs` are untouched (seeded floors remain
byte-identical — the rest of kongcheck's green is part of the proof).
**Brace:** the corner pair used to hang R2 off girder 1 on two 1.5px wires —
on a phone the ladder read as glued to air. `BRACE_WIDTH = 2` (as thick as
the ladder's own uprights) plus `BRACE_PLATE` / `BRACE_PAD`: a bolted gusset
under the girder at the anchor and a foot pad at the ladder head, with dark
rivet holes — the same bolted-steel idiom the girders and the #3598 rivets
already speak, so "this ladder belongs to that girder" is visible at a glance
at 390×844. **Ride:** a descending barrel is no longer the plain roll sprite.
`barrelRideFrame(tickN)` returns grip marks that swap rails on
`BARREL_CLICK_EVERY` — the same 4-tick grid as the descent clicks, so the
seen motion and the heard clatter are one grammar — with a ±0.5px sway across
the rungs and a hair of tilt. Rolling barrels keep their spin. Kongcheck
§corner-polish gates both laws and the shell wiring; the DEV probe gained
`rides` so a drive can wait for a descent (before/after shots at phone scale).

## Corner pair (#3622 — the arcade's end-of-girder ladders)
Two girder-end rungs stand at the RIGHT fall-gap corner, x=222 — where a
Node trace showed barrels leaving girder 3's end at cx≈210.5 land, after the
drop drift, on girder 2's tip (cx≈222-224). R1 (girder 2→1) has its foot
DANGLING into girder 1's end-gap (`dangles`); R2 (girder 1→ground) hangs
below it off girder 1's corner (`braceFrom`, a visual tie).

Physics: a barrel ROLLING onto a ladder mouth still takes it at
`BARREL_DIVE_CHANCE` as before; NEW — a barrel FALLING through a ladder's
span (feet within `[yTop−8, yBot]`, |cx−x|<5) rolls the SAME single dive
chance, spending `takenBits` so no barrel re-rolls or re-takes the same
ladder. Dice order shifts with every airborne meeting: seed floors move and
kongcheck re-derives them. A barrel rolling off R1's dangling foot becomes
airborne again and may catch R2 below it.

The old gap had TWO causes: the missing corner geometry (this PR), and a
silent physics bug — the edge check `!onPlat && vy===0` could never be true
because gravity is already past `vy>0` on the tick support is lost, so no
barrel in the shipped sim ever had `falling=true`. That is why #3618 traced
zero airborne crossings; fixed to `vy >= 0`.

Doctrine: R2's mouth hangs past girder 1's end with nothing to stand on, so
the runner and attract demo refuse it (marked `barrelOnly`); the outside rung
is purely the barrels' road down. R1 is a genuine corner shortcut the runner
may take. `kongcheck` §corner pair pins geometry, mid-air take, once-per-
barrel-per-ladder, dangling-foot retake and the runner refusal.

## Scoring honesty (#3761)

Every point value here (jump arc 100, walk-past 50, rivet 100, lap 1000) is
OUR house scoreboard law, pinned by kongcheck — NOT the arcade's ledger. The
1981 §Scoring values could not be verified from sources this lane reaches:
Wikipedia (current + 2023 revisions) lists the scoring CATEGORIES with no
values; the DK fandom, the wiki.gg mirror, StrategyWiki and the operation-
manual PDF (no text layer this harness can read) all refused or failed —
full outputs on #3761. Community folklore prices hammer hits far above our
100, so until ROM-grade material is cited in-repo: do NOT re-price on
folklore, and never sell a number here as "the arcade's". The one scoring
fact Wikipedia does carry: bonus life at 7,000 (unmodelled — we start with
three lives and no bonus life; honest gap, #3761 item 3's family).
