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

## Stage 2 of #316 — the look and the animation

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
npm run popcheck     # 191 checks: the 75 Stage-1 rules + 24 Stage-2 look
                     # clauses + 67 Stage-3 clauses + 25 Stage-4 sound clauses.
                     # Champion run pinned: autopilot clears all twelve levels at
                     # 0 deaths, the mirror / mouse-held gate / poisoned phantom
                     # shadow / invisible bridge / sheathed merge all fire in that
                     # run, and the event->SFX contract closes both ways.
npm run popplay      # advisory headless drive (needs npm run dev): real keys
                     # start/run/jump, find the sword, die on the traps, the
                     # level restarts under a running clock, R restarts, the
                     # attract screen is silent, the hour rides a music bed
                     # (analyser over the silence), and all twelve levels carry
                     # the right bed — zero page errors
```

Mutant proof at ship time: dropping `parry` from the SFX table turned
`popcheck` red in two clauses (missing voice + orphan) and was restored.
`popplay` 17/17 with audio checks.

## Stage 3 of #316 — all twelve levels (this merge)

- **Twelve named levels**, 4–5 rooms each on an 11-row grid: the ground floor
  is row `GROUND=8` and two pit rows live below it (row 10 auto-solid unless
  authored). `_` opens a shaft through the ground row; row 10 fills solid
  except authored cells.
- **The magic mirror** (`m`/`M`, L4): stepping to the glass teleports you to
  its far side, once per level entry — the barred corridor has other ways.
- **The shadow** (L5+): a black silhouette gathers behind the starting wall
  and re-enacts your inputs `CFG.shadowDelay` ticks late. It never jumps, so
  shafts are its death; it drinks phantom flasks (L5's poison kills it, not
  you — `shadowDrink`/`shadowDown` events); it freezes while your sword is
  drawn; and its touch kills — except in the lair.
- **The princess's mouse** (L8, `h`): scurries to a raise button and holds it
  so the gate stays open for you (`mouseHold` gates the button's room).
- **The feather** (L7): with `lev > 0` a killing drop (≥2.5 floors) costs a
  point of blood instead of the run.
- **The invisible bridge** (L12, `i`): planks that are solid underfoot from
  above but paint nothing until the first step finds them (`bridgeSeen`).
- **The merge** (L12): at the exit threshold the shadow peels off its replay
  and catches up; a touch with the sword sheathed folds it back into you
  (`merge` event, `g.merged`) and the story ends without killing yourself.
- **Interludes**: twelve crossing cards between levels (`INTERLUDES` in
  `index.jsx`); the frame is 10/11 to seat the pit rows.
- Shadow spawn gap is 18 tiles ≈ `shadowDelay × prince speed` — replay-lag
  self-similarity keeps the gap honest: stalls shorter than the delay (a gate
  hold) do NOT let it catch you; longer ones DO, which is the whole threat.

## Stage 4 of #316 — sound & feel (this merge)

The 1989 original is *silence-first*: a dungeon you hear before you see, a
sound on every action, no music on the title. That is what this stage builds.

- **`music.js` — the sound spine (pure).** `trackFor(state)` decides which bed
  the moment deserves: `pop` (dungeon), `popThrone` (palace levels),
  `popJaffar` (while the vizier stands in your room), `null` on the attract
  screen and when you die — the original drops to silence the moment you fall.
  `SFX` is one recipe per event the sim can emit, as tiny synth steps
  (`['tone'|'sweep'|'noise', ...]`); popcheck pins the table against `sim.js`
  **both ways**, so a future event that ships without a voice fails the gate.
- **Three original beds** (`AudioController`), composed for this build in the
  Hijaz / "Persian" mode (D Eb F# G A Bb C#): the drip-stone dungeon, the
  grander throne room an octave up, and Jaffar's fast chromatic-second
  ostinato. Each carries a darbuka lane (1 = dum, 2 = tek) — the synth engine
  grew a `perc` step to play it.
- **The gait is in the sim**: `foot` events off a stride accumulator (one
  footfall per ~42 px of travel), flagged `run`/`soft`, so running hammers,
  careful steps whisper, and standing still is silent. `land` thuds the
  landing; `chain` rattles while a portcullis is actually moving (brighter
  rising, grittier falling, a click on the first tick of travel).
- **Torch ambience** in the shell: a thin crackle every few ticks, denser in
  rooms that carry flame, off on menus and death screens. Deterministic tick
  arithmetic — no `Math.random` anywhere in the spine (pinned).
- **Stings**: the big death descending line and the victory fanfare on the
  last door; the sheathe/parry ring, potion glugs (all five flasks flavoured
  apart), the mirror's glass sweep and the merge's rising fold all come off
  the event table.

## Stage 5 of #316 — the gate, the banner, the stone, and escorts (this merge)

Jon played it and named four things. This stage ships all four.

- **Gates drawn from the truth.** The old `drawGate` hung its bars to
  `lowRow*T + (lowRow+1)*T*(1-open)`, which overshot the floor and left a
  *looks-shut-but-you-walk-through* gate. A gate is now drawn from the same
  number `blocks()` consults: `art.gateBottom(lowRow, open)` hangs the bars to
  the floor while `open < CFG.gateOpen` (the column is solid to your feet) and
  lifts them clear above `CFG.PH` headroom the instant it is passable;
  `gateDrawOpen(open) === open >= CFG.gateOpen` — the drawn state *is* the
  collision state. popcheck pins geometry both ways (reverting the formula turns
  the gate clause red).
- **Attract banner that never covers the demo.** One message at a time on a
  slim band *under* the HUD, framed in gold; the autopilot plays in the clear
  below it. `AUTOPILOT DEMONSTRATION` moved up off the footer watermark.
- **A real art pass.** Cut-stone masonry with mortar coursing, per-brick tone
  jitter, mineral grain, lit/shadow bevels and hairline cracks; a palace of
  ashlar courses with gilding, fluted pillars and lit arched windows; the
  prince and guards pick up a facing rim-light, a shaded back, an eye and a soft
  ground contact shadow. Everything stays deterministic (`sin`-hash noise).
- **Guards escort you between rooms.** Leave a live ground guard behind and it
  takes up the chase through the doorway after you (`follow`), walking toward
  you on its own floor. It stops at a wall or the lip of a shaft (it never
  walks into the void), and re-homes to patrol if it loses the trail. The
  champion autopilot still clears all twelve levels at zero deaths with the
  escorts running.

## Honest gaps (the deep pass continues — see #316)

- Escort visuals are functional, not dramatic: a follower walks in from the
  edge rather than being seen through the doorway it came from, and two
  escorts don't yet coordinate a pincer. QA may want a door-crossing cue.
- Stage 6 is Jon's requested **second art pass** — more colour and light on the
  stone and palace, and the prince.
- Touch: the pad has no Shift, so hang-grab on a phone leans on climbing
  with the d-pad; desktop-first, as the original was.
