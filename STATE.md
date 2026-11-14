# STATE — Forge (last: session 262, slot a, 2026-11-14)

## SHIPPED THIS SESSION
- **FURLONG #2182** — demo showcase 3D horse, "no low-poly limit" — merged #2191,
  prod-verified byte-identical (jalfern.com/retrogames/demos/furlong.html, 45,577 B).
  Raw WebGL2, zero libraries: 5.9k-tri lofted anatomy CPU-skinned over 25 bones, true
  four-beat rotary gallop, ground-locked hooves (slip **exactly 0 mm**, 8-stride seam
  1.7e-14 m, suspension 0.36, footfalls LH·RH·LF·RF), PCF sun shadow map, golden-hour
  sky, tileable turf, wave mane/tail, synthesized hoofbeats.
  `npm run furlongcheck` — 28/28, mutants proven red (anchor X(tTd)→X(t) breaks ONLY
  the slip gate; LF td 0.48→0.05 breaks temporal-order + diagonal-timing).

## LESSON THAT MATTERS (learned the expensive way — it's in the demo's README too)
The horse rendered as spider-legs for a session because `mat4invert` dotted R's **rows**
with t instead of **columns** (column-major!), and Gram-Schmidt bone frames collapsed on
near-vertical bones. **Every numeric gait gate stayed green through it.** Fix: rigid
inverse uses column dots; bone frames complete by X↦(−Xy,Xx,0) (continuous in the plane).
The check harness therefore gates skinning-matrix rigidity + bind→runtime joint agreement
directly. Also: vite serves public/ with strong caching — probe URLs need `?nocache=`.

## BOARD
- #2147 STRIDELINE: closed (was merged but never closed; verified + closed early this shift).
- #2182: closed, shipped label.
- #1711 stays Jon-side. No steer/halt on any lane as of this writing.
- Nightly: latest completed run on main = **cancelled** (main-ok treats that as clear;
  43551392966 was still in progress at shift end). No quarantine entries.

## NEXT (for the next slot-a session)
1. Take the next TARGET/normal-ladder issue; the demo ladder is thin — check
   `gh issue list --label ready` before inventing anything.
2. QA handoffs exist: #2162 STRIDELINE polish + #2187 sweeps are QA-lane issues, not builder work.
3. `horsecheck`/`furlongcheck`/`creditscheck` are advisory lane-local gates — run the one
   matching your demo before PR; park new ones in MANUAL_CHECKS (ciscope #1575 rejects aliases
   that are in neither a scope nor MANUAL_CHECKS).

## HOUSEKEEPING
- Worktree `~/Dev/retrogames-forge-furlong-horse` (branch deleted on merge): keep or remove
  at leisure; node_modules is a symlink, nothing unique inside.
- This STATE.md committed to main legitimately (#2182 merged this session).
