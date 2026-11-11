// PAPERS, PLEASE-MIN — the sim. Pure (state, input), zero Math.random,
// zero clocks: the fixed timestep lives in the shell. One input = one
// stamped document. The engine's verdict is decide(view) — what the BOOTH
// can prove — never the hidden truth: a wrong call costs a strike, three
// strikes end the day, seven clean-ish days win the week.
//
// #1960 THE SHIFT CLOCK: the booth now has a time. Each day's budget is
// sized by its queue — entrants × SEAT_TICKS — so the finale's 13-deep
// line is the tightest clock of the week, exactly the way the original's
// long late-week queues make closing time real. The shell feeds tick() at
// the fixed timestep; when the clock bottoms the gate CLOSES: whoever is
// still in line is turned away, the record docks, and on day 7 an unmet
// quota loses the week. SEAT_TICKS (18 s/applicant) is deliberately >
// the autopilot's longest scripted wait (124 ticks): scripted play —
// attract, WATCH, the harness — can never be caught by the gate, only
// a human dawdling past eighteen seconds per entrant. paperscheck pins
// that inequality plus the cadence margin and makes closing provable.

import { decide } from './rules.js'
import { genWeek, viewOf } from './gen.js'

export const CFG = { STRIKE_MAX: 3, DAYS: 7, SEAT_TICKS: 1080, MISS_DOCK: 5, SIM_HZ: 60 }

// a day's clock, in sim ticks: the queue is the quota, the queue sizes the clock
export const dayTicks = (day) => day.queue.length * CFG.SEAT_TICKS

export function newRun(seed = 0) {
    const week = genWeek(seed)
    return {
        seed,
        week,
        day: 1,
        idx: 0,
        strikes: 0,
        score: 0,
        caught: 0,
        admitted: 0,
        clock: dayTicks(week.days[0]),
        end: null,
        endWhy: '',
        last: null,
        events: [],
    }
}

// current must survive the end of the line: after a win/lose the queue is
// finished, but the frame loop still paints the frozen booth behind the
// end screen — clamping is what stops the last entrant's card from
// becoming undefined and crashing the canvas one frame after victory.
export function current(gs) {
    const day = gs.week.days[gs.day - 1]
    const a = day.queue[Math.min(gs.idx, day.queue.length - 1)]
    return { day, applicant: a, view: viewOf(day, a) }
}

// input: {action:'approve'|'deny'} — anything else is a no-op (the booth
// waits while you read). Events: stamp / endday / lose / win.
export function step(gs, inp) {
    if (gs.end) return
    const action = inp && inp.action
    if (action !== 'approve' && action !== 'deny') return
    const day = gs.week.days[gs.day - 1]
    if (gs.idx >= day.queue.length) return
    const a = day.queue[gs.idx]
    const d = decide(viewOf(day, a))
    const correct = action === d.verdict
    const why = correct
        ? (d.verdict === 'deny' ? d.violations[0].rule : null)
        : (d.verdict === 'deny' ? d.violations[0].rule : 'INNOCENT')
    if (correct) { gs.score++; if (action === 'deny') gs.caught++; else gs.admitted++ } else gs.strikes++
    gs.last = {
        ok: correct, action, verdict: d.verdict, why,
        name: a.person.passport ? a.person.passport.name : 'NO PAPERS',
        evidence: d.violations.length ? d.violations.map((x) => x.evidence).join('; ') : 'ALL PAPERS IN ORDER',
    }
    gs.events.push({ type: 'stamp', ...gs.last })
    gs.idx++
    if (gs.strikes >= CFG.STRIKE_MAX) {
        gs.end = 'lose'
        gs.endWhy = `DAY ${gs.day}: THREE MISTAKES`
        gs.events.push({ type: 'lose', why: gs.endWhy })
        return
    }
    if (gs.idx >= day.queue.length) {
        if (gs.day >= CFG.DAYS) {
            gs.end = 'win'
            gs.endWhy = 'THE WEEK SURVIVED'
            gs.events.push({ type: 'win' })
        } else {
            gs.events.push({ type: 'endday', day: gs.day, score: gs.score, missed: 0 })
            advance(gs)
        }
    }
}

// morning: the queue resets, the strikes reset, the clock is rewound to
// a fresh shift sized by tomorrow's line. Shared by queue-drain and gate-
// close so the two day-ends can never drift apart.
function advance(gs) {
    gs.day += 1
    gs.idx = 0
    gs.strikes = 0
    gs.clock = dayTicks(gs.week.days[gs.day - 1])
}

// the shift moves. n ticks of the fixed timestep pass; when the clock
// bottoms the gate closes on whoever is left in line. Days 1-6: turned
// away means a docked record (the original's quota miss costs pay, not
// your life). Day 7: the finale must finish — an unmet quota loses the
// week. Events: close / endday / lose.
export function tick(gs, n = 1) {
    if (gs.end) return
    gs.clock -= n
    if (gs.clock > 0) return
    const day = gs.week.days[gs.day - 1]
    const missed = day.queue.length - gs.idx
    gs.clock = 0
    gs.events.push({ type: 'close', day: gs.day, missed, score: gs.score })
    if (missed > 0) {
        gs.score = Math.max(0, gs.score - CFG.MISS_DOCK * missed)
        if (gs.day >= CFG.DAYS) {
            gs.end = 'lose'
            gs.endWhy = `GATE CLOSED — ${missed} STILL IN LINE, QUOTA UNMET`
            gs.events.push({ type: 'lose', why: gs.endWhy })
            return
        }
    }
    gs.events.push({ type: 'endday', day: gs.day, score: gs.score, missed })
    advance(gs)
}

// the wall clock: the day's budget maps onto the printed shift 08:00→18:00.
// red = the last printed hour, when the hands and the ticks turn urgent.
export function gameClock(gs) {
    const day = gs.week.days[gs.day - 1]
    const budget = dayTicks(day)
    const frac = Math.max(0, Math.min(1, gs.clock / budget))
    const elapsed = Math.round((1 - frac) * 600)
    const hh = 8 + Math.floor(elapsed / 60)
    return { hh, mm: elapsed % 60, frac, red: frac <= 0.1, budget }
}

export function stateHash(gs) {
    const s = [gs.seed, gs.day, gs.idx, gs.strikes, gs.score, gs.caught, gs.admitted, gs.end || '-',
        gs.last ? `${gs.last.action}${gs.last.ok ? 1 : 0}` : '-'].join('|')
    let h = 2166136261
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
    return h >>> 0
}

// the autopilot: the perfect inspector, applicant by applicant. Its proven
// run IS the attract demo — the harness replays the same script.
export function autopilot(gs, maxSteps = 400) {
    const script = []
    let guard = 0
    while (!gs.end && guard++ < maxSteps) {
        const { view } = current(gs)
        const action = decide(view).verdict
        script.push({ action, wait: 84 + (viewOf(gs.week.days[gs.day - 1], gs.week.days[gs.day - 1].queue[gs.idx]).person.pic % 40) })
        step(gs, { action })
    }
    return { ok: gs.end === 'win', script, end: gs.end, why: gs.endWhy, score: gs.score, day: gs.day }
}
