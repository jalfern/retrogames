# STATE — session 108 (2026-11-03, slot a)

## Shipped this session (one merge on #1473 — pin 40→43, seedless 18→21)
**Batch 12 (`20529ce`, PR #1491)** — six titles join the seedpin contract:
PIN+REPORT ×3 whose seed machinery already existed: RallyCoDriver (STATE-noted
3× — report `{tick,timeMs,done,seed,lap}`, offline pin, lobby authority online),
Britannia (PREMISE UPGRADE: `fresh(seed)` is the whole world — human start was
hardcoded seed 0), IronRing (pin beats the Date.now LCG only when caller passes
no seed; online untouched). SEEDLESS ×3: MarioKart + PrinceOfPersia (rnd=0 whole
dirs, plain fixed worlds) and MomentumRunner (PREMISE CORRECTION: `makeGame()`
takes no seed, contractSeed inert → honest seedless report + joins DECO law;
6 audited deco lines, sim.js/attract.js zero entropy). feedbackcheck 217→223;
floors 40→43 + 18→21. Mutants ×2 RED→GREEN (pin ripped→honor law; report
ripped→deco+floor). Node tier: rallycheck 169, britanniacheck, runnercheck 175,
kartcheck, popcheck 366, ironringcheck part A 25/0. Live: entry `index-DsxTqety.js`,
Vercel green for `20529ce`. Box Chrome still aborts (mach_port, #737) — part B
and shot.mjs both unusable locally; static+Node tiers carry the proof load.

## Board (end of session)
- main = `20529ce` (this session's STATE commits on top if pushed). #1473 stays
  `building` (multi-stage): ~12 arcade titles remain, ALL pure-RNG classic ports
  needing real work (no quick wins left among the easy 18).
- Remaining backlog (audited rnd counts at `dd62c58`): Asteroids 14, SuperMario 11,
  Defender 12, Frogger 9, Adventure 8, Pacman 7, Pong 6, RaccoonHeist 6,
  MissileCommand 5, SpaceInvaders 2, Centipede 2, Rogue 3. Plus 7 js-dos/ifvms
  shells (KingsQuest, Ultima1–5, Zork) — treat as out of scope (emulator owns
  the world; no JS-side report semantics).
- Rogue (rnd=3) is the natural batch 13 anchor: 3 Math.random lines = classic
  seed-param port (DonkeyKong precedent: move gameplay RNG into seedRng(seed),
  regenerate at every human start, seedparam laws like the DK block).
- Open issues: #1473 (slot-a), #1490 (waiting-jon/question — AWAITING, deadline
  11-05; do NOT re-ask), #1141 (stalled, Jon), #838 (lane:games — likely
  completable, NOT adoptable), #795 (pulse), #737 (waiting-jon), #549 (parked).

## Rule-4 count
NOT tripped: batch 12 merged game-adjacent code this session (dry streak = 0;
sessions 106/107 were dry on b but 108 shipped). PR variant: last 4 merged PRs
(#1486–#1489 + #1491) all touch src/games/**.

## Notes for the next lane
- Batch 13 candidates ranked: Rogue (seed-param, 3 sites) → SpaceInvaders (2:
  shooter pick — may be DECO-unfit, it's gameplay → seed-param) → Centipede (2:
  mushroom spawn = gameplay → seed-param) → Pong (6: serve/spin = gameplay →
  seed-param) → then the big ones (Defender/Asteroids/Frogger/Pacman/MissileCommand/
  Adventure/SuperMario/RaccoonHeist). Audit per title whether each Math.random line
  is gameplay (→ seed-param port + seedparam law) or deco (→ DECO law).
- Report-shape regex trap (#1473): the seedless counter and honor-law scan the
  file TEXT — `seed:` inside DEV-only exposeGame state AFTER an
  exposeFeedbackState call reads as a seed report. Put seedless reports AFTER the
  DEV block (see MomentumRunner) or the title is forced into the pin law.
- ENV: `source /tmp/forge/netenv` before gh (proxy + gh-shim: no `issue view`,
  no `pulls?state=open` short path — use `repos/jalfern/retrogames/pulls`; quote
  URLs in zsh). macOS: no `timeout`, `cat -A`; `cp a b c` treats last arg as dir.
  `pgrep` broken — QA liveness = `ps aux | grep "QA MASTER"`.
- Worktree node_modules: symlink the main checkout's (`ln -sfn`), lockfile identical;
  ironringcheck part A then runs. ironringcheck part B + shot.mjs need Chrome (#737).
- slot-a shipped; slot-b starvation question remains #1490 (answer/default will
  decide whether b gets sub-issue slices).

## Open questions
- #1490 — slot-b feed on #1473 (split vs serialize). Link only; body on GitHub.

Game merged this session ⇒ STATE.md committed to main (rule 9), parked via
`statepark.mjs park a`.
