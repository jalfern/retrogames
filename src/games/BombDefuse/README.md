# BOMB DEFUSE — engine notes (#1800, PLAICRAFT S1 fifth title, Part of #1711)

Original co-op simultaneous two-hand defusal pair. **Nothing one hand does
counts**: every step of every bomb carries ONE sync window and demands BOTH
seats inside it. Lineage (design comment on #1711): the Cold-War two-key
switch (Wargames 1983) as a whole game — deliberately NOT the KTNE split-info
line that TALK ME DOWN owns.

## Mechanics (pure engine: `engine.js`, Node + browser)

- **SYNC** — both seats turn their key (A); a lone key holds the window only
  until it expires → strike `SLOW KEY`, keys reset, retry.
- **CUT** — a target color lights; each seat cycles its cutter arm (up/down,
  4 colors) and snips (A). Both blades armed inside the window → wire out.
  Wrong color = **nick** (−2 s, the wire survives); one blade stale past the
  window → strike `WINDOW CLOSED`.
- **VENT** — the seeded holder pins the stabilizer bar (B) while the worker
  seats the swinging gauge needle (A) inside the green zone. Seating while
  unvented = **surge** (−6 s); an unvented step burns the fuse double while
  it waits; a whiffed seat is a **dud** (the sweeping gauge is the penalty).
- **Fuse ledger**: mistakes eat TIME (nick −2 s / strike −4 s / surge −6 s);
  zero fuse = boom. Bombs: 60/50/40 s, windows 75/60/48 f, steps 3/4/5,
  green zone half 190/140/100 (needle units ±1000), needle 2/3/4 °/tick.
- Step 0 of the run is always SYNC (teaches the mechanic); kinds never repeat
  in a row.

## Determinism law

Seed → layout via mulberry32 (`seed ^ 0xB0BB1E5`); every rng draw happens at
**step load** — tick-time logic (partner, window counters) is rng-free, so
recorded pad streams replay identically. Hashed state is **integer-only**: the
needle rides a module-load 360-entry integer sine table, never `Math.sin` at
hash time (the #1793 wall-time-float divergence lesson, applied preemptively;
pinned by a defusecheck source-pin gate).

## Seats

players=1 → the seat-2 **partner pads are emitted inside `step()`** from
fixed cadences (leads stalled SYNC steps, walks its arm to the target and
waits for your blade, holds/seats the vent per step role). An EMPTY seat-2 pad
means nobody home → partner covers; any true field hands the seat to the
human. `solvePads()` drives BOTH seats cleanly (attract autopilot, harness
win gates, evidence synthesis) with load-step jitter — zero strikes by
construction.

## Capture spine (#1711)

Consent (autoRecord) before seed-birth; `armLiveCapture` every build; live
loop feeds `recordLiveTick(pads)` and closes the take with `endRun()` AFTER
banking the final tick. No attract picks → **no `rules` stamp needed**.
`exposeFeedbackState` reports the seed; `seedFromQuery()` accepts it back.
`V` opens the mic — words coach (`voice.js` grammar), pulse the control,
never act (#1247), and every phrase banks a `voiceCmd`. The grammar reads
priority: WARN (wait/no/stop → red frame + blip) > wire-pair colour ("cut the
blue wire") > action verbs (sync/hold/seat — an action beats a colour, and
bare GREEN means *needle to green*) > bare colours > one-to-two-edit mis-hear
tolerance (read→red, blew→blue; 3-letter colours keep a leash of 1 so "said"
stays silent). Urgency words (faster/quick) ride the SYNC pulse.
defusecheck's voice-grammar section pins every rung (#1812 item 9).

## Online room (#1819 — `net.js` + shared Lobby)

Two boxes, one bomb: `?net=host` opens a DEFUSE CREW room, a friend opens the
join URL (QR/entry card) and the host kicks with SPACE. The wire is
lockstep-by-sampling-law (#531), same shape as the other four co-op titles:

- `go {seed}` — one seed, both boxes run the same deterministic sim (the
  seed-pure integer engine made this free).
- `pad {k, mm}` — each box samples its own seat every tick, `PAD_DELAY = 8`
  ticks ahead of the sim, batched `SAMPLE_EVERY = 2`; tick k does not run on a
  box until the peer's mask for k is in.
- `hs {k, h}` — whole-sim hash every `HASH_EVERY = 60`; mismatch freezes the
  guest, `res {e:'req'}` → host snapshot `res {e:'snp', i/z/p}` chunked under
  the 512 B relay budget; the guest restores at the SAME tick with pad streams
  PRESERVED (samples already sent are final — the sampling law). The snapshot
  carries the rng counter (`rng.x()`), the one thing the seed can't rebuild
  mid-run.
- A walkaway is not a crash: `DROP_GRACE = 30` stalled ticks demotes the dead
  seat and the engine's partner emitter takes it **on both boxes** (`players`
  flips to 1) — the run burns on with a CPU partner. If the guest survives the
  host, its own pads drive seat 0.
- **An in-flight reseat (#1838):** a partner that reopens the join URL mid-run
  rides a hand-back instead of waiting for the next `go`. The returner asks
  `res {e:'rejoin'}`; the host answers `res {e:'back', k:backTick}` + the
  usual snapshot chunks + a `pad` **backfill** of the masks it sampled while
  the socket was gone (late delivery is legal under the sampling law; absent
  pads are fatal — the returner could not tick without them). The guest
  rebuilds at the host's tick (`reseatBase` re-bases its own buffers; REMOTE
  preserved) and both boxes flip `players 1→2` on the SAME sim tick (`backTick
  = stamp + RESEAT_LEAD`) — flip tied to tick, never wall clock, so hash
  equality survives it. Until the flip `assemble()` keeps seat 1 for the
  partner, and the solo survivor KEEPS PUMPING its pads (a returner can only
  climb back onto a live stream). Hand-back patience is `RESEAT_WINDOW = 180`
  **stall ticks** — the sim tick freezes while the host waits, so a tick-based
  window could never expire (the frozen-clock trap, pinned by gate 7c). A
  returner that never pumps demotes again through the normal stall law.
- Pure core: `net.js` imports no DOM/WebSocket — `scripts/defuselinkcheck.mjs`
  proves codec, lockstep, jitter, walkaway, resync and rejoin in plain Node
  over `relay/core.js` rules; `scripts/defuselinkdrive.mjs` rides a real
  relay (`relay/server.mjs`) with two headless browsers, real keys and a real
  tab-close walkaway. On #1622 `--single-process` boxes the drive falls back to
  one persistent context with two tabs (a second isolated context aborts sp
  browsers) — still two JS runtimes, two relay sockets.

## Verify

```bash
npm run defusecheck                      # 290 gates: rules, ledger, replay, slack, source pins, key-turn feel, gauge redline, first-VENT coaching, the first-vent teach panel, powered-device bed, window pre-flash, active-seat chips, the boom FX, the win tally, the attract marquee camera
npm run defuselinkcheck                # 75 gates: online protocol incl. in-flight reseat (7b/7c/7d)
CONTRACT_ONLY=bomb-defuse npm run contractcheck
DEV_PORT=5178 npm run plaicraft:evidence -- --self-test   # fifth-title synths + mutants
npm run defusedrive                      # real-key drive: start→play→bed/pause→boom→restart (+coach, press-tick, pre-flash, win-salad, teach-panel, attract marquee cuts)
DEV_PORT=5173 npm run watchcheck -- --only bomb-defuse   # WATCH pilot: seat/advance/takeover/re-seat/resume/release + 5 source pins
npm run defuselinkdrive                # two browsers over a live relay: join→lockstep→hash→walkaway→in-flight reseat
```

Mutants (harness can fail): disable the SYNC-clear condition in `engine.js`
(`gs.keys[0] && gs.keys[1]` → add `&& false`) → defusecheck drops to 38/53,
red on the gates that name it. Restore → 53/53.
Key-turn feel mutants (#1812 item 2, the `TURN` block in `engine.js`):
`STAGGER: 0` (no seat lag) → the stagger gates go red; `K: 1, D: 1` (no
spring — teleport returns) → lag/overshoot/settle/click gates red; `RATCHET: 1.2`
(detent unreachable) → the click gates red. All three kill named gates; restore
→ 72/72. `defusedrive` re-proves the law in a real browser tick-exact: seat-1
truth ON while the pose is still 0 (STAGGER hold), a mid-swing frame, then
home (|pose−1|≤0.06) under the held truth.
Gauge redline mutants (#1812 item 5, `pegNeedle` in `engine.js`): passthrough
clamp (`drawn = raw`) → sweep + full-scale + hash-adjacent gates 3 red; always-
hot (`hot: true`) → the two cold-ride gates red. Both die on restore → 83/83.
View: `index.jsx` VENT gauge rides `peg.drawn`, and only while hot the bezel
shakes (±1.6 px per frame) and the red arc at d≥60 glints through the glass.
`npm run defuselinkcheck -- --mutate` kills the walkaway demote → its 4 gates
report the freeze instead and the run dies with a dead seat (the law has teeth).
`npm run defuselinkcheck -- --mutate-reseat` kills the shared players flip →
the seat never comes back, the partner carries the whole rest of the run and
the fuse dies — 7b's flip/players/finish gates go red (the hand-back has teeth).
Coaching mutants (#1932): `pulseBar: named && isHolder && !gs.held` →
`pulseBar: false` reddens the ring gate; `if (!gs || gs.done || taught)` →
`gs.done && taught` reddens the two silence gates (a coach that never stops
teaching is not a lesson). Restore → 105/105.
First-VENT coaching (#1932): `hud.ventTaught` latches on `sealed`; until then
`E.ventCoach` (pure, hash-clean) grows a teach card under the READ-STEP plate
naming YOUR seat's job and pulses the control that must move (amber bar ring
until pinned, green gauge ring + `TAP!` when the needle crosses the zone).
`__bdTest.coach/ventTaught/probeStep` expose it for `defusedrive` (5 gates:
role naming, ring pixels before/after the pin, latch + quiet-after).
First-vent TEACH PANEL (#1812 item 1): the plate names YOUR job, but a phone
newcomer still has to map seats onto the physical bomb. `E.ventPanel(gs, taught)`
(pure, hash-clean) is the full-panel law: at the run's FIRST untaught vent it
titles both roles with seat, side (LEFT/RIGHT = seats 1/2 as drawn) and the REAL
keys (seat 1: B / HOLD PAD + SPACE; seat 2: G + F). `index.jsx` paints it over
the board from the verdict only, and any input lands-while-due dismisses it for
the run — `dismissPanel` consults `panelUp` (the LIVE law: play + vent due +
seal latch), not last frame's paint, so a press landing the tick the vent loads
dismisses before the first paint, while keys turned BEFORE the first vent never
preempt the lesson (a pad tap reaches this law as its synthetic keydown);
`newHud` re-arms per run, the seal
(`ventTaught`) silences it too. The press still lands on its control: the panel
is a caption over the live board, not a modal that eats the input. Mutants:
always-null reddens the 23 teach gates; dropping `|| taught` reddens the
taught-crew silence gate; unwiring the keydown dismiss reddens the pin.
`__bdTest.panel/panelGone` + `defusedrive` prove it live: the panel rises at
seed 7's first vent naming the sim's holder, one genuine (unmapped) KeyJ
dismisses it without acting, a later vent in the same run stays quiet, and a
new run re-arms the lesson.
Powered-device bed (#1812 item 10): `sfx.bed` hums a sub-bass triangle every
`BED.EVERY` (30) shell ticks while the play screen is armed; `bedHz(secs)` (pure,
in `audio.js`) sits at BASE 55 Hz until 15 s, +3 Hz per second gone, capped TOP
98 Hz; `pumpBed` (index.jsx, both tick paths) ducks while `hud.boomT > 0` and
never runs outside play/pause-live. `__bdTest.bedPings` proves it live. Mutants:
flat `bedHz` (always BASE) reddens the climb + cap gates; dropping the boomT
condition or a tick-path call reddens the pins. Restore → 119/119; drive 22/22.
**Paused-crash fix found on the way (was red AT MAIN):** the overlay was passed
`gameEntry=` while `PauseOverlay` takes `game=` — any Escape during play crashed
the whole app (`{game.label}` on undefined, pageerror + React tree gone). Fixed
to `game={entry}`; defusecheck pins the prop, the drive rides pause/resume live
(tree alive after Escape, bed frozen while paused, awake after resume).
Drive notes (#1932 session): two #1812 gates went red on this box AT MAIN
(`defusedrive` 2026-11-10) and were re-anchored — the press-tick reads now
park at a clean baseline and capture the whole spring INSIDE one sync
evaluate (the old shape measured puppeteer round-trip; an instant-consent
restart lets the partner lead before the probe), and the coach join taps only
after the partner's key is visibly turned (blind Space spam was a self-strike
farm). The same run also fixed a latent crash: the guest reseat hud literal
dropped `turn`, so `drawScene` read `undefined` on the next frame — main's
linkdrive errors there (pageerror ×3), this branch is clean.

Window pre-flash (#1812 item 4): the SYNC WINDOW bar only appears after a
seat acts (`drawWindowBar`'s `hold > 0`), so before the first press the window
was invisible. `E.preFlash(gs)` (pure, hash-clean) names what an UNTOUCHED
step asks — SYNC barrels, CUT arms, VENT holder bar — and `index.jsx` rings
those controls with a pulsing amber rim until any seat touches the step
(key / blade-cycle / bar-pin = touched; that tick the window bar takes the
shift). Per-window law: every step of a clean run flashes at its load. VENT's
rim shares the coach ring geometry and yields to it while the first-vent
lesson is still untaught. Mutants: always-null reddens the five load-flash
gates; never-null reddens the three retire gates; ignoring `gs.held` reddens
the VENT pin gate; ignoring `gs.sel` reddens the cycle-counts-touched gate.
All four die by name; restore → 136/136. `defusedrive` live-gates it after a
fresh `start` (rim law answers at load, retires on the partner's first lead).

Active-seat chips (#1812 item 7): the strip said WHO sits (P2 CO-OP/CPU), never
WHO IS ASKED. `E.seatAsk(gs)` (pure, hash-clean) names each seat's outstanding
debt for the live step: SYNC/CUT ask BOTH and a seat leaves the list the moment
it answers (key turned / blade armed — latches never re-light); VENT splits the
roles — the holder owes until `gs.held` reads true (level law: release re-lights),
the worker owes until the seal. `index.jsx chipInk` paints it: the P-chip under
each seat's control pulses while that seat owes — SYNC amber, CUT green (both in
phase), VENT holder amber / worker green half a beat apart; the HUD strip's P2
chip pulses too, so a CPU partner's debt is visible. Paused kills the pulse.
Mutants: holder debt ignoring `gs.held` → the pin + won-run gates go red;
both-true-always reddens the answered gates. Restore → 154/154. `__bdTest.seatAsk`
exposes the live law for the drive harness.

The boom (#1812 item 3): the trope films it — on the boom event the case LID
blows off (tumble + gravity + fade, paint-frame physics), nine brass SHRAPNEL
fragments arc out on long parabolas (heavier than the tap-sparks), and the
chassis takes five soot DECALS that ride into the next run: `scorchDecals` is
module-level on purpose — a restart does not wash the bomb clean, only unmount
does. All of it is view: `spawnBoom` reads only `Math.random` (the ART.md 5
allowance for juice) and never `gs`; the engine is untouched, the hash law
stands. `__bdTest.boomFx/boomNow` expose it; defusecheck pins spawn-wiring,
gs-free spawn, module-level decals, gravity, and hash-invariance (mutant:
unwire `spawnBoom(hud)` → the spawn gate reddens, 163/164). `defusedrive`
rides it live: lid+shrapnel in flight 150 ms after the kill, FX riding across
the screen change, next run opening scorched but lid-free — 26/26, zero page
errors.

Win tally (#1812 item 6): the WON screen no longer dumps the raw score — it
RECAPS like the arcade does. `gs.bombs[i].earned` accumulates wherever points
are paid (`advance()`: +50 per step, +500 + fuse-bonus per bomb), so the ledger
is honest by construction: the lines sum EXACTLY to `gs.score`. `earned` rides
no hash input and never enters `simState` — replay hashes are byte-identical
(pinned). `E.winTally(gs)` (pure) hands the view its three lines;
`E.tallyFrame(values, ms)` is the playback law — line i rolls 0→value over
`TALLY.ROLL` starting at i×`TALLY.LINE`, the TOTAL rolls last over
`TALLY.TOTAL`; every roll is monotonic, capped, and lands EXACTLY (`landed`
counts home-lines, +1 for the total). `drawOver` paints from the frame only and
dings via `sfx.tally(i)` (rising, one per landing); entering over re-arms the
ding counter. `net.js` carries `ez` in the resync snapshot so a guest's recap
tells the host's story (missing `ez` = old host = zeros, honest by omission).
Any key still retries after the 700 ms lockout — impatient crews skip the
salad. Mutants: dropping an `earned +=` reddens the score-delta + sums gates;
always-live `winTally` reddens the empty-ledger gate; dropping the roll's f-clamp
reddens the never-rewind gate; all die by name. Restore → 185/185;
`defusedrive` proves it live: lines sum to the score, salad still rolling when
the screen lands, TOTAL on the score within its window — 29/29.

Attract marquee camera (#1812 item 8): the demo self-played the solver, but the
whole case at 1x under the title band made the two-key turns — the small parts
that ARE the game — read tiny. `E.attractCam(gs)` (pure, hash-clean) is the
cut law: INTRO holds the wide establishing shot; then the camera films what the
live step is asking — SYNC the key pair, then the barrel of the seat that still
owes its turn (`late-key`), back to the pair when both are in; CUT the arms,
then the armed arm, then the snip ON the target cable (x tracks the colour);
VENT the holder's bar until it pins, then the gauge for the seat. Because the
solver works every kind, the shot cycles per step — every beat of the demo gets
its hero frame. `index.jsx` eases `camRef` toward the verdict at 0.07/frame
(paint physics) and draws the case through `center→scale(z)→focus`; the dim
lifts 0.66→0.42 while zoomed so the hero reads; a new attract loop opens wide.
One message at a time still holds. Mutants: gutting `attractCam` to always-wide
reddens 16 gates by name; replacing the ease with a snap reddens the ease gate.
Restore → 290/290. `__bdTest.marquee` exposes shot + eased cam; `defusedrive`
watches a 9 s demo loop live: named cuts only, z reaches 1.44, the loop cycles
through wide/keys/late-key/gauge — 39/39.

## Online fold-in (#1812 items 1, 2, 4): the LINK PILL
Mid-run online play flew blind: room code + peer state lived only in the
Lobby/attract, the kick and the mid-run re-seat landed silent, and after a
walkaway demote the survivor lost its YOU tag. Now `E.netPill(info)` (pure,
engine.js — shell facts only, never `gs`) is the law: no code → no pill;
a returning seat reads **LINK RETURNING** (amber) before anything; a demoted
crew reads **CPU PARTNER** (red) before jitter; ≥ `LINK.SHAKY` (8) stalled
ticks reads **LINK SHAKY** (amber); whole wire reads **NET ·CODE· LIVE**
(green, code clamped to 4 chars). `drawHudFrame` paints only the verdict,
centered in the bottom strip; `__bdTest.netPill()` exposes it for drives.
`sfx.crew()` (rising C-E-C) sounds on the kick (CREW LINKED) and the #1838
flip (PARTNER RE-SEATED) — the shared Lobby chime only covers the attract
overlay, so these two moments were the silent ones. Solo survivors re-tag:
`youSeat = solo ? 0 : ...` — the survivor's keys drive seat 0 (loop law),
so the YOU tag stays honest. defusecheck 185→201 (law + precedence + code
clamp + shaky threshold exact + hash-lacing invariance + view/chime pins).
Mutants: drop the solo branch → the demote + tone gates die by name;
restore → 201/201.

## Honest gaps (filed to QA as the polish pass)

- **CLOSED by #1838**: online mid-run rejoin landed at the next `go`, not
  in-flight — the hand-back (`rejoin`/`back`/backfill + shared flip) seats the
  returner mid-run; linkcheck 7b/7c/7d + defuselinkdrive prove it.
- **CLOSED by #1637 batch 12**: the WATCH seat shipped — Y seats `solvePads`
  (the same two-hand crew defusecheck wins 40/40 seeds with) driving both
  seats; any input takes back your hand, online play no-ops the seat.
  watchcheck pilot + 5 source pins prove it. A model seat (learned policy)
  remains open.
- **CLOSED by #1932**: VENT role coaching — the first vent of a run now teaches
  YOUR seat by name (`YOU HOLD THE BAR` / `YOU SEAT THE NEEDLE`, keys included),
  the bar that must be pinned pulses until it IS pinned and the gauge pulses
  `TAP!` exactly on the sim's zone; the lesson latches on the first seal
  (defusecheck +22 gates incl. hash-purity, defusedrive 5 live gates with ring
  pixels). On phones the HOLD pad finally arrives with a lesson that says what
  it is for. Remaining here: the pad label itself is still the static `HOLD`
  verb (VirtualControls is shared); the canvas carries the teaching.
- Boom animation is 2D flash + debris; no chunk-of-bomb shrapnel physics.
- Voice grammar is ~20 words; no accent tolerance.
- No haptics/vibration hooks on phones.
