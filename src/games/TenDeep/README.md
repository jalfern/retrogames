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
- **XP ladder**: heroes level across the deeps; the dungeon is deterministic
  — what the harness audited is what you play, tile for tile.
- **Death has a price, not a reprieve**: a wipe drags the bodies back to the
  surface and taxes the purse; the temple can call the dead back — for gold.
  Dead with an empty purse is the end of the run.

Bestiary (own IP): Cave Rat, Mire Adder, Rag Goblin, Bone Sentry, Pale
Wraith, Grave Ghoul, Bog Troll, Minotauros, Deep Wyrm, THE HOLLOW KING.

## Stage 2 — THE RIM (the surface world)

The run OPENS at the hamlet on the lip of the well (Wizardry's town screen,
our own): four facades + the well, entered with ←→ + SPACE; F descends.

- **TAVERN** — `POST FOR HIRE` (40g): a corpse is replaced by a seeded fresh
  level-1 roll (own-IP names; the dead hero's purse stays in the company's
  hands — conservation is sacred). Refuses breathing heroes.
- **TEMPLE** — `MOURN` 200g×lvl returns the dead at 1 hp; `RESTORE` 400g×lvl
  whole; `MEND` 30g fills one hero's HP; `REFRESH` 25g fills one hero's MP.
- **TRAINING GROUNDS** — `TRAIN` 100g×next-level, and it spends the XP you
  actually carried out (Wizardry's exact bargain; refuses below threshold).
- **ALCHEMIST** — potions at 25g, unlimited stock.
- **Gold**: every mob pays `xp/4` coins (ledger `goldIn`); a wipe is not the
  end — the bodies walk home and the purse pays **half per hero** (dead-body
  tax). Dead + purse < hire price = the run truly ends.
- **Proof purity**: `makeRun({strict:true})` (every Node proof, slack run and
  determinism replay, and `playOut`) has NO second life — the campaign still
  wins or dies on dungeon supplies alone; the town is the player's bargain.
  tendeepcheck pins `proven.ledger.tx.length === 0`.

## Engine notes

- `sim.js` — pure state machine, zero `Math.random` (the only dice are
  `dungeon.js`'s seeded mulberry32, and only at floor generation; recruit
  rolls run on `st.townSeed`).
  Commands: map `fwd back left right use potion`; combat
  `attack fire heal potion flee target+/target-`; town
  `down enter-<T|V|G|A> leave sel+/sel- svc+/svc- buy potion`.
- `town.js` — the RIM's services table, prices point into `CFG`, hire rolls.
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

## Honest gaps (stage 3+ of #1127)

- No party creation at the tavern: races, classes and alignments are still a
  preset six behind the rolled replacements.
- One spell per role (Firebolt/heal) — spells-by-level not done.
- Town is a service screen, not a walkable overworld (the original's New
  Sorpigal had streets; ours is the four-door view + the well).
- Wireframe look until the shared renderer (#1129) lands.
- No between-run persistence (Wizardry saved to disk; we don't).
