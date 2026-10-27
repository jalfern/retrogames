# STATE — session 32 (2026-10-26)

## Shipped this session
- **TEN-DEEP stage 1** — merged `dbc4c9c` (#1137, issue #1127).
  Live at https://jalfern.com/retrogames/ten-deep (private — #379 — not in
  the Arcade menu until Jon promotes). WIZARDRY's trademark is gone: dir,
  route, label, hooks (`__deepTest`), checks (`tendeepcheck`, `tendeepplay`),
  CI keys (`tendeep`) — zero Wizardry strings in src/scripts/bundle.
  Content is now own-IP: TEN DEEPS below a fallen keep (seeds new, layouts
  new, names new) and a new bestiary — Cave Rat, Mire Adder, Rag Goblin,
  Bone Sentry, Pale Wraith + fresh plates Grave Ghoul, Bog Troll, Minotauros,
  Deep Wyrm — boss THE HOLLOW KING (crowned, glow-eyed, no flight) with two
  Wyrm wardens. Rules untouched: 6-hero party, ledger combat, slack-proven
  campaign (1152 cmds, 7 potions, 8 springs, 65 casts; lvl-9 party; all
  slack deletions still win). tendeepcheck 676/676 (+5 mutants caught);
  tendeepplay 25/25 real keys, zero page errors; King fight pixel-checked.
- Solver bug the ten-floor proof exposed: autopilot deadlocked standing on a
  spring at FULL MP re-issuing `use` — now drinks only when dry. (Three-floor
  geometry never hit it; ten floors found it in minutes. Proof finds bugs.)
- QA polish pass filed: **#1138** (stone reads, step easing, mob idles +
  death dissolve, spell VFX, automap fog, floor ambience, HUD vials, epitaphs).

## Playable now
- TEN-DEEP on prod (private). `scripts/main-ok.sh` green at merge time.

## Branches / harness
- Worktree `~/Dev/retrogames-forge-ten-deep` REMOVED after merge; main
  checkout detached at origin/main.
- CI `wiz` steps renamed to `tendeep` in ci.yml (workflow scope present —
  britannia's missing CI steps still are NOT; see session 31 note).
- `npm run tendeepcheck / tendeepplay / lint:tendeep`; scope `tendeep` in
  checks.mjs. tapstart/vpadboot/vpadcheck/attractcheck now expect TEN-DEEP.
- New-game rename lesson: bulk s/WIZARDRY/TEN-DEEP/ corrupts identifiers
  (`WizardryGame`) and lazy-import paths (`../games/Wizardry`) — grep the
  broken token after any branding rename, before the first lint.

## For the next session
- #1127 is back on `game-queue` for **stage 2: the surface world** — tavern
  (hire/roll), temple (resurrect/heal), training grounds (spend XP — the
  sim's 100*lvl^2 curve already runs; the town spends it), magic shop.
  Stage 3: races/classes/alignments + spells-by-level. Stage 4: MODERN look
  = shared renderer #1129 (don't double-build it inside TEN-DEEP).
- Or Jon promotes TEN-DEEP public / rules on #1129 (renderer) — it would
  lift TEN-DEEP, BARD'S TALE and BRITANNIA dungeons at once.

## Open questions
- #1121 (AWAITING, board direction) — unchanged, deadline 2026-10-28.

## Lessons learned
- A determinism check that prints `a.hash vs b.hash` IDENTICAL on failure is
  lying about the cause: the condition AND-ed in `won`. Compose failure text
  from what actually differed.
- The `setup({floor})` DEV guard was hardcoded `< 3` with the old floor
  count — carry floors-count changes into harness helpers, not just FLOORS.
- Screenshotting a pixel game while spamming `cmd` faster than rAF captures
  the hit-flash full-white (flashHit decays only per paint). Let frames land
  (~1s idle) before sampling pixels.
