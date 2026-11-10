// temp probe for #1909 THE DRAIN (deleted before ship)
import { createGame, buildBomb, step, computeTarget, solvePad, hash, simState, ruleOf, variantPool, drainEvents } from '../src/games/TalkMeDown/engine.js'
let fails = 0
const ok = (n, c, d = '') => { console.log((c ? 'PASS' : 'FAIL'), n, d); if (!c) fails++ }

// pools
ok('D6 unlocks exactly round 5', variantPool('D', 4).join(',') !== variantPool('D', 5).join(',') && variantPool('D', 5).includes(6) && !variantPool('D', 4).includes(6))
ok('G pool unchanged (no dead G6)', variantPool('G', 5).join(',') === '1,3,5,2,4')

// gen law
let d6 = 0, bad = ''
for (const round of [3, 5]) for (let seed = 1; seed <= 1200; seed++) {
    const gs = createGame(seed, 2); gs.round = round; buildBomb(gs)
    if (gs.modules.some(m => m.stamp === 'D6')) { d6++; if (gs.features.batteries < 1) bad = round + '/' + seed }
}
ok('D6 generates only with batteries >= 1', !bad && d6 >= 100, bad || d6 + ' bombs')

// human flow: the exact page procedure
let rigs = 0, fbody = ''
for (let seed = 1; seed <= 3000 && rigs < 40; seed++) {
    const gs = createGame(seed, 2); gs.round = 5; buildBomb(gs)
    const di = gs.modules.findIndex(m => m.stamp === 'D6'); if (di < 0) continue
    const b = gs.features.batteries, d = gs.modules[di]; const left = b - 1
    step(gs, { up: true })
    step(gs, { a: true })
    step(gs, { down: true })
    while (gs.cursor.mod !== di) step(gs, { down: true })
    while (d.dial !== left) step(gs, d.dial < left ? { right: true } : { left: true })
    const t = computeTarget(gs, d)
    step(gs, { a: true })
    if (!(d.solved && gs.strikes === 0 && t.dial === left)) { fbody = `seed ${seed}: solved=${d.solved} strikes=${gs.strikes} t=${JSON.stringify(t)}`; break }
    rigs++
}
ok('page procedure: flip, drain, dial LEFT, SET solves', !fbody && rigs >= 20, fbody || rigs + ' rigs')

// premature SET names the missed step
{
    let found = false
    for (let seed = 1; seed <= 500; seed++) {
        const gs = createGame(seed, 2); gs.round = 5; buildBomb(gs)
        const di = gs.modules.findIndex(m => m.stamp === 'D6'); if (di < 0) continue
        found = true
        const d = gs.modules[di]; gs.cursor.mod = di
        while (d.dial !== gs.features.batteries - 1) step(gs, { right: true })
        drainEvents(gs); step(gs, { a: true }); const ev = drainEvents(gs).filter(e => e.k === 'strike')
        ok('SET before the drain strikes and names it', gs.strikes === 1 && ev[0] && ev[0].why === 'battery still in place', JSON.stringify(ev))
        break
    }
    if (!found) ok('SET before the drain strikes and names it', false, 'no D6 bomb in 500')
}

// drain/push/toggle law
{
    let s = null
    for (let seed = 1; seed <= 500; seed++) { const g = createGame(seed, 1); if (g.features.batteries === 2) { s = g; break } }
    const b0 = s.features.batteries
    step(s, { up: true }); drainEvents(s)
    const e1 = (step(s, { a: true }), drainEvents(s).map(e => e.k).join(','))
    const afterPull = s.features.batteries === b0 - 1 && s.held === 1 && s.pulls === 1 && e1 === 'pull'
    step(s, { a: false }) // release between presses (the edge law)
    const e2 = (step(s, { a: true }), drainEvents(s).map(e => e.k).join(','))
    const afterPush = s.features.batteries === b0 && s.held === 0 && e2 === 'push'
    step(s, { down: true })
    ok('A toggles the pocket: pull then push, plate restored', afterPull && afterPush, `pull=${e1} push=${e2}`)
}
// edge law: A HELD across ticks toggles exactly once
{
    let s = null
    for (let seed = 1; seed <= 500; seed++) { const g = createGame(seed, 1); if (g.features.batteries === 2) { s = g; break } }
    const b0 = s.features.batteries
    step(s, { up: true }); drainEvents(s)
    step(s, { a: true }); step(s, { a: true }); step(s, { a: true }) // ~3-tick human press
    const onePull = s.features.batteries === b0 - 1 && s.held === 1 && s.pulls === 1
    step(s, { a: false })                    // release...
    step(s, { a: true })                     // ...press again -> push back
    const back = s.held === 0 && s.features.batteries === b0 && s.pulls === 1
    step(s, { down: true })
    ok('held A toggles ONCE per press (edge-triggered drain)', onePull && back, `onePull=${onePull} back=${back}`)
}
// empty plate refuses silently
{
    let s = null
    for (let seed = 1; seed <= 500; seed++) { const g = createGame(seed, 1); if (g.features.batteries === 0) { s = g; break } }
    step(s, { up: true }); drainEvents(s) // discard the flip cue
    step(s, { a: true })
    ok('empty plate: A is silent (no event, no strike)', drainEvents(s).length === 0 && s.strikes === 0)
}

// autopilot drains and wins the full quota; never tilts without a pull need
let drained = 0, spurious = '', wonAll = 0
for (let seed = 1; seed <= 2000; seed++) {
    const g = createGame(seed, 1); let sawPull = false, liveTilt = true
    for (let i = 0; i < 60000 && !g.done; i++) {
        step(g, solvePad(g))
        if (g.pulls > 0) sawPull = true
        // a flip with nothing left to pull for is only legitimate for the
        // tick the puller spends — held===1 means the battery is in hand,
        // the pilot still owes the front its tilt-back.
        if (g.flip && g.pulls === 0 && !g.modules.some(x => !x.solved && ruleOf(x).pull)) liveTilt = false
    }
    if (!liveTilt) spurious = `seed ${seed} tilted without need`
    if (g.done && g.won) { wonAll++; if (sawPull) drained++ }
}
ok('autopilot drains for D6 and wins', drained >= 5 && !spurious, spurious || `${drained} drained, ${wonAll}/2000 won`)
ok('autopilot wins every seed (no regression)', wonAll === 2000, String(wonAll))

// determinism + observable state
const a = createGame(777, 1); const b = createGame(777, 1); const n = createGame(777, 1)
step(a, { up: true }); step(a, { a: true }); step(a, { down: true })
step(b, { up: true }); step(b, { a: true }); step(b, { down: true })
ok('drained hashes match across sims; drained != undrained', hash(a) === hash(b) && hash(a) !== hash(n))
const st = simState(a)
ok('simState carries held/pulls/batteries', 'held' in st && 'pulls' in st && st.batteries === a.features.batteries)

console.log(fails ? 'FAILURES: ' + fails : 'ALL GREEN')
process.exit(fails ? 1 : 0)
