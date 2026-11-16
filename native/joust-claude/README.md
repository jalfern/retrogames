# JOUST — native (tvOS first, iPhone + iPad too) — Claude pilot (#2402)

A Swift port of `src/games/Joust`. One universal UIKit app (`Joust.xcodeproj`,
target **Joust**, bundle `com.jalfern.retrogames.joust`) that builds for Apple TV,
iPhone and iPad. The web game is the spec.

## Parity: the golden traces

`Sources/JoustCore/Sim.swift` is a line-for-line port of `sim.js` (and
`Planner.swift` of `planner.js`). It is right when it reproduces the golden
traces in `public/traces/` tick for tick: same pads in, same state out, every
field (`retrogames-trace/v1`, `scripts/lib/trace.mjs`).

```
./check.sh          # the whole gate (needs swift + node)
```

What it runs:
- `swift run joust-trace check ../../public/traces` replays each `joust-*.json`
  recording through the Swift sim and compares all fields at every tick to its
  `.trace.json`, plus the recorded state hashes.
- `joust-trace trace <rec> <out>`, then `node scripts/goldentrace.mjs diff`.
  This is the repo's own diff tool, run on the Swift port's trace.
- `scripts/autopilot.mjs` against `joust-trace autopilot`: the web sim +
  planner and the Swift sim + planner race each other, with no recording, on
  fuzzed pads, later start waves, and idle runs. The hash streams must be
  byte-equal. This reaches waves 3–5, hunters, shadows and crumbling ledges,
  which the 1300-tick goldens don't.

On a device: launch with `-selfcheck YES` (the build bundles the goldens).
The app replays them **on that hardware** and prints MATCH/DIVERGE lines on
screen and to stdout:

```
xcrun devicectl device process launch --device <id> --console com.jalfern.retrogames.joust -- -selfcheck YES
```

Other test hooks: `-start 1|2` jumps into a game, and `-watch YES` hands it to the autopilot.

Porting rules that keep the traces green:
- Keep operand order. `(vx + ax) * dragX` and `ax += sin(a) * thrust * thrustX`
  round the way JS does only if written the same way.
- Integers stay `Int` (`deadT`, `invuln`, `sitT`, timers); positions stay `Double`.
- JS `Math.round` is not Swift's `.rounded()`. JS rounds ties toward +∞; use
  `jsRound`. The hash uses ToInt32/`Math.imul` (`&*` on `Int32`).
- `Math.sin/cos` are V8's own: fdlibm as clang compiles it, with fused
  multiply-adds (`FDLibm.swift`, from the Gauntlet port). It is bit-exact
  against Node on 1M+ inputs. Darwin's libm differs in the last place on
  about 3% of inputs. Joust's traces never caught it, but Gauntlet's planner
  race did.
- Trace quirks: a missing path equals `null`, an empty array is `[]`, `pending`
  is `null` or `{reason, t}`, and `segs.N.crumble` exists only on crumble ledges.

## Build and run

```
open Joust.xcodeproj                       # pick Apple TV / iPhone / iPad
xcodebuild -scheme Joust -destination 'platform=tvOS,id=<udid>' -allowProvisioningUpdates build
xcrun devicectl device install app --device <udid> .build/xc/Build/Products/Debug-appletvos/Joust.app
```

Team LD5J9B949R, automatic signing. The first device build asks for keychain
access to the Apple Development key; run builds in the background, because
interrupting the build orphans that dialog. The scene lifecycle is mandatory
on the 27 SDKs (a no-scene app traps at launch).

## Layout

- `Sources/JoustCore/`: the sim, waves, planner and trace codec. It has no UIKit.
  SwiftPM (`Package.swift`) builds it for the Mac CLI, and the Xcode target
  compiles the same folder directly (a synchronized group).
- `Sources/joust-trace/`: the Mac CLI (`check`, `trace`, `autopilot`).
- `App/`: the shell.
  - `GameViewController`: screens, 60 Hz fixed step, paint, events.
  - `Art`: art.js in a 256×224 software framebuffer, scaled with nearest-neighbour.
  - `Synth`: the AudioController voices + sounds.js recipes + the march.
  - `Controls`: game controllers.
- `scripts/autopilot.mjs`: the web side of the autopilot race.

## Controls

- Seat 1 = the first controller, seat 2 = the second. With no gamepad, the Siri
  Remote drives seat 1: touch surface to turn, click to flap.
- Flap: A, X, D-pad up or right trigger. Turn: stick or D-pad.
- Y: WATCH (the autopilot rides). Any button takes the reins back.
- Menu/Options: pause. B: back.
- Title screen: A = one rider. Controller 2's A, or X with two controllers = two riders.
- iPhone/iPad: an on-screen pad (GCVirtualController) shows while no controller
  is connected, and a tap starts. iPhone is landscape-only: the game fills the
  height and the stick and buttons sit in the side margins. The pad must
  connect after the view is on screen (`viewDidAppear`), and it must never count
  as a "real" controller, or its own connect event makes it disconnect itself. A hardware keyboard works as on the web:
  arrows + Space/X; A/D + W/F for rider 2.

## Icons

`tools/make-icons.sh` paints every icon with the game's own art code
(`App/Art.swift`) and writes `App/Assets.xcassets`:
- the iOS 1024² icon;
- the tvOS layered parallax icon (Back: sky, lava, ledges, hand; Front: the rider);
- the Top Shelf and Top Shelf Wide banners.

`ASSETCATALOG_COMPILER_APPICON_NAME[sdk=appletv*]` picks the brand asset on tvOS.

## Deviations from the web shell (sim untouched)

- Overlays (title, game over, pause) are drawn in the pixel font instead of
  HTML, and the copy is for controllers.
- The pixel font adds `+ / , ·`. The web canvas font has no `+`, so its
  popups read " 200".
- Like the web build, the march stops for good at the first wave-clear fanfare.
  That's kept on purpose; it's worth a look in the web game too.
