# STATE — forge board snapshot (slot a, 2026-11-28 — Lemmings gets a voice)

## This session (slot a) — TARGET claimed, shipped, staged

**LEMMINGS-LITE — the SOUND slice of polish pass #3879 (PR #3885, merged `5eb4024`)**
- **What shipped:** `MUSIC.lemmings` — an ORIGINAL Graveyard-era homage bed
  (64 steps × 0.16 s: A-minor lament bass A–Ab–G–Gb–F–E, chromatic-descent
  lead, E7 hang whose resolution is the loop restarting on A, heartbeat kicks +
  dry hats). The bed follows the game: attract 0.45 → play 1 → out on
  pause/over, transitions only. **Mute:** `M` on every screen + a SOUND row on
  the pause screen — new opt-in `mute={{on,toggle}}` prop on the shared
  `PauseOverlay` (games that don't pass it render byte-identical help);
  persisted in `lemmings.muted`, lifted on exit so silence never leaks onto
  the next title. **Six per-skill grant voices** replace the shared ladder
  blip: thunk / hiss / grunt / rumble / swoosh / knock.
- **Gates:** lemcheck 259 → **282** (+23: tune structure — lengths agree,
  notes integer & in-register, perc sparse — plus wiring pins; remove the tune
  or a skill branch → red in seconds) · `--mutate` **304/304** · lemplay 55 →
  **66** (bed low attract / full play / out pause / back resume, M and
  SOUND-tap paths, choice persists across visits) · hand mutation: disable the
  `syncMusic` driver → both bed pins red, restore → green · lint mario/fps/ai
  + build green · one flake-free lemplay rerun after a 4-fail first pass
  (pre-sound timing checks, advisory rule: rerun once, move on).
- **Prod verified:** `Lemmings-C9_tX7-K.js` carries `startMusic("lemmings")` +
  `lemmings.muted`; the shared chunk carries `lemmings:{step:.16}` and
  `data-mute`/`SOUND:`. #3879 stays OPEN (multi-stage): look/animation,
  splintering wood, vents/trampolines/teleports, float-while-digging and 8–10
  boards remain; re-labelled `feedback` for the QA ladder.
- **Learned:** Playwright has no key named `Question` — press `Shift+Slash`
  like the existing pause test; the claim script clears the source label
  (`feedback` included), so a staged issue needs re-labelling for the board;
  the SOUND row lives in the shared chunk, not the game chunk — verify
  production at both.

## Slot board

| Slot | Lane | Doing | Since | Heartbeat |
|---|---|---|---|---|
| a | games | idle at `origin/main` (`b23bde1`) after shipping #3879 sound slice | 2026-11-28 ~18:20 | fresh |
| b | games | idle at `origin/main` after shipping #3876 (`6bf7a7e`) | 2026-11-28 ~16:40 | fresh-ish |
| building-qa | qa | **#3888** SIMCITY-MIN idle water motion; busy day — #3884/#3886/#3887/#3890 merged | — | fresh |

Open question issues: **#3791 AWAITING JON** (dry-shelf flagship title),
**#3516** (Arkanoid texture rung — 48 h deadline passed; the sweep decides).
None blocks a claim; none re-filed this session.

## What is playable right now

- **LEMMINGS-LITE** at https://jalfern.com/retrogames/lemmings — the attract
  now rides the Graveyard bed while the autopilot lays its SPIRE road and
  MASSIF bridge; play takes the bed to full, `M`/SOUND mutes (remembered),
  and every skill answers with its own voice.
- **SIMCITY-MIN** — fresh river-wave/grain art merged by QA (`b23bde1`).
- **ARCADE** at https://jalfern.com/retrogames/ — 17-tile grid, sixth slot
  BUILDER.

## Next actions by priority

1. **`game-queue` is empty** (checked 2026-11-28 ~18:20). Ladder candidates
   when a next/claim appears: **#3823** LEMMINGS SCRIPTED re-solve digest;
   the #3879 remainder (`feedback`, QA territory); **#3857/#3856** DEFENDER
   stages 2–3; **#3790** ARCADE; MACGIVER #3786 at 0.
2. If a builder later takes sloped planks (#3879 remainder): the sim speaks in
   whole cells — render-only slope, direction from the descent it rides; do NOT
   move the grid.

## Open risks

1. **Attract is no longer silent** — the bed starts before the AudioContext
   unlocks (Chrome suspends it until the first gesture, so first sound may be
   mid-loop). If QA calls it abrupt, tune `setMusicLevel`, never the track.
2. **`mute` is new shared plumbing** — the first other title to adopt the prop
   should run its help/overlay checks once (Lemmings' SOUND row is pinned).
3. **QA churn is high** (four merges today) — expect feedback-label collisions;
   read claims before building.
4. **`statepark` cannot prove its own currency (#1214)** — with lanes finishing
   minutes apart, `current` shows whoever wrote last.
5. **Games at 0 lack sensor/agent files** (#3821, #3784) — a claim that
   assumes them fails at step 4 of Adding a game.
