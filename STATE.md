# STATE — forge session 2026-10-13/14 night (JOUST)

## Shipped this session
- **#209 JOUST MERGED** (PR #215, squash `8015e72`; PR CI green: static + smoke +
  Vercel). **Prod verified live**: https://www.jalfern.com/retrogames/joust serves
  the production bundle — canvas 256x224, 3518 lit px, attract text, zero page errors.
  `/joust`: 1982 Williams lance duel. The law is pinned: **the lower lance always
  loses**, dead-even height kills both. Flap (net -0.067) vs glide (lean slides you
  down your own tilt); momentum + screen wrap; egg chain (touch banks +100, rest 4 s
  hatches the next-stronger rider; Shadow drops nothing); five waves as data — hand
  columns speed up 360→210 ticks, crumble ledges from wave 3; PERFECT wave +1000.
- Node gate `npm run joustcheck` in the static CI: **46/46** — physics literals
  pinned at the source (the tetrischeck lesson applied up front), joust rule all
  three outcomes, egg chain both directions, wrap/hands/lava/crumble, wave ledger
  recomputed event-by-event, autopilot clears waves 1-2 hash-for-hash deterministic,
  egg-blind-pilot proof the hatch chain is live (not dead code).
  Fail-proven: inverting the joust sign → 9 red, restore → green.
- `npm run joustdive` (advisory verify tier, like tetrisplay): real keys only,
  12/12 locally — attract alive, travel/climb, **pixels where the sim says the
  rider is** (probe+read in ONE evaluate — the roundtrip-drift lesson applied),
  three honest lava deaths, GAME OVER, clean restart, 2P, zero page errors.
- QA issue **#216** filed (autopilot all-five-waves, sfx grain, hunting hands,
  joustdive promotion rule).

## Lessons paid for this session
- The lazy-import shortcut bit us: registered `JoustGame` in games.js but forgot
  the GAMES entry — router said "No routes matched /joust" while the dev server
  happily 200'd the SPA fallback. Production smoke (canvas + pixels) is what
  makes a dead route loud, not a 200.
- A `/retrogames/<new-game>` check needs the registry entry AND the canvas lit;
  assert both, in prod shape, before calling a game shipped.
- `/tmp` nohup background servers die between tool calls unless `nohup ... & disown`.
- Worktree hygiene: `/Users/jon/Dev/retrogames-tetris` had **`main` checked out**
  (stale f27417d), which made rule-5 merges fail with "'main' is already used by
  worktree". Detached it this session. The MAIN checkout still sits at ffef879
  with the QA lane's dirty kart files — the worktree-only rule is not holding for
  the QA lane; see question 1.

## Queue state
- game-queue: **#210 Q*BERT** is head. Next session claims it.

## Harness commands (new this session)
- `npm run joustcheck` (static gate), `npm run joustdive` (manual verify;
  `JOUST_URL=` override for non-5173 ports), `npm run lint:joust`.
- Worktree `~/Dev/retrogames-joust` merged; remote branch deleted. Local branch
  prune pending whenever that worktree is removed.

## Housekeeping noticed (not this session's work)
- QA lane appears to edit the MAIN checkout (dirty `scripts/kartplay.mjs`,
  `src/games/MarioKart/index.jsx`, pid 18524 at session start). That is exactly
  what the worktree-only rule forbids, and its tetris worktree held `main`
  checked out all night — that combination will silently break the next merge.
- `walkabout` / other lanes: `/Users/jon/Dev/retrogames-kart`, `-noder`,
  `-papers`, `-qa-kart199`, `-qa-sentinel`, `-simcity`, `-zelda` all still exist;
  most are merged or stale — a `git worktree prune` pass would help the warden.

## Three questions for Jon
1. The QA lane edited the main checkout all night and left a worktree holding
   `main` — rule-5 merges failed because of it (I detached the stale one). Should
   the warden enforce "main checkout detached + clean" as a preflight kick
   condition?
2. JOUST's autopilot wins waves 1-2 then dies in the wave-3 swarm, so the attract
   demo loops those. Fine as shipped (it's a *proven* run), or should the demo
   show a wave-4/5 clip even if the pilot can't reach it honestly yet?
3. `joustdive` is in the advisory tier. Same policy as tetrisplay: promote into
   `static` only after ~5 green manual verify runs — or is there a CDP-stability
   number you want the smoke jobs held to instead?
