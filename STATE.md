# STATE — session 27 (2026-10-26)

## Shipped this session
- **PLATFORM text-fit (#1099 → PR #1108, squashed to main as 53061c5)**: help,
  title and caption text no longer overflows, clips or hides chrome/pad on any
  game or demo. Live at jalfern.com/retrogames once Vercel finishes the merge.
  - **One shared mechanism**: `src/utils/textFit.js` `packPages` (unit-tested)
    packs content blocks into viewport-fitting pages. `PauseOverlay` (all ~72
    games) now paginates on short screens — thumb-sized ‹ › pager + swipe +
    arrow keys, pinned RESUME, `data-help-fit=single|paged`; desktop keeps the
    single column.
  - MAGIC CARPET (4-line) + CIVILIZATION (3-line) attract rule-walls replaced
    by the shared `<AttractMessage>` cycle (ART.md rule 6, one line at a time).
  - `credits.js` caption-fit for every demo: badge-column reserve (#1078) kept,
    then px-tighten, then viewport clamp.
  - Phone-only chrome nudges: Lemmings / LodeRunnerLite / Wizardry /
    PapersPleaseMin / SuperMarioClassic / Polarity HUD and title rows moved
    below the ARCADE/PAUSE/FEEDBACK band.
  - **New gate `npm run textfitcheck`** (225/225): every registry game + every
    demo at 390x844 / 844x390 / 1280x800 — attract/help/caption bounds vs the
    viewport, visible pad controls and corner chrome (chrome rule = phones;
    desktop chrome floats by design, #437), WIN proves real paging.
    Proven-fail: always-single mutant -> WIN red (header documents it).
  - lint gates + build green.

## Playable now
- Every title: '?' on a landscape phone now pages through CONTROLS instead of
  cutting them off; MAGIC CARPET / CIV titles cycle one rule line at a time.

## Branches / harness
- `forge/help-text-fit` deleted by squash. Worktree `~/Dev/retrogames-forge-help-text-fit`
  removable (node_modules symlinked to the main checkout). My dev server:
  kill pid in /tmp/forge/dev-5175.log when done.
- QA filed: **#1109** text-fit polish pass (pager dots/hint + flip cue, custom
  overlays, landscape attract line width, demo clamp whole-word drops, CI).
- Queue: empty (game-queue). Next idle per #841: flagship polish stage
  (SSX, Emberwood, COMET DRIFT HD, Myst — oldest unowned README gap).

## Lessons learned
- Help overlays mount only AFTER play starts — a harness must send a start
  gesture before '?' or it audits nothing (WIN was silently unwinnable).
- The pad's invisible stick layer is full-screen; overlap checks must target
  visible controls only ([data-vc=dpad/diag/fixedstick/button]).
- Corner chrome covers game art BY DESIGN on desktop (#437) — enforce chrome
  overlap only on phone viewports or half the arcade "fails".
- js-dos/ifvms arms crash headless Chrome under 3 concurrent WebGL contexts
  and print their own banner text — skip emulator dirs (use named imports too,
  `import { ZorkI } from '../games/Zork'`); doscheck owns that arm.
- The FEEDBACK button sits at 44..~74px: phone HUD rows need top-20, not top-14.

## Open questions
- none filed this session.
