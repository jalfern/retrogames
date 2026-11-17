# STATE — session 310 slot b close-out

## Shipped this session
- **#2520 → 6df49c1 (PR #2526)** HOMEBODY: the sneak in the night + burglar
  alarm — the day/night clause's first *night* citizen. Odd days (`day%2===1`)
  at 23:00 a sneak crosses at the gate (12,5), takes ONE loose ornament
  (plant/rug/lamp) at the door-step, leaves; midnight retires him; one visit
  a night stamped by day. Parity is arithmetic — no rng (source pin + twin
  green). Answer is purchasable: *Burglar Alarm* §90, SPECIAL shelf (card 19),
  `hasAlarm` turns him AT the gate post; `ringSneak` rig bypasses parity but
  never the alarm. Fedora sprite, domed-siren night halo, creep/siren/thunk
  SFX, banners name the loot, marquee teaches the law. peoplecheck
  **650 pass / 0 fail** (~30 new pins §SNEAK IN THE NIGHT). lint mario/fps/ai
  + build green.
  - **Design law banked:** the loot is decor, never cash. The attract bot wins
    day 2–3 with only ~§10 above the §300 room-kit price on every seed 1–12 —
    any cash take breaks `attract builds the wing…` on all of them. The sneak
    section contains no `s.money` (source-pinned). New economy features must be
    designed around the win margin, not tested into it.
- **#1711 machine-side CLOSED, released to `next`.** Nightly take-grading proven
  ARMED on CI: JON_KEY secret live (20:26Z), dispatch run 43968315875 green
  (DORMANT branch + `plaicraft:grade --nightly` "nothing new to grade"),
  gradeselftest 29/29, store re-audit: 14/14 takes PLAIGRADE-marked. Remaining
  acceptance line 3 needs one completed human clap take — the nightly grades it
  itself (cron 06:45 UTC). Evidence posted on the issue; no lane work left.

## Board
- Slot b took the never-dry rung after #1711 released: `weakestStage` =
  HOMEBODY (score 2). Its index-0 gap prose was stale (all sub-parts shipped
  #1817–#2235); real oldest unowned gap = the day/night tail → filed+claimed
  #2520 and shipped it. Rule-4 counter restored (game code this session).
- **#2516 (retrogames-rl 3c) deliberately NOT claimed**: its governance says
  predictions must be authored by Claude+Jon ("not a lane") and the training
  run exceeds a shift budget. Left for the right lane; rationale in session log.
- Slot A ran live all shift; Britannia/MissileBattle/SmashTV held by
  building-qa issues — untouched.
- **RED MAIN at close (watch live):** blocking = nightly.yml 43947467784
  (tip 7fa8438) failed `smash-tv resumes` — the seat-poll repair (#2524,
  closes #2523) squash-merged 23:33 and is IN the current tip. Nightly
  43983438362 on `6df49c1` in flight (23:55); a background watcher merges
  STATE PR #2527 when green, then detaches main. If it reds again: verify's
  failures were all pre-existing families (kingsquest/ultima DOS boot, kart
  smoke, minesweeper bot, robot-lab #1099 text-fit, demo-fox) — none touch
  Homebody; fix or quarantine per rule 5a naming open issues.

## Next queued
- Nothing invented. Known big-builds self-claim: HOMEBODY day/night tail
  continues (nothing else keeps hours after dark yet — the sneak was its first
  night citizen), Britannia enterable cottages (AVATAR.EXE terrain table).
- #1711 waits only on Jon's human clap take (nightly grades; no lane action).

## Open questions
- None filed this session (jonq not needed — the decor-loot change was a
  fidelity-preserving design fix, not a taste call).

## Catches for the next session (each cost probes this shift)
- **Homebody events ride `e.t`, not `e.type`** (index.jsx `switch (e.t)`).
  New event pushes must use `t:` or they silently vanish from the shell.
- **No pre-placed starter loot**: newRun lots have no placed decor at day 1,
  so an organic first-night sneak verdict is take-or-empty; pin shapes that
  accept `sneak-empty` and put the guaranteed take behind a rig placement.
- **Wages move money mid-run** — never assert "money unchanged across a long
  organic window"; pin the cash-free law in the source instead.
- `ringSneak` retires tonight's stamp (`sneakNight = min(night, day-1)`) so
  back-to-back rig rings work; the alarm still answers them.
- Backgrounded `npm run dev` in a lane worktree can be reaped by the harness
  (exit 143/1) — contractcheck was green-headed anyway; advisory.

## Lanes clean
- Main checkout detached at `6df49c1` (this session's merge). `main-ok` read
  `nightly cancelled` = not-red all shift.
- Worktree `~/Dev/retrogames-forge-plaicraft-s1-arm` → detached at
  origin/main, tree clean, real node_modules — reusable for the next Homebody
  stage. Branch `forge/homebody-night-sneak` deleted by the merge.
- Older worktree `~/Dev/retrogames-forge-plaicraft-sweep` still parked with
  real node_modules (keep for plaicraft stages).
- Slot b dev server (:5178) stopped at close.
- STATE.md left UNCOMMITTED per rule 9 and parked for slot b.
