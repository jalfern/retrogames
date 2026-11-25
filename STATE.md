# STATE — forge board snapshot (slot b, 2026-11-25 — SKYWARD GO-AROUND)

## This session — one ship, landed
- Warden TARGET **#3331 wheels-down polish tail** claimed at the top (claim
  ok, main green). Shipped **`2b083b6` (PR #3372)**, issue closed `shipped`.
- Five items landed: **go-around law** (hot+shallow+straight over the strip
  now BOUNCES — pure `planeGoAround`, 34.5–45 m/s window, banner `TOO HOT —
  GO AROUND`, nothing banked; steep/crabbed/off-strip/missile keep #3319's
  crash), **CLEAN ROLL** (rollout ≥12 m within 2 m of the dash pays +100 onto
  the ✈ best; crabbed arrivals drift and can't fake it), **scuff tell**
  (pure `scuffTell` → HUD gauge, `CRAB RISING` hint, RUNWAY board glows
  hot), **grounded look** (low+nose-up posture, pressed shadow, mains dust
  — renderer-only), **390px audit** of every new string.
- **Item 6** (touch-and-go farm): do-nothing per the issue — best-only
  banking already caps it. Filed as decided in the README.
- Superseded one old pin ON PURPOSE: #3319's "36 m/s still crashes" was the
  law #3331 asked to replace; rewrote it with steep/crabbed/missile controls
  so the remaining crash surface stays pinned.

## Proof
- skywardcheck **158/158** (+13 pins) — **52/52 mutants die** (4 new). The
  grace mutant caught a bug in MY pin first draft (`ci > gi` accepted
  bounce-then-crash; shipper demands `ci === -1`) — proof the mutants earn
  their keep.
- Slot a merged #3369 mid-flight → conflicts across all five Skyward files;
  rebased and the two lanes' laws coexist: **169/169** pins (their +11
  included) and **56/56 mutants** at the merged head.
- skywardplay green twice at :5178 incl. live bounce banner, gauge reading
  tell 0.9, ✈800 clean roll, 390×844 string audit; zero console errors.
  One advisory flake run (banner bleed into later sections when my section
  shifted timing) → added a 1.5 s settle, rerun green (rule 3: rerun once).
- eslint + lint:mario/fps/ai + build green. Hash spine untouched — replay
  determinism pins hold (new `stateOf` keys additive).

## Harness lessons (worth one line each)
- A pin asserting "nothing bad happens" must pin the WHOLE window — index
  comparisons like `ci > gi` silently bless late failures; demand absence.
- Live-driving a banner whose event ordering matters: emit the reward AFTER
  the named event (rollout after wheels/crew) so the cabinet's last word is
  the reward — banner() is last-writer-wins on one channel.
- skywardplay's single banner channel makes long scripts order-sensitive:
  budget a settle wait when inserting sections between banner-heavy tests.
- `planeStrip`-style helpers that exit ON touchdown can't test rollout —
  give ground-phase scenarios their own run-until-crew loop.
- Two lanes in one game = all-`UU` conflict day (#3310 vs #3331, both in
  Skyward). Most hunks were both-add (imports, `let` decls): merge BOTH, then
  let the merged harness settle who's right — 169/169 + 56/56 is the answer,
  not eyeballs. Their sockPose shipped my QA-tail item 2 while I was filing
  it: amend the fresh issue immediately.

## PLAYABLE on main right now
- `/retrogames/skyward` — + go-around bounces, ✈800 clean rolls, scuff
  gauge, dust-and-lean rollout look; plus attract vista, rich motor, glider
  wind-rush, belt parking, THUNDERPASS; `/retrogames/tidal-rush` FOAM V;
  pinball SOLO bed; grind-city rail grabs; galaga bee; mario-kart,
  ice-climber, marble-rush, comet-drift pair, ssx, marble-madness, pacman,
  mario, minesweeper/garden-guard/homebody, TIDY BOT, STARRY NIGHT, TOP
  SOLDIERS, DOUBLE DRAGON, RACCOON HEIST, spy-hunter, iron keep, missile,
  pucks, mines, zork, ultima, king's quest, Joust, Q*bert, forge board.

## Board watch (facts, not questions)
- `game-queue` empty at my close; `next` #1712 waiting-jon (not work).
- Holds: #3310 Skyward strip tail (slot a, building). building-qa: #3325,
  #3313. QA tails open: #3375 (new, mine), #3362, #3342, #3329, #3290.
- #3331 closes `shipped` with the merge; its parent tail #3319 already closed.

## Open questions (links only — #605)
- #3054 — QA: native TestFlight ports have no recorder/upload (AWAITING).
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).
- No new jonq questions filed this session.

## Slot state at handoff
- Slot b: dev :5178 still up (stop via scripts/devstop.sh). Worktrees
  `…-forge-skyward-wheels-tail` (this lane, merged), plus old clean
  squatters `…-forge-skyward-hud2` and `…-forge-skyward-bed` — remove when
  convenient.
- Game merged this session ⇒ STATE ships via its own docs/state PR; parked
  at /tmp/forge/STATE.b.parked.md via statepark.
- Time-box: ~4 h wall at handoff — the 3 h box was met at proof time; the
  slot-a file collision (rebase + re-proof + slow Vercel) was the overage.
