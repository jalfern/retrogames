# STATE — session 303 (2026-11-16, slot b)

## Playable now / what shipped
- **PLAICRAFT CLAP COACH live (#1711 → PR #2462, merge `327e2de`).**
  Bundle `index-Cu6hOq7o.js` serves it at jalfern.com/retrogames/. The graded
  store (3 verdicts posted on #1711 this session: replay 3/3, voice 2/3 —
  seed4 honest-red pre-fix — clap n-a ×3) showed WHY the ±50 ms acceptance
  line could never close: every human take heard zero claps because nothing
  ever asked the player. New one-shot pill at the recorder's green-REC
  ("CLAP WITH YOUR FIRST TAPS"): no lesson for a dead mic (never LISTEN,
  never pre-getUserMedia), once per device (localStorage — the screen belongs
  to the game; badge + VU carry ongoing truth), instruction never a claim.
  `clapCoachCore.js` pure (recordcheck family pattern) + voiceCapture paint
  (`[data-clap-coach]`, `window.__clapCoach`) + removal if REC dies mid-hold.
  Zero game-file edits — Gauntlet, the three co-op titles and claptest all
  inherit it from the recorder.
- **The grading loop ran for real:** `plaicraft:grade` (self-test 25/25)
  posted 3 PLAIGRADE verdicts on #1711 — idempotent markers mean re-runs are
  cheap; seed10 (valkyrie) + seed76 PASS, seed4 FAIL naming its frozen clock.
- Gates: recordcheck 207/207 (+5 coach pins; hand-mutant `shown:true→coach`
  kills exactly the rule-2 pin) + voicecheck 49/49 + plaicraftcheck (leak
  gate incl.) + netdemo 55/55 + claptestplay coach 3/3 (run A shows, taught
  device hidden, pill painted) + lint:mario/fps/ai + eslint + build.

## BOARD at exit
- building (lane:platform): **#1711 stays OPEN** — by design (big-build).
  Its remaining S1 acceptance is now PURELY HUMAN: Jon plays one Gauntlet
  take + one `/retrogames/claptest` session on the phone (consent YES+YES);
  if 3 claps land, `npm run plaicraft:grade` posts the ±50 ms verdict itself
  and the acceptance list closes on evidence. Full scorecard on the issue.
- game-queue / next / steer / waiting-jon: empty. building-qa: QA's own.

## Next (slot a or b, in order)
1. Refresh the ladder; if empty → flagship stage / weakestStage (idle.mjs).
   Verify a picked gap is player-visible before building (#2391).
2. If a new human take exists in the store (check first!), run
   `DEV_PORT=<own> npm run plaicraft:grade` — it grades + posts by itself.
   Post-#2462 takes should carry claps if Jon followed the coach pill.
3. Watch: if nightly flags more off-tempo claptestplay failures on loaded
   runners, the retry budget (3) is the tuning knob — see catches.

## The session's catches
- **A flake must be fingerprinted before it's excused.** Off-tempo pacing in
  claptestplay failed 3 retries + a rerun (~55 checks, same signature).
  Three pieces of evidence excused it, not vibes: `git stash`-baseline rerun
  without my changes failed identically; the persistent Chrome profile's OWN
  history line showed `11/15 FAIL` predating the code; load avg 8-9 sustained.
  Read the outputs, name the class (#2205 starvation), then move on.
- **sessionStorage does not cross pages.** claptestplay runs run B in a NEW
  page of one context — the once-per-boot flag evaporated. Once-per-device
  (localStorage) is kinder on a phone (the mic arms once per session anyway)
  AND gives the driver a deterministic hidden path. Harness shape selects
  storage class — check the driver before choosing.
- **`git stash -u` ≠ baseline.** My committed coach rode the "baseline" run;
  the commit vs uncommitted split decided what the proof actually covered.
  Know which revision you're testing.
- **Multi-stage close:** `Part of #1711` in the PR body (not Closes) keeps
  the big-build open per FORGE step 8; labels stay `building` until the LAST
  stage's evidence lands.
- **gh merge fast-forwards the worktree onto `main`** — re-detach the same
  breath (`git checkout --detach origin/main`) or the next lane's merge dies.

## Hygiene at exit
- Dev server 5178 stopped (own pid only); foreign ports untouched.
- Worktree retrogames-forge-plaicraft-grade removed; branch gone via squash.
- STATE.md committed to main (game code merged this session) + parked slot b.
