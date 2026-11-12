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
  hair — plus `brow` thickness and `mouth` shape since #1972) plus
  atmosphere colors (`skin`, `hairC`, `shirtC`). The live face at the
  counter and the passport's mini photo are BOTH painted by
  `drawFace` from a descriptor — an honest paper's two descriptors are
  identical, so the two portraits are byte-identical renderings at two
  scales (`papersplay` proves it: `__ppTest.portraitPix()` paints both at
  scale 1 and counts differing pixels per feature band).
- `PORTRAIT` compares ONLY the structural features and convicts when they
  disagree — the forger's violation is `EXACTLY ONE feature` (paperscheck
  pins it), and the evidence names it in words a guard would say
  (`PHOTO WEARS GLASSES, ENTRANT DOES NOT`). Colors never convict: that
  is what keeps the aged-photo trap legal.
- **#1972 PORTRAIT-DETAIL** — the compared set is SIX features
  (`FEATURES`, rules.js); paperscheck pins that every one of them
  actually forges across the seed sweep, so a sixth feature can never be
  décor. The photo is a ZOOM-CROP (`PHOTO.s` 0.75, `ox/oy` center the
  head, the draw is clipped to the frame): the head reads ~50px where the
  old flat-0.6 miniature read ~40. `drawFace` gained the parts the
  original's eye roams — sclera + pupils, brows (thin 2px / thick 5px),
  a nose, ears, and an open-mouth block; only brow thickness and mouth
  shape are compared, the rest is look. The crop math is a Node law
  (centered, widest head inside the frame, `s >= 0.7`), and papersplay
  measures the canvas: longest non-beige run across the head row ≥44px
  (old build measured ≤41), both brow thicknesses and both mouth shapes
  counted in ink px, bare-eye whites counted (128px bare, 0 behind the
  opaque lenses).
- **#1943 PORTRAIT-LEGIBILITY** — the photo zooms to the clip law's ceiling
  (`PHOTO.s` 0.90, head ~61px where 0.75 read ~50 — the original's photo
  fills its frame the same way; the chin crops at the bottom edge like a real
  ID photo), and `drawFace` gained a MINIMUM-INK clamp: the thin compared
  strokes (thin brow 2, glasses bridge 2, shut-mouth bar 3 source px) clamp to
  ≥2px at ANY scale, so the features the PORTRAIT rule actually compares
  survive antialiasing at phone size. The clamp no-ops at s = 1 — every source
  value is already ≥2 — so the counter face and the scale-1 byte-identity
  probes (`portraitPix`/`crowdPix`/`castPix`) are untouched by construction.
  Two new arithmetic ratchets in paperscheck (`s >= 0.85`, widest head
  `s*68 >= 54`) plus a live gate (photo brow ink: 34 thin vs 74 thick dark-
  family px on bare faces — exact hex would lie about AA-scaled ink, count
  the family) hold the gain against the next quiet shrink.
- The rule rides `DAY_RULES` from **day 1**, not a late wake: the
  +1-rule-per-day growth law has no free slot after day 1 (day 6 owns
  IDREQ, day 7 CURFEW), and unlike the paper laws the photo check needs
  no teaching — the two faces sit side by side. Nine laws on day 7 is why
  `WALL.top` moved 44→38; #1943 found the real relief (`ruleGap` 4→3, 9px
  on the nine-law wall) and spent 5 of them growing the wanted rows to 10px
  on an 11px pitch — the fit sweep re-proves the deepest wall lands its
  wanted sheet at y=352, six px above the SCALE box at 358 (was 2 px with
  9px rows).
- `judge` still reads the hidden truth (`photoMismatch`), so every paper
  is graded twice as before, and the fairness prover is unchanged doctrine:
  a deny with no visible witness is red.

## The day loop (`sim.js`)

Pure `(state, input)`, zero `Math.random` (thrown at the call site by the
harness). One input = one stamp. Correct +1; wrong +1 strike; three end the
day; the queue resets and the rulebook grows each morning; day 7 survives =
win. `autopilot()` — the perfect inspector — produces the script that IS
the attract demo, replayed tick for tick by the shell.

## The shift clock (#1960)

The booth now has a time, the way the original's does. `sim.js` carries
`gs.clock` (sim ticks) and `tick(gs, n)` drains it once per frame; when the
budget bottoms the gate CLOSES.

- **Budget law: the queue is the quota and the queue sizes the clock** —
  `dayTicks(day) = queue.length × CFG.SEAT_TICKS` (18 s an applicant).
  The finale's 13-deep line is therefore the tightest shift of the week
  *because* it is the longest day — the original's late-week pressure,
  honestly ported: length now costs attention.
- **Closing** (`close` event): whoever is still in line is turned away; the
  record docks `MISS_DOCK` (5) per head, clamped at zero. Days 1–6 dock and
  advance; **day 7 must finish** — an unmet quota loses the week
  (`GATE CLOSED — n STILL IN LINE, QUOTA UNMET`). Morning (`advance()`)
  rewinds a full shift, shared by queue-drain and gate-close so the two
  day-ends cannot drift.
- **Who can be caught**: nobody scripted. `SEAT_TICKS` (1080) exceeds the
  autopilot's longest wait (124) plus stamp slack — attract, WATCH and every
  harness replay stamp faster than the gate can fall; only a human dawdling
  past eighteen seconds an applicant is. `paperscheck` pins that inequality,
  then proves both directions: a 10 s human cadence clears every day of every
  seed (finale margin > 0), the naive eye still clears the whole week (the
  slack rule is about judgment, pace is tested separately), and a ~22 s
  cadence closes day 1 and loses day 7 with a deterministic missed count.
- **The booth**: a real clock face on the ruled grid (hour pips, sweeping
  hands, digital readout below), mapped onto the printed shift 08:00→18:00,
  red through the last hour with soft per-second ticks through the glass, a
  buzzer at close. Its corner of the canvas is chrome-safe: the app's
  PAUSE/volume/WATCH overlays own the top-right, so the clock hangs in the
  booth's own reach — paperscheck pins clearance from the DAY line, the
  rulebook label and the portrait column.
- `stateHash` deliberately ignores `clock`: it hashes the discrete booth
  (day/idx/strikes/score), so cross-run replay comparisons stay valid while
  the continuous shift can differ freely.

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

## The arc and the callback (#1983)

One regular per week turns wanted, Jorji-style. `arcForWeek(seed)` =
cast[seed mod 4]; by the injection law that face walks days 2 and 6, so the
TURN lands on the return — day 6, where WANTED has been awake since day 4.
The turn is **the wall's case, not the paper's**: the bulletin pairs the
authored name with the passport number carried THAT day (papers are rebuilt
legal per visit — the same trick the campaign uses with Jorji's evolving
documents), and pull that one sheet entry and `decide` approves the same
person. paperscheck's ARC section pins the construction, the pull-the-witness
legality, exactly-one-violation (WANTED), the printed-pair evidence shape and
the say-line law per visit — and that `say` is atmosphere: stripping it off
the person never moves a verdict (purity). The bulletin keeps the original's
five-portrait capacity: the arc day stages one decoy less (paperscheck m30
kills the forgetful wall). The other recurrence (cast[(seed+1) mod 4], days
3 and 7) just remembers you: one line, honest papers. Lines ride
`person.say` and paint as a paper speech bubble (`layout.js BUBBLE`, tail
up toward the glass) under the face column; papersplay proves the field is
pixels (up ≈ 5.4k paper px on the turn, 0 on strangers), stamps the seed-0
Grubak deny with a real key, and snaps the trap the other way at seed 1: a
sympathetic APPROVE of MARKO costs the strike.

## The one-off crowd (#1989)

The original's line is dozens of distinct people — miners in flat caps, a fur
ushanka, a headscarf, a thick unibrow, a glinting earring, a missing tooth.
Here the rolled crowd gains those looks as DECOR: `accFor(pic)` in `gen.js`
derives `{hat, uni, ear, gap}` as a **pure hash of the passport serial** —
zero `rnd()` draws, so every existing seed keeps its names, numbers, weights
and faces byte-identical, and the identity law is by construction: the decor
is attached to `face` BEFORE the photo spread, so face and photo carry the
same hat in every process, always. **NATIONS DRESS (#1996):** since the
polish pass the hash is salted by the entrant's OWN country and sex
(`accFor(pic, nation, sex)`; `person.nation` is the truth at birth — the
papers may lie, the coat doesn't): Kirinians and Antegrians wake up in flat
caps, Veskole in fur (the women mostly too, 3-in-4), Parmenistan wraps in
the headscarf, and the women of every nation favour the scarf; Antegrian
officers also cover at the highest rate, with a national tint on the sparse
families (Veskole brows, Parmenistani gold, Kirinian teeth). ARSTOTZKA, the
host, stays deliberately mixed — nations correlate, they never uniform. The
serial law still has zero rnd draws (purity holds over the full serial ×
nation × sex matrix), decor is still never in `FEATURES` and never evidence. Doctrine of the nose: decor is never in
`FEATURES`, never evidence — paperscheck's CROWD section perturbs the live
face's decor on every paper of every seed and requires the verdict to not
flinch (`decide` AND `judge`), pins the purity of `accFor`, face==photo
decor on every entrant, and variety floors graded on the ROLLED heads only
(the authored cast would mask a flattened hat hash — m31's first draft
learned that): all three hat kinds, 25 distinct looks across 768 rolled
entrants, ≥24 per family (measured ~100). The cast wears AUTHORED decor —
identity, not hash: Grubak cap+unibrow, Marko earring, Anja scarf+gap-tooth,
Petr ushanka (his big ears grow below the flaps); paperscheck pins the
authored decor every appearance. `drawFace` paints all four families at the
counter AND in the zoomed photo (same function, both scales); inks are chosen
off every existing pixel counter — unibrow `#262b36` sits one step off the
compared-brow ink `#20242e` so the brow gate keeps counting brows, teeth
`#e6ebf2` distinct from eye whites `#d8dce8`, and the scarf's wool-brown
fails the stamp's `rr>140` red hue test. Hats cover the crown but leave the
hairline visible under the brim and past the edge — a grey-haired aged photo
or a flipped cut still READS through the hat (papersplay's live forger bands
stay lit). papersplay walks seed 0's days 1-2 with real keys and proves the
crowd is pixels: hat ink maxes 1732px at the counter, unibrow 56, earring 9,
tooth 30; hatted honest photos carry their hat; bare heads paint none; and
every background face's browser decor equals Node's `accFor(serial)` byte for
byte.

## The cast of six (#1997) — the neighborhood grows, and everyone has a line

The original's recurring cast is not four — a dozen faces lean on the glass
across the campaign (Jorji, the steam-cleaning woman, Sergi, the work
inspector). Two more regulars are now authored end to end, and the whole cast
speaks personally:

- **SONYA MALAK** (F, 38) — the knit-seller: freckle cluster (its own ink
  window, rows 58-67 of the face, below the scar's), headscarf AND the gold
  earring — the only cast member wearing two decor families.
  **TADEK HRUBY** (M, 62) — the retired clerk: grey hair (color is never
  evidence, and his honest photo carries the SAME grey, so the aged-photo
  trap can never be pointed at a regular), glasses, a missing tooth, and the
  forehead bandage of a clumsy workshop life (rows 26-29, disjoint from the
  wrinkle window and the glasses rim).
- **PERSONAL SPEECH** — every regular carries `lines: {greet, again}`. The
  week's first walk-up greets in its own voice (`say = [greet]`); the return
  says `['YOU AGAIN.', again]`; the arc turn keeps the canonical Jorji pair
  (the wall's drama is universal). `say` is still atmosphere — the purity
  witness moved from the arc day to EVERY day of every seed: strip the line,
  the verdict cannot flinch.
- **THE ROTATING WINDOW** — six seats, six cast days, and the law needs faces
  that COME BACK: each week meets `cast[s..s+3]` (mod 6) on days 2-5, and
  seats s, s+1 RETURN on days 6, 7. Two recurrences a week stand as before,
  the arc rides the rotated head of the window (seed 4's day 6 puts SONYA on
  the wall), and different weeks meet different neighbors. Seed 0's week is
  byte-identical to the old mod-4 walk (0,1,2,3,0,1), so every existing
  fixture replays.
- `paperscheck` adds the speech-shape law (greet/return/turn, per appearance,
  per seed), distinct-line witnesses (12 authored lines, no two the same),
  the window law per week, seatsWalked (all six seats walk across the sweep —
  a seat nobody meets is dead letter), arc-seat coverage (every seat gets its
  turn on the wall), all-day say-purity, and a bubble-fit scan over every
  personal line. Mutants: m33 freezes the rotation (fairness never notices —
  only the sweep-wide witness sees the new faces vanish), m34 mutes the
  greet branch (the booth remembers only one phrase); m29's anchor re-pinned
  to the grown callback line. **All 34 die.**
- `papersplay` walks seed 4 live with real keys: Sonya approves day 2 in her
  scarf+earring (hat 980px, gold 9px at the counter) greeting "MY SON LIVES
  IN OR VECHNA." (bubble 5424 paper px), Tadek approves day 3 ("I AM
  RETIRED, GUARD."), the sheet on day 6 carries SONYA'S number and the
  correct deny lands, and day 7's Tadek says "YOU LET ME THROUGH." The
  offscreen castPix counts all six marks in disjoint ink windows
  (freckles 12px, patch 24px). Grubak's day-2 first visit now greets too
  (5647px), and strangers stay silent (0px).

## THE LONG CONVERSATION (#2003) — threads that answer themselves

The original's regulars don't trade orphan sentences; they run sagas. Jorji
escalates every time he leans on the glass, and the crowd's small topics —
bread, pensions, trains, knits — carry from visit to visit. The booth here
now works the same way: every `REGULARS` entry carries four authored beats
`{greet, hook, again, follow}`, and the visit decides which pair it speaks:

- **first walk-up** (days 2–5): `[greet, hook]` — introduction plus the
  topic of the week ("GOOD DAY, GUARD." / "THE BREAD LINE WAS LONG.").
- **the return** (days 6–7, non-arc): `['YOU AGAIN.', again, follow]` —
  recognition, personal callback, and the ANSWER to the planted topic
  ("BACK AGAIN, HA!" / "STILL NO BREAD, HA!").
- **the arc turn**: the canonical pair, untouched — the wall interrupts
  breakfast. Its planted hook is the one thread the week leaves unpaid,
  alongside the window's once-a-week tail seats (s+2, s+3 carry their
  topics into next week); paperscheck's continuity witness allows exactly
  those and calls anything else a broken thread.

Lines are decor by doctrine (`decide` never reads `say` — the purity twin
still walks EVERY paper EVERY day), and authoring them consumes zero rnd(),
so every seed replays byte-identical. 24 authored lines, 24 different
sentences, pinned. The bubble grows with the thread: `h = max(34, 8 + 13n)`
keeps 1–2-line fields byte-identical and opens a third row at 47px (bottom
349, clear of the 394 strip bound); `bubbleGrowPix` proves the growth on
live pixels and stays dark when nobody speaks.

## THE BOOTH EXPLAINS ITSELF (#1891) — quoted witnesses, month names, a loud calendar, papers with weight

The two-path contract calls the evidence string "the promise the booth keeps
to the player" — but the booth only kept it in the sim. `paperscheck` already
pinned the strings; the player never read them. This pass puts the promise on
the canvas, in the original's own four places:

- **The stamp quotes its case.** `stampLines(gs.last)` (rules.js — pure,
  shared by the paint and the DEV probe) headlines the rule and QUOTES the
  evidence verbatim in the controls strip: a wrong admit prints
  `WITNESS: EXPIRED` in red plus `EXPIRED 1982.10.31 < TODAY 1982.11.01`
  underneath; a correct deny prints the same case in gold (what you caught,
  and WHY); a clean admit stays silent; an innocent deny says `THEY WERE
  CLEAN` and quotes nothing. The strip's evidence corridor (layout `EVID`,
  cx 414, wrap 54) is proven clear of the control texts, the strike boxes,
  the score line, the slip and the bubble — paperscheck pins the geometry and
  that every deny of every seed quotes its evidence verbatim (rule names may
  headline, never replace); the day-6 cross-month paper must reach the strip
  as the FULL comparison.
- **Dates print month names.** `MON`/`MONFULL`/`dshow` (rules.js): the wall
  header, the passport DOB/EXPIRES and the ID DOB print `OCT 27 1982` — the
  original's shape, instant across the month seam. RULES text and evidence
  strings keep numerals: they are the contract's tokens, pinned verbatim.
- **The roll is announced.** `monthTurn(week, day)` (sim.js): the morning
  after a calendar seam gets its own gold banner line — day 6 opens with
  `* NEW MONTH: NOVEMBER *` (plus its own chime). The pin: exactly one turn
  per seed, on day 6, naming NOVEMBER; every other morning quiet.
- **Papers land with weight.** `SETTLE` (layout.js): when the stamp hold
  ticks out, the next applicant's papers drop (dy −10 → −5 → −2 → 0 over 12
  ticks) instead of teleporting. Decor for the shell only — the sim never
  sees it, every replay pin stands; a fresh stamp zeroes it, so the red
  misjudgement frame and the document always sit on the same row.
- Harness: paperscheck +64 checks (quote-is-verbatim across ≈750 papers, the
  corridor geometry, the settle law, month names vs serials on every seed);
  papersplay +6 live gates (wall prints OCT 27 1982; correct deny quotes gold,
  wrong admit quotes red AND the corridor counts the ink; the innocent's
  strip stays dark; the drop runs and rests; day 6's banner carries
  NOVEMBER).

## THE CROWDED RETURN (#2012) — the week meets the whole neighborhood

The original's line is denser than one familiar face a day: on heavy shifts
several neighbors lean on the glass at once, and a day can carry both a
"YOU AGAIN." and a first hello. The rotating window (#1997) met only four of
six seats per week; this amendment densifies the authored walk:

- **One clock, no special case**: the seat at offset k (`seatOff(seed, idx)`,
  k = 0..5) FIRST leans on the glass on day 2 + k — days 2..7, every seat,
  every week. `firstVisitDay` is `2 + seatOff`; the pre-#2012 `-1` (a seat
  the week never met) is retired.
- **Recurrence stands**: offsets 0 and 1 (seats s, s+1) RETURN on days 6, 7
  — two recurrences a week, and the arc still rides seat s's return (day 6).
- **The crowded days**: days 6 and 7 each host TWO regulars — the returning
  head first, then the crowding tail (offset 4 on day 6, offset 5 on day 7)
  greeting its first walk-up. Eight authored visits a week, six distinct
  faces, exactly two seats walking twice.
- **Nothing else moves**: the queue-size law holds by construction (the fill
  loop lays one fewer random head per regular, `queue.length === rules + 4`
  stands); the shift budget is queue-based, so unchanged; speech stays decor
  (the purity twin walks every paper unchanged); cast names were already
  blocked from the roll, so two neighbors can never grow twins.
- `paperscheck` re-pins the law: the window witness now grades EVERY WEEK
  meeting all six seats (the sweep-wide `seatsWalked` can no longer carry it
  alone — seeded crowd seats cover a sweep even with a frozen head, which is
  exactly how m33 SURVIVED its first life here: sharpened to per-week);
  day-6 order `[s, s+4]` and day-7 `[s+1, s+5]`; the crowded day must speak
  BOTH voices (a return — or the arc's canonical pair — and a fresh
  greeting); continuity excuses a planted topic only for the arc face and the
  once-a-week seats, now s+2..s+5 (they carry the topic into next week).
  Mutants m40 (crowd never walks — week meets four) and m41 (crowd clones the
  returning head — the tail never gets its day) join; **all 41 die**.
- `papersplay` samples the second bubble per window live: seed 0's day 6
  arrests Grubak AND seats Sonya's hello (greet bubble 4854px); seed 4's
  turn-day crowds ANJA'S greeting (5096px) and day 7 pairs Tadek's payoff
  with PETR'S introduction (5222px) — all real keys. Harness catch: the crowd
  now takes day 6's LAST fill slot, so stamping the tail can roll the day
  before `runDay()` captures `gs.day` (it would then stamp all of day 7 and
  the return walk finds nobody) — probe the day before calling `runDay`.

## THE CROWDED SHIFT SPEAKS (#2020) — the dense morning announces itself

#2012 put two regulars in one shift but staged it exactly like a solo day.
The original's dense shifts read differently at a glance — the line extends,
neighbors comment on whoever stands ahead, heavy mornings look and sound like
heavy mornings. Four beats, all decor (doctrine of the nose — none of it can
ever convict):

- **THE LINE SHOWS ITSELF** (`layout.js QUEUE`) — a waiting strip under the
  ENTRANT label: one dim paper-mug silhouette per KNOWN face not yet ruled,
  plus a gold "…" tick when random heads wait behind. Crowded days open two
  deep, solo days one, day 1 none; mugs snuff out as heads cross the glass.
  The count is derived from the live queue (`slice(idx)`), so it cannot lie:
  paperscheck recomputes it per seed (day 1 zero, solo one, crowded two,
  one left after the head, zero after the tail).
- **A BYSTANDER ASIDE** (`gen.js`, `layout.js ASIDE`) — one tagged exchange
  per crowded shift: while the returning head works the glass, `A VOICE BEHIND
  YOU / THE LINE IS LONG TODAY.`; when the greeting tail arrives, `A VOICE
  FROM INSIDE / <FIRST> SAYS HELLO.` — the neighbor through the gate calls
  back BY NAME, tying the two beats to the same pair of faces. Authored with
  zero rnd() draws (every seed replays byte-identical), never in FEATURES,
  stripped from every paper of every seed in the purity twin (and rules.js
  must not contain the word).
- **THE CROWD JUICE** — crowded mornings print a third gold banner line
  (`* TWO FAMILIAR FACES IN LINE *`, riding above or below the NEW MONTH
  line when both beats land), and the recognition chime gains a low third
  note — 392 Hz triangle, pinned BELOW the welcome's 523 and disjoint from
  every fixed tone the booth owns — when a neighbor steps up on a crowd day.
- **BODIES ARRIVE** — the #1891 SETTLE drop now rides the counter face too
  (`drawFace` at `PORTRAIT.y + dy`), so entrants land the way their papers
  do instead of teleporting. Shell-only decor; the stamped document and every
  replay pin stand as written.

`crowdedDay(seed, n)` is the single law — the walk's own length
(`regularsForDay(...).length >= 2`) — so the flag and #2012's construction
cannot disagree. paperscheck's CROWDED SHIFT SPEAKS section grades the law
per seed, the exchange (presence, order, name-tie, verdict), the fit
(tag/line width, box clearances, worst-case banner height), the tone
disjointness, the mug math and determinism (+68 checks). Mutants m53 (the
crowd flag never set — the dense morning says nothing) and m54 (the inside
voice forgets the head's name — the exchange unmoors) join; **all 55 die**.
`papersplay` proves it live on seed 0: day 1 opens with no mugs, day 2's
solo morning shows exactly one, day 6 waits two deep and thins to one behind
Sonya; both bystander beats print their gold tag and slate line (and a solo
day's zone stays dark); the day-6 banner carries the accent while day 2's
stays plain; the whole crowded week hums the third note exactly twice — on
the return days, never on the tails. Harness catch: the morning banner is a
full-width veil (y 150..286) and the deny pin (~2.2 s) keeps showing the
judged entrant — strip/aside samples need the booth fully quiet first
(`waitQuiet`), or they measure the veil instead of the line.

## THE WALL THAT LIVES (#1908) — the bulletin never looks stamped

The fifth-portrait playtest (#1908) found the original's own name pool working
against the wall: FIRST×LAST was 10×8 = 80 combos, three decoys were independent
draws with zero dedup, and across seeds the sweep proved the consequences — 27
decoy names repeated across days *within single weeks*, two weeks printed the
same name twice on ONE bulletin (seed 0 day 4 `ILIA DRENIN` ×2), and a wall name
could walk up the window on another day as a pure memory trap (an innocent with
the exact name the wall printed the day before).

The fix is variety as construction, not hope — this generator's own doctrine:

- **The pool doubled**: FIRST 10→16, LAST 8→12 (80 → 192 combos; the two combos
  that ARE a regular's full name, ANJA TOLKA / PETR ZEMEK, are removed from the
  plan pool — the neighborhood decorates the wall only via the arc).
- **Decoy names are a per-week PLAN**, not stream draws: slot (n,k) prints pool
  index `seed*97 + n*71 + k*37 mod 190`. The offset constants are verified
  collision-free for |Δday| ≤ 6, |Δslot| ≤ 2 (paperscheck re-proves it
  analytically AND on the sweep), so the week's twenty slots land on twenty
  DISTINCT names — distinct on the day, distinct across the week. Names come
  from the plan, ids stay stream draws, so `genDay` standalone still replays
  `genWeek`'s day exactly.
- **The week's plan pre-seeds every day's `used`-set**: no entrant, planted
  WANTED name, or regular can carry the FULL name of any wall row that week.
  The old post-hoc rewrite guard is now an assertion (a collision is a broken
  construction, not something to paper over).
- **Token-level near-misses stay on purpose**: a decoy sharing a first or last
  name with an entrant trains the printed NAME *AND* NUMBER law (the trap
  species exists for exactly that). What went to zero is the identical full
  name — from 55.6% near-miss entanglement to zero unfair doubles. Planted
  names still coincide with another day's entrant (~1.8/week at pool 190): each
  day is judged by the sheet the wall prints THAT day; decide/judge agree;
  counted by the harness, so a pool narrowing back toward stamp territory goes
  red.
- **Legibility (#1908 item 2), later amended by #1943**: five 9px rows sat at
  the fit-law ceiling — worst sweep bottom y=356 vs the SCALE box at y=358,
  two px of slack — so #1908 rode contrast (`wallRed #ff6f5e`, distinct from
  the stamp ink `#d84343` and the strike `#ff8080`). #1943 FOUND the space:
  the nine-law rulebook pays 1px per gap (`ruleGap` 4→3, 9px freed), and the
  wanted rows grew to 10px on an 11px pitch — worst buildable day now y=352,
  six px of slack, paperscheck ratchet moved to size ≥ 10. The sheet reads by
  size AND contrast at arm's length.
- `paperscheck` gains THE WALL THAT LIVES section (pool integrity ≥150 combos,
  the offset law, arc-day pin, plan coverage row-for-row, per-day distinctness,
  per-week distinctness, wall-vs-line disjoint, the planted-coincidence drift
  cap). Mutants m43 (day-term frozen — same decoys on every wall: same-day
  distinctness survives, only the week witness sees it) and m44 (plan stops
  pre-seeding the day — the wall frames the line and the assertion fires);
  **all 43 die**.
- `papersplay` proves it live on seed 0's whole week: all 26 bulletin rows
  match Node's plan row-for-row (name AND number, across processes), the sheet
  paints in its own red ink (441 px on the three-row day, 734 px on the five-
  row day — 10px rows since #1943), no name repeats across the seven walls,
  and no row names anyone in the line.

## Mutants (57, all die under `npm run paperscheck -- --mutate`)



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
denied and the truth path screams (#1938). The clock years added four:
the fifteenth shrinks SEAT to half a second (the gate would catch scripted
play — the cadence replay sees the closes); the sixteenth pulls the day-7
quota tooth (dawdling survives the finale, or the week overruns and
crashes); the seventeenth zeroes the miss dock (turning people away costs
nothing — the dock arithmetic names it); the eighteenth keeps the dead
clock at morning (day two opens closed — the rewind witness bites). The
purse years added three: the nineteenth zeroes the wage (work, then starve
— the autopilot's 233 cannot be paid); the twentieth pulls rent from
`settle` (no eviction, the schedule probe names it); the twenty-first
pulls the two-night starvation tooth (#1966). The detail year added three:
the twenty-second mutes the BROW comparison and the twenty-third the MOUTH
comparison (forgers of that feature walk free while `judge` still denies —
the fairness twin catches both); the twenty-fourth shrinks `FEATURES` back
to four — verdicts stay fair, gen never stages the new breaks, and only
the staged-coverage witness sees the new rules become décor (#1972). The
arc year added four: m27 never prints the turn on the sheet (an invisible
Jorji — the booth lets him walk); m28 pairs the name with the wrong number
(the witness is printed but lies, and the name-AND-number law never bites);
m29 silences the callback (faces return but the booth has no memory); m30
forgets the arc took a bulletin slot (the wall outgrows five — unfair by
furniture). m11 was re-anchored to the adaptive decoy loop, same tooth. The
crowd year added two: m31 flattens `accFor` (no headwear ever — fairness
never notices, only the variety witness sees a signature feature vanish);
m32 teaches the booth to read decor (a live hat differing from the photo's
convicts — gen-born papers stay fair because decor is shared at birth, so
the face-only perturbation in the neutrality witness is what kills it). The
cast-of-six year added two: m33 freezes the rotating window (seed stops moving
the cast — fairness and the per-week witnesses still pass, only the sweep-wide
seatsWalked witness sees that Sonya and Tadek never walk); m34 mutes the greet
branch (returns still speak, but the neighborhood never introduces itself —
the speech-shape witness kills it). The long-conversation year added two:
m35 drops the payoff beat (every thread dangles unanswered — the return
shape pin `say[2]===follow` and the plant/payoff continuity witness bite);
m36 crosses the wires (greetings speak their own payoff — strangers answer
questions nobody asked; only the greeting pin `say[1]===hook` sees the swap,
because continuity alone still looks intact). m29 and m34 were re-anchored
onto the new thread literals when #2003 widened the branches — anchor drift
is the mutant's first test, and the sweep's `anchor not found` FAIL is the
suite protecting itself. The booth-explains-itself year added three: m37
silences the calendar roll (the seam crosses but no morning says NOVEMBER —
the day-6 monthTurn pin bites); m38 keeps the `WITNESS: EXPIRED` headline
but drops the quote (the booth is back to naming rules instead of showing
the comparison — the verbatim-quote pin bites); m39 sends the wall back to
bare numerals (dshow becomes dfmt — the `NAME DD YYYY` shape pin bites). The
crowded-return year added two: m40 never sends the crowd (the week shrinks to
four seats — fairness cannot see it; the per-week meets-six witness bites);
m41 crowds with a clone of the returning head (the tail seat never leans on
the glass — the day's head-then-tail order witness bites). m33 (frozen
rotation) was SHARPENED, not added: its sweep-wide invariant survived for one
sweep because the seeded crowd seats cover the sweep even when the head is
frozen — the invariant now grades every week meeting all six. The crowded-
speaks year added two: m53 never flags a crowd (banner accent, mug math and
the exchange hinge on the flag — the law witness bites while papers stay
fair); m54 untethers the callback from the head's name (the two beats of one
shift stop pointing at the same faces — the name-tie witness bites). The arc-
polish year added four more: m55 erases the bulletin mugshot (the wall is
text-only again — the pass's signature feature); m56 freezes the chapter mixer
(the neighborhood never learns a new line); m57 mutes the seize aftershock (a
friend is taken without a word); m58 hangs mugshots on every decoy — three
portrait bumps push day 6 past the scale box, and the per-row fit law (which
m58's first draft dodged, because the bump was `some(faced)` not
`count(faced)` — one surviving mutant, then sharpened) names it (#1988).

## Gates

`lint:papers`, `paperscheck` (static CI), `papersplay` (smoke CI: real
keys only — right call stamps its ink color, wrong call frames the papers
red and names the witness, day banners fire, chaos is demoted, seed 2
survives the week, pixels vs sim proven side by side; since #1938 also:
the passport carries a painted photo in its beige frame, honest papers
render byte-identical face+photo pixels, and a forged photo denies with
its own feature band lit — sampled only after the stamp ticks out, since
during a stamp the counter shows the previous document; since #1960 also:
the wall clock ticks with live frames, a fast-forwarded shift closes the
gate — banner, dock, full morning rewind — and an unfinished finale dies
on the quota; since #1972 also: the photo is a zoom-crop — the head's
widest row runs >=44px of non-beige — and the day's faces paint BOTH
brow thicknesses and BOTH mouth shapes in ink px, with bare-eye whites
counted; since #1983 also: the bubble field is dark on strangers and ~5.4k
paper px when the arc face speaks, the seed-0 Grubak turn denies with the
printed number and scores with a real key, and a sympathetic APPROVE of
seed 1's MARKO is the one-strike trap; since #1989 also: the crowd is
pixels — hats/unibrows/earrings/missing teeth paint their own inks at the
counter and in honest photos, three hat kinds walk seed 0's first two days,
bare heads paint none, every background face's decor matches Node's
`accFor(serial)`, and Grubak arrives in his authored cap+unibrow; since #1997
also: all six cast marks count in disjoint ink windows (freckles 12px, patch
24px), first walk-ups greet with personal lines (Grubak 5647px, strangers
0px), and seed 4's live week proves the rotated window — Sonya greets day 2
in her scarf+earring (hat 980px, gold 9px), the day-6 sheet carries HER
number and the real deny scores, and Tadek's day-7 return says its own
"YOU LET ME THROUGH."; since #2003 also: greetings carry their hook thread
(Sonya's two-line intro prints 4854px), the day-7 return pays off the topic
its greeting planted ("LITTLE, BUT IT BUYS.") and the bubble field is GROWN
for it — the 9px growth strip below the old 34px field prints 1314 paper px
on a thread while a quiet booth shows neither field nor growth (<100 both));
since #1891 also: the wall prints the month NAME (`OCT 27 1982`); a correct
deny quotes its case in gold and a wrong admit quotes what you missed in red
with the strip's corridor counting the ink (an innocent deny says `THEY WERE
CLEAN` and the corridor stays dark); new papers drop onto the counter (the
settle reaches its −10px step and rests at 0); and day 6's banner announces
`NOVEMBER` on the morning the calendar turns); since #2012 also: the shift is
crowded — the day that arrests Grubak (seed 0 day 6) also prints SONYA'S
first hello as the day's second bubble (4854px), and on the rotated window
(seed 4) Anja greets behind Sonya's turn (day 6, 5096px) while Petr greets
behind Tadek's payoff (day 7, 5222px); since #2020 also: the crowded morning
announces itself — day 1 opens with no mugs in the waiting strip, a solo
morning shows exactly one, day 6 waits two deep and thins to one behind the
tail; both bystander beats print their gold tag and slate line (SONYA's shift
carries "VOLEN SAYS HELLO." by name), a solo day's aside zone stays dark;
day 6's banner carries the two-faces accent and day 2's stays plain; the
whole crowded week hums the low third note exactly twice — the return days,
never the tails (sampled only after `waitQuiet`: the banner veil and the
citation pin both hide the booth); since #1982 also: the door rings its
welcome — seed 0's week rings exactly twice, named: GRUBAK mid-day-6 (turn)
and MARKO mid-day-7 (again); violators, fill and greet tails never ring
(`sfxAgain` + `againLog`); since #1908 also: seed 0's whole week
of bulletin rows matches Node's plan row-for-row across processes, the sheet
paints in its brighter wallRed ink, no name repeats across the seven walls, and
no row names anyone standing in the line; since #1943 also: the zoom-crop head
is scanned across the whole head block and runs 62px, the compared brow ink
survives inside the photo (dark-family 34 thin vs 74 thick px on bare faces),
and the 10px sheet rows paint 441/734 px of wallRed on the 3-/5-row days).
NOTE:
headless Chrome on a shared box logs a device-level "AudioContext
encountered an error" line — an OS audio-renderer complaint, not page
code, and filtered as such).

## The door knows its regulars (#1982)

The booth remembers faces — until now only the WORDS said so. A returning
neighbor now also gets a SOUND: when a ruling takes the last face away and
the next applicant carries the generator's structural memory (`person.recall
= 'again' | 'turn'`, set by the same visit law that writes `say`), the door
rings RECOGNITION — two ascending triangle notes (523→784, layout law) as
they step up to the glass. The first walk-up and every stranger pass in
silence; the week rings exactly twice.

- **Memory is structural, not lexical**: the chime keys on `recall`, never
  on `say` — strip the speech and the bell still rings (and the existing
  all-day speech-purity witness keeps proving the reverse: decor can never
  convict, `rules.js` must not even contain the word `recall`).
- **A voice of its own**: the pair is arithmetic-disjoint from every fixed
  tone the booth owns (stamps 300/190, verdicts 760/560, payday 880/1175,
  month chime 988, brow tick 1050, clock tick 1150); paperscheck extracts
  the booth's `playTone` literals and demands zero overlap.
- Decor for the shell only: the sim never sees the chime, `sfxAgain` counts
  arrivals for the harness. paperscheck sweeps every seed for the recall law
  (stranger null · first visit null · return 'again' · arc 'turn' · recall
  ⟺ the canonical "YOU AGAIN." · exactly two welcomes a week, one per
  return day); mutants m51 (returns unmarked) and m52 (greetings wear the
  memory) die. `papersplay` walks seed 0 live and names the rings: GRUBAK
  mid-day-6 (`turn`), MARKO mid-day-7 (`again`) — violators, fill and greet
  tails pass in silence (`againLog`).

## THE POLISHED ARC (#1988) — faces on the wall, a loud turn, many voices, a deny that lingers

The original's bulletin is never text-only, spotting a familiar name is a
moment, Jorji's repertoire grows every week, and a seized neighbor argues all
the way out of the booth. This pass puts those four beats on the canvas, plus
pins the bubble tail that had been drawn-but-unpinned.

- **The bulletin prints a face.** The arc's sheet entry carries the regular's
  authored descriptor (`day.wanted.push({ ..., face })` — identity law: the
  mugshot IS the neighbor, every feature and the mark compared), and the wall
  paints it as a 26px paper mugshot under the name (`ARC_MUG`, drawFace at
  s=0.30 — the third surface after counter and passport photo, same function).
  Fit: `wallRows` grows every faced row by the frame + seam, per ROW — day 6
  (always the arc day) worst sweep bottom y=353 vs the SCALE-box law y=358.
  Decoys stay text-only: a face for a name that never walks is a lie with no
  witness. `bulletinPix()` proves frame+portrait pixels live.
- **The turn announces.** While the arc entrant is AT the window, the bulletin
  underlines the arc row and frames its mugshot in `ARC_HL #ff3b30` — chosen
  outside the wallRed hue family (gg<80 vs the sheet's 80..150) so the sheet
  gate still counts sheet rows and the announce has ink of its own. View-side
  only: keyed off `view.person.arc` and `wanted.face`, never `gs` — `stateHash`
  is byte-identical (TMD ghost-cell doctrine; paperscheck tripwires that
  rules.js/sim.js cannot even name the lever). The shared row-walk
  `bulletinRows(day, rules, hlOn)` is one source for paint, probes and law.
- **Voice breadth (REPERTOIRE).** Each regular carries `turnAlt` (the sputter
  starts `...` — the beat is being caught mid-sentence) and `againAlt`; the
  mixer is the CAMPAIGN CHAPTER `floor(seed/6) % 2`: week 0 speaks every
  canonical literal (every existing fixture replays byte-identical), week 1
  meets the same faces saying their alternates. (Seed+day parity could never
  vary this: the visit law's period is six, so a face at a seat keeps parity
  forever.) Zero rnd, `say` stays decor (purity twin now strips say AND seize,
  every paper, every day). The say-line law relaxes from one literal to the
  authored set; new distinctness laws keep the 43-sentence repertoire echo-free;
  sweep witnesses require every alternate spoken across the 12 weeks.
- **The deny aftershock.** `person.seize` (authored per id, arc branch only —
  `else` nobody carries it) prints under the DENIED stamp in the corridor
  below the rotated stroke (SEIZE.y=156, ink top ≥148 > stamp bottom 147)
  for the lifetime of the #2021 inspector pin, and the stamp thunks at
  `SEIZE.tone` 147 Hz — below every fixed tone the booth owns (stamps
  300/190…, recognitions 523/784). Evidence-style, no new rule; `sfxSeize`
  counts it for papersplay.
- **The tail is pinned.** `bubbleTailPix()` counts paper in the triangle band
  above the field (the apex-up tail toward the glass was drawn since #1983
  but only the field was measured); papersplay: strangers dark (<20px), a
  speaking neighbor lights it (>60px).

## Honest gaps

- **CLOSED by #2020 (2026-11-12):** #2012's crowded shift was staged exactly
  like a solo day — no visual beat marked the denser morning, neighbors never
  acknowledged each other, and bodies teleported in. THE CROWDED SHIFT SPEAKS:
  the waiting strip mugs the known faces (two deep on days 6/7), a tagged
  bystander exchange runs once per crowded shift (voice behind / voice from
  inside, the head named), the morning banner gains its accent line, the
  recognition chime its low third note, and entrants settle onto the counter
  with their papers. See "THE CROWDED SHIFT SPEAKS (#2020)." *Still open
  from the pass:* the tail seats' **cross-week memory** — seats s+4/s+5 walk
  once a week by the recurrence law and never comment on having crossed last
  week; the beat needs a week-adjacent structure (what seed N played is what
  seed N+1 remembers), bigger than a polish pass — filed as the follow-up
  feedback issue.
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
- **CLOSED by #1960 (2026-11-10):** Day 7's queue was long (13 entrants
  since PORTRAIT added its test paper) but the finale cost nothing — the
  booth waited forever and the clumsy budget cleared it with room to spare.
  The booth now has the original's shift clock: budget = queue × 18 s, the
  gate slams at 18:00, turned-away heads dock the record, and day 7 must
  finish. `paperscheck`'s SHIFT CLOCK section pins the budget law, the
  scripted-play inequality, the 10 s human cadence clearing every seed, the
  sloppy eye still clearing the week, deterministic close arithmetic and the
  printed 08:00→18:00 mapping; `papersplay` proves the clock ticks, closes
  and kills the unfinished finale with live keys.
- **CLOSED by #1966 (2026-11-11):** the clock docks score for a missed
  line, but the original's PAY economy
  (rent, soup, heat, the deduction slip at end of day) has no port here at
  all — days 1–6 closing costs points, not survival, which is softer than
  the original's slow squeeze toward a cold apartment.
- **CLOSED by #1972 (2026-11-11):** the photo paints at 0.6 scale — the
  features stay distinguishable at
  that size (papersplay counts the pixels), but a 40px face is a coarse
  read next to the original's detailed portrait art; and the compared
  feature set is four (cut, width, glasses, facial hair) where the
  original's eye roams a whole face. The portrait is a zoom-crop now
  (head ~50px) with whites+pupils, brows, nose, ears and an open-mouth
  block, and the compared set is six (brow thickness, mouth shape join
  it) — every feature pinned as actually forging in paperscheck, every
  new mark measured as canvas pixels in papersplay.
- **CLOSED by #1979 (2026-11-11):** Face variety is combinatorial (five
  skins × five hairs × four cuts × width/glasses/must), not hand-authored
  characters — everyone is a mix of the same parts. Four REGULARS are now
  authored end to end (`gen.js REGULARS`): fixed six-feature descriptors,
  colors, body stats and one signature mark each (scar / mole / wrinkle /
  big-ear, one ink `#8f4a3e`, painted at the counter AND in the zoomed
  photo). They walk the line days 2–7 — deterministic `(day−2+seed) mod 4`,
  so two of them return inside every week — papers built legal for whatever
  day they arrive, names blocked from the random pool so no twin dilutes the
  recurrence. `paperscheck` REGULARS pins cast integrity, both values of
  every compared feature, the identity law (same id ⇒ same descriptors + mark
  on face and photo), day-injection, the queue-size law and legality (decide
  and judge both approve); mutants m25 (never injected) and m26 (face
  re-roll) prove the witnesses bite. `papersplay` counts the four inks
  through the same drawFace (scar 12px, mole 4, wrinkle 66, ear 72 vs the
  standard 40) and stamps a live Grubak at the seed-0 day-2 window.
- **CLOSED by #1983 (2026-11-11):** regulars got no callback lines and no
  story arcs. One cast member per week now turns wanted on their return
  (`arcForWeek`, day 6) — papers legal, name+number on the bulletin, DENY
  correct, approval the trap — and returning faces speak at the counter
  ("YOU AGAIN." / "...I NO DO ANYTHING." on the turn). ARC section + m27-m30
  in paperscheck; papersplay stamps both sides live (52 gates).
- **CLOSED by #1989 (2026-11-11):** the cast is four and the marks four — the
  original's crowd is dozens of one-offs with far more variety (hats,
  unibrows, earring, missing teeth); here background entrants stay
  combinatorial. The line now wears the original's one-off looks: hats
  (flat cap / ushanka / headscarf), unibrow, gold earring, missing tooth —
  decor derived as a pure hash of the passport serial (identity by
  construction, zero seed re-sequencing), painted at counter AND photo,
  authored for the four regulars, and proven decor-not-evidence by the
  CROWD section + m31/m32 (see "The one-off crowd").
- **CLOSED by #1996 (2026-11-12) (part 1 — nations):** the crowd dressed free
  of the passport — hat/earring/gap rolled pure from the serial, so the line
  read as noise, not nations. `accFor(pic, nation, sex)` now salts the serial
  hash by the entrant's own country and sex (still pure, zero rnd): caps for
  Kirinia and Antegria, Veskole fur (women in fur 3-in-4), Parmenistani wraps,
  scarves for the women across the line, the highest coverage rate for
  Antegrian officers, and a national tint on the sparse families — while
  ARSTOTZKA stays the deliberate mix (nations correlate, never uniform).
  `person.nation` carries the truth-at-birth country for the witnesses (the
  papers may lie, the coat doesn't; decide still reads neither). THE CROWD
  WEARS ITS NATION section grades per-nation dominance + host mixing + serial
  4031 pins (one paper, four nations) and m33 (nation-blind kind pick) dies
  on it; papersplay's live walk grew to the full seed-0 week — 13 hatted
  heads dress by nation, decor byte-equal to Node across 55 rows. The pass's
  remaining halves (bodies/shoulders, one-off speech breadth, deeper regular
  echoes) were filed on the follow-up issue the PR comment names.
- **CLOSED by #1997 (2026-11-11):** the cast was four and only the arc beat
  had words beyond "YOU AGAIN." The neighborhood is six now: Sonya Malak and
  Tadek Hruby authored end to end (new marks freckles/patch, authored decor,
  personal greet + callback for every regular), and the rotating-window law
  lets six seats share a six-day walk without losing a single recurrence —
  see "The cast of six."
- **CLOSED by #2003 (2026-11-11):** personal speech was two sentences deep
  per face — greet, remember, turn; a beat, not a thread. Each regular now
  carries four authored beats `{greet, hook, again, follow}`: the first
  walk-up opens a topic (Grubak's bread line was LONG), the return answers
  it ("STILL NO BREAD, HA!") — the neighborhood's conversations evolve
  across the week. Zero rnd: every seed replays byte-identical, and the
  bubble grows to print the payoff (8+13n growth law pinned; the growth
  strip under the old field prints 1314 paper px live and stays dark for
  strangers). The arc turn keeps the canonical Jorji pair — the wall
  interrupts breakfast. The gap's other half, letting one face recur more
  than once a week, is the window amendment below.
- **CLOSED by #2012 (2026-11-11):** the rotating window showed four of six
  seats per week — deliberate (recurrence needs repeats), but the original's
  line is denser: several familiar faces can crowd one shift. THE CROWDED
  RETURN: every seat walks every week (offset k greets day 2+k), seats s, s+1
  return days 6, 7, and both return days host TWO regulars — the returning
  head plus the greeting tail. The queue-size law needed no amendment after
  all (the fill loop absorbs both heads); the second bubble sample per window
  is live in `papersplay`. See "THE CROWDED RETURN (#2012)."
- **CLOSED by #1982 (2026-11-12):** regulars' returns had no sound of their
  own — the stamp on a familiar face sounded like every other stamp. The door
  now rings an ascending two-note welcome when a returning applicant steps up
  (structural `recall`, layout-pinned motif, two new mutants, live count in
  papersplay). See "The door knows its regulars." *Still open from the pass:*
  marks stay static decor (no aging between visits; the aged-photo trap has
  never worn a regular's face) and the mole's 4 ink px at phone scale
  (`?lite=1` 640x426) is unmeasured — filed as #2080.
- **CLOSED by #1891 (2026-11-11):** the evidence string was the contract's
  promise but lived only in the sim (`gs.last.evidence`), the wall printed bare
  numerals, the OCT→NOV roll was silent, and papers teleported onto the
  counter. The strip now quotes the evidence verbatim under the stamp
  (`stampLines`, corridor proven), dates print month names on every display
  surface (`dshow`), day 6 announces `NEW MONTH: NOVEMBER` (`monthTurn`), and
  documents drop and settle (`SETTLE`). See "The booth explains itself."
  (Note: #1891's item 5 listed three gaps that were stale — wanted-sheet
  capacity, portrait read, day-7 queue length — all three closed earlier by
  #1902, #1938 and #1960; verified against the code before touching them.)
- **CLOSED by #2023 (2026-11-11):** the quote lived only while the stamp
  held (~0.5 s — a three-clause deny faded before a human could finish it;
  the original keeps a violation inspector on screen). The booth now *stays*:
  witness + evidence ride pinned after the ink, the judged document holds the
  counter, and only when the read window closes (~2.2 s) is it taken up and
  the next papers dropped — the pin ends on landing, on your next ruling, or
  at the week's end, and input is never blocked. `QUOTE.hold` is layout law
  (paperscheck pins the ≥2 s read window; mutant m42 proves the law bites);
  `papersplay` proves the lifetime with real keys — pinned after the ink
  (281 witness-line red px) and cleared the moment the next papers land.
- **CLOSED by #1908 (2026-11-11):** the fifth-portrait playtest found the wall
  stamped — 10×8 name pool, three undeduped decoy draws, 27 within-week repeats
  and two same-bulletin doubles across the sweep, plus wall names walking the
  window on later days. Decoy names are a per-week plan now (doubled pool,
  distinct by construction, pre-seeded against the whole line) and the rows
  print in a dedicated brighter red. See "THE WALL THAT LIVES (#1908)."
  *Still open (recorded by the playtest, not bugs):* token-level near-misses
  (a decoy sharing a FIRST or LAST name with an entrant) remain by design —
  the printed rule is NAME *AND* NUMBER and the WANTED trap species exists to
  teach exactly that discrimination. (The rows-stay-9px half was amended by
  #1943 — ruleGap relief grew them to 10px; see the #1943 entry below.)
- **CLOSED by #1943 (2026-11-11):** the PORTRAIT-round playtest asked whether
  the photo reads at passport size, whether the nine-law wall buries the sheet,
  and whether long PORTRAIT witnesses fit the strip. The photo now zooms to the
  clip law's ceiling (s 0.90, head ~61px, live run measured 62) with a ≥2px
  minimum-ink clamp on the thin compared strokes (photo brow ink 34 thin vs 74
  thick, live); the nine-law rulebook funds 10px wanted rows (worst day y=352,
  6px slack); all twelve directional PORTRAIT evidence strings are ≤42 chars
  and the 54-char corridor fit is pinned. The aged-photo trap (grey hair, same
  face) and day-1 PORTRAIT ride unchanged — the playtest's own doctrine calls
  first-timers' convictions balance feedback, and the sweep reports the trap
  counts every run. What stays coarse: the portrait is still procedural art at
  ~61px where the original's is a detailed hand-drawn portrait, and face
  variety remains combinatorial + authored, not hand-drawn per person.
- What #1891 still leaves open: evidence strings and RULES text keep
  numerals, so the month-name read is display-only; and the settle is a
  scripted drop, not drag physics — papers still cannot be moved by hand
  (no rule needs them moved, and VirtualControls owns the pad).

## The aged print, the live ear, the face tick (#1976)

- **Aged print**: every passport photo carries an amber wash (`PHOTO_TINT`,
  layout.js) over the whole print inside the frame line — the original's
  photos are old prints, yellowed while the entrant is live color. The wash
  is booth-side paint, never inside `drawFace`: the byte-identity fairness
  proof (portraitPix) stands untouched. paperscheck pins the wash's warmth
  and alpha (m48 fades it to nothing); papersplay counts ≥100 amber px in
  the frame and admits the aged family as background for the beige/head-run
  gates (blend alpha may round 76 or 77 — family, not exact hex, #1908).
- **Live ears**: sideburn cuts 2/3 reached row 52 and buried the ears
  (rows 44-54) on one side only — asymmetry read as a bug on phones.
  Cuts now stop at row 44 (P(36)). `earPix` renders one fixed face per cut
  through the real `drawFace` and counts ear-column skin: 60 under every cut.
- **Evidence audio**: a correct deny whose witness names a brow/mouth break
  adds a sharp 1050Hz tick over the deny thunk (#1966's family-of-own-sound
  pattern). papersplay walks seed 2 day 1 (a brow forger) with live keys and
  counts ticks via `sfxTicks`.
