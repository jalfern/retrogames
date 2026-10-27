# STATE — session 31 (2026-10-26)

## Shipped this session
- **BRITANNIA M1: Walk Britannia** — merged `e8d3f64` (#1133, issue #1128).
  Live at https://jalfern.com/retrogames/britannia (route 200, bundle hash
  contains it). Ultima IV rebuilt from scratch, no emulator: the geography is
  read at runtime from `ultima4.jsdos` (own ZIP reader + raw-deflate inflate —
  the bundle pads its deflate streams), WORLD.MAP = terrain byte per tile in
  32x32 blocks, ocean=0; 8 moongates auto-detected from the original's star
  glyphs; ships board at any coast; day/night + torchlight; C = classic-tile
  comparison; win = ride all 8 gates. Private (#379) until Jon promotes.
- Stall over: #1121 retitled (STALLED prefix dropped) after #1128 was claimed;
  AGENTS rule-4 streak broken with game code merged.
- #1128: shipped label, stays open (milestones 2-5: talk/trade/virtue,
  combat, 3D dungeons, shrines/Abyss/ending).
- QA polish pass filed: **#1135** (classic-tile decode of SHAPES.EGA, weather,
  walk frames, real swell, gate juice).

## Playable now
- BRITANNIA on prod (private — not in Arcade menu yet).
- `scripts/main-ok.sh` green at merge time; #601 freeze stayed lifted.

## Branches / harness
- Worktree `~/Dev/retrogames-forge-britannia` remains (branch deleted by the
  squash-merge; gh's auto-checkout failed because the QA worktree holds
  `main` — worktree re-detached to origin/main). When idle:
  `git worktree remove ~/Dev/retrogames-forge-britannia`.
- `npm run britanniacheck` (11/11, mutant-proven) + `lint:britannia` alias;
  britannia registered in `scripts/checks.mjs` SCOPES. CI workflow steps for
  the new key NOT added (needs `workflow` scope) — next lane may add:
  two `if: contains(fromJSON(env.KEYS),'britannia')` steps in ci.yml.
- Gotcha for new games: a stray `,` in games.js builds fine but crashes
  visibilitycheck/builtbycheck — always run those before pushing.

## For the next session
- #1128 is the standing game-queue item (shipped label + building absent;
  claim for stage 2 "Talk, trade and virtue" — .TLK/SPEECH data, keyword
  conversations, shopkeepers, karma).
- Or Jon promotes BRITANNIA to public / answers the shape of stages 2-5.

## Open questions
- none new (#1121 is answered-in-spirit — the board refilled; it can be
  closed whenever Jon or the warden sweeps it).

## Lessons learned
- Node 26's DecompressionStream rejects trailing junk in DOS-zip deflate
  streams; Chrome may too → the game carries a tolerant inflate, verified
  byte-perfect vs zlib in britanniacheck.
- 2011 PC Ultima IV `WORLD.MAP` layout decoded: 32x32 tile blocks,
  row-major blocks, 256x256 tiles, v0=ocean; bright 4-arm stars mark sites
  (gates/dungeons/shrines — not distinguishable by value yet, so M1 treats
  the 8 strongest inland stars as moongates).
- `gh pr merge` after `--delete-branch` tries to checkout `main` and dies if
  another worktree holds it — merge still lands; just re-detach (rule says).
