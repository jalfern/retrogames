# STATE — session 302 (2026-11-15, slot b)

## Playable now / what shipped
- **PLAICRAFT S1 blockers closed (#1711 → PR #2454, merge `56131ca`).**
  Live at jalfern.com/retrogames — bundle `index-DEhn8iyS.js` carries the
  capture guard (`content-clock-frozen` verified in the served chunk).
  - **Valkyrie replay:** Jon's stored take
    `gauntlet/2026-11-15-seed10-3a2be04acb.json` replay-verifies **PASS,
    7142/7142 ticks, all 239 checkpoints** as stored. Whole store:
    **10/10 replay-verified — 100%.** The replay half of the fix is
    **QA's #2446** (`9f9e405`) which landed mid-session — absent partnerKey
    now rebuilds the sim's own live default (valkyrie; the pair-swap keys
    only an EXPLICIT valkyrie, unset never is). My PR adopted it.
  - **Capture (this session, unique):** iOS/Android freeze
    `AudioContext.currentTime` while still reporting `running` — seed4's trace
    stamped ms=816 for 100 s and looked internally consistent. `hybridNow`
    now burns a content clock dead >1 s (trace keeps wall pace, `resume()`
    asked, freeze named in `__voiceDebug`); OS-dropped mic tracks (ended/mute)
    take the badge off REC. Short bytes then fail grading honestly by name.
  - **Golden-spec rescue:** QA's default change put 4 gauntlet goldens red
    ON MAIN (native-port spec was recorded beside elf; CI scope missed it and
    the nightly predated the merge). #2454 pins `partnerKey:'elf'` explicitly
    in BOTH copies of the spec table (goldentrace.mjs + goldentracecheck.mjs
    — the table is duplicated, a trap worth remembering). 89/89 green.
- Gates: recordcheck 202/202 (+new frozen-pipeline block; hand-mutant removing
  the freeze branch kills 5 pins in the seed4 shape: same-ms run 55, stall
  55000 ms, settle ms 5000) + evidence self-test 44/44 + voicecheck 49/49 +
  goldentrace 89/89 + netdemo 55/55 + gauntletcheck 306 + gauntletplay 28/28
  (browser, port 5178) + plaicraftcheck + lint:mario/fps/ai + build.

## BOARD at exit
- building (lane:platform): **#1711 stays OPEN** (big-build multi-stage; the
  stage's remaining acceptance needs one fresh phone take from Jon graded green
  replay+voice+clap against `56131ca`). Commented with full evidence.
- game-queue / next / steer / waiting-jon: empty. building-qa: #2430, #2354
  held by QA (left untouched; left a note on #2430 re segment-restart — the
  un-shipped half of mic recovery, parked pending a voice.js format decision).

## Next (slot a or b, in order)
1. Refresh the ladder. Queue empty → flagship stage per FORGE (SSX, Emberwood,
   COMET DRIFT HD, Myst — oldest README gap nobody owns) or `weakestStage`.
   Verify a picked gap is player-visible before building (#2391).
2. If the warden re-points a slot at #1711: the next S1 slice is the human
   grading loop — run `plaicraft:grade` when a new take lands (posts the
   verdict itself), then stage-close evidence goes to Jon/Claude, not a lane.
3. Watch item: nightly may flag other consumers of the #2446 default change
   (anything replaying un-stamped 2p files beside elf). goldentrace is pinned;
   if nightly names more, pin explicitly like #2454.

## The session's catches
- **#2465 was a number I invented.** Never cite an issue tag that doesn't
  exist — fixed in-branch, but check `gh issue view` BEFORE tagging comments
  and commits.
- **Two lanes can fix one bug at once.** Claim is a lock, not a radar: check
  for a merged fix touching the same symbols BEFORE building (git log -S on the
  target file saved the merge from duplicating semantics twice).
- **The golden spec table is duplicated** (goldentrace.mjs + goldentracecheck
  .js). Fix both copies or the gate stays red.
- **Verify-from-the-other-side held again** — the store itself was the truth:
  download Jon's takes, dump `rules`/slots/voice, sweep partner identities;
  divergence-tick ordering (elf 2130 > valkyrie > wizard 870 > warrior 840)
  is what proved live chose the sim default, not any stamped key.
- **A `pull_request` CI trigger silently missing** → `gh workflow run ci.yml
  --ref <branch>` and `gh pr checks` again; static went green that way.

## Hygiene at exit
- Dev server 5178 stopped (own pid only); foreign ports untouched.
- Worktree retrogames-forge-plaicraft-blockers removed; branch gone via squash;
  main detached at origin/main. #1711 stays open by design (big-build).
- STATE.md committed to main (game code merged this session) + parked slot b.
