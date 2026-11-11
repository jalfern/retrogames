# STATE — session 220 (2026-11-11, slot a)

## Shipped this session
**LODE RUNNER-LITE: a live chain** — PR #1993 squash-merged as `b54680f`
(Closes #1991). THE ROPE (vault 2) now hunts with TWO guards (wing spawns
x29/x24). The original's trap-ladder signature pays in actual play: a runner
carving the col-9 shaft by the ladder can catch both hunters in one closing
brick — n=2 pays 1500 (double + stratum) where a single grave pays 1000.
Live at https://jalfern.com/retrogames/lode-runner (content-proven: BFS over
67 prod chunks found `29:"G",24:"G"` in THE ROPE chunk).

Proof: lodecheck **125/125** (+10: pair contract shelf>=4 / ROPE>=2,
two-wing pursuit receipts, LIVE-CHAIN scenario — scripted real inputs from the
real spawn, no hand-placed bodies), `--mutate` **153/153** (14 mutants dead,
NEW `rope=one guard` kills the live-chain + receipts), watchcheck
lode-runner **249/249**, lodeplay **32/33** — the lone fail is today's
headless-Chrome AudioContext device flake (parallel slot-b logged the
identical error in papersplay, different game; re-ran twice, same; advisory).

## Ladder trail (how #1991 was picked)
TARGET #1989 claim **REFUSED** (slot b held it, claimed 10:03Z) → normal
ladder: no halt, no steer, `next` #1711 stays Jon-side (#1730 Hold — R2
hardware, all lane-doable lines shipped, 7 confirms), game-queue empty, QA
MASTER live so feedback borrow refused, flagship stage spent (SSX/Emberwood/
COMET DRIFT HD/Myst READMEs gap-free) → NEVER-DRY `weakestStage` score 6 for
LODE RUNNER-LITE (1 QA feedback #1949 + 5 unowned gaps; PapersPleaseMin and
TalkMeDown held by other lanes) → filed #1991, claimed, built, shipped.

## Next queued (slot a)
1. **Fresh ladder** at session start: halt/steer/next/queue games-first.
   `next` #1711 remains Jon-side (needs his R2 bucket).
2. **#1637 batch 26 (WATCH)** — the issue is open, my slot's claim lapsed.
   Unseated titles with no proven driver: Asteroids / DonkeyKong / Centipede /
   Pitfall. b24/b25 template: lift whole tick → Node sweep with pinned floors
   → seat (Y + blips + never-linger) → watchcheck pilot + source pins →
   README honest gaps. Expect ~3 h for one driver — budget a full session.
3. Frogger/LODE polish go through QA unless asked directly (#1019 rule);
   pair-review notes for LODE added on #1949.

## Notes for the next slot-a session
- LODE pair doctrine: sim.js was ALREADY N-guard (meta.guards array, per-id
  clocks, chain ladder) — the gap was layout + proof only. The live-chain
  script (lodecheck `CHAIN_SCRIPT`/`liveChain`) carves col-9 from the real
  spawn; both hunters must cross the mouth while the runner stays reachable
  (guards FREEZE the instant the runner hangs — hang is not a lure, it is a
  freeze). Timing law: a guard buried in the deep shaft enters >=~15 t after
  the bottom dig; earlier arrivals climb out at guardTrap=60 < refill=75.
- If the pair breaks any of: per-vault witness (must stay win clean),
  determinism, or slack — re-run 125/125 AND the 14 mutants together before
  touching geometry (the b24/b25 lesson, now with the pair contract added).
- lodeplay's zero-page-errors check counts AudioContext device errors; today
  several lanes hit it on macOS headless Chrome. Not game code — rerun once
  and move on; if it persists across days, that's a harness-ticket, not a
  game fix (rule 6).
- Slot b shipped PPM crowd #1994 (`5e4203f`) this same shift — the shelf's
  two newest titles both got their honest-gaps top rung dug out.

## Open questions
- None. (No taste/priority call needed from Jon; #1711 already waits on him
  via #1730.)
