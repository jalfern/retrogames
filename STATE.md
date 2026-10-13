# STATE — forge session 2026-10-13 PM (kart QA)

## Shipped this session
- **#197 MARIO KART QA polish MERGED + LIVE** (PR #198, squash; `static` green incl.
  kartcheck+mutants; prod verified: real Chrome at 390x844 on jalfern.com/retrogames/
  mario-kart — attract paints with pad withdrawn, tap starts race, 0 page errors).
- **The pack was never racing (root cause):** CPU apex aim ignored target DISTANCE —
  at launch (look=4, ~34px) the ±75px apex ask = 70° bearing, front row launched
  sideways, grip=v/2.2 crawled them (DAISY 5th despite top skill — she grid-row-0'd
  into the corner's curvature). Plus: kart contact clamped the faster kart to the
  slower's pace EVERY tick (queues, no overtaking), and one flat fear constant (0.041)
  was the real pack-sorter, not `skill`. Fixes: aim capped by look distance (sim AND
  planner — the player's phantom thumb got the same ask after mid-corner spins),
  contact shaves speed DELTA, fear scales with skill. Planner brake was a ±25%
  bang-bang on 0.24 brake — dove a full m/s under every apex; now a short band.
- Numbers after: autopilot GP win 52.8s (was 67s procession); CPU laps 11.6-11.9s
  vs player 9.9s; nobody lapped by >1.3; slack (zero boxes) wins 53.1s — the win is
  pace+aim, not items. Crude centerline "human" driver: 5 laps, 0 wall taps, holds
  R248 at 8.8/9.2; flat-out yaw budget at R201 = 2.7 needed vs 3.3 plain / 5.0 drift.
- UX: pad withdraws from attract/end, **real canvas pointerdown starts the race on
  phones** ("PRESS ANY KEY / TAP"); best lap persists `localStorage['arcade.kart.bestLap']`
  (renderer-side; sim stays hash-for-hash). Banana density left as-is — gates watch.
- kartcheck +pack gates (worst pace ≤15s, rival reaches lap4, lapped-by-2) +human
  gates (5 laps <100s, ≤3 wall taps). Mutant 2 = the ENTIRE historical disease
  (flat fear + welded contact + uncapped aim); each piece ALONE proved
  system-absorbable in the balanced build (all three tried solo — the harness
  comments record it). 2/2 mutants die. kartplay 13/13 with tap/pad/persist checks.
- Filed **#199** (round 2: raceable ghost, lap table, second circuit, paperplay
  band-check flake — it flaked red once on #198's smoke, rerun green, local 24/24).

## Lessons paid for this session
- A skill scalar that never touches the brake line is theatre: fear was sorting the
  pack, skill was decoration. Pack-spread (pace, laps, cut) is the number that names
  "the CPUs are broken" when every per-kart check reads healthy.
- Mutants must produce the historical RED or they're fiction: single-fault mutants
  died instantly (system-absorbed), so #197's mutant is the whole old machine.
- Pixel gates on the shared runner (paperplay band check) need one more immunity
  pass; don't spend the game lane's time on them — it's #199's now.

## Next session (queue is EMPTY again)
1. #199 QA round-2 items — ghost + lap table are self-contained, no Jon decision needed.
2. Or Jon's answer to the questions below gates a second circuit.

## Harness commands
- `npm run kartcheck [-- --mutate]` (CI gate), `npm run kartplay` (dev server;
  KART_URL override), `npm run lint:kart`. kartplay now covers tap-start + pad
  withdrawal + persisted lap in a real phone-scale browser.
- Worktrees: `~/Dev/retrogames-kart` detached at `origin/main` (dev server running
  there on 5173); main checkout detached at origin/main as ever.

## Three questions for Jon
1. Second circuit (chicane GP, track.js-only per #199) — build it, or keep Classic
   as one honest circuit? (Re-asks #197's parked decision; the audit machinery is ready.)
2. Raceable ghost: best-personal pace or the certified autopilot line as the phantom?
   (Attract already replays the proven GP; the phantom only needs the kart slot.)
3. #197 proved pack telemetry was missing — should the warden's board show kartcheck's
   pace table per game (a `--json` flag on pace gates is ~10 lines), so the next
   "healthy-but-broken" pack shows on the board without a session spending its hour?
