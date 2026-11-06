# STATE — session 153 (2026-11-06, slot a)

## What shipped
**WATCH ON PHONES (#1656) — PR #1666 squash-merged `8314f65`, LIVE.** Resumed as
a slot-a corpse (step 1b): the prior session died after opening the PR with main
already past its base. Finished legs: union-rebase onto `88f1ba1` (#1664/#1662) across
23 game files (attract ▶ WATCH × #1654 hints × #1653p1 insets); **fixed a latent
crash** (BlobBattle attract guard read `net.active`, effect-local var — the attract
screen would have thrown; now `!netUi`; watchphonecheck's textual net-guard accepted
the broken form — eslint caught it); **found the true ship-blocker**: ci.yml carried a
DUPLICATED `if:` key (auto-merge artifact) → GitHub refused to parse the workflow →
ZERO check-runs → `static` never appeared and the rule-5 loop spun blind (runs
1685/1688). Dedup + js-yaml validation of all 5 workflows. Pill geometry re-pinned
across the two gates: pill 64×34→**112×44**, toast default 6.25→**6.75rem** (8px
thumb gap under the taller pill), Emberwood toast 8.75→10rem; FloorBoss keeps BOTH
laws (`calc(12.5rem + var(--sab))`).
**DISSOLVE mutant fix (#1668) — PR #1674 squash-merged `5915ea9`, LIVE.** The
accidental-merge aftermath below put `MagicCarpet/sim.js:179` on main as
`crater(...) || Math.min(...)` — a lava bomb wearing a flood's clothes, CI-blind
(carpetcheck ∈ MANUAL_CHECKS #1575). Restored the honest clamp per the #1668
handoff; the four named gates (flood-locality, sink-depth, tower-cold-promise,
RAISE counter-drain) green, mutant re-proven red→green.

## The lane-swap incident (full forensics on #1671)
Warden swapped lanes mid-flight (a→#1668, b→#1656). Slot b correctly DECLINED to
double-drive #1666 when it saw this lane's live loop. But this lane's FIRST rule-5
loop outlived its harness tool-timeout (the timeout did not kill the shell chain),
merged #1666 at 08:31:45, and the shim's `--delete-branch` detached the worktree;
the lane, believing it had stopped, fired a SECOND merge from the detached tree —
gh-shim's branch inference degraded to `head=jalfern:` (ignored filter) and squashed
the newest OPEN PR, #1671 (static green, so nothing unproved shipped, wrong trigger).
Hardening filed: **#1676** (refuse merge on detached HEAD / empty head-filter;
treat ABSENT static after ~5 min as diagnose-red not pending; merge-loops take a
lock; harness timeouts leave live children).

## Playable now
Phones: ▶ WATCH one-tap start+seat on 29 titles, solid 44pt pill, pause-menu WATCH
row; MagicCarpet's 11th spell DISSOLVE floods and dissolves land honestly.

## Gates as run
eslint clean · lint:mario/fps/ai ✓ · build ✓ · watchphonecheck 244/244 ·
watchpillcheck 115/115 (mutants both directions) · watchsoak 68 · sleepwatch 314 ·
robokit/floorboss/claim/lane/runway/dailylog/vpad/padlayout/react/key OK ·
ciscope 160 audited · carpetcheck sim arm all green (browser legs die on #1622
React dup; Chrome boot fails here → shell+sp) · static SUCCESS on both merges.

## Prod
Bundle `index-B-_jQyev.js`; game chunk `index-atwCXBDy.js` = `LAND DISSOLVES` +
`Math.min` clamp, zero `||Math.min(`; index carries `data-watch-attract`/`PLAY IT
FOR ME`. Egress via `/tmp/forge/netenv.sh` proxy worked today (both markers + HTTP
200). Live: /retrogames/magic-carpet, any watched title.

## Next (priority order)
1. **#1676** (harness merge-safety) — QA/platform lane; do NOT let another lane
   re-fire merges blindly after a timeout.
2. #1637 batch 5 claim (`forge-claim.sh 1637 a`): Lode Runner-Lite, Arena Archery,
   WWI Dogfight, DOS/IF remainder (Ultima/KQ via dosKeys). MagicCarpet's solver for
   WATCH could ride a later batch (11 spells now; no planner yet).
3. #1667 (QA holds): watchcheck CI wiring + phone-size section — clears STATE #151's
   one-liner gap.
4. #1612 remainder stands. #1645 is moot-but-open (DISSOLVE shipped; CLONE is the
   natural 12th-spell candidate if Jon prefers it).

## Notes for the next slot-a session
- 5173 STOPPED at end of session (was mine); magiccarpet worktree's dev server was
  the same port. Reuse 5173 strictPort.
- Worktrees reusable with node_modules: `~/Dev/retrogames-forge-watch-phone` (detached
  at origin/main) and `~/Dev/retrogames-forge-magiccarpet-dissolve` (detached) —
  branches deleted both ends; re-`-B` on next claim.
- **Pass PR numbers explicitly** to gh-shim until #1676 lands; never trust branch
  inference in a worktree another lane may have detached.
- carpetcheck's browser legs need the dev server; the sim arm (the rule-bearing half)
  runs regardless — CI won't run carpetcheck at all (#1575), so MagicCarpet rule
  changes REQUIRE a local `npm run carpetcheck` before merge.
- watchphonecheck greps the `#1656 — the forgotten-how-to-play tap` marker per game;
  don't reword without updating the gate. Attract mounts assume Space-start +
  Y-seat-at-+180ms; new multi-screen titles join SKIP_ATTRACT.
- Two gates now model pill geometry (watchphonecheck + watchpillcheck @112×44, toast
  6.75rem): change the pill in ONE place and update both pins.
- `. /tmp/forge/netenv.sh` before gh/jonq/prod. Park STATE right after writing:
  `node scripts/statepark.mjs park a`.

## Open questions
Links only (#605): #1645 (open, unlabeled, moot — default shipped; CLONE remains
candidate). None new this session.
