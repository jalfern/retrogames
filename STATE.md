# STATE — forge board snapshot (slot a, 2026-11-25 — GRIND CITY GETS ITS LIPS)

## This session — one ship, landed
- Warden TARGET **#3284** REFUSED at claim (slot b held it live, checkpoint 9 min
  old — b shipped it as PINBALL TABLE SMITH #3291 mid-my-session, good). Normal
  ladder: no steer, `next` #1712 waiting-jon, `game-queue` empty, only actionable
  feedback #3272 but two QA MASTER sessions live (mini+studio) → no borrow →
  **never-dry**. Live `idle-kick` = `KICK GRIND CITY 0 weak` (score 6).
- Gap 0 (replay free-cam) **declined as owned**: #3233 lists "replay options" in
  its title and repeats the gap in its body — only ":" vs "." broke the mechanical
  ownsGap match. Built gap 1's real core instead — the three things NO open issue
  names: grabs on grinds, lip tricks, stalls → filed **#3289** (why-weakest +
  decline note), claimed, shipped via PR **#3293** merged `399e62c`.
- **RAIL GRABS** — hold B latched: FEEBLE (forward) / CROOKED (fakie). Double
  trickle (+12 vs +6/0.15 s), balance drift damped ×0.55, 0.30 s hold before
  release commits (+70, unique → mult grows). Mashing never pays; bail commits nothing.
- **COPING STALLS** — ↓+A at a coping lip (kinds 'coping', ≤0.9 m lateral,
  ≤0.75 m vertical — coping sits ~0.7 above deck/roof surfaces, pool lips ~0.06):
  tail locks on the rail line, speed 0, +8/0.15 s trickle, tighter meter
  (|bal|>1.15) shown as body lean; A pops chain-alive, commits +40+80×s, 4 s
  auto-pop. ↓+A away from a lip = plain ollie — no dead combo.
- **Honesty**: zero new physics surfaces (`railClosest/railAt` reused), `packIn`
  6-bit wire untouched, autopilot never B-mid-grind/never ↓ (win line provably
  identical, honesty-counter pin), `stateOf` additive (`railGrab/stall/stallT/stallBal`).
- Proof: grindcheck **ALL GREEN 65 pins (+16)** + **ALL MUTANTS CAUGHT 8/8**
  (new `grab`/`stall`); gcdrive **DRIVE GREEN** with 6 live legs (stall locks at
  speed 0, cam cuts action, meter leans 0.23, pop pays 201 chainPts; Feeble
  engages, trickle 100→224); contractcheck 857/857; eslint + 3 gates + build green.
- Prod verified: `GrindCity-DZKKTBY4.js` carries Crooked/STALL/railGrab/stallBal;
  play at `/retrogames/grind-city`. #3289 shipped+closed; #3233 got a comment
  with 4 phone-discoverability items for the new verbs (QA tail).

## Harness lessons (worth one line each)
- ownsGap matches the gap's OPENING 40 chars — a QA paraphrase ("only:" vs "only.")
  silently kills ownership and phantom-kicks the next lane. "When unsure, treat as
  owned" outranks a mechanical KICK; decline + say why on the POLISH issue.
- Coping rails float ~0.7 m above their deck surfaces: any lip-zone tolerance must
  cover coping height (0.75) or the verb only works on pool lips. Pin every rail
  kind you promise.
- A diagonal rail cannot be latched cross-line (the crossing happens while rising,
  outside vertical tolerance) — fakie pins/drive legs ride axis-aligned coping.
- jalfern.com apex 308s to **www.jalfern.com** — prod-marker probes must follow
  (`-L`/www) and must wait for the Production deployment record, not just sleep.
- Announce nothing before the job is verifiably running — one "drive is green"
  sentence named a probe that had never been launched. Start it, read it, then speak.

## PLAYABLE on main right now
- `/retrogames/grind-city` rail grabs + coping stalls (#3293) atop the roof line,
  gems, replays, bed; `/retrogames/pinball` TABLE SMITH editor (#3291) +
  tilt-to-nudge (#3296) + kickback + attract show-off; `/retrogames/tidal-rush`
  grabs/flips/handstands (#3285/#3278) + rooms/spectate (#3227/#3253/#3265);
  `/retrogames/skyward` storm-cell drift line (#3272 items 2–3), mario-kart TILT,
  marble-rush tilt+trick-hop, comet-drift pair, ssx, marble-madness, pacman,
  mario, minesweeper/garden-guard/homebody, TIDY BOT, STARRY NIGHT, TOP SOLDIERS,
  DOUBLE DRAGON, RACCOON HEIST, spy-hunter, iron keep, galaga, missile, pucks,
  mines, zork, ultima, king's quest, Joust, Q*bert, forge board.

## Board watch (facts, not questions)
- `game-queue` empty; `next` #1712 waiting-jon (not a work item).
- Feedback: #3272 skyward tail (items 2–3 shipped, tail open), #3281 tidal tricks
  tail, #3233 grind-city tail 2 (now + the #3289 discoverability list), #3237
  pinball tail (items shipping fast — #3291/#3296), #3244/#2971 waiting-jon.
- QA MASTER sessions live on mini+studio today; builder claims must re-derive
  idle-kick LIVE (don't trust memory or this file).
- Merges today incl. #3270/#3271/#3273/#3274/#3275/#3278/#3279/#3285/#3286/#3288/
  #3291/#3292/#3293/#3294/#3296. main-ok green at my merge.

## Open questions (links only — #605)
- #3054 — QA: native TestFlight ports have no recorder/upload (lane:qa, AWAITING).
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).
- No new jonq questions filed this session.

## Slot state at handoff
- Slot a: dev :5173 stopped via `scripts/devstop.sh`. Worktree
  `~/Dev/retrogames-forge-grind-lip` removed clean by the merge cleanup.
- Main checkout detached at origin/main; this STATE.md ships via its own docs/state PR.
- Time-box: ~1 h 30 m of 3 h used; game merged, commit path earned.
