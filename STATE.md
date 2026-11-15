# STATE — session 288 (2026-11-15, slot a)

## Playable now / what shipped
- **BRITANNIA: purse & passage toll (#2345 → PR #2348, merge `4a20211`).**
  The gap "Boarding is free at any coast" ships its toll half: HUD carries
  `PURSE 250` (the original's GOLD) from minute one; every boarding pays 5
  gold with a coin chink; a light purse is refused ON THE SAND (chapel-stone
  pattern — cooldown, buzz, gold kept: a door, not a fine). **Dawn tithe**
  +20/day, capped at 250 — invented glue, honest tail: origin has no
  overworld income, stage 2's shops replace it. Moderate travel lives on the
  land forever; six boardings a day run dry by day 23. `gold/fare/day` on
  harness state, gold inside the state hash, `setGold` + DebugKit cheat.
- Gates at ship: britanniacheck **332** (+28 PURSE LAW: literal spec pins,
  toll/tithe laws incl. exactly-zero-pays & 4-refuseth, booked-vs-module
  economy sims agreeing on day 23, winnable-with-empty-purse via moon chain,
  purity, wiring). Mutants die by name: toll-free (2 red), purse-hollow
  (5 red), tithe-mint (3 red). britannidrive 55/60 — 4 new live purse gates
  green (pays 245, refused dry at 4, tithe 0→20 + words); remaining 5
  failures PROVEN pre-existing main baseline (A/B run, spare port 5175).
  lint mario/fps/ai + lint:britannia + eslint + build green.
- Rule 4: game code shipped.

## Ladder (this session's path)
- Warden target **#1711** claimed first, audited live (3rd consecutive
  nothing-moved: `/status` writeKey:false, store still 7 takes all PLAIGRADEd,
  no claptest take, jonq **#2305** AWAITING deadline 11-17 default hold),
  released with evidence back to `next`. Jon-side lines unchanged: his
  claptest phone run (#2156) + `wrangler secret put SESSION_WRITE_KEY`.
- game-queue empty; only `feedback` was **#2343** (TidyBot attract) — 3 live
  QA MASTER sessions (mini/mini2/studio) → borrow blocked; flagship stage
  spent (`flagshipStage` null).
- Never-dry: `weakestStage` named **BRITANNIA** (score 3, three unowned
  README gaps, oldest among score-3 ties; PoP/GardenGuard QA-held). Filed
  #2345 with why-weakest line, claimed, shipped. Quay-location rule was
  probed FIRST and rejected honestly: all 8 gates are inland (findStars
  filter), zero coast tiles within 3 of any gate — the geography forces the
  toll half, not the port half.

## BOARD at exit
- building: NONE. game-queue: empty.
- building-qa: **#2336** (GardenGuard), **#2330** (PoP). feedback: **#2343**
  (TidyBot, QA-held all shift), **#2351** (new — BRITANNIA polish pass: ship
  sprite, coin presentation, refusal theatre, drive baseline).
- jonq open: **#2305** (lane:platform, AWAITING — not ours to wait on).
- #1711 `next` — Jon-side remainder unchanged. No halt, no steer.

## Next (slot a or b, in order)
1. Ladder as usual. Re-run `idle-kick` honestly — Britannia's three gaps are
   now two (toll bullet carries CLOSED-by marker). Candidates carry score 3:
   FLOOR BOSS, SHORT ORDER SHOUT, GRAVEL YARD, TALK ME DOWN, BOMB DEFUSE …
   (registry order picks; run the tool, don't copy this line.)
2. If a jonq answer lands for #2305 (write key), execute the #2093 relabel
   one-off; a clap-test take on the store means grade it + post #1711/#2156.
3. Britannia polish (#2351) is QA's; the 5 pre-existing britannidrive
   failures (gate-III menu stickiness x4, gate-VI shrine bump) are named
   there — a QA calibration pass, don't let them scare a builder.

## The session's catches
- **Baseline before blame.** The drive showed 9 reds; 5 were identical on
  main (A/B: same machine, spare port 5175, `git worktree` untouched).
  Without the baseline I'd have burned the shift on someone else's staleness.
- **zsh grep on minified JS dies ("character not in range")** on em-dash
  bytes via `echo` — export `LC_ALL=C` and pipe curl straight into
  `grep -a`; never round-trip bundle text through the shell's echo.
- **Prod markers hide in shared chunks** (`fighting-*.js` carries several
  games) — walk EVERY `*.js` the entry references, not just `index-*`; and a
  chunk NAME never tells you the game (verify with the marker itself).
- **Same-tick toast collision:** the tithe toast died behind a gale notice —
  day-turn block moved AFTER the wind block so the newer news wins (GOAL
  still king).

## Hygiene at exit
- Dev servers 5173 + 5175 (mine) stopped; 5174/5179 (foreign) untouched.
- Slot-a forge worktree removed; branch gone via squash; main checkout at
  origin/main. STATE commit to main follows this file (game merged — rule 9)
  + statepark slot a. Prod marker poll: entry chunk sweep for `tithe 20
  gold` — if #2348's marker is absent at next shift start, treat as #2335-
  class stall and re-run the sweep.
