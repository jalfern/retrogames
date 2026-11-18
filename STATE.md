# STATE — session 340 slot a close-out

## Shipped this session
- **HOMEBODY: DEEPER MULTI-ROOM — CHOOSE THE WING'S ROW, RAISE A GARDEN
  ROOM — PR #2691 merged `50dcf8f`** (#2689, never-dry rung #1571;
  `idle-kick` answered `KICK HOMEBODY 0 weak` twice at `4f36556`).
  Anchor law: a site qualifies where its punched door meets house floor
  (`links` on the geometry; `EAST_ANCHORS` IS that law — the gate derives it
  from MAP independently). The kit ghost rides the cursor: point at the east
  lawn and the whole wing slides its anchor to your row (row 3 snaps to its
  nearest legal neighbour); an unpointed kit keeps classic row 2 — muscle
  memory, marquee and the autopilot's `place(s, 0, 0)` all byte-identical.
  Kit two: the **Garden Room** on the back lawn (2×4 planks rows 9–10/cols
  0–3, door punched through the house's south wall at (8,2), east windows,
  potting-bench bake); two per lot, third refuses. `keepsWing` floods before
  every hammer (kerb, mail, solid targets, residents — a person on a future
  WALL cell refuses; the old kit would have bricked them). `s.wings` carries
  which-where; hash joins a small loop — twins green, autoplay pin
  `3836882361` survived UNTOUCHED (bot buys kit one only; no re-pin).
  Move-in ledger re-arms per hammer (newest wing's `react` cells); canopy
  fits both rooms. peoplecheck 906/906 (+30 §WINGS; old one-per-lot law and
  its pins rewritten in place); hand-mutant (links stub) killed by 2 named
  gates; homebodydrive 117/117 (+9 live legs); homebodyqueuecheck 99/99;
  contractcheck 14/14 (view gains `wings`). README: two clauses struck
  CLOSED; rooms-with-purpose kept open as its own honest bullet (#2214
  accounting law). QA tails handed onto #2688 (hover-preview, empty-room
  prop, dark bench at night, attract kit-two beat).

## Claims / board
- TARGET #2684 (warden): claim REFUSED — slot b held it live (14:26Z) and
  shipped it mid-shift (#2686 `8385a32` PICK RUSH telegraphs). Ladder after:
  steer empty; `next` #1711 documented wait-state (b swept 14:25Z — store dry,
  line 3 hardware-gated by jonq #2652 AWAITING; re-sweep = spin); game-queue
  empty; feedback #2688 held by a LIVE QA MASTER session → no borrow.
  Flagship stage spent → never-dry: `KICK HOMEBODY 0 weak` ×3. Filed #2689
  + why-weakest, claimed, shipped, closed with evidence.
- #2690 filed by slot b (QA PickRush polish) — QA's job, not builders'.

## Next queued
- Re-derive at new main: `node scripts/idle-kick.mjs` (do NOT trust this
  line). Homebody's surviving gap is now **rooms with purpose** (own bullet).
- #1711: tonight's ~16:30Z nightly grade self-posts if any phone take lands;
  otherwise unchanged wait-state (jonq #2652 default = keep waiting).

## Open questions (issues, not here — #605)
- #2652 (jonq, platform, AWAITING by Jon, deadline Nov 20 01:36Z) — phone
  clap take vs waiver for #1711 line 3; default keeps waiting, nightly
  self-grades and self-posts the verdict when the take lands.

## Catches for the next session (each cost probes this shift)
- **bfsPath's goal argument must be an ARRAY** — a bare `{r,c}` returns null
  (`to.length`), and the lot suddenly "has no path". Twice this shift.
- **Pointer hover does NOT move `gs.cursor`; arrow `press()` can slip between
  pad polls** — cursor needs tap, or `down`+wait(≥140 ms)+`up`. A hover-based
  ghost test silently reads the old anchor while passing for the wrong reason
  (the garden leg's green tick passed before ANY cursor was east).
- **Window-glass pixels carry baked furniture:** mullions at x+13/y+14 and
  the warm glint at x+7,y+11 sit ON the pane — sample low-left inside
  (x+9,y+18); mid-cell hits frame. The gold move-in burst (#1814) covers the
  `react` cells ±~24 px for ~2 s — sample planks away from them.
- **Prod-verify with minification-STABLE markers** (string literals like
  `GARDEN ROOM BUILT` survive; contract property names do NOT — #339
  doctrine). Homebody ships as an `index-*.js` lazy chunk named per route —
  grep the entry chunk's asset list, then each candidate for the literal.
- **Homebody gates call `roomClear`/`buildRoom` directly** — keep default args
  (`g`) so old call-sites stay honest; put new law on the GEOMETRY
  (`links`/`react`), not into scattered call-site checks.

## RULE 4
Game code merged this session (#2691, `src/games/Homebody/`), rule 4 intact;
STATE.md committed to main per rule-step-9 exception.

## Lanes clean
- Main checkout detached at `origin/main` (`50dcf8f`); this STATE commit
  rides the merge (game shipped — rule-step-9 exception).
- :5173 dev server stopped at close; other lanes' ports untouched.
- Worktree `retrogames-forge-homebody-wings` removed after merge + prune
  (orphan `node_modules/.vite` written through the symlink — clear the
  symlink target bottom-up before `worktree remove`).
