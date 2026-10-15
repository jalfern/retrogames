# PRINCE OF PERSIA

Jordan Mechner's 1989 Brøderbund dungeon escape, rebuilt whole in code — no
assets. One hour of dungeon clock; the deep pass (#316) is taking it to the
original's full height: twelve levels, the real duel, the look.

`https://jalfern.com/retrogames/prince-of-persia`

## Stage 1 of #316 — the rules of 1989 (this merge)

- `sim.js` — the pure deterministic engine, `step(state, input)` at 60 Hz.
  Multi-room dungeons: rooms are 10 tiles wide, the screen **flips** (hard cut)
  at a doorway. **No lives** — death restarts the level while the 60-minute
  clock keeps running; level 3 has a mid-level checkpoint. You start **unarmed**
  (the sword lies in level 1; outside a fight it stays sheathed). The duel is
  timing, not heights: advance/retreat on the arrows, **Strike (X)** and
  **Block (Up)** — a guard's telegraphed lunge is parried by blocking in time,
  and a parry stuns him long enough to counter. Falls are measured in floors:
  one lands safe, two costs blood, three kills. A ledge is caught only by
  **holding Shift** while falling — no auto-grab; Up climbs, Down releases.
  Machinery: raise buttons lift gates that then close slowly (race them), drop
  buttons slam them, chomper jaws snap on a schedule, loose floors fall and
  stay as rubble, the exit plate opens the door for good. The flasks are the
  1989 set: small red +1, large red +1 max, blue poison −1, slow-fall,
  upside-down — no strength potion. Sunrise ends the run (`status='lost'`).
- `levels.js` — rooms as ASCII into one wide grid (legend in the file header;
  gate columns extend to ceiling-height portcullises, room-edge doorways are
  cleared automatically, ground floor is continuous).
- `planner.js` — the autopilot / attract brain: waits for chomper jaws, steps
  on the raise button and races the closing gate, blocks the lunge and strikes
  the recoil. `popcheck` runs this exact code.
- `art.js` — every pixel in code: mortar-grained blue-grey stone; floors read
  as ledges (lit top, dark front face); rooms without torches sit in shadow;
  torches pool trembling light. Portcullis bars lift into the ceiling, chomper
  teeth rise from the floor as a blade drops, loose tiles tremble, crack and
  pile into rubble. The prince carries ~8 distinct poses plus an 8-frame run;
  sword appears at the hip (sheath) outside a fight and in the hand inside
  one. HUD: health as little flasks bottom-left, the duel guard's flasks
  bottom-right, room counter + hour on top.
- `index.jsx` — attract first, fixed-timestep loop, `'?'` pause,
  `VirtualControls` pad + ⚔ (KeyX) for phones, DEV-only DebugKit (F1) with
  cheats including **prognosis** (re-runs the autopilot solver on the live
  mutated state), synth sfx off sim events.

## Controls

Arrows move · SPACE jump (hold = farther) · SHIFT hold while falling = grab
(run modifier on the ground) · UP block / climb · DOWN crouch / release hang ·
X or Z strike · ? pause · R restart after the hour is lost.

## Verify

```bash
npm run lint:pop     # scoped lint gate
npm run popcheck     # 73 checks: no-lives restart with running clock, unarmed
                     # start (no fight before the sword), parry-the-lunge,
                     # falls-by-floors, held-grab only, gates/chompers/rubble/
                     # plate-door, the five 1989 flasks, autopilot clears every
                     # level inside the hour at 0 deaths, slack (0.75x clock +
                     # every guard hp-1 still wins), hash-for-hash determinism,
                     # no-Math.random, planner/CFG constant agreement
npm run popplay      # advisory headless drive (needs npm run dev): real keys
                     # start/run/jump, find the sword, die on the traps, the
                     # level restarts under a running clock, R restarts, zero
                     # page errors
```

Mutant proof at ship time: forcing the parry branch off in `stepGuards`
(`if (false && p.block)`) turned `popcheck` red (1 failure — the parry pin)
and was restored.

## Honest gaps (the deep pass continues — see #316)

- Three multi-room levels so far; twelve with their signature moments is
  Stage 3, and Jaffar's lair arrives with them (`needBoss` is wired but no
  boss is placed yet).
- Animation is procedural limb work; Stage 2 thickens the pose set (separate
  run-start, turn-around, drink, draw/sheathe frames) and the deaths with
  weight (impaled, sliced, crumpled).
- Touch: the pad has no Shift, so hang-grab on a phone leans on climbing
  with the d-pad; desktop-first, as the original was.
