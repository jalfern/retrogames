# EMBERWOOD — native (tvOS first, iPhone + iPad too) — Claude pilot (#2402)

A Swift port of `src/games/Emberwood`. One universal app (`Emberwood.xcodeproj`,
target **Emberwood**, bundle `com.jalfern.retrogames.emberwood`) for Apple TV,
iPhone and iPad. The web game is the spec. Same shape as `native/joust-claude`.

## Parity: the golden traces

`Sources/EmberwoodCore/Sim.swift` is a line-for-line port of `sim.js` (plus the
`input.js` pad fold). It is right when it reproduces `public/traces/emberwood-*`
tick for tick: same seed + pads in, every field of the whole sim object out
(`retrogames-trace/v1`, `scripts/lib/trace.mjs`; only `fx` is excluded).

```
./check.sh          # the whole gate (needs swift + node), ~2 min
```

What it runs:
- `genworld.mjs --check`: `WorldData.swift` (base64 JSON of `world.js`) is current.
- `emberwood-trace check`: both goldens, all fields, every tick, plus the
  recorded hashes; then `goldentrace.mjs diff` (the repo's own tool) on the
  Swift port's traces.
- The attract run: `scripts/demo.mjs` plays the web's `bot.js` on
  `createSim(11)` (with its loan) to the Ember Heart, ~11.6k ticks through both
  act-one dungeons and both bosses, and writes the web's per-tick trace; the
  Swift replay must match every field. The same recording is the app's attract.
- WATCH: `Bot.swift` (a line-for-line port of `bot.js`) must emit exactly the
  input `bot.js` emits on every tick: the attract run, seed 18, and every bot
  fuzz run (where pads override it and knock it off the route). Its static
  inputs — the proven route (`proveGame`) and the screen graph — are computed
  from the web code by `genworld.mjs`, so JS key order carries over.
- Fuzz: the bot route with random pad overrides, and random pads started in the
  act-two rooms (`--setup`: Hollow King with and without the vents sealed,
  Cinderhawk, gale runes, gust-pushed blocks, the shop with 900 embers).

On a device: launch with `-selfcheck YES` (the build bundles the goldens). It
replays them **on that hardware** plus the whole attract run against the web's
per-tick hashes, races the WATCH bot against bot.js's recorded answers, and prints MATCH/DIVERGE on screen and to stdout:

```
xcrun devicectl device process launch --device <id> --console com.jalfern.retrogames.emberwood -- -selfcheck YES
```

## Render parity: the diorama against the web's own frames

The stage is `src/games/Emberwood/render.js`, ported line for line onto MiniThree
(RetroKit's three.js subset on Metal; see [`../RetroKit/README.md`](../RetroKit/README.md#minithree-threejs-on-metal)):
`Sources/EmberwoodRender/Render.swift`. It uses the same scene graph, lights, PCF sun shadow,
lantern and torch point lights, billboards tinted by the light probe, shelf
trees and bushes (the .glb models, via MiniThree's GLTFLoader), animated water,
foliage wind, Wyrm tail plates, and the bright → blur → bloom + tilt-shift +
vignette post chain, whose GLSL is hand-ported to MSL. The gate checks it pixel by pixel:

```
scripts/parity.sh          # native frames vs the committed web frames (also step 6 of ./check.sh)
scripts/parity.sh --web    # first recapture parity/web from render.js in Chrome (after a render.js/art change)
```

- **The moments** (`parity/scenes.json`): the town, Fern Hollow (water, tall
  grass, trees), a dark dungeon, the Cinder Wyrm (tail plates), Ashfell Ascent
  and the Hollow King (braziers, vents).
  - Each one is `createSim(11)` → `spawnRoom` → N idle ticks. The sim is tick-exact,
    so both sides hold the same state.
  - Then come 300 renderer syncs at a fixed `t`, which bring the camera ease, canopy fades and
    charge squeeze to rest, then `setFocus(hero)` and one `draw()`.
  - `Math.random` is pinned to 0.5 on both sides, and fx are not fed, so particles and shake stay off.
- **Web half**: `scripts/webframes.mjs` serves the repo with Vite and runs
  render.js itself in system Chrome (headless, GPU WebGL2 through ANGLE/Metal) on a
  960×576 canvas at dpr 1. The canvases land in `parity/web/*.png`, committed with the
  GPU name in `GPU.txt`. The script also paints render.js's own canvases (the npc
  liveries, the sword arc, the push-block) into `App/Art`, so the app ships
  Chrome's pixels for those as well.
- **Native half**: `emberwood-render frames` renders the same moments offscreen
  through EmberwoodRender, and `emberwood-render compare` scores them. It writes a
  heat map and a web | native side-by-side to `parity/diff/`.
- **The metric and why**: the comparison is in 8-bit sRGB.
  - `mean` is the mean |Δ| over all channels.
    It must be ≤ 0.75.
  - `bad` is the share of pixels whose largest channel |Δ| > 24.
    It must be ≤ 0.25 %.
  - `blur` is the mean |Δ| after a 4×4 box average, which forgives sub-pixel edge shifts.
    It must be ≤ 0.5.
  - The port measures mean 0.07, bad 0.01 %, blur 0.05 on the lit rooms and 0.00 on
    the dark ones, so the tolerance only covers rasterisation and MSAA-resolve noise at
    prop edges.
  - The thresholds come from a negative control: swapping two *different* moments
    must fail. The closest pair, two dark rooms, still differs by mean 1.5, bad 3.6 % and
    blur 1.5, so the bar sits between that and the measured port.
  - It is a Mac-side gate (Metal on the Mac, Chrome on the same GPU). The device draws
    the same Metal shaders, and its own check is `-selfcheck` plus the frame rate.

Native beyond the web, tvOS only (`Quality.tv`, never used by the gate):
- The 4×-MSAA scene pass renders at the drawable's own size, which is 3840×2160 on a 4K set. The web caps its buffer at 1280 px.
- The sun's shadow map is 4096² instead of 1024².
- Bloom and blur radii are in uv space, so the look is the web's, just sharper.

Measured on Apple TV 4K (3rd gen, Main Bedroom), with the Debug build and 3840×2160 output:
- It holds 59.9 fps in the attract run, the town and the Hollow King's room.
- GPU time is about 15.5 ms of the 16.7 ms frame, so there is little headroom.
  If a later room drops frames, the first lever is the 4096² shadow map, then the buffer cap.

Other test hooks: `-start 1` starts a new game, `-continue YES` loads the save,
`-room <id>` starts in that room with the act-two kit lent (screenshots),
`-perf YES` prints fps, sim steps per frame, worst frame, sim cost, the 3D frame's
CPU and GPU time and the drawable/buffer size every 2 s.

Porting rules that kept the traces green:
- `Math.hypot` is V8's (divide by max, Kahan sum, sqrt, scale) — `jsHypot`.
  Darwin's `hypot` rounds differently and every mover normalizes with it.
- JS `for…of` visits elements pushed during the loop (pod splits, king
  summons): iterate by index against a live `count`, never `for e in array`.
- Keys JS adds later stay optional (`hitSwing`, `roostSet`, `lockAxis`,
  `dirSign`, `moving`, `ventCool`, `flags.elderGifted`): absent until JS adds them.
- `FLAG_BITS` walks `Object.keys(flags)`: `ventsOff` is an object, so its bit is
  always set.
- `Math.round` ties go to +∞ (`jsRound`); the hash is `Math.imul` on Int32.
- `Math.sin/cos` are V8's own: fdlibm as clang compiles it, with fused
  multiply-adds (RetroKit's `jsSin`/`jsCos`). Darwin's libm differs in the
  last place on about 3% of inputs.
- The rules all ports share are in [`../RetroKit/README.md`](../RetroKit/README.md).

## Build and run

```
open Emberwood.xcodeproj
xcodebuild -scheme Emberwood -destination 'platform=tvOS,id=<udid>' -derivedDataPath .build/xc -allowProvisioningUpdates build
xcrun devicectl device install app --device <udid> .build/xc/Build/Products/Debug-appletvos/Emberwood.app
```

Team LD5J9B949R, automatic signing. Run device builds in the background (an
interrupted build orphans the keychain dialog). Scene lifecycle is mandatory
on the 27 SDKs.

## Layout

- [`../RetroKit`](../RetroKit/README.md): what the ports share — JS math
  (`jsHypot`, `jsRound`, V8's sin/cos), the trace codec and recording reader,
  the Synth engine, seat Controls and the selfcheck runner. SwiftPM and the
  Xcode project both use it as a local package.
- `Sources/EmberwoodCore/`: sim, world, pad fold, trace fold (`flatten`), demo replay,
  save/continue. No UIKit; SwiftPM builds it for the Mac CLI and the Xcode
  target compiles the same folder (synchronized group).
- `Sources/emberwood-trace/`: the Mac CLI (`check`, `trace`, `demo`).
- `Sources/EmberwoodRender/`: render.js on MiniThree. The app compiles the same
  folder, and in the app's single module render.js's `FX()` helper is `MX()`.
- `Sources/emberwood-render/`: the render-parity CLI (`frames`, `compare`).
- `parity/`: the scripted moments and the committed web frames.
- `App/`: the shell.
  - `GameViewController`: SpriteKit scene (transparent, over the diorama), modes,
    60 Hz fixed step, HUD, shop/message/death/win overlays, autosave, selfcheck.
  - `Diorama`: the MTKView host for the stage. GameScene drives it from its own update
    (sync → setFocus → draw), so sim, 3D frame and HUD share one clock.
  - `HudArt`: SpriteKit textures and colours for the HUD icons.
  - `Synth`: the fx→sound map and the vale/deep/ashfell beds with dum/tek
    percussion, on RetroKit's `SynthEngine` (ducking, the combat-heat tempo).
  - `Controls`: Emberwood's one-seat mapping (controllers, Siri Remote,
    on-screen pad, keyboard) for RetroKit's `Controls`.
  - `Art/`: the web's own `art.js` textures, painted in Chrome by
    `scripts/exportart.mjs` (rerun after an art change).
  - `Resources/emberwood-demo.json`: the recorded attract run + per-tick hashes.
  - `Assets.xcassets`: tvOS parallax icon (back: dusk + treeline, middle:
    embers, front: Ash), top shelf banners, iOS AppIcon — all from App/Art by
    `scripts/icons.py` (the catalog itself is written by RetroKit's
    `scripts/brandassets.py`). Every native port ships icons.
- `scripts/`: `genworld.mjs`, `demo.mjs`, `exportart.mjs`, `icons.py`,
  `webframes.mjs` (the web half of render parity), `parity.sh`.

## Controls

- Gamepad: stick / D-pad walk. A: sword, hold to draw the bow, release to loose.
  B: bomb, hold for the Gale Charm. X (or R1): potion. Menu/Options: pause.
- Siri Remote: rest a thumb toward an edge of the touch surface to walk; click
  is A, Play/Pause is B. The potion lives on the pause screen: Menu, then
  Play/Pause drinks (a long-press can't be it: B-hold is the Gale Charm).
  Menu on the pause screen quits to the title.
- Y / Triangle: WATCH — the bot plays your game on its proven route, borrowing
  the demo kit; any other button takes the reins back and your own items,
  embers and hearts return (world progress it made stays), as on the web.
- Title: A starts, B continues the autosave, Y watches. Pause: A resumes,
  X drinks, B quits to title.
- iPhone/iPad: an on-screen pad (D-pad, A, B, X) while no controller is
  connected; tap starts, the pause button sits top-right. The scene takes the
  screen's shape: on a phone the game block is centred between margins kept
  clear for the pad; on an iPad it fills the width at the top with the pad
  below. A hardware keyboard works as on the web: arrows/WASD, Space/Z, X, C,
  Esc/P. Verified on an iPhone 17 Pro Max (`-selfcheck YES`: all MATCH).

## Deviations from the web shell (sim untouched)

- The stage is render.js itself (see Render parity), so it carries render.js's
  current quirks too. The shelf trees and bushes lie on their sides, because sync()
  sets the wrapper group's `rotation.x = STAND_UP + wind` on top of the prop's own
  stand-up. Tall-grass tiles draw their transparent texels black, because the floor
  Lambert material is opaque. Both look the same on the web. Fix them in render.js,
  then recapture (`scripts/parity.sh --web`) and port the fix.
- HUD, shop, messages and title are SpriteKit text over the diorama, not HTML.
  The HUD columns get a dusk backing.
