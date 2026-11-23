# STATE — forge board snapshot (slot a, 2026-11-22 late night — SHIPPED)

## This session shipped
- **DOUBLE DRAGON hand-back polish (#3007, warden-assigned) → PR #3015 → main
  `5c40dd6`, prod-verified** (live `assets/DoubleDragon-DiqOclPe.js` carries
  the `P2 BACK` grammar). QA's five items on the #3005 idle-seat law, all
  measured before and after:
  - **Phone-proof grey:** brackets fused (measured Δ85 native/Δ50 binned,
    most arms under the ±12 grain floor) → 2-px arms on dark `#0e131c`
    plates + brighter `#c8d2dc` + alpha floor 0.35 (#2889/#2897 laws) →
    Δ124–134 native AND binned, live-cabinet leg. `CPU` banner passed QA's
    doubt already (Δ193/Δ174) — recorded, not "fixed".
  - **Heard descent:** seatBack 880→440+330 → 1175→587+440 @0.075/0.05:
    +17.6 dB gap-rise / +26.6 dB in the 900–1400 phone window, peak 6 dB
    under a hit. Honest correction posted on #3007: my first "+0.2 dB,
    buried" claim was a bad instrument (fixed-frequency Goertzel over a fast
    sweep); true old numbers +12.7/+11.3 — the fix is still worth +5/+15 dB
    in the clean window.
  - **Threshold kept 300:** thinking player (~3 s off-keys) never robbed;
    new pin: nudges every 4.5 s over 20 s hold the seat.
  - **P2 BACK:** re-seat after hand-back says `P2 BACK` (flare blue) + ascent
    chirp 587→1175+1175 (the descent inverted); first seatings byte-identical
    (`isReSeat(seat2At)` in p2pad, pure). Browser leg counts banner-row ink.
  - **READY pairing: symmetric, recorded decision** (README #3007 item 5) —
    seat-history invites are chrome nobody reads.
  - Verdicts: ddragoncheck 312/313 quiet-box · `--mutant` 269/269 (new named
    plants `grey-thin`, `reseat-blind`, `seat-deaf`) · contractcheck 15/15 ·
    eslint + lint:mario/fps/ai + build green. `stateHash` untouched.
- Lanes that crossed this window: MINESWEEPER chord shield #3009/#3010
  (`ef15bf6`) and CONTRA radio teach card #3016 (`e9d2b63`, current tip).

## PLAYABLE on main right now
- `/retrogames/double-dragon` — co-op hand-back now reads AND sounds right on
  a phone (#3007); `/retrogames/minesweeper` (chord shield #3010),
  `/retrogames/contra` (radio calls + teach card), `/retrogames/floor-boss`,
  `/retrogames/fire-crew`, `/retrogames/r-type`.

## Board at close
- `game-queue`/`next`/`steer` empty; `halt` none; `building` none.
- `feedback`: **#3018** (QA Contra attract-radio), **#3013** (harness
  merge-cleanup trap — 2nd bite, see below), **#3008** `building-qa` (QA is
  inside it — the load-flake family + Minesweeper suspicion, do not touch;
  the chord-shield fix #3010 already answers the Minesweeper half, and my
  run table is on #3007 if QA wants the flake half), **#2971** `waiting-jon`.
- Next builder lane: re-run `idle-kick` — the board re-armed since slot b's
  dry read (two new feedback issues landed).

## Harness notes (carry-overs)
- **Shared-box load flake is REAL and migrating:** another lane's
  `omlx-server` held ~100 % CPU through most of my runs; fixed-wait sampling
  legs failed in a different order each run (game-over pair, relief-tag,
  throw/rescue/movie-skip/strut) while every #3007 leg passed all 8 runs and
  node pins never moved. I took three load calibrations inside #3015
  (event-waits for the game-over cascade; relief fixture re-stamped until
  paint observes it — under catch-up the 9-count can burn between frames).
  No assertion weakened. If legs still migrate on a genuinely quiet box,
  #3008 (QA) is the family's home.
- **#2975 trap bit again** (#3013 now tracks it): rule-5 merge exits 1 AFTER
  a successful squash-merge — local `main` squatted by stale worktree
  `retrogames-qa-mini-cap`. Always verify via `gh pr view --json state` +
  origin/main, then `git checkout --detach origin/main` in your worktree,
  delete the local branch, `git push origin --delete forge/<slug>` if the
  remote survived. Reap `qa-mini-cap` when its PR story ends.

## Slots / ops
- Slot a port 5173 stopped via `scripts/devstop.sh` ✓; worktree
  `retrogames-forge-dragon-seat-polish` removed after merge (node_modules
  symlink rm'd as a link) ✓.
- Plumbing checkout `~/Dev/retrogames` detached-clean at `origin/main`.

## Open questions
- None filed. Dry-queue new-flagship question already on the record this
  week; do not file a second (throttle).
