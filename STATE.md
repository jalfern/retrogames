# STATE — session 229 (2026-11-11, slot b)

## What shipped
**PAPERS, PLEASE-MIN: the violation inspector stays on screen** merged as `b8f932f`
(PR #2023, Closes #2021) — a corpse resumed, re-verified whole, and landed. Slot a
built it and went quiet at 16:21Z with the PR up and `static` green; its claim aged
past the 90-min liveness window and `forge-claim.sh 2021 b` handed the issue to this
slot at 17:58Z (`forge/ppm-inspector` @`19d9fbe` matched origin, clean).
The stage: **the booth's case outlives its ink**. `stampLines` is snapshotted at the
stamp and rides PINNED (`QUOTE.hold = 132` ≈ 2.2 s, layout.js law) after the 30-tick
ink, the judged document keeps the counter through the read window, and the pin ends
exactly when the next applicant's papers land (`settle` → 0) — or on your next ruling
(`act` cuts it short: input is never blocked), or at the week's end. A clean admit has
no witness, so nothing pins. `rules.js`/`decide` untouched → the two-path contract
cannot shift; this is presentation of the booth's own case.
Verification at tip before the rule-5 merge: `paperscheck --mutate` 17656/17656 with
all 42 mutants caught (new m42 shrinks the pin 132→40 and the read-window law goes
red); `papersplay` 85/85 zero page errors — the lifetime chain prints ink
(`inked`/`pinTicks` 132) → pinned after the ink (281 witness-line red px) → cleared
on landing (`pinTicks` −1); the #1891 drop gate survives the delayed hand-off (−5 px
measured live, the exact −10 top stays Node law); lint:mario/fps/ai + eslint + build
green. Prod proof: the live PPM chunk carries `hold:132`.

## The session's catches
- **A dead lane's PR is real work, but re-verify it whole.** The handoff comment said
  "lint gates + build green"; I still ran Node laws, mutants, the browser suite, the
  three lint gates, eslint and a build on my own port before touching the merge loop.
  Eighteen minutes of compute bought a merge with no surprises.
- **Prod-proof needs a runtime marker, not a test hook.** The `__ppTest` keys
  (`pinTicks`, `pinned`) are DEV-only and get stripped by `npm run build`, so grepping
  prod for them proves nothing. Pin a constant the SHIPPING code reads (`hold:132`), and
  find the game's lazy chunk by a content marker ("THEY WERE CLEAN") — chunk hashes move
  build to build (`index-DZE6FFkY` locally vs `index-DBtJPpm0` in prod). jalfern.com
  308s assets to www, so without `curl -L` the "proof" is a redirect body.
- **Route paths are registry facts.** I commented `/papers-please-min`; the title is
  registered at `/papers-please` (src/config/games.js:416). The SPA fallback answers
  200 for ANY slug, so a wrong URL looks verified — copy the path, don't recall it.
  Correction posted on #2021.
- **Claim liveness is the whole protocol.** Session 228 was REFUSED #2021 (live slot-a
  holder); mine landed because slot a's newest checkpoint was 96 min old. That age check
  is what makes resuming safe — never hand-write a claim line.

## Ladder trail
TARGET #2021 claimed for b (17:58Z, after slot a's 96-min silence) → corpse resumed in
the existing worktree → verified → PR #2023 merged `b8f932f` → #2021 `shipped` + closed.
Step 8b NOT filed: the second round already exists — 8 open PPM `feedback` issues own it
(#2020 crowd staging, #1996 one-offs, #1988 arc, #1982 regulars, #1976 portrait,
#1968 pay, #1943 portrait round, #1908 fifth portrait). `next` #1711 stays Jon-side;
flagshipStage null (all flagship gaps owned); QA MASTER live (pid 10099) so feedback
stays theirs. No jonq filed (all pattern-following).

## Open questions
- none from this lane (see waiting-jon issues; #1711 hardware, #2016 lane:qa).

## Next
- `game-queue` holds #1637 (WATCH rollout). b29 candidates: session 227's list, and the
  rollout takes only titles with a PROVEN autopilot (centipede / missilecommand have
  whole-tick lifts in sim.js — check the family harness for a winning driver first, and
  keep an honest "no guide yet" where none exists). Honor the b28 watch-chrome laws:
  pill wrapper inline calc + `--sat/--sar`, one raw paragraph per attract block,
  picker-boot titles into watchphonecheck's SKIP_ATTRACT with a reason.
- PPM's remaining honest gaps (README): evidence/RULES strings keep numerals, so the
  month-name read is display-only; the settle is a scripted drop, not drag physics.
- Nightly: tip is `ab80b20` (DK hammer #2030). `main-ok` answered "nightly cancelled"
  through this merge — the known #601 hole (a fresh cancelled masking a failure), nothing
  new to post; the scheduled nightly re-proves tip.
- Dev servers: slot b :5178 stopped at exit; :5173 (slot a) was NOT running this session.
  PPM's `--mutate` writes temp module dirs, so it needs no source window — but the
  ≥20-min exclusivity law still applies to suites that touch the working tree (#1525).
