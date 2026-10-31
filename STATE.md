# STATE — session 62 (2026-10-30, slot b)

## Shipped this session
**Campfire fidelity 4 + 5 (#670)** — Jon reviewed the life-layer PR and asked
for two things: tone down the heat-haze (it distorted the flames too much),
and make the logs crumble into charcoal procedurally "like a proper fire",
investigating solutions online. Both merged:
- **#1297 haze** (`b5e0f2a`): shimmer now bends the smoke/sky *behind* the
  plume, not the emitting gas (flame bodies excluded from luma ~0.55 up, was
  1.2; gain halved 0.0035→0.0017 ≈3 px). Also fixed a pre-existing harness
  break from #1262: demos' feedback.js relay probe fails CORS on `file://`,
  tripping `zero page errors` — applied emberwoodcheck's relayNoise filter.
- **#1300 crumble** (`531adef`): each log runs an 80–120 s hash-staggered
  lifetime from one uniform `uBurn` — fresh log tossed in on a diagonal, char
  thins + tip retreats + surface pitting deepens, one hash-placed chunk snaps
  out per leaning log (planar gap, tumbles at world-g into the coal bed,
  glows then shrinks away), stub collapses, new log in. Char→fresh-wood
  gradient (near coals black char + ember cracks — kept Jon's glow — upper
  parts brown). Research: websearch was DOWN all session; used DuckDuckGo
  html endpoint → standard game-FX *dissolve-with-burn-edge* pattern
  (noise-field thresholded by a growing burn value + glowing edge), adapted
  from texture space to raymarched SDF.

## Hard-won facts (harness honesty)
- **A state gate beats a motion gate.** Haze (this run's #1297 earlier PR)
  can't be pixel-proved — flame self-flicker between screenshots overlaps it.
  But crumble IS provable because it's a *state*, not motion: log phases are
  pure functions of `uBurn`, so pinned clocks are identical across runs. Gate
  B (rubble-vs-tepee pile mean-R) needs TWO controls: pin the flare (new
  `setFlare(x)` DEV hook) AND interleave the two clocks per sample. Without
  them Δ swung −3..+7 (flare's 0.45–1.5 swing swamps the ~16 separation);
  pinned+interleaved Δ=18.2–19.2, gate at 8. Mutant uBurn→0 gives Δ=−0.0.
- Contract and pixel gates catch different faults: removing a hook reddens the
  contract gate but not the pixel gate (crumble still shows); pinning uBurn
  reddens the pixel gate but not the contract. Both green ≠ bug; keep both.
- The ember gate was itself silently a flare-phase meter — unpinned it once
  read 825 vs 8 ember px across two frames. Pin the flare there too.

## Next goal
Unchanged game queue (oldest-first per the ladder): **#1252 BOMB DEFUSE,
#1253 GRAVEL YARD, #1254 FIRE CREW, #1259 forge-watch hardening, #1144
follow-ups**. Rule-4 watch: reset — game/demo code merged this session.

## Harness
- campfirecheck now 23 gates (was 21): +`burn clock hooks wired` (contract),
  +`logs crumble with the burn clock` (state pixel gate); ember gate now
  flare-pinned. Mutants 5 documented in its header (uBurn→0 → crumble red;
  hook removed → contract red). All green ×4 runs; frame time unchanged
  16.7 ms @1600×1000 (45 ms budget) despite extra SDF segments + pitting.

## Environment notes
- Slot b: worktree `~/Dev/retrogames-forge-campfire-fidelity` (detached at
  origin/main `531adef`; branches merged+deleted, node_modules symlinked to
  main checkout — playwright-core resolves). No port needed (demos run
  file://).
- Prod verified live (`531adef`): crumble symbols + toned haze present on
  jalfern.com/retrogames/demos/campfire.html (apex 301s to www — curl -L).
- websearch tool returned "Web search cancelled" 3×; webfetch to shadertoy
  403'd. DuckDuckGo html endpoint (`html.duckduckgo.com/html/?q=…`) works
  as the research fallback — use it next time search is needed.

## Open questions for Jon
- none open from this session.

## Carry-over
- #1291 SHORT ORDER SHOUT stage 2 — online kitchen lobby (game-queue).
- #1292 QA polish pass for SHORT ORDER SHOUT (feedback — QA lane's job).
- #1287 QA polish on GAUNTLET voice co-op; #1141 stage 4 (platform lane),
  #1266/#1275 QA follow-ups, 48 h trial verdict (~Nov 1) posts on #1258.
