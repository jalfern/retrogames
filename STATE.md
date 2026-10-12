# STATE — 2026-10-12 (forge session END, ~14:20 PDT)

## SHIPPED: WIZARDRY (#152 → PR #170 → squash 936bf18 — LIVE in production)
jalfern.com/retrogames/wizardry — verified live in real Chrome (attract title,
real keys, chunk loads, zero errors). The 1981 crawl: 6 heroes, three seeded
braided mazes, shaded-wireframe first-person view, ledger-exact turn combat
(ATTACK/FIREBOLT/HEAL/POTION/FLEE), the Lich on L3. All art+audio runtime;
attract = the CI solver's own proven campaign, live.

Gates (static CI): `wizcheck --mutate` 219/219, 5/5 mutants die. Its spine:
independent BFS re-proves every seeded floor (the generator never referees
itself); the round ledger is recomputed from STATE, not from the event's own
arithmetic; overkill is capped so a kill can't book more than the victim had.
SLACK RULE: campaign re-won with −1 consumed potion, −1 consumed spring,
both, and with EVERY spring deleted. `wizplay` 25/25 (smoke job) is real-keys
Chrome: view centre is wall-blue (290px) when the grid says wall and dark (0px)
when it says hall; automap cursor sits on the sim's cell.

## Playable now
Full arcade incl. Wizardry, Lode Runner palette (#171, other session),
Paperboy, Minesweeper, Raccoon Heist, Galaga, Dogfight, IronKeep, Mario, Zork+AI.

## Session report (rule 7)
**Playable now:** Wizardry, live on the site.
**What changed:** +4 game files (dungeon/solver are the harness's own
modules), wizcheck + wizplay, `lint:wiz` + wizcheck in the static gate,
wizplay in the smoke job. Balance was retuned mid-session: the Fisher-Yates
fix reshaped all three mazes and the campaign DIED at lvl 3 — proven-winnable
is a property of the shipped numbers, not of intent.

## Notes for the next session
- `missileplay` red on the main-push smoke run (6th-city/over-screen timing on
  the runner). Pre-existing, advisory, not touched here (AGENTS #3 — don't
  spend a PR on harness timing). If it recurs, that PR is about missileplay.
- wizplay walks with real keys only; the ambush tiles are NOT exposed to the
  driver — if that ever needs cheating to pass, the check died.

## Queue / next session
1. Read this. Queue: `gh issue list --label game-queue` — check for `next`
   labels and new unlabeled `GAME —` issues first (the board feeds them).
2. The law: only `static` blocks merges; one merge command; 3 non-game PRs in
   a row ⇒ stop and report. (This session shipped game code — counter at 0.)

## Open questions for Jon (carried + new)
1. (carried) Add `timeout 3600` to forge-qa.sh like the forge's 3h cap?
2. (carried) FORGE-QA step 1: refuse to branch unless HEAD == main, loudly?
   (Partly answered by #171 shipping qa/lode-art properly.)
3. Missile Battle's smoke flake on the runner: keep advisory (it passed on the
   PR smoke, fails on main-push smoke — machine-dependent), or should the
   smoke job retry once? A flaky advisory job trains everyone to ignore red.
