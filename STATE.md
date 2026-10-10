# STATE.md — 2026-10-10 (MetroidLite session end)

## Where things stand
**METROID-LITE is built, green, and in PR** (#68, branch `forge-metroid`,
5 commits). Fifth forged game, 21st title. A hand-carved 2D cave-run:
beam/crack, bomb/bulkhead, and a SPACE-JUMP shaft of 80 px half-shelves
(double-jump-only) up to the relic — every gate proven load-bearing in Node,
every verb proven in a real Chrome tab with real keystrokes.
**On merge, it goes live at jalfern.com/retrogames/metroid.**

| since last STATE | what |
|---|---|
| #68 / `forge-metroid` | METROID-LITE full build: sim core → renderer shell + registry/CI → Node harness (46 checks, 7 mutants all caught) → Chrome harness **23/23** |

## What is playable right now
- Everything on jalfern.com/retrogames (unchanged) + `/metroid` one PR away.
- `/metroid`: arrows move, Space/Z jump (variable height, key-up cut), X fires
  the beam once owned, Down+X drops bombs, `?` pauses; attract mode replays the
  planner's proven route; beacons save, spikes kill, death re-spawns at the beacon.

## What changed this session (the parts that matter next time)
- **`step()` takes EDGES, not held-state**: `inp.jumpEdge/jumpCut`. A Node
  probe that passed `jump` held-state produced a silently flat trace — that
  is how to tell "harness bug" from "game bug" here: replay the exact tick
  script in plain Node first. It found every SJ miss.
- **SJ harness cadence (works on attempt 1)**: down@t0, up AT apex t0+19
  (vy~0 so the cut is a no-op), down again t0+22 (gap survives CDP merge),
  drift t0+24..32, land. Node jitter-band scan says the window is P@{-1,0,+2}
  ticks — narrow but real; the block retries up to 3 real attempts (no
  shortcuts). A wider catcher shelf at x109 was tried and REVERTED: the
  planner's PATTERNS are tuned to the exact original geometry and 45/46.
- **Parallax proof = two cameras, one star.** In the hall a star visible on
  screen has `wx < cam`, so its cam-rate pixel ALWAYS wraps off-screen — a
  cam-rate cheat probe cannot exist there (comment in metroidplay). The
  2-camera prediction is the rate proof. L1/L2 have k=0 PINNED into the
  hall sky window (sim.js `starWorld`) because random stars give zero
  candidates in that 304 px band. Walk bursts are 10t / steps ≥35 px so no
  camera window is skipped.
- Attract `hist` now logs dead/end — cheap, and it makes a frozen-body trace
  readable without a debugger.

## Gates (all green at HEAD)
`lint:metroid` clean · `metroidcheck` 46/46 (7/7 mutants die) · `build` ✓ ·
`metroidplay` **23/23** (not a CI gate — advisory, watch its SJ cadence if
physics constants ever move).

## Next (for the next session — do NOT re-debug these here)
1. Merge path ONLY: `gh pr checks --watch --fail-fast && gh pr merge --squash --delete-branch`
2. Verify prod: `open https://jalfern.com/retrogames/metroid` (Vercel deploys on merge).
3. Issue #68: progress comment + `shipped` label.
4. Then claim the next queue item — do not polish MetroidLite further unless
   `metroidplay` goes red.

## Three questions for Jon
1. `/metroid` keeps the Metroid skin name — rename to something original
   ("Cave Hunter") before it gets SEO'd into the site?
2. Attract mode replays the same proven route forever (like Sonar). OK, or
   should it loop with a different seed/route?
3. The SJ check is the only harness check with retry attempts; if CDP gets
   worse on CI someday — bump attempts, or pin the schedule to the demo
   script's own inputs? (Demo-script-driven = fewer real keys, same proof?)

## Lineage
AGENTS.md rules honored: one goal, harness-that-can-fail (7 mutants),
world-seconds in drivers, no direct main pushes, no AI backend. Session did
NOT stack PRs and touched `src/games/**` every commit (rule 4 satisfied).
