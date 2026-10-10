# STATE.md — 2026-10-09 (Lemmings session end)

## Where things stand
**LEMMINGS-LITE is LIVE at jalfern.com/retrogames/lemmings** (#65, PR #93,
squash 2897766). Second forged game, 18th title. A stream of mindless lemmings
walks out of a cave; you assign BLOCKER / BOMBER / CLIMBER / DIGGER to the
nearest one and the physics does the rest. Four hand-carved levels, each
*proven* solvable (and each skill proven load-bearing) by a greedy solver that
also drives the attract mode.

| since last STATE | what |
|---|---|
| #65 / PR #93 | **LEMMINGS-LITE shipped** — sim → levels → solver → shell → Node gate + mutation harness → real-key Chrome play → merge → prod verify, one session |

## The loop in one breath
launchd → `scripts/forge.sh` → `opencode run` → claim (`next` > oldest
`game-queue`) → build per AGENTS.md → harness that provably fails → real-input
Chrome play → merge ONLY via
`gh pr checks --watch --fail-fast && gh pr merge --squash --delete-branch` →
verify prod bundle → relabel `shipped` + comment URL → rewrite this file.
Warden ticks every 30 min triage unlabelled requests and kick idle builders.

## What's playable NOW
18 playable titles + 9 emulated classics at jalfern.com/retrogames, plus
`/forge`. Queue heads (oldest first): **#66 Boulder Dash → #67–#79 → #82
BensMagicBugLife** (`gh issue list --label game-queue`).

## What LEMMINGS-LITE is, in one line
`src/games/Lemmings/{sim.js, levels.js, index.jsx}`: pure-Node sim (walk/
fall/climb/dig/block/corpse machines, body-solid traffic, x-quantized wall
contacts) + the solver + a canvas shell; `npm run lemcheck` is the CI gate —
35 checks: the solver clears every level with its own supply AND loses when a
load-bearing skill (`proves:` in levels.js) is removed; rule pins; replay
determinism + tamper sensitivity; `--mutate` re-breaks 4 rules and all go
red. `npm run lemplay` is Chrome with real keys only — 19/19: hover-aims the
cursor, assigns the solver's hints via Digit+Space, three riders reach the
exit, HUD == sim, ledger, pause, restart, zero errors. New CI steps:
`lint:lem` + `lemcheck`.

## Flags for Jon (hard-won, cheap to read)
- **Three "game bugs" this session were driver bugs, twice.** lemplay's first
  red was `press('Question')` — not a real key (real `?` = `Shift+Slash`,
  `e.code` 'Slash'; the shell already normalized it, the harness didn't).
  Second red: hint re-targeting — the solver plan has absolute ticks, so the
  driver re-assigned the same lemming four times and blamed the exit. AGENTS'
  "harness must be able to fail" cuts both ways: it must also be able to fail
  *on itself* before you change the game. Both fixes were in the harness;
  zero sim lines changed after the physics proved right in a live trace.
- **#81 was merged but still open** (PR #92 missed the `Closes` keyword) —
  closed it now. Worth: the FORGE merge step should close the issue itself
  rather than trust the PR body keyword.
- Streak check (AGENTS #4): last two PRs both changed `src/games/**`
  (#92 Beezee, #93 Lemmings). Streak clean.
- Dev server stopped; tree clean; `origin/main` = 2897766.

## Three questions for Jon
1. L1 (THE SPIRE) is climb-only teaching; a player with all four skills has to
   pick. Want a visible "skill needed" flicker in the HUD after two deaths at
   the same obstacle, or keep the game silent and let the ledger's SCORE talk?
2. L1's need is 4-of-9 and the solver ships exactly 4 climbers — a brute-force
   player can beat it with 4 lucky assigns but not fewer. Make `need` visible
   earlier (it is in the HUD as 0/4) or hide the quota so levels feel less
   graded?
3. #66 Boulder Dash is the next queue head and wants falling boulders + a
   pushable player — same agent-per-entity muscle Lemmings just grew. Keep it
   the next forge target, or take #77 Lode Runner (simpler sim, existing
   game-feel debt) first?
