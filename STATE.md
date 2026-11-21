# STATE.md — The Forge (rewritten at close of slot a, 2026-11-21; committed to
# main because game code merged: src/games/ShortOrderShout/model.js +
# src/games/RallyCoDriver/model.js shipped in PR #2861 -> e1de37d. Rule 4 keeps
# turning: #2853, #2855, #2856, #2861.)

## PLAYABLE
- /retrogames/contra, /retrogames/double-dragon, /retrogames/r-type — unchanged
  from slot b's close (gate pierce, partner personality, S4 wings).
- SOS + Rally pages re-verified 200 post-deploy; gameplay untouched (soscheck
  107/107, rallycheck 172/172 on the merge — the only game-code diff was three
  additive `export` keywords in the SOS engine).

## WHAT THIS SESSION DID (slot a)
- Warden target #1712 claimed clean (first try). Shipped PR #2861 (squash
  e1de37d): PLAICRAFT S2 adapters for SHORT ORDER SHOUT (55 seat features) and
  RALLY CO-DRIVER (41) — seat-senses model.js per title + replay-verify
  adapters in the dataset builder. Rally keeps the split-information law in the
  corpus: driver rows never carry pace-book features, co rows never carry
  headlight features; weather rides rules->replay ("the rain take reads rain").
- Evidence: datasetcheck 59/59 (+11 pins: seat partition, crest-honesty race
  4960 reads/0 leaks, weather round-trip, clean/tampered units ×2, tampered
  SOS+rally store fails the whole build); 7 mutants RED by design, named
  (new: SOS + rally adapter-bypass). Production rebuilt twice — version
  **5dcb62ac…** byte-identical to #2849's: line-neutral, as intended.
- #1712 stays OPEN + `next` (big-build rule 3: `covers 2+ games` waits on
  friends' play, not code). All four named co-op titles are now
  trainable-on-arrival — a friend take from /retrogames/join closes the games
  line with zero pipeline work in between.

## BOARD (at close)
- building: #2860 (POLISH DD — friend takes the blue seat, slot b, alive —
  checkpoint mid-session). building-qa: #2842 (CONTRA ceremony — QA's).
- game-queue: empty. #1712 `next` (wait-state: friends' takes).
- feedback (nobody-owned): **#2852** (CONTRA pod-carrier polish), **#2857**
  (DD partner-personality polish), **#2839** harness bug (claim-status.mjs
  ignores the `FORGE (<slot>):` checkpoint format → liveness reads dead;
  small, any lane).
- Open jonq (link only): **#2844** (S2 fold ruling; default A fold),
  **#2846** (flagship public promotion; default keep private).
- QA MASTER's vite NOT seen at close — see the caution I left on #2860
  (my broad `pkill -f "npm run dev"` may have stopped slot b's server 5178;
  flagged, fix = restart + rerun once). Next slot: check #2860 for a red
  browser leg before believing it.

## HARNESS NOTES FOR THE NEXT LANE
- **Mutant anchors must consume trailing commas.** The ADAPTERS map is now
  multi-line; the old anchors (`'game': fn` without the comma) left `/*M*/,`
  in the list — SyntaxError, child exit 1, RED-but-for-the-wrong-reason.
  Fixed for bomb-defuse/SOS/rally (#2861). When you extend ADAPTERS, keep the
  anchors comma-consuming and glance at the mutant's exit text, not just color.
- **A "line-neutral" adapter PR must not move the prod version.** Comparing
  the live version before/after (5dcb62ac twice) is the cheap proof that new
  adapters changed no existing rows. Any drift = existing featurizers leaked.
- **Rally weather can be lost silently by a null rules field** — rebuild with
  'clear' and low-speed takes still hash-match (lat is rounded ×100). The
  wx-bit pin (`rain take reads rain in every row`) is what catches it; don't
  delete it if you touch the adapter.
- scriptedTake now knows five games + a `weather:` option; new uploads shift
  the fixture counts (12 takes / 10 audio / 7 humans / 5 covered games).
- Fixture players are pipeline tests, not evidence (header of datasetcheck);
  acceptance lines are judged by the production card only.

## WORKTREES
- Main checkout: detached origin/main (e1de37d) + this STATE commit.
- `~/Dev/retrogames-forge-s2-coop-adapters` — merged; re-detached at
  origin/main; reap freely (remote branch gone). Port 5173 stopped at close.

## Open questions
- #2844 — PLAICRAFT S2 fold ruling (default: keep fold).
- #2846 — promote CONTRA/R-TYPE/DD to public? (default keep private.)
