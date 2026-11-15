# STATE — session 297 (2026-11-15, slot a)

## Playable now / what shipped
- **BOULDER DASH: slime & bolts — PR #2416 MERGED as `5fc1b73`** (#2411,
  never-dry stage). Prod verified: chunk `index-4MIb1ryI.js` carries it at
  https://jalfern.com/retrogames/boulder-dash.
  - **Amoeba** (Boulder Dash II, 1985): `AMO_HEAD/AMO_BODY` cells + generation
    clock; every `CFG.amoEvery` ticks heads extend along `amoebaDir`, branch
    perpendicular when shut in, DISSOLVE diamonds they touch, engulf the player;
    bodies expire after `CFG.amoGens` generations so the wave advances, never fills.
  - **Push walls**: shove sideways one cell/arrow (BD law — nothing lifts),
    crush a rock in the path (crushed gems are LOST), obey gravity and crush
    under fall. They are the vault: SLIME VAULT's doors sit over pits.
  - **SLIME VAULT (cave 5)**: full-height steel divide, two bolt-and-pit doors,
    boulder choke opened by a crush, dirt-sealed slime pocket eating a bait vein.
    Containment is provable: growth claims only EMPTY/DIAMOND — uncarved DIRT
    is absolute — pinned across the planner win-run.
  - Proof: dashcheck **92/92**, `--mutate` **102/102** (10 mutants incl.
    `amoeba`/`push`/`pushCrush` each reddening a real check); dashplay **31/31**
    real-key drive (vault cracked, wave grown+expired, bolt shoved, boulder
    crushed, restart, zero page errors); mobile lite stick **8/8**;
    watchcheck boulder-dash 320/320; goldentracecheck 56/56 unaffected; lint
    dash/mario/fps/ai + build green. Existing caves' planner routes
    byte-identical (determinism pins) despite the BFS push-door learning.
- QA follow-up filed: **#2417** (slime/bolt readability cues, vault audio,
  sim untouched) — feedback lane.

## Ladder (this session's path)
- Warden target **#2402**: claim said "already yours (resume)" — but a LIVE
  worker was inside it (session 296-a; see catches). Yielded the issue instead
  of racing it; it closed cleanly (#2408/#2410/#2414/#2415, closed).
- Ladder: no steer/next/game-queue; feedback all owned/building-qa; 3 live
  QA MASTER sessions → no borrow; flagship stage spent → `weakestStage` fresh:
  **BOULDER DASH** (score 2, gap #0 "no amoeboid/push walls") → filed #2411
  with the why-weakest line, claimed, shipped. Rule 4 honest: game code merged.

## The session's catches
- **An idle-kick can resurrect a live lane.** Warden judged slot a idle at
  21:33Z and kicked this session — but 296-a was mid-merge on #2402 (its HEAD
  moved between my commands; #2408 merged at 21:39Z). forge-claim cannot
  arbitrate two processes sharing slot letter "a". Behaviour that kept the
  peace: when the target issue shows a *live* worker's fingerprints (moving
  HEAD, new merge commits mid-read), yield it and take the ladder. The warden's
  idle-detector deserves a look (process liveness vs board silence) — no jonq
  (not taste/priority), recorded here + shift notes.
- **Bait gems obey the construction laws too**: unsupported gems over the
  pocket fell and greed-turned to dirt ~tick 2 — long before the wave, silently
  killing the `dissolve` prove. Node gate caught it in seconds; fix = gems ON
  the pocket floor, nothing above (rule 1, learned the sharp way again).
- **Real keys outrun world ticks**: every keydown steps the digger instantly
  (tap = instant move) while the CA ticks at 12 Hz — a win froze the sim with
  the wave mid-life. Full-lifecycle asserts need a no-input observation window
  (reset + watch), not the win-run itself.
- **BSD `cp` has no multi-destination form** — step 1's two-path park template
  fails wholesale on macOS; park with two `cp` calls (slot-scoped first, #1430).
- **Mobile lite has no canvas taps** where VirtualControls' left-half stick
  zone covers (full-height overlay): drive the stick (drag from centre) for
  mobile tests; 8/8.

## BOARD at exit (re-derive fresh)
- building: #1711 (platform lane, Jon-side stages open). building-qa: #2385,
  #2387 at exit — re-derive.
- game-queue: empty again. feedback: + #2417 (mine, QA lane's to take).
- Nightly last run SUCCESS; main green at `5fc1b73`.
- jonq #2305 (lane:platform) AWAITING to 11-17 — not ours.

## Next (slot a or b, in order)
1. Ladder as usual; never-dry → `weakestStage`/`idle.mjs` FRESH, confirm the
   gap is gameplay before building (#2391 lesson stands).
2. Golden traces for a third port game only when Jon names one (#2402 follow-up
   pattern: one adapter + scenarios in goldentrace.mjs).
3. If jonq #2305 answers → the #2093 relabel chain (platform lane).

## Hygiene at exit
- Main checkout detached at `origin/main`; worktree `forge-boulder-amoeba`
  removed; branch deleted; dev server 5173 stopped (mine; foreign ports
  untouched). STATE committed to main — a *game* merged this session (rule 9).
- Parked slot-scoped via `node scripts/statepark.mjs park a`.

## Open questions
- None new. jonq #2305 (lane:platform, `SESSION_WRITE_KEY`) AWAITING to 11-17;
  folded from 296-a's park — nothing evaporated between lanes.
