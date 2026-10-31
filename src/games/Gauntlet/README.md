# GAUNTLET (Atari, 1985) — overhead

The real cabinet view: a scrolling top-down camera above ten hall mazes.
8-way stick, swarms from generators, slam/locked doors, food economy,
potions, keys, stairs, and Death when the timer dies. The deeper halls add
arcade hazard furniture — warp arches, breakable blocks, vanishing floors,
teleport swirls, stun sparks and hidden passages. Route `/gauntlet`.
The first-person sibling lives at `/four-halls` (FOUR HALLS) on the SAME
engine, pinned to the original four mazes (`levelCount: 4`).

## What is where

- `levels.js` / `sim.js` / `planner.js` / `art.js` / `sound.js` — the shared,
  camera-agnostic engine (FOUR HALLS imports these from here). `step()` takes
  a mode from `opts.topDown`:
  - **first-person (default)** — left/right turn, fwd/back along the facing.
  - **overhead (`topDown: true`)** — each arrow sets facing AND moves (8-way);
    a blocked diagonal slides along the free axis; doors, slam, keys, arrow
    and Death rules are the same code paths. `inp.aim` is the pilot lane: the
    autopilot points absolutely (a player does this with the stick), then
    travels down the barrel it is looking through.
- `index.jsx` — the overhead renderer: camera follows the hero (clamped to the
  level), raised two-tone brick courses lit by the hero's torch + drop shadow,
  two-tone floor grain,
  slam/locked/broken door faces, glowing stairs, sprites punched at runtime,
  facing-dagger + sword-arc sweep, vignette and scanlines, side panel (mini
   map, portrait, health, keys/gold), narrator strip, hero select, CPU partner
   toggle (`C`), attract replaying `plan(2, {topDown:true})`'s proven run.
- `select.js` — the hero-select cards (issue #403): one card-geometry
  definition feeds both the painter and the touch test (`heroAt`), so a tap
  lands where the pixels are — tap a card to pick it, tap it again to start.
  gauntletcheck proves the hit test in plain Node.
- `minimap.js` — the pure half of the map panel (issue #275 item 8): the
  shared camera (`viewRect`, used by the view AND the map so "seen" can't
  drift from the screen), the beasts the view shows (`mapMonsters`), and the
   stairs' key-pulse (`stairsPulse`). drawPanel renders exactly its decisions;
   gauntletcheck proves them in plain Node.
- `juice.js` — the view's reactive overlays (issue #275 item 4): the screen-edge
    throb under 30% health (`lowHpPulse`), the sword's light-arc trail on the
    blade's own arc (`swordTrail`), and the green flush while Death drains you
    (`isDraining` + `deathTint`). drawView renders exactly its decisions;
    gauntletcheck proves them in plain Node.
- `walls.js` — the corridor look (issue #275 item 2): the hero's torch
    (`torch`, `litColor`) lights the stone bright around him and dark at its
    reach, and each wall course is two-toned per material (`mortarTones` — a
    dark recess + a light bevel). drawView renders exactly its decisions;
    gauntletcheck proves them in plain Node.

## Fidelity notes

- The issue body asked for top-down — and the 1985 cabinet IS top-down; the
  previous first-person build keeps every rule it had and now ships under
  FOUR HALLS with the issue's HUD fixes (see `../FourHalls/README.md`).
- Kept from the original: overhead scroll that follows the hero, 8-way
  movement where facing follows the stick, arrows fire down the facing, the
  four heroes (stats differ), constant health drain + food + the narrator's
  "NEEDS FOOD, BADLY!", slam doors sealing behind you (sword-batter opens
   them), locked doors eating keys that carry between mazes, generators that
   wind up with a visible pulse + flash (issue #275 item 3) before belching the
   level roster, until smashed, potion clearing every roamer but not
  Death, Death walking in on the treasure timer and draining point by point,
  stairs up ending each world and the tenth ending the quest.
- Hazard furniture (#950, mazes 5-10; the autopilot treats it all as provable):
  green warp arches skip the quest two floors ahead (never offered on the last
  mazes, never to an earlier one), crack-etched 'B' blocks crumble after two
  sword blows, glowing 'T' trap floors cycle solid/open on a fixed period and
  bruise + shove anyone caught inside when they close, 'P'/'p' swirl pads
  teleport, 'S' sparks stun the legs (movement at `stunFactor` speed), and 'h'
  false walls look solid until revealed. `visualChar`/`logicChar` split look
  from walkability; the planner blocks 'B'/'T' so no route ever *needs* a
  hammer swing or trap timing.
- Simplifications (honest gaps): no shop, no Valkyrie resurrection, one potion
   effect (screen clear), no fire/water/bomb item variants, CPU partner follows
   and stabs but has no door/key logic of its own, two-player is desktop-only,
   monster swarm caps follow the level roster rather than the cabinet's screen
   limits, and the walls are one shared brick layout themed per-world by
   palette alone (no distinct per-world wall art). Filed as a QA polish pass.

## Controls

P1: Arrows / the stick: move 8-way (facing follows) · Space / A: sword at what
you face · X / F / B: arrow down the facing. P2 (desktop, issue #275 item 7):
WASD: move 8-way · F: sword. Hero screen: arrows or TAP a card to pick P1,
Space or TAP the card again to start (issue #403); C: CPU partner, P:
two-player (P2 on WASD+F, A/D picks P2's hero, shown as a second portrait) ·
V: voice co-op — speak to the CPU seat (see Spoken co-op below) ·
?: pause.

## Verify

```bash
npm run lint:gauntlet               # eslint gate for both games + harness
npm run gauntletcheck             # 133 checks: geometry, art, sound, minimap,
                                      # select (the hero-card touch test),
                                      # juice (the view's reactive overlays),
                                      # walls (the torch + two-tone courses),
                                      # generators (the wind-up), 2p (the human
                                      # partner), rules, overhead mode, ledger,
                                      # pilot, slack, determinism
npm run gauntletcheck -- --mutate # 16 mutants, all must die
npm run voicecmdcheck           # #1249 spoken co-op: grammar, obey/refuse,
                                #      pad-law, determinism, voiceCmd format,
                                #      quest won with 20 calls shouted (mutant
                                #      red: --mutate makes the seat deaf)
npm run slotcheck -- --mutate     # #494 seat determinism: cpu pads recorded,
                                      # replayed through model seats, hash-equal
npm run gauntletplay              # advisory browser drive (needs npm run dev)
```

The attract demo is `plan(2, {topDown:true})` — the same deathless full-quest
run the harness grades.

## Two players (#492 pilot)

Player 2 has three ways in: the keyboard (WASD + F), and a second physical
gamepad via the shared slot layer — pad 2 drives slot 2
(`src/utils/onePad.js` `slotPad(2)`), mapped by `p2input.js`
`p2From(kb, pad, prev)`, which folds both sources into the sim's
partner input (sword is edge-triggered; `prev` carries the pad levels).
Plugging a second pad in flips the partner to HUMAN at attract/select; pad 2
d-pad/stick picks P2's hero, A claims the slot, A swings. Pad 1 keeps the
keyboard-event path (VirtualControls-compatible); pad 2 never dispatches keys,
so the two players cannot collide. `__game.meta.players` is 2. The `step`
threading that makes any of this move (`step(gs, inp, pInp)`) is the #491
root cause — driven for real by two fake pads in headless Chrome, and pinned
in `vpadcheck` (slot isolation, the slot map, the merge, the wiring).
gauntletplay adds the behavioral half of that guard (#491): the `frame()` DEV
hook steps the real `doFrameSim` with P2 holding W and P1 idle, so P2 must walk
up on its own input and leave the stationary hero behind — a pure/`p2From` or
source-string test alone would miss a frame-path regression.

Honest gap: a closed door still blocks P2 (door-opening for the partner is a
separate filed item, see sim.js `updatePartner`).

## Player slots (#494)

Seat 2 is a `src/utils/slotSources.js` slot with kinds `off / human / cpu /
model` (+ reserved `remote`): Off by default at hero select (per #275),
C opens the CPU seat, P the human seat, a second pad auto-opens human, and
`__game.step([p1, p2])` drives the model path one pad per player. The CPU
partner now PLAYS BY HUMAN RULES: `planner.js partnerPad(gs, prevA)` trails
nothing but a pad — it walks toward the hero's back side and pulses `a` when
a beast comes into reach; the sim folds it through the same pad path a human
pad gets (`updatePartner` follows ANY `partnerInp`, no 1.15 speed bonus, no
door favors). A partner with no pad at all (FOUR HALLS, whose seat is not
wired yet) keeps the old first-person trail as fallback. Determinism law
proved by `npm run slotcheck` (seed + recorded pad streams ⇒ identical
state hash, tick by tick, for both this game's seat kinds and Bubble Bobble;
`--mutate` drops one live pad and goes red). `gauntletplay` drives the seat
for real: C at select, Digit1, the partner travels under its own pads.

## Spoken co-op (#1249) — the model in a seat takes orders from your mouth

A human plays; the partner seat listens. `V` toggles voice co-op at hero
select or mid-run (mic consent is the #1247 ask, never auto-asked; declined
= a polite toast, game plays on). The path: mic → `src/utils/speechListen.js`
(Web Speech wrapper: continuous, auto-restarts after Chrome's silence-stop,
disarms on hard failure) → `voicecalls.js parseCall` (transcript → intent,
null when unsure) → `planner.js applyCall` (freezes the goal cell at call
time) → `partnerPad(gs, prevA, cmd)` steers it — **the seat still only emits
pads**, so the sim never learns a voice exists, and Frank's trained model can
drop into the same `intent → pad stream` seat later.

Calls: **"take the upper right"** (goto the far side of that quadrant),
**"grab the key"**, **"follow me"**, **"hold here"** (+ synonyms; see
voicecalls.js for the exact grammar; compass words split the maze at W/2,
H/2). Rules the seat keeps while obeying: the survival food-break still
outranks an order (a dead partner guards nothing), the cut pulse keeps
firing (hold = stand your ground and swing), a locked door means WAIT at the
threshold, and a refused call (no key on the level, no lane into a walled
corner, no partner) is answered honestly — the banner says NO KEY / NO WAY.
Explicit HOLD does not auto-release when the hero arrives; next call wins.

The player always knows what was heard: the words + the intent flash bottom-of
view (green obeyed / red refused, with the why), a blinking VOICE dot marks
listening, a `MIC ON · <order>` pill sits bottom-right, and obey/refuse blips
are synthesized. Every call banks into the recording as the additive
`voiceCmd: [{t, said, intent, ok, dir?, why?}]` channel (#1247's file, like
ping: replay ignores it; what the seat DID is `slots[1].pads` on the same
tick clock, raw audio aligns via the voice clock).

Honest gaps: en-US only (Web Speech API); recognition is the browser's — a
misfire is a null intent, not a misobeyed order; the speech mic uses the
system default device (Web Speech takes no deviceId — the #1247 recorder
still honors the picker); voice co-op is local solo play only (online seats
get their pads from the friend); the seat takes no loot — "grab the key" walks
it to the key and holds the spot for the hero (existing no-hands gap, see
Honest gaps above); headless browsers have no speech engine, so CI drives the
same path through `__gauntletTest.voiceCall()` and `setVoiceMode()`; auto
release-on-hero-arrive for goto (partner waits at the corner until the next
call or V) is a filed polish candidate.

## Online 2P (#531) — the pilot

`?net=host` opens a room and shows its 4-letter code; a friend opens
`?net=join&room=CODE` and the game starts when the host picks a hero.
Since #1039 the join flow, the waiting room (`<Lobby>`) and the #546 reconnect
ladder are the shared ones (`src/utils/lobby.js`) — identical to SSX and Blob
Battle; Gauntlet keeps its own lockstep lock and hero payload on top.
Transport is the Cloudflare relay (`relay/`, see its README); both browsers
run the same deterministic sim from the host's seed and exchange pads +
hashes through the reserved `remote` seat path — `src/utils/lockstep.js`
holds the rules: every pad is FINAL (sampled once, D=4 ticks ahead — input
delay; never resample-and-resend, that desyncs), a tick runs only when both
pads for it are in, and `stateHash` is compared every 30 ticks. A mismatch
freezes both screens with NET DESYNC. Canonical seats: hero = host's entity
on BOTH boxes (hashes line up); the guest's camera, torch, minimap marker and
panel follow `gs.partner` so each player watches their own hero. `?relay=…`
points at the Node twin (`node relay/server.mjs 8787`) for local testing.
Honest gaps v1 (filed to QA): no reconnect/rejoin-after-desync mid-game, no
ping display, restart after game over needs a reload, one game (this pilot),
no rollback for jitter beyond the 4-tick buffer.

#546 partial: while WAITING, a dropped socket auto-reconnects with
exponential backoff (`retryDelay` in lockstep.js: 400ms doubling, 8s cap,
6 tries) and the relay's rejoin re-pairs the friend; during PLAY the HUD
shows one-way pad AGE (ms since the freshest remote pad) plus a blinking
STALL n while the delay buffer drains, so lag reads on screen instead of
looking like a freeze; pair and leave get synth blips (peer/gone). Still
open: reconnect mid-play, net-aware restart, tappable join keypad, per-IP
relay auth.

Verify: `npm run netcheck` (relay core + protocol + lockstep determinism +
corrupted-sim IS caught + #546 backoff/age/stall pins) and `npm run netdrill`
(two headless Chromes over real keys: pair, seed, play, desync, friend-left,
dropped-socket auto-rejoin — needs `npm run dev`).

## Link pads (#893) — iPhone as controller

`?pads=1` on this game's URL opens a link-pad room (the PADS pill shows the
4-letter code); phones join at `/retrogames/pad` (enter the code). Each phone
takes the next generic pad slot (#494 rules, see `src/utils/padlink.js`):

- Seat 1 (first phone) is the console-pad route: keyboard events (Arrows +
  Space + B via this game's declared `pad.secondAction`) + analog stick —
  exactly like gamepad #1, so P1 plays on the phone while the iPad is the
  screen.
- Seat 2 lands in onePad slot 2 — `pollP2Select` claims it at hero select
  (press A on the phone), which is the "Gauntlet with two phones" pilot:
  two humans, phones in hand, iPad shows FOUR HALLS.
- Pad state streams ~120/s over a direct WebRTC data channel (unordered, no
  retransmits) signaled through the relay room; if ICE can't pair the stream
  falls back to the relay at ~50/s. The phone pad shows which path plus a
  live ping. A silent phone releases its keys after 1s.

Local test: `node relay/server.mjs 8787`, then `?pads=1&relay=ws://localhost:
8787` on the game and `?relay=ws://localhost:8787` on the pad pages. Rules
gate: `npm run padlinkcheck` (13 gates; mutates to red when the seat→slot
routing breaks).

Honest gaps: no QR code (code shown as text); seat 1's
keyboard route shares slot 1 with the screen's own touch (last writer wins,
same as gamepad + keyboard); `jalfern.com/pad` site-root alias lives in the
jalfern repo, here the pad is `/retrogames/pad`. Ping IS written into the
`retrogames-rec/v1` file (#919): remote seats carry an additive sparse
`ping: [{t, ms}]` trace of the measured link RTT (replay ignores it, files
without it stay valid) — plus the pad page shows a rotate-to-landscape hint
and buzzes on button presses where `navigator.vibrate` exists.

## Voice in recordings (#1247) — the online pilot

Online races record **raw voice per player** into `retrogames-rec/v2` (v1 files
stay valid; replay ignores voice). Each player-device answers one consent
prompt before its mic ever opens ("headsets recommended — tracks don't bleed";
the answer is saved on the track; declining = no audio, the race plays on).
Local captures ride the `__game` contract (DebugKit REC — a scripted
`recordStart()` never prompts: `navigator.userActivation` keeps harness files
clean v1). The **guest's mic streams live to the host** — raw opus chunks plus
its tick clock ride the relay's already-forwarded `pad` type as a `k:'v'`
subkind (sig-style framing, ~6 msg/s vs the 240/s window, **zero relay
changes**), the host assembles them with `makeVoiceInbox()` and the contract
merges everything into its file via `spec.voiceExtra`. Alignment: every track
carries `clock: [{t, ms}]` sampled ~1/s inside the sim — `tickToMs(clock, t)`
puts any pad tick into the audio, `voiceDrift()` reports worst lag from
realtime (proven over a synthetic 30-min throttled session). Guest mic is
released on race end, peer-gone **and unmount**. Re-export is a verbatim
base64 decode (`voiceReexport`) — nothing to transcode for PLAICraft.

Live capture finally wired too: Gauntlet's own loop now banks every sim tick
via `recordLiveTick` at the `doSim` funnel (loop-lock-guarded so a contract
`step()` never double-banks) — a hand-REC during real play is a replayable
file, which it wasn't before (#527 item 1, retro-joined).

Verify: `npm run voicecheck` (40 gates: format, alignment math incl. the
30-min drift profile, wire budget/rate, consent gating; `--mutate` goes red
when the clock stops riding the wire) and advisory
`DEV_PORT=… npm run voicedrive` (headless Chrome: overlay → consent → real
opus bytes → validating v2 file. On macOS it stands in a WebAudio oscillator
stream because TCC kills headless hardware capture; `VOICEDRIVE_HW=1` forces
the fake-device path for Linux boxes).

Honest gaps: guest tracks align to the guest's own tick clock, which matches
the host's file only when recording spans the whole race (start REC at race
start); link-pad phone mics are separate devices and are NOT captured (the
host mic covers seat 0 only in net play); production has no recorder yet —
the transport runs in prod builds today but only DEV/harness sessions save
audio until the Plaicraft sink (#1141) lands.

## Voice feedback layer (#1257)

- **Mic badge** (`src/utils/voiceCapture.js`): `[data-voice-mic]` dot, top-left
  — green `REC` while ANY voice session on the page holds the mic open, grey
  `MIC OFF` while one exists but is declined/denied, removed when the last
  take finalizes. Refcounted, because a page can bank two sessions (recorder +
  online guest stream).
- **VU bar** (`#vc-vu`): ~1.2 s of level meter right after YES — proves the
  chosen input actually hears sound before a 30-min session dies quietly.
  Peak level lands on `window.__voiceVu` (voicedrive pins > 0).
- **Device pick**: the consent overlay carries a `#vc-device` select
  (filled async from `enumerateDevices`; hidden when the list is empty);
  the choice persists in `localStorage['retrogames:voice-device']` and every
  later `getUserMedia` asks `deviceId.exact`, falling back to the default when
  the saved device is gone (headset unplugged must not kill the take).
- **Host consent pill** (Gauntlet): `voice: P2 ✓/✗` bottom-left during an
  online race once the guest's intro/declined message lands — driven by
  `netVoiceIn.voiceState(seat)` (voice.js). Exposed as
  `__gauntletTest.voiceGuest()`.

Gates: voicecheck +4 (voiceState truth table), voicedrive +7 (badge rec/off,
no-badge-pending-consent, badge gone after take, VU bar + signal, picker
present, deviceId reaches gUM). Deferred here, still open on #1257: the
two-page `voicedrive --online` wire proof and the link-pad phone voice stream.
