# STATE — 2026-10-16e (forge session, #379 visibility tag shipped; studio parked by Jon — nothing claimable left)

## Shipped this session
**VISIBILITY TAG — registry contract for the public/private split** (#379, `game-queue`):

- PR #383 squash-landed as c11ebfb; PR #385 (CI wiring) as b4afded. static+smoke+Vercel
  green on both; prod verified (www.jalfern.com/retrogames/ 200 at main@c11ebfb via
  Vercel commit status — entry-hash trap again: content-neutral prep keeps the hash).
- `src/config/games.js`: header documents `visibility: 'public' | 'private'`; missing
  means `'private'`; nothing reads the field (no hiding/routes/auth — by design); no
  existing entry tagged (Jon decides those).
- `scripts/FORGE.md` step 4: new games register `visibility: 'private'`; only Jon
  promotes to `'public'`.
- `npm run visibilitycheck` 139/139 (builtbycheck pattern: esbuild the real registry,
  game components stubbed): value legality, ZERO entries `'public'` before Jon's first
  promotion, field provably unread outside the registry (DOM `visibilitychange`
  listeners pass), docs carry the rules. Mutant proven: `/pong` tagged `'public'` →
  2 red; restore → green.
- #385 puts visibilitycheck in CI's `static` job next to builtbycheck (~1 s local;
  CI static grew 5:46→9:48 — noise or cold esbuild cache, watch next run).
- Not a game, so no 8b polish-pass issue (nothing visual shipped).

## Did NOT touch: #375 Civ V polish — PARKED BY JON
STATE said "resume #375" but the issue carries Jon's 19:36 park: "Studio is reserved
for an RL training run. Remove `stalled` to let the warden resume this from
`forge/civv-polish`." The label is still on, so it stayed parked. **Lesson: Jon's
live issue labels beat a STATE.md goal line — check the board, not just STATE.**
Corpse stays ready at `origin/forge/civv-polish` @ bd878a5 (transports + amphibious
assault, civcheck 469/469, capacity mutant proven); worktree
`~/Dev/retrogames-forge-civv-polish` exists. Remaining there: civplay item-6
de-vacuum (seed 1 capital is inland — force a coastal city), README, gates, PR.

## GOAL — next session
Nothing is claimable while the park holds: `game-queue` is EMPTY, no `next` label, and
`building`+`stalled` #375 is Jon's hold, not a corpse.
- If `stalled` is removed → resume #375 from `forge/civv-polish` (FORGE.md 1b).
- Else if no QA session is live (`pgrep -f "QA MASTER"`) → borrow ONE `feedback` item
  per FORGE.md step 2. Heaviest open QA: #365 (attract-controls sweep across the
  arcade — small, game-visible, would reset the rule-4 counter).
- Else STOP — nothing to forge; say so here and exit.

## Rule-4 signal (report, per AGENTS.md #4)
Three merged PRs in a row without `src/games/**` changes: #380 (STATE), #383 (registry
prep), #385 (CI). This is the "stop and report" trip — reporting to Jon below. Prior
sessions did ship game code (#378 pilots lived in src/games/**), so this is not the
FORGE 3-session STALL condition; but the fix is the same: CivV (#375) is the next
game code, and only Jon can unpark it.

## Notes for whoever picks this up
- New-session trap #1: check issue labels before honoring a STATE goal — Jon parks with
  labels (`stalled`) and unlabeled parks don't exist; `building` WITHOUT `stalled` IS
  a resumable corpse (FORGE.md 1b).
- Lanes with only plumbing diffs still ride the normal pipeline: claim → worktree from
  origin/main → PR → rule-5 merge (`gh pr checks --watch --fail-fast && gh pr merge
  --squash --delete-branch`) → re-detach the worktree at once.
- Mutants via `git checkout -- <file>` eat UNCOMMITTED work in the same file —
  checkpoint the increment BEFORE mutating (this session ate the registry header edit
  once; re-applied, then committed).
- contractcheck (last session) is DEV/browser-bound so it is not in CI; visibilitycheck
  is Node-only so it is. Keep new contract checks Node-only when possible.
- New games: add `visibility: 'private'` to their registry entry (FORGE.md step 4).

## Three questions for Jon
1. #375 CivV is parked for your RL run — when should the studio resume it? Removing
   `stalled` is all it takes; the branch is corpse-ready (civcheck 469/469).
2. Rule-4 counter is at 3 plumbing-only PRs (#380/#383/#385). While the park holds,
   OK to borrow QA items (e.g. #365 attract sweep — game-visible), or hold the forge
   completely until CivV unparasites?
3. Catalog visibility: zero entries are tagged today. Tag the current catalog
   public/private when the vault split lands, or is some subset public from day one
   (and who drafts the list — me proposing, you approving)?
