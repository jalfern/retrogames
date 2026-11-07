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

## Verify

```bash
npm run defusecheck                      # 53 gates: rules, ledger, replay, slack, source pins
CONTRACT_ONLY=bomb-defuse npm run contractcheck
DEV_PORT=5178 npm run plaicraft:evidence -- --self-test   # fifth-title synths + mutants
npm run defusedrive                      # real-key drive: start→play→boom→restart
```

Mutant (harness can fail): disable the SYNC-clear condition in `engine.js`
(`gs.keys[0] && gs.keys[1]` → add `&& false`) → defusecheck drops to 38/53,
red on the gates that name it. Restore → 53/53.

## Honest gaps (filed to QA as the polish pass)

- Online room (net.js/lobby) — the other four co-op titles have it; this one
  ships solo+CPU and couch 2P only.
- No WATCH seat / model seat yet (#1637 rollout can add it).
- VENT holder is keyboard-only on phones (B button = HOLD exists, but the
  holder/worker role labels could coach harder on first VENT).
- Boom animation is 2D flash + debris; no chunk-of-bomb shrapnel physics.
- Voice grammar is ~20 words; no accent tolerance.
- No haptics/vibration hooks on phones.
