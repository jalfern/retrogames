# STATE.md — The Forge (rewritten at close of slot b, 2026-11-21; committed to
# main because game code merged: R-TYPE S3 polish II shipped as PR #2843 ->
# 5ed1b2f, a borrowed QA item (#2835). Slot a shipped CONTRA seat ceremony
# mid-session (#2840 -> 06e6806), so both lines landed tonight.)

## PLAYABLE
- /retrogames/r-type — **S1–S4 live**, and S3 now bites like the arcade:
  airborne **bitpods** ferry 2–3 chainable bit capsules (WAVES2 camX 150/380);
  the Phase-2 core fires **alternating telegraphed 3-shot salvos** (next-port
  glint warns, burned ports inherit turn) and **sways ±6px** tracked by aim +
  save-hash; dying cores **walk port-to-port** in a 380-tick cascade from the
  last-fallen core. rtypecheck 126/126, mutants 6/6 (new `cargo-blind`,
  `salvo-blind`). All new mechanics are pure tick arithmetic — zero rng draws,
  so the tuned stream and contract hashes stand (#2835).
- /retrogames/contra — S1–S4 + **seat ceremony** (rappel arrival, 10 s
  drop-out to wingman brain); contracheck 105/105, mutants 92/92 (#2837).
- /retrogames/double-dragon — S1–S4 co-op live (#2795 commission complete).
- Rest of shelf unchanged.

## WHAT THIS SESSION DID (slot b)
- Warden target #2837 REFUSED at claim (slot a's checkpoint 14 min fresh) —
  correct: slot a shipped it this session. Ladder: no steer/halt; `next` =
  #1712 (lane:research, builders skip); game-queue empty; QA borrow was open
  (no QA MASTER alive at the time) -> took oldest unowned feedback #2835
  (R-TYPE S3 polish II; idle.mjs `weakestStage` independently scored R-TYPE
  weakest — both derivations agreed). Claimed via qa-claim.sh, shipped ~2 h:
  carriers + salvos/sway + walking death, 13 new pins, 2 mutants, README.
- Solo winnability is now **exactly 4/12** (salvos bite; co-op 12/12).
  Deterministic, not flaky — but at the law's floor; don't re-tune without a
  full rtypecheck re-run.
- Rule 4: game code merged — loop turning.

## BOARD
- building: #1712 PLAICRAFT S2 only (lane:research/big-build — builder skip).
- game-queue: empty. waiting-jon: #2844 (research's; not ours). No jonq from
  these lanes.
- QA lane's, never builder: **#2833** DD co-op polish (`building-qa`) — a QA
  MASTER is **alive right now** on port 5176 and may pick it up. Fresh
  feedback for QA's next round: #2841 (R-TYPE S4 wing polish, filed by b),
  #2842 (CONTRA ceremony polish).
- Open harness bug nobody owns: **#2839** — `claim-status.mjs` ignores the
  `FORGE (<slot>):` checkpoint comment format, so liveness locks read as dead.
  Any lane can fix; small.

## HARNESS NOTES FOR THE NEXT LANE
- **Prod verify, refined:** after a merge, jalfern apex+www and even the origin
  (retrogames-psi) can serve the PREVIOUS HTML for ~10 min (Next proxy edge
  cache; the stale HTML's last-modified equals the *previous* deploy's
  completion time — a convincing liar). Content-verify by crawling the full
  transitive `./index-*.js` closure from origin and grepping game-chunk
  strings. **DEV-only strings are stripped from prod builds** (DebugKit
  labels, `__rtype` probe fields) — verify on sim-level markers (`bitfree`,
  `p2salvo`, `swayOff`), not probe/DebugKit text.
- macOS scripting traps: zsh does NOT word-split unquoted vars; system bash is
  3.2 (no `declare -A`). Crawl loops need plain sorted lists (`comm`) or
  `bash` arrays with index arithmetic only.
- `gh --json labels` returns objects, not strings — `map(.name)` or held/owned
  filters silently fail (bug seen live this session).
- `scripts/lib/idle.mjs` `weakestStage` + the QA-backlog scan can agree on an
  item — two independent derivations matching is a strong claim signal when the
  ladder is empty.

## WORKTREES
- Main checkout: detached origin/main (97484f3 lineage) + this STATE commit.
- `~/Dev/retrogames-qa-2835` — finished; reap freely (branch gone on remote).
- `~/Dev/retrogames-forge-contra-seat-ceremony` — slot a's, re-detached; reap.
- Ports: b's 5178 stopped at close. QA studio 5176 is the live QA session's —
  leave it. 5173 free.
