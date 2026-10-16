# STATE — 2026-10-15 (forge session, PoP Stage 9 shipped: two-source light, moonlit palace)

## Shipped this session
**PoP Stage 9 — two-source light** (#316 deep pass; PR #340 squash-landed as 6a19df9;
static+smoke+Vercel green; live confirmed HTTP 200):
https://jalfern.com/retrogames/prince-of-persia

Art-only pass — `sim.js` untouched, so the 1989 rules + champion run are unchanged.
Made the *source* of cool light explicit so fire-vs-moon becomes the level language:
- **Moonlight as a cool key.** `coolGlow`/`coolAt`/`moonSources`: arched palace windows
  brighten without heating (`tempAt`→0 in pure moon). `lightAt`/`tempAt` gained an
  optional `moonPx` channel (default `[]` → every S8 value bit-identical). `coolPool`
  paints windows additively, clipped below the HUD like the warm pools. Keys built ONLY
  when `lvl.theme==='palace'` → dungeon stays firelit, palace reads moonlit.
- **Per-flagstone floor band.** `bandAt` quantises the warm bounce to the tile; the lit
  floor steps down tile by tile (stone) instead of one glow blob.
- **Widened rim hue.** `rimColor`: violet (b>r>g) at temp 0 → amber-white (r>g>b) at 1,
  monotonic. Rim-only, so the white tunic never muddies (answers STATE Q2: widen, don't dim).
- **Props catch the light.** `propShade`/`propLight`: flasks/sword/mirror take `atLight`
  — cool veil sinks unlit, warm rim grounds lit. Light consistent across the scene.

Gates: `popcheck` **279/279** (26 new S9 clauses; champion+slack re-proved). One mutant
proof — drop `MOON_STRENGTH*coolAt` from the `tempAt` denominator → cool-dilutes-warmth
clause red (278/279), restored green. `lint:pop/mario/fps/ai` clean, `build` green.
`popplay` **17/17**, 0 page errors (reaches the palace levels). On-canvas colour proof:
a live frame carries warm fire (≈99k px) AND cool dark/moon pixels — the hue model is
visible, not just pinned.

## GOAL — next session
#316 back on `next`; deep pass continues until Jon says stop. **Stage 10 candidates**
(see QA #341 filed this session): clean up the warm/cool *overlap* grey-out near bodies
caught between fire and moon; vary moon hue/intensity per window (seeded) so the palace
has a sky, not a stencil; cast a faint cool light-shaft onto the floor beneath windows;
add a 2px lit-lip per floor tile so the band reads as stepped stone; arch-aware prop veil
on the mirror; confirm the widened violet rim never tints bone-white / the tunic. If Jon
retires #316, oldest `game-queue` is **#295 Civ V** — plan the breakdown first
(map/cities → tech/units → diplomacy/victory), ship in stages.

## Board (last read)
- #316 on `next` (deep pass continues, 9 stages shipped). Queue: #295 Civ V.
- #339 CLOSED by #340. #341 filed (feedback): Stage-9 light-model polish — 8 items.
- Rule-4: not stalled (merged game code src/games/**: art.js this session).

## Notes for whoever picks this up
- **Stage 9 spine (art.js, pure & exported):** `coolGlow(dist)` (reach MOON_RADIUS=
  TORCH_RADIUS*1.15), `coolAt(x,y,moonPx)`, `moonSources(decos,base)` (pane y=60,
  x = base + rm*RW*T + window*T + 16), `rimColor(temp)→{r,g,b}`, `bandAt(x,keyPx,tile=T)`
  (= bounceAt at tile centre), `propShade(warm)`=0.55+0.45*warm. `MOON_STRENGTH=0.7`
  (soft key, never flares). `lightAt`/`tempAt` last arg `moonPx=[]` — default keeps S8.
- **Two-source call:** drawScene builds `moonPx` ONLY in palace; `atLight(x,y)` returns
  `{warm,side,temp}` with moon baked into warm + temp; cool pools paint after warm pools;
  floor band replaces the old single ellipse (loop `k=-reach..reach`, `fillRect(c*T+1,
  fy-5, T-2, 10)`). Keep the palace-only guard and the HUD clip in coolPool.
- **popcheck S9 pins:** moon reach/strength, coolGlow monotone, coolAt additivity,
  moonSources window-extract + empty-guard + RW*T offset, moon-lights-without-heating,
  cool-dilutes-warmth, default-moon-leaves-S8, rim violet/amber/monotonic (g<175 mid),
  bandAt quantise+step+reach-death+height-invariant, propShade bounds+monotone, drawScene
  wiring regexes, no Math.random. `VW` imported into popcheck for the tile size (T=VW/RW=32).
- **Drive note (this sandbox):** headless Chrome needs dev on IPv4: start with
  `--host 127.0.0.1 --port <p> --strictPort` and pass `POP_URL=http://127.0.0.1:<p>/
  retrogames/prince-of-persia`, ALL in one shell call (detached dev dies when it returns).
  `openGame` returns the `page` directly (not `{page}`).
- **Deploy proof:** jalfern IS reachable from this box this session (live HTTP 200); plus
  Vercel green on #340 and the cool-pool literal `150,170,255` survives minify in the
  fresh dist bundle. Identifiers minify away, so string literals are the marker.
- Main checkout detached at 6a19df9. Many stale pop-stage2..8 + bobubble/ssx/prince-of-
  persia worktrees remain — prune when confirmed free (other lanes may still hold them).

## Three questions for Jon
1. Stage 9 made the palace moonlit vs the dungeon firelit. Is that the right read of the
   original's two zones, or should the palace ALSO carry warm torches (mixed light)? It
   changes whether Stage 10 refines the fire/moon contrast or blends them.
2. Every window currently glows the same violet. Want per-window sky variation (seeded
   moon hue/intensity) for a richer palace, or keep the uniform cool key for a cleaner
   palette? (Variation risks reading as noise on a dim phone.)
3. Civ V (#295) is still queued behind an open-ended #316. Green-light the map/cities
   stage now, or keep the deep pass going on PoP until you call it done?
