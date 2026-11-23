# STATE — forge board snapshot (slot a, 2026-11-23 — shipped)

## This session shipped
- **#3035 CONTRA somersault jump → PR #3036 → main `8241aab`, prod-verified.**
  The cabinet's full-turn jump: `rollT` per seat (arms on jump event, one
  37-tick revolution completes as the feet land, ground clears, vine-catch
  zeroes; step-off and drop-through never arm); `drawPlayer` turns the body
  ~2π at the body-centre pivot, flipped by facing, **gun arm draws outside
  the rotation at the live 8-way aim** (sprite keeps matching logical state).
  Referee untouched: rollT never enters `stateHash`, zero `gs.r` — states
  differing only in rollT hash identically, all stored pins/streams stood.
  Proven: contracheck 269 legs (+6 sim pins, +live pixel leg: bandana red
  crosses the feet line mid-arc on both arm-states; AIM-UP hops carry
  cold-dark barrel ink over the pivot, flat hops don't), mutants **stiff-hop**
  & **roll-on-step** die by name (mutant run 189/189), 3 scoped lints + build.
- Never-dry walk (#1571/#1615): kick said CONTRA -1 weak, live idle-kick
  confirmed (score from feedback #2971 naming Contra; README gaps CLOSED),
  so the gap was scoped live from the cabinet. #3031 (slot a seed) found
  ALREADY BUILT by slot b live at claim time — closed as duplicate of #3032
  before it could invite a third lane; slot b shipped press-feel (#3034).

## PLAYABLE on main right now
- `/retrogames/contra` (+ somersault #3035, voice #3000, radio teach #3016),
  `/retrogames/minesweeper` (+ press-feel #3032, hall of fame #3026),
  `/retrogames/double-dragon`, `/retrogames/floor-boss`, `/retrogames/fire-crew`,
  `/retrogames/r-type`.

## Board at close
- `game-queue`/`steer`/`next`/`building`/`building-qa`: all EMPTY. `feedback`:
  only #2971 (waiting-jon — its last item needs a real phone take). No jonq
  open, no halt.
- Worth Jon's eye (unlabeled, so no lane may claim): **#3014 STAGE — CONTRA:
  attract teaches the voice orders** sits open `lane:games` with no ladder
  label — a label would put a real stage on next week's board.
- #3030 (forge-merge second shape) bit again this session and the law held:
  merge printed the gh read-fail but the PR state was MERGED (rule 5 exit
  criterion from the PR's state, not the wrapper's stdout); cleanup completed
  by hand — remote branch gone, lane re-detached, no `[main]` squat.

## Harness notes (carry-overs + new)
- **Headless paint here runs ~12 fps**, so a 37-tick jump yields ~8 canvas
  samples: single-hop pixel assertions are dicey. Sample 4 hops; inversion =
  ANY frame; arm law = MEAN per-frame difference between same-seed arm-states
  (constant occupants cancel). Jungle dark greens answer naive dark predicates
  — steel must be COLD (b > r+6 && b > g+4). ArrowUp alone aims ax=0
  (straight up) — the barrel stub sits over centre, not to the right.
- `#2885` vine browser legs are in the documented advisory load-flake family
  (#3008 residue, #3027 sibling): one leg flaked per run across five local
  runs, rotating which one, always upstream of the diff. Rerun-once law,
  reported in the PR, never papered.
- Prod-verify needs `curl -L` (308 on moved hashes); this deploy was hot on
  the first poll.

## Slots / ops
- Slot a port 5173: dev server stopped via `scripts/devstop.sh` at close ✓.
  Plumbing `~/Dev/retrogames` detached at origin/main ✓. Lane worktree
  `retrogames-forge-contra-somersault` detached at origin/main (clean);
  purge cleaner may reap it. node_modules was symlinked from plumbing — the
  purge must take the symlink before the dir (or leave both).
- STATE.md committed to main this session (#3036 merged game code).

## Open questions
- None (dry-shelf flagship question already on the record this week — see
  https://jalfern.com/retrogames/forge for the live board).
