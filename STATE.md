# STATE — forge board snapshot (slot b, 2026-11-25 — PINBALL GETS ITS SOLO BED)

## This session — one ship, landed
- Warden TARGET **#3302 SKYWARD strip** REFUSED at claim (slot a held it live,
  claim 3 min old — they shipped it as #3306 mid-my-session; refusal worked).
  Normal ladder: no steer, `next` #1712 waiting-jon, `game-queue` empty, QA
  MASTER live (no feedback borrow), flagship stage spent → **NEVER-DRY
  `KICK PINBALL 0 weak`** (score 6: named #3290 + mechanical gaps).
- Kick's gap 0 (phone-HUD audit) **declined as owned**: #3290 item 4 is exactly
  that audit and #3297 already ran the contrast pass once (clips routed #3290).
  Next bullet was all-shipped prose (#3237/#3297). Oldest gap NO issue named:
  "music bed covers MULTIBALL only (#3178); single-ball play stays dry."
- Filed + claimed my own POLISH **#3304**, shipped **`e88e3d7`** (PR #3308):
  the **SOLO BED**. `pinballSolo` original A-minor ostinato (kin of pinballMb,
  no kick — the volley IS the drummer); pure law `soloBed(gs)` in sim.js:
  silence pre-launch/done/pack, 0.10 breath between balls, 0.16→0.30 heat
  swell, half-floor while tilted (music slumps like the flippers). Seam
  quantized 0.02; pack takes the bus @0.55 and hands it back (solo ref reset
  at pack arrival — the stranding bug shape). Rules byte-identical, hash
  untouched; devMb rig is **seam-only** (see lessons). README stale bullets
  got their honest CLOSED markers.
- Proof: pinballcheck **235/235** (+11 pins incl. rig-purity) + mutants
  **12/12** (new `solo`); pinballplay **57/57** on :5178 with 3 live bed
  legs (solo-on-play, pack@0.55+solo-ref-0, pack-off re-acquire);
  contractcheck 857/857; eslint + 3 scoped gates + build green.
- Prod verified via deployment record (e88e3d7 → success) and served chunk
  `Pinball-RTilGekP.js` contains `pinballSolo`. #3304 shipped+closed.
- **QA tail filed: #3313** — seam crossfade, heat visual tell, phone mix
  audibility, tilt-thin perceptibility (maybe muffle not level), attract-music
  taste call.

## Harness lessons (worth one line each)
- **A dev rig must never touch rule-state.** First `devMb` wrote
  `gs.multiball` — during the window a draining ball routes `packDrain` not
  `drain()`, and `endMultiball` zeroed locks / paid extra-balls. Fixed
  overlay-only (`devMbRef` ORed into the BED trigger; sim reads only
  `gs.multiball`), pinned in pinballcheck. Every seam rig: overlay the seam.
- pinballplay's magnet/kickback/DMD-strip legs shift failures run-to-run
  (1,2,1 fails, different legs) even on unchanged lanes — known flake family
  (#3291 fixed-instant lesson); green 57/57 on the honest rig settled it.
  Don't chase single-run advisory reds; re-run once.
- `forge-merge.sh` waits up to 900 s by default — give the shell a bigger
  timeout than the script's own WAIT or you kill a healthy wait (it resumed
  cleanly, nothing lost).
- Prod asset hashes ≠ local build hashes (RTilGekP vs DulY9Pvn): discover the
  name from the SERVED index bundle, then grep the marker; never guess from dist.

## PLAYABLE on main right now
- `/retrogames/pinball` SOLO bed (#3308) + TABLE SMITH + tilt-nudge +
  power-zone plunger; `/retrogames/skyward` second landing strip (#3306) +
  engine bed (#3299) + living storm; `/retrogames/grind-city` rail grabs +
  coping stalls + live manual chip (#3312); `/retrogames/tidal-rush` tricks +
  rooms; mario-kart (tilt), ice-climber, marble-rush (tilt, trick hop),
  comet-drift pair (tilt), ssx (tilt), marble-madness, pacman, mario,
  minesweeper/garden-guard/homebody, TIDY BOT, STARRY NIGHT, TOP SOLDIERS,
  DOUBLE DRAGON, RACCOON HEIST, spy-hunter, iron keep, galaga, missile,
  pucks, mines, zork, ultima, king's quest, Joust, Q*bert, forge board.

## Board watch (facts, not questions)
- `game-queue` EMPTY; `next` #1712 waiting-jon (not a work item).
- **Next builder claim: run `idle-kick` LIVE** — answered `KICK SKYWARD 0 weak`
  at my session end (strip shipped; what scores is derive-live — the online
  remnant is big-build multi-stage, never inside one stage; #3300 items are
  QA-wording-owned once claimed).
- QA/holds: **#3290 carries `building`** (claimed — Pinball is held, don't
  kick at it), #3281 building-qa, new tail #3313 (skyward→pinball bed),
  #3233 tail items shipping, #3244/#2971 waiting-jon.
- Merges today incl. #3291–#3313 pair-lanes; main-ok green at my claim and
  merge; latest Production 23312bc.

## Open questions (links only — #605)
- #3054 — QA: native TestFlight ports have no recorder/upload (lane:qa, AWAITING).
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).
- No new jonq questions filed this session.

## Slot state at handoff
- Slot b: dev :5178 stopped via scripts/devstop.sh; worktree
  `~/Dev/retrogames-forge-pinball-solo` detached clean at origin/main by
  mergeclean — remove when convenient.
- Game merged this session ⇒ this STATE.md ships via its own docs/state PR;
  parked at /tmp/forge/STATE.b.parked.md via statepark.
- Time-box: ~1 h 45 m of 3 h.
