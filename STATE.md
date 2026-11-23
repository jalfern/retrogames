# STATE — forge board snapshot (slot b, 2026-11-22 late night — shipped)

## This session shipped
- **CONTRA voice orders** (never-dry POLISH #3000 → PR **#3002** → main
  `8c87a00`, prod-verified: Vercel production at the merge sha; live
  `assets/Contra-*.js` contains the order grammar). Contra joins the
  voice games (#1711 S5 lineage): the wingman answers shouted calls —
  `AIM UP / AIM DOWN / AIM LEVEL`, `FOLLOW / HOLD / SPREAD` — through
  `src/games/Contra/voicecalls.js` (pure grammar, no mic needed to test).
  Each call banks as `voiceCmd` on seat 1 (intents, never fake pads,
  #2058); seat 1 is the CPU, so the game honestly reports
  `voice: { slots: [0] }` and only the hero's mic rides the raw track.
  Un-spoken runs are byte-identical (defaults level/follow); orders ride
  stateHash; HOLD self-releases at the scroll edge; arcadeLoop resets
  orders; V toggles; mic grant auto-arms; banner echo + gold notch +
  callAck/callNo sfx. `__contraTest.say/calls/voiceArmed` drive it.
  - Verdicts: contracheck 250/250 (twice, incl. browser voice leg) ·
    `--mutant` 187/187 with two new named plants killed (`voice-deaf`,
    `drift-hug`) · contractcheck 771/771 · plaicraft datasetcheck 84/84
    (voiceCmd bank shape) · eslint + lint:mario/fps/ai + build green.
  - Seed 9 (hold-at-fall) needed the scripted-drill proof the README
    notes: stood=24, drift=2 tiles, chased=40px — drill seeds 1..12.
- **Law-gap marker** (#3000 follow-up → PR **#3004** → main `4cf5333`):
  Contra's "one pad on phones" gap is law-blocked (Jon: no second
  touchpad, #2058) — marked `**DISCLAIMER**` per #2488 marker law, so it
  stops pulling lanes on the never-dry ladder for a non-feature.
  `parseGaps('Contra')` now returns **zero open gaps** — flagship dry.
- QA polish pass filed: **#3003** (`feedback`/`building-qa`) — voice
  orders playtest; QA lane already holds worktree `qa-3003`.

## PLAYABLE on main right now
- `/retrogames/contra` — shout at your wingman: aim and formation calls
  steer the blue seat while its own brain keeps it alive (#3000); LIVE
  plate + mic consent gate (#2999), loop that speaks (#2902), hangar
  sorties (#2917). Plus `/retrogames/floor-boss` (#2997/#2992),
  `/retrogames/fire-crew` (#2994), `/retrogames/r-type`.

## Board at close
- `game-queue`/`next`/`steer` empty; `feedback`: #3003 + #2971 both
  `building-qa` (QA live inside Contra — do not touch). `building` none.
  `halt` none.
- **idle-kick answers `NONE` for builder AND qa** — ladder dry. STOP is
  legal; the sanctioned dry-queue question (new flagship) is already on
  the record this week, and `jonq list games` shows no open questions.
- Next lane: serve arriving feedback; re-run idle-kick before declaring
  dry (new README gaps or QA reports re-arm the ladder). QA's #3003
  polish notes may open fresh Contra gaps.

## Harness notes (carry-overs)
- **contracheck browser voice leg** ("resume is an interstitial", #2902
  family): failed 1 of ~4 full-suite runs on this box, passed on rerun —
  load-sensitive like the floorboss seat-stamp flake (#2966-item-4). If
  it persists, name it for QA with the run table.
- **Voice feature laws (this PR):** orders are intents on the seat, never
  injected pads; defaults must replay byte-identical; anything a call can
  change must ride stateHash; a mic on a CPU seat is a wallhack — report
  slots honestly. These are the reuse rules for the next voice title.
- **#2975 trap persists:** `retrogames-qa-mini-cap` still squats local
  `main`; rule-5 merge exits 1 AFTER a successful squash-merge (hit twice
  this session, #3002 + #3004) — always verify via PR state MERGED +
  origin/main, ignore exit. Worktree cleanup: `qa-mini-cap` is the stale
  one to reap when its PR story ends.

## Slots / ops
- Slot b port 5178 stopped via `scripts/devstop.sh` (by port) ✓;
  worktrees `retrogames-forge-contra-voice` and
  `retrogames-forge-contra-lawgap` merged, removed ✓ (node_modules
  symlinks rm'd as links, targets intact).
- Plumbing checkout `~/Dev/retrogames` detached-clean at `origin/main`.

## Open questions
- None. Dry-queue new-flagship question already filed this week by an
  earlier lane; do not file a second (throttle).
