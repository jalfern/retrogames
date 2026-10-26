# STATE — session 26 (2026-10-26)

## Shipped this session
- **VIPER PIT (#1096 → PR #1105, squashed to main as e39ea51)**: original
  gritty 1v1 fighter in the MK spirit, MODERN bar, own IP throughout. Live at
  jalfern.com/retrogames/viper-pit.
  - **Engine extensions (#1096 options, IRON RING bit-identical —
    ironringcheck still 25/25)** in `src/engine/fighting.js`: `guardButton`
    mode (dedicated `pad.bk` verb; back-walking never blocks; GUARD+DOWN =
    low block), `qcbf` motion (↓←↓→, checked BEFORE qcf so its d,f tail can't
    be stolen), move-level `finisher`/`finishAt` (clean hit on ≤30 HP ends the
    round with the FINISH! banner + `finish` event), projectile `vy/grav`
    (arcing kicks), CPU guards and attempts finishers through pad scripts.
  - Roster 5: NYX/CINDER/VESS/RIV/KRAX — each with a launching uppercut
    (dp launch ≥0.125) and a NAMED signature finisher (SHADOW STITCH,
    BONFIRE, DRY LAND, NEON PURGE, SCRAP HEAP). Ladder NYX easy → KRAX insane.
  - 3 dark pits (back alley 2 a.m. / foundry / last train): fog, procedural
    asphalt canvas textures, chain-link fence, neon signs, silhouetted crowd
    with phone glow, hanging lamps with volumetric cones + flicker, embers.
    Articulated limb rigs (shoulder/elbow/hip/knee, capsules) — NOT IronRing's
    boxes; SSIV camera + handheld shake; GUARD on-screen button on phone.
  - Modes: ladder (pad+A/B+GUARD), local 2P (P1 arrows+JKUI+O, P2 WASD+FGBV+H),
    net over #1039 lobby: 9-verb pad wire, hash-every-30.
  - `viperpitcheck` 36 gates green + proven-fail mutant (guard gate removed =
    heavies smash through GUARD); contractcheck 14/14; lint gates + build green.

## Playable now
- jalfern.com/retrogames/viper-pit — tap start, pick a fighter, hold GUARD,
  earn the bar, ↓←↓→+punch to FINISH.

## Branches / harness
- `forge/viper-pit` deleted by squash. Worktree `~/Dev/retrogames-forge-viper-pit`
  removable (node_modules is a symlink to the main checkout).
- QA filed: **#1106** VIPER PIT polish pass (finisher cinematics, juggle rules,
  stage life/ambience, directional hit reactions, HUD+KO juice, portrait
  select, guard feedback, per-fighter audio).
- Queue: **#1099** PLATFORM — help/title screens overflow on small screens
  (oldest `game-queue`; the natural next claim).

## Lessons learned
- Pressing UP jumps BEFORE the attack check in the idle branch: a dp/uppercut
  script must send `up + button` on ONE frame — a standalone `up` frame jumps
  and the move degrades to the air kick. (Test scripts, humans and the CPU all
  need this; it bites identically in IRON RING.)
- A qcbf-style motion (d,b,d,f) contains a qcf (d,f) subsequence inside the
  parser window — check the longer motion FIRST in tryStartSpecial.
- A finisher must never KO a healthy opponent: gate on `def.hp <= finishAt`
  inside `resolveHit`, keep the plain KO path untouched; harness proves both
  branches.
- Back-walk-block vs guard-button is an engine-level option, not a per-game
  hack: one `guardButton` flag keeps both titles' sims hash-verifiable.

## Open questions
- none filed this session.
