# STATE — forge board snapshot (slot b, 2026-11-25 — TIDAL RUSH FLIPS FIVE)

## This session — one ship, landed
- Warden target **#3237 PINBALL** REFUSED at claim (slot a held it live; slot a
  shipped it as #3275 during my session — good). Normal ladder: no steer, no
  actionable `next` (#1712 waiting-jon), `game-queue` empty, unowned feedback
  existed (#3272, #3233) but **QA MASTER live on studio+mini → no borrow** →
  never-dry. Live `idle-kick` = `KICK TIDAL RUSH 0 weak`.
- **NEVER-DRY #3276 DONE: TIDAL RUSH five airborne verbs** (`d0c2c77`, PR #3278).
  - BACK FLIP +300 (brake ALONE airborne; charge +0.34) / HANDSTAND +150 per
    0.5 s inverted, cap 3 (gas+brake past vertical). One-trick law stretched
    whole: a paid handstand lands spin/barrel/flip inert (mutant `handcmit`
    proves the lockout is load-bearing — it also killed the old air-bonus pin).
  - Six-bit wire untouched (flip=d, handstand=u+d) — lockstep hashes the new
    verbs for free (#3244 item 6 law); autopilots never brake ⇒ tricks are
    committed inputs; rivals seeded to flip (armed 2).
  - tidalcheck **155/155** (+6 pins incl. determinism-with-tricks) + mutants
    **3/3 CAUGHT** (fliphalf/handcap/handcmit). tidaldrive **16/16 live** on
    :5178 (HANDSTAND paid seed 5, FLIP +300 banked, race won rank 1, zero errs).
  - Prod verified: `TidalRush-Dr5M5Ono.js` carries `flipAng/HANDSTAND`.
    Play: `/retrogames/tidal-rush`. #3276 shipped+closed.
- **Rule-8 catch worth repeating:** idle-kick pointed at gap index 0 — that gap
  (desync receipts) had ALREADY shipped hours earlier (#3247); its README entry
  was never struck. Struck it (+ the podium one, #3253) in this PR. QA/builder
  lanes: **strike honest-gap entries in the PR that ships them** or they
  phantom-kick the next slot.
- **QA tail filed: #3281** — grab poses, inverted splash, phone discoverability
  of the two new verbs, charged-trick economy question, attract flip show-off.

## Harness lessons (worth one line each)
- Unstruck README gap entries = phantom kicks: weakestStage trusts the README,
  so a shipped-but-listed gap scores and claims a whole session's pick.
- Browser trick drives need LIVE-sim evidence (`flip` sign/`hsPaid` mid-air),
  never fading banner text — pops linger and lie about which trick just landed.
- Seed-retry (reset via `__game.reset`, up to 4 seeds) makes real-key natural
  kickers reliable without rigging the sim; release every key in a finally.

## PLAYABLE on main right now
- `/retrogames/tidal-rush` **flips+handstands** (#3278) + rooms/spectate/rejoin,
  `/retrogames/pinball` attract show-off (#3275) + art kits + kickback,
  `/retrogames/skyward` living storm (#3271), `/retrogames/grind-city` roof
  callout (#3279), mario-kart (tilt), ice-climber, marble-rush (tilt, trick
  hop), comet-drift pair (tilt), ssx (tilt), marble-madness, pacman, mario,
  minesweeper/garden-guard/homebody, TIDY BOT, STARRY NIGHT, TOP SOLDIERS,
  DOUBLE DRAGON, RACCOON HEIST, spy-hunter, iron keep, galaga, missile, pucks,
  mines, zork, ultima, king's quest, Joust, Q*bert, forge board.

## Board watch (facts, not questions)
- `game-queue` EMPTY; `next` #1712 still waiting-jon (not a work item).
- QA holds: #3233 GRIND CITY, #3244 TIDAL RUSH relay-run (waiting-jon),
  #3272 SKYWARD tail, new #3281 TIDAL RUSH tricks tail. #2971 contra waiting-jon.
- Next builder claim: run `idle-kick` LIVE — never trust this file.
- Nightly: main-ok green at session start and at merge; today's merges incl.
  #3275 #3278 #3279.

## Open questions (links only — #605)
- #3054 — QA: native TestFlight ports have no recorder/upload (lane:qa, AWAITING).
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).
- No new jonq questions filed this session.

## Slot state at handoff
- Slot b: dev :5178 stopped via scripts/devstop.sh. Worktree
  `~/Dev/retrogames-forge-tidal-tricks` detached clean at origin/main by
  mergeclean; remove it when next convenient.
- Game merged this session ⇒ this STATE.md ships via its own docs/state commit;
  also parked at /tmp/forge/STATE.b.parked.md via statepark.
- Time-box: ~2 h 40 min of 3 h.
