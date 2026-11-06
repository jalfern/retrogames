# STATE — session 157 (2026-11-06, slot b)

## What shipped
**WATCH rollout batch 5 (#1637) — PR #1686 squash-merged `3d87c00`, LIVE**
(`/lode-runner`, `/arena-archery`, `/dogfight`): the Y key seats each title's
OWN proven driver. No new brains — only seats.
- Lode Runner-Lite: Y seats `planStep(gs)` (the lodecheck autopilot; its route
  never digs, re-plans from live state every move). `vaultCleared` keeps the
  guide seated across the carry (`startPlay(..., {keepWatch:true})`); gameOver
  and the player's own start hand back.
- Arena Archery: Y seats `botInput(gs, 0, 1)` at seat 1 — the skill-1 brain
  archerycheck wins both arenas with. Any seat-1 key/tap/Y hands back; seat-2
  codes never unseat it (Smash TV rule) so the duel partner keeps their seat.
- WWI Dogfight: Y seats `pilotInput(gs)` (lead-on-flight-time gunnery,
  predictHit receipts, energy-lean throttle); the throttle lever follows the
  flown value so takeover resumes where the pilot left the engine.
Honesty audit pinned in watchcheck source gates: KingsQuest/Britannia,
ZORK II/III, MagicCarpet carry NO WATCH line (no proven solver drives them).
Coverage now **36 of 80** registry routes; SpaceInvaders verdict posted on
#1637 (invaderscheck proves a scripted flight, not a reactive pilot — skip).

## Lessons (worth keeping)
- **Pre-push static sweep for chrome/registry changes must include
  `attractcheck` AND `watchphonecheck`** — CI burned two rounds without them:
  the attract WATCH teach line must be a `<span>` (attractcheck allows exactly
  ONE raw `<p>`, the press prompt — batch-4 pattern), and the attract ▶ WATCH
  wrapper must sit at `bottom: '24%'` (18% is inside the pad zone at 390x844).
- **Mutant honesty of pilot predicates**: archery's advance leg must use
  seat-1-only signals — the foe bot's own arrows make `flying>0` advance even
  with a dead seat 1. And no `b.tick > a.tick` requirements anywhere: the tick
  clock stalls under software rendering (all three advance legs use mover-only
  signals now).
- gh-shim quirks persist (STATE 155): poll `--json name,conclusion` (lowercase
  `success`), not `.state`; `gh run list --branch` 404s and
  `actions/runs?head_branch=` lists OTHER lanes' runs too — triage via
  `gh api repos/.../commits/<sha>/check-runs` (commit-scoped, honest).
  `gh pr view --json mergeCommit` returned null after a successful squash —
  read the SHA off origin/main instead.
- **Cross-slot STATE collision**: both slots write ~/Dev/retrogames/STATE.md —
  slot a's session 156 overwrote this draft mid-closeout. Fetch origin/main,
  write YOUR session last, commit from your detached worktree, `push HEAD:main`.
- Dev-file watcher on this box is dead: after edits, kill :5178 + restart dev,
  then curl the served module to confirm content before trusting browser runs.
- QA lanes pushed commits onto `forge/watch-rollout-b5` mid-session (and vice
  versa per run lists). Verify remote tip is yours before merging; checks by
  SHA keep you honest.

## Next (priority order)
1. #1637 stays OPEN `building` — remaining: MagicCarpet (CLONE-era autopilot
   exists; a seat there is the batch 6 candidate), DOS/IF (needs a solver that
   drives gameplay), SpaceInvaders reactive pilot (batch 6 candidate — verdict
   posted on #1637).
2. #1685 (QA): archery bot-vs-bot opening stalemate ~15-20 s until stuck-arrow
   TTL — polish, QA's lane, do not pick up from builder lanes.
3. Normal ladder for next slot-b session: recompute `weakestStage` from
   READMEs (after #1687 CometDrift gaps shifted; slot a says flagship README
   gaps now all owned/CLOSED — expect never-dry or `feedback`).

## Notes for the next slot-b session
- Dev server 5178: STARTED and KILLED this session; port free. The
  watcher-dead workaround above still applies on this box.
- Worktree `~/Dev/retrogames-forge-watch-rollout-b5`: detached at origin/main,
  node_modules symlinked — reusable. Branch deleted both ends by the merge.
- Local Chrome still degraded (#1622); full 36-pilot watchcheck matrix not run
  locally — CI smoke is the safety net (#1670 wiring).
- `echo ===` in zsh = parse error (equals-expansion) — it silently killed whole
  command chains this session; quote separators (`echo '---'`).

## Open questions
None new. #1685 covers archery polish; jonq games lane: none open.
