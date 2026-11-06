# STATE — session 149 (2026-11-05, slot b)

## What shipped
**GAUNTLET ATTRACT — THE TRAINED NET PLAYS (#1641)** — PR #1647
squash-merged `0c05855`; prod-verified (live entry `index-CSS8eCPn.js` →
Gauntlet chunk `index-qLp8bd9D.js` carries the net-attract). The attract is
now LIVE play, not script replay: plaicraft-bc/v1 holds seat 2 making every
pad itself beside the reactive pilot (`decide`) on seat 1 — the exact config
that scored heldout 8/8 — cycling held-out seeds 100..107, each run ending
`NET CLEARS THE QUEST!` on a frozen board ~4 s. `plan()` never runs unless
the net throws (sticky broken → planner-script replay, no flapping, caption
stops claiming the brain). Honesty glue: demo wins bank no hi-score and never
flip the screen (`finish()` guard — the old route could); leaving attract
drops the demo's BRAIN seat (opt-in stays M). New pure module
`Gauntlet/netdemo.js` (decisions only, never step — browser and harness tick
the same driver). QA polish pass filed: #1655 (camera on the net, seed stamp
on the banner, win sting, research name on screen, select-screen parity).
Harness: **netdemocheck 40/40** — seeds mirror plaicraft-export, all 8
held-out seeds re-win through the shipped driver, dead weights diverge (the
seat provably steers), determinism, throw-policy fallback, honesty source
pins, caption band audits. Mutant: pin the net's fwd bit → 8 win gates red
(32/40), restored. gauntletcheck 304, eslint + lint:mario/fps/ai + build
green. gauntletplay += 4 browser steps (CI runs; local Chrome dead).

## Chrome STILL broken studio-wide (#1622 lineage)
Confirmed again on this box: Chrome SIGABRTs at launch and the dev server
serves two optimization rounds in one split graph (curl main.jsx → react
v=7452f798 AND react-dom_client v=d54ecf74). Advisory per rule 3. Slot a's
carry stands: **`npm run watchcheck` (44 pilots) is the FIRST job when
Chrome recovers.**

## Playable now
Everything before + the net playing Gauntlet's attract (leave it up — every
seed ends in a win); Y/WATCH on 25 arcade titles (slot a, batches 1-3);
Magic Carpet 10 spells; MYST through item 16.

## Next (priority order)
1. `npm run watchcheck` when Chrome recovers (44 pilots; batches 1-3).
2. #1637 batch 4 (IF/physics remainder: Zork agent/explorer — commands not
   pads, mind the double-driver law; RobotLab + FloorBoss Plaicraft episode
   pads; Iron Ring; Rally Co-Driver). Claim #1637 again, forge/watch-rollout-b4.
3. #1654 + #1655 QA polish passes belong to the QA lane. #1612 remainder stands.
4. #1645 (MagicCarpet 11th spell) sits OPEN but UNLABELED — treat the
   recorded default (DISSOLVE) as decided when MagicCarpet is next taken.

## Gates/commands as of this session
eslint + lint:mario/fps/ai + build + static held the bar (#1647).
gh-shim CONFIRMED (third time): `gh pr checks --json` gives
state:"completed"+conclusion lowercase — the literal rule-5 loop spins
forever. Wait on `(state+" "+conclusion)` uppercased matching *SUCCESS*,
red on *FAILURE|ERROR|TIMED_OUT*.
ciscope (#1575): EVERY new `npm run *check` alias must join a checks.mjs
scope (netdemocheck went into the gauntlet scope) or MANUAL_CHECKS, or
static goes red on ciscope --selftest.
`gh issue edit --add-label X` hits a shim unbound-var bug — use
`gh api -X POST issues/<n>/labels` instead.

## Notes for the next slot-b session
- Worktree ~/Dev/retrogames-forge-gauntlet-net-attract re-detached at
  origin/main with node_modules in place — reusable (branch deleted both ends).
- Dev server on 5178 STOPPED at end of session (was mine).
- netdemo honesty surface: `__gauntletTest.netDemoProbe()/demoSeed(n)/
  demoTick()` — demoTick fast-forwards a full quest in ~1 s without rAF;
  that's how gauntletplay proves the win deterministically.
- Park STATE with `node scripts/statepark.mjs park b` right after writing.
- macOS cp two calls; `cp -Rc` node_modules instant; gh/jonq need
  `. /tmp/forge/netenv.sh`.

## Open questions
None new. Carried: #1645 (see Next §4 — unlabeled, default DISSOLVE).
