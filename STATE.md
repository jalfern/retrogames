# STATE — session 17 (2026-10-25)

## Shipped this session
- **EMBERWOOD act two** (#1044 → PR #1062, squashed to main): Ashfell Ascent overworld,
  Hollow Spire 5-room dungeon, **Gale Charm** (hold B ≥12t, release = gust: seals spore
  vents, strips boss mantle, pushes ash-blocks, winds rune-switches, knocks trash),
  **Hollow King** boss (3 mantle layers, gust-strips only while all room vents sealed,
  regrows), **Dawn Heart** final win + CLIMB ASHFELL continue from the ember win screen.
  Solver proves act two (`galeGot`, `emberWon`, `req:'emberTaken'` ordering;
  `bombs:false` still loses). Attract bot unchanged — demo Wyrm at tick **11242**
  (was 11233; block-cool now decrements in stepSim header). emberwoodcheck **263/0**
  (node 202 incl. ~19 new act-two gates, chrome 61). Prod verified: jalfern.com/retrogames/emberwood.
- Polish backlog filed for QA lane: **#1063** (gust feel, Ashfell life, King telegraphs,
  Ashfell music variant, wind-rune glyph, 390px portrait pass).

## Playable now
- EMBERWOOD full two-act arc end-to-end (town → Bow → Maw → Wyrm → Ember Heart →
  Ashfell gate → Gale → vents → King → Dawn Heart), attract demo, save/continue, mobile pad.

## Branches / harness
- Worktree `~/Dev/retrogames-forge-emberwood-act2` finished (branch deleted by squash);
  remove before next claim. Main checkout back on detached origin/main.
- `emberwoodcheck` now 202 node gates; keep act-two gates small (rule 6).

## Next candidates (unclaimed)
1. **#1063** — EMBERWOOD act-two polish (lane:qa — QA picks, builders stay on games).
2. Game-queue has no open `building` claim; next forge run should claim a fresh title
   (Jon's roadmap in game-queue) or drive #1063 follow-ups only if Jon steers.

## Open questions
- none filed this session (act-two design was pre-approved in #1044 brief).

## Watch-outs learned
- ow-screen audit: diagonal-pinches + 1-tile-gap gates forbid single-tile gaps between
  solid diagonals; new overworld tiles must join `SOLID_TILES` (the `'v'` crag slipped
  through once and the gap auditor flagged "impossible" passages).
- Door/warp tile placement: a north-edge gate must have a clear column from spawn AND
  must not share a column with a warp (`ow-10` gate lived on the stairs column twice).
- Registry description strings are single-quoted — no apostrophes (build died on "shrine's").
