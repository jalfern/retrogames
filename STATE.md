# STATE — session 235 (2026-11-11, slot b)

## What shipped
**PAPERS, PLEASE-MIN — PORTRAIT LEGIBILITY ROUND** — merged as `e7d508a`
(PR #2059, Closes #1943, warden TARGET; claim was clean). The PORTRAIT-round
playtest asked if the photo reads at phone size and if the nine-law wall buries
the sheet. Answers were geometry, not tuning:
- Photo deep-zoom: `PHOTO.s` 0.75→0.90 (the clip law admits ~0.97 — take the
  ceiling: head ~50→61px, live run measured 62; chin crops at the frame edge
  like a real ID photo). Ratchets: `s >= 0.85` + `s*68 >= 54` in paperscheck
  (both old crops fail them; reverting s to 0.75 proven RED, restored).
- Minimum-ink clamp in `drawFace`: thin COMPARED strokes (thin brow, glasses
  bridge, shut-mouth bar) ≥2px at ANY scale; no-op at s=1 (every source value
  ≥2), so counter face + all scale-1 byte-identity probes untouched by
  construction. Live: photo brow ink 34 thin vs 74 thick dark-family px.
- Nine-law relief: `ruleGap` 4→3 frees 9px (nine rules on day 7), spends 5 to
  grow wanted rows 9→10px / 10→11 pitch. Worst buildable day y=352 vs SCALE
  358 — 6px slack (was 2). Size ratchet moved to ≥10/≥11. Sheet ink
  441/734px live (was 328/612).
- Evidence corridor law: all 12 directional PORTRAIT strings ≤42 chars vs
  wrap-54 — every witness one corridor line.
- Items 2+5 (aged-photo bite, day-1 fairness) = balance data per the issue's
  own doctrine: sweep reports 108 traps == 108 naive misjudges, ≤2/day, naive
  eye clears every week (a wrong conviction is one strike, learnable); 14 aged
  photos across 12 weeks; day-1 forger pinned live. Posted on #1943.
Proof: paperscheck 18243/18243 with **all 43 mutants dead**; papersplay
**91/91** live keys, zero page errors; lint gates + build green. Prod: see
#1943 comment for the live URL + bundle marker.

## The session's catches
- **A fit law is a budget, not a wall**: #1908 concluded "rows CANNOT grow"
  from the sheet's own 2px slack — but the 9-rule rulebook was spending 9px on
  inter-rule gaps. Relief was upstream. Audit the whole column before accepting
  a ceiling.
- **Clamps that no-op at s=1 are free doctrine**: a min-ink floor written as
  `Math.max(v*s, 2)` sharpens the photo while every byte-identity probe (which
  renders at scale 1) stays green BY CONSTRUCTION — no pins to renegotiate.
- **Thin-stroke ratios survive AA, absolute counts don't**: photo brow ink
  separates thin/thick (34 vs 74) in a dark-family count; exact-hex counting at
  fractional rect origins would have failed the same gate (#1908's lesson again).
- Zoom ceiling arithmetic: centered + widest-inside-clip ⇒ `s ≤ (w + 2*margin)/
  headwidth`; here 0.97 theoretical, 0.90 chosen so ears keep a 2–3px margin.

## Ladder trail
TARGET #1943 claimed first (`forge-claim.sh 1943 b`), clean — no halt/steer/
next anywhere, game-queue held only #1637, no `building` corpses, jonq games:
none open. QA MASTER was live (pid 81627) but #1943 was the WARDEN's assignment
to slot b (claim passed the liveness check — no QA claim on it), not a borrow.
No jonq filed.

## Open questions
- none (see waiting-jon issues).

## Next
- **#1637 b31: full-shelf driver audit** (brief in #1637's wrap comment, via
  session 233): seat every remaining title that owns a winning script, or
  declare the rollout done. Batch numbers 19–21 never appear in watchcheck —
  check the trail before renumbering.
- **`viperpitcheck` is red-on-main and wired into NO CI job** (counter-throw
  gate drifted with #1761/#1785) — QA lane's call, flagged twice on #1637.
- PPM drain law still stands (session 230): do not re-pick PPM at weakestStage
  while its feedback pile sits unowned. #1908 + #1943 were warden TARGETs, not
  picks; the PPM feedback pile is now thin (README honest gaps: procedural
  portrait depth, numerals-in-evidence, no drag physics).
- #2045 (lane-liveness crossings) and #2036 (resume-gate nightly budget)
  remain open harness improvements, unowned.
- Dev servers: slot b 5178 STOPPED at exit; slot a 5173; QA studio 5176 (not
  mine — untouched). Stale worktrees accumulating at ~/Dev/retrogames-forge-*
  (detached, branches died with squashes) — candidates: ppm-portrait,
  ppm-bulletin, papers-photo; remove deliberately.
