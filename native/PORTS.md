# Native ports: what's ported, what's wanted, and the rules

The native Apple ports (tvOS first, iPhone and iPad too) are an offshoot of the forge, not forge work.

## The loop

1. **Jon picks** which games get ported (the "Wanted" table below).
2. **Claude ports them** in sessions on the studio (Swift, `native/RetroKit`, the golden traces). Forge lanes never
   take port work.
3. **Jon does the Apple side**: the App Store Connect app record and the internal tester group "Jon". Claude
   registers the bundle ID and does signing and uploads.
4. **It goes live**: `native/testflight.sh --changed` uploads to TestFlight every 30 min on the studio.
5. **The forge keeps improving the web game.** Every merge to main that touches a ported game's web code
   files (or updates) one `native-sync` issue for that port (`.github/workflows/native-sync.yml`). Those issues
   carry `lane:manual`, so forge lanes and the warden leave them alone. Claude works through them in studio
   sessions, oldest first.

## Rules

- **The web game is the spec for gameplay.** A port's sim reproduces the golden traces in `public/traces/` tick for
  tick. A web PR that changes a ported game's behaviour turns `goldentracecheck` red; updating the trace is a
  deliberate step, and the port follows in its `native-sync` issue.
- **Ports may look better than the web game.** Graphics, effects, resolution and frame rate can improve
  natively; gameplay, timing and controls can't change. A render-parity check (like Emberwood's step 6) guards that
  nothing visible goes missing; when a port deliberately improves a look, that port's parity scenes are updated in
  the same PR to say so.
- Every port runs its `native/<port>/check.sh` before a PR that touches it.

## Ported

| Game | Web source | Native | Notes |
|---|---|---|---|
| Joust | `src/games/Joust` | `native/joust-claude` | |
| Emberwood | `src/games/Emberwood` | `native/emberwood-claude` | MiniThree (three.js subset on Metal) |
| Gauntlet | `src/games/Gauntlet` | `native/gauntlet-claude` | |

## Wanted (Jon, 2026-11-24)

| Game | Web source | Notes |
|---|---|---|
| SSX | `src/games/SSX` | true 3D (three.js); reuses MiniThree |
| Comet Drift HD | `src/games/CometDriftHD` + `src/games/CometDrift` | HD draws Comet Drift's sim in three.js (WebGPU + post); traces pin the shared sim |
| Tetris | `src/games/Tetris` | small, quick |

When a wanted game ships, move its row to "Ported" (the sync workflow reads that table).
