# CIVILIZATION V — Stage 5 "Culture & Happiness"

Firaxis's 2010 4X. Stage 1 shipped founding, Stage 2 war, Stage 3 the arrow of
progress, Stage 4 settled the map; Stage 5 gives the realm its two ledgers —
culture carves the map into nations, and happiness decides whether the people
grow or grumble.

`https://jalfern.com/retrogames/civilization-v`

## What is in the box

```
src/games/CivilizationV/sim.js      pure deterministic sim (no three, no DOM, no Math.random)
src/games/CivilizationV/planner.js  the autopilot — the attract demo AND the harness witness
src/games/CivilizationV/art.js      tilted 3D hex world (three.js): relief, fog, borders, camps, roads,
                                    farms, mines, resource tokens, HP bars, arrows, FX
src/games/CivilizationV/index.jsx   the shell: renderer, camera, input, HUD, research/worker/policy panels
scripts/civcheck.mjs                Node harness (npm run civcheck) — 236 checks
scripts/civplay.mjs                 Chrome drive with real keys (npm run civplay) — 33 checks
```

## Engine notes

**Culture borders.** Every city banks its own culture each turn (every worked
tile sings, the court adds a voice, Philosophy and Foundations add more). The
first ring is claimed at founding; ring 2 opens at 40 culture, ring 3 at 120 —
the same quiet creep the original does while you're at war. Borders only claim
unowned ground: a rival's tile is never annexed by culture, and first-come wins
the open hexes between capitals.

**The happiness ledger.** Palace +2, each unique connected luxury +1, every
city −1, every war −2 weariness. Net ≥ +1 is HAPPY: +25% growth on every
city's food surplus and +10% gold empire-wide. Net < 0 is UNHAPPY: no city
grows at all and city defence drops 25% — mobs don't man the walls. The mood
itself is an event (the HUD face flips ☺/😐/☹ with a chime or a grumble).
Happiness is empire-wide here (one ledger face for Rome), the honest
simplification of Civ V's per-city faces.

**Social policies.** Culture buys government: three real Civ V branches with
two real policies each, adopted in branch order and paid from the empire's
culture pool — Tradition (Foundations of the State +3 culture/city; Ceremony
+1 happiness per connected luxury), Liberty (Colonial Offices cuts settlers
from 35 to 10; National College +1 science/city), Commerce (Trading Posts +1
gold/city; Treaties halves war weariness). Refusals name their reason in the
sim (`requires Foundations of the State`, `not enough culture`), so browser,
harness and AI all obey the same law. Rivals adopt deterministic policy lines
of their own (Egypt Commerce, China Liberty, the Aztecs Tradition).

**Everything still obeys the earlier stages.** The witness commits the player
economy-first (Pottery → Wheel → arms), trains labourers, works the ring and —
the new beat — legislates: the attract demo adopts FOUNDATIONS around turn 7
and CEREMONY not long after, and the borders visibly widen mid-demo. Happy
growth sped the campaign: the autopilot now takes the milestone at turn 12
(was 15–17), so §22's labour proof runs on resistant scenario 3 where the
barbarians slow the win and the farms still finish.

**Determinism.** City culture, per-civ adopted-policy mask and the culture
pool all fold into `stateHash`; same-seed replays stay hash-for-hash (§2).

## Controls

Click/tap a tile to move; a hostile hex to strike. Keys: Space/Enter end turn ·
E settle · 1/2/3 warrior/archer/settler · 4 worker · C catapult · V legion ·
H chariot · **W** WORK panel (F farm · M mine · O road) · **T** RESEARCH (R
next) · **P** POLICY (tap a lit policy to adopt; P closes) ·
arrows orbit/tilt · wheel/pinch zoom · `?` help. `VirtualControls`:
A = END TURN, B = settle.

## Verify

```bash
npm run civcheck          # 236 Node checks: boot, determinism, founding, economy, combat, barbarians,
                          # cities, production, tech (§16-18), improvement gates (§19), build turns +
                          # yields + roads + pillage (§20), resources reveal/connect/pay (§21),
                          # resource-gated units + end-to-end labour (§22), culture borders (§23),
                          # happiness ledger + mood bonuses (§24), policy cost/order/effects + AI law (§25),
                          # win/loss/slack
npm run civplay           # Chrome, real keys: P opens POLICY (three branches), happiness ledger probe,
                          # policies adopted + borders widened on live turns, farms, techs, win, 0 errors
npm run lint:civ          # eslint gate for the game + its scripts
```

`civplay` needs `npm run dev`; against headless IPv4 use
`CIV_URL=http://127.0.0.1:<port>/retrogames/civilization-v npm run civplay`.

**Mutant proofs.**
1. In `sim.js` `spreadBorders`, clamp `rad` to `CFG.cityRingWork` (Stage-4
   behaviour) → §23 goes red 5 ways; restore = 236.
2. In `sim.js` `canAdopt`, delete the branch-order check → §25's
   "branches open at their first policy" goes red; restore = 236.
3. Carried from Stage 3: the queue-gate mutant still reds §17; from Stage 4:
   `connectedResources` "every tile counts" reds §21/§22.

## Honest gaps (stage boundaries — later stages close these)

- **Happiness is empire-wide** (one ledger face); Civ V tracks it per city, and
  granaries of happiness per city are a later refinement.
- **Policy trees are 2-policy subsets** of the real branches, effects are the
  real policies' simplified numbers with no tech gates; the full trees with
  completion bonuses come with the later eras.
- **Borders are first-come** — Civ V's contested-border culture competition is
  simplified away.
- 8 resource types, 3 improvements; Pasture/Landing Site and the full resource
  board grow with later eras. Connection stays land-linked (borders or roads).
- Still no buildings/city screen, no great people, no wonders (Stage 6), no
  city-states/naval units (Stage 7), no culture/science victory (Stage 8).

These are intentional stage cuts, not omissions of promised Stage-5 behaviour.
