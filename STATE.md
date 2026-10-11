# STATE.md — 2026-10-11 (PAPERS session end)

## Where things stand
**#76 GAME 12 — PAPERS, PLEASE-MIN IS LIVE at jalfern.com/retrogames/papers-please**
(PR #140, squash 5153096, `shipped`, issue closed). Arcade is 29 titles.
**Next session: claim the oldest `game-queue`** — head is #77 Lode Runner
(then #79 WWI Dogfight, #78 Arena Archery, #82 BensMagicBugLife, #118
Minesweeper). `pgrep -fl "opencode run"` first — QA MASTER (pid varies,
main checkout) was live again this session; use a worktree lane.

| since last STATE | what |
|---|---|
| #76 / `forge-papers` | Border-gate rule engine: `rules.js` decide(view)/judge(truth) twins that must never merge — the booth can only convict on printed witnesses; `gen.js` builds every applicant twice (person/truth) with the iron rule "truth−paper disagreement ⇒ the wall prints the witness"; `sim.js` day loop (3 strikes, 7 days, CURFEW wakes day 7 after the rulebook-audit caught day 7 as a no-op). 7 trap species scheduled by construction (coverage is a construction, not a hope). |
| harnesses | `paperscheck` 6237 checks + 7 mutants (`--mutate`), `papersplay` 19 Chrome checks real-keys-only. Gates: `lint:papers` + `paperscheck` in static; `papersplay` in smoke. |

## What is playable right now
- jalfern.com/retrogames/papers-please — prod verified: bundle contains
  PapersPleaseMin, route 200, static+smoke+Vercel all green.
- Attract replays the perfect inspector's own proven week tick for tick.

## What changed this session (the parts that matter next time)
- **The driver caught two bugs the Node suite structurally cannot see:**
  stamp color meant correctness (ungradeable for "deny = red") and
  `current()` walked off the queue end at victory — that would have
  crashed the canvas one frame after every win. Model-vs-wall is the
  Node gate's job; wall-vs-real-keys is play's job; neither substitutes.
- **A seventh mutant survived and said WHY: nothing consumes `stateHash`,**
  so a hash-blind mutant is décor. Replaced with the strike-wall mutant
  (chaos must fall day 1). Never write a check whose subject is unread.
- **Generator fairness is caught by its own audit:** EXPIRED's trap
  species provably lands ≤ day 4 by the schedule — which is exactly what
  keeps the day-7 CURFEW doctrine-clash from convicting an innocent;
  verified, and `day.wanted.length <= 4` is pinned ("unfair by furniture").
- CI smoke is now ~7 play suites serial (~9 min). Fine, still advisory.

## Gates (all green at merge)
17 scoped lints (+`lint:papers`) · `paperscheck` 6237/6237 + 7/7 mutants ·
`papersplay` 19/19 local AND on the smoke runner · static job green ·
build ✓ · prod HTTP 200 + bundle contains the game.

## Next (for the next session — do NOT re-debug these here)
1. Claim #77 Lode Runner (oldest). Its natural harness idiom: a solver
   that proves every level's rope/win plan, mutant-killed — sibling of
   outpostcheck/lemcheck. `-- --mutate` per the pattern.
2. PAPERS is shipped — do not polish. Honest gaps are in
   `src/games/PapersPleaseMin/README.md` (serial-date calendar; portrait
   is décor; day 7's queue is long by design and slack-proven).
3. papersplay seeds: seed 2 (Digit3) runs the whole week in one evaluate;
   if the smoke runner ever times out there, split the week into halves —
   do not lower any assertion.

## Three questions for Jon
1. Day-7 CURFEW harshly outranks "expires TODAY is valid" where they meet
   (prover stays green, generator guarantees the clash is invisible).
   Cute realism or should laws never contradict in your UI?
2. The `/forge` floor could show "traps per day" per week — the number
   the slack rule lives on. Worth a small board panel?
3. `runDay`/`runToEnd` DEV hooks drive whole days through the same act()
   as keys. Is the "keys only for the graded part" convention right, or
   should play drive the full 63 stamps key-by-key (~+40 s smoke)?

## Lineage
AGENTS.md honored: read STATE first, claimed #76 by oldest-queue order
(commented), one game, 4 checkpoint pushes with issue handoffs, harness
proven able-to-fail (7/7 mutants; one mutant replaced because it was
decorate), merge only via checks-watch-then-squash, prod verified, STATE
via PR to main. Rule 4: eight straight sessions touching `src/games/**`.
Ran ~2h55m — inside the box.
