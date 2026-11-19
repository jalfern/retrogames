# CONTRA — stage 1: the jungle

Jon's commission (#1530: "which title joins the arcade next? — **CONTRA**",
answered 2026-11-03, filed and built as #2779). Konami's arcade run-and-gun
(1987), RETRO bar (docs/ART.md): 384x224 native, everything generated in code.

## What S1 is

One horizontal jungle scroll (~6 screens, 2048 world px) to the bolted base
gate. The signature set: 8-way aim while running/jumping, one-hit death with
three lives and respawn mercy frames, the flying SPREAD capsule (kept until you
die), soldiers that wake inside your view and open fire within a third of a
second, ledge gunners on the walkways, sandbag turret posts, TNT barrels that
chain, and a STAGE CLEAR leg. Attract runs the autopilot the harness proves
against — any key or tap takes the seat.

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
- The autopilot is honest-percept: it reads only what a seated player can see
  (own position, visible bullets/barrels/capsule). Its two law-brains are the
  smoke run's lessons: **dodge on approach** (a bullet bearing down on the
  lane, ahead of the knees, is jumped — the first draft read the sign
  inverted and stood there taking hits), and **ease off the trigger short of a
  barrel** (your own catch on a barrel 20 px ahead is a self-blast; hop the
  body instead).
- The spawn-shield regression (#2779's own smoke test caught it live): a
  soldier woken at `cam + W + 12` stands *past* the bullet-despawn edge —
  an unshootable shield. The whole stage played itself (measured: autopilot
  8/8 seeds, ZERO enemy bullets fired). Soldiers now wake at `cam + W - 4`
  and open fire in 10-35 ticks; `contracheck` gates both the invariant
  ("every autopilot seed takes enemy fire") and the wake geometry itself, and
  `--mutant` replants the exact line and demands harm be NAMED (#2142).
- Walkways are one-way solid-topped: land from above, pass through from below,
  `DOWN + jump` drops off.
- Taps are latched one tick in the shell: a press shorter than the 16.7 ms
  poll must not evaporate between frames (the harness's `press()` outran the
  loop and the jump check went red exactly this way).
- Audio: every action synthesized via `audioController` (rifle/spread/efire
  blips, jump sweep, boom = noise burst + sub sweep, capsule rise, stage-clear
  triad). Attract music stays off per the shell contract.
- Keyboard: Arrows move + aim all 8 ways (down aims only airborne),
  SPACE/Z or the pad's A jumps, X/C or the pad's B fires. `?` pauses.

## Verify

```bash
npm run dev -- --port 5173 --strictPort   # another terminal
npm run contracheck                      # sim core + browser leg (~40 s)
npm run contracheck -- --mutant        # replants the spawn-shield line, names the harm
CONTRACT_ONLY=contra npm run contractcheck   # the window.__game contract
```

`contracheck` proves: boot · determinism (seed+pads twice, other seed differs) ·
the 8-way law · run/jump/gravity · rifle vs SPREAD counts · capsule→SPREAD and
death→revert · one-hit death + respawn i-frames · barrel chains · the stage
fights back on every seed tested · no spawn shield · **winnable: autopilot
clears seeds 1..12, not cherry-picked** · the gate ends the run · GAME OVER
path · walkway one-way law · attract self-demo · real keys start/run/jump/fire/
die/restart · zero page errors.

## Honest gaps

- The waterfall vertical section and the **boss gate** (stage 1's real finish —
  the bolted wall with the destructible core) are S2: the gate stands at the
  end of the jungle but does not fight back yet.
- Weapon shelf is thin: SPREAD is the only pickup. The original's MACHINE GUN,
  FIRE BAR and LASER are S3, and the machine-gun audio seam is already wired
  (`fireCool` reads the weapon).
- Enemy roster: runners, ledge gunners and turrets only — the original's
  snipers-in-trees, grenade soldiers and flying pod carriers are S3.
- Co-op: the cabinet is a two-player game; a CPU ally seat (and the second
  keyboard seat per Jon's multiplayer rule) is S4 — the sim takes one hero
  today.
- Residual on what DID ship: soldiers carry rifles only (no shot-to-shot
  variety), and the capsule always flies at one height; the original varied
  couriers per wave.
