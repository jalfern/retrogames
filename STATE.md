# STATE — forge board snapshot (slot b, 2026-11-23 — shipped the press feel)

## This session shipped: MINESWEEPER press feel — #3032, PR #3034 (squash `2cf6b22`, prod-verified)
- Never-dry rung: ladder dry (feedback QA-held, live QA session owned the borrow), flagship
  stage spent (`idle-kick` → `KICK MINESWEEPER -1 weak`, score 1 from #3008 naming it).
  Filed POLISH #3032 with the why-weakest line, claimed for slot b, shipped in one session.
- Game: mouse press now **sinks** the tile (bevel flip), pressing an opened number
  **flattens its covered ring** (chord preview), **release on the cell commits**
  (same engine verdict, one pointer-up later), **drag-off cancels** (and un-flattens
  while off), face **concentrates** while held. Touch/keyboard semantics untouched;
  `minefield.js`/`stateHash` never see `press` (sweepcheck 124/124).
- Harness: 7 new `sweepplay` legs (press-no-dig, exact sink fill, face ink, release
  commits, ring flatten, un-flatten, cancel-leaves-hash); new DEV hooks `probe().press`
  + `clueAt`. Mutation proof deterministic: stripping the commit condition reds the
  cancel leg (`opened=57->58`). Final local: sweepplay 59/59, sweepcheck 124/124,
  lint:mario/fps/ai + build green.

## Session lessons (each already cost minutes)
- **Never pipe the dev server into `head`** — `npm run dev | head -20` SIGPIPE-kills
  vite once HMR chatter fills the pipe: the suite then grades against a dead/stale
  server and the failures LOOK random (state legs green, pixel legs red). Redirect to
  a file instead.
- **Never `git checkout --` over uncommitted work** — a mutant-restore wiped the
  session's whole index.jsx edit (nothing was committed yet). The dropped stash
  recovered it (`git fsck --unreachable` + `git show <sha>:<path>`) — but the rule
  is the fix: **commit the increment before the mutation run.**
- **Pixel legs must poll the repaint, not sleep** — software-rAF hitches beat fixed
  90 ms waits; `pxWant`/`faceWant` in sweepplay now wait for the expected colour
  (1.5 s budget) — deterministic after that (same failing cell (8,3) went green).
- Hardened the `?`-glyph leg the same way it broke: centre-pixel diff was a
  seed/antialias lottery (the glyph's waist misses centre at some font sizes) — now
  graded by dim-`?` ink count in the cell. (Red-once-green-once SAME code on main.)
- Dual-slot never-dry collision: slot a filed the same gap as #3031 ~2 s before my
  #3032 claim; board resolved it (closed dup, one-lane-per-game held). Harmless,
  but the POLISH-file→claim window is the collision surface.

## PLAYABLE on main right now (`2cf6b22`)
- `/retrogames/minesweeper` (press feel #3032 + hall of fame #3028 + chord shield
  #3009 + teach-the-nope #3011 + signed counter #3021), `/retrogames/double-dragon`,
  `/retrogames/contra` (voice #3000, radio teach #3016), `/retrogames/floor-boss`,
  `/retrogames/fire-crew`, `/retrogames/r-type`.

## Board at close (live audit)
- `building`: #3035 (slot a, live, inside Contra — somersault jump). `building-qa`:
  empty. `steer`/`next`/`game-queue`: empty. `feedback`: #3008 (lane:qa, meat
  verified done, residue = advisory load-flake family), #2971 `waiting-jon`.
- `idle-kick` at close: **NONE** — STOP legal per FORGE.md step 2.
- Next kick: when #3035 merges, Contra opens again; remaining scoped Minesweeper
  fidelity is thin (press feel was the last big original gap). If the board is dry
  again, run the ladder honestly — do NOT re-file what slot a just shipped.

## Harness notes (carry-overs, unchanged)
- macOS /var symlink vs git realpath in sandbox tests; sandbox zsh sources real
  ~/.zshenv (gh shadowing); `execFileSync` stdio:'inherit' returns null;
  ciscope #1575: new npm-alias check ⇒ scope in `checks.mjs` same PR.
- #2910 fix still unclaimed (kick/TARGET staleness gate + pin (c) in code).
  Its live shape bit again today: warden kick text is regenerated post-assignment
  and can name a held title — the lane's live `idle-kick` remains the decision.
- forge-merge.sh note: when the squash lands and the remote branch dies mid-script,
  `gh pr view` (no number in cwd after branch delete) errors AFTER the merge —
  verify state (`pr view <n>`, issue labels) and finish cleanup by hand:
  labels shipped, worktree re-detached, local branches pruned. Done this session.

## Slots / ops
- Slot b port 5178: dev server stopped via `scripts/devstop.sh` ✓ (never pattern-kill).
- Plumbing `~/Dev/retrogames` detached at origin/main ✓; lane worktree
  `~/Dev/retrogames-forge-msw-press` detached at origin/main, branches pruned.
- STATE.md committed to main (step-9 exception: game merged this session).

## Open questions
- None new (no jonq filed; see https://jalfern.com/retrogames/forge for the live board).
