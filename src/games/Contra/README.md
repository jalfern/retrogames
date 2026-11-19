# CONTRA — Jon's #1530 commission, staged

Konami's arcade run-and-gun (1987), RETRO bar (docs/ART.md): 384x224 native,
everything generated in code. Filed and built as #2779, one PR per stage:

- **S1 — the jungle** (merged `8b6dd17`): horizontal scroll, 8-way run-and-gun,
  SPREAD capsule, soldiers/turrets/TNT, attract, `contracheck`.
- **S2 — the base** (merged `8ada95b`): the waterfall vertical section + the
  boss gate with the destructible core — stage 1's real finish.
- **S3 — the weapon wall** (this): the capsule wheel (S/M/F/L), the MACHINE
  GUN stream, the FIREBAR, the LASER, tree-line snipers, grenade soldiers.

## What S3 is

The original's most recognizable system: flying capsules that carry LETTERED
weapons. Catch the capsule and your gun becomes its letter — SPREAD (5-way),
MACHINE GUN (a 20-round/s stream), FIRE (a slow flame ball that undulates and
pierces), LASER (the fastest round, also piercing). The weapon still dies with
you: capture kills the wheel back to the rifle. The capsule draws its kind AND
its altitude on spawn — low (stand), mid (hop), high (full jump) — closing the
old honest gap that the capsule "flew at one height".

The jungle also recruits the cabinet's ambushers: four tree-line **snipers**
(crouched in canopy nests, long range, the fastest aimed round in the game at
3.2 px/tick, telegraphed by a flashing scope glint while the shot charges) and
three **grenade soldiers** (armoured two-hit vests, lob arcing bombs that
detonate where they hit the ground — being airborne over the landing beats it).

## Engine notes

- **Lane-aim law (S3, new):** enemies aim at the hero's LAST GROUNDED line
  (`p.lane`), never at the airborne body; snipers additionally fire only at
  grounded targets. Formalizes the S2 autopilot lesson ("flat aimed rounds are
  HOPPED, not out-run") into a sim law: a hop is always the answer to an aimed
  round. Without it the first S3 build killed seeds with rounds aimed at heroes
  mid-jump — a dodge the cabinet never demands.
- **Pierce tracking** rides the bullet: fire/laser bullets carry `hits` (stable
  index keys into soldiers/turrets/barrels), each body takes a piercing round
  once. Plain rounds stay single-target — piercing belongs to the wheel.
- The MG's stream is a cadence change (`fireCoolMachine: 3`), not a new
  projectile; the firebar's undulation rewrites `vy` from a per-bullet phase
  (`ph += 0.42`, `vy = vy0 + sin(ph) * 1.5`) — deterministic, no rng per tick.
- Grenades ride the existing `eb` stream with `gr: true` + gravity `+0.16` and
  detonate via the existing `boom()` at the ground line (blast law unchanged:
  symmetric — the pit can eat the thrower's friends too).
- #2782 polish pass (S1+), ratchet camera/torrent, the armored gate and the
  S2 autopilot lessons all stand — see git history and the S2 notes in
  `origin/forge/contra-waterfall`.
- `sim.js` is the whole truth, pure Node: fixed 60 Hz `step(gs, pad)`. Every
  sim random rides `gs.r`; `stateHash` = FNV-1a over the rounded state
  (extended in S3 for weapon/bullet kinds, pierce counts, capsule kind,
  snipers, lane, nade vest hp). Events stay unhashed, per Joust's law.
- **Phases**: `gs.phase` jungle | falls | boss. Snipers and grenades are
  jungle-only — the canyon and the gate keep their own roster.
- Audio: every new action synthesized via `audioController` — the MG's ripping
  pop, the firebar's breath, the laser's falling zap, the sniper's crack and
  the lob's whistle answer the existing set.
- Keyboard: Arrows move + aim all 8 ways (down aims only airborne),
  SPACE/Z or the pad's A jumps, X/C or the pad's B fires. `?` pauses.
  `warpFalls`/`warpBoss` construct phases properly (DEV hooks + DebugKit);
  DebugKit gained a CYCLE WHEEL cheat button.

## Verify

```bash
npm run dev -- --port 5173 --strictPort   # another terminal
npm run contracheck                      # sim core + browser leg
npm run contracheck -- --mutant        # replants spawn-shield, sealed-core,
                                       #   silent-MG, non-piercing-beam; names harm
CONTRACT_ONLY=contra npm run contractcheck   # the window.__game contract
```

`contracheck` proves (S3 additions bolded): boot · determinism (seed+pads
twice, other seed differs) · the 8-way law · run/jump/gravity · rifle vs
SPREAD counts · capsule→SPREAD and death→revert · one-hit death + respawn
i-frames · barrel chains · the stage fights back on every seed tested · no
spawn shield (both axes, **soldiers and snipers**) · the gate is a door not a
wall · the torrent drowns · the ratchet never retreats · shelf one-way +
honest-hop geometry · open-core hits and shut-shutter armor · core destruction
ends stage 1 with the bonus · the door caps and the cannons talk · **MG
streams at least twice the rifle** · **laser is the fastest round** · **fire
undulates across its line** · **FIRE and LASER pierce; the rifle stops at the
first body** · **capsules grant every letter and the draw covers the wheel** ·
**snipers fire, fast and telegraphed** · **grenades arc and detonate on the
ground; the vest eats two rounds** · **winnable: autopilot clears
jungle+falls+boss on seeds 1..12 with the new roster**, not cherry-picked ·
GAME OVER path · attract self-demo · real keys start/run/jump/fire/die/
restart · **live MG stream and live capsule letter in the browser** · live
warp + armor law · zero page errors.

## Honest gaps

- Co-op: the cabinet is a two-player game; a CPU ally seat (and the second
  keyboard seat per Jon's multiplayer rule) is S4 — the sim takes one hero
  today.
- The original's flying pod carriers (weapon capsules dropped by low-flying
  craft) are still missing — today only the crossing capsule delivers guns.
- Lasers/fire pierce bodies but are still consumed by the gate armor housings
  (the arcade's emplacements could be shot off — carried from S2).
- The cascade blasts at the gate are random around the wall rather than
  scripted position-by-position; the waterfall has one gunner set and one
  hazard (the rising torrent), while the original also put the odd hanging
  vine/carrier on the way up.
- The arcade loops stage 1 with faster settings after the kill; here the run
  ends at STAGE CLEAR and returns to attract — a looped second pass is
  post-S4 territory.
- Sniper nests sit on fixed perches; the original drifted aim between a few
  tree positions. The vest grenadier fires a rifle too while advancing; the
  cabinet's grenadiers were lob-only.
