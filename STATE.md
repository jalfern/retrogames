# STATE — 2026-10-15 (forge session, PoP Stage 6 shipped: the second art pass)

## Shipped this session
**PoP deep pass — Stage 6, the second art pass** (#316, PR squash-landed as #332,
static+smoke green; verify advisory):
https://jalfern.com/retrogames/prince-of-persia

Jon asked to iterate the graphics until he says stop. The dungeon is now *lit*,
not painted evenly:
- **Per-torch light pools, not a room-wide wash.** New pure model in `art.js`:
  `lightAt(x,y,torchPx)` = cool `LIGHT_AMBIENT` floor + Σ `torchGlow(dist)`
  (smoothstep, 1 at flame → 0 at `TORCH_RADIUS`); `darkAlpha` its inverse. The
  flat `rgba(0,0,8,0.32)` torchless-room fill is gone; darkness is a centre-
  weighted radial vignette (deeper for torchless rooms) and warm light blooms
  additively (`globalCompositeOperation='lighter'`) under each sconce. Two
  torches read brighter between them; far corners stay ambient.
- **One directional key.** `LIGHT_DIR` (upper-left) + `facet(nx,ny)` light top/
  left faces and shadow bottom/right on brick, palace wall AND pillars — the whole
  scene agrees where light comes from.
- **Deeper colour.** Equal-luminance `tone()` replaced with per-channel `mix()`:
  cool violet mortar, bricks warm on the lit corner / cool in shadow, lit top
  course on the masonry. Palette now has hue, not just value.
- **Figures take the light.** Prince/guards/princess ask `atLight(x,y)` for room
  light at their feet and get `warm` + `litSide` — rim on the nearest-torch side,
  warm by flame, cool in the dark. All `sin`-hash deterministic, no `Math.random`.

Gates: `popcheck` **220/220** (15 new S6 clauses; one mutant proof — strip
`torchGlow`'s smoothstep → 3 clauses red, restored). `lint:pop/mario/fps/ai`
clean, `build` green. `popplay` **17/17** on dev, 0 page errors. Spine (sim/
levels/planner/music) untouched — this is a pure art change.

## GOAL — next session
**#316 Stage 7 — the escort *feel* pass** (already written into QA #326): a guard
that follows you out of a room should be seen coming through the doorway behind
you (door-crossing cue at/just-before the screen flip), and two escorts should
coordinate a pincer to actually cut you off. Keep it sim-only + deterministic; any
`sim.js` guard change → re-run `popcheck` champion clause before pushing. If Jon
instead calls another art pass (Stage 8), the pool/direction/colour spine above is
the place to push. If #316 is retired by Jon, oldest `game-queue` is #295 **Civ V**
— full scope stands (Jon, #316 comment); ship it in stages (`Part of #295`), plan a
breakdown first: map/cities → tech/units → diplomacy/victory.

## Board (last read)
- #316 back on `next` (NOT `shipped` — deep pass continues). Queue: #295 Civ V.
- QA: #326 PoP polish — added Stage-7 escort-feel items + two light-check asks
  (phone readability of torchless rooms; bloom not washing the HUD band). Other
  open feedback: #310 SSX, #304 MYST, #302 Gauntlet/FourHalls, #298 Tempest,
  #287 LunarLander, #283 OutRun, #280 SmashTV, #275 Gauntlet, #270 SimCity,
  #269/#220 Kart, #265 Marble, #263/#258 Bubble Bobble.
- Rule-4: not stalled (#330 Q*BERT sound, #332 PoP both touched src/games/**).

## Notes for whoever picks this up
- **Light spine in `art.js`** (Stage 6): pure exports `lightAt/torchGlow/facet/
  darkAlpha`, consts `LIGHT_AMBIENT=0.18`, `TORCH_RADIUS=176`, `LIGHT_DIR`.
  `drawScene` builds `torchPx` for the visible room, paints a vignette, then
  additive `lightPool` per torch, and passes `warm`/`litSide` (via `atLight`) to
  every `figure()`. Colour helper is `mix(hexA,hexB,t)` (per-channel). The old
  `tone()` helper is REMOVED — use `mix`/`facet`.
- **popcheck S6 clauses** pin: falloff (smoothstep/monotonic/gone@radius), the
  directional sign (facing vs back normals, broadside≈0), per-torch combination,
  veil = inverse, "flat wash literal absent", chromatic `mix` present + `tone`
  gone, and figure warm/litSide. Any new tile kind must keep those true.
- jalfern.com still **blocks this sandbox** for deep asset fetches (returns a
  ~84-byte bot page for JS; index page 200). Verify prod by building the merged
  tree and grepping the PoP chunk for a unique literal — this session used
  `rgba(4,6,22,0.50)` (the vignette stop) and confirmed it in `dist/assets`.
  Vercel's production `Vercel` check passing on the merge commit is the other
  proof of deploy.
- Worktree `retrogames-forge-pop-stage6` is detached at origin/main; prune
  pop-stage2/3/4/5/deep/prince-of-persia when convenient.

## Three questions for Jon
1. Stage 7 = escort feel (door-crossing cue + two-escort pincer). Want a third
   escort-beat too — a guard you knocked down earlier getting back up behind you
   in a later room — or keep it to the two cues for now?
2. Civ V (#295) — good to start the map/cities stage as soon as the PoP deep pass
   winds down, or hold it until you've green-lit a dedicated multi-session budget?
3. The new light model makes torchless rooms noticeably darker than before. OK on
   phones as-is, or should the `LIGHT_AMBIENT` floor get a small lift for small
   screens (and should that be a `?lite` behaviour the harness exercises)?
