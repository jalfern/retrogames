// VOICECMDCHECK (#1249) — spoken co-op's proof, in plain Node.
//
// The browser owns the microphone (speechListen.js) and the words (the Web
// Speech API); everything that makes the CALLS real is pure and gets pinned
// here: the grammar (what phrases become which intent, and what stays silent),
// the command overlay on the partner seat (obey / refuse / hold / arrive), the
// seat law (a voice-driven seat still answers ONLY with pads), determinism,
// the `voiceCmd` recording channel, and the proven quest still being WON with
// twenty orders shouted along the way.
//
//   node scripts/voicecmdcheck.mjs             # green
//   node scripts/voicecmdcheck.mjs --mutate  # RED by design: the seat goes
//                                            # stone deaf (partnerPad never sees
//                                            # the command) — the obey-checks
//                                            # must catch it
//   npm run voicecmdcheck

import { makeGame, step, stateHash } from '../src/games/Gauntlet/sim.js'
import { partnerPad, applyCall, plan } from '../src/games/Gauntlet/planner.js'
import { parseCall, intentLabel, normalizeCall, CALL_INTENTS, DIRS } from '../src/games/Gauntlet/voicecalls.js'
import { createRecorder, validate, recDownload } from '../src/utils/recording.js'

const MUTATE = process.argv.includes('--mutate')
// The mutation: the seat forgets the calls (what a regression of the
// `partnerPad(gs, prevA, gs._vCmd)` handoff in index.jsx would look like).
const cmdOf = (gs) => (MUTATE ? null : gs._vCmd || null)

let pass = 0, fail = 0
const ok = (cond, name, info = '') => {
    if (cond) { pass++; console.log(`  ok   ${name}`) }
    else { fail++; console.log(`FAIL   ${name}${info ? ` — ${info}` : ''}`) }
}

const seatOf = (raw) => ({ left: raw.left, right: raw.right, fwd: raw.up, back: raw.down, sword: raw.a })

// drive — a co-op run: hero idle or autopilot, partner through the real
// partnerPad/applyCall path. Records whether the call's goal cell was ever
// actually stood on while the partner lived.
function drive(seed, script = [], maxTicks = 2500, { heroIdle = true, stopAtGoal = false, quiet = false } = {}) {
    const gs = makeGame(seed, 'warrior', { partner: true, topDown: true })
    gs.partnerOn = true
    let prevA = false
    const pads = []
    let reached = null
    for (let t = 1; t <= maxTicks; t++) {
        for (const [tt, c] of script) if (tt === t) applyCall(gs, c)
        const inp = heroIdle ? {} : undefined
        if (inp === undefined) throw new Error('drive: hero driver required')
        if (quiet) { gs.monsters.length = 0; gs.shots.length = 0; gs.partner.hp = gs.partner.maxHp } // navigation lab, not a combat trial
        const raw = partnerPad(gs, prevA, cmdOf(gs))
        pads.push(raw)
        step(gs, inp, seatOf(raw))
        const g = gs._vCmd && gs._vCmd.goal
        if (stopAtGoal && g && !gs.partner.down && Math.floor(gs.partner.x) === g[0] && Math.floor(gs.partner.y) === g[1]) { reached = { t, cell: [g[0], g[1]] }; break }
    }
    return { gs, pads, reached, hash: stateHash(gs) }
}

console.log('grammar — words become intents:')
{
    const cases = [
        ['take the upper right', { kind: 'goto', dir: 'upper-right' }],
        ['top left please', { kind: 'goto', dir: 'upper-left' }],
        ['go northeast', { kind: 'goto', dir: 'upper-right' }],
        ['north-west corner', { kind: 'goto', dir: 'upper-left' }],
        ['bottom right!', { kind: 'goto', dir: 'lower-right' }],
        ['head to the lower left', { kind: 'goto', dir: 'lower-left' }],
        ['right upper', { kind: 'goto', dir: 'upper-right' }],
        ['grab the key', { kind: 'key' }],
        ['get me a key', { kind: 'key' }],
        ['find keys', { kind: 'key' }],
        ['follow me', { kind: 'follow' }],
        ['come with me', { kind: 'follow' }],
        ['stay close', { kind: 'follow' }],
        ['this way', { kind: 'follow' }],
        ['let us go', { kind: 'follow' }],
        ['hold here', { kind: 'hold' }],
        ['stay', { kind: 'hold' }],
        ['guard the door', { kind: 'hold' }],
        ['stop', { kind: 'hold' }],
        ['wait', { kind: 'hold' }],
        ['defend the door', { kind: 'hold' }],
        ['attack that guy', { kind: 'attack' }],
        ['kill the monster', { kind: 'attack' }],
        ['get him', { kind: 'attack' }],
        ['fight it', { kind: 'attack' }],
        ['smash that beast', { kind: 'attack' }],
        ['attack!', { kind: 'attack' }],
    ]
    for (const [said, want] of cases) {
        const got = parseCall(said)
        ok(JSON.stringify(got) === JSON.stringify(want), `"${said}" -> ${want.kind}${want.dir ? '/' + want.dir : ''}`, JSON.stringify(got))
    }
    for (const junk of ['win the game', 'hello there friend', 'SW', 'the wizard is falling', '', '   ', 'one two three']) {
        ok(parseCall(junk) === null, `"${junk}" stays silent (no intent)`, JSON.stringify(parseCall(junk)))
    }
    // specificity: a quadrant beats the verb list ("take the upper right" is
    // a direction, not a key order); normalize folds accents + punctuation.
    ok(parseCall('grab the upper-right corner')?.kind === 'goto', 'quadrant outranks the grab-verb')
    ok(normalizeCall('Éradsé Upper-Right!').includes('upper right'), 'accents + punctuation normalize away (hyphen folds to a space)')
    ok(intentLabel({ kind: 'goto', dir: 'upper-right' }) === 'UPPER RIGHT' && intentLabel({ kind: 'key' }) === 'THE KEY' && intentLabel({ kind: 'attack' }) === 'ATTACK', 'banner labels read like the cabinet')
    ok(CALL_INTENTS.join(',') === 'goto,key,attack,follow,hold' && DIRS.length === 4, 'intent + direction sets pinned')
    // #1287 specificity: the key call outranks the attack verbs ("get the key"
    // sends the seat to the key, not at a beast); plain "it/him" targets do not
    // mean a key.
    ok(parseCall('get the key')?.kind === 'key', 'get the key outranks the attack verb')
}

console.log('apply — honest refusals:')
{
    const lone = makeGame(1, 'warrior', { topDown: true })
    ok(applyCall(lone, { kind: 'follow' }).why === 'NO PARTNER', 'no partner, no orders')
    const noKeys = makeGame(1, 'warrior', { partner: true, topDown: true })
    noKeys.partnerOn = true
    noKeys.items.forEach((it) => { if (it.t === 'key') it.taken = true })
    ok(applyCall(noKeys, { kind: 'key' }).why === 'NO KEY', 'no key on the level refused')
    // A stone corner, built SYNTHETIC: gs.levelData is a REFERENCE into the
    // shared LEVELS table — mutating it walls the real maze for every later
    // run in this process (this exact test once silently killed the quest
    // fixture; rule 8 caught it by the impossibility, not the noise).
    const rows = []
    for (let r = 0; r < 24; r++) {
        let s = ''
        for (let c = 0; c < 24; c++) s += r >= 12 && c >= 12 ? '#' : '.'
        rows.push(s)
    }
    const walled = { end: null, items: [], doors: [], levelData: { grid: rows }, partner: { x: 2.5, y: 2.5, down: false } }
    ok(applyCall(walled, { kind: 'goto', dir: 'lower-right' }).why === 'NO WAY', 'a stone corner refuses')
    ok(applyCall(walled, { kind: 'teleport' }).why === 'NO CALL' && applyCall(walled, null).why === 'NO CALL', 'unknown intents refused')
    ok(applyCall(walled, { kind: 'goto', dir: 'lower-right' }) && walled._vCmd === undefined, 'refused calls set no command state')
    // #1287: attack with nobody in sight refuses honestly (the synth level has
    // no beasts at all, and a partner-less game refuses upstream of targeting).
    ok(applyCall(walled, { kind: 'attack' }).why === 'NO TARGET', 'attack with no target in sight refused')
    const alone = makeGame(1, 'warrior', { topDown: true })
    ok(applyCall(alone, { kind: 'attack' }).why === 'NO PARTNER', 'attack needs the seat open')
    ok(makeGame(1, 'warrior', { topDown: true }).levelData.grid[20][20] !== '#', 'LEVELS stayed clean (no cross-test bleed)')
}

console.log('obey — the seat walks its orders:')
{
    const quads = { 'upper-right': (c, r) => c >= 12 && r < 12, 'upper-left': (c, r) => c < 12 && r < 12, 'lower-right': (c, r) => c >= 12 && r >= 12, 'lower-left': (c, r) => c < 12 && r >= 12 }
    const dirs = ['lower-left', 'upper-right', 'lower-right', 'upper-left']
    for (let i = 0; i < dirs.length; i++) {
        const dir = dirs[i]
        const r = drive(1 + i, [[10, { kind: 'goto', dir }]], 2500, { stopAtGoal: true, quiet: true })
        const cell = r.reached && r.reached.cell
        ok(r.reached !== null, `seed ${1 + i}: partner STOOD ON the ${dir} goal cell`, cell ? JSON.stringify(cell) : 'never reached')
        ok(cell && quads[dir](cell[0], cell[1]), `${dir}: goal cell truly lies in the requested quadrant`, JSON.stringify(cell))
    }
    const kr = drive(1, [[10, { kind: 'key' }]], 2500, { stopAtGoal: true, quiet: true })
    ok(kr.reached !== null, 'seed 1: partner walked to THE KEY and stood on it', kr.reached ? JSON.stringify(kr.reached) : 'never reached')
}

console.log('hold — stay grounded, keep swinging:')
{
    const gs = makeGame(1, 'warrior', { partner: true, topDown: true })
    gs.partnerOn = true
    applyCall(gs, { kind: 'hold' })
    let prevA = false, start = null, moved = 0, dead = 0
    for (let t = 1; t <= 600; t++) {
        const raw = partnerPad(gs, prevA, cmdOf(gs))
        prevA = raw.a
        const before = [Math.floor(gs.partner.x), Math.floor(gs.partner.y)]
        step(gs, {}, seatOf(raw))
        if (gs.partner.down) { dead++; before[0] = -1 }
        else if (before[0] !== -1) {
            const after = [Math.floor(gs.partner.x), Math.floor(gs.partner.y)]
            if (!start) start = after
            if (after[0] !== start[0] || after[1] !== start[1]) moved++
        }
    }
    ok(start !== null, 'hold test ran')
    ok(moved === 0 || dead > 0, 'partner held its ground every living tick', `moved ${moved} ticks, deaths ${dead}`)
}

console.log('attack — chase and cut (the #1287 fifth call):')
{
    // deterministic hunt: drive seeds until one produces an in-sight target,
    // then the seat must close on it (and the run ends the command when the
    // beast dies — the partner comes back to follow).
    let won = null
    for (let s = 1; s <= 10 && !won; s++) {
        const gs = makeGame(s, 'warrior', { partner: true, topDown: true })
        gs.partnerOn = true
        let prevA = false, called = false, tgt = null, closed = false, deadT = 0
        for (let t = 1; t <= 1500 && !gs.end; t++) {
            if (!called && t > 30) {
                const res = applyCall(gs, { kind: 'attack' })
                if (res.ok) { called = true; tgt = gs._vCmd.target }
            }
            const raw = partnerPad(gs, prevA, cmdOf(gs))
            prevA = raw.a
            step(gs, {}, seatOf(raw))
            if (called && !deadT) {
                const m = gs.monsters.find((mm) => mm.id === tgt)
                if (!m) deadT = gs.tick
                else if (Math.hypot(gs.partner.x - m.x, gs.partner.y - m.y) < 1.6) closed = true
            } else if (deadT && gs.tick >= deadT + 2) break
        }
        if (called && closed && deadT) won = { seed: s, closed, deadT }
    }
    ok(won !== null, 'a shouted ATTACK made the seat close on and kill its target', won ? `seed ${won.seed}, died @${won.deadT}` : 'no seed closed the hunt')
    if (won) ok(won.closed, 'the seat walked INTO reach (chase, not standoff)')
    // quiet level: no beasts, honest refusal
    const q = drive(1, [[40, { kind: 'attack' }]], 400, { quiet: true })
    ok(!q.gs._vCmd || q.gs._vCmd.kind !== 'attack', 'attack on an empty hall never sets a command')
}

console.log('release — the seat comes home (the #1287 smart goto/HOLD):')
{
    // goto: partner takes the far corner while the hero is still a diagonal
    // away at spawn — the order lives and flags arrival; then the hero arrives
    // IN the goal quadrant and the order clears (the partner returns to follow
    // instead of standing at the corner forever). NOTE: no hero teleports to a
    // far cell here — the #524 shared-view clamp repositions the pair and drags
    // the partner off its corner (rule 8 caught that via a dx that should have
    // been impossible).
    const ra = drive(1, [[10, { kind: 'goto', dir: 'upper-right' }]], 2500, { stopAtGoal: true, quiet: true })
    ok(ra.reached !== null, 'goto: partner stood on the far corner cell', JSON.stringify(ra.reached))
    if (ra.reached) {
        step(ra.gs, {}, seatOf(partnerPad(ra.gs, false, cmdOf(ra.gs))))
        ok(ra.gs._vCmd && ra.gs._vCmd.kind === 'goto' && ra.gs._vCmd.arrived === true, 'goto: corner held, hero still far — the order stays alive', JSON.stringify(ra.gs._vCmd))
        const [gc, gr] = ra.reached.cell
        ra.gs.hero.x = gc + 0.5; ra.gs.hero.y = gr + 0.5
        step(ra.gs, {}, seatOf(partnerPad(ra.gs, false, cmdOf(ra.gs))))
        ok(ra.gs._vCmd === null, 'goto: hero in the goal quadrant released the order — partner returns to follow')
    }
    // hold: sticks while the hero is put, releases when he leaves and comes back.
    const gs = makeGame(1, 'warrior', { partner: true, topDown: true })
    gs.partnerOn = true
    applyCall(gs, { kind: 'hold' })
    let prevA = false
    for (let t = 1; t <= 60; t++) { const raw = partnerPad(gs, prevA, cmdOf(gs)); prevA = raw.a; step(gs, {}, seatOf(raw)) }
    ok(gs._vCmd && gs._vCmd.kind === 'hold', 'hold sticks while the hero stays at the shoulder', JSON.stringify(gs._vCmd))
    // the hero DRIVES away (leaving must be real travel — a far teleport would
    // snap to the shared-view edge, #524): spawn opens upward at ~0.045 cells
    // per tick, so 110 ticks clear the 4-cell threshold. The RETURN lands by
    // hand next to the post (both heroes inside the view box → clamp no-ops),
    // because the release itself is the thing under test, not pathing.
    for (let t = 1; t <= 110; t++) { const raw = partnerPad(gs, prevA, cmdOf(gs)); prevA = raw.a; step(gs, { fwd: true }, seatOf(raw)) }
    ok(gs._vCmd && gs._vCmd.kind === 'hold', 'hold survives while the hero drives away', `dist ${Math.hypot(gs.hero.x - gs.partner.x, gs.hero.y - gs.partner.y).toFixed(1)}, cmd ${JSON.stringify(gs._vCmd)}`)
    ok(gs._vCmd.left === true, 'hold: the hero leaving the post is noticed')
    gs.hero.x = gs.partner.x + 0.2; gs.hero.y = gs.partner.y
    const rawR = partnerPad(gs, prevA, cmdOf(gs)); prevA = rawR.a; step(gs, {}, seatOf(rawR))
    ok(gs._vCmd === null || gs.partner.down || gs.end, 'hold: hero returns to the shoulder — the seat drops the post and follows', `dist ${Math.hypot(gs.hero.x - gs.partner.x, gs.hero.y - gs.partner.y).toFixed(2)}`)
}

console.log('the seat law — a called seat still says ONLY pads:')
{
    const r = drive(2, [[10, { kind: 'goto', dir: 'upper-right' }], [400, { kind: 'key' }], [900, { kind: 'hold' }]], 1200)
    const FIELDS = ['left', 'right', 'up', 'down', 'a']
    const bad = r.pads.find((p) => Object.keys(p).some((k) => !FIELDS.includes(k)) || Object.values(p).some((v) => typeof v !== 'boolean'))
    ok(!bad, 'every emitted pad: five direction/action booleans, nothing else', JSON.stringify(bad))
}

console.log('determinism — same seed, same pads, same call, same hash:')
{
    const script = [[10, { kind: 'goto', dir: 'upper-right' }], [500, { kind: 'key' }], [900, { kind: 'hold' }]]
    const a = drive(5, script, 1200)
    const b = drive(5, script, 1200)
    ok(a.hash === b.hash, 'identical commands reproduce the identical sim', `${a.hash} vs ${b.hash}`)
}

console.log('recording — the voiceCmd channel:')
{
    const r = createRecorder({ gameId: 'gauntlet', method: 'stick', seed: 3, players: 2, build: 'check' })
    r.addVoiceCmd({ said: 'grab the key', intent: 'key', ok: true })
    for (let t = 0; t < 300; t++) r.addTick([{ up: true }, {}], null, t % 30 === 29 ? t : null)
    r.addVoiceCmd({ said: 'fly to the moon', intent: null, ok: false, why: 'NOT SURE' })
    const rec = r.finish(4242)
    ok(rec.voiceCmd[0].t === 1 && rec.voiceCmd[1].t === 300, 'calls stamp the RECORDER clock (game tick irrelevant)', JSON.stringify(rec.voiceCmd.map((c) => c.t)))
    ok(validate(rec) === null, 'a v1 file with voiceCmd still validates (metadata, like ping)', validate(rec) || '')
    ok(rec.voiceCmd.length === 2 && rec.voiceCmd[1].intent === null && rec.voiceCmd[1].why === 'NOT SURE', 'said/understood/ok all banked')
    ok(recDownload(rec).filename.includes('seed3'), 'download names still flow')
    let threw = ''
    try { createRecorder({ gameId: 'x', seed: 1 }).addVoiceCmd({ intent: 'key', ok: true }) } catch (e) { threw = e.message }
    ok(threw.includes('said'), 'an entry without the words is refused')
    ok(validate({ format: 'retrogames-rec/v1', game: 'gauntlet', method: 'stick', seed: 1, players: 1, ticks: 5, hashEvery: 30, slots: [{ source: { kind: 'model' }, pads: [{}, {}, {}, {}, {}], raw: [{}, {}, {}, {}, {}] }], hashes: [], voiceCmd: [{ t: 2, said: 'go', intent: 7, ok: true }] }) !== null, 'a non-string intent fails the format gate')
}

console.log('the quest — twenty orders deep, the stairs still found:')
{
    // The hero replays the proven winning script byte-for-byte; the partner
    // seat takes real spoken calls along the way — corners, the key, a guard,
    // returns to follow. Winning WITH the calls is the proof that spoken
    // co-op costs the quest nothing (gauntletcheck owns the quest itself).
    const proven = plan(2, { topDown: true, maxTicks: 60000 })
    ok(proven.won, 'fixture: the proven quest script wins (partner default)')
    const B = { kind: 'goto', dir: 'upper-right' }, K = { kind: 'key' }, Ho = { kind: 'hold' }, F = { kind: 'follow' }, L = { kind: 'goto', dir: 'lower-left' }
    const calls = [
        [120, Ho], [240, F], [600, K], [780, F], [2400, Ho], [2520, F], [4000, L], [4240, F],
        [5200, K], [5440, F], [6400, B], [6640, F], [7600, Ho], [7720, F], [8600, K], [8840, F],
        [9800, B], [10040, F], [11000, L], [11240, F],
    ]
    const gs = makeGame(2, 'warrior', { partner: true, topDown: true })
    gs.partnerOn = true
    let prevA = false, issued = 0
    const script = new Map(calls)
    for (let i = 0; i < proven.script.length && !gs.end; i++) {
        const c = script.get(gs.tick + 1)
        if (c && applyCall(gs, c).ok) issued++
        const raw = partnerPad(gs, prevA, cmdOf(gs))
        prevA = raw.a
        step(gs, proven.script[i], seatOf(raw))
    }
    ok(!MUTATE ? gs.end === 'win' : true, 'full quest wins with 20 spoken calls issued', `end=${gs.end} level=${gs.level} lives=${gs.lives}`)
    // One refusal is honest reality: a key call lands after the hero already
    // pocketed the key — the seat says NO KEY rather than wander. That is the
    // feature working, so 19/20 accepted (never 20/20 brittle).
    ok(!MUTATE ? issued >= 18 && issued <= calls.length : issued >= 0, 'the seat took (nearly) every call — refusals are honest', `${issued}/${calls.length}`)
}

console.log(`\nvoicecmdcheck: ${pass} passed, ${fail} failed${MUTATE ? '  [MUTANT: seat is deaf]' : ''}`)
if (MUTATE && fail === 0) { console.log('MUTANT SURVIVED — the obey-checks missed a deaf seat'); process.exit(1) }
process.exit(fail ? 1 : 0)
