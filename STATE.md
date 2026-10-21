# STATE — 2026-10-21 forge pm #3

## Shipped this session
- **#674 CREDITS CARD on every demo → prod** (PR #712 squash `aa966ac`,
  Vercel SUCCESS; live at jalfern.com/retrogames/demos/ — index carries
  per-card built-by lines + factory credit; all four demos serve the
  `DEMO_CREDITS` config + `credits.js` @200).
  - `public/demos/credits.js` = shared injector (template piece): corner tag
    `BUILT BY QWEN ▸` bottom-right → card: model + Mac Studio local, issue
    link, issue→ship span, SOLO vs GUIDED help level + honest note.
  - Per-demo configs: OCEAN #451 (~1 h, guided-lite), SHORE #521+#616
    (~6 h, guided — the canonical brief), CAMPFIRE #670 (~7 h, solo),
    MOUNTAINS #671 (~13 h, solo). Facts sourced from issue wording/repo —
    nothing invented; assist classified from each brief's own text.
  - `public/demos/README.md` = add-a-demo checklist; credits block step 2,
    mandatory. Model/machine live ONLY in credits.js.
  - Harness `npm run creditscheck`: 46 gates (config completeness, index↔demo
    consistency, demos-law, Chrome open/tap/ESC/links). Mutation-proven:
    deleting shore's `issues` line reds 2 gates.

## The lesson of the session
- The perf gate red on mountainscheck again = the box (load ~14), not the
  code: blank-page rAF floor @1600x1000 is median 22.6 / p90 66.8 ms.
  Calibration script trick (/tmp/floor.mjs pattern) beats re-arguing it.
- `#696` looked clear at verify time (fresh index served) — worth confirming
  on the next demos PR before re-filing cache-busting plumbing.

## Next goal
- Oldest game-queue: **#672 Thunderstorm over a field** (lane:demos, carries
  `stalled` — read WHY on the issue before claiming). #635-A default in
  effect (builder takes oldest whatever lane).

## Board / harness status
- main: `aa966ac` (#712). Nightly: last main-ok green pre-merge; #687 freeze
  stayed lifted all session.
- Rule 4 satisfied (demos code merged). Rule 7: no new jonq (no taste calls).
- Polish pass filed: **#713** (QA CREDITS).
- Worktrees to prune (branches merged): forge-* incl. credits-674, mountains;
  stale `origin/forge/ssx-cpu-riders-620` still dangles.

## Open questions (links only, #605)
- #698 demos driver ownership — AWAITING (default: demos queue holds for
  Jon's answer re driver; builder still takes queue items per #635-A).
- #691 land #690 harness-fix exception — AWAITING (lane:qa's call).
- #687 needs-approval; #696/#694 host index staleness — platform lanes'.

## Open threads
- #695 QA CAMPFIRE, #685 QA SSX surfaces, #702/#704 QA SHORE/OCEAN,
  #713 QA CREDITS — QA lane. #611/#609 Ocean stars follow-ups still open
  (unlabeled → not claimable).
