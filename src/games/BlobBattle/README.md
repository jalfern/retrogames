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
- `planner.js` — the CPU, on a three-rung arcade ladder (#863 `TIERS`). Each
  rung plans at a different chain depth (`easy` 2, `normal` 4, `hard` 8), rolls
  a seeded "miss" (the beginner lets a chain walk away and drops a flat safe
  placement instead) and drops at its own jitter pace — all from the match
  seed, so a given tier is reproducible on every box and recordable/replayable
  like a human's. `normal` is the pre-#863 CPU. In a solo match the player picks
  the opponent's rung from the title: `1` easy, `3` hard, any other key / tap =
  normal (phone default).
- `net.js` — online semantics on the reusable room layer (`src/utils/room.js`,
  #845) + lockstep (`src/utils/lockstep.js`, #531). Well index == seat index
  canonically; pads ride `{t:'pad',s,k,p}` (a=rotate, s=hard drop);
  `assemblePads` builds `[well0, well1]` in seat order — pass the maps in SEAT
  order, mixing that up swaps the streams (a real desync this harness caught).
  Codes use the relay alphabet (no I/O/0/1 — the SSX lesson). Re-join (#863):
  on an online desync the host re-rolls the seed and re-kicks `go`; both boxes
  ride the SAME start path — fresh `newGame`, reset lockstep, emptied pad
  mirrors — so a frozen match resyncs instead of "refresh to replay". The
  sampling law keeps the restart clean: `go` precedes the fresh pads on the
  wire, so the guest clears its mirrors before the host's new pads land.
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
CPU tier (solo, from the title, desktop keyboard): `1` easy · `3` hard ·
any other key normal.

## Verify

```
npm run blobcheck    # Node gate (static tier): 49 assertions — boot, group/chain
                      # rules, counters, garbage landing, rounds, determinism
                      # (seed+pads replay hash-equal), the #863 theater block
                      # (next-pair preview legality, draw-at-lock swap, per-seed
                      # determinism of the preview stream, collapse slide math),
                      # a full ONLINE pair over an
                      # in-memory pipe (pad delay, hash checkpoints, zero desyncs),
                      # the #863 RE-JOIN block (a diverged box is caught at the
                      # hash checkpoint, then a fresh-seed restart with a reset
                      # lockstep + emptied pad mirrors resyncs the pair and holds),
                      # CPU competence, and the #863 CPU tiers block (per-tier
                      # determinism, ladder rungs differ, expert out-chains
                      # beginner, expert drops faster). Can fail: mutant
                      # pop-threshold 4->5 reddens it (verified by hand); mutant
                      # dropping the re-join lockstep reset stalls the pair at the
                      # first checkpoint (verified); mutant collapsing all three
                      # tiers to `normal` (depth 4 / no miss / raw jitter) reddens
                      # the rungs-differ and drops-faster assertions (verified).
npm run blobdrill    # advisory Chrome drill: real keys/taps, attract, rotate,
                     # slide, hard drop, drawn-pixels==board, defeat, rematch,
                     # pause, phone tap, zero page errors.
```

## Known gaps (filed for QA polish)

- The relay worker's 4-seat roster is not required here (cap=2), but real
  internet play still depends on the worker redeploy noted in #825/STATE.
- CPU tier selection is desktop-keyboard (`1`/`3` from the title); the phone
  default (tap) is `normal`. A thumb-reachable tier picker would be polish.
- `snapshot`/`restore` intentionally omitted from the game contract: the sim's
  wells hold a live RNG closure that JSON cannot copy (#391 precedent).
