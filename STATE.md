# STATE — forge board snapshot (slot a, 2026-11-22 evening — shipped)

## This session shipped
- **FLOOR BOSS drain-ring fix** (#2992 regression → PR **#2995** → main
  `26b8b13`, prod-verified: Vercel deployment `success` at the merge sha, live
  attract boot-proved headless — canvas up, zero page errors). Root cause of
  the 24-check floorbossplay family: #2966's drain applies its banked tap
  BEFORE `step()`, but `step()` wipes `gs.ev` at entry (sim.js) — the applied
  tap's events (refusal names NO CORNER/NO LANE/NO KNEE, lesson banners, teach
  marks, seat stamps, sounds) died unheard between apply and step. A fast-tapped
  refusal obeyed the board SILENTLY; legs read that silence, plus drains
  landing later than their fixed 90 ms click-era sleeps, as unnamed refusals,
  short rig builds, and late racks on refused cells.
  - Fix (game): the drain tick now rings its tap — snapshot `gs.ev.length`,
    `applyTap`, then `handleEvents(gs.ev.slice(from), gs.tick)` between apply
    and step; mirrors the solo path, painter/audio-only, banked hash row
    untouched (#1373 law).
  - Fix (harness calibration): `tapCell*` helpers wait `pending() === 0`
    (new DEV hook — every queued tap has ridden its row, verdict in) instead
    of fixed sleeps. **New leg law (#2992): real-tap legs never guess a
    sleep — they wait the drain.**
  - Verdicts: floorbossplay 110/110 ×2 (was 86/110 ×3 incl. both #2992
    baselines) · floorbosscheck all green + new source pin · mutants
    `--mutate-ring` (new) and `--mutate-taps` (search updated) die by name ·
    eslint + lint:mario/fps/ai + build + contractcheck 14/14 green.
  - The expected red nightly is defused — the refusal family is green at tip.

## PLAYABLE on main right now
- `/retrogames/floor-boss` — chip-then-cell taps at full thumb speed now teach
  out loud: refusals name themselves, lessons pulse, stamps land (#2992); the
  #2987 watch-stamp laws ride along. Plus `/retrogames/fire-crew` (slot b's
  #2994 voices-in-smoke is live at `d85467e`), `/retrogames/r-type`,
  `/retrogames/contra`.

## Board at close
- `game-queue`/`next`/`steer` empty; `waiting-jon` empty; `halt` none.
- `feedback`: #2971 building-qa (QA is inside Contra — do not touch).
- `lane:platform` #2910 stays open (never-dry kicks that land unactionable —
  that class, not this session's).
- **idle-kick at close answers `KICK FLOOR BOSS 0 weak` HONESTLY**: this PR's
  README filed a real new gap — the solo-path backlog echo (see below). The
  next never-dry lane takes it as POLISH — it is game code worth shipping.
  (FireCrew's old false score from the malformed `**DISCLAIMER — …:**` marker
  no longer kicks — slot b cleaned it with #2994.)

## Honest gap filed (not fixed, on purpose)
- **FloorBoss solo-path echo:** `onCanvasClick` hands `handleEvents` the whole
  `gs.ev`, not just its fresh events; the last completed tick's already-rung
  backlog sits there until `step()` clears at entry, so an inter-frame click can
  echo the previous tick's sounds/fx line. Pre-existing since #1712; drain got
  the precise `slice(from)` shape in #2992 — the same pattern completes it.
  Documented in the README's Honest gaps.

## Slots / ops
- Slot a port 5173 stopped via `scripts/devstop.sh` (by port) ✓; worktree
  `retrogames-forge-floorboss-tapfix` merged, re-detached and removed ✓;
  branches pruned ✓.
- #2975 trap again: `retrogames-qa-mini-cap` squats on local `main`, so the
  rule-5 merge command exits 1 AFTER a successful squash-merge — merge was
  VERIFIED via PR state + origin/main (26b8b13) + prod deploy, exit ignored.
- **MAIN-CHECKOUT ANOMALY (report, not corpse):** `src/games/Contra/index.jsx`
  + `art.js` are dirty in the plumbing checkout `~/Dev/retrogames` (mtime
  17:24–17:50) while QA lanes mini/mini2 run and `retrogames-qa-2971`
  (`qa/contra-trainable-polish`) exists — live QA work inside the plumbing
  checkout, lawfully owned by #2971, LEFT UNTOUCHED. This session's STATE
  commit staged `STATE.md` ONLY. The QA lane must move its Contra work into
  its worktree and clean the main checkout.

## Harness notes (carry-overs)
- **Tap-queue wait law (#2992):** any browser leg driving real taps must wait
  `pending() === 0` before asserting taps resolved; refusal-name assertions
  need the drain to ring (`slice(from)` between apply and step). Fixed ms
  sleeps after clicks are pre-#2966 calibration and race the bank.
- **Tail-leg law (#2987):** over-screen legs wait past the 600 ms key guard;
  self-contained tails (fresh `?seed=`, own eyes) cannot contaminate ledgers.
- mutateguard held the line again today: mutant runs refuse a dirty tree —
  commit, then mutate.

## Next lane starting here
1. Run `node scripts/idle-kick.mjs` — expect `KICK FLOOR BOSS 0 weak`; file
   the POLISH for the solo-path echo gap, claim, ship the `slice(from)` fix in
   `onCanvasClick` + a leg pinning no-double-ringing (game code, rule 4 ✓).
2. If any nightly is red at tip, rule 5a still outranks: fix before claiming.
