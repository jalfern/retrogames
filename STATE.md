# STATE — RetroGames (last update: 2026-11-12, slot b session end)

## Now playing
- Arcade: HOMEBODY (`/retrogames/homebody`) — the lot has a second neighbour.
  Ivy the market gardener arrives 12:00–19:00 on her own clock, climbs her
  own bond ladder, and from FRIENDS up her visits carry a basket (FAMILY adds
  §15 honey-money). Phone-ready: tap to start, court keys ride the pad's A/B.
- Papers-Min still ships the ageing neighbourhood (#2080); all other titles
  unchanged.

## Shipped this session
- **#2143 (PR #2150, squash 22218fe):** Ivy — second visitor, own schedule
  (window honest: hour clamped ≤18 so a late schedule can't strand her),
  `rel.ivy` on the proven #1817 law (0.055/s grow, one rel-up per edge,
  0.03/h fade via relSub), gift economy (hunger+0.18/+1 content at FRIENDS;
  §15+2nd point at FAMILY, basket rides stateHash), court C/X symmetric with
  Fern, nearest-visitor autonomy (chat goals carry `v`), roomClear refuses the
  wing on Ivy, `flower IVY` BONDS row, swinging-basket sprite, marquee beat.
  peoplecheck 185→211 (+26 gates); mutant by hand: kill the ivy chat feed →
  exactly the two chat-law gates red (209/2), restore 211/0. Drive +5 live
  gates (plum 117 px, basket tan 100–114 px, panel pips rgb(163,87,155)).
  Prod verified live.

## Catch of the session (learnings that generalize)
- **A poll whose grep errors is a poll that never verifies.** `grep` on
  minified bundles dies with "character not in range" under multibyte locales
  — silent exit 2, marker "absent" forever. Production was live while I
  polled. Use `LC_ALL=C grep -a` for anything binary-ish; a marker missing
  from a 1 MB bundle is an instrument failure first.
- **Prod verify: entry-hash flips are the wrong witness.** Vite ships the
  game strings in lazy chunks; the HTML entry hash can predate the deploy and
  survive it. Scan the entry's *referenced* chunks for a game-unique string
  (found Ivy in `index-BWSc_ee7.js`; Fern's strings live nowhere in the
  entry either).
- **Same failure twice is not a flake.** Two identical `hearts 0 / pink px 0`
  drive failures → reproduced on clean origin/main with my diff stashed →
  pre-existing, filed (#2149), lane moved on. The law gate passing beside the
  pixel gate pinpoints which arm broke (event plumbing yes, particles no).
- **Schedules need a reachability clamp.** 14+rng·6 base vs a 19:00 window
  could strand Ivy never-arriving on high draws. Any windowed scheduler must
  clamp its fire time strictly inside the window (found by designing the
  "after dusk she never appears" gate).

## Open lanes / queue
- #1711 PLAICRAFT S1 — slot a live on it (tail PR #2142 merged mid-session);
  do not touch.
- QA board open: #2084/#2087/#2089/#2104/#2128/#2133/#2135 (new), #2139,
  #2154 (new: Ivy polish pass), #2149 (new: drive hearts dead on main),
  #2136/#2137 (lane:platform).
- No open question issues (`jonq list games` empty at claim and at exit).

## Harness state
- peoplecheck 211 gates (+26 SECOND VISITOR); homebodydrive 45 gates (5 new;
  the +2 red #2076 ones are #2149's problem, not the game's).
- Slot b park: `node scripts/statepark.mjs park b`. Dev server 5178 stopped by
  this session. Main checkout detached at origin/main. Worktree
  `~/Dev/retrogames-forge-homebody-ivy` kept (clean, detached at merged tip).

## Next builder moves (suggestions, not commitments)
- NEVER-DRY picked Homebody (score 5) this session; remaining unowned Homebody
  gaps: kids/pets, insult-on-touch (partly #2135#1), deeper multi-room.
- ViperPit/PickRush/TidyBot/TalkMeDown each still carry 4 unowned README gaps.
- If #1711 goes quiet, its lane-doable tail is listed on the issue by slot a.
