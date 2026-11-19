# CONTRA — Jon's #1530 commission, staged

Konami's arcade run-and-gun (1987), RETRO bar (docs/ART.md): 384x224 native,
everything generated in code. Filed and built as #2779, one PR per stage:

- **S1 — the jungle** (merged `8b6dd17`): horizontal scroll, 8-way run-and-gun,
  SPREAD capsule, soldiers/turrets/TNT, attract, `contracheck`.
- **S2 — the base** (this): the waterfall vertical section + the boss gate with
  the destructible core — stage 1's real finish.

## What S2 is

Reaching the bolted gate at the end of the jungle drops the hero into the
**waterfall**: a vertical canyon where the camera ratchets up and never comes
back down, the torrent at the bottom of the screen drowns you, and one-way rock
shelves zigzag to the top under gunners firing down. The climb opens on the
**boss gate** — a fortress wall sealing the arena, two cannon emplacements, a
spawn door, and one weak point: the core, armored while its shutter rides, a
red furnace when it opens. Eight hits kill it; the gate comes apart in a chain
of blasts, +5000, STAGE CLEAR.

## Engine notes

- #2782 polish pass (2026-11-19): the world floor is a SHORELINE (sand under
  foot, animated two-tone sea + foam lip to the screen bottom — the
  commission's "water at the bottom edge"); landings kick splash droplets off
  the water line (shell-cosmetic, `c:3/4` particles). Booms carry a `kind`
  on the (unhashed) event — `'tnt'` / `'kill'` / `'death'` — so the shell sizes
  an expanding `drawFireball` per source; turret shots carry `big` for their own
  heavier report; soldiers carry a deterministic `flash` timer for the muzzle.
  The hero's respawn freeze draws a 4-frame `drawDeathTumble` — the sim freeze
  law itself is untouched. Attract copy rotates on WORLD ticks
  (`floor(gs.tick / 150)`), never paint frames — software CI Chrome paints at
  ~16 fps and starved the old paint-counted cycle (contracheck caught it live).
- `sim.js` is the whole truth, pure Node: fixed 60 Hz `step(gs, pad)`.
  Every sim random rides `gs.r` (mulberry32 as an integer state — no
  functions inside `gs`), so snapshot/restore survive JSON and
  seed + pad streams replay hash-identical (`stateHash` = FNV-1a over the
  rounded state; `gs.ev` is the effect stream the shell drains — events are
  deliberately NOT hashed, same law as Joust's `events`).
- **Phases**: `gs.phase` jungle | falls | boss, one sim. The bullet
  despawn/wake bounds are vertical (`camY`) in the falls/boss phases and
  degenerate to S1's behaviour with `camY = 0`. `stateHash` covers
  phase/camY/safe-point/boss so the determinism leg tests the new spine too.
- **Ratchet camera + torrent**: the falls camera sinks only upward — auto-rise
  0.22 px/tick plus the hero pushing it above the anchor line — and drowning
  is feet at `camY + H - 16`. Respawn uses `gs.safe`, the last ground/shelf
  the feet actually touched (arcade checkpoints).
- **Honest climb**: `FALLS_LEDGES` spacing is gated — every hop ≤ 44px rise
  (apex ≈ 48) and ≤ 55px edge gap (~74px of jump travel). The gate checks
  the geometry itself, so a future shelf edit cannot strand the stage.
- **Vertical wake law**: soldiers wake inside `cam + W - 4` AND `camY + H - 4`
  — S1's spawn-shield lesson spans both axes; the harness audits both.
- **The gate**: the wall is scenery in front of the play plane (the arcade's
  2D-plane law: only designated hitboxes register). The core box takes damage
  only while `(coreT % 190) < 120`; rounds on the shut shutter spark and
  bounce. Cannons fire aimed rounds (telegraphed by a flashing muzzle port);
  the door spills runners but never more than `doorCap` live at once.
- **Autopilot S2 lessons** (all honest-percept — screen state only, no
  cheating reads): climb locks its target shelf until it lands there
  (per-tick re-pick flips mid-jump); it leaps at the last moment when its own
  shelf edge runs out (a shelf across a gap is unreachable by walking); flat
  aimed rounds are HOPPED, not out-run — an aimed round only hits the thumb
  that rests, so the boss patrol is a constant zigzag and the runner response
  is to face the charger and shoot through it (back-pedalling points your gun
  the wrong way). `gs.apT/apDir` are advisory autopilot memos: unhashed,
  derived from hashed state, so replays stay identical.
- Audio: every action synthesized via `audioController` (canyon enter sweep,
  drown, cannon thud, core ping, shutter unlock, door clank, the death roar).
- Keyboard: Arrows move + aim all 8 ways (down aims only airborne),
  SPACE/Z or the pad's A jumps, X/C or the pad's B fires. `?` pauses.
  `warpFalls`/`warpBoss` construct phases properly (DEV hooks + DebugKit
  buttons) — no cheat physics.

## Verify

```bash
npm run dev -- --port 5173 --strictPort   # another terminal
npm run contracheck                      # sim core + browser leg
npm run contracheck -- --mutant        # replants spawn-shield + sealed-core, names the harm
CONTRACT_ONLY=contra npm run contractcheck   # the window.__game contract
```

`contracheck` proves: boot · determinism (seed+pads twice, other seed differs) ·
the 8-way law · run/jump/gravity · rifle vs SPREAD counts · capsule→SPREAD and
death→revert · one-hit death + respawn i-frames · barrel chains · the stage
fights back on every seed tested · no spawn shield (both axes) · the gate is a
door not a wall · the torrent drowns · the ratchet never retreats · shelf
one-way + honest-hop geometry · open-core hits and shut-shutter armor · core
destruction ends stage 1 with the bonus · the door caps and the cannons talk ·
**winnable: autopilot clears jungle+falls+boss on seeds 1..12, not cherry-picked** ·
GAME OVER path · attract self-demo · real keys start/run/jump/fire/die/restart ·
live warp + armor law in the browser · zero page errors.

## Honest gaps

- The weapon shelf is thin: SPREAD is the only pickup. The original's MACHINE
  GUN, FIRE BAR and LASER are S3, and the machine-gun audio seam is already
  wired (`fireCool` reads the weapon).
- Enemy roster: runners, ledge gunners and turrets only — the original's
  snipers-in-trees, grenade soldiers and flying pod carriers are S3.
- Co-op: the cabinet is a two-player game; a CPU ally seat (and the second
  keyboard seat per Jon's multiplayer rule) is S4 — the sim takes one hero
  today.
- Residual on what DID ship: the core is the gate's only destructible part
  (the arcade's outer gun emplacements could also take damage); the cascade
  blasts are random around the wall rather than scripted position-by-position;
  the waterfall has one gunner set and one hazard (the rising torrent), while
  the original also put the odd hanging vine/carrier on the way up; soldiers
  carry rifles only, and the capsule flies at one height.
- The arcade loops stage 1 with faster settings after the kill; here the run
  ends at STAGE CLEAR and returns to attract — a looped second pass is S3+
  territory.
