# STATE — session 350, slot a (2026-11-19 ~05:35Z)

(Corrects session 349's close — same slot, same night, same PR. Facts below were
re-verified end to end on the merged tip.)

## Shipped this session
- **#2757 merged `7906513` — cooptakes: the co-op games' live record path, phone-shaped.**
  `scripts/cooptakes.mjs` + `npm run cooptakes`: consent gate answered like a real
  phone (both switches OFF, name required), recorder armed at seed-birth, real
  keyboard/pad input, **natural game-over only**, take round-trips relaysim, bytes
  audited (rec/v1 vs v2, clocked voice track, pad counts, honest seat labels),
  then replayed through `plaicraft:evidence` verbatim (the nightly grader's command).
  Final clean drive on `09b1884`: **46/46, zero page errors** — SOS (3078 ticks,
  seats human+cpu, 808 real pads), BD (2400 ticks, seats human+human at 2p,
  738 pads), rally `?seat=model` (8400 ticks, seat 0 honestly model — #2058
  opt-out proven LIVE), plus consent axes **declined** (store unmoved), **silent**
  (honest v1, audio:false), **revoke mid-run** (voice section stripped at
  sessionStore's last-moment gate). `--mutant=strip` reds exactly there:
  `reason: "voice section without voice consent"`. README notes per game,
  docs/HARNESS.md para. Vercel SUCCESS on the merge SHA; jalfern.com/retrogames 200.
- **Corrections to STATE 349's record:** the "SOS ×3 / BD ×5 / rally ×5 seeds" matrix
  described an earlier draft; the merged suite drives one seed per game + three
  consent axes (the ×5 matrix came back later in bd's probe loop, not the ship tip).
  The mutant proof is an upload REFUSAL at the gate, not bytes riding into the store.
  Both legs' fixes are in: bd seat-picker start (thumb lands on a recorded seat),
  tap bounded at 1500 ms, held-key bookkeeping fix.

## Playable now
Unchanged — #2757 is proof plumbing, not a title. All recorded-take plumbing for
the co-op shelf is now proven live: `npm run cooptakes` (dev port, ~12 min,
natural runs only).

## Board
- **#1711 stays OPEN, claim released** (`building` off; wait-state, not build-state).
  Human half = Jon's 3 phone takes; jonq **#2652 AWAITING**, deadline 2026-11-20
  01:36Z, default = keep waiting. Machine half of lines 1–3: claptest + Gauntlet +
  co-op live takes + nightly witness; line 4 consent mutants pinned + revoke axis.
- Filed **#2759** (feedback, QA): BOMB DEFUSE's first-vent teach panel (#1812)
  overlays the touch pad while the lesson is due — the A button is untappable on a
  phone exactly when the lesson says press. Found via the harness's actionability
  evidence; player-visible, needs a layout fix + re-proof.
- **#2758** (warden: reap the slot's process group) corroborated independently this
  session: the reaped 349 chain kept writing into this worktree after the merge —
  dirty-tree guard refused its mutant, `git add` races were real, nothing wrong
  shipped. Reaping must `pkill -P` the tree, not just opencode.

## Rule 4 counter
**2 consecutive harness-only sessions** (349, 350 — no `src/games/**` change;
#2757 + #2759 are scripts/docs/ops). The next lane MUST ship game code or stop
per rule 4. Backlog scan first (`scripts/idle-kick.mjs` at main, then the ladder);
#1711 is WAIT-state (check #2652), steer/game-queue empty at my close.

## Catches learned
- **A reaped session's children can keep claiming your lane.** Before trusting a
  "corpse", read remote `STATE.md`/recent issue comments/branch tip — here it was
  also mid-merge. Check `.mutant-running` and `git log origin/<branch>` before ANY
  commit on a resumed branch. (Details → #2758.)
- **Unbounded `page.tap` is a starvation bomb**: drivers must pass explicit short
  timeouts; overlays (panels, modals) silently own the hit-test.
- **Pad-count honesty**: stuck-key held-state inflated SOS's pads to 3057/3078;
  honest presses land ~800. A "passes every tick" count is a smell, not a proof.
- zsh: `${PIPESTATUS[0]}` prints empty (that's bash) — verdict lines, not echo,
  are the exit signal in these harnesses.

## Housekeeping
- Merged this session: #2757 (`7906513`). Filed: #2759. Labels: #1711 −building.
- No jonq filed; open questions link: #2652 (AWAITING, platform — phone takes).
- Dev port 5173 free at close (zombie's vite already gone); slot-a worktree
  `retrogames-forge-plaicraft-coop-takes` left in place (remote branch deleted by
  squash-merge; prune when next lane reopens its own). STATE is a docs-only direct
  commit per the #2750/#238d746 convention — main's STATE was actively wrong, and
  an accurate handoff outranks the platform-not-game nit.
