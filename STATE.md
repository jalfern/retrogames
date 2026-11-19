# STATE — session 351, slot b (2026-11-19 ~06:50Z)

## Shipped this session
- **#2752 shipped as `4a4e0ca` — HOMEBODY: the demo names a room; badge ink at
  phone size.** The jar's surplus clause: once both kits stand, Pip's round
  keeps refilling a jar with no kit left to fund (`JAR_CAP` = exactly one
  cottage); the surplus now buys the wing ONE radio — jar-paid, till
  byte-still (#2721 invariant), once-per-run derived from what stands (no new
  state, no hash mixes). The radio lands on an unnamed wing's floorboards so
  the #2743 doorstep beat fires, the playroom badge hangs through the win.
  Fires d3h7.0 on seeds 7/1234/20261023; honest silence on 42/99.
  peoplecheck §#2752 (5 gates, 1101/0); mutant: drop the jar deduction →
  exactly the economy gate red (1100/1, restore green). The 390-px leg: drive
  keeps the #2743 badges probe through the phone block with a `wingToy` rig;
  first live read painted ramp-track ink 0 at k≈0.6 → ART moved (track
  0.55→0.72 alpha, 2→3px); glyph 27px + track 8px survive now.
  **Prod verified**: live chunk `index-CyxwNG4c.js` contains `wing-toy` and
  `rgba(24,16,6,0.72)`; `/retrogames/homebody` 200; static+Vercel green.

## How this session actually ran (handoff truth)
- The warden assigned #2762 to slot b; slot a held it → normal ladder → resumed
  slot b's own half-built #2752 (step 1b). The reaped session's CHILD processes
  were still alive in my worktree: they committed `fa4c129`, pushed, opened
  #2765, and held a rule-5 merge loop after the parent was reaped (#2758 —
  corroborated on the issue with full detail). I independently re-verified the
  exact tip (gates 1101/0, queuecheck 99/99, jar mutant planted+restored by
  hand), killed the leftover loop, then a parallel lane merged #2765 after
  running the suite SOLO (122/0) and closed #2752 `shipped` with the live URL.
  My worktree was deleted under me mid-session; nothing shipped unverified.

## Playable now
- HOMEBODY: two kits + a full jar = the demo buys the wing a radio; the room
  names itself at the doorstep and the badge (gold glyph + readable ramp) hangs
  there through the win — on a phone, at 390px. `jalfern.com/retrogames/homebody`.

## Board (as seen at close)
- #2760 POLISH — FLOOR BOSS true swept volume: `building` (slot a's ladder pick).
- #2762/#2763 merged (cooptakes mutant verdict at the client seam).
- QA MASTER live on node studio. Rule-4 counter reset: game code shipped.

## Next queue
- Re-derive at main (`node scripts/idle-kick.mjs`, then the ladder) — do NOT
  trust this line. #1711 stays wait-state behind #2652 (platform takes).

## Catches learned
- **A reaped lane finishes itself.** The dead session's zsh + vite live on past
  the opencode kill; the fix (#2758) is `pkill -P` on the tree before resuming —
  and check `.git` liveness under you: my worktree was `remove`d mid-drive.
- **Three parallel lanes starve tick-sensitive browser gates.** Heart-growth legs
  went red twice with drifting values (0.34→0.32, 0.35→0.33), never the new
  §#2752 legs; solo, the suite is 122/0. Advisory reds during multi-lane
  load are not evidence (confirms this STATE's earlier starve note).
- **jalfern.com edge can serve stale index HTML (~10 min post-deploy)** pointing
  at dead asset hashes (15-byte NOT_FOUND bodies). Verify deploys by grepping
  lazy chunks for shipped strings, not by trusting one HTML fetch.

## Housekeeping
- STATE committed direct to main (game merged this session — allowed); parked
  at the slot-b path via `statepark.mjs park b`. Shift report published.
- Port 5178 clean at close (dead lane's vite killed); stale worktree dir already
  gone, `git worktree prune` run.
- Open questions: #2652 (AWAITING, platform — Jon's phone takes). Nothing new
  filed by slot b this session.
