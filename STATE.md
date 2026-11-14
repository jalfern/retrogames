# STATE — Forge (last: session 264, slot a, 2026-11-14)

## SHIPPED THIS SESSION
- **CLAP TEST #2156 (PLAICRAFT S1 stage)** — merged **#2202** → `62dff47`, prod-verified
  (`www.jalfern.com/retrogames/claptest`, bundle `index-CgO_ir5P.js` carries it).
  One chromeless screen: START → the SAME consent gate as a game take → slap the
  screen 3× ~2 s apart → big PASS/FAIL (slaps heard / pairs / worst ms) + plain
  hints; take uploads via the usual outbox + badge. Phone and studio grade with ONE
  shared extraction (`clapSync.takeEdges`, new, pinned); `plaicraft:clap` re-grades
  identical bytes to identical numbers.
  Evidence: `recordcheck` 138/138 incl. the three #2156 acceptance mutants RED
  (taps +120 ms / taps no-sound / <3 slaps) + sim determinism + auto-END +
  honest-degradation pins; `claptestplay` (new, lane-run) clean 16/16 — phone PASS
  worst 44.4 ms, upload `audio:true`, studio exit 0; shift/silent/few mutants:
  phone FAIL AND studio refuses (shift −134.2 ms measured, not ungradeable);
  zero page errors every drive.

## LESSONS (the expensive kind)
- **`ciscope #1575 audits `*check.mjs` only** — parking a `*play` script in
  MANUAL_CHECKS self-fails as a stale park. Browser clap proofs
  (`plaicraft-clap`, `claptestplay`) stay lane-run, unscoped, alias in package.json.
- **Red `static` + long advisory jobs:** `gh run view --job … --log-failed` refuses
  while ANY job of the run is in progress. Read the check-run via
  `gh api …/check-runs/<id>` — or reproduce locally: the static steps are
  `ciscope --selftest`, `muteguardcheck`, `ciyamlcheck`, `shimcheck` + the KEYS
  scopes (core = ~31 checks, all fast).
- **jalfern.com 308s to www** — prod probes must follow to `www.jalfern.com`.
- **A stale worktree holding `main`** (furlong-horse had `[main]`) breaks gh's
  post-merge detach ("main is already used by worktree"). The merge landed anyway;
  detach the offender, re-detach yourself. Check `git worktree list` for `[main]`.

## BOARD
- **#1711 stays `building`** (correct — S1 remaining: Jon's 3 phone takes, incl.
  one slap test, + **#2157** lanes-grade-takes, the last builder line; deploy
  ORDER in relay/README: SESSION_WRITE_KEY secret AFTER the #2093 relabel one-off,
  BEFORE distributing JON_KEY; reads are locked on prod already).
- **#2156 stays open** for the live phone numbers (lane-side acceptance green).
- **#2205** filed: QA polish pass for the clap test (level meter, pacing guide,
  verdict history, a11y, tempo-variation drive).
- Nightly: latest completed on main = **success**. No quarantine entries. No
  steer/halt on any board.

## NEXT (next slot)
1. **#2157** (lane:platform, unclaimed): JON_KEY from gitignored `.env.local`,
   evidence download retry+backoff, verdict posted on #1711 per new take; jonq ask
   Jon for the one-time key step (exact command in the issue). Build AFTER the
   #2188 audit fix — already merged, so it's safe.
2. When Jon's phone takes appear: `plaicraft:evidence`/`plaicraft:clap --key=`
   numbers onto #1711 (then #2156 can close).
3. `claptestplay`/`plaicraft:clap` need a dev server on DEV_PORT (slot port) —
   relaysim covers the store; keep them lane-run.

## Open questions
- none (#2184 long answered; nothing new — taste bar not reached).

## HOUSEKEEPING
- Worktree `~/Dev/retrogames-forge-plaicraft-claptest` kept (branch merged; node_modules
  symlink). furlong-horse worktree detached off `main`. Slot-a vite (:5173) was a
  dead session's — reclaimed this session, own port only.
- STATE committed to main legitimately (this session's #2202 merged) + parked to
  the slot-a path.
