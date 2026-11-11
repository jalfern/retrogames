# STATE — session 215 (2026-11-11, slot b)

## What shipped
**PAPERS, PLEASE-MIN: PORTRAIT-DETAIL** merged as `22cbcb9` (PR #1974,
Closes #1972 — NEVER-DRY pick, weakestStage score 7). The PORTRAIT rule's
compared set grew from four features to SIX: `brow` (thin 2px / thick 5px)
and `mouth` (shut bar / open block) join cut, width, glasses, facial hair
(rules.js `FEATURES`), each new break naming itself on the deny
(`PHOTO BROWS THICK, ENTRANT THIN`). The passport photo is a ZOOM-CROP:
`PHOTO.s` 0.6→0.75 with `ox/oy` centering and a clip to the frame — head
reads ~50px where the flat draw read ≤41. `drawFace` gained the parts the
original's eye roams: sclera+pupils, brows, nose, ears, open mouth. Color
doctrine untouched — the aged-photo trap still moves `hairC` alone.
paperscheck **8799/8799, 24/24 mutants** (m22 brow muted, m23 mouth muted,
m24 FEATURES-shrunk — caught ONLY by the new staged-coverage witness:
fairness stays green under it). New Node crop law (centered, widest head
in frame, s≥0.7). papersplay **40/40** (+4 canvas gates: zoom-run ≥44px
head row — old build measured ≤41; brow ink 40..80; mouth ink 48..108;
bare-eye whites 128px/0 behind lenses). watchcheck papers slice 241/241.
Live: jalfern.com/retrogames/papers-please.

## The session's catches
- **zsh eats bare globs and dir-greps.** `grep -l pat dir/` searches
  NOTHING without `-r` (stderr was swallowed → the prod loop "polled" 30×
  at nothing). And `cp a b dest` with dest a file dies mid-chain —
  FORGE.md step 1's two-path park must be two `cp`s.
- **Prod verify needs a cache-bust on the ENTRY HTML.** Edge-pinned shell
  kept handing the pre-merge asset graph for ~10 min; `?cb=$(date +%s)` +
  `Cache-Control: no-cache` flipped it to the new entry, then enumeration
  found the payload string on poll 1. Proof string > hash again (#1967 law
  re-confirmed).
- **Translucent fill leaked into a compared feature.** The new mouth rect
  inherited the nose's `rgba(…,0.28)` — papersplay caught it as 0 ink px.
  Every feature paint must set its own fillStyle.

## Ladder trail
- halt none; steer none; TARGET #1637 → forge-claim REFUSED (slot a's live
  b24 lock, 73 min) → normal ladder: `next` #1711 fifth-confirm posted
  ("still waiting" — Jon's R2/wrangler wall, nothing more), game-queue
  empty, QA MASTER live (pid 47359) → borrow refused; idle-kick answered
  `KICK PAPERS, PLEASE-MIN 0 weak`. Gap-0 (PAY economy) was STALE —
  shipped by #1967, README line never closed; filed #1972 carrying the
  honest gap-0 note + why-weakest (score 7), claimed(b), shipped both the
  stale-line closure and the next oldest gap. No jonq (mechanical picks).

## Session bookkeeping
- #1972 CLOSED shipped; QA polish pass filed as **#1976** (hair silhouette
  + shading, sepia aged photo, zoom-inspect affordance, sideburn-vs-ear
  asymmetry, brow/mouth deny sfx, wide-head zoom-run gate extension).
- :5178 vite KILLED at session end; worktree
  `~/Dev/retrogames-forge-papers-photo` (detached at 22cbcb9, node_modules
  symlinked) reusable or `git worktree remove` anytime.

## Next queued (slot b)
1. Fresh ladder: halt/steer/next/queue games-first; #1711 = post "still
   waiting" only (sixth confirm — keep it one line).
2. NEVER-DRY continues: papers' last unowned gap is face variety
   (combinatorial parts vs hand-authored characters — check #1976 doesn't
   own it verbatim before picking); LODE RUNNER-LITE gaps sit behind QA-
   held #1959 — re-idle-kick rather than trusting this list.
3. #1637: slot a finished b24 with NO release comment — its lock expires
   ~06:31Z 11-Nov; a fresh session claiming 1637 should not count a's
   silence against it (batch 25 = next unseated solver title or driver).

## Notes for the next slot-b session
- Compared features live in ONE place: `FEATURES` (rules.js); gen flips
  exactly one via the generic binary path; paperscheck pins per-feature
  staging (the `staged{}` sweep). A 7th feature = FEATURES + portraitDiffs
  + drawFace + papersplay FE list + coverage is automatic.
- papersplay ink-gates count EXACT colors (#20242e brow/mouth ink,
  #d8dce8 whites, beige frame #c9c2a4) — change a palette constant and
  count those bands; they fail loudly, which is the point.
- Prod-prove recipe that worked: cache-busted entry → BFS chunk refs 3
  rounds → `grep -rl "PHOTO BROWS THICK" dir` (with -r!).

## Open questions
- None. (No taste/priority call needed from Jon.)
