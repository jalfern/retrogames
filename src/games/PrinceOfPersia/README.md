# PRINCE OF PERSIA

Jordan Mechner's 1989 Brøderbund dungeon escape, rebuilt whole in code — no
assets. One hour of dungeon clock; the deep pass (#316) is taking it to the
original's full height: twelve levels, the real duel, the look.

`https://jalfern.com/retrogames/prince-of-persia`

## Stage 1 of #316 — the rules of 1989

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
  pile into rubble. HUD: health as little flasks bottom-left, the duel guard's
  flasks bottom-right, room counter + hour on top.

## Stage 2 of #316 — the look and the animation (this merge)

- **Pose table** (`art.js` `POSES`): the prince runs on an 8-frame cycle of
  two-segment legs (thigh + shin + knee), plus separate start / skid / turn /
  jump-crouch / land / hang-sway / climb (4 frames over ~1 s) / careful-step /
  crouch / drink / draw / sheathe / block / attack poses. The sim carries
  visual-only timers (`drinkT`, `drawT`, `sheatheT`, `startT`, `skidT`,
  `turnT`, `landT`) that never feed the physics — the 75 Stage-1 rule checks
  still pass, plus 24 Stage-2 clauses.
- **Deaths with weight**, one per cause (`DEATH_ANIMS`): impaled bodies stay
  up on the spikes (and drip), a chomper slices the figure into two parting
  halves, a long fall crumples to a heap, the sword cuts you down onto your
  knees; poison curls.
- **Guards rank at a glance**: turban colour by skill (green → red), a wider
  fat-guard frame (`PALETTES.fat.wide`), a bone-and-rib skeleton, Jaffar in
  purple robes with a tall hat; `GUARD_STYLE` in the sim varies footwork,
  wind-up telegraph and cooldown by skill too.
- **Themes**: `levels.js` carries a per-level `theme`; `THE CHECKPOINT` is
  `palace` — pale walls with pillars, moonlit arched windows and tapestries
  (`palaceWall`). Rooms without torches stay visibly darker; torch flames shed
  sparks and tint the stone warm.
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
npm run popcheck     # 99 checks (75 rules + 24 look): no-lives restart, unarmed
                     # start (no fight before the sword), parry-the-lunge,
                     # falls-by-floors, held-grab only, gates/chompers/rubble/
                     # plate-door, the five 1989 flasks, autopilot clears every
                     # level inside the hour at 0 deaths, slack (0.75x clock +
                     # every guard hp-1 still wins), hash-for-hash determinism,
                     # no-Math.random, planner/CFG constants; plus stage-2:
                      # proportions/climb-time, full pose-set, >=8 distinct run
                      # frames, distinct death anim per cause, guard palettes &
                      # styles, dungeon+palace themes, careful/drink/draw/sheathe
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
  Stage 3 — the fat guard's level, the mirror/shadow, the invisible bridge
  and Jaffar's lair arrive with them (`needBoss` is wired; the fat-guard
  *look* exists, its level does not).
- Floors sit 3 tiles apart in a 9-row viewport, so the prince at `PH=60` is
  ~2/3 of a floor — "most of a floor" in spirit. True original proportions
  (prince ≈ 0.9 of the floor spacing) need the room grid re-cut to 2-row
  floors; parked on the Stage-3 list with the twelve layouts.
- Touch: the pad has no Shift, so hang-grab on a phone leans on climbing
  with the d-pad; desktop-first, as the original was. Sound is Stage 4.
