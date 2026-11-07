# MARBLE MADNESS — engine notes (Atari, 1984)

Isometric trackball classic: an inertial marble, six races against a carrying
clock, and the full hazard roster. All physics is deterministic and lives in
`sim.js`; nothing in this game uses `Math.random()` at world level.

## Files

- `sim.js` — pure `step(gs, input)` + `stateHash`, zero RNG. Hazard phases,
  the clock and the wave are functions of `gs.tick`, so `scripts/marblecheck.mjs`
  audits rules in plain Node and the attract replay is hash-reproducible.
- `levels.js` — six heightmap courses over a 36×36 grid (`buildHeights`).
  Corridor joints step at most 2 tile-steps (falling 3+ shatters); hazards are
  pinned to solid tiles.
- `planner.js` — the autopilot. BFS over the walkable graph (steelies, acid,
  muncher mouths and the swept hammer row are avoidances, not terrain), then
  live steering: target = arc-length lookahead clamped to the last polyline
  vertex whose CHORD actually reaches ground (straight chords cut void corners);
  a latched edge brake whose budget is refit to the real decel curve; steer
  commands quantized onto the eight directions the sim can actually produce.
  `plan()` scripts the full campaign — that script is the attract replay and
  the harness's winning run.
- `index.jsx` — iso painter (checkerboard tops, cliff skirts, hazard sprites,
  gloss + shadow on the marble), HUD with carry/bank readout, attract mode,
  drag-anywhere trackball for phones.

## The physics lesson (why `acc` is 0.005)

`stepOk` says a Δz≤1 neighbor is walkable — but with the original `acc`
(0.0011) against slope gravity (`slopeK` 0.004 per unit gradient) a Δz≥1
ramp is physically CLIMB-PROOF: the graph promised ground the trackball could
not reach, and the pilot froze at the base of a slope forever. Arcade marbles
climb; so `acc` now exceeds slope gravity at gradient ≤1 (steep = slow climb,
exactly like the cabinet). Brake-budget note: braking authority is
`acc*brakeBoost + (1-brakeFric)*v`, which at v≈0.12 is still ~0.75 tile —
the planner's `stopD = 0.1 + 6v + 12v²` mirrors it.

## Hammer geometry

`hammerR` (0.42) < row pitch (0.5): a hammer can only ever touch the row it
sweeps. `planner.blockedCell` relies on that — it blocks the swept columns on
the pivot row ONLY, so corridors stay two rows open and the pilot commits
through instead of gating. Keep `hammerR < 0.5` if you retune.

## Steelie

Chases within 9 tiles of its post, climbs at most one step, knocks (40-tick
cooldown, equal-and-opposite separation) — the cliff does the killing. The
planner blocks a radius-1.3 bubble around the LIVE steelie position with a
no-freeze fallback (an old route beats no route when the steelie parks in a
doorway).

## The music bed (#1752, closes honest gap 1; re-voiced per course by #1758)

`MUSIC.marble` + `MUSIC.marbleFinale` in `AudioController.js` — original
sixteenth-note virtuosic beds in the Marsyas IDIOM (A minor, zero rests in
the leads, octave-pumping left hand, span 25, ~17 big leaps per bed). The
cabinet's actual tune, Marsyas, is Mark Levinthal's copyrighted composition
and the AudioController header bans copyrighted game audio — so these are
ours, composed for this build (the `joust` precedent: what we ship is the
effect, not the melody). `bedFor(raceIdx)`/`musicStepFor(raceIdx)` in
`levels.js` route it: race 1 starts the bed (race 1 has no `raceStart`
event — `startRun` starts it), each race tightens the step a hair (our own
urgency ladder, not a cabinet claim), SILLY + ULTIMATE switch to the
variation-up (octave over the same harmony, faster), shatter/void/munch/
steelie/clear duck it, `over`/`win`/unmount stop it. The bed is pure
painter-side data — `sim.js`/`planner.js` contain no audio, hashes and the
autopilot are untouched (marblecheck pins this).

#1758 re-voiced the campaign like the cabinet did: `MENACE_RACE`/`AERIAL_RACE`
in `levels.js` split it into FOUR arrangements. `marbleMenace` (INTERMEDIATE)
is Am–G–F#dim–E with chromatic neighbours and a lower floor — the Phrygian b2
over E is the sting; `marbleAerial` (the sky bridges) jumps a 12th into its
peaks over major colours (A–E–F#m–D), a fifth above the base bed's mean but
still under the finale. Character is gated, not asserted: the harness measures
floor, mean, leap width and chromatic count against the base bed.

## Verify

```bash
npm run marblecheck   # rules + determinism + win proof + 13 bed gates (Node, ~2s)
npm run marbleplay    # browser drive (dev server): bed live, per-course re-voicing
                      #   rides the real raceStart events, finale switch, ladder,
                      #   death keeps it, game over stops it, restart brings it back
npm run lint:marble   # eslint over the four game files + harnesses
```

The harness proves it can fail: set `BREAKDROP = 99` in `levels.js` and the
"hard drop shatters" check goes red. Bed mutants: drop a bass note (table
gate), replace `startMusic(bed)` with a literal (routing-pin gate), plant a
`0` in a lead (motion-law gate), make `MUSIC_STEPS` non-monotonic (urgency
gate) — each reddens exactly its gate. #1758 mutants: map `AERIAL_RACE` to
`'marble'` in `bedFor` → exactly the re-voicing + finale-flip gates red;
`marbleMenace.step 0.081→0.085` → exactly the ladder gate red. #1752 lesson:
after committing, read `git show --stat` — a "leads recomposed" commit once
shipped only the harness because a mid-mutant-sequence `git checkout` reverted
the working file first. #1758 item 2 mutants: make `busLevel` ignore the bank
(`return 1`) → exactly the three swell gates red (marblecheck) and the carry
gate red in marbleplay; drop the `secsLeft > WARN_SECS` guard in `leadVibrato`
→ the engage gate reddens on a non-null vibrato at 11s.

## Honest gaps (filed for the QA lane)

*Gap 1 of the first pass asked for "the Marsyas full theme" — closed by #1752
with an original bed in the same idiom; a literal transcription stays
policy-permanent (AudioController header).*

- Steely knocks don't impart spin/visual wobble on the marble.
- SILLY bounciness is uniform; the cabinet varies trampoline strength per
  section.
- The camera now follows the marble at 2× zoom and scrolls the course off every
  screen edge (the whole-course diorama is gone, #265); the attract screen no
  longer bleeds the live race/timer/score HUD. Still flat vs the cabinet: no
  per-section push-in on the narrow bridges.
- *The bed was one harmony loop (+variation) for the whole campaign — closed by
  #1758: four arrangements now (base, menace, aerial, finale), each gated to
  sound distinct. PRACTICE/BEGINNER share the base and SILLY/ULTIMATE share the
  finale on purpose: the arc is arrival→menace→flight→showdown, not six equal
  courses. The third voice — closed by #1758 item 2: Marsyas is a pedalled
  piano, and two channels fake the pedal with dynamics (`dynamics.js`): the bus
  swells 0.82→1.0 as the carry bank grows (0→30s, quantized 0.02 steps, held
  through ducks — `duckMusic` recovers to the held level), and the lead takes a
  slow 5.5 Hz vibrato (12→26 cents) in the same ≤10s warning band the tick-beep
  lives in. `setMusicVibrato` is opt-in on the engine: notes without it keep the
  exact old graph.*
