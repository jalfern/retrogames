# TEN-DEEP

A ten-floor dungeon crawl in the spirit of Wizardry (Apple II, 1981) — same
rules, **our own world**. Title, floors, bestiary, items and story are
original work (#1127). Private until Jon promotes it (#379).

## The rules (unchanged from the original's spirit)

- A **party of six** is one body: arrows walk/turn the grid in first person;
  the party lives or falls together.
- **Turn-based ledger combat**: every round, survivors act in SPD order
  (heroes first on ties). Every point dealt and taken is booked in a ledger
  the harness recomputes independently — overkill never inflates it, the dead
  never strike, and a tin-can mob still bleeds the damage floor.
- **Resource puzzle**: Firebolt (MP), heal (MP), potions, and one-shot MP
  springs. The Slack Rule re-proves the campaign winnable with one fewer of
  every supply the proof consumed.
- **Ten seeded mazes** (19x19, DFS-carved + braided) with stairs at the far
  end; DEEP 10 holds the throne of THE HOLLOW KING — no flight from that.
- **XP ladder**: heroes level across the deeps; death is permanent for the
  run; the dungeon is deterministic — what the harness audited is what you
  play, tile for tile.

Bestiary (own IP): Cave Rat, Mire Adder, Rag Goblin, Bone Sentry, Pale
Wraith, Grave Ghoul, Bog Troll, Minotauros, Deep Wyrm, THE HOLLOW KING.

## Engine notes

- `sim.js` — pure state machine, zero `Math.random` (the only dice are
  `dungeon.js`'s seeded mulberry32, and only at floor generation).
  Commands: map `fwd back left right use potion`; combat
  `attack fire heal potion flee target+/target-`.
- `dungeon.js` — seeded floors; supplies and ambushes are PLACED tiles, so
  slack deletes are physical tile removals.
- `solver.js` — the autopilot AND the proof: BFS-to-stairs, never dodges
  ambushes, drinks only when dry (full party walks on — otherwise a spring
  tile is a deadlock). The attract demo drives this live, so the demo is the
  witness, not theatre.
- `index.jsx` — painter's-algorithm wireframe at 256x224, runtime 10x10
  bitmap monster plates, automap from the explored set. The MODERN 3D look
  waits on the shared dungeon renderer (#1129); this renderer keeps the
  pixel contract the play-check samples (wall ahead ⇒ centre wall-blue).
- Harness hooks (DEV): `window.__deepTest` (probe/start/cmd/setup/hash),
  DebugKit with PROGNOSIS (re-solves the LIVE mutated state).

## Verify

```bash
npm run tendeepcheck            # floor audits, engine pins, proven campaign,
                                # slack rule, determinism (no browser needed)
npm run tendeepcheck -- --mutate  # each mutant must turn a probe red
npm run lint:tendeep
npm run dev && npm run tendeepplay   # headless Chrome, real key events,
                                     # pixel-graded view/ledger agreement
```

## Honest gaps (stages 2+ of #1127)

- No surface world yet: tavern, temple, training grounds, magic shop.
- No party creation: races, classes and alignments are still a preset six.
- One spell per role (Firebolt/heal) — spells-by-level not done.
- Death is per-run; no temple resurrection.
- Wireframe look until the shared renderer (#1129) lands.
- No between-run persistence (Wizardry saved to disk; we don't).
