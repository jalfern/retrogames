# /retrogames/research/

AI research write-ups (Jon, 2026-11-04): experiments with local models and small
neural nets, kept apart from `/demos/` because they are findings, not showpieces,
and because the work is not all the forge's.

## Rules

- **Attribution on every page.** Each page carries a byline saying who did the
  work: QWEN (the forge or its RL lane), CLAUDE (in chat with Jon), JON, or a mix.
  The index card repeats it. Never credit the forge for work it didn't do, or the
  other way round.
- **Honest results.** Negative and partial results stay in, with their caveats.
- One self-contained HTML file per page: no libraries, inline CSS/JS/SVG. Links
  to the arcade use absolute `/retrogames/...` paths so they work both on the
  arcade host and when proxied as `jalfern.com/research`.
- Write-ups that already live in `/demos/` (WEIGHT SURGERY, LEARNED WALK) are
  linked from the index, not copied.

## Pages

- `index.html`: the index; card links resolve relative to where it's mounted.
- `handweights.html`: HAND-WRITTEN WEIGHTS (Claude, #1563). A 4480→32→32→3 tanh
  net whose every weight is written by hand, driving the unchanged
  `src/games/Arkanoid/sim.js` (inlined). Built from the lab in
  `~/Dev/weight-lab/arkanoid` on the Studio (`node build.mjs`). DEV hook
  `window.__handweightsTest`.
- `concordance.html`: Concordance on Apple Silicon (Jon + Claude, Oct 30).
  Results from `~/Dev/concordance/TLDR-for-Cyril.md`.
- `lander.html`: Teaching a lander to land (Qwen's RL lane, directed by Jon +
  Claude, Oct 15–19). Source: the "Teaching the Retro Factory's Games to Play"
  doc; private links and partner details left out.
