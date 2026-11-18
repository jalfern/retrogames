# STATE — session 332 slot b close-out (ATTRACT RIDES YOUR DESIGNS shipped)

Slot-b run ~22:50–01:30Z. Ladder: #1711 REFUSED (slot a held it; it since
released to `next` needing only Jon's clap-take), game-queue empty, QA MASTER
live (no feedback borrow), flagship gaps spent → never-dry rung. Filed #2647
from `weakestStage` (EXCITEBIKE, score 4 — shelf max) and shipped it. AGENTS
rule 4 satisfied: game code merged.

## Shipped this session
- **#2647 ATTRACT RIDES YOUR DESIGNS — CLOSED shipped** (PR #2649, squash
  `1ea2e70`, live: chunk `index-DXRRqDWD.js` carries `data-demo-track`).
  **The bug behind the gap:** the attract replay reached the MOTOCROSS finish
  at t2561 and `doSim` called `finish(true)` — the BOT wrote score 14300 into
  `excitebike.board` every ~43 s and the marquee froze on the over screen
  until a key. Two laws: **VIEWER SEATS** (demo end on `attract`/`tracks`
  submits nothing, never leaves the screen; `play`/TEST/WATCH receipts
  untouched) and **SEAT ROTATION** (`demoSeats` pure in attract.js:
  MOTOCROSS first, then CUSTOM 1..n roster order; zero designs → `[0]`,
  byte-honest). Designs ride an honest lazy `plan({track,laps:1})` cached on
  terrain OBJECT identity (re-saves swap CACHE items → re-plan, never stale
  dirt). `DEMO · MOTOCROSS` / `DEMO · CUSTOM k` badge (`data-demo-track`).
  Proof: excitecheck 426/426 (+19 ATTRACT DESIGN; by-hand mutants — guard
  removed, seats frozen — die by name), exciteplay 137/137 (+6, real frames
  cross the line, board stays empty, seat rotates onto design terrain), plus
  a 46 s real-clock marquee cycle during dev. eslint + lint:mario/fps/ai +
  build green. README gap CLOSED; honest remainder recorded (badge is roster
  number, not the saved design name — open polish, may seed the next pick).

## Next queued
- `next` = #1711 only; it needs JON's ≥3-slaps `/claptest` take before a lane
  can close S1 (slot a's evidence session says so) — not lane-buildable now.
- game-queue EMPTY. Next builder: re-run `node scripts/idle-kick.mjs` (the
  pick moved once already: slot a saw FLOOR BOSS at `86ab910`, I saw
  EXCITEBIKE at the same tip — re-derive, don't trust this file's pick).
  QA MASTER was live this shift (:5176), so builder feedback-borrow stays
  blocked unless it's gone.
- QA shipped #2618 (HOMEBODY NEIGH STROLL view pass, PR #2648) onto main
  mid-session — the QA lane is productive. #2632 remains Excitebike's open
  YOUR-LAPS view pass (this stage's badge is not in its scope; QA may
  extend). Don't touch what QA holds.

## Open questions (issues, not here — #605)
- None. jonq games lane empty at close.

## Catches for the next session (each cost probes this shift)
- **Prod-verify BFS: game chunks are generic `index-*.js` and lazy refs are
  RELATIVE (`./index-*.js`).** An `assets/…`-prefixed regex finds NO chunk map
  (cost 30 blind polls). Probe: BFS from `/retrogames/`, resolve every
  `["'(][.A-Za-z0-9_/-]+\.js` against the chunk's own directory, grep the
  new string literal (mine: `data-demo-track`). ~96 fetches to reach it.
- **A replayed planner script ENDS the game.** `plan()` records to `g.end`, so
  any shell replaying `run.script` through `doSim` hits the end path — that is
  how the bot submitted scores. If a consumer replays scripts outside `play`,
  the viewer guard is the law; keep it before `finish()`.
- **Rotation re-seats `gs`:** after a seat change `probe().track/tick` belong
  to the NEW game (track 6, tick ~6). Asserting the old seat post-rotation
  reds your own gate (cost one exciteplay rerun).
- Also valid: warden double-kick (pgrep with count); STATE PR mechanism for
  close-outs; `gh pr merge` from detached HEAD; park slot-scoped first.

## Lanes clean
- Main checkout detached at `origin/main`; STATE.md landed via its own STATE
  PR (game code merged this session, so step 9 allows it); parked slot-scoped
  then shared (`statepark park b`).
- Lane worktree `retrogames-forge-excitebike-attract-designs` pruned after
  merge; local branch gone with the remote one.
- :5178 stopped by this lane; foreign ports (:5173 slot a, :5176 QA)
  untouched.
