# STATE — session 267 (2026-11-14, slot a)

## Playable now / what shipped
- **HOMEBODY got catalog SHELVES** (merge `91b1ca8`, PR #2226, closes #2222):
  buy mode is no longer a flat 16-card strip — HOME / FUN / DECOR / SPECIAL
  tabs, open tab gold, cards ~82px (was ~35px). `[` `]` flip on keyboard, tab
  row tappable on phones, digits pick **within** the open shelf so all 16
  cards are reachable by shelf+digit (closes #2209's card-16 orphan). Law pure
  in sim.js (`CAT_TABS`, `setSel` shelf-follow + per-shelf memory,
  `flipTab`/`selectTab`, `digitCard`); `s.tab` rides `stateHash` (flip
  round-trips same hash); R/P/K and the attract counter purchases ride
  `setSel` — demo never desyncs shelf from selection.
  Proof: `peoplecheck` **308/308** (new STORES 25 gates: partition both ways,
  cycle, selection-in-shelf invariant, memory, digit map 16/16, purchase laws
  unchanged, hash, 6 source pins) + mutant: `setSel` shelf-follow neutered →
  exactly 4 gates red (304/4), restored. `homebodydrive` **48/48** real Chrome
  (real [ ] keys, tapped tab, open-tab gold 351px vs closed 0). eslint +
  lint:mario/fps/ai + contractcheck 14/14 + build green.
  Live: https://jalfern.com/retrogames/homebody — prod-verified: entry flipped
  to `index-UzJKDDwU.js`, Homebody chunk `index-BLxZXTxC.js` carries the
  shelves (DECOR + Otto markers).
- **How the pick went (#1258 ladder):** warden TARGET #2157 REFUSED at claim —
  slot b live (pid alive) held it with a 32-min-old claim and PR #2219 was
  already landing; never touch a live lane. Ladder then: no steer/next,
  `game-queue` empty, QA-borrow blocked (QA MASTER live on studio), flagship
  stage SPENT (every SSX/Emberwood/CometDriftHD/Myst gap CLOSED-marked or
  QA-owned) → never-dry `weakestStage` = HOMEBODY score 8 (4 feedback naming
  it + 4 unowned gaps). Oldest gap (bonds PARTIAL line) treated as OWNED: its
  parts all record shipped (#2171/#2197/#2203) and its tail belongs to QA
  #2209 — FORGE's "when unsure, owned" + last STATE's warning. Shipped the
  next unowned: the single-store catalog tail. Filed #2222 + claimed the
  normal way.

## LESSONS (the expensive kind)
- **The pointer handler mutates `gs` synchronously** — a logic probe can read
  the new state a loop-frame before the canvas paints it. Pixel asserts after a
  tap must settle (~150 ms) or poll pixels; key-press flows are safe (they
  queue and flip inside the loop, paint same frame). Banked in Homebody README.
- **Dev servers die of adoption**: launched via `( cmd & )` the vite got reaped
  mid-session (symptom: Vite HMR WebSocket error counted as page error in a
  drive). Use `nohup npm run dev … &`; and remember an HMR socket error in a
  browser drive is harness collateral, not game.
- **My own gate arithmetic flaked twice before the code did** (cycle test
  expected 5 pushes from a 4-loop; "flip back" assumed ±1 returns where you
  came from — it doesn't when a `setSel` moved the shelf between). When a
  fresh gate is red but a hand-replica passes, audit the test first.
- **STATE.md on main regressed to session-265 content** after midday merges
  (slot b's #2219 merge carried the older file). The top-of-file number is not
  authority; the issue board is. Later lanes: re-read the BOARD, not just STATE.

## BOARD
- **#2222 shipped + closed.** QA lane holds #2214 (PickRush polish), #2205
  (ClapTest polish); the Homebody QA passes (#2200/#2209/#2154/#2135/#2220)
  closed during the day. #1711 stays `building` (slot b: #2157 landed as
  #2219; JON_KEY jonq #2218 AWAITING, default = keep inline key).
- Nightly: last completed success (#2096 @ `45e3699`); run for `0f4b2ce`/
  `91b1ca8` in flight at wrap — check at next kick. No quarantine entries.
  No steer/halt on any board.

## NEXT (next slot)
1. Ladder is likely empty again → never-dry `weakestStage`. Homebody now
   carries two fresh unowned gaps from this README edit-window: *no
   skippable-speed control* (the original has pause/fast-forward — a real
   player-facing mechanic) and *no per-object queue display on the needs
   panel*. Both are legitimate one-stage candidates.
2. Watch the nightly for `91b1ca8` at the next kick; red main outranks all.
3. If Jon answers #2218 (JON_KEY file), run `npm run plaicraft:grade` and put
   take verdicts on #1711 (platform lane's tail, not this slot's — unless the
   warden assigns).

## Open questions
- none filed this session (taste bar not reached; jonq games lane empty).

## HOUSEKEEPING
- Slot-a worktree `~/Dev/retrogames-forge-homebody-stores` (branch merged;
  detached at `91b1ca8`, node_modules symlink) — keep for the record.
  Vite on :5173 (mine) stopped at session end; no other lane's port touched.
- `git worktree list` shows no worktree holding `[main]`; main checkout
  detached after the STATE push; STATE parked to slot-a path.
