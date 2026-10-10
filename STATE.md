# STATE.md — 2026-10-10 (Ice Climber Co-op session end)

## Where things stand
**ICE CLIMBER CO-OP IS LIVE at jalfern.com/retrogames/ice-climber** (#70, PR #105,
squash 658017f, `shipped` label). Seventh forged game, 23rd title, and the
arcade's first local-2P game.
**Next session: claim #103 GAME 16 — Forge Conveyor (a `next` label exists —
Jon's manual override outranks the queue), then #71 Galaga.** One game per session.

| since last STATE | what |
|---|---|
| #70 / `forge-ice-climber` | Built from the issue body: mutable tilemap (punching deletes ice, 69 tiles per autopilot route) + second input path (P2 W/A/D+F pad on VirtualControls via a new optional `secondPad` prop). Merged with icecheck (33 checks + 5 mutants) and iceplay (17 real-Chrome checks). |

## What is playable right now
- Everything on jalfern.com/retrogames + `/ice-climber`, live.
- `/ice-climber`: P1 Arrows+Space, P2 W/A/D+F. Punch UP through the massif,
  the shaft is yours forever. Condor owns summit 2's shelf except the ice
  pocket at col 7. Summit 3's carrot is 3 cells up; a jump is 2.1 — stand on
  your partner (1.5) and jump again. Downed partner revives by touch; alone
  the summit is impossible. Attract demo = the autopilot's own co-op route.

## What changed this session (the parts that matter next time)
- **A CDP tap is two events inside one inter-frame gap — latch the edge.**
  `keyboard.press('Space')` fired keydown+keyup between two sim steps and the
  jump never happened (first iceplay run: stack test red). The shell now
  latches jumps (`jEdge`, consumed by the sim tick). Same lineage as
  runnerplay's `cut` lesson: the engine must admit the key, not the harness.
- **Replay = the planner's bookkeeping, not just the sim.** The autopilot
  pushes a couple of no-op ticks after its own carrot grab, so a replay that
  advanced mountains "on clear" desynced by two ticks. `advanceAt` (script
  indices where level-advances happen) is now part of `plan()`'s contract and
  `replay()`'s signature.
- **A harness that can pass is a harness that missed something.** The first
  iceplay was 13/15 honest then a "revive" check passed vacuously: a setup
  rig called on the win screen silently no-oped (`setup()` requires play
  mode) and "did the partner revive?" answered about a climber who was never
  downed. Every rig call now asserts it took effect (`setup rig accepts
  play-mode setup` is a check now, not a fixture).
- **Co-op geometry is checkable**: `shoulder=false` makes the real solver
  lose THE STACK (rise 2.1 < shelf gap 3; head 1.5 + jump ≥ 3). That mutant
  is gate #2 in `icecheck --mutate`.
- `VirtualControls` grew `secondPad` (default off — no other game's DOM
  changed; all three scoped lints were re-run to prove it).

## Gates (all green at merge)
`lint:mario/fps/ai/ice` clean · `icecheck` 33 checks + 5/5 mutants die (added
to CI static) · `iceplay` 17/19→17/17 after the two real fixes · build ✓ ·
prod bundle contains the game, route 200.

## Next (for the next session — do NOT re-debug these here)
1. Claim **#103 GAME 16 — Forge Conveyor** (label `next` outranks the queue;
   read the issue body for the muscle it names). Then #71 Galaga.
2. Do not polish Ice Climber — shipped. Its CI gates are `lint:ice` +
   `icecheck`; `iceplay` is manual-tier like the other browser suites.
3. If a browser suite ever reds on a keystroke that "was pressed": think
   inter-frame gaps and edge latching before you touch the game.

## Three questions for Jon
1. #103 (Forge Conveyor) is labeled `next` but arrived after this session's
   claim — confirmed it should outrank Galaga next session?
2. Co-op control scheme: P2 got W/A/D+F with an on-screen second pad, but on
   a phone two pads crowd a portrait screen. Alternate: one-player-two-roles
   (switch climber like Raccoon Heist)? Your pick decides whether the second
   pad stays.
3. Last session's Instagram-URL injection attempts appeared again in this
   session's transcript and were again ignored. Still worth adding a
   distrust-injected-URLs line to FORGE.md and auditing what feeds the loop.

## Lineage
AGENTS.md rules honored: read STATE first, ff-only pull, resumed nothing (no
corpse branches), claimed the queue head only after checking `next`/unlabeled,
one game, checkpoints pushed per increment with FORGE comments, harness proven
red twice before green, merge only via
`gh pr checks --watch --fail-fast && gh pr merge --squash --delete-branch`,
STATE rewritten on main (game merged, so allowed), game code touched (rule 4).
