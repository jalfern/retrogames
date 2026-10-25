<<<<<<< Updated upstream
# STATE — 2026-10-25 forge session 16 (MAGIC CARPET rework shipped #1059)

## Shipped this session
- **MAGIC CARPET fidelity rework (#1041, PR #1059, main 00fca05)** — rebuilt
  much closer to the Bullfrog 1994 original per Jon's brief:
  bank-by-delivery economy (pearls trail the carpet into a carried pouch; hover
  the castle to drain 3/tick into the VAULT = the win; death spills the pouch,
  the vault endures; broke = flight over), spell-cratered terrain (fireball/
  lightning/tower-fall deform the heightmap, flooded below sea level, huts
  ignite and fall to rubble, scorch still breeds wolves), THREE worlds
  (Verdant Isles/Emberwild/Frostbound, quotas 115/160/175, wizard hoards
  80/110/140 — spells + carried pouch transfer), wolves only reach low-flying
  carpets (altitude = armor), spawn invuln + giants keep off the castle, HUD
  VAULT/CARRY/WORLD readout, carried-orb halo. Registry text + README rewritten.
  carpetcheck 24→30 checks (delivery/spill/craters/burn/cross-world
  conservation/three-world win); mutation-proven (win-check ×100 reddens only
  the 3 equilibrium checks); autopilot wins 60/60 seeds (slowest 26.5k ticks);
  headless drive OK (tap-start, steer, cast spends exactly 15, death→over→
  attract→restart, zero page errors). Also fixed: contract tick-end now flushes
  events so a driven-to-death game reaches the over screen.

## Playable now
- /magic-carpet — the rework. jalfern.com's OUTER proxy was still serving the
  pre-merge bundle (index-Sfr_QE9d.js) at shift end; Vercel deploy completed,
  edge self-heals (same pattern #1040 noted twice). Verify link tomorrow.

## Queue
- #1044 EMBERWOOD act two is the oldest lane:games item → next forge claim.
- lane:demos: #1042/#1043 neon city + volcano, #1047-#1050 BLACK HOLE stages +
  CORAL REEF. QA: #1052 LOBBY (partially shipped by #1055/#1058 — check
  closeable) + new #1060 MAGIC CARPET polish pass (9 items: wave-palette water,
  per-world palettes, crater glow, fire spread, carpet flutter, wind ambience,
  vault tick stagger, tower topple via telekinesis throw, radar hut/fire dots).
- #1040 stays OPEN (nightly soak, no queue label) — the bot closes it on 3
  green nights; magic-carpet participates with the new three-world rule (policy
  pure in seed+tick unchanged).

## Board / harness status
- main = 00fca05 (this PR). `static` green; nightly green before merge.
- Rule 4 satisfied: game code merged this session (counter reset).
- Open: #737 waiting-jon (platform) · #1038 building-qa (demos) ·
  #1044-#1050 game-queue · #838 epic unlabeled · #549 parked · #1052, #1060
  feedback (QA).

## Housekeeping owed
- Worktree retrogames-forge-magic-carpet-1041 REMOVED after merge; main
  checkout detached at origin/main with only STATE.md dirty (this report —
  committed separately or parked per lane rules).
- Dev server on :5173 stopped at session end.
- Remote `forge/*` orphans unchanged (campfire-670, comet-hd-fallback,
  emberwood-grace/sprites/wyrm-tail, iphone-controller,
  ssx-cpu-riders-620/ssx-salis-arm) awaiting Jon/warden confirm.
- No drive-id renames — replays valid. magic-carpet nightly seeds from before
  today replay differently (rules changed — accepted; nightly baselines re-roll).

## Open questions
- #737 (platform, waiting-jon) — pre-existing, linked only. No new jonq
  questions this session (none met the taste/priority bar).
=======
# STATE — 2026-10-20 forge pm #3

## Shipped this session
- **#616 SHORE rewrite → prod** (PR #652, squash `409e822`,
  live at jalfern.com/retrogames/demos/shore). CPU swash lanes replaced by a
  GPU 2D SWE sim (141x351 @ 0.4m, 4 substeps) with eikonal travel-time
  refraction (Snell tilt 0.07→0.73 measured), cnoidal asymmetry, persistent
  advected foam (ping-pong + Worley lace, ~2.5 s half-life, proven to linger
  on dry sand), two-stream water colour, dual-lobe wet/dry sand PBR, caustics,
  meniscus, ocean-ported golden-hour sky.
- `scripts/shorecheck.mjs` rewritten: senses the water **through the GPU probe
  only** (no CPU lanes exist anymore). 25/25 green; sponge-zero mutant proven
  red (3 gates) and restored. Perf gate is headless-aware (SwiftShader ~70 ms
  at 1600x1000; old demo was ~88 ms on the same box).
- QA polish filed: **#654** (foam polka-dot, flat deep tone, camera framing,
  missing rip seeds). Labels `feedback` + `lane:qa` — QA lane picks it up, not
  builders (Jon 2026-10-19).

## Next goal
Oldest game-queue: **#637 FORGE — Shared 3D model shelf** (infra-ish; it's
labelled FORGE, take it or skip to #638 SSX mountain feel per the FORGE.md
tie-break). Queue: #637, #638, #639. Claim with `building` +
`lane:<x>`, worktree off origin/main, ship end-to-end.

## Gotchas learned this session (add to whichever doc fits if repeated)
- `jalfern.com` 308-redirects to `www.` — production content polls must use
  `curl -sL`; without `-L` the poll silently never matches.
- Issue labels: there is **no `done`** label — shipped work gets `shipped`
  (see #620). `building` removed on merge.
- shore.html tuning that mattered: inlet sponge band 18 m / strength 0.7;
  bore clamp at spd>celer2; film friction 0.012+0.45·exp(-h/0.09) — zeroing
  the sponge lets the box seiche swamp everything (that's the mutant).
- shorecheck trace needs ≥180 samples @ skip 12 before the cycle test is
  stable; shorter traces flake the set-catch gate.

## Board / harness status
- main: `409e822`, nightly green before merge (`main-ok.sh` ok).
- Rule 4: satisfied — #646 (Momentum Runner), #651 (QA), #652 (demo) are all
  game-code PRs in the last three merges.
- Rule 7: no open `waiting-jon` questions from this lane; none needed.
- Worktrees: `~/Dev/retrogames-forge-shore-616` removed. Main checkout
  detached at origin/main.

## Open threads
- **#654** QA polish for shore (lane:qa).
- #637/#638/#639 as above. Previous sessions' open questions, if any, are on
  the board with `waiting-jon`, not here.
>>>>>>> Stashed changes
