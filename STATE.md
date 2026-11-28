# STATE — forge board snapshot (slot b, 2026-11-28 — the mountain learned to manual)

## This session (slot b) — never-dry, claimed, shipped, closed

**SSX MANUALS (#3901, PR #3905, merged `3440b3c`)** — never-dry rung: the
warden armed `KICK SSX -1 weak` (score 1 = open QA feedback #3900 naming it;
zero unowned README gaps; flagship stage spent). Per the rung's law the fix is
gameplay, not #3900's fidelity work: the one signature the sim never had was
the original's ground-combo glue.
- **What shipped:** a landing that PAID (`evalTrick pts > 0`) met with the
  edge still held (↓ — #547's scrub verb, drag and all) rolls into a nose-up
  **manual**. Hold scores nothing; releasing clean pays
  `manualPts(150) × min(1, t/manualCap 1.2s) × chain mult`, meter fed at the
  trick-economy rate (rails precedent); the cap makes Showoff farm-proof.
  Ollie/crest/lip/rail exits pay on the way out (butter into the next
  feature, combo alive); a crash forfeits silently. Deck pitched ~22° about
  the #904 somersault axis (boot weld still solves), rider leans back,
  `MANUAL <t>s +pts` pop, lift thump + exit hiss, trick-book line. Planner
  stays cold (never emits ↓) → CPU/attract/WATCH byte-identical.
- **Gates:** ssxcheck 348 → **363** (entry/no-entry/hold-neutral/capped pay ×
  chain/meter rate/crash-forfeit/ollie+rail exits/hash/cold-planner guard);
  hand mutant entry→false: 7 red, restore green. ssxplay 11/11 real keys
  (manual entered→held 0.9s→paid +300, zero page errors, pose screenshot
  judged). terraincheck 84/84, mountaincheck 257/257 (autopilot still wins).
  lint mario/fps/ai + eslint + build green. Prod verified: `SSX-sk4bOckF.js`
  carries the manual.
- **CI lesson (one PR spent, rule-3 clean):** first static was RED — not
  lint: `jonqcheck` #991 pins SSX's README honest-gaps list EMPTY (idle-stage
  fixture). A new README gap must be owned by an open issue or carry the
  repo's CLOSED/BLOCKED/**DISCLAIMER** marker. My design note now reads
  `**DISCLAIMER**` (#2488 class: prose stays, weakness doesn't score) —
  jonqcheck 168/0.
- **Advisory not-mine:** ssxmodelcheck's pad-cluster (stick/trick-row
  selectors vs the #3108 full-pad default) fails on THIS Mac at origin/main
  too (9/76 at a9bee12, nightly green). If it recurs, name it on an issue
  before blaming a PR.

## Slot board

| Slot | Lane | Doing | Since | Heartbeat |
|---|---|---|---|---|
| a | games | **#3879** Lemmings LOOK — first slice shipped (#3904 `a9bee12`), issue open multi-stage | 2026-11-28 ~18:20 | fresh |
| b | games | idle at `origin/main` (`3440b3c`) after shipping #3905 | 2026-11-28 ~20:30 | fresh |
| qa (mini/studio) | qa | **#3900 SSX fidelity (#3902) and #3888 simcity strokes (#3907) both SHIPPED this cycle**; sessions alive | — | fresh |

Open question issues: **#3791 AWAITING JON** (dry-shelf flagship title).
Neither blocks a claim.

## What is playable right now

- **SSX** at https://jalfern.com/retrogames/ssx — land ANY scoring trick
  holding ↓, release clean: nose-up manual, `MANUAL <t>s +pts`, chain-scaled;
  butter the hold off a roller or onto a rail and it pays on the way out.
- **LEMMINGS-LITE** — slot a's look slice live (sloped planks, animated
  sprites, splintering wood). **COMET DRIFT HD** attract column fixed (#3906).
  **SIMCITY-MIN** one-stroke language (#3907) + river shimmer (#3891).

## Next actions by priority

1. `idle-kick` re-derives NONE again (SSX gap list empty again, shelf owned)
   — STOP legal for a fresh lane; never-dry re-arms only when a building issue
   closes while gaps stay unowned.
2. **Lemmings float-while-digging** — the shelf's biggest engine gap
   (vertical-dig mode); budget as engine task if a future kick names it.
3. **DEFENDER stage 2** — still no open builder issue; verify numbers live
   (#3860's history) before filing fresh.
4. QA-lane candidates from my stage: SSX attract buttering rollers (README
   DISCLAIMER names it); rivals riding manuals needs planner ground verbs.

## Open risks

1. **ssxmodelcheck pad-cluster** Mac-only red (full-pad default vs old
   selectors) — CI green; name it before it eats a lane hour.
2. **Issue-number drift** — refs above (#3900–#3907, a9bee12→3440b3c) were
   verified live.
3. **`statepark` cannot prove its own currency (#1214)** — unchanged.
4. **jonqcheck REAL_GAPS** — README gap hygiene is a load-bearing fixture;
   new honest gaps ship with an owner issue or a marker, never bare.
5. Games at 0 lack sensor/agent files (#3821, #3784) — unchanged.

## Open questions

- #3791 (dry-shelf flagship title) — AWAITING JON.
