# Postmortem: an unattended local-model run on retrogames (Sep 2026)

**Setup.** Qwen (a local "flash" model) worked on this repo without supervision for about
24 hours. The main goal was Raccoon Heist, a 3D raccoon stealth game (the idea comes from
Simon Willison, the "pelican riding a bicycle" person). A second goal was making the games
play themselves. The run opened and merged its own PRs (#29 to #51).

**Summary.** It did a lot of real work, found real bugs, and was honest about failure.
Then it spent its last day or so making its own browser test pass on slow CI machines,
and didn't move the game forward. Nothing destructive happened.

## What it did

| When | Work | Result |
|---|---|---|
| Sep 13 | Super Mario 1-1/1-2, autopilot, neuroevolution AI, IronKeep FPS, self-checking harness | Worked. Mario's autopilot is the clearest "game plays itself" success |
| Sep 16 AM | Deleted the dead AI features (they called a server that no longer responds). Built the `src/ai/` spine (sensor → brain → loop). Zork brain that learns the map by walking | Found 4 real bugs: all DOS games broken in dev, keyboard capture dead, WebGL canvas read back black. Zork maps 13 rooms in Node. The in-browser AI button never went green |
| Sep 16 PM | Raccoon Heist: three.js, 3 jobs, guards with view cones, crew of 3, art and music generated in code | Playable and live. One 6.5k-line PR |
| Sep 16 eve | Jon playtested and dictated feedback → `FEEDBACK.md` queue → fixes | **Best stretch of the run.** Visible padlock, fixed strafe, solid furniture, being caught became survivable |
| Sep 17–18 | PRs #44–#51: making `heistplay` pass on CI at 1–5 fps | A loop. Each fix revealed the next red, almost all in the test driver, not the game |

## By the numbers (Sep 16 onward)

- Game and AI code (`src/`): ~9,800 lines added
- Test and probe scripts (`scripts/`): ~5,100 lines. `heistplay.mjs` (2,410 lines) is
  bigger than the engine it tests (2,018)
- Markdown: ~3,000 lines across five docs that were appended to and never rewritten
  (duplicate commands, "0a" used twice, "1b" three times)
- Still true at the end: jobs 2 and 3 have never been played, a walking-only player has
  never been tested, and guards never speak

## What went wrong

1. **The gate became the goal.** "CI is green" replaced "the game is fun to play". Each
   step made sense locally (a red check, a careful diagnosis, a fix to the driver, a new
   diagnostic, a "trap" written up), but the steps didn't add up to anything.
2. **The gate could flake.** GitHub runners render graphics in software, at 1–5 fps. A
   real-time browser playthrough on that machine was always going to fail on timing,
   and fixing timing races in the harness has no bottom.
3. **No stopping rule.** Nothing ever said "done". With no goal to reach, the agent kept
   working on whatever was red.
4. **Test code outgrew game code.** The ratio was a visible warning sign that nothing
   was watching.
5. **The docs piled up.** Each context reset meant re-reading ~2,800 lines of
   append-only notes, which costs a small local model more than a large one.
6. **"Self-play" drifted.** In Mario, the AI was a player. In Heist, it turned into a
   test driver whose job was to prove assertions.
7. **A red PR landed.** #35 was titled "gate is red, do not merge" and was merged anyway.

## What went right (keep these habits)

- It reverted failed attempts and wrote down why ("hypotheses already falsified").
- It never lowered a gate to get green (though #35 still landed red).
- Its commit messages are real diagnoses. They're worth reading as archaeology.
- Its handoff docs got it through context resets.
- Human playtest → feedback queue → fix was fast and effective.

## Next time

1. **One outcome and a stop condition per run**, e.g. "jobs 2 and 3 can be completed
   by walking; then stop and report."
2. **A tripwire:** if 3 PRs in a row don't change game code (`src/games/**`), stop and
   ask the human.
3. **Deterministic gates only.** Node checks (`heistcheck`, a Node simulation with a
   manual clock) block merges. Browser playthroughs are advisory and run locally.
4. **Scheduled human checkpoints**, around every 4 hours: a build, what changed, and
   three questions for Jon.
5. **One state file (`STATE.md`), rewritten each session, at most 150 lines.** Anything
   older goes into git history, not into the file.
6. **Branch protection on `main`:** required checks, so red PRs can't merge.
7. **A reviewer that isn't the worker.** A second instance with fresh context reads the
   last few PRs and answers one question: is this moving toward the goal?
8. **Keep self-play separate from testing.** A game-playing bot is a feature with its
   own demo ("the bot clears job 1 on the live site"), not part of the test suite.

## Where the history lives

See [`archive/qwen-run-2026-09/README.md`](archive/qwen-run-2026-09/README.md): the
original docs, the tag `qwen-run-2026-09-end`, and the `archive/qwen-*` branches
(including the uncommitted WIP found in the tree).
