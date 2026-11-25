# STATE — Forge status (slot a)

## Shift report — 25 Nov 2026, 05:30 (slot a, ~3 h)
**Goal:** #3362 QA — SKYWARD post-bed-polish pass (6 items). **Shipped:** PR #3410
(merge `33b728f`) — presentation-only; game hash and scoring untouched.

**Closed:** #3362. **Residue filed:** #3411 (black polygon over far volcano in attract vista).

### What landed
1. **Attract vista** — the camera orbited a full 360°, framing the volcano's shaded faces
   half the cycle. It now swings a 76° arc keeping the sunlit flank centred, opens fov to
   72° in portrait; a root-cause fix (first rAF timestamp predated the loop's `last`, so a
   negative dt inverted every exponential lerp at startup) stopped the vista overshooting.
   The storm cell is excluded while the camera is deep inside it and drift-syncs on approach.
2. **Exhaust streak** legible at phone scale: wider, hotter core, speed-reactive tail (sim
   untouched); 700 px/s motion audit added to skywardplay.
3. **Wind bed** ducks harder and darker near the cell core (−90 Hz, ×0.35 at the centre)
   so rain owns the storm core and the mix separates on small speakers; pins updated.
4. **Crash** beats now hand off (cut sweep → rumble → respawn spool) instead of stacking,
   and respawn fires at the rumble tail — each beat audible on a phone speaker.
5. **Chrome column** fits 320 px: rank strip and mission banner stack as a dedicated tier
   (a 320×568 leg added to skywardplay).
6. **Landscape phones** (844×390): hud scales down, banner hides, viewport clip guards —
   rebased onto slot b's #3370 landscape tier (kept theirs, dropped the duplicate).

### Proof
- `skywardcheck` 196/196 + all mutants die (`--mutate`: 261/261) on the merged tree.
- `skywardplay` PASSED incl. new vista, 320×568, 844×390 legs.
- Lint (eslint + mario/fps/ai) + build green; production `jalfern.com` serves the new
  bundle (vista/wind signature bytes verified in `Skyward-Cqzrmb4D.js`).

### Known / open
- **#3411** (filed, feedback): a small pure-black polygon sits at h·0.25 over the far
  volcano in the attract vista (desktop + portrait). It survives hiding terrain, cell,
  clouds and rain, and predates this pass, so the 3 h box ended with it shipped-clean
  but unpinned — suspects are the storm-dim cap at coarse far-sphere tessellation or
  `pow(dot,220)` precision on SwiftShader. Repro hook: `__skywardTest.attractT/attractCam`.
- The vista's composition quality is asserted by geometry + sample pixels, not a human
  eye — worth a glance at https://jalfern.com/retrogames/skyward attract.
- CI: the `pull_request` event dropped again for this branch (second time today);
  dispatch + forge-merge's check-runs fallback carried it.

## Board (05:30)
- `game-queue`: empty — the warden may want a new flagship/polish target.
- `next`: #1712 (waiting-jon). Open QA tails: #3379, #3368, #3329, #3290 (items 5–7).
- Slot b shipped #3404 (Sonic 3), #3408 (QA fixes), #3412 (state) this window.
- Skyward's QA story is now strong: 196 pins + mutants + a view/legibility suite.

## Open questions (none filed this session)
- Nothing taste-blocking; #3411 carries the only known visual defect with its own repro.
