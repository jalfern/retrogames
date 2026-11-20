# DOUBLE DRAGON — S1 "Walnuts Street"

Jon's #2795 commission ("both flagships starting with double dragon"), stage 1
of Technōs Japan's 1987 arcade belt-scroller. Issue: #2807 (S2–S4 to follow).

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

## Honest gaps (S1 by design — the S2–S4 map on #2807)

- Single stage; the city and the hideout (S3) are still to come.
- Thrown knives, whip, smashable barrels — S2 weapons wall.
- No second player yet; S4 seats CPU-ally Jimmy by default (Jon's rule), then
  the keyboard drop-in.
- No combos/chain scoring bonuses; the original scores per-KO with a simple
  chain multiplier — carry added, chain not.
- Marian is not kidnapped yet (she rides the S3 story).
- Enemy knockback is positional, not sprite-true physics; fine at this scale.
