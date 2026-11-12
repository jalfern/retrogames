# STATE — session 237 (2026-11-12, slot b)

## What shipped
**LODE RUNNER-LITE — PHONE VAULT-SELECT** — merged as `32e60ec` (PR #2064,
Closes #2063, never-dry stage filed+claimed by this session).
- The marquee carries three tappable VAULT 1/2/3 pads (#965 Emberwood house
  pattern): each dispatches the SAME `Digit1/2/3` the keyboard path consumes;
  the window tap-anywhere skips `button` targets, so a pad tap can never also
  fire the vault-1 start. Keyboard paths untouched; the chain still carries
  score+lives (a phone death on vault 2 restarts the chain at 1 — the honest
  classic stands, the phone just reaches the vaults the keyboard could).
- lodeplay §1b NEW: geometry floor (≥44x28; live 103x38), tap-outside-still-
  vault-1, and each pad's REAL centre opens ITS OWN vault via real pointer
  events. Mutant (neuter the guard) died exactly there — pads 2/3 fell through
  to vault 1, 2 FAIL — restored, 42/42 green x2. lodecheck 134/134;
  lint:mario/fps/ai/lode + build green.
- README honesty fix (#961) rode along: the two shipped-but-unmarked bullets
  got CLOSED markers (#2004→`6b2db65`, #1949→`e4a0ad8`) and the closed gap
  cites this PR — LRL's honest-gaps list is now empty of actionable items.
- Prod verified: live entry `index-Kyr1gyAI.js`, marker "pick a vault" observed
  in chunk `index-ClxN6rct.js` at jalfern.com/retrogames/lode-runner.
- Filed QA polish pass #2067 (phone pad crowding at 375px, CHK!DYK?-style
  death beat, unlock ladder flash) — claims verified against code first.

## The session's catches
- **Prod-marker scans have THREE silent-empty traps, not one**: (1) the chunk
  manifest is INSIDE the entry JS, not the HTML; (2) `/retrogames/assets/*`
  answers **308** — every asset curl needs `-L` or greps a 15-byte redirect
  stub; (3) this box's egress proxy intermittently returns Aliyun-OSS XML
  *instead of* the site (looks like a site outage; https + retry clears it).
  `chunks=0` or `size=14` in a scan is a FAILED scan, never a prod miss.
- **weakestStage scores shipped work**: LRL's score of 4 included two bullets
  whose text says the work shipped (#2004, #1949) but that lacked the literal
  `CLOSED by` — the #961 failure, still live. When the picked gap narrates its
  own completion (check `git log --grep`), the honest stage is markers + the
  oldest REAL gap, and say so on the issue.
- **Verify polish-pass claims against code before filing**: "climb reuses the
  stand frame" was false (`set.climbA/climbB` exist); an unverified item in a
  QA issue sends the lane chasing nothing.
- FORGE step-1 scratch must not land in the checkout: a `.qwen/` file in the
  main checkout showed `??` and reads as a corpse to the next lane's clean
  check — write scratch under the session tmp dir instead.

## Ladder trail
TARGET #1637 REFUSED (slot a held it, checkpoint 15 min old; a shipped b31
SUPER MARIO seat mid-my-session and closed #1637 — #2051→`e8f9566`, audit
done, main `49c882a`). No halt/steer/next; game-queue empty; feedback items
exist but QA MASTER live (pid 37504) → no borrow (#1258). Flagship stage
SPENT: `flagshipStage`=null — SSX has no open gaps, Emberwood/CometDriftHD/
Myst bullets all carry CLOSED markers. Never-dry: `weakestStage` → LODE
RUNNER-LITE score 4 (4 unowned gaps, 0 named feedback; registry-order tie
break). Filed #2063 with the why-weakest line, claimed clean. No jonq filed.

## Open questions
- none (see waiting-jon issues).

## Next
- #2067 is the QA lane's LRL job; slot lanes unaffected.
- `viperpitcheck` still red-on-main and wired into NO CI job (session 235
  flag, twice on #1637 now closed — re-file on a QA issue if nobody owns it).
- PPM drain law: #1968 (its last owned feedback) shipped as `2ece0f0` during
  this session; check `weakestStage` again before re-picking PPM.
- #2045 (lane-liveness crossings) and #2036 (resume-gate nightly budget)
  remain open harness improvements, unowned.
- Dev servers: slot b 5178 STOPPED at exit; slot a 5173; QA studio 5176
  (not mine — untouched). Stale worktrees at ~/Dev/retrogames-forge-* — this
  session removed `lrl-vault-pads` after merge; the session-235 candidates
  (ppm-portrait, ppm-bulletin, papers-photo) still stand.
