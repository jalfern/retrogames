# STATE — forge board snapshot (slot b, 2026-11-23 — shipped)

## This session shipped
- **#3042 CONTRA — the cabinet's CONTINUE → PR #3044 → main `205b98d`,
  prod-verified.** GAME OVER reads (90 world ticks), `CONTINUE?` counts the
  Konami digit **9…0 one a second**, gold under the score line, red-hot blink
  the last two seconds. Any key/tap pays: stage 1 loop 1, pool 3, **score
  carried**, rifle, wingman law intact. Purse **3 per game**, fresh at attract,
  rides arcade loops. Armed returns armed — Konami runs continue at **30**
  (NES law verbatim; `armedRun` remembers the prize, kProg stays attract-only).
  Unanswered expiry returns itself to attract, no key asked; zero purse offers
  no count — press-to-attract answers exactly as before. `contPhase` is pure
  sim arithmetic (the `konamiFeed` precedent); the shell keeps only world
  ticks. Carry enters at `makeGame(seed, loop, lives, score = 0)` — default 0
  is the old three-arg world byte-for-byte; purse is shell state (IronRing
  #1103 family). Proof: contracheck **320/320**, mutants **200/200** —
  `score-wipe`, `window-short`, `count-stalls`, `rung-resale` die by name;
  3 scoped lints + build green. Filed **QA #3045** (coin-clack, count
  typography, heat-beep rate, phone take of the pad gating).
- **Mid-build seam vs #3041 (fixed, not papered):** the score-extend landed on
  main mid-build declaring the mark a RUN property — so the CONTINUE entry
  derives `nextExt` from the carried bank (`extMark`): a rung already bought
  never re-sells. Default bank 0 ⇒ `EXT_FIRST`, pre-extend bytes stand.

## LAW CHANGE the next hand must know
- **Press-at-over-screen is now conditional.** In the window a press BUYS the
  run; to leave (attract) a leg must drive the zero-purse branch
  (`setup({ noContinue: true })`) or wait the ~11.5 s expiry. Every future
  die-and-restart assertion must say which branch it wants — the re-forged
  #2894-loop and attract legs in contracheck are the worked examples.
- **The extend mark rides the RUN, every entry.** Loop carry AND continue
  derive `nextExt` from the carried score bank. Any pool/mark assertion must
  know all four ways a run starts: cold, arcade-loop carry, Konami arm at
  attract, paid continue (possibly armed). Extend check stays at the HEAD of
  `step`; extends are unconditional +1 up to 99 (slot a's #3041 laws, folded).
- Loop-bank law unchanged: pools >5 carry whole (#3037); kProg never fed in
  play.

## PLAYABLE on main right now
- `/retrogames/contra` (+ CONTINUE #3042, score extend #3041, Konami 30-lives
  #3037, duck #3038, somersault #3035, voice #3000, radio teach #3016),
  `/retrogames/minesweeper` (+ press-feel #3032, hall of fame #3026),
  `/retrogames/double-dragon`, `/retrogames/floor-boss`,
  `/retrogames/fire-crew`, `/retrogames/r-type`.

## Board at close
- `game-queue`/`steer`/`next`/`building`/`building-qa`: all EMPTY. `feedback`:
  #2971 (waiting-jon phone takes) + new **#3045** (QA CONTRA CONTINUE polish).
  No jonq open, no halt. Unlabeled **#3014** (attract teaches voice orders)
  still waits for a ladder label — unlabeled = no lane may adopt it.
- `idle-kick` will STILL answer `CONTRA -1 weak` — the score is #2971 naming
  Contra, a waiting-jon artifact no merge can clear. Do NOT re-file shipped
  work (continue #3042, extend #3041, Konami #3037, duck #3038, somersault
  #3035…). The honest next rung for Contra is CONTENT (stage 2 — the cliff/
  base), a new-stage question, not a gap.

## Harness notes (new + carry)
- **A mid-run tree fork is signal, not flake.** My first post-rebase battery
  died 316/318; while I waited, the branch tip gained the `extMark` seam fix
  (+2 pins, +1 mutant) and the rerun was 320/320 + 200/200. The two reds were
  the real mark-seam legs, not timers. Before blaming a flake family, check
  `git reflog` and remote tip — a reflog entry you didn't author means another
  hand is in the worktree; finish YOUR verification against the FINAL tip
  (which this report's numbers are).
- forge-merge.sh #3030 read-fail shape, FOURTH session running: merge
  succeeded, wrapper could not read PR state. Exit criterion stays = the PR's
  own state (`gh pr view 3044 --json state` = MERGED); cleanup by hand —
  remote branch already deleted, lane re-detached at origin/main.
- Two lanes, one game, SECOND cycle this week — worked: each issue stayed its
  own at claim, the later ship absorbed the earlier merge via rebase +
  re-verify EVERYTHING (the #3040/#3041 lesson held a third time).
- Headless paint ~12 fps law current (poll, never single-shot); prod-verify:
  index.html → `index-*.js` → grep `Contra-*.js` chunk → grep the marker
  (`curl -L` for SPA 308s). Route HTML never names the lazy chunk.

## Slots / ops
- Slot b port 5178: dev server stopped via `scripts/devstop.sh` at close ✓
  (never pattern-kill). Plumbing `~/Dev/retrogames` detached at origin/main ✓.
  Lane worktree `retrogames-forge-contra-continue` detached at origin/main
  (clean; node_modules is a symlink to plumbing's — purge takes the symlink
  before any dir).
- STATE.md committed to main this session (#3044 merged game code).

## Open questions
- None filed this session (jonq unused; #2971's phone-take need stays on its
  QA thread, #3045 adds a second phone-take ask for the CONTINUE pad gating).
  Live board: https://jalfern.com/retrogames/forge
