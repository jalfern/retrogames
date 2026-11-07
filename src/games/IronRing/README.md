# IRON RING (#1095)

An original one-on-one fighting game in the spirit of the 1991 arcade classic that
defined the genre — original IP throughout: names, roster, stages, moves, look.
MODERN bar: low-poly 3D fighters fighting on a 2D plane (the Street Fighter IV
trick), camera tracks the midpoint and zooms with the spacing.

## Where the code lives

- `src/engine/fighting.js` — **the shared fighting core** (#1096 will reuse it):
  per-fighter state machine (idle/crouch/jump/attack/blockstun/hitstun/launched/
  down/getup/win), frame-data resolution (startup/active/recovery), hitbox vs
  hurtbox overlap, block rules (hold back; lows need crouch-block; throws beat
  block), chip on heavies only (can never KO), hitstop, knockback/launch,
  cancels (a landed or blocked normal opens `cancelGate` for a stronger move —
  that is the combo), the facing-relative motion-input parser (forgiving token
  classes; subsequence match with per-token gap and window), charge tracking,
  projectiles, round flow (best of N, intro freeze, K.O./TIME UP freeze, match
  over) and the tiered CPU. The CPU emits PAD FRAMES (tiny scripts through the
  same motion parser a human uses), so specials and throws are earned, never
  cheated.
- `src/games/IronRing/fighters.js` — roster data: 6 fighters (KADE all-round,
  VEXA speed, BRAKK grappler, SABLE zoner, HYDE rushdown, TESSA acrobat). A
  fighter is data: build, hair, palette, walk/jump/reach multipliers, hp, moves
  on top of `BASE_MOVES`, specials keyed to the engine's motion names
  (`qcf`, `qcfx`, `qcf_S`, `dp`, `dpx`, `dp_S`, `charge`…). Meter: ≥50 turns a
  special into its EX variant, 100 auto-upgrades it to the super variant of the
  SAME motion (no extra buttons on phone).
- `src/games/IronRing/stages.js` — 3 ports of call (palettes + neon layouts).
- `src/games/IronRing/render.js` — three.js: procedural box-rig humanoids posed
  per state (walk cycle, guard, punch/kick extension by move kind, throw
  windmill, dp launch, down/getup, win bounce), stages with live crowd/flags/
  neon/floodlights, shadow blobs, hit sparks, model-shelf props with primitive
  fallback (#637). SSIV camera: `z = f(distance)`, midpoint tracking.
- `src/games/IronRing/index.jsx` — cabinet: attract CPU-vs-CPU demo, select,
  arcade ladder (VEXA easy → KADE insane), local 2P, head-to-head over the
  #1039 shared lobby with pad lockstep + hash-every-30 (#531 law; wire pads
  carry the 8 fighting verbs, so the lockstep normalizer is bypassed with a
  hand-rolled mirror), HUD canvas, sounds via `audioController`.

## Rules worth knowing

- Determinism: `createMatch(seed)` + identical pad streams ⇒ identical
  `matchHash` every tick (proven by `ironringcheck`). Every sim random comes
  from the seed; renderer juice may use `Math.random`, the engine may not.
- Multi-hit specials (#1699): move-level `hits` (cap) + `rehit` (min match-ticks
  between hits on one victim) + `travel` (forward drive through startup+active so
  a dash keeps contact). `hitOnce[seq]` is a `{n,last}` log, not a boolean;
  non-final hits push soft (×0.3 hit, ×0.15 blocked) so the rush stays in range,
  and `launch` applies on the FINAL hit only. Absent fields ⇒ single-hit exactly
  as before — VIPER PIT (`guardButton`/`juggle` consumer) is untouched.
  HYDE's qcf is a rushing 2/3/4-hit dash (10/15/20 total); melee supers
  reconnect (Kade/Hyde/Tessa dp_S ×3, Vexa dp_S ×2, Braakk/Sable charge_S ×2).
  Budget law: multi totals sit at the old single-hit damage +0..+3 (gated).
- Press latching (`index.jsx`): a keyboard tap can fall entirely between two
  60 fps polls; every keydown is latched into the next sampled pad. Same reason
  touch taps must feel responsive on a polled engine.
- Blocking drops only when airborne or committed; `blockHeld` covers idle,
  crouch and blockstun (crouch-blocking is the common bug: keep `crouch` in the
  block state set).
- KO only happens through `resolveHit` (a bare `hp=0` doesn't end a round);
  harnesses use the exported `forceKO`.

## Controls

- P1: arrows move/jump, hold back to block, J/Space punch-L, K punch-H, U/LK,
  I/HK, Z kick-L (the pad's B). P2 (local 2P): WASD + F/G/V/B.
- Touch: pad + A (punch) + B (kick); specials fire as ONE direction + button
  after the motion (down-forward + A).
- Motions: ↓→ +P = projectile/grab; →↓↑ +P = rising anti-air; hold back 40f,
  → +P = charge move; close + → + heavy = throw. Full meter auto-supers.
- 1 ladder · 2 local 2P · keys 3-8 quick-pick · Esc/? pause.
- Online: `/retrogames/iron-ring?net=host` / `?net=join&room=CODE`.

## Verify

- `npm run ironringcheck` — Node rules (verbs, block/chip/low-block, throw
  through block, projectile, anti-air, EX/super, charge, cancel-combo, seeded
  determinism, every CPU tier completes a match) + headless Chrome drive
  (attract→select→fight, inputs reach the sim, K.O. flow, zero page errors).
- `npm run ironringcheck -- --mutate` — proven-fail: a dead hitbox gate must
  stop all damage, and a freeze that cannot hear inputs must break the chain.
- `CONTRACT_ONLY=iron-ring npm run contractcheck` — the #377 driving contract.

## Honest gaps (polish-pass candidates)

- **CLOSED by #1699** Multi-hit specials — hyde's dash is a 2/3/4-hit rush,
  melee supers reconnect (see Rules worth knowing).
- **CLOSED by #1732** qcb — SABLE ships the **ward**: a slow (0.10), long-lived
  (ttl 320) single-hit sigil that hangs at mid-height, the keep-away mirror of
  her fast hex. `scriptMotion` gained the missing `qcb` case (the CPU's qcb path
  was dead — it returned an empty pad), and the CPU now throws a projectile-qcb at
  range (`dist > 2.4`), so a CPU SABLE earns it through the same parser a human uses.
- **CLOSED by #1734 (item 2)** cancel chains — normals cancel into specials and
  supers, specials into supers. The blocker was mechanical, not policy: hitstop
  discarded the entire input pipeline, and the freeze is exactly when players
  press the next link. `step` now keeps sensing through the freeze (direction
  history advances, presses bank in `btnBuf` for 10 ticks) and idle/jump/cancel
  consume them via `pressKey`, so a chain lands through the freeze. Gates:
  lp→qcf (after and inside the freeze), lp→dp_S, landed dp→dp_S, staleness,
  determinism; mutant: a deaf freeze must break the chain.
- Win/lose dialogue lines and per-stage midground variety.
- Net select: guest pick reaches the host only if sent before the host starts.
- Guard crush, stun system, throws escapable in air (v2 mechanics).
