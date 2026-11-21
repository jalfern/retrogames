# STATE.md — The Forge (rewritten at close of slot b, 2026-11-21; committed to
# main because game code merged: CONTRA pod carriers shipped as PR #2850 ->
# a034c4a, off the never-dry rung. Slot a kept #1712 PLAICRAFT S2 all session.)

## PLAYABLE
- /retrogames/contra — S1–S4 + seat ceremony + **pod carriers**: low gunships
  ferry one lettered capsule across the jungle; two rounds down the courier
  (+500) and its pod drops, falls light, settles on the deck, and grants its
  gun — the capsule pickup law verbatim, per seat. Fly-in/letter/band are
  seed/tick arithmetic (**zero gs.r draws** — the tuned stream stands; a pin
  diffs gs.r against a carriers-free drive). Fairness pinned: band above the
  gun-line (never eats ground fire), contact non-lethal, one courier at a
  time, escapes with its pod, falls clear the sky, all rides stateHash.
  contracheck 122/122, mutants 10/10 (#2847 -> PR #2850).
- /retrogames/r-type — S1–S4 live (#2843). Solo winnability exactly 4/12 —
  deterministic, at the law's floor; don't re-tune without a full re-run.
- /retrogames/double-dragon — S1–S4 co-op live; **S4 partner-personality
  polish building now in another lane (#2851)** — don't touch DD files.
- Rest of shelf unchanged.

## WHAT THIS SESSION DID (slot b)
- Warden target #1712 REFUSED at claim (slot a's checkpoint 28 min fresh) —
  correct. Ladder: no steer/halt/next; game-queue empty; QA MASTER alive
  (5176) so no QA borrow -> NEVER-DRY rung (#1571): `weakestStage` scored
  CONTRA weakest at 6 (fb #2842 + 5 unowned gaps; runner-up R-TYPE 1).
  Filed POLISH #2847, claimed slot b, shipped ~2 h in one PR.
- Rule 4: game code merged — loop turning.

## BOARD (at close)
- building: **#2851 POLISH — DOUBLE DRAGON partner personality** (claimed by
  another lane mid-session), #1712 PLAICRAFT S2 (slot a, lane:research).
- game-queue: empty. idle-kick (builder) at close: `KICK CONTRA 0 weak` —
  CONTRA is STILL the weakest title (gap 0 now = gate-armor housings eat
  pierce rounds); next builder takes that unless the board changes.
- feedback (QA's, nobody-owned): **#2852** (new: pod-carrier polish — rotor
  read, pod-hook moment, land juice), #2841 R-TYPE S4 wings, #2842 CONTRA
  ceremony, **#2839 harness bug: claim-status.mjs ignores the FORGE (<slot>):
  checkpoint format so liveness locks read dead** (any lane; small — still
  unowned; this session hit it: slot a's lock looked alive to forge-claim but
  the board tooling disagrees).
- QA MASTER alive at close (port 5176).

## Open questions
- #2846 — promote CONTRA/R-TYPE/DD to public? (default keep-private; only Jon
  promotes per #379.)
- #2844 — PLAICRAFT S2 pre-audit takes (research lane's).

## HARNESS NOTES FOR THE NEXT LANE
- **Zero-rng additions work.** Contra's carriers derive letter/band/schedule
  from `seed ^ carrierN` arithmetic; the `zero rng law` pin keeps gs.r
  byte-identical vs a carriers-free drive, and winnable seeds 1..12 never
  moved. Prefer this over gs.r draws for any new Contra mechanic.
- Letter coverage via seed rotation (`(seed + carrierN) % 4`) — a bit-mix of
  small seeds (1..8) through `>>>3` collapsed to 2 kinds and failed its pin;
  plain `% 4` on the seed spreads. Don't trust shift-fold entropy for small ints.
- Prod verify (refines last session's note): after merge, crawl origin's
  transitive chunk closure and grep **property names** (`nextCarrier`,
  `carrierHp`, `'cargo'`) — property names survive terser; DEV strings
  (`__contraTest`, DebugKit labels) do not ship.
- `weakestStage` re-scores immediately after your README gap list changes —
  run `node scripts/idle-kick.mjs` right after closing a gap to tell the next
  lane what's next.

## WORKTREES
- Main checkout: detached origin/main (a034c4a lineage) + this STATE commit.
- `~/Dev/retrogames-forge-contra-pod-carriers` — finished; reap freely
  (branch gone on remote).
- Ports: b's 5178 stopped at close. QA studio 5176 = live QA session, leave
  it. 5173 free.
