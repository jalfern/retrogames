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
// traps, budget <= 2/day, >= 1 from day 2, all six species per week) ·
// rulebook (every rule exercises the day it wakes; no law before its day) ·
// clumsy play clears the week AND chaos loses by day 1 (the slack rule,
// in booth terms) · the proven weeks (attract replays these) ·
// determinism · mutants.

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { RULES, DAY_RULES, decide, judge, dnum } from '../src/games/PapersPleaseMin/rules.js'
import { genWeek, genDay, viewOf, CITY2C, TRAPS } from '../src/games/PapersPleaseMin/gen.js'
import { CFG, newRun, step, stateHash, current, autopilot } from '../src/games/PapersPleaseMin/sim.js'
import { CW, CHS, STRIP_H, WALL, CHAR, SCALE, PORTRAIT, PAPERS, wallFit } from '../src/games/PapersPleaseMin/layout.js'

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
                // the booth's printed panel (index.jsx prints every entry)
                ok(day.wanted.length <= 4, `day ${day.n} printed ${day.wanted.length} wanted names — the wall would have to hide one (unfair by furniture)`)
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
    // genDay called standalone must equal the week's own day (no hidden state)
    const wk = genWeek(1)
    ok(JSON.stringify(genDay(1, 4, 3)) === JSON.stringify(wk.days[3]), 'genDay standalone drifts from genWeek — hidden state')
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
    let worst = 0
    for (const seed of SEEDS) {
        for (const day of genWeek(seed).days) {
            const f = wallFit(day, day.rules.map((r) => RULES[r].text))
            worst = Math.max(worst, f.bottom)
            ok(f.fits && f.listsFit, `seed ${seed} day ${day.n}: wall text reaches y=${f.bottom} — the booth is only ${CHS - STRIP_H}px of wall`)
            ok(f.rulesClearScale && f.listsClearScale, `seed ${seed} day ${day.n}: the SCALE box is painted ON ${f.rulesEnd > SCALE.y ? 'the rulebook' : 'the entry/wanted lists'} — the sheet vanishes`)
            ok(f.rulesClearEntrant, `seed ${seed} day ${day.n}: a rulebook line runs into the entrant column`)
        }
    }
    console.log(`  ..    worst wall bottom y=${worst} of ${CHS - STRIP_H}; every entry, every wanted name, every law is on screen together`)
    // and the theoretical worst day the generator is allowed to build: the
    // full 8-rule sheet, four countries, four wanted names (#410: the old
    // booth overflowed exactly here and the scale box buried the sheet)
    {
        const worstDay = { n: 7, allowed: ['ARSTOTZKA', 'KIRINIA', 'VESKOLE', 'PARMENISTAN'], wanted: [{ name: 'ANDERSON K V', id: 4022 }, { name: 'GORSKY A V', id: 1180 }, { name: 'VOSKOVIC M', id: 3345 }, { name: 'DZURAK L', id: 2077 }], rules: DAY_RULES[6] }
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
}

console.log(`\npaperscheck: ${pass}/${pass + fails.length} checks passed${fails.length ? `  — ${fails.length} FAILED` : '  — OK'}`)
fails.forEach((f) => console.log(`  FAIL  ${f}`))
process.exit(fails.length ? 1 : 0)
