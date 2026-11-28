# STATE — forge board snapshot (slot b, 2026-11-28 — the autopilot stops bluffing)

## This session (slot b) — never-dry rung, taken and shipped

**LEMMINGS-LITE phantom-BUILDER hygiene (#3876, PR #3878, merged `6bf7a7e`)**
`idle-kick` answered `KICK LEMMINGS-LITE 0 weak` (score 3 — the only score >1 on
the shelf), so the never-dry rung was taken.
- **What shipped:** `solve()` now certifies its own script against the REPLAY world
  (`stripPhantomBuilds` in `sim.js`): every recorded BUILDER commit must attribute
  to ≥1 `plank` event in replay or it comes out. DOOR's `build t240 id2` (drowned
  before any descent) and LEDGE's `build t1667 id6` (exited over intact floor) are
  gone from the attract demos; SPIRE's 12-plank road and MASSIF's 4-plank bridge
  pass through untouched. Removal is DEMANDED neutral — stripped script must still
  win quota with no extra deaths — and on today's boards the stripped replays are
  bit-identical (a dead grant touches no grid, no supply, no body). Mid-game clones
  (DebugKit PROGNOSIS) skip hygiene; it certifies only scripts the solve wrote.
- **Gates, all on CI:** `lemcheck` **259/259** (12 new PHANTOM HYGIENE pins incl. a
  live planted phantom the validator must remove; hand mutation: disable hygiene →
  3 reds); `lemplay` 55/55 ×2; recmethods PASS 37; goldentracecheck 89/89; lint
  mario/fps/ai + build green. Honest accounting: DOOR/LEDGE's two fake `build`
  slack iterations vanish with the phantoms (249→247); SPIRE/MASSIF still prove
  build slack for real. Prod: `Lemmings-DqjybCHy.js` carries the new chunk hash.
- **Filed:** QA polish pass **#3879** (feedback — the QA lane's next job: sloped
  planks, walk-cycle/hair sprites, splintering wood, music, vents/trampolines/
  teleports, more boards).

## Slot board

| Slot | Lane | Doing | Since | Heartbeat |
|---|---|---|---|---|
| a | games | idle at `origin/main` after shipping #3866 | 2026-11-28 ~15:40 | stale-ish |
| b | games | idle at `origin/main` (`6bf7a7e`) after shipping #3876 | 2026-11-28 ~16:40 | fresh |
| building-qa | qa | **#3877** LODE RUNNER-LITE art & fidelity pass (in place); #3873 shipped (`08e0cbb`), #3860 closed | — | fresh |

Open question issues: **#3791 AWAITING JON** (dry-shelf flagship title),
**#3516 AWAITING** (Arkanoid texture rung). Neither blocks a claim.

## What is playable right now

- **LEMMINGS-LITE** at https://jalfern.com/retrogames/lemmings — DOOR and LEDGE
  attract runs are honest: no BUILDER flash where no wood can ever lie; SPIRE's and
  MASSIF's plank roads still lay (12 and 4 planks, quota delivered).
- **ARENA ARCHERY** at https://jalfern.com/retrogames/arena-archery — night-vault
  backdrop merged (#3875, QA lane).
- **DEFENDER** at https://jalfern.com/retrogames/defender — stage-2 QA (#3860) was
  closed without the pass ever running; stage 2 is still effectively unowned.
- **STAGE Ladder** at https://jalfern.com/retrogames/forge.

## Next actions by priority

1. **#3879** — QA polish pass for LEMMINGS-LITE, unowned, feedback-labeled; the QA
   lane's job, not the builder's ladder.
2. **Lemmings remains the weakestStage pick** (3 unowned README gaps: sloped-plank
   look, stamp offset, float-while-digging). If a never-dry kick names index 0
   (look), weigh it against the honest gameplay rule — the **stamp offset** (DOOR
   6/1 solve vs 6/3 replay) is the strongest real-feel candidate left, but it
   re-times digests; scope it deliberately.
3. **DEFENDER stage 2** — #3857/#3856 pointers from old STATE went stale/closed; no
   open builder issue exists for it. Re-file with correct numbers if it should run.
4. **Ladder SCRIPTED re-solve for LEMMINGS** — old STATE's "#3823" pointer is WRONG
   (#3823 is a closed Bubble Bobble QA item); no open digest issue exists. File a
   fresh one before claiming it.

## Open risks

1. **Issue-number drift in STATE handoffs** — two bad cross-refs in one day (#3856's
   wrong-game header, #3823's wrong pointer). A handoff should re-check its numbers.
2. **`statepark` cannot prove its own currency (#1214)** — unchanged.
3. **Both fresh games lack sensor/agent files** (#3821, #3784) — a claim that assumes
   them fails at step 4 of Adding a game.
4. **Stamp offset (README)** — solve-vs-replay death drift on DOOR; product contract
   holds (attract delivers quota, replay-vs-replay bit-identical), but any new pin
   comparing solve outcomes will flake.
