# STATE — forge board snapshot (slot a, 2026-11-25 — THE NOTCH FIX)

## This session — one ship, landed
- Warden TARGET **#3336 REFUSED** at claim (slot b live, checkpoint 3 min old —
  correct yield). Normal ladder: no steer, `next` #1712 waiting-jon, `game-queue`
  empty, two QA MASTERs live → no feedback borrow; flagship stage spent (null);
  idle-kick flipped GRIND CITY→**TIDAL RUSH 0 weak** when #3379 took grind-city
  `building-qa` mid-decision. Oldest unowned gap: "Score HUD sits under the
  shared chrome pill" → filed **#3389**, claimed, shipped **`a19233b` (PR #3392)**;
  closed shipped.
- **Root cause was the safe area, not the CI width.** Every shared pill positions
  with `calc(x + var(--sat/sal/sar))`; TidalRush's HUD columns used raw offsets.
  Measured at sat 59 (notched PWA): ARCADE/FEEDBACK covered the score panel
  24–29 px, PAUSE/PADS the speed column 20–24 px. Both columns now compose
  `calc(5.25rem + var(--sat,0px))` (+`--sal`/`--sar`) — the house pattern (9
  other games). Gap constant at any inset.
- **The drive leg caught a second bug mid-fix**: at inset 0 the score sat only
  3px under FEEDBACK (pill real height 29px, my design estimate was 18) — the
  game's own #3365 8px law was missed even on desktop. 5.25rem = 84px fixes both
  stories with one number: 11px constant clearance everywhere.

## Proof
- tidalcheck **236/236** (+4 pins: both columns, no-raw-offset law, chrome-anchor
  truth incl. the 44+29px arithmetic) — **41/41 mutants die** (new `hudlowsat`,
  `hudrosat`; each anchored with its side property so one swap hits one column).
- tidaldrive GREEN :5173 — vacuity guard (4 pills, 2 cols), gap 11px at inset 0,
  gap 11px at notch (sat 59), both tops move 84→143 WITH the inset (composition
  proven by motion). Zero page errors. Full run in-session.
- eslint + 3 scoped gates + build green; main-ok green at claim and merge.
- Prod verified: served chunk `TidalRush-BfdGWYrv.js` contains `5.25rem`.

## Harness lessons (worth one line each)
- **Flag drift**: tidalcheck's mutant flag is `--mutate=`, not `--mutant=` — an
  unknown flag name silently plain-runs green (looks like 41 survivors, is 0
  mutant runs). Detect kills by the `mutant caught` summary line, not exit code:
  tidalcheck exits 0 on the mutant-run success path too.
- Measured pill height (29px) ≠ text-height estimate (18px); spacing laws should
  be pinned as arithmetic (84−73≥8) so the constant moves if chrome grows.
- A QA lane taking `building-qa` mid-decision flips idle-kick between two probes —
  re-run the kick at claim time, not design time (grind-city→tidal rush in ~4 min).

## PLAYABLE on main right now
- `/retrogames/tidal-rush` — score & speed columns now clear of chrome on every
  phone, notched or not; plus squall fronts that BEAT, FOAM V wake, five airborne
  verbs with grabs, rain-that-drags, moored sloops + gulls, rooms/spectate/rejoin.
- `/retrogames/grind-city` — replays, all-time bank, `?line=` share links, plus
  this afternoon's phone-width tail (#3393); `/retrogames/skyward` go-arounds +
  blended-sink flare credit (#3390); `/retrogames/pinball` SOLO bed + TABLE SMITH;
  galaga bee-fleet, mario-kart, ice-climber, marble-rush, comet-drift pair, ssx,
  marble-madness, pacman, mario, minesweeper/garden-guard/homebody, TIDY BOT,
  STARRY NIGHT, TOP SOLDIERS, DOUBLE DRAGON, RACCOON HEIST, spy-hunter, iron keep,
  missile, pucks, mines, zork, ultima, king's quest, Joust, Q*bert, forge board.

## Board watch (facts, not questions)
- `building`: #3394 (GRIND CITY searchable bot line — filed+claimed by the other
  lane; my old never-dry pick — its README gap is theirs now), #3336 (PINBALL bed
  tail 2, slot b). `building-qa`: #3375 (skyward wheels-down tail 2).
  `game-queue` EMPTY; `next` #1712 waiting-jon.
- New open feedback: **#3395** (my notch-tail: non-race screens at insets, LINK
  PADS panel over HUD at ≤360px, one-band banner at notch, carry-over wake/
  reflection/knee gaps).
- Merges today incl. #3386/#3372/#3390/#3393, **#3392 (mine)**. Never saw red main.
- Next builder claim: ladder starts empty; doubt rule before filing — tidal-rush's
  next unowned README lines are the BLOCKED pair (wire pad shape, device QA), so
  never-dry would land on whatever the other lanes don't hold.

## Open questions (links only — #605)
- #3335 — QA: music-bus low-pass in AudioController (AWAITING, qa lane).
- #3054 — QA: native TestFlight ports have no recorder/upload (AWAITING).
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).
- No new jonq questions filed this session.

## Slot state at handoff
- Slot a: dev :5173 still up (stop via scripts/devstop.sh only). Worktree
  `~/Dev/retrogames-forge-tidalrush-hud-clear` detached clean at origin/main by
  mergeclean — remove when convenient; old clean squatters from prior sessions too.
- Game merged this session ⇒ this STATE.md ships via its own docs/state PR;
  parked at /tmp/forge/STATE.a.parked.md via statepark.
- Time-box: ~1 h 45 m of 3 h at ship.
