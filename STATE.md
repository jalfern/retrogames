# STATE — session 218 (2026-11-11, slot a)

## What shipped
**FROGGER: PROVEN CROSSING DRIVER** merged as `6f7df8f` (PR #1986, part of
#1637 — batch 25 of the WATCH rollout). The old attract brain was greedy/
random and unproven, so b25 built a real driver: `watchStep` in
`src/games/Frogger/sim.js` scores all nine candidate hops by replaying the
game's OWN forward arithmetic (analytic lane spans with drift + speed ramp,
dive phase, crush, off-board, clock) under a greedy continuation. No `rand` —
the Node sweep and the browser seat steer one identical policy. Reactive per
tick (Rogue law): seats anywhere, any input takes over, re-seats from live
state, silent release at game over. The whole tick-rule set lifted into
`sim.js` (`makeRun`/`hop`/`tickFrogger`) so `froggercheck` proves shipped
physics; shell keeps draw/sound/chrome/seat.

Sweep floors (40 seeds × 120 s, watching, pinned in froggercheck): 40/40
seeds replay byte-equal, 40/40 bank ≥1 level, 36/40 zero-death, ≥20 homes
per seed, ≥1800 homes total. froggercheck 30/30 + 13 mutants die (3 new
driver mutants: muted planner, home-earliness, shuffle-back). Two rules the
sweep earned (documented in README + sim comments): home landing scores
`1e6 + HORIZON` (dt-0 earliness parity or the frog procrastinates past the
door), and row-1-with-all-houses-behind shuffles back onto the opposite-drift
lane. Chrome: shared blips + WatchToast + attract hint + AttractWatchButton +
registry WATCH_HELP line. `__game` QA contract newly wired (frogger in
contractGames; contractcheck 14/14, FNV `stateHash` in sim). watchcheck
frogger pilot + b25 source pins; Frogger added to ARCADE list.
Live: jalfern.com/retrogames/frogger (registry marker verified in prod
`index-BBbmnu-I.js` via cache-busted BFS, 64 chunks).

## The session's catches
- **Mutate runs are not reentrant, and a harness timeout may detach, not
  kill.** A 300 s-capped `froggercheck --mutate` outlived its cap while a
  re-run started; the two loops interleaved plants and each recorded the
  other's in-flight plant as its "original", leaving three source corpses
  (`?seed` pin stripped in index.jsx, fly-dice `Math.random` in sim.js,
  attract `DIM` transparent). A plain gate that "should" catch them passed,
  because the re-run faithfully restored the corpse it remembered. Scrubbed
  by grep for every MUTANTS `from:` fingerprint; re-verified 30/30 + 13/13.
  Lesson: give `--mutate` exclusive access and ≥ 20 min; after any killed
  mutate run, grep the mutant fingerprints before trusting the tree.
- **watchphonecheck's 24% band law bites fresh chrome.** The attract ▶ WATCH
  wrapper must sit at `bottom: '24%'` (clear of the phone pad zone) — 10%
  passed the local eyeball but went red on static. Copy the shared wrapper
  from Pong/SpaceInvaders when adding attract WATCH.
- **Score sums can hide dice bugs**: fly-house +200 lands regardless of WHICH
  house is the fly, so a cross-process replay hash that tracks score only
  never notices an unseeded fly draw. The source pin (`no Math.random in
  sim.js`) is what guards this class.

## Ladder trail
- halt none; steer none. TARGET #1637 claimed via forge-claim.sh (free),
  batch 25 = FROGGER per b24 audit (remaining unseated: Asteroids,
  DonkeyKong, Centipede, Pitfall — none has a proven driver yet; the same
  lift-into-sim + sweep pattern applies).
- Advisory reds on PR (smoke/prsmokes) pre-existed on main's line
  (civilization-v/blob-battle/iron-ring pilot flakes); static green both
  pushes; rule-5 merge clean. Nightly on main was `cancelled` at gate time
  (not blocking per main-ok.sh; the 16:43Z nightly before it was success).

## Open questions
- none filed this session (no taste/priority calls needed; all decisions
  were pattern-following from b24).

## Next
- Batch 26 (#1637): first title of the remaining four whose rules support a
  exhaustive-search driver. Audit suggests PITFALL (deterministic board,
  single avatar, solvable by BFS like LodeRunner's planner) — claim with
  `scripts/forge-claim.sh 1637 <slot>`; if the claim lands on a title whose
  sim isn't yet Node-proofable, lift-into-sim first (the b25 pattern).
- Dev server habit: `npm run dev -- --port 5173 --strictPort`; run
  `--mutate` ONLY in an exclusive window with a ≥20 min budget.
