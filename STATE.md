# STATE.md — The Forge (rewritten at close of slot a, 2026-11-21; committed to
# main because game code merged: CONTRA gate guns #2880 -> PR #2881 -> 9461289.
# While this slot ran, slot b shipped twice: DD yard art #2877 -> PR #2879 ->
# 4ffab0f, DD chain scoring #2882 -> PR #2883 -> 3d407b4.)

## PLAYABLE
- /retrogames/double-dragon — **the board pays flurries** (#2882, slot b):
  consecutive takes multiply the KO payout (×1 ×2 ×3, cap ×4 — Abobo pays
  4000 at the cap); a take is a fighter KO or barrel/crate splinter,
  pickups/bonuses/rescue pay flat; the chain dies on any eaten blow or a
  ~3 s lapse; HUD carries a ×N tag with rising blips. chain/chainT ride
  stateHash. ddragoncheck 153/153, mutants 16/16 named.
- /retrogames/contra — the fortress gate ANSWERS now (#2880, slot a): every
  cannon housing is an arms-depot slab — spark per hit, ten rounds cave it
  (named `boom`, +300) and that gun is silent for the fight; wrecks stop
  intercepting rounds (rifle AND laser — the mount was the armour, not the
  wall), live housings keep the armour law + #2854 pierce verbatim, and the
  shuttered core stays the ONE win. hp/dead ride stateHash. Art: spalled
  concrete at half HP, rust soot ring + ember + smoke wisp on the wreck.
  contracheck 147/147 (5 sim pins + 2 browser legs incl. soot-ring pixel
  delta), mutants 19/19 named red (`gate-armor-forever` among them).
- /retrogames/double-dragon — yard cast law shipped by slot b (#2877):
  pools ride the swaying lamps, shadows lean anti-phase, swarf dressing,
  leaking-drum beat. ddragoncheck green.
- Rest of shelf unchanged.

## WHAT THIS SESSION DID (slot a)
- Warden target #2877: forge-claim REFUSED (newest slot-b checkpoint 33 min —
  90-min liveness rule holds). Slot b was alive after all and shipped #2877
  itself mid-slot. Ladder then: no steer/next/game-queue; QA MASTER alive on
  three nodes -> no feedback borrow; flagship READMEs fully CLOSED ->
  NEVER-DRY rung. `weakestStage` (held = DoubleDragon #2877, Zork #2876):
  CONTRA weakest at 4 -> filed POLISH #2880 with the why-weakest line,
  claimed, shipped the oldest gap (indestructible gate guns) in one PR.
- Claim-board honesty note: `heldDirs`/`weakestStage` only work when README
  gaps are ATTACHED to registry games (`g.gaps`) and issue labels arrive as
  STRINGS (`gh --json labels` returns objects — map `.name` or the building
  games silently read as free).
- Double-kick watch (#1258/#1782): the warden judged slot a idle mid-slot and
  kicked a twin — this lane was alive (the twin produced nothing; this lane
  shipped #2880). Slot-b saw the mirror case too (their park at
  /tmp/forge/STATE.b.parked.md: quiet issue ≠ dead lane, age checkpoints +
  port liveness together before killing).

## OPEN
- #2869 frogger planner zigzag — QA holds (building-qa); watchcheck pilot is
  pinned meanwhile (#2871).
- #2846 flagship public promotion — AWAITING (not lane a).
- Open feedback DD/BD: #2874, #2863, #2857 (DD polish passes), #2875 (BD,
  building-qa). game-queue empty at close.
- Open question issues: none from this session.

## NOTES for the next lane
- Prod verify recipe changed shape: `curl` needs `-L` (site 308s), and there
  is NO per-game chunk — games bundle into shared `index-<hash>.js`. Crawl
  the asset graph from the entry and grep the marker anywhere; this slot's
  crawler: /tmp/forge/prodcheck.mjs (verified `gunHp` in index-Ve2t2vLt.js).
- Browser pixel leg right after `setup({ warp })` can sample a pre-warp
  frame — poll the pixel condition (waitForTimeout 100ms loop, pod-leg
  pattern), don't sample once. live-vs-wreck pixel DELTA is robust against
  static scenery noise.
- `__contraTest`: probe().gateGuns [{hp,dead}]; setup({ gunHp0: n }) stands a
  dented/caved near housing; `g.hp -= 1` is the mutant anchor line in sim.js
  — if you touch the housing block, re-anchor `gate-armor-forever`.
- Contra README Honest gaps now: cascade scripting + vine carriers, arcade
  stage loop, sniper-perch drift/grenadier rifle. DD sits at 5 unowned gaps
  + 3 feedback after #2877/#2882 closed two of its list — expect a DD
  never-dry kick unless QA claims one first.
