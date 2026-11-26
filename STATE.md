# STATE — forge board snapshot (slot b, 2026-11-26 — PONG gets the cabinet's laws back)

## This session — TARGET refused, ladder item shipped
- TARGET #3529 (PONG touch quit) REFUSED at claim — slot a held it fresh (their
  checkpoint 13 min old). Normal ladder: steer 0 · `next` #1712 waiting-jon
  (skipped) · game-queue had ONE item → claimed **#3532** (drop the ported
  paddle scatter, seedpin re-baseline). Slot a later SHIPPED #3529 mid-flight
  (PR #3534) — one README conflict at rebase, trivially resolved.
- **SHIPPED (#3532 → PR #3541 → `e3ff846`): PONG cabinet serve.** Scatter +
  spin dice gone (`paddleStart`/`paddleSpin` deleted; exactly two `rand()`
  calls remain, both serve — pongcheck counts and pins it). Deflection =
  strike-position law (`dy += SPIN_K·offset/half`, ±2 clamp, zero new
  entropy). Paddles HOLD across points; match start centers.
- Rule-8 finds en route (the pass's real gold):
  1. **Ceiling-park bug** — the unguarded wall-flip (`y<=0` re-test) parked
     the ball above the ceiling once kicks became deterministic (y≈−6.6, dy
     +2/hit, endless shuttle). Flip now direction-guarded (contact event, like
     the cabinet); penetration kept verbatim; `predictLand` shares the guard.
  2. **Flat-return deadlock** — centered returns → flat → forever (EASY seed 5
     0–0 at cap). Dice-free anti-loop floor `|dy| ≥ DY_MIN` (0.5) after returns.
  3. HARD collapsed 38→26 with dead-center returns — the DRIVER needed the new
     law, not the sim: `watchStep` now aims off-center (`AIM_RATIO 0.75`) at
     the wall farthest from the machine. HARD 38/40, NORMAL concessions halved.
- Proof: pongcheck **81/81** (serve-only seedpin script + dice-count + NEW
  §deflection + driver **40/40 con 15, seed 25 retired by name** + tiers
  **EASY 40/40 con 0 / NORMAL 40/40 / HARD 38/40 seeds 14+24 named** +
  predictor-vs-`stepBall` tick-for-tick incl. penetration band) · mutants
  **20/20 + 5/5 die** (7 new anchored on replaced lines: re-planted scatter,
  flat/sign-flip deflection, floor/guard removed, unguarded predictor, no-aim
  seat) · pongdrive **26/26** (incl. slot a's touch-quit legs post-rebase) ·
  watchcheck(pong) **318/318** · lint:mario/fps/ai + lint:pong + eslint + build green.
- #3502 VERBATIM trace RE-BASELINED at this head (diff-less ≡ NORMAL still —
  NORMAL is now the corrected table; README + PR + issue all say so).

## BOARD facts at close (~17:20Z)
- game-queue = 0 · building = 0 · building-qa = #3533 (QA's DEFENDER polish) ·
  feedback = #3545 (NEW: ADVENTURE wanderer heading, other lane) + #3536
  (PONG polish — I added a scope-update comment: strike-angle sound feedback +
  making paddle-hold legible on phones) + #3533 + #3244 + #2971.
- Other lanes shipped during my run: PONG quit #3534, dig-dug art #3539,
  invaders watch pilot #3542, adventure decoy #3543.
- Rule-4: slot b SHIPPED game code this session (#3541). No STALLED.
- #3532 closed + `shipped` + live URL. Prod verified via content marker
  `.dy<0` in bundle `index-C2MRbBPW.js` (exact-hash compare impossible — two
  lanes merged atop within minutes; the marker is absent from all pre-#3541 bundles).

## PLAYABLE on main right now
- `/retrogames/pong` — NEW: cabinet serve (no scatter, hold across points),
  strike-position deflection, QUIT chip on the pad (#3534), driver 40/40.
- `/retrogames/invaders` — wave laws (#3521) + aiming watch pilot (#3542).
- `/retrogames/adventure` — roam dragons (#3489) + armed decoy wait (#3543).
- `/retrogames/defender` — ridge race + wall veto (#3528). `/retrogames/rogue`
  — wounded flee (#3513). Plus prior shelf (dig-dug textured, pinball, skyward,
  tidal-rush, ssx, comet-drift pair, marble pair, galaga bee, mario-kart,
  ice-climber, pacman, mario, minesweeper/garden-guard/homebody, TIDY BOT,
  STARRY NIGHT, TOP SOLDIERS, DOUBLE DRAGON, RACCOON HEIST, spy-hunter, iron
  keep, missile, pucks, mines, zork, ultima, king's quest, Joust, Q*bert, forge).

## Open questions (links only — #605)
- #3335 — QA: music-bus low-pass in AudioController (AWAITING, qa lane,
  deadline Nov 27; gates PINBALL tilt-muffle — do NOT implement until answer).
- #3516 — Arkanoid art pass: one more texture rung, or done? (AWAITING).
- #3054 — native TestFlight ports have no recorder/upload (AWAITING).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).
- No new jonq questions this session (fidelity call was already made by the
  issue; no taste decisions left to me).

## Slot state at handoff
- Slot-b dev server :5178 stopped with scripts/devstop.sh at close.
- Worktree ~/Dev/retrogames-forge-pong-cabinet-serve prunable (all merged);
  main checkout stays detached at origin/main, never main-checked-out.
- GitHub 503s from yesterday did NOT recur; forge-merge rode a 15-min `static`
  wait to green cleanly.

## Next claims (for whoever is free)
1. Never-dry expected: run `idle-kick` FRESH — PONG's gap list just shrank
   (gap 0 closed, gap 2 closed by slot a; what remains: the score-knob and
   sound gaps). ASTEROIDS/DONKEY KONG/CENTIPEDE/MISSILE COMMAND/ROGUE tie the
   score-4 shelf — sanity-check each named index against its README + closed
   issues first (phantom class bit #3529 itself last session).
2. `PONG sound` is now the cheapest honest pick if kickers remain: strike
   deflection made hit-angle meaningful but the tone is still one pitch —
   owned by #3536 (QA polish), builders shouldn't steal it.
3. `invadersdrive` remains the browser-proof template for one-sim games.
