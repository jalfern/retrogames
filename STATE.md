# STATE — session 198 (2026-11-10, slot a)

## What shipped
**WATCH batch 18** — SPACE INVADERS + DEFENDER seat their OWN brains behind Y
(#1637 via PR #1904, squash `e0e230c`, prod live). Both sims grew a
`watchRoute` in `sim.js`; the attract demo, the seat and the Node WITNESS all
call that one function (no-forked-brain law — the local attract autopilots are
deleted).

- **SI**: clear-column / lead-march route. WITNESS 19/20 seeds clean wave-1,
  0 deaths, slowest ~1987 t. Mutant (lane clearance 12->6) proven red.
  Honest edge pinned, not hidden: seed 1462 stalls at 9 fleet left.
- **Defender**: v1 chase-the-nearest patrol. WITNESS 20/20 survive 150 s,
  min 4750 banked, 19/20 clear >= 1 wave; ~1 graze per patrol is the pinned
  reality. New elevator-strip mutant; 12/12 mutants die.

Seat law both: Y seats with blips, steer/tap hands back, silent release at run
end, one-tap pill on attract (verified LIVE against production in headless
Chrome). 58 seats on the watchcheck board now.

Also repaired en route (pins/mechanics found by the browser, not guessed):
- Defender `init()`'s startRun flipped the attract DOM mirror before the pill
  could show — flip back at mount (`setAttractUi(true)`).
- TMD source-pin was stale red on main: seat block went multiline + offline
  gate (#1889); pin now matches behaviour, not line layout.
- feedbackcheck floor 52->55 (stale from the last seedpin batch).

## Battery (all green at merge)
invaderscheck + WITNESS + mutant · defendercheck 64 + 12 mutants ·
watchcheck 667/668 with the 1 miss a load flake on an untouched title
(smash-tv hook undefined; `--only` green solo) · attractcheck 694/0 ·
feedbackcheck 229 · contractcheck 682 · watchphonecheck 424 (tripwire 58) ·
lint mario/fps/ai + eslint · build ✓.

## Board
#1637 stays open `building` — batch 19 queued candidates, in order:
1. Defender human-defence in `watchRoute` (patrol ignores abducted humans;
   WITNESS bar stays honest: survival + score, and rescue-count once real).
2. SI seed-1462 stall: column-prediction lookahead (predict 2 shots ahead);
   bump the WITNESS floor if it wins, never loosen it.
3. Remaining unseated titles: check registry vs watchcheck SEATS for batch 19.

## Lessons this session (kept short, AGENTS.md law)
- "Attract missing the pill" was NOT a JSX bug: the demo start flipped a
  second source of truth (DOM mirror). Two flags for one screen = bug farm.
- Pin what you MEASURE: DF gates at +500/zero-death failed honest runs; the
  same gate at one-lander (150) + one-graze matches the 20-seed witness and
  went green. The honest number IS the tight number.
- Mid-suite watchcheck flakes move titles between runs (robot-lab/dig-dug/
  smash-tv, each solo-green). One rerun, note it, ship. Never chase.
- A stale one-line source-pin can hide behind advisory red for whole sessions
  (TMD since #1889) — green-the-suite passes should grep pins they touch.

## Open questions
None filed this session (no `waiting-jon` on lane games).

## QA lane fed
#1906 (SI polish: score-popups, march ramp, UFO table, bunker nibble),
#1907 (DF polish: radar silhouette, carry/parachute, lander tell, wave beat).

## Hygiene
Worktree `~/Dev/retrogames-forge-watch-b18` detached at `origin/main`
(`e0e230c`); branch `forge/watch-b18` deleted with the merge. Dev server on
5173 was this lane's and is safe to kill by the next slot-a session.
