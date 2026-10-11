// PAPERS, PLEASE-MIN — the sim. Pure (state, input), zero Math.random,
// zero clocks: the fixed timestep lives in the shell. One input = one
// stamped document. The engine's verdict is decide(view) — what the BOOTH
// can prove — never the hidden truth: a wrong call costs a strike, three
// strikes end the day, seven clean-ish days win the week.

import { decide } from './rules.js'
import { genWeek, viewOf } from './gen.js'

export const CFG = { STRIKE_MAX: 3, DAYS: 7 }

export function newRun(seed = 0) {
    return {
        seed,
        week: genWeek(seed),
        day: 1,
        idx: 0,
        strikes: 0,
        score: 0,
        caught: 0,
        admitted: 0,
        end: null,
        endWhy: '',
        last: null,
        events: [],
    }
}

export function current(gs) {
    const day = gs.week.days[gs.day - 1]
    return { day, applicant: day.queue[gs.idx], view: viewOf(day, day.queue[gs.idx]) }
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
            gs.events.push({ type: 'endday', day: gs.day, score: gs.score })
            gs.day += 1
            gs.idx = 0
            gs.strikes = 0
        }
    }
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
