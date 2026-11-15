# STATE — session 287 (2026-11-15, slot b)

## Playable now / what shipped
- **VIPER PIT hits back (#2334 → PR #2341, merge `d171e12`).** Destructible
  props + meter pickups, engine-side: seeded crates/barrels in the fight zone
  (barrel = any one hit; crate = one heavy or two lights; smash zone +0.35 m
  above the rim so punches land too); projectiles smash AND are eaten by the
  furniture; kills on loot props drop a bobbing orb — walk-through banks +20
  meter (capped; feeds the super/finisher economy). Layout seeds per round on
  a dedicated stream (CPU rolls untouched); respawn each round; prop/orb state
  folds into `matchHash` when on (seats agree, replays verify). Option
  `createMatch({ props: true })`, default off. Presentation: shards fly away
  from the hitter, crates show the crack, orbs bob/spin/fade; crack/drop/bank
  audio stings.
- Gates at ship: viperpitcheck **431/431** (+25 clauses: seeding, damage
  tiers, crack→break, smash-and-eat, orb drop/collect/ttl, respawn, hash
  coverage, ladder winnable WITH props, IRON RING golden streams
  `[1332719598, 1991399977, 3133682145]` pinned vs the pre-PR engine =
  options-off zero footprint). Prop-damage mutant (both paths stripped) caught.
  lint v/mario/fps/ai + eslint + build green.
- Also landed around the shift (other lanes): TIDY BOT aimed retrieve
  (#2338/#2340, slot a), GARDEN GUARD clear ceremony (#2336 pt2/#2342, QA).
- **#2335 PROD STALL CLOSED** with evidence at exit: entry `index-CFtOh-EZ.js`,
  full 60-chunk sweep finds `AIMED` (`index-tn0WIXuq.js`) and `propbreak`
  (`fighting-Csewj1eB.js`, `index-CekvXgWk.js`) — both stalled features now
  verified serving.
- Rule 4: game code shipped.

## Ladder (this session's path)
- Warden target **#1711** claimed, audited live, released: store still 7 takes
  all PLAIGRADEd, no claptest take, `/status` `writeKey:false`, jonq **#2305**
  AWAITING (deadline 11-17, default hold — not taken). Jon-side lines: his
  phone claptest (#2156) + `wrangler secret put SESSION_WRITE_KEY` → then the
  #2093 relabel one-off.
- game-queue empty; feedback all QA-held at claim time; flagship stage spent →
  never-dry: `idle-kick` → VIPER PIT gap 0 (weakest unheld, score 3; TEN-DEEP
  4, BRITANNIA 4, PoP 3 all held). Filed #2334 with the why-weakest line,
  claimed, shipped.

## BOARD at exit
- building: NONE. game-queue: empty.
- building-qa: **#2336** (GardenGuard), **#2330** (PoP polish).
- feedback claimable by builders: **#2343** (TidyBot attract) — but QA MASTER
  nodes were live all shift; expect them at it.
- jonq open: **#2305** (lane:platform, AWAITING — not ours to wait on).
- #1711 `next` — Jon-side remainder unchanged. No halt, no steer.

## Next (slot a or b, in order)
1. Ladder as usual; expect never-dry. Re-run `idle-kick` honestly — scores
   moved: VIPER PIT and TIDY BOT now carry 2 gaps each. Candidates ≈ GARDEN
   GUARD (gap 0 is an explained non-gap — take its NEXT bullet), FLOOR BOSS,
   SHORT ORDER SHOUT, GRAVEL YARD, TALK ME DOWN, BOMB DEFUSE …
2. If a jonq answer lands for #2305 (write key), execute the #2093 relabel
   one-off; a clap-test take on the store means grade it + post #1711/#2156.
3. Prod markers are green now; if #2335 reopens, re-run the full-chunk sweep
   (entry HTML references the entry only — walk its ~60 chunks for markers).

## The session's catches
- **A checker section can be silently dead under `--mutate`.** The new Node
  rules landed inside the giant `if (!MUT)` block: the plant gate printed but
  the rule clauses never ran mutant-side. House pattern: full rules in the
  !MUT scope, flipped one-liners beside the other "MUTANT check:" bites in
  `if (MUT)`. Cross-check WHERE a clause lives, not just that it was planted.
- **New mechanics can break old live clauses legitimately.** The gait clause
  rode a fixed window and main happened to enjoy a passive CPU; with orbs, RIV
  banks +20 meter and engages sooner → NYX hitstunned mid-sample (4/22
  samples, twice — not flake). Fixed honestly: sample back-walk FIRST (fresh
  positions) + wider window; the law (presentation) unchanged.
- **`gh` beats the ping.** Warden re-kicks carried stale board states twice;
  fresh audits confirmed #1711 unchanged in both directions — release + ladder
  with evidence, per the 11-14 audit precedent.
- **Prod markers live in lazy chunks** (`fighting-*.js`, per-game `index-*.js`),
  not the entry bundle — grep the chunks the entry references, with `-L`.

## Hygiene at exit
- Dev servers 5178 + 5181 (mine) stopped; 5174/5179 (foreign) untouched.
- Slot-b forge worktree + /tmp/rt-main-check removed; branch gone via squash;
  main checkout at origin/main. STATE committed to main (game merged — rule 9)
  + statepark slot b.
