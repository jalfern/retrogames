# STATE — session 121 (2026-11-04, slot a)

## What shipped
**#1506 CLOSED shipped** — WEIGHT SURGERY fair verdict live at
`https://jalfern.com/retrogames/demos/weightsurgery.html` (squash-merge 67359c2, PR #1541).
- Verdict table leads the page: base / presence penalty / k256 edit × MATH/GSM8K
  (acc · finished · loop), all six rows n=100 seed 20261103 cap 4096 one backend.
  Lead (computed from fair_scores.json): **the edit did not fix it** — MATH 4.0→8.0%,
  GSM8K 11.0→11.0% (noise at n=100), GSM8K loop flags UP 5→20%; penalty worse everywhere.
- First-pass cap-1024 verdict retired into a collapsed SUPERSEDED block. "MIT's edit
  never opened" audited: never existed on page/repo branches — affirmative replacement
  shipped instead (all-layer scan ranked L19 #2 of 24 without MIT's prior).
- Exact-token rerun judged NOT quick (~10 h / 600 gens) → ≥/≤ bounds kept per Jon step 3,
  footnote explains why; stale "refreshes on next deploy" promise removed.
- Honesty: 8 llama-cli banner rows on all three MATH runs (ids 4,8,20,27,28,50,63,87)
  disclosed (fair_honesty.json), excluded from drill-downs; GSM clean; no verdict flips.
- Committed lab now renders the whole page offline (fair_scores.json + six-run excerpts +
  batches union); demos index card carries the scorecard.
- Harness: ws2check 40 gates + 39 mutants green (5 new #1506 gates). eslint/lint gates/
  build green. Rule-4 watch RESET: src change class `public/demos/**` counts (rule 4 text).

## Next lane (fresh claim)
Normal `forge-claim.sh` ladder (steer → next → oldest game-queue → oldest feedback).
No steer/next/halt open at my start; game-queue items for the games lane unverified this
session — if the ladder tops out at demos/feedback again, rule-4 wording is satisfied but
Jon still prefers a src/games flagship: check `gh issue list --label game-queue` first.

## Board (end of session)
- #1506 CLOSED completed, shipped,lane:demos. #1540 open (QA lane: r2 page polish —
  now can cite the live verdict page). #1473 building (platform), #1141 building+stalled.
- No halt labels. Slot-a port 5173 freed at exit; slot b's zombie opencode pid 95619
  (18 h old, past timebox) was alive but silent — warden may want to reap it.
- main-ok true at exit.

## ENV (carry-forward)
- `. /tmp/forge/env.sh` for gh (shim /tmp/forge/gh). **NEW: the rescue proxy caches
  jalfern.com HTML and ignores cache-buster query strings** — curl polls lied "stale"
  for ~20 min while the page was live. Verify prod with webfetch (different egress),
  or poll a hashed asset instead of public/*.html.
- Headless Chrome SIGABRTs in this session's launchd context (interactive Chrome pid
  83103 owns the box; #737 family). Browser suites: run from the tmux lane context.
  `npm run ws1506play` committed for QA (phone+desktop verdict-page drive).
- Lab `~/Dev/weight-lab/qwen-forge`: batches.jsonl got 3 score-fair `purpose` fields
  restored; lab-only lines (r2 #1533 rows, banner/honesty files) stay out of the demo
  page log by design (#1533 is its own story).
- Push via `-c http.proxy=http://127.0.0.1:18080`; pgrep broken (use ps -ax).

## Open questions
- (none open — no jonq filed; #1506 closed with everything asked computed)
