# STATE — session 242 (2026-11-12, slot a)

## What shipped
**GAUNTLET-iPHONE TOUCH LAW** merged as `5b8ace6` (PR #2092, Closes #2057 —
the warden-assigned TARGET after #2058 was refused honestly, twice).
- The page can no longer pan/zoom/select under a thumb, shared-layer only
  (no game changed): viewport meta `maximum-scale=1.0, user-scalable=no`;
  html/body `height:100%; overflow:hidden; overscroll-behavior:none;
  touch-action:manipulation` (every content page already owns an inner
  `overflow-y-auto` — verified before pinning); canvas `touch-action:none`.
- Root cause of the vanishing stick: 100vh shell > Safari's small viewport made
  the DOCUMENT pannable, so any drag off the pads touchcancelled the stick
  mid-push. VirtualControls now remembers each stick source's finger (floating,
  fixed, diamond-gate, playfield swipe) and re-derives direction+analog on
  resize/orientationchange/visualViewport moves — the push survives.
- `touchselectcheck` 16→62 gates: REAL touch (CDP `Input.dispatchTouchEvent`,
  iPhone-12 + iPad-Pro-11) on Gauntlet itself — consent-gate NO-THANKS tap
  through first start, arrows across the drag with `scrollY` pinned and zero
  cancels, knob mounted, resize-MID-PUSH survival (no silent drop + answers a
  new direction after), canvas drag inert. 62/62 x2. Mutants precise: canvas
  line → exactly 2 red; html/body block → exactly 12 red; restored clean.
- Lint gates + eslint + build green; vpadcheck 703/703, padlayoutcheck 23/23.
  Prod verified live: meta + `overscroll-behavior:none` + `manipulation` +
  canvas `touch-action:none` in `index-CmWD4k5s.css`. #2057 shipped-labelled+
  closed; unblocks the touch side of #1711.
- Filed QA #2091 (pre-existing): `gauntletplay` scripted starts hang on the
  first-run auto-record consent gate where the store is live; diff proves not
  my PR. `qa-art/` untracked + ignored (main never tracked screenshots).

## The session's catches
- **A synthesizer only signals CHANGES.** Direction-continuity gates must
  assert ABSENCE of keyup/cancel, never presence of a re-keydown — my first
  "re-publish" gate asked for a signal a still-held key cannot emit. (The
  revive effect itself is not reddable in headless; PR says so honestly.)
- **CDP touch dispatch resolves BEFORE the page handler runs.** Every assert
  after `Input.dispatchTouchEvent` needs a ~120–150 ms settle or it races the
  recorder (looked like a dead pad; was an early snapshot).
- **The auto-record consent gate is LIVE** wherever `probeStore` answers —
  fresh-profile scripted starts get swallowed by a z-9990 overlay. Tap NO
  THANKS (phone-true, this check) or Escape (`defusedrive`'s pattern).
- **Decommitting artifacts with copies still on disk wedges rebase** — it
  refuses to replay your own add over the untracked files; `rm` + `--continue`.
- **Prod scans need `-L`** (jalfern answers 308) **and vite needs `--host`**
  (IPv6-only localhost bit chromium this time, same family as session 241).

## Ladder trail
TARGET #2058 REFUSED honestly twice (held by b, fresh claims — b shipped it as
`87aff97`). Ladder: no halt/steer/next left; took #2057 (`next`, oldest
unheld; #2056 skipped as PLAICRAFT-adjacent to b's in-flight #2058 — b shipped
it as #2094 anyway). After the warden re-kick, step 1b: my own pushed
`forge/gauntlet-touch` corpse resumed rather than claiming anything new.
No jonq filed (no taste/priority calls).

## Open questions
- none (see waiting-jon issues).

## Next
- Recompute the ladder live at next kick — game-queue still holds #2055
  (shift-report undercount) and #2054 (shoreperf runner retired); #2056/#2057
  are done. Both are lane:platform; builders work games-first so the never-dry
  rungs may apply — run `weakestStage` honestly, don't copy scores.
- QA lane holds: #2084 (SOS polish), #2085/#2075/#2069 (CivV), #2091
  (consent-gate drivers), #2093 (phone-takes relabel). The 3 broken-voice
  iPhone takes must NOT feed S3 until #2093 item 1 runs.
- `viperpitcheck` still red-on-main, wired into NO CI job (flagged since 235)
  — re-file on a QA issue if nobody owns it.
- Dev servers at exit: slot a 5173 STOPPED; slot b's port untouched. Worktree
  `retrogames-forge-gauntlet-touch` removed after the squash; session-235
  candidates (ppm-portrait, ppm-bulletin, papers-photo) still stand.
