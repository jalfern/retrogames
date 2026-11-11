# STATE — session 219 (2026-11-11, slot b)

## What shipped
**PAPERS, PLEASE-MIN: THE ARC** merged as `dbe5b5b` (PR #1985, Closes #1983 —
NEVER-DRY pick, weakestStage score 7 = 1 unowned README gap + 6 QA feedback
issues naming the game). One regular per week turns wanted, Jorji-style:
`arcForWeek(seed)` = cast[seed mod 4]; by the injection law that face walks
days 2 and 6, so the turn lands on the **return, day 6** (WANTED awake since
day 4). The case is the wall's: bulletin pairs the authored name with the
passport number carried THAT day; papers stay built-legal — pull the sheet
entry and decide approves (paperscheck's pull-the-witness pin). rules.js
untouched. Returning faces speak: turn = `YOU AGAIN.` / `...I NO DO
ANYTHING.`, plain recidivist (days 3→7) = `YOU AGAIN.`; lines ride
`person.say`, purity pinned (stripping never moves a verdict). Bubble paints
as printed paper (`layout.js BUBBLE`, tail up). Wall law: arc day stages one
decoy less — five-portrait capacity and deepest-five witness stand.
paperscheck **11082/11082** (new ARC section + m27 invisible-turn, m28
wrong-number witness, m29 silenced-memory, m30 overflowing-bulletin; **m11
re-anchored** to the adaptive decoy loop — an old anchor gone stale is a red
mutant, catch it in the mutate run). papersplay **52/52**: bubble 0px dark on
strangers vs 5372px when Grubak speaks; seed-0 day-6 deny stamps WANTED with
the printed number; seed-1 sympathetic APPROVE of MARKO costs the strike.
Live: jalfern.com/retrogames/papers-please (PPM chunk `index-Dk2m3ISj.js`
carries `VOLEN GRUBAK` + both callback lines).

## The session's catches
- **Stamp frames lie to pixel probes.** bubblePix read 0px because the
  PREVIOUS entrant's stamp holds 30 ticks — while shown, the counter displays
  the judged document, not the live person. Wait ≥650 ms (stamp-tick-out)
  before sampling a new entrant's pixels (#1938 doctrine, again).
- **jalfern.com edge can lag a Vercel promotion by ~35 min.** Production
  deploy status said `success` at merge+1s while the proxy HTML still
  referenced a superseded entry hash (its assets 404 at origin). Local dist
  hashes ≠ Vercel build hashes (drift): verify by CONTENT — fetch the entry
  referenced by live HTML, walk its chunk map, grep the game chunk for a new
  string fingerprint (`I NO DO ANYTHING`). Origin `retrogames-psi.vercel.app`
  is the source of truth while the proxy settles.
- **`ok(a.person.say)` vs `ok(a.say)`** — queue items are `{person, truth}`;
  applicant-level fields live under `person`. One arity bug, twelve identical
  seed failures: read the shape, not the message.

## Ladder trail
- TARGET #1637 claim REFUSED (slot a holds it, 49 min at the time — FROGGER
  batch 25 building; never touch another slot's lock). halt none; steer none;
  `next` #1711 → seventh confirm posted (one line), released — Jon-side
  hardware only. game-queue empty; feedback exists but QA MASTER live
  (pid 46138) → borrow refused; flagship stage spent (idle.mjs) → NEVER-DRY
  `idle-kick` answered `KICK PAPERS, PLEASE-MIN 0 weak`, weakestStage score
  7. Filed #1983 with why-weakest, claimed(b), shipped. No jonq (mechanical
  picks; no taste call needed).

## Session bookkeeping
- #1983 CLOSED shipped. QA polish pass filed as **#1988** (bulletin faces for
  the wanted sheet, turn announce beat, per-id voice pools, deny aftershock +
  arc sfx, tail pixel pin).
- :5178 vite KILLED at session end; worktree `~/Dev/retrogames-forge-ppm-arc`
  (detached at dbe5b5b, node_modules symlinked) reusable or
  `git worktree remove` anytime. Old `~/Dev/retrogames-forge-ppm-regulars`
  also still removable.

## Next queued (slot b)
1. Fresh ladder: halt/steer/next/queue games-first. #1637 belongs to slot a
   unless its lock goes stale; #1711 stays Jon-side (eighth confirm = one
   line, release).
2. NEVER-DRY candidates: the NEW residual gap (README) is background-entrant
   variety (hats, unibrows, earring, missing teeth — decor, doctrine of the
   nose: never compared). #1988 (QA lane) owns arc presentation — don't
   build it from here; re-run idle-kick rather than trusting this list.
3. Adding a 7th COMPARED feature = FEATURES + portraitDiffs + drawFace +
   papersplay FE list (#1972 law). New DECOR marks are cheap by contrast
   (drawFace + castPix/ink gates only) — that's the variety stage's shape.

## Notes for the next slot-b session
- Regulars doctrine (updated by #1983): marks ride inside the face descriptor;
  compared set stays FEATURES (six); `say` is person-level atmosphere,
  verdict-purity pinned; the arc is seed-derived (`arcForWeek`) and the turn
  is ALWAYS day 6 — a second simultaneous arc must not reuse day 6's slot.
- paperscheck mut anchors move when gen.js lines move (m11 this time): always
  run `--mutate` before shipping, anchor-not-found is red.
- papersplay live-arc block (seed-0 walk to idx-10 entrant) is the idiom for
  reaching a specific day/entrant with real keys; `runDay()` per day, then
  step until the probe matches.

## Open questions
- None. (No taste/priority call needed from Jon.)
