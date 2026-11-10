# STATE — session 195 (2026-11-10, slot a)

## What shipped
**WATCH batch 17 — HOMEBODY seats the attract brain** — squash `96eee3e`
(PR #1892, Part of #1637). Y / ▶ WATCH drives `autoStep` (bot + advance — the
exact call the attract demo runs and peoplecheck's WINNABLE section grants the
lifetime wish with) in place of drivePad+advance every sim tick; the bot
re-decides from live state, one brain with the gate (watchcheck carries the
no-forked-brain pin: autoStep from its own sim.js — and the witness pin).
Every release path (Y, driving key, canvas tap, end of run) clears `s.demo`,
so autonomy is the seat's, not the house's. Attract: shared hint + one-tap
▶ WATCH. Registry line suffix "grants the wish tends the whole street".

**The batch's real lesson (mid-build):** Beezee's prover-only trap repeats.
Fern-chat, co-presence bonds and ambience hours bank social/content for an
IDLE street — needs/content rises are NOT prover-only here. The pilot proves
advance only with demo-gated commands (a buy: items↑/money↓; a clock-in; the
payday after work) and asserts the idle street buys nothing and works nowhere.
The mutant that taught this: seat feed cut (`autoStep`→`advance`) — an
early naive signal set still passed wake/resume. Killed 7 named gates; restored.

Evidence (full battery green before merge): watchcheck 648/648 (56 pilots;
homebody pilot 17 gates incl. idle-purity, demo-flag on/off, steer-takeover,
re-seat through payday, silent racer release, one-tap), watchphonecheck
402/402 (tripwire 55→56), watchpillcheck 187/187, peoplecheck 124/124,
contractcheck 682/682, attractcheck 694/694, sleepwatchcheck 314/314,
homebodydrive 25/25 zero page errors, eslint + lint:mario/fps/ai + build
green. Prod verified: chunk `index-DtTK5MYC.js` carries the registry line.
Live: https://jalfern.com/retrogames/homebody

## Session bookkeeping
- TARGET #1880 (Talk Me Down remote seats) REFUSED at claim — slot b holds it
  live. Normal ladder: no halt/steer/queue; `next` #1711 hardware-gated;
  QA MASTER live (no feedback borrow); #1637 re-claimable (slot a's own claim
  aged past 90 min) → batch 17 claimed, built from origin/main, shipped.
- #1637 is multi-stage ("Part of #1637") → stays open + `building` for batch
  18; no close. Wrap + prod-URL comments posted on #1637.
- Merge done with the rule-5 path (static SUCCESS); worktree re-detached at
  `96eee3e`. Slot b merged around the same window (main moved mid-merge; the
  rule-5 loop handled it cleanly).
- No jonq filed (nothing taste/priority/hard-to-undo this session).

## Next queued (slot a)
1. Fresh ladder: TARGET from the warden, else the game-first rungs. `next`
   #1711 stays hardware-gated; watch for it clearing.
2. If #1637 is re-claimable (batch 18 = next solver-bearing title not yet
   seated — 56 seated now): check claim liveness first (slot b may roll it).
   Un-seated candidates worth auditing for a proven driver: Defender (has an
   attract autopilot, no test hook yet), SpaceInvaders (attract sim), and the
   DOS/IF remainder; titles without a proven driver stay honest ("no guide
   yet") — do NOT seat a panic bot.
3. #1880 was slot b's live build; check whether it shipped before touching.
4. Fresh `weakestStage` if the ladder runs dry again.

## Notes for the next slot-a session
- Worktree `~/Dev/retrogames-forge-watch-b17` is detached at the merged tip;
  node_modules symlink intact — `git checkout -B forge/<newslug> origin/main`
  for the next build. Dev server 5173 was left RUNNING (vite from this
  session) — reuse after verifying its cwd, or kill and restart.
- **Checkpoint rule bites again:** mid-session `git checkout -- <file>` (to
  undo a sed mutant) wiped ALL uncommitted work in that file and the session
  nearly rewrote blind. Mutants: revert with the exact inverse sed, never git
  checkout, and commit each increment BEFORE mutating (FORGE hard rule).
- watchcheck per-game pattern that works now: seat + pilot + demo/honesty
  gate pinned in BOTH browser and source pins + witness pin (the batch's own
  audit module) + phone tripwire bump + full battery.
- Homebody time model matters for pilots: 1 sim-hour = 5 real s, payday 17:00
  ≈ 50 s from a 07:00 boot — re-seat polls must span the shift's end (50 s).

## Open questions
- None. (#1637 continues as batch 18; no taste/priority call needed from Jon.)
