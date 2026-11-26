# STATE — forge board snapshot (slot b, 2026-11-26 — ASTEROIDS's successor: the INVADERS march learns to tick)

## This session — TARGET refused (correctly), never-dry shipped
- Warden TARGET #3565 (PONG RANGE) was **REFUSED at claim** — slot a held it
  live (claim 19:40Z, checkpoint 30 min old at kick). Not a corpse; yielded.
  Slot a shipped it later the same night.
- Normal ladder: steer 0 · `next` #1712 waiting-jon · game-queue 0 · only
  unheld feedback #3568 (ASTEROIDS polish) — QA-borrow blocked (QA MASTER live
  ×2). Flagship stage spent → NEVER-DRY: honest `idle-kick` answered
  `KICK SPACE INVADERS 0 weak`; verified before building: #3547/#3555 closed,
  no open issue owns gap #0, picker score 4 = 4 unowned gaps, registry #2.
- **SHIPPED (#3573 → PR #3578, squash `d89070c`): the machine-step march.**
  Wall releases whole 2px steps (carry in `marchAcc` keeps average px/tick
  exactly the #3517 law — drift 1px/600t); lands flush on the wall before
  every drop-and-reverse (speed-proof clamp — the cabinet's jerk); descending
  four now fires on `marchEvents` edges — one shared clock, parallel
  metronome deleted. Thin fleet sprints >1 step/tick (2.6 at wave 9 n=1).
- Proof: invaderscheck **104/0** (§13 = 9 granularity gates) · `--mutant`
  **19/19** (4 new: off-grid width, carry deleted, clamp deleted, metronome
  returns) · WITNESS 20/20 clean 0 deaths, floors re-anchored 1500→1560 /
  150→155 with measured truth (step phase adds <1-step arrival lag; deletion
  mutants die at 1651/1732/2007) · invadersdrive 8/8 real Chrome, zero page
  errors · eslint + lint:mario/fps/ai + build green.
- Prod verified: token `marchEvents` in live bundle `index-BX-_DTOg.js`
  (~4 min after merge; first poll attempts failed because jalfern.com 308s to
  **www** — prod-token probes need `curl -L`, worth remembering).
- One 30-second fix mid-flight: mutant anchor `let nSteps` vs shipped
  `const nSteps` — anchor-missing failures name themselves, good design.

## BOARD facts at close
- game-queue = 0 · building = 0 (PONG #3565 closed by slot a) ·
  building-qa = #3564, #3566 · this session filed #3573 (shipped+closed) and
  **QA polish #3582** (drop wave-stepper, README phantom line, per-column
  ripple adjudication, waveform, juice).
- Rule-4 satisfied (game code merged twice tonight across slots).

## PLAYABLE on main right now
- SPACE INVADERS — the march ticks in 2px machine steps with flush wall
  contacts and the four notes landing on the ticks:
  https://jalfern.com/retrogames/space-invaders
- PONG RANGE switch (slot a, #3565). ASTEROIDS learning saucers (#3553).
  DEFENDER hot-seat 2P. PONG cabinet voice. ADVENTURE exact seam.

## Open questions (links only — #605)
- #3335 — QA music-bus low-pass (AWAITING, Nov 27).
- #3516 — Arkanoid art rung (AWAITING, Nov 28).
- #3054 — TestFlight recorder; #2971 — contra polish; #1712 — PLAICRAFT S2.
- No new jonq questions this session (all calls were measured law/harness,
  none of taste).

## Next claims (for whoever is free)
1. Next weakest via honest `idle-kick` — ASTEROIDS kiting adjudication and
   snapshot/restore (#391 law) remain heavy candidates behind #3568's list.
2. README-phantom sweep: several READMEs carry stale-but-open gap lines
   (SpaceInvaders bonus-life one named in #3582 item 2); if a kick names
   shipped history, mark CLOSED/DISCLAIMER, don't build.
3. DONKEY KONG barrels-mid-air-over-ladders — still the smaller real fix.

## Slot state at handoff
- Slot-b dev server :5178 stopped via `scripts/devstop.sh` at close.
- Worktree ~/Dev/retrogames-forge-si-march-steps DONE (merged #3578; safe to
  prune next session). Main checkout re-pinned detached at origin/main.
- STATE.md ships via this docs PR and parks with `statepark.mjs park b`.
