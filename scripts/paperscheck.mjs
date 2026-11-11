// PAPERS, PLEASE-MIN — the Node gate. No browser, no dev server.
//
//   npm run paperscheck              # fairness prover + contract + proven runs
//   npm run paperscheck -- --mutate  # re-break the load-bearing rules
//
// THE PROVER is this game's reason to exist (#76): every generated
// applicant is graded TWICE — decide() sees only the booth view (what the
// canvas paints), judge() sees the generator's hidden truth — and they
// must never disagree. A deny without a visible witness, a criminal the
// wanted sheet forgot, a scale that lies about an innocent: all red here,
// on every seed, before a browser exists.
//
// Sections: Math.random banned · THE FAIRNESS PROVER (verdict twin +
// witness map) · TRAP CONTRACT (a naive eye misjudges EXACTLY the planted
// traps, budget <= 2/day, >= 1 from day 2, every species per week) ·
// rulebook (every rule exercises the day it wakes; no law before its day) ·
// calendar (one clock: serials match the wall everywhere; the week rolls
// across a real month-end #1889) · clumsy play clears the week AND chaos
// loses by day 1 (the slack rule, in booth terms) · the shift clock (#1960:
// budget = queue × SEAT, human cadence clears, dawdling closes the gate,
// the finale must finish) · the proven weeks
// (attract replays these) · determinism · mutants.

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { RULES, DAY_RULES, decide, judge, dnum, dadd, dfmt, FEATURES } from '../src/games/PapersPleaseMin/rules.js'
import { genWeek, genDay, viewOf, CITY2C, TRAPS, GREY } from '../src/games/PapersPleaseMin/gen.js'
import { CFG, newRun, step, tick, stateHash, current, autopilot, dayTicks, gameClock } from '../src/games/PapersPleaseMin/sim.js'
import { CW, CHS, STRIP_H, WALL, CHAR, SCALE, PORTRAIT, PAPERS, CLOCK, wallFit, ruleLines } from '../src/games/PapersPleaseMin/layout.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, '../src/games/PapersPleaseMin')
const MUT = process.argv.includes('--mutate')

let pass = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else fails.push(m) }
const section = (s) => console.log(`\x1b[1m${s}\x1b[0m`)

const SEEDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

// A careless eye: applies today's rules like a nervous rookie — expires
// TODAY looks expired, a matching NAME is enough for the sheet, ANY id
// field mismatch convicts, a child without ID is "an adult without ID",
// the city tells the country, the ID card weighs more than the passport.
// This is the harness's own model — the game must never own it.
function naiveDecide(v) {
    const p = v.person, pp = p.passport
    if (!pp) return 'deny'
    const has = (r) => v.rules.includes(r)
    if (has('ALLOWED') && (!v.allowed.includes(pp.country) || !v.allowed.includes(CITY2C[pp.city]))) return 'deny'
    if (has('EXPIRED') && dnum(pp.expiry) <= v.dateNum) return 'deny'
    if (has('WEIGHT') && (v.scale !== pp.weight || (p.idcard && p.idcard.weight !== v.scale))) return 'deny'
    if (has('WANTED') && v.wanted.some((w) => w.name === pp.name)) return 'deny'
    if (has('IDMATCH') && p.idcard && (p.idcard.name !== pp.name || p.idcard.height !== pp.height || dnum(p.idcard.dob) !== dnum(pp.dob))) return 'deny'
    if (has('IDREQ') && !p.papers.includes('idcard')) return 'deny'
    if (has('CURFEW') && dnum(pp.expiry) - v.dateNum <= 7) return 'deny'   // counts today among the grace days
    // #1938 PORTRAIT temptation: the rookie compares the photos LIKE THE
    // PORTRAIT RULE — except the rookie lets color convict too. Grey hair
    // (the aged-photo trap) bites; and every structural break bites as it
    // should, so a break is never miscounted as a trap.
    if (has('PORTRAIT') && p.face && pp.photo) {
        for (const k of Object.keys(p.face)) if (p.face[k] !== pp.photo[k]) return 'deny'
    }
    return 'approve'
}

// ------------------------------------------------------------ math banned ----
section('MATH.RANDOM IS A BOOTH CRIME')
for (const f of ['rules.js', 'gen.js', 'sim.js']) {
    const raw = readFileSync(join(SRC, f), 'utf8')
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    ok(!/Math\s*\.\s*random/.test(src), `${f} contains Math.random — the border may never gamble`)
}
{
    const real = Math.random
    Math.random = () => { throw new Error('Math.random called — the week is SEEDED') }
    let froze = false
    try { autopilot(newRun(3)); froze = true } catch (e) { fails.push(`frozen random hit: ${e.message}`) }
    Math.random = real
    ok(froze, 'a full perfect week runs with Math.random THROWN at the call site')
}

// ------------------------------------------------------- the fairness prover ----
section('THE FAIRNESS PROVER — booth vs truth, every paper, every seed')
{
    let papers = 0, denied = 0, witnessed = 0
    for (const seed of SEEDS) {
        const wk = genWeek(seed)
        for (const day of wk.days) {
            for (const a of day.queue) {
                papers++
                const v = viewOf(day, a)
                const d = decide(v)
                const j = judge({ truth: a.truth, person: a.person, rules: day.rules, date: day.date, allowed: day.allowed, scale: a.scale })
                ok(d.verdict === j.verdict,
                    `UNFAIR PAPER seed ${seed} day ${day.n} ${a.person.passport ? a.person.passport.name : 'no-papers'} ` +
                    `(${a.breakRule || a.trap || 'clean'}): booth says ${d.verdict}, truth says ${j.verdict}`)
                if (d.verdict === 'deny') {
                    denied++
                    ok(d.violations.length > 0, `a deny with no violation at seed ${seed} day ${day.n}`)
                    for (const viol of d.violations) {
                        ok(day.rules.includes(viol.rule), `rule ${viol.rule} judged someone before it woke (seed ${seed} day ${day.n})`)
                        ok(typeof viol.evidence === 'string' && viol.evidence.length > 3, `deny without a printed witness: ${viol.rule} seed ${seed} d${day.n}`)
                        // the witness MAP: for the rules with a hidden truth,
                        // the printed witness must read the truth, not the lie
                        if (viol.rule === 'WEIGHT' || a.breakRule === 'WEIGHT') {
                            ok(typeof v.scale === 'number' && v.scale === a.truth.trueWeight,
                                `the SCALE lies about the truth at seed ${seed} day ${day.n} (scale ${v.scale}, truth ${a.truth.trueWeight})`)
                            witnessed++
                        }
                    }
                } else {
                    ok(d.violations.length === 0, 'an approve carries violations')
                }
                // witness coverage from the TRUTH side
                if (day.rules.includes('WANTED')) {
                    const sheetHasPair = day.wanted.some((w) => w.name === (a.person.passport && a.person.passport.name) && w.id === (a.person.passport && a.person.passport.id))
                    ok(a.truth.wanted === sheetHasPair,
                        `wanted-ness and the sheet disagree at seed ${seed} day ${day.n} — a ${a.truth.wanted ? 'criminal' : 'an innocent'} the wall cannot see`)
                }
                if (day.rules.includes('WEIGHT')) {
                    ok(typeof a.scale === 'number' && a.scale === a.truth.trueWeight, `the scale skipped its witness duty at seed ${seed} day ${day.n}`)
                }
                // the wall has no scroll: every name on the sheet must fit
                // the booth's printed panel (index.jsx prints every entry).
                // Five is the original bulletin's capacity (#1902) — the fit
                // sweep below proves the fifth row lands above the scale box.
                ok(day.wanted.length <= 5, `day ${day.n} printed ${day.wanted.length} wanted names — the wall would have to hide one (unfair by furniture)`)
            }
        }
    }
    console.log(`  ..    ${papers} papers graded twice, ${denied} denied — every deny carried a witness, ${witnessed} scales read the truth`)
}

// ------------------------------------------------------------ trap contract ----
section('TRAP CONTRACT — a naive eye misjudges EXACTLY the planted traps')
{
    let flipped = 0, planted = 0
    const seenSpecies = new Set()
    for (const seed of SEEDS) {
        const wk = genWeek(seed)
        for (const day of wk.days) {
            let traps = 0
            for (const a of day.queue) {
                const v = viewOf(day, a)
                const isFlip = naiveDecide(v) !== decide(v).verdict
                if (isFlip) flipped++
                if (a.trap) { traps++; planted++; seenSpecies.add(a.trap) }
                ok(isFlip === !!a.trap,
                    `seed ${seed} day ${day.n}: ${a.trap ? 'a planted trap the naive eye misses' : 'an innocent nobody planted as a trap'} (${naiveDecide(v)} vs ${decide(v).verdict}) — the trap budget cannot be honest`)
                if (isFlip && a.trap) ok(TRAPS.find((t) => t.rule === a.trap) != null, 'trap without a species')
            }
            ok(traps <= 2, `seed ${seed} day ${day.n}: ${traps} traps in one day — clumsy play cannot clear it (the slack rule)`)
            ok(day.n < 2 || traps >= 1, `seed ${seed} day ${day.n}: no trap at all — a rule day that never tests the eye`)
        }
    }
    ok(seenSpecies.size === TRAPS.length, `a week surfaces ${seenSpecies.size} of ${TRAPS.length} trap species (${[...seenSpecies].join(', ')}) — coverage is a construction, not a hope`)
    console.log(`  ..    ${planted} planted traps == ${flipped} naive misjudges, all ${TRAPS.length} species covered, budget held at <=2/day`)
}

// ---------------------------------------------------------------- rulebook ----
section('THE RULEBOOK WAKES IN ORDER AND EXERCISES ITSELF')
for (let d = 1; d <= 7; d++) {
    ok(d === 1 || DAY_RULES[d - 1].length === DAY_RULES[d - 2].length + 1, `day ${d} did not add exactly one rule`)
    ok(DAY_RULES[d - 2] === undefined || DAY_RULES[d - 2].every((r) => DAY_RULES[d - 1].includes(r)), 'a rule went to sleep — the law does not unmake itself')
}
{
    let fired = 0
    for (const seed of SEEDS) {
        for (const day of genWeek(seed).days) {
            for (const r of day.rules) {
                const hits = day.queue.filter((a) => decide(viewOf(day, a)).violations.some((x) => x.rule === r))
                const built = day.queue.some((a) => a.breakRule === r)
                ok(built, `seed ${seed} day ${day.n}: rule ${r} never had its test paper`)
                ok(hits.length >= 1, `seed ${seed} day ${day.n}: ${r} was printed but never fired — a dead rule`)
                fired++
            }
        }
    }
    console.log(`  ..    ${fired} rule-days: every law convicted its own test paper the day it woke`)
}

// ---------------------------------------------------------------- calendar ----
section('THE CALENDAR IS ONE CLOCK (#1889) — serials match the wall, the week rolls')
{
    const MD = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    // identity law: advancing the wall n days advances the serial by EXACTLY
    // n, for every date the sim can print and every span the generator draws.
    // Uniform-31 serials broke this at every short-month seam — and that drift
    // is how a CURFEW paper with 6 real days of grace read as a legal 7.
    // (This Arstotzka has no leap days: dadd never emits Feb 29, so 365-day
    // years and MDAYS agree for all constructible dates — exact by law here.)
    let drift = 0
    for (let m = 1; m <= 12; m++) for (let d = 1; d <= MD[m - 1]; d++) {
        const x = { y: 1982, m, d }
        for (const n of [1, 6, 7, 40, 400, -1, -6, -7, -40, -400]) if (dnum(dadd(x, n)) - dnum(x) !== n) drift++
    }
    ok(drift === 0, `the serial drifts from the calendar on ${drift} date/spans — dnum and dadd are two clocks again`)
    // and dadd must never print a day the calendar does not have — the rolled
    // week found dadd's missing BACKWARD carry shipping NOV 00 at the window.
    let fakeDay = 0
    for (let m = 1; m <= 12; m++) for (let d = 1; d <= MD[m - 1]; d++) {
        const x = { y: 1982, m, d }
        for (const n of [-1, -31, -60, -365]) {
            const r = dadd(x, n)
            if (r.d < 1 || r.d > MD[r.m - 1] || r.m < 1 || r.m > 12) fakeDay++
        }
    }
    ok(fakeDay === 0, `dadd printed ${fakeDay} impossible calendar days going backward`)

    // the week crosses a REAL month-end: OCT 27…31, NOV 01–02. The date
    // arithmetic the border guard does every shift in the original.
    for (const seed of SEEDS) {
        const seq = genWeek(seed).days.map((dd) => `${dd.date.y}.${dd.date.m}.${dd.date.d}`)
        ok(seq.join(',') === '1982.10.27,1982.10.28,1982.10.29,1982.10.30,1982.10.31,1982.11.1,1982.11.2',
            `seed ${seed}: the week does not roll OCT 27 → NOV 02 (${seq[0]}…${seq[6]})`)
    }
    console.log('  ..    identity law on 365 day-dates × 10 spans (both directions); every seed\'s week rolls OCT→NOV')

    // day 6 prints the week's first cross-month verdict, with its witness.
    for (const seed of SEEDS) {
        const day = genWeek(seed).days[5]
        ok(day.date.m === 11 && day.date.d === 1, `seed ${seed}: day 6 is not NOV 01 — the cross-month window moved`)
        const v6 = day.queue.find((a) => a.breakRule === 'EXPIRED')
        ok(v6.person.passport.expiry.d === 31 && v6.person.passport.expiry.m === 10 && v6.person.passport.expiry.y === 1982,
            `seed ${seed}: the day-6 EXPIRED paper does not carry OCT 31 — no cross-month paper at the booth`)
        const d6 = decide(viewOf(day, v6))
        ok(d6.verdict === 'deny' && d6.violations.some((x) => x.rule === 'EXPIRED' && /1982\.10\.31 < TODAY 1982\.11\.01/.test(x.evidence)),
            `seed ${seed}: the booth did not print EXPIRED 1982.10.31 < TODAY 1982.11.01`)
    }

    // short-month seams, synthetic — the rolled week never reaches one, so the
    // law is pinned where the generator has not yet walked. A 30-day November
    // is exactly where the uniform-31 serial lied (6 days read as 7).
    const seamCase = (today, expiry, want, tag, rules = ['EXPIRED', 'CURFEW']) => {
        const [ty, tm, td] = today, [ey, em, ed] = expiry
        const day = { y: ty, m: tm, d: td }
        const pp = {
            name: 'SEAM CASE', id: 4444, dob: { y: 1950, m: 1, d: 1 }, sex: 'M', height: 170, weight: 70,
            country: 'ARSTOTZKA', city: 'OR VECHNA', expiry: { y: ey, m: em, d: ed },
        }
        const view = { date: day, dateNum: dnum(day), rules, allowed: ['ARSTOTZKA'], wanted: [], scale: 70, person: { papers: ['passport'], passport: pp, idcard: null } }
        const r = decide(view)
        ok(r.verdict === want, `CURFEW seam (${tag}): ${dfmt(day)} → ${dfmt(pp.expiry)} should be ${want}, booth says ${r.verdict}`)
    }
    seamCase([1982, 11, 25], [1982, 12, 1], 'deny', '6 real days — uniform-31 read it as 7')
    seamCase([1982, 11, 25], [1982, 12, 2], 'approve', 'exactly 7 days of grace over a 30-day November')
    seamCase([1982, 2, 22], [1982, 2, 28], 'deny', '6 days over the February run')
    seamCase([1982, 2, 22], [1982, 3, 1], 'approve', 'exactly 7 days past a 28-day February')
    seamCase([1982, 12, 31], [1983, 1, 1], 'deny', 'grace over the year seam')
    seamCase([1982, 11, 1], [1982, 11, 1], 'approve', 'expires-TODAY doctrine holds at the month seam', ['EXPIRED'])
}

// ------------------------------------------------------------ PORTRAIT ----
section('PORTRAIT (#1938) — the photo on the paper against the face at the counter')
{
    // 1. honest papers paint ONE face: every applicant that is not a
    //    portrait-forger carries a photo structurally identical to the
    //    live face (and identical in color too — an aged photo is the ONLY
    //    honest color move, and it belongs to the trap).
    // 2. a forger breaks EXACTLY ONE compared feature, and never a color —
    //    a color-only move must be the aged-photo trap, not a break.
    // 3. every break prints a witness naming its feature.
    let forged = 0, aged = 0
    for (const seed of SEEDS) {
        for (const day of genWeek(seed).days) {
            ok(day.rules.includes('PORTRAIT'), `day ${day.n} went without the photo law — PORTRAIT rides every day`)
            for (const a of day.queue) {
                const pp = a.person.passport
                if (!pp) continue
                const feats = FEATURES.filter((f) => a.person.face[f] !== pp.photo[f])
                const colors = ['skin', 'hairC', 'shirtC'].filter((k) => a.person.face[k] !== pp.photo[k])
                if (a.breakRule === 'PORTRAIT') {
                    forged++
                    ok(feats.length === 1, `seed ${seed} day ${day.n}: a portrait break moved ${feats.length} features — a forger overwrites exactly one`)
                    ok(colors.length === 0, `seed ${seed} day ${day.n}: a portrait break touched color — color is never forgery`)
                    ok(a.truth.photoMismatch === true, 'a forge the truth path forgot')
                    const d = decide(viewOf(day, a))
                    const ev = d.violations.find((x) => x.rule === 'PORTRAIT')
                    ok(ev && /HAIR|FACE|GLASSES|FACIAL HAIR/.test(ev.evidence),
                        `seed ${seed} day ${day.n}: the PORTRAIT deny printed no feature word: "${ev && ev.evidence}"`)
                } else {
                    ok(feats.length === 0 && a.truth.photoMismatch === false,
                        `seed ${seed} day ${day.n}: a hidden portrait break nobody staged (${feats.join(',')}) — unfair paper`)
                }
                if (a.trap === 'PORTRAIT') {
                    aged++
                    ok(pp.photo.hairC === GREY && a.person.face.hairC !== GREY,
                        `seed ${seed} day ${day.n}: the aged-photo trap is not grey-vs-live hair`)
                    ok(feats.length === 0 && colors.length === 1, 'the aged photo moved something the law compares')
                }
            }
        }
    }
    ok(forged >= SEEDS.length * 7, `only ${forged} portrait forges across ${SEEDS.length * 7} rule-days — the law skipped its exercise`)
    // every seed's week stages the aged-photo trap at least once — the
    // newest species must be REAL, not board decoration (#1902 pattern)
    for (const seed of SEEDS) {
        const has = genWeek(seed).days.some((d) => d.queue.some((a) => a.trap === 'PORTRAIT'))
        ok(has, `seed ${seed}: the week never showed an aged photo — the trap species is theatre`)
    }
    ok(aged >= SEEDS.length, `only ${aged} aged photos across the sweep`)
    // the wall owes PORTRAIT exactly one line: the day-7 fit (y=356 of the
    // 358 law) silently degrades the moment this text wraps
    ok(ruleLines(RULES.PORTRAIT.text) === 1, `PORTRAIT prints in ${ruleLines(RULES.PORTRAIT.text)} lines — a two-line law buries the wanted sheet`)
    console.log(`  ..    ${forged} forges each broke exactly one feature, ${aged} aged photos stayed legal, every break named itself on the wall`)
}

// ---------------------------------------------- clumsy clears / chaos collapses ----
section('SLACK (CLUMSY CLEARS) vs CHAOS (COLLAPSES) — every seed')
{
    for (const seed of SEEDS.slice(0, 6)) {
        const gs = newRun(seed)
        let guard = 0, strikesByDay = {}
        while (!gs.end && guard++ < 400) {
            const { view } = current(gs)
            const before = gs.strikes
            step(gs, { action: naiveDecide(view) })
            if (gs.strikes > before) strikesByDay[gs.day] = (strikesByDay[gs.day] || 0) + 1
        }
        ok(gs.end === 'win', `seed ${seed}: clumsy play (misjudges every trap) ended ${gs.end || 'stalled'} on day ${gs.day} — zero slack is a build failure`)
        const worst = Math.max(0, ...Object.values(strikesByDay))
        ok(worst <= 2, `seed ${seed}: clumsy day needed ${worst} strikes — the trap budget leaked into the sim`)
        const g2 = newRun(seed)
        let g = 0
        while (!g2.end && g++ < 400) {
            const { view } = current(g2)
            step(g2, { action: decide(view).verdict === 'approve' ? 'deny' : 'approve' })
        }
        ok(g2.end === 'lose' && g2.day === 1, `seed ${seed}: a booth signing WRONG survived past day ${g2.day} — the strike wall is theatre`)
    }
    console.log('  ..    clumsy clears every week (<=2 strikes/day), chaos falls on day 1')
}

// ------------------------------------------- #1960 SHIFT CLOCK and THE QUOTA ----
// The gate closes. Budget law: the queue is the quota and the queue sizes
// the clock. Scripted play must never be caught by it (attract, WATCH and
// every harness replay stamp faster than eighteen seconds an applicant);
// dawdling must be caught, days 1-6 dock and advance, and day 7 must
// FINISH. The clumsy eye still clears the week with the clock running —
// the slack rule is about judgment, and pace is tested separately.
section('SHIFT CLOCK (#1960) — the gate closes, the finale must finish — every seed')
{
    // budget law: entrants × SEAT
    for (const seed of SEEDS) {
        for (const day of genWeek(seed).days) {
            ok(dayTicks(day) === day.queue.length * CFG.SEAT_TICKS,
                `seed ${seed} day ${day.n}: budget ${dayTicks(day)} is not queue × SEAT`)
        }
    }
    // scripted inequality: the autopilot's longest wait + the stamp animation
    // must fit inside one applicant's allowance, or the attract booth and the
    // WATCH seat would get turned away at their own gate
    const maxWait = Math.max(...SEEDS.flatMap((s) => autopilot(newRun(s), 999).script.map((x) => x.wait)))
    ok(CFG.SEAT_TICKS >= maxWait + 40, `SEAT ${CFG.SEAT_TICKS} cannot cover the scripted wait ${maxWait} + stamp — scripted play would close the gate`)
    // cadence proof: a HUMAN 10 s/stamp clears every day of every seed, and
    // the finale closes with margin > 0
    for (const seed of SEEDS.slice(0, 8)) {
        const gs = newRun(seed)
        const script = autopilot(structuredClone(gs), 999).script
        let i = 0, guard = 0, closes = 0
        while (!gs.end && guard++ < 3000) {
            step(gs, { action: script[i++].action })
            for (let t = 0; t < 600 && !gs.end; t++) tick(gs)
            closes += gs.events.filter((e) => e.type === 'close').length
            gs.events.length = 0
        }
        ok(gs.end === 'win' && closes === 0, `seed ${seed}: human 10s cadence ended ${gs.end || 'stalled'} with ${closes} gate-close(s) — the budget is unfair to honest pace`)
        ok(gs.clock > 0, `seed ${seed}: the finale finished with no margin at all`)
    }
    // clumsy at pace: the naive eye misjudges papers, never pace — with the
    // clock running it must STILL clear the whole week (slack doctrine)
    for (const seed of SEEDS.slice(0, 6)) {
        const gs = newRun(seed)
        let guard = 0
        while (!gs.end && guard++ < 3000) {
            const { view } = current(gs)
            step(gs, { action: naiveDecide(view) })
            for (let t = 0; t < 600 && !gs.end; t++) tick(gs)
            gs.events.length = 0
        }
        ok(gs.end === 'win', `seed ${seed}: clumsy play at 10s/stamp ended ${gs.end || 'stalled'} on day ${gs.day} — the clock broke the slack rule`)
    }
    // dawdling day 1: a ~22 s cadence (1300 ticks) past the 18 s allowance —
    // the gate falls with someone still in line; the record docks, morning
    // rewinds a fresh shift
    {
        const gs = newRun(0)
        let closeEv = null
        let guard = 0
        while (!closeEv && guard++ < 30) {
            step(gs, { action: decide(current(gs).view).verdict })
            for (let t = 0; t < 1300 && !gs.end; t++) {
                tick(gs)
                closeEv = gs.events.find((e) => e.type === 'close') || closeEv
                if (closeEv) break
            }
            gs.events.length = 0
            if (gs.end) break
        }
        ok(closeEv && closeEv.missed > 0, 'a ~22s cadence never closed the gate — the shift clock is theatre')
        ok(gs.end === null && gs.day === 2, `an early gate close ended the run (${gs.end}) or froze the day (${gs.day}) — days 1-6 must dock and advance`)
        ok(gs.clock === dayTicks(gs.week.days[1]), `morning after a close must rewind a full shift (${gs.clock} vs ${dayTicks(gs.week.days[1])})`)
    }
    // day 7 dawdle: identical arithmetic, fatal consequence — and the missed
    // count is deterministic (every seed's finale is 13 deep, 14040 budget,
    // stamps every 1300 ticks: the 11th stamp lands at 13000, the gate runs
    // down at 14040 with exactly 2 still in line)
    for (const seed of SEEDS.slice(0, 4)) {
        const gs = newRun(seed)
        let guard = 0
        while (!gs.end && gs.day < CFG.DAYS && guard++ < 300) {
            step(gs, { action: decide(current(gs).view).verdict })
            gs.events.length = 0
        }
        let missed = null
        guard = 0
        while (!gs.end && guard++ < 40) {
            if (gs.idx < gs.week.days[6].queue.length) { step(gs, { action: decide(current(gs).view).verdict }); gs.events.length = 0 }
            for (let t = 0; t < 1300 && !gs.end; t++) {
                tick(gs)
                const ce = gs.events.find((e) => e.type === 'close')
                if (ce) missed = ce.missed
            }
            gs.events.length = 0
        }
        ok(gs.end === 'lose' && /QUOTA UNMET/.test(gs.endWhy), `seed ${seed}: dawdling through the finale ended ${gs.end || 'stalled'} — day 7 must finish`)
        ok(missed === 2, `seed ${seed}: day-7 dawdle missed ${missed}, expected the deterministic 2 — the finale arithmetic drifted`)
    }
    // dock arithmetic: exactly MISS_DOCK per turned-away head, clamped at zero
    {
        const gs = newRun(0)
        gs.score = 3
        gs.idx = gs.week.days[0].queue.length - 1   // one left in line at close
        tick(gs, dayTicks(gs.week.days[0]))
        ok(gs.score === 0, `close docked to ${gs.score}, not clamped to 0`)
        const g2 = newRun(0)
        g2.score = 100
        g2.idx = g2.week.days[0].queue.length - 3    // three left in line
        tick(g2, dayTicks(g2.week.days[0]))
        ok(g2.score === 100 - 3 * CFG.MISS_DOCK, `three heads docked ${100 - g2.score}, expected ${3 * CFG.MISS_DOCK}`)
    }
    // the printed clock: budget maps 08:00→18:00, red is exactly the last hour,
    // and the printed minute never runs backward inside a day
    {
        const g0 = newRun(0)
        const c0 = gameClock(g0)
        ok(c0.hh === 8 && c0.mm === 0 && !c0.red, `shift start prints ${c0.hh}:${c0.mm}`)
        g0.clock = Math.round(c0.budget * 0.1)
        const c17 = gameClock(g0)
        ok(c17.hh === 17 && c17.red, `the tenth of a shift prints ${c17.hh}:${String(c17.mm).padStart(2, '0')} red=${c17.red} — red must be the last printed hour`)
        g0.clock = 0
        const c18 = gameClock(g0)
        ok(c18.hh === 18 && c18.mm === 0 && c18.red, 'close must print 18:00 red')
        let prevPrinted = 0, mono = true
        const g1 = newRun(0)
        for (let t = 0; t < dayTicks(g1.week.days[0]); t += 7) { tick(g1); const c = gameClock(g1); const p = c.hh * 60 + c.mm; if (p < prevPrinted) mono = false; prevPrinted = p }
        ok(mono, 'the wall clock ran backward inside a day')
    }
    // the clock hangs on the ruled grid — clear of the date line, clear of
    // the rulebook's first row, clear of the portrait column (and clear of
    // the HTML chrome, which owns the canvas top-right corner: verified in
    // screenshots, not assumed)
    ok(CLOCK.y + CLOCK.r + 6 <= WALL.top + WALL.labelLine - WALL.size, 'the clock digits run into the RULEBOOK label')
    ok(CLOCK.x - CLOCK.r >= 12 + 'DAY 1   1982.10.27'.length * 15 * CHAR + 4, 'the clock crowds the DAY/date line')
    ok(CLOCK.x + CLOCK.r <= PORTRAIT.x - 4, 'the clock runs into the portrait column')
    ok(CLOCK.x + CLOCK.r <= CW - 4 && CLOCK.x - CLOCK.r >= 2, 'the clock runs off the wall')
    console.log('  ..    budget = queue × SEAT (18 s/applicant); 10 s human cadence clears every day of every seed; the naive eye still clears the week; a ~22 s cadence closes day 1 (docked, morning rewound); day 7 dawdles to a deterministic 2-head quota loss; wall clock 08:00→18:00, red = the last hour, monotone, hung clear of chrome and text')
}

// ------------------------------------------------------- dead input no-ops ----
section('THE BOOTH WAITS — inputs that are not calls change nothing')
{
    const g = newRun(0)
    const h = stateHash(g)
    step(g, {})
    step(g, null)
    step(g, { action: 'wait' })
    ok(stateHash(g) === h, 'a not-a-call moved the queue')
    ok(g.idx === 0, 'the first entrant vanished')
}

// ------------------------------------------------------------ proven weeks ----
section('THE PROVEN WEEKS (attract replays these tick for tick)')
for (const seed of SEEDS.slice(0, 8)) {
    const a = autopilot(newRun(seed))
    const b = autopilot(newRun(seed))
    ok(a.ok, `seed ${seed}: the perfect inspector did NOT survive the week (${a.end} day ${a.day})`)
    ok(JSON.stringify(a.script.map((s) => s.action)) === JSON.stringify(b.script.map((s) => s.action)), `seed ${seed}: two perfect inspectors stamped differently`)
    const replay = newRun(seed)
    for (const s of a.script) step(replay, { action: s.action })
    ok(replay.end === 'win' && replay.score === a.score, `seed ${seed}: the script replayed into a different end (${replay.end})`)
    if (seed === 0) console.log(`  ..    seed ${seed}: ${a.script.length} stamps, ${a.score} correct — every deny carried a witness (section 2 proved it)`)
}

// ------------------------------------------------------------ determinism ----
section('DETERMINISM')
{
    const w1 = JSON.stringify(genWeek(2))
    const w2 = JSON.stringify(genWeek(2))
    ok(w1 === w2, 'the same seed dealt two different weeks')
    ok(w1 !== JSON.stringify(genWeek(3)), 'two seeds dealt the same week — the seed is decoration')
    const g1 = newRun(2), g2 = newRun(2)
    ok(stateHash(g1) === stateHash(g2), 'two fresh identical booths hash differently')
    g2.strikes += 1
    ok(stateHash(g1) !== stateHash(g2), 'stateHash ignores a strike')
    const g3 = newRun(2)
    step(g3, { action: decide(current(g3).view).verdict })
    ok(stateHash(g3) !== stateHash(newRun(2)), 'stateHash ignores the stamp')
    // genDay called standalone must equal the week's own day (no hidden
    // state). Replay the week's OWN trap pick — pinning an index by hand
    // hard-codes the rotation, which PORTRAIT (#1938) legitimately shifted.
    const wk = genWeek(1)
    const d4 = wk.days[3]
    const t4 = d4.queue.find((a) => a.trap)
    const si4 = t4 ? TRAPS.findIndex((t) => t.rule === t4.trap) : null
    ok(JSON.stringify(genDay(1, 4, si4)) === JSON.stringify(d4), 'genDay standalone drifts from genWeek — hidden state')
}

// ---------------------------------------------------------------- mutants ----
// ------------------------------------------------------------ booth fit ----
section('THE WALL FITS THE BOOTH (#410) — nothing hides, nothing is postage')
{
    // the rulebook is the most important text in the game: it may never be
    // smaller than the passport body text (11px) the player reads in hand
    ok(WALL.ruleSize >= 11, `rulebook prints at ${WALL.ruleSize}px — smaller than the passport text (11px) is unreadable on a phone`)
    ok(PAPERS.x >= PORTRAIT.x + PORTRAIT.headCx + PORTRAIT.headRx + 2, 'the passport card covers the entrant portrait')
    ok(PAPERS.x + PAPERS.w <= CW - 4, 'the passport card runs off the canvas')
    const labelR = PORTRAIT.x + PORTRAIT.headCx + ('ENTRANT 8/8'.length * 10 * CHAR) / 2
    ok(PAPERS.x >= labelR + 2, 'the passport card covers the ENTRANT label')
    ok(SCALE.y + SCALE.h <= CHS - STRIP_H, 'the scale box is under the controls strip')
    let worst = 0, deepest = 0, fives = 0
    for (const seed of SEEDS) {
        for (const day of genWeek(seed).days) {
            const f = wallFit(day, day.rules.map((r) => RULES[r].text))
            worst = Math.max(worst, f.bottom)
            deepest = Math.max(deepest, day.wanted.length)
            if (day.wanted.length === 5) fives++
            ok(f.fits && f.listsFit, `seed ${seed} day ${day.n}: wall text reaches y=${f.bottom} — the booth is only ${CHS - STRIP_H}px of wall`)
            ok(f.rulesClearScale && f.listsClearScale, `seed ${seed} day ${day.n}: the SCALE box is painted ON ${f.rulesEnd > SCALE.y ? 'the rulebook' : 'the entry/wanted lists'} — the sheet vanishes`)
            ok(f.rulesClearEntrant, `seed ${seed} day ${day.n}: a rulebook line runs into the entrant column`)
        }
    }
    console.log(`  ..    worst wall bottom y=${worst} of ${CHS - STRIP_H}; every entry, every wanted name, every law is on screen together`)
    // the fifth slot must be REAL, not just allowed (#1902): a bulletin
    // that always prints three lines is the old booth wearing a new cap
    ok(deepest === 5, `the generator never staged a five-entry sheet (deepest ${deepest}) — the fifth slot is dead letter`)
    ok(fives > 0, 'no seed/day reached the five-entry sheet')
    console.log(`  ..    deepest sheet ${deepest} entries; ${fives} five-entry days across the sweep — the original bulletin's capacity is in use`)
    // and the theoretical worst day the generator is allowed to build: the
    // full 8-rule sheet, four countries, five wanted names (#410: the old
    // booth overflowed exactly here and the scale box buried the sheet;
    // #1902 raised the wanted column to the bulletin's five)
    {
        const worstDay = { n: 7, allowed: ['ARSTOTZKA', 'KIRINIA', 'VESKOLE', 'PARMENISTAN'], wanted: [{ name: 'ANDERSON K V', id: 4022 }, { name: 'GORSKY A V', id: 1180 }, { name: 'VOSKOVIC M', id: 3345 }, { name: 'DZURAK L', id: 2077 }, { name: 'MARKIC D V', id: 3321 }], rules: DAY_RULES[6] }
        const f = wallFit(worstDay, worstDay.rules.map((r) => RULES[r].text))
        ok(f.listsFit && f.listsClearScale && f.rulesClearScale, `the worst buildable day reaches y=${f.bottom} vs scale y=${SCALE.y} and strip y=${CHS - STRIP_H} — the wall hides its own evidence`)
        console.log(`  ..    worst buildable day: bottom y=${f.bottom}, scale box top y=${SCALE.y}, strip top y=${CHS - STRIP_H} — clear`)
    }
}

if (MUT) {
    section('MUTATIONS — each MUST turn an honest check red')
    const dir = '/var/folders/41/gz22zd5d55g08jn448xnd90m0000gn/T/opencode/pp-mutant'
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })

    // copy the booth into a temp module dir, swap ONE anchored line, import fresh
    const mutMod = async (file, anchor, replacement, tag) => {
        const files = {}
        for (const f of ['rules.js', 'gen.js', 'sim.js', 'layout.js']) {
            let src = readFileSync(join(SRC, f), 'utf8')
            if (f === file) {
                if (!src.includes(anchor)) { ok(false, `mutant anchor not found (${tag}): ${anchor} — a silent skip is a green suite that tested nothing`); return null }
                src = src.replace(anchor, replacement)
            }
            files[f] = src
        }
        const d = join(dir, `m${Date.now() % 100000}`)
        mkdirSync(d, { recursive: true })
        for (const f of Object.keys(files)) writeFileSync(join(d, f), files[f])
        return {
            rules: await import(pathToFileURL(join(d, 'rules.js')).href),
            gen: await import(pathToFileURL(join(d, 'gen.js')).href),
            sim: await import(pathToFileURL(join(d, 'sim.js')).href),
            layout: await import(pathToFileURL(join(d, 'layout.js')).href),
        }
    }

    const tryMut = async (name, p, probe) => {
        const m = await p
        if (!m) return
        const v = await probe(m)
        console.log(`  mut ${name}: ${v === true ? 'SURVIVED (BAD)' : 'caught by the audit'}`)
        ok(v !== true, `${name} SURVIVED — a check stopped touching this rule`)
    }

    // 1. off-by-one expiry: "through today" becomes "up to yesterday" and
    //    eats the legal expires-TODAY traps
    await tryMut('EXPIRED < -> <= (expires TODAY becomes void)',
        mutMod('rules.js', "dnum(pp.expiry) < view.dateNum", 'dnum(pp.expiry) <= view.dateNum', 'm1'),
        (m) => {
            for (const seed of SEEDS) {
                for (const day of m.gen.genWeek(seed).days) {
                    for (const a of day.queue) {
                        const v = m.gen.viewOf(day, a)
                        const d = m.rules.decide(v)
                        const j = m.rules.judge({ truth: a.truth, person: a.person, rules: day.rules, date: day.date, allowed: day.allowed, scale: a.scale })
                        if (d.verdict !== j.verdict) return false
                    }
                }
            }
            return true
        })

    // 2. wanted by NAME only — the same-name trap twin gets convicted
    await tryMut('WANTED drops the id equality (name alone convicts)',
        mutMod('rules.js', 'view.wanted.find((w) => w.name === pp.name && w.id === pp.id)', 'view.wanted.find((w) => w.name === pp.name)', 'm2'),
        (m) => {
            for (const seed of SEEDS) {
                for (const day of m.gen.genWeek(seed).days) {
                    for (const a of day.queue) {
                        const v = m.gen.viewOf(day, a)
                        const d = m.rules.decide(v)
                        const j = m.rules.judge({ truth: a.truth, person: a.person, rules: day.rules, date: day.date, allowed: day.allowed, scale: a.scale })
                        if (d.verdict !== j.verdict) return false
                    }
                }
            }
            return true
        })

    // 3. children lose their exemption (the IDREQ trap twin convicted)
    await tryMut('IDREQ ignores the DOB (every paperless paper convicts)',
        mutMod('rules.js', "p.papers.indexOf('idcard') < 0 && isAdult(pp.dob, view.date)", "p.papers.indexOf('idcard') < 0", 'm3'),
        (m) => {
            for (const seed of SEEDS) {
                for (const day of m.gen.genWeek(seed).days) {
                    for (const a of day.queue) {
                        const v = m.gen.viewOf(day, a)
                        const d = m.rules.decide(v)
                        const j = m.rules.judge({ truth: a.truth, person: a.person, rules: day.rules, date: day.date, allowed: day.allowed, scale: a.scale })
                        if (d.verdict !== j.verdict) return false
                    }
                }
            }
            return true
        })

    // 4. the scale starts reading the PASSPORT instead of the person —
    //    the forged weight becomes invisible and the honest one never
    await tryMut('the SCALE reads the paperwork (witness lies)',
        mutMod('gen.js', 'a.scale = a.truth.trueWeight', "a.scale = a.person.passport ? a.person.passport.weight : 0", 'm4'),
        (m) => {
            for (const seed of SEEDS) {
                for (const day of m.gen.genWeek(seed).days) {
                    for (const a of day.queue) {
                        const v = m.gen.viewOf(day, a)
                        const d = m.rules.decide(v)
                        const j = m.rules.judge({ truth: a.truth, person: a.person, rules: day.rules, date: day.date, allowed: day.allowed, scale: a.scale })
                        if (d.verdict !== j.verdict) return false
                        if (typeof a.scale === 'number' && a.scale !== a.truth.trueWeight) return false
                    }
                }
            }
            return true
        })

    // 5. trap coverage degrades to a hope: no "used" memory, some seeds
    //    never see a species at all
    await tryMut('genWeek forgets which species ran (coverage becomes luck)',
        mutMod('gen.js', 'used.add(trapIdx)', 'if (false) used.add(trapIdx)', 'm5'),
        (m) => {
            let anyMissing = false
            for (const seed of SEEDS) {
                const seen = new Set()
                for (const day of m.gen.genWeek(seed).days) for (const a of day.queue) if (a.trap) seen.add(a.trap)
                if (seen.size < m.gen.TRAPS.length) anyMissing = true
            }
            return !anyMissing
        })

    // 6. the booth fills with traps instead of honest paper — the clumsy
    //    eye can no longer clear a day (the slack rule, live)
    await tryMut('legal fill becomes trap fill (zero-slack booth)',
        mutMod('gen.js', 'while (day.queue.length < rules.length + 4) day.queue.push(base(rnd, date, rules, used, { allowed: day.allowed }))',
            'while (day.queue.length < rules.length + 5) { const act = TRAPS.map((t, i) => (rules.includes(t.rule) ? i : -1)).filter((i) => i >= 0); day.queue.push(trapApplicant(act[day.queue.length % act.length], rnd, date, rules, day, used)) }', 'm6'),
        async (m) => {
            // SURVIVED = clumsy play still clears the trap-filled booth
            // (which would mean the slack ceiling was never load-bearing)
            for (const seed of SEEDS.slice(0, 4)) {
                const gs = m.sim.newRun(seed)
                let guard = 0
                while (!gs.end && guard++ < 400) {
                    const { view } = m.sim.current(gs)
                    m.sim.step(gs, { action: naiveDecide(view) })
                }
                if (gs.end !== 'win') return false
            }
            return true
        })

    // 7. a strike wall of ten: three mistakes should END day one — chaos
    //     must still fall on day one, or the strike wall is theatre.
    //     (An earlier m7 mutated stateHash and SURVIVED: nothing in the
    //     suite consumes the hash, so blindness to strikes was invisible.
    //     A mutant the checks cannot reach is not a test — it is décor.)
    await tryMut('STRIKE_MAX effectively 9 (day one survives pure chaos)',
        mutMod('sim.js', 'gs.strikes >= CFG.STRIKE_MAX', 'gs.strikes >= CFG.STRIKE_MAX + 6', 'm7'),
        (m) => {
            for (const seed of [0, 1, 2]) {
                const g = m.sim.newRun(seed)
                let g2 = 0
                while (!g.end && g2++ < 400) {
                    const { view } = m.sim.current(g)
                    m.sim.step(g, { action: m.rules.decide(view).verdict === 'approve' ? 'deny' : 'approve' })
                }
                if (g.end !== 'lose' || g.day !== 1) return false   // chaos fell elsewhere — the suite sees that
            }
            return true    // chaos still falls on day one — the wall was theatre
        })

    // 8. the scale box slid up onto the lists: on 2026-10-19 the 8-rule wall
    //     overflowed and the box painted OVER the wanted sheet — the wall
    //     hid its own evidence. The booth-fit gate must see it.
    await tryMut('SCALE box buried under the wanted sheet',
        mutMod('layout.js', 'export const SCALE = { x: 12, y: 358, w: 96, h: 30 }', 'export const SCALE = { x: 12, y: 340, w: 96, h: 30 }', 'm8'),
        (m) => {
            const worstDay = { n: 7, allowed: ['ARSTOTZKA', 'KIRINIA', 'VESKOLE', 'PARMENISTAN'], wanted: [{ name: 'ANDERSON K V', id: 4022 }, { name: 'GORSKY A V', id: 1180 }, { name: 'VOSKOVIC M', id: 3345 }, { name: 'DZURAK L', id: 2077 }], rules: m.rules.DAY_RULES[6] }
            const f = m.layout.wallFit(worstDay, worstDay.rules.map((r) => m.rules.RULES[r].text))
            return f.listsFit && f.listsClearScale && f.rulesClearScale
        })

    // 9. the serial clock re-freezes at 31 days a month: the printed calendar
    //    and the number every rule compares drift apart again at every short
    //    month — a 6-day-grace paper past November reads legal. The CALENDAR
    //    section must see both halves: the broken identity and the seam verdict.
    await tryMut('dnum reverts to uniform-31 (two clocks again)',
        mutMod('rules.js', 'dt.y * 365 + MPREFIX[dt.m - 1] + dt.d', 'dt.y * 372 + (dt.m - 1) * 31 + dt.d', 'm9'),
        (m) => {
            // SURVIVED = the mutant serial still matches the calendar AND still
            // denies the short-month seam paper — both are impossible now.
            const MD = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
            let driftSeen = false
            for (let mm = 1; mm <= 12 && !driftSeen; mm++) {
                for (let d = 1; d <= MD[mm - 1] && !driftSeen; d++) {
                    const x = { y: 1982, m: mm, d }
                    if (m.rules.dnum(m.rules.dadd(x, 7)) - m.rules.dnum(x) !== 7) driftSeen = true
                }
            }
            if (!driftSeen) {
                const day = { y: 1982, m: 11, d: 25 }
                const pp = {
                    name: 'SEAM CASE', id: 4444, dob: { y: 1950, m: 1, d: 1 }, sex: 'M', height: 170, weight: 70,
                    country: 'ARSTOTZKA', city: 'OR VECHNA', expiry: { y: 1982, m: 12, d: 1 },
                }
                const view = { date: day, dateNum: m.rules.dnum(day), rules: ['EXPIRED', 'CURFEW'], allowed: ['ARSTOTZKA'], wanted: [], scale: 70, person: { papers: ['passport'], passport: pp, idcard: null } }
                if (m.rules.decide(view).verdict === 'deny') return true   // invisible mutant: identical clock — SURVIVED
                return false                                                 // 6-day paper walked free: caught
            }
            return false   // identity broken at a short-month seam: caught
        })

    // 10. the backward carry stripped from dadd — the bug #1889 actually found
    //     while rolling the week: NOV 01 minus one day printed NOV 00, a date
    //     the wall cannot show. The day-6 cross-month gates must see it.
    await tryMut('dadd loses the backward carry (NOV 00 ships)',
        mutMod('rules.js', 'while (d < 1) { m -= 1; if (m < 1) { m = 12; y -= 1 } d += MDAYS[m - 1] }', 'if (false) while (d < 1) { m -= 1; if (m < 1) { m = 12; y -= 1 } d += MDAYS[m - 1] }', 'm10'),
        (m) => {
            // SURVIVED = every seed's day-6 EXPIRED paper still carries OCT 31
            for (let seed = 0; seed < 4; seed++) {
                const day = m.gen.genWeek(seed).days[5]
                const v6 = day.queue.find((a) => a.breakRule === 'EXPIRED')
                if (!v6 || v6.person.passport.expiry.m !== 10 || v6.person.passport.expiry.d !== 31) return false
            }
            return true
        })

    // 11. the fifth slot dies (#1902): decoys back to two and the bulletin
    //     silently shrinks to the old four-portrait wall — the slot-used
    //     witness in the WALL section is the load-bearing line.
    await tryMut('wanted sheet forgets its fifth portrait (decoys 3 -> 2)',
        mutMod('gen.js', 'for (let k = 0; k < 3; k++) {', 'for (let k = 0; k < 2; k++) {', 'm11'),
        (m) => {
            let deepest = 0
            for (const seed of SEEDS) {
                for (const day of m.gen.genWeek(seed).days) deepest = Math.max(deepest, day.wanted.length)
            }
            return deepest >= 5
        })
    // 12. PORTRAIT deleted from the booth's eye — forgers walk free while
    //     the truth path still denies. The fairness prover is the witness.
    await tryMut('PORTRAIT block deleted from decide (forgers walk free)',
        mutMod('rules.js', "if (has('PORTRAIT') && p.passport) {", "if (false && has('PORTRAIT') && p.passport) {", 'm12'),
        (m) => {
            for (const seed of SEEDS) {
                for (const day of m.gen.genWeek(seed).days) {
                    for (const a of day.queue) {
                        const d = m.rules.decide(m.gen.viewOf(day, a))
                        const j = m.rules.judge({ truth: a.truth, person: a.person, rules: day.rules, date: day.date, allowed: day.allowed, scale: a.scale })
                        if (d.verdict !== j.verdict) return false
                    }
                }
            }
            return true
        })

    // 13. the aged photo keeps its live hair color — the trap loses its
    //     bait, the naive eye stops biting, and the trap contract (which
    //     counts flips == planted) sees the hole.
    await tryMut('aged-photo trap stops going grey (trap has no bait)',
        mutMod('gen.js', 'photo: { ...a.person.face, hairC: GREY } }', 'photo: { ...a.person.face } }', 'm13'),
        (m) => {
            for (const seed of SEEDS.slice(0, 4)) {
                for (const day of m.gen.genWeek(seed).days) {
                    for (const a of day.queue) {
                        const v = m.gen.viewOf(day, a)
                        const flip = naiveDecide(v) !== m.rules.decide(v).verdict
                        if (flip !== !!a.trap) return false
                    }
                }
            }
            return true
        })

    // 14. color starts convicting: portraitDiffs adds hairC, and the booth
    //     denies the aged photo its truth path calls legal.
    await tryMut('hair COLOR convicts (the aged photo is denied)',
        mutMod('rules.js', 'if (face.style !== photo.style) ev.push(', "if (face.hairC !== photo.hairC) ev.push('PHOTO HAIR COLOR DIFFERS')\n    if (face.style !== photo.style) ev.push(", 'm14'),
        (m) => {
            for (const seed of SEEDS) {
                for (const day of m.gen.genWeek(seed).days) {
                    for (const a of day.queue) {
                        const d = m.rules.decide(m.gen.viewOf(day, a))
                        const j = m.rules.judge({ truth: a.truth, person: a.person, rules: day.rules, date: day.date, allowed: day.allowed, scale: a.scale })
                        if (d.verdict !== j.verdict) return false
                    }
                }
            }
            return true
        })

    // #1960 clock mutants. SURVIVED = the mutant still behaves like the
    // original on the probes below; a probe returns false when the law broke.

    // 15. eighteen seconds per applicant shrinks to half a second: the gate
    //     now falls on SCRIPTED play — attract and WATCH would close the gate
    //     at their own booth.
    await tryMut('SEAT_TICKS 18s -> 0.5s (the gate catches scripted play)',
        mutMod('sim.js', 'SEAT_TICKS: 1080', 'SEAT_TICKS: 30', 'm15'),
        async (m) => {
            const gs = m.sim.newRun(0)
            const script = m.sim.autopilot(structuredClone(gs), 999).script
            let i = 0, closes = 0, guard = 0
            while (!gs.end && guard++ < 4000) {
                m.sim.step(gs, { action: script[i++ % script.length].action })
                for (let t = 0; t < 600 && !gs.end; t++) {
                    m.sim.tick(gs)
                    closes += gs.events.filter((e) => e.type === 'close').length
                }
                gs.events.length = 0
            }
            return gs.end === 'win' && closes === 0
        })

    // 16. the day-7 quota loses its tooth: dawdling through the finale just
    //     advances the day (past the end of the week — which the probe reads
    //     as a crash, also a capture).
    await tryMut('day-7 quota tooth pulled (dawdling survives the finale)',
        mutMod('sim.js', 'gs.score = Math.max(0, gs.score - CFG.MISS_DOCK * missed)\n        if (gs.day >= CFG.DAYS) {', 'gs.score = Math.max(0, gs.score - CFG.MISS_DOCK * missed)\n        if (false && gs.day >= CFG.DAYS) {', 'm16'),
        async (m) => {
            try {
                const gs = m.sim.newRun(0)
                let guard = 0
                while (!gs.end && gs.day < m.sim.CFG.DAYS && guard++ < 300) { m.sim.step(gs, { action: m.rules.decide(m.sim.current(gs).view).verdict }); gs.events.length = 0 }
                guard = 0
                while (!gs.end && guard++ < 40) {
                    if (gs.idx < gs.week.days[6].queue.length) { m.sim.step(gs, { action: m.rules.decide(m.sim.current(gs).view).verdict }); gs.events.length = 0 }
                    for (let t = 0; t < 1300 && !gs.end; t++) m.sim.tick(gs)
                    gs.events.length = 0
                }
                return gs.end === 'lose' && /QUOTA UNMET/.test(gs.endWhy)
            } catch { return false }
        })

    // 17. the dock zeroes: heads still get turned away, but the record stops
    //     costing anything — the quota becomes theatre.
    await tryMut('miss dock zeroed (turning away costs nothing)',
        mutMod('sim.js', 'gs.score = Math.max(0, gs.score - CFG.MISS_DOCK * missed)', 'gs.score = gs.score', 'm17'),
        async (m) => {
            const gs = m.sim.newRun(0)
            gs.score = 3
            gs.idx = gs.week.days[0].queue.length - 1
            m.sim.tick(gs, m.sim.dayTicks(gs.week.days[0]))
            return gs.score === 0
        })

    // 18. morning forgets to rewind: after a close the booth opens on a dead
    //     clock and the second day closes with the whole line still in it.
    await tryMut('morning keeps the dead clock (no rewind)',
        mutMod('sim.js', 'gs.clock = dayTicks(gs.week.days[gs.day - 1])', 'gs.clock = 0', 'm18'),
        async (m) => {
            const gs = m.sim.newRun(0)
            gs.idx = gs.week.days[0].queue.length - 1
            m.sim.tick(gs, m.sim.dayTicks(gs.week.days[0]))
            return gs.clock === m.sim.dayTicks(gs.week.days[1])
        })
}

console.log(`\npaperscheck: ${pass}/${pass + fails.length} checks passed${fails.length ? `  — ${fails.length} FAILED` : '  — OK'}`)
fails.forEach((f) => console.log(`  FAIL  ${f}`))
process.exit(fails.length ? 1 : 0)
