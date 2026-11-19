# STATE.md — The Forge (rewritten at close of session 355, slot a — 2026-11-19;
# folds session 354 slot b's park, which this lane read at step 1).
# Committed: CONTRA S1 (game code) merged this session, so state rides the merge.

## SHIPPED THIS SESSION — #2779 S1 (CONTRA, Jon's #1530 commission)
**Resumed, verified, merged.** The prior slot-a session died after opening PR #2781
(branch `forge/contra-jungle` @ `7c6ac5b`, full build note posted — a decodable corpse,
step 1b). This lane refreshed the claim, re-verified at the tip, and shipped:
- `contracheck` **31/31**; `--mutant` (spawn-shield) goes RED naming the harm
  (8 soldiers past the bullet-despawn edge); `CONTRACT_ONLY=contra contractcheck` 15/15;
  eslint + lint:mario/fps/ai + `npm run build` green; tree clean.
- Merged squash `8b6dd17` through the rule-5 loop (static green, advisory ignored).
- Prod live: https://jalfern.com/retrogames/contra 200, bundle hash carries `contra`.
- **#2779 stays OPEN** (`Part of`, big-build rule): relabeled `building` → `next`.
- Polish pass filed: **#2782** (`feedback`, QA lane) — water edge, hero death anim,
  bigger explosions, soldier juice, attract audit, sound layering.

## PLAYABLE
`/retrogames/contra` — 6-screen jungle run-and-gun: 8-way aim run/jump, one-hit death
+ 3 lives + respawn mercy, SPREAD capsule (kept till death), wake-in-view soldiers,
ledge gunners, leading sandbag turrets, chaining TNT, attract autopilot, phones via
d-pad + A/JUMP + B/FIRE.

## BOARD
- **#2779 (next, lane:games)** — CONTRA **S2**: waterfall vertical section + boss gate
  with the destructible core (stage 1's real finish). Extend `src/games/Contra/`.
- **#1711 (next)** — PLAICRAFT platformer. S1 shipped `0df5c2f`; lines 1–4 wait on
  Jon's phone/R2 side; S2 coin arch only after #2652 lands or defaults.
- **#2772 (needs-review, lane:qa)** — britannidrive identical-fail, #2711-family gate
  drift; QA lane's job, not a builder claim.
- **#2782 (feedback)** — CONTRA S1 polish pass (QA lane).

## QUEUE (re-derive at main — never plan from a remembered snapshot)
1. `git fetch && git checkout --detach origin/main`, then `node scripts/idle-kick.mjs`,
   then the #1045 ladder.
2. #2779 S2 — the ladder's `next` item once the previous stage settled.
3. #1711 S2 — gated on #2652 (deadline 2026-11-20 01:36Z; past it the sweep default runs).

## QUESTIONS OUT (jonq issues, not STATE.md — #605)
- #2652 (AWAITING, lane:platform, deadline 2026-11-20 01:36Z) — Mario's clap take.
- #2751 (AWAITING, lane:qa, deadline 2026-11-21 03:40Z) — QA focus.
- Nothing filed this session: a resume/merge followed spec exactly.

## HARNESS NOTES FOR THE NEXT LANE
- CONTRA laws the next slice must not break (all gated in `contracheck`): soldiers wake
  at `cam + W - 4` (spawn-shield invariant + `--mutant`), one-way walkways (land from
  above, `DOWN+jump` drops), taps latched one tick in the shell, RNG is `gs.r` integer
  state (snapshot-safe), `gs.ev` events deliberately NOT hashed.
- **gh auto-switches the worktree onto local `main` after `--delete-branch`** — the
  rule-5 loop's follow-up `gh pr checks` then dies "no pull requests found for branch
  main". That error AFTER a merge attempt means check `gh pr view --json state` before
  retrying; here it had already merged (8b6dd17). Re-detach at once.
- A corpse whose PR is open, non-draft, unheld and whose gates you re-ran green at the
  tip is mergeable as-is — resume beats rebuild; the 3 h budget goes to verification.
- Worktree `retrogames-forge-contra-jungle` removed post-merge; slot-a dev server (port
  5173) stopped. S2 opens fresh.

## SLOT A LOG
Refreshed claim #2779 (already mine → resume), reopened the pushed corpse, re-verified
every gate at `7c6ac5b`, merged #2781 (`8b6dd17`), confirmed prod deploy, filed #2782,
relabeled #2779 `next`, wrote + parked + committed this state.
