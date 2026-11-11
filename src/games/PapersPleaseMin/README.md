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

Eight TRAP species in `gen.js` are legal papers that a careless eye
misjudges: expires-TODAY (valid), same-name-on-the-wanted-sheet (the rule
is name AND number), a foreign-looking city on an allowed passport (only
the country is law), an ID with a mismatched height (height is not a rule),
a child without ID (DOB exempts), an ID weight against the scale (no rule
reads it), a passport with exactly the curfew's 7-day grace, and the
aged photo (#1938: grey hair, same face — time fades color, forgery
changes features).

The harness owns `naiveDecide` — the careless eye — and the suite asserts
the misjudgment set is EXACTLY the planted set, ≤2 traps per day, ≥1 from
day 2, every species staged every week (`genWeek` schedules species
with a used-set: coverage is a construction, not a hope).

The slack rule ("winnable by a solver is not humanly winnable") maps here
to strikes: a clumsy player — one who misjudges every trap in front of
them — must still clear every seed's whole week (`<= 2` strikes a day,
three ends it), and a pure-chaos booth must fall on day one. Zero slack
(trap-filled queues) fails the build; mutant 6 in `--mutate` puts that
failure back.

## PORTRAIT — the photo on the paper (#1938)

Comparing the ID photo against the person at the counter is the original's
signature inspection verb, and here the booth's procedural portrait was
pure atmosphere until this stage made it load-bearing:

- Every applicant carries a face descriptor: structural features
  (`style` 0–3 hair cut, `narrow` face width, `glasses`, `must` facial
  hair) plus atmosphere colors (`skin`, `hairC`, `shirtC`). The live face
  at the counter and the passport's mini photo are BOTH painted by
  `drawFace` from a descriptor — an honest paper's two descriptors are
  identical, so the two portraits are byte-identical renderings at two
  scales (`papersplay` proves it: `__ppTest.portraitPix()` paints both at
  scale 1 and counts differing pixels per feature band).
- `PORTRAIT` compares ONLY the structural features and convicts when they
  disagree — the forger's violation is `EXACTLY ONE feature` (paperscheck
  pins it), and the evidence names it in words a guard would say
  (`PHOTO WEARS GLASSES, ENTRANT DOES NOT`). Colors never convict: that
  is what keeps the aged-photo trap legal.
- The rule rides `DAY_RULES` from **day 1**, not a late wake: the
  +1-rule-per-day growth law has no free slot after day 1 (day 6 owns
  IDREQ, day 7 CURFEW), and unlike the paper laws the photo check needs
  no teaching — the two faces sit side by side. Nine laws on day 7 is why
  `WALL.top` moved 44→38; the fit sweep re-proves the deepest wall lands
  its wanted sheet at y=356, above the SCALE box at y=358.
- `judge` still reads the hidden truth (`photoMismatch`), so every paper
  is graded twice as before, and the fairness prover is unchanged doctrine:
  a deny with no visible witness is red.

## The day loop (`sim.js`)

Pure `(state, input)`, zero `Math.random` (thrown at the call site by the
harness). One input = one stamp. Correct +1; wrong +1 strike; three end the
day; the queue resets and the rulebook grows each morning; day 7 survives =
win. `autopilot()` — the perfect inspector — produces the script that IS
the attract demo, replayed tick for tick by the shell.

## The calendar (one clock since #1889)

`dadd` walks the printed wall (real month lengths, no leap days — Arstotzka
here never emits Feb 29) and carries BOTH directions across month and year
seams. `dnum` is exact days-since-epoch (`y*365 + MPREFIX[m-1] + d`), so
`dnum(dadd(x, n)) − dnum(x) === n` for every constructible date — the serial
the rules compare and the calendar the wall prints cannot disagree. The week
starts OCT 27 and rolls through a real month-end: day 5 is OCT 31, day 6
NOV 01 — and day 6's EXPIRED test paper prints the week's first cross-month
verdict (`EXPIRED 1982.10.31 < TODAY 1982.11.01`), the date arithmetic the
original's guard does every shift. Rolling the week is also how a real bug
surfaced: `dadd` had no backward carry (it shipped NOV 00 as day 6's
"yesterday") — the day-6 gates now pin the carry, both directions.

## Curfew's collision (a documented, proven clash)

Day 7 adds CURFEW (validity < 7 days is void), which harshly outranks the
"expires TODAY is valid" doctrine where they meet. `decide` and `judge`
shift together, so the prover stays green; the trap schedule guarantees
the expires-TODAY trap itself never lands on day 7 (its species is always
spent by day 4 by construction) — a game rule defended by the generator's
own audit, which is exactly how this file grew CURFEW in the first place:
the rulebook-awakening check caught day 7 as a no-op day.

## Mutants (14, all die under `npm run paperscheck -- --mutate`)

`<`→`<=` expiry; wanted by name only; IDREQ ignoring the DOB; the scale
reading the paperwork (witness lies); species coverage becoming luck;
legal fill becoming trap fill (zero-slack); STRIKE_MAX stretched so pure
chaos survives day one. The seventh replaced an earlier stateHash mutant
that SURVIVED its first life — nothing in the suite consumes the hash, so
blindness to strikes was invisible: a mutant the checks cannot reach is
décor, not a test. The ninth re-freezes `dnum` at uniform-31 (the two-clock
regression #1889 removed — short-month seams read grace wrong); the tenth
strips `dadd`'s backward carry (NOV 00 ships) — the bug the rolled week
actually found. The eleventh shrinks the wanted sheet back to two decoys
(#1902) — killed by the slot-used witness, so the fifth portrait can never
quietly become dead letter. The twelfth deletes the PORTRAIT block from
`decide` (forgers walk free while `judge` still denies — the prover's own
verdict-twin catches it); the thirteenth de-ages the trap (photo keeps its
live hair color, the naive eye stops biting, the trap-count witness sees
the hole); the fourteenth lets hair COLOR convict — the aged photo is
denied and the truth path screams (#1938).

## Gates

`lint:papers`, `paperscheck` (static CI), `papersplay` (smoke CI: real
keys only — right call stamps its ink color, wrong call frames the papers
red and names the witness, day banners fire, chaos is demoted, seed 2
survives the week, pixels vs sim proven side by side; since #1938 also:
the passport carries a painted photo in its beige frame, honest papers
render byte-identical face+photo pixels, and a forged photo denies with
its own feature band lit — sampled only after the stamp ticks out, since
during a stamp the counter shows the previous document).

## Honest gaps

- **CLOSED by #1889 (2026-11-10):** dates were serials `y*372+(m-1)*31+d`
  and the generator never crossed the 31st. The week now rolls OCT 27 →
  NOV 02 and `dnum` is exact days-since-epoch — one clock with `dadd`,
  seams included; the CALENDAR section of `paperscheck` pins the identity
  law, the roll, the cross-month witness and short-month CURFEW math.
- **CLOSED by #1902 (2026-11-10):** the wanted sheet capped at 4 printed
  entries. The wall now carries the original bulletin's five — a third decoy
  is staged every day (entries 3–5; the five-entry day is the twin-trap day).
  The feared font shrink proved unnecessary: worst measured bottom y=336,
  theoretical worst day y=346 vs the scale-box law y=358 and strip y=400.
  `paperscheck` pins the cap at 5, witnesses that the fifth slot is really
  staged across the seed sweep, fits the synthetic five-entry worst day, and
  mutant m11 (decoys back to two) proves the witness bites.
- **CLOSED by #1938 (2026-11-10):** the portrait was procedural but read
  by no rule. The passport now carries a photo and PORTRAIT compares it
  against the face at the counter — cut, shape, glasses, facial hair;
  colors ride free so the aged-photo trap stays legal. `paperscheck`
  pins descriptor parity, exactly-one-feature breaks, per-seed trap
  witnesses and the one-line-text fit law; `papersplay` proves the
  evidence is pixels (band lit, honest papers byte-identical).
- Day 7's queue is long (13 entrants since PORTRAIT added its test paper);
  it is the finale, and the clumsy budget of two still clears it with room
  to spare (proven, every seed).
- The photo paints at 0.6 scale — the features stay distinguishable at
  that size (papersplay counts the pixels), but a 40px face is a coarse
  read next to the original's detailed portrait art; and the compared
  feature set is four (cut, width, glasses, facial hair) where the
  original's eye roams a whole face.
- Face variety is combinatorial (five skins × five hairs × four cuts ×
  width/glasses/must), not hand-authored characters — everyone is a
  mix of the same parts.
