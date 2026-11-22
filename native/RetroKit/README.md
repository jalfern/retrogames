# RetroKit — what every native port shares (#2402)

The native Apple TV / iPhone / iPad ports (`native/joust-claude`,
`native/emberwood-claude`, `native/gauntlet-claude`) are line-for-line Swift
ports of the web games, and the web game is always the spec: a port is right
when it reproduces the golden traces in `public/traces/` tick for tick. The
three ports were built one after another by copying code. RetroKit holds the
pieces they had in common, one copy each. Per-game code (sims, planners,
`flatten()`, art, sound maps, controller mappings) stays in each port.

## What lives here

**`RetroKit`** (pure Swift, Foundation only: the sim cores and the Mac CLIs use it)
- `JSMath.swift`: JavaScript number semantics. `jsRound` (Math.round), `jsFloor`,
  `jsSign`, `jsHypot` (V8's), `toInt32` (`v | 0`), `jsSin` / `jsCos` /
  `jsAtan2`, `jsInt` and the exact `jsToFixed`.
- `FDLibm.swift`: V8's sin / cos / atan / atan2: fdlibm as clang compiles it,
  with fused multiply-adds.
- `Trace.swift`: the `retrogames-trace/v1` codec (spec: `scripts/lib/trace.mjs`).
  It has the `TV` value, the `q()` / `s()` quantizers, `writeTrace` (rows hold
  changes only, fields in JS sort order) and `compare` against a golden. Each
  port keeps its own `flatten()`, because that is where the game's object graph lives.
- `Recording.swift`: `RecordingFile`, the `retrogames-rec/v1` reader, built on
  `JSONDecoder` (see the rules below). Each port folds `RecPad` into its own sim input.
- `Surface.swift`: the 0xAARRGGBB software framebuffer (fill, px, blit, scaled
  and rotated blits, alpha blend) and the 3×5 pixel font (`text5`, `text`,
  `textWidth`, `radial`). Joust (256×224) and Gauntlet (320×240) paint into it.

**`RetroKitApp`** (UIKit-era shell pieces: the apps only)
- `SynthEngine.swift`: the AudioController.js port. It has tone / sweep / noise /
  filtered-noise one-shots, scheduled notes on the 0.16 music bus with ducking,
  dum/tek percussion, a lead+bass(+perc) bed sequencer, and the fanfare and
  death jingles. Each game's `Synth` subclasses it and keeps its own sound map
  and beds. `noteRelease` (0.01 for Joust, 0.02 for the others) and each
  jingle's bus keep every port sounding as it shipped.
- `Controls.swift`: game controllers mapped to seats (1 or 2). Real gamepads come
  first, then the on-screen pad, then the Siri Remote. It handles tvOS Menu
  latching, the iPhone/iPad `GCVirtualController` (it connects only after
  `viewDidAppear`, and never counts as a real gamepad), and edge-detected
  `pressed`. Each game passes a `Controls.Config` with its own gamepad, Remote
  and keyboard mapping (`App/Controls.swift`).
- `SelfCheck.swift`: the `-selfcheck YES` runner. It replays the bundled goldens
  on the device and prints `<GAME> SELFCHECK MATCH|DIVERGE …` to the log, to
  stdout, and to the game's own screen.

**`MiniThree`** (Metal; Foundation + CoreGraphics: the 3D ports and their Mac CLIs)
— the three.js r180 subset the arcade's three.js games use, with three's names
and semantics, so a game's `render.js` ports line for line. Emberwood's
`Sources/EmberwoodRender/Render.swift` is the first port; see "Porting a
three.js game" below.

**`scripts/brandassets.py`**: writes a port's `App/Assets.xcassets` (the tvOS
parallax stack, the two top shelf banners, the iOS AppIcon, and every
`Contents.json`) from three painted layers. Emberwood's and Gauntlet's
`scripts/icons.py` paint the layers from the game's own art and call
`brandassets.build()`. Joust's icons come from its Swift tool
(`tools/make-icons.sh`).

## How the ports use it

- **SwiftPM (the Mac CLI and `./check.sh`)**: each port's `Package.swift` has
  `.package(path: "../RetroKit")`, and its `*Core` target depends on the `RetroKit`
  product. Every core file that uses it says `import RetroKit`.
- **Xcode (the apps)**: each `.xcodeproj` adds RetroKit as a **local Swift
  package** (`XCLocalSwiftPackageReference`, `relativePath = ../RetroKit`) and
  links the `RetroKit` and `RetroKitApp` products into the app target. The app
  target still compiles `Sources/<Game>Core` directly (a synchronized group), so
  those files' `import RetroKit` must resolve in both builds. A local package
  makes that work: it is a real module in both. A synchronized folder of RetroKit
  sources would compile into the app's own module, and every `import RetroKit`
  would then fail. The package needs no network, no pins and no
  `Package.resolved`. `xcodebuild` and device builds resolve it from the
  repo, and it links statically.
- **Optimization**: Xcode builds package code with its own defaults (`-Onone` in
  Debug), whatever the app's settings say. The hot paths are therefore
  `@inlinable`: the math, FDLibm and the Surface drawing calls. They compile
  into the app at the app's optimization level. This matters for Gauntlet,
  whose Debug is `-O` because the framebuffer needs it. The bits are the same
  either way: Swift never fuses `a*b + c` by itself, so only the explicit
  `fma()` calls fuse.

## Porting rules (each one broke a trace before it was a rule)

- **V8's math is fdlibm compiled by clang with `-ffp-contract=on`.** Every
  `a*b + c` inside one expression becomes a fused multiply-add, with the
  left-hand product fused first. `FDLibm.swift` ports sin, cos, atan2 and the
  π/2 reduction that way. Plain fdlibm misses V8 on about 0.4% of sin/cos
  inputs. Darwin's libm misses on about 3% (sin) to 18% (atan2). Always call
  `jsSin` / `jsCos` / `jsAtan2`, never `sin` / `cos` / `atan2`.
  `gauntlet-trace math` fuzzes them against Node on 300k inputs each.
- **`Math.hypot` is V8's** (divide by the max, Kahan sum, sqrt, scale): use
  `jsHypot`. Darwin's `hypot` rounds differently, and every mover normalizes with it.
- **`Math.round` ties go toward +∞**: use `jsRound`. Swift's `.rounded()` goes
  away from zero. Hashes use ToInt32 / `Math.imul` (`toInt32`, `&*` on `Int32`).
- **`toFixed` rounds the double's exact value**: use `jsToFixed`. It works on the exact
  decimal expansion, with ties going away from zero. printf breaks ties to even,
  and `x*1000` invents false ties (2.545 is stored as 2.54499…).
- **Read recordings with `JSONDecoder`, never `JSONSerialization`.** The latter
  isn't correctly rounded: it reads 0.021500000000000002 as 0.0215, and
  Gauntlet's aim lane is 17-digit doubles. `RecordingFile` does this. (Golden traces
  hold quantized integers, so `compare` may use either.)
- **JS `for…of` semantics.** Over an array that the loop body **reassigns**, JS
  keeps walking the old array, and iterating a Swift value copy does the same
  (Gauntlet's `gs.monsters`). Over an array that the body **pushes onto**, JS also
  visits the new elements: iterate by index against a live `count`
  (Emberwood's pod splits and king summons).
- **Keys JS adds later stay optional.** A field JS hasn't set yet is absent
  from the trace, not `null` or `0`. Examples: Emberwood's `hitSwing`,
  `roostSet`, `moving` and `flags.elderGifted`; Gauntlet's `door.hits`,
  `shot.done` and `heroHpOverride`; Joust's `segs.N.crumble`. Model such a key as a Swift
  optional, and have `flatten()` write the key only when it is set.
- **Keep operand order.** `(vx + ax) * dragX` rounds the way JS does only if it
  is written the same way. Integers stay `Int`; positions stay `Double`.

## Starting a new port

1. `Package.swift`: depend on `../RetroKit`. Write `flatten()` + the recording
   fold + `replay()` in `Sources/<Game>Core/Trace.swift`, and a `<game>-trace check` CLI.
2. In the `.xcodeproj`: add the local package and link both products. Add a
   build phase that copies `public/traces/<game>-*.json` into `<app>/traces`.
   Call `SelfCheck.startIfAsked` from the launch hooks.
3. `App/Synth.swift` subclasses `SynthEngine`, and `App/Controls.swift` builds a
   `Controls.Config`. Icons come from the game's art via `brandassets.build()`.

## MiniThree: three.js on Metal

What it supports (and nothing else yet):

| three.js | MiniThree | notes |
|---|---|---|
| `Object3D`, `Group`, `Scene`, `Mesh` | same | position / quaternion / rotation (XYZ, kept in step) / scale, `lookAt`, `rotateZ`, `traverse`, `clone(true)` (shares geometry + material), `visible`, `castShadow`, `receiveShadow`, `renderOrder` |
| `OrthographicCamera`, `PerspectiveCamera` | same | `updateProjectionMatrix`; `Vector3.project(camera)` uses three's WebGL clip space |
| `BufferGeometry`, `PlaneGeometry`, `BoxGeometry` | same | the generators emit three's vertex/uv order exactly (box faces sample like three's) |
| `MeshBasicMaterial`, `MeshLambertMaterial`, `MeshStandardMaterial` | same | map, color, opacity, transparent, alphaTest, depthWrite/Test, side, vertexColors, emissive; Standard = three's GGX (no env maps) |
| `HemisphereLight`, `DirectionalLight` (+ PCF shadow), `PointLight`, `AmbientLight` | same | physically-correct units (r155+), view-space light uniforms |
| `Fog`, `FogExp2` | `Fog`, `FogExp2` (`scene.fog` / `scene.fogExp2`) | |
| `Texture` / `CanvasTexture` | same | Nearest/Linear, wrap clamp/repeat/mirrored, offset/repeat/rotation/center (three's uvTransform), sRGB colorSpace, flipY |
| `Sprite`, `Points`, `Line`, `LineSegments`, `InstancedMesh` | same | 1-px lines, as WebGL |
| `WebGLRenderTarget` + `ShaderMaterial` | same | MSAA `samples`, sRGB targets; ShaderMaterial bodies are GLSL hand-ported to MSL (see below) |
| ACES filmic + sRGB output | `toneMapping = .acesFilmic`, `outputColorSpace = .srgb` | applied to the canvas only, as three does |
| `GLTFLoader` (.glb) | `GLTFLoader.load(url:)` | static meshes, TRS/matrix nodes, baseColor factor/texture, COLOR_0, doubleSided, alpha modes |

The renderer is `WebGLRenderer` (on Metal). It keeps the three behaviours that change pixels:
- **Render lists.** Opaque objects are sorted by (renderOrder, material.id, z, id), and transparent ones back to front by (renderOrder, −z, id). Creation order therefore matters: create objects in the order render.js does.
- **Output.** A render target gets *linear* output and no tone mapping. Only the canvas (`setRenderTarget(nil)`) gets the tone mapping and the sRGB OETF, and the clear colour follows the same rule. sRGB targets and textures use `*_srgb` formats, so the hardware encodes on write, decodes on read and blends in linear, as `SRGB8_ALPHA8` does in WebGL2.
- **Shadows.** The shadow pass draws casters' opposite faces (`shadowSide`), and PCF is three's 17-tap kernel. Objects with a negative determinant (a mirrored `scale.x`) flip their front face.
- **Blending and depth.** Blending is three's straight-alpha `NormalBlending` / `AdditiveBlending`, and the depth function is LessEqual.
- **Shader math.** The shader chunks are hand-ported, and each function in `Shaders.swift` names the chunk it comes from. Keep them in step with `node_modules/three/src/renderers/shaders/ShaderChunk`.

ShaderMaterial bodies are GLSL-shaped MSL. A body sees `vUv` (WebGL convention: v = 0 at the bottom), `texture2D(tName, uv)`, `vec2`/`vec3`/`vec4` and every uniform by its own name, and it ends with `return vec4(...)` instead of `gl_FragColor = ...`. The body can't declare functions, so inline them, as Emberwood's composite does with `lin2srgb`. The vertex stage is the post-pass one: `gl_Position = vec4(position.xy, 0., 1.)`.

The host hands the renderer a canvas each frame: `setCanvas(drawable.texture)`, then `render(...)`, then `present(drawable)`. Use a non-sRGB pixel format, because the shader encodes, like the web canvas. Offscreen (Mac CLI) use is `makeOffscreenCanvas`, then `finish()`, then `readPixels`.

### Porting a three.js game

1. Add a `Sources/<Game>Render` target that depends on `MiniThree` (and your sim core). In Xcode, add it as a synchronized group and link the `MiniThree` product.
   - In SwiftPM, write `#if canImport(<Game>Core) import <Game>Core #endif`. In the app everything is one module.
   - Rename any render.js helper that collides with a sim type. Emberwood's `FX()` became `MX()`.
2. Port `render.js` top to bottom.
   - Keep its creation order and its numbers.
   - `new THREE.X(...)` becomes `X(...)`, and `color.set('#hex')` stays the same.
   - Swap `Math.random` for an injectable `random` and `Math.sin`/`hypot` for RetroKit's `jsSin`/`jsHypot`.
   - Textures come from the game's own Chrome-painted art (`exportart.mjs` → `App/Art`). A canvas painted inside render.js gets exported by the web-frames script, not repainted in Swift.
3. Give it a parity gate like Emberwood's (`native/emberwood-claude/parity/`, README "Render parity"):
   - A JSON of scripted moments.
   - A script that runs the game's own render.js in Chrome and saves the canvases.
   - A CLI that renders the same moments offscreen and runs `compare`. Pin `Math.random`, and sync until eased values are at rest.
4. Only then add native-only quality (drawable-sized buffers, bigger shadow maps), behind a switch the gate never uses.

Not yet ported (add when a game needs them, with a parity moment): spot lights, point-light shadows, env maps / IBL, normal/roughness/AO maps, skinning and morphs, `MeshPhong`, `CubeTexture`, VSM / PCFSoft, frustum culling (all objects draw), and `ShaderMaterial` on scene meshes (post passes only today).

## TestFlight (#2443)

`native/testflight.sh` archives a port for iOS and tvOS and uploads both builds to
TestFlight. Run it on studio: `native/testflight.sh joust`, `… all`, or `… --changed`.
The launchd agent `com.jalfern.native-testflight` (set up by `--install`) runs `--changed`
every 30 minutes. It ships only the ports whose `native/<port>-claude` or `native/RetroKit`
changed on origin/main since the last upload (`~/Library/Developer/retrogames-testflight/last-uploaded`).
Logs: `~/Library/Logs/native-testflight.log`, plus one log per build next to the archives.

- **App records**: "Joust · RetroGames", "Emberwood-retrogames" and "Gauntlet-Retrogames"
  (`com.jalfern.retrogames.<port>`), each a universal iOS + tvOS app. Each has an internal
  group "Jon" with access to all builds, so every processed build reaches Jon's devices.
  Apple's API can't create app records, so a new port needs its record made at
  appstoreconnect.apple.com first.
- **Build number**: the commit's UTC time, `YYYYMMDD.HHMM`. App Store Connect shows it
  without leading zeros (`20261122.17`). The version comes from `MARKETING_VERSION`.
- **Signing**: archives use the API key (App Manager). Export and upload use the Apple ID
  signed in to Xcode → Settings → Accounts, because that key may not use cloud distribution
  signing. "No Accounts" in a build log means Xcode on studio is signed out.
- `ITSAppUsesNonExemptEncryption = NO` in each Info.plist means no export-compliance prompt.
- External testers need Beta App Review on the first build of each version. Builds
  expire after 90 days.
