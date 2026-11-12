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
scripts/civcheck.mjs                Node harness (npm run civcheck) — 626 checks
scripts/civplay.mjs                 Chrome drive with real keys (npm run civplay) — 99 checks
scripts/civclock.mjs                frame budget of the late game (npm run civclock)
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
 1. **DOMINATION** — every rival CAPITAL has fallen (polish #2 made this the
    literal law; see below — a rival is beaten the moment its capital flips).
2. **SCIENCE** — Spaceflight opens **THE ARK yards**, and the Ark is a *ship*,
   not a number (#375-3, city industry since #2077): each NAMED plate —
   **Cockpit (15), Booster (20), Stasis (15), Launch (20)**, summing to
   CFG.arkShields (70) — is a **city production project**: any living city may
   weld any still-missing plate, one plate at a time per city, different cities
   in parallel (`ARK_<PART>` rides `city.queue` beside units and wonders).
   Delivery welds: `gs.arkParts[civ]` gains the bit, `gs.ark[civ]` grows by the
   plate's cost, `arkPart`/`ark` events name the plate and the city, and a
   duplicate that got there first falls out of the queue (`arkLost`). The old
   #375-3 beaker-pour is gone — science funds research like any other turn.
   The hull lifts (`arkLaunch`) only when all four plates are welded
   (`arkPartsDone === 4` and ledger ≥ 70), ending the game whoever funded it.
   The part view reads the bits plus the head project's banked shields
   (`arkPartsOf` / `arkPartsDone`); the bits fold into `stateHash`. See §36
   (the named plates, rival tracks, replay) and §40 (the yards law: gating,
   capital default + chosen city, parallel welding, exact costs, full-yard
   refusal, engineer speed, the AI mobilisation, determinism).
3. **CULTURE** — tourism crowns, culture records (polish pass #4). Every civ
   keeps three ledgers: the spendable culture pool (policies), *lifetime*
   culture (`cultureEarned`, the world's memory), and **tourism** (`tourism`,
   the visitor book — `ceil(culture/2) + 3·wonders + 1·luxuries` every turn,
   never spent). Past CFG.tourismWin (120) and strictly ahead of every
   **living** rival's visitor book, the crown is yours; the old lifetime bar
   alone no longer wins. §37 proves the split and the income law, §33 the
   strict-lead rule.
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

**Naval supply (#2065: the sea is not a free highway).** A hull is IN SUPPLY
while it can trace ≤ `CFG.navalSupply` (6) sea steps from its tile to a
friendly port — a living coastal city of its own realm (own civ, its overlord,
its vassals) or of an ALLIED city-state (`influence ≥ CFG.csAlly`). An
unsupplied hull banks `CFG.navalAttrition` (10) HP at end of turn, does not
heal while unsupplied, and one worn to nothing at sea goes down with its hold —
`shipLost` names the cause `supply`, cargo drowns under the same law as a
battle-kill. The horizon is a pure BFS from ports
(`portsOfRealm`/`suppliedSea`/`hullSupplied`) — no new stored state; the wear
lands in `u.hp`, already folded. Tells: HUD chip `⚠ OUT OF SUPPLY −10/TURN` on
the selected hull, a pulsing amber ring rides the unsupplied hull, and the
evening log reports `OUT OF SUPPLY`. Deep water stops being free: coastal
cities and alliances are the fleet's reach, a coast-to-coast crossing costs HP,
and losing your last coastal hub strands your navy. §39 gates ports, horizon,
wear, sink, the land-exempt law and determinism. #2075 made the law visible: the
port horizon tints the sea a faint cyan while a friendly hull is selected
(explored water tiles only), the distress flare rings player-flag hulls only
(enemy hulls never wear it), its pulse and band were raised for phone scale
(floor 0.18, band 0.32–0.5, brighter `#ffb84d`), rival fleets lost at sea
travel as `WHISPERS: <CIV> FLEET LOST AT SEA` on a distant quiet tone, and a
drowning hull scatters a 36-tick debris-and-foam wreck beat (`spawnWreck`) —
all view-side, no dice touched. §41 gates the polish; `supplyView` in
`__civTest` reads ring/wreck/horizon state back in the browser. Honesty, in the open (#237
doctrine): Civ V has no attrition at sea — its nearest real law is that units
heal only on friendly territory, and borders reach out over the water, so deep
neutral sea already starves recovery there. This stage extends that real law as
arcade rules; the gap it closes called it "supply lines", and the extension,
not the original, is ours.

**Capital capture ≠ extinction — realms KNEEL (polish #2, vassals #1777).** In
the original, razing every last unit is never how you win — the head of the
snake is — and a beheaded realm doesn't die, it kneels. In `captureCity`, when
a major civ's ORIGINAL capital falls to another major, the realm submits: the
fallen capital loses its star and joins the victor in plain colours, but the
rest of the realm stays its own — its surviving cities, garrisons and borders
keep flying their own banner, run by their own AI as a puppet under the new
overlord (`civ.vassal = <overlord>`, `civ.alive` stays true). The palace
RELOCATES to the realm's largest surviving city (`relocatePalace`, the
original's palace-move law; ties break to the older city), a forced peace cools
the front, and the log records `civFall` with `vassal: true` alongside `peace`
and `palace`. The yoke has three laws, all gated: **tribute** — every turn the
puppet's whole purse flows to the overlord (`tribute` event; it stops the
moment the vassal takes up arms again); **puppet peace** — `canDeclareWar`
refuses any war started by a kneeling realm, at any table; **no colonies** — a
vassal's cities never queue SETTLER (expansion is the overlord's privilege). If
the overlord itself dies, its vassals cast off the yoke the same tick
(`unbound`). A realm with no surviving city has nowhere to move the palace: it
is extinguished honestly (`civDead`) — the body count path is still real, just
rare. A NON-capital city falling changes nothing about the reign; Barbarians
seizing a capital raze-without-vassalizing (majors-only: `civ < BARB &&
old < BARB && old !== 0`); and a RELOCATED seat falling annexes that city and
moves the palace again — a realm kneels once, at its first capital. This is
what keeps the HUD pill honest: `X/3 rival capitals taken` counts ORIGINAL
capitals (`gs.origCapOf` — the seats first founded), so a moved palace can
never hide a fallen seat, and `victoryFor` domination reads the identical law
(the original judged the world by captured thrones too). Rome keeps exactly one
capital (the prize city never counts as a second seat). See §35.

**Determinism.** Ark progress (and its derived four-part reading), lifetime
culture, the six-era bitmask, the new unit kinds, the transports' cargo
manifests and the capital-fall conquest all fold into `stateHash`; same-seed
replays stay hash-for-hash (§2, §32). Costs/thresholds are tuned so the science
line lands at t35–36 and the culture line at t33–36 on the witness boards (§33)
— the 40-turn clock is the design constraint, proven not assumed.

**Mobile perf (polish #5, `npm run civclock`).** The late board (autopilot to
t30 with the crowns disarmed, musket line + keel on top — `__civTest.clock`)
is the worst the renderer ever sees. `?lite=1` is the documented cheap
pipeline (the RaccoonHeist doctrine): MSAA off, device pixel ratio capped to
1 — no shadows exist here, and nothing is removed from the scene graph, so
`civplay` proves the flag still paints the world and caps the backing store
(`dpr≤1` is a real pixel check). Per-frame work was made allocation-free: the
tile-colour loop lerps against module constants instead of `new Color` per
tile, the rebuild signatures are rolling integers instead of strings, and the
signatures no longer carry `gs.turn` — an untouched board used to rebuild
every city, camp and wonder *every turn*; now they rebuild only when the board
actually changed. The catch-up cap is **16** steps, not 8: at the arcade's
8-step cap the world loses real time below ~7.5 fps (half speed at 4 fps —
the frame-floor lesson in AGENTS.md), and a turn-based sim is cheap to
simulate even when the GPU is slow, so the world keeps seconds down to ~4 fps.
One measured truth about the instrument: headless Chrome on macOS presents at
~13–20 fps for *any* page — a bare three.js canvas that only clears the
screen measures ~13 fps here — so `civclock` never claims fps as a property
of the game; it gates on the loop ratio (≥0.9x at full speed) and prints
fps/p50/p95 for whoever tunes the pipeline. Mutant proof #6 below.

## Controls

Click/tap a tile to move; a hostile hex to strike. Keys: Space/Enter end turn ·
E settle · 1/2/3 warrior/archer/settler · 4 worker · C catapult · V legion ·
H chariot · **K musket** · N trireme · **L galleon** (coastal cities) ·
**W** WORK panel (F farm · M mine · O road) · **T** RESEARCH (R next) ·
**P** POLICY · **U** WONDERS · **G** LEGENDS · **D** DIPLOMACY ·
**I** VICTORY (three race tracks + rival progress; YARD ◀ ▶ picks the city,
⚒ WELD mobilises a plate) · **Q** weld the next missing plate at the chosen
yard (#2077; `I` because Y is the WATCH key, #1637) ·
**E** settle — or EMBARK when a friendly Galleon rides alongside ·
**J** LAND at the nearest open beach (laden Galleon) ·
arrows orbit/tilt · wheel/pinch zoom · `?` help. `VirtualControls`:
A = END TURN, B = settle/embark. Tapping a beach beside a laden Galleon lands
the hold. The Y panel is reachable by touch (on-screen button).

## Verify

```bash
npm run civcheck          # 626 Node checks: boot, determinism, founding, economy, combat, barbarians,
                          # cities, production, tech (§16-18, now 21 techs / 6 eras), improvements (§19-20),
                          # resources (§21-22), borders (§23), happiness (§24), policies (§25), wonders
                          # (§26), great people (§27), stage-6 integration + slack (§28), city-states §29,
                          # diplomacy §30, naval §31, later eras + Ark mechanics + clock budget §32,
                          # victory order + culture ledger + race reachability §33,
                           # transports §34 (embark/land/assault/drown laws, capacity, hash fold)
                           # capital capture ≠ extinction §35 (original-capital fall KNEELS a two-city
                           # realm: palace relocates, forced peace, whole-purse tribute, puppet no-war +
                           # no-colony laws, unbind on overlord death; single-city realm extinguishes;
                           # pill counts ORIGINAL capitals; three falls trip DOMINATION; determinism +
                           # hash folds for vassal/orig marks)
                           # spaceship plates §36 (four named plates split the 70 ledger, one at a time per
                           # yard in ANY order, exact cost with no spill, named weld events, launch only
                           # when all four are DELIVERED, duplicate mobilise drops, rival tracks stay
                           # separate, replay determinism)
                           # tourism crown §37 + kneel copy/ghost-star pins §38 (previous polish passes)
                           # naval supply §39 (ports of realm: own/vassal/overlord/allied-CS coastal cities;
                           # horizon sharp at CFG.navalSupply sea steps; wear bites only far hulls,
                           # no heal afloat, attrition alone sinks a hull and drowns its hold;
                           # land units exempt; replay determinism; renderer/HUD source pins)
                           # ARK YARDS §40 (plates are city industry #2077: no plate before Spaceflight,
                           # capital takes the first, one plate per yard but parallel cities weld, engineer
                           # speeds a plate, full yard denies, AI + witness mobilise, seed-9 replay, source
                           # pins against the old empire-wide beaker pour)
npm run civplay           # Chrome, real keys: I opens VICTORY (three tracks + rivals), K/L answer with
                          # Musket and Galleon on a seed-4 COASTAL capital (real keel, no escape clause),
                          # J/E refuse the transport paths by name, the four plates mobilise at the yards
                          # and weld on live turns (panel tracks + delivery toast + weld copy), win screen
                          # names the victory type, zero errors; then a ?lite=1 page: same world painted,
                          # dpr capped to 1, no errors
npm run civclock          # late-board frame budget, full vs ?lite=1 at CPU throttle 1/4/8:
                          # fps, loop ratio (the gate: >=0.9x at full speed), p50/p95 frame ms
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
 4. In `sim.js` `captureCity`, neuter the kneel rule (`const origFall
    = fellCapital && !!city.orig && …` → `false`) → §35's submission, palace,
    forced-peace, tribute, puppet-war and puppet-colony checks go red (seven
    of them — without the kneel the world is back to annex-or-die); restore.
 4b. In `sim.js` the tribute block (`&& C.gold > 0`) → `&& false` → only the
    §35 tribute pair reddens (the yoke keeps its other laws); restore.
 5. In `sim.js` `pumpCityQueue`, drop the plate delivery (`gs.arkParts[city.civ]
     |= 1 << pi` → `|= 0`) → nineteen checks go red (§32's launch, §36's ledger
     folds, §40's deliveries and mobilisations — a finished yard that never marks
     its plate builds nothing anyone can see); restore.
 6. In `sim.js` `animateUnits`, add a 30 ms busy-wait to the tick path →
    `civclock` reddens (`loop 0.55x … BELOW 0.9x`, exit 1) — a sim that eats
    the frame budget loses real time even under the raised cap; restore.
 7. Carried: the truce-line mutant reds §30; wonder race-check reds §26×4; the
   recruit gold-gate reds §27×2; border-clamp reds §23; branch-order reds §25;
   Stage-3 queue-gate reds §17; Stage-4 connectivity reds §21/§22.
 8. In `sim.js` `endPlayerTurn`, neuter the wear (`u.hp -= CFG.navalAttrition`
    → `u.hp -= 0`) → seven §39 checks go red (the exact bite, the double price,
    the attrition sink, the named loss and the drowned convoy); restore.

## Honest gaps (what the full original has that this arcade run does not)

- **CLOSED by #1777:** *Vassals are annexed, not puppets* — the realm whose
  ORIGINAL capital falls now kneels instead of folding: it keeps its surviving
  cities, garrisons and banner as an AI puppet, the palace relocates, tribute
  flows to the overlord each turn, and puppets never start wars or plant
  colonies (all gated in §35, mutant-pinned). Still owed honestly: the
  overlord has no liberate/annex **choice** (kneeling is automatic, annexing a
  kneeling realm still takes cities one by one by siege), tribute is a flat
  whole-purse rather than the original's scaled per-population cut, there is no
  rebellion chance, and no Casus-Belli flavour on the forced peace.
- **Sea combat flavor beyond hulls** — transports cross any coast-to-coast sea
  in path range; no naval tactics stack (no ranged port bombardment from the
  water, no promotions, no line-of-battle). Supply lines CLOSED by #2065: hulls
  beyond 6 sea steps of a friendly port wear, starve of heals, and sink with
  their hold (§39, mutant-pinned); the tactics stack stays owed.
- **CLOSED by #2077:** *The Ark parts were one program, not city industry* — the
  four named plates (Cockpit, Booster, Stasis, Launch) are now per-city production
  projects: mobilise a plate at any city (`I` panel, YARD picker or `Q` at the
  capital), one at a time per yard, any order, cities welding in parallel on their
  own shields; an engineer's 25% speeds a plate; delivery marks the realm's ledger
  (§36 + §40, mutant-pinned). Still owed honestly: Civ V's Apollo-style staged
  unlock (the five components arrive across three techs, one part kind per era)
  is kept as all-four-open-on-Spaceflight, and plate costs are flat arcade
  numbers split from the old 70-beaker program, not the original's speed-scaled
  500/2000-shield components.
- **Tourism is simplified, not BNW** — the culture/tourism split is live (the
  visitor book banks half of culture, 3 per wonder, 1 per luxury and crowns on
  the lead), but there is no World Congress, no Ideology gifting of tourism, no
  great-work slotting and no tourism-scales-with-era curve.
- Wonders stay six, great people three, policies six, city-states two, happiness
  one empire-wide face; no buildings/city screen, no world congress, no
  religion, no trade routes, no great-engineer wonders of the modern age.

These are the arcade's cuts, decided from Stage 1: eight stages, forty turns,
one phone-sized board — the shape of the whole campaign.

## Camera UX (#535)
Left-drag (or one-finger) pans the map in the ground plane (pan rate scales with
zoom, target clamped to world bounds); right-drag and two-finger drag orbit,
two-finger pinch zooms, wheel zooms. Arrow keys pan continuously while held
(`held` set + per-frame pan — Playwright holds do not auto-repeat keydowns, so
edge-style held-key panning is also what the harness can drive); screen edges
pan. `Home` or the ◎ CENTER button jumps back to the selected unit, else the
capital, else the first living unit. `probe().unitScreen` reports the selected
unit's projected screen pixels so civplay can gate framing at both shapes. A
next-step hint line walks PRESS E → PICK A BUILD → SPACE ENDS THE TURN and steps
aside once each is done; a short HOW YOU WIN card opens on first play and closes
when the capital stands.
