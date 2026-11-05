# MAGIC CARPET — engine notes

Bullfrog Productions, MS-DOS, 1994 (#489; fidelity rework #1041). First-person
carpet flight over seeded rolling worlds; fly mana home to your castle until every
vault reaches its quota. The rules are the #1059 sim unchanged; #1083 replaced the
view with a MODERN GPU pass (`renderer.js`, WebGL2) while the HUD stays a crisp
320×200 blue-stone overlay. All art and audio synthesized at runtime.

## Layout

- `sim.js` — the pure deterministic machine: seeded heightmap (value-noise fbm +
  three cones over a 512u wrapping map) that spells DEFORM (craters, flooding),
  three worlds (`LEVELS`: quota, wizard hoard/HP, pearl count), carpet, monsters,
  wizard, spells, vault economy, `autopilot()` (drives the attract demo AND the
  harness), `stateHash()`. No browser APIs in here — the harness imports it directly.
- `art.js` — rect-composed pixel sprites (wizard, tower, castle stages, giant,
  wolf, cow, hut incl. burning + rubble, pearl, grimoire, balloon) + biome
  table. Never patched by #1083: the GPU renderer bakes it into an atlas.
- `renderer.js` — the HD world pass (#1083), a fresh WebGL2 renderer (three.js,
  the COMET DRIFT HD house pattern). Terrain = camera-centered grid whose
  heights are sampled in the vertex shader from a live RGBA8 data texture
  (R=height, G=lava glow, B=scorch) re-uploaded every tick, so blasts visibly
  tear the ground and low craters flood. Water is geometric at sea level plus
  shader ripples/glitter/depth banding/shore foam; sky is a gradient dome with
  sun glow + drifting fbm clouds matched to the fog; entities are instanced
  billboards from a runtime-baked atlas; fire/smoke/embers are instanced quads;
  lightning is a jagged additive line mesh; post = bright-pass bloom + vignette.
  Three per-world palettes (PAL). `frame(gs, {bank,boost,pitch,sink,shakeX,shakeY})`
  — camera banks into turns, pitches with climb/dive, FOV stretches on boost.
- `index.jsx` — the shell: the 2D HUD overlay canvas (320×200, nearest-scaled,
  and now the pointer surface for the #1612 touch spellbook — hudTap routes
  strip taps, world taps cast) with carpet corners/hands/crosshair + carried-orb halo,
  the blue-stone HUD (radar with hut/fire dots + cyan veil sweep, VAULT bar with per-world ticks
  + segment-crossing flash and 3-note stagger on big bankings, CARRY pouch,
  hearts, spell slots + gold SPELLS tab with eight-spell tray, WORLD n/3), the fixed-timestep loop, the `?` pause,
  VirtualControls, DEV hooks, and the `window.__game` contract.

## Rules that are load-bearing (each is a carpetcheck assertion)

- Bank-by-delivery: pearls follow the carpet (magnet 16u) into the carried
  pouch; hovering within 26u of the castle drains 3/tick into the vault. The
  VAULT is the score and the win check; carrying never wins by itself.
- Death spills the pouch (`spilled`), the vault endures: with vault > 0 you
  respawn at the gates (high, shielded, 240-tick spawn-invulnerable); with an
  empty vault the flight ends.
- Three worlds (`LEVELS`, quotas 115/160/175): banking the quota regenerates the
  whole world (terrain, pearls, huts, monsters, fresh wizard hoard); spells
  learned and the carried pouch transfer; clearing world 3 wins.
- Terrain reshape: every blast punches a crater into the heightmap (`crater()`,
  quadratic falloff; fireball r14d10, lightning r10d8, tower fall r18d11).
  Craters sunk below WATER flood with the sea. Wizard death craters his tower.
- Fire: blasts scatter scorch marks and ignite nearby huts; a burning hut falls
  to rubble after 200 ticks; a burning hut ARMS neighbours within 20u, which
  catch ~120 ticks later (spread chain); wolves respawn from scorch marks on a 360-tick
  clock (while the monster cap holds).
- Fresh craters from fire glow with lava and cool over `CRATER_GLOW` (300)
  ticks (`glowOf()`); the scorch rim stays. Only hot craters (`crater(...,hot)`)
  glow — lightning and collapses are cold.
- The wizard's tower is topplable: a player blast (`toppleTower()` in `blast()`)
  within 14u of the tower base topples it once per world, the wizard takes 30
  damage, and the tower draws as leaning rubble.
- Per-world palettes (#1060): same geometry, different atmosphere — Verdant
  daylight, Emberwild dusk/lava (`WORLD_PAL` sky+fog+tint), Frostbound
  blue-white; water is a 4-tone palette-cycling wave band table (`WATER_PAL`)
  with shore foam, plus a low wind drone tied to airspeed in the shell.
- Mana conservation: `vault + pouch + alive pearls + wizard hoard` moves only by
  monster bounty (+), spell cost and spills (−); a world reset rebases it (the
  harness reads the `level` event's `reset` payload + new world's supply).
- Acquisition risk: each grimoire flutters toward you within 18u and has one
  book, 80% learn chance per touch with a 90-tick cooldown; failures stay in
  the world and are retryable.
- Two hands: left (Space/A) and right (X/Z/B); 1–6 assign left, Q cycles right;
  casting SPENDS the carried pouch, not the vault. #1612 made the HUD itself the
  equip surface for touch: tap a hand slot to cycle that hand through learned
  spells, tap the gold SPELLS tab to open the eight-spell tray, tap a learned
  icon to assign the LEFT hand (unlearned icons dimmed and inert; click-out
  closes without casting — the original's mouse-first equipping, phone-sized).
  Routing lives in `sim.js` (`hudTap`, `TAP`, `TRAY`) so the whole touch path is
  Node-provable; the shell only maps pointer→HUD space and casts on `world` taps.
- The carpet cannot crash: it banks (turning bleeds 78% of speed, turn 0.065)
  and auto-rises over ridges; holding down bottoms out above terrain, never below.
- Wolves only bite carpets flying low (within 10u of the ground) — altitude is
  armor, like the original. Giants keep 55u off your castle; respawn is safe.
- Charge-glide: holding boost (`inp.boost`; Shift, or a held ▲ in the shell)
  flies at 1.6× cruise with turns dampened to 0.55× — wider radius, no mana.
- INVISIBILITY (#1610, the 7th spell): for `INVIS_T` (420) world ticks the
  enemies are blind to the carpet — the wizard's fuse pauses (no bolt launches,
  and a bolt already in flight passes through), wolves neither chase nor bite,
  giants refuse their slings. Your own hands work untouched: pearls, grimoires,
  banking, blasts all normal. Cost 20 from the carried pouch; the fuse resumes
  on its cadence the tick the veil expires. Behind the veil the radar reads
  cyan — tinted glass plus a sweeping arc (#1612) — beside the shimmer and
  timer bar in the overlay. The world says it too (#1612 item 1): the tick the
  veil rises, every enemy that HAD you in its sights (wizard pd<75, wolf pd<45,
  giant pd<70) gets `lostT = 40` + a `lost` event — the shell blips a curious
  two-note (the wizard adds "THE WIZARD LOSES YOU"), the GL pass floats a gold
  '?' over their heads and the carpet drags a cyan ghost trail of additive motes
  until the veil lifts. `lostT` is presentation-only: it never steers the AI. The world muffles too (#1612 item 4): the sustained bed
   (wind drone tied to airspeed, boost hiss, the bank hum, the nearby growls)
   rides one low-pass whose cutoff `muffleOf(gs)` picks — open when seen,
   `MUFFLE_CUTOFF` Hz behind the veil — so invisibility is something you hear.
   Your own spell-casts stay bright: only the world bed dulls, never your hands.

## #1612 item 1 polish (2026-11-05, QA studio)

- Lost-target cues: veil-up marks every enemy that had you in its sights
  (`lostT = 40` + `lost` event; wizard pd<75, wolf pd<45, giant pd<70);
  the shell answers with a curious two-note per kind ("THE WIZARD LOSES YOU"
  once), the GL pass floats a bobbing gold '?' over each marker head (new
  `quest` atlas glyph) and the carpet drags a cyan ghost trail — additive
  flare motes off the stern plus a wide pulse ring every 7 ticks.
- Mutation proof: replacing the wizard mark condition with `false` turns
  exactly one gate red (kinds=giant,wolf, lostT 0/40/40); restored.
  Browser side: deleting the `gs0.invis > 0` block in fillParticles reddens
  the ghost-trail gate. Balance after: 60/60 seeds, slowest 24,704 — unchanged.

## #1612 item 4 polish (2026-11-05, QA studio)

- Veil muffle: the wind drone, boost hiss, bank hum and nearby growls now route
  through a new opt-in low-pass ambience bus in `AudioController`
  (`ensureAmb`/`setMuffle`/`ambTone`/`ambSweep`/`ambNoise` — games that never
  call these still hit `destination` directly, so no other title's sound moves).
  The cutoff is a pure read, `muffleOf(gs)` in `sim.js`: `OPEN_CUTOFF` (18 kHz)
  while seen, `MUFFLE_CUTOFF` (520 Hz) while `gs.invis > 0`, eased via
  `setTargetAtTime` so the veil edge doesn't click. Own casts/heals/kills stay on
  the direct SFX path — the world dulls, your hands don't.
- Mutation proof: reading `gs.shield` instead of `gs.invis` in `muffleOf` flips
  the visible/veiled gates; six new Node gates cover open / muffled / pure-hash /
  expiry-recovery / shield-and-heal-stay-open / narrow-band. Browser side (CI):
  dropping the `setMuffle(muffleOf(gs))` call leaves `__carpetTest.muffle()` null
  under the veil and that gate goes red. Balance unchanged (the muffle is audio
  only, off the hash).

## Verify

```
npm run dev                # another terminal
npm run carpetcheck        # 85 checks: boot, determinism, three-world win,
                           # delivery/spill/death, craters (fire + lightning),
                           # hut burn-to-rubble, conservation across worlds,
                           # acquisition risk, charge-glide, hoard scatter,
                           # INVISIBILITY veil (#1610: cast/expiry, wizard +
                           # wolf + giant refusal vs controls, in-flight
                           # pass-through, own pickups intact, hash, 60-seed
                           # balance sweep),
                           # lost-target cues (#1612: every enemy caught looking
                           # emits `lost` on the cast tick, once per veil + decay,
                           # out-of-range enemies quiet, visible carpet never),
                           # touch spellbook (#1612: slot cycles, equip events,
                           # world tap still casts, dead strip never casts,
                           # book toggle, tray equip/inert/click-out, hit boxes
                           # inside the HUD, tray never disturbs the hash,
                           # regen closes the book),
                           # plus a headless-Chrome pass and 10 GPU-pass gates
                           # (#1083: WebGL2 alive, sky/terrain separation,
                           # texture, lava-glow + scorch in the heightmap
                           # upload, glow cools, scorch persists, no shader
                           # console errors; #1612: veiled ghost trail motes)
CONTRACT_ONLY=magic-carpet npm run contractcheck
```

Mutation proof (done, 2026-10-25): changing the win check to
`gs.bank >= gs.quota * 100` turns the three equilibrium checks red and nothing
else; restored after. #1610 mutant (2026-11-05): deleting the `gs.invis <= 0`
gate on the wizard fuse turns only the veil-targeting check red
(`veiled fire=true`); restored after. #1612 mutant (2026-11-05): making `hudTap`
return `'world'` for a slotL tap (the pre-fix keyboard-only behavior) turns
exactly the two slot gates red; restored after. Balance: autopilot wins 60/60 seeds
(slowest ~26.5k ticks — the veil + evasive-climb rules made the bot strictly
safer than the pre-#1610 ~26.5k; the 8th book's rng shift re-based the sweep,
see item 5).

## #1612 item 5: VOLCANO (2026-11-05, QA studio)

- The 8th spell, cost 60 from the pouch: the ground tears open at your look
  point — a main hot vent (r18 d12) plus 3 deterministic secondary hot craters
  (`volcanoErupt` reuses the crater/glow/ignite/topple machinery: scorch marks,
  hut ignition, `fireMarks`, tower topple if it lands at the base). Fired via
  Digit8 / tray slot 8 / left hand; the GL pass draws lava-vent fountains for
  ~160 ticks; the shell adds a sub-bass rumble + long camera shake + banner.
  Six Node gates: roster, cast+pays, glow-cool, deny, topple, determinism.
- The 8th grimoire shifts world-gen rng (one more `findSpot` draw), so every
  seed's monsters/pearls land differently. Two harness consequences fixed here:
  - `lostRig` is now composition-proof — it keeps exactly one giant + one wolf
    (seed 7 now rolls a 2nd giant that sat in sight of the parked carpet and
    emitted a stray `lost`).
  - Autopilot deadlock on seed 2: the evasive-climb rule (`hp<55 && wolf<24 →
    climb`) had no clearance check, so a wolf pack that shadowed the carpet over
    a ridge pinned the bot at the ceiling for 24k ticks (can't descend, can't
    afford the veil). The rule now only climbs while genuinely low
    (`alt < ground + 12`) — faithful to the bite rule it defends against
    (wolves only bite carpets flying low). Balance after: 60/60 seeds,
    slowest 26,503 ticks.

## Honest gaps (the polish pass owns these)

- Five spells remain: no clone/dissolve/shatter, and no raise-terrain
  spell (the original's later games added one; MC1 itself only craters and
  floods). Invisibility shipped #1610, volcano #1612 item 5.
- Three worlds, not the original's 45; no level-select or castle-spell menu;
  scoring is banked mana + kills + clears + time bonus.
- One rival wizard per world; the original ran five, each growing its own castle.
- Telekinesis holds and throws but carries only one creature and the throw
  doesn't knock over towers.
- Village populations are decorative huts — no villagers, no convert/burn moral
  economy, no prisoners.
- No anaglyph/stereo mode, no 3D sound. `?` pause carries the rules instead.
- Water is shader waves with self-shadowing, sun-linked sparkle, dithered
  depth bands and foam lace tracing the shoreline — but not the original's
  4-bit palette-cycling wave animation; no underwater view when cratered below sea.
- No per-pixel terrain deformation ripple animation — craters appear on the
  heightmap the tick they land (visible, but instantaneous).
- Fog is per-object/per-vertex distance mix, not a true aerial-perspective
  gradient with altitude; clouds are two dome layers that cast a drifting
  shadow on the land, not volumetric bodies.

## #1090 polish (2026-10-25, QA)

- Water: two-wave analytic normals with sun-facing self-shadow, sparkle term
  tied to sun angle + ripple slope (palette-cycling's readable cousin), three
  dithered depth bands, foam lace that traces the shore geometry.
- Clouds: two parallax dome layers + a low-freq cloud shadow that drifts over
  the terrain; cool lava craters keep an obsidian sheen (specular on scorch);
  dead rubble smoulders (smoke keeps rising long after the burn); hut windows
  flicker warm (negative billboard seed channel drives BILL_FRAG).
- Billboards tilt toward the horizon (`lean` in BILL_VERT) instead of staying
  screen-vertical; the HUD carpet corners squash/lift with bank and a loaded,
  cooled hand shows a ready orb before the cast flash.
- Sound: boom/zap reverb tails (delayed low echoes), a low hum while the vault
  fills, distant monster growls tied to radar proximity.
- World-time determinism: water, lava, clouds, cloud-shadow, particle flicker
  and the bank/sink camera easing all animate on sim ticks, not wall clock —
  so a frozen tick is a pixel-stable frame. This is the load-bearing new
  carpetcheck gate (`same tick renders identical frames`); the second new gate
  is `dead rubble keeps smouldering` (mutant: delete the `hs.dead` smoke
  branch in emitAmbient → red).
