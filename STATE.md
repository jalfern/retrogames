# STATE — forge board snapshot (slot b, 2026-11-26 — NOTHING VANISHES SHIPPED)

## This session — one ship + a red-main repair
- Warden TARGET **#3407** claimed at slot b: FEEDBACK reports must never
  disappear silently. Shipped **PR #3424 (merge af1fabf)**; issue closed shipped.
- **Outbox** (`src/utils/feedback.js` + demo twin, `rg.feedback.outbox`): every
  refused send is kept on-device (quota-slimmed: screenshot drops before the
  note; max 5) and retried with backoff 10 s→300 s; first retry rides the next
  page load; delivered retries confirm `kept report delivered #<n>`.
- **Draft** (`rg.feedback.draft`): the note survives close/nav/reload; cleared
  only by its own accepted send or the player emptying the box.
- **Dictation catcher** (`installNoteSync`): native input/compositionend on the
  textarea + send() reads the DOM value — what you see is what is sent.
  Empty-note taps answer `nothing to send — type or dictate first`.
- **Red-main repair #3427 (b568218)**: main's required `static` was RED since
  ea7d36f (#3418) 23:30Z — Tetris's pill dropped to 4.75rem under the
  default-position WatchToast → 4 watchpillcheck pins red for EVERY lane whose
  scope hits the check (mine included). Fix: toast explicit top 8rem + --sat
  (pill bottom 7.5rem + GAP 8px). watchpillcheck 227/227. Rule 5a, no ask.

## Bugs my browser play caught (pre-existing, all now pinned)
- `dispatchPause()` synthesizes '?' ON window → target IS window →
  `panelEl.contains(e.target)` threw twice per panel close (#905 shield).
  Both twins now pass window-targeted synthetics through.
- Reopen race: save-on-change wrote the blank state over the stored draft
  before the next-tick restore read it. State-driven save persists only
  non-empty text; user erasure clears via the native listener.

## Proof
- feedbackcheck **290/290** (+61 pins): outbox keep/cap/slim/thin/flush, drafts,
  note-sync, guard-vs-pause, demo-twin parity, fake-DOM e2e of the REAL demo
  card. Red-capable: unbind compositionend → 3 pins die; drop blank-save guard
  → its pin dies.
- New **scripts/feedbackplay.mjs** (`npm run feedbackplay`, advisory — NOT in
  checks.mjs): real Chrome 390×844, relay stubbed via page.route (no GitHub,
  no prod test hooks), dictation via Input.insertText with a capture-phase
  counter proving ZERO keydowns. 18/18 GREEN ×2 (pre-rebase + on rebased tree),
  zero page errors.
- Prod verified independently: chunk `index-4mzPYMgh.js` carries `kept report
  delivered`; demos/feedback.js carries the outbox twin.

## PLAYABLE on main right now
- `/retrogames/` + every game: FEEDBACK button hardened (kept-reports,
  drafts, dictation). Tetris toast no longer hides behind its WATCH pill.
  Plus prior shelf: skyward, grind-city bot, tidal-rush, pinball SOLO+smith,
  ssx, comet-drift pair, marble pair, galaga bee, mario-kart, ice-climber,
  pacman, mario, minesweeper/garden-guard/homebody, TIDY BOT, STARRY NIGHT,
  TOP SOLDIERS, DOUBLE DRAGON, RACCOON HEIST, spy-hunter, iron keep, missile,
  pucks, mines, zork, ultima, king's quest, Joust, Q*bert, forge board.

## Harness lessons (worth one line each)
- A game PR that passes its own scope can leave the check red for the NEXT
  lane: #3418's scope missed watchpillcheck → main's static dead for hours.
  Game chrome moves: run the shared chrome law before merging, every time.
- Fake-Node asserts can mask DOM-only crashes: `contains(window)` only throws
  in a browser. Anything touching e.target needs one real-Chrome pin
  (feedbackplay is that rung for feedback).
- React effect tick-order IS a data race: state-driven persistence must never
  write its boot-time blank over external storage.
- jalfern.com answers `/retrogames/` with a redirect — poll prod with curl -L.

## Board watch (facts, not questions)
- `game-queue` empty at claim and close; `next` #1712 waiting-jon.
- Slot a PR #3426 (docs state) open at my close; #3419's fix rides PR #3423
  (open). Main moved fast under me: #3410, #3421, #3425 landed mid-session.
- watchpillcheck is now green on main (b568218); static unblocked for all lanes.

## Open questions (links only — #605)
- #3335 — QA: music-bus low-pass in AudioController (AWAITING, qa lane).
- #3054 — native TestFlight ports have no recorder/upload (AWAITING).
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).
- No new jonq questions filed this session.

## Slot state at handoff
- Slot b: dev :5178 stopped via scripts/devstop.sh; lane worktree
  `~/Dev/retrogames-forge-feedback-no-vanish` detached clean at origin/main;
  main checkout detached at origin/main.
- Game/demo code merged this session ⇒ STATE ships via its own docs/state PR;
  parked at /tmp/forge/STATE.b.parked.md via statepark.
- Time-box: two ships (target + red-main repair) well inside 3 h.
