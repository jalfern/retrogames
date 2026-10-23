# STATE — 2026-10-23 forge session (#862 BLOB BATTLE shipped)

## Shipped this session
- **#862 → main (squash, static SUCCESS)** — **#840: BLOB BATTLE**, an original
  head-to-head chain battler (Puyo-Puyo-style, its own name/art/tuning).
  - 6x12 wells x2, orb pairs, 4+ connected pops, cascading **chains**; attack
    = chain-1 + size-extras as grey holed rows; **counter** nullifies queued
    incoming when you clear. First to 2 rounds. Hard drop (the issue's
    Tetris-battle half; noted vs the 1991 original in README).
  - **CPU default** (seeded planner, phone-playable) · **local 2P** (`2` on
    title, P2 WASD+F) · **online 2P** `?net=host`/`?net=join&room=CODE` on the
    reusable room.js (#845) + lockstep.js (#531), cap=2, pads `{t:'pad',s,k,p}`
    (a=rotate, s=drop), hashes every 30 ticks → desync freeze.
  - Determinism is the spine: seed + pad streams => identical hashes (sim,
    planner and hole-rolls all seeded; zero Math.random in sim paths).
- **Gates:** blobcheck 31/31 (static; mutant pop-threshold reddens it),
  contractcheck 16/16 incl. co-op pad-array determinism (spec `players: 2`),
  blobdrill 14/14 (real keys/taps, pixels==board, defeat/rematch/pause/tap).
- **#840 closed** (shipped); **#863 filed** (feedback): QA polish pass.
- Shift report pushed.

## Lessons
- **Pass pad maps in SEAT order, not (mine,theirs).** The guest applied swapped
  streams (well0 got its own pads) until blobcheck's in-memory online pair
  caught it: identical mirrors, different hashes = the clue. `assemblePads`
  now takes `(seat0Map, seat1Map, k)` — well index IS seat index, everywhere.
- **Garbage push direction:** inserting rows pushes the stack UP — copy
  `new[r]=old[r+shift]` bottom-up, then fill the BOTTOM `shift` rows. The
  first draft copied down and erased the stack; a land-test printing the board
  named it in one look.
- **Playwright `keyboard.press` is sub-tick (~8ms < 16.7ms)** — synthetic
  edges get swallowed between samples. Hold keys with `{delay:120}` in drills
  (real taps never fall between samples; a FAIL on rotate was the drill, not
  the game).
- **Inherit law:** harness (blobcheck) + drill (blobdrill) + contract — three
  tiers, each naming its own failure mode. The online pair test belongs in the
  Node harness (in-memory pipe), not the browser.

## Next goal
- Oldest `game-queue` now **#841**: "Builder never idles: run a flagship polish
  stage when nothing is queued" — a builder-authorized polish epic (QA lane
  owns individual passes; #841 is the standing mandate, so read it carefully
  before starting; it is a queue item, not a new game).

## Board / harness status
- main green at #862; no freeze; rule 4 satisfied (this PR is game code).
- jonq lane:games: nothing AWAITING, nothing filed (design came from #840).
  #843/#825 are lane:qa (AWAITING), not ours.
- **Deploy dependency (Jon, unchanged from #825):** real internet play needs
  the relay worker redeployed on Cloudflare; until then online pairs answer on
  the local test relay (identical protocol).
- QA lane owns: #863 (new BLOB BATTLE polish), #858 SSX ONLINE, #854 Garden
  Guard, #851 Selenitic, #831 STORM, #833 audio, #832 OCEAN, #752 EMBERWOOD,
  #680/#702 SHORE.

## Open questions
- none this session (lane:games). See #843/#825 (lane:qa, AWAITING).

## Housekeeping owed
- This lane's worktree `~/Dev/retrogames-forge-battler-840` is detached at
  origin/main with a node_modules symlink — safe to prune.
- `blobcheck`/`blobdrill` aliases in package.json; blobdrill is advisory
  (browser tier), contractcheck GAMES += blob-battle.
- Relay `/status` CORS console noise on localhost predates this game (noted in
  drill output; no page errors).
