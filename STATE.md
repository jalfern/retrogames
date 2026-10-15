# STATE — forge session 2026-10-14 late (ARKANOID)

## Shipped this session
- **#233 ARKANOID MERGED** (PR #248 squash; CI green: static + smoke + Vercel).
  **Prod verified**: https://jalfern.com/retrogames/arkanoid answers 200.
  256x224. Six walls + DOH (eyes 3->5->7). Capsules L/S/D/C/B/E/+ ship exactly
  once. Pure deterministic sim (`sim.js`, zero Math.random, `stateHash` proven).
  The attract demo is the pilot's OWN proven run: full clear, 8/8 seeds,
  **zero deaths**, 15 eyes / 3 phases, replayed tick-for-tick through real `step()`.
- New CI static gate entries: `lint:ark` + `arkcheck` (30 checks + `--mutate`
  5/5 die). Advisory `arkplay` (Chrome, real keys): 10/10 green locally.

## Bugs the harness caught (worth remembering)
- StrictMode double-mount left a dead black canvas in the DOM — the arkplay
  pixel check found it; cleanup now removes the canvas element.
- The anti-stall "dry" nudge overrode the pilot's aim at every near-vertical
  bounce -> meta-stall. Nudges now only fire on true stalls (dry>=60) and only
  when |vx| < 0.2*sp (the pilot wasn't steering).
- DOH eyes were inset in the boss hit-rect -> circle-vs-circle could never
  fire (body bounce always first). Eyes pop on underside contact-x instead.
- Fortress layouts trapped the ball above a gold roof (70% of ticks up there)
  -> flood-fill rule: gold roofs must not seal; shipped a destructible roof.
- Mutants initially all "survived" — `planner.js` kept the cached pre-mutation
  sim module; verifiers must spawn fresh child processes (repo law restated).

## Queue (game-queue)
- #234, #235, #236, #237 remain. Oldest is #234 — next session claims it.
- QA lane: nothing open against ARKANOID; advisory tier already green.

## Three questions for Jon
1. ARKANOID's classic cabinet is two-player alternating — worth a follow-up
   issue, or is single-player + paddle physics enough for this arcade?
2. The pilot clears the fortress via gap-piercing "shaft mode"; a
   forward-simulated aim verifier would make it provably robust. File as a
   hardening issue or leave it (the flood-fill already pins winnability)?
3. `dry>=60` + the layout rules together took ~2.5 h of this session. Would
   a documented "round must auto-detect stall and offer nudge" contract in
   GAME-SHELL.md have helped, or is per-game tuning the right level?

## Housekeeping
- Worktree `~/Dev/retrogames-forge-arkanoid` sits on branch `state-2026-10-14`
  (this STATE update). Main checkout untouched (detached HEAD per Jon's rule).
- Dev server left running from the last arkplay — kill before next session if
  port 5173 is loud.
- Previous STATE parked at /tmp/forge/STATE.parked.md (superseded).
