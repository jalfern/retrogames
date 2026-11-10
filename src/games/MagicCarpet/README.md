# MAGIC CARPET — engine notes

Bullfrog Productions, MS-DOS, 1994 (#489; fidelity rework #1041). First-person
carpet flight over seeded rolling worlds; fly mana home to your castle until every
vault reaches its quota. The rules are the #1059 sim unchanged; #1083 replaced the
view with a MODERN GPU pass (`renderer.js`, WebGL2) while the HUD stays a crisp
320×200 blue-stone overlay. All art and audio synthesized at runtime.

## Layout

- `sim.js` — the pure deterministic machine: seeded heightmap (value-noise fbm +
  three cones over a 512u wrapping map) that spells DEFORM (craters, flooding),
  nine worlds (`LEVELS`: quota, wizard hoard/HP, pearl count), carpet, monsters,
  wizard, spells, vault economy, `autopilot()` (drives the attract demo AND the
  harness), `stateHash()`. No browser APIs in here — the harness imports it directly.
- `art.js` — rect-composed pixel sprites (wizard, tower, castle stages, giant,
  wolf, cow, villager x3 tunics, hut incl. burning + rubble, pearl,
  grimoire, balloon) + biome
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
  hearts, spell slots + gold SPELLS tab with twelve-spell tray, WORLD n/9) + the
  #1740 title WORLD SELECT (pulsing gold chevrons in the bottom corners, world name
  between them, drawn on the HUD overlay only in attract), the fixed-timestep loop, the `?` pause,
  VirtualControls, DEV hooks, and the `window.__game` contract.

## Rules that are load-bearing (each is a carpetcheck assertion)

- Bank-by-delivery: pearls follow the carpet (magnet 16u) into the carried
  pouch; hovering within 26u of the castle drains 3/tick into the vault. The
  VAULT is the score and the win check; carrying never wins by itself.
- Death spills the pouch (`spilled`), the vault endures: with vault > 0 you
  respawn at the gates (high, shielded, 240-tick spawn-invulnerable); with an
  empty vault the flight ends.
- Nine worlds (`LEVELS`, quotas 115→265 in nine strict steps, #1740): banking the
  quota regenerates the whole world (terrain, pearls, huts, village, monsters, fresh wizard
  hoard); spells learned and the carried pouch transfer; clearing world 9 wins.
- WORLD economy (#1740): every quota stays under what the pearls alone realistically
  pay (~pearls × 3.5 against the 2..6 roll). The wizard hoard is BONUS, never a
  dependency: at 0 mana on an exhausted land a hoard is not reliably cashable
  (casting needs prepaid mana), and that is exactly where a hoard-dependent quota
  soft-locks — seeds 41/54 proved it during the first 9-world sweep.
- WORLD SELECT (#1740): on the title, ◀ ▶ (arrows or the pad) cycle a cursor through
  the nine worlds and any other key/tap launches AT it; thumb-sized chevron zones at
  the bottom corners of the HUD surface route through pure `selectTap`/`cursorStep`
  in `sim.js` (Node-provable, ≥44 CSS px at 390px phone). The renderer CYCLES its
  three atmospheres over the nine worlds (`PAL[level % PAL.length]`) — the original
  reused its seasons across 45 levels the same way.
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
- SHATTER (#1639, the 9th spell, cost 30): kill-without-cinders. Everything
  alive within `SHATTER_R` (24u) of the look point dies where it stands — wolf,
  giant, cow, even a creature in your grip (killEntity, bounties drop) — and
  the wizard takes 28 when caught in the ring. What it never does is the rule:
  no crater, no fire mark, no topple, no scorch — the land is provably
  untouched even when the ring lands on the tower base (harness gate).
  rng-free: the kill-set is identical every replay.
- RAISE (#1639, the 10th spell, cost 25): the mirror of `crater()` — a
  quadratic mound (r16 h14) lifts the ground where you look. Ridges appear on
  the same heightmap every rule reads, so the carpet's auto-climb rides them;
  land lifted above `WATER` drains craters the sea had swallowed — the
  counter-spell to the game's own flooding. rng-free and deterministic.
- Ten-book spread (#1639): `genWorld` places a grimoire per spell; with ten
  books the strict 70u spread starves the mid-height band on unlucky seeds
  (seed 1 hit it on the 9th book), so after the honest 60-try strict loop the
  spread eases once (still past the castle's 45u reach). Always places.
- DISSOLVE (#1668, the 11th spell, cost 40): the ground is not cracked here,
  it is erased. Where you look, the heightmap is CLAMPED down —
  `min(h, WATER − DISSOLVE_SINK·(1−d/DISSOLVE_R)²)` over `DISSOLVE_R = 22` —
  so the wound floods GUARANTEED and permanent even on the highest peak (a
  crater()-style subtraction would only bite low ground; the clamp cannot miss).
  Every hut inside the radius dissolves: gone, no burn, no rubble, no
  `hutDown` — the flood swallows it whole, as the original drowned villages.
  Nothing regrows land; RAISE (#1639) is the counter-spell and drains the
  wound (gated). The promise it never breaks is cold and land-only: no crater
  record, no fire mark, no scorch, no topple, no wizard wound, and creatures
  swim — wolves and cows inside the ring survive (#1645 named huts and
  terrain). rng-free: same seed, same flood. Key `-`, tray slot 11 (keycap
  `-`), learned from an 11th grimoire; the GL pass answers with cyan spray
  rings and mist, and the shell with an undertow sweep + banner.
- CLONE (#1680, the 12th spell, cost 35): creature-cloning — the last entry of
  the original's later-game repertoire (#1612 item 5). Where you look, every
  creature within `CLONE_R` (24u) gains a twin at the MIRRORED position across
  the ring centre (never closer than 6u to it), at its kind's full spawn health
  (`SPAWN_HP`, now the single source for spawn + clone) and a fresh AI clock.
  Twins are ordinary monsters — they chase, bite, sling, stampede and pay the
  ordinary bounty — so casting into a pack doubles the land's killable mana and
  the danger in the same gesture. The wizard is unique and never cloned; land,
  huts, pearls and books are untouched (cold, rng-free like shatter: same seed,
  same litter). `CLONE_MAX` (32) guards world sim load against ring-upon-ring.
  Key `=`, tray slot 12 (keycap `=`), learned from a 12th grimoire; the GL pass
  answers with jade birth-sparkles at every twin, the shell with an echoed
  two-note cast and a doubling banner. Interpretation note: the original's Clone
  manual text was unverifiable at build time (no reachable sources); the issue's
  spec line — the repertoire "still misses creature-cloning" — is what shipped.
- Fairness invariant (#1639): every wizard tower generates within 180u of the
  castle — inside the guards' firing reach (<200u, arrows carry ~300). A
  hoarding wizard behind an out-of-reach tower plus a carpet at 0 mana is a
  soft-locked world (seed 14 proved it after the book rng shift); the retry
  loop keeps the world always finishable. 60-seed sweep after: 60/60 wins,
  slowest 28,573 ticks (books shifted the stream from #1612's 26,503).
- CRUMBLE RIPPLE (#1694, the ground feel): terrain deformations never pop.
  `crater()`, RAISE mounds and the DISSOLVE clamp compute their cell deltas
  exactly as the #489 instant machine did, then queue them on `gs.deforms`;
  `step()` drains the queue first (one driver, before casts). Centers sink on
  `(a/CRUMBLE_T)²` — an accelerating collapse — mounds swell on
  `1−(1−a/T)²`, and a shockwave ring just outside the work (r..1.25r;
  raise r..1.2r) heaves by `amp·sin(π·a/T)`, starting and ending at exactly
  zero: no erosion, no net land change from the ring. CRUMBLE_T = 10 ticks.
  At cast+CRUMBLE_T the heights equal the instant machine cell-for-cell
  (< 1e-9, gated), so flooding, auto-climb, glow, fairness and the 60-seed
  sweep land on the same land they always did; `stateHash` never reads
  heights, and `genWorld` clears the queue so a regenerated world is never
  dug by stale ripples. `settleGround(gs)` fast-forwards the window for
  gates (and the digHot hook) that assert on the LANDED world; the
  animation itself is gated mid-window. Balance after: 60/60 seeds,
  slowest 25,519 ticks.

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
#1668 mutant (2026-11-06): swapping DISSOLVE's heightmap CLAMP for a
crater()-style subtraction turns exactly the four flood-dependent gates red
(flood-on-peak, sink-depth, tower-base flood, RAISE counter-drain) while the
roster/hut/pays/tray/determinism gates stay green; restored after. Balance
after: 60/60 seeds, slowest 28,136 ticks (the 11th grimoire re-based the rng
stream).
#1694 mutants (2026-11-06, forge slot b): three proofs — (1) land the crater
instantly inside `crater()` (add `settleGround(gs)` before its return):
exactly the three crumble gates go red (no-pop, ease-in sliver, rim heave)
while BOTH convergence gates stay green — that IS the promise (animation or
not, the land lands the same); (2) delete `gs.deforms = []` in `genWorld`:
exactly the two regen gates go red (21 cells dug by stale ripples) plus the
source pin; (3) linear `sinkCurve`: exactly the ease-in gate goes red
(0.200 where the quadratic reads 0.04). All restored; 149/149 green.

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
npm run carpetcheck        # Node gates + a headless-Chrome pass + GPU-pass
                           # gates: boot, determinism, nine-world win, the
                           # WORLD SELECT table/economy/pins/geometry (#1740),
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
                           # SHATTER + RAISE (#1639: roster ten, kill-radius +
                           # spared-outside + no-crater/no-scorch promise +
                           # no-topple-at-tower, pays/denies both, mound lift +
                           # locality, flood-drain counter-spell, determinism,
                           # tower-in-guard-reach fairness on 60 worlds, ten
                           # books placed on 120 worlds),
                           # DISSOLVE (#1668: roster eleven, clamp-flood on the
                           # highest peak + locality + sink-depth, hut dissolve
                           # vs keep + FX payload, cold promise at the tower
                           # base (no topple/burn/mark/wound) + creatures swim,
                           # pays/denies, RAISE counter-drain, tray slot 11
                           # equip + HUD containment, determinism),
                           # CRUMBLE (#1694: no-pop queue on the cast tick,
                           # ease-in sliver at quarter-window vs linear, rim
                           # heave mid-window + zero erosion outside the ring,
                           # RAISE ease-out swell, honest landing <1e-9 vs
                           # the instant machine, determinism, regen clears
                           # the stale queue, source pins),
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

## #1646 polish (2026-11-06, QA studio)

- Crumble deaths: the original crumbled creatures where they fell. A `kill`
  event now showers cold `ash` particles (new particle kind: gravity-falloff
  grit, no fire) plus a small dust puff at the body — per-kind sizes and tints
  (wolf slate, giant stone, cow bone). It rides every kill (blasts included);
  shatter kills stay cinder-free because ash is grit, not fire, and none of it
  writes scorch. Browser gate + mutation guide in carpetcheck (#1646 gate).
- SHATTER reads lethal in daylight: denser splinters (16→20) and a wide cold
  flare ring in the icy tint, so the Verdant palette no longer washes the kill
  out. The radar still keeps no shatter history — faithful to kill-without-
  cinders (issue item 5 QA verdict: no radar mark; the FX carries the kill).
- Tray legibility (#1646 items 3–4): tray 17→22px; costs now `bold 7px` (was
  inheriting the 5px label font) and every slot wears its keycap (1–9,0), so
  RAISE-on-0 is seen, not memorized. Hit box unchanged in kind — existing
  HUD-containment and tap gates hold (they read `TRAY` live).
- Held for a future pass: RAISE mound terrain-ripple animation (the README's
  "no per-pixel deformation ripple" gap — animating the mound over N ticks
  means a deforming heightmap write path; bigger than this pass). *Shipped by
  #1694: the gs.deforms queue is that write path.*

## Honest gaps (the polish pass owns these)

- **CLOSED by #1680:** Clone — the book reached eleven (#1668 shipped dissolve),
  but the original's later-game repertoire still missed creature-cloning.
  Invisibility shipped #1610, volcano #1612 item 5, shatter + raise #1639,
  dissolve #1668, **clone #1680** — the roster tail of #1612 item 5
  (clone/dissolve/shatter/volcano) is now fully shipped.
- **PARTIAL by #1740:** the title carries a WORLD SELECT (◀ ▶ / chevron taps, nine
  startable worlds) — but the campaign is nine worlds, not the original's 45;
  scoring is banked mana + kills + clears + time bonus.
- **Castle-spell menu closed by #1764 item 1:** the original's spell selection was
  a browseable book, and the book lives at home. `B` (or a tap on the glowing
  prompt) opens it ONLY inside the castle's 26u reach — away from it the refusal
  is a `bookNo` event and zero state. While open the world is frozen
  (`step()` returns before the tick), so nothing moves and the carpet cannot
  drift out from under the pages. All twelve spells are browsable (unlearned
  read ??? — the original hides the name, not the slot), ◀ ▶ or the digits page,
  `L`/`R` (or the L HAND / R HAND buttons) arm the hands — learned only, an
  unlearned page fizzles exactly like the tray. A tap under the book never
  reaches the world (no stray cast), `B`/`?`/Escape/Space close it, and
  `genWorld` closes it with the rest of the world state. The whole menu is
  sim-pure (`bookOpen`/`bookKey`/`bookTap` in sim.js) and carpetcheck proves it
  Node-side; the browser pass drives real keys through the shell.
- One rival wizard per world; the original ran five, each growing its own
  castle. **Growth closed by #1764:** the rival's castle now builds itself over
  world time — curtain wall at 30 s, flanking turrets at 60 s, tall keep with a
  violet pennant at 90 s (in-world ticks, resets with the world) — and a grown
  castle defends: its towers loose violet arrows at any visible carpet inside
  110u, faster with every stage. A toppled tower never rebuilds and never
  fires. Still open: five wizards per world.
- **CLOSED by #1060, recorded by #1694:** telekinesis throws DO knock over
  towers — every throw/fireball impact routes through `toppleTower()` inside
  `blast()`, and carpetcheck gates it ("a throw landing at the tower base
  topples it"). The "carries more than one creature" half of the old line is
  an unverifiable #489-memory claim (no reachable sources; the #1680 lesson) —
  inventing multi-carry would triple a homing projectile's damage, so it is
  out of spec, not a gap.
- **Village life stage 2 by #1764 item 3:** the village economy — convert or
  burn, the original's signature loop. The carpet snags a villager BY TOUCH in
  the low band (`VIL_GRAB_R = 8`u and `alt ≤ ground + VIL_GRAB_ALT (12)` — the
  same band wolves bite from: altitude is armor AND the price of a prisoner).
  One grip (`gs.prisoner`, spliced from the lane) rides the carpet's fore
  corner; deliver inside the castle's reach (the bank-by-delivery rule) and the
  home hut becomes ALLY — gold pennant over the roof, gold radar dot, and it
  pays **tribute**: a 2-man pearl at the hut every `VIL_TRIBUTE_T` (720)
  ticks. A hut that burns to rubble scatters its savings (4–8 man over the
  `dropPearls` split, `m` on the `hutDown` event); dissolve stays cold
  (#1668: a drowned hut is spliced from the world and pays nothing). Death
  drops the prisoner where the carpet fell (back to the lane, panicked).
  `stateHash` carries the grip and the ally flags; rng only through the
  shared stream; the autopilot needs no new rule (a grabbed prisoner rides
  along and converts on the next bank — the 60-seed sweep re-ran green).
  Interpretation note (#1680 discipline): the original's exact convert/burn
  rewards are unverifiable here — the issue's spec line is what ships.
  carpetcheck proves the whole economy Node-side (band grab / high-flight
  never / grip full / convert / tribute-on-the-clock / burn-loot /
  dissolve-cold / death-release / hash grip+pennant / replay pair + mutation
  guide) and the live browser world grabs and converts through the
  `villageEconomy` hook (state-based, degraded-box safe).
  Still open: none — the loop is complete (items 1, 2 and 3 of the pass are
  shipped; 4–7 remain on the issue).
- No anaglyph/stereo mode. **Partially closed by #1746 item 7:** rival-cast
  cues now pan to the caster's side (see the #1746 section) — the world bed,
  creatures and lightning are still center, and there is no true HRTF.
  `?` pause carries the rules instead. **Partially closed by #1790:** red/cyan
  anaglyph ships — the world renders twice from ±0.60u parallel cameras and
  the post chain combines left→red / right→cyan (bloom is shared; the HUD
  stays flat mono). `V` toggles, `?stereo=1` opens on a fresh link, the
  choice persists. Still open: LCD-shutter/interlace modes, and the
  audio half (HRTF) of #1746 item 7.
- Water is shader waves with self-shadowing, sun-linked sparkle and foam lace
  tracing the shoreline. **CLOSED by #1764 item 4 stage 1:** the depth bands are
  now hard 4-level bands whose palette index marches one level every 6 sim ticks
  (`WAVE_CYCLE`) — the original's 16-colour palette animation walking through the
  wave bands, clocked on sim ticks (determinism intact). Still open: band shapes
  sit still while the colours walk (true travelling crests), and no underwater
  view when cratered below sea.
- **CLOSED by #1694:** terrain deformation ripple — craters, RAISE mounds and
  DISSOLVE wounds now unfold over CRUMBLE_T=10 ticks (ease-in collapse,
  ease-out swell, a shockwave rim that settles to exactly zero) with the
  final land provably equal to the old instant machine; the #1646-deferred
  RAISE-mound ripple ships here too.
- Fog is per-object/per-vertex distance mix, not a true aerial-perspective
  gradient with altitude; clouds are two dome layers that cast a drifting
  shadow on the land, not volumetric bodies.

## #1746 item 7 polish (2026-11-06, QA studio): SPATIAL CAST CUE

A rival bolt now lights up the sky WHERE the wizard stands. `castBearing(gs, x, y)`
(sim.js, exported) returns `{ pan, behind }` — a pure read of the cast point against
the carpet's nose, the same discipline as `muffleOf`/`crumbleFeel` (never feeds
`stateHash`). `wizfire` carries the cast point (`x`,`y`, presentation-only like
`lost`). The shell pans the crack by `pan`; a cast from outside the nose
(`behind`) reads longer (0.18s) and softer (0.04). `AudioController.playSweep`
gained an optional trailing `pan` (-1..1): **null keeps the exact old direct
graph**, so no other title's sound changes (opt-in law, same as the amb bus).

Sign basis: the camera's right vector at yaw 0 is +world y
(`renderer.js` fwd = (cos yaw·cosP, −sinP, sin yaw·cosP); right = cross(fwd,up)),
so `pan = sin(rel)` with `rel = atan2(wrapD(dy), wrapD(dx)) − yaw` is +right,
and `behind = cos(rel) < 0`. The bearing wraps the short way across the seam.

carpetcheck +9 gates (#1746 block): event carrier (x/y equal the wizard at the
shot), four cardinal geometries, nose-relative turn, seam wrap, purity
(stateHash immunity), and two source pins (shell routing; the `pan===null`
default-path in AudioController). Mutants to prove on demand: strip x/y from
the push (carrier red), sin→cos (side gates red, ahead/behind survive), drop
the pan arg (shell pin red), pan the null path (default-path pin red).

## #1740 nine worlds + WORLD SELECT (2026-11-06, forge slot b)

- `LEVELS` 3 → 9: named arcs VERDANT ISLES → EMBERWILD → FROSTBOUND → GREENFALL →
  SCORCHED SKY → GLACIER MAW → LIVING MOOR → LAST EMBER → THE LAST SKY; quotas
  115→265, hoards 80→215, wizHp 60→185, pearls 56→92. Sim physics untouched —
  wolves already scaled with `4 + gs.level`, the HUD already read `LEVELS.length`.
- Balance history: the first curve (quotas to 295) stalled seeds 41/54 at world 9
  (all pearls eaten, pouch 0, hoard 260 behind 17 monsters — hoard not cashable at
  0 mana). The economy policy above came out of that; after: **60/60 seeds win all
  nine worlds, slowest 96,571 ticks.**
- Harness: WORLDS section (named table + strict escalation, supply floor
  `pearls*2 + hoard ≥ quota`, QUOTA=world 9, level pins/clamp/determinism, live
  campaign name order, select-zone geometry + cursor wrap, renderer-cycle and
  attract-routing source pins) + real-browser gates (arrows cycle the cursor and
  never start; any-key starts AT the cursor seed-pinned; 390x844 touchscreen
  chevron taps cycle then tap-to-start honors the cursor). carpetcheck: 176/180 —
  the 4 reds are the local degraded-Chrome pixel family (#1622; main's baseline
  emits the identical signatures on this box).
- Mutants (all restored, each caught exactly): freeze the win at level 3 → the
  three progression gates go red, sweep still 60/60 (correct: the mutant wins, it
  just stops early); re-clamp `PAL[Math.min…]` → only the cycle source pin; kill
  selectTap's `next` zone → the geometry gate + both phone tap gates (`sel
  0->0->0`).
- Harness lesson (#1622 box): the pixel gates (sky/texture/same-tick/rotate-hint)
  fail in a RANDOM subset even on untouched main here — run the baseline carpetcheck
  before blaming a pixel-gate failure on your branch. State-based gates held green.

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

## #1637 WATCH seat (2026-11-06, forge slot b)

Y seats the game's OWN autopilot — `autopilot(gs)` in sim.js, the same
closed-loop brain the attract demo flies and that carpetcheck's 60-seed balance
sweep must keep restoring all three worlds with. It re-decides from live state
every tick (targets the nearest pearl/grimoire, homes the wizard, banks when
`bank + mana >= quota`, veils and climbs when hurt), so a watched run is a
real run, not a witness replay.

- Seat/takeover: Y toggles (blips via `utils/watch`); arrows, Shift, Space,
  X/Z, Q, digits and the pad all take over AND still apply — takeover is
  lossless. A stage tap hands back without casting (the wheel is the prize;
  the spell comes with the next tap). `finish()` and `startPlay()` unseat —
  a new run and a death land in your hands. A world CLEAR keeps the pilot
  seated (same sim; the sweep crosses levels the same way).
- Visual honesty: bank, sway, pitch and the boost streak read `eff` — the
  EFFECTIVE inputs — so the picture matches the route the pilot flies, and
  the HUD vault/score move because the sim says so.
- Harness: watchcheck carries the `magic-carpet` pilot at `?seed=7` (pinned).
  Advance signals are prover-only, verified head-to-head against an idle
  carpet on the same seed: idle flies yaw-dead-straight (|Δ| 0.000 over 480
  ticks) and banks nothing, while the pilot shows |Δyaw| ≥ 0.65 within 60
  ticks and banks in the window. Signals: sustained yaw change > 0.12 rad,
  casts, kills, vault movement, or a world clear. Batch-6 source pins sit in
  watchcheck too (seat feeds autopilot, visuals follow eff, unseat at end and
  start, registry WATCH line). The honesty gate moved `/magic-carpet` out of
  the no-guide list; DOS/IF titles stay in it — no solver drives those yet.
