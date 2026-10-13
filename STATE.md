# STATE — forge session 2026-10-13 (kart)

## Shipped this session
- **SUPER MARIO KART `/mario-kart` (issue #187) MERGED + LIVE** (PR #196, squash, `static`
  green incl. new `lint:kart` + `kartcheck`; prod verified: real Chrome on
  jalfern.com/retrogames/mario-kart paints the circuit, zero page errors).
  5-lap Mode 7 GP on MARIO CIRCUIT: per-scanline ground raster, drift + mini-turbo,
  rank-weighted item boxes (P5 mushroom / P1 crumbs), shells/bananas, 4 CPU rivals on
  the certified planner, attract replays the proven run tick-for-tick. Track is data
  (Catmull-Rom, minR 201 so flat-out is drivable), sim is pure, zero Math.random.
- `kartcheck` (Node, CI gate): geometry audit, GP win from P5 + zero-item slack win,
  item rules by state, off-checkpoint cheat probe, determinism; `--mutate` kills the
  checkpoint gate **in a /tmp copy** (tree never touched) and the probe catches it.
- `kartplay` (Chrome, real keys): driver aims at boxes with real arrows, banks a lap,
  pixels at sim coords, player sprite on screen. 8/8.
- Filed #197 (QA polish: attract title overlaps touchpad at 256px; drift/turbo feel;
  CPU balance; ghost/second-course decisions).

## Lessons paid for this session
- The renderer DRAINS `g.events` every frame for sfx — a browser harness polling that
  queue watches an emptied ledger. DEV now mirrors events into `window.__kartLog`.
- A mutation harness that rewrites the live tree must restore in `finally` — a crashed
  rewrite (dropped `from` in an import rewrite) left a mutant on disk and it nearly
  got committed. Mutants now run only from /tmp.
- Mode 7 needs CAM_H/PP tuned so the ground UNDER the kart is on-screen (the whole
  plane once sat at the horizon — sprites fine, road a slit).
- Wall clamp must fire EVERY tick past the limit, not only on bump cooldown.
- Queue was #177 (Zelda) + #187; both now shipped. Queue is empty.

## Next session (pick ONE — queue is empty, so likely ask Jon)
1. **#197 QA polish** on MARIO KART — human-thumbs items; kartplay/kartcheck are the
   regression gate. Attract-title-over-pad is the one clear defect.
2. **Zelda West Forest gap still open?** (STATE 2026-10-13 AM said the autopilot dies
   in West Forest before Level 1; #194/#195 fixed crash+pixels but may not the gap.)
   Check `npm run zeldacheck` result line for `win`; if not, that's the game's next gate.
3. If the queue has fresh issues by then (Jon files via /forge board), oldest first.

## Harness commands
- `npm run kartcheck [-- --mutate]`, `npm run kartplay` (needs dev server;
  `KART_URL` override), `npm run lint:kart` — all in the static gate or verify.
- Worktree `~/Dev/retrogames-kart` (branch merged/deleted remote; detach to
  `origin/main` before reuse). Main checkout is detached at `origin/main`.

## Three questions for Jon
1. Queue is empty — propose games on /forge, or should the next sessions polish
   (#197, Zelda West Forest) instead of shipping titles?
2. MARIO KART: second course + ghost times — worth a feature issue, or leave it as
   the faithful one-circuit Classic cup?
3. `verify` manual job now includes kartplay — promote the whole verify job to
   `pull_request` (browser suite has been green across Mario Kart/Zelda/Spy Hunter
   sessions) or keep it manual one more month?
