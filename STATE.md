# STATE — 2026-10-19 (forge: shipped #489 MAGIC CARPET)

## This session (forge lane)
- **Shipped:** #489 MAGIC CARPET (Bullfrog 1994), PR #497 → squash `03796d3`.
  Live: https://jalfern.com/retrogames/magic-carpet (prod bundle
  `index-D5sddOBv.js` verified to contain the game). Issue #489 `shipped`.
- New: `src/games/MagicCarpet/{sim.js,art.js,index.jsx,README.md}` +
  `scripts/carpetcheck.mjs` (+ `carpetcheck` alias, contractcheck entry).
  Registry: `visibility: 'private'` — awaiting Jon's promotion (#379).
- Design (full notes in the game README): first-person voxel carpet flight at
  320×200 with silhouette-clipped sprites; one mana pool — pearls bank into
  the castle on possess, spells SPEND it, 180 banked = EQUILIBRIUM; six
  signature spells in two hands with the original's acquisition risk (20%
  grimoire fizzle, retryable); rival wizard hoards 90 mana and scatters it as
  pearls when slain; carpet banks and auto-rises (cannot crash); death respawns
  at the gates only while the store holds mana. Attract = autopilot's own
  proven flight; synth audio only.
- Harness proof: **carpetcheck 21/21** — boot, state-hash determinism, mana
  conservation identity (`pool+pearls+hoard == start + bounty − cost`), risk
  fires both branches over 40 seeds, no-mana refusal, never-bury, death/respawn
  both ways, hoard scatter, equilibrium seeds 7 + 88, headless-Chrome contract
  pass zero errors. Mutant: win mutated to `QUOTA*100` → exactly the two
  equilibrium checks red; restored.
- `CONTRACT_ONLY=magic-carpet contractcheck` 14/14 (incl. snapshot/restore).
- CI note: `static` failed once — vpadcheck requires a one-line `reason:` on
  dpad opt-outs (fixed in follow-up commit, green second try).
- Filed **#498** `QA — MAGIC CARPET: polish pass` (label `feedback`): water
  shimmer/palette cycle, pearl halo, carpet wake + tassel flutter, day tint
  cycle, self-hex rune overlay, castle spell, throw topples towers, creeping
  fire, wind/ambience audio layers.
- Hygiene: forge worktree re-detached to `origin/main`; dev server on :5173
  left running by this lane — kill or reuse (QA: it is OURS, `npm run dev`).

## Held / open (unchanged)
- **#391** `stalled` — awaiting Jon: close as shipped vs batch 5.
- **#375** Civ parked per Jon. **#443** idle-builder borrow-gate ruling pending.
- game-queue: no new buildable title left after #489 (#496 co-op needs an aim
  stick; #492/#494 are system pilots; #493 is polish-adjacent).
- QA backlog: #481 #478 #472 #470 #462 #440 #426 #423 #421 #422 #409 #410
  #405 #365 #384 + new #498; QA MASTER held #280 during this session
  (no overlap — forge claimed a game-queue item only).
- Rule 4 healthy: last merges are all game code.
- Orphan pushed `forge/*` branches (excitebike, outpost, paperboy, polarity,
  simcity, spec-wins, telemetry, watch, game-first) await Jon/warden sweep.

## GOAL — next session
1. Check labels: if Jon fed `game-queue`, claim the top title per FORGE.
2. Else, if queue empty: borrow per FORGE borrow rules — strongest candidate
   #498 MAGIC CARPET water shimmer (keeps the new game at the ART.md bar)
   unless QA MASTER is mid-#498; otherwise #478 item 0 (`?renderer=webgl`).

## Three questions for Jon
1. MAGIC CARPET is live but `private` — promote to public now, or after #498
   polish lands?
2. Which title goes into `game-queue` next? (#496 Smash TV co-op — forge or
   the pad-system pilot #492 first?)
3. #498 polish: QA lane as usual, or may forge take the water/pearl art items
   while QA stays on #280?
