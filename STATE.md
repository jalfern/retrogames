# STATE — 2026-10-16 (forge session, CIVILIZATION V Stage 8 shipped — campaign complete)

## Shipped this session
**CIVILIZATION V — Stage 8 "Later Eras & Victory"** (#355's final stage;
PR #374 squash-landed as 98d0d8d; static+smoke+Vercel green; prod confirmed:
entry `index-DRSz6etE.js` carries THE ARK/GALLEON):
https://jalfern.com/retrogames/civilization-v
**All eight deep-pass stages of Civ V are live.**

- **Later eras:** 9 real techs to 21 across RENAISSANCE/INDUSTRIAL/MODERN
  (Education +2sci, Banking +2gold, Gunpowder, Steam +2prod, Astronomy,
  Railroad = free road movement, Industrialization +3prod, Electricity
  +2sci/+1gold, Spaceflight); 6-era mask, era-dawn toasts.
- **Three crowns,** one shared `victoryFor()` judged for Rome AND every rival
  in order DOMINATION → SCIENCE → CULTURE: post-Spaceflight beakers bank into
  `gs.ark[civ]` (70 launches mid-turn); lifetime culture 350 **and** strict
  lead over every living rival; golden age (cap size 4) still waits behind.
  Rival-first wins lose the world the other way.
- **New arms:** Musket (Gunpowder, str15) and Galleon (Astronomy, ports:true
  — storms ports, which Triremes may never; one law in `doAttack` +
  `UNIT[kind].ports`).
- **Shell:** Y VICTORY panel (three tracks + live rival lines) + HUD trophy
  pill, era/ark toasts, K/L keys, named win screens, DebugKit cheats,
  Musket/Galleon meshes, attract/help/registry copy updated.
- **Bug found by the new harness:** the caps pill counted capitals *missing*
  (showed 3/3 before rivals founded any) — now counts capitals *captured*
  via `capitalOf`.
- **Clock proven, not hoped:** whole Pottery→launch chain 664 beakers ≤ 480
  budget (§16); science race lands t35–36, culture t33–36 on sc0–3 (§33).

Gates: `civcheck` **413/413** (new §32 late eras/Ark/budget, §33 victory
order + culture ledger + race reachability). Mutant: culture strict-lead
neutered ⇒ §33 red; restore green. `civplay` **56/56** zero page errors (Y
panel, K Musket queues on live turns, Ark banks 25+/70 live, caps 0/3, named
win screen). lint:civ/mario/fps/ai + build green.

## GOAL — next session
#355 closed (game complete). **Pick up #375 — Civ V polish pass**
(`game-queue`), items in order: 1 transports/amphibious assault (Galleons
carry land units — biggest honest gap), 2 capital-capture ≠ extinction,
3 named spaceship parts, 4 culture-vs-tourism split, 5 mobile perf at
?lite=1, 6 de-vacuate the civplay Galleon check (seed 1 capital is inland).
QA lane also holds #372 (stage-7 polish). Marble Madness #373 is `building`
in another lane — don't touch it.

## Board (last read)
- #355 Civ V — CLOSED this session (all 8 stages live, prod-verified).
- #375 Civ V polish `game-queue` — **the next goal** (filed this session).
- #372 Civ V polish `feedback` (QA lane).
- #373 Marble Madness follow-cam `building` (other lane).
- Rule-4 satisfied — game code shipped (and the whole campaign landed).

## Notes for whoever picks this up
- **Transports anchor points (polish #1):** domain law `domainOK` (~l.233),
  `doAttack` naval branch + `ports` (~l.1100), `navalTarget` (~l.1213),
  sea delivery ~l.1301, coastal helpers `isWater/coastalTile/coastalCityOf/
  firstFreeSea` (~l.334), input handlers ~l.1665, hash folds ~l.1700. New
  embark/load actions must ask `blocked()` and extend the hash.
- **Pace math is enforced by tests, keep it that way:** §16 asserts the late
  chain ≤ 40×12 beakers; §33 mutates `planner.js RESEARCH_ORDER` (exported
  for this) to prove both races inside the clock. Any cost retune must keep
  those green — the witness default stays a t11 golden age.
- `capsTaken` = captured capitals (`gs.capitalOf[i]` city under another flag)
  — do NOT revert to "no capital city" counting; unresearched rivals read as
  conquered.
- civplay stage-8 pattern: earlier blocks can end the run — 3h restarts via
  `__civTest.start()` + settle, then polls K (fixed waits flake on loaded
  pages; poll ≤10×120ms).
- Prod check pattern: entry `assets/index-*.js`, grep the game's chunk for
  this stage's strings (`THE ARK`, `GALLEON`).
- Worktree `~/Dev/retrogames-forge-civilization-v` on `forge/state-civv8`;
  the merged `forge/civilization-v` branch is deleted remote-side. Main
  checkout detached at origin/main.

## Three questions for Jon
1. Civ V's deep pass is DONE. Next forge session starts polish #375 (transports
   first) — or does a brand-new title jump the queue?
2. Transports: Civ V also embarks at rivers. Coast-only loading here, or river
   embark too (more rules, more proof work)?
3. Polish #2 would change the domination law (capital falls = defeat, matching
   the HUD pill) mid-product — ok to evolve shipped rules when harness+mutant
   prove the new law, or is #355's "extinction" law frozen now?
