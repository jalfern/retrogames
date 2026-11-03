# STATE — session 112 (2026-11-03, slot b)

## What shipped
**WEIGHT SURGERY II (#1505)** — merged `a16bc21` via PR #1514.
Live: https://jalfern.com/retrogames/demos/weightsurgery.html (SURGERY II section).
Claimed after #1506 was REFUSED (slot a holds it; claim 09:15Z) — normal ladder,
game-queue head. Lab: `~/Dev/weight-lab/qwen-forge`, all-new files (step8/8b/9/10),
zero edits to slot-a-owned scripts. ws2check.mjs (`npm run ws2check`) 21/21,
5 mutants proven.

## Science (cap 4096, pp0, 12 paired train problems, EXACT token counts)
base 1/12 terminated · 3 correct | A upstream×6FA 0 · 2 | **B downstream×6FA 0 · 5**
| C both 0 · 2.
- Termination NOT fixed at the fair horizon → second negative, now sharper.
- **First accuracy signal: B (unembed+o_proj d-stripping) 3→5/12.** Read-path
  removal helps reasoning without curing termination. C loses B's gain (silencing).
- d is depth-structured (‖d‖ L3 0.089→L23 0.93) & segmentation-robust (true-onset
  d ≈ half-split d; 3/8 loops start late, tokens 685+). At ≤4k: verbose rambling,
  no strict periodic attractor.
- Q4_0 scorer w/ FA-ffn_down+embed fp16: 1.8–2.4× faster; recipe+file shared
  with #1506. Full MATH-500 + MIT HF comparison left as budget said (issue rule).

## Harness catches (the run's real yield)
1. **llm.py pipe-regex is dead**: `| N tokens` summary no longer exists on llama
   v0.3.0 → every #1493-era ntok was words×2 estimate; #1493's termination
   numbers (and my first B run) are estimate-based. Fix + est-flag shipped in
   step10_eval2; posted to #1506 (slot a owns llm.py).
2. **My first "fix" regex matched the `prompt eval time` line** (search-first) →
   fake 12/12 terminations; corrected (lookbehind+last-match), correction posted
   to #1506 too. A ws2check mutant now refuses ntok=0 fake-terminates.
3. Mid-run stderr >5MB broke llm.py's text=True decode → bytes+errors=replace
   in my runner.

## Board (end of session)
- main tip `a16bc21`. Today's merges: COMET DRIFT #1498, EMBERWOOD #1500, plus
  this. Slot a merged nothing yet on #1506 (fair scoring running in lab; note my
  regex posts affect its terminate counts — theirs may be estimates too).
- #1505 closed shipped. New: **#1515** QA polish pass (feedback) for the II page.
- Open: #1473 (b15 slot-b lock — untouched, hands off), #1506 (slot a), #1502
  (QA ROGUE), #1500 shipped? (ef61653 says yes; state board next read), #1141
  stalled (Jon), #737/#737-family Chrome advisory, #1492 AWAITING (do NOT re-ask,
  default B). game-queue now EMPTY.
- Batch budget: lab log at 37 entries; ~30 practice-gen batches used this session
  (within MIT's ≤50 for the attempt incl. reruns after harness fixes — reruns are
  the honest cost of the regex bug).

## ENV
- netenv/gh-shim as usual; `gh-shim jq` chokes on escaped quotes in --jq (use
  [@tsv]). `nohup` FAILS in this shell context ("can't detach") — use background
  shells; PYTHONUNBUFFERED=1 (Python stdout is block-buffered into files; a
  silent log ≠ dead run).
- Dev server never started this session (demo-only, no browser tier needed);
  port 5178 untouched/free.

## Open questions
- #1492 (slot-b feed on #1473 split-vs-serialize) — AWAITING, default B. Link only.

Overran my 3-h self-box (~4.2 h): two eval reruns bought with honest numbers
(the regex bugs were only findable by trusting ntok==0 as a clue, rule-8 style).
Rule 4: green — game code (demos/) merged this session.
