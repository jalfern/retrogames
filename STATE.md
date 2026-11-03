# STATE — session 103 (2026-11-03, slot b)

## Shipped this session (one merge, game code — rule 4 streak intact)
**RALLY CO-DRIVER ONLINE — lobby seats (#1448, merged `f827ea4`, PR #1483).**
Path: warden target #1473 REFUSED (slot-a fresh, and they shipped batches 5–7
during my session — my old b5 corpse got taken up by them, good). Ladder dry
(#1448 was building-qa), flagship gaps ALL closed (20/20 README markers —
flagshipStage null), so I took FORGE.md's QA-borrow: waited out mini's dead
lock to exactly 90 min (03:10:49Z), released `building-qa` with evidence,
claimed `qa-claim.sh 1448 b`, resumed `qa/rally-lobby-1448`.
Salvaged mini's UNCOMMITTED worktree edits (pushed `50592c1`), then shipped
the missing half: mini's branch had the lockstep protocol proven but **the
`<Lobby>` overlay never mounted** — correct code, unplayable join flow. Added:
Lobby mount (host code/QR/share, guest entry), relay socket close on unmount,
guest phone play (arrow-tap notes, A/B = severity 2/3, `secondAction` KeyB),
host tap/Space kick, host B → stage select. `rallylinkcheck` 36→43: new tier-8
static shell audit pins exactly these wires (RED on the pre-fix branch — the
natural mutant) + `--mutate` (walkaway never demotes) reddens 4 gates. Wired
`npm run rallylinkcheck` + checks.mjs rally scope + ci.yml (#1395 lesson).
rallycheck stayed 169/0; lint gates + eslint + build green. Live-verified in
prod: entry `index-Baq-NiNq.js` lazy chunk `index-CiX8atRh.js` carries the
wiring; route serves 200. Join: `/retrogames/rally-co-driver?net=host`.
Gap ledger on #1448: checkpoint clock + reflector posts were ALREADY in main
(#1438 `a916cef`, #1427 `postsFor`, both rallycheck-pinned) — evidence posted;
**VU bar remains** (speechListen exposes no stream — recorder/analyser level
meter owed): issue back on `feedback` for the QA lane.

## Board (end of session)
- main = `f8a256e`+ (slot-a active: batches 5/6/7 merged, PR #1485 batch 8
  open on `forge/seedpin-rollout-b8`). #1473 held by slot-a. #1448 stays open
  (VU only). Flagship README gaps: ALL CLOSED — the #841 idle-kick is dry
  until new gaps are filed; QA owes the next polish pass post-#1448.
- RallyCoDriver now rejoins the #1473 rollout candidates (files quiet again;
  online `go` carries seed — a batch should expose the room seed to the
  seedpin contract, offline keeps `selectedSeed`).

## Notes for the next lane
- Prod-verify recipe that worked: `curl -L` www (apex 308s), take entry from
  HTML *this fetch* (an old poll pinned a stale hash), find the route's lazy
  chunk via `component:VE` → `VE=k.lazy(()=>import("./index-*.js"))`, grep the
  chunk for a new string literal. Deployment URLs are SSO-protected (401 body).
- Shim gaps hit this session: `gh api -X POST …/pulls --input` with explicit
  head worked perfectly (head.sha + changed_files verified pre-merge); branch
  delete after `gh pr merge --delete-branch` silently didn't happen — verify
  with ls-remote, then `DELETE git/refs/heads/<branch>`.
- Salvage pattern: a QA node's worktree can hold the LAST session's uncommitted
  edits; once the claim is formally dead and the item re-claimed, committing
  them onto the branch is the recovery (this session's lobby core was already
  in those files).
- ENV unchanged: source /tmp/forge/netenv; gh-shim subset; Chrome SIGABRT
  (#737) — browser tiers prove in CI only; DEV_PORT 5178 (none left running).
- #1456 awaiting Jon (deadline Nov 4) unchanged, not re-asked (#605 ≤3).
