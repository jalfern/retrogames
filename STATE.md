# STATE — session 34 (2026-10-28) — TEN-DEEP stage 2: THE RIM SHIPPED

## Shipped
- **TEN-DEEP — stage 2: THE RIM** (surface world), PR #1153, squash
  `1668ab3`, part of #1127. Live: https://jalfern.com/retrogames/ten-deep
  (private, #379 — verified in the prod bundle, chunk index-CfCw8b2n.js
  carries THE RIM).
- Wizardry's surface, own world: the run OPENS at the hamlet on the well.
  TAVERN posts replacement heroes (40g, seeded deterministic rolls, refuses
  the living); TEMPLE mourns 200g×lvl (dead at 1 hp) / restores 400g×lvl /
  mends 30g / refreshes 25g; TRAINING GROUNDS spend carried XP + 100g×next
  level; ALCHEMIST sells potions at 25g. Gold: mobs pay xp/4; a wipe carries
  the bodies home at a half-purse tax; dead + purse<hire = the real over.
- **Proof purity kept**: all Node proofs and playOut run `strict` — no second
  life in the harness; campaign still wins in 1153 commands (+1 `down`),
  slack holds (-pot/-spring/both/no-springs), `proven.ledger.tx === 0`.

## Harness
- tendeepcheck 716/716 (+39 RIM pins incl. gold conservation through
  walk→ambush→wipe→hire, coffin-crew refused at the well, broke+fallen=over,
  hashes see purse/street); 6/6 mutants caught incl. new hireCost→0.
- tendeepplay 37/37 real keys + pixels (street door pick, interior wash,
  hire off real keys, tax booked, F reopens DEEP 1). attractcheck caught my
  two long attract lines in CI once — fixed to ≤44 chars, then `static` green.

## Board
- #1127 back on `game-queue` for **stage 3**: races/classes/alignments at the
  tavern + spells-by-level. Stage 4 = MODERN look via #1129 (don't
  double-build the renderer inside TEN-DEEP).
- #1138 (TEN-DEEP polish pass) got the stage-2 additions: textured facades,
  street life/animation, MOURN juice, coin clink, town ambience, inn-vs-temple
  economy note, demo beat showing the surface.

## Branches / housekeeping
- Worktree `~/Dev/retrogames-forge-ten-deep-surface` — release when stage 3
  starts or prune; branch deleted on merge; worktree detached at origin/main.
- TEN-DEEP is NOT in contractcheck/nightlybot rosters (stage-1 precedent:
  it ships with its own tendeepp* arms). Don't "fix" this by reflex — it is
  a deliberate scope choice, revisit only with Jon.

## For the next session
- Claim #1127 stage 3 (race/class/alignment roll at the tavern — the hire
  pool grows into creation; spells-by-level unlocks with level).
- Or promote candidates for Jon: TEN-DEEP + BRITANNIA both playable private.

## Open questions
- #1121 (board direction) — AWAITING, deadline passes today; the warden
  sweep takes its default. No new questions filed this session.

## Lessons learned
- `gh pr checks` can report a STALE pre-rebase `static` FAILURE; verify the
  check belongs to the current head SHA (`gh run list --json headSha`) before
  believing a red after force-push.
- The Wipe→tax bug class: per-hero floor-halving must book exactly what it
  takes, and a hire must not destroy the dead hero's carried coin — the
  conservation pin (`goldIn − spent == purse`) caught both in minutes.
- attractcheck (44-char lines) is a CI-only gate — run it locally before
  pushing attract copy changes.
