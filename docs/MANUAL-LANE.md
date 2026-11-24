# MANUAL-LANE.md — working as a forge lane by hand

The forge is not the launchd jobs on studio. It is a protocol written in GitHub
(jalfern/retrogames): issues are the work, labels are claims and approvals, PRs
are the output, and `scripts/main-ok.sh` plus the rule-5 merge are the gate.
Anything that follows this page is a lane: a guest agent (Inkling, Gemini,
a Claude session) or Jon by hand. Starry Night (#3076 → #3082) shipped this way.

AGENTS.md in retrogames is the law. This page only adds what a manual lane needs.
Keep this file's path stable — Jon's guest-folder stub AGENTS.md fetches exactly
`https://raw.githubusercontent.com/jalfern/retrogames/main/docs/MANUAL-LANE.md`.

## Before you start
- `gh auth status` shows `jalfern`. If not, stop and ask Jon (never handle a token).
- A local clone: `git clone https://github.com/jalfern/retrogames ~/Dev/retrogames`,
  then `npm ci` inside it (npm >= 11; see AGENTS.md gotchas).
- Never edit or check out `main` in that clone. It stays detached at origin/main.

## The `lane:manual` label
Every issue a hand lane works carries `lane:manual`. It is more than a tag: the
fleet planner (`scripts/lib/lanes.mjs`) omits labelled issues from the automatic
builder ladder and from the QA queue counts, so the warden never kicks an
automatic lane onto your work, and the QA lanes never borrow it. The warden's
pulse line carries `manual=N` and the board
(https://jalfern.com/retrogames/forge) shows a MANUAL LANES section, so your
work is visible without touching anyone else's queue.

## The loop
1. **The issue.** Every piece of work has one.
   - New work: `gh issue create --label lane:<demos|games|platform> --label lane:manual`
     and **no** queue label (`steer`, `next`, `game-queue`, `feedback`). Queue
     labels hand work to the automatic lanes; a manual issue must not get one.
   - Existing queued issue: claim it first. Add **both** `building` and
     `lane:manual`, and comment `MANUAL (<who>): taking this`. Check nobody else
     holds `building` on it. `lane:manual` is not decoration here: the planner
     ranks open `building` issues at the TOP of the builder ladder (corpse
     resume, FORGE.md step 1b), so `building` alone hands the issue straight to
     an automatic builder — only `lane:manual` takes it out of their reach.
2. **A worktree of your own.**
   `git -C ~/Dev/retrogames fetch origin && git -C ~/Dev/retrogames worktree add ../retrogames-<name> -b manual/<name> origin/main`
3. **Bring the work in** by the repo's own rules:
   - a demo: `public/demos/README.md`, "Adding a demo". Self-contained, zero
     libraries, credits card (add a guest `builder: { tag, model, where }` and
     honest `issues`, `span`, `assist`), index card + `DEMO_INDEX` entry, a check
     script + npm alias.
   - a game: AGENTS.md, "Adding a game".
   - a port from somewhere else (three.js, Vite, a framework): rewrite to the
     rules above. Don't vendor libraries in as siblings.
4. **Prove it locally.** The demo or game's own check, `npm run creditscheck` for
   demos, the relevant `lint:*`, and `npm run build` green.
5. **PR.** `gh pr create --base main --body-file <file>`. The body leads with what
   it is and how you verified it, ends with `Closes #<n>`. Never stack a PR on an
   unmerged branch.
6. **Merge** only with the rule-5 command — `scripts/forge-merge.sh`, run from
   the PR branch's worktree. It refuses while main is red (`scripts/main-ok.sh`),
   waits on the required `static` check, squash-merges, and completes the branch
   cleanup `gh` skips; a red main freezes manual lanes too.
7. **After the merge:**
   - Detach the worktree: `git -C ../retrogames-<name> fetch origin && git -C ../retrogames-<name> checkout --detach origin/main`
     and delete the local side of the merged branch (`git branch -D manual/<name>`).
     A worktree parked on the merged branch name squats on it and breaks the next
     lane's merge.
   - Move the issue's labels: drop `building`, add `shipped` (the warden closes
     `shipped` issues for you).
   - Check the live page: `https://jalfern.com/retrogames/...` (Vercel deploys
     main in a few minutes).
   - Comment the live link on the issue.

## Don't
- Push to `main`, force-push someone else's branch, or merge any other way.
- Edit `STATE.md`. The automatic lanes own it; report on your issue instead.
- Take an issue that has `building` or `building-qa` unless the claim comment
  naming it is yours.
- Handle secrets. If a step needs a key, stop and give Jon the one line.
- Delete or overwrite anything you didn't create without asking Jon.

## "Using forge, push this online"
When Jon says that, run the loop above for whatever is in the current folder:
find or file its issue (with `lane:manual`), port it to the repo's rules, check,
PR, rule-5 merge, then reply with the PR and the live URL.
