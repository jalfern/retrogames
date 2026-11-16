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

Other test hooks: `-start 1` starts a new game, `-continue YES` loads the save,
`-room <id>` starts in that room with the act-two kit lent (screenshots),
`-perf YES` prints fps / sim steps per frame / worst frame / cost every 2 s.
Measured on Apple TV 4K (3rd gen): 59.9 fps, 1.00 steps per frame, under 0.4 ms
of sim + paint per frame, outdoors and in the lit dungeons.

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
  multiply-adds (`FDLibm.swift`, from the Gauntlet port, bit-exact against
  Node on 1M+ inputs). Darwin's libm differs in the last place on about 3% of
  inputs.

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

- `Sources/EmberwoodCore/`: sim, world, pad fold, trace codec, demo replay,
  save/continue. No UIKit; SwiftPM builds it for the Mac CLI and the Xcode
  target compiles the same folder (synchronized group).
- `Sources/emberwood-trace/`: the Mac CLI (`check`, `trace`, `demo`).
- `App/`: the shell.
  - `GameViewController`: SpriteKit scene, modes, 60 Hz fixed step, HUD,
    shop/message/death/win overlays, autosave, selfcheck.
  - `Stage`: the diorama (see below).
  - `Synth`: AudioController voices, the fx→sound map, the vale/deep/ashfell
    beds with dum/tek percussion, ducking and the combat-heat tempo.
  - `Controls`: game controllers, Siri Remote, on-screen pad, keyboard.
  - `Art/`: the web's own `art.js` textures, painted in Chrome by
    `scripts/exportart.mjs` (rerun after an art change).
  - `Resources/emberwood-demo.json`: the recorded attract run + per-tick hashes.
  - `Assets.xcassets`: tvOS parallax icon (back: dusk + treeline, middle:
    embers, front: Ash), top shelf banners, iOS AppIcon — all from App/Art by
    `scripts/icons.py`. Every native port ships icons.
- `scripts/`: `genworld.mjs`, `demo.mjs`, `exportart.mjs`, `icons.py`.

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

- The stage is SpriteKit 2.5D, not three.js: walls are a lit top face over a
  shaded south face, creatures and trees are billboards on soft shadows, and the
  deep rooms are lit by the lantern and torches (SKLightNode). Bloom is
  additive halo sprites (torches, braziers, embers, orbs, the Wyrm's maw, the
  King's core, blasts, kills); no full-screen bloom pass, tilt-shift, real
  shadow maps or 3D shelf props; foliage sway is simpler.
- HUD, shop, messages and title are SpriteKit text, not HTML.
