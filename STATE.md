# STATE — session 255 (2026-11-12, slot a)

## What shipped
**VIPER PIT — CPU close-range qcb counter restored (#2151)** merged as `21de217`
(PR #2163). #1735's projectile-only replacement meant no CPU ever threw ANY
fighter's qcb (all five ViperPit counters are non-projectile) — viperpitcheck
red on main since. Fix: restored close-range branch (`sp.qcb && f.def.moves.qcb
&& dist < 2.2 && m.rng() < tier * 0.22`) kept beside #1732's projectile-at-range
one; scriptMotion has had a qcb case since #1732 so it lands. SABLE's ward now
walls off point-blank too (what a ward is for; pre-#1735 behavior). Harness:
source regex re-pinned + projectile branch pinned + NEW behavioural sweep — per
fighter, foe held at 1.8, 8 seeds, CPU must enter `move === 'qcb'`. Proven-fail:
`--mutate` kill probe `__VIPER_NOQCB__` — dead branch → CPU never throws the
counter (5 behavioural gates + regex would go red). Green: viperpitcheck 348/0
(was 340/1), ironringcheck 134/0 (determinism re-verified with ward change live),
lint gates + build + contractcheck 724/0. Prod VERIFIED: `fighting-VZEfLrjb.js`
byte-matches local build, carries `moves.qcb&&<v><2.2`.

Also cleared the session-open chore: **#2159** (judge badge lift) merged as
`4b830fc` once the freeze lifted; `retrogames-forge-viper-reply` worktree removed.

## Freeze status — main is RED again
Nightly 43285200501 on `7f41097` completed FAILURE 20:22Z — `full-smoke`:
papersplay crowded-shift ink 20/165 + neighbor-callback ink 23/82 (the #2145
family, unchanged) PLUS one new line: `defender: resumes from where the player
left it (score 2400 -> 2400, enemies 2 -> 2)` (watchcheck resume family).
Detail posted on #2145 (needs-approval, Jon's board). #601 re-armed:
`main-ok` exits 1 — **no merges until a green nightly lands.** My two merges
went through in the cancelled-nightly window before it re-armed.

## The session's catches
- **Prod marker = chunk CONTENT hash match, not entry-hash change.** A shared
  lazy chunk change can ship with an identical entry hash (entry references the
  chunk by name). Poll: entry → chunk filename → fetch chunk → pattern/string;
  better: compare the prod chunk's content hash with your local build's. First
  poll (entry-must-change gate) reported a false "not live" for 13 min.
- **Hand-mutants can't survive mutateguard** (plain viperpitcheck runs plant a
  temp mutant → refuses a dirty tree). The sanctioned prove-fail channel is the
  check's own `--mutate` global-flag pattern — permanent, no dirty-tree risk.
- **Behavioural gate over source grep:** the #2151 regression slept for 5 PRs
  behind a regex that kept looking plausible. Source pins now ride alongside a
  sim that must SEE the move.
- **When an issue contradicts itself** (sketch's `!projectile` vs its own
  "re-pin IRON RING" line), build the reading that makes every sentence true
  and say so in the design comment — #2151 sketch vs intent.

## Ladder trail
TARGET #2147 REFUSED (b holds it live, horse demo mid-build — do not resume
`forge/horse` from slot a). No halt/steer; jonq empty; `next` #1711 still
waiting on Jon. game-queue #2151 claimed first — shipped. game-queue now empty;
feedback owned by live QA lane; flagship gaps QA-owned → expect never-dry
`weakestStage` to pick at the next kick (or #2147 once b's lock lapses… b is
alive, don't touch).

## Open questions
- none filed.

## Next
- Slot a: main is red (#2145 family) — nothing to merge. If a green nightly
  lands, run the ladder: no open game-queue items, so derive honestly via
  idle.mjs `flagshipStage`/`weakestStage`; expect a POLISH issue for the
  weakest unheld title with a why-weakest line.
- QA lane: papersplay ink floors (#2145) + the new watchcheck defender-resume
  failure are the main-green path — builder lanes stay off it unless asked.

## Hygiene at exit
Dev server :5173 (mine) STOPPED. Worktree `retrogames-forge-viper-qcb` REMOVE
after this STATE push (branch merged). Main checkout detached at origin/main.
STATE committed to main (game merged) + parked `statepark park a`.
