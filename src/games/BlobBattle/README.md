# BLOB BATTLE (#840)

An original head-to-head chain battler in the spirit of Puyo Puyo (Sega arcade,
1991) — its own name, art, tuning and netcode. Two glossy 6x12 wells; falling
pairs of enamel orbs in four colors; 4+ connected same-color pops, the stack
collapses and re-pops (a CHAIN); chains rain grey rows on the rival; clearing
while incoming rows are queued COUNTERS them. First to 2 rounds wins.

## Layout

- `sim.js` — pure rules. Zero Math.random, zero DOM: `(state, [pad1, pad2])`.
  Gravity table per round index (`GRAVITY`, 48f/row round 1 down to 6f),
  DAS 12/4, soft drop every 2f, hard drop slams + locks (this battler has it;
  the 1991 original did not — the issue asked for a Tetris-battle hybrid too).
  Attack rows = `chain - 1 + Σ(floor(size/4) - 1)` per cascade, delivered at
  cascade end; holes are rolled from the shared seeded RNG at delivery time so
  both online boxes generate identical garbage. Counter: any clear in a cascade
  while `pending > 0` nullifies `pending`; your attack still goes. A blocked
  spawn, or a garbage shove the live pair cannot escape, tops the well out.
  Next-pair preview (#863): each well draws its pair from a `next` pair drawn
  one pair ahead — `spawnPair` consumes `next` and re-draws it, so the preview
  on screen IS what spawns; `next` rides in `stateHash` (a divergent preview is
  a desync). Collapse/garbage lifts record `w.slide` `{r,c,dy}` entries (the
  orb at (r,c) came from row r+dy) for the renderer's fall animation; slide is
  derived state and deliberately NOT hashed.
- `planner.js` — the CPU. Seeded from the match seed (never `Math.random`), so
  its pad stream is reproducible on every box and recordable/replayable like a
  human's. It pops when it can, sets up three-in-a-rows, keeps the stack flat
  and hole-free, and jitters its drop timing so it reads as a person, not a
  metronome.
- `net.js` — online semantics on the reusable room layer (`src/utils/room.js`,
  #845) + lockstep (`src/utils/lockstep.js`, #531). Well index == seat index
  canonically; pads ride `{t:'pad',s,k,p}` (a=rotate, s=hard drop);
  `assemblePads` builds `[well0, well1]` in seat order — pass the maps in SEAT
  order, mixing that up swaps the streams (a real desync this harness caught).
  Codes use the relay alphabet (no I/O/0/1 — the SSX lesson).
- `art.js` — glossy radial-gradient orbs with specular dots, riveted garbage
  slabs, dithered midnight stage, a 3x5 house font. Nothing borrowed.
- `index.jsx` — shell: attract (live CPU-vs-CPU demo), 1P vs CPU (default,
  phone-playable), local 2P (`2` on the title), online via `?net=host` /
  `?net=join&room=CODE` (`?relay=wss://...` to point elsewhere), pause `?`,
  VirtualControls (A=rotate, B=DROP), chain/garbage HUD, shake + flashes.
  Chain theater (#863): pop cells emit expanding white sparks and the chain
  digit scales down 5→4 as it lands; the collapse beat draws each moved orb in
  its NEW cell while a fading ghost slides off the old one — never offset the
  orb itself (blobdrill samples cell centers; an offset sprite reads as a
  dark cell and fails pixels==board). Incoming garbage hovers as ghost slabs
  (holes punched, bobbing, flickering) above the lip and slams home as the
  warning beat ends. Chain pops walk a major arpeggio up per step
  (`CHAIN_SCALE`); round win is a two-note call, match win a four-note fanfare.

## Controls

P1/arrows: ← → slide · ↓ soft drop · ↑/X/SPACE/A rotate · B/C hard drop.
P2 (local 2P): A/D slide · S soft · W rotate · F hard drop.

## Verify

```
npm run blobcheck    # Node gate (static tier): 38 assertions — boot, group/chain
                     # rules, counters, garbage landing, rounds, determinism
                     # (seed+pads replay hash-equal), the #863 theater block
                     # (next-pair preview legality, draw-at-lock swap, per-seed
                     # determinism of the preview stream, collapse slide math),
                     # a full ONLINE pair over an
                     # in-memory pipe (pad delay, hash checkpoints, zero desyncs),
                     # CPU competence. Can fail: mutant pop-threshold 4->5 reddens
                     # it (verified by hand).
npm run blobdrill    # advisory Chrome drill: real keys/taps, attract, rotate,
                     # slide, hard drop, drawn-pixels==board, defeat, rematch,
                     # pause, phone tap, zero page errors.
```

## Known gaps (filed for QA polish)

- Online desync freezes the screen (correct behavior) but there is no
  re-join/resync — refresh to replay.
- The relay worker's 4-seat roster is not required here (cap=2), but real
  internet play still depends on the worker redeploy noted in #825/STATE.
- CPU personality is one tier; a harder "chain-hungry" tier is polish, not rules.
- `snapshot`/`restore` intentionally omitted from the game contract: the sim's
  wells hold a live RNG closure that JSON cannot copy (#391 precedent).
