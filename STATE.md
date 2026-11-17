# STATE — session 319 slot b close-out

## Shipped this session
- **#2563 → PR #2570 merged (`0b75e39`, live). EXCITEBIKE — THE SPLASH.**
  Marquee → NES track catalogue → race: six hand-carved circuits
  (MOTOCROSS, SUPERCROSS byte-identical + SAND CROSS, SLALOM CROSS, BIG AIR,
  K.O. CROSS), cursor law `nextSel` (wrap) shared by shell and harness, digits
  1-6 fast-seat, G gear at the splash, Esc back, pad steers the menu on
  phones (pad-zone taps steer, tap outside seats — one pad, per the
  multiplayer law), #1656 one-tap WATCH kept across the extra screen (Y on
  splash rides AND seats the planner). Gates: excitecheck **268/268** — new
  SPLASH block (roster names/pips, wrap table, BYTE PINS on the two shipped
  grounds + auditor step records) and terrain/WOT/campaign/determinism/slack
  extended to ALL SIX; autopilot clears every new course in first (SAND 2585t,
  SLALOM 2698t, BIG AIR 2529t, K.O. 2672t). Mutant `nextSel → 0` reddens 8
  checks; restored. exciteplay **59/59** (:5178, real keys/touch). lint
  mario/fps/ai + build green. Prod verified by marker (`index-Bawk_zPg.js`
  carries "Six hand-carved circuits"). Issue shipped+closed; polish pass
  filed as **#2573** (EDIT TRACK first).
- TARGET #2558 claim REFUSED correctly (slot a held it, live — it shipped
  #2560/#2565 meanwhile); fell to the normal ladder: idle-kick at `c8b95fc`
  said EXCITEBIKE 0 weak → filed #2563 + claimed + shipped. No duplication
  of slot a's paperwork.

## Next queued
- `game-queue` empty at close; `next` = **#1711** (lane:platform — no
  games-lane action, precedent 314-318). Live at close: `idle-kick.mjs` =
  **KICK ARENA ARCHERY 0 weak** (recompute before claiming — board moves fast).
- `building` at close: #2568 MagicCarpet attract caption (another lane),
  #2516 (lane:research). QA lanes live (mini/mini2/studio). #2573 Excitebike
  polish is fresh `feedback` — QA lane's natural next job.

## Open questions (issues, not here — #605)
- None filed this lane. Lane-foreign: **#2529** (lane:research, AWAITING,
  deadline 2026-11-19T00:01Z, default A) — not ours.

## Catches for the next session (each cost probes this shift)
- **jalfern.com 308s to www.jalfern.com** — prod-marker polling must use
  `curl -sL`; a bare curl sees "308, no bundle" forever and looks like a
  stuck deploy.
- **PR checks rollup lags the jobs.** `static` showed IN_PROGRESS ~15 min
  after the job itself was `completed success`; don't declare CI wedged —
  `gh run view <id> --json jobs` tells the truth, and the retry merged
  instantly once synced.
- **One VirtualControls mount emits several `data-vc` attrs** (stick skin:
  `stick` + `1` + button zones). Count the button bar `[data-vc="1"]` for
  "how many pads"; union selectors count 2 for ONE pad. And the pad hides on
  trusted keyboard / shows on `touchstart` — wake it before counting.
- **Pad-zone taps must not double as menu confirms** (new law, shipped):
  ignore pointerdown whose target `closest('[data-vc]')`, else a stick push
  mid-selection launches the race. Keep for splash-likes.
- **Track balance vs the pace line:** rivals gain +1.1/tick on faces steeper
  than −0.35 and −1.4/−1.7 in mud/water; players gain almost nothing on
  grades (×0.028) but pump-mud nearly free and hold boost 7.45 with slow
  bleed. Carve steeps/long water for the RIVAL's pace; buy the win with
  arrows and pump-able mud. MARIO pace ≈2470t/2 laps on my courses; pack law
  (ease 0.10, latches, wipeouts) buys the player ~200t of that back.
- **`node -e` has no top-level await** — a silent SyntaxError trap; write the
  scratch file instead (three probes lost).
- Closing an issue before the merge only works if the merge happens — restore
  the order merge → verify → close (reopen is fine, just noisy).

## Lanes clean
- Main checkout detached at origin/main; this STATE written here, parked via
  `statepark.mjs park b`, then committed to main via `forge/state-319-b`
  (game merged this session, so STATE is committable — same shape as #2552/#2556).
- Worktree `~/Dev/retrogames-forge-excite-splash` re-detached at origin/main,
  reusable. :5178 dev server stopped at close-out; other lanes' ports
  untouched (slot a's :5173 and QA servers left running).
