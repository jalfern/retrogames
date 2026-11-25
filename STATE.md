# STATE — forge board snapshot (slot a, 2026-11-25 — GRIND CITY CAMERA DRAMA LIVE: fisheye cuts + run replay (#3225 / PR #3228))

## This session — one ship LANDED (warden target refused, ladder honored)
- **Warden target #3220 (TIDAL RUSH online rooms) claim REFUSED** — slot b
  live on it (claimed 00:53Z, checkpoint `574b82d` 5 min before my claim).
  Per the warden instruction I ran the normal ladder: halt none; `jonq list
  games` nothing answered/defaulted; game-queue empty; #1712 is `next` but
  carries `waiting-jon`+`lane:research` (not a work item, #605); QA master
  live → no feedback borrow; `idle-kick` → `KICK GRIND CITY 0 weak`
  (weakestStage score 7). Filed **#3225**, claimed, shipped.
- **#3225 DONE: GRIND CITY camera drama** (`05f2387`, PR #3228).
  - **Fisheye action cam**: hard cut to a low, close, side-offset FOV-96 cam
    while grinding / on a manual / airborne-with-grab; hard cut back on exit.
    Smoothing lives inside a cam mode; crossing modes = snap + white flash +
    FOV punch. Landing impacts yank the cam too.
  - **Run replay**: cabinet logs one packed input word per played tick
    (`packIn`/`unpackIn` in sim.js); run end re-simulates the last 10 s from
    the same seed and plays it back on its own low cam, half-speed while
    airborne, REPLAY banner + REC dot, Space/tap skips to results; attract
    runs get none. Determinism of `sim.js` makes it byte-identical to the
    live line. Contract/`__grindTest` expose `cam` + `replay:{i,n,pct}`.
  - Proof: grindcheck **27/27** incl. new section — bot winning line
    re-hashes identical per tick from the log (1286 ticks, 18910 pts); new
    mutant `replay` (log lies about B) → **3/3 caught**. gcdrive **11/11**
    DRIVE GREEN in real Chrome (replay screen after clock-out, skip, restart,
    action-cam cut-in on a driven grab, zero page errors); frames eyeballed
    at 1280×720. eslint + 3 lint gates + build green.
  - Prod verified: `GrindCity-CkUInKak.js` carries `SPACE / TAP`.
    Play: `/retrogames/grind-city`. Issue `shipped` + closed.
- Step 8b: polish pass **#3167** already existed — commented (not duplicated)
  with what shipped and the concrete remaining asks (audio bed, manual
  look differentiation, concrete shading, replay options, attract variety).

## Nightly state at handoff
- **45515202339 @ `4059e40` still in_progress** — first run with quarantine
  OFF (watchcheck + zeldaplay for real). Check it next session before
  blaming any new failure on game code.

## PLAYABLE on main right now
- **`/retrogames/grind-city`** — chase/fisheye/replay cams + run replay (#3228).
- `/retrogames/pinball` rung 3 + ball-to-ball, `/retrogames/skyward`
  thunderpass, `/retrogames/r-type` solo-wing throat, `/retrogames/ice-climber`
  DOWN-as-verb, `/retrogames/tidal-rush` rain-terrain + moored sloops,
  `/retrogames/marble-rush` ten shelves + fall drama (#3223), marble-madness,
  comet-drift ± tilt grants (#3215), ssx, stomptown, short-order-shout,
  pacman, mario, minesweeper/garden-guard/homebody (POINTER pads), TIDY BOT,
  STARRY NIGHT, TOP SOLDIERS, DOUBLE DRAGON, RACCOON HEIST, spy-hunter,
  iron keep, galaga, missile, pucks, mines, zork, ultima, king's quest,
  Joust, Q*bert, forge board.

## Board watch (facts, not questions)
- game-queue EMPTY. Next builder ladder derives via `idle-kick`/`idle.mjs`.
- #3220 is `building` for slot b (branch `forge/tidal-rooms` @ `574b82d`:
  net.js + sim.js human seats done; next per its comment = index.jsx
  lobby+lockstep wiring). If slot b dies, that's a resumable corpse for the
  next lane per step 1b — NOT finished work.
- Slot b's 01:07 park (TILT grants #3215, no open questions added) folded in.

## Open questions (links only — #605)
- #3054 — QA: native TestFlight ports have no recorder/upload (lane:qa).
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings.
- No new jonq questions filed this session.

## Slot state at handoff
- Slot a: dev server stopped (`scripts/devstop.sh`, :5173 free).
- Lane worktree `~/Dev/retrogames-forge-grindcity-cam` removed clean after
  merge; main checkout detached at `origin/main`.
- This STATE.md ships via its own docs/state PR — game code merged this
  session, so the commit-to-main path is earned.
