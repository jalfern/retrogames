# STATE — 2026-10-19 (forge: COMET DRIFT Corkscomb Dunes #493)

## This session (forge lane)
- **Goal:** #493 course 2 — CORKSCOMB DUNES (Laguna Seca spirit) for
  CometDrift. Merged: PR #509, squash `1df9323`. Worktree removed.
- **What shipped:** `CONTROL_CORKSCOMB` (26 pts) + COURSES entry in
  `track.js`, `dawn` palette in `art.js` (indigo-amber sky, rose strata —
  same named roles), README (+CC BY-SA credit line for the consulted
  Wikimedia shape; nothing traced). Selector needed zero changes —
  2D/HD already cycle COURSES generically. minR 296, 0 crossings,
  autopilot wins seeds 0/7/9/42 from P7, determinism pinned;
  cometcheck GREEN per course, `--mutate` RED. Real-Chrome drive 12/12
  (ArrowRight x2 → Corkscomb, live lap, spin recovery, contract replay
  hash-for-hash, HD honours the persisted pick, zero page errors);
  contractcheck 14/14; lint gates + build green.
- **Harness lessons:** (1) playwright `browser.newPage()` = a FRESH
  isolated profile — an "HD respects persistence" check was testing two
  different storages; one `browser.newContext()` fixed it. (2) Track
  design: Catmull needs nodes near curvature extrema and even chord
  spacing; uniform-θ ellipse waves + rate-only modulation finally
  produced a clean serpentine (a dozen blind guesses preceded it — see
  issue comments). (3) CI was congested ~25 min this session; PR Vercel
  check SUCCESS but prod bundle still serving the pre-merge hash at
  session end — deploy lag, not failure.

## Held / open
- **#493** `building` — both requested courses merged (Sandbank #501,
  Corkscomb #509). REMAINING: live-bundle proof + close. Next session:
  poll `https://jalfern.com/retrogames/` for the post-1df9323 bundle,
  comment `LIVE: …` on #493, remove `building`, add `shipped` (or keep
  `building` if Jon wants the optional Dry Lake Bed course 3 first —
  polish #511 item 1 is the Corkscrew-fidelity re-tune either way).
- **#511** filed — QA polish pass 3 (Corkscrew re-tune, per-course HD
  tint, per-course gantries, attract label collision over "DRIFT GP",
  dawn ambience).
- #491 closed; #500 pin landed; #391 `stalled` awaiting Jon; #375 Civ
  parked; #443 idle-builder borrow-gate.
- game-queue board: https://jalfern.com/retrogames/forge.

## Three questions for Jon
1. #493 is functionally complete (both courses merged): close after the
   LIVE proof and keep Dry Lake Bed as its own feedback issue, or hold
   #493 `building` until course 3 ships too?
2. Corkscomb's rate-alternating crest is honest but mild — want the
   #511 re-tune (longer wavelength ~240px radii + fake-drop shadow/FOV
   trick) promoted to `next` ahead of other queue items?
3. The 2D attract draws the course label over the "DRIFT GP" title
   (#511 item 4) — quick cosmetic fix, or acceptable arcade overlap?
