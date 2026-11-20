# DOUBLE DRAGON — S1 "Walnuts Street" + S2 "the weapons wall"

Jon's #2795 commission ("both flagships starting with double dragon"), stages 1–2
of Technōs Japan's 1987 arcade belt-scroller. Issue: #2807 (S3–S4 to follow).

## Layout

- `sim.js` — the whole game, DOM-free: waves, enemy FSM (enter/walk/windup/
  attack/back/stagger/down/getup/grab), Billy's move set, stick pickups, the
  wave-lock camera, scoring, `autopilot` (attract demo + harness brain),
  `stateHash`. The rng rides IN `gs` (`rngState`, `nextId`) so snapshot/restore
  is byte-exact (#391).
- `art.js` — night-suburb backdrop (sky gradient + stars + moon, parallax house
  silhouettes with lit windows, pylons and sagging wires, chain-link + hedge,
  asphalt with deterministic grain, sodium-lamp glow pools), the pixel fighters
  (one parameterised `fighter()` per palette/pose), HUD, banners, and an
  original 5×7 arcade font (43 glyphs, width-checked).
- `index.jsx` — shell per docs/GAME-SHELL.md: one rAF loop, fixed timestep,
  attract-first, `?` PauseOverlay, `tapStart`, pad, DEV hooks, contract.

## The laws this game lives by (all pinned by `ddragoncheck`)

- **Depth is the dodge.** The street is a band (`DEEP_TOP..DEEP_BOT`); a swing
  only connects when `|dy| <= 8`. That single line IS the genre — `--mutant`
  plants a depth-blind hit and the check names the harm.
- **Arcade lethal.** One clean enemy hit costs a life; 3 lives; 100-tick
  respawn flicker.
- **Telegraphs.** `windup` (12 ticks) precedes every `attack`; hitting a goon
  in the windup staggers their turn away.
- **Crowd law.** At most two goons may windup/attack at once (`attackersMax`).
- **Spin back-heel** fires when a swing is asked for with two live goons within
  radial reach — boots both ways.
- **Grabs** (Amon/Abobo): mash KICK 3× within `grabTimeout` (52 ticks) or the
  knee takes a life.
- **The charge** (#2810): from mid-distance Abobo telegraphs 16 ticks of
  run-up (`chargewind`), then body-checks the lane at 2.8px/t until it leaves
  the frame — depth still decides; a committed dash whooses past an empty lane.
  The autopilot reads the telegraph wider than a punch's and sidesteps.
- **KO flash**: `gs.scoreFlash` rides the HUD (delta popup + three wave ticks);
  juice only — never mixed into `stateHash`.
- **Stick**: armed Amon drops it on KO; reach + damage double; it dies with you.
- **Stage loop**: three waves → banner → Walnuts Street re-runs, score carries.

S2 (the weapons wall, #2807):

- **Contextual PUNCH** — bare = jab; knife = THROW (the delivery, not a wave);
  whip = LASH. KICK stays a kick whatever you hold.
- **Reusable steel** — a thrown knife flies flat down its lane (4 dmg, kills a
  Williams outright) and lands back on the street as a pickup, hit or missed.
- **The whip** — reach 34, catches EVERY standing man on the line, and skips
  downed ones (standing swings don't stomp; the lash doesn't either).
- **Barrels are solid.** Three squat on the street; Billy and the goons must
  ask `blocked()` and walk round them — or hop the waist-high ones (z > 8).
  Three clean hits splinter one: +100, and it spits out the steel inside
  (knife / whip / stick, seeded). Two traps this taught, both pinned: a goon
  slipping off a barrel must move AWAY from its lane (re-deriving the slide
  direction from the current y ping-pongs on the mid-line), and a body in the
  footprint corner has both axes blocked — `stuckFree` slides depth to the
  nearest open lane.
- **One weapon in hand** — walking over a second weapon while armed does
  nothing; death costs what you hold (the stick law, generalized).

## Controls

Arrows walk (UP/DOWN = depth) · SPACE jump · X kick · Z punch · ? ops card.
Pad: JUMP / KICK / PUNCH (`thirdAction`, #2324).

## Verify

```bash
npm run dev -- --port 5173 --strictPort   # one terminal
npm run ddragoncheck                    # 42 checks: boots, laws, charge, winnable 12/12, browser leg
npm run ddragoncheck -- --mutant     # depth-blind AND charge-blind plants must go RED (named)
CONTRACT_ONLY=double-dragon npm run contractcheck   # window.__game contract leg
```

Roster notes: joined BOTH lists at once — `scripts/lib/contractGames.mjs`
(and its PATTERNS) and the `nightlybot.mjs` soak roster (#1525 law, the lesson
of nightly 44762398189).

## Honest gaps (S2 by design — the S3–S4 map on #2807)

- Two stages; the hideout and Marian's rescue (S3) are still to come.
- No second player yet; S4 seats CPU-ally Jimmy by default (Jon's rule), then
  the keyboard drop-in.
- No combos/chain scoring bonuses; the original scores per-KO with a simple
  chain multiplier — carry added, chain not.
- Marian is not kidnapped yet (she rides the S3 story).
- Enemy knockback is positional, not sprite-true physics; fine at this scale.
- Goons don't wield knives or the whip yet (S1 law: only the stick rides an
  armed Amon); and the thrown knife is Billy-only — the original's goons
  never threw steel either.
