# CIVILIZATION V — Stage 6 "Wonders & Great People"

Firaxis's 2010 4X. Stage 1 shipped founding, Stage 2 war, Stage 3 the arrow of
progress, Stage 4 settled the map, Stage 5 gave the realm its two ledgers;
Stage 6 gives it a legacy — six real wonders the whole world races for, and
great people who answer when history calls.

`https://jalfern.com/retrogames/civilization-v`

## What is in the box

```
src/games/CivilizationV/sim.js      pure deterministic sim (no three, no DOM, no Math.random)
src/games/CivilizationV/planner.js  the autopilot — the attract demo AND the harness witness
src/games/CivilizationV/art.js      tilted 3D hex world (three.js): relief, fog, borders, camps, roads,
                                    farms, mines, resource tokens, wonder landmarks, HP bars, arrows, FX
src/games/CivilizationV/index.jsx   the shell: renderer, camera, input, HUD, research/worker/policy/
                                    wonders/legends panels
scripts/civcheck.mjs                Node harness (npm run civcheck) — 305 checks
scripts/civplay.mjs                 Chrome drive with real keys (npm run civplay) — 41 checks
```

## Engine notes

**Wonders.** Six real Civ V wonders — Pyramids, Stonehenge, Hanging Gardens,
Great Library, Colossus, Great Wall — sit behind real techs and are queued in
your capital beside units, paid in banked shields. The first civ to finish one
takes it for the whole game: everyone else is locked out, and a half-built copy
in a losing queue is torn out (the shields you already spent carry on). Effects
are the original's, simplified to this sim's levers: Pyramids shave a turn off
every worker job, Stonehenge +2 culture/city, Hanging Gardens +1 food per worked
farm, Great Library +2 science/city, Colossus +1 gold per connected luxury,
Great Wall +50% city defence. Rivals chase wonders on deterministic lines, so
the race is live from the first pottery kiln — the witness itself raises
Stonehenge around turn 10-11 while the Aztecs lose the queue.

**Great people.** Every city banks one point per turn for each of the three
working types — engineer, scientist, merchant; the palace seats an extra
engineer and each connected luxury sends a merchant. When a pool crosses the
threshold (10 points, +6 per legend already bought) you may recruit for gold
(30, +25 steeper each time — Civ V's escalating price). A legend in hand is
spent once: the **Engineer** finishes a city's current build at once, the
**Scientist** finishes the current research at once, the **Merchant** rides out
and returns +200 gold. Refusals name their reason (`not enough gold`,
`nothing is under construction there`, `choose something to research first`),
so panel, harness and AI all obey the same law.

**Everything still obeys the earlier stages.** Borders creep, moods swing,
policies legislate, workers till; the AI researches, legislates, builds and
spends great people on its own deterministic lines. Costs look small next to
the original because this arcade runs a 40-turn clock with a size-4 milestone —
the wonders table is scaled to that pace, not to Civ V's 300-turn canvas.

**Determinism.** Wonder ownership, per-civ point pools, held legends and
acquisition counts all fold into `stateHash`; same-seed replays stay
hash-for-hash (§2, §28).

## Controls

Click/tap a tile to move; a hostile hex to strike. Keys: Space/Enter end turn ·
E settle · 1/2/3 warrior/archer/settler · 4 worker · C catapult · V legion ·
H chariot · **W** WORK panel (F farm · M mine · O road) · **T** RESEARCH (R
next) · **P** POLICY · **U** WONDERS (tap a wonder to queue it in the capital)
· **G** LEGENDS (recruit when a bar fills, EXPULSE to spend) ·
arrows orbit/tilt · wheel/pinch zoom · `?` help. `VirtualControls`:
A = END TURN, B = settle.

## Verify

```bash
npm run civcheck          # 305 Node checks: boot, determinism, founding, economy, combat, barbarians,
                          # cities, production, tech (§16-18), improvements (§19-20), resources (§21-22),
                          # borders (§23), happiness (§24), policies (§25), wonder table/gates/race/effects
                          # (§26), great-person points/recruit/spend/escalation (§27), live races + slack
                          # (§28), win/loss
npm run civplay           # Chrome, real keys: U opens WONDERS (the real six), G opens LEGENDS (the
                          # three types), pools bank, a wonder queues, wonder board fills, win, 0 errors
npm run lint:civ          # eslint gate for the game + its scripts
```

`civplay` needs `npm run dev`; against headless IPv4 use
`CIV_URL=http://127.0.0.1:<port>/retrogames/civilization-v npm run civplay`
(Vite may bind IPv6-only — then use `http://localhost:<port>/...`).

**Mutant proofs.**
1. In `sim.js` `pumpCityQueue`, neuter the "already built" race check → §26
   goes red 4 ways (rival copies survive); restore = 305.
2. In `sim.js` `canRecruit`, delete the gold check → §27's zero-gold refusal
   goes red 2 ways; restore = 305.
3. Carried: the Stage-5 border-clamp mutant reds §23; the branch-order mutant
   reds §25; Stage-3 queue-gate reds §17; Stage-4 connectivity reds §21/§22.

## Honest gaps (stage boundaries — later stages close these)

- **Wonders are six** (the Ancient/Classical headliners of this tech tree) and
  costs are scaled to the 40-turn arcade clock; the full Civ V wonder board,
  housing/wonder quirks and gold refunds for losers come with later eras.
- **Three great-person types** (the working trio); artists and generals — and
  the tile-improving/urban specialist mechanics — arrive with culture victory
  machinery (Stage 8).
- Great people are empire-wide pools (like Stage 5's single happiness face), not
  per-city points with competing capitals.
- Still no buildings/city screen (Stage 7+), no city-states, naval units or
  diplomacy (Stage 7), no science/culture victory (Stage 8).

These are intentional stage cuts, not omissions of promised Stage-6 behaviour.
