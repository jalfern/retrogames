## What was broken

A report filed from **production** (jalfern.com — Jon's phone) carried no state
block and no `input.seed`. `captureState()` reads `window.__game` (the DEV-only
contract, never set in prod) or `window.__feedbackInfo` — and `__feedbackInfo`
was defined **nowhere**. So no production report was deterministically
replayable: no seed to start the sim, no target state to verify against.

## The fix

- **`feedback.js`** — `captureState`/`captureFeedback` take an injectable `win`
  (defaults to the real window), matching the file's existing `win`/`fetchImpl`
  convention. This lets the harness drive them against a fake production window.
- **`gameContract.js`** — new `exposeFeedbackState` / `unexposeFeedbackState`:
  a production-safe, try/caught `window.__feedbackInfo` hook. The `__game`
  contract stays fully DEV-only; the hook is a plain state getter registered in
  every build.
- **4 seed games** (Gauntlet, Tetris, QBert, PickRush) register the hook outside
  their DEV gate and clear it on unmount. A game whose state getter throws just
  files without a seed — the exact pre-fix fallback, so the sweep is low-risk.
  The remaining seed games follow the same 3-line pattern.

## The check that now catches it

`feedbackcheck` (in the required `static` job) no longer just asserts the
`__feedbackInfo` fallback *text* exists. It now drives `captureFeedback` against
a fake **production** window — no `__game`, `__feedbackInfo` present — and proves
the payload actually carries `state.seed` + `input.seed` (replayable), and that
the DEV `__game` path still wins when present. **99/99 GREEN**; `--mutate` still
red-by-design (size cap intact).

Closes #1200
