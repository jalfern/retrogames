# STATE — 2026-10-15 (forge session, PoP Stage 5 shipped: gates/banner/art/escorts)

## Shipped this session
**PoP deep pass — Stage 5** (#316, PR squash-landed as #329, static+smoke green):
https://jalfern.com/retrogames/prince-of-persia
Jon's four fixes, his order:
- **Gates drawn true.** New pure `art.gateBottom(lowRow, open)` hangs the bars
  to the floor while `open < CFG.gateOpen` and clears `CFG.PH` headroom the
  instant it is passable; `gateDrawOpen(open) === open >= CFG.gateOpen`. Old
  formula overshot the floor and showed a looks-shut-but-passable gate.
- **Attract banner.** One message at a time on a slim gold band *under* the HUD;
  the autopilot demo plays in the clear; `AUTOPILOT DEMONSTRATION` moved off the
  JALFERN.COM footer watermark.
- **Real art pass.** Mortar-coursed cut stone (per-brick tone/grain/bevel/
  hairline cracks); ashlar palace with gilding, fluted pillars, lit arched
  windows; rim-lit + shaded prince/guards with soft ground contact shadows. All
  sin-hash deterministic.
- **Escorting guards.** Live ground guard left behind takes up the chase through
  the doorway (`follow`), stops at walls/shaft lips, re-homes to patrol after
  ~600 ticks without you. sim only; champion unharmed.
Gates: `popcheck` **205/205** (14 new S5 clauses; 2 mutant proofs reddened &
restored — `gateBottom`, escort trigger). `popplay` **17/17** on dev, 0 page
errors. lint pop/mario/fps/ai + build green.

## GOAL — next session
**#316 Stage 6 — Jon's second art pass.** Deeper colour + directional light on
dungeon stone, palace, and prince; per-torch light pools (not room-wide). Then
Stage 7 = the escort *feel* pass (door-crossing cue, two-escort pincer).
If #316 is retired by Jon, oldest `game-queue` is #295 **Civ V** — Jon said
(#316 comment) the full Civ V scope stands; ship it in stages like this one
(`Part of #295`). It is large — plan a stage breakdown, don't build it blind.

## Board (last read)
- #316 relabelled `shipped` (still open — deep pass continues). Queue left:
  #295 Civ V only. QA: #326 PoP polish (added Stage-5 items + preview-timing
  note this session), plus open #310 SSX, #304 MYST, #302 Gauntlet/FourHalls,
  #298 Tempest, #287 LunarLander, #283 OutRun, #280 SmashTV, #275 Gauntlet,
  #270 SimCity, #269/#220 Kart, #265 Marble, #263/#258 Bubble Bobble.
- Rule-4: not stalled (#327 lander, #329 PoP both touched src/games/**).

## Notes for whoever picks this up
- Stage-5 sim spine: `sim.js` now has guard `follow`/`followT`/`homeRoom`;
  `syncRoom` triggers follow on room change for live ground guards. Any change
  here → re-run `popcheck` (champion clause) before pushing: escorts are
  data-sensitive to the autopilot.
- Art spine `art.js`: helpers `tone/bevel/grain/brickFace`, `palaceWall`,
  `groundShadow`, `gateBottom`/`gateDrawOpen`. New tile kinds: run them through
  `brickFace` so they never read flat.
- `docs/ART.md` §6 is now pinned by a popcheck clause (attract: one message at
  a time, never over the HUD, caption clear of the footer).
- jalfern.com returns **403 to curl/this sandbox** (host bot-protection /
  deploy lag). Verify prod via a real browser, or grep `dist/assets/*.js` for a
  unique literal (this session used `rgba(232,208,96,0.55)`).
- preview-build popplay drops 3 multi-level checks out of the fixed world-time
  budget (frame-rate floor, not gameplay) — dev is 17/17, popcheck 205/205.
- Worktrees: `retrogames-forge-pop-stage5` done (detached). Prune
  pop-stage2/3/4/pop-deep/prince-of-persia when convenient.

## Three questions for Jon
1. Civ V (#295) full scope stands — is a stage breakdown acceptable (map/
   cities → tech/units → diplomacy/victory across several PRs), or do you want
   it held until a bigger budget?
2. #316 Stage 6 = second art pass (your call). Keep it colour/light only, or
   fold the escort-feel pass into the same stage?
3. #326 preview-build timing note: OK to close as "won't-fix / harness budget,"
   or do you want the popplay harness given larger world-time on slow builds?
