# STATE — session 124 (2026-11-04, slot a)

## What shipped
**SEEDPIN b21+b22 MERGED** — `741e2e9` via PR #1550. Emulator tier reports seedless:
- DosShell.jsx (shared by Ultima I–V) reports `{tick, score:0, done:false}` while
  mounted, un-exposes on cleanup. tick = elapsed frames (rAF), zeros are honest
  unknowns (js-dos game memory is unreadable) — never fake seeds.
- KingsQuest + Zork carry the same shape in their hand-rolled mounts
  (own key/pixel seams / story VM without canvas resp.).
- feedbackcheck +4 laws: `dos:` report-shape+cleanup ×3; seedless scan now
  resolves the DosShell import; seedless floor 21→**28**.
- Mutant proof: fake `seed:0` in DosShell killed dos law + floor (225/227 RED), restored green.
- Gates: feedbackcheck 227/227, zorkcheck 58/58, aicheck 24/24, lint:mario/fps/ai,
  eslint clean, build green. Prod verified: entry `index-DJeNIW1h.js` carries all
  three `score:0,done:!1` reports; /ultima1 /ultima5 /kingsquest /zork 200.

## Rollout status (#1473) — INVENTORY FACT (this session's audit)
**All 83 game dirs now call exposeFeedbackState — zero non-reporters.**
Law accounting: 55 report+pin seeds (floor 55), 28 seedless (floor 28). The issue's
"~78 titles" is satisfied. Remaining work is TIGHTENING, not coverage:
- 13 titles' reports don't match the strict `() => ({` shape law (block-body or
  sibling-module reports: BlobBattle, CometDrift, CometDriftHD, FireCrew,
  GardenGuard, GravelYard, Homebody, IronRing, PickRush, Rogue, ShortOrderShout,
  TalkMeDown, ViperPit). They land in the seed-count via the loose seed regex —
  next batch: normalize shapes (or widen the law honestly + prove each pin) so
  every title is covered by an exact-shape law, then a total-coverage floor law
  `reporters === dirs`.

## Board (end of session)
- #1473 open (building, lane:platform) — multi-stage; b23 = shape-normalization above.
- No halt/steer/next/game-queue/feedback issues; no jonq AWAITING; no building-qa.
- main tip `741e2e9`, main-ok true at exit. Slot-a port 5173 freed.
- b21/b22 worktree removed; main checkout detached at tip, clean.

## ENV (carry-forward)
- `. /tmp/forge/env.sh` for gh (shim `/tmp/forge/gh`).
- Push via `-c http.proxy=http://127.0.0.1:18080`; force-with-lease OK on own forge branches.
- Prod verify: webfetch for index.html (rescue proxy caches jalfern HTML); hashed
  assets fetch fine via node fetch through the shim (curl -x returns "Redirecting...").
- Chrome still dead (#737 EPERM at launch) — browser tier advisory; static laws are the gate.
- pgrep broken (use `ps -ax`); kill dev server via `lsof -ti :5173`.
- `gh pr checks <N>` needs explicit PR number in worktrees; `static=null` until reported — merge loop tolerates.
- Worktrees: many stale `retrogames-forge-*` dirs exist; `git worktree list` before adding.

## Open questions
- (none open — no jonq filed)
