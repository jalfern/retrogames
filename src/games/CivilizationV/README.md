# CIVILIZATION V — Stage 8 "Later Eras & Victory"

Firaxis's 2010 4X, in eight arcade stages. The finale: the later eras from the
Renaissance to the Modern age, and three real ways to win the world.

`https://jalfern.com/retrogames/civilization-v`

## What is in the box

```
src/games/CivilizationV/sim.js      pure deterministic sim (no three, no DOM, no Math.random)
src/games/CivilizationV/planner.js  the autopilot — the attract demo AND the harness witness
src/games/CivilizationV/art.js      tilted 3D hex world (three.js): relief, fog, borders, camps, roads,
                                    farms, mines, resource tokens, wonder landmarks, triremes, galleons,
                                    musketeers, CS beacons, HP bars, arrows, FX
src/games/CivilizationV/index.jsx   the shell: renderer, camera, input, HUD, research/worker/policy/
                                    wonders/legends/diplomacy/victory panels
scripts/civcheck.mjs                Node harness (npm run civcheck) — 469 checks
scripts/civplay.mjs                 Chrome drive with real keys (npm run civplay) — 60 checks
```

## Engine notes

**Later eras.** Nine real Civ V techs extend the tree to twenty-one across
RENAISSANCE (Education +2 sci, Banking +2 gold, Gunpowder → the Musket),
INDUSTRIAL (Steam Power +2 prod, Astronomy → the Galleon, Railroad makes roads
free to move on) and MODERN (Industrialization +3 prod, Electricity +2 sci +1
gold, Spaceflight → THE ARK). Real prerequisite edges into the old tree; era
dawns fire an `era` event the realm announces. Stage 8 prices deliberately
break the medieval cost curve — the whole Pottery→launch chain is asserted to
fit the arcade's 40-turn clock (§16, §32), not Civ V's centuries.

**Three victories.** `checkEnd` judges a shared `victoryFor(civ)` for Rome and
every rival, in order:
1. **DOMINATION** — every rival civ destroyed (kept from Stage 1, renamed law).
2. **SCIENCE** — Spaceflight unlocks **THE ARK**: every beaker earned after it
   banks into `gs.ark[civ]`; when the Ark funds CFG.arkScience (70) it launches
   and the game ends mid-turn, whoever is funding it.
3. **CULTURE** — every civ now tracks *lifetime* culture (`cultureEarned`,
   never spent; the spendable pool stays the policy ledger). Past
   CFG.cultureWin (350) and strictly ahead of every **living** rival, the world
   remembers your name.
Behind them sits the arcade golden age (capital size 4). A rival achieving any
of the three first loses the world the other way; the turn limit ends it
otherwise.

**Weapons of the new age.** The **Musket** (Gunpowder, str 15, 45 shields) is
the era's line infantry. The **Galleon** (Astronomy, str 14, 4 moves, 48
shields) is the age of sail: same coastal-yard law and sea-only domain as the
Trireme, but `ports: true` — it storms ports, which the Trireme may never do
(`doAttack` keeps one law, `UNIT[kind].ports`).

**Transports + amphibious assault (polish #1).** The Galleon carries two land
units (`UNIT.GALLEON.cargo = 2`). Embark happens at a coastal tile beside a
friendly, empty-slot hull and ends the soldier's move; a third squad is refused
by capacity law. Land on any GRASS..HILLS beach in reach with `canLand`; an
enemy unit on that sand fights the landing right there (amphibious assault) and
a repelled squad rows back aboard. A sunk hull takes its cargo to the bottom —
cargo ids live in `u.cargo`, fold into `stateHash`, and die with the ship.
Enemy ports still refuse the longboat (`PORTS YIELD TO LAND FORCES`): storm
with the Galleon's guns or besiege by land. Embark denies by name (`no unit to
embark`, `no friendly galleon alongside`, `ships do not board ships`).
Touch: tap a beach beside a laden Galleon to land; E embarks the selected
squad; J lands at the nearest open beach.

**Determinism.** Ark progress, lifetime culture, the six-era bitmask, the new
unit kinds and the transports' cargo manifests fold into `stateHash`; same-seed
replays stay hash-for-hash (§2, §32). Costs/thresholds are tuned so the science
line lands at t35–36 and the culture line at t33–36 on the witness boards (§33)
— the 40-turn clock is the design constraint, proven not assumed.

## Controls

Click/tap a tile to move; a hostile hex to strike. Keys: Space/Enter end turn ·
E settle · 1/2/3 warrior/archer/settler · 4 worker · C catapult · V legion ·
H chariot · **K musket** · N trireme · **L galleon** (coastal cities) ·
**W** WORK panel (F farm · M mine · O road) · **T** RESEARCH (R next) ·
**P** POLICY · **U** WONDERS · **G** LEGENDS · **D** DIPLOMACY ·
**Y** VICTORY (three race tracks + rival progress) ·
**E** settle — or EMBARK when a friendly Galleon rides alongside ·
**J** LAND at the nearest open beach (laden Galleon) ·
arrows orbit/tilt · wheel/pinch zoom · `?` help. `VirtualControls`:
A = END TURN, B = settle/embark. Tapping a beach beside a laden Galleon lands
the hold. The Y panel is reachable by touch (on-screen button).

## Verify

```bash
npm run civcheck          # 469 Node checks: boot, determinism, founding, economy, combat, barbarians,
                          # cities, production, tech (§16-18, now 21 techs / 6 eras), improvements (§19-20),
                          # resources (§21-22), borders (§23), happiness (§24), policies (§25), wonders
                          # (§26), great people (§27), stage-6 integration + slack (§28), city-states §29,
                          # diplomacy §30, naval §31, later eras + Ark mechanics + clock budget §32,
                          # victory order + culture ledger + race reachability §33,
                          # transports §34 (embark/land/assault/drown laws, capacity, hash fold)
npm run civplay           # Chrome, real keys: Y opens VICTORY (three tracks + rivals), K/L answer with
                          # Musket/Galleon on a seed-4 COASTAL capital (real keel, no escape clause),
                          # J/E refuse the transport paths by name, the Ark banks beakers on live
                          # turns, win screen names the victory type, zero errors
npm run lint:civ          # eslint gate for the game + its scripts
```

`civplay` needs `npm run dev`; against headless IPv4 use
`CIV_URL=http://127.0.0.1:<port>/retrogames/civilization-v npm run civplay`
(Vite may bind IPv6-only — then use `http://localhost:<port>/...`).

**Mutant proofs.**
1. In `sim.js` `victoryFor`, neuter the culture strict-lead (`< mine` → `true`)
   → §33's living-rival loss goes red; restore.
2. In `sim.js` `canEmbark`, drop the capacity check (`s.cargo.length <
   UNIT[s.kind].cargo` → `true`) → §34's "a third marine nowhere" goes red;
   restore.
3. In `civplay.mjs`, swap the Stage-8 seed back to inland (`start(4)` →
   `start(1)`) → the coastal-seat and real-keel checks go red (the old vacuous
   escape clause could not); restore.
4. Carried: the truce-line mutant reds §30; wonder race-check reds §26×4; the
   recruit gold-gate reds §27×2; border-clamp reds §23; branch-order reds §25;
   Stage-3 queue-gate reds §17; Stage-4 connectivity reds §21/§22.

## Honest gaps (what the full original has that this arcade run does not)

- **No naval supply or sea combat flavor beyond hulls** — transports cross any
  coast-to-coast sea in path range; no supply lines, no naval tactics stack.
- **No spaceship parts** — the Ark is one funded program, not four parts built
  in named cities; no Apollo-timeline flavor.
- **Tourism is lifetime culture** — Civ V separates culture from tourism and
  gates the culture win on tourism per-turn dominance; here one ledger decides.
- Wonders stay six, great people three, policies six, city-states two, happiness
  one empire-wide face; no buildings/city screen, no world congress, no
  religion, no trade routes, no great-engineer wonders of the modern age.

These are the arcade's cuts, decided from Stage 1: eight stages, forty turns,
one phone-sized board — the shape of the whole campaign.
