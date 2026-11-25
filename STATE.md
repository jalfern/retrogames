# STATE — forge board snapshot (slot b, 2026-11-25 — THE BED THE PHONE COULD HEAR)

## This session — one ship landed + red main cleared
- Warden TARGET **#3336** claimed at the top (claim ok). Shipped **`a4dbafb`
  (PR #3391)**, issue closed `shipped`. Pinball SOLO-bed tail 2, item 1:
  **phone-speaker mix calibration**. Measured diagnosis (not vibes): the
  bed's bass (MIDI 28–33 = 41–55 Hz) sits 14–22 dB under the ~150 Hz phone
  knee, the lead idles ~85 % of the 4 s bar, bus destination gain is only
  0.016–0.048 — that's why it drowned under bumper volley (#3313 item 3).
  Fixed by VOICING, not gain (swell law is contract): new opt-in `mid` voice
  in AudioController `_schedule` (other tracks schedule byte-identically),
  `pinballSolo` walks a root–5th ostinato A3/E4·G3/D4·F3/C4·E3/B3,
  eighth-note pulse, square vol 0.3, band 164–330 Hz; cap peak ~18 dB under
  one bumper hit (#3304 discipline holds). `__audioMix()` gains `t`/`st`.
- **Item 2 NOT implemented** — tilt filter-muffle awaits Jon's #3335
  (AWAITING, default keep level-only). No building against an open decision.
- **Red main found and cleared (#5a)**: #3382 shipped `bg-black/35` in
  GALAGA's attract; attractcheck's ≥40 legibility law had failed `static` on
  every main push since (slot a's later merges rode the red unnoticed —
  main-ok only consults the nightly). One-token restore `/35→/40`, shipped
  **`8cf2bce` (PR #3397)**. attractcheck 694/694 local.

## Proof
- pinballcheck **279/279** (+12 §mix pins: swell literals 0.16/0.30/0.10/
  25000 + MUSIC_BUS + 0.02 quantize, opt-in exclusivity, chordal walk, duty,
  knee math, bed-under-volley ≥12 dB) — **14/14 mutants** (new `mix` mutes
  the mid in `_schedule`: data intact, wiring pin dies).
- pinballplay **64/64** live incl. 3 new mix legs: audio clock runs a full
  loop, phone-band OCCUPIED ≥60 % frames (measured 0.92–1.00 — the sparse
  lead idled there), post-knee mid/bass ≥3× (measured 4.4–10.6×).
  Thresholds are ratios: Chrome's analyser puts these notes at −71…−85 dBFS
  (measured) — absolute floors are engine normalization, not mix truth.
- eslint + lint:mario/fps/ai + build + contractcheck(pinball) 14/14 green;
  static passed on both PRs; prod bundle `index-DtDY9C2l.js` carries
  `mid:[57,0,64,…]` live on www.jalfern.com/retrogames/pinball.

## Harness lessons (worth one line each)
- **Rigs are sequenced by ball traffic**: a passive 5 s observation window
  between physics rigs gave a free-running ball time to spend the magnet's
  one-per-ball charge before magDrop — 2 reds. Moved the block after the
  restart leg (idle ball in the lane): 64/64. Observation is never neutral.
- Chrome AnalyserNode dB normalization at these bus levels (−71…−85) makes
  absolute spectrum floors engine-flavored; pin ratios of the same run, plus
  an audio-clock heartbeat (`t`) so a stalled thread can't fake silence.
- Red main hides from `main-ok` when the nightly predates the break: PR
  static is the earliest truth — the first lane to run a PR sees the red and
  owes the fix (#3397 pattern: branch off origin/main, ship first, rebase).
- Prod-hash verification needs a marker that survives minification — prose
  comments vanish; pin a data literal (`57,0,64,0,57`) instead.

## PLAYABLE on main right now
- `/retrogames/pinball` — SOLO bed now SUSTAINS on phone speakers (mid
  ostinato in the 164–330 Hz band), plus seam glide, heat tell, TABLE SMITH,
  garage, kits, orbit/magnet/kickback, two cabinets; `/retrogames/grind-city`
  thinking-bot trick lines (#3400); `/retrogames/skyward` wheels + bounce-tail
  2 (#3398); `/retrogames/tidal-rush` notch-safe HUD (#3392); galaga
  bee-fleet, mario-kart, ice-climber, marble-rush, comet-drift pair, ssx,
  marble-madness, pacman, mario, minesweeper/garden-guard/homebody, TIDY BOT,
  STARRY NIGHT, TOP SOLDIERS, DOUBLE DRAGON, RACCOON HEIST, spy-hunter,
  iron keep, missile, pucks, mines, zork, ultima, king's quest, Joust,
  Q*bert, forge board.

## Board watch (facts, not questions)
- At my close: `game-queue` EMPTY; `next` #1712 waiting-jon (not work);
  `building` clear; `building-qa`: #3395, #3344.
- If next claim is dry: builders-the-reverse → one `feedback` item if no QA
  MASTER is live, else never-dry weakestStage; flagship stages largely held.

## Open questions (links only — #605)
- #3335 — QA: music-bus low-pass in AudioController (AWAITING; if approved,
  #3336 item 2 follows the ensureAmb idiom — lazy node, driven from soloBed's
  tilt branch).
- #3054 — QA: native TestFlight ports have no recorder/upload (AWAITING; the
  device side of this calibration lives here).
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).
- No new jonq questions filed this session.

## Slot state at handoff
- Slot b: dev :5178 stopped via scripts/devstop.sh at handoff. Worktree
  `~/Dev/retrogames-forge-pinball-bed-tail2` detached clean at origin/main
  by mergeclean — remove when convenient (plus old clean squatters:
  …-forge-skyward-wheels-tail, …-forge-skyward-hud2, …-forge-skyward-bed).
- Game merged this session ⇒ this STATE ships via its own docs/state PR;
  parked at /tmp/forge/STATE.b.parked.md via statepark.
- Time-box: ~1 h 20 m of 3 h used at ship.
