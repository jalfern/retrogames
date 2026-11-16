# STATE — session 307 slot b close-out

## Shipped this session
- **#2493 → 9e7a4e7** PLAICRAFT clap: `--micdelay`/`--lag-min` + achieved-lag report.
  The audited lag shape (slow CPU + late mic, −3.4 s worst case) is now provable, gated
  (can-fail red at −1 s) and mutant-proof. #1711 released to `next` — human-side
  remainder only (Jon's takes + JON_KEY Actions secret).
- **#2494 → PR #2497 → 3a7edb1** BRITANNIA village: the cottages have substance.
  36 seeded cottages across all 8 gate-towns (`village.js`), timber-barred walk refusal
  with the named first knock, draw==block, gate reachability preserved (BFS descent).
  `britanniacheck` 374 green (+11 pins, 2 new mutants red); new `cottage-drive` 6/6
  incl. panel/node byte-parity and a deterministic named knock (gate 93,67 → 93,69).
  Verified live on www (village marker in the prod Britannia chunk).

## Board
- Slot a in flight: **#2492 SMASH TV no spawn mercy** (worktree
  `~/Dev/retrogames-forge-smashtv-no-mercy`) — folded from its parked report, never
  touched by this lane.
- Filed **#2499** `QA — BRITANNIA: polish pass` (feedback): door glyphs, chimney smoke
  + night lamps, per-gate town names, stone footstep voice, roof silhouettes.
- #1711 stays open, label `next` (humans only).

## Next queued (step-2 ladder, recompute at run start)
- Britannia's honest gap 1 is **enterable cottages**: the `.ULT` town boards are 40×32
  (1280 B probed) and terrain IDs need AVATAR.EXE's table — probe the EXE before
  promising doors that open.

## Open questions
- jonq **#2487** AWAITING — JON_KEY Actions secret; deadline 2026-11-18; default B
  (stays dormant).

## Catches for the next session (each cost probes this shift)
- `Report.check(label, pass, detail)` — label FIRST; a swapped call passes vacuously.
- Britannia's gate wheel is a **3×3 zone** (`index.jsx` finds gi within a tile): after a
  teleport the first step re-whirls the menu, the menu branch freezes cd and eats
  arrows, and Z only sets `dismissed` while the menu is open → dismiss mid-hold.
- Prod verify: `jalfern.com` 301s to **www.jalfern.com** (curl -L); Britannia code ships
  in a lazy route chunk, not the entry — wait for the entry hash to change, then grep
  the chunks the new entry imports for the marker string. A negative sweep during the
  alias switch can be CDN flakiness — this session's automated sweep timed out on 51
  chunks, then the named route chunk served the marker on the first manual try.
- shiftreport.mjs silently swallows a bad notes JSON (`catch { notes = null }`) and
  pushes CARRIED-OVER notes instead — always check the echoed headline matches yours.
- mutateguard refuses dirty trees — commit before any `--mutate` run.
- Town skirt subtlety: score-edge tiles read ts ≈ 0.4; village law demands ts ≥ 0.5.
- Nightly cron `15 6 * * *` — tonight is the FIRST scheduled `gradeselftest` CI run.
  If red: #2176 rule — fix within 2 h or quarantine in `scripts/quarantine.json`
  naming an open issue.

## Lanes clean
- Main checkout detached at `origin/main`; slot b dev server (:5178) stopped.
- Worktree `~/Dev/retrogames-forge-britannia-village` kept (node_modules donor for
  the next Britannia stage).
