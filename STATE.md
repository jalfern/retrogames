# STATE — session 58 (2026-10-31)

## Shipped this session
**THE FLEET: 2 builders + 1 QA on the Studio, whole-queue lanes** — Jon's steer
#1258, shipped via PR #1267 (squash to main, 38cf33f), prod verified
(bundle index-BF7nEgPC.js carries the ⚙ SLOTS row on jalfern.com/retrogames).

- **Slot b** is a real builder: `forge.sh <a|b>`, identity "THE FORGE on slot
  a|b." (prompt = lock = watch label), ports 5173/5178, job
  `com.jalfern.forge-b` self-bootstrapped by the warden from origin/main.
- **Whole queue:** `scripts/lib/lanes.mjs` (pure) ranks builders games-first
  (corpse→steer→next→queue→feedback) and gates studio-QA's queue fallthrough
  (feedback first; queue only when items outnumber free slots; flagship last).
  Warden evals it, hands targets via /tmp/forge/target-<slot>, per-slot stall
  counters, parked the builder-slot QA spill while slot b lives.
- **One lane per issue (#878) enforced at claim:** new `forge-claim.sh` +
  `qa-claim.sh` share ONE liveness namespace (`FORGE (slot)`/`QA (node)`,
  90 min, newest-wins yield). QA taking a queue item strips `game-queue`.
- **Visibility:** `forge status` names builder-a/b + trial; watch.sh BUILDER·B
  pane; pulse `builders=N/2`; board.json `slots` → ⚙ SLOTS row on /forge.
- **48 h trial, self-enforcing:** `studiotrial.mjs` (warden step 5b) starts the
  clock, at 48 h posts items/day before-vs-after on #1258 and writes
  keep|revert to /tmp/forge/studio-lanes.verdict — revert stops slot-b kicks.
  Tokens/s was never persisted pre-trial; report uses items/day and says so.
- Gate: `npm run lanecheck` (45 gates, mutant-proven) + claimcheck A8; all
  neighbour checks, eslint, 3 lint gates, build green; WARDEN_DRY tick clean.
- Follow-up gaps filed as #1266 (profiles/t-s persistence/slot-b live pane/
  report slots). #1258 → shipped (closes via hygiene tick; trial verdict posts
  there as a comment regardless).

## Next goal
**#1141 stage 4 is UNBLOCKED** — Jon answered #1241: "HuggingFace is fine for
meshes. Link-index them per the model-source rule; don't vendor big files."
Claim it next session: strip `stalled` (the answer cleared it), resume via
FORGE.md step 1b ladder. Deep game queue behind it too (#1248, #1249,
#1251-1254, #1259, #1144, #1127) — slot b is chewing on the queue already.
NOTE rule-4 watch: last merges skew platform/QA; a *game* merge next session
resets the streak.

## Harness
lanecheck added (one small check, rule 6). Warden step 4 is planner-driven with
an inline legacy-ladder fallback if lanes.mjs breaks. jonqcheck re-pinned for
the new halt path (behavior unchanged).

## Environment notes
- This lane worked in `~/Dev/retrogames-forge-studio-lanes`
  (forge/studio-lanes; branch deleted on merge — worktree now detached at
  origin/main). Main checkout untouched/detached per law.
- The merge loop raced once: `gh pr checks` without the PR number answered a
  different PR's static. Always name the PR (`gh pr checks 1267 ...`) in the
  wait loop. Merge itself was refused while BLOCKED — no damage.
- jalfern.com apex 301s to www — poll prod with curl -L.

## Open questions for Jon
- none open from this session (#1229 already resolved before it; #737 sits
  waiting-jon for his review of the shipped feedback button).

## Carry-over
- #1141 stage 4 — un-stall + claim (HF meshes allowed, link-index only).
- #1266 QA follow-ups (fleet) and #1257 polish remain QA-lane work.
- 48 h trial verdict (~Oct 32) decides slot b; watch the #1258 comment.
