# THE FORGE — playbook for an unattended game-build session

You are one session of a recurring, unattended loop that builds retro games for
jalfern.com/retrogames and publishes them. One session = at most ONE game.
`AGENTS.md` is the law; this file is the procedure. If the two ever conflict,
AGENTS.md wins.

## Session procedure

1. **Read `STATE.md`, then `git pull --ff-only origin main`.** If the working
   tree is dirty, STOP and report (the previous session died mid-edit; do not
   guess what was in flight).
1b. **Resume before you claim.** `git fetch --prune` and look for a
   `building` issue with a pushed `forge/<slug>` branch — a dead session's
   corpse. If one exists: check out that branch, read the issue's last
   `FORGE:` comment and `git log` to see how far it got, and **continue the
   build**. Do not claim a second issue while one is half-built.
2. **Claim a game.** Candidate order: any issue labeled `next` first
   (Jon's manual override), then the oldest `game-queue`. ALSO scan open
   issues whose title starts with `GAME` but carry NO label — external
   submitters (from the /forge board) cannot apply `game-queue` themselves;
   GitHub silently drops labels a submitter lacks triage rights for, so an
   unlabeled `GAME —` issue IS a queue entry. Adopt the oldest unlabeled
   `GAME —` issue if it predates the labeled queue head, and say so in your
   claim comment.
   Claim it: `gh issue edit <n> --add-label building --remove-label game-queue
   --remove-label next` and comment: `gh issue comment <n> -b "FORGE:
   claimed <date>"`. If the candidate list is empty, STOP — nothing to
   forge; say so in STATE.md and exit.
3. **Design in one paragraph** (core loop, the one harness you'll demand of
   it, the game's own `README.md` if it's a big one). Respect the issue body —
   it names the engine muscle the request wants stretched.
4. **Build it** per the AGENTS.md conventions:
   `src/games/<Name>/index.jsx`, register in `src/config/games.js`, fixed
   internal resolution, fixed timestep, attract mode, `?` PauseOverlay,
   `VirtualControls` with tap-to-start (`pointerdown`) so it is playable on a
   phone, all art/audio synthesized at runtime (no assets).
   **Mount `src/utils/DebugKit.js`** (DEV-only F1 panel: live state, cheat
   buttons, and for puzzle/level games a PROGNOSIS action that re-runs your
   own solver on the LIVE mutated state — "can this still be won from
   here?"). The kit exists because Jon found a "winnable" level Jon could
   not win; the panel is how the next such bug gets named in seconds, not
   issue threads.
   **The slack rule:** winnable-by-perfect-solver is not humanly winnable.
   Your Node harness must re-solve every level with ONE fewer of every
   supply the winning script consumes — it must still win. Zero slack is a
   build failure (`lemcheck`'s slack loop is the reference implementation).
5. **Harness.** Write `scripts/<name>check.mjs` (Node-first where possible —
   the heistcheck/zorkcheck pattern beats any browser check), give it an
   `npm run <name>check` alias, and prove it can fail: break one load-bearing
   line by hand, watch it go red, restore.
6. **Drive it for real** (headless Chrome, real key/tap events only):
   it must start, play, die and restart with zero page errors, and the drawn
   sprite must match the logical state after every input.
7. **Gate:** `npx eslint <new files>` + the three scoped lint gates + build
   green. Then ship, the ONLY allowed merge path:
   ```
   git switch -c forge-<slug> && git add -A && git commit -m "<NAME>: <summary>"
   git push -u origin forge-<slug>
   gh pr create --base main --title "<NAME>" --body-file /tmp/pr.md
   gh pr checks --watch --fail-fast && gh pr merge --squash --delete-branch
   ```
8. **Verify prod:** poll `https://jalfern.com/retrogames/` assets until the
   bundle hash contains the new game; comment the live URL on the issue;
   `gh issue edit <n> --remove-label building --add-label shipped`.
9. **Rewrite `STATE.md`** (<150 lines): what shipped, next queued game,
   three questions for Jon. Commit STATE.md to main ONLY if the forge game
   merged this session (`git commit` on main is otherwise forbidden — if no
   game merged, leave STATE.md written but uncommitted and say why in it).

## Hard rules (each one learned in a postmortem)

- **Checkpoint to the pushed branch after every working increment** —
  design note, engine core, levels, harness, menu wiring: each gets its own
  commit pushed to `forge/<slug>` the moment it passes `node`/`eslint`.
  A session that dies then leaves a decodable corpse, not vapor. Update the
  issue with a `FORGE: <what's done / what's next>` comment at the same time
  (that comment is the session handoff).
- One game per session. If a game isn't mergeable in this session, leave the
  branch pushed with a draft PR marked **WIP: <what's missing>**, keep the
  `building` label, and exit — never merge a red/WIP PR (AGENTS.md #5).
- Never `--no-verify`, never force-push main, never stack a PR on an
  unmerged branch (AGENTS.md, "Don't stack").
- Time-box: 4 hours max, then report (AGENTS.md #6) even mid-game.
- If the same CI check fails your PR three times in a row: stop, write the
  diagnosis in the PR, exit. A human decides the fourth attempt.
- If 3 consecutive forge sessions produce no merged game code, the loop is
  spinning — set issue title prefix `STALLED:` on the claim and stop for Jon.
- No network beyond GitHub, npm, and docs you already use. No secrets, no
  hardcoded IPs (the 5.78.145.117 lesson).

## What "done" looks like

A game Jon can open on his phone at `https://jalfern.com/retrogames/<slug>`
and play immediately — tap to start — with a harness that has proven it can
fail.
