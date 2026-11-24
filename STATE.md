# STATE — forge board snapshot (slot a, 2026-11-24 — MARBLE RUSH COMPLETE + red main cleared)

## This session — two ships
- **RED MAIN CLEARED (#2176):** nightly 45450160001 (17:41Z) failed 6 checks;
  PR #3193 merged `91ea2a0` fixes all at their roots: soak roster missed SIX
  games (pinball/marble-rush/stomptown/tidal-rush/grind-city/skyward — #1525
  law); dvhcheck: GrindCity's shell was `h-screen` not dvh; cometcheck re-wrote
  *tracked* docs PNGs every run, so mutateguard refused the stomp/skyward/
  roller mutant runs (#2047 class) — side-by-sides now go to gitignored
  scripts/.shots/; mergecheck (never CI-verified) crashed runners without
  /bin/zsh → now skip-green like watchrespawncheck (#2278 pattern — installing
  zsh on a runner WAKES the Studio-only watch checks, don't); rollercheck
  --mutate exited 1 despite catching — now the stomp/skyward convention
  (caught ⇒ exit 0, survivor ⇒ 1). CI proof: full-static GREEN on the branch
  (45461986631 → 3 more reds found & fixed → 45471040467 GREEN). Merged under
  the #2957 red-main-fix precedent; refresh dispatched on main:
  **run 45482317911 — green ≈ 21:20Z lifts the freeze for everyone.**
- **#3107 stage 2 (shelves 6–10 + two new verbs)** SHIPPED: PR #3183 merged
  `acc5a48`; prod verified (`MarbleRush-5tqIR4bZ.js` carries the gate flow).
  Issue closed completed — the brief is done: rung 1 (dd55a07) built shelves
  1–5, this built 6–10, "ten good ones beat thirty" satisfied.

## What shipped in #3183 (game)
- Shelves 6–10: UPPER DECK, GHOST LINE, THE MILL, LONG DROP, THE SPIRE.
- Sweeping bars (moverDeck sine, inverted; ±5.2 knock, 28 % speed bite, 0.5 s
  immunity, seeded moment) + checkpoint gates (shelves 6–10; respawn at the
  gate keeps clock + score; refuses on finish). One stick, untouched.
- rollercheck 36 → 48 Node + 11 Chrome; mutants sweep/gate/edge/budget red on
  demand; gap-cover invariant caught a mis-anchored bridge mid-authoring;
  filmstrip 5→10 shelves on the PR. QA polish pass filed: **#3187**.
- Rule 4: COUNTER RESET — game code merged.

## PLAYABLE on main right now
- **`/retrogames/marble-rush`** — all TEN shelves (Space/arrows, ? pause,
  stick pad; green arch = gate armed). THE SPIRE is the exam.
- `/retrogames/pinball` (rung 2), `/retrogames/grind-city`, `/retrogames/skyward`
  (THUNDERPASS), `/retrogames/tidal-rush`, `/retrogames/stomptown`,
  `/retrogames/short-order-shout`, ssx, marble-madness, pacman, mario,
  forge board, TIDY BOT (#3085), STARRY NIGHT (#3082), TOP SOLDIERS (#3067),
  DOUBLE DRAGON, R-TYPE, RACCOON HEIST, spy-hunter, iron keep, galaga,
  missile, pucks, mines, zork, ultima, king's quest, Joust, Q*bert.

## Board watch (facts, not questions)
- `game-queue` empty (first time this cycle). Idle-kick derived
  `KICK TIDAL RUSH 0 weak` — but gap index 0 is "online rooms", listed as
  not-yet on #3104's own body; sanity-check and prefer the rain-physics /
  air-verbs gaps when taking it.
- Slot b shipped PADTYPES tail 2 (#3182) + STATE (#3186) during my shift;
  their #3192 (same red-main fix, 2 of 4 causes) was closed superseded by #3193.
- Open `lane:games` unqueued: #3014 (CONTRA attract voice demo), #2827
  (consent gate), #838 (MYST) — never ladder candidates without a label.
- No `steer`, no `halt`; no new `waiting-jon` from slot a this shift.
- Nightly lesson banked: several gates in checks.mjs have never met CI
  (mergecheck was one). A new nightly check should ride a branch dispatch
  before it joins CORE — candidate for a small warden rule.

## Open questions (links only — #605)
- #3054 — QA: native TestFlight ports have no recorder/upload; does the big build need one?
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).

## Next queued
- Wait for refresh run 45482317911 to go GREEN, then: `KICK TIDAL RUSH` via
  the never-dry route (file `POLISH — TIDAL RUSH: …`, prefer rain-physics
  over the parked online-rooms gap), claim normal.
- MARBLE RUSH stage 3 exists only as README honest gaps; #3187 owns the
  visual/sound ones for QA. Ghost-racer is the one no issue owns.

## Slot / board state at handoff
- Slot a: #3183 + #3193 + STATE PR merged (this file via #3189); #3107
  shipped+closed; #3187 filed; shift report pushed; dev :5173 stopped via
  devstop.sh.
- Worktree `~/Dev/retrogames-forge-marble-rush-s2` detached at origin/main at
  handoff; frames/strips in /tmp/forge + scripts/.strips (untracked by design).
- If refresh 45482317911 is somehow red when you read this: it is NOT
  marble-rush — check watch* wake-ups first (CI has no zsh now; skip-green).
