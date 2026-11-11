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
//
// #1966 THE PAY ECONOMY: the booth finally earns and spends. A correct
// stamp pays CFG.PAY (5); a wrong call forfeits that entrant's pay — the
// strike is not the only cost of a mistake. Every night settles: SOUP 3
// and HEAT 3, RENT 30 after night 3 and 45 after night 6 (rent rises, as
// the campaign's does). Rent unpaid is EVICTION — the original's rule kept
// exactly; two nights without soup or heat is the original's two-night
// death. Missed heads earn nothing, so the shift clock and the purse bite
// together: a dawdled day is unpaid labor toward a rising rent. Day 7 is
// survived only when its final slip pays out. settle() runs on BOTH
// day-ends (queue-drain and gate-close) so the two can never drift.

import { decide, MONFULL } from './rules.js'
import { genWeek, viewOf } from './gen.js'

export const CFG = {
    STRIKE_MAX: 3, DAYS: 7, SEAT_TICKS: 1080, MISS_DOCK: 5, SIM_HZ: 60,
    // #1966 THE PAY ECONOMY — the original's money: 5 a head (a write-up
    // pays nothing), soup and heat every night, rent every third night and
    // RISING (30, then 45 — the campaign's rent goes up; here the second
    // bill does). An unpaid rent is the original's rule kept exactly:
    // eviction ends the run. Two nights without soup (or heat) is the
    // original's two-night death.
    PAY: 5, SOUP: 3, HEAT: 3, RENTS: { 3: 30, 6: 45 },
}

// a day's clock, in sim ticks: the queue is the quota, the queue sizes the clock
export const dayTicks = (day) => day.queue.length * CFG.SEAT_TICKS

// rent nights: every third night, and it rises (see CFG.RENTS)
export const rentDue = (day) => CFG.RENTS[day] || 0

// #1891 THE NEW MONTH — the calendar the wall prints turns NOVEMBER on day 6
// (the week rolls OCT 27 → NOV 02, #1889), but until now the roll was silent:
// the morning banner spoke only the new rule. The original leans on morning
// paperwork for state-of-the-world moments, so the morning after a month seam
// announces the month. Pure over the week: the name of the new day's month
// when it differs from yesterday's, null otherwise. paperscheck pins that the
// roll fires exactly once per seed, on day 6, with NOVEMBER.
export const monthTurn = (week, day) => {
    if (day < 2 || day > CFG.DAYS) return null
    const a = week.days[day - 2].date, b = week.days[day - 1].date
    return a.m === b.m ? null : MONFULL[b.m - 1]
}

// the whole week's fixed charges — autopilot's balance arithmetic, pinned
// by paperscheck: income 70 entrants × PAY ends the week at 350 − 117 = 233
export const weekCharges = () => 7 * (CFG.SOUP + CFG.HEAT) + Object.values(CFG.RENTS).reduce((a, k) => a + k, 0)

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
        credits: 0,        // #1966 the purse: survives the week, not just the quota
        paidToday: 0,
        hungry: 0,
        cold: 0,
        slip: null,        // last deduction slip, kept through the morning
        slipTicks: 0,
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
    if (correct) { gs.score++; gs.credits += CFG.PAY; gs.paidToday += CFG.PAY; if (action === 'deny') gs.caught++; else gs.admitted++ } else gs.strikes++
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
            // the finale must survive its NIGHT too: the last deduction slip
            // pays out before glory. An unpaid bill on night 7 is still a loss.
            settle(gs)
            if (gs.end) return
            gs.end = 'win'
            gs.endWhy = 'THE WEEK SURVIVED'
            gs.events.push({ type: 'win', credits: gs.credits })
        } else {
            gs.events.push({ type: 'endday', day: gs.day, score: gs.score, missed: 0 })
            settle(gs)
            if (gs.end) return
            advance(gs)
        }
    }
}

// #1966 THE PAY ECONOMY — the night settles. Rent first (the original bills
// rent before soup and heat, and an unpaid rent is eviction — immediate, the
// week is over). Then soup, then heat: a night you cannot cover leaves the
// counter up; TWO nights in a row without either is the original's death.
// A covered night resets its own counter. The slip is the printed paper:
// pay earned, bills, balance. Events: pay / lose.
export function settle(gs) {
    const slip = { day: gs.day, pay: gs.paidToday, rent: 0, soup: 0, heat: 0, hungry: false, cold: false }
    const rent = rentDue(gs.day)
    if (rent) {
        if (gs.credits >= rent) {
            gs.credits -= rent
            slip.rent = rent
        } else {
            gs.slip = slip
            gs.slipTicks = 400
            gs.events.push({ type: 'pay', ...slip, balance: gs.credits, evicted: true })
            gs.end = 'lose'
            gs.endWhy = `RENT UNPAID — EVICTED (needed ${rent}, had ${gs.credits})`
            gs.events.push({ type: 'lose', why: gs.endWhy })
            return
        }
    }
    if (gs.credits >= CFG.SOUP) { gs.credits -= CFG.SOUP; slip.soup = CFG.SOUP; gs.hungry = 0 } else { gs.hungry++; slip.hungry = true }
    if (gs.credits >= CFG.HEAT) { gs.credits -= CFG.HEAT; slip.heat = CFG.HEAT; gs.cold = 0 } else { gs.cold++; slip.cold = true }
    slip.balance = gs.credits
    gs.slip = slip
    gs.slipTicks = 400
    gs.events.push({ type: 'pay', ...slip })
    if (gs.hungry >= 2) {
        gs.end = 'lose'
        gs.endWhy = 'NO SOUP TWO NIGHTS — STARVED'
        gs.events.push({ type: 'lose', why: gs.endWhy })
        return
    }
    if (gs.cold >= 2) {
        gs.end = 'lose'
        gs.endWhy = 'NO HEAT TWO NIGHTS — FROZEN'
        gs.events.push({ type: 'lose', why: gs.endWhy })
    }
}

// morning: the queue resets, the strikes reset, the clock is rewound to
// a fresh shift sized by tomorrow's line. Shared by queue-drain and gate-
// close so the two day-ends can never drift apart.
function advance(gs) {
    gs.day += 1
    gs.idx = 0
    gs.strikes = 0
    gs.paidToday = 0
    gs.clock = dayTicks(gs.week.days[gs.day - 1])
}

// the shift moves. n ticks of the fixed timestep pass; when the clock
// bottoms the gate closes on whoever is left in line. Days 1-6: turned
// away means a docked record (the original's quota miss costs pay, not
// your life — and via #1966, literally costs PAY: a turned-away head is
// an unpaid head). Day 7: the finale must finish — an unmet quota loses
// the week — and even a finished finale must survive its settlement.
// Events: close / pay / endday / lose.
export function tick(gs, n = 1) {
    if (gs.end) return
    if (gs.slipTicks > 0) { gs.slipTicks--; if (gs.slipTicks === 0) gs.slip = null }
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
    } else if (gs.day >= CFG.DAYS) {
        // the finale's clock ran out with the line already empty — the shift
        // is done; it still owes the night its bills (#1966: no glory over
        // an unpaid apartment)
        settle(gs)
        if (!gs.end) {
            gs.end = 'win'
            gs.endWhy = 'THE WEEK SURVIVED'
            gs.events.push({ type: 'win', credits: gs.credits })
        }
        return
    }
    gs.events.push({ type: 'endday', day: gs.day, score: gs.score, missed })
    settle(gs)
    if (gs.end) return
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
    const s = [gs.seed, gs.day, gs.idx, gs.strikes, gs.score, gs.caught, gs.admitted,
        gs.credits, gs.hungry, gs.cold, gs.end || '-',
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
