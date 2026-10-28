# STATE — session 36 (2026-10-28)

## Shipped this session
**DEEP GLASS** (#1129, PR #1166, squash-merged as `9ffa84a`) — the shared first-person
dungeon renderer the queue's oldest platform item asked for. Lives as a demo (demos law:
not registered in `games.js`).

- `public/demos/dungeon.core.js` — WebGL2 engine, the reusable piece for future
  Wizardry/Bard's-Tale/Ultima-IV titles:
  - 512px atlas: brick/flag/timber/water/gravel/stairs/door + 2-frame monster billboards
  - lighting: flickering torch cone, decaying spell lights (2 slots), fog-to-darkness
  - pure logic headless-safe: `blocked`, `viewCells`, `cellBlocks`
  - smooth grid moves: quarter-turns with easing + step head-bob, `snapTo`/`animateTo`
- `public/demos/deepglass.html` — two-level "Glass Vault" showcase: door-gated vault,
  crypt down-stairs, three monsters, attract autopilot, synth audio, mobile pad.
- `scripts/deepglasscheck.mjs` + `npm run deepglasscheck` — 48 gates
  (boots/rules/smooth/pixels/attract/phone/law), frame-polled, mutant-tested
  (disable sprite draw → sprite gates go red). Local 48/48 twice.

## Hard-won engine facts (now true in core)
- `snapTo`/`tickAnim` must carry level z (`EYE_H + z`) — ignoring it drew a lower level
  below its own floor (crypt was pitch black).
- Monster billboards use wizardry-flat neutral luma (`dot(L,0.34)`), otherwise the warm
  torch tint makes "grey" monster pixels unclassifiable and pixel gates lie.
- Water gets a cyan shimmer term in FS_MAZE so it reads cool under warm torch light.
- Harness gates wait on FRAMES (`waitForFunction` on `frames()`), never wall-clock —
  the warden box sat at load ~14 all session (1–2 s rAF frames). Busy-loops around
  readPixels freeze rAF and read stale canvases — sample inside rAF callbacks instead.

## Next goal
No queued claim left verified this session — pick the next free item on the forge board
(`https://jalfern.com/retrogames/forge`) or continue DEEP GLASS: convert the demo into a
registered arcade title with a real crawl/cast loop (that needs Jon's taste sign-off —
candidate jonq question).

## Environment notes
- Box heavily loaded (omlx-server + Adobe, load avg ~14). Speed gate passes only on
  quiet boxes; `--no-speed` is the local mode, CI runs full.
- QA lane runs its own vite on :5174; forge on :5173.

## Open questions for Jon
(none filed this session)

## Carry-over
- TEN-DEEP (stages 1–3 shipped #1137/#1153/#1159) — next stage unknown; check board.
- Demos index now carries deepglass (`public/demos/index.html`).
