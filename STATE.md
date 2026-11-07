# STATE — session 177 (2026-11-07, slot b)

## What shipped
**MAGIC CARPET — the original's stereo glasses (red/cyan anaglyph) — PR #1794
squash-merged as `fae53b5`, closes #1790 (POLISH, never-dry stage).**
Ladder: warden target #1711 was REFUSED at claim (slot a holds it live, resumed
as S6 outbox #1795); steer/next/game-queue empty; feedback borrow blocked (live
QA MASTER on studio 5176 + mini 5174); flagship gaps all CLOSED/owned
(flagshipStage null); weakestStage scored MAGIC CARPET **7** — shelf max. Gap
pick: #1764 paraphrase-owns spell-menu/wizards/villages/water/fog/campaign, so
the oldest gap no open issue reaches was the README's "no anaglyph/stereo mode".
Filed #1790 with the why-weakest line, claimed, built.
- **Game:** `renderer.js` renders the world twice per paint from ±0.60u parallel
  cameras; post quad combines left→red / right→cyan (classic optical pick, no
  ghost-crush); bloom runs once and serves both eyes (quarter-res, eye-agnostic).
  Two byte-type eye RTs join resize/dispose. Mono path byte-identical to before.
- **UX:** `V` flips glasses any screen (paused too); `?stereo=1` = phone entry;
  localStorage persists; flat red/cyan HUD pips while ON (overlay canvas never
  sees stereo — it's a chart, not world); pause-card line in the registry. Sim
  untouched.
- **Harness:** carpetcheck +10 gates on a frozen world (reset+step quiesces):
  mono baseline peaks dx 0 on far/mid/near bands; ON shifts near-band R↔G peak
  off-axis NEGATIVE (left-eye polarity); depth spread (far parallaxes less);
  sky stays blue-dominant (channels split views, not hue); pips drawn/gone;
  real V key + localStorage + reload persistence + param beats storage once,
  not after. **Mutant proven:** IPD 0.60→0 — three physics gates RED naming
  `peak 0`, toggle/persistence gates stay green (correct sensitivity).
  Restored green; eslint/lint:mario/fps/ai + build green. Prod verified
  (`index-DaFJgo3a.js` carries `mc-stereo`); #1764 got the scope note (
  shutter/interlace + true HRTF remain PARTIAL).

## Board after this session
- Slot a merged #1795 (PLAICRAFT S6 outbox, `9c60769`) while I built. Their
  report flags **#1793 (feedback): GAUNTLET replay diverges at tick ~570,
  intermittent** — threatens #1711's "100% replay-verify" line; QA lane's by
  rule unless Jon says next/steer.
- #1711 stays big-build open: hardware stage awaits #1730 (deadline 11-08,
  default hold).

## Next queued
- #1711 stage 3 (phone drive): when #1730 lands — 3 phone runs,
  `npm run plaicraft:evidence`, paste table, close with evidence. Run it on a
  NON-first-consent session or #1793 bites the replay line.
- Never-dry: re-run weakestStage fresh (`/tmp/forge/slotb-weak-s178.mjs`
  works — live gh api board, idle.mjs). MAGIC CARPET's remaining gaps are now
  #1764-paraphrase + the shutter/HRTF residue → next tier score-5 tier is
  HOMEBODY / BRITANNIA / FLOOR BOSS (oldest-first → HOMEBODY; its oldest gap:
  no room build/extend, one fixed lot).

## Open questions
- #1730 (waiting-jon, lane:games) — R2 bucket + relay deploy; default hold.

## Slot hygiene
- Dev server: slot-b's `npm run dev -- --port 5178 --strictPort` LEFT RUNNING
  (mine; kill first: `lsof -ti :5178 | xargs kill`). Vite binds IPv6 — browse
  via `localhost:`.
- **Vite file-watch misses edits in worktrees on this box** (hit 3× today:
  slot-a twice, me once — a stale IPD=0.30 served after sed to 0.60 while
  carpetcheck reported green-looking runs). AFTER any src edit that a browser
  check depends on: `curl -s localhost:5178/retrogames/src/games/<Game>/<file>.js | grep <new-text>`;
  on miss `lsof -ti :5178 | xargs kill` + restart + verify again. The
  IPD-mutant run was only trustworthy after a restart confirmed the served
  bytes flipped.
- Worktree `~/Dev/retrogames-forge-mc-anaglyph` (node_modules symlinked) sits
  detached at `fae53b5`; remote branch deleted at merge — reuse freely with
  `git checkout -B forge/<newslug> origin/main` after fetching.
- Prod probe lesson: SPA games lazy-chunk per game (`index-<hash>.js` names —
  grep ALL chunk refs from the entry, not the entry itself, for new strings).
  `grep -c` on minified chunks counts LINES (=1), not hits — use -o | wc -l.
