# STATE — 2026-10-13 (forge session END)

## SHIPPED: EXCITEBIKE (#176 → PR #189 → squash bf0b458 — LIVE in production)
jalfern.com/retrogames/excitebike — verified live: the deployed bundle carries
`/excitebike`; dev play 23/23; CI `smoke` browser 23/23 (real Chrome).
The 1984 motocross on a hand-carved heightmap. The throttle is a risk: hold it
and you go faster, hold it too long the engine BOILS and drops to a limp. Every
jump is a real ramp off the terrain — go airborne and the bike answers only to
your weight, so you lean it to meet the slope you land on or eat dirt. Mud and
water drain speed and can stall you outright; the pump (SPACE) is the ONLY way
out of the water (drag 0.034 > high-gear accel 0.026, so throttle alone
re-stalls forever). Two circuits vs rival pace lines; attract = the autopilot's
own proven lap, replayed tick-for-tick. All art+audio runtime; no assets.

Gates (static CI): `excitecheck --mutate` = 80 checks + 9/9 mutants die —
boost, water-stall, immortal engine, free nose-down landing, frictionless mud,
un-feathery brake, the crash-mash, free over-rotation, gate-never-lifts. Its
spine: the heightmap is audited for jump-recoverability (every ramp a rider can
actually land); the race ledger is recomputed from booked events; the slack rule
re-wins with a colder engine budget. `exciteplay` 23/23 in smoke, real keys
only — pixels land at `g2s(alt)`, arrows tip the pitch in the air, a held
throttle boils, a drained clock ends the race.

## Playable now
Full arcade incl. EXCITEBIKE, Spy Hunter, Wizardry, Paperboy, Minesweeper,
Raccoon Heist, Galaga, Dogfight, IronKeep, Mario, Zork+AI, + the rest of GAMES.

## Session report (rule 7)
**Playable now:** EXCITEBIKE, live on the site, phone-playable (d-pad up=gas/
lean-back, down=brake/lean-forward, A=hop/pump, B=GEAR).
**What changed:** +5 game files (levels/sim/planner are the harness's own
modules, imported unchanged in Node), the React shell + VirtualControls,
excitecheck (Node gate) + exciteplay (browser), `lint:excite` + `excitecheck
--mutate` in the static gate, `exciteplay` in smoke, registry entry (builtBy
forge). The two commits then the YAML fix and the harness fix rode the same PR.

## Lessons this session (baked into code comments)
- **The sim's actuator and the shell's actuator must match.** The sim leans on
  `inp.u`/`inp.d` (airborne only); the shell only ever sent `{g,b,j}` — so the
  player could not lean and the on-screen help ("↑ leans the nose up in the
  air") was a lie. Fixed: the arrows carry both meanings (gas/brake on the
  ground, the rider's weight in the air). A help line is a spec — grade it.
- **Tick-count every probe.** The `brake=9` mutant drove `v→0`, and a water
  probe advanced its loop `for (x=…; x+=g.v)` — an infinite loop at zero speed.
  Never advance a probe's loop variable by sim state a mutant can zero.
- **A wall-clock budget is a measurement of the machine.** `exciteplay` asserted
  the pump worked if it took `< 30` SPACE taps; a slow CI runner delivers fewer
  sim ticks per keypress and the bike re-stalls, so it needed 30+ while the GAME
  was fine. Rewrote to grade the OUTCOME in world terms: does the bike drive
  past the far edge of the water. (AGENTS already says this; I tripped it anyway.)
- **A parked bike in water re-stalls forever** — faithful, but it means the
  browser "pump" test must also hold throttle, exactly like a real rider.
- **An unquoted `: ` inside a GitHub Actions step `name:` silently zeroes the
  WHOLE workflow** (0s, no jobs, opaque "workflow file issue"). Parse ci.yml
  with `js-yaml` before pushing. RECOMMEND: a tiny static check that ci.yml
  parses and every `npm run X` it names exists — would have caught this free.

## Queue / next session
1. **Head of queue: #177 — The Legend of Zelda.** Behind it: #187 — Super Mario
   Kart. Two real games queued (no longer empty). Zelda is a much bigger spec
   (overworld, dungeons, items, enemies); scope it honestly to one session or it
   won't finish. Claim the OLDEST (#177) per FORGE step 2.
2. The law: only `static` blocks merges; ONE merge command
   (`gh pr checks --watch --fail-fast && gh pr merge --squash --delete-branch`);
   3 non-game PRs in a row ⇒ stop and report. (This session shipped game code —
   counter 0.) Main checkout is detached at origin/main; work in a worktree.

## Open questions for Jon
1. Excitebike shipped with the arcade's *lean* on the same arrow keys as
   gas/brake (context: airborne vs ground). Is that the right feel, or do you
   want a dedicated lean control on desktop while keeping the shared d-pad pad?
2. Two stages/tracks per the issue scope. The arcade loops MOTOCROSS faster; a
   third track is a new carve. Queue a loop, or leave two?
3. Should I add the ci.yml YAML-parse gate to the static job now (small, and it
   is the exact trap that cost this session a red CI run)?
