# STATE — 2026-10-19 (forge: #513 SHIPPED + LIVE; cometplay closes the tab-drive gap)

## This session (forge lane)
- **Resumed #513** (resumed before claiming, per step 1b): PR #515 was green but
  un-mergeable — its CI run was stuck QUEUED (GitHub-side run-state inconsistency;
  full diagnostics posted on #513). A new checkpoint push replaced the stuck run
  (concurrency `cancel-in-progress` did what cancel/rerun couldn't) and the runner
  picked `static` up immediately.
- **Closed the step-6 gap:** CometDrift had NO `*play` script (the previous session
  skipped the real-Chrome drive because it was unwritable). New **`cometplay`**
  (`scripts/cometplay.mjs`, npm alias): 24 checks, real key events only, graded in
  pixels + sim state — countdown→GO, grid throttle with the cyan buggy pinned
  bottom-centre, minimap dot crawling with the sim, steer, spin bite + recover,
  pause door, circuit cycle + localStorage persistence, drift ladder, and the
  certified autopilot line driving the NEW Daytona layout 4 laps to an in-tab WIN,
  looping back through attract onto CORKSCOMB. 3 consecutive green runs.
- **Game finding (measured, filed #517):** keyboard steer is raw ±1, so a held
  one-direction drift walks off the asphalt in ~20 ticks at ANY speed — the drift
  ladder is keyboard-unreachable unless you zigzag (~8-tick steer alternation).
  cometplay drives/grades exactly that. Feel fix options in #517 (QA lane + Jon).
- **Fixes along the way:** latent crash in CometDrift's DebugKit panel (`T.nearest`
  referenced, never imported → `surfaceAt`); new DEV-only `__cometTest.setup/pos/surf`
  hooks (bike precedent: seed position only, rules stay the sim's).
- **Merged:** rule-5 loop → squash **5817d7f** on main. `static` SUCCESS; advisory
  `smoke` failed on an unrelated Missile Command flake (`the sixth city falling ends
  the run` — timing), rerun once per rule 3 (in flight, non-blocking).
- **Prod verified:** live sim chunk carries the 2560² world (`2048` gone).
- **Issues:** #513 → `shipped` + closed (PR keyword auto-closed before relabel);
  #517 filed (`feedback`) for the keyboard-drift feel call.

## Held / open
- Advisory `smoke` rerun on 5817d7f in flight — no action unless it fails twice in
  a row (then post the log; per rule 3 never spend a second PR on it).
- QA lane owes: real-Chrome pass over the new layouts' AI line (hairpin/Bus Stop/
  Corkscomb look in-tab) — cometplay now covers the drive mechanics; and #517's
  feel decision; and #511 (QA polish pass 3) may partly be superseded by #515.
- **Queue is thin:** `game-queue` now holds only #516 (Daily log on Forge — a board
  feature, not a game). Next session: nothing forgeable unless Jon labels a game
  issue or the QA lane has a claimable `feedback` item (step-2 borrow path).

## Three questions for Jon
1. Queue: only #516 (board work) is left labeled `game-queue` — want me to forge a
   new title next session (pick/approve one), or is #516 actually game-adjacent and
   mine? (If neither, I'll take the QA-borrow path per FORGE step 2.)
2. #517 keyboard drift ladder: soften keyboard steer to ~0.55 notch (changes feel),
   widen road at bends, or teach the zigzag in-HUD? Physics says holding one way is
   impossible; today only stick/touch players can use the ladder reliably.
3. The stuck-QUEUED-run pattern (twice today, both resolved by a push replacing the
   run): worth adding a `gh run cancel`+re-push step to the playbook as the standard
   unstick, or keep treating it as transient?
