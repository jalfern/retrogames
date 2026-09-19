# STATE.md — 2026-09-18 (session end, work PAUSED by Jon)

## Where things stand
Jobs 1–3 walk-clear at the OLD guard speeds (merged: #54, #55, #57–#60).
This session was the 4-task follow-up: CI smoke, heistcheck audit, nightly, and
stealth tuning. Tasks 1–3 are merged; task 4 (tuning) is **open as a PR, job 3 red**.

| done & merged | what |
|---|---|
| **#57** | `scripts/heistsmoke.mjs` — 21 checks / ~8 s: every job mounts, renders, and the player moves. Mutation-proven (the `batch([])` revert turned exactly job 2 red). `smoke` CI job (~50 s). |
| **#58** | heistcheck audit: every world now builds headless in Node (`ART BUILD`), 2 vacuous checks deleted, **2 real bugs fixed** (texture-cache `JSON.stringify` on live CanvasTextures; negative-seed `arr[-1]` in `makeTrashCan`). 304/304. |
| **#59** | `heist-nightly.yml` (cron + dispatch): each job played via heistwin, artifact logs, deduped red-night issue. heistwin header marked **FROZEN**. |
| **#60** | the steering bug that dominated everything: `goTo()` flipped both stick axes vs `stickFor()`'s camera convention → the bot **walked backwards** into guards (nightly's 1.7-s deaths). Frames-verified fix + end-of-attempt autopsy + `scripts/lib/stick.mjs` (the one stick law) + `scripts/heisttiming.mjs`. |

## OPEN: branch `heist-tune-escape` (PR filed — job 3 stochastic, do NOT merge as-is)
Game change (`engine.js`, `stealth.js`): CHASE 3.4/4.4/3.55 → **2.95/3.85/3.1**, dash 5.0 → **5.6**.
Measured, not felt: at the old numbers a dashing raccoon left a guard 1.0 m in 8 s and a
DOG *closed* 2.7 m — "dash and survive" did not exist. The chase rig (engine-law guard,
camera-law stick, engine rebuild-nibble subtracted) now says dash **+3.3 m**, walk **−0.9 m**.
- job 1: CLEAR 272 s (heistplay 138/138 still green — it *wants* arrests, and they still happen).
- job 2: CLEAR ×4 (272/473/472/483 s and 590 s after tuning), heat 0.
- job 3: **stochastic** — one CLEAR in four tuned runs (792 s), the rest bust at ~38 s
  on the same signature: a second arrest *while carrying* drops the sack and leaves
  fewer than two raccoons standing, and the pound cannot be chewed without a free
  carrier. So job 3 at 2.95/3.85 is "sometimes winnable" where it was 3/3 before —
  the tune made the manor harsher than its escort choreography can absorb. The driver
  now bails that dead state honestly instead of chewing the cage forever (committed,
  outcome not yet re-measured). Fix is one of: gentler manor CHASE, or a driver plan
  that never takes a second arrest while carrying. (My earlier "baseline" run was
  accidentally *with* the tune — only driver edits were stashed — which is exactly
  why the answer is "sometimes", not "never".)
Playtest notes: deliberately blank — I cannot play this; a bot clearing it is not evidence
of fun. Full heistwin runs also shifted: every clear still involves `caught` (Jon's open question).

## Instrument facts learned the hard way (all cost hours; keep them)
- **Stick law**: engine basis is `st.camYawEff`; world delta (dx,dz) →
  `mx = dz? (uz·s − ux·c), my = ux·s + uz·c` with s=sin(cam), c=cos(cam) — raw pad
  y-negation lives in index.jsx; `scripts/lib/stick.mjs` is the single source. mx=1
  under yaw≈0 walks −x. Three separate tools had this wrong; one of them "measured"
  guards missing point-blank arrests because a fake state `'chase'` froze the guard
  (real states: patrol/suspect/alert/stunned), another forgot the engine's 1.15 m
  reach rule, another let the alert guard idle between 0.4-s repaths. A rig that
  lets either actor stop measuring is reporting furniture.
- **Damps**: full stick achieves ~2.45 walk / ~3.05 dash m/s (not the nominal 2.75/5.0).
  Anything measuring escape must rescale the ACTOR between frames (engine nibbles
  position back every update) or it measures a number nobody walks.
- Old probe numbers from headless chase scripts that predate this law are **not real**.
- Nightly + smoke exist; the browser suites stay advisory; `static` is still the only gate.

## Three questions for Jon (paused at the 4-hour mark)
1. **Job 3 vs the tuned guards:** lower the manor CHASE pair toward the old values
   (dog especially — 3.85 vs a 2.45 walk is still −1.4 m/s even after the tune), or
   teach the driver an escort/patrol-cycle plan and keep 2.95/3.85/3.1? (Current PR
   is red on this exact line; I did not guess the answer.)
2. **Clean-run contract:** with the tune, job 2 heat stays 0 but every clear still
   gets caught once. Keep `caught ≥ 1` as the nightly baseline, or make a
   never-caught job-2 run the target before further tuning?
3. **Nightly**: leave it cron 05:30 UTC (jobs 1–3 sequential, ~25 min), or split to
   per-job dispatch + one red issue per job so job-3-style reds don't shadow greens?

## Housekeeping
Dev servers stopped. Working tree clean on `heist-tune-escape` (2 commits pushed);
`main` = origin/main = 8a1ea56. `heistcheck` 304/304, `lint:heist` 0, smoke 21/21 on the branch.
