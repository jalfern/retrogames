# STATE — forge board snapshot (slot b, 2026-11-25 — PINBALL KICKBACK IS LIVE)

## This session — one ship, landed
- **#3250 PINBALL KICKBACK SHIPPED (PR #3255 → `8355368`).** Free ball-save per
  ball at the right drain-mouth column (x 190..205, fires only on fast descent,
  +100; EMBER RIDER mirrors x 155..170 at 75). Pure TABLE data (#3103 contract);
  latches `kbUsed`, re-arms with `resetBall`; centre deaths and resting balls
  untouched (minVy keeps the BALL SEARCH law intact). Art: armed-pulse ring +
  plunger pop; DMD announce `KICKBACK! +N` is sim state.
- Route to the ship: warden target #3246 was REFUSED (slot a held it — and shipped
  it as #3251). The #3232 PINBALL corpse I started resuming was merged by slot a
  mid-verification (my 139/139 + 26/26 ran on the real pre-merge tree; merge
  cleanup then swept that worktree — the Civ-V tapstart FAIL was the gutted dev
  server, not a regression). Normal ladder → `KICK PINBALL 0 weak` (score 7),
  oldest unowned README gap half-owned by closed #3103 (editor) ⇒ filed the
  kickback half as **#3250**, claimed, built, shipped in one session.
- Proof: pinballcheck **147/147** (+8 §8 pins: fire literal, DMD, one-per-ball,
  re-arm, centre-death, minVy rest, ember price, W-x mirror). **Mutants 5/5**
  (new `kickback` anchor = seized plunger). pinballplay **30/30** live Chrome
  (+4 legs) + pixel proof of armed device (126 hot px) and fire pop (125 white
  px). contractcheck 857/857, lints green, build green, rebased onto `87c2b4f`
  and re-verified before merge. Prod: `Pinball-fYZbS1RJ.js` carries the marker.

## Harness lessons (worth one line each)
- **CI attach can fail twice in a row on a docs-only branch**: no `pull_request`
  run object at all, and the re-push cure (#3220) dropped again — the working
  override is `gh workflow run ci.yml --ref <branch>`; forge-merge was right to
  refuse while `static` had no state (#3120). Do NOT push while a
  cancel-in-progress run for that ref is live.
- **A mutant child that dies on a missing anchor exits non-zero, and the parent
  reads that as SURVIVES** — anchor strings must match the wrapped condition
  exactly; the "anchor missing" error goes to child stderr, invisible in the
  parent's stdout hint. (Honest 0/5 → fix → 5/5.)
- **Prod markers live in per-game chunks** (`./Pinball-HASH.js`), not the entry
  bundle — scan the chunk list referenced by `index-*.js`, and `curl -L`
  (jalfern.com answers "Redirecting..." without -L). LC_ALL=C still mandatory.
- **A dev server backgrounded from a tool call can die with its parent shell** —
  a pinballplay navigation failure was a dead :5178, not a broken page; re-curl
  the port before blaming the rig.

## PLAYABLE on main right now
- `/retrogames/pinball` **KICKBACK** both cabinets (one save/ball) + cabinet row
  (#3232), ball-ball, orbit/magnet/DMD; `/retrogames/tidal-rush` online rooms +
  podium/rematch (#3227/#3253) + rung-3 chrome stack (#3254); grind-city second
  line — roof deck, gems, secret bowl (#3251); marble-rush trick-hop (#3243);
  skyward thunderpass, r-type, ice-climber, marble-madness, comet-drift pair,
  stomptown, short-order-shout, ssx, pacman, mario, minesweeper/garden-guard/
  homebody, TIDY BOT, STARRY NIGHT, TOP SOLDIERS, DOUBLE DRAGON, RACCOON HEIST,
  spy-hunter, iron keep, galaga, missile, pucks, mines, zork, ultima, king's
  quest, Joust, Q*bert, forge board.

## Board watch (facts, not questions)
- `game-queue` expected EMPTY after this ship; #1712 stays `waiting-jon` (skip).
  Next builder claim = idle-kick derivation live at claim time (don't trust memory).
- QA open: #3244 (tidal online polish, building-qa), #3237 (PINBALL tail: attract
  show-off, phone HUD audit, tilt-to-nudge, lock slam), #3233 (grind tail 2),
  #3131 (padtypes rollout). #3230/#3174 shipped today.
- Nightly green at merge (main-ok ok).

## Open questions (links only — #605)
- #3054 — QA: native TestFlight ports have no recorder/upload (lane:qa, AWAITING).
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).

## Slot / board state at handoff
- Slot b: worktree `retrogames-forge-pinball-kickback` is detached at origin/main
  (mergeclean already completed post-merge cleanup; safe to prune). Dev :5178
  stopped via scripts/devstop.sh at handoff.
- STATE.md published via docs PR (game merged this session → rule 9 satisfied);
  parked slot-scoped with statepark park b.
- Time-box: ~2 h of 3 h.
