# STATE — session 306 (2026-11-16, slot b)

## Playable now / what shipped
- **VIPER PIT net-select gate LIVE (#2476 → PR #2479, merge `a9ee5cc`).**
  jalfern.com/retrogames/viper-pit. The challenger's pick always wins: host
  FIGHT before the guest's pick lands now **DEFERS** (`netselect.js` pure
  state machine, IronRing #1761 law ported; select shows `ROOM XXXX —
  AWAITING CHALLENGER'S PICK…`); the late pick fires the launch with the
  guest's REAL choice; pre-pick launches immediately; re-pick after launch
  never relaunches; leave/join un-hang + refresh the gate (no ghost waits).
  Host stays sole launch authority; seed keeps host authority; offline ladder
  + local 2P byte-identical. **Three bugs, the README only knew one:**
  relay `FORWARD_TYPES` never carried `pick` — the server silently dropped
  EVERY challenger pick in prod (fix also un-blocks IronRing's #1761 wire);
  unmount called nonexistent `net.lobby.destroy` → StrictMode socket leaked,
  held seat 1, live join refused `room full` forever (now `net.room.reset()`,
  BlobBattle pattern — IronRing's identical leak filed as #2478); a
  reconnecting guest lost its pick into the dead socket (now RE-DECLARES on
  every roster landing).
- This was a RESUME: the prior slot-b session died minutes from ship — every
  gate was already committed+pushed+commented; the corpse decoded itself, and
  this session's job became verify-then-merge.
- Gates (all re-verified locally before merging): viperpitcheck 441/441 +
  mutants 290/290 (named `gateOn` — placeholder restored → deferral pins red);
  vipernet live two-Chrome relay drive 13/13 (RACE/PRE-PICK/GHOST, wire log,
  zero page errors); contract `viper-pit` green; eslint (only the pre-existing
  main warning) + lint:viper/mario/fps/ai + ciscope selftest + build;
  clean merge-tree vs current main (no drift in relay/ViperPit paths).

## BOARD at exit
- game-queue / next / steer / waiting-jon: empty. building: #1711 (slot a,
  platform lane). building-qa: #2478 (IronRing seat-leak, this session's
  finding) + #2474/#2447/#2449 (QA's own).
- Filed #2484 QA — VIPER PIT net-select polish pass (waiting-line beat,
  pick-land acknowledgement, ghost re-seat paint, rematch re-arm feel).

## Next (slot a or b, in order)
1. Refresh the ladder; game-queue is EMPTY → flagship stage / weakestStage
   (`scripts/lib/idle.mjs`). GardenGuard's two score-contributing README gaps
   are SOLVER DISCLAIMERS — skip with that reason (#2391: verify the gap is
   player-visible). ViperPit's net-select gap got its CLOSED marker in #2476.
2. If #1711 lands its physical acceptance (Jon's clapping take),
   `DEV_PORT=<own> npm run plaicraft:grade` posts the verdict by itself.
3. Watch: nightly runs the FULL viperpitcheck — keep it green on main; the
   relay now forwards `pick`, so IronRing's #1761 gate (#2478-adjacent) can
   finally be proven live once QA takes the seat-leak.

## The session's catches
- **`gh pr merge --squash --delete-branch` can exit 1 AFTER a successful
  merge** ("no pull requests found for branch main" — it switches the
  worktree to main and deletes the branch before resolving its own ref).
  Verify with `gh pr view --json state,mergeCommit` + `git log` BEFORE
  re-running anything; a blind retry would point gh at `main`.
- **A checkpointed corpse ships itself.** The dead session's BUILD FLOOR
  comments carried the exact remaining step (merge); verification of an
  already-green branch took minutes, not a rebuild. Silence + a pushed branch
  beats a WIP note: the resume cost is proportional to the last comment's
  honesty.
- **Prod marker lives in the lazy chunk, not `index-*.js`** (again): scanned
  every `import("./…")` dep of `index-g2Px8vqi.js` for `AWAITING CHALLENGER`;
  found in the viper-pit chunk (`index-BWiseflm.js`) — the IronRing chunk
  shares the phrase, grep the game name too. `jalfern.com` 308s to
  `www.jalfern.com`: curl the assets with `-L` or you scan a redirect stub.

## Hygiene at exit
- Dev server 5178 stopped (own pid only); foreign ports untouched.
- Main checkout detached at origin/main; worktree
  retrogames-forge-viper-netselect removed after merge; local branch gone.
- STATE.md committed to main (game code merged this session) + parked slot b.
