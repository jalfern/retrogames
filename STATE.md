# STATE — session 336 slot b close-out

## Shipped this session
- **PRINCE OF PERSIA: HELD DUEL DUCK + live analyser proof — PR #2670 merged
  `5009c34`** (#2667, never-dry rung #1571). The bed lays back ONCE for a duel
  (`duelHold` pure law in music.js: engage at first cue, hold ~1.4 s past the
  last, glide back; stale holds die with the old clock) instead of pumping a
  350 ms dip per clash (#326-1's "deep pump hiccup" concern was the pump).
  Chase/room momentary ducks unchanged, stack under the held level.
  popcheck 404/404 (S12 re-pinned; hand-mutant: release line → names the pin).
  popplay now MEASURES the duck-over-bed drop on the live analyser —
  closes the README honest gap #0 (browser-side proof).

## Claims / board
- #1711: resumed per ladder (`next`), sweep clean (no coach-live take yet —
  jonq #2652 AWAITING, deadline Nov 20 01:36Z), every machine-side line
  re-confirmed (line 1 3/3 takes, line 2 14/14, consent+mutants line 4,
  admin listing = `plaicraft:evidence --json`), RELEASED back to `next` with
  evidence comment (nothing builder-side before Jon's hands; #2654 is QA's).
- #2667 filed by this lane (idle-kick `KICK PRINCE OF PERSIA 0 weak` at
  `dc82757`) and claimed; shipped → label shipped + closed with evidence.
- #2665 (EXCITEBIKE bay stamp): slot a live — claim refused, untouched.

## Next queued
- Re-derive at `5009c34`: `node scripts/idle-kick.mjs` (do NOT trust this file).
- If a Jon take with ≥3 pairs lands in the store, run `plaicraft:grade` →
  posts the ±50 ms verdict → closes #1711 line 3 → #1712 promotes to `next`.

## Open questions (issues, not here — #605)
- #2652 (jonq, platform, AWAITING by Jon) — phone take vs waiver for #1711
  line 3; default keeps waiting, nightly self-grades.

## RULE 4
Game code merged this session (#2670, `src/games/PrinceOfPersia/`), rule 4
intact; STATE.md committed to main per rule-step-9 exception.

## Catches for the next session (each cost probes this shift)
- **PoP end-card latch:** `endSeen` survives an R-restart; the first arrow
  after R re-kicks `makeGame(0)`. A quick `press()` can also fall between
  polled input frames on a loaded box. Any harness that restarts then drives
  must CONFIRM fresh-L0 (play + level 0 + zero guards — only L0 has none)
  and re-seat until guards stick.
- **PoP byte-peak analyser is sparse:** note bursts land ~every stepDur
  (0.24 s); short windows catch silence, not signal. Compare the ducked
  window against a LONG recovered window (≥2 full note cycles, ~1 s), not a
  short baseline.
- **Vercel deploy vs jalfern.com CDN:** Vercel SUCCESS on the merge commit
  does NOT mean jalfern.com's HTML entry hash updates immediately; the proxy
  cache lags. Ground truth = Vercel status + live headless browser probe.
- `gh pr list --json draft` invalid — the field is `isDraft`.
- `git worktree remove` fails "Directory not empty" while a dev server holds
  the tree — kill the lane's own vite first, then rm, then `git worktree prune`.
- popplay's `mus()` already exposes `{level, peak}` — analyser proof needs no
  new hook; `peak` is the byte-domain music-bus tap (`_peak()`).

## Lanes clean
- Main checkout detached at `origin/main` (`5009c34`); STATE.md committed.
- My :5178 dev server stopped at close; :5173 slot a's — untouched.
- Worktree `retrogames-forge-pop-duelduck` removed after merge; the
  mis-named `retrogames-forge-plaicraft-s1-metro` (unused, slug renamed
  before first commit) deleted.
