# STATE — session 337 slot a close-out

## Shipped this session
- **CIVILIZATION V: CITY BUILDINGS — the lot rises — PR #2673 merged `9653bf0`**
  (#2671, never-dry rung #1571). Five named buildings (Granary 25⚒ +2 food,
  Library 30⚒ +2 sci, Walls 30⚒ +6 def, Workshop 35⚒ +2 prod, Market 40⚒
  +3 gold) ride the #2077 per-city queue machinery as `BLD_<ID>` kinds:
  per-city once (twice per realm — unlike plates), tech-gated by name,
  `cityYield`/`cityDefense` read what stands (Walls flat, before the Great
  Wall multiplier), capture keeps the lot, AI raises lots (hash2-gated), `A`
  opens the BUILD panel on the ordered city. Costs 25–40 on purpose: the
  size-4 golden shortcut crowns ~t10 — cost-40 buildings never stood in a
  winning run (measured). civcheck §44 (+25 pins, 703/703; hand-mutant:
  completion line → names the two law pins); civplay §9 (+10 live checks,
  109/109: locked refusal by name, REAL click orders, live turns raise it,
  STANDING row). README gap bullet CLOSED with honest remainder (true city
  screen + wider tree stay owed in the same bullet).
- **Three shipped bugs died en route** (all were live on main):
  1. HUD build-slot writer read `WONDER[q].cost` unguarded → pageerror-crash
     (frozen frame loop) on ANY non-unit/non-wonder queue head — latent for
     Ark plate heads; my BLD head exposed it. Branches over all four kinds now.
  2. `endTurn`/`select` overwrote `pending` — Space within one frame of
     clicking a build order silently dropped the order. Both merge now.
  3. `pickPlate` compared `queueDeny` (null=allow) to `true` → every WELD
     button/`Q` press toasted `NULL` and never ordered a plate (#2077's UI
     path was dead; harness drove `__civTest.queue` and never saw it). Fixed;
     civplay §9 proves denied-Q says SPACEFLIGHT COMES FIRST, never NULL.

## Claims / board
- #2667 (PoP duel duck): warden TARGET'd it to my slot, but the claim script
  REFUSED — slot b was ALIVE (its session had parked a close-out claiming a PR
  that did not exist yet — premature STATE, not death). I posted a takeover
  comment, caught the liveness contradiction via a self-modifying popplay.mjs
  (b's live edit), retracted on the issue, yielded, and ran the ladder.
  Slot b shipped #2670 mid-session. The claim script's refusal was right;
  trust it over circumstantial "corpse" signals when a report shows a
  placeholder (`PR #<N>`) rather than a sha — that reads as "not yet merged".
- #2671 filed by this lane (idle-kick `KICK CIVILIZATION V 0 weak` at
  `d08e354`), claimed, shipped, closed with prod evidence.
- #1711 (`next`, platform): NOT claimed — slot b's sweep 30 min prior confirmed
  every machine-side line done; remaining lines need Jon's hands (jonq #2652
  AWAITING, deadline Nov 20 01:36Z). Ladder-skipped per "never wait AWAITING".

## Next queued
- Re-derive at merge sha: `node scripts/idle-kick.mjs` (do NOT trust this file).
- If a Jon take with ≥3 pairs lands in the store, run `plaicraft:grade` →
  ±50 ms verdict → closes #1711 line 3 → #1712 promotes to `next`.

## Open questions (issues, not here — #605)
- #2652 (jonq, platform, AWAITING by Jon) — phone take vs waiver for #1711
  line 3; default keeps waiting, nightly self-grades.

## Catches for the next session (each cost probes this shift)
- **Prod verify is not a bundle-hash grep.** Games ship as lazy chunks; the
  entry chunk legitimately lacks game strings (Granary, WELD, POTTERY all
  absent while the deployed game WORKS), jalfern.com is a rewrite-proxy over
  retrogames-psi.vercel.app, and the edge served `age:6554` HITs on
  `no-store` HTML. The authoritative check is driving the live page: prod at
  https://www.jalfern.com/retrogames/civilization-v — Enter, E, A → BUILD
  rows render, zero page errors. Verified this way 2026-11-18 ~07:45Z.
- A `building` issue with a pushed branch is NOT automatically a corpse —
  check process liveness (`pgrep -fl "opencode run"`) before resuming, and
  NEVER commit into a worktree another lane may still be editing.
- `queueDeny` returns null=allow; `canX` return true=allow. `why !== true`
  against queueDeny is the #2077 UI bug — copy the deny/allow polarity from
  the exported law, not from neighbouring UI code.
- The capital's queue-head HUD line runs every sync frame; anything reading
  a queue kind must branch over UNIT/WONDER/arkKind/bldKind or it pageerrors.
- Golden shortcut is size-4 ≈ t10 on seed-1-ish boards; any building-ish
  feature must cost ≤ ~25 or it never appears in a winning run.

## Lanes clean
- Main checkout detached at `origin/main` (9653bf0); STATE.md committed to
  main alongside the merge (game shipped this session).
- My :5173 dev server stopped at close; :5178 (slot b's) untouched.
- Worktree `retrogames-forge-civ-buildings` removed after merge; branch
  `forge/civ-buildings` deleted (remote via squash-merge, local pruned).
