# STATE — forge board snapshot (slot b, 2026-11-23 — shipped)

## This session shipped
- **MINESWEEPER chord shield** (never-dry POLISH #3009 → PR **#3010** → main
  `ef15bf6`, prod-verified: Vercel SUCCESS at the sha; served chunk contains
  `!open && !flag` before the chord push). The engine's `chord()` opened all
  covered neighbours — flags included — so a **correctly flagged mine
  detonated** under a satisfied click: the `end=dead opened=71/71` signature
  QA nailed in #3008 (repro 2/10 locally at `25a26ae`). The original Windows
  chord clicks covered **unflagged** cells only; wrong flags stay fatal the
  original's way (they satisfy the clue while the real mine sits unflagged).
  The module's own solver already read `!s.flag[c]` — engine and referee now
  agree (one load-bearing line in `minefield.js`).
  - Verdicts: sweepcheck 99/99 · `--mutate` **5/5 die** (new named plant
    `flag-devour` + a chord probe in probeMutant — seqPlay is dig-only and
    blind to this bug class) · `sweepplay` 40/40 (was 38/40 with exactly this
    leg red) · spy driver (same key path) **12/12 wins** (was 8/10) ·
    eslint + lint:mario/fps/ai + build green.
  - #3008's own suggestion pinned: **post-win lock** anchor — full sweep ⇒
    WIN the instant `opened` hits the safe total; dig/chord/flag refused after.
- QA polish pass filed: **#3011** (`feedback`/`lane:qa`) — shield feel, `?`
  mark misreading, post-win lock screen, chord sfx burst, flag-education copy.

## PLAYABLE on main right now
- `/retrogames/minesweeper` — flags now shield the chord like the original
  (#3009); guess-free boards everywhere. Plus `/retrogames/double-dragon`
  (#3005 idle-seat handback), `/retrogames/contra` (voice orders #3000),
  `/retrogames/floor-boss`, `/retrogames/fire-crew`, `/retrogames/r-type`.

## Board at close
- `game-queue`/`next`/`steer` empty; `building`: #3007 (slot a, DD polish
  pass — claimed before mine). `building-qa`: #3008 (QA inside Minesweeper's
  advisory-reds run — **do not touch Minesweeper from another QA claim**).
  `feedback` unclaimed: #3011 (mine, QA's next job). `halt` none.
- `idle-kick` answers **NONE** builder and qa; dry-queue new-flagship
  question already on the record this week — STOP is legal.
- Note: #3008's sweepplay leg was the real rules bug (fixed here); its other
  legs (doscheck kingsquest/ultima1, Iron Keep `?`/pad, kartplay, fpscheck)
  are the load-flake family QA is calibrating inside #3008.

## Harness notes (carry-overs)
- **Engine vs referee disagreement is a fidelity signal.** Here the solver
  modeled the flag-shield and the engine contradicted it; the original
  decided which was wrong. If a check catches "impossible" play, diff the
  rule tables before touching thresholds.
- **prod-verify markers need strings or a named chunk:** my fix added only
  comments, and Vercel's build names chunks (`Minesweeper-*.js`) while a
  local symlinked-node_modules build names them `index-*.js` — comparing
  hashes cross-environment is noise. Reliable recipe used: entry chunk name
  match from `www.jalfern.com/retrogames/` + locate the game chunk by a
  string marker, then grep the minified rule pattern in the served bytes.
  Also: apex `jalfern.com` 308s assets to `www` — curl with `-L` or go www.
- **#2975 trap persists:** `retrogames-qa-mini-cap` still squats local
  `main`; rule-5 merge exited 1 AFTER a successful squash-merge (hit again
  this session, #3010) — always verify via PR state MERGED + origin/main and
  ignore the exit. Reap that worktree when its PR story ends.
- Mutant-proof by revert still works — but do NOT `git checkout --` the
  engine file afterwards (it discards the fix too, found out mid-run); use
  the edit tool both ways, or commit before mutating (mutateguard's rule).

## Slots / ops
- Slot b port 5178 to be stopped via `scripts/devstop.sh` (by port) at exit ✓.
  Worktree `retrogames-forge-msweeper-chord` detached-clean after merge ✓
  (node_modules is a symlink — remove as link only).
- Plumbing checkout `~/Dev/retrogames` detached at origin/main; local
  `forge/*` branches from this lane deleted post-merge.

## Open questions
- None (no jonq filed: never-dry POLISH is sanctioned work, no taste call
  needed; dry-queue flagship question already asked this week — no second).
