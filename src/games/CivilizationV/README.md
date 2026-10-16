# CIVILIZATION V — Stage 7 "The World"

Firaxis's 2010 4X. Stages 1–6 gave the realm land, war, progress, borders,
ledgers and a legacy; Stage 7 opens the map's edges — two coastal courts, a
table of treaties, and the first ships on the water.

`https://jalfern.com/retrogames/civilization-v`

## What is in the box

```
src/games/CivilizationV/sim.js      pure deterministic sim (no three, no DOM, no Math.random)
src/games/CivilizationV/planner.js  the autopilot — the attract demo AND the harness witness
src/games/CivilizationV/art.js      tilted 3D hex world (three.js): relief, fog, borders, camps, roads,
                                    farms, mines, resource tokens, wonder landmarks, triremes, CS beacons,
                                    HP bars, arrows, FX
src/games/CivilizationV/index.jsx   the shell: renderer, camera, input, HUD, research/worker/policy/
                                    wonders/legends/diplomacy panels
scripts/civcheck.mjs                Node harness (npm run civcheck) — 375 checks
scripts/civplay.mjs                 Chrome drive with real keys (npm run civplay) — 49 checks
```

## Engine notes

**City-states.** Tyre and Venice sit neutral on the coast from turn 1 (seats
picked with the same yield-aware scoring as capitals, ≥3 hexes apart). A unit
walking beside a capital *meets* the court; gifting 25 gold buys +30 influence
and at 60 an alliance pays forever — Tyre +2 gold/turn, Venice +1 science
+1 culture/turn. Siege a city-state and it burns into the captor's empire with
+40 tribute; allies of the fallen lose their pension.

**Diplomacy.** The D panel lists the three empires with live state — WAR /
PEACE / TRADE — and every button names its refusal: a fresh peace signs a
*truce* (`truce holds N more turns`, CFG.peaceCool = 3) that blocks an instant
re-declaration; a trade pact needs three honest turns of peace (or never having
fought) and then pays both crowns +3 gold/turn. Making peace erases
war-weariness from the happiness ledger — a provable mood delta. The AI uses
the same `canDeclareWar/canMakePeace/canTrade` law as the panel and harness.

**Naval.** The Trireme (Bronze Working, 30 shields) is built only by cities
that touch the sea and delivers into the first free adjacent water hex. One
domain law drives path, reach, combat and delivery: ships sail Coast/Ocean
only, only ships fight ships, ancient ships do not storm ports (that is the
age of sail — "PORTS YIELD TO LAND FORCES"), and any land unit may beach and
board a vessel alongside the shore. `tileBlocked`/`domainOK` are asked by
everything that moves.

**Everything still obeys the earlier stages.** Borders creep, moods swing,
policies legislate, wonders race, legends answer; the AI researches, legislates,
builds galleys on coastal lines, declares, sues for peace and signs pacts on
deterministic lines. Costs are scaled to this arcade's 40-turn clock, not Civ
V's 300-turn canvas.

**Determinism.** Influence, alliances, trade pacts, truce clocks and the
naval board fold into `stateHash`; same-seed replays stay hash-for-hash (§2,
§31).

## Controls

Click/tap a tile to move; a hostile hex to strike. Keys: Space/Enter end turn ·
E settle · 1/2/3 warrior/archer/settler · 4 worker · C catapult · V legion ·
H chariot · **N trireme** (coastal cities) · **W** WORK panel (F farm · M mine ·
O road) · **T** RESEARCH (R next) · **P** POLICY · **U** WONDERS · **G**
LEGENDS · **D** DIPLOMACY (declare/peace/trade, gift a court) ·
arrows orbit/tilt · wheel/pinch zoom · `?` help. `VirtualControls`:
A = END TURN, B = settle. The D panel is reachable by touch (on-screen button).

## Verify

```bash
npm run civcheck          # 375 Node checks: boot, determinism, founding, economy, combat, barbarians,
                          # cities, production, tech (§16-18), improvements (§19-20), resources (§21-22),
                          # borders (§23), happiness (§24), policies (§25), wonders (§26-28), great people
                          # (§27), city-states §29 (seat/meet/gift/alliance/sack), diplomacy §30
                          # (war/peace/truce/trade/mood), naval §31 (domain/delivery/board/win), slack
npm run civplay           # Chrome, real keys: D opens DIPLOMACY (both courts + three empires), a pact
                          # signs and a war/peace cycle lands in the ledger on live turns, N answers at a
                          # coastal city, win, 0 errors
npm run lint:civ          # eslint gate for the game + its scripts
```

`civplay` needs `npm run dev`; against headless IPv4 use
`CIV_URL=http://127.0.0.1:<port>/retrogames/civilization-v npm run civplay`
(Vite may bind IPv6-only — then use `http://localhost:<port>/...`).

**Mutant proofs.**
1. In `sim.js` `canTrade`, delete the peace-clock gate → §30 goes red; restore.
2. In `sim.js` `canDeclareWar`, neuter the truce line → §30's re-declaration
   refusal goes red; restore = 375.
3. Carried: the wonder race-check mutant reds §26×4; the recruit gold-gate
   mutant reds §27×2; Stage-5 border-clamp reds §23; branch-order reds §25;
   Stage-3 queue-gate reds §17; Stage-4 connectivity reds §21/§22.

## Honest gaps (stage boundaries — later stages close these)

- **Two city-states, one route each** (gift→influence→alliance, and the sack);
  quests, suzerainty bonuses and world congress arrive with later eras.
- **War/peace/trade only** — no world ideology, denouncements or alliance
  scoring; the AI's peace appetite is a deterministic mood, not Ghandi-modeled.
- **One ancient ship** (the Trireme); galleons, transports and naval invasion
  come with the final stage's age of sail.
- Wonders stay six, great people stay the working trio, happiness one
  empire-wide face; buildings/city screen and science/culture victories are
  Stage 8.

These are intentional stage cuts, not omissions of promised Stage-7 behaviour.
