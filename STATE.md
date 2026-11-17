# STATE — session 329 slot a close-out

## Shipped this session
- **#2627 stage 2 → PR #2639 merged (squash `76784d2`, live). FLOOR BOSS —
  TEACH THE ELBOW: the corner refusal shows its honest escape.**
  `cornerEscapes(gs,x,y)` (sim.js, pure export) answers a refused corner
  click with the arm mouths that would spur the elbow — each **verified
  twice**: standing the plug must be a legal click in its own right (all
  five reach laws — pocket-mouths and served-rack mouths are never taught)
  AND with the plug stood the original click must build clean. Fixed order,
  no rng; scratch rack push/pop inside — zero footprint (#1917, hash gated).
  Painter keys off the refusal event: pulsing dashed green `PLUG` frames
  2.5 world-seconds + `SPUR IT — PLUG A MOUTH` tail; `LEAVE THE ELBOW
  FREE` when no mouth is honest. Escapes are alternatives — plugging BOTH
  mouths pockets the elbow (older rack/pocket laws own that; gated).
  Gates: `floorbosscheck` **228/228** (+22: answers nothing unrefused;
  exact mouths taught; every plug legal+clears by real clickCell;
  **pocket-trap** kills `--mutate-teach` — plug-induced pockets are
  invisible to the clears-check, the legality check is load-bearing;
  service-trap never taught; purity/determinism; painter pins).
  `floorbossplay` **53/53** real taps: refusal → fx-ledger banners → green
  canvas pulses at both mouths (`getImageData`) → advice proven by a real
  plug-tap. eslint + three scoped lints + build green. Prod verified:
  chunk `index-D-bA-GDU.js` carries `SPUR IT`; live URL on #2627.
- **Double-ship collision resolved, not repeated.** The slot's own 19:31
  claim + dead session's PR #2629 (stage 1) were live when a concurrent
  session shipped the same stage first (#2634, `583cc59`). #2629 closed
  unmerged with a cross-lane note; the claim ladder looped straight back to
  #2627 (game-queue) and stage 2 shipped on top. Noted on #2622 so the QA
  lane doesn't re-implement the corner half of its item 2.

## Next queued
- **#2627 stage 3** (game-queue, lane:games): swing legibility — faint
  swing markers on live elbows so the grammar reads at a glance (painter-
  only; `cornerRecords` now exposes the mouths — good raw material).
- Idle-kick at close = **`KICK EXCITEBIKE 0 weak`** — recompute before
  claiming; #2632 (Excitebike polish) is QA's by right; builder borrow
  blocked while any QA MASTER runs. #1711 `next` = lane:platform, games
  no-op (precedent 314+). #2621 = lane:research.
- Jonq games lane: **empty** at close (no answers/defaulted to execute).
- Nightly: main-ok read `cancelled` at merge time (satisfies #601, proves
  nothing) — watch the fix-tip nightly like 328-a said; red main outranks.

## Open questions (issues, not here — #605)
- None filed this lane; jonq games reports none open.

## Catches for the next session (each cost probes this shift)
- **jalfern.com = apex 308 → www.jalfern.com**; prod marker scans need
  `curl -sL` AND the www host with a cache-bust — the apex edge can serve
  stale index HTML whose chunk hash 404s ("marker missing" ≠ not deployed).
  Lazy chunks are named `index-<hash>.js` — there is NO `FloorBoss-*` file;
  scan every `assets/index-*.js` from the main bundle for role markers.
- **`gs.ev` drains at every `step()` head** — browser-side assertions
  against the event tail race the loop; assert on `gs.fx` / persistent
  ledgers (the #2561 pattern) or the board itself.
- **The rack tool disarms after every build** (parity law) — play rigs
  must re-arm the chip per purchase, not per rig.
- **floorbossplay #2346 ladder cluster (4 gates) is load-dependent**:
  machine sat at load ~7 (concurrent lanes) and the FF autopilot rounds
  ended short → still-on-report cascade; green at 53/53 when the box
  calmed. Same code, same suite, both outcomes in 20 min — treat as
  advisory flake, rerun once (rule 3), don't chase.
- **Concurrent same-slot sessions remain real** (328-a shipped while this
  lane held the claim): `gh pr view` state before ANY merge attempt;
  `statepark read` before writing STATE — fold newer reports' open
  questions (this shift's STATE started as slot b's parked copy on disk).

## Lanes clean
- Main checkout detached at `b8f9ba5`; STATE committed via `forge/state-329-a`
  PR (game merged this session, allowed).
- Worktree `~/Dev/retrogames-forge-floorboss-teach-elbow` re-detached at
  origin/main (rule-7 discipline), reusable; node_modules symlinked.
  The old `corner-clearance` worktree vanished mid-session (concurrent
  churn, 326-b warned of it) — its content lives on in the closed #2629.
- :5173 dev server stopped at close; other lanes' ports untouched.
