# STATE — 2026-10-24 forge session 6 (MYST #1005 shipped: the island stamps its own locks)

## Shipped this session
- **#1005 → main (PR #1006 squash 81263f9)** — **MYST: per-save seeded codes**,
  live at `https://www.jalfern.com/retrogames/myst`.
  - Flagship stage (idle.mjs pick): SSX had no open gaps, Emberwood/HD QA-held
    (#994/#1001 — QA lane live, borrow forbidden). First ran the #961 honesty
    pass: README walkability roll-up (#838/#989/#996 all shipped) CLOSED-marked
    so idle.mjs stops re-kicking a dead bullet; fixed-codes gap CLOSED by #1005.
  - Game code: new `codes.js` — mulberry32 seed per fresh game (`?seed=N` pins;
    restart redraws = new book of Myst) → safe (3×1-9), star perm 1-4, sphere
    perm 0-3. `state.js` checks `s.codes`; Atrus's note spells the safe digits
    in words; cave dome grows four true stars sized to the seeded ranks
    (`scene.js:updateTrueStars`); posts sing `sing:<code>` → soundplan order.
    `solveScript(codes)` (attract + harness) solves any seeded island; fixed
    constants deleted.
  - Harness: mystcheck 258/0 (+22 seeded gates: 6 probes win/shape/determinism,
    distinct locks, clue-words-match, restart-resodes, seed parsing).
    `--mutate` 25/25 die incl. seed-ignored-island. mystplay 13/13 live:
    ?seed=42 → locks 658/4213/0231, dome scales 1.22/0.74/0.5/0.98, unpinned
    fresh redraws stars+locks, solve=atrus, zero page errors. mystviewcheck
    79/79. lint myst/mario/fps/ai + build green. Prod chunk index-C2oKLS7N.js
    content-verified (NUMBER_WORDS / seed= / sing:).
  - QA polish filed: **#1008** (`feedback`) — seed persistence, post-ring ticks,
    star silhouettes, Spectator/linking animations, ocean terrain.

## Next goal
- game-queue empty → flagship stages again. Honest re-pick after this session's
  honesty pass: SSX 0 gaps, Emberwood held (#994), HD held (#1001), Myst's
  remaining README gaps are ALL now in #1008 (owned) → **every flagship gap is
  owned ⇒ STOP is legal** unless the board changes (new game-queue/steer/next,
  or QA releases #994/#1001). Next session: re-run idle.mjs honestly first.

## Board / harness status
- main = 81263f9 (this ship). main-ok green at claim + merge; static SUCCESS;
  Vercel prod content-verified (jalfern.com served a Vercel Security
  Checkpoint to curl for a while — verify prod content through real Chrome or
  by chunk-string match with browser UA, not bare curl).
- Worktrees: `retrogames-forge-myst-seed-codes` (done, detached at origin/main).
  Main checkout detached at origin/main ✓.

## New harness lessons (this session)
- **Compare locks, not the seed field.** The seed-ignored mutant survived its
  first draft because the "different island" gate JSON-stringified codes
  including `seed` — the mutated island still had distinct seeds. Determinism
  gates must compare the derived values only.
- **Minifiers fold hex constants** (0x6d2b79f5 does not appear as decimal
  1831565824 in bundles) — pick string-literal markers (word lists, event
  prefixes) for prod content checks.
- **Vercel checkpoint blocks bare curl intermittently (403 interstitial).**
  Poll prod with a browser UA, and keep markers in referenced lazy chunks;
  index hash alone doesn't prove the deploy carries your code.
- A node-gated pure-machine test must place the player at the spot's node
  (`{...freshState(seed), node:'library'}`) or the click no-ops silently.

## Housekeeping owed
- Prune when idle: `retrogames-forge-myst-seed-codes`, plus standing list
  (momentum-courses, iphone-controller, ssx-*, emberwood-*, comet-hd-*,
  qa-863*, people-sim, campfire-670, forge-model-library, coral-reef,
  qa-973*). Keep qa-973 detached from `main` (worktrees-only law).

## Open questions
- None (#605: nothing filed this session).
