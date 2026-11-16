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
