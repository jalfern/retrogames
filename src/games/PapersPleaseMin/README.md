# PAPERS, PLEASE-MIN — notes

`/papers-please`. Seven days at a border gate; the rulebook grows one law
each morning; every denial must have a witness on the wall. Issue #76
named the muscle: a rule engine and a prover that no generated paper is
unfair. That prover (`scripts/paperscheck.mjs`, `npm run paperscheck`) is
the title's keystone, so these notes are organized around it.

## The two-path contract (the fairness prover)

- `rules.js` carries two functions over one day and must never merge:
  - `decide(view)` reads ONLY the booth: the papers, the wall date, the
    entry list, the wanted sheet, the scale. Every violation it returns
    carries an `evidence` string a human could read off the canvas.
    No witness, no ruling: if the scale is missing on a WEIGHT day, the
    booth must APPROVE, not guess.
  - `judge(truth)` reads the generator's hidden truth (the real weight,
    who is really wanted) under the same day's rules.
- `gen.js` builds every applicant twice — `person` (printed) and `truth`
  (real) — with the iron rule: **whenever truth and papers disagree, the
    booth prints the witness.** The scale reads the truth weight; the
  wanted sheet carries the real name+number. `paperscheck` grades both
  paths on every applicant of every seed (≈750 papers) and any verdict
  disagreement is a red "UNFAIR PAPER" with the name and rule attached.
- The engine the PLAYER meets is only ever `decide`. The game literally
  cannot convict on hidden truth, so "unfair" is a structural impossibility
  enforced at the module boundary, not a test that hopes for fairness.

## Traps, the naive eye, and the slack rule

Seven TRAP species in `gen.js` are legal papers that a careless eye
misjudges: expires-TODAY (valid), same-name-on-the-wanted-sheet (the rule
is name AND number), a foreign-looking city on an allowed passport (only
the country is law), an ID with a mismatched height (height is not a rule),
a child without ID (DOB exempts), an ID weight against the scale (no rule
reads it), and a passport with exactly the curfew's 7-day grace.

The harness owns `naiveDecide` — the careless eye — and the suite asserts
the misjudgment set is EXACTLY the planted set, ≤2 traps per day, ≥1 from
day 2, all seven species staged every week (`genWeek` schedules species
with a used-set: coverage is a construction, not a hope).

The slack rule ("winnable by a solver is not humanly winnable") maps here
to strikes: a clumsy player — one who misjudges every trap in front of
them — must still clear every seed's whole week (`<= 2` strikes a day,
three ends it), and a pure-chaos booth must fall on day one. Zero slack
(trap-filled queues) fails the build; mutant 6 in `--mutate` puts that
failure back.

## The day loop (`sim.js`)

Pure `(state, input)`, zero `Math.random` (thrown at the call site by the
harness). One input = one stamp. Correct +1; wrong +1 strike; three end the
day; the queue resets and the rulebook grows each morning; day 7 survives =
win. `autopilot()` — the perfect inspector — produces the script that IS
the attract demo, replayed tick for tick by the shell.

## Curfew's collision (a documented, proven clash)

Day 7 adds CURFEW (validity < 7 days is void), which harshly outranks the
"expires TODAY is valid" doctrine where they meet. `decide` and `judge`
shift together, so the prover stays green; the trap schedule guarantees
the expires-TODAY trap itself never lands on day 7 (its species is always
spent by day 4 by construction) — a game rule defended by the generator's
own audit, which is exactly how this file grew CURFEW in the first place:
the rulebook-awakening check caught day 7 as a no-op day.

## Mutants (7, all die under `npm run paperscheck -- --mutate`)

`<`→`<=` expiry; wanted by name only; IDREQ ignoring the DOB; the scale
reading the paperwork (witness lies); species coverage becoming luck;
legal fill becoming trap fill (zero-slack); STRIKE_MAX stretched so pure
chaos survives day one. The seventh replaced an earlier stateHash mutant
that SURVIVED its first life — nothing in the suite consumes the hash, so
blindness to strikes was invisible: a mutant the checks cannot reach is
décor, not a test.

## Gates

`lint:papers`, `paperscheck` (static CI), `papersplay` (smoke CI: real
keys only — right call stamps its ink color, wrong call frames the papers
red and names the witness, day banners fire, chaos is demoted, seed 2
survives the week, pixels vs sim proven side by side).

## Honest gaps

- Dates are serials `y*372+(m-1)*31+d`; the generator never crosses the
  31st, so order is exact. A leap-aware calendar is not worth the code
  this game needs.
- The wanted sheet caps at 4 printed entries; a fifth would have to shrink
  the wall font. Decidability is unaffected (it is graded from the model,
  and planted entries are always ≤ the printed ones).
- The portrait is procedural but not read by any rule — it is atmosphere,
  deliberately load-bearing for nothing.
- Day 7's queue is long (12 entrants); it is the finale, and the clumsy
  budget of two still clears it with room to spare (proven, every seed).
