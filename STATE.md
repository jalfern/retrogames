# STATE — session 317 slot b close-out

## Shipped this session
- **#2555 → PR #2560 merged (c8b95fc, live).** FLOOR BOSS DUEL SEATS: the
  model manager (quota-proven autopilot) drives its own slot beside the human
  (`pads[1]`, own cursor/tool/till); `D` at the attract or the cyan chip.
  One budget stays the floor's — solo score math is bit-identical (#1917,
  tick-for-tick gate) and the win proof transfers to either seat. Credit
  follows work: stow→rack owner, escrow→parcel shipper majority (ties→HOUSE),
  freight bonus per box onto the loading ledger; legacy fleet/racks are the
  house (owner −1); expiry/overflow are the house's sheet; taps name the
  tapper. Verdict at the whistle: richer till is MANAGER OF THE NIGHT.
  Conservation `score = 100 + Σcredits − spent` closed every tick, Node
  (15 seeds, floor wins 15/15, model out-credits idle human 15/15) and
  browser. floorbosscheck +17 gates + `--mutate-duel` kill; floorbossplay
  41/41 live duel drive. Episodes record `players:2, sources:['human','model']`
  (#1144 slot two). Prod verified: chunk `index-Bx6Fuwup.js` carries
  `MANAGER OF THE NIGHT`. Play: https://jalfern.com/retrogames/floor-boss.
  Polish pass filed #2561 (feedback).
- Design reversal worth remembering: the first duel design gated purchases on
  private tills — legacy-floor capital then sat unspendable and the floor
  FIRED (seed 4242 at 467). Honest model: capex is the floor's budget, credit
  is production-only. Keep that if anyone revisits duel economics.

## Session shape
- TARGET #2550 claim REFUSED (slot a live hold, checkpoint 25 min old) — ran
  the normal ladder: no steer, `next` #1711 is lane:platform (precedent
  314/315/316: no games-lane action), game-queue empty, feedback borrow
  refused (3 live `QA MASTER` PIDs), flagship gaps spent → `weakestStage`
  picked FLOOR BOSS (score 2: two-player seats + turn radii, both unowned —
  #2546's closure un-owned the README handles). Filed POLISH #2555, claimed,
  shipped. One-game rule satisfied.

## Board
- building: #2550 (slot a, LodeRunnerLite vault witness), #2516 (lane:research).
  Britannia #2562 and SmashTV #2554 landed on main mid-session (other lanes).
- `next` = #1711 (lane:platform — no games-lane action).
- jonq: #2529 AWAITING (lane:research, due Nov 19, default A) — not ours.

## Next queued
- FloorBoss **turn-radii / two-way aisle widths** stays open honestly in the
  README (second gap #2546 left) — the likely weakestStage pick next dry visit.
- #2561 (FloorBoss duel polish) is feedback for the QA lane; builders never
  borrow while QA MASTER sessions are live.

## Catches for the next session
- **`gh pr checks --repo <r> --json …` errors without a PR selector** — the
  rule-5 loop must run BARE inside the PR worktree (branch infers the PR).
  With --repo the `while` condition dies at once, exit status 0, and
  `gh pr merge` fires while `static` is pending (branch protection saved it).
- **floorbossplay starts a RANDOM seed** — a fired solo night cascades red
  through the ladder gates (~10% seed luck; rerun once, per AGENTS rule 3).
  The duel section now reloads the page so it never depends on that luck.
- **Prod-poll scripts: `hit=x && exit 0` without an echo exits SILENTLY.**
  An entry-hash change IS the deploy signal — print it.
- STATE.md catch from 316 still true: `curl -L` for jalfern.com; game chunks
  are `index-<hash>.js` off the entry JS.

## Open questions
- none (nothing waiting-jon from this lane).

## Lanes clean
- Main checkout detached at origin/main (STATE.md committed + pushed this
  session — game merged, rule 9 allows it); parked via statepark b.
- Worktree retrogames-forge-duel-seats detached at c8b95fc (merged); keeper
  per precedent, node_modules symlink only. Local `main` branch created by
  gh's merge dance was deleted; nothing holds `main`.
- :5178 dev server stopped at close. No other lane's port touched.
