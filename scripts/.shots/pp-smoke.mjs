import { genWeek, viewOf, CITY2C } from '../../src/games/PapersPleaseMin/gen.js'
import { decide, judge, dnum } from '../../src/games/PapersPleaseMin/rules.js'
import { newRun, step, autopilot } from '../../src/games/PapersPleaseMin/sim.js'
const naive = (v) => {
    const p = v.person, pp = p.passport
    if (!pp) return 'deny'
    const has = (r) => v.rules.includes(r)
    const bad = []
    if (has('ALLOWED') && (!v.allowed.includes(pp.country) || !v.allowed.includes(CITY2C[pp.city]))) bad.push('ALLOWED')
    if (has('EXPIRED') && dnum(pp.expiry) <= v.dateNum) bad.push('EXPIRED')
    if (has('WEIGHT') && (v.scale !== pp.weight || (p.idcard && p.idcard.weight !== v.scale))) bad.push('WEIGHT')
    if (has('WANTED') && v.wanted.some((w) => w.name === pp.name)) bad.push('WANTED')
    if (has('IDMATCH') && p.idcard && (p.idcard.name !== pp.name || p.idcard.height !== pp.height || dnum(p.idcard.dob) !== dnum(pp.dob))) bad.push('IDMATCH')
    if (has('IDREQ') && !p.papers.includes('idcard')) bad.push('IDREQ')
    return bad.length ? 'deny' : 'approve'
}
let unfair = 0, trapBad = 0, ruleMiss = 0, speciesCovered = new Set()
for (const seed of [0, 1, 2, 3, 4]) {
    const wk = genWeek(seed)
    for (const day of wk.days) {
        let traps = 0
        for (const a of day.queue) {
            const v = viewOf(day, a)
            const d = decide(v)
            const j = judge({ truth: a.truth, person: a.person, rules: day.rules, date: day.date, allowed: day.allowed, scale: a.scale })
            if (d.verdict !== j.verdict) { unfair++; console.log('UNFAIR', seed, day.n, a.breakRule, a.trap, d.verdict, j.verdict) }
            if (d.verdict === 'deny' && !d.violations.every((x) => x.evidence)) unfair++
            const flipped = naive(v) !== d.verdict
            if (flipped !== !!a.trap) { trapBad++; console.log('TRAPMISMATCH', seed, day.n, a.trap, naive(v), d.verdict) }
            if (a.trap) { traps++; speciesCovered.add(a.trap) }
            if (a.breakRule && d.verdict !== 'deny') { ruleMiss++; console.log('ACQUITTED', seed, day.n, a.breakRule) }
            if (a.breakRule && d.violations.length > 1) console.log('COMPOUND', seed, day.n, a.breakRule, d.violations.map((x) => x.rule))
            if (traps > 2) console.log('BUDGET', seed, day.n, traps)
        }
        for (const r of day.rules) if (!day.queue.some((x) => x.breakRule === r)) { ruleMiss++; console.log('UNEXERCISED', seed, day.n, r) }
        if (day.n >= 2 && !day.queue.some((x) => x.trap)) { ruleMiss++; console.log('NO TRAP', seed, day.n) }
    }
}
console.log('unfair', unfair, 'trapBad', trapBad, 'miss', ruleMiss, 'species', [...speciesCovered].sort().join(','))
const p = autopilot(newRun(0))
console.log('perfect:', p.ok, 'day', p.day, 'score', p.score, 'steps', p.script.length)
const chaos = newRun(0)
let t = 0, naiveStrikes = 0
while (!chaos.end && t < 500) {
    const { view } = { view: viewOf(chaos.week.days[chaos.day - 1], chaos.week.days[chaos.day - 1].queue[chaos.idx]) }
    const want = naive(view) === 'approve' ? 'deny' : 'approve'
    const before = chaos.strikes
    step(chaos, { action: want })
    if (chaos.strikes > before) naiveStrikes++
    t++
}
console.log('chaos end:', chaos.end, chaos.endWhy)
const clumsy = newRun(0)
t = 0
while (!clumsy.end && t < 500) {
    const { view } = { view: viewOf(clumsy.week.days[clumsy.day - 1], clumsy.week.days[clumsy.day - 1].queue[clumsy.idx]) }
    step(clumsy, { action: naive(view) })
    t++
}
console.log('clumsy end:', clumsy.end, clumsy.endWhy || 'won', 'day', clumsy.day)
