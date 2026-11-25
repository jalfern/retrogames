# STATE — forge board snapshot (slot b, 2026-11-25 — THE BED HUMS)

## This session — one ship, landed
- Warden TARGET **#3351** (TidalRush rider poses) REFUSED at claim — slot a
  held it live. Normal ladder hit step 1b instead of the flagship ladder:
  **#3300 was my slot's own corpse** — builder-b died mid-#3300 (last FORGE(b)
  checkpoint 15:27), branch `forge/skyward-bed` pushed with all six items +
  harness actually landed. Resumed, verified, shipped.
- Shipped **#3300** via **`1c117da`** (PR #3353): SKYWARD's full audio/HUD
  tail. **Rich motor** — opt-in two-saw AudioController voice, ±9-cent detune
  through a load-opened lowpass, ±30-cent blade wobble on the same 13 Hz
  flutter as gain. **Visible engine** — twin exhaust streaks riding
  `engineBed` load (renderer-only, never hashed). **Glider wind-rush** — pure
  `windBed(craft, speed, stormS)`: soft noise bed rises with airspeed,
  motorless craft only, ducked under the storm. **Crash cut-first** — the bed
  dies on the crash tick before the rumble, boarding re-spool fires post
  respawn. **390px HUD** — stage fills the viewport (an inline position
  override had collapsed the canvas), chips to top corners <480px. **Glider
  law banner** — `NO ENGINE — WIND IS YOUR THROTTLE` at checkout (item 6,
  landed pre-death; the corpse was fully built, it just never shipped).
- Proof: skywardcheck **143/143** (+windBed/cut pins), mutants **48/48 die**
  (wind-on-plane breaks motorless honesty, constant hiss, rush-drowns-rings,
  frozen cut…), skywardplay **PASSED** live :5178 (bed cruises/dies/re-spools,
  banner fires, 390px HUD zero violations, #3341 park law intact, zero console
  errors). eslint + 3 scoped gates + build green. Sim hash inputs unchanged.
- Prod verified: served `Skyward-B0HZ2VS8.js` contains the wind-law banner.
  **#3300 shipped+closed** (PR `Closes` auto-closed at merge).

## Harness lessons (worth one line each)
- GitHub GraphQL was flaking all afternoon (`gh pr create`/`issue comment`
  GraphQL errors + nginx 502). Raw REST POSTs (`/pulls`, `/issues/N/comments`
  via curl with the gh token) went through first time — after 3 GraphQL
  failures, switch transport, don't just retry.
- `Merge already in progress` + mergeclean "MERGED (server truth)" = it
  landed; trust mergeclean and check the new origin/main, not gh's exit code.
- **Vercel chunk hashes ≠ local `dist/` hashes** — verify prod by grepping a
  new-marker string in the prod-named chunk discovered from prod's entry
  bundle (index-*.js → Skyward-*.js), not by a locally built hash (local
  `Ct33r5L6` never matched prod `B0HZ2VS8` though both carry the law).
- A resumed corpse that already contains item 6: verify all claims yourself
  (rebase + full suite + live drive) before shipping — the dead session's
  checkpoint comment UNDER-reported what its commits had landed.

## PLAYABLE on main right now
- `/retrogames/skyward` engine-bed audio tail (#3353: rich motor, wind-rush
  glider, cut-first crash, exhaust tell, phone HUD) + belt PARK law (#3341)
  + plane wheels-down (#3327); `/retrogames/tidal-rush` FOAM V wake + crest
  emphasis (#3350) + beating squall + rooms; `/retrogames/pinball` SOLO bed
  + TABLE SMITH + tilt-nudge; `/retrogames/grind-city` rail grabs + coping
  stalls + manual chip + replay free-cam; mario-kart, ice-climber,
  marble-rush, comet-drift pair, ssx, marble-madness, pacman, mario,
  minesweeper/garden-guard/homebody, TIDY BOT, STARRY NIGHT, TOP SOLDIERS,
  DOUBLE DRAGON, RACCOON HEIST, spy-hunter, iron keep, galaga, missile,
  pucks, mines, zork, ultima, king's quest, Joust, Q*bert, forge board.

## Board watch (facts, not questions)
- `game-queue` EMPTY at my close; `building` EMPTY (slot a's #3351 rider poses
  finished mid-my-session); `next` #1712 waiting-jon (not work).
- **Next builder claim: run idle-kick LIVE** — with the queue empty and QA
  live it will land on the flagship/NEVER-DRY ladder; pick honestly from
  README gaps, not from memory.
- QA tails open: #3344 + #3331 + #3310 (skyward polish rounds — this ship
  resolved #3300's six items, NOT those tails), #3342 items 2–5 (tidal V
  legibility), #3329, #3290 items 5–7, #3244/#2971 (waiting-jon).
- main-ok green at merge; latest Production contains 1c117da.

## Open questions (links only — #605)
- #3054 — QA: native TestFlight ports have no recorder/upload (lane:qa, AWAITING).
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).
- No new jonq questions filed this session.

## Slot state at handoff
- Slot b: dev :5178 stopped via scripts/devstop.sh; worktree
  `~/Dev/retrogames-forge-skyward-bed` detached clean at origin/main by
  mergeclean — remove when convenient.
- Game merged this session ⇒ this STATE.md ships via its own docs/state PR;
  parked at /tmp/forge/STATE.b.parked.md via statepark.
- Time-box: ~1 h 10 m of 3 h at ship.
