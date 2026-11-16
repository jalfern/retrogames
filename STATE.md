# STATE — session 306 (2026-11-16, slot a)

## Playable now / what shipped
- **MISSILE BATTLE — two-player alternating batteries live (#2473 → PR
  #2475, merge `e5fff02`).** Verified on www 13:22 UTC (`denySeat` found in
  served chunk `index-EexXijTg.js`). jalfern.com/retrogames/missile-battle:
  - **The arcade's second console:** waves alternate whose sector burns — P1
    cyan west (cities 0–2 + west battery), P2 amber east, middle battery a
    shared reserve either defender mans. `waves.js` scripts are never
    re-authored; `retarget()` folds every entry (incl. bomber drops) onto the
    defender's side (`SECTOR_TI` + `W − x0` spawn flip). Deterministic,
    zero-random.
  - **Per-seat ledgers** (kills credit the wave's defender; clear bonuses
    split per seat), **seatOut + survivor rescue** (fallen sector's tubes are
    manned by the survivor; both sectors dark = the war ends), turn-pass for
    eliminated seats.
  - **CPU seat first** (Jon's rule): attract **M** cycles SOLO → YOU + CPU
    SEAT → 2 HUMAN. The autopilot drives seat 2 with the same `decide()` that
    proofs the attract demo; on its waves the human console is DARK (the
    arcade's dead second panel). One shared aim control — no second pad.
  - **Solo byte-safe:** every law short-circuits on `!g.twoP`; the seat/ledger
    rides `stateHash` only when duo is on (`amoExt` pattern).
- **Ladder honesty (#2485, merged `7311910`):** `parseGaps` now skips
  `**BLOCKED**` bullets — the mirror of `**CLOSED by #n**`: honest prose stays,
  but fidelity-blocked gaps stop scoring for weakestStage. BOULDER DASH gaps
  1–2 (amoeba corner-priority/reactivity law; pull — a faithful non-feature)
  marked BLOCKED with unblock conditions (BD II source/frame study in-repo, or
  Jon asks). Gap 3 (bearer variants) stays LIVE — multi-carry is supply
  arithmetic a lane may attempt. Verified effect: `idle-kick.mjs` now answers
  `KICK GARDEN GUARD 0 weak` — the blocked shelf sinks on its own.

## Gates
- missilecheck **593/593** (was 503): +56 ALTERNATING pins (seat parity,
  sector map incl. drops, gate/reserve/lockout, seatOut+rescue+both-dark,
  turn-pass, proven duo run, ledger sums, hash fold, duo determinism) + duo
  slack (BOTH SECTORS HELD at 9/battery) + 3 new named mutants (seatGate,
  retargetOn, ledgerOn) — all die.
- missileplay **37/37 live** (was 28): real-keys duo section — M wheel,
  denySeat on the sector line, dead console on the CPU watch, amber ledger
  pays up; zero page errors.
- attractcheck 694/694 (one FAIL fixed — see catches); jonqcheck 147 (+2
  BLOCKED pins); neverbudry 29/29; eslint + 3 scoped gates + build +
  muteguardcheck green; static green; Vercel Ready; prod chunk verified.

## BOARD at exit
- game-queue / next / steer / waiting-jon: empty.
- building: **#1711** PLAICRAFT S1 (big-build, platform lane — steps 2–4 are
  b's per the #1711 handoff; acceptance = Jon's phone take).
  #2470 (HOMEBODY queue) shipped by slot b (c7c0c03) and closed; #2473 and
  #2485 (mine) closed+shipped; VIPER PIT net-select shipped (#2479, slot b's
  resume of a corpse — its session folded twin-resume duplication #2484→#2482).
- building-qa (QA lane's own churn): #2447/#2449/#2474/#2478 at b's exit,
  #2449/#2460 at mine. feedback: **#2482** (VIPER PIT net-select polish, b),
  **#2483** (MISSILE BATTLE 2P polish — seat ceremony, dual city columns,
  visible autopilot, denySeat chirp, rescue beat — mine).

## Next (slot a or b, in order)
1. Fresh ladder → expect `KICK GARDEN GUARD 0 weak`. Slot b already verified:
   GardenGuard's score-contributing README gaps are SOLVER DISCLAIMERS —
   per #2391 verify the gap is player-visible, then treat honestly (classify
   or decline; don't burn the stage on an NA).
2. If #1711 lands its physical acceptance (Jon's clapping take),
   `DEV_PORT=<own> npm run plaicraft:grade` posts the verdict by itself.
3. Watch: nightly runs FULL viperpitcheck — the relay now forwards `pick`,
   so IronRing #1761 can be proven live once QA takes #2478.

## The session's catches
- **Claims are advisory — and slot b was alive.** #2470's claim came back
  REFUSED (b's checkpoint 3 min old, PR mid-CI); ran the ladder instead.
  b shipped its own. The system worked; the warden's "builder a idle" kick
  landed on an issue already in flight — check `gh pr list --head` first.
- **attractcheck pins attract layout:** exactly one raw `<p>` in an attract
  block (the PRESS prompt). New attract lines must be block `<span>`s like
  the WATCH hint, not paragraphs. (Red static #1 = a MODE `<p>`.)
- **Prod verify for lazy games:** `jalfern.com/retrogames/` 308s to www —
  curl needs `-L`; game chunks are named `index-<hash>.js`; local and CI
  hashes differ across environments, so verify by sweeping the live index's
  chunk list for a NEW STRING, not by hash equality.
- **Rule 8, broken by me:** the first verify loop polled a redirect-swallowed
  fetch 40× (~40 min wasted) because every probe returned the same empty.
  Identical empty results twice = diagnose the probe, don't sleep on it.
- **Don't write the future in a comment:** #2473's ship comment claimed the
  BD gaps "now marked BLOCKED" before the PR existed, and overshot (three vs
  the honest two). Correction posted on #2473; land the claim with the merge.
- **Carried from slot b's exit (folding, #1430):** their warden double-kick
  made two slot-b resumes ship one game (twin merged first; the loser's
  `gh pr merge` exits 1 AFTER a successful merge — verify `gh pr view
  --json state,mergeCommit` before retrying anything); after any warden-kick,
  re-read the issue + `gh pr list --search <branch> --state all` first.

## Open questions
- none open (see #2485 for the BD unblock conditions; if Jon ever holds BD II
  footage/source, "ORIGINALS — BOULDER DASH" is a real stage again).
