# JOUST — `/joust`

Williams' 1982 cabinet, rebuilt to the rules that made it recognisable: two
riders on flying mounts, one lance each, and the one law — **the lower lance
loses**. No enemy bullets, no power-ups: a joust, a troll hand, or the lava.

## Files

| File | What it is |
|------|-----------|
| `sim.js` | The whole game as pure `step(gs, input)` at 60 Hz. Zero `Math.random`, zero DOM, zero `Date` — the same tick sequence in Node and in the tab. This is what `scripts/joustcheck.mjs` imports. |
| `waves.js` | The five waves as DATA: ledge segments, hand columns, spawn rosters, rider start lines. Terrain is geometry, not tiles, so the harness can audit pit widths offline. |
| `planner.js` | The deterministic autopilot. It scripts the attract demo and *is* the winnability proof the harness runs. Threat-first: dodge the hand, escape the lava, leave the column of a rider that could arrive above you, then bank the egg, then joust — in that strict order. |
| `art.js` | Every sprite drawn at runtime: pterodactyl riders (3 wing frames per palette), speckled eggs with late cracks, the three-fingered troll hand, brickledges, lava with flicker crust, gradient sky with deterministic stars and two mountain ridges, 3x5 font. |
| `index.jsx` | The React shell: fixed timestep (250 ms catch-up cap), attract/pause/over screens, keyboard + touch, the `__joustTest` DEV hook and the DebugKit panel (F1: live state; cheats: smite foes, next wave, drop ledge). |

## The rules that are load-bearing

1. **The joust.** On any rider-vs-rider contact, the rider whose centre is
   lower on screen dies; within ±3 px both fall. The winner bounces. There is
   no other way to kill a rider except lava/hands *for hazards* — eggs come
   from joust kills only.
2. **The egg chain.** Every joust-killed bounder drops a bounder-egg, every
   hunter a hunter-egg; touch banks it (+100). Left resting 4 s it hatches
   into the next-stronger rider (bounder→hunter, hunter→shadow lord). Shadow
   lords drop nothing — the chain ends there.
3. **Flap vs glide.** Thrust (net −0.067 px/t²) beats gravity; sideways
   travel is a lean-and-glide (a tilted mount slides down its own tilt even
   unpowered). Flapping to steer is the anti-pattern this build learned the
   hard way: net lift while steering pinned the autopilot to the ceiling for
   a whole wave while eggs fell past it.
4. **Hazards.** Lava kills anything with feet past y=212 over a pit; troll
   hands eat riders below their tip; landing crooked (>0.87*0.6 rad ≈ 30°)
   is a crash; ledges marked crumble fall 100 ticks into any ride.

## Honest deviations from the cabinet (ledger)

- **One mount.** The issue asks for "the pterodactyl"; the original cycled
  ostrich→vulture→bat→stork→dragon across levels. The mount stays the
  pterodactyl and the *waves* carry the difficulty curve instead.
- **Named archetypes.** The issue names them Bounder / Hunter / Shadow Lord —
  those names ship (they map to the cabinet's lander/helter+stalker/shuttle
  family; "Shadow Lord" is the Joust 2 name the issue chose).
- **Waves end at five** with a victory screen; the cabinet looped forever.
  Score keeps its 1UP-every-10k anyway.
- **Scores** (200/400/800, egg 100, terrain 50, wave bonus 500·n, PERFECT
  1000) are the cabinet's value family, not a ROM-verified table.
- **Crumbling ledges** are the issue's request (the cabinet's are static);
  the ride tolerance is 100 ticks, then the ledge is gone for the wave.
- **Hands** rise from fixed columns with per-wave periods (360→210 ticks);
  the cabinet's hands track the player more cleverly.
- Music is an original D-minor march — deliberately **not** the Rachmaninoff
  quote the cabinet used.

## Verifying

```bash
npm run joustcheck    # Node, no browser: 46 checks — physics literals, joust
                      # rule, egg chain, wrap, hands, lava, crumble, wave
                      # ledger recomputed event-by-event, autopilot clears
                      # waves 1-2, hash-for-hash determinism, egg-blind pilot
                      # proof that the hatch chain is live
npm run joustdive     # Chrome, real keys only (advisory tier, JOUST_URL to
                      # point at another port): attract alive → 1P start →
                      # wings+arrow travel → flap climbs → pixels where the
                      # sim says → three honest lava deaths → GAME OVER →
                      # Enter restarts clean → 2P mounts → zero page errors
npm run lint:joust    # the scoped eslint gate (also runs in CI `static`)
```

Fail-proven: inverting the joust sign (`diff < -CFG.joustTol`) turns
`joustcheck` red 9 ways.

## Known gaps (queued for the QA polish pass)

- The autopilot clears waves 1–2 and dies in the wave-3 hunter swarm; the
  attract demo therefore loops the first two waves' worth. A pilot that wins
  all five is polish, not shipping-blocking (the ledger + wave-5 content are
  in the sim and the harness pins the roster).
- Single sfx per event; the cabinet's growls and wing-flaps had more grain.
- Hands do not punish riders *above* the tip while sinking; the tip-only kill
  rule is simpler and readable.
