// ironringcheck — proves IRON RING boots, its core fighting rules hold, and it
// can be won. Part A runs the shared fighting core in plain Node (every verb:
// punch, block/chip, throw, projectile, anti-air, EX, super, charge, cancels,
// combos, round/match flow, seeded determinism, and every CPU tier beating a
// dummy). Part B drives the cabinet in headless Chrome with real key events:
// attract → select → fight → K.O., and checks the drawn frame moves when the
// logical state moves. `--mutate` proves the harness can fail: a dead hitbox
// (never active) must stop all damage.
//
//   npm run ironringcheck            # Node rules + browser drive
//   npm run ironringcheck -- --mutate  # prove red
//   needs `npm run dev` for Part B (IRONRING_URL to point elsewhere)

import { plantNew, pull } from './lib/mutateguard.mjs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { launch, requireDevServer, relayNoise } from './lib/harness.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const URL = process.env.IRONRING_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/iron-ring`
const MUT = process.argv.includes('--mutate')
const MUTCONT = process.argv.includes('--mutate-continue')

let pass = 0, fail = 0
const ok = (cond, msg) => { if (cond) { pass++; console.log(`  ok  ${msg}`) } else { fail++; console.error(`FAIL  ${msg}`) } }

const P = (o = {}) => ({ left: false, right: false, up: false, down: false, lp: false, hp: false, lk: false, hk: false, ...o })
const bust = (p) => `${p}?c=${Date.now()}${MUT ? 'm' : ''}`

// ---- Part A: rules in Node --------------------------------------------------------
console.log(`ironringcheck part A: fighting core rules${MUT ? ' (MUTANT: dead hitboxes)' : ''}`)
const SRC = path.join(HERE, '../src/engine/fighting.js')
if (MUT) {
    const src = await import('node:fs').then((fs) => fs.readFileSync(SRC, 'utf8'))
    const before = src
    const mutated = src.replace(
        "if (!mv || f.phase !== 'active' || !mv.box) return null",
        "if (!mv || f.phase !== 'active' || !mv.box) return null; if (globalThis.__IRONRING_NOHIT__) return null")
    ok(mutated !== before, 'mutate: hitbox gate line found to patch')
    plantNew(path.join(HERE, '../src/engine/.mutant-fighting.mjs'), mutated)
    globalThis.__IRONRING_NOHIT__ = true
}
const ENG_PATH = MUT ? '../src/engine/.mutant-fighting.mjs' : '../src/engine/fighting.js'
const e = await import(bust(ENG_PATH))
const { ROSTER, BY_ID, LADDER, matchupLine } = await import(bust('../src/games/IronRing/fighters.js'))
const { STAGES } = await import(bust('../src/games/IronRing/stages.js'))
ok(ROSTER.length >= 6, `roster has ${ROSTER.length} distinct fighters`)
ok(LADDER.length >= 6, 'arcade ladder has 6 opponents')
ok(ROSTER.every((d) => d.moves.lp && d.moves.hp && d.moves.lk && d.moves.hk && d.moves.throw), 'every fighter has punch/kick/throw verbs')

// ---- #1761 item 3: per-matchup dialogue + per-stage midground (pure, Node) ----
console.log('part A: #1761 item 3 — matchup dialogue + midground data')
ok(ROSTER.every((d) => d.win && typeof d.win._default === 'string' && d.win._default.length > 0 && d.lose && typeof d.lose._default === 'string' && d.lose._default.length > 0), 'every fighter carries a win + lose _default line')
ok(matchupLine('kade', 'vexa', 'win') === BY_ID.kade.win.vexa, 'matchup win line resolves the specific table entry (kade vs vexa)')
ok(matchupLine('kade', 'no-such-opp', 'win') === BY_ID.kade.win._default, 'unknown opponent falls back to the _default win line')
ok(matchupLine('no-such-fighter', 'vexa', 'win') === '', 'unknown fighter returns an empty line')
{
    let varied = 0, total = 0
    for (const d of ROSTER) {
        for (const [opp, line] of Object.entries(d.win)) { total++; if (opp !== '_default' && line !== d.win._default) varied++ }
        for (const [opp, line] of Object.entries(d.lose)) { total++; if (opp !== '_default' && line !== d.lose._default) varied++ }
    }
    ok(varied >= 12, `matchup lines are genuinely varied (${varied} specific lines differ from their _default, of ${total} entries)`)
}
ok(ROSTER.some((d) => Object.values(d.win).some((l) => l && l !== d.quote)), 'at least one win line differs from the legacy single quote (feature is live, not a rename)')
ok(STAGES.length === 3, `three stages defined (${STAGES.length})`)
ok(STAGES.every((s) => Array.isArray(s.midground) && s.midground.length >= 3), 'every stage has a non-empty midground (>=3 props)')
{
    const sigs = STAGES.map((s) => s.midground.map((p) => p.t).sort().join(','))
    ok(new Set(sigs).size === sigs.length, `midground layouts are per-stage distinct (${sigs.join(' | ')})`)
}

const human = (id) => ({ ...BY_ID[id], cpu: false })
const go = (m) => { let g = 0; while (m.phase !== 'fight' && g++ < 400) e.step(m, [P(), P()]) }
const QCF = [{ down: true }, { down: true, right: true }, { right: true }, { right: true, lp: true }]
const QCB = [{ down: true }, { down: true, left: true }, { left: true }, { left: true, lp: true }]

// punch lands
let m = e.createMatch({ seed: 5, p1: human('kade'), p2: human('vexa') })
go(m)
m.fighters[1].x = m.fighters[0].x + 1.2
let hp = m.fighters[1].hp
e.step(m, [P({ hp: true }), P()])
for (let i = 0; i < 16; i++) e.step(m, [P(), P()])
    ok(MUT ? hp - m.fighters[1].hp === 0 : hp - m.fighters[1].hp === 9, `heavy punch deals ${hp - m.fighters[1].hp} dmg${MUT ? ' (mutant suppresses it)' : ''}`)

// block absorbs, chips heavy only
if (!MUT) {
    m = e.createMatch({ seed: 5, p1: human('kade'), p2: human('vexa') })
    go(m)
    m.fighters[1].x = m.fighters[0].x + 1.4
    hp = m.fighters[1].hp
    e.step(m, [P({ hp: true }), P({ right: true })])
    for (let i = 0; i < 14; i++) e.step(m, [P(), P({ right: true })])
    ok(m.fighters[1].st === 'blockstun' && hp - m.fighters[1].hp <= 1, `blocking takes ${hp - m.fighters[1].hp} (chip), st ${m.fighters[1].st}`)

    // low must be crouch-blocked: standing block vs sweep
    m = e.createMatch({ seed: 5, p1: human('vexa'), p2: human('kade') })
    go(m)
    m.fighters[1].x = m.fighters[0].x + 1.4
    hp = m.fighters[1].hp
    e.step(m, [P({ down: true, lk: true }), P({ right: true })])
    for (let i = 0; i < 14; i++) e.step(m, [P({ down: true }), P({ right: true })])
    ok(hp - m.fighters[1].hp >= 4, `low kick hits a standing block (${hp - m.fighters[1].hp} dmg)`)
    m = e.createMatch({ seed: 5, p1: human('vexa'), p2: human('kade') })
    go(m)
    m.fighters[1].x = m.fighters[0].x + 1.4
    hp = m.fighters[1].hp
    e.step(m, [P({ down: true, lk: true }), P({ right: true, down: true })])
    for (let i = 0; i < 14; i++) e.step(m, [P({ down: true }), P({ right: true, down: true })])
    ok(hp - m.fighters[1].hp === 0, 'low kick is crouch-blocked cleanly')

    // throw ignores block
    m = e.createMatch({ seed: 5, p1: human('brakk'), p2: human('vexa') })
    go(m)
    m.fighters[1].x = m.fighters[0].x + 1.2
    hp = m.fighters[1].hp
    e.step(m, [P({ right: true, hp: true }), P({ left: true })])
    for (let i = 0; i < 8; i++) e.step(m, [P({ right: true }), P({ left: true })])
    ok(hp - m.fighters[1].hp === 12, `throw beats block (${hp - m.fighters[1].hp})`)

    // projectile
    m = e.createMatch({ seed: 5, p1: human('kade'), p2: human('sable') })
    go(m)
    hp = m.fighters[1].hp
    for (const s of QCF) e.step(m, [P(s), P()])
    let spawned = 0
    for (let i = 0; i < 110; i++) { if (m.projectiles.length) spawned = 1; e.step(m, [P(), P()]) }
    ok(spawned === 1, 'fireball spawns')
    ok(hp - m.fighters[1].hp === 7, 'fireball hits for its damage')

    // anti-air dp
    m = e.createMatch({ seed: 5, p1: human('kade'), p2: human('vexa') })
    go(m)
    for (const s of [{ right: true }, { right: true, down: true }, { down: true }, { up: true, hp: true }]) e.step(m, [P(s), P()])
    ok(m.fighters[0].move === 'dp', 'rising anti-air (dp) starts')

    // ex + super auto-upgrade the same motion
    m = e.createMatch({ seed: 5, p1: human('kade'), p2: human('sable') })
    go(m); m.fighters[0].meter = 60
    for (const s of QCF) e.step(m, [P(s), P()])
    ok(m.fighters[0].move === 'qcfx' && m.fighters[0].meter === 10, 'EX special at 50+ meter')
    m = e.createMatch({ seed: 5, p1: human('kade'), p2: human('sable') })
    go(m); m.fighters[0].meter = 100
    for (const s of QCF) e.step(m, [P(s), P()])
    ok(m.fighters[0].move === 'qcf_S' && m.fighters[0].meter === 0, 'super auto-fires at full meter')

    // SABLE's qcb ward (#1732): motion → special, slow single-hit projectile that
    // outranges her hex, and the CPU earns it through the same parser a human uses.
    m = e.createMatch({ seed: 5, p1: human('sable'), p2: human('kade') })
    go(m)
    for (const s of QCB) e.step(m, [P(s), P()])
    ok(m.fighters[0].move === 'qcb', 'qcb motion starts SABLE ward')
    m.fighters[1].x = m.fighters[0].x + 6
    {
        let spawned = 0
        hp = m.fighters[1].hp
        for (let i = 0; i < 120; i++) { if (m.projectiles.some((p) => p.kind === 'ward')) spawned = 1; e.step(m, [P(), P()]) }
        ok(spawned === 1, 'ward spawns')
        ok(hp - m.fighters[1].hp === 10 && !m.projectiles.some((p) => p.owner === 0), `ward hits once for ${hp - m.fighters[1].hp} then clears`)
    }
    m = e.createMatch({ seed: 5, p1: human('sable'), p2: human('kade') })
    go(m); m.fighters[0].meter = 60
    for (const s of QCB) e.step(m, [P(s), P()])
    ok(m.fighters[0].move === 'qcbx' && m.fighters[0].meter === 10, 'EX ward at 50+ meter')
    m = e.createMatch({ seed: 5, p1: human('sable'), p2: human('kade') })
    go(m); m.fighters[0].meter = 100
    for (const s of QCB) e.step(m, [P(s), P()])
    ok(m.fighters[0].move === 'qcb_S' && m.fighters[0].meter === 0, 'ward super auto-fires at full meter')
    // ward + hex are distinct kinds so a zoner can wall both lanes at once (#481 keying)
    m = e.createMatch({ seed: 5, p1: human('sable'), p2: human('kade') })
    go(m); m.fighters[1].x = m.fighters[0].x + 8 // far, so the slow ward can't hit before the hex joins it
    for (const s of QCB) e.step(m, [P(s), P()])
    for (let i = 0; i < 60 && m.fighters[0].st === 'attack'; i++) e.step(m, [P(), P()]) // let qcb fully recover (ward stays airborne)
    for (const s of QCF) e.step(m, [P(s), P()])
    let both = 0
    for (let i = 0; i < 60; i++) { if (m.projectiles.some((p) => p.kind === 'ward') && m.projectiles.some((p) => p.kind === 'hex')) both = 1; e.step(m, [P(), P()]) }
    ok(both === 1, 'ward and hex fly together (distinct kinds)')
    // the CPU path: scriptMotion('p','qcb') now emits a real motion (was [{}] → never
    // fired), so a CPU SABLE must throw a ward within a match across a few seeds.
    {
        let cpuWard = 0
        for (let seed = 1; seed <= 12 && !cpuWard; seed++) {
            const c = e.createMatch({ seed, p1: { ...BY_ID.sable }, p2: human('vexa') })
            let g = 0
            while (c.phase !== 'over' && g++ < 4000) {
                e.step(c, [P(), P()])
                if (c.projectiles.some((p) => p.owner === 0 && p.kind === 'ward')) cpuWard = 1
            }
        }
        ok(cpuWard === 1, 'CPU SABLE throws its ward (scriptMotion qcb is live)')
    }

    // charge special
    m = e.createMatch({ seed: 5, p1: human('sable'), p2: human('vexa') })
    go(m)
    for (let i = 0; i < 50; i++) e.step(m, [P({ left: true }), P()])
    e.step(m, [P({ right: true, lp: true }), P()])
    ok(m.fighters[0].move === 'charge', 'charge special after holding back')

    // cancel chain: lp -> hp after the hit lands, combo >= 2
    m = e.createMatch({ seed: 5, p1: human('kade'), p2: human('vexa') })
    go(m)
    m.fighters[1].x = m.fighters[0].x + 1.2
    hp = m.fighters[1].hp
    let i = 0
    for (; i < 40; i++) { e.step(m, [i === 0 ? P({ lp: true }) : P(), P()]); if (m.events.some((ev) => ev.kind === 'hit')) break }
    for (let j = 0; j < 4; j++) e.step(m, [P(), P()])
    e.step(m, [P({ hp: true }), P()])
    for (let j = 0; j < 14; j++) e.step(m, [P(), P()])
    ok(hp - m.fighters[1].hp >= 12 && m.fighters[0].combo >= 2, `cancel combo deals ${hp - m.fighters[1].hp} with ${m.fighters[0].combo}-hit counter`)

    // ---- #1734 item 2: the chain links through hit-stop --------------------------------
    // The player presses the next link DURING the freeze on contact. Hit-stop used to
    // discard the whole input pipeline (direction history frozen, padPrev stuck, so a
    // press was invisible even when held), which made normal->special/super chains
    // physically impossible. These rigs input exactly that way and must see the chain.
    const CDP = [{ right: true }, { right: true, down: true }, { down: true }, { up: true, hp: true }]
    const chainRig = (id, meter, stream, gap, pre = 5) => {
        const mm = e.createMatch({ seed: 7, p1: { ...BY_ID[id], cpu: false }, p2: { ...BY_ID.vexa, cpu: false } })
        go(mm)
        mm.fighters[0].meter = meter
        mm.fighters[1].x = mm.fighters[0].x + gap
        e.step(mm, [P({ lp: true }), P()])
        for (let i = 0; i < pre; i++) e.step(mm, [P(), P()]) // let contact + the freeze begin
        const after = stream === 'dp' ? CDP : QCF
        for (const q of after) e.step(mm, [P(q), P()]) // pressed straight through the freeze
        for (let i = 0; i < 25; i++) e.step(mm, [P(), P()]) // special resolves; still mid-move when read
        return mm
    }
    {
        const c = chainRig('kade', 0, 'qcf', 1.2)
        ok(c.fighters[0].move === 'qcf' && 100 - c.fighters[1].hp >= 11,
            `normal -> special: lp into buffered qcf chain lands (move ${c.fighters[0].move}, dmg ${100 - c.fighters[1].hp} = lp + ember)`)
    }
    {
        // the hard case: the button goes down INSIDE the freeze — only press
        // banking can deliver this link
        const c = chainRig('kade', 0, 'qcf', 1.2, 4)
        ok(c.fighters[0].move === 'qcf' && 100 - c.fighters[1].hp >= 11,
            `press banked inside the freeze still chains (move ${c.fighters[0].move}, dmg ${100 - c.fighters[1].hp})`)
    }
    {
        const c = chainRig('kade', 100, 'dp', 1.2)
        ok(c.fighters[0].move === 'dp_S' && c.fighters[0].meter < 50,
            `normal -> super: lp into full-bar dp cancels as dp_S (move ${c.fighters[0].move}, meter ${c.fighters[0].meter})`)
    }
    {
        // specials into supers: a landed dp opens the gate; the next dp press at a
        // full bar auto-upgrades out of the chain (bar topped by the harness — the
        // link under test is the cancel, not the farm).
        const mm = e.createMatch({ seed: 7, p1: { ...BY_ID.kade, cpu: false }, p2: { ...BY_ID.vexa, cpu: false } })
        go(mm)
        mm.fighters[1].x = mm.fighters[0].x + 1.2
        for (const q of CDP) e.step(mm, [P(q), P()])
        for (let i = 0; i < 12; i++) e.step(mm, [P(), P()]) // dp lands, still mid-recovery (a cancel, not a fresh press)
        ok(mm.fighters[0].move === 'dp' && mm.fighters[0].meter === 8, `plain dp lands and gates (${mm.fighters[0].move}, bar ${mm.fighters[0].meter})`)
        mm.fighters[0].meter = 100
        for (const q of CDP) e.step(mm, [P(q), P()])
        ok(mm.fighters[0].move === 'dp_S' && mm.fighters[0].meter === 0,
            `special -> super: landed dp cancels into dp_S (move ${mm.fighters[0].move}, meter ${mm.fighters[0].meter})`)
    }
    {
        // freshness law: a press banked during a freeze is short-lived — once the
        // window passes it must never fire out of nowhere
        const mm = e.createMatch({ seed: 7, p1: { ...BY_ID.kade, cpu: false }, p2: { ...BY_ID.vexa, cpu: false } })
        go(mm)
        mm.fighters[0].btnBuf = { key: 'lp', t: (mm.fighters[0].hf || 0) - 40 }
        e.step(mm, [P(), P()])
        ok(mm.fighters[0].st === 'idle' && !mm.fighters[0].move, 'stale banked press never starts a move (window closed)')
    }
    {
        // determinism survives the buffered pipeline: identical streams hash identical
        const runChain = (seed) => {
            const mm = e.createMatch({ seed, p1: { ...BY_ID.kade, cpu: true }, p2: { ...BY_ID.vexa, cpu: false } })
            go(mm)
            const hs = []
            for (let k = 0; k < 600; k++) {
                const c = k % 50
                e.step(mm, [P(), P({ right: c < 14, lp: c % 17 === 3, down: c % 17 === 1 })])
                hs.push(e.matchHash(mm))
            }
            return hs.join(',')
        }
        ok(runChain(21) === runChain(21), 'determinism holds with freeze-banked inputs')
    }

    // ---- MULTI: multi-hit specials (#1699) --------------------------------------
    // The re-hit rules: `hits` caps, `rehit` spaces, soft push keeps contact,
    // final hit pushes/launches. Rigs drive real pad streams through the same
    // parser a human uses.
    const DP = [{ right: true }, { right: true, down: true }, { down: true }, { up: true, hp: true }]
    const rig = (id, meter, gap, stream) => {
        const mm = e.createMatch({ seed: 7, p1: { ...BY_ID[id], cpu: false }, p2: { ...BY_ID.vexa, cpu: false } })
        go(mm)
        mm.fighters[0].meter = meter
        if (stream === 'charge') for (let i = 0; i < 50; i++) e.step(mm, [P({ left: true }), P()])
        mm.fighters[1].x = mm.fighters[0].x + gap
        const s = stream === 'charge' ? [{ right: true, hp: true }] : stream === 'dp' ? DP : QCF
        for (const q of s) e.step(mm, [P(q), P()])
        const mvName = mm.fighters[0].move
        let maxVictimY = 0
        for (let i = 0; i < 90; i++) {
            e.step(mm, [P({ right: i < 12 }), P()])
            if (mm.fighters[1].y > maxVictimY) maxVictimY = mm.fighters[1].y
        }
        return {
            mv: mvName,
            hits: mm.events.filter((ev) => ev.kind === 'hit' && ev.by === 0),
            blocks: mm.events.filter((ev) => ev.kind === 'block' && ev.by === 0),
            dmg: (mm.fighters[1].def.hp || 100) - mm.fighters[1].hp,
            launch: maxVictimY,
        }
    }
    const mh = (r, name, move, n, dmg) => {
        ok(r.mv === move && r.hits.length === n && r.dmg === dmg,
            `${name}: ${r.mv} scored ${r.hits.length}/${n} hits for ${r.dmg}/${dmg}`)
        const gaps = r.hits.slice(1).map((h, i) => h.t - r.hits[i].t)
        ok(gaps.every((g) => g >= 4), `${name}: re-hits spaced ${gaps.join(',') || '-'} ticks (no machine-gun)`)
    }
    mh(rig('hyde', 0, 2.0, 'qcf'), 'HYDE dash', 'qcf', 2, 10)
    mh(rig('hyde', 60, 2.2, 'qcf'), 'HYDE dash EX', 'qcfx', 3, 15)
    const hydeSup = rig('hyde', 100, 2.4, 'qcf')
    mh(hydeSup, 'HYDE dash super', 'qcf_S', 4, 20)
    ok(hydeSup.launch > 0, `HYDE dash super's final hit launches the victim (y ${hydeSup.launch.toFixed(2)})`)
    mh(rig('kade', 100, 1.6, 'dp'), 'KADE dp_S', 'dp_S', 3, 21)
    mh(rig('vexa', 100, 1.6, 'dp'), 'VEXA dp_S', 'dp_S', 2, 16)
    mh(rig('hyde', 100, 1.6, 'dp'), 'HYDE dp_S', 'dp_S', 3, 18)
    mh(rig('tessa', 100, 1.6, 'dp'), 'TESSA dp_S', 'dp_S', 3, 18)
    mh(rig('brakk', 100, 1.8, 'charge'), 'BRAKK charge_S', 'charge_S', 2, 22)
    mh(rig('sable', 100, 1.9, 'charge'), 'SABLE charge_S', 'charge_S', 2, 20)

    // caps are real: sustained contact past the window never exceeds `hits`
    ok(hydeSup.hits.length === 4, `dash super caps at 4 hits even with 90 ticks of contact (got ${hydeSup.hits.length})`)

    // single-hit law intact: normals, throws and projectiles still score once
    let mm2 = e.createMatch({ seed: 5, p1: human('kade'), p2: human('vexa') })
    go(mm2); mm2.fighters[1].x = mm2.fighters[0].x + 1.2
    e.step(mm2, [P({ lp: true }), P()])
    for (let i = 0; i < 30; i++) e.step(mm2, [P(), P()])
    ok(mm2.events.filter((ev) => ev.kind === 'hit' && ev.mv === 'lp').length === 1, 'a normal still hits exactly once')
    const brakThrow = rig('brakk', 100, 1.2, 'qcf')
    ok(brakThrow.mv === 'qcf_S' && brakThrow.hits.length === 1 && brakThrow.dmg === 28,
        `throws stay single-hit (qcf_S ${brakThrow.hits.length} hit, ${brakThrow.dmg} dmg)`)

    // blocking a rush eats every hit — and low-per-hit damage never chips
    const mmB = e.createMatch({ seed: 7, p1: { ...BY_ID.hyde, cpu: false }, p2: { ...BY_ID.vexa, cpu: false } })
    go(mmB); mmB.fighters[1].x = mmB.fighters[0].x + 2.0
    for (const q of QCF) e.step(mmB, [P(q), P({ right: true })])
    let blockedDmg = 0
    for (let i = 0; i < 60; i++) e.step(mmB, [P({ right: i < 12 }), P({ right: true })])
    blockedDmg = 100 - mmB.fighters[1].hp
    ok(mmB.events.filter((ev) => ev.kind === 'block' && ev.by === 0).length >= 2 && blockedDmg === 0,
        `blocked dash absorbs all ${mmB.events.filter((ev) => ev.kind === 'block' && ev.by === 0).length} hits, chip ${blockedDmg}`)

    // budget law: every multi-hit move's total sits at original +0..+3
    const BUDGET = { 'kade dp_S': [18, 3], 'vexa dp_S': [16, 2], 'hyde qcf': [9, 2], 'hyde qcfx': [12, 3], 'hyde qcf_S': [17, 4], 'hyde dp_S': [17, 3], 'tessa dp_S': [16, 3], 'brakk charge_S': [22, 2], 'sable charge_S': [20, 2] }
    const budgetFails = []
    for (const [name, [orig, n]] of Object.entries(BUDGET)) {
        const [id, key] = name.split(' ')
        const mv = BY_ID[id].moves[key]
        const total = mv.dmg * mv.hits
        if (!(mv.hits === n && total >= orig && total <= orig + 3)) budgetFails.push(`${name}: hits ${mv.hits}/${n} total ${total} vs ${orig}..${orig + 3}`)
    }
    ok(budgetFails.length === 0, `multi-hit budgets hold at original+0..+3 (${budgetFails.join(' | ') || 'all 9'})`)

    // determinism survives live multi-hits (dash-driven stream vs CPU)
    const runRH = (seed) => {
        const mm = e.createMatch({ seed, p1: { ...BY_ID.hyde, cpu: false }, p2: { ...BY_ID.kade, cpu: true } })
        go(mm)
        const hs = []
        for (let k = 0; k < 600; k++) {
            const c = k % 60
            e.step(mm, [P({ right: c < 12, down: c === 10 || c === 11, lp: c === 12 }), P()])
            hs.push(e.matchHash(mm))
        }
        return hs.join(',')
    }
    ok(runRH(11) === runRH(11), 'determinism holds with multi-hit dashes in the stream')

    // the other engine consumer (guardButton mode, no hits set anywhere) is untouched
    const mmV = e.createMatch({ seed: 5, guardButton: true, p1: human('kade'), p2: human('vexa') })
    go(mmV); mmV.fighters[1].x = mmV.fighters[0].x + 1.2
    e.step(mmV, [P({ hp: true }), P()])
    for (let i = 0; i < 16; i++) e.step(mmV, [P(), P()])
    ok(mmV.events.filter((ev) => ev.kind === 'hit').length === 1 && 100 - mmV.fighters[1].hp === 9,
        'guardButton consumer still single-hits (9 dmg, one event)')

    // determinism: seed + pad streams -> identical hashes
    const run = (seed) => {
        const mm = e.createMatch({ seed, p1: human('kade'), p2: human('hyde') })
        go(mm)
        const hs = []
        for (let k = 0; k < 900; k++) {
            e.step(mm, [P({ right: k % 40 < 20, lp: k % 37 === 0, down: k % 90 === 0 }), P({ left: k % 50 < 25, hk: k % 53 === 0 })])
            hs.push(e.matchHash(mm))
        }
        return hs.join(',')
    }
    ok(run(3) === run(3), 'same seed + same pads -> identical hash stream')
    const runCpu = (seed) => {
        const mm = e.createMatch({ seed, p1: { ...BY_ID.kade, cpu: true }, p2: human('hyde') })
        go(mm)
        const hs = []
        for (let k = 0; k < 900; k++) { e.step(mm, [P(), P()]); hs.push(e.matchHash(mm)) }
        return hs.join(',')
    }
    ok(runCpu(3) !== runCpu(4), 'different seed -> different CPU stream')

    // the game can be won: every CPU tier beats an idle dummy 2-0
    for (const id of LADDER) {
        const mm = e.createMatch({ seed: 1234, p1: { ...BY_ID[id], cpu: true }, p2: human('vexa') })
        let g = 0
        while (mm.phase !== 'done' && g++ < 60 * 60 * 4) e.step(mm, [P(), P()])
        ok(mm.phase === 'done' && mm.winner === 0 && mm.fighters[0].wins >= 2, `CPU ${id} completes a match vs idle`)
    }

    // round + match structure: two KOs = done, timer decrements
    m = e.createMatch({ seed: 5, p1: human('kade'), p2: human('vexa') })
    go(m)
    const t0 = m.timer
    for (let i = 0; i < 60; i++) e.step(m, [P(), P()])
    ok(m.timer === t0 - 60, 'clock ticks 1 per second')
    let g = 0
    while (m.phase !== 'done' && g++ < 60000) { m.fighters[1].hp = 0; e.step(m, [P(), P()]) }
    ok(m.phase === 'done' && m.winner === 0 && m.fighters[0].wins >= 2, 'match completes when rounds are won')
}

if (MUT) {
    globalThis.__IRONRING_NOHIT__ = true
    m = e.createMatch({ seed: 5, p1: human('kade'), p2: human('vexa') })
    go(m)
    m.fighters[1].x = m.fighters[0].x + 1.2
    hp = m.fighters[1].hp
    e.step(m, [P({ hp: true }), P()])
    for (let i = 0; i < 16; i++) e.step(m, [P(), P()])
    ok(m.fighters[1].hp === hp, 'MUTANT check: with the patched gate no damage ever lands (harness bites)')
    globalThis.__IRONRING_NOHIT__ = false
    pull(path.join(HERE, '../src/engine/.mutant-fighting.mjs'))

    // targeted mutant (#1734): make the freeze deaf (sensing stopped mid-freeze)
    // — the buffered normal->special chain must break while the raw lp still hits.
    const fs2 = await import('node:fs')
    const src2 = fs2.readFileSync(SRC, 'utf8')
    const mut2 = src2.replace('const frozen = senseInputs(m, pads)', 'const frozen = [emptyPad(), emptyPad()] // MUTANT: freeze goes deaf')
    ok(mut2 !== src2, 'mutate: freeze-sensing line found to patch')
    plantNew(path.join(HERE, '../src/engine/.mutant-fighting2.mjs'), mut2)
    const e2 = await import(`../src/engine/.mutant-fighting2.mjs?c=${Date.now()}m2`)
    {
        const mm = e2.createMatch({ seed: 7, p1: { ...BY_ID.kade, cpu: false }, p2: { ...BY_ID.vexa, cpu: false } })
        { let g = 0; while (mm.phase !== 'fight' && g++ < 400) e2.step(mm, [P(), P()]) }
        mm.fighters[1].x = mm.fighters[0].x + 1.2
        const hpBefore = mm.fighters[1].hp
        e2.step(mm, [P({ lp: true }), P()])
        for (let i = 0; i < 5; i++) e2.step(mm, [P(), P()])
        for (const q of [{ down: true }, { down: true, right: true }, { right: true }, { right: true, lp: true }, {}, {}, {}]) e2.step(mm, [P(q), P()])
        ok(mm.fighters[1].hp < hpBefore, 'mutant2 baseline: the lp link still lands (only the freeze is deaf)')
        ok(mm.fighters[0].move !== 'qcf', `MUTANT check: chain dies when the freeze cannot hear inputs (move ${mm.fighters[0].move})`)
    }
    pull(path.join(HERE, '../src/engine/.mutant-fighting2.mjs'))
}

console.log(`part A: ${pass} ok, ${fail} fail`)

// ---- Part A2: the online select-start gate (#1761) ------------------------------
// The wire carries the guest's pick on its own 'pick' message; the host is the
// launch authority. A FIGHT press that precedes the guest's pick must DEFER the
// start, and the late pick must fire it with the guest's real choice — never a
// seeded placeholder standing in for the challenger (#1761 item 4).
console.log('part A2: online select gate (netselect.js)')
{
    const { createHostSelect } = await import(bust('../src/games/IronRing/netselect.js'))
    const s1 = createHostSelect()
    const c1 = s1.commit('kade')
    ok(c1.start === null && c1.waiting === true, 'a FIGHT press before the guest pick DEFERS the start (waiting)')
    const g1 = s1.onPick('sable')
    ok(g1.start && g1.start.hostChar === 'kade' && g1.start.guestChar === 'sable',
        'the late pick launches with the guest REAL choice (sable), not a placeholder')

    const s2 = createHostSelect()
    s2.onPick('vexa')
    const c2 = s2.commit('hyde')
    ok(c2.start && c2.start.hostChar === 'hyde' && c2.start.guestChar === 'vexa' && c2.waiting === false,
        'a pick that lands before the host commits launches immediately with it')

    const s3 = createHostSelect()
    s3.onPick('vexa')
    s3.commit('hyde')
    const re = s3.onPick('brakk')
    ok(re.start === null, 'a re-pick after the host already started cannot relaunch the match')

    if (MUT) {
        // Mutant: restore the pre-#1761 behavior — commit launches immediately,
        // so a guest pick still in flight is dropped for a seeded placeholder.
        // The deferral invariant above must go RED on this.
        const fsx = await import('node:fs')
        const NSRC = path.join(HERE, '../src/games/IronRing/netselect.js')
        const src = fsx.readFileSync(NSRC, 'utf8')
        // Delete the gate line so `commit` falls straight through to launch —
        // the pre-#1761 behavior where a FIGHT press starts the match even if
        // the guest's pick is still in flight (and becomes a placeholder).
        const mutated = src.replace(
            'if (guestChar == null) return { start: null, waiting: true }',
            '// MUTANT: the gate is gone — commit launches before the pick lands')
        ok(mutated !== src, 'mutate: netselect gate line found to patch')
        const MNS = path.join(HERE, '../src/games/IronRing/.mutant-netselect.mjs')
        plantNew(MNS, mutated)
        const { createHostSelect: mutHost } = await import(bust(MNS))
        const ms = mutHost()
        const mc = ms.commit('kade')
        const deferred = mc.start === null && mc.waiting === true
        ok(!deferred, 'MUTANT check: the gate is gone — commit launches immediately, dropping the in-flight pick (harness bites)')
        pull(MNS)
    }
}

// ---- mutate-dialogue: prove the matchup-line gate bites --------------------------
// Revert matchupLine to the pre-#1761 behavior (ignore the matchup table, always
// return the legacy single quote). The Part A "specific table entry" assertion
// above must go RED on this — the harness catches a revert to generic quotes.
if (process.argv.includes('--mutate-dialogue')) {
    console.log('mutate-dialogue: proving the matchup-line gate bites')
    const fsx = await import('node:fs')
    const FSRC = path.join(HERE, '../src/games/IronRing/fighters.js')
    const src = fsx.readFileSync(FSRC, 'utf8')
    const mutated = src
        .replace('if (opp && table[opp]) return table[opp]', '// MUTANT: matchup table ignored')
        .replace('return table._default || def.quote || \'\'', 'return def.quote || \'\'')
    ok(mutated !== src, 'mutate-dialogue: matchupLine lines found to patch')
    const MF = path.join(HERE, '../src/games/IronRing/.mutant-fighters.mjs')
    plantNew(MF, mutated)
    const mf = await import(bust(MF))
    ok(mf.matchupLine('kade', 'vexa', 'win') !== mf.BY_ID.kade.win.vexa, 'MUTANT: the specific matchup line no longer resolves (Part A assertion goes red)')
    ok(mf.matchupLine('kade', 'vexa', 'win') === mf.BY_ID.kade.quote, 'MUTANT: the line collapses to the legacy single quote (harness bites)')
    pull(MF)
    console.log(`ironringcheck (mutate-dialogue): ${pass} ok, ${fail} fail`)
    process.exit(fail ? 1 : 0)
}

// ---- mutate-continue: prove the ladder-loss continue gate can fail --------------
// (deleting the continue branch keeps a lost ladder run silently on 'play'/'attract'
// instead of the CONTINUE? screen — the normal-mode gate below must then go red.)
if (MUTCONT) {
    console.log('mutate-continue: proving the continue-screen gate bites')
    await requireDevServer(URL)
    const mb = await launch()
    const mp = await mb.newPage({ viewport: { width: 1024, height: 640 } })
    await mp.addInitScript(() => { window.__IRONRING_NOCONTINUE__ = true })
    await mp.goto(URL, { waitUntil: 'networkidle' })
    await mp.waitForFunction(() => window.__ironRingTest, null, { timeout: 15000 })
    await mp.evaluate(() => window.__ironRingTest.start())
    await mp.waitForFunction(() => window.__ironRingTest.state && window.__ironRingTest.state.phase === 'fight', null, { timeout: 8000 })
    await mp.evaluate(() => window.__ironRingTest.koP1())
    await mp.waitForFunction(() => window.__ironRingTest.state && window.__ironRingTest.state.phase === 'fight', null, { timeout: 8000 })
    await mp.evaluate(() => window.__ironRingTest.koP1())
    await mp.waitForTimeout(3200)
    const ms = await mp.evaluate(() => window.__ironRingTest.state)
    ok(ms.screen !== 'continue' && (ms.screen === 'play' || ms.screen === 'attract'),
        `mutant: loss never reaches the continue screen (screen ${ms.screen}) — the gate would catch its removal`)
    await mb.close()
    console.log(`ironringcheck (mutate-continue): ${pass} ok, ${fail} fail`)
    process.exit(fail ? 1 : 0)
}

// ---- Part B: browser drive ---------------------------------------------------------
if (!MUT) {
    console.log('part B: browser drive at', URL)
    await requireDevServer(URL)
    const browser = await launch()
    const page = await browser.newPage({ viewport: { width: 1024, height: 640 } })
    const errors = []
    page.on('console', (msg) => { if (msg.type() === 'error' && !relayNoise(msg.text())) errors.push(msg.text()) })
    page.on('pageerror', (err) => errors.push(String(err)))
    await page.goto(URL, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => document.querySelector('canvas[data-ironring-stage]') && window.__ironRingTest, null, { timeout: 15000 })

    let shots = await page.locator('canvas[data-ironring-stage]').screenshot()
    ok(shots.length > 5000, 'attract renders a rich frame (non-trivial canvas)')

    await page.keyboard.press('Digit1')
    await page.waitForTimeout(200)
    // #1637: the coin press must land on char select — offline attract is not a
    // parking lot (regression guard for the #1104 atAttract pin).
    let sc = await page.evaluate(() => window.__ironRingTest.state && window.__ironRingTest.state.screen)
    ok(sc === 'select', `insert coin advances attract -> select (screen ${sc})`)
    await page.keyboard.press('Space')
    await page.waitForTimeout(200)
    sc = await page.evaluate(() => window.__ironRingTest.state && window.__ironRingTest.state.screen)
    ok(sc === 'play', `the pick walks into the fight (screen ${sc})`)
    await page.keyboard.press('Space')
    await page.waitForFunction(() => window.__ironRingTest.state && window.__ironRingTest.state.phase !== 'intro', null, { timeout: 20000 })
    let st = await page.evaluate(() => window.__ironRingTest.state)
    ok(st && (st.phase === 'fight' || st.phase === 'ko'), `fight starts from select (phase ${st && st.phase})`)

    // walk forward while punching: inputs must reach the sim, and land when in range
    await page.keyboard.down('ArrowRight')
    let punchStarted = false, hitLanded = false
    for (let i = 0; i < 16 && !(punchStarted && hitLanded); i++) {
        await page.keyboard.press('KeyK')
        await page.waitForTimeout(200)
        const s = await page.evaluate(() => window.__ironRingTest.state)
        if (s.st[0] === 'hp' || s.st[0] === 'lp' || s.st[0] === 'hk') punchStarted = true
        if (s.hp[1] < 100) hitLanded = true
    }
    const shotA = await page.locator('canvas[data-ironring-stage]').screenshot()
    await page.keyboard.press('KeyK')
    await page.waitForTimeout(250)
    const shotB = await page.locator('canvas[data-ironring-stage]').screenshot()
    await page.keyboard.up('ArrowRight')
    ok(Buffer.compare(shotA, shotB) !== 0, 'frame changes between consecutive frames (renderer alive)')
    st = await page.evaluate(() => window.__ironRingTest.state)
    ok(punchStarted, 'keyboard attack input starts a move in the sim (inputs reach the engine)')
    ok(hitLanded || st.x[0] !== -2.6, `attack closes on the CPU (P2 hp ${st.hp[1]}, P1 x ${st.x[0]})`)

    // ---- #1699: real keys drive HYDE's multi-hit dash — the combo reaches the
    // screen, not just the Node sim (down, forward + punch, retry vs the CPU) ----
    await page.evaluate(() => window.__ironRingTest.setChars('hyde', 'vexa'))
    await page.waitForFunction(() => window.__ironRingTest.state && window.__ironRingTest.state.phase === 'fight', null, { timeout: 20000 })
    let sawMulti = false
    await page.keyboard.down('ArrowRight')
    for (let i = 0; i < 14 && !sawMulti; i++) {
        await page.keyboard.press('ArrowDown')
        await page.waitForTimeout(40)
        await page.keyboard.press('KeyJ')
        for (let p = 0; p < 5 && !sawMulti; p++) {
            await page.waitForTimeout(70)
            const s = await page.evaluate(() => window.__ironRingTest.state)
            if (s && s.st[0] === 'qcf' && s.combo[0] >= 2) sawMulti = true
        }
        await page.waitForTimeout(120)
    }
    await page.keyboard.up('ArrowRight')
    ok(sawMulti, 'real keys drive HYDE dash — a 2+ hit combo lands in the browser sim')

    // round + match flow: two K.O.s end the match with the human ahead
    let guard = 0
    while (guard++ < 8 && st.wins[0] < 2 && st.phase !== 'done') {
        await page.waitForFunction(() => window.__ironRingTest.state && window.__ironRingTest.state.phase === 'fight', null, { timeout: 8000 })
        await page.evaluate(() => window.__ironRingTest.koP2())
        await page.waitForTimeout(200)
        st = await page.evaluate(() => window.__ironRingTest.state)
    }
    ok(st.wins[0] >= 2 || st.phase === 'done', `two K.O.s advance rounds (wins ${st.wins.join('-')}, phase ${st.phase})`)

    // pause overlay
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    const pausedVisible = await page.evaluate(() => !!document.body.innerText.match(/IRON RING|RESUME|PAUSED|CONTROL/i))
    ok(pausedVisible, '?/Esc opens the pause overlay')
    await page.keyboard.press('Escape')

    // ---- continue screen (#1103): a lost ladder run asks CONTINUE? with credits ----
    await page.evaluate(() => window.__ironRingTest.start())
    await page.waitForFunction(() => window.__ironRingTest.state && window.__ironRingTest.state.phase === 'fight', null, { timeout: 8000 })
    await page.evaluate(() => window.__ironRingTest.koP1())
    await page.waitForFunction(() => window.__ironRingTest.state && window.__ironRingTest.state.phase === 'fight', null, { timeout: 8000 })
    await page.evaluate(() => window.__ironRingTest.koP1())
    await page.waitForFunction(() => window.__ironRingTest.state && window.__ironRingTest.state.screen === 'continue', null, { timeout: 8000 })
    st = await page.evaluate(() => window.__ironRingTest.state)
    ok(st.screen === 'continue', `ladder loss lands on the CONTINUE screen (screen ${st.screen})`)
    ok(st.continueFrames > 0 && st.credits === 3, `continue shows a countdown + full credits (frames ${st.continueFrames}, credits ${st.credits})`)
    ok(st.quote === matchupLine(st.p2, st.p1, 'win'), `the winning CPU taunts with its MATCHUP win line (${st.quote})`)
    ok(st.quote !== BY_ID[st.opponent].quote, `the taunt is matchup-specific, not the legacy quote (${st.quote})`)
    await page.keyboard.press('Space')
    await page.waitForFunction(() => window.__ironRingTest.state && window.__ironRingTest.state.screen === 'play', null, { timeout: 4000 })
    st = await page.evaluate(() => window.__ironRingTest.state)
    ok(st.credits === 2 && st.opponent === 'vexa', `SPACE spends a credit and retries the SAME rung (credits ${st.credits}, opp ${st.opponent})`)
    // lose the retried run too, then let the countdown run out (no key) → attract
    await page.waitForFunction(() => window.__ironRingTest.state && window.__ironRingTest.state.phase === 'fight', null, { timeout: 8000 })
    await page.evaluate(() => window.__ironRingTest.koP1())
    await page.waitForFunction(() => window.__ironRingTest.state && window.__ironRingTest.state.phase === 'fight', null, { timeout: 8000 })
    await page.evaluate(() => window.__ironRingTest.koP1())
    await page.waitForFunction(() => window.__ironRingTest.state && window.__ironRingTest.state.screen === 'continue', null, { timeout: 8000 })
    ok((await page.evaluate(() => window.__ironRingTest.state)).credits === 2, `second loss keeps the spent credit (credits 2)`)
    await page.evaluate(() => window.__ironRingTest.expireContinue())
    await page.waitForFunction(() => window.__ironRingTest.state && window.__ironRingTest.state.screen === 'attract', null, { timeout: 2000 })
    st = await page.evaluate(() => window.__ironRingTest.state)
    ok(st.screen === 'attract' && st.credits === 0, `countdown expiry ends the run at attract, credits lost (credits ${st.credits})`)

    // ---- victory quote (#1103): winning the last rung crowns with the fighter's quote ----
    await page.evaluate(() => { window.__ironRingTest.start(); window.__ironRingTest.setLadder(5) })
    await page.waitForFunction(() => window.__ironRingTest.state && window.__ironRingTest.state.phase === 'fight', null, { timeout: 8000 })
    await page.evaluate(() => window.__ironRingTest.koP2())
    await page.waitForFunction(() => window.__ironRingTest.state && window.__ironRingTest.state.phase === 'fight', null, { timeout: 8000 })
    await page.evaluate(() => window.__ironRingTest.koP2())
    await page.waitForFunction(() => window.__ironRingTest.state && window.__ironRingTest.state.screen === 'champion', null, { timeout: 8000 })
    st = await page.evaluate(() => window.__ironRingTest.state)
    ok(st.screen === 'champion', `winning the final rung crowns the player (screen ${st.screen})`)
    ok(st.quote === matchupLine(st.champion, st.p2, 'win'), `champion screen shows the player's MATCHUP win line (${st.quote})`)
    ok(st.quote !== BY_ID[st.champion].quote, `the victory line is matchup-specific, not the legacy quote (${st.quote})`)

    ok(errors.length === 0, `zero page errors (${errors.slice(0, 2).join(' | ') || 'clean'})`)
    await browser.close()
}

console.log(`ironringcheck: ${pass} ok, ${fail} fail`)
process.exit(fail ? 1 : 0)
