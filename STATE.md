# STATE — session 134 (2026-11-04, slot b)

## What shipped
**ADVENTURE joins the harness spine — MERGED** `32c5d41` via PR #1569 (closes
#1568, filed+claimed this session per Jon's 21:02Z order on #1557: "Do the
ADVENTURE pass first, then follow #1456 as the standing rule").
- `contractGames.mjs` + nightly-bot roster: `adventure` appended at the same
  position (boredomcheck compares ORDERS; #1525 can't repeat). Contract spine
  **44→45 games** — contractcheck/juiceaudit/nightly/boredomaudit see ADVENTURE
  for the first time. `PATTERNS.adventure` = 4-dir + guarded drop (drop is safe:
  no-op empty-handed, placed items re-pickable per bridge law #1551).
- `state()`/`exposeFeedbackState` carry live `x/y` (`sim.player.x/y`) —
  POSITION_KEYS carrier, the boredom audit can never call this game BLIND again.
- adventurecheck 72→76 static + all mutants: **+4 spine gates, mutant "position
  carrier vanishes" → 95 ok/0 fail, 18/18 mutants die** (`--mutant` flag gates
  the loop; plain run prints 76 — that's normal).
- First-timer pass (#1456 rule 3): Node probe, 200 novice seeds ×5000t:
  0% win, 35.5% dragon deaths, median 6/18 rooms, 57.5% never pick an item,
  56/200 find goldKey but **0/200 open any gate, 0/200 the secret rite** →
  3 new honest README gaps (no variant selector vs SELECT GAME 30+ variants;
  zero gate-rite discoverability; no guidance surface vs the fold-out map).
- Determinism of the new script proven at sim tier: same-seed bit-identical
  over the 600-tick contract script, different-seed diverges (seed rides in
  state JSON — honest pass, matches how contractcheck evaluates).
- Prod verified by CONTENT FINGERPRINT: served entry bundle carries
  `carrying:…,x:….player.x`; /retrogames/adventure 200.
- **Filed #1572** (feedback): QA polish pass — gate affordance, guidance tab
  (no secret hint), 3-variant selector, maws/sparkle/wipe juice.
- Closed #1557 (Jon's milestone question) — answered at 21:02Z and now
  executed; completion note posted, precedent #1456.

## Same cycle, other lanes
Slot a holds #1567 (WS step 3, claimed 22:50Z; my claim REFUSED, yielded).
#1141 (Jon, stalled) — never adopt.

## Board (end of session)
- Ladder: game-queue/next/steer/halt empty; feedback = #1572 (QA lane's).
- building: #1567 (slot a). building-qa: none.
- main tip `32c5d41`; #1568 shipped+closed; #1557 closed; #1572 open.
- Rule 4 healthy: game code merged this session.

## ENV (carry-forward)
- `. /tmp/forge/env.sh` for gh+proxy; push via `-c http.proxy=http://127.0.0.1:18080`.
- Fresh worktrees: `ln -sfn /Users/jon/Dev/retrogames/node_modules <wt>/node_modules`.
- FORGE step-1 `cp STATE.md <slot-path> <shared>` = 3 sources → "Not a
  directory"; use two cp calls (slot path FIRST, #1430). Re-kicked this session.
- Shim gaps: `commits/<sha>/deployments` 422s (path glued to sha);
  `issues/N --jq '.comments'` returns a number; `commits/<sha>/check-runs`
  answered total:0 right after merge. Verify prod by content fingerprint:
  build locally, grep dist for a marker unique to the diff, then fetch the
  live chunks under /retrogames/assets/ and test the regex there.
- Vite entry hash names are NOT a reliable before/after signal (Vercel vs
  local hashes differ; the same name reappeared with new content).
- Chrome still dead (#737) — browser tier advisory; sim-tier Node is the gate.
- Mutant loops are flag-gated (`adventurecheck --mutant`); a plain green run
  does NOT prove the fail-proof.
- Slot b dev server on 5178 stopped at session end; worktree
  retrogames-forge-adventure-contract removed; main checkout detached at tip.

## Open questions
- (none — #1557 executed+closed this session; jonq games lane empty)
