# STATE — session 187 (2026-11-09, slot a)

## What shipped
**WATCH batch 12 — BOMB DEFUSE seats its solver (#1637 via PR #1855, squash
`3ea1708`) — LIVE.** Entry bundle `index-CNDjIeFK.js` carries the batch-12
registry copy. Live: https://jalfern.com/retrogames/bomb-defuse — Y (or the
pill) hands BOTH seats to `solvePads` (engine.js), the two-hand crew defusecheck
wins 40/40 seeds with (20/20 with 10 s less fuse). Reactive solver — every
action verified against live integer state, so mid-run re-seat is honest from
any position (no off-the-bench family). Any ordinary key takes back your hand
(solo → engine partner covers seat 2); online no-ops the seat (#1656 law).
Coverage 49 → 50 WATCH titles.
Mutant proof: seat supply disabled → both advance legs RED (score 0, fuse→0).
Gates at `3ea1708`: watchcheck pilot 156/156 live, defusecheck 53,
defuselinkcheck 73, contractcheck 14 (CONTRACT_ONLY), watchphonecheck 353,
lint:mario/fps/ai + build green. bombdrive 38/40 — the 2 fails (voice-verb
strike + red flinch) reproduce identically on origin/main code → pre-existing
flakes, not batch-12 regressions (rule 3: rerun once, move on).

## Board at session end
- `building`: #1637 (WATCH rollout) — stays open, multi-stage ("Part of").
  Slots may claim it again for batch 13; claim liveness decides the taker.
- `next`: #1711 (PLAICRAFT S1 phone recordings) — halts #1852/#1840 were both
  closed at this session's start; #1711 is the top ladder rung for the next
  lane unless the warden assigns otherwise. It is slot b's lineage — read its
  claims/comments first.
- `game-queue`: empty. `steer`: none. `halt`: none. jonq games: none open
  (#1730 sweep-defaulted "Hold; stage 2 continues" — closed).

## Batch 13 candidates (triage notes, #1637)
- SpaceInvaders: attract autopilot has NO Node win proof → honest no-guide;
  a batch may grow its sim a solvePads-style solver first, then seat it.
- Unseated solve hooks remain: CometDriftHD, FireCrew, Minesweeper — check
  whether their checks grade a per-tick brain (then the seat is cheap) or a
  replay-only artifact (then grow a driver first).
- DEFENDER + PAC-MAN "no guide yet" verdicts stand as designed.

## Notes for the next slot-a session
- Dev server still RUNNING on 5173 from worktree
  `~/Dev/retrogames-forge-watch-rollout-b12` (detached `3ea1708`, node_modules
  symlinked): `git checkout -B forge/<newslug> origin/main` to reuse, or stop
  and restart fresh: `npm run dev -- --port 5173 --strictPort`.
- Vite watcher misses writes here: restart the server before browser gates
  after big edits. `nohup` broken; background via `(cmd >log 2>&1 &)`.
- Main checkout `~/Dev/retrogames`: clean, detached `3ea1708` (origin/main).
- The WATCH factory (per-title recipe): seat at the play tick + takeover +
  re-seat + auto-release-at-done + blips + attract hint + pill + registry
  WATCH_HELP + watchcheck pilot + source pins + (SKIP_ATTRACT if multi-screen
  boot) + tripwire bump. Batch 12 index.jsx edits are the freshest reference.
- bombdrive voice-verb legs are flaky on this box (baseline main too) — don't
  chase them; prove non-regression against main-baseline and move on.

## Open questions
- None open on lane:games.
