# MISSILE COMMAND (1980, Atari)

Six cities, three silos, ten interceptors a salvo. Wave after wave of
warheads picks targets off the board; explosions clear the sky. Bonus between
waves pays 100 per living city and 50 per spare missile, then reloads.

## Engine notes
- **Whole-tick sim (#1637 batch 29):** `sim.js` holds the ENTIRE world —
  `makeRun(seed)` builds it, `tickMc(gs, cmd)` advances exactly one fixed
  tick. No `setTimeout`, no `Math.random` inside (the wave break is
  `WAVE_BREAK_TICKS = 180` world ticks — that closes the old wall-clock
  cruft, #1525). `?seed=N` now replays the whole raid: spawner, intercepts,
  splashes, the lot.
- **Seed (#1473 batch 15):** targets, trails, the deco explosion colour and
  the attract pilot's trigger finger ride ONE seeded stream; `startRun()`
  regenerates the seed at every human start. Production report:
  `{tick,score,done,seed,wave}`. DebugKit (F1) shows cities/ammo/wave/watch
  and can fire or force a game over through the real destruction path.
- **CRUISE SAUCERS (#3629) — the wave-6 ferry.** The original introduces new
  weapons in later waves: satellite-shaped craft that cross the screen
  launching missiles of their own (Wikipedia, arcade article; Atari 1981
  manual §2: "Cruise missiles look like satellites, but they are just as
  deadly"). Rules, manual-pinned where possible: they enter from wave 6
  (§6 "After the 6th wave … the enemy may attack with cruise missiles"), one
  guaranteed per wave plus a second every three waves, seeded side/altitude
  (y 120–200)/interval; crossing speed scales with the wave. Launches ride
  the exact warhead physics, so `gunnerStep` covers them with no seat change.
  Any fireball touching the hull burns it: **125 points** (manual Table 1,
  enemy cruise missile) plus a wreck fireball. A wave cannot clear while a
  saucer is owed or crossing. The RNG is never consulted below wave 6, so
  every wave 1..5 proof replays byte-identical (missilecmdcheck §gate pins
  it). The gunner takes the bonus shot only when every warhead is covered
  and the craft is a quarter-crossing in — the arcade-expert habit, not an
  edge-pop machine.
- **#3638 saucer polish pass** (the QA ask on #3629), five things:
  - **Reserve rule (the doctrine, measured).** A shell may chase the 125 only
    if what stays in the magazine covers every warhead the wave can still
    field — the ICBM ladder left to spawn PLUS the cruise launches of ferries
    other than the target (~every 50–99 ticks; owed ferries count their whole
    crossing; killing the target cancels ITS launches, the expert trade).
    A/B sweep, 12 seeds × waves 6–10, bonus on vs off: **the bonus never
    costs a city or a point**, waves 6–8 pay every seed (36/36), all 60 raids
    clear. At waves 9–10 (28–30 warheads + ferry cruises vs 30 shells) the
    reserve simply never frees a shell — the watch lets the ferry go rather
    than gamble a city, which is the honest answer the ask asked for.
  - **Legible look.** Cruise launches draw a 2 px ORANGE trail (#ff9d00) vs
    ICBM red — distinct at the 600px phone letterbox at device scale 1
    (verified by screenshot + pixel probe). Hull rx 18→21, dome r6→7, rim
    lights 4×3 so the satellite still reads dome-and-lights when small.
  - **Sound mix.** Two-part warble at 0.16 (was a single buried 0.07 sweep),
    cruise launches growl at 180 Hz sawtooth below the ICBM whistle, and the
    125 kill layers deep thud + long noise + rising chirps — bigger than a
    warhead boom, the game's own hierarchy.
  - **Kill juice.** The burn pops a white flash (4 ticks) plus six seeded
    debris sparks (light gravity, ≤44 ticks). Dice roll only on a kill, and
    kills exist only at/after the gate, so the byte pins hold; neither joins
    the wave-clear law (check proves both).
  - **Attract ad.** `attractFerry(gs)` sends a scripted ferry across the
    attract screen every 360 ticks (side/altitude alternate, one at a time),
    and the attract pilot leads it — the feature advertises itself. Scripted
    by tick, NOT dice: two different seeds see identical sightings, which is
    the check's proof the determinism story survives the ad.
- **SMART BOMBS (#3630) — the evasive warhead and its arcade counter.**
  Wikipedia (arcade article): "smart bombs that can evade a less-than-perfectly
  targeted missile", and verbatim: "The missiles of the center battery fly to
  their targets at much greater speed than those fired from the other two; only
  these missiles can effectively destroy a smart bomb at a distance." Atari
  1981 manual §6: the smart cruise missiles "can detect and evade your ABM
  explosions"; §7 hint 3: aimed directly on them "the enemy cannot detect your
  ABMs". Rules as built: entry from wave 7 (one guaranteed, +1 every four, cap
  two — the same §6 line that put ferries at wave 6, one wave behind, and the
  RNG stays untouched below the gate so waves 1..6 — and every saucer pin —
  replay byte-identical). A smart bomb senses live blasts within 60 px and
  in-flight ABMs within 70 px and sidesteps for 12 ticks, curving back onto
  its target — the bend in the trail is the read. The blind spot is the lead
  window: an aim within 32 px of the core at launch is undetectable, which is
  exactly what a 28 px/tick center ABM threads and a 15 px/tick outer one
  never can — the fast battery makes the expert's shot geometrically possible.
  Hard counter-rule: only center-battery fireballs kill it (25, arcade ICBM-
  class tax; VCS Table 1 bills cruise 125 — that slot already belongs to the
  ferry craft). The watch answers smart bombs only from the center battery and
  only with blind solutions, using the arcade's three-button law (any base may
  be told to shoot anywhere) so outer-sector bombs are still defended; a
  covered-until-lapse retry loop covers the dodge. The gunner branch is inert
  below the gate, so the waves 1..5 sweep proof is byte-untouched.
- **TWO-PLAYER ALTERNATING (#3630 slice 2) — the manual's own hot-seat.** Atari
  1981 manual §6, games 18–34: players take the board one wave at a time and
  both scores display. Rules as built: `2` at attract or game-over opens the hot-
  seat (`1` returns solo; the mode persists across restarts — Defender #3533
  convention; phones get a labelled tap button, never a second pad). P1 defends
  the odd waves, P2 the even; **cities and silos are shared**, so a burn on your
  wave costs your partner too — the strategy core of alternating play. The wave
  bonus pays whoever played the wave (`addScore` routes every credit — warhead 25,
  ferry 125, bonus — to the live seat); `gs.score` stays player 1's ledger and
  `gs.score2` only moves in 2P, so **every solo proof replays byte-identical**
  (§2player pins the dice-parity trace over 5000 ticks). Seat 2 is the CPU by
  default (AGENTS.md multiplayer law) driven by the certified `gunnerStep` — 8
  seeds hold the shared board with zero cities lost through a P2 wave. Two humans
  is the desktop keyboard option: WASD aims, F fires, and any P2 key joins
  mid-run ("PLAYER 2 JOINED" — the CPU yields its seat). Off-duty, P1's mouse/
  Space are asleep (the guard never spends the other seat's ammo); WATCH is
  solo-only — in hot-seat the gunner owns seat 2 outright. THE END names the
  winner over both books (equal books: A DRAW). Hand-offs ride real wave clears
  with a jingle — climbing for P2, descending for P1 — and the incoming
  defender is named on the WAVE COMPLETE card.
- **THREE-BUTTON LAW FOR THE PLAYER (#3695) — gap 1.** Wikipedia §Gameplay
   (verbatim): the player moves the crosshair by trackball "and pressing one of
   three buttons to launch a counter-missile from the appropriate battery" — the
   BUTTON names the launcher; only where you aim was ever the click law's
   business. The sim served the watch this way since #3630 (`cmd.silo`);
   `fireBattery(gs, idx, x, y)` is the same door, human side. Desktop: `1`/`2`/`3`
   during play fire the LEFT/CENTER/RIGHT battery at the live crosshair from any
   sector — key `2` is the expert's call, the fast battery reachable everywhere
   (manual §6: only its missiles outrun a smart bomb). Phones: the pad's B wears
   **FAST** (registry `pad`, dispatches `KeyB`, which the shell maps to the
   center battery; attract `2` keeps meaning "two player"). The mouse keeps the
   nearest-battery click law untouched, Space keeps crosshair fire — every
   existing solo/hot-seat proof replays byte-identical. Duds stay duds: naming a
   dead or empty battery spends nothing (never reroutes). Hot-seat: the battery
   keys belong to the seat on duty — same guard as Space; a human P2's own
   per-base buttons remain open work (see honest gaps). The HUD teaches it: each
   battery wears its key number; the center glows FAST while smart bombs are live.
- **Restart was missing entirely before the batch-15 port** — the GAME OVER
  screen was dead. `startRun()` now rebuilds cities, silos, ammo, score, wave
  and spawn state from any key, click, or canvas tap (phones included).
  Aim-with-mouse no longer silently leaves attract: a click starts the run.
- **WATCH (#1637 b29) — the proven route.** `gunnerStep(gs)` is the driver
  the Y seat runs, reactive per tick (Rogue law): it takes the LOWEST live
  warhead, re-simulates it with the engine's own discrete stepping, and fires
  at the earliest future point an ABM can meet it — centered at
  `SAFE_Y = 485` or above, which is out of every structure's 40 px reach
  (altitude is life, the arcade lesson). Each warhead gets one promised shot
  (`coverUntil`); when a cover lapses while it still lives, the next tick
  re-solves. Nearest silo by |dx| — the engine's own click law. Proof:
  every seed in the sweep clears waves 1–5 with **6 cities AND 3 silos
  untouched**, spending ≈ 1 ABM per warhead (79.8 avg vs 80). Deeper, the
  math gets honest: wave 11 spawns 32 warheads against 30 shells per wave —
  the sweep observes a deepest wave of 12, and no driver ever promised more.
  Seat: Y or the pill; ANY key, click, mouse move or board tap hands the
  crosshair back mid-barrage; watch never lingers into GAME OVER or a new raid.

## Verify
```
npm run missilecmdcheck             # 126 checks: raid replay, sweep 24 seeds waves 1-5 clean,
                                  #   doctrine pins (safe altitude, urgency, cover), saucers
                                  #   (byte-exact gate, entry/launch/kill/hold), deep doctrine
                                  #   A/B waves 6-10, juice, attract ad, smart bombs (speed
                                  #   split, gate, evade, blind-spot kill, center-only kill,
                                  #   wave hold, watch center doctrine), three-button law
                                  #   (#3695: fireBattery names its battery from any sector,
                                  #   per-battery speed, duds, click-law regression),
                                  #   2P alternating (flip seq, bonus attribution, shared
                                  #   board, per-seat credits, dice-parity trace, CPU-seat
                                  #   defense), wiring
npm run missilecmdcheck -- --mutant # 35 mutants, all must die
npm run mcbatterydrive            # live browser three-button drive (13 checks): FAST pad
                                  #   declared, KeyB spends ONLY the center magazine, keys
                                  #   1/2/3 launch their battery from a foreign sector and
                                  #   spend their own, mouse keeps the nearest law, key 2
                                  #   flies 28 at the gate, hot-seat duty guard, zero errors
npm run mc2pdrive                 # live browser hot-seat drive (needs the dev server): real 2
                                  #   key opens the mode, real keys fire P1's wave only, turn
                                  #   flips after wave 1, the CPU defends P2's wave, real WASD
                                  #   + F join, dual-score HUD pixels, winner card, zero errors
npm run mcsaucerdrive             # live browser ferry drive (11 checks): gate negative, probe↔pixels,
                                  #   attract ad, orange cruise-trail pixels, real mouse+Space 125
                                  #   kill with kill-juice sighting (needs the dev server)
npm run mcsmartdrive              # live browser smart-bomb drive: gate negative, speed split
                                  #   through the probe, probe↔core pixels, real mouse blind
                                  #   kill for 25, watch holds the wave (needs the dev server)
npm run watchcheck -- --only missilecommand  # live browser pilot (needs the dev server)
npm run feedbackcheck             # pin law + rollout floor (48)
npm run attractcheck              # attract screen rule 6
```

## Honest gaps
- **BLOCKED** The two-player game (shipped, #3630 slice 2) does not expose the
  arcade's game-number table (games 18–34 selected waves-per-game, starting wave
  and smart-bomb on/off with the dial). The structure is sourced (manual §6,
  quoted in Engine notes), but the per-number parameter values live only in the
  original's service/dial chart — not in this repo, and Wikipedia §Gameplay
  carries no variation table. FORGE.md's network boundary + the fidelity law
  ("the rules ARE the spec") forbid inventing arcade numbers, so this stays
  honest prose that declines: our hot-seat runs the default raid curve — one
  wave per seat, arrivals gated by wave as in solo. (#3695 §why-weakest has
  the full disposition.)
- **CLOSED by #3699** The arcade's per-base three buttons are exposed to the
  player — keys 1/2/3 name LEFT/CENTER/RIGHT and the phone pad wears FAST
  (`KeyB` → center battery), all firing at the crosshair from any sector; see
  Engine notes #3695. Human clicks keep the nearest-battery law; per-battery
  field-of-fire arcs (below) would replace both.
- Cities revive only between games (original revives every 10k points).
- The gunner is proven to wave 5 (the sweep's bar); ferries and (from wave 7)
  smart bombs make the deep arithmetic bind earlier (~wave 9–10 pays 28–30
  warheads plus the ferry salvo's cruises against 30 shells), so there losing
  cities is volume, not style — the §deep A/B proves the bonus adds nothing to
  that bill (the reserve rule holds the 125 until the magazine truly has
  surplus, and the watch never prioritizes the ferry over a city). The watch
  likewise holds fire on a smart bomb until a blind solution exists, and its
  smart-bomb branch is inert below wave 7, so the deep doctrine numbers were
  re-measured with the #3630 arrivals switched off at the source.
- Outer batteries fire by nearest-silo |dx| like the human click law — the
  original's field-of-fire arcs per battery are not modelled.
- In hot-seat the battery keys (#3695) belong to seat 1, same guard as Space; a
  human P2 still fires only the nearest battery on F — the arcade's three
  buttons for the second seat are open work (needs its own key triangle + HUD).
