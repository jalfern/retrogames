# STATE — forge board snapshot (slot a, 2026-11-27 — DK fire oil SHIPPED `fc7b042`)

## This session (slot a) — the drum bites back
- **Claimed the warden's TARGET #3796** (first try, slot a) — DONKEY KONG
  oil-drum flame kill + capture-grab polish → shipped as PR #3811, squash
  `fc7b042`, prod-verified (bundle `index-Y6JXwfZD.js` carries
  `fireballs`/`fireTimer`/`heartU`).
- **Fire law (Wikipedia §Gameplay):** "a life is lost when Mario touches… any
  enemy object" + "destroying objects with a hammer power-up" + "fireballs
  speed up". Drum lights a fireball 7 s into every live board, then one per
  20 s (cap 2): it walks the tower UP the sound ladders (broken baits and the
  barrel-only rung refused), kills through `killPlayer` (same freeze/terminal
  laws), smashes under the hammer for house 100, pays the house obstacle bonus
  jumped/past (identity-keyed witnesses), douses at finale + collapse, never
  lights in attract, defers while the runner stands at the drum. Speed
  escalates per banked lap (0.9 + 0.1/lap, capped 1.3). **All movement is
  dice-free** — kongcheck pins rng-state + barrels byte-identical vs a
  fireless twin, so every seeded floor is untouched. Patrol shape/cadence stay
  named house law in the README (unverifiable in-repo).
- **Capture scene:** `captureScene(captureTimer)` (pure, exported) scripts the
  90-tick grab reach→grab→carry; Pauline's path rides above every rung top
  (old slide crossed the x=100 column mid-air — gate now proves the whole
  path clears ladder geometry); the ape's arm reaches; a heart pops at the
  grab and shatters as he carries her (§Plot).
- **Proof:** kongcheck **217/0** — 17 new assertions (§fire + §capture-scene)
  with every existing floor kept VERBATIM: the 24-seed sweep passes with fire
  live at the inherited zero-death ≥22/24 and caps===0 — NO tolerance added
  anywhere; hazard is rare by design and the seat dodges it (evasion is
  gameplay code in greedy/barrelThreat: arc flames, never step down into a
  climbing flame, stand off mouths about to spill). Manual mutant of the
  kill-box → 4 red → restored green. kongdrive **21/21** real Chrome: live
  burn, live light, live climb ([176,222,1]) with the seat dodging, 0 page
  errors. eslint + mario/fps/ai gates + build green.
- Filed `QA — DONKEY KONG: fire-oil legibility + fairness playtest` (#3815)
  for the human-feel pass (sprite legibility vs the decor flame at phone
  scale, mouth-spill fairness at x=180, synth voices).

## Harness facts paid this session (kept so lanes stop re-paying)
- **`noFuse` now parks the fire clock too** (`fireTimer=MAX, fireballs=[]`) —
  physics rigs are stakes-free by default. Rigs that MEASURE fire use
  `liveFire()` (fuse topped, clock live).
- **Fire-law rigs must hover the runner, not park him** (`park`/`hover` in
  kongcheck): her girder arms the finale (the douse clears the flames you're
  measuring), DK's girder is the barrel spawn, the ground is the fireball's
  first stride. Hover pins at (44,8) every tick.
- **Never `won = won || tick(...)` in harness loops** — short-circuit stops
  the ticking; the bank lands 90 ticks AFTER ev.won.
- **A DEV-hook death consumes a live life** (firekill → respawn → board
  reset); give drive rigs `topLives()` margin before follow-on sections.
- jalfern.com 308s to **www**.jalfern.com — prod-verify greps need `curl -L`.
- parseGaps filters `**CLOSED by #N**` bullets; a design-note written as a
  bare `##` mid-gaps-list SWALLOWS the later gap bullets (structure check:
  run parseGaps after README surgery — this session's did, caught it).

## BOARD facts at close
- main `fc7b042`: today merged #3811 (DK fire, mine) + earlier #3799/#3795/
  #3792/#3790/#3787/#3785/#3781/#3783/#3784. building: #3813 (harness, other
  lane — parseGaps CLOSED-without-by notation). building-qa: none listed now
  (QA shipped #3793/#3794); game-queue: empty. halt/steer: 0.
- idle-kick at close: `KICK DONKEY KONG -1 weak` — every DK gap is QA-owned
  (#3815 owns the playtest); no unowned gap on the shelf for builders.
- jonq: AWAITING #3791 (dry-shelf flagship title, deadline 11-29, default =
  hold shelf), #3516 (Arkanoid rung, deadline today 12:35Z, default = done).
  No new questions filed this session.

## PLAYABLE on main right now
- DONKEY KONG with fire oil: watch the drum crackle a fireball to life, walk
  the ladders up, burn if you dawdle — smash it or arc it for points; run out
  the fuse and the ape takes her with a scripted reach-grab-carry and a
  breaking heart — https://jalfern.com/retrogames/donkeykong
- PINBALL EMBER dress + ghosts (#3799/#3795), MC seat-2 batteries, DK
  walk-past 50, pacmandrive human loop.

## Open questions (links only — #605)
- #3791, #3516, #3244, #2971, #1712 (all AWAITING; none mine this session).

## Next claims (for whoever is free)
1. Builder ladder is honestly dry: game-queue empty, feedback #3815 is
   QA-owned (playtest — the QA lanes are live: mini + studio both seen this
   session), flagship + never-dry stages find no unowned gap (-1 weak DK).
   Re-run idle-kick before inventing a rung; the dry-shelf question #3791 is
   already AWAITING Jon (deadline 11-29) — do not file a second.
2. QA lane: #3815 (fire-oil playtest) is fresh on the feedback pile.
3. #3813 (harness parseGaps fix) is another lane's building item — leave it.

## Slot state at handoff
- :5173 stopped via `scripts/devstop.sh`; no other port touched.
- Worktree `retrogames-forge-dk-flame-kill` pruned after the STATE docs PR;
  its `node_modules` was a symlink (git-ignored, died with the worktree).
- STATE parked via `statepark.mjs park a`; shift report pushed.
- STATE commit to main goes through the docs PR opened with this report
  (game merged this session, so the fold-in is allowed; merge only via
  `scripts/forge-merge.sh`).
