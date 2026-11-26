# STATE — forge board snapshot (slot b, 2026-11-26 — PINBALL FLANK SHIPPED)

## This session — one ship (never-dry)
- Warden TARGET #3429 (SKYWARD online rooms) was REFUSED at claim (slot a held
  it live, 14 min fresh — they've since shipped; #3429 CLOSED). Normal ladder:
  steer/next/game-queue/feedback all empty-or-held ⇒ flagship stage spent (all
  flagship README gaps CLOSED/owned) ⇒ never-dry #1571: `weakestStage` scored
  **PINBALL 2** (highest unheld). Oldest gap awaits Jon's #3335 (declines
  action itself); actionable gap = *"no left ramp / kickback, spinner outlane-only"*.
- Filed + claimed **#3432**, shipped **PR #3437 (merge 2c93544)**.
- **JET LANE**: left ramp, two UP wires in the flank corridor (x 44..76; TWO
  mirrors x 284..316), pays ramp/rampSet ladder, SET + progress lamps,
  repeatable. Dome-flank return drops the ball down the roped outer channel
  through spinner+kicker — spinner finally lives on a ramp line.
- **KICKBACK L**: mirror save column x 155..170 (TWO 190..205), #3250 law
  (one/ball, fast-descent, rests-off). Columns disjoint → one save per SIDE.
- **Combo law**: a RAMP L SET re-arms the spent left save once (`kbarm` pulse).
  Issue-body deviation recorded in design comment: SET *is* the arm (symmetry
  with the shipped auto-column idiom beats an arming button).
- All TABLE data (mirror-general), smith chassis carries devices, stateOf+hash
  coverage, chrome wire/lamp/ring art, synth events, dev rigs `kbDrop('L')`,
  `rampLFeed()`.

## Proof
- pinballcheck **312/312** (+24 §flank pins: ladder literals, gates, once-per-
  side, rests-off, combo, EMBER mirror prices 30/600/75, mirror data law, hash,
  smith chassis, determinism). Mutation-proven: killing the combo law reddens
  exactly those pins; restored before commit.
- pinballplay **68/68** (new tail leg, cabinet-aware prices); contractcheck 14/14;
  eslint + three scoped gates + build green. Prod verified: `Pinball-fm41zBdE.js`
  carries `RAMP L SET` at jalfern.com.

## Harness lessons (one line each)
- Flipper-tip shadow: kb column spawn probes must use `yFrom+4` (556); y558 gets
  pushed by the shaft before the gs-level device check sees vy — spawn-in-column
  ≠ spawn-in-column-clean.
- A flank feed under the outlane guide's upper tip (y>420 at x~60) gets knocked
  flat by the guide END; feed at y400.
- The DMD is a single-slot announce: multi-ball rigs before a message assert
  stomp it. Put rig-legs at the TAIL and wait for a quiet table
  (liveBalls===1 && dmd.text==='') — pinballplay flank leg is that pattern.
- Tail legs inherit the cabinet the kit legs left selected — price literals must
  read the cab id (EMBER runs 75/30/600), not assume CABINET ONE.
- My prod poll greped with a typo'd var for 10 min before reading output once
  (rule 8 again: read the result before re-probing).

## Corpse found (not mine, untouched)
- Main checkout had a dirty `src/games/Joust/index.jsx` at boot (attract banner/
  toast double-draw fix, uncommitted). Parked at
  `/tmp/forge/joust-banner-corpse.patch`, checkout reverted. QA lane holds
  #3430 (JOUST art & fidelity) — that patch likely belongs to whoever wrote it;
  QA lane should look before re-doing it.

## PLAYABLE on main right now
- `/retrogames/pinball`: both cabinets now have a left ramp + a second save +
  the ramp→save combo. Plus prior shelf: skyward (now online rooms too, #3429
  shipped by slot a), grind-city bot, tidal-rush, pinball SOLO+smith, ssx,
  comet-drift pair, marble pair, galaga bee, mario-kart, ice-climber, pacman,
  mario, minesweeper/garden-guard/homebody, TIDY BOT, STARRY NIGHT, TOP
  SOLDIERS, DOUBLE DRAGON, RACCOON HEIST, spy-hunter, iron keep, missile,
  pucks, mines, zork, ultima, king's quest, Joust, Q*bert, forge board.

## Board watch (facts, not questions)
- `game-queue` empty at close; `next` #1712 waiting-jon. Feedback open:
  #3430 (Joust, building-qa), #3419 (building-qa), #3438 (filed this shift —
  PINBALL flank polish), #3244/#2971 waiting-jon.
- Slot a shipped #3429 (SKYWARD online) mid/after my session.

## Open questions (links only — #605)
- #3335 — QA: music-bus low-pass in AudioController (AWAITING, qa lane).
- #3054 — native TestFlight ports have no recorder/upload (AWAITING).
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).
- No new jonq questions filed this session.

## Slot state at handoff
- Slot b: dev :5178 stopped via scripts/devstop.sh; lane worktree
  `~/Dev/retrogames-forge-pinball-ramp` detached clean at origin/main;
  main checkout detached at origin/main (Joust corpse reverted after parking).
- Game code merged this session ⇒ STATE ships via its own docs/state PR;
  parked via statepark at /tmp/forge/STATE.b.parked.md.
- Time-box: shipped + verified in ~2 h 15 m of 3 h.
