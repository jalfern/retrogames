// #2036 — tick-aware resume budgets for the watchcheck racers.
//
// The race resume gate demanded `> 500` track units inside a fixed REAL-time
// window. That quietly assumes the window held real-time WORLD time: 4000 ms
// at the 60 Hz fixed step is ~240 ticks, so the bar was really ~2.08 units
// per tick. CI's software-rendered Chrome catches fewer frames than the
// catch-up cap assumes, so a throttled night covered only ~376 units in the
// window and the gate called a healthy autopilot "no progress" — while the
// probes showed it had driven the whole time.
//
// The honest promise is pace, not windowed distance: decide() sustains
// several units per tick whenever it is seated (CFG.top is 8.6 u/tick; the
// slowest legal surface, sand, still carries 3.4). So scale the requirement
// by the measured tick delta between the two probes, never above the original
// 500-unit bar — a healthy box sees zero relaxation. The floor (40u) keeps
// a tiny window meaningful: a parked watcher (0 units) stays red at any size.
//
// BlobBattle's resume gate had the twin failure: a throttled ceiling window
// gave the prover time to WIN the match, and its predicate `!b.over` read a
// completed route as "no progress" (scores had moved 120 -> 240). The prover's
// promise is seat 1 stacking and scoring WITHOUT drowning it — a match the
// prover completed (winner !== 1) is the strongest possible advance; only
// seat 1 itself overflowing (winner === 1, drowned) invalidates the proof.

export const UNITS_PER_TICK = 500 / 240 // the old bar at 60 fps x 4000 ms ≈ 2.08
export const MIN_UNITS = 40

export const unitsNeed = (tickDelta) =>
    Math.min(500, Math.max(MIN_UNITS, Math.round(Math.max(0, tickDelta) * UNITS_PER_TICK)))

// Wrap-aware racer advance: a lap crossed or a race finished under watch is
// unconditional progress; otherwise the odometer delta must beat the
// tick-scaled bar (backward drift is impossible for decide(), never reverses).
export const racerAdvance = (x, y) => {
    if (y.lap > x.lap) return true
    if (y.done && !x.done) return true
    const n = (y.tick ?? 0) - (x.tick ?? 0)
    const units = (y.score - x.score + x.len) % x.len
    return units > unitsNeed(n)
}

// BlobBattle resume: seat 1 scored while watched, and the prover was not the
// one who drowned. winner is -1 mid-match, 0 when seat 1 took it, 1 when
// seat 1's well spilled — only the drown invalidates the route.
export const blobResume = (x, y) => y.scores[0] > x.scores[0] && y.winner !== 1
