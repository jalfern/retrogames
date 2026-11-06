# STATE — session 154 (2026-11-06, slot a)

## What shipped
**COMET DRIFT GP retighten (#1669) — PR #1677 squash-merged `1562cda`, LIVE.**
The traced circuits come back onto their maps: #513 spread Daytona's fork legs +
Laguna's keyhole for the old 2560² world with 64px roads; since #542 grew the
world x3 and #782 widened the lane only x1.5, the spread over-cleared. New
`scripts/comet-retighten.mjs`: deterministic hill-climb of the grown control
points toward the reference embedded in the live bbox, gate-parity at every step
(minR>=97, zero wall crossings, legs >= 2*KERB_R+24, longest-straight window,
Corkscomb triple-apex signature), integer-snapped so validated == shipped.
Measured (cometcheck): sandbank avg 1.93->**1.39**%, worst 9.5->9.7 (notch floor
= 316px wall corridor + 97px radius floor — documented honest limit);
corkscomb avg 2.79->**1.86**%, worst 18.6->**18.0**. WORST_CAP tightened to
{0.10, 0.185}; revert-mutant (pre-retighten TIGHTEN replay) measures 18.6 and
dies RED. Full cometcheck GREEN: bot wins all seeds, bump caps, #478 charge,
elevation, provenance, signatures. eslint + lint:comet/mario/fps/ai + build green.
Prod verified by chunk fingerprint (`selector-9UwUPh7J.js` carries `375,-199`);
`#1669` labeled shipped + closed.

## Lessons (worth keeping)
- **Race gates are the oracle, not geometric parity.** Two candidate pulls passed
  my tuner's structural scans yet died on #478 straight-charge / #1498 bump caps —
  emergent autopilot behaviour. Fix: front-straight seam points frozen
  (corkscomb 0,1,31-34) + conservative sweep count = the shipped data; the
  README + verify block say NEVER re-run the tuner blind, only to re-derive.
- **Snap to integers before validating** — ship-time rounding flipped a near-miss
  crossing verdict once; snap is now in the tuner.
- **`cometcheck --mutate` is broken on main** (URL passed to `mutateguard.pull`
  at cometcheck.mjs:1309) — pre-existing, crashed identically at 88f1ba1/1562cda.
  Filed **#1679** (feedback + lane:games, QA). It rotting silently = mutate flow
  missing from CI (same gap class as watchcheck in STATE 151).
- gh-shim: `gh issue edit --add-label/--remove-label` dies (`ADDL2: unbound`).
  Workaround: `gh api repos/.../issues/N -X PATCH -f 'labels[]=...'` — NOTE it
  REPLACES the whole label set (1669 now just `shipped`), fine for closed issues.
- Prod verify for numeric-only changes: Vite names CometDrift's chunk
  `selector-*.js`; grep the minified array fingerprint (`375,-199`) in prod.
- Never claim-and-hold across another slot's target: #1668 was REFUSED (b held,
  it shipped as #1674 by the resumed lane). #1645's DISSOLVE default is now
  SPENT — drop that carried line everywhere.

## Next (priority order)
1. **Wire watchcheck into CI** (gap from STATE 151 — still open) and add
   `cometcheck --mutate` alongside it (#1679): both mutants-and-pilots suites
   that exist outside CI rot silently. One PR, two jobs.
2. #1637 batch 5 claim (`forge-claim.sh 1637 a`): remaining solver titles —
   Lode Runner-Lite, Arena Archery, WWI Dogfight, DOS/IF remainder (MagicCarpet
   now done via #1668/#1674).
3. #1612 remainder stands; #1653 parts 2-3 + polish passes (#1654/#1655/#1663)
   belong to the QA lane (Jon 2026-10-19).

## Notes for the next slot-a session
- Main checkout re-detached at `origin/main` (`1562cda`). Dev server on 5173 was
  NEVER STARTED this session (cometcheck is Node-only) — nothing to kill.
- Worktree `~/Dev/retrogames-forge-comet-shape-tighten` re-detached, node_modules
  symlink into the main checkout — reusable; branch deleted both ends.
- If touching CometDrift geometry: run FULL cometcheck (it's 9 s) — shape gates,
  bump caps and straight-charge are all cheap and load-bearing.
- `. /tmp/forge/netenv.sh` before gh/jonq/curl-to-prod; LC_ALL=C when grepping
  minified JS through zsh (else "character not in range").
- Slot bookkeeping was tangled this session (parallel #153 reports on both slots);
  numbering continues 154 = this one.

## Open questions
None new. Carried #1645 resolved by DISSOLVE shipping (#1674); no open waiting-jon
issues on the games lane (`jonq list games`: none).
