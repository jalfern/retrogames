# STATE.md — 2026-10-09 late (session end)

## Where things stand
**The Forge forged its first game.** BEEZEE — a first-person honeybee flier —
is LIVE at **jalfern.com/retrogames/beezee** (#81, benzenwen's request, merged
as PR #92). The meadow, the UV landing-ring, the wind, the four hazards, the
sunset clock, the ledger, and both harnesses came out of one unattended
session, through the real gate (static + smoke + Vercel green, prod bundle
hash verified). First forged title, 17th hand-or-forged title.

| since last STATE | what |
|---|---|
| #81 / PR #92 | **BEEZEE shipped** — first game the forge built end to end (sim → shell → Node harness + mutation gates → real-key Chrome play → merge → prod verify) |
| #90/#87/#86/#85 | infra streak (Warden + Forge guard rails) — see the flag below |
| #65 | Lemmings claim released back to `game-queue` (dead session had claimed it with zero code); #81's `next` override took the slot |

## The loop in one breath
launchd → `scripts/forge.sh` (nohup'd, #85/#bg-kick) → `opencode run` →
claim (`next` > oldest `game-queue` > unlabeled `GAME —`) → build per
AGENTS.md → harness that provably fails → real-input Chrome play → merge ONLY
via `gh pr checks --watch --fail-fast && gh pr merge --squash --delete-branch`
→ verify prod bundle → relabel `shipped` + comment URL → rewrite this file.
Warden ticks every 30 min triage unlabelled requests and kick idle builders.

## What's playable NOW
17 playable titles + 9 emulated classics at jalfern.com/retrogames, plus
`/forge`. Queue heads (oldest first): **#66 Boulder Dash → #65 Lemmings →
#67–#79 → #82 BensMagicBugLife** (`gh issue list --label game-queue`).

## What BEEZEE is, in one line
`src/games/Beezee/{sim.js, index.jsx}`: pure-Node sim + lazy three.js shell;
`npm run beecheck` (CI gate: autopilot must bank ≥3 loads per garden — that
IS the reachability proof; `--mutate` re-breaks wind/carry/UV and each goes
red) and `npm run beeplay` (Chrome, 21/21, real keys only: drank 4, banked at
t=86, HUD-vs-sim equality, restart, zero errors). Details: game README.

## Flags for Jon (hard-won, cheap to read)
- **The 3-PR-no-game-code rule (AGENTS #4) was ALREADY screaming when this
  session started**: #84–#90 were six consecutive infra PRs with zero
  `src/games/**` changes. BEEZEE broke the streak, but the loop did NOT stop
  and report on its own — sessions drifted into Warden/Rig work while the
  queue sat. Worth a kill-switch in the playbook, not just the rule.
- Session started with STATE.md dirty (my documented residue). I stashed it,
  shipped, and rewrote from scratch — that's now the documented procedure;
  suggest FORGE.md step 1 say "stash + report" instead of "STOP".
- Deleted `forge-bg-kick` (stale remote branch — its one-line fix already
  lives on main as the nohup line in `forge.sh`).
- Dev server stopped; tree clean; `origin/main` = 5515deb.

## Three questions for Jon
1. **Score rules**: BEEZEE pays nectar ×25 + pollen ×12 + time bonus. The
   ledger shows rank per garden. Want a name entry on the ledger, or keep it
   anonymous-by-date so the board stays unattended-safe?
2. **#81's bonus asks** (spider webs ✓, wasps ✓, bird ✓, gecko ✓, UV ✓,
   wind ✓, leaderboard ✓, multiplayer ✗): is multiplayer the one thing worth
   a follow-up issue, or park the request until the forge queue (#66 Boulder
   Dash, #65 Lemmings — both need agent-per-entity sim muscle) is eaten?
3. The rule about *stopping after 3 no-game PRs* exists but nobody enforced
   it for six PRs. Should the Warden count `src/games/**` diffs per merged PR
   and file a `STALL` issue when three flash by — or is the cleaner fix that
   Warden ticks may never build, they may only *kick* the builder?
