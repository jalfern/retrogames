# STATE — session 280 (2026-11-15, slot a)

## Playable now / what shipped
- **MISSILE BATTLE plays like the arcade doctrine now (#2306 → PR #2308,
  merge `0c59e3a`, LIVE).** The autopilot hunted bombers *on purpose* —
  proven run 49 fired (was 60), all 4 bombers bagged, **14/14 scripted drops
  denied before delivery**, 0 cities lost, score 1865, every slack wave wins
  at 9/battery. Two root causes, one of them bigger than the gap:
  1. `decide()` opened with `if (!live.length) return {}` — a lone bomber
     means zero non-bomber enemies, so the whole bomber branch was
     **unreachable by construction** (the README had described its behaviour
     for weeks; the behaviour was of code that couldn't run).
  2. `spawnEnemy` hardcoded `y:-4` for every kind while the wave scripts
     declare cruise altitudes 38–56 that the script audit verified blindly —
     bombers were **invisible and invulnerable**: audit true of the script,
     false of the world.
  Doctrine: when nothing needs answering this tick, hunt the loaded bomber
  whose next drop is soonest; legal only while tube ammo > open-threat
  reserve (warheads not dying in a blast, not reserved by a shot in the
  air). Pre-drop kill 1 round vs ≥1 future intercept = net-positive denial.
  Gates: missilecheck BOMBER HUNT +9 pins (spawned `e.y` == script `y` and
  inside the aim band; NaN altitude throws at spawn; quiet-sky kill at 3
  rounds/tube below the old gate; held-tube refusal; whole-game denial
  counts). 378/378 incl. 6-mutant essay; two named manual reds (restore
  early-return → 2 fails; revert altitude → 4 fails), restored. missileplay
  26/26, zero page errors. lint mario/fps/ai + eslint + build. Prod
  bundle-verified by signature (`index-Be48Dg41.js` carries doctrine, no
  `>=7`).

## Ladder (this session's path)
- Warden target #1711 claimed-first → REFUSED (b held it, live checkpoints;
  b then shipped #2304 and released #1711 back to `next` — correct, big
  build's remaining stages are Jon-side).
- Normal ladder empty (no steer/next-claimable/game-queue; feedback #2303
  is `building-qa`; QA MASTER live on mini/mini2/studio → no borrow).
  Flagship stage **null** — every SSX/Emberwood/COMET DRIFT HD/Myst README
  gap is CLOSED-marked (they stayed in-file as shipped history, parseGaps
  filters them). Never-dry rung: `weakestStage` → MISSILE BATTLE score 3
  (3 open gaps, no QA names it, unheld; oldest tie). Filed #2306 first,
  claimed, shipped. Rule 4 streak: game code shipped.

## BOARD at exit
- building: #2307 (POLISH ARENA ARCHERY — other lane). game-queue EMPTY.
  building-qa: #2303 (HOMEBODY garbage day). jonq open: #2305 (lane:platform,
  AWAITING — not mine to wait on). No halt, no steer.
- #1711 `next` — Jon-side remainder (clap test at /retrogames/claptest,
  jonq #2305 write key). #2306 closed shipped.

## Next (slot a or b, in order)
1. Ladder as above; expect never-dry again. ArenaArchery is held (#2307) —
   next weakest candidates on score 3: DOGFIGHT, TEN-DEEP, PRINCE OF PERSIA,
   GARDEN GUARD, TIDY BOT, VIPER PIT, BRITANNIA, FLOOR BOSS, SHORT ORDER
   SHOUT, GRAVEL YARD, TALK ME DOWN, BOMB DEFUSE — oldest registry first,
   minus whatever lanes claim meanwhile.
2. MYST gap list is CLOSED-heavy (#838 owns it anyway) — flagship stage
   probably stays null until READMEs gain fresh gaps.

## The session's catches
- **An early-return can shadow a whole branch.** `if (!live.length) return{}`
  made the bomber doctrine unreachable whenever a bomber flew alone — the
  only case it mattered. Unreachable code reads plausible in review.
- **A spec field is not a fact until the sim compiles it.** Altitude was
  declared, audited, and ignored; the honest pin is spawned-state-equals-spec
  (now in missilecheck; README carries the rule).
- **Prod bundle verify for a shipped fix:** dynamic chunks are hash-named
  `index-*.js` inside the shell; enumerate the shell's refs, fetch each, and
  grep a *signature unique to the new behaviour* (minifier keeps property
  names and template text). Local dist hashes ≠ prod hashes — never compare
  filenames, compare contents.
- zsh: bare `echo ===` aborts a &&-chain (`=cmd` expansion); quote it.
- Fresh lane worktrees have no node_modules — `ln -s
  ~/Dev/retrogames/node_modules node_modules` is enough for eslint/vite/checks.

## Hygiene at exit
- Dev server :5173 stopped (mine only).
- Lane worktree retrogames-forge-missile-bomber-hunt removed after merge
  (branch gone via squash); main checkout re-detached at origin/main.
- STATE.md committed to main (game code merged — rule 9) + statepark slot a.
