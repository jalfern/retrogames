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
// the finale must finish) · the pay economy (#1966: pay per correct stamp,
// soup/heat nightly, rising rent, eviction and two-night deaths) · the proven
// weeks (attract replays these) · determinism · mutants.

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { RULES, DAY_RULES, decide, judge, dnum, dadd, dfmt, dshow, MON, FEATURES, stampLines, portraitDiffs } from '../src/games/PapersPleaseMin/rules.js'
import { genWeek, genDay, viewOf, CITY2C, COUNTRIES, TRAPS, GREY, REGULARS, arcForWeek, firstVisitDay, accFor, VISIT_WINDOW, WALL_POOL, wallNameAt, weekWallNames, weekDecoyCount, crowdedDay, repChapter, turnLineFor, againLineFor, TURN_CANONICAL, trapSchedule, day7Demote, neighbourTrapWeek } from '../src/games/PapersPleaseMin/gen.js'
import { CFG, newRun, step, tick, stateHash, current, autopilot, dayTicks, gameClock, settle, rentDue, weekCharges, monthTurn, isMoneyDeath } from '../src/games/PapersPleaseMin/sim.js'
import { CW, CHS, STRIP_H, WALL, CHAR, SCALE, PORTRAIT, PAPERS, CLOCK, SLIP, RENT, PAYFX, ID, PHOTO, BUBBLE, BUBBLE_TAIL, EVID, SETTLE, QUOTE, RECOGNITION, QUEUE, ASIDE, CROWD_NOTE, ARC_MUG, ARC_HL, SEIZE, DRAG, wallFit, ruleLines, bulletinRows } from '../src/games/PapersPleaseMin/layout.js'

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
        ok(d6.verdict === 'deny' && d6.violations.some((x) => x.rule === 'EXPIRED' && /OCT 31 1982 < TODAY NOV 01 1982/.test(x.evidence)),
            `seed ${seed}: the booth did not print EXPIRED OCT 31 1982 < TODAY NOV 01 1982 (#2130: the strip speaks the paper's dates)`)
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

// ------------------------------------------------- THE STAMP SPEAKS ----
section('THE STAMP SPEAKS (#1891) — the strip quotes the evidence, the wall prints month names, the roll is loud, papers land with weight')
{
    // 1) MONTH NAMES — dshow carries the SAME date as dfmt (elements cross-
    //    checked against the numerals), in the original's `OCT 27 1982` shape.
    ok(MON.length === 12 && MON[9] === 'OCT' && MON[10] === 'NOV', 'MON is not the twelve-month calendar')
    for (const seed of SEEDS) {
        for (const day of genWeek(seed).days) {
            const shown = dshow(day.date)
            const m = /^([A-Z]{3}) (\d{2}) (\d{4})$/.exec(shown)
            ok(!!m, `dshow(${dfmt(day.date)}) did not print NAME DD YYYY: "${shown}"`)
            if (m) ok(`${m[3]}.${String(MON.indexOf(m[1]) + 1).padStart(2, '0')}.${m[2]}` === dfmt(day.date),
                `seed ${seed} day ${day.n}: dshow ${shown} disagrees with the serial ${dfmt(day.date)} — the wall prints a lie`)
        }
    }
    // 2) THE NEW MONTH — the roll (#1889) fires exactly once per seed, on
    //    day 6, and names NOVEMBER; every other morning stays quiet.
    for (const seed of SEEDS) {
        const week = genWeek(seed)
        for (let n = 2; n <= CFG.DAYS; n++) {
            const want = n === 6 ? 'NOVEMBER' : null
            ok(monthTurn(week, n) === want, `seed ${seed}: monthTurn(day ${n}) = ${monthTurn(week, n)}, expected ${want}`)
        }
        ok(monthTurn(week, 1) === null && monthTurn(week, CFG.DAYS + 1) === null, `seed ${seed}: monthTurn must be null outside mornings 2-7`)
    }
    // 3) THE QUOTED WITNESS — every deny the booth can prove rides with its
    //    evidence, VERBATIM, at the strip. Built the way step() builds
    //    gs.last, so the quote is graded against the same object the booth
    //    paints with. Rule names may headline; they may not replace the case.
    for (const seed of SEEDS) {
        for (const day of genWeek(seed).days) {
            for (const a of day.queue) {
                const d = decide(viewOf(day, a))
                const joined = d.violations.length ? d.violations.map((x) => x.evidence).join('; ') : 'ALL PAPERS IN ORDER'
                const lastOk = { ok: true, action: d.verdict, verdict: d.verdict, why: d.verdict === 'deny' ? d.violations[0].rule : null, evidence: joined }
                const sl = stampLines(lastOk, EVID.wrap)
                if (d.verdict === 'approve') {
                    ok(sl.witness === null && sl.evidence.length === 0, `seed ${seed} d${day.n}: a clean admit printed a case (${sl.witness})`)
                } else {
                    ok(sl.witness === `WITNESS: ${d.violations[0].rule}`, `seed ${seed} d${day.n}: the deny did not headline its rule: "${sl.witness}"`)
                    ok(sl.evidence.length >= 1 && sl.evidence[0] === joined || (sl.evidence.length >= 1 && joined.startsWith(sl.evidence[0]) && sl.evidence[0].length > d.violations[0].rule.length),
                        `seed ${seed} d${day.n}: the strip did not quote the evidence verbatim: "${sl.evidence[0]}" vs "${joined}"`)
                    ok(sl.evidence.every((ln) => ln.length <= EVID.wrap) && sl.evidence.length <= 2, `seed ${seed} d${day.n}: the quote outgrew the strip: ${JSON.stringify(sl.evidence)}`)
                }
                // the wrong call quotes too: approving this paper must print
                // the clause the player missed; denying an innocent quotes
                // nothing and says the whole truth.
                if (d.verdict === 'deny') {
                    const wrong = { ...lastOk, ok: false, action: 'approve' }
                    const slw = stampLines(wrong, EVID.wrap)
                    ok(slw.witness === sl.witness && slw.evidence.length === sl.evidence.length, `seed ${seed} d${day.n}: a missed deny lost its quote (${JSON.stringify(slw)})`)
                } else {
                    const wrong = { ok: false, action: 'deny', verdict: 'approve', why: 'INNOCENT', evidence: joined }
                    const slw = stampLines(wrong, EVID.wrap)
                    ok(slw.witness === 'THEY WERE CLEAN' && slw.evidence.length === 0, `seed ${seed} d${day.n}: the innocent quote changed: ${JSON.stringify(slw)}`)
                }
            }
        }
    }
    // the week's signature paper: day 6's cross-month EXPIRED break must
    // reach the strip as the FULL comparison, not the word EXPIRED.
    for (const seed of SEEDS) {
        const week = genWeek(seed)
        const day = week.days[5]
        const hit = day.queue.map((a) => ({ a, d: decide(viewOf(day, a)) })).find((x) => x.d.violations.some((v) => v.rule === 'EXPIRED'))
        ok(!!hit, `seed ${seed}: day 6 lost its EXPIRED paper — the cross-month quote has nothing to quote`)
        if (hit) {
            const exp = hit.a.person.passport.expiry
            const sl = stampLines({ ok: true, action: 'deny', verdict: 'deny', why: 'EXPIRED', evidence: hit.d.violations.map((x) => x.evidence).join('; ') }, EVID.wrap)
            ok(sl.evidence.join(' ').includes(`EXPIRED ${dshow(exp)} < TODAY NOV 01 1982`),
                `seed ${seed}: the strip did not print the cross-month comparison in full: ${JSON.stringify(sl.evidence)}`)
        }
    }
    // 4) THE STRIP CORRIDOR — the quote zone must fit between the strip's own
    //    texts (left control ends x≈254, right note starts x≈613) and stay
    //    inside the strip band (y 400..440), clear of the slip and bubble.
    const halfW = EVID.wrap * EVID.size * CHAR / 2
    ok(EVID.cx - halfW >= 254 && EVID.cx + halfW <= CW - 14, `the evidence corridor ${Math.round(EVID.cx - halfW)}..${Math.round(EVID.cx + halfW)} runs into the strip's own texts`)
    ok(EVID.y >= CHS - STRIP_H + 4 && EVID.y + EVID.line <= CHS - 8, `the evidence rows y=${EVID.y}/${EVID.y + EVID.line} leave the strip band`)
    ok(EVID.y >= SLIP.y + SLIP.h + 8, `the evidence zone y=${EVID.y} crowds the deduction slip (bottom ${SLIP.y + SLIP.h})`)
    // 5) PAPER WEIGHT — the settle law: a real drop, a monotone landing,
    //    small enough that papers never leave their home row, short enough
    //    to finish before the next scripted stamp (84 ticks).
    ok(SETTLE.dy(SETTLE.ticks) <= -8, `papers do not actually drop (start dy ${SETTLE.dy(SETTLE.ticks)})`)
    ok(SETTLE.dy(0) === 0 && SETTLE.dy(-1) === 0, 'settled papers must rest at dy 0')
    let mono = true, prev = SETTLE.dy(SETTLE.ticks)
    for (let t = SETTLE.ticks - 1; t >= 0; t--) { const v = SETTLE.dy(t); if (v < prev) mono = false; prev = v }
    ok(mono, 'the settle wobbled — dy must land monotonically')
    // 5b) #2021 THE INSPECTOR STAYS — the read window: the booth's case must
    //     outlive its ink long enough to FINISH reading — ink 30 + pin + drop
    //     must reach 2 s — while the full judged hold stays inside the
    //     papersplay drop window (3.4 s = 210 ticks). Cutting the pin early
    //     with a fresh ruling is the input law, not a break.
    ok(QUOTE.hold >= 120, `the pin (${QUOTE.hold} ticks) is shorter than a 2 s read window`)
    ok(30 + QUOTE.hold + SETTLE.ticks <= 204, `judged hold ${30 + QUOTE.hold + SETTLE.ticks} ticks outruns the drop window`)
    ok(Math.abs(SETTLE.dy(SETTLE.ticks)) <= PAPERS.h / 4 && SETTLE.ticks >= 6 && SETTLE.ticks <= 30,
        `settle out of its envelope (top ${SETTLE.dy(SETTLE.ticks)}px, ${SETTLE.ticks} ticks)`)
}

// ------------------------------- #2130 THE STRIP SPEAKS THE PAPER'S DATES ----
section('THE STRIP SPEAKS THE PAPER\'S DATES (#2130) — no serials in evidence, every date token is printed, the corridor still fits')
{
    // #1891 gave the papers and the wall month names, but the booth itself kept
    // testifying in serials (`EXPIRED 1982.10.31 < TODAY …`) — a format the
    // player never sees printed on any surface. #2130: every date the evidence
    // speaks is dshow, the same shape the paper and wall lines print; `dfmt`
    // survives as the machine serial (harness pins, DEV probe), out of the
    // player's sight by law.
    const SERIAL = /\d{4}\.\d{1,2}\.\d{1,2}/
    let expired = 0, idreq = 0, curfew = 0, clipped = 0, longest = 0, longestEv = ''
    for (const seed of SEEDS) {
        for (const day of genWeek(seed).days) {
            for (const a of day.queue) {
                const v = decide(viewOf(day, a))
                const pp = a.person.passport
                for (const x of v.violations) {
                    ok(!SERIAL.test(x.evidence), `seed ${seed} d${day.n}: evidence carries a serial no booth surface prints: "${x.evidence}"`)
                    if (x.evidence.length > longest) { longest = x.evidence.length; longestEv = x.evidence }
                    if (x.rule === 'EXPIRED') { expired++; ok(x.evidence === `EXPIRED ${dshow(pp.expiry)} < TODAY ${dshow(day.date)}`, `seed ${seed} d${day.n}: EXPIRED quote is not the printed shape: "${x.evidence}"`) }
                    if (x.rule === 'IDREQ') { idreq++; ok(x.evidence === `ADULT (DOB ${dshow(pp.dob)}) WITHOUT ID CARD`, `seed ${seed} d${day.n}: IDREQ quote is not the printed shape: "${x.evidence}"`) }
                    if (x.rule === 'CURFEW') { curfew++; ok(x.evidence === `EXPIRES ${dshow(pp.expiry)} — CURFEW WANTS 7 DAYS OF GRACE`, `seed ${seed} d${day.n}: CURFEW quote is not the printed shape: "${x.evidence}"`) }
                    // token fidelity — every NAME DD YYYY the quote testifies to is
                    // ALSO printed at the booth: the passport's EXPIRES/DOB line or
                    // the wall header. The booth may not cite a date it never shows.
                    if (pp) {
                        for (const tok of x.evidence.match(/[A-Z]{3} \d{2} \d{4}/g) || []) {
                            ok(tok === dshow(pp.expiry) || tok === dshow(pp.dob) || tok === dshow(day.date),
                                `seed ${seed} d${day.n}: evidence cites ${tok}, printed nowhere at the booth: "${x.evidence}"`)
                        }
                    }
                    // the real corridor law: no quote across the sweep may end in
                    // wrapQuote's ellipsis (the old length/2-line pins passed a
                    // spliced "...").
                    const q = stampLines({ verdict: 'deny', ok: true, action: 'deny', why: x.rule, evidence: x.evidence }, EVID.wrap)
                    if (q.evidence.some((ln) => ln.endsWith('...'))) clipped++
                }
            }
        }
    }
    ok(expired >= SEEDS.length, `only ${expired} EXPIRED quotes fired — the day-6 signature paper must exist on every seed`)
    ok(idreq >= 1, 'the sweep never fired IDREQ — its printed-shape law has no witness')
    ok(curfew >= 1, 'the sweep never fired CURFEW — its printed-shape law has no witness')
    ok(clipped === 0, `${clipped} quotes outgrew the corridor and were clipped with "..."`)
    ok(longest <= EVID.wrap, `the longest evidence (${longest} chars, "${longestEv}") outgrew the wrap (${EVID.wrap})`)
    // the machine serial survives for the harness — the player just never reads it.
    ok(dfmt({ y: 1982, m: 10, d: 27 }) === '1982.10.27', 'dfmt died — the machine serial the harness reads is gone')
    console.log(`  ..    ${expired + idreq + curfew} dated quotes across every seed print the paper's own shape; longest ${longest}/${EVID.wrap}; zero serials, zero clips`)
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
                    ok(ev && /HAIR|FACE|GLASSES|FACIAL HAIR|BROWS|MOUTH/.test(ev.evidence),
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
    // #1972 PORTRAIT-DETAIL: every compared feature must actually FORGE at
    // least once across the sweep, and its denial must name it — a sixth
    // feature that never appears in a violation is a rule written in pencil.
    const staged = {}
    for (const seed of SEEDS) {
        for (const day of genWeek(seed).days) {
            for (const a of day.queue) {
                if (a.breakRule !== 'PORTRAIT' || !a.person.passport) continue
                for (const f of FEATURES) {
                    if (a.person.face[f] === a.person.passport.photo[f]) continue
                    staged[f] = (staged[f] || 0) + 1
                    const ev = decide(viewOf(day, a)).violations.find((x) => x.rule === 'PORTRAIT')
                    ok(ev && ev.evidence.length > 4, `seed ${seed} day ${day.n}: ${f} broke but no evidence printed`)
                }
            }
        }
    }
    for (const f of FEATURES) ok((staged[f] || 0) > 0, `feature ${f} never forged across ${SEEDS.length} weeks — the eye never gets to use it`)
    console.log(`  ..    all ${FEATURES.length} features forged: ${FEATURES.map((f) => `${f}=${staged[f] || 0}`).join(' ')}`)
    // the wall owes PORTRAIT exactly one line: the day-7 fit (y=352 of the
    // 358 law since #1943; 356 before) silently degrades the moment this text
    // wraps
    ok(ruleLines(RULES.PORTRAIT.text) === 1, `PORTRAIT prints in ${ruleLines(RULES.PORTRAIT.text)} lines — a two-line law buries the wanted sheet`)
    // #1972 PORTRAIT-DETAIL: the zoom-crop law, pure arithmetic — the head
    // centers in its frame, the widest head fits inside the clip, and the
    // crop is provably BIGGER than the old flat-0.6 miniature it replaced.
    ok(Math.abs(PHOTO.ox + PHOTO.s * 55 - PHOTO.w / 2) <= 1, `the zoom-crop head is off-center (${PHOTO.ox}+${PHOTO.s}*55 vs ${PHOTO.w / 2})`)
    ok(PHOTO.ox + PHOTO.s * (55 - 34) >= 0 && PHOTO.ox + PHOTO.s * (55 + 34) <= PHOTO.w, 'the widest head escapes the photo frame — the clip would cut the face itself')
    // #1943 PORTRAIT LEGIBILITY: the clip law admits s ~0.97; the photo rides
    // near that ceiling so the head fills its frame like the original's. These
    // floors are the ratchet — the old flat 0.6 and the 0.75 mid-crop both fail.
    ok(PHOTO.s >= 0.85, `photo scale ${PHOTO.s} is not the #1943 deep zoom (>=0.85 required)`)
    ok(PHOTO.s * 68 >= 54, `widest head reads ${PHOTO.s * 68}px — below the 54px legibility floor (#1943)`)
    // #1943 ITEM 4: a PORTRAIT witness must be READABLE in one corridor line —
    // every directional diff string fits EVID.wrap (worst today: SIDE-LEFT vs
    // SIDE-RIGHT at 42 chars). A longer phrase would wrap-truncate the quote.
    for (const bit of [0, 1]) {
        for (const g of ['style', 'narrow', 'glasses', 'must', 'brow', 'mouth']) {
            const face = { style: bit, narrow: bit, glasses: bit, must: bit, brow: bit, mouth: bit }
            const photo = { ...face, [g]: 1 - bit }
            for (const s of portraitDiffs(face, photo))
                ok(s.length <= EVID.wrap, `PORTRAIT evidence "${s}" is ${s.length} chars — past the ${EVID.wrap}-char corridor (${EVID.size}px x CHAR fits ${Math.floor((EVID.wrap) * EVID.size * CHAR)}px on one line)`)
        }
    }
    console.log(`  ..    ${forged} forges each broke exactly one feature, ${aged} aged photos stayed legal, every break named itself on the wall`)
}

// ------------------------------------------------------ #1979 REGULARS ----
section('THE LINE HAS REGULARS (#1979) — authored faces that come back')
{
    // The cast is hand-authored: complete descriptors, distinct identities,
    // and every compared feature exercised by the cast alone (both binary
    // values, all four haircuts) — the wall teaches faces, not noise.
    ok(REGULARS.length >= 6, `only ${REGULARS.length} regulars — the original's neighborhood is a dozen faces deep`)
    const castIds = new Set(), castVecs = new Set(), castMarks = new Set()
    for (const c of REGULARS) {
        ok(c.id && c.name && c.mark, `cast entry without id/name/mark: ${JSON.stringify(c.id)}`)
        ok(['scar', 'mole', 'wrinkle', 'ear', 'freckles', 'patch'].includes(c.mark), `unknown signature mark ${c.mark}`)
        // #1997 PERSONAL SPEECH — every neighbor carries its own two lines:
        // a greeting for the week's first walk-up, a callback for the return.
        ok(c.lines && c.lines.greet && c.lines.again, `cast ${c.id} has no personal lines`)
        ok(!castIds.has(c.id), `duplicate cast id ${c.id}`); castIds.add(c.id)
        ok(!castMarks.has(c.mark), `two regulars share the mark ${c.mark} — signatures must be distinct`); castMarks.add(c.mark)
        for (const f of FEATURES) ok(c.face[f] === 0 || c.face[f] === 1 || f === 'style', `cast ${c.id} feature ${f} not a real roll`)
        for (const k of ['skin', 'hairC', 'shirtC']) ok(Number.isInteger(c.face[k]), `cast ${c.id} color ${k} missing`)
        ok(c.ageYears >= 18, `cast ${c.id} is a child at the window but authored as an adult`)
        ok(c.height >= 140 && c.height <= 200 && c.weight >= 40 && c.weight <= 140, `cast ${c.id} body stats off the scale's world`)
        castVecs.add(FEATURES.map((f) => c.face[f]).join(''))
    }
    ok(castVecs.size === REGULARS.length, 'two regulars share a feature vector — recognizable faces must differ where the law looks')
    for (const f of ['narrow', 'glasses', 'must', 'brow', 'mouth'])
        ok(new Set(REGULARS.map((c) => c.face[f])).size === 2, `feature ${f} never varies across the cast`)
    ok(new Set(REGULARS.map((c) => c.face.style)).size === 4, 'the cast does not cover all four haircuts')

    // Recurrence + identity + legality, every seed.
    let appearances = 0
    const seatsWalked = new Set()
    // #2003 THREAD continuity: a face's topic is planted on its greeting
    // visit (hooked) and paid off on its return (paid) — the thread keys are
    // seed:regular, so the payoff must follow the plant in the SAME week.
    const hooked = new Set()
    const paid = new Set()
    for (const seed of SEEDS) {
        const w = genWeek(seed)
        const arc = arcForWeek(seed)
        const byCast = {}
        // #1997 THE ROTATING WINDOW law: the week meets cast[s..s+3] (mod 6)
        // — days 2..5 each carry one seat, days 6,7 are the return of seats
        // s, s+1. A flattened rotation (seed ignored) is the same four faces
        // forever: the sweep-wide seatsWalked witness below kills it.
        const weekSeats = new Set()
        for (const day of w.days) {
            const regs = day.queue.filter((a) => a.person.regular)
            // #2012 THE CROWDED RETURN: one authored walk days 2-5, TWO on
            // the return days (the head returning, the tail greeting), none
            // day 1. A day that carries one regular on day 6 has lost its
            // crowd; three would mean the tail walked twice in one shift.
            const want = day.n === 1 ? 0 : day.n <= 5 ? 1 : 2
            ok(regs.length === want,
                `seed ${seed} day ${day.n}: ${regs.length} regulars — days 2-5 one, days 6-7 two (the crowded return)`)
            ok(day.queue.length === day.rules.length + 4,
                `seed ${seed} day ${day.n}: queue ${day.queue.length} vs law ${day.rules.length + 4} — a regular grew the line`)
            // #2012 the crowded day speaks BOTH ways: a return (or the wall's
            // arc pair) and a fresh greeting share the shift — the original's
            // dense line, proven on the day's own voices.
            if (day.n >= 6) {
                const voices = regs.map((a) => (a.person.say && a.person.say[0] === 'YOU AGAIN.' ? 'again' : 'greet'))
                ok(voices.includes('greet') && voices.includes('again'),
                    `seed ${seed} day ${day.n}: the crowded shift lost a voice — ${JSON.stringify(voices)} (a return and a hello must share the day)`)
            }
            for (const a of regs) weekSeats.add(a.person.regular)
            // #1997 purity everywhere, not just the arc day: personal speech
            // is atmosphere on EVERY day of the week. #1988: `seize` rides the
            // strip too — the argue line is decor with a witness already on the
            // wall; stripping it must never move a verdict.
            for (const a of day.queue) {
                const v = viewOf(day, a)
                // #2080: markStep joins the stripped decor — the verdict may
                // not know whether a neighbour's mark has aged.
                const stripped = { ...v, person: { ...v.person, say: undefined, seize: undefined, face: v.person.face && { ...v.person.face, markStep: undefined }, passport: v.person.passport && { ...v.person.passport, photo: v.person.passport.photo && { ...v.person.passport.photo, markStep: undefined } } } }
                ok(decide(v).verdict === decide(stripped).verdict, `seed ${seed} day ${day.n}: say-line leaked into the verdict`)
            }
            for (const a of regs) {
                appearances++
                const c = REGULARS.find((k) => k.id === a.person.regular)
                ok(!!c, `seed ${seed} day ${day.n}: unknown cast id ${a.person.regular}`)
                if (!c) continue
                seatsWalked.add(c.id)
                byCast[c.id] = (byCast[c.id] || 0) + 1
                ok(a.person.passport.name === c.name, `seed ${seed} day ${day.n}: ${a.person.passport.name} claims the face of ${c.name}`)
                // the identity law: same person, same face — every descriptor
                // AND the signature mark, at the counter and in the photo.
                // #2080 the ONE allowed photo drift is the aged-photo trap:
                // the grey print of the same face (time, not identity). The
                // trap rides ONLY hairC, only for the day-7 head, and colors
                // never convict — the fairness prover grades it anyway.
                const agedTrap = a.trap === 'PORTRAIT'
                for (const f of [...FEATURES, 'skin', 'hairC', 'shirtC']) {
                    ok(a.person.face[f] === c.face[f], `seed ${seed} day ${day.n}: ${c.id} re-rolled ${f} — a regular is authored, not rolled`)
                    if (f === 'hairC' && agedTrap) ok(a.person.passport.photo.hairC === GREY && c.face.hairC !== GREY,
                        `seed ${seed} day ${day.n}: ${c.id}'s trap photo is not the grey print of a dark-haired neighbour`)
                    else ok(a.person.passport.photo[f] === c.face[f], `seed ${seed} day ${day.n}: ${c.id}'s photo drifted on ${f}`)
                }
                ok(a.person.face.mark === c.mark && a.person.passport.photo.mark === c.mark,
                    `seed ${seed} day ${day.n}: ${c.id} lost or grew its signature mark`)
                // #1997 SPEECH SHAPE: greet on the week's first walk-up,
                // YOU AGAIN + personal callback on the return; the arc turn
                // keeps the canonical Jorji pair (the wall's drama, universal).
                // #2003 THE LONG CONVERSATION deepens each beat: the greeting
                // carries its hook (2 lines), the return pays the topic off
                // (3 lines) — a thread, not two orphan sentences.
                const say = a.person.say
                const isArcTurn = day.n === arc.day && c.id === arc.id
                ok(Array.isArray(say) && say.length >= 1, `seed ${seed} day ${day.n}: ${c.id} stood silent at the glass — authored faces speak`)
                if (isArcTurn) {
                    // #1988 REPERTOIRE: the protest rides the chapter — the law
                    // is now the AUTHORED SET (canonical / turnAlt), not one line.
                    ok(say.length === 2 && say[0] === 'YOU AGAIN.' && say[1] === turnLineFor(c, seed) && /\.\.\./.test(say[1]),
                        `seed ${seed} day ${day.n}: the turn lost its canonical pair — ${JSON.stringify(say)}`)
                } else if (day.n === firstVisitDay(seed, REGULARS.findIndex((k) => k.id === c.id))) {
                    ok(say.length === 2 && say[0] === c.lines.greet && say[1] === c.lines.hook,
                        `seed ${seed} day ${day.n}: ${c.id}'s first walk-up forgot its greeting thread — ${JSON.stringify(say)}`)
                    hooked.add(`${seed}:${c.id}`)
                } else {
                    ok(say.length === 3 && say[0] === 'YOU AGAIN.' && say[1] === againLineFor(c, seed) && say[2] === c.lines.follow,
                        `seed ${seed} day ${day.n}: ${c.id}'s return forgot its payoff — ${JSON.stringify(say)}`)
                    paid.add(`${seed}:${c.id}`)
                }
                // Legality (#1983 amended): the neighborhood is honest — decide
                // and judge BOTH approve a regular — with exactly one exception
                // per week: the ARC entrant on their turn day, whom the wall
                // convicts (name + number on the sheet) while every paper stays
                // clean. The ARC section grades that exception in full.
                const d = decide(viewOf(day, a))
                const j = judge({ truth: a.truth, person: a.person, rules: day.rules, date: day.date, allowed: day.allowed, scale: a.scale })
                if (isArcTurn) {
                    ok(d.verdict === 'deny' && j.verdict === 'deny',
                        `seed ${seed} day ${day.n}: ${c.name}'s turn did NOT convict — booth ${d.verdict}, truth ${j.verdict}`)
                } else {
                    ok(d.verdict === 'approve' && j.verdict === 'approve',
                        `seed ${seed} day ${day.n}: ${c.name} denied — ${JSON.stringify(d.violations)}`)
                    ok(a.truth.wanted === false, `seed ${seed} day ${day.n}: a regular was planted wanted off the arc`)
                }
                ok(day.queue.filter((x) => x.person.passport && x.person.passport.name === c.name).length === 1,
                    `seed ${seed} day ${day.n}: a random twin of ${c.name} walked the same line`)
            }
        }
        // #2012 amended WINDOW LAW: the week meets SIX seats — offsets 0..3
        // greet days 2-5, offsets 4,5 greet on the crowded days 6,7 — and
        // seats s, s+1 RETURN on days 6, 7. Order on the crowded day is the
        // law too: the returning head first, the greeting tail after.
        const allSix = new Set(REGULARS.map((c) => c.id))
        ok(weekSeats.size === REGULARS.length && [...weekSeats].every((id) => allSix.has(id)),
            `seed ${seed}: week met ${weekSeats.size}/${REGULARS.length} seats (${[...weekSeats].join(',')}) — the crowded return must meet the whole neighborhood`)
        ok(REGULARS[seed % REGULARS.length].id === w.days[1].queue.find((a) => a.person.regular).person.regular &&
           REGULARS[seed % REGULARS.length].id === w.days[5].queue.find((a) => a.person.regular).person.regular,
            `seed ${seed}: the window head does not walk days 2 and 6 — the arc's stage collapsed`)
        for (const [dn, offHead, offTail] of [[6, 0, 4], [7, 1, 5]]) {
            const regs = w.days[dn - 1].queue.filter((a) => a.person.regular).map((a) => a.person.regular)
            ok(regs[0] === REGULARS[(seed + offHead) % REGULARS.length].id &&
               regs[1] === REGULARS[(seed + offTail) % REGULARS.length].id,
                `seed ${seed}: day ${dn} carries ${JSON.stringify(regs)} — the crowded return is seat s+${offHead} returning, seat s+${offTail} crowding`)
        }
        const back = Object.entries(byCast).filter(([, n]) => n >= 2)
        ok(back.length === 2, `seed ${seed}: ${back.length} seats came back twice — exactly the window head two (s, s+1) return`)
    }
    ok(appearances >= SEEDS.length * 8, `only ${appearances} regular appearances across ${SEEDS.length} weeks — the injection is theatre`)
    ok(seatsWalked.size === REGULARS.length, `${seatsWalked.size}/${REGULARS.length} cast seats ever walked across the sweep — a seat nobody meets is dead letter`)
    ok(new Set(REGULARS.map((c) => c.lines.greet)).size === REGULARS.length, 'two regulars share a greeting — a neighborhood says hello six ways')
    ok(new Set(REGULARS.map((c) => c.lines.again)).size === REGULARS.length, 'two regulars share a callback — the booth remembers six ways')
    // #2003 THE LONG CONVERSATION: every line the cast carries is its own —
    // six faces × four beats, twenty-four distinct sentences, no echoes —
    // and every paid-off topic was planted in the same week. An arc face's
    // hook is the one unpaid thread: its return belonged to the wall, not
    // to breakfast.
    const allLines = REGULARS.flatMap((c) => [c.lines.greet, c.lines.hook, c.lines.again, c.lines.follow])
    ok(allLines.length === REGULARS.length * 4 && new Set(allLines).size === allLines.length,
        'the cast threads repeat a sentence — 24 authored lines, 24 different voices required')
    ok([...paid].every((k) => hooked.has(k)), 'a payoff was spoken for a topic never planted — a fabricated memory')
    // A planted topic goes unpaid only two honest ways: its face TURNED (the
    // arc return belongs to the wall, not to breakfast) or its seat walks ONCE
    // a week. Since #2012 the once-a-week seats are s+2..s+5 — days 2-5's tail
    // AND the crowded days' greeting tail — they carry their topic into next
    // week (the crowded-return law, not a broken thread). Only the window's
    // head-two (s, s+1) return; only s+1 is owed a payoff.
    const onceWeek = (s, id) => [2, 3, 4, 5].some((off) => id === REGULARS[(s + off) % REGULARS.length].id)
    const excused = (k) => { const [sStr, id] = k.split(':'); return id === arcForWeek(Number(sStr)).id || onceWeek(Number(sStr), id) }
    const unpaid = [...hooked].filter((k) => !paid.has(k))
    ok(unpaid.every(excused), `a twice-a-week face planted a topic the line never answered: ${JSON.stringify(unpaid.filter((k) => !excused(k)))}`)
    ok(paid.size >= SEEDS.length, `${paid.size} threads paid across ${SEEDS.length} weeks — at least one per week, or the conversation is theatre`)
    console.log(`  ..    ${appearances} authored appearances across ${SEEDS.length} weeks; every week had faces that came back`)
}

// ---------------------------------------------------------- #1983 ARC ----
section('THE ARC (#1983) — one regular turns wanted, Jorji-style')
{
    let turns = 0
    for (const seed of SEEDS) {
        const w = genWeek(seed)
        const arc = arcForWeek(seed)
        // the arc is a construction: cast[seed mod 4], turning on the day its
        // FIRST visit returns (day 6 for every seed) — WANTED must be awake.
        ok(REGULARS[seed % REGULARS.length].id === arc.id, `seed ${seed}: arc picked the wrong cast seat`)
        ok(arc.day === firstVisitDay(seed, seed % REGULARS.length) + 4 && arc.day === 6,
            `seed ${seed}: arc day ${arc.day} — the turn must be the return (6), when WANTED is on the wall`)
        ok(w.days[arc.day - 1].rules.includes('WANTED'), `seed ${seed}: arc day has no WANTED law — the turn would be invisible`)
        let arcHit = 0
        for (const day of w.days) {
            for (const a of day.queue) {
                if (!a.person.arc) continue
                arcHit++
                const pp = a.person.passport
                ok(day.n === arc.day && a.person.regular === arc.id, `seed ${seed}: arc flag walked on day ${day.n}`)
                // the case is the WALL's: sheet pairs the authored name with the
                // number carried that day; decide names exactly one violation.
                const pair = day.wanted.find((x) => x.name === pp.name && x.id === pp.id)
                ok(!!pair, `seed ${seed}: the arc turn never reached the bulletin — invisible criminal, unfair by furniture`)
                const d = decide(viewOf(day, a))
                ok(d.verdict === 'deny' && d.violations.length === 1 && d.violations[0].rule === 'WANTED',
                    `seed ${seed}: the turn carries more than the wall's case — ${JSON.stringify(d.violations)}`)
                ok(/^WANTED: .+ #\d+$/.test(d.violations[0].evidence), `seed ${seed}: the turn's witness is not the printed pair: ${d.violations[0].evidence}`)
                // pull-the-witness: erase the sheet entry and the SAME papers
                // approve — proving the face, the photo and every document are
                // honest. The trap is recognition, the proof is the number.
                const bare = { ...viewOf(day, a), wanted: day.wanted.filter((x) => !(x.name === pp.name && x.id === pp.id)) }
                ok(decide(bare).verdict === 'approve', `seed ${seed}: the arc's papers convict without the sheet — ${JSON.stringify(decide(bare).violations)}`)
                // the Jorji beat: the returning face opens its mouth
                ok(Array.isArray(a.person.say) && a.person.say.length === 2 && a.person.say[0] === 'YOU AGAIN.' && /\.\.\./.test(a.person.say[1]),
                    `seed ${seed}: the turn lost its lines — ${JSON.stringify(a.person.say)}`)
                turns++
            }
        }
        ok(arcHit === 1, `seed ${seed}: ${arcHit} arc turns in one week — exactly one, like the campaign's arcs`)
        // the first visit is the innocent one: same face, cheerful, approved
        // (#1997: and it greets — the honest walk-up the wall will remember).
        const d2 = w.days[arc.day - 5]
        const first = d2.queue.find((a) => a.person.regular === arc.id)
        const arcC = REGULARS.find((k) => k.id === arc.id)
        ok(!!first && !first.person.arc && Array.isArray(first.person.say) && first.person.say.length === 2 &&
           first.person.say[0] === arcC.lines.greet && first.person.say[1] === arcC.lines.hook &&
           decide(viewOf(d2, first)).verdict === 'approve',
            `seed ${seed}: the arc's first visit was not the honest, greeting walk-up it should be remembered as — ${first && JSON.stringify(first.person.say)}`)
        ok(first ? first.truth.wanted === false : false, `seed ${seed}: wanted before the turn — the arc is one beat, not a flag`)
        // the OTHER recurrence (cast[(seed+1) mod LEN], days 3 and 7) just remembers
        const backIdx = (seed + 1) % REGULARS.length
        const backId = REGULARS[backIdx].id
        const d7 = w.days[6]
        const rememberer = d7.queue.find((x) => x.person.regular === backId)
        ok(!!rememberer && !rememberer.person.arc && Array.isArray(rememberer.person.say) && rememberer.person.say.length === 3 &&
           rememberer.person.say[0] === 'YOU AGAIN.' && rememberer.person.say[1] === againLineFor(REGULARS[backIdx], seed) &&
           rememberer.person.say[2] === REGULARS[backIdx].lines.follow,
            `seed ${seed}: day 7's returning face forgot its callback thread — ${JSON.stringify(rememberer && rememberer.person.say)}`)
        ok(decide(viewOf(d7, rememberer)).verdict === 'approve', `seed ${seed}: the plain recidivist was convicted — only the arc turns`)
        // purity: `say` never moves a verdict — every paper of the arc day
        // decides identically with the line stripped off the person.
        for (const a of w.days[arc.day - 1].queue) {
            const v = viewOf(w.days[arc.day - 1], a)
            const stripped = { ...v, person: { ...v.person, say: undefined } }
            ok(decide(v).verdict === decide(stripped).verdict, `seed ${seed}: say-line leaked into the verdict`)
        }
    }
    ok(turns === SEEDS.length, `${turns} turns across ${SEEDS.length} weeks — the arc is not weekly`)
    // #1997 the wall works for the WHOLE cast: with six seats and the arc
    // riding the seed, every seat must get its turn across the sweep — a
    // neighborhood where the same face is always the criminal is four deep.
    ok(new Set(SEEDS.map((s) => arcForWeek(s).id)).size === REGULARS.length,
        'only some cast seats ever turn — the wall must work every face at least once')
    console.log(`  ..    ${turns} turns: familiar faces on the wall, honest papers under them, one memory line for the others`)
}

// ------------------------------------------------ #2080 MARKS AGE ----
section('THE NEIGHBOURHOOD AGES (#2080) — returning marks grow, and one familiar face carries the aged trap')
{
    // 1) markStep: returns age one step, first walk-ups keep the byte-exact
    //    baselines, and the step rides face AND photo symmetrically — the
    //    naive eye walks every descriptor key, so an asymmetric key would
    //    plant a fake trap on an honest paper.
    let agedVisits = 0, trapWeeks = 0
    const agedCast = new Set()
    for (const seed of SEEDS) {
        const w = genWeek(seed)
        const demote = day7Demote(seed)
        const nb = neighbourTrapWeek(seed)
        ok(demote === null || nb, `seed ${seed}: a vacated seat without a neighbour week`)
        if (nb && demote) trapWeeks++
        for (const day of w.days) {
            for (const a of day.queue) {
                const rid = a.person.regular
                if (!rid) continue
                const step = a.person.face.markStep
                ok(step === 0 || step === 1, `seed ${seed} day ${day.n}: markStep ${step} off the ladder`)
                ok(step === a.person.passport.photo.markStep,
                    `seed ${seed} day ${day.n}: markStep asymmetric (face ${step}, photo ${a.person.passport.photo.markStep})`)
                const want = day.n > firstVisitDay(seed, REGULARS.findIndex((k) => k.id === rid)) ? 1 : 0
                ok(step === want, `seed ${seed} day ${day.n}: ${rid} ${want ? 'returned unaged' : 'wore an aged mark on its first walk-up'}`)
                if (step === 1) { agedVisits++; agedCast.add(rid) }
            }
        }
        // 2) the neighbour trap: only the day-7 returning head, only on a
        //    vacated-seat week, grey print over dark authored hair, and the
        //    welcome chime still rings — the honest face IS the hiding place.
        const sched = trapSchedule(seed)
        const d7 = w.days[6]
        const nbTrap = d7.queue.find((x) => x.person.regular && x.trap)
        const headId = REGULARS[(seed + 1) % REGULARS.length].id
        ok(!!nbTrap === !!demote, `seed ${seed}: neighbour trap ${nbTrap ? 'staged without a vacated seat' : 'missing on a vacated week'}`)
        if (nbTrap) {
            ok(nbTrap.person.regular === headId, `seed ${seed}: the trap rode ${nbTrap.person.regular}, not the returning head ${headId}`)
            ok(nbTrap.trap === 'PORTRAIT', `seed ${seed}: the neighbour trap was ${nbTrap.trap}, not the aged-photo species`)
            ok(nbTrap.person.passport.photo.hairC === GREY && nbTrap.person.face.hairC !== GREY, `seed ${seed}: the neighbour's print is not grey-vs-live`)
            ok(nbTrap.person.recall === 'again', `seed ${seed}: the trap walked up a stranger — the welcome must ride with the trap`)
            const v = viewOf(d7, nbTrap)
            const j = judge({ truth: nbTrap.truth, person: nbTrap.person, rules: d7.rules, date: d7.date, allowed: d7.allowed, scale: nbTrap.scale })
            ok(decide(v).verdict === 'approve' && j.verdict === 'approve', `seed ${seed}: the aged neighbour was convicted — colors never convict`)
            ok(naiveDecide(v) === 'deny', `seed ${seed}: the familiar grey print did not bite the naive eye`)
        }
        // 3) the vacated seat BURNS, it does not delete: the day hosts its
        //    scheduled number of traps, the queue keeps its size, and the
        //    demoted species stays covered by an earlier showing (its whole
        //    license to vacate).
        const scheduled = (sched[6].ti !== null ? 1 : 0) + (sched[6].t2 !== null ? 1 : 0)
        ok(d7.queue.filter((x) => x.trap).length === scheduled, `seed ${seed}: day 7 shows ${d7.queue.filter((x) => x.trap).length} traps, schedule says ${scheduled}`)
        ok(d7.queue.length === d7.rules.length + 4, `seed ${seed}: day 7 queue changed size`)
        if (demote) {
            const slot = sched[6][demote === 't1' ? 'ti' : 't2']
            const shown = new Set()
            for (const p of sched) if (p.n <= 6) { if (p.ti !== null) shown.add(TRAPS[p.ti].rule); if (p.t2 !== null) shown.add(TRAPS[p.t2].rule) }
            ok(shown.has(TRAPS[slot].rule), `seed ${seed}: the demoted trap ${TRAPS[slot].rule} had no other showing — coverage is a construction, not a hope`)
        }
    }
    // two returns a week minimum (the crowded return); every face ages
    // across the sweep; and the neighbour trap lands on at least a third
    // of the sweep's neighbour weeks (the seat only vacates when a species
    // is safely re-run — coverage outranks frequency).
    ok(agedVisits >= SEEDS.length * 2, `${agedVisits} aged visits across ${SEEDS.length} weeks — the crowded return lost its steps`)
    ok(agedCast.size === REGULARS.length, `only ${agedCast.size}/${REGULARS.length} cast faces ever aged — the rotation must revisit every neighbour`)
    ok(trapWeeks >= Math.ceil(SEEDS.length / 3), `${trapWeeks} neighbour-trap weeks in ${SEEDS.length} — the familiar face must appear more than once a season`)
    console.log(`  ..    ${agedVisits} aged visits, ${trapWeeks} neighbour-trap weeks, marks riding face and photo together`)
}

// ---------------------------------------------------------- #1989 CROWD ----
section('THE CROWD IS PEOPLE (#1989) — hats, unibrows, earrings, missing teeth, and none of it is evidence')
{
    // 1) the serial law: decor is a PURE function of the passport number —
    //    same number, same hat, every call, and no Math.random anywhere near
    //    it (the section above proves the call site; this proves the shape).
    //    #1996 widened the inputs: purity means same serial + nation + sex,
    //    same decor, forever.
    let pure = true
    for (const pic of [0, 1, 4001, 4002, 777, 123456789, 999999999]) {
        for (const country of COUNTRIES) for (const sex of ['M', 'F']) {
            const a = accFor(pic, country, sex), b = accFor(pic, country, sex)
            if (JSON.stringify(a) !== JSON.stringify(b)) pure = false
            if (!(a.hat >= 0 && a.hat <= 3) || ![a.uni, a.ear, a.gap].every((v) => v === 0 || v === 1)) pure = false
        }
    }
    ok(pure, 'accFor is not a pure, shaped function of (serial, nation, sex)')

    // 2) identity by construction: the SAME decor object is spread into the
    //    photo at birth — face and photo can never disagree — and 3) the
    //    neutrality law: decor moves no verdict. Perturb the LIVE FACE only
    //    (all decor on): the booth still decides exactly as before, and the
    //    truth path agrees. If any rule ever learns to read a hat, every
    //    hatted honest face becomes an unfair paper and this goes red.
    let naked = 0, decorated = 0, combos = new Set(), hatKinds = new Set()
    const fams = { hat: 0, uni: 0, ear: 0, gap: 0 }
    for (const seed of SEEDS) {
        const w = genWeek(seed)
        for (const day of w.days) {
            for (const a of day.queue) {
                const f = a.person.face
                const view = viewOf(day, a)
                const v0 = decide(view).verdict
                const j0 = judge({ truth: a.truth, person: a.person, rules: day.rules, date: day.date, allowed: day.allowed, scale: a.scale }).verdict
                const pf = { ...a.person, face: { ...f, hat: 1, uni: 1, ear: 1, gap: 1 } }
                const v1 = decide({ ...view, person: pf }).verdict
                const j1 = judge({ truth: a.truth, person: pf, rules: day.rules, date: day.date, allowed: day.allowed, scale: a.scale }).verdict
                ok(v1 === v0 && j1 === j0, `seed ${seed} day ${day.n}: decor moved a verdict (${v0}->${v1}) — a hat became evidence`)
                const ph = a.person.passport ? a.person.passport.photo : null
                ok(!ph || ['hat', 'uni', 'ear', 'gap'].every((k) => (f[k] || 0) === (ph[k] || 0)),
                    `seed ${seed} day ${day.n}: decor drifted between face and photo`)
                // Variety is graded on the ROLLED heads only — the regulars'
                // authored decor would mask a flattened hash (three kinds ride
                // on Grubak, Anja and Petr alone; m31 proved it).
                if (!a.person.regular) {
                    for (const k of ['hat', 'uni', 'ear', 'gap']) if (f[k]) fams[k]++
                    if (f.hat) { decorated++; hatKinds.add(f.hat) } else naked++
                    combos.add([f.hat || 0, f.uni || 0, f.ear || 0, f.gap || 0].join(''))
                }
            }
        }
    }
    ok(hatKinds.size === 3, `hat kinds on the line: ${[...hatKinds].join(',')} — the original wears cap, ushanka AND scarf`)
    ok(fams.uni >= 24 && fams.ear >= 24 && fams.gap >= 24, `sparse families ${JSON.stringify(fams)} — the crowd is still combinatorial dust`)
    ok(combos.size >= 12, `only ${combos.size} distinct looks across ${SEEDS.length} weeks — one-offs must multiply`)
    ok(naked > 0, 'nobody walks bare — accessories became a uniform, not a crowd')
    console.log(`  ..    ${decorated}/${decorated + naked} decorated, ${combos.size} looks, families ${JSON.stringify(fams)}`)

    // 4) the cast wears its authored identity: every regular's decor is
    //    authored (not rolled), rides into the photo, and the cast as a
    //    whole spans bare heads, hats, a unibrow, an earring and a gap.
    const castAcc = REGULARS.map((c) => [c.face.hat || 0, c.face.uni || 0, c.face.ear || 0, c.face.gap || 0])
    ok(castAcc.every((v) => v[0] <= 3 && v[1] <= 1 && v[2] <= 1 && v[3] <= 1), 'cast decor off the hat range')
    ok(new Set(castAcc.map((v) => v.join(''))).size === REGULARS.length, 'two regulars share a look — signatures must differ')
    for (const seed of SEEDS) {
        for (const day of genWeek(seed).days) {
            for (const a of day.queue.filter((x) => x.person.regular)) {
                const c = REGULARS.find((k) => k.id === a.person.regular)
                ok(['hat', 'uni', 'ear', 'gap'].every((k) => a.person.face[k] === c.face[k] && a.person.passport.photo[k] === c.face[k]),
                    `seed ${seed} day ${day.n}: ${c.id}'s hat changed by itself — authored decor is identity`)
            }
        }
    }
    ok(new Set(castAcc.map((v) => v[0] > 0 ? 'hatted' : 'bare')).size === 2, 'every regular hatted or every one bare — the neighborhood needs both')
}

// ---------------------------------------------- #1996 THE NATIONS DRESS ----
section('THE CROWD WEARS ITS NATION (#1996) — hats correlate with origin, the host stays mixed')
{
    // The original's line reads as NATIONS: Kirinian workers in flat caps,
    // Antegrian officers kept covered, Veskole fur, Parmenistani wraps, and
    // the women favor the headscarf. Graded as DOMINANCE on rolled heads
    // (regulars excluded — authored decor is identity, not geography), with
    // thresholds with margin so the law can bend without snapping: it must
    // correlate, never uniform. `nation` is the country the clothes were
    // rolled from (truth at birth), never evidence — the neutrality witness
    // above already proves a hat moves no verdict.
    const cell = {}
    for (const seed of SEEDS) {
        for (const day of genWeek(seed).days) {
            for (const a of day.queue) {
                if (a.person.regular || !a.person.passport) continue
                const k = `${a.person.nation}|${a.person.passport.sex}`
                ;(cell[k] = cell[k] || []).push(a.person.face.hat || 0)
            }
        }
    }
    const share = (k, kind) => {
        const hatted = (cell[k] || []).filter((x) => x > 0)
        return { n: hatted.length, s: hatted.length ? hatted.filter((x) => x === kind).length / hatted.length : 0 }
    }
    const home = [
        ['KIRINIA|M', 1, 'Kirinian caps'], ['ANTEGRIA|M', 1, 'Antegrian caps'],
        ['VESKOLE|M', 2, 'Veskole fur'], ['PARMENISTAN|M', 3, 'Parmenistani wraps'],
        ['VESKOLE|F', 2, 'Veskole women in fur'],
        ['KIRINIA|F', 3, 'scarves in the line'], ['ANTEGRIA|F', 3, 'scarves in the line'],
        ['PARMENISTAN|F', 3, 'scarves in the line'], ['ARSTOTZKA|F', 3, 'scarves in the line'],
    ]
    for (const [k, kind, what] of home) {
        const { n, s } = share(k, kind)
        ok(n >= 5 && s >= 0.6, `${what}: ${n} hatted heads, home kind at ${(s * 100).toFixed(0)}% — the crowd does not read as nations`)
    }
    // the host nation stays the mixed one — nations correlate, they never
    // become uniforms (a locked ARSTOTZKA is m33's free ride otherwise).
    const arst = (cell['ARSTOTZKA|M'] || []).filter((x) => x > 0)
    const arstKinds = new Set(arst)
    const arstTop = Math.max(...[1, 2, 3].map((t) => arst.filter((x) => x === t).length))
    ok(arstKinds.size >= 3 && arstTop / arst.length <= 0.75,
        `ARSTOTZKA men: kinds ${[...arstKinds].join(',')} top ${(arstTop / arst.length * 100).toFixed(0)}% — the host must stay the mix`)
    // same number, different nation, different hat: the correlation is in the
    // function, not in seed luck (pins ride serial 4031 — one paper, four nations).
    ok(accFor(4031, 'VESKOLE', 'M').hat === 2 && accFor(4031, 'KIRINIA', 'M').hat === 1 &&
       accFor(4031, 'PARMENISTAN', 'M').hat === 3 && accFor(4031, 'KIRINIA', 'F').hat === 3,
        'serial 4031 stopped dressing by nation — the pins moved')
    console.log(`  ..    ${home.map(([k, kind]) => `${k}:${share(k, kind).s >= 0.9 ? '=' : '~'}${kind}`).join(' ')} + a mixed host`)
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
    // #2130 re-pin: the header prints dshow since #1891 (`OCT 27 1982`, 19
    // chars) but this law still measured the old serial row (17) — the clock
    // was clear of a width the wall no longer prints.
    ok(CLOCK.x - CLOCK.r >= 12 + 'DAY 1   OCT 27 1982'.length * 15 * CHAR + 4, 'the clock crowds the DAY/date line')
    ok(CLOCK.x + CLOCK.r <= PORTRAIT.x - 4, 'the clock runs into the portrait column')
    ok(CLOCK.x + CLOCK.r <= CW - 4 && CLOCK.x - CLOCK.r >= 2, 'the clock runs off the wall')
    console.log('  ..    budget = queue × SEAT (18 s/applicant); 10 s human cadence clears every day of every seed; the naive eye still clears the week; a ~22 s cadence closes day 1 (docked, morning rewound); day 7 dawdles to a deterministic 2-head quota loss; wall clock 08:00→18:00, red = the last hour, monotone, hung clear of chrome and text')
}

// ------------------------------------------------- #1966 THE PAY ECONOMY ----
// The booth earns and spends. Pay law: CFG.PAY rides every CORRECT stamp and
// a write-up forfeits it (the original pays nothing for a penalized entrant).
// Every night settles: soup + heat nightly, rent after nights 3 and 6, and it
// RISES — 30 then 45. Rent unpaid = EVICTION (the original's rule, kept
// exactly); two nights without soup or heat = the original's two-night death;
// a covered night resets its own counter. Missed heads earn nothing, so the
// #1960 clock and the purse bite together. Day 7 is survived only when its
// final slip pays out. Doctrine stays doctrine: autopilot clears with margin,
// the naive eye still clears AND covers every bill, a dawdler who stamps
// nobody falls to money, not just to the quota.
section('THE PAY ECONOMY (#1966) — pay law, bills, eviction, two-night deaths — every seed')
{
    // wage law, live: correct pays, wrong forfeits
    {
        const g = newRun(0)
        step(g, { action: decide(current(g).view).verdict })
        ok(g.credits === CFG.PAY && g.paidToday === CFG.PAY, 'a correct stamp paid nothing')
        step(g, { action: decide(current(g).view).verdict === 'approve' ? 'deny' : 'approve' })
        ok(g.credits === CFG.PAY, 'a wrong call got paid — the write-up pays nothing')
    }
    // the perfect week: income 70 entrants × PAY minus every bill, zero
    // hungry nights, and the last slip shows the final balance
    for (const seed of SEEDS) {
        const gs = newRun(seed)
        const ent = gs.week.days.reduce((x, d) => x + d.queue.length, 0)
        const a = autopilot(gs, 999)
        ok(a.ok, `seed ${seed}: autopilot did not survive the economy (${gs.endWhy})`)
        ok(gs.credits === ent * CFG.PAY - weekCharges(),
            `seed ${seed}: final purse ${gs.credits} != ${ent} entrants × PAY − ${weekCharges()} bills`)
        ok(gs.hungry === 0 && gs.cold === 0, `seed ${seed}: autopilot went hungry/cold — the week cannot be payable`)
        ok(gs.slip && gs.slip.day === 7 && gs.slip.balance === gs.credits, `seed ${seed}: no paid-out slip on night 7`)
    }
    // rent law: due every third night, rising, eviction at the counter —
    // and an eviction never drags the purse below zero
    ok(rentDue(1) === 0 && rentDue(3) === 30 && rentDue(6) === 45, `rent schedule wrong: ${rentDue(1)}/${rentDue(3)}/${rentDue(6)}`)
    ok(rentDue(6) > rentDue(3), 'rent does not rise — there is no squeeze toward the finale')
    {
        const g = newRun(0)
        g.day = 3; g.credits = rentDue(3) - 1
        settle(g)
        ok(g.end === 'lose' && /EVICTED/.test(g.endWhy), `a rent-short night is not eviction: ${g.end} ${g.endWhy}`)
        ok(g.credits === rentDue(3) - 1, `eviction took the purse to ${g.credits} — the apartment comes first, arithmetic always`)
        const paid = newRun(0)
        paid.day = 3; paid.credits = rentDue(3)
        settle(paid)
        ok(paid.end === null && paid.credits === 0 && paid.slip.rent === rentDue(3), 'a paid rent does not clear the purse cleanly')
    }
    // the two-night deaths — and a covered night resets its own counter
    {
        const g = newRun(0); g.credits = 0
        settle(g)
        ok(g.end === null && g.hungry === 1 && g.cold === 1, 'the first unpaid night does not mark hungry+cold')
        settle(g)
        ok(g.end === 'lose' && /STARVED/.test(g.endWhy), `two nights without soup must starve: ${g.end} ${g.endWhy}`)
        const c = newRun(0); c.credits = CFG.SOUP          // eats, freezes, twice
        settle(c); settle(c)
        ok(c.end === 'lose' && /FROZEN/.test(c.endWhy), `two nights without heat must freeze: ${c.end} ${c.endWhy}`)
        const h = newRun(0); h.credits = 0; settle(h)
        h.credits = CFG.SOUP + CFG.HEAT; settle(h)
        ok(h.end === null && h.hungry === 0 && h.cold === 0, 'a covered night must reset hunger and cold')
    }
    // slip honesty: the printed paper equals the purse arithmetic, rent night
    {
        const g = newRun(0)
        g.day = 3; g.credits = 50; g.paidToday = 40
        settle(g)
        const s = g.slip
        ok(s && s.pay === 40 && s.rent === rentDue(3) && s.soup === CFG.SOUP && s.heat === CFG.HEAT
            && s.balance === 50 - rentDue(3) - CFG.SOUP - CFG.HEAT, `slip arithmetic lies: ${JSON.stringify(s)}`)
    }
    // the dawdler dies by money too: stamp nobody, and night two is the wall
    // (soup+heat with no income) — the economy catches what the quota missed
    {
        const g = newRun(0)
        let guard = 0
        while (!g.end && g.day <= 2 && guard++ < 12) tick(g, dayTicks(g.week.days[g.day - 1]))
        ok(g.end === 'lose' && /STARVED|FROZEN|EVICTED/.test(g.endWhy), `a booth that stamps nobody ended ${g.end || 'never'} (${g.endWhy}) — money must bite`)
    }
    // slack doctrine with money: the naive eye clears the week AND covers
    // every bill — sloppy judgment must still afford soup
    for (const seed of SEEDS.slice(0, 6)) {
        const gs = newRun(seed)
        let guard = 0, shortNights = 0
        while (!gs.end && guard++ < 400) {
            step(gs, { action: naiveDecide(current(gs).view) })
            shortNights += gs.events.filter((e) => e.type === 'pay' && (e.hungry || e.cold)).length
            gs.events.length = 0
        }
        ok(gs.end === 'win', `seed ${seed}: the naive eye ended ${gs.end || 'stalled'} — the economy broke the slack rule`)
        ok(shortNights === 0, `seed ${seed}: the naive eye missed ${shortNights} bill(s) — honest pace must still pay rent`)
        ok(gs.credits > 0, `seed ${seed}: the naive week closed at ${gs.credits} — no slack in the purse`)
    }
    // turned-away heads are unpaid heads: a close settles only what was earned
    {
        const g = newRun(0)
        g.idx = 3; g.credits = 15; g.paidToday = 15; g.clock = 1
        tick(g, dayTicks(g.week.days[0]))
        const pay = g.events.find((e) => e.type === 'pay')
        ok(pay && pay.pay === 15 && pay.balance === 15 - CFG.SOUP - CFG.HEAT, `a close paid beyond the earned: ${JSON.stringify(pay)}`)
    }
    // the slip's corner of the booth: under the ID card, above the strip,
    // inside the wall — and clear of the witness line the stamp paints at y=296
    ok(SLIP.y >= ID.y + ID.h + 2, 'the slip covers the ID card')
    ok(SLIP.y + SLIP.h <= CHS - STRIP_H, 'the slip is under the controls strip')
    ok(SLIP.x + SLIP.w <= CW - 4, 'the slip runs off the canvas')
    ok(SLIP.y >= 296 + 6, 'the slip crowds the stamp witness line')
    // #1968 PHONE LEGIBILITY — the slip rows are a size LAW, not a taste:
    // at 390px the canvas scales ~0.57, so 10px rows land near 6px. The
    // five-row stack (PAY/RENT/SOUP/HEAT/BALANCE) must ride >=11px on a
    // >=13px pitch and still end inside the paper (ink ~3px past baseline).
    ok(SLIP.size >= 11 && SLIP.pitch >= 13, `slip rows ${SLIP.size}px/${SLIP.pitch} are below the #1968 phone law (11/13)`)
    ok(SLIP.row0 + 4 * SLIP.pitch + 3 <= SLIP.h, `five-row stack ends ${SLIP.row0 + 4 * SLIP.pitch + 3} — past the slip height ${SLIP.h}`)
    // the hungry/cold markers name their own row and cannot crowd the value
    // column: key + longest value must fit between the 10px margins.
    {
        const widest = Math.max('NO SOUP'.length, '-45'.length, `${50 + 3 * CFG.HEAT}`.length)
        ok('BALANCE'.length * SLIP.size * CHAR + 20 <= SLIP.w, 'the BALANCE key+value run off the slip')
        ok('SOUP'.length * SLIP.size * CHAR + 12 + widest * SLIP.size * CHAR + 20 <= SLIP.w, 'a slip row crowds its own value column at #1968 size')
    }
    // #1968 RENT AHEAD — the wall prints tonight's rent on rent nights, and
    // it must live in the empty corridor: below the SCALE box, above the
    // strip, inside the wall column's width (nothing else paints there).
    ok(RENT.y > SCALE.y + SCALE.h && RENT.y < CHS - STRIP_H, 'the rent note left its corridor (scale bottom..strip top)')
    ok('RENT DUE TONIGHT -45CR'.length * RENT.size * CHAR + RENT.x <= 250, 'the rent note runs into the counter column')
    // #1968 THE WAGE FLICKER — the +5 band rides inside the strip and stays
    // clear of the CORRECT/MISTAKE note (which right-starts by x≈613).
    ok(PAYFX.base - PAYFX.rise >= CHS - STRIP_H, 'the wage flicker rises out of the strip band')
    ok(PAYFX.x >= 230, 'the wage flicker sits on top of the CR readout (longest CR text ends by x≈228)')
    ok(PAYFX.x + '+5'.length * 12 * CHAR <= 613, 'the wage flicker crowds the CORRECT/MISTAKE note')
    // #1968 THE TAXONOMY OF LOSING — purse deaths (rent/soup/heat) read as
    // money on the end screen; the badge (three mistakes) and the quota do
    // not. The staging picks its heading by this law, so the law is pinned.
    ok(isMoneyDeath('RENT UNPAID — EVICTED (needed 30, had 12)'), 'EVICTED is not staged as a money death')
    ok(isMoneyDeath('NO SOUP TWO NIGHTS — STARVED') && isMoneyDeath('NO HEAT TWO NIGHTS — FROZEN'), 'starved/frozen are not staged as money deaths')
    ok(!isMoneyDeath('DAY 3: THREE MISTAKES'), 'the badge death is staged as money')
    ok(!isMoneyDeath('GATE CLOSED — 2 STILL IN LINE, QUOTA UNMET') && !isMoneyDeath('THE WEEK SURVIVED') && !isMoneyDeath(''), 'quota/win/none staged as money')
    // live provability: a purse that cannot cover rent really ends as an
    // isMoneyDeath why (the staging and the sim share the one classifier).
    {
        const g = newRun(0)
        g.day = 3; g.credits = rentDue(3) - 1
        settle(g)
        ok(g.end === 'lose' && isMoneyDeath(g.endWhy), 'eviction endWhy does not classify as money — staging would lie')
        const h = newRun(0)
        for (let i = 0; i < CFG.STRIKE_MAX; i++) step(h, { action: decide(current(h).view).verdict === 'approve' ? 'deny' : 'approve' })
        ok(h.end === 'lose' && !isMoneyDeath(h.endWhy), 'three mistakes classified as money — the taxonomy blurred')
    }
    console.log(`  ..    PAY ${CFG.PAY}/correct (write-up unpaid); soup ${CFG.SOUP} + heat ${CFG.HEAT} nightly; rent ${rentDue(3)}→${rentDue(6)} and unpaid = EVICTED; two-night STARVED/FROZEN; autopilot closes at ${70 * CFG.PAY - weekCharges()} with zero hungry nights; the naive eye survives every bill; the stampless booth starves night two; slip arithmetic + corner clearance pinned`)
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
    const g4 = newRun(2)
    g4.credits += 1
    ok(stateHash(g4) !== stateHash(newRun(2)), 'stateHash ignores the purse (#1966: credits are discrete booth state)')
    const g5 = newRun(2)
    g5.hungry = 1
    ok(stateHash(g5) !== stateHash(newRun(2)), 'stateHash ignores hunger')
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
    // #1983 the callback bubble's lane is law too: the field sits clear of
    // the slip, the strip, and the stamp's witness line (baseline y=296),
    // and the authored lines fit the field at 10px monospace. #1997 scans
    // every personal line the cast carries, not just the canonical pair.
    // #2003 extends the scan to the thread's hook/follow beats and pins the
    // growth law: 1–2-line bubbles stay byte-identical to the h=34 field,
    // the 3-line return grows it to 47 — still clear of the strip.
    ok(BUBBLE.x + BUBBLE.w <= SLIP.x - 4, 'the speech bubble runs into the deduction slip')
    ok(BUBBLE.y + BUBBLE.h <= CHS - STRIP_H - 6 && BUBBLE.y >= 300, 'the speech bubble crowds the strip or the witness line')
    ok(BUBBLE.x >= PORTRAIT.x - 4 && BUBBLE.x + BUBBLE.w <= CW - 4 && BUBBLE.y >= ID.y + ID.h + 4, 'the bubble leaves the entrant lane or crowds the papers/ID column')
    ok(Math.max(BUBBLE.h, 8 + 13 * 1) === 34 && Math.max(BUBBLE.h, 8 + 13 * 2) === 34 && Math.max(BUBBLE.h, 8 + 13 * 3) === 47,
        '#2003 the bubble growth law drifted — 1/2-line fields must not move, a 3-line thread needs 47')
    ok(BUBBLE.y + 47 <= CHS - STRIP_H - 6, 'a grown three-line bubble crowds the strip or the witness line')
    // #1988 the REPERTOIRE pool joins the fit law: every authored line the
    // cast can carry — threads, canonical pair, chapter alternates — fits the
    // field it will ever print into at 10px monospace.
    for (const ln of [...REGULARS.flatMap((c) => [c.lines.greet, c.lines.hook, c.lines.again, c.lines.follow, c.turnAlt, c.againAlt]), 'YOU AGAIN.', TURN_CANONICAL])
        ok(ln.length * 10 * CHAR <= BUBBLE.w - 14, `speech line "${ln}" overflows the bubble (${ln.length * 10 * CHAR}px in ${BUBBLE.w - 14}px)`)
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

// -------------------------------------------- THE WALL THAT LIVES (#1908) ----
section('THE WALL THAT LIVES (#1908) — the bulletin reads lived-in, never stamped')
{
    // Pool integrity: the 10x8 pool is what made the original's own wall its
    // worst enemy — 20 decoy draws across a week collide by birthday math, and
    // the sweep proved it (27 repeated wall names, two weeks printing the SAME
    // name twice on one bulletin). The plan pool must stay wide, clean, and
    // free of the neighborhood's names.
    ok(WALL_POOL.length >= 150, `name pool ${WALL_POOL.length} — back near 80 combos and the stamped look returns by birthday math`)
    ok(new Set(WALL_POOL).size === WALL_POOL.length, 'the name pool carries a duplicate combo')
    ok(!WALL_POOL.some((n) => REGULARS.some((c) => c.name === n)), 'the decoy pool carries a regular\'s full name — the neighborhood decorates the wall only via the arc')
    // construction law, analytically: the plan's day/slot offsets must separate
    // every pair of the week's 20 slots (|Δday| <= 6, |Δslot| <= 2, day 6
    // holds two decoys). If this passes the sweep witness is redundancy.
    {
        const L = WALL_POOL.length
        let offClash = 0
        for (let a = -6; a <= 6; a++) for (let b = -2; b <= 2; b++) {
            if (!a && !b) continue
            if ((((a * 71 + b * 37) % L) + L) % L === 0) offClash++
        }
        ok(offClash === 0, `plan offsets clash mod ${L} (${offClash} pairs) — two slots would share a name every week`)
        // The row law is the fit ceiling — #1908 said size cannot grow and rode
        // contrast (wallRed); #1943 FOUND relief (ruleGap 4->3 pays 9px), so the
        // rows are 10px now and the ratchet moved up with them: size may never
        // quietly shrink back, and the fit section re-proves the worst day lands
        // y=352 with 6px of slack to the scale box.
        ok(WALL.wantedSize >= 10 && WALL.wantedLine >= 11, 'wanted rows got smaller than the #1943 relief law')
    }
    ok(arcForWeek(SEEDS[0]).day === 6 && SEEDS.every((s) => arcForWeek(s).day === 6), 'the arc no longer lands on day 6 — weekDecoyCount hardcoded the arc day and the bulletin would overflow')
    // sweep witnesses: same-day distinctness, week-long distinctness, the
    // sheet matching the plan, and the wall-vs-window separation the old booth
    // only half kept (same-day guard; across the week the pool doubled and the
    // plan pre-seeds every day's used-set, so NO decoy all week can name a
    // person standing in the line).
    let decoyRows = 0, planHits = 0
    for (const seed of SEEDS) {
        const w = genWeek(seed)
        const weekEntrants = new Set(w.days.flatMap((d) => d.queue.filter((a) => a.person.passport).map((a) => a.person.passport.name)))
        const seen = new Set()
        for (const day of w.days) {
            const dn = day.wanted.map((x) => x.name)
            ok(new Set(dn).size === dn.length, `seed ${seed} day ${day.n}: the wall printed one name twice — stamped (${dn.join(' / ')})`)
            let k = 0
            for (const x of day.wanted) {
                if (x.planted) continue
                decoyRows++
                if (x.name === wallNameAt(seed, day.n, k)) planHits++
                else ok(false, `seed ${seed} day ${day.n} row ${k}: printed off the week plan`)
                ok(!seen.has(x.name), `seed ${seed}: ${x.name} wanted on two different days — the stamped bulletin is back`)
                seen.add(x.name)
                ok(!weekEntrants.has(x.name), `seed ${seed}: ${x.name} sits on the wall AND walks the window this week — a memory trap by construction`)
                k++
            }
        }
    }
    ok(planHits === decoyRows && decoyRows > 0, `plan coverage ${planHits}/${decoyRows} — the sheet is not fully plan-drawn`)
    console.log(`  ..    ${decoyRows} decoy rows across the sweep: all on the plan, all distinct per day AND per week, none naming anyone in the line`)
    // Recorded balance observation (#1908 item 3): token-level near-misses are
    // KEPT on purpose — a decoy sharing a first or last name with an entrant
    // trains the printed NAME *AND* NUMBER law. What must be zero is the
    // identical full name above. Planted names may still coincide with another
    // day's entrant (~2 a week at pool 190): each day is judged by the sheet
    // the wall prints THAT day, decide/judge agree, and the WANTED trap species
    // exists precisely to teach it. Counted, not accidental: an upward drift
    // means the pool narrowed.
    let plantCoin = 0
    for (const seed of SEEDS) {
        const w = genWeek(seed)
        const byDay = w.days.map((d) => new Set(d.queue.filter((a) => a.person.passport).map((a) => a.person.passport.name)))
        for (const day of w.days) for (const x of day.wanted) {
            if (!x.planted) continue
            for (const other of byDay) if (other !== byDay[day.n - 1] && other.has(x.name)) plantCoin++
        }
    }
    ok(plantCoin <= SEEDS.length * 6, `${plantCoin} planted-name coincidences across ${SEEDS.length} weeks — the pool is narrowing back toward stamp territory`)
    console.log(`  ..    planted-vs-line coincidences ${plantCoin}/${SEEDS.length} weeks (~${(plantCoin / SEEDS.length).toFixed(1)} a week) — today's sheet is today's law; recorded, not an accident`)
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
        mutMod('gen.js', 'for (let k = 0; k < 3 - (arcPlanted ? 1 : 0); k++) {', 'for (let k = 0; k < 2 - (arcPlanted ? 1 : 0); k++) {', 'm11'),
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

    // #1966 pay-economy mutants.

    // 19. the wage line goes dead: the booth still stamps, the purse never
    //     fills, and rent night 3 becomes a wall. SURVIVED would mean the
    //     suite could not tell a paid week from an unpaid one.
    await tryMut('PAY zeroed (work, then starve)',
        mutMod('sim.js', 'gs.credits += CFG.PAY; gs.paidToday += CFG.PAY', 'gs.credits += 0; gs.paidToday += 0', 'm19'),
        (m) => {
            const g = m.sim.newRun(0)
            m.sim.step(g, { action: m.rules.decide(m.sim.current(g).view).verdict })
            if (g.credits !== m.sim.CFG.PAY) return false
            const a = m.sim.autopilot(m.sim.newRun(0), 999)
            return a.ok
        })

    // 20. rent is pulled from the night: eviction disappears and the
    //     campaign loses its squeeze — the schedule probe names the hole.
    await tryMut('rent pulled from settle (no eviction, no squeeze)',
        mutMod('sim.js', 'const rent = rentDue(gs.day)', 'const rent = 0', 'm20'),
        (m) => {
            const g = m.sim.newRun(0)
            g.day = 3; g.credits = m.sim.rentDue(3) - 1
            m.sim.settle(g)
            return g.end === 'lose' && /EVICTED/.test(g.endWhy)
        })

    // 21. hunger loses its second night: skipping soup becomes forever free,
    //     and the original's two-night death is unreachable.
    await tryMut('two-night hunger tooth pulled (starvation unreachable)',
        mutMod('sim.js', 'if (gs.hungry >= 2) {', 'if (false && gs.hungry >= 2) {', 'm21'),
        (m) => {
            const g = m.sim.newRun(0)
            g.credits = 0
            m.sim.settle(g); m.sim.settle(g)
            return g.end === 'lose' && /STARVED/.test(g.endWhy)
        })

    // #1972 PORTRAIT-DETAIL mutants. Shared fairness walker: returns true
    // (SURVIVED) only if booth and truth agree on every paper of every seed.
    const fairAll = (m) => {
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
    }

    // 22. the brow comparison is muted: thick-vs-thin forges walk free past
    //    the booth while the truth path still convicts — unfair papers.
    await tryMut('brow comparison muted (brow forgers walk free)',
        mutMod('rules.js', 'if (face.brow !== photo.brow) ev.push(', 'if (false && face.brow !== photo.brow) ev.push(', 'm22'),
        (m) => fairAll(m))

    // 23. same for the mouth: an open-mouthed photo of a shut-mouthed
    //     entrant stops being evidence.
    await tryMut('mouth comparison muted (mouth forgers walk free)',
        mutMod('rules.js', 'if (face.mouth !== photo.mouth) ev.push(', 'if (false && face.mouth !== photo.mouth) ev.push(', 'm23'),
        (m) => fairAll(m))

    // 24. the compared set shrinks back to four: the generator stops staging
    //     brow/mouth forges entirely — the fairness prover stays green, so
    //     only the coverage pin sees the new rules turn into décor.
    await tryMut('FEATURES back to four (new features never staged)',
        mutMod('rules.js', "export const FEATURES = ['style', 'narrow', 'glasses', 'must', 'brow', 'mouth']",
            "export const FEATURES = ['style', 'narrow', 'glasses', 'must']", 'm24'),
        (m) => {
            const six = ['style', 'narrow', 'glasses', 'must', 'brow', 'mouth']
            const seen = new Set()
            for (const seed of SEEDS) {
                for (const day of m.gen.genWeek(seed).days) {
                    for (const a of day.queue) {
                        if (a.breakRule !== 'PORTRAIT' || !a.person.passport) continue
                        for (const f of six) if (a.person.face[f] !== a.person.passport.photo[f]) seen.add(f)
                    }
                }
            }
            return six.every((f) => seen.has(f))
        })

    // 25. the cast never walks in: every seed's line is strangers again —
    //     the recurrence witnesses go red while papers stay fair (an
    //     invisible feature must not stay green on fairness alone).
    //     (#2012 re-anchored: the injection is a list now.)
    await tryMut('regulars never injected (the line forgets its faces)',
        mutMod('gen.js', 'for (const reg of regularsForDay(seed, n)) day.queue.push(regularApplicant(reg, rnd, date, rules, day, used, seed, n, demote !== null))', 'for (const reg of []) day.queue.push(regularApplicant(reg, rnd, date, rules, day, used, seed, n, demote !== null))', 'm25'),
        (m) => {
            for (const seed of SEEDS) {
                for (const day of m.gen.genWeek(seed).days) {
                    const want = day.n === 1 ? 0 : day.n <= 5 ? 1 : 2
                    if (day.queue.filter((a) => a.person.regular).length !== want) return false
                }
            }
            return true
        })

    // 26. a regular re-rolls its face: the identity behind the name drifts
    //     run to run — a "regular" who is a different person every week is
    //     just a combinatorial entrant wearing a name tag.
    await tryMut('regular re-rolls its face (identity drift)',
        mutMod('gen.js', 'const face = { ...c.face, mark: c.mark, markStep: visit }', 'const face = { ...a.person.face, mark: c.mark, markStep: visit }', 'm26'),
        (m) => {
            for (const seed of SEEDS) {
                for (const day of m.gen.genWeek(seed).days) {
                    for (const a of day.queue) {
                        if (!a.person.regular) continue
                        const c = m.gen.REGULARS.find((k) => k.id === a.person.regular)
                        for (const f of ['style', 'narrow', 'glasses', 'must', 'brow', 'mouth']) if (a.person.face[f] !== c.face[f]) return false
                    }
                }
            }
            return true
        })

    // 27. the arc never reaches the bulletin: the flag and the truth remain,
    //     but the wall never names the familiar face — an invisible criminal,
    //     and the booth (decide) lets the turn walk free.
    await tryMut('arc turn never printed on the sheet (invisible Jorji)',
        mutMod('gen.js', 'day.wanted.push({ name: c.name, id: a.person.passport.id, planted: true, face: { ...c.face, mark: c.mark } })', 'void 0', 'm27'),
        (m) => {
            for (const seed of SEEDS) {
                const w = m.gen.genWeek(seed)
                const arc = m.gen.arcForWeek(seed)
                const day = w.days[arc.day - 1]
                const a = day.queue.find((x) => x.person.arc)
                if (!a) return false
                if (!day.wanted.some((x) => x.name === a.person.passport.name && x.id === a.person.passport.id)) return false
                if (m.rules.decide(m.gen.viewOf(day, a)).verdict !== 'deny') return false
            }
            return true
        })

    // 28. the sheet pairs the name with the WRONG number: the WANTED law
    //     (name AND number) never bites — the witness is printed but lies.
    await tryMut('arc sheet carries the wrong passport number',
        mutMod('gen.js', 'id: a.person.passport.id, planted: true', 'id: a.person.passport.id + 1, planted: true', 'm28'),
        (m) => {
            for (const seed of SEEDS) {
                const w = m.gen.genWeek(seed)
                const arc = m.gen.arcForWeek(seed)
                const day = w.days[arc.day - 1]
                const a = day.queue.find((x) => x.person.arc)
                if (!a) return false
                if (m.rules.decide(m.gen.viewOf(day, a)).verdict !== 'deny') return false
            }
            return true
        })

    // 29. the callback silenced: faces still come back, but the booth never
    //     remembers them — the recognition beat the whole stage is named for.
    //     (Anchor re-pinned #1997: the callback grew its personal line.)
    await tryMut('recalling face loses its line (the neighborhood forgets)',
        mutMod('gen.js', "a.person.say = ['YOU AGAIN.', againLineFor(c, seed), c.lines.follow]", 'a.person.say = null', 'm29'), // #2003 re-anchored: the return beat is a thread now; #1988: and its callback beat rides the chapter pool
        (m) => {
            for (const seed of SEEDS) {
                const w = m.gen.genWeek(seed)
                const backId = m.gen.REGULARS[(seed + 1) % m.gen.REGULARS.length].id
                const r = w.days[6].queue.find((x) => x.person.regular === backId)
                if (!r || !r.person.say || r.person.say[0] !== 'YOU AGAIN.') return false
            }
            return true
        })

    // 30. the bulletin forgets the arc took a slot: decoys stay at three and
    //     the turn day can outgrow the original's five-portrait capacity —
    //     a wall with six names must hide one (unfair by furniture).
    await tryMut('arc day keeps its three decoys (bulletin overflows its law)',
        mutMod('gen.js', 'for (let k = 0; k < 3 - (arcPlanted ? 1 : 0); k++) {', 'for (let k = 0; k < 3; k++) {', 'm30'),
        (m) => {
            for (const seed of SEEDS) {
                const w = m.gen.genWeek(seed)
                const arc = m.gen.arcForWeek(seed)
                const day = w.days[arc.day - 1]
                if (day.wanted.filter((x) => !x.planted).length !== 2) return false
            }
            return true
        })

    // 31. the crowd is flattened: accFor forgets headwear — the line is
    //     bare heads again. Fairness never notices (hats were never read);
    //     only the variety witness sees a whole signature feature vanish.
    //     #1996 moved the coverage rate into `cover` (nation-biased), so the
    //     flattening now zeroes that line.
    await tryMut('crowd flattened (accFor never gives a hat)',
        mutMod('gen.js', "country === 'ANTEGRIA' ? 11 : country === 'VESKOLE' ? 9 : 8", '0', 'm31'),
        (m) => {
            const kinds = new Set()
            for (const seed of SEEDS) {
                for (const day of m.gen.genWeek(seed).days) {
                    // rolled heads only — the regulars' hats are authored and
                    // would mask a flattened hash (kinds {1,2,3} ride on them).
                    for (const a of day.queue) if (!a.person.regular && a.person.face.hat) kinds.add(a.person.face.hat)
                }
            }
            return kinds.size === 3
        })

    // 33. (#1996) the nations blur: hat KIND selection forgets the home
    //     table — every country rolls caps/ushankas/scarves from the serial
    //     again. Fairness and variety survive (the kinds still spread); only
    //     the nation-dominance witness sees the line stop reading as nations.
    await tryMut('nations blurred (hat kind ignores the home table)',
        mutMod('gen.js', 'else hat = HAT_HOME[country] || (1 + ((h >>> 5) % 3))', 'else hat = 1 + ((h >>> 5) % 3)', 'm33'),
        (m) => {
            const cell = {}
            for (const seed of SEEDS) {
                for (const day of m.gen.genWeek(seed).days) {
                    for (const a of day.queue) {
                        if (a.person.regular || !a.person.passport || !a.person.face.hat) continue
                        const k = `${a.person.nation}|${a.person.passport.sex}`
                        ;(cell[k] = cell[k] || []).push(a.person.face.hat)
                    }
                }
            }
            const dom = (k, kind) => { const h = cell[k] || []; return h.length >= 5 && h.filter((x) => x === kind).length / h.length >= 0.6 }
            return dom('KIRINIA|M', 1) && dom('ANTEGRIA|M', 1) && dom('VESKOLE|M', 2) && dom('PARMENISTAN|M', 3)
        })

    // 32. the booth learns to read decor: a face whose live hat differs from
    //     the photo's is convicted as a PORTRAIT break. Gen-born papers stay
    //     fair (decor is shared at birth), so fairness survives — the
    //     neutrality witness (perturb the face only) is what kills it.
    await tryMut('decor read as evidence (a changed hat convicts)',
        mutMod('rules.js', "if (face.must !== photo.must) ev.push(", "if (face.must !== photo.must || (face.hat || 0) !== (photo.hat || 0)) ev.push(", 'm32'),
        (m) => {
            for (const seed of SEEDS) {
                for (const day of m.gen.genWeek(seed).days) {
                    for (const a of day.queue) {
                        const view = m.gen.viewOf(day, a)
                        const v0 = m.rules.decide(view).verdict
                        const pf = { ...a.person, face: { ...a.person.face, hat: 1, uni: 1, ear: 1, gap: 1 } }
                        if (m.rules.decide({ ...view, person: pf }).verdict !== v0) return false
                    }
                }
            }
            return true
        })

    // 33. the window stops rotating: seed no longer moves the head, so every
    //     week meets the same four heads and only the crowded tail still
    //     spins. #2012 sharpened the witness: a sweep-wide seatsWalked can
    //     hide a frozen head (the crowd seats cover the sweep alone) — the
    //     law lives in EVERY week meeting all six seats, so that is what the
    //     invariant grades now.
    await tryMut('cast rotation frozen (new seats never walk)',
        mutMod('gen.js', 'REGULARS[(seed + (n - 2) % VISIT_WINDOW) % REGULARS.length]', 'REGULARS[(n - 2) % VISIT_WINDOW]', 'm33'),
        (m) => {
            for (const seed of SEEDS) {
                const seats = new Set()
                for (const day of m.gen.genWeek(seed).days)
                    for (const a of day.queue) if (a.person.regular) seats.add(a.person.regular)
                if (seats.size !== m.gen.REGULARS.length) return false
            }
            return true
        })

    // 34. personal speech flattened: the greeting thread goes mute and the
    //     booth only ever says the canonical pair — six neighbors, one voice.
    //     Verdicts stay fair (say was never evidence); the speech-shape and
    //     distinct-lines witnesses in REGULARS are what kill it here.
    //     (#2003 re-anchors it: the greeting beat is a pair now.)
    await tryMut('personal speech flattened (first walk-ups go mute)',
        mutMod('gen.js', 'a.person.say = [c.lines.greet, c.lines.hook]', 'a.person.say = null', 'm34'),
        (m) => {
            for (const seed of SEEDS) {
                for (const day of m.gen.genWeek(seed).days) {
                    const regs = day.queue.filter((a) => a.person.regular)
                    if (!regs.length) continue
                    const a = regs[0]
                    if (a.person.arc) continue
                    const fv = m.gen.firstVisitDay(seed, m.gen.REGULARS.findIndex((k) => k.id === a.person.regular))
                    if (day.n === fv && !a.person.say) return false
                }
            }
            return true
        })

    // 35. the conversation is cut in half: the return keeps its recognition
    //     beat but never pays off the topic the greeting planted — every
    //     thread ends dangling. Verdicts unaffected; shape (return=3) and
    //     the planted-thread continuity witness are what kill it.
    await tryMut('thread payoff dropped (the return never answers the hook)',
        mutMod('gen.js', "a.person.say = ['YOU AGAIN.', againLineFor(c, seed), c.lines.follow]", "a.person.say = ['YOU AGAIN.', againLineFor(c, seed)]", 'm35'),
        (m) => {
            for (const seed of SEEDS) {
                const arc = m.gen.arcForWeek(seed)
                for (const day of m.gen.genWeek(seed).days) {
                    for (const a of day.queue.filter((x) => x.person.regular)) {
                        if (a.person.arc) continue
                        const fv = m.gen.firstVisitDay(seed, m.gen.REGULARS.findIndex((k) => k.id === a.person.regular))
                        if (day.n > fv && !(day.n === arc.day && a.person.regular === arc.id) && a.person.say.length !== 3) return false
                    }
                }
            }
            return true
        })

    // 36. the threads cross wires: the greeting branch opens with a face's
    //     payoff line instead of its hook — strangers on the glass answering
    //     questions nobody asked, and the week's continuity still LOOKS
    //     intact to a mute-check. Only the greeting-shape pin (say[1]===hook)
    //     sees the swap.
    await tryMut('threads swapped (greetings speak their payoff)',
        mutMod('gen.js', 'a.person.say = [c.lines.greet, c.lines.hook]', 'a.person.say = [c.lines.greet, c.lines.follow]', 'm36'),
        (m) => {
            for (const seed of SEEDS) {
                for (const day of m.gen.genWeek(seed).days) {
                    for (const a of day.queue.filter((x) => x.person.regular)) {
                        if (a.person.arc) continue
                        const fv = m.gen.firstVisitDay(seed, m.gen.REGULARS.findIndex((k) => k.id === a.person.regular))
                        if (day.n === fv) {
                            const c = m.gen.REGULARS.find((k) => k.id === a.person.regular)
                            if (!a.person.say || a.person.say[1] !== c.lines.hook) return false
                        }
                    }
                }
            }
            return true
        })

    // #1891 added three: m37 silences the month roll (the calendar turns but
    // the morning never says so — the day-6 NOVEMBER pin bites); m38 keeps
    // the witness headline but drops the quote (the booth is back to naming
    // rules instead of showing the comparison — the verbatim-quote pin
    // bites); m39 sends the wall back to bare numerals (the NAME DD YYYY
    // shape pin bites).
    await tryMut('month roll silenced (day 6 never says NOVEMBER)',
        mutMod('sim.js', 'return a.m === b.m ? null : MONFULL[b.m - 1]', 'return null', 'm37'),
        (m) => {
            for (const seed of SEEDS) if (m.sim.monthTurn(m.gen.genWeek(seed), 6) !== 'NOVEMBER') return false
            return true
        })
    await tryMut('the strip keeps the rule name and drops the quote (WITNESS: EXPIRED, nothing more)',
        mutMod('rules.js', 'return { witness: `WITNESS: ${last.why}`, evidence: wrapQuote(last.evidence, wrap) }',
            'return { witness: `WITNESS: ${last.why}`, evidence: [] }', 'm38'),
        (m) => {
            for (const seed of SEEDS) {
                for (const day of m.gen.genWeek(seed).days) {
                    for (const a of day.queue) {
                        const d = m.rules.decide(m.gen.viewOf(day, a))
                        if (d.verdict !== 'deny') continue
                        const sl = m.rules.stampLines({ ok: true, action: 'deny', verdict: 'deny', why: d.violations[0].rule, evidence: d.violations.map((x) => x.evidence).join('; ') }, m.layout.EVID.wrap)
                        if (sl.evidence.length === 0) return false
                    }
                }
            }
            return true
        })
    await tryMut('the wall prints bare numerals again (dshow -> dfmt)',
        mutMod('rules.js', 'export const dshow = (dt) => `${MON[dt.m - 1]} ${String(dt.d).padStart(2, \'0\')} ${dt.y}`',
            'export const dshow = (dt) => dfmt(dt)', 'm39'),
        (m) => {
            for (const seed of SEEDS) {
                for (const day of m.gen.genWeek(seed).days) {
                    if (!/^[A-Z]{3} \d{2} \d{4}$/.test(m.rules.dshow(day.date))) return false
                }
            }
            return true
        })
    // #2130 m61/m62: the booth slips back into testifying in serials — the
    // dshow definition intact, the evidence line alone reverted.
    await tryMut('EXPIRED evidence goes back to serials (dshow -> dfmt)',
        mutMod('rules.js', 'v.push({ rule: \'EXPIRED\', evidence: `EXPIRED ${dshow(pp.expiry)} < TODAY ${dshow(view.date)}` })',
            'v.push({ rule: \'EXPIRED\', evidence: `EXPIRED ${dfmt(pp.expiry)} < TODAY ${dfmt(view.date)}` })', 'm61'),
        (m) => {
            for (const seed of SEEDS) {
                for (const day of m.gen.genWeek(seed).days) {
                    for (const a of day.queue) {
                        for (const x of m.rules.decide(m.gen.viewOf(day, a)).violations) {
                            if (x.rule === 'EXPIRED' && /\d{4}\.\d{2}\.\d{2}/.test(x.evidence)) return false
                        }
                    }
                }
            }
            return true
        })
    await tryMut('CURFEW evidence goes back to a serial (dshow -> dfmt)',
        mutMod('rules.js', 'evidence: `EXPIRES ${dshow(pp.expiry)} — CURFEW WANTS 7 DAYS OF GRACE`',
            'evidence: `EXPIRES ${dfmt(pp.expiry)} — CURFEW WANTS 7 DAYS OF GRACE`', 'm62'),
        (m) => {
            for (const seed of SEEDS) {
                for (const day of m.gen.genWeek(seed).days) {
                    for (const a of day.queue) {
                        for (const x of m.rules.decide(m.gen.viewOf(day, a)).violations) {
                            if (x.rule === 'CURFEW' && /\d{4}\.\d{2}\.\d{2}/.test(x.evidence)) return false
                        }
                    }
                }
            }
            return true
        })

    // #2080 adds four: m63 freezes the aging (returns stay fresh — the
    // neighbourhood stops accumulating years); m64 strips markStep from the
    // photo alone (an asymmetric key is a fake trap on an honest paper —
    // the naive eye walks every key); m65 hands the trap to grey hair
    // (grey-on-grey is no visible move); m66 un-burns the vacated seat
    // (day 7 then hosts three flips — the slack budget is the coffin).
    await tryMut('marks never age (the visit step is frozen at zero)',
        mutMod('gen.js', 'const visit = n > firstVisitDay(seed, regIdx) ? 1 : 0', 'const visit = 0', 'm63'),
        (m) => {
            for (const seed of SEEDS) {
                for (const day of m.gen.genWeek(seed).days) {
                    for (const a of day.queue.filter((x) => x.person.regular)) {
                        // a return visit MUST wear the step — freeze means it doesn't
                        if (day.n > m.gen.firstVisitDay(seed, m.gen.REGULARS.findIndex((k) => k.id === a.person.regular)) && a.person.face.markStep !== 1) return false
                    }
                }
            }
            return true
        })
    await tryMut('the photo drops the aging step (asymmetric markStep)',
        mutMod('gen.js', 'weight: c.weight, photo: { ...face } }', 'weight: c.weight, photo: { ...c.face, mark: c.mark } }', 'm64'),
        (m) => {
            for (const seed of SEEDS) {
                for (const day of m.gen.genWeek(seed).days) {
                    for (const a of day.queue.filter((x) => x.person.regular)) {
                        if (a.person.face.markStep !== (a.person.passport.photo.markStep || 0)) return false
                    }
                }
            }
            return true
        })
    await tryMut('grey hair carries the aged trap (grey-on-grey, no move)',
        mutMod('gen.js', 'if (aged && n === 7 && c.id === REGULARS[(seed + 1) % REGULARS.length].id && c.face.hairC !== GREY) {',
            'if (aged && n === 7 && c.id === REGULARS[(seed + 1) % REGULARS.length].id && c.face.hairC === GREY) {', 'm65'),
        (m) => {
            for (const seed of SEEDS) {
                if (!m.gen.day7Demote(seed)) continue
                const t = m.gen.genWeek(seed).days[6].queue.find((x) => x.person.regular && x.trap)
                // the staged week must show the neighbour trap, and it must be
                // VISIBLE: grey print over non-grey live hair. A mutant that
                // only fires on grey hair leaves the stage empty of the trap.
                if (!t || t.trap !== 'PORTRAIT' || t.person.passport.photo.hairC !== m.gen.GREY || t.person.face.hairC === m.gen.GREY) return false
            }
            return true
        })
    await tryMut('the vacated seat is not burned (day 7 hosts three traps)',
        mutMod('gen.js', "if (demote !== 't2') day.queue.push(t2)", 'day.queue.push(t2)', 'm66'),
        (m) => {
            for (const seed of SEEDS) {
                const s = m.gen.trapSchedule(seed)
                const sched = (s[6].ti !== null ? 1 : 0) + (s[6].t2 !== null ? 1 : 0)
                if (m.gen.genWeek(seed).days[6].queue.filter((x) => x.trap).length !== sched) return false
            }
            return true
        })

    // #2012 THE CROWDED RETURN year adds two: m40 never sends the crowd — the
    // week shrinks back to four seats and the neighborhood is a club again
    // (fairness cannot see it; the week-meets-six witness bites). m41 crowds
    // with a CLONE of the returning head instead of the tail seat — the tail
    // never gets its day and one shift walks the same face twice; the day's
    // head-then-tail order witness bites.
    await tryMut('the crowd never walks (week meets four seats again)',
        mutMod('gen.js', 'return [regularForDay(seed, n), REGULARS[(seed + n - 2) % REGULARS.length]]', 'return [regularForDay(seed, n)]', 'm40'),
        (m) => {
            for (const seed of SEEDS) {
                const seats = new Set()
                for (const day of m.gen.genWeek(seed).days)
                    for (const a of day.queue) if (a.person.regular) seats.add(a.person.regular)
                if (seats.size !== m.gen.REGULARS.length) return false
            }
            return true
        })
    await tryMut('the crowd clones the returning head (the tail seat never leans on the glass)',
        mutMod('gen.js', 'REGULARS[(seed + n - 2) % REGULARS.length]', 'REGULARS[(seed + (n - 2) % VISIT_WINDOW) % REGULARS.length]', 'm41'),
        (m) => {
            for (const seed of SEEDS) {
                const w = m.gen.genWeek(seed)
                for (const [dn, offHead, offTail] of [[6, 0, 4], [7, 1, 5]]) {
                    const regs = w.days[dn - 1].queue.filter((a) => a.person.regular).map((a) => a.person.regular)
                    if (regs[0] !== m.gen.REGULARS[(seed + offHead) % m.gen.REGULARS.length].id ||
                        regs[1] !== m.gen.REGULARS[(seed + offTail) % m.gen.REGULARS.length].id) return false
                }
            }
            return true
        })

    // #2021 THE INSPECTOR STAYS m42: the pin shrinks 132 -> 40 ticks — a
    // sub-2-second "pin" is just the old fade wearing a new name, and the
    // read-window law must go red, not wave the shortcut through.
    await tryMut('pin < 2 s read window (QUOTE.hold 132 -> 40)',
        mutMod('layout.js', 'export const QUOTE = { hold: 132 }', 'export const QUOTE = { hold: 40 }', 'm42'),
        (m) => m.layout.QUOTE.hold >= 120)

    // #1908 THE WALL THAT LIVES m43: freeze the day term in the plan — every
    // day draws the same three decoys, the bulletin is stamped again. Same-day
    // distinctness survives (k still moves); only the week-long witness sees it.
    await tryMut('plan day-term frozen (same decoys on every wall)',
        mutMod('gen.js', 'return WALL_POOL[(((seed * 97 + n * 71 + k * 37) % L) + L) % L]', 'return WALL_POOL[(((seed * 97 + 0 * 71 + k * 37) % L) + L) % L]', 'm43'),
        (m) => {
            let dup = 0
            for (const seed of SEEDS) {
                const names = new Set()
                for (const day of m.gen.genWeek(seed).days) for (const x of day.wanted) {
                    if (x.planted) continue
                    if (names.has(x.name)) dup++
                    names.add(x.name)
                }
            }
            return dup === 0
        })
    // #1908 m44: the week plan stops pre-seeding the used-set — entrants can
    // draw a wall name again and the bulletin frames the line it prints. The
    // genDay assertion fires (a thrown audit is a caught mutant); if a stream
    // slips a collision past both, the witness names it.
    await tryMut('week plan not pre-seeded into the day (wall can frame the line)',
        mutMod('gen.js', 'for (const nm of weekWallNames(seed)) used.add(nm)', 'for (const nm of []) used.add(nm)', 'm44'),
        async (m) => {
            try {
                for (const seed of SEEDS) {
                    const w = m.gen.genWeek(seed)
                    const all = new Set(w.days.flatMap((d) => d.queue.filter((a) => a.person.passport).map((a) => a.person.passport.name)))
                    for (const day of w.days) for (const x of day.wanted) if (!x.planted && all.has(x.name)) return true
                }
                return false
            } catch { return 'wall-vs-entrant assertion fired' }
        })

    // #1968 PAY POLISH m45: the slip rows shrink back to the phone-illegible
    // 10px/12 and the five-row stack loses its pitch — the exact regression
    // the readability round shipped away from. SURVIVED = no gate on size.
    await tryMut('slip rows shrink below the phone law (10/12 again)',
        mutMod('layout.js', 'pitch: 13, size: 11', 'pitch: 12, size: 10', 'm45'),
        (m) => m.layout.SLIP.size >= 11 && m.layout.SLIP.pitch >= 13)

    // #1968 m46: the rent note drops out of its corridor onto the strip —
    // the wall goes quiet on rent night and the geometry pin must notice.
    await tryMut('rent note pushed out of the corridor (below the strip top)',
        mutMod('layout.js', 'export const RENT = { x: 12, y: 397, size: 8 }', 'export const RENT = { x: 12, y: 402, size: 8 }', 'm46'),
        (m) => m.layout.RENT.y > m.layout.SCALE.y + m.layout.SCALE.h && m.layout.RENT.y < m.layout.CHS - m.layout.STRIP_H)

    // #1968 m47: the money taxonomy goes blind — every loss, badge included,
    // claims to be a purse death (or none does). The end screen staging would
    // lie to the player; the shared classifier makes that a suite failure.
    await tryMut('money-death taxonomy blind (badge staged as purse)',
        mutMod('sim.js', '/EVICTED|STARVED|FROZEN/.test(why || \'\')', '/NEVERMATCHES/.test(why || \'\')', 'm47'),
        (m) => m.sim.isMoneyDeath('RENT UNPAID — EVICTED (needed 30, had 12)') && m.sim.isMoneyDeath('NO SOUP TWO NIGHTS — STARVED'))

    // #1976 m48: the wash fades to nothing — the print comes back fresh and
    // the aged-photo trap loses its at-a-glance tell. The invariant is the
    // wash's own alpha; papersplay's aged-pixel gate is the pixel proof.
    await tryMut('aged-print wash fades to nothing (alpha 0.02)',
        mutMod('layout.js', "export const PHOTO_TINT = 'rgba(146,102,28,0.30)'", "export const PHOTO_TINT = 'rgba(146,102,28,0.02)'", 'm48'),
        (m) => { const t = m.layout.PHOTO_TINT.match(/,\s*([\d.]+)\)/); return !!t && Number(t[1]) >= 0.2 })

    // #2072 m49/m50: the lift lies — a "zoom" that no longer grows the print,
    // or a hold that can never be reached, is a broken affordance stated as a
    // law. The pin mirrors the layout invariants; papersplay is the pixel half.
    await tryMut('the hold "zoom" no longer grows the print (PHOTO_ZOOM.s == PHOTO.s)',
        mutMod('layout.js', 'export const PHOTO_ZOOM = { s: 1.12, hold: 11 }', 'export const PHOTO_ZOOM = { s: 0.9, hold: 11 }', 'm49'),
        (m) => m.layout.PHOTO_ZOOM.s > m.layout.PHOTO.s)
    await tryMut('the photo-press hold never engages (threshold 100000)',
        mutMod('layout.js', 'export const PHOTO_ZOOM = { s: 1.12, hold: 11 }', 'export const PHOTO_ZOOM = { s: 1.12, hold: 100000 }', 'm50'),
        (m) => m.layout.PHOTO_ZOOM.hold <= 40)

    // #1982 m51/m52: the memory behind the door's welcome. m51 never marks
    // the plain return — the neighborhood forgets half its regulars by ear;
    // m52 marks the first walk-up too — the bell rings for strangers to
    // familiarity it has not earned. Both bite the per-week recall law.
    await tryMut('the returning neighbor is never marked (recall silenced)',
        mutMod('gen.js', "a.person.recall = 'again'", "a.person.recall = null", 'm51'),
        (m) => {
            for (const seed of SEEDS) if (!m.gen.genWeek(seed).days.some((d) => d.queue.some((a) => a.person.recall === 'again'))) return false
            return true
        })
    await tryMut('greetings wear the memory too (the door rings for first walk-ups)',
        mutMod('gen.js', "a.person.recall = null // #1982 a first walk-up has no memory to ring", "a.person.recall = 'again' // #1982 a first walk-up has no memory to ring", 'm52'),
        (m) => {
            for (const seed of SEEDS) {
                const wk = m.gen.genWeek(seed)
                for (const day of wk.days) {
                    for (const a of day.queue) {
                        if (a.person.regular == null) continue
                        const regIdx = m.gen.REGULARS.findIndex((c) => c.id === a.person.regular)
                        if (day.n === m.gen.firstVisitDay(seed, regIdx) && a.person.recall) return false
                    }
                }
            }
            return true
        })

    // #2020 THE CROWDED SHIFT SPEAKS m53: the crowd flag is never set — the
    // banner accent, the third note and the whole exchange hinge on it, and
    // the dense morning is staged exactly like a solo day again: the law
    // witness (crowd ⟺ return day) goes red while every paper stays fair.
    await tryMut('the crowd flag is never set (a dense morning says nothing)',
        mutMod('gen.js', 'export const crowdedDay = (seed, n) => regularsForDay(seed, n).length >= 2', 'export const crowdedDay = () => false', 'm53'),
        (m) => {
            for (const seed of SEEDS) for (let n = 2; n <= 7; n++) if (m.gen.crowdedDay(seed, n) !== (n >= 6)) return false
            return true
        })
    // #2020 m54: the callback forgets WHO crossed — the tail's neighbor line
    // goes anonymous and the two beats of one shift stop pointing at the same
    // pair of faces; the name-tie witness bites.
    await tryMut('the inside voice forgets the head\'s name (the exchange unmoors)',
        mutMod('gen.js', "const headFirst = regs[0].person.passport.name.split(' ')[0]", "const headFirst = 'THEY'", 'm54'),
        (m) => {
            for (const seed of SEEDS) {
                for (const day of m.gen.genWeek(seed).days) {
                    const regs = day.queue.filter((a) => a.person.aside)
                    if (regs.length !== 2) continue
                    if (regs[1].person.aside.line !== `${regs[0].person.passport.name.split(' ')[0]} SAYS HELLO.`) return false
                }
            }
            return true
        })
    // 55–58: #1988. m55 erases the mugshot (the bulletin is text-only again —
    // the pass's signature feature dies). m56 freezes the chapter mixer (the
    // neighborhood speaks one week forever). m57 mutes the seize aftershock.
    // m58 hangs mugshots on every decoy — day 6's four portrait bumps push
    // the wall past the scale box: unfair by furniture, caught by the fit law.
    await tryMut('bulletin forgets the arc face (no mugshot on the wall)',
        mutMod('gen.js', 'planted: true, face: { ...c.face, mark: c.mark } })', 'planted: true })', 'm55'),
        (m) => {
            for (const seed of SEEDS) {
                const w = m.gen.genWeek(seed)
                if (!w.days[5].wanted.some((x) => x.face)) return false
            }
            return true
        })
    await tryMut('chapter frozen at week 0 (the neighborhood never learns new lines)',
        mutMod('gen.js', 'export const repChapter = (seed) => Math.floor(seed / REGULARS.length) % 2', 'export const repChapter = (seed) => 0', 'm56'),
        (m) => {
            const heard = new Set()
            for (const seed of SEEDS) {
                const w = m.gen.genWeek(seed)
                heard.add(w.days[5].queue.find((x) => x.person.arc).person.say[1])
            }
            return heard.size > 1
        })
    await tryMut('seized neighbor leaves without a word (no aftershock)',
        mutMod('gen.js', 'a.person.seize = c.seize', 'a.person.seize = null', 'm57'),
        (m) => {
            for (const seed of SEEDS) {
                const w = m.gen.genWeek(seed)
                if (!w.days[5].queue.find((x) => x.person.arc).person.seize) return false
            }
            return true
        })
    await tryMut('every decoy gets a mugshot (the wall outgrows its five rows)',
        mutMod('gen.js', 'day.wanted.push({ name: wallNameAt(seed, n, k), id: 7000 + Math.floor(rnd() * 800), planted: false })', 'day.wanted.push({ name: wallNameAt(seed, n, k), id: 7000 + Math.floor(rnd() * 800), planted: false, face: REGULARS[0].face })', 'm58'),
        (m) => {
            for (const seed of SEEDS) {
                const w = m.gen.genWeek(seed)
                const d6 = w.days[5]
                const f = m.layout.wallFit(d6, d6.rules.map((r) => m.rules.RULES[r].text))
                if (f.bottom > m.layout.SCALE.y) return false
            }
            return true
        })
    // m59 drops the desk's upper bounds — a dragged card can be shoved off
    // the counter (behind the strip / off canvas) and lost from the booth.
    await tryMut('the desk clamp loses its upper bounds (papers can leave the counter)',
        mutMod('layout.js', 'x: Math.min(Math.max(x, d.x0), d.x1 - w),', 'x: Math.max(x, d.x0),', 'm59'),
        (m) => {
            const D = m.layout.DRAG
            for (const [w, h] of [[m.layout.PAPERS.w, m.layout.PAPERS.h], [m.layout.ID.w, m.layout.ID.h]]) {
                const p = D.clamp(9999, 9999, w, h)
                if (p.x + w > m.layout.CW || p.y + h > m.layout.CHS - m.layout.STRIP_H) return false
            }
            return true
        })
    // m60 reaches the desk over the glass — a document becomes a blindfold
    // and what the player must inspect can be hidden by the hand.
    await tryMut('the desk covers the entrant (a dragged card can hide the face)',
        mutMod('layout.js', 'desk: { x0: 352, y0: 10, x1: CW, y1: CHS - STRIP_H },', 'desk: { x0: 240, y0: 10, x1: CW, y1: CHS - STRIP_H },', 'm60'),
        (m) => {
            const D = m.layout.DRAG
            return D.desk.x0 >= m.layout.PORTRAIT.x + m.layout.PORTRAIT.headCx + m.layout.PORTRAIT.headRx + 1
        })
}

section('AGED PRINT & LIVE EARS (#1976) — the photo ages, the ear survives the cut')
{
    const idxSrc = readFileSync(join(SRC, 'index.jsx'), 'utf8')
    const tint = (await import(pathToFileURL(join(SRC, 'layout.js')).href)).PHOTO_TINT
    const tw = tint.match(/^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/)
    ok(!!tw, `PHOTO_TINT is an rgba wash (${tint})`)
    if (tw) {
        const [, tr, tg, tb, ta] = tw.map(Number)
        ok(tr > tg && tg > tb, `PHOTO_TINT is warm (r>g>b): ${tint} — a cool wash would not read as aged paper`)
        ok(ta >= 0.2 && ta <= 0.45, `the wash is present but transparent (alpha ${ta} in [0.2,0.45]) — face must read through`)
    }
    ok(idxSrc.includes('ctx.fillStyle = PHOTO_TINT; ctx.fillRect(x + PHOTO.x + 1, y + PHOTO.y + 1, PHOTO.w - 2, PHOTO.h - 2)'),
        'index.jsx: the wash paints the print INSIDE the frame line (inset 1) — the frame stays fresh')
    ok(/P\(8\), P\(36\)\)/.test(idxSrc) && !/P\(8\), P\(44\)\)/.test(idxSrc),
        'index.jsx: sideburns stop at row 44 (P(36)) — no hair cut reaches row 52 to bury the ears')
    ok(/BROW\|MOUTH/.test(idxSrc) && /playTone\(1050/.test(idxSrc),
        'index.jsx: a correct brow/mouth deny carries the sharp evidence tick (1050Hz)')
    ok(/earPix: \(\)/.test(idxSrc) && /sfxTicks: \(\) => sfxTicks/.test(idxSrc),
        'index.jsx: earPix + sfxTicks probes exposed for papersplay (ears per cut, ticks per face deny)')
}

section('SILHOUETTE & HOLD-TO-INSPECT (#2072) — cuts carry shape, the photo lifts, evidence stays byte-identical')
{
    const src2072 = readFileSync(join(SRC, 'index.jsx'), 'utf8')
    const lay = await import(pathToFileURL(join(SRC, 'layout.js')).href)
    ok(!!lay.PHOTO_ZOOM, 'layout.js exports PHOTO_ZOOM')
    ok(lay.PHOTO_ZOOM.s > lay.PHOTO.s && lay.PHOTO_ZOOM.s <= 1.35,
        `PHOTO_ZOOM.s (${lay.PHOTO_ZOOM.s}) grows the print past PHOTO.s (${lay.PHOTO.s}) but stays a crop, not a blowup`)
    ok(lay.PHOTO_ZOOM.hold >= 6 && lay.PHOTO_ZOOM.hold <= 40,
        `the hold is a comfortable press (${lay.PHOTO_ZOOM.hold} ticks at 60 Hz)`)
    ok(src2072.includes('photoHold >= PHOTO_ZOOM.hold'),
        'index.jsx: the zoom engages on WORLD ticks vs PHOTO_ZOOM.hold — never a setTimeout')
    ok(src2072.includes('holdInPhoto = true'),
        'index.jsx: a press on the photo is inspection, not a stamp')
    ok(src2072.includes('const v = f.shirtC % 2'),
        'index.jsx: the silhouette variant keys on shirtC — decor the photo inherits identically (hairC is forced grey in the photo; keying on it would break byte-identity)')
    ok(src2072.includes('HAIR_SHADOW[f.hairC]') && /HAIR_SHADOW = HAIRS\.map/.test(src2072),
        'index.jsx: HAIR_SHADOW is derived per cut color and paints the hairline')
    ok(src2072.includes('photoZoom: () => photoZoom') && src2072.includes('photoRect: () =>'),
        'index.jsx: photoZoom + photoRect probes exposed for papersplay')
}

section('RECOGNITION CUE (#1982) — the door knows its regulars')
{
    const idxSrc2 = readFileSync(join(SRC, 'index.jsx'), 'utf8')
    const rulesSrc2 = readFileSync(join(SRC, 'rules.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    // The motif is law in layout, and it must be a VOICE OF ITS OWN:
    // ascending (welcome-up), warm (triangle), and arithmetically disjoint
    // from every fixed tone the booth already owns.
    ok(Array.isArray(RECOGNITION.notes) && RECOGNITION.notes.length === 2 && RECOGNITION.notes[0] < RECOGNITION.notes[1],
        `the cue is an ascending two-note welcome (${JSON.stringify(RECOGNITION.notes)})`)
    ok(RECOGNITION.wave === 'triangle' && RECOGNITION.gain >= 0.03 && RECOGNITION.gain <= 0.08,
        `the cue is warm but soft (wave ${RECOGNITION.wave}, gain ${RECOGNITION.gain}) — it must not outshout the stamp`)
    ok(RECOGNITION.dur[0] < RECOGNITION.dur[1], 'the welcome lands on its second, longer note')
    {
        const owned = new Set([...idxSrc2.matchAll(/playTone\((\d+)/g)].map((mm) => Number(mm[1])))
        const clash = RECOGNITION.notes.filter((f) => owned.has(f))
        ok(clash.length === 0, `the recognition notes reuse a tone the booth already sings (${clash.join('/')}) — the ear could not tell welcome from verdict`)
    }
    // The structural memory the chime rides — swept, per seed, per visit.
    let agains = 0, turns = 0
    for (const seed of SEEDS) {
        const wk = genWeek(seed)
        const arc = arcForWeek(seed)
        let wkChimes = 0
        for (const day of wk.days) {
            for (const a of day.queue) {
                const p = a.person
                if (p.regular == null) { ok(!p.recall, `seed ${seed} day ${day.n}: a stranger carries recall=${p.recall} — the door rang for nobody`); continue }
                const regIdx = REGULARS.findIndex((c) => c.id === p.regular)
                const isArc = day.n === arc.day && p.regular === arc.id
                if (isArc) { ok(p.recall === 'turn', `seed ${seed} day ${day.n}: the arc face carries recall=${p.recall}`); turns++ }
                else if (day.n > firstVisitDay(seed, regIdx)) { ok(p.recall === 'again', `seed ${seed} day ${day.n}: a return carries recall=${p.recall}`); agains++ }
                else { ok(!p.recall, `seed ${seed} day ${day.n}: a first walk-up carries recall=${p.recall} — greetings have no memory to ring`); continue }
                wkChimes++
                ok(p.say && p.say[0] === 'YOU AGAIN.', `seed ${seed} day ${day.n}: recall=${p.recall} but the booth says ${JSON.stringify(p.say && p.say[0])} — memory and words must share one source`)
            }
            const recalling = day.queue.filter((a) => a.person.recall).map((a) => a.person.regular)
            if (day.n >= 6) ok(recalling.length === 1, `seed ${seed} day ${day.n}: ${recalling.length} returning faces at a return day — exactly the head may be remembered`)
            else ok(recalling.length === 0, `seed ${seed} day ${day.n}: a recall before day 6 — ${recalling.join('/')}`)
        }
        ok(wkChimes === 2, `seed ${seed}: the week rang ${wkChimes} welcomes — the law is exactly two returns (days 6, 7)`)
    }
    ok(agains === SEEDS.length && turns === SEEDS.length, `${agains} agains / ${turns} turns — every week must carry exactly one return and one arc turn`)
    // Determinism: the bell rings the same tune every replay of a seed.
    {
        const seq = (s) => genWeek(s).days.map((d) => d.queue.map((a) => a.person.recall || '-').join(',')).join('|')
        ok(seq(4) === seq(4) && seq(9) === seq(9), 'recall drifted between two generations of one seed')
    }
    // Decor doctrine: the verdict machinery must not even know the word.
    ok(!/recall/.test(rulesSrc2), 'rules.js reads recall — a returning face would convict harder than a stranger (decor became evidence)')
    ok(/nextP && nextP\.recall/.test(idxSrc2) && /sfxAgain\+\+/.test(idxSrc2) && /sfxAgain: \(\) => sfxAgain/.test(idxSrc2) && /againLog: \(\) => againLog\.slice\(\)/.test(idxSrc2),
        'index.jsx must ring RECOGNITION when the next applicant carries recall, count AND name the arrivals, and expose both for papersplay')
}

// -------------------------------------------- #1988 ARC POLISH PASS ----
section('THE POLISHED ARC (#1988) — faces on the wall, a loud turn, many voices, a lingering deny')
{
    const idxSrc3 = readFileSync(join(SRC, 'index.jsx'), 'utf8')
    const rulesSrc3 = readFileSync(join(SRC, 'rules.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    const simSrc3 = readFileSync(join(SRC, 'sim.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

    // 1) REPERTOIRE integrity: every regular carries its own protest, callback
    //    alternate and seize line — authored, distinct, echo-free across the
    //    whole 42-sentence repertoire (24 threads + 6 canonical + 6 + 6 + 6).
    for (const c of REGULARS) {
        ok(typeof c.turnAlt === 'string' && /^\.\.\./.test(c.turnAlt), `${c.id} turnAlt must be a sputter starting with "..." — the beat is being caught mid-sentence`)
        ok(typeof c.againAlt === 'string' && c.againAlt.length >= 8, `${c.id} has no callback alternate`)
        ok(typeof c.seize === 'string' && c.seize.length >= 8, `${c.id} has no seize (argue) line`)
    }
    const turnAlts = REGULARS.map((c) => c.turnAlt)
    const againAlts = REGULARS.map((c) => c.againAlt)
    const seizes = REGULARS.map((c) => c.seize)
    ok(new Set(turnAlts).size === REGULARS.length, 'two regulars share a protest — the repertoire says it six ways')
    ok(new Set(againAlts).size === REGULARS.length, 'two regulars share a callback alternate')
    ok(new Set(seizes).size === REGULARS.length, 'two regulars argue the same way as they are taken')
    const threads = REGULARS.flatMap((c) => [c.lines.greet, c.lines.hook, c.lines.again, c.lines.follow])
    ok([...turnAlts, ...againAlts, ...seizes].every((l) => !threads.includes(l)), 'a repertoire variant repeats a thread line — the pool must widen the voices, not echo them')
    ok(new Set([...threads, TURN_CANONICAL, ...turnAlts, ...againAlts, ...seizes]).size === threads.length + 1 + turnAlts.length + againAlts.length + seizes.length,
        'the 43-sentence repertoire carries a duplicate — 43 authored lines, 43 different voices')
    // the mixer: chapter = floor(seed/6) % 2. Week 0 speaks canonical (every
    // old fixture replays byte-identical); week 1 speaks the alternates.
    ok(SEEDS.every((s) => repChapter(s) === (s < REGULARS.length ? 0 : 1)), 'the chapter mixer drifted — week 0 must keep every canonical literal')
    ok(REGULARS.every((c) => turnLineFor(c, 0) === TURN_CANONICAL && turnLineFor(c, 6) === c.turnAlt),
        'the protest does not change with the campaign chapter — one line per beat is thin')
    ok(REGULARS.every((c) => againLineFor(c, 0) === c.lines.again && againLineFor(c, 6) === c.againAlt),
        'the callback does not change with the campaign chapter')
    // sweep witness: across the 12-week sweep EVERY voice is heard — both
    // canonical beats AND all six alternates of each pool (chapter 1 covers
    // every seat because the arc and the day-7 head both ride the seed).
    const heardTurn = new Set()
    const heardAgain = new Set()
    for (const seed of SEEDS) {
        const w = genWeek(seed)
        const arcA = w.days[5].queue.find((x) => x.person.arc)
        heardTurn.add(arcA.person.say[1])
        const back = w.days[6].queue.filter((x) => x.person.recall === 'again')
        back.forEach((x) => heardAgain.add(x.person.say[1]))
    }
    ok(heardTurn.has(TURN_CANONICAL) && turnAlts.every((l) => heardTurn.has(l)),
        `the sweep heard only ${heardTurn.size}/7 protest lines — a repertoire nobody speaks is theatre`)
    ok(againAlts.every((l) => heardAgain.has(l)),
        `the sweep heard ${heardAgain.size}/6 callback alternates — every voice must speak across the sweep`)
    ok(repChapter.length === 1 && /Math\.floor\(seed \/ REGULARS\.length\)/.test(readFileSync(join(SRC, 'gen.js'), 'utf8')),
        'the chapter mixer must be pure over the seed (zero rnd)')

    // 2) THE BULLETIN PRINTS A FACE: the arc sheet entry carries the authored
    //    descriptor (identity law — the mugshot IS the neighbor at the glass),
    //    exactly one sheet row per week carries it, and the picture fits.
    for (const seed of SEEDS) {
        const w = genWeek(seed)
        const arc = arcForWeek(seed)
        const arcC = REGULARS.find((k) => k.id === arc.id)
        for (const day of w.days) {
            const faced = day.wanted.filter((x) => x.face)
            if (day.n === arc.day) {
                ok(faced.length === 1, `seed ${seed} day ${day.n}: ${faced.length} mugshots on the wall — only the arc's face is honest to print`)
                const p = faced[0]
                ok(p && p.name === arcC.name, `seed ${seed}: the mugshot named ${p && p.name}, not the arc regular`)
                for (const f of [...FEATURES, 'skin', 'hairC', 'shirtC', 'hat', 'uni', 'ear', 'gap']) {
                    ok(p && p.face[f] === arcC.face[f], `seed ${seed}: the bulletin's ${f} drifted from the authored face — the wall lies about the neighbor`)
                }
                ok(p && p.face.mark === arcC.mark, `seed ${seed}: the bulletin mugshot lost or swapped the signature mark`)
            } else {
                ok(faced.length === 0, `seed ${seed} day ${day.n}: a mugshot walked off the arc day`)
            }
        }
        // fit: the arc day with its portrait must still clear the scale box.
        const d6 = w.days[5]
        const f = wallFit(d6, d6.rules.map((r) => RULES[r].text))
        ok(f.listsClearScale && f.bottom <= SCALE.y, `seed ${seed}: the arc bulletin reaches y=${f.bottom} vs the SCALE box at ${SCALE.y} — the wall buries its own portrait`)
    }
    // the theoretical worst arc day: six laws, three countries, five names AND
    // the portrait — the ceiling paperscheck ratchets against.
    {
        const worstArc = { n: 6, allowed: ['ARSTOTZKA', 'KIRINIA', 'VESKOLE'], wanted: [{ name: 'AAA BBB', id: 4001 }, { name: 'CCC DDD', id: 4002 }, { name: 'EEE FFF', id: 4003, face: { skin: 0, hairC: 0, shirtC: 0, style: 0, narrow: 0, glasses: 0, must: 0, brow: 0, mouth: 0 } }, { name: 'GGG HHH', id: 4004 }, { name: 'III JJJ', id: 4005 }], rules: DAY_RULES[5] }
        const f = wallFit(worstArc, worstArc.rules.map((r) => RULES[r].text))
        ok(f.bottom <= SCALE.y, `worst buildable ARC day reaches y=${f.bottom} vs ${SCALE.y} — no room left for the portrait, the fit law needs a new donor`)
        console.log(`  ..    worst arc day with portrait: bottom y=${f.bottom}, scale box top y=${SCALE.y} — clear`)
    }
    ok(ARC_MUG.s * 68 >= 18, `the bulletin mugshot head is ${ARC_MUG.s * 68}px — below 18px a face is a smudge, not a portrait`)
    ok(WALL.x + 114 + 2 + ARC_MUG.w <= PORTRAIT.x - 4, 'the bulletin portrait leaves the wanted column')

    // 3) THE TURN ANNOUNCES — view-side doctrine: the highlight keys off the
    //    live applicant and the sheet's face, and the sim/rules must not know
    //    the lever exists (stateHash is byte-identical; ghost-cell doctrine).
    ok(!/ARC_HL|bulletinRows/.test(rulesSrc3) && !/ARC_HL|bulletinRows/.test(simSrc3),
        'rules.js/sim.js reference ARC_HL/bulletinRows — the announcement would leak into the sim')
    ok(/view\.person && view\.person\.arc/.test(idxSrc3) && /row\.hl/.test(idxSrc3) && /bulletinRows\(day, day\.rules\.map/.test(idxSrc3),
        'index.jsx must light the arc row (via bulletinRows hl) only while the arc face is at the window')
    {
        const [rr, gg, bb] = [1, 3, 5].map((i) => parseInt(ARC_HL.slice(i, i + 2), 16))
        ok(rr > 170 && gg < 80, `ARC_HL (${ARC_HL}) sits outside the wallRed hue family (gg 80..150) — the sheet-count gate would swallow the announcement`)
        ok(ARC_HL !== '#d84343' && ARC_HL !== '#ff8080', 'the announcement ink collides with the stamp or strike red')
    }
    // determinism: two generations of one seed speak identical lines.
    {
        const seq = (s) => genWeek(s).days.map((d) => d.queue.map((a) => (a.person.say || []).join('~')).join('|')).join('|')
        ok(seq(7) === seq(7) && seq(11) === seq(11), 'repertoire speech drifted between two generations of one seed')
    }

    // 4) DENY AFTERSHOCK: only the arc person carries the seize line; it
    //    fits the paper zone under the stamp; its tone is the booth's lowest.
    for (const seed of SEEDS) {
        const w = genWeek(seed)
        let seized = 0
        for (const day of w.days) for (const a of day.queue) {
            if (a.person.arc) { seized++; ok(a.person.seize === REGULARS.find((k) => k.id === a.person.regular).seize, `seed ${seed}: the arc face has no argue line`) }
            else ok(!a.person.seize, `seed ${seed} day ${day.n}: a stranger carries a seize line — only a seized friend argues`)
        }
        ok(seized === 1, `seed ${seed}: ${seized} seize lines in one week — exactly the arc's`)
    }
    const longestSeize = Math.max(...seizes.map((l) => l.length))
    ok(longestSeize * SEIZE.size * CHAR <= 290, `the longest seize line prints ${longestSeize * SEIZE.size * CHAR}px — the paper corridor under the stamp is 290px`)
    ok(SEIZE.y + Math.ceil(SEIZE.size * 0.5) <= PAPERS.y + 148 && SEIZE.y - Math.ceil(SEIZE.size * 0.5) >= 148, `the seize line sits at y=${SEIZE.y}: ink spans y±${Math.ceil(SEIZE.size * 0.5)} (measured: this text()'s uppercase caps reach y−5, descenders y+1), top clears the rotated stamp's lowest stroke (y≤147 at the x≈425 corner where the stroke dips) and rides the judged document's paper (bottom ${PAPERS.y + 148})`)
    {
        const owned = [...idxSrc3.matchAll(/playTone\((\d+)/g)].map((mm) => Number(mm[1]))
        ok(owned.length > 0 && SEIZE.tone < Math.min(...owned, RECOGNITION.notes[0]),
            `SEIZE.tone (${SEIZE.tone}) must sit below every fixed tone the booth owns (lowest ${Math.min(...owned)}) — a heavier deny is a LOWER deny`)
        ok(/stamped\.arc && action === 'deny'/.test(idxSrc3) && /sfxSeize\+\+/.test(idxSrc3) && /sfxSeize: \(\) => sfxSeize/.test(idxSrc3),
            'index.jsx must thunk SEIZE.tone, set the argue line and count it when a seized neighbor is denied')
    }

    // 5) THE TAIL IS PINNED: the bubble triangle's band sits above the field
    //    and below the witness baseline; papersplay counts its paper.
    ok(BUBBLE_TAIL.y + BUBBLE_TAIL.h === BUBBLE.y - 0 && BUBBLE_TAIL.y > 270 && BUBBLE_TAIL.y + BUBBLE_TAIL.h < BUBBLE.y + 1,
        `the tail band (y ${BUBBLE_TAIL.y}..${BUBBLE_TAIL.y + BUBBLE_TAIL.h}) must hug the field's top edge (y=${BUBBLE.y})`)
    ok(/bubbleTailPix: \(\) =>/.test(idxSrc3) && /BUBBLE_TAIL\.x/.test(idxSrc3), 'index.jsx must expose bubbleTailPix over the BUBBLE_TAIL band')
    console.log('  ..    faces, voices, aftershocks: the arc speaks 43 ways and the wall shows who')
}

section('CROWDED SHIFT SPEAKS (#2020) — the dense morning announces itself')
{
    const idxSrc3 = readFileSync(join(SRC, 'index.jsx'), 'utf8')
    const genSrc = readFileSync(join(SRC, 'gen.js'), 'utf8')
    const rulesSrc3 = readFileSync(join(SRC, 'rules.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    // 1) THE CROWD LAW — a crowd is exactly the day the walk carries two
    //    regulars, and that is days 6, 7. The flag cannot disagree with the
    //    #2012 walk because it IS the walk's own length.
    for (const seed of SEEDS) {
        const wk = genWeek(seed)
        ok(!crowdedDay(seed, 1), `seed ${seed}: day 1 (no regulars) flagged as a crowd`)
        for (let n = 2; n <= 7; n++) {
            const regs = wk.days[n - 1].queue.filter((a) => a.person.regular)
            ok(crowdedDay(seed, n) === (regs.length >= 2), `seed ${seed} day ${n}: crowd flag ${crowdedDay(seed, n)} disagrees with ${regs.length} regulars on the walk`)
            ok(crowdedDay(seed, n) === (n >= 6), `seed ${seed} day ${n}: crowd flag says ${crowdedDay(seed, n)} — the crowd walks the return days, 6 and 7`)
        }
    }
    // 2) THE EXCHANGE — exactly the two crowded heads carry an aside, in
    //    walking order: the returning head gets the voice behind commenting
    //    on the line, the greeting tail gets the neighbor through the gate
    //    calling back BY NAME (the two beats tie to the same pair of faces).
    for (const seed of SEEDS) {
        for (const day of genWeek(seed).days) {
            const withAside = day.queue.filter((a) => a.person.aside)
            if (!crowdedDay(seed, day.n)) {
                ok(withAside.length === 0, `seed ${seed} day ${day.n}: ${withAside.length} asides on a solo day — the quiet shift started shouting`)
                continue
            }
            const regs = day.queue.filter((a) => a.person.regular)
            ok(withAside.length === 2, `seed ${seed} day ${day.n}: ${withAside.length} asides — a crowded shift gains exactly two bystander voices`)
            ok(withAside[0] === regs[0] && withAside[1] === regs[1], `seed ${seed} day ${day.n}: asides landed out of walking order — the line talks head-first`)
            ok(withAside[0].person.aside.tag === 'A VOICE BEHIND YOU' && withAside[0].person.aside.line === 'THE LINE IS LONG TODAY.',
                `seed ${seed} day ${day.n}: the head's bystander beat lost its line — ${JSON.stringify(withAside[0].person.aside)}`)
            const headFirst = regs[0].person.passport.name.split(' ')[0]
            ok(withAside[1].person.aside.tag === 'A VOICE FROM INSIDE' && withAside[1].person.aside.line === `${headFirst} SAYS HELLO.`,
                `seed ${seed} day ${day.n}: the tail's callback forgot the head's name — ${JSON.stringify(withAside[1].person.aside)}`)
        }
    }
    // 3) DECOR, NOT EVIDENCE — strip the aside (speech or not) off EVERY
    //    paper of EVERY seed: no verdict may flinch. Doctrine of the nose.
    for (const seed of SEEDS) {
        for (const day of genWeek(seed).days) {
            for (const a of day.queue) {
                const v = viewOf(day, a)
                const stripped = { ...v, person: { ...v.person, aside: undefined } }
                ok(decide(v).verdict === decide(stripped).verdict, `seed ${seed} day ${day.n}: an aside leaked into the booth's verdict`)
                const mute = { ...v, person: { ...v.person, aside: undefined, say: undefined } }
                ok(decide(v).verdict === decide(mute).verdict, `seed ${seed} day ${day.n}: muting the neighborhood moved a verdict`)
            }
        }
    }
    ok(!/aside|crowdedDay/.test(rulesSrc3), 'rules.js reads the crowd or its asides — decor became evidence')
    // 4) THE FIT — tags at 7px, lines at 8px, inside the box; the longest
    //    authored text must land clear of the slip and the strip.
    {
        const tags = ['A VOICE BEHIND YOU', 'A VOICE FROM INSIDE']
        const lines = ['THE LINE IS LONG TODAY.']
        for (let seed = 0; seed < 40; seed++) for (const n of [6, 7])
            for (const c of REGULARS) { lines.push(`${c.name.split(' ')[0]} SAYS HELLO.`) }
        const maxTag = Math.max(...tags.map((t) => t.length))
        const maxLine = Math.max(...lines.map((l) => l.length))
        ok(maxTag * ASIDE.tag * CHAR <= ASIDE.w - 8, `the longest tag (${maxTag} chars) overflows the aside box`)
        ok(maxLine * ASIDE.line * CHAR <= ASIDE.w - 8, `the longest aside line (${maxLine} chars) overflows the aside box`)
        ok(ASIDE.x + ASIDE.w <= 452 - 2, 'the aside box runs into the deduction slip column')
        ok(ASIDE.y + ASIDE.h <= CHS - STRIP_H - 4, 'the aside leaves the controls strip')
        ok(ASIDE.y >= BUBBLE.y + Math.max(BUBBLE.h, 8 + 13 * 3) + 2, 'the aside crowds a three-line bubble (worst-case field bottom 349)')
        // banner: month AND crowd together still close above the bubble top.
        ok(150 + 96 + 20 + 20 <= BUBBLE.y, 'a month+crowd banner reaches the speech bubble')
    }
    // 5) THE THIRD NOTE — the crowd's low hum is a voice of its own: disjoint
    //    from every fixed tone the booth sings, including the welcome pair.
    {
        const owned = new Set([...idxSrc3.matchAll(/playTone\((\d+)/g)].map((mm) => Number(mm[1])))
        ok(!owned.has(CROWD_NOTE.note), `the crowd note (${CROWD_NOTE.note}) reuses a tone the booth already sings`)
        ok(!RECOGNITION.notes.includes(CROWD_NOTE.note), 'the crowd note duplicates a recognition note')
        ok(CROWD_NOTE.note < RECOGNITION.notes[0], 'the crowd hum should sit BELOW the welcome it underscores')
        ok(CROWD_NOTE.gain < RECOGNITION.gain, 'the crowd hum outshouts the welcome it rides')
    }
    // 6) THE BOOTH PRINTS IT — the shell pins: two mugs beat one, the accent
    //    line, bodies riding the settle, and the probes papersplay samples.
    ok(idxSrc3.includes('* TWO FAMILIAR FACES IN LINE *'), 'the banner forgot the crowded-morning accent line')
    ok(/PORTRAIT\.y \+ dy/.test(idxSrc3), 'bodies must ride the settle drop (drawFace at PORTRAIT.y + dy) — entrants land, they do not teleport')
    ok(/queueInk: \(\)/.test(idxSrc3) && /asideInk: \(\)/.test(idxSrc3) && /crowdTicks: \(\)/.test(idxSrc3),
        'index.jsx exposes queueInk + asideInk + crowdTicks for papersplay')
    // 7) THE LINE STRIP MATH — the mug count the shell draws is the queue's
    //    own truth: day 6 opens with two known faces waiting, day 2 with one,
    //    day 1 with none; the count only shrinks as heads cross the glass.
    {
        const mugsAt = (wk, seed, n, idx) => wk.days[n - 1].queue.slice(idx).filter((a) => a.person.regular).length
        for (const seed of SEEDS) {
            const wk = genWeek(seed)
            ok(mugsAt(wk, seed, 1, 0) === 0, `seed ${seed}: day 1 shows mugs with nobody regular in line`)
            ok(mugsAt(wk, seed, 2, 0) === 1, `seed ${seed}: a solo morning must show one mug`)
            ok(mugsAt(wk, seed, 6, 0) === 2 && mugsAt(wk, seed, 7, 0) === 2, `seed ${seed}: a crowded morning must open with two mugs`)
            const d6 = wk.days[5]
            const headPos = d6.queue.findIndex((a) => a.person.regular)
            ok(mugsAt(wk, seed, 6, headPos + 1) === 1, `seed ${seed}: after the head crosses, exactly the tail stays in line`)
            ok(mugsAt(wk, seed, 6, d6.queue.length) === 0, `seed ${seed}: after the last regular, the strip is empty`)
        }
    }
    // 8) DETERMINISM — two generations of one seed print the same exchange.
    {
        const seq = (s) => genWeek(s).days.map((d) => d.queue.map((a) => (a.person.aside ? `${a.person.aside.tag}:${a.person.aside.line}` : '-')).join('|')).join('||')
        ok(seq(3) === seq(3) && seq(8) === seq(8), 'the crowded-shift exchange drifted between two generations of one seed')
        // the aside block draws ZERO rnd() — the seed stream keeps its sequence
        // (names, numbers, faces all replay byte-identical, as #1989 doctrine).
        const asideBlock = genSrc.slice(genSrc.indexOf('const regs = day.queue'), genSrc.indexOf('while (day.queue.length'))
        ok(asideBlock.length > 100 && !/rnd\(\)/.test(asideBlock), 'the aside block draws rnd() — authoring must not re-sequence the stream')
    }
}

section('PAPERS IN HAND (#2120) — the desk: identity at home, nothing lost, the face never hides')
{
    // Pure law from layout.js. The shell applies these offsets; sim/rules
    // must never name the lever (TMD ghost-cell tripwire — same doctrine that
    // keeps the #1988 announce and #2072 zoom out of the fairness contract).
    const idxSrcD = readFileSync(join(SRC, 'index.jsx'), 'utf8')
    const rulesSrcD = readFileSync(join(SRC, 'rules.js'), 'utf8')
    const simSrcD = readFileSync(join(SRC, 'sim.js'), 'utf8')
    ok(!/DRAG|carried|desk\.(pp|id)/.test(rulesSrcD), 'rules.js names the drag — decor has entered the law')
    ok(!/DRAG|carried|desk\.(pp|id)/.test(simSrcD), 'sim.js names the drag — stateHash byte-identity dies with it')
    ok(idxSrcD.includes('DRAG.clamp') && idxSrcD.includes('DRAG.travel'),
        'index.jsx does not drive through the DRAG law (a private copy of the numbers is a drift waiting to happen)')
    // 1) HOME IDENTITY — clamp(home) === home EXACTLY, both cards. Every
    //    pixel pin ever written for the resting passport/ID stands by this.
    const homePP = DRAG.clamp(PAPERS.x, PAPERS.y, PAPERS.w, PAPERS.h)
    const homeID = DRAG.clamp(ID.x, ID.y, ID.w, ID.h)
    ok(homePP.x === PAPERS.x && homePP.y === PAPERS.y, 'the passport home is not identity under the desk clamp')
    ok(homeID.x === ID.x && homeID.y === ID.y, 'the ID home is not identity under the desk clamp')
    // 2) NOTHING LOST — both cards at every extreme stay fully inside the
    //    booth and above the controls strip; the bounds answer when hit.
    for (const [w, h, nm] of [[PAPERS.w, PAPERS.h, 'passport'], [ID.w, ID.h, 'ID card']]) {
        for (const [x, y] of [[-9999, -9999], [9999, 9999], [-9999, 9999], [9999, -9999], [PAPERS.x, -9999], [9999, PAPERS.y]]) {
            const p = DRAG.clamp(x, y, w, h)
            ok(p.x >= 0 && p.y >= 0, `${nm} can be dragged past the canvas edge`)
            ok(p.x + w <= CW && p.y + h <= CHS - STRIP_H, `${nm} can leave the counter (behind the wall or the strip)`)
        }
        const hit = DRAG.clamp(DRAG.desk.x0 - 1, DRAG.desk.y1 + 1, w, h)
        ok(hit.x === DRAG.desk.x0 && hit.y === DRAG.desk.y1 - h, `${nm} ignores a desk bound`)
    }
    // 3) THE FACE NEVER HIDES — the desk starts right of the portrait head:
    //    a document can never become a blindfold over the entrant.
    ok(DRAG.desk.x0 >= PORTRAIT.x + PORTRAIT.headCx + PORTRAIT.headRx + 1,
        'a dragged card could cover the entrant face — what must be seen, the hand cannot hide')
    // 4) THE HAND FEELS REAL — travel is a sane tap-vs-grab distance, tilt
    //    is a real lean (#2072's law applied to the hand: zero is a lie).
    ok(DRAG.travel >= 4 && DRAG.travel <= 24, 'travel outside tap-vs-grab sanity (4..24px)')
    ok(DRAG.tilt > 0 && DRAG.tilt < 0.35, 'tilt must lean, not sit flat nor spin')
    ok(DRAG.tiltK > 0, 'tiltK 0 — the card never leans in the fingers')
    ok(DRAG.liftSfx.gain > 0 && DRAG.dropSfx.gain > 0, 'the hand is silent — lift/drop must rustle')
    // 5) STACKING WORKS — the passport can be laid down over the ID rows
    //    (papers that cannot get out of each other's way are not in hand).
    const low = DRAG.clamp(ID.x, DRAG.desk.y1, PAPERS.w, PAPERS.h)
    ok(low.y + PAPERS.h > ID.y + ID.h, 'the passport cannot stack onto the ID card — nothing to move out of the way')
    // 6) DETERMINISM — the clamp is pure arithmetic: same input, same output.
    ok(JSON.stringify(DRAG.clamp(400, 120, PAPERS.w, PAPERS.h)) === JSON.stringify(DRAG.clamp(400, 120, PAPERS.w, PAPERS.h)),
        'the desk clamp is not pure')
}

console.log(`\npaperscheck: ${pass}/${pass + fails.length} checks passed${fails.length ? `  — ${fails.length} FAILED` : '  — OK'}`)
fails.forEach((f) => console.log(`  FAIL  ${f}`))
process.exit(fails.length ? 1 : 0)
