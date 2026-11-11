# STATE — session 210 (2026-11-10, slot a)

## What shipped
**SMASH TV: OVER-THE-SHOULDER GUNS** merged as `f69058f` (PR #1947,
Closes #1945 — never-dry weakestStage pick, score 4). The cabinet frames the
contestant from above-behind: guns ride the SHOULDERS, muzzles past the head;
the rebuild drew barrels at hip level. Now: `sprite.js` owns the pose as pure
geometry (`CARRIAGE={back:1,rise:2.5}`, `gunPose` → base/muzzle/stock/flash per
barrel); per-weapon carriages (twin over both shoulders w/ dual flash, MG long
right-shoulder + drum-mag, SPREAD sawed-off w/ two dots, LASER boxy emitter +
side-cells); chrome pauldrons in the sprite sheet (seat-palette aware);
`juice.recoilKick` walks the carriage back 2px, zero within 5 ticks ≤ tightest
interval. Sim UNTOUCHED — pilot seeds 0-8 clear, hashes byte-identical.
smashcheck PASS 531 (new POSE law: mount behind shoulder plane + muzzle past it,
8 aims × 4 weapons; silhouette, spread, stock, flash, recoil, pauldron checks);
mutants 11/11 die (new: guns-drop-to-waist); smashplay 21/21 incl. pixel proof
(18 chrome px cross the head column aimed up, 0 aimed down). Prod bundle
verified (control flash:9.5 + new back:1,rise:2.5 + off:[2] in
index-CzFQwzQj.js). Live: jalfern.com/retrogames/smash-tv.

## The session's catch — browser pixel checks bite three ways
The down-column pixel gate failed twice before passing: (1) walkcam LEGS use the
exact barrel grey #8d99b5 — clear gs.enemies + roomData.spawns before sampling
paint, or the arena's own cast votes on your sprite law; (2) the canvas lags the
state by a frame — await 2× requestAnimationFrame after mutating state before
getImageData; (3) spawn-invulnerability blinks the sprite out every other frame —
zero invuln first. And grey-blending: anti-aliased visor edges at 50% land inside
a ±40 grey window — sample ABOVE the sprite, not across it. Record: a pixel law
is a law about the whole frame, not just the sprite.

## Ladder trail
- halt none; steer none; `next` #1711 hardware-stalled on Jon (audit-confirmed
  2026-11-10, code-complete — skip per trail); game-queue empty; QA MASTER live
  (pid 27690) → feedback borrow refused; flagshipStage null (all flagship gaps
  owned) → NEVER-DRY weakestStage: SMASH TV score 4, gap #0 → filed #1945 with
  why-weakest → claimed(a) → shipped. No jonq (mechanical picks only; taste bar
  not met).
- Camera half of SmashTV gap #0 stays in README honestly: varisize arenas +
  camera would re-pin every hash — not one stage.

## Session bookkeeping
- #1945 CLOSED shipped; QA polish pass filed as #1950 (recoil weight at phone
  scale, swap glint, diagonal twin spread, pauldron bob, civ sprites, boss
  gun-language).
- :5173 vite runs from `~/Dev/retrogames-forge-smash-otsh` (detached f69058f
  after merge, node_modules symlinked) — reuse or kill next slot-a session
  before strictPort. Reclaimed 5173 from the stale ppm-portrait server (slot a's
  own dead lineage — legal to kill; never another lane's port).

## Next queued (slot a)
1. Fresh ladder: halt/steer/next/queue games-first, then feedback only if no QA
   session is live (pgrep QA MASTER), else flagship/never-dry via idle.mjs.
2. #1637 b22 candidates: other titles' watch gaps beat DF (DF far-side + graze
   documented-closed-to-redesign, two batches of proof).
3. QA-held items stay theirs (#1915/#1900/#1888/#1871 TMD, #1907 SI/DF, #1877
   FB, #1923 rail, #1925 carpet, #1950 SmashTV). LodeRunner deep shafts #1942
   is slot b's live build — don't touch.

## Notes for the next slot-a session
- Any browser pixel check: clear threats/spawns, zero invuln, rAF×2 after
  mutating state, and check your colour isn't worn by sprites you didn't clear.
- smashcheck pose anchors measure off the SHOULDER anchor (centre + rise), not
  body centre — the rise is the height cue; along-aim laws reference the plane
  the carriage actually stands on.
- Prod marker recipe: paint-only changes ship NO new UI strings — the minified
  spec OBJECT survives (property names aren't mangled): pick a changed literal
  pair like `back:1,rise:2.5` + an unchanged control; jalfern.com 308s to www —
  curl -L.

## Open questions
- None. (No taste/priority call needed from Jon.)
