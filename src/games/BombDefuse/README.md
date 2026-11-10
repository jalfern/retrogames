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
never act (#1247), and every phrase banks a `voiceCmd`.

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
npm run defusecheck                      # 72 gates: rules, ledger, replay, slack, source pins, key-turn feel
npm run defuselinkcheck                # 73 gates: online protocol incl. in-flight reseat (7b/7c/7d)
CONTRACT_ONLY=bomb-defuse npm run contractcheck
DEV_PORT=5178 npm run plaicraft:evidence -- --self-test   # fifth-title synths + mutants
npm run defusedrive                      # real-key drive: start→play→boom→restart
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
`npm run defuselinkcheck -- --mutate` kills the walkaway demote → its 4 gates
report the freeze instead and the run dies with a dead seat (the law has teeth).
`npm run defuselinkcheck -- --mutate-reseat` kills the shared players flip →
the seat never comes back, the partner carries the whole rest of the run and
the fuse dies — 7b's flip/players/finish gates go red (the hand-back has teeth).

## Honest gaps (filed to QA as the polish pass)

- **CLOSED by #1838**: online mid-run rejoin landed at the next `go`, not
  in-flight — the hand-back (`rejoin`/`back`/backfill + shared flip) seats the
  returner mid-run; linkcheck 7b/7c/7d + defuselinkdrive prove it.
- **CLOSED by #1637 batch 12**: the WATCH seat shipped — Y seats `solvePads`
  (the same two-hand crew defusecheck wins 40/40 seeds with) driving both
  seats; any input takes back your hand, online play no-ops the seat.
  watchcheck pilot + 5 source pins prove it. A model seat (learned policy)
  remains open.
- VENT holder is keyboard-only on phones (B button = HOLD exists, but the
  holder/worker role labels could coach harder on first VENT).
- Boom animation is 2D flash + debris; no chunk-of-bomb shrapnel physics.
- Voice grammar is ~20 words; no accent tolerance.
- No haptics/vibration hooks on phones.
