# STATE — session 126 (2026-11-04, slot b)

## What shipped
**ADVENTURE soft-lock fix + #1556 playtest — MERGED** `4ab5f89` via PR #1559
(QA-borrow: ladder dry, feedback #1556 free, no live QA session at claim).
- Black Castle approach from OW3 while its gate closed dropped the player at
  y=8 INSIDE the gate rect — pinned all four directions, permanent soft-lock
  (the win-script masked it by teleporting y). Fix: `dewedge()` nudges every
  room-transition landing below the obstruction; gate law untouched (a new law
  proves standing below a closed gate never enters).
- adventurecheck 59→67 (+8 soft-lock laws), 15/15 mutants die (incl. new
  "remove de-wedge" mutant → RED). Gates: eslint, lint:mario/fps/ai, build green.
- New evidence harness `npm run adventure-playtest` (#1556 deliverable):
  novice random-walk 300 seeds → 34.7% dragon deaths (Yorgle 60, Rhindle 44,
  Grundle 0 — correct gating), median survival 1653t, 0% wins, 0% sword-borne
  deaths; skilled route 100/100 wins at tick 1648; single-slot finding: sword
  blocks key/chalice pickups → sword routes must park & re-arm.
- Mobile pad audit (issue part 2): touch path complete — VirtualControls
  Arrow/Space synth + canvas pointerdown start/restart. No gameplay gap.
- **Spun off #1560** (feedback, lane:qa): the bat can NEVER change rooms —
  inner bounce `x∈[10,140]` runs before the `x<2 / x>GW−8` room-change checks,
  unreachable. Its item-swap signature is dead (measured 1 room/10000t ×20
  seeds). Fix needs steal-recovery on the scripted win route first.

## Same cycle, other lanes
Slot a closed **the seedpin rollout #1473**: b23 total-coverage law (83/83),
b24 strict-shape ratchet 13→0, rollout COMPLETE; ADVENTURE #1551 bridges +
secret room (#1555, slot a/QA-mini); #1547 demos verdict (#1558). Jon filed
**#1557 himself: "Next builder milestone after seedpin rollout closed?"** —
answer it with a title proposal, not a re-ask (#1544 also stale-open).

## Board (end of session)
- Ladder dry: no game-queue/next/steer/halt; feedback = #1560 (fresh, for QA
  lane — builders may borrow if QA dead, but its fix wants a steal-recovery day).
- building: only #1141 (Jon, stalled). building-qa: #1547.
- Flagship README gaps: ZERO open (SSX/Emberwood/CDHD/Myst, parseGaps-verified
  by hand — every bullet CLOSED-by-#). flagshipStage → null.
- main tip `4ab5f89`; main-ok true; #1556 closed+shipped; #1560 open.
- Slot b port 5178 never started (clean). Worktree retrogames-qa-1556 removed;
  main checkout detached at tip, STATE.md only dirty file.

## ENV (carry-forward)
- `. /tmp/forge/env.sh` for gh+proxy; push via `-c http.proxy=http://127.0.0.1:18080`.
- Fresh worktrees have NO node_modules: `ln -sfn /Users/jon/Dev/retrogames/node_modules <wt>/node_modules` — lints/build work instantly.
- Vite entry hashes are NOT reproducible local-vs-Vercel — verify prod by
  `gh api repos/.../commits/<sha>/check-runs` + deployments (Production for the
  merge sha) and route 200, not by hash equality. www.jalfern HTML via node fetch
  through the shim is fine but small cached bodies are the proxy answering.
- `gh pr list` unsupported by shim → `gh api repos/.../pulls?state=open`.
- Chrome still dead (#737) — browser tier advisory; sim-tier Node is the gate.

## Open questions
- (none filed — #1557 is Jon's own question to the studio, not a jonq)
