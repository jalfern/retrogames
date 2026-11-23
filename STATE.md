# STATE — forge board snapshot (slot a, 2026-11-22 night — SHIPPED)

## This session shipped
- **DOUBLE DRAGON: the walked-away friend hands the blue seat back to the CPU**
  (#3005 → PR #3006 → main `25a26ae`, prod-verified via
  `DoubleDragon-BQ-umxYr.js` containing `seatIdle`). Spec = Jon's answers on
  #2908/#2930 ("Yes. Computer takes over."), closed-answered but un-executed.
- The law: `step()` owns the seat idle clock (`CFG.seatIdle` = 300 ticks =
  5 s world time) — a held-but-silent blue seat returns to `dragonBrain`; any
  live pad2 press re-seats (in-sim re-seat = the replay/dataset leg; live
  paths flip first and pay `seatJoin()` — #2863's shout re-scoped from
  once-per-run to once-per-seating). Grey closing brackets + two-note descent
  + pad-2 rumble name the moment; #2863's READY blink keeps inviting the
  return. Edges pinned: fallen seat, jammed-held button, solo, hash purity.
- 8b: QA polish pass filed as **#3007** (phone legibility of the grey ink,
  sound level under fire, whether 5 s suits a thinking player, re-join flare
  read, READY-vs-CPU judgement).
- #2846 ("promote all 3") found already executed at main (`7ac26b0`) — not redone.

## Ladder trail (#1258 target)
- Warden target **#3003 REFUSED at claim** (mini2's claim minutes newer) →
  normal ladder: steer/next/game-queue empty, #2971 `waiting-jon`, QA lanes
  live (no borrow), flagship stage spent, idle-kick `NONE`. Jon's answered
  #2908/#2930 outrank the dry rungs ("ANSWERED means execute Jon's reply") →
  filed #3005, claimed, shipped. That was the only un-executed spec'd work
  on the board.

## PLAYABLE on main right now
- `/retrogames/double-dragon` (new idle-seat law + the full S1–S4 board),
  `/retrogames/contra` (voice orders, #3000), `/retrogames/floor-boss`,
  `/retrogames/fire-crew`, `/retrogames/r-type`.

## Harness evidence
- ddragoncheck 300/301 at tip; `--mutant` 261/261 — new `idle-deaf` +
  `no-resume` go RED named. The one local red is the paint-instrumentation
  flake family: three full runs, three *different* sub-second legs of the
  #2889/#2966 family (KO-settle bar, relief white-tag ink, knockdown
  squash=0), all provably dead-code paths under this diff (human-false +
  empty pad2 + cpuFx=0 streams run bit-identical to tip). Advisory class;
  merge gate `static` green.

## Board at close
- `game-queue`/`next`/`steer`/`building` empty; `building-qa` #3003 (mini2,
  Contra voice polish). `feedback`: #2971 `waiting-jon` (QA-held — don't
  touch), #3007 (mine — DD handback polish).
- idle-kick answers `KICK DOUBLE DRAGON -1 weak` — the score is my own #3007
  naming DD with no README gap (index −1 = feedback-only). #3007 is
  `feedback`: the QA lane owns it. A builder slot handed that kick while
  `pgrep -f "QA MASTER"` finds a live session must let QA take it (step-2
  borrow rule) and fall through — don't double-claim your own lane's product.
  (`forge/dragon-seat-polish` at `25a26ae` already exists — someone has
  taken the polish; good.)

## Ops / carry-overs
- Slot-a dev server 5173 stopped via `scripts/devstop.sh` ✓. My worktree was
  removed at merge by another cleaner (nothing lost — branch deleted, merge on
  main, handoff files under `/tmp/forge`).
- **Prod-verify gotcha (this session):** games ship as lazy chunks — grepping
  the index bundle for a new-game marker can NEVER match. Verify against the
  game chunk (`assets/DoubleDragon-*.js` name is discoverable from the index
  bundle text) and follow the apex 308 → www with `-L`. A poll built the old
  way times out green-prod red — fix candidate for shot/verify tooling
  (don't grow it here; noted).
- **gh merge cleanup gotcha:** `gh pr merge --squash --delete-branch` merged
  fine but its local cleanup died because `main` was checked out in
  `~/Dev/retrogames-qa-mini-cap` (law: `main` checked out nowhere). Remote
  branch deleted by hand. QA's worktree, not a builder's to prune; if it
  bites again, file it for the harness.
- Seat-ownership convention extended (README `#3005` section): `human`/`idle`
  are stream truth, never hashed; replays reconstruct the seat timeline from
  the banked pad pair (#1712 `rules.seat2At`). Old recorded takes with >5 s
  pad2 silences replay with the CPU driving Jimmy — the new law applied
  honestly, not a regression.

## Open questions
- None. (No new jonq this session — nothing taste/priority/hard-to-undo went
  unresolved; the dry-shelf flagship question was already asked this week.)
