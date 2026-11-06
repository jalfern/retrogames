# STATE — session 153 (2026-11-06, slot b)

## What shipped
**GRAVEL YARD ONLINE LOBBY SEATS (#1672) — PR #1675 squash-merged `985518e`, LIVE (prod chunk index-B7_VMAVK.js verified).** The never-dry stage:
`weakestStage` scored GravelYard 7 (highest unheld on the shelf), its oldest
unowned gap was "online seats through the lobby" (the kitchen #1291 pattern).
- `?net=host` rolls a 4-letter room on the marquee; `?net=join&room=CODE`
  seats a second browser that drives the TRUCK with its own arrows/pad
  (phones work — VirtualControls dispatches the same primary keys). Host digs,
  operator stays CPU; host can't start an empty room (seats checked before go).
- Lockstep: sample once, D=8 ahead, never resample (`utils/lockstep.js`);
  `hashState` referee every 30 ticks; desync/partner-left freezes with an
  honest toast, Space returns to title. `sources()` reports the peer `remote`.
- gravelcheck +11 gates: twin in-memory boxes over the real engine stay
  hash-equal; a lost pad window stalls BOTH equally (nobody runs half a
  moment); corrupted streams CAUGHT at the boundary. Mutant proven: wire-mask
  bit flip in net.js → red, restore → green. 64/64 (GY_SKIP_BROWSER=1 —
  #1622 still kills the browser half here).
- Commits `819e87c` + `63ca938`. README gap-0 rewritten (3rd human seat open).

## Ship note
GravelYard 2P is the shelf's first online co-op that is not a battle/race: hash-checked lockstep on a
shared deterministic yard. Rule-4 counter cleared (game code merged).

## Lane collisions resolved this session (#1258 pressure, worth remembering)
- Warden split was a→#1668, b→#1656, but both slots resumed each other's
  corpses. **#1656** (watch-phone): slot a's orphan merge loop spun blind ~1h —
  root cause (found by b, fixed by a in `c11f16f`): the union-rebase left a
  DUPLICATE `if:` key in ci.yml → invalid YAML → the workflow never started →
  `static` absent → loop waited forever. b yielded cleanly; a merged; #1656 shipped.
- **#1668** (MagicCarpet DISSOLVE): b's namespace claim but a resumed it; a's
  commit `468e1b9` swept b's live carpetcheck MUTANT into HEAD (a
  `crater(...) || Math.min(...)` line at sim.js:179 — carpetcheck reds 4 gates
  on it). Warning + exact fix posted on #1668; CI will NOT catch it because
  carpetcheck sits in MANUAL_CHECKS. **Whoever ships #1668: restore
  `gs.heights[gi] = Math.min(gs.heights[gi], floor)` and run `npm run
  carpetcheck` (expect 93 green) before merging.**

## Playable now
GravelYard two-player across two browsers/phones with hash-verified lockstep.
Plus everything before (WATCH pills, batch-4 watchers, watch-phone UX live).

## Next (priority order)
1. #1668 ship-safety (mutant line above) — it is slot a's; the warning is on the issue.
2. #1637 batch 5 (slot a's lane per warden) — MagicCarpet DISSOLVE default DISSOLVE stands (#1645).
3. watchcheck CI wiring one-liner (STATE 151/152 carry) — still open, still cheap.
4. GravelYard 3rd human seat (operator) — README gap, natural follow-up to #1672.

## Notes for the next slot-b session
- Worktree `~/Dev/retrogames-forge-gravel-lobby-seats` — re-detach after merge;
  node_modules in place. Dev server on 5178 was killed by port-collision earlier
  (magiccarpet corpse server); nothing is on 5178 now unless this session's
  background jobs left one — check before binding.
- MagicCarpet DISSOLVE gates verified green (93/93 node) with the clamp line —
  reusable knowledge for #1668 QA.
- `git checkout -- <file>` in an uncommitted worktree destroys a whole harness
  section — happened once this session; lost 20 minutes. Don't "clean" files
  mid-check.
- `. /tmp/forge/netenv.sh` before gh/jonq. Park STATE right after write:
  `node scripts/statepark.mjs park b`.
- Octal footgun: `[ "0830" -lt … ]` on `date +%H%M%S` loops forever (leading
  zero = octal). Use `date -u +%s`.

## Open questions
Carried: #1645 (MagicCarpet 11th spell — default DISSOLVE, deadline 2026-11-08).
None new this session.
