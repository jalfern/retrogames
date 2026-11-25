# STATE — forge board snapshot (slot b, 2026-11-24 — PINBALL DRESSES UP)

## This session — one ship, landed
- **#3259 PINBALL ART KITS SHIPPED** (PR #3262, merged `de10eaf`). Warden
  TARGET #3233 (GRIND CITY tail 2) was **REFUSED at claim** — mini held it
  (newest-wins #878) — ladder then: no steer, `next` only waiting-jon #1712,
  `game-queue` empty, QA MASTER live (no feedback borrow) → never-dry
  `idle-kick` = `KICK PINBALL 0 weak` (score 7 = 6 unowned gaps + #3237).
  Filed+claimed **#3259** with gap-skip honesty: gap 0 (table editor) deferred
  — #3103 says verbatim *"Not yet: a table editor"*, the issue body wins;
  gap 2 (driven attract) owned near-verbatim by #3237; gap 5 stale (#3250
  shipped kickback). Oldest actionable = `?style`/skins.
- KITS: `SKINS` in art.js, keyed by table id, index 0 = house dress. TIDAL RUN
  (cab one: teal/coral/mint) + TOXIC (ember: moss/lime/magenta). Palette-only
  — zero physics/data change (#3103 contract). B/Shift/▲▼ cycles on the row,
  marquee `TAG · KIT` + badge, title/picker glow follow; `?style=<id|label>`
  honored (case-free, per-cabinet, start-pick not lock); persists per cabinet
  across quick-retry; DMD says `KIT <NAME>` at load; pad second button reads
  KIT on the row.
- Proof: pinballcheck **160/160** + **ALL MUTANTS CAUGHT 6/6** (new `skin`
  anchor renames TOXIC hotRgb — key-parity catches; ANCHORS now allow a
  per-rule `file`). pinballplay **42/42** live :5178 (pixel legs: tidal
  G+20/R−11 on the card; TOXIC green 14k vs red 2.7k). contractcheck 14/14,
  eslint + 3 gates + build green. Prod verified: `Pinball-BNpIehAE.js`
  carries `TIDAL RUN` — #3259 closed shipped. Kit-polish asks → QA tail
  **#3237** comment (persist/localStorage, kit sound, results line, unknown-
  style DMD hint, kit #3 is pure palette).

## Harness lessons (worth one line each)
- **During attract, `gs.table.id` names the LAST run, not the row selection** —
  harness selection checks must read shell selection state (skinId), never sim lag.
- **Additive keys only in dev-rig state**: my numeric `cab: cabRef.current`
  silently overrode stateOf's string `cab` and killed two existing legs.
- **Last-frame DMD reads race the next `say()`**: capture announce strings
  during polling (KICKBACK vs LANE SWEEP), don't trust the read-after frame.
- **Worktrees have no node_modules** — `npm ci` (~2 s cached) before first lint.

## PLAYABLE on main right now
- `/retrogames/pinball` **row of cabinets + art kits** (B/▲▼ dress,
  `?style=tidal|toxic`), roofless truth: kickback #3250, ball-to-ball #3219,
  rung 3 orbit/magnet/MULTIBALL beds.
- `/retrogames/grind-city` roof line + gems + secret bowl (#3251),
  `/retrogames/tidal-rush` online rooms + podium/rematch (#3227/#3253),
  skyward thunderpass, r-type, ice-climber, marble-rush (trick hop #3243),
  comet-drift pair, stomptown, short-order-shout, ssx, marble-madness, pacman,
  mario, minesweeper/garden-guard/homebody, TIDY BOT, STARRY NIGHT, TOP
  SOLDIERS, DOUBLE DRAGON, RACCOON HEIST, spy-hunter, iron keep, galaga,
  missile, pucks, mines, zork, ultima, king's quest, Joust, Q*bert, forge board.

## Board watch (facts, not questions)
- `game-queue` EMPTY again; #1712 (`next`) still waiting-jon (not a work item).
  Mini holds **#3233** (grind-city tail 2) and **#3244** (tidal-rush QA).
  Next builder claim: live `idle-kick` again — don't trust this file.
- Pinball README honest-gaps left: editor (deferred by #3103), driven-attract
  (#3237), single-ball music bed dry, magnet/orbit per-ball, left ramp,
  kit-persist rung (new).
- Nightly: main-ok green at session start and at merge.

## Open questions (links only — #605)
- #3054 — QA: native TestFlight ports have no recorder/upload (lane:qa, AWAITING).
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).
- No new jonq questions filed this session.

## Slot state at handoff
- Slot b: dev :5178 stopped via scripts/devstop.sh; worktree
  `~/Dev/retrogames-forge-pinball-skins` swept by mergeclean post-merge;
  main checkout detached at origin/main.
- Time-box: ~2 h 45 min of 3 h — claim-refusal + ladder + full kit rung +
  harness fit inside it.
