# STATE — forge lanes (2026-11-21, slot b close-out)

## HEADLINE
**R-TYPE is COMPLETE.** S4 — the second pilot (co-op) shipped: PR #2838 →
main `59483e0`. Simultaneous co-op per R-Type II (Irem 1989): blue R7 wingman
with a deterministic brain (zero rng draws), keyboard drop-in (WASD+F fire, G
pod, V relief), independent pools (3 lives each), one hit kills one hull, GAME
OVER only when both burn; decoy law (Bydo pick the nearer hull); capsule seats
one. Solo streams byte-identical (`gs.wing === null`). rtypecheck **113/113**
(my 23 laws folded over QA's six from #2836), mutants 4/4 named red
(`pool-blind` new), contractcheck 769/769. Co-op 12/12 seeds vs solo floor
5/12. Production alias was still flipping at close (Vercel green on `59483e0`,
jalfern HTML cache lagging) — poller log: shell sh_1fc1014c800152.

## Lanes
- **b (this lane)**: shipped #2808. Worktree reaped post-merge; main checkout
  detached at `06e6806` (CONTRA #2840 landed after mine). 5178 free.
- **a**: shipped DD S4 (#2830, closed #2807), then CONTRA seat ceremony
  (#2840 → `06e6806`). Active elsewhere.
- Both R-TYPE and Double Dragon commissions (#2795 family) are DONE.

## Board
- #2808 closed shipped (all 4 stages). #2807 closed shipped (a).
- QA queue: #2831 done (#2836), new **#2841** — R-TYPE S4 polish (wing AI
  depth: capsule/vent chasing, auto pod-deploy, shell hand-off, dark-seat
  rescue; join-UX readability; co-op-too-generous check — tune `wingBrain`
  fire discipline before enemy HP).
- Filed **#2839** (harness bug): claim-status.mjs liveness regex only matches
  `**BUILD checkpoint` lines, missing the prevailing `FORGE (<slot>): checkpoint
  —` format — the lock silently never applied; near-miss double-build on #2807
  this session (b yielded; a shipped). One-line widen + test proposed.

## Playable now (https://jalfern.com/retrogames/)
- **R-TYPE** — /retrogames/r-type: S1–S4 incl. co-op. Solo play stays solo;
  a second pilot joins live at any time with WASD/F/G/V (V relieves).
- Double Dragon arcade — /retrogames/double-dragon (AI partner + drop-in).
- Contra (seat ceremony), Arena Archery, Breakout, Galaga, Invaders, Asteroids,
  Joust, Frogger, Pac-Man, Spy Hunter, Rampage, Bubble Bobble, Excitebike,
  Boulderdash, Lode Runner, Mario, Donkey Kong, Bulky Mario, Princes,
  Minesweeper, MTA, Iron Keep, DOS/IF shelf.

## Harness
- rtypecheck 113 laws; two flakes fixed this session (station law sampled only
  while P1 alive; KeyG/pod law retries press while the fixture arms liveWing).
- Rebase lesson: QA's `q.y += q.vy` drift silently NaN'd wing shots until wing
  fire stamped vy/wy/hx — the 113-law re-run is what caught it. Rebases over
  same-file merges need the FULL gate, not just lint.
- mutateguard ran clean; no commits while `.mutant-running` existed.

## Open questions for Jon
- None filed (rule 7): design choices followed the original directly; the one
  taste call (co-op generosity) is in QA's hands via #2841 with a stated knob.

## Notes
- PR-number collisions with the QA lane happened twice-ish (#2836 phantom
  create); passing explicit PR numbers to `gh pr checks/merge` is stable and
  stays in the merge loop.
- Rule-5 merge used with explicit PR number; `static` was the only wait.
