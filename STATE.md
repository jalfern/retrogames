# STATE — session 25 (2026-10-25)

## Shipped this session
- **IRON RING (#1095 → PR #1098, squashed to main as 365911e)**: original 1v1
  fighter in the SFII spirit, MODERN bar, own IP throughout. Live at
  jalfern.com/retrogames/iron-ring.
  - **Shared fighting core** `src/engine/fighting.js` (new `src/engine/`):
    state machine (idle/crouch/jump/attack/blockstun/hitstun/launched/down/
    getup/win), frame data, hitbox/hurtbox, block rules (back-hold; lows need
    crouch-block; throws beat block; heavy-chip never KOs), hitstop, cancels
    (combo), forgiving facing-relative motion parser, charge, projectiles,
    best-of-N rounds, tiered CPU that emits PAD FRAMES through the same motion
    parser humans use (no cheating). #1096 reuses it as pure roster data.
  - Roster 6: KADE/VEXA/BRAKK/SABLE/HYDE/TESSA (build, palette, reach, hp,
    qcf/dp/charge specials, EX@50 / super auto@100 — phone-friendly). Ladder
    VEXA easy → KADE insane. 3 stages, SSIV camera (midpoint + zoom-by-dist),
    live crowd/flags/neon, box-rig humanoids posed per state, shelf props.
  - Modes: ladder (phone pad A/B + dir specials), local 2P (P1 arrows+JKUI,
    P2 WASD+FGBV), net over #1039 lobby: 8-tick pad lockstep, hash-every-30;
    wire carries 8 verbs so the 6-bit lockstep normalizer is bypassed with a
    hand-rolled mirror.
  - `ironringcheck` 33 gates green + proven-fail mutant (dead hitbox gate =
    zero damage); contractcheck 14/14; build green.

## Playable now
- jalfern.com/retrogames/iron-ring — tap start, pick a fighter, fight the ladder.

## Branches / harness
- `forge/iron-ring` deleted by squash. Worktree `~/Dev/retrogames-forge-iron-ring`
  removable (its node_modules is a symlink to the main checkout).
- QA filed: **#1103** IRON RING polish pass (multi-hit specials, special→super
  cancels, guard crush/stun, stage midground variety, KO slow-mo, victory
  quotes, bloom/DOF, select sfx, stage ambience, continue screen).
- #1096 (MK-style fighter on the shared engine) still queued `next` — untouched,
  that's the natural next claim.

## Lessons learned
- Roster data with `cpu` tiers silently hijacks human seats — every code path
  that puts a def on a human seat must clone with `cpu:false`.
- A keyboard tap (<16ms) can fall between two 60 fps polls: latch every keydown
  into the next sampled pad, or browser punches vanish while Node punches hit.
- `blockHeld` must include the crouch state, or crouch-blocking (lows) is
  impossible — and it fails silently with only real distance inputs.
- Motion buffer timestamps must be absolute frames; "elapsed since push" breaks
  subsequence window/gap checks in ways that look like motion detection failure.
- KO must flow through the damage path (`resolveHit`); an exported `forceKO`
  seam keeps harnesses honest about the rest.

## Open questions
- none filed this session.
