// watchbudgetcheck — #2036: prove the tick-aware resume budgets in
// scripts/lib/watchbudget.mjs deterministically, no Chrome and no dev server.
// The nightly failures were timing-shaped (real progress below a fixed-unit
// bar on a tick-starved box), so a live rerun is exactly the unreliable proof.
// This pins BOTH sides of every rule: the nightly profiles pass, and the
// failures that must stay red stay red.
//
//   npm run watchbudgetcheck
import { Report } from './lib/harness.mjs'
import { unitsNeed, racerAdvance, blobResume } from './lib/watchbudget.mjs'

const LEN = 12371.71811496341 // Dry Lake's measured track length (watchcheck note, 2026-11)
const rep = new Report('watch resume budgets (#2036)')

// — the budget function itself
rep.check('budget: 240 ticks carries the original 500u bar untouched', unitsNeed(240) === 500)
rep.check('budget: above 240 ticks the bar never exceeds 500 (no relaxation on healthy boxes)',
    unitsNeed(600) === 500 && unitsNeed(10000) === 500)
rep.check('budget: throttled windows scale down proportionally (4000->125u at 60 ticks)',
    unitsNeed(120) === 250 && unitsNeed(60) === 125)
rep.check('budget: a tiny window still demands MIN_UNITS (never vacuous)',
    unitsNeed(0) === 40 && unitsNeed(-5) === 40)

// — the nightly signature (full-smoke run 43072838133): comet-drift-hd
//   covered 333 -> 709 = 376u at lap 0 on a tick-starved box.
rep.check('comet: nightly shape (376u at tick debt) passes',
    racerAdvance({ tick: 900, score: 333, len: LEN, lap: 0, done: false },
        { tick: 960, score: 709, len: LEN, lap: 0, done: false }))
rep.check('comet: frozen watcher at the SAME tick debt stays red',
    !racerAdvance({ tick: 900, score: 333, len: LEN, lap: 0, done: false },
        { tick: 960, score: 333, len: LEN, lap: 0, done: false }))
rep.check('comet: idle coast noise at a long window stays red (30u over 600 ticks)',
    !racerAdvance({ tick: 100, score: 500, len: LEN, lap: 0, done: false },
        { tick: 700, score: 530, len: LEN, lap: 0, done: false }))
rep.check('comet: healthy box still needs the full 500u bar',
    racerAdvance({ tick: 100, score: 4000, len: LEN, lap: 0, done: false },
        { tick: 340, score: 4501, len: LEN, lap: 0, done: false })
    && !racerAdvance({ tick: 100, score: 4000, len: LEN, lap: 0, done: false },
        { tick: 340, score: 4500, len: LEN, lap: 0, done: false }))
rep.check('comet: start/finish crossing reads as progress (wrap)',
    racerAdvance({ tick: 100, score: LEN - 60, len: LEN, lap: 2, done: false },
        { tick: 130, score: 40, len: LEN, lap: 3, done: false }))
rep.check('comet: finishing under watch counts even without distance',
    racerAdvance({ tick: 100, score: LEN - 10, len: LEN, lap: 4, done: false },
        { tick: 104, score: LEN, len: LEN, lap: 4, done: true }))
rep.check('comet: done-at-both-ends with no motion is red',
    !racerAdvance({ tick: 100, score: LEN, len: LEN, lap: 5, done: true },
        { tick: 160, score: LEN, len: LEN, lap: 5, done: true }))

// — blob-battle: the nightly shape was seat1 120 -> 240 with the match
//   completed under watch (winner 0); only seat1's own drown may invalidate.
rep.check('blob: nightly shape (score moved, match won under watch) passes',
    blobResume({ scores: [120, 90], winner: -1 }, { scores: [240, 90], winner: 0 }))
rep.check('blob: live progress mid-match passes',
    blobResume({ scores: [120, 90], winner: -1 }, { scores: [170, 95], winner: -1 }))
rep.check('blob: prover drowning seat 1 stays red even with score moved',
    !blobResume({ scores: [120, 90], winner: -1 }, { scores: [240, 90], winner: 1 }))
rep.check('blob: no score movement is red, won or not',
    !blobResume({ scores: [120, 90], winner: -1 }, { scores: [120, 90], winner: -1})
    && !blobResume({ scores: [120, 90], winner: -1 }, { scores: [120, 90], winner: 0 }))

rep.exit()
