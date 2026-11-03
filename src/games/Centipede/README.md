# CENTIPEDE — engine notes

Atari 1981. A ten-segment centipede descends through a mushroom garden,
bouncing off anything it touches; you're the zapper at the bottom.

## Rules that are load-bearing
- **Arcade point table**: head 100, body 10, destroyed mushroom 1
  (`scoreForSegment` / `MUSHROOM_POINTS` in `sim.js`). Pre-batch the port's
  `state.score` was dead code — centipedechek pins every line that pays.
- **Chain rule**: every cut turns the shot segment into a mushroom *and the
  segment behind the gap becomes a new head* (heads visibly carry eyes).
  The pre-batch code punted ("keep it simple"); the law now pins the line.
- Three lives. A touch costs one: the zapper returns to the bottom pad after
  ~1 s dark with ~1.5 s blinking grace, **mushrooms persist**, the centipede
  restarts from the top — the arcade death, not a hard reset. Zero lives =
  GAME OVER (`done: true`); any key/click/tap starts a fresh run
  (`startRun`: score 0, lives 3, NEW seeded field).
- Mushrooms take three hits (port baseline) and shrink per state.

## Seeding (#1473 batch 16)
One mulberry32 stream per run (`seedRng`), regenerated at every human start
honoring `?seed=N`; the 40-mushroom opening field is the only gameplay die
and it draws entirely from the stream (leg animation is wall-clock decor).
Report `{tick, score, done, seed, lives}`; QA contract `exposeGame` id
`centipede`, buttons `left/right/up/down/a`.

## Verify
```
npm run centipedechek            # field replay + scoring law + wiring (26)
npm run centipedechek -- --mutant  # 7 mutants, all must die
npm run lint:centipede
```

## Honest gaps
- No spider (the bouncing eater), no scorpion, no fleas that drop when you
  shoot near the top, no bonus mushroom clovers.
- Field is 40 scattered mushrooms, not the original's authored clovers.
- One centipede per wave with no speed ladder across waves.
- Sound is a tone sketch; no arcade munch/click sequence.
