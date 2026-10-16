# STATE — 2026-10-15 (forge session, PoP Stage 7 shipped: the escort feel)

## Shipped this session
**PoP Stage 7 — escort feel** (#316, PR squash-landed as 4eace3b, static+smoke
green; verify advisory):
https://jalfern.com/retrogames/prince-of-persia

Danger is now *seen and heard coming* (sim-only, deterministic):
- **Door cues.** `escort` event fires the tick a live ground guard takes up the
  chase behind you (leather-and-mail rustle); `doorCross` fires as its feet
  cross the threshold (stone-slide). Both voices pinned by the S4 contract.
- **Door-frame silhouette.** Pure exported `escortSilhouettes(g)` (art.js) +
  `DOOR_ZONE=3`: a follower 1–3 columns out paints as a clipped dark figure in
  the arch at the screen edge — visible a beat before it enters.
- **Bodies hold the corridor.** `bodyBlock` stops the prince at
  `CFG.bodyGap=40` (blade distance) from a standing guard; running leaps clear
  the head. The pin **refuses** spikes, chomper cells, and walls — a guard
  corners you, never shoves you onto teeth or into stone (that bug shipped and
  died in popcheck, twice — see notes).
- **Jaws take both sides.** A live guard on a chomper cell when they close dies
  (`guardDown`, escort included).
- **Duel etiquette.** Closest engaged guard = elected duelist; only it winds,
  and no second lunge *starts* while another is committed. Escorts stalk and
  close the corridor instead of cross-firing.
- **Escort dash.** Beyond duel range followers close at `min(run, speed+
  escortDash=0.65)`.

Gates: `popcheck` **237/237** (17 new S7 clauses; champion+slack re-proved —
sim touched; one mutant proof — relax etiquette → 2 red, restored).
`lint:pop/mario/fps/ai` clean, `build` green. `popplay` **17/17**, 0 page
errors. Pilot hardened: skid-aware pixel-math jaw windows (crossing and
duel-chase both refuse a short up-window).

## GOAL — next session
**#316 Stage 8** — if Jon wants another art pass, push the Stage-6 light spine
(pools/direction/colour in `art.js`). QA #326 open items (all advisory to
forge, but the lane's queue): light readability of torchless rooms on phones
(maybe lift `LIGHT_AMBIENT=0.18` via `?lite`), bloom vs HUD band, sound mix /
hazard dread / clock pressure / footstep variety / death variety. If #316 is
retired by Jon, oldest `game-queue` is #295 **Civ V** — plan the breakdown
first (map/cities → tech/units → diplomacy/victory), ship in stages.

## Board (last read)
- #316 back on `next` (deep pass continues until Jon says stop). Queue: #295 Civ V.
- QA #326: escort-feel item 1 closed via this PR; items 2–4 (phone readability,
  HUD bloom, sound) still open; new ask relayed: are escort/doorCross audible
  under the pop bed during a chase?
- Rule-4: not stalled (#336 PoP touched src/games/**).

## Notes for whoever picks this up
- **Escort spine (Stage 7):** `sim.js` — `escort`/`doorCross` events (fields
  `{guard, room}`), `bodyBlock` (hazard+wall refusals), `stepGuards` duelist
  election + `!other.wind>0` start lock, follow dash `escortDash`.
- **Pilot:** the L9-style failure mode was a *stall on the jaws cell* during a
  duel; the fix is in `planner.js` — both the jaws gate and the duel-advance
  refuse the cell unless the up-window covers the crossing (pixel math, skid
  aware). Any new hazard-adjacent duel geometry must keep the champion green.
- **popcheck S7 pins:** cue events, blade-distance invariant
  (`minGap >= bodyGap-2`), pincer closed+pinned, etiquette (never two winds,
  `gd === duelist` source pin), dash speed, jaws-eat-guard (fixture: guard at
  x=700 on L5 arrives on the down-beat), silhouette zone/purity, clip-draw.
- L9 room data unchanged this stage (tried moving the guard to col 8 — made the
  duel cross the jaws; reverted; guard at col 6 keeps the duel left of them).
- jalfern.com still blocks this sandbox for asset fetches; deploy proof =
  Vercel's `Vercel` check on 4eace3b + Stage-7 literals (`doorCross`) in the
  locally built `dist` bundle of the merged tree.
- Worktree `retrogames-forge-pop-stage7` detached at origin/main; prune
  pop-stage2..6/deep/prince-of-persia worktrees when convenient.

## Three questions for Jon
1. Stage 7 gave the pincer bodies+etiquette. Want the *third* escort beat — a
   knocked-down guard getting back up behind you in a later room — as Stage 9,
   or is the escort suite complete?
2. Should the duel-etiquette rule be visible in-game (the waiting guard shows a
   "hold" pose / lowered blade) so the one-at-a-time reads to the player?
3. Civ V (#295): start the map/cities stage when PoP winds down, or hold for a
   dedicated multi-session budget?
