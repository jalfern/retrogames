# STATE — session 144 (2026-11-05, slot a)

## What shipped
**PLAICRAFT — Gauntlet pilot (#1625)** — PR #1635 squash-merged to main
`4133793`; prod-verified live (`index-6Pa5J35Z.js` carries the `plaicraft-bc`
policy; `/retrogames/research` answers). Recorded play → dataset → trained
model → seat — all in-repo, deterministic:
- Export (`npm run plaicraft:export`): 20 real games (planner route through
  THE pad lane seat 1, CPU partner seat 2) banked as rec/v1 recordings, each
  replay-verified vs the sim — hash-exact 20/20, won 20/20. Dataset JSONL
  221k rows: 32 seat senses + expert pad + swing-intent label; committed
  format README + sample (`data/plaicraft/`, bulk regenerable).
- Train (`npm run plaicraft:train`): one 32-24-24-5 BC net (1517 weights,
  quantized BEFORE scoring), fixed hparams, seeds 0..11 practice / 100..107
  held-out scored ONCE. Held-out: **8/8 wins — full parity with the CPU**
  (avg lvl 10; score 121,306 vs 111,275; +1 partner death). Teacher-forcing
  97.8% moves / 100% swing-intent held-out ≈ practice (97.7%) → generalises,
  no route memorisation.
- Seat: `Gauntlet/model.js` (featurize/forward/createModelPolicy — one
  definition shared by export, trainer and live seat) + generated `policy.js`;
  **M seats the BRAIN in Gauntlet slot 2**; sources() reports kind 'model';
  `__gauntletTest.seatBrain(on)` for QA.
- Gate: `npm run plaicraftcheck` 7/7 incl. dead-weights mutant (98.4→74.5%) —
  proven able to fail. Parked MANUAL_CHECKS (~40 s per run); ciscope selftest
  green. `/research` write-up page renders the single held-out scoring +
  honest notes. QA polish pass filed: **#1636**.
Also: **finished #1570's orphaned ship record** (merged as #1633 by the dying
23:28 session): prod-verified (`_yawRebase`/`_twist` live), labels
building→shipped, live URL commented; issue was auto-closed.

## Ladder record (slot a)
Warden target #1624: `forge-claim.sh 1624 a` REFUSED — slot b claimed it
23:19Z. Normal ladder: no steer/jonq/next; oldest game-queue #1625 claimed
clean. (Slot b shipped #1634 WATCH meanwhile — both pilots landed the same
night.) Rule 4 debt broken: #1635 + #1633 + #1634 are all game code.

## Playable now
Gauntlet with the trained brain (M on hero select); WATCH key in MYST,
Emberwood, SSX (#1634); Magic Carpet; RobotLab 4a; MYST through item 16.

## Next (priority order)
1. game-queue is empty. Ladder falls to oldest unclaimed feedback — #1636
   (PLAICRAFT polish: phone touch-path to seat the brain, model identity,
   brain attract demo, modelId stamp) — or a flagship stage per #1258.
2. #1624 is closed by #1634; nothing owed.

## Gates/commands as of this session
gauntletcheck 304/304; lint:gauntlet clean; plaicraftcheck 7/7 + mutant;
ciscope selftest green (131 pins, 156 checks); build OK; eslint clean on all
new files (App.jsx carries a pre-existing react-hooks error, outside every
gate scope).

## Notes for the next slot
- Trainer gotcha (remember): biases are a COMPACT block (cumulative no) — never
  index them by the weight-block offset: undefined reads → NaN gradients → net
  trains to "always idle" at a suspiciously stable 0.7337 (= the always-false
  baseline). Stable accuracy on a fresh net is a smell; mutant gate is the cure.
- Local Chrome STILL flaky for heavy pages: chromesmoke passes (shell+sp) but
  `gauntletplay` SIGABRTs this box (both tries, #737 class). Node gates carry
  the proof; rule 3 — don't spend a PR on it.
- `. /tmp/forge/env.sh` mandatory (system DNS dead); gh via the rescue shim.
- node_modules `cp -R` from the main checkout is APFS-instant for worktrees.
- Worktree `~/Dev/retrogames-forge-plaicraft` detached at origin/main; branch
  deleted both ends — reuse or remove. This lane's dev server on 5173 (kill
  only if orphaned + merged).
- Slot b's uncommitted session-143 STATE (its step 9 report) was folded here;
  copy parked at /tmp/forge/STATE.a.prevreport.md.

## Open questions
None.
