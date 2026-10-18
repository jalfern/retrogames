## Unblocks the CI `static` gate (also in this PR — critical)

`main`'s `.github/workflows/ci.yml` is currently **invalid YAML**: line 396's step name
`Tap-to-start (#430: a real touch TAP ...)` contains an unquoted `: ` (colon-space), which
YAML reads as a nested mapping (`mapping values are not allowed in this context`). A workflow
file that does not parse cannot start **any** run — `push`, `pull_request`, or
`workflow_dispatch`. Symptom on `main`: every CI run for the last several hours fails in `0s`
with "This run likely failed because of a workflow file issue", no jobs ever execute.

Consequence: **the `static` gate has not been running for recent PRs** (e.g. #444, #445, #447,
#448) — they merged on the Vercel check alone, because a workflow that fails to parse produces
no `static`/`smoke` check-runs for `gh pr checks` to wait on. Introduced by the Tap-to-start
step (#430 / `081a7b2`).

The fix is the minimum that restores the file: quote the step name on line 396. Validated with a
full YAML parse. This also lets **this PR's** `pull_request` run actually execute (a PR runs the
workflow from its own head), so `static` + `smoke` genuinely gate this merge below.

## What was broken (the game fix)

Lemmings `assign()` refused a second skill only by checking the lemming's *current state*.
That is not enough for the two skills that are permanent: a climber that has **crested a wall**
(or a digger that has **tunneled through**) is back in `'walk'` but still carries its flag.
Re-pressing its skill then passed the state check, silently **burned a supply**, and set the flag
again (a no-op) — exactly the reported "Space pressed a few times on the clump spent all 6
climbers, one lemming climbed, and the level could no longer be won."

On THE SPIRE that is a hard fail: six CLIMBER charges are the whole solution, so one clump of
accidental re-grants drains them all and the level becomes mathematically lost. The original
Lemmings refuses to hand a climber the climber skill twice; this restores that rule.

## The fix

`src/games/Lemmings/sim.js` — `assign()` now refuses to re-grant a skill the lemming already
carries, on top of the existing state checks:

- `climb`: refuse if already climbing **or** `L.climber` is set.
- `dig`: refuse if not walking **or** `L.digger` is set.

Both skills are permanent (the flag is only reset on spawn/death), so a second grant is always a
waste. The greedy solver already only ever offered `climb`/`dig` to lemmings without the flag
(`candidates()`), so this changes no scripted/attract path — it only closes the hole a human
(autotap, or the recorded-command path) can fall into.

## The check that now catches it

`scripts/lemcheck.mjs` — a new RULE PINS block (Node, part of the `static` gate):
- grant CLIMBER once (costs one), then re-grant to the same lemming → must be refused, supply held;
- a walking lemming carrying `digger` refuses a second DIG, supply held.

Mutant-proven: reverting the guard turns **exactly those two pins red** (45 -> 43/45); with the
fix all 45/45 pass, and the full audit (solvability, the slack rule, determinism replay, the
other rule pins, and the 4 CFG mutations) is green.

## Scope note (refs, not closes)

This is item 2 of #422's first-time-player pass, and the highest-severity item (a confirmed
blocker). Item 1 (the invisible stick zone swallowing left-half clicks) was already resolved by
the one-pad pilot #420 — Lemmings is now a `pointer` method and renders no left control. Items 3-5
(skill-bar overlap, lemming markers, attract/HUD readability) are polish and remain for a follow-up.

Refs #422
