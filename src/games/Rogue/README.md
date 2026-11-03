# ROGUE (1980 — Eglit/Upl, the ur-dungeon)

The dungeon crawl that started the genre: 80x22 ASCII rooms and corridors,
bump-to-attack melee with d20 to-hit and dice damage, sixteen monsters from
kestrel to dragon, unidentified potions-by-colour and scrolls-by-nonsense-
title, a hunger clock that goes full → hungry → weak → faint, and the green
status bar (`Dlvl Gold Hp Str Arm Exp`). Stairs `%` descend forever; the
Dungeons of Doom keep whatever you bring them.

## Engine

- `sim.js` — the whole game as pure functions (batch-13 template): dungeon
  generation, combat, monster AI, hunger, item actions, the reducer, and
  `buildGrid` for the drawn view. Zero `Math.random`, zero `Date.now`.
- **Seed-param port (#1473, batch 14).** One mulberry32 stream (gameContract
  `seedRng`'s algorithm) feeds every roll — layout, item dice, monster rosters,
  d20 combat, faint bites, the potion-colour and scroll-title ciphers. The
  stream position **travels inside the state** (`randState`), restored and
  banked by `stepGame` at every reducer entry/exit — two worlds alive at once
  provably cannot interleave entropy (roguecheck proves byte-identical replays
  with junk worlds running between the steps). This is the port's signature:
  classic reducers share a module-global RNG, and a harness replaying two
  same-seed worlds interleaved gets *different* worlds. Rogue carries its dice.
- Seeds regenerate at every human start honoring `?seed=N` (`freshSeed()` in
  index.jsx, DonkeyKong/batch-8 precedent); the production report is
  `{tick, score, done, seed, dungeon, hp}` — `tick` is the **turn count**, and
  `score` = gold + dlvl×50 (the terminal tally), live while playing.
- Monster ids are `dlvl*1000 + i` (gen) and `-1 - turn` (create-monster
  spawns) — deterministic, collision-free, no wall clock in the replay.
- `buildGrid` lives in sim.js so the harness fingerprints the drawn grid
  against logical state (@ placement, explored `%` draws as `%`, visible
  monster letters, blindness greying the @).

## Verify

```bash
npm run roguecheck        # 48 checks: boot+purity, determinism (incl.
                         # interleaved replays), BFS stairs-reachability on 40
                         # seeds, combat/xp/hunger/descend/pickup/wield/eat/
                         # quaff/scroll rules, both terminals, BFS autopilot
                         # wins (20/20 reach dlvl 2, ≥15 reach dlvl 4), draw-
                         # vs-logic, rng bounds
npm run feedbackcheck    # seedpin law + floor (Rogue = title 45)
```

Mutant proof: flipping the descend guard in `handleDescend` (`!== '%'` →
`=== '%'`) turns roguecheck red on 4 checks incl. winnability 20/20 → 0/20.
Restore → green.

## Honest gaps (vs the 1980 original)

- Doors `+` are drawn but never opened/blocked — the generator digs rooms whose
  perimeters stay walls; doors are decorative floor art on room edges.
- No ranged combat: wands `/`, rings `=` and thrown missiles are named in the
  legend but never generated; ammo (`!`) potions cover the spell slot loosely.
- Monsters never flee, and `moved` bookkeeping is per-frame rather than the
  original's per-monster energy (fast/ slow creature races).
- `s` search is flavor text — no hidden doors or detected traps; there are no
  traps at all (no rings of warning, no trap SPIRIT).
- No Amulet of Yendor win condition: the original's goal object and "you win"
  terminal don't exist; descending forever + the QUIT score tally is the loop.
  (Win/lose semantics: dlvl≥2 reached on every seed, death terminal proven;
  "won" here = the descent, not the amulet.)
- Level-up is xp-table + hp gain only — no class-based gain rolls, no hit dice
  display, no intelligence/charisma/wisdom spread (str only, per the port).
- Food is the only light-source clock; no lamp/oil and torch-lit radius.

RETRO bar: pure green-phosphor monospace look, original ASCII symbol set and
the classic message line voice ("You feel much better!", "Welcome to level 4!").
