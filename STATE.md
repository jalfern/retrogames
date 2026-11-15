# STATE — session 293 (2026-11-15, slot a)

## Playable now / what shipped
- **EXCITEBIKE: the crash league (#2384 → PR #2386, merge `c67dcb9`).** Rivals
  are riding bodies, not ghosts (`rivalTick`, sim.js): the pace line is a speed
  TARGET (`rivalEaseV`), crests/whoops separate them via the same always-ballistic
  law the player uses (~32px apex on the MOTOCROSS jump), and landings obey the
  PLAYER's nose-vs-slope law in a skill-scaled window `landFwd/landBack ×
  (0.72+0.4·skill)`. In-air stabilisation steers toward a STALE terrain read —
  lag = `14·(1.05−skill)` ticks — so the tail misjudges the rising ground after
  the ramps. Wipeout = 110 ticks frozen distance + slow remount + 200-tick
  "learned the section" cooldown; leaderboard churns live (SONJA loses rank to
  IVAN while walking it back). Skill tiers MARIO 1.00 → IVAN 0.52. Player
  physics untouched — attract replays/campaign/slack byte-safe. Shell: rivals
  draw airborne (pitch-rotated) and down (nose-in-dirt flicker), `rcrash/rup`
  events → thud + dust + shake + `SONJA DOWN!` in-frame. Live:
  jalfern.com/retrogames/excitebike (marker `rivalDown` in
  `assets/index-BAFAgGUW.js`, Vercel commit-status success on `c67dcb9`).
- Gates: `excitecheck` 83→107 (CRASH LEAGUE: exact receipts — MOTOCROSS
  SONJA t480 x1367, IVAN t1908 + SONJA t1951 lap-2 lip brawl; SUPERCROSS IVAN
  t502/t2048 — top-three-clean tiers, same-lap same-x determinism, remount-
  before-flag, ≥150px widening per wreck, rank churn) + 3 named mutants die
  (`rivalDown:0`, `rivalTolMul:9`, `rivalTolMul:0.2`). `exciteplay` 23→27 real
  keys zero page errors (park-at-the-lip spectates the crash in-tab, toast
  painted). lint mario/fps/ai + eslint + build green.
- Rule 4: game code shipped. QA polish pass filed: **#2387** (feedback).

## Ladder (this session's path)
- Warden target **#2377** REFUSED at claim — slot b live on it (38 min, liveness
  ns worked; it shipped as their #2380 while I built). Clean skip.
- No steer; `next` #1711 Jon-side only (jonq **#2305** AWAITING, deadline 11-17,
  default hold); game-queue empty; QA MASTER live ×3 → feedback borrow blocked;
  flagshipStage null (all flagship gaps 0).
- Never-dry: `weakestStage` fresh — **EXCITEBIKE score 2** (both README gaps
  unowned, 0 QA naming it; first registry-order among score-2). Filed POLISH
  #2384 with why-weakest, claimed, shipped gap index 0.

## BOARD at exit
- building: NONE. building-qa: #2374 (BoulderDash), #2363 (BombDefuse),
  #2353 (Britannia audit).
- game-queue: empty. `next`: #1711 (Jon-side only).
- feedback (unclaimed): #2387 (Excitebike polish — mine), #2385 (Archery heat,
  slot b), #2383 (Sonar), #2381 (Archery harness timing, lane:qa),
  #2379 (MissileBattle), #2359/#2353–#2356 (audit notes; #2353 still owes the
  README reword when anyone touches Britannia).
- jonq open: **#2305** (lane:platform, AWAITING — not ours to wait on).

## Next (slot a or b, in order)
1. Ladder as usual. If never-dry again: run `weakestStage` fresh — don't copy.
   Excitebike now keeps one gap (6-track EDIT TRACK menu — big stage, multi-PR
   sized). Archery keeps its 2P P2 harness gap (slot b's note) unless #2381/
   #2385 own it.
2. If jonq #2305 answers → execute the #2093 relabel chain.
3. QA is stacked (#2387/#2385/#2383/#2381/#2379) — builder stays on
   queue/never-dry; don't borrow while QA MASTER processes.
4. If you retune Excitebike levels.js, the CRASH LEAGUE receipts (exact
   ticks/names) move — update pins in the same PR, don't relax them.

## The session's catches
- **Convergent auto-ease stabilises everyone — emergent crashes needed stale
  eyes.** Lookahead-depth and tolerance-window variants both landed every jump
  (err ≤0.25). The differentiator that works: riders steer toward what the
  terrain read like `lag·v` px back; lag scales with (1.05−skill). Measure the
  err distribution before picking the knob — three param guesses died quietly.
- **Event-visibility gates must mirror the draw gate.** Player is pinned at
  screen column 84, view is (-20, W+20) → a rival event at lap-x e is "in
  frame" iff `dd = wrap(e.x − gs.x)` ∈ (-104, W−64). My first gate (dd<W)
  missed SONJA's wreck by 25px — state checks passed while the toast never
  fired. Spectator parking spot matters too: x=1200 (near-zero slope reading
  holds v=0 uphill no-gas), not 1150.
- **Mutant knobs belong in CFG, probes in constants**: `rivalTolMul` exists only
  so the crash law is killable; probes check literal px/ticks/names, never read
  back a CFG they mutate (slot b's folded-in lesson, applied here).
- PR `Closes #n` auto-closed #2384 before my manual close — labels still needed
  the manual `building→shipped` swap.

## Hygiene at exit
- Dev server 5173 stopped (own pid only); foreign ports untouched (5178 is b's).
- forge/rival-crash worktree removed; branch gone via squash. Main checkout
  detached at origin/main. STATE committed to main (game merged — rule 9) +
  statepark slot a.
