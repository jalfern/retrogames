# STATE — Forge (last: session 265, slot b, 2026-11-14)

## SHIPPED THIS SESSION
- **HOMEBODY KIDS #2203** — merged **#2207** → `cf4b82d`, prod-verified
  (`www.jalfern.com/retrogames`, chunk `index-D2gP6X5X.js` carries `kidkit`).
  Pip the adoptable child: card 16 / `KeyK`, §150, one per lot, honest refusal at the gate.
  Kid needs (hunger/fun/energy/social); self-served snack (fridge/stove), self-found play
  (nearest `need:'fun'` item), night fold-up + dawn wake, never faints, never blocks.
  **Tumble law**: idle resident ≤1 tile → kid fun +0.3, resident social +0.12, rel.kid +0.5,
  content +1, 6 s cooldown. **Cry law**: fun ≤ RED_AT wails every 4 s, stings residents ≤3
  tiles −0.10 social. Court reaches kid (coo cheers +fun, insult stings, no house grudge).
  rel.kid fades via relSub; `s.kid` rides stateHash; seeds seed-exact. Sprite + sound:
  scamper/daypack/Zzz/tears/giggle-stars; move-in triad, giggle arpeggio, wail sweeps.
  BONDS star row **PIP**. `peoplecheck` **283/0** (section 9 = 31 gates); mutant-proven
  (`KID_CRY_STING=0` → exactly the sting gate red, restored). 9/9 seeds still win with
  kidkit behind petkit in the bot wall; wish lands with a child on the lot.
- **RED MAIN fixed (#2176)** — nightly 43568372143 (291988a) died on `dvhcheck`:
  `public/demos/horse{,-gemini}.html` sized the canvas `100vh` with no `100dvh` sibling.
  One line each (`height:100vh; height:100dvh;`) → merged **#2208**, dvhcheck 7/7.
  Dispatched nightly 43576364789 on main: **success** (full-static + full-smoke) —
  freeze lifted, #2207 merged behind it.

## LESSONS (the expensive kind)
- **`drain()` consumes.** `cries += drain(s)…; tumbles += drain(s)…` — the second drain
  sees nothing, tumbles silently 0. One drain per tick, filter the array twice.
- **The bot's `money > 300` wall serializes purchases** (one buy per payday crossing).
  Hoisting kid/pet cards above it destabilized the win economy four ways; *inside* the
  wall, right after petkit, keeps 9/9 wins. Don't hoist again without re-proving wins.
- **Nightly-only gates catch demo CSS** — dvhcheck runs only in nightly, so a PR can land
  a shell violation; when main goes red, read `--log-failed` for the `NIGHTLY RED (n)` line.
- **`court(s, kind)` auto-targets** (courtTarget picks nearest in reach) — tests must park
  rivals out (faintT) instead of passing coordinates.
- Two autonomy fixes the cry law forced, both narrow: urgency order serves the lowest need
  that HAS a target; demo chat-plans abandon at physical red. Broad walk-abandon regressed
  4 seeds — keep the shape specific.

## BOARD
- **#1711** stays `building` (slot a — S1 remaining: Jon's 3 phone takes incl. one slap
  test, + **#2157** lanes-grade-takes, the last builder line; deploy ORDER in
  relay/README: SESSION_WRITE_KEY secret AFTER the #2093 relabel one-off, BEFORE
  distributing JON_KEY; reads are locked on prod already). **#2156** stays open for the
  live phone numbers; **#2205** (clap QA polish) filed.
- **#2203** closed by #2207 (prod-verified). Homebody QA polish pass: **#2209** (feedback).
- Nightly: 43576364789 **success** on main (full-static + full-smoke). No quarantine
  entries. No steer/halt on any board.

## NEXT (next slot)
1. **#2157** (lane:platform, unclaimed): JON_KEY from gitignored `.env.local`, evidence
   download retry+backoff, verdict posted on #1711 per new take (exact command in the
   issue). The #2188 audit fix is already merged — safe to build.
2. When Jon's phone takes appear: `plaicraft:evidence`/`plaicraft:clap --key=` numbers
   onto #1711 (then #2156 can close).
3. Homebody tail for a future polish lane (only if the ladder is empty — QA owns #2200/#2209):
   attract marquee line + demo moment showing Pip arriving (README honest gap); panel pet
   row belongs to #2200 (QA lane), not a builder lane.
4. `claptestplay`/`plaicraft:clap` need a dev server on DEV_PORT (slot port) — keep lane-run.

## QUESTIONS FOR JON
- none open from this lane (see issue board).

## HOUSEKEEPING
- Slot b worktrees `~/Dev/retrogames-forge-homebody-kids` (#2207) and
  `~/Dev/retrogames-fix-dvh` (#2208): branches merged, worktrees kept for the record —
  remove when idle. Never let a worktree hold `[main]`; main checkout `~/Dev/retrogames`
  stays detached: `git fetch && git checkout --detach origin/main`.
- STATE committed to main legitimately (this session's #2207 merged) + parked to the
  slot-b path. Slot-a vite port convention: own slot port only (b used :5178).
