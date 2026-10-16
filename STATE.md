# STATE — 2026-10-16 (forge session, CIVILIZATION V Stage 7 shipped — THE WORLD)

## Shipped this session
**CIVILIZATION V — Stage 7 "The World"** (#355; PR #371 squash-landed as
96ba65c; static+smoke+Vercel green; prod confirmed: CivV chunk
`index-BlWmpdk8.js` carries STAGE 7 + DIPLOMACY):
https://jalfern.com/retrogames/civilization-v

Session note: this was a RESUME — the prior session died mid-UI (warden
kicked this one). Its pushed spine (ac466bf+b7ba30e: sim + harness §29-31)
plus its dirty uncommitted UI corpse were completed, fixed and shipped.

- **City-states:** Tyre & Venice seated on coasts at newGame (yield-aware
  seats, spacing≥3); meet by reaching the court, gift 25g → +30 influence,
  alliance at 60 pays pensions (Tyre +2g/turn, Venice +1 sci +1 cult);
  sack pays +40 tribute, allies lose the pension.
- **Diplomacy:** D panel — war/peace/trade per empire, named refusals
  everywhere; fresh peace = 3-turn truce blocking instant re-declare; trade
  needs 3 honest peace turns, pays both crowns +3g/turn; peace erases
  war-weariness from the mood ledger. `canDeclareWar/canMakePeace/canTrade/
  canGift` = one law for panel, harness, AI.
- **Naval:** Trireme (Bronze Working, N) — coastal cities only, Coast/Ocean
  domain for path/reach/combat/delivery, ships fight ships only, ports yield
  to land, land units beach/board alongside; stateHash folds influence,
  pacts, truce clocks, naval.
- **Shell:** DIPLOMACY panel + touch button, galley mesh w/ sea-bob, CS
  lighthouse beacons, pacts/courts/wars HUD pill, cs*/peace/trade toasts +
  motifs, DebugKit world line + GIFT/TRADE/PEACE/TRIREME cheats.
- **Corpse fixes:** `CIVS[e.cs].toUpperCase()` (object!) would have crashed
  gift/ally toasts in the browser; naval click refusals were silent — now
  named reasons.

Gates: `civcheck` **375/375** (§29 CS seat/meet/gift/alliance/sack, §30
war/peace/truce/trade/mood, §31 naval domain/delivery/board/win; prior
stages + witness + slack intact). Mutant: truce line neutered in
`canDeclareWar` ⇒ §30 red; restore green (trade peace-gate mutant was proved
at b7ba30e). `civplay` **49/49** zero page errors (pacts 0-1/0-2/0-3 sign on
live turns; Venice war→peace→truce 0-6 on real turns). lint:civ/mario/fps/ai
+ build green.

## GOAL — next session
#355 is on `game-queue`, now **stage 8** only: later eras (Renaissance→Modern
techs) + real victory conditions (domination, science, culture). Keep sim pure
+ deterministic, fold state into stateHash, prove one mutant red, ship one
stage. QA lane: stage-7 polish filed as **#372** (galley wake/sail billow/
rowing cycle, camera focus on diplomatic events, D-panel chips+heraldry, CS
influence rings, war flash/peace flag, court flourish arpeggios, attract demo
courting a CS + launching a galley); older CivV backlog #347/#350/#352/#358,
#220 building-qa.

## Board (last read)
- #355 Civ V `game-queue` (stage 8; stages 1–7 live).
- #372 Civ V polish `feedback` (QA lane's job).
- No `next` items. Rule-4 satisfied — game code shipped this session.

## Notes for whoever picks this up
- **sim.js Stage-7 spine:** CS block (cityStates/csInfo/canGift/giftCS/
  sweepMeetings) after the diplomacy fns (declareWar/makePeace/canDeclareWar/
  canMakePeace/canTrade/makeTrade ~l.240-290); naval helpers (isWater/
  coastalTile/coastalCityOf/firstFreeSea) ~l.334; domain law in `domainOK`
  (~l.233) + `doAttack` (~l.1100: naval↔naval only, no naval port assault) +
  `navalTarget` (~l.1213) + delivery at ~l.1301; input handlers declare/
  peace/trade/gift ~l.1665; hash folds ~l.1700.
- **Hex parity:** odd-r neighbour tables were parity-swapped vs
  hexToWorld/hexDist until b7ba30e — movement ≠ range on diagonals. If a new
  rule involves adjacency, trust `hexDist` and re-derive the tables.
- **Pace lesson carried:** the witness ends ~t11-12; stage-8 tech costs must
  fit that clock (science victory must be *reachable* by turn 40, costs scale
  to the arcade pace — re-check costs against the t12 witness, not Civ V).
- **Shell pattern:** new panels: ref+state+openRef, refresh every ~200ms while
  open, Escape chain, VirtualControls `visible` conjunction, `KeyX` toggles.
- **Resume hygiene:** a dirty lane worktree on a pushed `forge/<slug>` branch
  with a `building` issue = continue it; diff against the branch tip before
  trusting any of it (two latent crashes lived in that corpse).
- Prod check: entry `index-ZhqKgtCf.js` (or newer) lists chunks as
  `assets/…`-prefixed names in mapDeps; grep `STAGE <N>` to find the game
  chunk.
- Worktree `~/Dev/retrogames-forge-civilization-v` on `forge/civilization-v`
  (merged); main checkout detached at 96ba65c.

## Three questions for Jon
1. Stage 8 science victory on a 40-turn clock: is "finish a space-technique
   line (2-3 late techs) + bank N science" the right win shape, or track a
   literal space race (launch when tech + beaker stack is done)?
2. Culture victory: culture bombs already widen borders — should culture win
   be "tourism > rival's cumulative", "all 3 masterpieces built", or the
   border-faith shape (majority culture on the board at turn 40)?
3. #372 lists attract-mode gaps (the demo shows no Stage-7 features because
   the witness never gifts/launches). OK for the polish lane to change
   `decide()` (witness behavior) as long as civcheck's win-at-t11 holds?
