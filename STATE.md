# STATE — 2026-10-23 forge session 2 (EMBERWOOD graceful attract bot shipped)

## Shipped this session
- **#874 → main (squash d180a81, static SUCCESS)** — flagship idle stage
  (#841): board was empty, QA lane live (holds #863 BLOB only, not a
  flagship), so `flagshipStage` ran honestly. It returned SSX gap 0 (analogue
  stick) — that is the taste call STATE flagged for a question, so it was
  **filed, not built** (#873: stick vs arcade taps, default = keep taps).
  SSX gap 1 is harness (not rule-4 code) → rotated to next flagship with
  game-code at the head: **EMBERWOOD gap 0, the graceful attract bot.**
- `src/games/Emberwood/bot.js` — species-aware hit-and-run on the proof route:
  - `dodgeTick` pre-empts the macro: sidesteps perpendicular to a tuskroot's
    telegraph/locked charge line (free-tile checked), rest window gets closed
    and swung at (zero windup/charge damage in the duel gate).
  - Husk frontal deflect (`toward = d·(-f) > 0.5`) respected geometrically:
    axis/side freeze at engage, steep diagonal pose (4px swing / 13.5px
    minor, outside the 12.5px contact band), wrong-side slips around the
    blade line — 0 clanks in the duel gate, kills in 235 ticks.
  - Trash close→slash→hop-back; Maw two strikes per thorn window then
    stand-off >40px; Wyrm align→face→draw→loose→retreat volleys, steel only
    on the staggered core (0 clanks).
  - Route-safety rails (each learned mid-session): BFS-reachability gate on
    engage (was chasing through lakes), one honest try per monster (`black`),
    pin detection (tuskroot exempt — patience, judged by leash/budget),
    2400-tick budget w/ 3-strike give-up, panic-break sprint vs 48-tick
    contact tails (a blacklisted husk tail had livelocked the route 13k ticks).
- `scripts/emberwoodcheck.mjs` — +7 duel gates (tuskroot×2, husk×2, trash,
  Maw, Wyrm) driving attractBot with real inputs in single-monster rooms.
- `src/games/Emberwood/README.md` — combat-layer rules written up; honest
  gaps pruned (graceful-bot gap removed; 5 remain).

## Verification
- `emberwoodcheck` 135/135 (106 node + 24 Chrome) incl. proof-route win,
  deterministic hash, tick 11233 (was 7160 — the fights ARE the demo).
- **Mutant:** rest-punish disabled (`e.rest > 0` → `false &&`) →
  `tuskroot: punishes the rest window (0 swings landed in rest)` FAIL;
  restored → green. (First mutant choice — disabling dodgeTick — survived
  because charges abort on trees in that room; gates strengthened to
  swings-in-rest, which is the actual load-bearing behavior.)
- eslint clean on touched files; `lint:mario|fps|ai` clean; build green.
- Live: https://jalfern.com/retrogames/emberwood — chunk `index-CaMG0sdm.js`
  contains `fightCool/panicT/13.5`. #874 closed shipped.

## Next goal
- Re-run `flagshipStage` against the board. EMBERWOOD honest gaps now: [0]
  tuskroot/pod sprites + charge-dust/split-pop FX (game code — the natural
  next stage), [1] Wyrm tail on drop-pool quads, [2] save system/second
  shop/elder gift, [3] portrait full-bleed, [4] tempo lift/attract music.
  If #873 is ANSWERED "add analogue stick", that outranks as Jon's steer.
- QA holds #863 (BLOB). Never touch a game QA is inside (`heldGames`).

## Board / harness status
- main green at d180a81; no freeze; no `halt`; queue/next/steer empty at
  claim; rule 4 satisfied (Emberwood game code merged).
- `jonq` lane:games — **#873 AWAITING** (analogue stick vs arcade taps,
  default keep taps, deadline 2026-10-25). No other open games-lane question.
- **Deploy dependency (unchanged):** real internet play needs the relay
  worker redeployed on Cloudflare (#825, AWAITING, lane:qa).
- QA lane owns: #863 BLOB (building-qa); #843/#825 AWAITING (lane:qa).

## Open questions
- #873 (lane:games, AWAITING) — SSX touch steer: analogue stick or arcade taps?

## Housekeeping owed
- `gh pr merge --squash --delete-branch` succeeded for #876 but gh's
  auto-switch failed: **`main` is checked out in worktree
  `~/Dev/retrogames-qa-863-cputiers`** — a law violation (main must be
  checked out nowhere). The QA session is live there; whoever tends it (or
  Jon) should `git -C ~/Dev/retrogames-qa-863-cputiers checkout --detach
  origin/main` so future merges don't hit the local bookkeeping error.
- Worktree `~/Dev/retrogames-forge-emberwood-grace` re-detached at
  origin/main, node_modules symlinked — safe to prune. Older SSX/QA trees
  also still prunable.
- No 8b polish-pass issue filed: Emberwood is not a new title and its
  remaining gaps already live in the README (the `flagshipStage` source);
  a duplicate QA issue would be noise.
