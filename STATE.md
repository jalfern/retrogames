# STATE — forge board snapshot (slot a, 2026-11-23 — shipped)

## This session shipped
- **#3038 CONTRA — the cabinet's duck → PR #3039 → main `ec99753`, prod-verified.**
  Never-dry stage (kick `CONTRA -1 weak`: flagship spent; score 1 came from
  feedback #2971 naming Contra, README gaps all CLOSED/DISCLAIMER — gap scoped
  live from the cabinet: DOWN on the ground did nothing). `posture` per seat
  (0/1/2) in shared `seatStep`: DOWN edges cycle stand→kneel→prone (latch on
  hold), UP stands, jump stands (+still rolls), air never ducks, DOWN+jump still
  drops through. Muzzle 16/11/6 fires LEVEL; hit box tops 27/17/8 px so chest-
  line rounds pass OVER prone and head rounds sink under kneel; crawl half-speed
  is the trade; ground stays honest (blast off the lowered belly, contact off
  the feet, torrent unmoved). posture rides stateHash, zero gs.r, autopilot
  logs ZERO DOWN presses → every pre-duck seed/twin/pin byte-identical. Bonus:
  AIM DOWN now kneels the wingman. Proven: contracheck **278/278** (+8 legs),
  mutants **192/192** — duck-deaf, prone-immortal, no-crawl-price die by name;
  3 scoped lints + build green.
- Konami code #3037 (#3040, other lane) merged mid-session — main `3741df8`.

## PLAYABLE on main right now
- `/retrogames/contra` (+ duck #3038, somersault #3035, voice #3000, Konami
  code #3037, radio teach #3016), `/retrogames/minesweeper` (+ press-feel
  #3032, hall of fame #3026), `/retrogames/double-dragon`,
  `/retrogames/floor-boss`, `/retrogames/fire-crew`, `/retrogames/r-type`.

## Board at close
- `game-queue`/`steer`/`next`/`building`/`building-qa`: all EMPTY. `feedback`:
  only #2971 (waiting-jon — its last item needs a real phone take). No jonq
  open, no halt.
- `idle-kick` at close STILL answers `CONTRA -1 weak` — the score is #2971
  (open feedback naming Contra) and my merge can't clear it; #2971's items are
  trainable-adapter polish, NOT the duck. Next lane: do NOT re-file the duck
  (#3038 shipped) and do not re-file what slot b shipped (#3032); if Contra
  kicks again, scope a fresh live gap or note that the score is a waiting-jon
  artifact (the only question Jon ever sees from a dry shelf is "which new
  flagship title?" — one per lane per week, not yet used this week by slot a).
- #3014 STAGE — CONTRA attract-teaches-voice-orders sits unlabeled (`lane:
  games` only) — a label would honestly put it on the board; unlabeled = no
  lane may adopt it.

## Harness notes (new + carry)
- **Grade the player's own rounds: filter `pb` by `o === 0`.** The wingman's
  rifle streams into the same `gs.pb` (pushed after the hero's each tick) —
  `pb[pb.length-1]` is HIS bullet and a muzzle probe reads 16 while the hero
  fires at 6. Owner-tagged since #2814; use it in any bullet-origin leg.
- **A grenade at the feet grades CONTACT, not blast.** Bullet-vs-seat answers
  a falling `gr` round before the ground does. To prove blast law (or a
  blast-hiding mutant), drop the round OUTSIDE the ±7..9 px contact band but
  inside the 30 px radius — first prone-immortal probe survived its own cheat
  because the contact kill beat it.
- **Movement keys are held-state, not tap-latched** (only A/B taps queue).
  `keyboard.press('ArrowDown')` with no dwell evaporates between pads —
  live-key legs must `down` + ≥100 ms + `up`. (Jump legs survive because
  SPACE is latched — the asymmetry bites only non-jump keys.)
- Headless paint ~12 fps → poll for the repaint (bandana-red-in-band legs use
  any-frame + mean, not sleeps); prod-verify needs `curl -L`; the Contra game
  code lives in its own lazy chunk — grep `Contra-*.js`, not `index-*.js`.
- #3030 wrapper shape recurs: forge-merge printed the post-merge gh read-fail;
  rule-5 exit criterion = PR state (MERGED), cleanup by hand (branch gone,
  lane re-detached). Second session running; the law keeps holding.
- #2885 vine browser legs: documented advisory load-flake family — rerun once.
  #3018 gold-banner leg flaked once this session too, green on rerun, upstream
  of the diff. Never paper, never more than one PR on harness timing.

## Slots / ops
- Slot a port 5173: dev server stopped via `scripts/devstop.sh` at close ✓
  (never pattern-kill). Plumbing `~/Dev/retrogames` detached at origin/main ✓.
  Lane worktree `retrogames-forge-contra-duck` detached at origin/main (clean);
  purge cleaner may reap it — node_modules there is a symlink to the plumbing's;
  the purge must take the symlink before (or with) the dir.
- STATE.md committed to main this session (#3039 merged game code).

## Open questions
- None (see https://jalfern.com/retrogames/forge for the live board).
