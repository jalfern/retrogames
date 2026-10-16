# STATE — 2026-10-16d (forge session, GAME CONTRACT shipped — #377 closed; Civ V polish resumes next)

## Shipped this session
**GAME CONTRACT — one `window.__game` API** (#377, `next` label; PR #378
squash-landed as 0ddb34f; static+smoke+Vercel green; prod deploy verified on
main@0ddb34f):

- `src/utils/gameContract.js`: `exposeGame(spec)`/`unexposeGame()` build the
  uniform DEV-only surface + a module-level loop lock. First `step(pad, n)`
  closes the lock — the rAF loop stops simulating (keeps drawing) until
  `release()`; the driver owns the clock. Prod bundles contain ZERO `__game`
  refs (grep-proven in dist and live).
- API: `meta{id,buttons}`, `reset(seed)` (all sim randomness from the seed),
  `step(pad,n)`→`state()` (`pad={up,down,left,right,a,b,start,x,y}`),
  `state()` JSON ⊇ `{tick,score,done}`, `frame()` PNG data URL, optional
  `snapshot()/restore()`. Documented in **docs/GAME-SHELL.md** (new file —
  AGENTS.md referenced it but it never existed).
- Pilots: LUNAR LANDER (`x/left/right`→rot, `a/up`→thrust) + TEMPEST
  (`left/right`→rim, `a/up`→fire). `__landerTest`/`__tempestTest` kept.
- `npm run contractcheck` **26/26**: boot, meta, API surface, frame PNG,
  reset→tick 0, 600-tick live run, seed-7-twice identical final JSON AND
  per-100-tick hashes, seed-9 differs, snapshot/restore round-trip,
  release resumes rAF loop, zero page errors. Mutant: `Math.random()` into
  Lander `spawnLander` vx → both seed-7 checks red; restore green.
- Issue says stop there: no other games wired, no Python, no AGENTS.md rule.

Gates: lint:mario/fps/ai + build green. Dev servers: 5173 belongs to the
civv-polish lane — contractcheck ran against a private `:5199`
(`CONTRACT_URL=http://localhost:5199/retrogames`).

## GOAL — next session
**Resume #375 — Civ V polish** (Jon paused it at engine+§34 pending #377).
Corpse-ready branch `origin/forge/civv-polish` @ bd878a5: transports +
amphibious assault (Galleon hold 2, embark/land/drown, cargo in the hash),
civcheck 469/469, capacity mutant proven. Remaining per its last FORGE
comment: civplay (item 6 de-vacuum — seed 1 capital inland, poll-K pattern),
README, gates, PR. Open in worktree `~/Dev/retrogames-forge-civv-polish`
(branch already checked out there). #372 (stage-7 polish, QA lane) and #373
(Marble Madness, other lane) stay put.

## Board (last read)
- #377 Game contract — CLOSED this session (`shipped`).
- #375 Civ V polish `game-queue` — **the next goal** (branch has the engine).
- #372 Civ V polish `feedback` (QA lane). #373 Marble Madness `building` (other lane).
- Rule-4 satisfied: PR #378 touched src/games/** (both pilots).

## Notes for whoever picks this up
- Contract lock lives in `gameContract.js` (`contractHoldsLoop()`); pilots
  check it in `frame()` (`acc=0` while held). New game adopters: wire inside
  the existing `if (import.meta.env.DEV)` block, `unexposeGame()` in cleanup.
- Determinism law: sim randomness from rng.js mulberry32 only; `Math.random`
  allowed for juice (particles/shake/stars) — anything reaching `state()` is
  a contractcheck-red bug. Include the game's own hash in `state()` (Lander/
  Tempest do; hash equality is the sharpest determinism probe).
- contractcheck entry-hash trap: prod `index-*.js` may keep its hash across a
  merge when entry content doesn't change — verify deploys via
  `gh api repos/jalfern/retrogames/commits/<sha>/status` (Vercel context),
  not by polling the entry hash.
- Rollout is Jon's call (issue's stop point) — don't wire other games unprompted.

## Three questions for Jon
1. Contract pilot is live in the repo. Roll `__game` out to the rest of the
   catalog (which order — is the RL wrapper waiting on Tempest-class 3D or
   pixel titles first), or hold until you've driven the two pilots yourself?
2. Civ V polish resumes next session on forge/civv-polish — confirm, since
   you paused it ("resume after #377 ships")?
3. Tempest's human `goPlay()` still rerolls its seed with Math.random (arcade
   law), while `__game.reset(seed)` bypasses that. Keep both laws, or should a
   human run be replayable by exposing the rolled seed (e.g. `state().seed`
   already does — is that enough)?
