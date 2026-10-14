# STATE — forge session 2026-10-13 night (TETRIS)

## Shipped this session
- **#208 TETRIS (NES) MERGED** (PR #213, squash; PR's own CI green incl. tetrischeck
  45/45). `/tetris`: A-Type marathon, start level 0-9. **Prod deploy still pending**
  ~15min post-merge: the first main run went red on the missileplay smoke flake and
  Vercel appears to gate prod on CI; the rerun + a STATE-only re-run are cycling.
  If jalfern.com/retrogames/tetris isn't live when the smoke run finishes, that gate
  (or the smoke flake) is the thing to look at first.
- Exact & pinned in Node (same code the tab runs): NTSC gravity L0-9 tick-measured
  against a LITERAL table (my first version imported GRAVITY as the expectation —
  a green-testing-nothing check, found and killed); DAS 16/6 instant/reversal/
  release; soft drop 2f/row; zero lock delay; scoring graded at pre-clear level;
  level = startLevel + lines/10 capped 29; score cap 9,999,990; 8-bit Galois LFSR
  with modulo bias pinned to period residues [36,37,37,37,36,36,36]; zero triples
  in 50k; autopilot clears >=10 lines on 8 probe seeds; attract hash-for-hash.
- Harness fail-proven: GRAVITY[0]=47 -> 3 red, restore -> green.
- README carries the honest-deviation ledger (L10+ gravity extrapolated to 2f,
  anti-triple reroll starves low-residue pieces, music fixed tempo).

## Lessons paid for this session
- A check that imports the constant it audits cannot see it change (gravity).
- The NES LFSR has 255 states, not 254 — theory must count the same universe the
  machine does (bias pin was wrong first, sim was right).
- CDP polling at 25ms starves a headless tab's rAF mid-mash: world-time holds
  (sim tick) fixed the single-press flakes; the long mash loop stays wall-clock.
  tetrisplay passes 24/24 locally, lives in the manual verify tier with a written
  diagnosis (#214 lists it).
- CI on main went RED after the merge on the pre-existing missileplay smoke flake
  (23/25, same rAF-starvation family). Reran the failed job; that gate is not
  merge-blocking but may hold the Vercel deploy.

## Queue state
- game-queue: **#209 JOUST**, **#210 Q*BERT**. Next session claims #209.
- #214 QA-TETRIS filed (flash order, music tempo, lock flash, marquee art,
  attract level cycling, promote tetrisplay once its flake is fixed).

## Harness commands
- `npm run tetrischeck` (static CI gate), `npm run tetrisplay` (manual verify;
  TETRIS_URL override; world-tick waits), `npm run lint:tetris`.
- Worktrees: `~/Dev/retrogames-tetris` pushed+merged (branch deleted remote).

## Three questions for Jon
1. TETRIS caps level at 29 with a 2-frame gravity floor (honest extrapolation).
   Keep, or chase the real NES high-level table (ROM-behaviour rabbit hole)?
2. No B-Type (fixed-line mode) shipped — issue asked for A-Type marathon only,
   but the menu-side "GAME A/B" switch is iconic. Worth a queued round?
3. main's CI went red on the missileplay smoke flake right after the merge —
   same CDP/rAF starvation as tetrisplay. Should the smoke job's long key-hold
   suites all move to world-tick waits (one small PR across drivers), or stay
   advisory and be rerun-on-red?
