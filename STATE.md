# STATE — forge board snapshot (slot b, 2026-11-26 — ASTEROIDS learns to shoot)

## This session — never-dry stage shipped, red main caught en route
- Ladder empty again (steer 0 · `next` #1712 waiting-jon · queue 0 · all
  feedback building/building-qa/waiting-jon · QA-borrow blocked: QA MASTER live
  ×2) → flagshipStage null → NEVER-DRY. idle-kick first answered ADVENTURE 0
  weak (score 13) — **phantom**: verified at HEAD the variant selector shipped
  (#1572) and nine "gaps" were `### Restored in #…` bullets. Honest picker
  (README sanity) = ASTEROIDS score 4, oldest of the score-4 tie at registry
  #3 — matches the warden tick. Filed + claimed **#3553**.
- **SHIPPED (#3553 → PR #3559): the small saucer learning curve.**
  `SAUCER_AIM {start 1.1, floor 0.3, learn 600}`: rookie small UFOs spray the
  large-UFO width, error eases monotone to the verbatim ±0.15 floor over 10 s
  of the saucer's own `life` clock — no new field, no extra dice. Leaving a
  small saucer alive is now the mistake; fast kills win, as on the 1979
  cabinet. Large UFO never eases.
- Proof: asteroidscheck **113/0** (stale locked-±0.15 pin → 8 learning gates:
  rookie >±0.15 over 6 shots bounded ±0.55, mature ±0.15 over 4, monotone,
  floor-exact, large constant) · `--mutant` **29/29** (2 new: learning
  deleted, ease never lands — deletion effects measured) · full 40-seed sweep
  floors ALL HOLD (40/40 byte-equal, zero-death 34+, worst 6000+) ·
  watchcheck(asteroids) **318/318** · eslint + lint:asteroids/mario/fps/ai +
  build green.
- **Wave-floor re-tune (#3553, honest harness calib):** first mutant pass was
  27/29 — two b26 driver mutants survived because rookie-spray legitimately
  eases early pressure. Measured: clean fast banks 12/12 waves (minScore
  4620); mutant-1 11/12 (3350); mutant-2 11/12 (4420). FAST wave floor 11 →
  SEEDS (the full sweep's own 40/40 law), mutants mortal again, clean clears
  at the pinned seeds.
- **Cross-lane probe parked, never destroyed:** mid-session, uncommitted
  edits by another hand appeared in this worktree (a `driver's eye` gate +
  `export` of wrapDelta/scan from sim.js, both anchored to #3553's mutant
  problem). Parked to /tmp/forge/{asteroidscheck,sim-stranger-exports}-
  20261126.diff, worktree restored, floor fix shipped instead (no game-file
  exports for harness convenience). Commented on #3553 for the other lane.
- **Picker-honesty follow-up shipped too (#3556 → PR #3558):** parseGaps now
  stops at `###` (h3 nests inside the h2 — old stop ran through it) and
  declines `Restored in/by #N` bullets; neverbudry +5 gates (41/0), jonqcheck
  164/0, ADVENTURE honest score 13→1, post-fix kick answers DONKEY KONG 0
  weak. (Rebased off slot a's better retro-markers of the Adventure README in
  #3552 — only the parser + gates remain in this PR.)
- **MAIN RED hit mid-session (#601 freeze):** nightly 45862031640 failed —
  3 GALAGA stale attract anchors + `rollercheck edge`. The parallel lane
  merged the GALAGA re-pin (#3557) while I diagnosed; rollercheck is 70/70
  green locally at `bba9d74`. Dispatched nightlies rode the workflow's
  concurrency-cancel (main-ok treats cancelled as pass); a fresh nightly is
  running on main to prove the fix for real.
- #3536 (PONG polish) was found MERGED-but-unclosed from the dead session —
  actually already closed with `shipped` + URL comment at 17:19; verified prod
  independently (`HOLD AFTER` marker in live bundle). Nothing to close.

## BOARD facts at close
- game-queue = 0 · building = #3565 (PONG RANGE-switch knob — another lane's
  never-dry pick) · building-qa = #3564, #3566 · feedback open: #3244/#2971
  waiting-jon · shipped this session: #3553 (game), #3556 (picker honesty).
- Slot a shipped beside me all day (#3552 seam follow, #3555 invaders QA,
  #3557 GALAGA anchors, #3561 two-player Defender, #3560/#3563). Healthy board.
- Rule-4: game code merged this session (#3559). No STALLED.

## PLAYABLE on main right now
- ASTEROIDS — small UFOs now learn: kill them fast or their shots tighten to
  pinpoint: https://jalfern.com/retrogames/asteroids
- DEFENDER hot-seat two-player (#3561) + per-type blossoms. PONG cabinet voice
  (serve double-clack, rally pitch rides the strike law, block numerals).
  SPACE INVADERS flow pilot + re-adjudicated bonus-life QA. ADVENTURE exact
  seam + armed decoy wait.

## Open questions (links only — #605)
- #3335 — QA music-bus low-pass (AWAITING, Nov 27; PINBALL gate).
- #3516 — Arkanoid art rung (AWAITING, Nov 28).
- #3054 — TestFlight recorder; #2971 — contra polish; #1712 — PLAICRAFT S2.
- No new jonq questions this session (measured law + harness honesty, no
  taste calls).

## Slot state at handoff
- Slot-b dev server :5178 stopped via `scripts/devstop.sh` at close.
- Worktrees ~/Dev/retrogames-forge-asteroids-aim-ease and
  …-idle-phantom-gaps are DONE with (merged; safe to prune next session).
- Main checkout detached at origin/main; STATE.md ships via docs PR and parks
  with `statepark.mjs park b`.

## Late addendum (second b lineage, post-merge — nothing lost, folded per #1430)
- Merge landed: #3559 squash `85f3b61` at 19:45Z (main-ok green — the bba9d74
  nightlies rode the concurrency-cancel; a dispatched nightly on main carries
  the real #3557 proof tonight — check tomorrow's scheduled run says GREEN).
  Issue #3553: shipped label + live-URL comment; prod token `start:1.1,
  floor:.3,learn:600` verified in deployed `index-B3umJ6CC.js`.
- Independent double-verification while the merge raced: a second b-lineage
  session (warden restart, unaware the first was alive) re-ran the FULL
  `--mutant` suite in an isolated worktree at eed458c — **143/0, 29/29** —
  matching the first lineage's own 143/0. Two tallies, one head, zero trees
  shared. QA polish pass filed: **#3568** (invisible-curve tell, kiting
  adjudication, ART.md juice pass; not-owed list attached).
- #3552 (ADVENTURE seam) shipped by slot a itself (`8490932`, CLOSED) — the
  TARGET refuse was correct: its owner lane survived and finished it.
- Board-hygiene lessons from the four-hands hour (10:40–11:53 local):
  1. `/tmp` log filenames must carry the SLOT (`/tmp/ast-mutant-b.log`) —
     `ast-mutant2.log` was independently chosen by two lanes at once.
  2. Long `gh run watch` × 2 exhausted the shared core-API budget (403 at
     19:15Z, ~9 min stall) — with lanes sharing one token, prefer periodic
     `--json conclusion` peeks over hour-long watchers.
  3. A session missing from `pgrep` once is NOT proof of death — the first b
     lineage survived, merged, and wrote this report's spine; the second
     lineage's job became verification + addenda. Check twice before
     declaring a corpse; quarantine your writes (isolated worktree) if unsure.

## Next claims (for whoever is free)
1. ASTEROIDS at score 2: kiting gap (heavy — adjudicate first) and
   snapshot/restore (#391 law). #3568 gives QA the polish list.
2. DONKEY KONG barrels-mid-air-over-ladders remains the smaller real fix if
   the rivet level outruns one session (picker post-#3558 honest score 0-weak
   answers — see #3558 note above).
3. QA lanes hold #3564 (ADVENTURE seam polish), invaders + defender polish —
   never-dry skips them; if a kick names `### Restored`/shipped history
   again, that's a README honesty bug: mark CLOSED/DISCLAIMER, don't build.
