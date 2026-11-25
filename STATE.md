# STATE — forge board snapshot (slot b, 2026-11-25 — THE BED HUMS, PART 2)

## This session — the corpse that wasn't (two PRs + a first-ever vista)
- Warden TARGET **#3300 SKYWARD bed polish** claimed. Main body shipped
  **`1c117da` (PR #3353)**, chrome-column tail **`efd6a2d` (PR #3361)**;
  issue `shipped`+closed. A parallel slot-b runner (warden re-kick during the
  GitHub write outage) resumed the same branch and pushed the first STATE
  (#3363) — same session's work, this file completes the record.
- Six items: **rich engine voice** (two saws ±9c through a load-opened
  lowpass — `engineBed` gained pure `cut`; blade flutter bends pitch ±30c);
  **exhaust-streak load tell** (renderer-only, rides pre-duck `fx.raw`);
  **glider wind-rush** (`windBed` pure law: glider-only, airspeed-risen,
  storm-ducked, whisper cap 0.03 + sibling `loopWind` voice); **crash
  sequencing** (bed cut leads, rumble +0.18 s, respawn re-spools); **390px
  HUD** into a `<style>` block (media queries can't beat inline styles);
  **glider banner** teaches the motorless rule.
- **Three bugs the audit surfaced**, all prod-live before this session: the
  stage's inline `position:relative` overrode `absolute inset-0` (canvas
  collapsed to its intrinsic ratio at every size — prod looked right only
  because the first `setSize` baked a matching aspect); **attract had NEVER
  drawn** — `orbitAttract` moved a camera nothing rendered with, so every load
  ever showed an empty canvas behind the title card (now the vista orbits
  live, screenshot-verified); and the SCORE text sat under the mute icon at
  phone width (mobile HUD now runs one column below the corner chrome).

## Proof
- skywardcheck **143/143** + mutants **48/48 die** (5 new #3300: wind-on-
  plane, no-duck, constant-hiss, shout-rush, frozen-cut; one old mutant
  re-anchored after the engineBed reformat).
- skywardplay GREEN :5178 — crash-cuts-bed/re-spool, glider banner, and the
  **390×844 overlap audit that counts corner chrome** (0 violations); zero
  console errors. eslint + 3 scoped gates + build green. Hash/stateOf
  byte-identical (existing determinism pins).
- Prod verified: `Skyward-B0HZ2VS8.js` (banner law) — post-#3361 chunk
  contains the chrome-column rule (`top:76px`).

## Harness lessons (worth one line each)
- GitHub's **write path degraded ~20 min** (git receive 500, pr-create GraphQL
  502/empty) while reads and issue-comments worked — and one "failed" create
  HAD created #3353: after any create error, `gh pr list --head <branch>`
  before retrying, or you marry a ghost.
- The outage's silence invited a **warden re-kick onto my own live branch** —
  two slot-b runners shipped/annotated the same work. Checkpoints kept both
  honest (nothing duplicated into the code); next time post liveness comments
  DURING backoff, not only after.
- A lane helper rebased my pushed branch onto fresh main mid-outage (reflog:
  `rebase (pick)` ×N) — that's plumbing, not corruption; force-with-lease
  back, re-green, done.
- WebGL `readPixels` returns empty outside a draw call (the
  `preserveDrawingBuffer` law, bitten again): judge canvas content with
  screenshots, not probes.

## PLAYABLE on main right now
- `/retrogames/skyward` — the first-ever attract vista, rich motor + exhaust
  tell, glider wind-rush, crash re-spool, phone-filling portrait (#3353 +
  #3361); plus belt+plane runway landings, living storm, THUNDERPASS;
  `/retrogames/tidal-rush` FOAM V + rider jump/land moments (#3356) + rain
  gameplay + rooms; `/retrogames/pinball` SOLO bed + TABLE SMITH;
  `/retrogames/grind-city` rail grabs + coping stalls; galaga bee; mario-kart,
  ice-climber, marble-rush, comet-drift pair, ssx, marble-madness, pacman,
  mario, minesweeper/garden-guard/homebody, TIDY BOT, STARRY NIGHT, TOP
  SOLDIERS, DOUBLE DRAGON, RACCOON HEIST, spy-hunter, iron keep, missile,
  pucks, mines, zork, ultima, king's quest, Joust, Q*bert, forge board.

## Board watch (facts, not questions)
- `game-queue` EMPTY at close; `building` EMPTY (slot a finished #3351 rider
  poses mid-session); `next` #1712 waiting-jon (not work).
- **Next builder claim: run idle-kick LIVE** — queue empty + QA live lands the
  flagship/NEVER-DRY ladder; pick honestly from README gaps, not memory.
- QA tails open: #3344/#3331/#3310 (skyward polish rounds predating the bed
  work), **#3362 (new: post-bed-polish — vista portrait, streak legibility,
  wind mix on device, 320px + landscape)**, #3342 items 2–5, #3329, #3290
  items 5–7, #3244/#2971 (waiting-jon).
- Merges today incl. #3350, #3353 + #3361 (mine), #3355, #3356, #3363.
  main-ok green at claim and merge.

## Open questions (links only — #605)
- #3054 — QA: native TestFlight ports have no recorder/upload (lane:qa, AWAITING).
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).
- No new jonq questions filed this session.

## Slot state at handoff
- Slot b: dev :5178 stopped via scripts/devstop.sh; worktrees
  `~/Dev/retrogames-forge-skyward-bed` and `…-forge-skyward-hud2` detached
  clean at origin/main by mergeclean — remove when convenient.
- Game merged this session ⇒ this STATE.md ships via its own docs/state PR;
  parked at /tmp/forge/STATE.b.parked.md via statepark.
- Time-box: ~2 h 15 m of 3 h at ship.
