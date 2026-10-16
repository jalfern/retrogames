# STATE — 2026-10-15 (forge session, PoP Stage 8 shipped: colour temperature, floor bounce, phone light)

## Shipped this session
**PoP Stage 8 — the third art pass on the light spine** (#316, PR #338 squash-
landed as cf45b20; static+smoke+Vercel green; verify advisory):
https://jalfern.com/retrogames/prince-of-persia

Art-only pass — `sim.js` untouched, so the 1989 rules + champion run are unchanged.
Pushed the Stage-6 light model from *brightness* to *colour* and fixed two QA phone
relays (all pure/deterministic, exported so popcheck pins them):
- **Colour temperature.** `torchSum` (flame's own contribution) + `tempAt` (its share
  of light: 0 cold ambient, ~1 in a pool). Figures' rim runs amber under a sconce,
  cool blue-violet where only ambient reaches — warm-fire vs cool-dark by *hue*, not
  just value. Distant twin torches read cooler between them than one flame.
- **Floor bounce.** `bounceAt` — horizontal-only warm uplight (ignores height) painted
  additively on the flagstones under each torch; the flame grounds itself.
- **Phone readability (QA #326).** `ambientFor(lite)` lifts ambient 0.18→0.27 under
  `?lite=1`; `index.jsx` reads `?lite`. Torchless rooms stay readable on a dim phone;
  desktop keeps the deep mood. (Lifted ambient also cools temp — the honest tradeoff,
  pinned both ways.)
- **Bloom vs HUD (QA #326).** Light pools clip to playfield below `HUD_LINE=22`; HUD
  rides a gradient scrim, not a flat slab — bloom no longer washes the demo's clock.

Gates: `popcheck` **253/253** (16 new S8 clauses; champion+slack re-proved). One
mutant proof — `ambientFor` ignoring lite → readability clause red, restored.
`lint:pop/mario/fps/ai` clean, `build` green. `popplay` **17/17**, 0 page errors.

## GOAL — next session
#316 back on `next`; deep pass continues until Jon says stop. **Stage 9 candidates**
(see QA #339 filed this session): widen the warm/cool rim range (the temp split reads
faint once the additive pool dominates); render floor bounce as a per-tile *band* not one
glow blob; give props (flasks/sword/mirror) an `atLight` pass so light is consistent
across the scene, not just figures; treat palace windows as *cool* moonlight sources so
palace reads moonlit vs dungeon firelit. If Jon retires #316, oldest `game-queue` is
**#295 Civ V** — plan the breakdown first (map/cities → tech/units → diplomacy/victory),
ship in stages.

## Board (last read)
- #316 on `next` (deep pass continues). Queue: #295 Civ V.
- #339 filed (feedback): Stage-8 light-model polish — 6 specific items; QA lane's pick.
- Rule-4: not stalled (merged game code src/games/**: art.js, index.jsx).

## Notes for whoever picks this up
- **Stage 8 spine (art.js, pure & exported):** `torchSum`, `tempAt(x,y,key,amb)`,
  `bounceAt(x,key)` (reach `TORCH_RADIUS*0.9`), `poolVisibleAt(y)`, `ambientFor(lite)`,
  `LIGHT_AMBIENT_LITE=0.27`, `HUD_LINE=22`. `lightAt`/`darkAlpha` gained an `amb` arg
  (default LIGHT_AMBIENT → S6 pins still hold unchanged).
- **Figure hue:** `figure()` reads `opts.temp` (falls back to `warm`); rim/shadow/brow
  hues lerp cool→amber by temp, intensity still by `warm`. `atLight` returns
  `{warm, side, temp}`; drawScene passes `amb = ambientFor(lite)`.
- **Pools** clip via `ctx.rect(x-TORCH_RADIUS, HUD_LINE, ...)` before the additive fills
  — keep that clip or bloom washes the HUD (S8 pins the literal).
- **popcheck S8 pins:** lite floor + ambient-aware lightAt; temp sign/monotonic/dilution;
  torchSum additivity; bounce height-invariance + monotonic decay; pool clip + scrim;
  figures carry temp; `?lite` route; no Math.random in art.js.
- **`?lite` gotcha for harness:** `index.jsx` builds `LITE` from `window.location.search`
  at module load — fine in a real tab; popcheck imports art.js only so unaffected.
- **Drive note (this sandbox):** headless Chrome refuses a vite dev bound to default
  localhost/IPv6. Start dev with `--host 127.0.0.1 --port <p> --strictPort` and pass
  `POP_URL=http://127.0.0.1:<p>/retrogames/prince-of-persia`, all in ONE shell call
  (detached dev dies when the call returns).
- **Deploy proof (jalfern blocks this sandbox):** Vercel check green on cf45b20 + Stage-8
  markers preserved through minify in the built bundle (`[?&]lite=` regex, colour literal
  `255,150,70`). Identifiers minify away, so string/regex markers are the proof.
- Worktree `retrogames-forge-pop-stage8` detached at origin/main; main checkout detached
  at cf45b20. Prune pop-stage2..7/prince-of-persia/deep/bobubble/ssx worktrees when free.

## Three questions for Jon
1. Stage 8 made the dungeon warm-vs-cool by hue. Want the *palace* to read cold
   moonlight next (windows as cool key sources), so fire-vs-moon becomes the level
   language? Or is the light spine close enough and we should move to gameplay depth?
2. QA #339 says the warm/cool split is faint under the bright pool on a real screen.
   Push the cool end to violet (risk: muddies the white tunic), or pull the additive
   pool down a touch (risk: loses the flame bloom)? Pick a lane preference.
3. Civ V (#295): green-light the map/cities stage now, or keep riding #316 (Jon's
   earlier "keep iterating graphics until I say stop" was open-ended)?
