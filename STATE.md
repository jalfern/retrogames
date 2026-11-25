# STATE — forge board snapshot (slot a, 2026-11-25 — SMITH GETS FOUND)

## This session — one ship, landed
- Warden TARGET **#3290 PINBALL smith polish** claimed at the first call
  (`forge-claim.sh 3290 a` accepted; it is a multi-stage QA tail — items 1–4
  shipped, 5–7 stay open).
- **SMITH POLISH STAGE 1 DONE** (`2d563fd`, PR #3320): the bench is now
  findable, honest and phone-legible. Unsaved ghost badge rides the row every
  frame (pulsing), blueprint shimmers, `BUILD YOUR OWN TABLE` crawls on both
  stock cabs + a `ghost` ad set; the ghost demo plays NOVA (`previewTb` — the
  layout openEditor actually opens with); selected mini-card carries its own
  fitted message strip; the bumper dome zone is DRAWN while BUMPER is selected
  (`zoneGuidePath`, guide==law pinned at every vertex); fit laws
  (`textFit`/`marqueeFit` in art.js) keep marquees/badges on-screen; card-tap
  seams resolve nearest-centre; bench palette lifted to `SMITH_BAR` y488 above
  the measured pad zone (nub top ≈y515 @375×812) + tool-cell taps.
- **Bonus bug killed**: App's `tapStart` synthesises Space on every canvas tap
  — inside the bench every tap secretly pressed A and dropped a part at the
  cursor. `tapSpaceGuard` (one-shot, canvas-armed) fixes it; touch leg pins it.
- Proof: pinballcheck **251/251** (+16 pins, guide-clamp mutant proven red;
  full mutant run 12/12), pinballsmith **29/29** (+6 legs incl. touch),
  pinballplay 57/57 (one pre-existing DMD-text flake, rerun green),
  contractcheck 14/14; eslint + 3 scoped gates + build green.

## Harness lessons (worth one line each)
- **Global synth keys are a shared bus**: App tapStart's Space reaches games
  as untrusted keydowns — any screen that treats Space as an ACTION must
  distinguish pad-button Space (`[data-vc]`, no canvas pointerdown) from
  canvas-tap Space. Guard pattern: arm on canvas pointerdown, swallow the
  matching Space, trusted keys reset.
- **A pixel probe on art must be differential**: the painted dome graphic sits
  under the guide rim and satisfies a naive cyan threshold in BOTH tool states;
  only the tool-toggle delta measures the guide.
- **Headless frame settle**: 16 ms after an input can read the pre-switch
  frame — wait ≥150 ms before pixel-sensing a state change (fixes the last
  smith leg flake family).
- `1/sqrt(e)` can round back over 1 — renormalise with a 1−1e-9 hair when a
  float-noise vertex must satisfy a strict `<= 1` law.

## PLAYABLE on main right now
- `/retrogames/pinball` smith polish (#3320) + TABLE SMITH + tilt-nudge +
  tidal rooms + SOLO bed; `/retrogames/skyward` engine bed + living storm;
  `/retrogames/grind-city` rail grabs + coping stalls + manuals chip;
  `/retrogames/pinball` rooms, mario-kart (tilt), ice-climber, marble-rush
  (tilt, trick hop), comet-drift pair (tilt), ssx (tilt), marble-madness,
  pacman, mario, minesweeper/garden-guard/homebody, TIDY BOT, STARRY NIGHT,
  TOP SOLDIERS, DOUBLE DRAGON, RACCOON HEIST, spy-hunter, iron keep, galaga,
  missile, pucks, mines, zork, ultima, king's quest, Joust, Q*bert, forge board.

## Board watch (facts, not questions)
- #3290 **stays open** (`feedback`) — items 5 (kits in the bench), 6
  (unified carry-and-drop idiom), 7 (garage of cabinets) are the next smith
  stage; do NOT redo items 1–4 (see ship comment on the issue).
- `game-queue` EMPTY at session start/claim; `next` #1712 waiting-jon (not
  work). QA holds: #3237, #3290 tail, #3281, #3244, #3233, #3300.
- Next builder claim: run `idle-kick` LIVE — slot b's notes expect `KICK
  SKYWARD 0 weak` (gap 0 keeps the online remnant; the honest single-stage
  slice there is the second landing strip).
- Nightly: main-ok green at claim and at merge.

## Open questions (links only — #605)
- #3054 — QA: native TestFlight ports have no recorder/upload (lane:qa, AWAITING).
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).
- No new jonq questions filed this session.

## Slot state at handoff
- Slot a: dev server on :5173 stopped via scripts/devstop.sh at session end;
  worktree `~/Dev/retrogames-forge-pinball-smith` detached clean at
  origin/main by mergeclean — remove when convenient.
- Game merged this session ⇒ this STATE.md ships via its own docs/state PR;
  parked at /tmp/forge/STATE.a.parked.md via statepark.
- Time-box: ~2 h 35 min of 3 h.
