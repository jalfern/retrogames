# STATE — 2026-10-15 (forge session, THE BARD'S TALE shipped)

## Shipped this session
**THE BARD'S TALE** (#293) — PR #306, squash-merged at `b9ee5e0`, live:
https://jalfern.com/retrogames/bards-tale
- First-person RPG rebuilt whole in code (no assets): 6-hero party, five seeded
  dark levels (Wine Cellars → Mangar's Tower) out of a hand-authored Skara Brae.
- Coloured raycast corridors (per-floor palette), overhead town map, fog automap,
  animated procedural monster portraits sized by range band, all sounds synthesized.
- Round-based combat at 10–40 ft bands: spells outrun steel until ADVANCE; Hunter
  bow reaches any band; bard songs on ALE (heal/harden/sharpen/soften/slow).
- Four-letter spell codes (authentic). Temple heals+raises, Garth's arms, Tavern
  ale, Review Board spends skill points + advances mages.
- Tower gate needs the **tower key**, granted by the Board only after all five
  tower floors are proven. Locked floors are sealed keeps with a single door whose
  key hides outside — a real chokepoint, not decoration.
- Gates added to CI `static` (merge gate): `lint:bards` + `bardscheck` → **125/125
  PASS** (no-random · independent-BFS floor audit incl. the door-bar check ·
  engine pins · proven campaign · slack rule · determinism). Advisory `bardsplay`
  11/11, zero page errors. `npm run build` clean.

## GOAL — next session
No explicit goal was set. Claim the oldest open `game-queue` issue and confirm
with Jon before building. Candidates from last board read: **#294 SSX**,
**#296 Prince of Persia** (#295 Civ V is the standing scope-question — likely
not a cabinet title). Open QA items are valid fallbacks if the queue is quiet.
Read `docs/qwen-run-2026-09-postmortem.md` and the FORGE playbooks first.

## Board (last read)
- Queue: #294 SSX, #295 Civ V, #296 PoP.
- Open QA: #304 (MYST), #302 (Gauntlet/FourHalls), #298 (Tempest), #287
  (LunarLander), #283 (OutRun), #280 (SmashTV), #275 (Gauntlet), #270 (SimCity),
  #269/#220 (Kart), #265 (Marble), #263/#258 (Bubble Bobble).
- QA lane lives on `retrogames-qa-258` (dev 5173 theirs); forge dev falls through
  (used 5173 this session, killed on exit). `*play` scripts take URL via env
  (`BARDS_URL=… node scripts/bardsplay.mjs`).

## Notes for whoever picks this up
- Two distinct dungeon crawlers now coexist: Wizardry = green wireframe, 3 floors,
  tight ledger; Bard's Tale = coloured raycast, 5 floors + shops/songs/gate economy.
  Keep them visually and mechanically separate.
- `src/config/games.js` now carries a per-game `pad` field (#305); new entries
  should declare one. BARD'S TALE currently sets `controls` only — wire a `pad` if
  the arcade bridge starts requiring it.
- Locked-door generator is the load-bearing trick for any future "key behind a
  locked door" floor: seal a keep, wall the ring, reopen one door that provably
  disconnects the goal when barred. Copy `dungeons.js` + the bardscheck bar audit.
- The main checkout stayed detached at `origin/main` all session (Jon's rule); the
  build ran in worktree `~/Dev/retrogames-forge-bards-tale` via a symlinked
  `node_modules` to `~/Dev/retrogames/node_modules` (worktrees share no deps).
