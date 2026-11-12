# STATE — session 241 (2026-11-12, slot b)

## What shipped
**SHORT ORDER SHOUT — THE RADIO TIES THE COOK** merged as `4f16b26` (PR #2082,
Closes #2079, never-dry stage filed+claimed by this session).
- The voice side-channel became a mechanic: while your take is held/draining
  (`radioBusy`), A/B (Space/B/pad) are refused at input origin — feet walk,
  hands stay on the radio. Legible refusal: toast + mic-chip red-blink + low
  buzz; blink stays lit while hammering continues. Keying itself always legal
  (radio on the apron — cost is time, no hands-full soft-lock).
- Landed takes (>= PTT_MIN_B64 bytes AND >= 300 ms, pure `takeIsSpeech`) get
  staggered COPY chips + a squelch blip from every CPU cook; solo, the line
  is quiet. Solo V works offline (`discard()` drains honest silence so
  `pending` can't wedge); phone gets tap-to-talk chips solo too.
- Engine/pads/lockstep/`state.hash` untouched — gate at input origin, acks fx.
- soscheck 47→61 (4 pure + 10 browser gates); mutant (gate→false) → exactly
  the refusal + red-blink law gates red, restored 61/61 x2. contractcheck
  724/724, lint:mario/fps/ai + eslint + build green; sosplay 10/11 with the
  1 fail reproduced identically on pristine main (cold-start, pre-existing).
- Prod verified: marker `HANDS ON RADIO` live in chunk `index-CwN-55iK.js`.
- Filed QA polish pass #2084 (sprite never visibly holds the mic, COPY-variety
  + runner distance flavor, hammering escalation, live mic meter) — all
  verified against the shipped code first.

## The session's catches
- **The contract holds the loop.** Determinism drills that call `__game.reset/step`
  latch `contractHoldsLoop()` and the rAF loop yields — drawing keeps running,
  ticks stop. Browser drills that need FEET must boot fresh (`page.reload`)
  and wait for `probe().tick` to advance before trusting key input.
- **Fixed-sleep walks race stale reads on software Chrome.** Position reads lag
  the sim during catch-up stalls; two "single step" presses both land →
  overshoot, then cascades into every later assert. The CPU emitter already
  knew the law: hold the press until the move CONFIRMS. Drives got the same
  law (`nudge()` + recovery branch when past the target).
- **Pixel tells with 4-tick blinks must sample the whole countdown** and take
  max-over-frames; a fixed-instant scan can park in the OFF phase every run.
  (Third repeat of session 240's lesson — bake it into drives from the start.)
- **Rebase before push when the log moved:** `git rebase origin/main` refused
  with a dirty tree — commit first, rebase second, push third.

## Ladder trail
TARGET #2077 REFUSED honestly (`forge-claim` said held by slot a, 5 min fresh —
CivV Ark-yards in flight). No halt/steer/next; game-queue empty; QA MASTER
live (pgrep hit) → no feedback borrow; flagshipStage null (all four flagship
READMEs gap-free, recomputed live not copied); never-dry `weakestStage` →
SHORT ORDER SHOUT score 4 (4 unowned gaps, 0 feedback naming it; strict max
among unheld — CivV inside #2077, PPM inside #2072, Homebody/ViperPit/PickRush/
TidyBot named in held-issue bodies and skipped conservatively). Filed #2079
with the why-weakest line, claimed clean, shipped one stage. No jonq filed.

## Open questions
- none (see waiting-jon issues).

## Next
- Slot b next session: re-run `weakestStage` — #2084 now names SOS, so its
  score CHANGED (feedback count moved; the Voice gap text was rewritten but
  still bullet #1). Recompute honestly, don't copy this line.
- `sosplay`'s "space starts the shift" flakes cold on any branch (reproduced
  on pristine main 1c043ed) — if it bites a real ship again, file it as QA.
- `viperpitcheck` still red-on-main, wired into NO CI job (flagged since 235)
  — re-file on a QA issue if nobody owns it.
- Dev servers at exit: slot b 5178 STOPPED; slot a's ports untouched. Worktrees:
  this session removes its merged `retrogames-forge-sos-radio` registration
  after the squash; session-235 candidates (ppm-portrait, ppm-bulletin,
  papers-photo) still stand.
