# STATE — session 109 (2026-11-03, slot b)

## Shipped this session
**WEIGHT SURGERY demo (#1493 → PR #1504, squash `0fd93f8`, live verified)** —
demos-lane ship. Honest reproduction of MIT CSAIL weight-space programming
Exp-8 on pinned Qwen3.5-0.8B (rev 2fc06364), CPU-only (this box's Metal/Chrome
dead, #737 family: built llama.cpp v0.3.0 `-DGGML_METAL=OFF`, ~200 t/s).
- Baseline: 36/36 train problems hit cap 1024; held-out base math 0% acc /
  8.8% terminated, GSM8K 1.2% / 0%. Card L856 loop warning fully confirmed.
- Own direction-ablation layers 15/19 down_proj K=64/256/3584 (0.017–0.98% of
  weights): NEGATIVE at every K — k3584 coherent but rambles longer. Sequence-
  mean write at a 1024 horizon ≠ MIT's 32k tight-loop attractor.
- Harness trap caught: presence_penalty 2.0 "fixed" practice 12/12 — the flag
  was DUPLICATED (1.5 still present). Clean rerun 0/12. Fixed in llm.py.
- No gradients; ~24 fwd batches ≤50; held-out scored once, after practice-only
  selection; MIT's model never opened; weights out of git (scripts + edit
  reports + full batch log committed in demos/weight-surgery-lab/).
- Page: jalfern.com/retrogames/demos/weightsurgery.html (+ index card).
- Shift report pushed. #1493 closed shipped.

## Board (end of session)
- main = `0fd93f8` (+ this STATE). Slot-a shipped ROGUE (batch 14, session 110)
  and SSX #1497 (#1503) during this window — strong parallel week.
- #1473 stayed slot-a's (my claim REFUSED 06:28Z, fresh lock; ladder → #1493).
  After ROGUE: SpaceInvaders already done (fb2512d!) → batch-15 candidates per
  session-108 ranking minus shipped: Centipede (2) → Pong (6) → the big ones
  (Defender/Asteroids/Frogger/Pacman/MissileCommand/Adventure/SuperMario/
  RaccoonHeist). js-dos/ifvms shells out of scope.
- Open: #1473 (slot-a), #1492 (waiting-jon AWAITING, deadline 11-05, default B
  — do NOT re-ask), #1141 (stalled, Jon), #838 (lane:games, not adoptable),
  #795 pulse, #737 (waiting-jon), #549 parked. Flagship README gaps: all owned
  or closed (session-108 audit).
- Rule-4: NOT tripped — demo shipped this session; last 4 merges all game code.

## Notes for the next lane
- ENV (this box, all verified working now): llama.cpp v0.3.0 CPU-only build at
  /tmp/llamacpp-src (brew llama SIGABRTs without Metal). mlx-lm 0.32.2 works
  with `mx.set_default_device(mx.cpu)` (Metal kernels JIT-fail: MTLCompiler-
  Service unreachable). pip: `--proxy http://127.0.0.1:18229 --trusted-host
  pypi.org --trusted-host files.pythonhosted.org`. HF: large files need
  `/resolve/` not `/raw/` (LFS pointers). `pkill` broken here — kill via
  `ps aux | grep [x] | awk '{print $2}'`. llama-cli needs `--single-turn`
  (+ stdin /dev/null) or it REPLs forever; default is conversation mode.
- Lab lives at ~/Dev/weight-lab/qwen-forge (venvs .venv mlx / tvenv torch;
  GGUFs f16 ×4; weights must stay out of git). Follow-on ideas (longer-horizon
  capture, repeat-onset d, o_proj/unembed ablation, full MATH-500, MIT-edit
  comparison row) are in demos/weight-surgery-lab/README.md — worth a demos
  issue if the lane ever goes idle again.
- QA borrow not needed: game-queue non-empty (#1493 was there; now empty —
  next ladder may land on feedback/pulse; check live).

## Open questions
- #1492 — slot-b feed on #1473 (link only; body on GitHub).
