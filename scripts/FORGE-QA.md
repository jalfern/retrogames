# THE QA MASTER — playbook for an unattended feedback/QA session

You are one session of the QA lane: a second production line that runs
*beside* THE FORGE (which builds games). You fix bugs, triage feedback, and
make the site better — you do NOT invent new games. `AGENTS.md` is the law;
this file is the procedure. `scripts/FORGE.md` is the sibling lane — never
confuse the two queues.

## Parallel-lane rules (read twice)

- THE FORGE may be building a game in this same repo tree RIGHT NOW.
  **Before claiming, read the open `building` issue (game lane). You may
  not touch files in `src/games/<that game>/` or a branch named
  `forge/<its-slug>`.** Pick a different QA item instead.
- Never edit `STATE.md` (the forge lane owns it; two writers = a torn file).
- Keep diffs small and surgical. You share one GPU with the forge: a QA fix
  must not spin up heavy renders more than one browser at a time.

## Session procedure

1. `git fetch --prune origin` then `git checkout main && git pull --ff-only
   origin main`. If the tree is dirty: `git status` — if the dirt is
   untracked `/tmp`-style harness scratch, ignore it; if tracked files are
   modified, STOP and comment on the newest open `building`/`building-qa`
   issue what you found. Do not guess.
2. **Pick an item.** Open issues labeled `feedback` (not `building-qa`).
   Priority, highest first:
   a) a comment starting `/priority` — newest such comment wins
      (this is Jon's "/599 do this bug" from the website);
   b) most `+1` reactions; c) oldest.
   Also honour `/priority` comments on `game-queue` issues: if one exists,
   add label `next` to it (that is the forge lane's override) and say so —
   then continue with your own lane.
   No candidates → STOP (comment nothing; silence is the correct output).
3. **Claim:** `gh issue edit <n> --add-label building-qa` and comment
   `QA: claimed <date> — plan: <one line>`. Re-read the item and its comments
   first; someone may have added a `/priority` with details.
4. **Reproduce before fixing.** Use the repo's own instruments
   (`npm run verify`, `shot.mjs`, the game's `*check` script, or a plain
   Node run for pure-logic bugs). If you cannot reproduce, comment what you
   tried and stop — leave the label on only if you will continue next
   session; otherwise remove `building-qa`.
5. **Fix, gate, ship** — the same path as the forge lane: feature branch,
   a harness that can fail (extend an existing check; do not build a new
   framework), commit, `gh pr create --base main`, then ONLY:
   `gh pr checks --watch --fail-fast && gh pr merge --squash --delete-branch`
   Close the issue and comment the proof: what was broken, the check that
   now catches it, and the PR number.
6. **Time-box: 60 minutes.** If you cannot finish, push the branch, comment
   `QA: checkpoint <state>`, and exit — your next session resumes via step 1b
   of the claim scan (an open `building-qa` issue with a pushed
   `qa/<slug>` branch is always resumed before claiming anything new).
7. Report one line and exit: `QA lane: <done|idle|blocked: why>`.
