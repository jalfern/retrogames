# MARBLE MADNESS — design note (forge session 2026-10-14, issue #236)

Original: Marble Madness, Atari Games 1984. The five signature features the
issue names, as spec:

1. **Isometric checkered course** — 2:1 iso tiles, pastel checkerboard
   (mint/pink/sand), the marble with real momentum/inertia: arrows are
   ACCELERATION, slopes add gravity along the fall line; the marble slides
   when you stop pushing.
2. **Countdown per race, leftover carries** — each race has a clock; seconds
   left at the goal are added to the next race's clock AND banked as score
   (sec * 100 * (race+1)). Practice's clock runs but expiry only restarts
   practice — no life lost.
3. **Falls break the marble** — rolling off the course edge into the void, or
   dropping more than 2 tile-steps in one go, shatters the marble (life lost,
   respawn at the race start, clock keeps running).
4. **Hazards** — swinging hammers (practice), the black Steelie (rival marble
   that rams — knockback, the cliff does the killing), acid Slinkies (kill),
   green Slinkies (bounce), Marble Munchers (mouth closes on you), and the
   undulating wave floor that lifts and hurls the marble.
5. **Six races** — PRACTICE, BEGINNER, INTERMEDIATE, AERIAL, SILLY (reversed
   slope bias + bouncy floors), ULTIMATE (everything, wave included). All six
   hand-built as heightmap data in levels.js.

Engineering: pure deterministic sim (`sim.js`, step(state,input), zero
Math.random, `stateHash`) — the harness (`scripts/marblecheck.mjs`) pins slope
accel, fall/break rules, timer carry, hazard kills, the score ledger, and
PROVES all six races finish deathless through the planner's own inputs; the
attract mode replays that proven pilot tick-for-tick. Isometric painter draws
every tile, hazard and the marble at 1:1 from sim state at 512x384.
