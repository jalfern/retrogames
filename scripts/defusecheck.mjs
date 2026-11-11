// defusecheck.mjs — BOMB DEFUSE game gates (#1800, PLAICRAFT #1711 fifth title).
// Node-first, pure-engine: the game boots, its rules hold, it can be won — and
// this script can fail (break a load-bearing line and watch it go red).
//
// npm run defusecheck
import {
    createGame, step, hash, simState, solvePads, curStep, curWindow, needleOf,
    COLORS, SYNC, CUT, VENT, BOMBS, FUSE0, WINDOW, ZONE_HALF, STRIKE_COST, SURGE_COST, NICK_COST, INTRO,
    TURN, turnStep, turnClick, keyAngle,
    REDLINE, PEG, pegNeedle, ventCoach, ventPanel, preFlash, seatAsk,
    TALLY, winTally, tallyDur, tallyFrame,
    LINK, netPill,
} from '../src/games/BombDefuse/engine.js'
import { bedHz, BED } from '../src/games/BombDefuse/audio.js'
import { parseCall } from '../src/games/BombDefuse/voice.js'
import { snapshotNet, restoreNet } from '../src/games/BombDefuse/net.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
let pass = 0, fail = 0
const ok = (cond, name, info = '') => {
    if (cond) { pass++; console.log(`  ok   ${name}`) }
    else { fail++; console.log(`  FAIL ${name}${info ? ` — ${info}` : ''}`) }
}
const drain = (g) => { const e = [...g.events]; g.events.length = 0; return e }
const ev = (g, k) => drain(g).some(f => f.k === k)
const drive = (g, pads) => { step(g, pads); return drain(g) }

console.log('\n— boot & layout —')
{
    const g = createGame(7, 2)
    ok(g.tick === 0 && !g.done && g.fuse === FUSE0[0], 'createGame boots live at full fuse')
    ok(g.bombs.length === BOMBS && g.bombs.every((b, i) => b.steps.length === [3, 4, 5][i]), 'three bombs carry 3/4/5 steps')
    ok(curStep(g).kind === SYNC, 'first step teaches SYNC')
    ok(g.bombs.every(b => b.steps.every((s, i) => i === 0 || s.kind !== b.steps[i - 1].kind)), 'no two same-kind steps in a row')
    const a = createGame(7, 2), b = createGame(7, 2)
    ok(hash(a) === hash(b), 'same seed → identical initial hash')
    ok(hash(createGame(8, 2)) !== hash(a), 'different seed → different initial hash')
    ok(createGame(7, 5).players === 2 && createGame(7, 0).players === 1, 'players clamps to 1..2')
}

console.log('\n— SYNC —')
{
    const g = createGame(7, 2)
    for (let i = 0; i < INTRO; i++) drive(g, [{ a: true }, { a: true }])
    ok(g.keys.every(k => !k) && g.step === 0, 'intro guard: presses during READ-STEP are ignored')
    drive(g, [{ a: true }, {}])
    ok(g.keys[0] && !g.keys[1], 'one key latches turned (key stays turned)')
    for (let i = 0; i <= curWindow(g); i++) drive(g, [{}, {}])
    ok(g.strikes === 1 && g.keys.every(k => !k), 'slow partner: window expires -> strike, keys reset')
    ok(g.fuse === FUSE0[0] - (INTRO + 1 + curWindow(g) + 1) - STRIKE_COST, `strike costs exactly ${STRIKE_COST}f`, `fuse=${g.fuse}`)
    drive(g, [{ a: true }, { a: true }])
    ok(g.step === 1, 'both keys together clear the step')
}

console.log('\n— CUT —')
{
    const g = createGame(7, 2)
    while (!g.done && curStep(g).kind !== CUT) drive(g, solvePads(g))
    ok(!g.done && curStep(g).kind === CUT, 'a CUT step is reachable')
    while (g.intro > 0) drive(g, [{}, {}])
    const target = curStep(g).color
    ok(COLORS[target] !== undefined, 'cut target is a known color')
    drive(g, [{ up: true }, { up: true }]) // walk both arms to RED (sel=1)
    const selNow = g.sel[0]
    const wrong = (target + 1) % COLORS.length
    g.sel = [wrong, wrong]
    const fuseBefore = g.fuse
    const nickFx = drive(g, [{ a: true }, { a: true }])
    ok(nickFx.filter(f => f.k === 'nick').length === 2 && g.fuse === fuseBefore - 2 * NICK_COST - 1 && g.strikes === 0, 'both blades nicking wrong wire cost −2 s each, never a strike')
    drive(g, [{}, {}]) // a tap is press+release — the edge memory must see the release (#1831)
    g.sel = [target, target]
    drive(g, [{ a: true }, {}])
    ok(g.armed[0] && !g.armed[1], 'one blade arms on the right color')
    for (let i = 0; i <= curWindow(g) + 1; i++) drive(g, [{}, {}])
    ok(g.strikes === 1 && g.armed.every(a => !a), 'stale window closes with a strike, blades disarm')
    g.sel = [target, target]
    const cutFx = drive(g, [{ a: true }, { a: true }])
    ok(cutFx.some(f => f.k === 'cut') && g.score >= 50, 'both blades on target cut the wire')
}

console.log('\n— VENT —')
{
    const g = createGame(7, 2)
    while (!g.done && curStep(g).kind !== VENT) drive(g, solvePads(g))
    ok(!g.done, 'a VENT step is reachable')
    while (g.intro > 0) drive(g, [{}, {}])
    const holder = curStep(g).holder
    const worker = 1 - holder
    const fuseBefore = g.fuse
    step(g, [{}, {}]); drain(g)
    ok(g.fuse === fuseBefore - 2, 'unvented pressure burns the fuse double', `Δ=${fuseBefore - g.fuse}`)
    let fuse2 = g.fuse
    step(g, [{ b: holder === 0 }, { b: holder === 1 }]); drain(g)
    ok(g.fuse === fuse2 - 1, 'bar pinned returns to single drain')
    g.needleT = 0; g.phase = 0; g.zone = 0 // aim the gauge at a known crossing
    const zoneSave = g.zone
    g.zone = 1000 // far off target for the whiff gate
    const dudFx = drive(g, [{ a: worker === 0 }, { a: worker === 1 }])
    ok(dudFx.some(f => f.k === 'dud') && g.strikes === 0 && g.step < g.bombs[g.bomb].steps.length, 'whiffed seat is a dud, not a strike')
    drive(g, [{}, {}]) // release the tap before the next press (#1831 edge)
    g.zone = zoneSave
    // seat while NOT held -> surge
    const pre = g.fuse
    g.needleT = 0; g.phase = 0
    g.zone = needleOf(g) // put the zone exactly under the needle
    const surgeFx = drive(g, [{ a: worker === 0, b: false }, { a: worker === 1, b: false }])
    ok(surgeFx.some(f => f.k === 'surge') && g.fuse === pre - SURGE_COST - 2, `seating without the bar surges (−${SURGE_COST}f + that tick's double drain)`, `Δ=${pre - g.fuse}`)
    drive(g, [{}, {}]) // release
    // seat WITH the bar -> sealed
    const stepBefore = g.step
    const sealFx = drive(g, [{ a: worker === 0, b: holder === 0 }, { a: worker === 1, b: holder === 1 }])
    ok(sealFx.some(f => f.k === 'sealed') && (g.step !== stepBefore || g.bomb > 0), 'held bar + on-target seat seals the step')
}

console.log('\n— tap edges (#1831: one tap is one action) —')
{
    // A physical key tap holds the pad down ~6 frames. The old level reads
    // charged every tick of the hold (one tap could walk the arm several
    // colors, nick repeatedly, or surge the gauge to KABOOM).
    const g = createGame(7, 2)
    while (!g.done && curStep(g).kind !== CUT) drive(g, solvePads(g))
    while (g.intro > 0) drive(g, [{}, {}])
    const sel0 = g.sel[0]
    for (let t = 0; t < 6; t++) drive(g, [{ up: true }, {}]) // one tap, held 6 ticks
    ok(g.sel[0] === (sel0 + 1) % COLORS.length && g.sel[1] === 0, 'held up: the arm walks once per tap, not once per tick', `walked ${g.sel[0] - sel0}`)
    const target = curStep(g).color
    g.sel = [(target + 1) % COLORS.length, target] // seat 0 sits on the WRONG wire
    const fb = g.fuse
    let nicks = 0
    for (let t = 0; t < 5; t++) nicks += drive(g, [{ a: true }, {}]).filter(f => f.k === 'nick').length
    ok(nicks === 1 && g.fuse === fb - 5 - NICK_COST, 'held a on the wrong wire: exactly ONE nick, fuse pays drain+nick once', `nicks=${nicks} Δ=${fb - g.fuse}`)
    drive(g, [{}, {}]) // release
    const fb2 = g.fuse
    const nicks2 = drive(g, [{ a: true }, {}]).filter(f => f.k === 'nick').length
    ok(nicks2 === 1 && g.fuse === fb2 - 1 - NICK_COST, 'released + re-pressed tap fires again (an edge, not a one-shot latch)')
    // VENT: holding ACT with the holder never pinning surged once PER TICK —
    // one press could burn the whole fuse. Now: one surge per zone entry.
    const v = createGame(7, 2)
    while (!v.done && curStep(v).kind !== VENT) drive(v, solvePads(v))
    while (v.intro > 0) drive(v, [{}, {}])
    const holder = curStep(v).holder
    const worker = 1 - holder
    v.needleT = 0; v.phase = 0; v.zone = needleOf(v) // zone glued to the needle
    const vf = v.fuse
    let surges = 0
    for (let t = 0; t < 5; t++) surges += drive(v, [{ a: worker === 0, b: false }, { a: worker === 1, b: false }]).filter(f => f.k === 'surge').length
    ok(surges === 1 && !v.done, 'held ACT (unvented): exactly one surge per press, not per tick', `surges=${surges} Δ=${vf - v.fuse}`)
    ok(v.prevPad[worker].a && !v.prevPad[holder].a, 'edge memory keeps the last pad — a release is required to fire again')
}

console.log('\n— fuse ledger & boom —')
{
    const g = createGame(7, 2)
    g.fuse = 3
    while (!g.done && g.fuse > 0) drive(g, [{}, {}])
    ok(g.done && !g.won, 'zero fuse is a boom, not a win')
    const frozenTick = g.tick
    step(g, [{ a: true }, { a: true }])
    ok(g.tick === frozenTick, 'done is stable — further ticks no-op')
}

console.log('\n— winnable + replay —')
{
    let wins = 0
    for (let s = 1; s <= 40; s++) {
        const g = createGame(s, 2)
        let guard = 0
        while (!g.done && guard++ < 40000) { const pads = solvePads(g); step(g, pads); drain(g) }
        if (g.done && g.won) wins++
    }
    ok(wins === 40, 'solver wins 40/40 seeds', `${wins}/40`)
    // recorded-pad replay: hash checkpoints every 30 ticks (the rec/v1 law)
    const g1 = createGame(7, 2)
    const pads = []
    const checks = []
    while (!g1.done && g1.tick < 9000) {
        const p = solvePads(g1)
        step(g1, p); drain(g1)
        pads.push(p)
        if (g1.tick % 30 === 0) checks.push([g1.tick, hash(g1)])
    }
    checks.push([g1.tick, hash(g1)])
    const g2 = createGame(7, 2)
    let diverge = -1
    pads.forEach((p, i) => {
        step(g2, p); drain(g2)
        const t = i + 1
        const chk = checks.find(c => c[0] === t)
        if (chk && hash(g2) !== chk[1] && diverge < 0) diverge = t
    })
    ok(diverge === -1, 'recorded pad streams replay hash-equal at every checkpoint')
    ok(checks.length > 20, `checkpoint density sane (${checks.length} checks)`)
}

console.log('\n— slack rule (levels survive reduced supplies) —')
{
    // every extra surge the winners never spend: −600 f preloaded per bomb.
    let wins = 0
    for (let s = 1; s <= 20; s++) {
        const g = createGame(s, 2)
        g.bombs.forEach(b => { b.fuse0 = Math.max(600, b.fuse0 - 600) })
        g.fuse = Math.max(600, g.fuse - 600)
        let guard = 0
        while (!g.done && guard++ < 40000) { const pads = solvePads(g); step(g, pads); drain(g) }
        if (g.done && g.won) wins++
    }
    ok(wins === 20, 'solver still wins with 10 s less fuse per bomb', `${wins}/20`)
    // window slack: solver follow offsets must fit inside the smallest window
    ok(WINDOW[2] > 8 + 13, `tightest window ${WINDOW[2]}f outlives the solver's worst lead+follow (≤21f)`)
}

console.log('\n— hash law —')
{
    const g = createGame(7, 2)
    ok(Number.isInteger(hash(g)) && hash(g) >= 0 && hash(g) <= 0xffffffff, 'hash is uint32')
    const base = hash(g)
    const mutations = [
        gg => { gg.keys[0] = true }, gg => { gg.armed[1] = true }, gg => { gg.zone += 1 },
        gg => { gg.needleT += 1 }, gg => { gg.sel[0] = 1 }, gg => { gg.strikes += 1 },
        gg => { gg.fuse -= 1 }, gg => { gg.intro -= 1 }, gg => { gg.held = true },
    ]
    let diffs = 0
    for (const m of mutations) { const h = createGame(7, 2); m(h); if (hash(h) !== base) diffs++ }
    ok(diffs === mutations.length, 'every load-bearing field moves the hash', `${diffs}/${mutations.length}`)
    const src = readFileSync(join(here, '../src/games/BombDefuse/engine.js'), 'utf8')
    const hashBody = src.slice(src.indexOf('export function hash'))
    ok(!/Math\.sin/.test(hashBody), 'hashed state never touches Math.sin at replay time (integer sine table — #1793 law)')
    ok(!/Math\.random/.test(src.slice(0, src.indexOf('solvePads'))), 'no Math.random reaches the sim (solver section boundary clean)')
}

console.log('\n— solo partner —')
{
    const g = createGame(7, 1) // SYNC is step 0 by construction
    let guard = 0
    while (!g.keys[1] && guard++ < 300) drive(g, [{}])
    ok(g.keys[1], 'solo partner leads the key turn when the human stalls')
    drive(g, [{ a: true }])
    ok(g.step === 1, 'human joining inside the window clears it')
}

console.log('\n— contract + spine wiring (static pins) —')
{
    const jsx = readFileSync(join(here, '../src/games/BombDefuse/index.jsx'), 'utf8')
    for (const need of ['exposeGame(spec)', 'unexposeGame()', 'armLiveCapture(spec)', 'initAutoRecord()', 'askConsent()', 'beginRun()', 'endRun()', 'recordLiveTick(pads)', 'contractHoldsLoop()', 'seedFromQuery()', 'exposeFeedbackState', 'recordVoiceCmd', '__bdTest', 'mountDbg']) {
        ok(jsx.includes(need), `index.jsx wires ${need}`)
    }
    const reg = readFileSync(join(here, '../src/config/games.js'), 'utf8')
    ok(reg.includes("path: '/bomb-defuse'") && reg.includes("label: 'BOMB DEFUSE'") && reg.includes("visibility: 'private'"), 'registry: private /bomb-defuse entry')
    const cg = readFileSync(join(here, 'lib/contractGames.mjs'), 'utf8')
    ok(cg.includes("id: 'bomb-defuse'") && cg.includes("'bomb-defuse': (i) =>"), 'contractGames lists bomb-defuse + a driver pattern')
}

console.log('\n— key-turn feel (#1812 item 2) —')
{
    // The sim truth is instant (gs.keys latches at the press tick — pinned in
    // the rules section). These gates prove the VIEW math lags it: a damped
    // spring that wobbles once and homes, one ratchet click per turn, and a
    // seat stagger so the pair reads as two hands. Kill a constant and a
    // gate goes red (see README mutants).
    ok(TURN.K > 0 && TURN.D > 0 && TURN.D < 1 && TURN.RATCHET > 0 && TURN.RATCHET < 1 && TURN.STAGGER >= 2 && TURN.SETTLE > 4,
        'spring constants sane — underdamped, detent inside the travel, a stagger that exists')
    ok(Math.abs(keyAngle(0) - TURN.OFF) < 1e-12 && Math.abs(keyAngle(1) - TURN.ON) < 1e-12 && keyAngle(0.5) > keyAngle(0) && keyAngle(1) > keyAngle(0.5),
        'keyAngle endpoints are the legacy poses and the sweep is monotone')
    // single turn toward 1: lag, one overshoot, settle, exactly one detent click up
    let p = 0, v = 0, up = 0, down = 0, peak = 0
    const trail = []
    for (let t = 0; t < 60; t++) {
        const r = turnStep(p, v, 1)
        p = r[0]; v = r[1]
        if (r[2] > 0) up++
        if (r[2] < 0) down++
        peak = Math.max(peak, p)
        trail.push(p)
    }
    ok(trail[0] < 0.3, 'pose lags the press tick — first frame well short of home', String(trail[0].toFixed(3)))
    ok(peak > 1.05 && peak < 1.3, 'the barrel overshoots ONCE (a spring, not a slide)', String(peak.toFixed(3)))
    ok(trail.slice(TURN.SETTLE).every((x) => Math.abs(x - 1) <= 0.02), `pose is home (|p−1|≤0.02) by ${TURN.SETTLE} ticks`)
    ok(up === 1 && down === 0, 'one ratchet click per turn — the settle wobble never re-clicks', `up=${up} down=${down}`)
    ok(turnClick(0.49, 0.51) === 1 && turnClick(0.51, 0.49) === -1 && turnClick(0.9, 1.1) === 0,
        'turnClick: +1 over the detent, −1 back through it, 0 within one side')
    // stagger: both truths flip ON at tick 0 (SYNC); seat 2's view waits —
    // mirror of pumpTurnPoses' per-seat law (source-pinned below to this math).
    const tr2 = [
        { pos: 0, vel: 0, lag: 0, want: 0 },
        { pos: 0, vel: 0, lag: 0, want: 0 },
    ]
    const both = []
    for (let t = 0; t < 12; t++) {
        for (let i = 0; i < 2; i++) {
            const s = tr2[i]
            const want = 1
            if (want !== s.want) { s.want = want; s.lag = i === 1 && want === 1 ? TURN.STAGGER : 0 }
            if (s.lag > 0) { s.lag--; continue }
            const r = turnStep(s.pos, s.vel, s.want)
            s.pos = r[0]; s.vel = r[1]
        }
        both.push([tr2[0].pos, tr2[1].pos])
    }
    ok(both[0][0] > 0.1 && both[0][1] === 0 && both.slice(0, TURN.STAGGER).every((f) => f[1] === 0) && both[TURN.STAGGER + 1][1] > 0,
        `seat 2 holds ${TURN.STAGGER} ticks before its barrel follows — simultaneity READS`)
    // purity: the pose never touches the sim or the hash; the press latch is untouched.
    const esrc = readFileSync(join(here, '../src/games/BombDefuse/engine.js'), 'utf8')
    const hashBody = esrc.slice(esrc.indexOf('export function hash'))
    ok(!/TURN|turnStep|keyAngle|turnClick/.test(hashBody.split('// ---- key-turn feel')[0]),
        'hash() reads no pose state — the spring lives outside the determinism core')
    ok(esrc.includes("gs.keys[i] = true; gs.events.push({ k: 'key', seat: i })"),
        'the press-tick truth still latches instantly (pose is only a lag on top)')
    const jsx = readFileSync(join(here, '../src/games/BombDefuse/index.jsx'), 'utf8')
    ok(!jsx.includes('g.rotate(on ? 0.78 : -0.35)'), 'the teleport ternary is gone from the barrel draw')
    ok(jsx.includes('pumpTurnPoses') && jsx.includes('E.turnStep') && jsx.includes('E.keyAngle(pose)') && jsx.includes('keyPos:'),
        'index.jsx pumps the spring per sim tick and draws the barrel from the pose')
    ok(jsx.includes('const pumpTurnPoses') && (jsx.match(/pumpTurnPoses\(/g) || []).length >= 3,
        'the pump is defined and runs on every sim path — attract, net and local',
        String((jsx.match(/pumpTurnPoses\(/g) || []).length))
    ok(jsx.includes('sfx.ratchet()') && jsx.includes('sfx.ratchetBack()'), 'the detent wires both click directions in the pump')
}

console.log('\n— gauge redline (#1812 item 5) —')
{
    // Pure view math, the item-2 house pattern: past REDLINE the pointer stops
    // following the number and PEGS at the end stop; the hot flag lights the
    // bezel shake and the red glass glint. Mutants (README): a passthrough
    // clamp reddens the sweep gate; always-hot reddens the ~900-exact gate;
    // drawing raw units reddens the view pins.
    ok(REDLINE > 0 && REDLINE < PEG && PEG < 1000,
        'constants sane — redline under the end stop, stop inside full scale')
    ok(!pegNeedle(0).hot && pegNeedle(0).drawn === 0, 'mid-scale rides through unpegged')
    ok(!pegNeedle(REDLINE).hot && pegNeedle(899).drawn === 899,
        'the redline is exact at ~900 — the line itself is not yet hot')
    const up = pegNeedle(1000), dn = pegNeedle(-1000)
    ok(up.hot && dn.hot && up.drawn === PEG && dn.drawn === -PEG,
        'full-scale swings peg at the stop, both sides symmetric')
    ok(pegNeedle(913).hot && pegNeedle(913).drawn === 913 && pegNeedle(946).drawn === PEG,
        'hot starts above the redline; only units past the stop are dropped')
    // sweep law — one full needle sine: hot comes in exactly two contiguous
    // windows (over the top, under the bottom), drawn never beats the stop,
    // and tracks raw 1:1 anywhere cold.
    let hotRuns = 0, wasHot = false, hotTicks = 0, over = 0, offTrack = 0
    for (let t = 0; t < 360; t++) {
        const raw = needleOf({ needleT: t, phase: 0 })
        const { hot, drawn } = pegNeedle(raw)
        if (hot && !wasHot) hotRuns++
        if (Math.abs(drawn) > PEG) over++
        if (!hot && drawn !== raw) offTrack++
        if (hot) hotTicks++
        wasHot = hot
    }
    ok(hotRuns === 2 && over === 0 && offTrack === 0 && hotTicks > 0,
        'one full sweep: two peg windows, nothing beats the stop, clean below',
        `runs=${hotRuns} hotTicks=${hotTicks}`)
    // the sim stands unchanged: the view calls can't move gs or the hash.
    const rv = createGame(7, 2)
    while (!rv.done && curStep(rv).kind !== VENT) drive(rv, solvePads(rv))
    const h0 = hash(rv)
    pegNeedle(needleOf(rv)); pegNeedle(2000); pegNeedle(-2000)
    ok(hash(rv) === h0, 'pegNeedle cannot touch gs — hash identical through the view calls')
    // view side wired: the needle rides the pegged units; shake + glint are hot-gated.
    const jsx = readFileSync(join(here, '../src/games/BombDefuse/index.jsx'), 'utf8')
    ok(jsx.includes('E.pegNeedle(E.needleOf(gs))') && jsx.includes('peg.drawn'),
        'index.jsx draws the needle from the pegged units')
    ok(jsx.includes('const jx = hot ?') && jsx.includes('gx = cx + jx'),
        'the bezel shake runs only while hot')
    ok(jsx.includes('hot glint') && /rgba\(255,74,62/.test(jsx.slice(jsx.indexOf('hot glint'))),
        'the red glint lights through the glass only while hot')
    ok(!/const nd = \(\(E\.needleOf\(gs\) \/ 1000\)/.test(jsx),
        'the raw-unit needle angle is gone — nothing draws an unpegged needle')
}

console.log('\n— first-vent coaching (#1932) —')
{
    // Pure view helper (the item-2/item-5 house pattern): while the run's
    // FIRST vent runs, it names YOUR seat's job and pulses the control that
    // must move — the phone answer to "the HOLD pad exists but nobody says
    // so". No rng, no gs write, hash-clean. Kill laws (README mutants):
    // a dead pulseBar reddens the pin-law gate; a coach that ignores the
    // taught latch reddens the silence gate.
    const toVent = (seed, players = 2) => {
        const g = createGame(seed, players)
        let guard = 0
        while (!g.done && curStep(g).kind !== VENT && guard++ < 4000) drive(g, solvePads(g))
        return g
    }
    // silence where there is nothing to teach
    const s0 = createGame(7, 2)
    ok(ventCoach(s0, 0, false) === null, 'SYNC step teaches nothing (only VENT carries a coach)')
    const taughtG = toVent(7)
    ok(!taughtG.done && curStep(taughtG).kind === VENT && ventCoach(taughtG, 0, true) === null, 'a taught run stays silent at the plate')
    taughtG.done = true
    ok(ventCoach(taughtG, 0, false) === null, 'a finished run never coaches')
    // role naming, both ways + the unnamed (local 2P / spectator) case
    const g = toVent(7)
    while (g.intro > 0) drive(g, [{}, {}])
    const holder = curStep(g).holder
    const worker = 1 - holder
    const chH = ventCoach(g, holder, false)
    const chW = ventCoach(g, worker, false)
    const chB = ventCoach(g, -1, false)
    ok(chH && chH.role === 'HOLD' && chH.card.includes('HOLD'), 'the holder seat reads YOU HOLD THE BAR')
    ok(chW && chW.role === 'SEAT' && chW.card.includes('SEAT') && chW.sub.includes('GREEN'), 'the worker seat reads YOU SEAT THE NEEDLE + the green cue')
    ok(chB && chB.role === 'CREW' && chB.card.includes('HOLDS') && chB.card.includes('SEATS'), 'a nameless seat gets the both-seats line, never a YOU')
    ok(chH.sub.includes('B') && chH.sub.includes('PAD'), 'the hold line names both keys: B and the HOLD pad')
    // pulseBar law: rings the holder until the bar is actually pinned — pin
    // it against the live sim and the ring goes away; release brings it back.
    ok(chH.pulseBar === !g.held && !g.held, 'unpinned holder: the bar rings')
    drive(g, [{ b: holder === 0 }, { b: holder === 1 }])
    ok(g.held && ventCoach(g, holder, false).pulseBar === false, 'pinning the bar silences the ring (the ring IS the hold-it-down lesson)')
    const after = drive(g, [{ b: holder === 0 }, { b: holder === 1 }])
    ok(!g.held || ventCoach(g, holder, false).pulseBar === false, 'level-pin law untouched: held stays held while pressed', after.map(f => f.k).join(','))
    // pulseGauge law across a full needle sweep: the nudge fires exactly when
    // the seat would land (the sim's own zone condition — never a lie).
    const gw = toVent(7)
    while (gw.intro > 0) drive(gw, [{}, {}])
    gw.needleT = 0
    let mism = 0, inZ = 0, seen = 0
    for (let t = 0; t < 360; t++) {
        const c = ventCoach(gw, worker, false)
        const truth = Math.abs(needleOf(gw) - gw.zone) <= ZONE_HALF[gw.bomb]
        if (c.pulseGauge !== truth || c.inZone !== truth) mism++
        if (truth) inZ++
        seen++
        gw.needleT += 1
    }
    ok(mism === 0 && inZ > 0 && seen === 360, 'gauge nudge matches the sim zone exactly across one sweep', `mism=${mism} inZone=${inZ}`)
    ok(ventCoach(gw, holder, false).pulseGauge === false, 'the holder never gets the tap nudge (it must not leave the bar)')
    // intro flag: the card shows while READ-STEP runs, live pulses after.
    const gi = toVent(7)
    ok(gi.intro > 0 && ventCoach(gi, curStep(gi).holder, false).intro === true, 'coach carries the READ-STEP flag into the teach card')
    while (gi.intro > 0) drive(gi, [{}, {}])
    ok(ventCoach(gi, curStep(gi).holder, false).intro === false, 'the card retires when the step goes live')
    // purity: the coach cannot touch the sim — hash identical through the calls.
    const hp = hash(g)
    ventCoach(g, 0, false); ventCoach(g, 1, false); ventCoach(g, -1, true)
    ok(hash(g) === hp, 'ventCoach cannot touch gs — hash identical through the view calls')
    // view side wired: coach drawn, taught latched on seal, probe exposed.
    const jsx = readFileSync(join(here, '../src/games/BombDefuse/index.jsx'), 'utf8')
    ok(jsx.includes('E.ventCoach(gs, youSeat, hud.ventTaught)') && jsx.includes('coach: hud.coach'),
        'index.jsx recomputes the coach from live state every frame')
    ok(/k === 'sealed'[\s\S]{0,160}hud\.ventTaught = true/.test(jsx),
        'the lesson latches the moment the crew seals')
    ok(jsx.includes('drawIntro(g, gs, hud.coach)') && jsx.includes('coach && coach.intro'),
        'the teach card rides the READ-STEP intro')
    ok(jsx.includes('coach.pulseBar') && jsx.includes('coach.pulseGauge') && jsx.includes("'TAP!'"),
        'both live pulses (bar ring, gauge TAP!) draw in the VENT view')
    ok(jsx.includes('coach: () => hudRef.current.coach'), '__bdTest.coach exposes the lesson for the drive harness')
    const esrc = readFileSync(join(here, '../src/games/BombDefuse/engine.js'), 'utf8')
    ok(!/ventCoach/.test(esrc.slice(esrc.indexOf('export function hash'), esrc.indexOf('export const TURN'))),
        'hash() never mentions the coach — the lesson lives outside the determinism core')
    // determinism: same seed, same pads -> the coach answers identically on both boxes.
    const bx1 = toVent(11), bx2 = toVent(11)
    while (bx1.intro > 0) drive(bx1, [{}, {}])
    while (bx2.intro > 0) drive(bx2, [{}, {}])
    ok(JSON.stringify(ventCoach(bx1, 0, false)) === JSON.stringify(ventCoach(bx2, 0, false)) && hash(bx1) === hash(bx2),
        'net twins: the coach is state-determined, both boxes teach the same lesson')
}

console.log('\n— first-vent teach panel (#1812 item 1) —')
{
    // The full-panel first lesson for phones: E.ventPanel names BOTH jobs —
    // seat, side, and exact key/pad — at the run's first vent, until any
    // input dismisses it (view latch) or the crew seals (taught). Mutants:
    // always-null reddens the teach gates; ignoring `taught` reddens the
    // silence gate; dropping the keydown dismiss reddens the pin.
    const toVentFresh = (seed, players = 2) => {
        const g = createGame(seed, players)
        let guard = 0
        while (!g.done && curStep(g).kind !== VENT && guard++ < 4000) step(g, solvePads(g))
        while (!g.done && g.intro > 0) step(g, [{}, {}])
        return g
    }
    // silence where there is nothing to teach
    ok(ventPanel(null, false) === null, 'no run, no panel')
    ok(ventPanel(createGame(7, 2), false) === null, 'SYNC step carries no panel (only the VENT teaches)')
    const tg = toVentFresh(7)
    ok(ventPanel(tg, true) === null, 'a taught crew never sees the panel again')
    tg.done = true
    ok(ventPanel(tg, false) === null, 'a finished run never teaches')
    // the lesson itself, holder on either side
    for (const seed of [7, 11, 23]) {
        const g = toVentFresh(seed)
        const p = ventPanel(g, false)
        const h = curStep(g).holder
        ok(p && p.holder === h, `seed ${seed}: the panel names the live holder (P${h + 1})`)
        ok(p && p.bar === `P${h + 1} PINS THE BAR`, `seed ${seed}: bar row titles the holder seat`)
        ok(p && p.needle === `P${2 - h} SEATS THE NEEDLE`, `seed ${seed}: needle row titles the worker seat`)
        ok(p && p.barSub.startsWith(h === 0 ? 'LEFT' : 'RIGHT') && p.needleSub.startsWith(h === 0 ? 'RIGHT' : 'LEFT'),
            `seed ${seed}: sides match the physical layout (seat 1 left, seat 2 right)`)
        ok(p && p.barSub.includes(h === 0 ? 'B KEY' : 'G KEY'), `seed ${seed}: the bar line names the holder's real key`)
        ok(p && p.needleSub.includes(h === 0 ? 'F KEY' : 'SPACE'), `seed ${seed}: the needle line names the worker's real key`)
        ok(p && p.barSub.includes('GREEN') === false && p.needleSub.includes('GREEN'), 'only the needle row carries the green cue')
    }
    // the phone truth: seat 0 (the pad seat) always reads B / HOLD PAD + SPACE
    // (seed 2 hosts the bar at seat 1, seed 1 hosts it at seat 2 — both sides)
    const p0 = ventPanel(toVentFresh(2), false)
    const p1s = ventPanel(toVentFresh(1), false)
    ok(p0 && p0.holder === 0 && p0.barSub.includes('HOLD PAD') && p0.needleSub.includes('F KEY'),
        'phones: the seat-1 bar line names B/HOLD PAD, the CPU-side needle line names F KEY')
    ok(p1s && p1s.holder === 1 && p1s.barSub.includes('G KEY') && p1s.needleSub.includes('SPACE'),
        'mirrored: the seat-2 bar line names G KEY, the pad-side needle line names SPACE')
    // purity: the panel cannot touch the sim
    const gp = toVentFresh(7)
    const hp0 = hash(gp)
    ventPanel(gp, false); ventPanel(gp, true)
    ok(hash(gp) === hp0, 'ventPanel cannot touch gs — hash identical through the view calls')
    // determinism: both net boxes teach the identical lesson
    const t1 = toVentFresh(13), t2 = toVentFresh(13)
    ok(JSON.stringify(ventPanel(t1, false)) === JSON.stringify(ventPanel(t2, false)) && hash(t1) === hash(t2),
        'net twins: the panel is state-determined, both boxes show the same lesson')
    // view side wired: law-driven paint, dismissal on ANY input, per-run reset
    const jsx = readFileSync(join(here, '../src/games/BombDefuse/index.jsx'), 'utf8')
    ok(jsx.includes('hud.panel = hud.panelGone || pausedRef.current ? null : E.ventPanel(gs, hud.ventTaught)'),
        'index.jsx recomputes the panel from live state, silenced by dismiss, pause and seal')
    ok(jsx.includes('if (hud.panel) drawVentPanel(g, hud.panel, youSeat, now)'), 'the panel paints only while the law says so')
    ok(/const panelUp = \(\) => \{[\s\S]{0,260}screenRef\.current === 'play'[\s\S]{0,160}E\.ventPanel\(gsRef\.current, h\.ventTaught\)/.test(jsx),
        'panelUp reads the live law (play screen + vent due + seal latch), not last frame paint')
    ok(/const dismissPanel = \(\) => \{ if \(panelUp\(\)\) hudRef\.current\.panelGone = true \}/.test(jsx),
        'the dismissal latch only trips while the lesson is due (no pre-emption by earlier keys)')
    ok(/const onKeyDown = \(e\) => \{[\s\S]{0,320}dismissPanel\(\)/.test(jsx),
        'any keydown during play dismisses the panel')
    ok(/const onPointer = \(ev\) => \{[\s\S]{0,900}dismissPanel\(\)/.test(jsx),
        'a pointer-down on the board dismisses it too')
    ok(/const newHud = \(\) => \(\{[\s\S]{0,420}panel: null, panelGone: false/.test(jsx),
        'a new run re-arms the lesson (newHud resets the latch)')
    ok(jsx.includes('panel: () => hudRef.current.panel || null') && jsx.includes('panelGone: () => hudRef.current.panelGone'),
        '__bdTest.panel/panelGone expose the lesson + latch for the drive harness')
    const esrc = readFileSync(join(here, '../src/games/BombDefuse/engine.js'), 'utf8')
    ok(!/ventPanel/.test(esrc.slice(esrc.indexOf('export function hash'), esrc.indexOf('export const TURN'))),
        'hash() never mentions the panel — the lesson lives outside the determinism core')
}

console.log('\n— powered-device bed (#1812 item 10) —')
{
    ok(bedHz(60) === BED.BASE && bedHz(BED.CRITICAL) === BED.BASE, 'standby hum: at or above CRITICAL seconds the pitch sits at BASE')
    let mono = true, strict = 0
    for (let s = BED.CRITICAL; s > 0; s--) {
        const a = bedHz(s), b = bedHz(s - 1)
        if (b < a) mono = false
        if (b > a) strict++
    }
    ok(mono, 'the pitch never drops as the fuse drains')
    ok(strict === BED.CRITICAL && bedHz(BED.CRITICAL - 1) > BED.BASE, 'the climb starts the second under CRITICAL and moves every second')
    ok(bedHz(0) === BED.TOP && bedHz(-7) === BED.TOP, 'the climb caps at TOP (a groan, never a squeal)')
    let stepMax = 0
    for (let s = 75; s > 0; s--) stepMax = Math.max(stepMax, Math.abs(bedHz(s) - bedHz(s - 1)))
    ok(stepMax <= BED.STEP, `each step of the climb is at most ${BED.STEP} Hz (a slide, not a siren)`)
    ok(Math.min(...Array.from({ length: 76 }, (_, s) => bedHz(s))) === BED.BASE && BED.BASE > 0, 'the bed never falls silent — the floor is the standby hum')
    const asrc = readFileSync(join(here, '../src/games/BombDefuse/audio.js'), 'utf8')
    ok(/bed\(secs\)\s*\{\s*A\.playTone\(bedHz\(secs\)/.test(asrc), 'sfx.bed sings the pure law through AudioController')
    ok(/bed\(secs\)[\s\S]{0,120},\s*0\.0[0-3]\d*\)/.test(asrc), 'the bed is sub-bass quiet (vol <= 0.03) — under the play, never over it')
    const esrc = readFileSync(join(here, '../src/games/BombDefuse/engine.js'), 'utf8')
    ok(!/bedHz|pumpBed/.test(esrc), 'engine.js never mentions the bed — the hum lives outside the determinism core')
    const jsx = readFileSync(join(here, '../src/games/BombDefuse/index.jsx'), 'utf8')
    ok(/const pumpBed = \(g\) => \{[\s\S]{0,320}screenRef\.current !== 'play'[\s\S]{0,80}hud\.boomT > 0/.test(jsx),
        'pumpBed gates the hum to the play screen and ducks it under the boom')
    ok(jsx.split('\n').filter((l) => /^\s*pumpBed\(/.test(l)).length >= 2, 'both tick paths (net + shell) pump the bed')
    ok(/hud\.bedPings\+\+; sfx\.bed\(Math\.ceil\(g\.fuse \/ 60\)\)/.test(jsx),
        'the hum rides live fuse seconds every BED.EVERY ticks')
    ok(jsx.includes('bedPings: () => hudRef.current.bedPings'), '__bdTest.bedPings exposes the bed for the drive harness')
    ok(jsx.includes('<PauseOverlay game={entry}'), 'PauseOverlay gets the game prop (gameEntry crashed the whole app on Escape — the QA drive live-proves pause/resume)')
}

console.log('\n— window pre-flash (#1812 item 4) —')
{
    // Pure view law (the item-2/5/1932 house pattern): while NO seat has
    // touched the live step, preFlash names the verb it asks (SYNC barrels,
    // CUT arms, VENT holder bar) so the pulsing edge teaches the window
    // BEFORE the first press; the moment any seat acts it returns null —
    // exactly when drawWindowBar takes over. Kill laws (README mutants):
    // always-null reddens the relight gates; ignoring held reddens VENT;
    // ignoring sel reddens the cycle-counts-as-touch gate.
    const toKind = (seed, kind, players = 2) => {
        const g = createGame(seed, players)
        let guard = 0
        while (!g.done && curStep(g).kind !== kind && guard++ < 4000) drive(g, solvePads(g))
        return g
    }
    const g0 = createGame(7, 2) // step 0 always SYNC
    const p0 = preFlash(g0)
    ok(p0 && p0.kind === SYNC && p0.intro === true, 'SYNC at step load: the barrels flash before anyone presses')
    while (g0.intro > 0) drive(g0, [{}, {}])
    const p1 = preFlash(g0)
    ok(p1 && p1.kind === SYNC && p1.intro === false, 'the flash survives READ-STEP — live and untouched it keeps teaching')
    drive(g0, [{ a: true }, {}])
    ok(preFlash(g0) === null, 'a turned key kills the flash — the SYNC WINDOW bar takes the shift')
    // CUT: arms flash at load; cycling counts as touching (the player found the verb).
    const gc = toKind(7, CUT)
    while (gc.intro > 0) drive(gc, [{}, {}])
    const pc = preFlash(gc)
    ok(pc && pc.kind === CUT, 'CUT at step load: the cutter arms flash')
    drive(gc, [{ up: true }, {}])
    ok(gc.sel[0] !== 0 && preFlash(gc) === null, 'cycling an arm counts as touched — the flash retires')
    // VENT: the holder bar flashes (unvented burns double) and silences on the pin.
    const gv = toKind(7, VENT)
    while (gv.intro > 0) drive(gv, [{}, {}])
    const holder = curStep(gv).holder
    ok(preFlash(gv) && preFlash(gv).kind === VENT, 'VENT at step load: the holder bar flashes before the double-burn bites')
    drive(gv, [{ b: holder === 0 }, { b: holder === 1 }])
    ok(gv.held && preFlash(gv) === null, 'pinning the bar silences the flash (same deed, same law)')
    const gdone = toKind(7, VENT)
    gdone.done = true
    ok(preFlash(gdone) === null, 'a finished run never flashes')
    // per-window law: EVERY step of a clean run flashes at its load — the rim
    // is a window teacher, not a one-time lesson.
    const gr = createGame(11, 2)
    let stepsSeen = 0, flashed = 0, sig = ''
    while (!gr.done) {
        const s = `${gr.bomb}/${gr.step}`
        if (s !== sig) { sig = s; stepsSeen++; if (preFlash(gr)) flashed++ }
        gr.events.length = 0
        step(gr, solvePads(gr))
    }
    ok(gr.won && stepsSeen === 12 && flashed === 12, 'all 12 steps of a won run flash at load — per-window, not per-run', `steps=${stepsSeen} flashed=${flashed}`)
    // purity + net twins: the view calls can neither move the sim nor disagree.
    const gx = createGame(5, 2)
    for (let t = 0; t < 60; t++) { step(gx, solvePads(gx)); gx.events.length = 0 }
    const hx = hash(gx)
    preFlash(gx); preFlash(createGame(5, 2)); preFlash(null)
    ok(hash(gx) === hx, 'preFlash cannot touch gs — hash identical through the view calls')
    const t1 = createGame(13, 2), t2 = createGame(13, 2)
    let pfSame = true
    for (let t = 0; t < 240; t++) {
        const pads = solvePads(t1)
        step(t1, pads); t1.events.length = 0
        step(t2, pads); t2.events.length = 0
        if (JSON.stringify(preFlash(t1)) !== JSON.stringify(preFlash(t2))) pfSame = false
    }
    ok(pfSame && hash(t1) === hash(t2), 'net twins: both boxes flash the same law through a whole bomb', `hash=${hash(t1)}`)
    // source pins: the determinism core and step logic never hear about it.
    const esrc = readFileSync(join(here, '../src/games/BombDefuse/engine.js'), 'utf8')
    ok(!/preFlash/.test(esrc.slice(esrc.indexOf('export function step'), esrc.indexOf('export function simState'))),
        'step()/simState() never mention the flash — it lives outside the determinism core')
    ok(!/preFlash/.test(esrc.slice(esrc.indexOf('export function hash'), esrc.indexOf('// ---- key-turn feel'))),
        'hash() never mentions the flash')
    // view side wired: computed per frame, drawn per kind, exposed for the drive.
    const jsx = readFileSync(join(here, '../src/games/BombDefuse/index.jsx'), 'utf8')
    ok(jsx.includes('hud.pf = E.preFlash(gs)') && jsx.includes('pf: hud.pf'),
        'index.jsx recomputes the pre-flash from live state every frame')
    ok(jsx.includes('opts.pf && opts.pf.kind === E.SYNC') && jsx.includes('opts.pf && opts.pf.kind === E.CUT') && jsx.includes('opts.pf && opts.pf.kind === E.VENT'),
        'all three kinds draw their pulsing amber rim')
    ok(jsx.includes('preFlash: () => hudRef.current.pf || null'), '__bdTest.preFlash exposes the law for the drive harness')
    ok(jsx.includes("if (hold <= 0) return") && /const p1 = |drawWindowBar\(g, gs, \(gs\.keys/.test(jsx),
        'the SYNC WINDOW bar still answers only to a held press — the flash covers the other half of the gap')
}

console.log('\n— active-seat ask (#1812 item 7) —')
{
    // The strip said WHO sits, never WHO IS ASKED. seatAsk is the pure law:
    // per-seat debt for the live step — SYNC/CUT ask both until each answers
    // (key turned / blade armed), VENT asks the holder until gs.held and the
    // worker until the seal advances. Kill laws (README mutants): holder debt
    // ignoring gs.held reddens the pin gate; both-true reddens the answered
    // gates; null-always reddens the load gates.
    const toKind = (seed, kind, players = 2) => {
        const g = createGame(seed, players)
        let guard = 0
        while (!g.done && curStep(g).kind !== kind && guard++ < 4000) drive(g, solvePads(g))
        return g
    }
    const drainIntro = (g) => { while (!g.done && g.intro > 0) drive(g, [{}, {}]) }

    // load-time law: SYNC step 0 asks both; done/no-state answer null.
    const g0 = createGame(7, 2)
    ok(seatAsk(g0) && seatAsk(g0).kind === SYNC && seatAsk(g0).ask[0] && seatAsk(g0).ask[1], 'SYNC at load: both seats owe the turn')
    ok(seatAsk(null) === null, 'no run, no ask')
    const gfin = createGame(7, 2)
    gfin.done = true
    ok(seatAsk(gfin) === null, 'a finished run asks nothing')

    // SYNC: turning ONE key silences ONE chip — the other seat stays asked.
    const gs1 = createGame(7, 2)
    drainIntro(gs1)
    ok(seatAsk(gs1).ask[0] && seatAsk(gs1).ask[1], 'live SYNC before any press: both chips hot')
    drive(gs1, [{ a: true }, {}])
    ok(gs1.keys[0] && !gs1.keys[1] && seatAsk(gs1).ask[0] === false && seatAsk(gs1).ask[1] === true, 'one key turned: that seat goes quiet, its partner stays asked')

    // CUT: arming one blade pays that seat's debt only.
    const gc = toKind(7, CUT)
    drainIntro(gc)
    gc.sel[0] = curStep(gc).color
    gc.sel[1] = curStep(gc).color
    drive(gc, [{ a: true }, {}])
    ok(gc.armed[0] && !gc.armed[1] && seatAsk(gc).ask[0] === false && seatAsk(gc).ask[1] === true, 'one blade armed: the other seat still owes the snip')

    // VENT: holder debt is LEVEL — pinned → quiet, released → hot again;
    // the worker stays asked until the seal (which ends the step anyway).
    const gv = toKind(7, VENT)
    drainIntro(gv)
    const holder = curStep(gv).holder
    const worker = 1 - holder
    const v0 = seatAsk(gv)
    ok(v0 && v0.kind === VENT && v0.holder === holder && v0.ask[holder] === true && v0.ask[worker] === true, 'VENT unpinned: holder AND worker both owe')
    drive(gv, [{ b: holder === 0 }, { b: holder === 1 }])
    const v1 = seatAsk(gv)
    ok(gv.held && v1.ask[holder] === false && v1.ask[worker] === true, 'pinning the bar pays the holder; the needle-seat stays asked')

    // per-step law across a WON run: every step opens asking, and an answered
    // seat is never asked again on the same step (the debt never re-lights).
    const gr = createGame(11, 2)
    let sig = '', askedAll = true, relight = 0
    const answered = { sig: '', keys: [false, false], armed: [false, false], held: false }
    while (!gr.done) {
        const s = `${gr.bomb}/${gr.step}`
        if (s !== sig) { sig = s; if (!seatAsk(gr)) askedAll = false; answered.keys = [false, false]; answered.armed = [false, false]; answered.held = false }
        const a = seatAsk(gr)
        const st = curStep(gr)
        if (a) {
            if (st.kind === SYNC) for (let i = 0; i < 2; i++) { if (answered.keys[i] && a.ask[i]) relight++; if (gr.keys[i]) answered.keys[i] = true }
            if (st.kind === CUT) for (let i = 0; i < 2; i++) { if (answered.armed[i] && a.ask[i]) relight++; if (gr.armed[i]) answered.armed[i] = true }
            if (st.kind === VENT && answered.held && a.ask[st.holder]) relight++
            if (gr.held) answered.held = true
        }
        gr.events.length = 0
        step(gr, solvePads(gr))
    }
    ok(gr.won && askedAll && relight === 0, 'every step opens asking; an answered seat never re-lights on its step', `won=${gr.won} relight=${relight}`)

    // purity + twins: neither gs, the hash, nor the two boxes can disagree.
    const gx = createGame(5, 2)
    for (let t = 0; t < 60; t++) { step(gx, solvePads(gx)); gx.events.length = 0 }
    const hx = hash(gx)
    seatAsk(gx); seatAsk(createGame(5, 2)); seatAsk(null)
    ok(hash(gx) === hx, 'seatAsk cannot touch gs — hash identical through the view calls')
    const t1 = createGame(13, 2), t2 = createGame(13, 2)
    let askSame = true
    for (let t = 0; t < 240; t++) {
        const pads = solvePads(t1)
        step(t1, pads); t1.events.length = 0
        step(t2, pads); t2.events.length = 0
        if (JSON.stringify(seatAsk(t1)) !== JSON.stringify(seatAsk(t2))) askSame = false
    }
    ok(askSame && hash(t1) === hash(t2), 'net twins: both boxes ask the same seats through a whole bomb', `hash=${hash(t1)}`)

    // source pins: the determinism core never hears about the ask.
    const esrc = readFileSync(join(here, '../src/games/BombDefuse/engine.js'), 'utf8')
    ok(!/seatAsk/.test(esrc.slice(esrc.indexOf('export function step'), esrc.indexOf('export function simState'))),
        'step()/simState() never mention the ask — it lives outside the determinism core')
    ok(!/seatAsk/.test(esrc.slice(esrc.indexOf('export function hash'), esrc.indexOf('// ---- key-turn feel'))),
        'hash() never mentions the ask')
    // view side wired: computed per frame, chips pulsed for all three kinds,
    // strip chip pulsed, probe exposed.
    const jsx = readFileSync(join(here, '../src/games/BombDefuse/index.jsx'), 'utf8')
    ok(jsx.includes('hud.ask = E.seatAsk(gs)') && jsx.includes('ask: hud.ask'),
        'index.jsx recomputes the ask from live state every frame')
    ok((jsx.match(/chipInk\(opts, i, now\)/g) || []).length === 3,
        'all three kinds draw the pulsing seat chip (key, blade, bar)')
    ok(jsx.includes('function chipInk(opts, seat, now)') && /opts\.paused === true \? null : opts\.ask/.test(jsx),
        'the pulse is paint over the law and dies while paused')
    ok(/seatInk = on \? col/.test(jsx) && /ask: hud\.ask, pill: hud\.pill \}, now\)/.test(jsx.slice(jsx.indexOf('drawHudFrame(g, gs'))),
        'the HUD strip pulses the P2 chip while seat 2 owes the step')
    ok(jsx.includes('seatAsk: () => hudRef.current.ask || null'), '__bdTest.seatAsk exposes the ask for the drive harness')
}

console.log('\n— the boom (#1812 item 3) —')
{
    // Lid off, shrapnel arcs, scorch rides into the next run. Pure view: the
    // engine gains NOTHING (hash law — Math.random is banned from the sim, so
    // the spawn lives where gs cannot be reached). Kill laws (README mutants):
    // dropping spawnBoom at the boom event reddens the spawn + drive gates;
    // clearing scorchDecals on restart reddens the carry pin; referencing gs
    // inside spawnBoom reddens the purity pin.
    const jsx = readFileSync(join(here, '../src/games/BombDefuse/index.jsx'), 'utf8')
    ok(/k === 'boom'[\s\S]{0,120}spawnBoom\(hud\)/.test(jsx), 'the boom event spawns lid + shrapnel + scorch')
    const spawn = jsx.slice(jsx.indexOf('const spawnBoom'), jsx.indexOf('function drawHudFrame'))
    ok(spawn.includes('hud.lid') && spawn.includes('hud.shrap') && spawn.includes('scorchDecals = Array.from'), 'the spawn sets lid, shrapnel and decals')
    ok(spawn.includes('Math.random') && !/\bgs\b/.test(spawn), 'spawnBoom reads only Math.random — no gs, hash law intact (ART.md 5)')
    ok(/let scorchDecals = \[\]/.test(jsx), 'decals are module-level — the chassis memory outlives a createGame')
    ok((jsx.match(/scorchDecals = \[\]/g) || []).length === 2, 'the soot washes only on unmount (the second write is the declaration)', `${(jsx.match(/scorchDecals = \[\]/g) || []).length}`)
    ok(jsx.includes('for (const d of scorchDecals)'), 'the plate draws the scorch decals')
    ok(/L\.vy \+= 0\.35/.test(jsx) && /s\.vy \+= 0\.3/.test(jsx), 'lid and shrapnel arc under gravity (paint-frame physics)')
    ok(jsx.includes('lid: null, shrap: []'), 'the hud carries the fx state')
    ok(jsx.includes('boomFx: () => ({ lid:') && jsx.includes('boomNow: () =>'), '__bdTest.boomFx/boomNow expose the FX for the drive harness')
    // determinism untouched: two won runs, no boom, no decals, hash law holds.
    const g = createGame(11, 2)
    let n = 0
    while (!g.done && n++ < 6000) { g.events.length = 0; step(g, solvePads(g)) }
    ok(g.won && hash(g) === hash((() => { const h = createGame(11, 2); let m = 0; while (!h.done && m++ < 6000) step(h, solvePads(h)); return h })()), 'a clean run replays hash-equal — the boom FX added no sim state')
}

console.log('\n— win tally (#1812 item 6) —')
{
    // Score-salad law. The ledger is honest (sums to the score, matches the
    // per-bomb payout), the playback is monotonic and lands exactly, and the
    // determinism core never hears about it. Kill laws (README mutants):
    // dropping an `earned +=` reddens the delta gate; adding earned to hash()
    // reddens the purity pins; an uncapped ease-out reddens the overshoot gate.
    const deltasOk = []
    const sumsOk = []
    const paysOk = []
    for (const seed of [3, 7, 11, 42, 99]) {
        const g = createGame(seed, 2)
        let n = 0
        let prev = 0
        while (!g.done && n++ < 6000) {
            step(g, solvePads(g))
            for (const f of g.events) {
                if (f.k === 'defused') {
                    deltasOk.push(g.bombs[f.bomb - 1].earned === g.score - prev)
                    prev = g.score
                }
            }
            g.events.length = 0
        }
        const t = winTally(g)
        sumsOk.push(g.won && t.length === BOMBS && t.reduce((a, l) => a + l.value, 0) === g.score)
        t.forEach((l, i) => {
            const floor = 50 * g.bombs[i].steps.length + 500
            const ceil = floor + Math.floor(g.bombs[i].fuse0 / 60) * 5
            paysOk.push(Number.isInteger(l.value) && l.value >= floor && l.value <= ceil && l.bomb === i + 1)
        })
    }
    ok(deltasOk.length === BOMBS * 5 && deltasOk.every(Boolean),
        'the ledger matches the score delta at every defuse — 15 payouts across 5 seeds', `${deltasOk.filter(Boolean).length}/${deltasOk.length}`)
    ok(sumsOk.every(Boolean), 'winTally: one line per bomb, and the lines sum exactly to gs.score')
    ok(paysOk.every(Boolean), 'each bomb pays steps×50 + 500 + a fuse bonus in 5s — within its honest floor/ceiling')
    ok(winTally(createGame(7, 2)).length === 0 && winTally(null).length === 0,
        'no tally before the win — a live or missing run answers empty')

    // playback law: monotonic rolls, exact landings, nothing overshoots, and
    // the whole salad fits a bounded window.
    const vals = [650, 800, 975]
    const dur = tallyDur(vals)
    ok(dur === 3 * TALLY.LINE + TALLY.TOTAL && dur < 3000, 'a three-bomb salad runs under 3 s — arcade-quick')
    let mono = true
    let over = 0
    let relaunch = 0
    let landedNonMono = 0
    let lastDone = false
    let prevLines = []
    let prevTotal = 0
    let prevLanded = -1
    let firstLand = []
    for (let ms = 0; ms <= dur; ms += 16) {
        const f = tallyFrame(vals, ms)
        if (lastDone && !f.done) relaunch++
        lastDone = f.done
        if (f.landed < prevLanded) landedNonMono++
        prevLanded = f.landed
        if (f.lines.length < prevLines.length) relaunch++
        f.lines.forEach((v, i) => {
            if (v > vals[i]) over++
            if (i < prevLines.length && v < prevLines[i]) mono = false
            if (v === vals[i] && firstLand[i] === undefined) firstLand[i] = ms
        })
        if (f.total > vals.reduce((a, b) => a + b, 0)) over++
        if (f.total < prevTotal) mono = false
        prevTotal = f.total
        prevLines = f.lines
    }
    const fin = tallyFrame(vals, dur)
    ok(mono && landedNonMono === 0 && relaunch === 0, 'rolls only climb; lines, total and landed never rewind or relaunch')
    ok(over === 0, 'no roll ever overshoots its target — capped ease-out')
    ok(fin.done && JSON.stringify(fin.lines) === JSON.stringify(vals) && fin.total === 2425 && fin.landed === vals.length + 1,
        'the salad lands exactly on every value, then the total', JSON.stringify(fin))
    ok(firstLand.every((t, i) => t !== undefined && t >= i * TALLY.LINE && t <= i * TALLY.LINE + TALLY.ROLL + 16),
        'each line lands inside its cue window (i×LINE .. +ROLL)', JSON.stringify(firstLand))
    ok(tallyFrame([], 0).done === true, 'an empty ledger resolves instantly — the salad can never wedge the over screen')
    const zeros = tallyFrame([0, 0, 0], tallyDur([0, 0, 0]) - 1)
    ok(zeros.total === 0 && zeros.landed >= 3, 'zero-value lines still cue — every bomb gets its line and its ding')

    // determinism core untouched: `earned` rides outside the hash and simState.
    const esrc = readFileSync(join(here, '../src/games/BombDefuse/engine.js'), 'utf8')
    ok(!/earned/.test(esrc.slice(esrc.indexOf('export function hash'), esrc.indexOf('// ---- key-turn feel'))),
        'hash() never mentions the ledger')
    ok(!/earned/.test(esrc.slice(esrc.indexOf('export function simState'), esrc.indexOf('export function hash'))),
        'simState() never leaks the ledger')
    const twin = (seed) => {
        const g = createGame(seed, 2)
        let m = 0
        while (!g.done && m++ < 6000) { g.events.length = 0; step(g, solvePads(g)) }
        return g
    }
    ok(hash(twin(11)) === hash(twin(11)), 'a won run still replays hash-equal — the ledger added no sim drift')

    // net resync carries the ledger — the guest's recap tells the host's story.
    const host = twin(42)
    const guest = restoreNet(JSON.parse(JSON.stringify(snapshotNet(host))))
    ok(guest.bombs.every((b, i) => b.earned === host.bombs[i].earned) && guest.score === host.score,
        'snapshot → restore rebuilds the per-bomb ledger whole (no wire-less lines)')

    // view side wired: the salad paints from the law and dings on landings.
    const jsx = readFileSync(join(here, '../src/games/BombDefuse/index.jsx'), 'utf8')
    ok(/const values = E\.winTally\(gs\)\.map/.test(jsx) && /E\.tallyFrame\(values, performance\.now\(\) - overAtRef\.current\)/.test(jsx),
        'drawOver rolls the salad off the law, clocked from the over-screen entry')
    ok(/while \(tallyDingsRef\.current < fr\.landed\)[\s\S]{0,120}sfx\.tally\(/.test(jsx),
        'one ding per landed line, driven by the landed counter')
    ok(jsx.includes("if (s === 'over') tallyDingsRef.current = 0"), 'entering over re-arms the ding counter — the salad repeats honestly run after run')
    ok(!/String\(gs\.score\)/.test(jsx.slice(jsx.indexOf('score-salad. The win RECAPS'), jsx.indexOf('const drawSelect'))),
        'the win side paints only from the tally — it never dumps the raw gs.score')
    ok(jsx.includes('winTally: () =>') && jsx.includes('tally: () =>'),
        '__bdTest.winTally/tally expose the ledger and the live frame for the drive harness')
    const asrc = readFileSync(join(here, '../src/games/BombDefuse/audio.js'), 'utf8')
    ok(/tally\(i\) \{ A\.playTone\(660 \+ \(i \| 0\) \* 110/.test(asrc), 'the tally ding rises with the line number')
}

console.log('\n— online link pill + crew chime (#1812 fold-in items 1, 2, 4) —')
{
    const aud = readFileSync(join(here, '../src/games/BombDefuse/audio.js'), 'utf8')
    // pure law: netPill answers over shell net facts, never gs.
    ok(netPill(null) === null && netPill({}) === null && netPill({ code: '' }) === null,
        'no wire, no pill — offline and code-less rooms show nothing')
    const live = netPill({ code: 'AB12', solo: false, stallRun: 0, reseat: false })
    ok(live && live.tone === 'green' && live.text === 'NET AB12 LIVE',
        'a whole link reads LIVE and names the room code', JSON.stringify(live))
    ok(netPill({ code: 'ABCDEFG', solo: false, stallRun: 0 }).text === 'NET ABCD LIVE',
        'the pill clamps the code to four chars — the strip never grows')
    ok(netPill({ code: 'AB12', solo: false, stallRun: LINK.SHAKY - 1 }).tone === 'green'
        && netPill({ code: 'AB12', solo: false, stallRun: LINK.SHAKY }).text === 'LINK SHAKY',
        `the shaky tell trips at exactly ${LINK.SHAKY} stalled ticks`)
    const lost = netPill({ code: 'AB12', solo: true, stallRun: 999, reseat: false })
    ok(lost.text === 'CPU PARTNER' && lost.tone === 'red',
        'a demoted crew outranks jitter — no wire, no link words', JSON.stringify(lost))
    const back = netPill({ code: 'AB12', solo: true, stallRun: 999, reseat: true })
    ok(back.text === 'LINK RETURNING' && back.tone === 'amber',
        'a seat on its way back outranks everything — RETURNING, not LIVE', JSON.stringify(back))
    ok(new Set([live, lost, back, netPill({ code: 'A', solo: false, stallRun: 99 })].map((p) => p.tone)).size === 3
        && [live, lost, back].every((p) => /^[A-Z0-9 ()·-]+$/.test(p.text)),
        'three honest tones (green/amber/red), every text plain canvas pixels')
    // hash-clean by law: the pill never touches gs — a run laced with pill
    // calls replays byte-identical against a bare one.
    const lace = (seed) => {
        const g = createGame(seed, 2)
        let m = 0
        while (!g.done && m++ < 6000) {
            step(g, solvePads(g))
            g.events.length = 0
            netPill({ code: 'AB12', solo: g.tick % 7 === 0, stallRun: g.tick, reseat: g.tick % 13 === 0 })
        }
        return g
    }
    const bare = (seed) => {
        const g = createGame(seed, 2)
        let m = 0
        while (!g.done && m++ < 6000) { step(g, solvePads(g)); g.events.length = 0 }
        return g
    }
    ok(hash(lace(21)) === hash(bare(21)), 'pill calls interleaved through a won run leave the hash untouched')

    // view side: drawScene asks the law, the strip paints only its verdict.
    const jsx = readFileSync(join(here, '../src/games/BombDefuse/index.jsx'), 'utf8')
    ok(/hud\.pill = net\.active \? E\.netPill\(\{[\s\S]{0,240}stallRun: net\.sync \? net\.sync\.stats\(\)\.stallRun : 0/.test(jsx),
        'the play screen recomputes the pill each frame from room code, solo, stallRun, reseat')
    ok(/drawHudFrame\(g, gs, \{[^}]*pill: hud\.pill/.test(jsx),
        'the HUD strip is handed the law\'s verdict, not raw net state')
    ok(/if \(opts\.pill\)[\s\S]{0,640}g\.fillText\(opts\.pill\.text, 320, 342\)/.test(jsx),
        'the pill paints centered in the strip, text from the law only')
    ok(jsx.includes('netPill: () => hudRef.current.pill || null'),
        '__bdTest.netPill exposes the live verdict for the drive harness')
    // item 4: a demoted crew re-tags its survivor instead of losing the YOU.
    ok(/net\.sync\.solo\(\) \? 0 : \(net\.sync\.reseatTick == null \? net\.sync\.mySeat : -1\)/.test(jsx),
        'solo survivor keeps the YOU tag on seat 0 — the seat its own keys drive')
    // item 2: the kick and the mid-run re-seat land heard.
    ok(/'CREW LINKED — BOTH HANDS'[\s\S]{0,160}sfx\.crew\(\)/.test(jsx),
        'the kick sounds the crew chime beside its banner')
    ok(/'PARTNER RE-SEATED — CREW WHOLE'[\s\S]{0,120}sfx\.crew\(\)/.test(jsx),
        'the hand-back rings the same bell — one crew sound for one crew')
    ok(/crew\(\) \{ A\.playTone\(523[\s\S]{0,160}A\.playTone\(784/.test(aud),
        'sfx.crew is a rising three-note chime, synthesized like every other sound')
}

console.log('\n— voice grammar (#1812 item 9) —')
{
    const C = (k, extra = {}) => JSON.stringify({ kind: k, ...extra })
    const got = (t, h = 0) => JSON.stringify(parseCall(t, h))
    // colour + wire pairs coach the blade.
    ok(got('cut the blue wire') === C('color', { color: 1 }), 'colour+wire pair names the wire (BLUE)', got('cut the blue wire'))
    ok(got('snip yellow wire please') === C('color', { color: 3 }), 'a polite yellow request still lands YELLOW', got('snip yellow wire please'))
    ok(got('red') === C('color', { color: 0 }) && got('blue') === C('color', { color: 1 }), 'bare colours still coach')
    // action words name the step — they read before colours.
    ok(got('vent the red bar', 1) === C('hold', { seat: 1 }), 'an action beats the colour on the chassis (holder keeps their seat)', got('vent the red bar', 1))
    ok(got('seat the needle') === C('seat', { seat: 1 }), 'the needle still calls the worker seat')
    ok(got('green') === C('seat', { seat: 1 }), 'bare GREEN drives the needle, not the wire (author seat list)', got('green'))
    ok(got('cut the green wire') === C('color', { color: 2 }), 'GREEN as a wire needs its pair — and lands', got('cut the green wire'))
    // urgency words ride the sync window.
    ok(got('faster') === C('sync') && got('quick quick') === C('sync') && got('fast') === C('sync'), 'FASTER/QUICK/FAST pulse the two-key window')
    // the warning: WAIT/NO — heard, and never a wire.
    ok(got('wait') === C('warn') && got('no') === C('warn') && got('stop') === C('warn'), 'WAIT/NO/STOP become the warning pulse')
    ok(got('no red') === C('warn') && got('wait blue wait') === C('warn'), 'the warning outranges a colour — "NO, not that one!" never coaches a wire')
    // letter-tolerance for the recogniser\'s mis-hears.
    ok(got('read the wire') === C('color', { color: 0 }), 'READ mis-hears back to RED', got('read the wire'))
    ok(got('blew') === C('color', { color: 1 }), 'the homophone BLEW lands BLUE', got('blew'))
    ok(got('gren') === C('color', { color: 2 }) && got('yello') === C('color', { color: 3 }), 'one dropped letter still reaches GREEN/YELLOW')
    // ...and the leash holds: ordinary words must NOT invent colours.
    ok(parseCall('said') === null && parseCall('bed') !== null, 'the 3-letter leash: SAID stays silent (2 edits from RED)', JSON.stringify(parseCall('said')))
    ok(parseCall('the wire') === null && parseCall('zzzz') === null && parseCall('') === null, 'noise still banks NO MATCH', JSON.stringify(parseCall('the wire')))
    ok(got('VENT') === C('hold', { seat: 0 }) && got('PRESS') === C('seat', { seat: 1 }), 'real verbs keep their meaning next to the fuzzy colour scan')
    // coaching-only (#1247): the grammar module touches no engine, the shell
    // never commits a control from a heard word.
    const vsrc = readFileSync(join(here, '../src/games/BombDefuse/voice.js'), 'utf8')
    const jsx = readFileSync(join(here, '../src/games/BombDefuse/index.jsx'), 'utf8')
    const aud = readFileSync(join(here, '../src/games/BombDefuse/audio.js'), 'utf8')
    ok(!/import\s/.test(vsrc), 'voice.js imports nothing — words cannot reach the sim (#1247)')
    ok(!/\bstep\s*\(/.test(vsrc), 'voice.js calls no engine functions (source pin)')
    ok(/intent\.kind === 'warn'[\s\S]{0,80}sfx\.warn\(\)/.test(jsx), 'the warning lands heard in the shell')
    ok(/warn\(\) \{ A\.playTone\(320[\s\S]{0,80}A\.playTone\(240/.test(aud), 'sfx.warn is a descending double blip, synthesized like every other sound')
    ok(/strokeRect\(110, 140, 420, 152\)[\s\S]{0,220}WAIT/.test(jsx), 'the warning paints its own red frame + word')
    // determinism: same words, same verdict, twice.
    ok(JSON.stringify(parseCall('CUT THE BLUE WIRE', 1)) === JSON.stringify(parseCall('cut the blue wire', 1)), 'grammar is deterministic across casings')
}

console.log(`\ndefusecheck: ${pass}/${pass + fail} gates`)
process.exit(fail ? 1 : 0)
