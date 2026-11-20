# STATE.md — The Forge (rewritten at close of session 365, slot a — 2026-11-20;
# committed: DOUBLE DRAGON S1 merged this session via #2809 — game-code, so per
# step 9 the report rides main.)

## PLAYABLE
- /retrogames/double-dragon — NEW, LIVE on prod (private until Jon promotes,
  #379). S1 Walnuts Street: belt depth-dodge, jab/roundhouse/jump-kick/stomp,
  spin back-heel when surrounded, Amon/Abobo grabs w/ kick-mash, stick pickup,
  one-hit lethal + 3 lives + respawn mercy, 3 waves + ABOBO, wave-lock camera,
  stage loop, attract-first demo. ddragoncheck 34/34 + named depth-blind mutant.
- /retrogames/contra — S1..S4 co-op LIVE (unchanged since #2796). Rest of the
  shelf unchanged since #2794; all prod-verified by earlier sessions.
- Studio-side: `npm run plaicraft:dataset` pipeline LIVE (S2 #1712, #2801);
  slot b inside S2 polish (#2805) as this session closed.

## WHAT THIS SESSION DID
- Resumed #2807 per TARGET; it was NO corpse — session 364 had SURVIVED its
  17:57 warden kick (the #2758 kill-loop class: children outlive `opencode`)
  and ran CONCURRENTLY in the same worktree. Two slot-a sessions, one issue,
  one squash — PR #2809 merged clean (`efd79e1`, both lanes converged on it).
  364 filed QA pass #2810 (18:07Z) and pushed its (accurate) STATE commit
  6b1b611 before exiting; this report is the later close and folds it in.
- Re-verified sound before merging (ddragoncheck 34/34 on tip 435987f).
  Prod verified here too: bundle `index-BibHc76X.js` carries WALNUTS STREET /
  ABOBO / DOUBLE DRAGON; route live.
- #2807 released to `next` (multi-stage: S2 weapons wall, S3 hideout+Marian,
  S4 co-op) with live-URL comment.
- Reaped ~/Dev/retrogames-forge-double-dragon (after 364's last push landed);
  :5173 released. Recycled the orphaned vite holding my port (lsof → same-slot
  worktree verified before kill).

## BOARD
- #2807 `next` — DOUBLE DRAGON S2 (weapons wall) is the top builder pick.
- #2808 R-TYPE sits `game-queue` — Jon's second flagship, behind DD by his word.
- #1712 `next` (blocked on human takes via #2799) + #2805 `building` — slot b's.
- #2798/#2810 feedback — QA lane's. #2800 (needs-approval) — nightly-red tracker;
  fix is on main, tonight's 07:15Z cron nightly on efd79e1+ re-proves it.
- Rule 4 green: game-code merges this week #2796/#2791/#2788/#2809 — loop turning.

## QUESTIONS OUT (jonq issues, not STATE.md — #605)
- #2799 (lane:games, AWAITING, deadline 2026-11-22T16:09Z) — friends' takes for
  #1712 coverage; default = stage stays open, never narrow.
- #2751 (lane:qa) — QA's. No new questions this session (DD S2/R-TYPE are both
  already commissioned on #2795 — nothing taste/priority to ask).

## HARNESS NOTES FOR THE NEXT LANE
- **Reports must be written AFTER the merge prints.** Session 364's first
  report draft claimed LIVE + `#<QA-NUMBER>` before the merge happened; its
  final committed version (6b1b611) only became true because the merge landed
  under it. Verify prod yourself; distrust parked claims.
- **`warden.sh` kills opencode, not its children (#2758).** A "kicked" session
  can keep working — if a FORGE checkpoint < 90 min old names YOUR slot and
  TARGET says take the same issue, you are probably the ghost's twin, not its
  successor. forge-claim.sh says "already yours" in both cases — re-read the
  issue's latest comment to tell resume from double-run.
- `gh pr merge --squash --delete-branch` can exit 1 with "could not determine
  current branch" AFTER a successful merge (it detaches the worktree first).
  Check `gh pr view --json state` before retrying — #2809 merged on the first
  try despite the red exit.
- Dead lanes orphan their dev server: `lsof -nP -iTCP:<port> -sTCP:LISTEN`, read
  the cwd from the command line, recycle only if it's your slot's worktree.
- Nightly: dispatch 44792119481 on `efd79e1` (18:22Z) re-proves the roster fix
  AND double-dragon's first soak entry — glance at it in the morning (#2800's
  real clearance). The stale manual 44778290100 still shows in_progress;
  main-ok treats in-progress nightlies as non-blocking ("nightly cancelled" =
  latest COMPLETED). If anything reddens, #2176 clock applies to whoever sees it.
- Nightly soak now includes double-dragon: if the contract/pad mapping changes,
  change BOTH rosters (contractGames.mjs + nightlybot.mjs) in the same commit
  (#1525 both-lists law).
- DD pad: A(Space)=JUMP, B(KeyX)=KICK, C(KeyZ)=PUNCH (thirdAction hold);
  UP/DOWN are DEPTH. Contract `done` = gameover only — the STAGE CLEAR loop
  keeps done=false on purpose (a 600-tick sample stays mid-run).
- ciscope #1575: any new aliased *check must be wired in checks.mjs or parked
  in MANUAL_CHECKS in the same commit (ddragoncheck is parked — S2 keeps it).

## WORKTREES
- Main checkout: detached at `efd79e1` (+ this STATE commit). :5173 free at close.
- Session 364's report preserved at /tmp/forge/STATE.a364.preserved.md (its
  claims were premature; kept for forensics). Slot b's report lives at
  /tmp/forge/STATE.b.parked.md (already parked when I found it in this
  checkout's STATE.md — folded, not clobbered).
- Other lanes' worktrees untouched (plaicraft-s2*, qa-*, legacy horse/viper).
