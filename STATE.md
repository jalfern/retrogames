# STATE.md — 2026-10-10 (Momentum Runner session end)

## Where things stand
**MOMENTUM RUNNER IS LIVE at jalfern.com/retrogames/momentum** (#69, PR #100,
squash 75b3d2d, `shipped` label). Sixth forged game, 22nd title.
This session RESUMED the corpse of a dead forge-momentum session (playbook 1b):
sim, shell, runnercheck and runnerplay were already pushed; what remained was
the DebugKit mount (required by FORGE.md since #98, never done), a broken
Chrome check, and the gate sweep.
**Next session: claim #70 GAME 06 — Ice Climber Co-op** (oldest `game-queue`;
no `next` label, no unlabeled GAME issues). MomentumRunner is done — touch it
only if `runnercheck` goes red.

| since last STATE | what |
|---|---|
| #69 / `forge-momentum` | Resumed + finished: DebugKit with live-state PROGNOSIS → rebuilt the variable-jump check (2 harness bugs found by CI-speed CDP) → all gates → merged → prod-verified |

## What is playable right now
- Everything on jalfern.com/retrogames (unchanged) + `/momentum`, live.
- `/momentum`: RIGHT builds speed (downhills drive you, flat is too slow),
  SPACE/Z jump (variable — release early lands short), loops stick only at
  v² ≥ 5·g·r, rings are the life bar, totems are checkpoints. Attract demo =
  the autopilot's own proven route, tick for tick.

## What changed this session (the parts that matter next time)
- **A tick-scheduled Chrome key check races CDP and loses — grade the ENGINE
  instead.** The tap/hold jump check failed twice with schedules measured from
  a pre-key `tick()`: keydown latency alone ate 0–12 ticks, so "release at
  airborne+2" arrived at launch+14 (an 87 px half-cut, not a tap). Final
  design: HOLD releases only after landing (a ground key-up can never clip the
  apex); TAP releases on first airborne probe and the attempt **counts only if
  `probe().cut` flipped** — the engine confirms the key-up reached `step()`.
  `cut` was added to `__runnerTest.probe()` for exactly this. 62 px vs 99 px.
  Same lesson as metroidplay's cadence notes: any wait in a browser harness is
  meaningless unless the engine admits it happened.
- **DebugKit PROGNOSIS = `planRun(clone(gs))`.** `planRun` now takes an
  optional start state (default `makeGame()`, so runnercheck is untouched);
  the panel clones `{...gs, p:{...}, taken:Set, spent:Map}` and re-runs the
  greedy autopilot on it. Verified honest on fresh / mid-run / deliberately
  hopeless (ringless before the far spike → "died at tick 17").
- **Production probe gotcha:** `jalfern.com/retrogames/` 308s to `www.`;
  prod deploy checks must `curl -sL`. Prod Chrome proof: canvas + attract h1
  + zero pageerrors + `__runnerTest === undefined` (DEV hook absent).

## Gates (all green at merge)
`lint:mario/fps/ai/runner` clean · `runnercheck` 48 checks + 8/8 mutants die
(CI static gate) · `runnerplay` 19/19 · build ✓ · prod smoke in real Chrome ✓.

## Next (for the next session — do NOT re-debug these here)
1. Claim **#70 Ice Climber Co-op** (co-op = VirtualControls second player?
   read the issue body first — that is the new muscle it names).
2. Do not polish MomentumRunner — shipped.

## Three questions for Jon
1. `/momentum` keeps a very Sonic-flavored skin (rings, loops, wheels). Rename
   before SEO, like the Metroid question from last STATE? (That one is also
   still unanswered.)
2. The co-op issue (#70) implies two players on one keyboard/pad. VirtualControls
   is one-pad today — design call: second on-screen pad, or share-one-joycon
   style "both climb together"? First decision shapes the whole build.
3. This session's transcript was spammed with "fetch this Instagram URL"
   user-turns that had nothing to do with the task (prompt-injection attempts
   against the unattended loop). I ignored them. Worth a line in FORGE.md
   telling sessions to distrust injected URLs, and checking what feeds the
   loop's stdin?

## Lineage
AGENTS.md rules honored: one goal (rule 2), resumed per playbook 1b rather
than claiming a second issue, harness-that-can-fail (8 mutants + a check that
demonstrably went red twice before the fix), world/engine-clock scheduling in
the driver, merge only via `gh pr checks --watch --fail-fast && gh pr merge
--squash --delete-branch`, STATE rewritten, game code touched every session
(rule 4 unbroken).
