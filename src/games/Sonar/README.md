# SONAR ABYSS — engine notes

An original: pitch-black sea caves you explore with sound. The whole title is
built around ONE law, enforced in code: **the painter may draw knowledge, never
truth** (`paint()` only ever sees `known()`/`eelContacts()` — a live eel
position is literally unreachable from the draw path).

## Layout
- `sim.js` — the game: seeded cave gen, ping wavefronts (BFS that does not
  cross ROCK, lights cells as the wave arrives), fade memory, fixed-route
  ping-pong eels, pearls, vent descents, lives. Plain Node-importable.
- `index.jsx` — the shell: deferred-reveal renderer, fixed-timestep loop
  (`SIM_MS = 50`, sim runs 20/s), input, HUD, DEV hooks.
- `attract.js` — cycling attract copy.

## The planner (`planStep` / `planRun` in sim.js)
The gate's witness, the attract demo's script, AND the WATCH driver. A BFS over
(cell, move#) states where the eel timeline is EXACTLY `step()`'s ping-pong
transition — a legality window is only honest if it agrees with the sim. It
reads truth (it is a prover, not a player) but emits only arrows and pings on
the player's own cadence (`CFG.moveEvery`, `CFG.pingCd`), so the cave its
route lights is lit honestly.

## Distance cue (#2365)
A contact blip records `ring` — the wavefront delay (ping bucket) at which sound
physically touched the eel. That is knowledge, captured inside `light()` at the
same BFS arrival that lights the cell, so heat/pitch can read nearness without
the draw path ever touching a live eel cell. `contactHeat(ring)` (sim.js) is
the pure, strictly monotonic map 1 → 0.12 over `CFG.cueRange` rings; frozen by
mutant switch `CFG.cue`. The painter lerps the mark cold violet-blue → hot red
with it (thicker, haloed, fast-pulsing when hot), and `handleEvents` rings an
echo per contact — nearer returns read lower and stack two ticks.

## WATCH (#1637 batch 14)
Y seats `planStep` into the real `playerMove`/`ping` on the sim's own cadence
(`watchingRef` gates the play branch of `doSim`). Reactive per tick — honest
mid-cave. Any driving key or tap hands back (shared blips); the end of the run
releases the seat silently. DEV probes: `__sonarTest.watching()`,
`watchSfx()`, `hint()` (planner's next call).

## Verify
```bash
npm run sonarcheck            # 255 checks: gen, wavefront honesty, determinism,
                              # eel timelines, distance-cue ring/heat (#2365),
                              # vent signal fresh/ghost/dark boundaries (#2367),
                              # attract showcase (#2383), vent-win crossings
DEV_PORT=<p> npm run watchcheck -- --only sonar   # 182: seat pilot + source pins
DEV_PORT=<p> npm run sonarplay                    # real keys + pixels (#2365/#2367/#2383/#3713)
```

## The pearl's echo (#2601)
A wavefront that RE-ARRIVES at a pearl cell remembered-but-faded (the dim→
bright revival) pushes a `pearlEcho` event; the shell rings ONE low, flat
155 Hz sine — below the contact-blip floor (170 Hz) and the ping-sweep
landing (240 Hz), no sweep of its own — so the audio channel carries the
fresh/remembered distinction the pixels already make. The FIRST hearing and
an ordinary re-light of a still-fresh pearl stay silent. Pinned in
`sonarcheck` at the computed re-arrival tick plus both negatives; a
`pearlEcho:false` mutant and a shell-handler mutant die by name.

## The vent signal (#2367)
`ventSignal(g)` (sim.js) grades the vent cell through `known()`: 0 never heard,
1 remembered (dim ghost on canvas), 2 a front landed within `CFG.swirlFresh`
ticks — only then does the swirl ripple. The vent is fixed geometry, so
remembering it is ordinary knowledge; freshness is what keeps it *teaching*
("sound just confirmed this"). `sonarcheck` pins all three transitions to
computed wavefront ticks (ripple@arrival, ghost@arrival+swirlFresh+1, dark at
the fade edge) plus a re-hearing revival, and a `ventRipple:false` mutant dies
by name. Each live ping also strokes a faint expanding ring (with three trailing
echoes) from its source — the ring→distance mapping the #2365 heat cue leans on,
now visible; it draws from `gs.pings`, cells still light solely by BFS arrival.

## Water grain (#3713)
Water used to be one flat rgba fill per cell — beside the grained rock faces it
read like poster board (docs/ART.md bar 3). The fill now carries the same speck
family rock uses: a per-cell tonal drift (every lit cell sits on its own patch
of seabed, ±8 blue/green, riding the fade), two dim silt specks at hash offsets
while the cell is known, and a bright drift fleck gated to `fr` alone — so the
wavefront carries a little glitter through open water and it is gone once the
memory settles. Knowledge-only as ever: positions are per-cell constants, tones
read `mem` age, never truth. Kept under the pixel baselines it shares a canvas
with: the grain's red top stays far below the cold-mark floor (r ≥ 85), the silt
darkens `plain` where the ring-spike gate measures, and ghost pearl cells are
knowledge-dark so the branch never draws there. `sonarplay` pins it: any water
cell 3–8 rings from the diver whose knowledge age is settled (`memAge` 9–50 —
past stroke, trail and fresh shell, into readable brightness; `openAt` is
truth, harness eyes only, like `eels`), sampled in its interior, must show
≥3 distinct green levels; a flat fill shows one.

## The seed ledger made actionable (#2601 items 4+5)
The over screen printed `seed 636f6666` and the DEEP LOG printed one per row,
yet no key acted on any of it: `?seed=` (#1473) pinned EVERY dive with no way
back but editing the URL, and the just-finished seed was display-only. Now:

- **E / hold re-swims the finished seed.** On the over screen (after its 900 ms
  grace) `KeyE` starts a dive on `endRef.current` — the seed `finish()` just
  recorded. Touch has no E key, so the over-screen decision moved to
  pointerup: hold ≥600 ms re-swims, a tap keeps any-tap-to-attract. Caves are
  pure functions of seed+depth, so the replay is the SAME caves.
- **U pulls the pin.** The query pin is read ONCE at mount into `pinRef`;
  `KeyU` wherever the pin is felt clears it without starting a dive (any key
  on attract starts — the hatch had to be a non-starting key). Attract and
  over both announce the pin (`SEED xxxx PINNED — U UNPINS`) — an invisible
  pin is indistinguishable from a broken RNG.
- Keys chosen against live collisions: `KeyR`/`KeyG`/`KeyL` are already
  sonarplay's any-key drivers, so replay is E and unpin is U. DEV probes:
  `__sonarTest.pin()`, and `forceOver()` which only sets the sim's own death
  state — the live loop calls `finish()` itself (rig the setup, never the
  outcome). Pinned by `sonarplay` (§SEED LEDGER: pin announced + honored,
  E replay, hold replay, U unpin without start, random after U).

## Honest gaps
- **CLOSED by #2365:** eels telegraph only via contacts; no distance cue on a
  ping's first lit ring — contacts now carry the ring that lit them and
  heat/pitch maps nearness (#2365).
- **CLOSED by #2367:** the vent swirl was drawn as soon as its cell was known —
  it now ripples only on a fresh front and ghosts otherwise; the ping ring
  teaches the distance mapping in pixels.
- **CLOSED by #2601:** the remembered pearl was a static 2×2 dot at α 0.34 —
  terrain-noise-quiet. The ghost is now a hollow ring (r 4.5) with a slow
  2-phase shimmer α 0.30–0.58: terrain never outlines (the glyph vocabulary is
  the same as the vent/eel marks), hollow-vs-solid keeps it under the fresh
  bead, and the whole band rides inside `sonarplay`'s dim window while staying
  below the bright floor (α 0.745) — so a ghost can neither hide nor read
  fresh. The descent toast teaches the sim's own reset law ("THE MAP FORGETS")
  and `sonarcheck` proves the wipe (new depth ⇒ knowledge-zero).

## Remaining polish candidates (#2367 follow-ups)
- **CLOSED by #2383:** colourblind SHAPE cue on the heat mark — a hot mark
  grows a second stroke (a chevron fully below row 10 of its cell; cold stay
  single), pinned in `sonarplay` by counting lower-band red pixels; haptics —
  short pulse on a hot contact, long on a hit, `navigator.vibrate` gated
  behind the harness contract (`window.__game` present ⇒ motors silent, every
  intended pulse logged to the DEV probe `haptics()`); attract showcase —
  `attractJoinAt()` joins the proven replay `ATTRACT_LEAD` ticks before its
  first NEAR contact so a five-second viewer watches a hot mark land (the
  join runs the script itself, no commands added; `sonarcheck` pins the
  aim and a `attractJoin:false` mutant dies).

## Remaining polish candidates (#2383 follow-ups)
- Attract could also surface the SHAPE cue in copy (a cycling line about the
  chevron), if the heat cue gets adopted widely.
