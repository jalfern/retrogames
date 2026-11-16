# GAUNTLET — native (tvOS first, iPhone + iPad too) — Claude pilot (#2402)

A Swift port of `src/games/Gauntlet` (the overhead cabinet). One universal app
(`Gauntlet.xcodeproj`, target **Gauntlet**, bundle
`com.jalfern.retrogames.gauntlet`) for Apple TV, iPhone and iPad, in the same
shape as `native/joust-claude` and `native/emberwood-claude`. The web game is
the spec. Two heroes on one screen: a second controller is player 2, or a CPU
partner takes seat 2.

## Parity: the golden traces

`Sources/GauntletCore/Sim.swift` is a line-for-line port of `sim.js`, and
`Planner.swift` of `planner.js` (the pilot `decide` + the CPU partner seat
`partnerPad`). It is right when it reproduces `public/traces/gauntlet-*` tick
for tick: the same seed and pads give the same state, every field of the whole
game object (`retrogames-trace/v1`; `events` and the static `levelData` are
excluded, see the Gauntlet README). The pad lane is the one Gauntlet
recordings already use (`plaicraft-export.mjs`: `newGame`, `heroFromPad` with
the planner's aim on `ax/ay`, `p2FromPad`).

```
./check.sh          # the whole gate (needs swift + node), ~10 min
```

What it runs:
- `genlevels.mjs --check`: `LevelData.swift` (base64 JSON of `levels.js`, the
  camera constants, and art.js's `SPRITE_DATA` + `MATERIALS`) is current.
- `gauntlet-trace math`: `Math.sin`/`cos`/`atan2` and `toFixed`, bit for bit
  against V8 on 300k inputs each.
- `gauntlet-trace check`: all three goldens, every field, every tick, plus the
  recorded hashes. Then `goldentrace.mjs diff` (the repo's own tool) is run on
  the Swift port's traces.
- Races (`scripts/race.mjs`): the web planner drives the web sim through the
  halls, 1P and with the CPU partner, clean and with fuzzed pad overrides.
  The Swift sim must match every field every tick, and the Swift pilot and
  partner must emit exactly the pad `planner.js` emitted, aim doubles
  included. Beyond the gate, the whole quest has been raced to the win on
  seeds 1, 7, 13 and 21 (1P and 2P, 9–11k ticks each), plus five fuzzed runs:
  every field, every tick, every planner answer matched.

On a device: launch with `-selfcheck YES`. The build bundles the goldens and
replays them **on that hardware**. It also races the planner against the 1P
and 2P goldens, whose pads are `planner.js`'s own answers. Results print as
MATCH/DIVERGE on screen and to stdout:

```
xcrun devicectl device process launch --device <id> --console com.jalfern.retrogames.gauntlet -- -selfcheck YES
```

Other hooks: `-start 1|2` starts a game (2 = with the CPU partner),
`-watch YES` hands seat 1 to the pilot, and `-perf YES` prints fps and sim
steps per frame.

Porting rules that kept the traces green (all three bit us before they were rules):
- **V8's math is fdlibm compiled by clang with `-ffp-contract=on`.** Every
  `a*b + c` inside one expression is a fused multiply-add, and clang fuses the
  left-hand product first. `FDLibm.swift` ports sin, cos, atan2 and the π/2
  reduction that way. Plain fdlibm misses V8 on about 0.4% of sin/cos inputs,
  and Darwin's libm misses on about 3% (sin) to 18% (atan2). The pilot's aim
  and every 8-way step go through these functions.
- **`toFixed` rounds the double's exact value.** It works from the exact
  decimal expansion, ties going away from zero; printf breaks ties to even,
  and `x*1000` invents false ties (2.545 is stored as 2.54499…). The state
  hash is built from toFixed strings.
- **Read recordings with `JSONDecoder`, not `JSONSerialization`.** The latter
  isn't correctly rounded (it reads 0.021500000000000002 as 0.0215), and the
  aim lane is 17-digit doubles.
- JS `for…of` over `gs.monsters` keeps walking the OLD array when a kill
  reassigns it. Iterating a Swift value copy does the same.
- Keys JS adds later stay optional: `door.hits`, `item.taken`, `shot.done`
  (an early `return` in updateShots leaves done shots in that tick's state),
  `partner.stunT`, `partnerDone`, and `heroHpOverride` (absent, then `null`).

## Build and run

```
open Gauntlet.xcodeproj
xcodebuild -scheme Gauntlet -destination 'platform=tvOS,id=<udid>' -derivedDataPath .build/xc -allowProvisioningUpdates build
xcrun devicectl device install app --device <udid> .build/xc/Build/Products/Debug-appletvos/Gauntlet.app
```

Team LD5J9B949R, automatic signing. Run device builds in the background,
since an interrupted build orphans the keychain dialog. Debug builds use `-O`:
the software framebuffer and the on-device selfcheck need optimized code (60 fps,
1.00 sim step per frame measured).

## Layout

- `Sources/GauntletCore/`: the sim, the planner, the halls (generated), the
  V8 math, and the trace codec and races. No UIKit. SwiftPM builds it for the
  Mac CLI, and the Xcode target compiles the same folder.
- `Sources/gauntlet-trace/`: the Mac CLI (`check`, `trace`, `race`, `math`, `parts`).
- `App/`: the shell.
  - `GameViewController`: attract, hero select, play, pause and over; two
    seats, WATCH, the event sounds and narrator, the selfcheck.
  - `View`: the cabinet view, ported from `index.jsx`'s drawView, drawPanel
    and draw onto a 320×240 framebuffer. That covers the torch-lit two-tone
    brick courses, floor grain, doors, stairs, warp arches, teleport swirls,
    stun and trap floors, pulsing generators, the facing dagger and
    sword-arc trail, the vignette, low-HP throb and Death's flush, the
    explored map, portraits and the HUD band.
  - `Sprites`: art.js `punch()`, the pixel strings from SPRITE_DATA plus white
    hit-flash silhouettes.
  - `Surface`: the framebuffer and 3×5 font from the Joust port.
  - `Synth`: AudioController voices, the event sounds and sound.js's narrator buzzes.
  - `Controls`: two seats (controllers, Siri Remote, on-screen pad, keyboard).
  - `Assets.xcassets`: the tvOS parallax icon, the top shelf and the iOS
    AppIcon, built from the game's own sprites by `scripts/icons.py`.
- `scripts/`: `genlevels.mjs`, `race.mjs`, `mathfuzz.mjs`, `icons.py`.

## Controls

- Stick or D-pad: walk 8 ways (facing follows). A (Cross): sword. B (Circle): arrow.
- Y (Triangle): WATCH, where the pilot plays your seat; any other button takes
  it back. Menu/Options pauses: A resumes, B quits to the title.
- Hero select: left/right picks a hero. A second controller presses A to join
  as player 2 and picks its own hero (B leaves). X seats or removes the CPU
  partner.
- Siri Remote (no gamepad): rest a thumb toward an edge of the touch surface to
  walk. Click is the sword, Play/Pause the arrow.
- iPhone/iPad: an on-screen stick plus A/B/Y while no controller is connected;
  tap starts. Keyboard as on the web: arrows + Space/Z for P1, WASD + F for P2.

## Deviations from the web shell (sim untouched)

- **Attract:** it runs the planner with the CPU partner on a fresh seed each
  lap, which is the web's fallback demo. The web's primary demo is the trained
  PLAICRAFT net (`model.js` + `policy.js`), and that is not ported yet.
- **Not here:** online play (the web's net rooms) and voice calls to the
  partner (`applyCall`). With no call, the partner seat behaves exactly as the
  web's does.
- **Drawing:** text uses the 3×5 pixel font rather than canvas monospace, and
  canvas glows (`shadowBlur`) become flat halos.
