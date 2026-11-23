# STATE — forge board snapshot (slot b, 2026-11-23 — shipped)

## This session shipped
- **FIRE CREW — the tank speaks** (#2989 POLISH, never-dry kick → PR #2991 →
  main `811b919`, prod-verified live chunk carries the law).
  - The never-dry stage (#1571): idle-kick said `KICK FIRE CREW 0 weak` (only
    weak title; its unowned gap was the #1712 prod line — human-data-gated, so
    it got a DISCLAIMER decided-state marker per #2488 and a real gameplay fix
    shipped instead).
  - Game edge: `TANK_LOW=30` + `tankAlarm(level)` pure rng-free voice (null
    full, two-tone caution climbing with the drain, dry-valve clunk at 0);
    `step()` names LOW/EMPTY crossings for the human seat 1 only — cpu/watch
    silent, refills silent, re-crossings named again; shell fires the specs +
    held-dry click in the spray mirror; HUD bar blinks amber↔ember low, red
    stub dry.
  - Proof: firecrewcheck 201 (22 new gates), 4 mutants die by name (stamp law,
    pitch inversion, unblinking bar, invented-level src pins), firecrewplay
    DRIVE GREEN +7 real-tick legs, datasetcheck 84/84 byte-exact, lint×4+build.
  - QA briefed on #2985 with 4 sharp edges of the new law (threshold
    hysteresis, EMPTY-not-naming-the-cure, held-click rate pin, tankStage
    feature lane at the next #1712 shelf stage).

## PLAYABLE on main right now (prod-verified)
- `/retrogames/fire-crew` — run the hose dry: it chirps LOW, clunks EMPTY,
  the gauge blinks (this session).
- contra / r-type / double-dragon — PUBLIC per Jon's #2846 (unchanged).

## Board at close
- `game-queue` empty; `steer`/`next` empty. `building`: #1712 (human-data
  TARGET — fire-crew prod line stays 0 until a consented phone take lands).
- `feedback`: #2985 (fire-crew QA — items 1,2 by #2988, item 4 by #2990,
  tank-polish notes added this session), #2971 (contra adapter, building-qa).
- idle-kick at close: fire-crew's README gap list is now DISCLAIMER-only;
  #2985 open keeps fire-crew named until QA chews it — expect the next kick
  to follow #2985 down, then re-score the shelf.

## Open questions for Jon (links only, #605)
- (none open; none filed this session.)

## Harness notes (carry-overs)
- **Rebase before merge if two lanes ride one game**: #2990 (radioDeny) landed
  mid-session and touched the same step() tail + check imports; clean
  keep-both rebase, full re-validate (201 + 84 + DRIVE GREEN) before the merge
  loop. `gh pr merge --delete-branch` auto-switch can fail when ANOTHER lane's
  worktree holds `main` (here `retrogames-qa-mini-cap`) — the merge still
  lands; just `git checkout --detach origin/main` yourself and delete the local
  branch by hand.
- Consent-gate latency law holds: play-legs wait for `[data-consent-gate]` /
  poll screen, never fixed 250 ms.
- Browser legs that assert silence must wait for messageT===0 first — a stale
  stamp mid-decay reads like a violation (#2989 seated-leg fix).
- Vercel chunk hashes differ from local builds — verify prod via the entry
  bundle's asset map, not a local filename.

## Slots / ops
- Slot b port 5178: dev server stopped via `scripts/devstop.sh` ✓.
- Worktree `retrogames-forge-firecrew-tank-alarm` (branch merged) removed;
  local `forge/*` branches still need someone's prune.
- Main checkout: detached `origin/main`; this STATE.md committed to main
  (game merged ✓) + `statepark.mjs park b`.
- Nightly watch: first full nightly over `811b919` runs the 201-gate
  firecrewcheck + 7-leg tank drive together against prod Chrome.
