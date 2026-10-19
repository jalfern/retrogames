# STATE — 2026-10-18 (forge: SHIPPED #469 Mario Kart fullscreen on phones)

## This session (forge lane)
- **Shipped:** #469 SUPER MARIO KART fullscreen fix, PR #487 → squash `fbad482`.
  Root cause: fixed 256×224 source + fitCanvas integer floor-fit (#227) snapped
  to scale 1–2 at phone DPR → small centered square. Fix = COMET DRIFT pattern
  (#435): adaptive source re-solves to host aspect (landscape H=224, W 256..512;
  portrait W=256, H 224..448), CSS-covers the viewport; derived framing
  (`PLAY_H=H-24`, `HORIZON=PLAY_H-122`, half-FOV `W/2`) keeps 256×224
  bit-identical. Renderer-only: kartcheck hash `211c01e9` unchanged.
- kartplay gained 5 permanent #469 checks (portrait/landscape cover,
  backing-aspect tracking, zero page errors @390×844@3). Mutant proof: clamping
  `PORT_H_MAX`=224 turns portrait aspect check red.
- `static` green first try; merged via rule-5. Prod verified: deployed
  `index-DP_pHL42.js` byte-identical to merged local build. Issue shipped.
- Per Jon's comment on #469: skipped game-README and step 8b (small fix).
- Advisory kartplay flakes (touchpad/item/attract-gold/ghost-paint) reproduce
  identically on `origin/main` baseline — not chased (rule 3).

## Held / open (unchanged)
- **#391** `stalled` — awaiting Jon: close as shipped vs batch 5.
- **#375** `stalled` — Civ parked per Jon.
- **#443** open — idle-builder QA-borrow ruling still pending (see Q2).
- QA lane: mini's QA MASTER held `building-qa` #280 during this session;
  forge claimed only the game-queue item (#469, Jon pre-moved it) — no overlap.
- QA backlog: #481 #478 #472 #470 #469(shipped now) #462 #440 #426 #423 #421
  #422 #409 #410 #405 #365 #384 (+ Civ #3xx pass issues).
- Rule 4 healthy: last 3 merges (fbad482, 6f0fd7a, 8129edf) all game code.
- Hygiene: many orphan pushed `forge/*` branches with no issue/PR
  (excitebike, outpost, paperboy, polarity, simcity, spec-wins, telemetry,
  watch, game-first) — not adopted (unlabeled), left for Jon/warden sweep.

## GOAL — next session
1. Re-check `next` / `game-queue` / `building` + pushed `forge/*`. Queue is
   empty again unless Jon feeds it.
2. If queue still empty AND no live `pgrep "QA MASTER"`: take #478 item 0
   (`?renderer=webgl` alias) per FORGE borrow rules; ship as
   `QA: fixed #478 (item 0) via PR #m`.
3. Consider a tiny cleanup PR pruning orphan `forge/*` branches after warden
   confirms none are live claims — needs Jon's nod first (Q3).

## Three questions for Jon
1. **Queue dry again:** #469 was the last game-queue item. Which title goes in
   `game-queue` next?
2. **#443 borrow-gate:** still strict — forge idles whenever QA MASTER is live.
   Relax to allow ONE non-overlapping feedback item during a QA run?
3. **Orphan branches:** 9 pushed `forge/*` branches have no issue and no PR
   (some 4–6 commits ahead of main). Prune them, or are they intentional
   parked work?
