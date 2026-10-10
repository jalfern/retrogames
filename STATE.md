# STATE.md — 2026-10-09 (Boulder Dash session end)

## Where things stand
**BOULDER DASH is LIVE at jalfern.com/retrogames/boulder-dash** (#66, PR #94,
squash 21739e2). Third forged game, 19th title. A cellular-automata cave: dig
dirt, gather the gem quota, reach the exit before the clock — while boulders
crush you, dropped gems turn to dirt, and a firefly chains steel-respecting
flame through the rock. Four hand-carved caves, each *proven* winnable by a
planner that ships in the repo; the attract demo is that route, replayed.

| since last STATE | what |
|---|---|
| #66 / PR #94 | **BOULDER DASH shipped** — CA sim → carved caves → Node gate + mutation harness → real-key Chrome play → merge → prod verify, one session |

## The loop in one breath
launchd → `scripts/forge.sh` → `opencode run` → claim (`next` > oldest
`game-queue`) → build per AGENTS.md → harness that provably fails → real-input
Chrome play → merge ONLY via
`gh pr checks --watch --fail-fast && gh pr merge --squash --delete-branch` →
verify prod bundle → relabel `shipped` + comment URL → rewrite this file.

## What's playable NOW
19 playable titles + 9 emulated classics at jalfern.com/retrogames, plus
`/forge`. Queue heads (oldest first): **#67 Sonar Roguelike → #68 Metroid-lite
→ #69–#79 → #82 BensMagicBugLife** (`gh issue list --label game-queue`).

## What BOULDER DASH is, in one line
`src/games/BoulderDash/{sim.js, levels.js, index.jsx}`: a pure-Node CA
(bottom-up gravity/roll, gem→dirt on landing, a timed fire-chain automaton, a
fixed-cycle firefly that ignites everything but steel) + the planner + a 12 Hz
canvas shell. `npm run dashcheck` is the CI gate — 47 checks: the planner wins
every cave with hazards live; dig-reachability proves the quota + exit are
solvable by construction; deterministic replay + a dropped-move tamper; and rule
pins (a **resting** boulder spares you, a **falling** one crushes; gem→dirt; roll
off a ledge; fire chains then burns out and dies at steel; firefly moves+ignites;
the quota binds the exit). `--mutate` silences each engine rule in a child and
**all 6 mutants are caught**. `npm run dashplay` is Chrome with real keys only —
19/19: attract is live, arrows dig/move and the pixels follow, the driver presses
the planner's arrows to fill the quota, reaches the exit, HUD == sim, a loosened
boulder crushes the digger through the real CA, a key restarts, zero errors.
New CI steps: `lint:dash` + `dashcheck`.

## Flags for Jon (hard-won, cheap to read)
- **Every red I hit was a test bug, not a sim bug — three times.** The dashcheck
  reds were a probe that double-counted events (`step()` clears `g.events` at its
  start, so player events live in the slice, not the whole buffer), a roll
  detector that missed a rock that rolled *then* fell in the same tick, and a
  "steel blocks fire" pin whose steel wall stopped at the cave edge so the chain
  correctly walked around it. AGENTS' "harness must be able to fail" again cut
  both ways: it failed on the harness, and **zero sim lines changed** to satisfy
  a red. The engine was right the whole time.
- **Level design is the real puzzle.** The first caves failed because a 2D gem
  scatter let the honest route dig a support out from under its own paydirt, so
  gems fell→dirt and the cave became unwinnable. Fix was structural, not a
  planner hack: harvest gems are always supported on solid dirt and reached
  laterally, and the fell/roll/convert/burn `proves` drain on their own in
  isolated pockets at tick 0 — so each mechanic is proven LIVE without the win
  gambling on dodging it. Fire is boxed behind steel (the wall is the lesson).
- Determinism is structural (no RNG anywhere), so the attract replay is trivially
  reproducible; the tamper probe (drop one move → different hash) is what keeps
  that honest rather than vacuous.
- Streak check (AGENTS #4): last two PRs both changed `src/games/**`
  (#93 Lemmings, #94 Boulder Dash). Streak clean.
- Dev server stopped; tree clean; `origin/main` = 21739e2.

## Three questions for Jon
1. Boulder Dash's real grief is digging greedily and getting crushed by the gems
   you just turned to dirt. Want a visible "this seam is unsafe" tell (a subtle
   floor tint under a floating rock), or keep it silent and let the first buried
   run teach it the classic way?
2. The caves are hazard-bounded so the CI gate stays green; the firefly can't
   actually kill you (its fire never crosses steel). Want a fifth cave where the
   fire DOES threaten the harvest — accepting a slower, luckier planner and a
   throttled `dashplay` — or is "hazards present, win never a coin flip" the
   right contract for a forge-shipped title?
3. #67 Sonar Roguelike is the next queue head (hidden-information BFS + a
   fog/echo audit) — good next muscle, or take #68 Metroid-lite (side-scroll
   exploration, existing platformer debt in SuperMario) first?
