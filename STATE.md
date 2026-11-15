# STATE — session 295 (2026-11-15, slot a)

## Playable now / what shipped
- **EXCITEBIKE: the league turns solid (#2391 → PR #2397, merge `9c98619`).**
  Never-dry stage (#1571): weakestStage tied EXCITEBIKE/ARCHERY at 3;
  Archery's only unowned gap is check-only (#1571 excludes), so the stage
  fell to Excitebike README gap 0 — bike-vs-bike contact. New `contact(g)`
  law in sim.js: **wrecks are SOLID** (ground speed > `wreckV` on a downed
  rider = wipeout `why:'wreck'`, slower = held, never a ride-through),
  closing ≥ `contactBump` onto a riding back **bumps** with two-way momentum
  transfer (`contactSwap`, striker pays; > `contactCrash` = over the bars
  `why:'contact'`), a rival catching your back at racing speed (player
  v>1.0) **jolts** (v×0.55 swerve + shove), crossing a body with ≥
  `contactClear` air pays a once-per-pass **FLYBY** 150 pts. One drama per
  pair (`contactCool`). Shell: flyby/bump/jolt/WRECK! toasts + dust +
  shake, bobbing amber hazard chevron over downed riders. Live:
  jalfern.com/retrogames/excitebike (marker `why==="wreck"` in
  `index-ROUD9dcR.js`, prod verified; Vercel success on 9c98619).
- **Two real bug fixes found building it:** (1) remount pitch=0 re-crashed
  'forward' forever on steep whoop faces (latent since #2384 — only
  reachable once wrecks got solid; recover now seats pitch on the ground
  slope); (2) the planner braked to a stop before crash scenes — horizon
  now stretches past a downed rider's remount + coast candidate +
  delayed-hop sweep, so the autopilot FLYBYS wrecks byte-exact in attract.
- Gates: `excitecheck` 83→**103** (CONTACT section: exact campaign
  receipts — MOTOCROSS flyby of all 5 rivals, first over SONJA's wreck
  t553; 8 synthetic rigs pin ticks/px/names; one-drama-per-pair law) +
  **139/139 --mutate**, 6 new mutants all die. `exciteplay` 23→**32**
  (real-gas into wreck = wipeout+toast, real-SPACE hop pays flyby, chevron
  pixels, attract replays SONJA@t553 receipt tick-for-tick). attractcheck
  694, contractcheck 724, lint mario/fps/ai + eslint + build green.
- CRASH LEAGUE receipts moved honestly in-PR: t818 bump phases IVAN into a
  CLEAN lap-2 landing at the MOTOCROSS lip (old t1908 receipt retired);
  SONJA keeps both terrain-fixed lip receipts; SUPERCROSS unchanged.
- Rule 4: game code shipped. Polish-pass delta added to **#2387** (contact
  stage marked landed; 5 fresh juice asks).

## Ladder (this session's path)
- Warden target **#2388** REFUSED at claim — slot b live on it (it shipped as
  their #2393 mid-shift). Clean ladder: no steer, `next` #1711 Jon-side only
  (jonq **#2305** AWAITING, deadline 11-17, default hold), game-queue empty,
  QA MASTER live ×2 → feedback borrow blocked, flagshipStage null.
- Never-dry: `weakestStage` fresh — tie at 3 → tie-break target (Archery)
  only offers a check-only gap → took next candidate EXCITEBIKE gap 0, filed
  POLISH #2391 with why-weakest line, claimed, shipped. Note: `idle-kick`
  said "KICK ARENA ARCHERY 0 weak" — the kick names the game, the RULE names
  what counts; verify the gap is gameplay before building.

## Red main during merge (#2176)
- Merge blocked: nightly 43729749985 red (watchcheck TIDYBOT pin vs
  post-#2251 source shape). Parallel lane shipped the fix **#2396** while I
  waited; queued dup nightly was cancelled; main-ok cleared; merged normally.
  No quarantine needed.

## BOARD at exit
- building: none from here. building-qa: #2363 (BombDefuse), #2353
  (Britannia audit) — re-derive fresh.
- game-queue: empty. `next`: #1711 (Jon-side only).
- feedback (unclaimed): #2387 (Excitebike polish — updated by me), #2395
  (Comet walls, slot b), #2385 (Archery heat), #2383 (Sonar), #2381
  (lane:qa), #2379, #2374, #2359 + #2353–#2356 (owned audit notes).
- jonq open: **#2305** (lane:platform, AWAITING — not ours to wait on).

## Next (slot a or b, in order)
1. Ladder as usual. If never-dry: `weakestStage` FRESH — don't copy numbers.
   Excitebike now keeps the EDIT TRACK gap (big, multi-PR) + rival-vs-rival
   league half (both stagesizeable). Archery keeps its P2-harness gap
   (check-only — a stage there must come from elsewhere in the gap list).
2. If jonq #2305 answers → execute the #2093 relabel chain.
3. QA stacked (#2387/#2395/#2385/#2383) — builder stays queue/never-dry.

## The session's catches
- **One-drama laws need a victim-speed floor.** A parked spectator bike got
  jolted by the whole pack, rewriting live league pace and breaking the
  #2384 spectate pattern; jolt now needs player v>1.0 (racing contact, not
  demolition of a stationary bike).
- **A Playwright `press` can vanish between fixed-timestep ticks** (down+up
  inside one rAF frame). One-shot jumps need `down` + poll + `up`.
- **Prod marker crawling**: zsh byte-mangles UTF-8 chunk bodies even under
  LC_ALL=C — verify with a Node fetch+BFS script, and match the MINIFIED
  literal (`why==="wreck"`), not source spacing; chunk refs include their
  prefix (`index-XXXXXXXX.js`), a bare {8}-char regex fetches 404s.
- **Solid wrecks exposed the planner's short-horizon myopia** — a candidate
  set that can only "hop NOW" can't learn launch timing; a delayed-hop
  sweep (gas k, then hop) is cheap and lands the flyby.

## Hygiene at exit
- Dev server 5173 stopped (own pid only); foreign ports untouched.
- forge/excite-contact worktree removed after merge; branch gone via squash.
  Main checkout detached at origin/main. STATE committed to main (game
  merged — rule 9) + statepark slot a.
- NOTE: a foreign worktree `retrogames-forge-maingreen-ticks` holds branch
  `main` (someone's cleanup owed) — `git checkout main` fails repo-wide
  until its owner removes it; detach-by-SHA works.

## Open questions
- None new. jonq #2305 (lane:platform) AWAITING until 11-17 — not ours.
