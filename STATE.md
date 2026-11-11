# STATE — session 211 (2026-11-11, slot a)

## What shipped
**WATCH BATCH 22 — THE QUOTA-CREW FAMILY** merged as `01b4df2` (PR #1957,
Part of #1637). Two titles seat their own harness-proven crew on Y:
- GRAVEL YARD — all three seats run `makeCpuEmitter(0..2)`, the crew
  gravelcheck stamps CLEAN SHIFT with on 8/8 seeds (`simulate(s,3)`). It is
  literally the attract demo's brain swapped into the play tick; unfilled
  seats already ran it, WATCH seats the human digger too.
- SHORT ORDER SHOUT — every seat runs its `makeCpuEmitter`: the cook+runner
  pair soscheck wins 8/8 seeds with (`runEm(s,2)`).
Both re-plan from live state every tick (bfs + stuck-replan → honest
mid-run re-seat), takeover hands back, watch releases at `done`, online
declines (#1656), WATCH_HELP + attract hint + shared pill/toast/blips.
watchcheck pilots 222/222 each (seat/blip/advance/takeover/re-seat/resume/
release + 10 batch-22 source pins incl. both checks' 8/8 witness stamps);
mutant (seat-mount deleted) red on both; soscheck 47/47; watchphonecheck
432/432; lint gates + build green. Prod live: `index-B2yyWpOm.js` carries
"stamps CLEAN SHIFT on every test seed". Live: /retrogames/gravel-yard,
/retrogames/short-order-shout.

## The session's catches
1. **`git stash` is repo-wide, not per-worktree.** A `stash -q` with a clean
   tree is a silent no-op; the matching `stash pop` then applied ANOTHER
   lane's stashed entry (qa/weightsurgery) into this lane's worktree with
   conflicts. Recovery: `git reset --hard <own commit>` — the foreign stash
   entry survives in the list. NEVER stash/pop in a lane worktree; to A/B a
   failure against main, serve `~/Dev/retrogames` detached on a spare port.
2. **watchphonecheck runs in `static` (blocking).** Every registry title
   advertising WATCH must mount an attract `AttractWatchButton` OR be named
   in SKIP_ATTRACT with a reason. Multi-screen boots (title→picker) belong
   in SKIP_ATTRACT (bomb-defuse precedent). Run `npm run watchphonecheck`
   BEFORE opening the PR — the pilots passing locally proved nothing here.
3. gravelcheck's `#1705 lockstep holds` tick-spread (6-9) is a pre-existing
   flake — reproduces identically on clean origin/main under machine load.
   Don't chase it; verify-on-main is the way to prove it's not yours.
4. `gh pr checks` right after `pr create` can fail the poll loop; guard the
   jq with `// "PENDING"`.

## Ladder trail
- halt none; steer none; `next` #1711 hardware-stalled on Jon (audit-confirmed,
  skip per trail); game-queue empty; QA MASTER live → feedback borrow refused;
  warden TARGET #1637 won the claim (b's last liveness 179 min) → batch 22 via
  the bare-title audit (no other reactive-driver title left unseated).
  No jonq (mechanical picks only).
- Audit of the bare registry (was 22): the rest have NO proven driver
  (Pong/Asteroids/DonkeyKong/Centipede/Pitfall/Frogger), seed-tied scripts
  (Metroid `planRun`), below-bar autopilot (FireCrew 8/10), or are DOS/IF
  (Zork II/III, King's Quest, Rogue BFS lives in roguecheck only, Britannia,
  ViperPit) — honest no-guide until a driver ships IN the game.

## Next queued (slot a)
1. Fresh ladder: halt/steer/next/queue games-first, feedback only if no QA
   session is live, else flagship/never-dry via idle.mjs.
2. #1637 b23 candidates: Metroid = honest SCRIPT-replay seat (seed-pinned,
   fresh-run-only, Paperboy-style decline mid-run); Rogue = lift its proven
   BFS out of roguecheck into sim.js and seat it (counts as game code);
   DF/SI are done-closed-to-redesign; don't re-litigate.
3. QA-held items stay theirs (#1915/#1900/#1888/#1871 TMD, #1907 SI/DF,
   #1877 FB, #1923 rail, #1925 carpet, #1950 SmashTV). LodeRunner strata
   shipped by slot b (#1956).

## Notes for the next slot-a session
- :5173 vite is STOPPED (killed at session end); worktree
  `~/Dev/retrogames-forge-watch-b22` detached at origin/main, node_modules
  symlinked — reuse it or open a fresh one, then `npm run dev -- --port 5173
  --strictPort`.
- New-seat checklist that static enforces: WATCH_HELP in controls (flows into
  watchphonecheck + watchcheck census + phone titles), play pill top-anchored
  with `!paused`, attract AttractWatchButton OR SKIP_ATTRACT name, shared
  blips logged via `watchSfx`, DEV probes `watching()/probe()/watchSfx()`,
  pilot + source pins, mutant red proof.
- advance-probe pattern: prover-only signals = what an idle player CANNOT do
  (human-seat machine position, score/delivered/served) — never the sim tick.

## Open questions
- None. (No taste/priority call needed from Jon.)
