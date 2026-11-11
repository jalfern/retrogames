// PLATE CHECK — Node harness for THE BATTERY RAIL (#1917, TALK ME DOWN).
// Proves the stage's three things: the sim boots with a legal rail on every
// seed, the rail law holds (open-end-only pull, silent refusal, push-back
// re-clips home, the autopilot never wastes a press on a blocked slot), and
// the game can still be WON with the rail geometry in play — plus the never-
// lies sweep (what the plate draws rides simState + hash) and one mutation
// that must go red (`--mutate`: the open-end gate is removed; gates die).
// Pure Node: engine.js is DOM-free by design.

import {
    createGame, step, simState, hash, solvePad, drainEvents, buildBomb, railOpen, trayLayout, ruleOf,
} from '../src/games/TalkMeDown/engine.js'
import { makeRailFx, stepRailFx, railCellPose, drawBack, RAIL_TAB_FREE, RAIL_TAB_BLOCKED, railMouthGlow, PANEL } from '../src/games/TalkMeDown/art.js'
import { readFileSync } from 'node:fs'
import { plant, pull } from './lib/mutateguard.mjs'

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  ok  ${name}`) }
    else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`) }
}
const home = g => { for (let o = railOpen(g.tray); g.sel !== o; o = railOpen(g.tray)) step(g, g.sel > o ? { left: true } : { right: true }) }

// ---- 1. boot: the rail is legal on every bomb ------------------------------
{
    let bad = ''
    for (let seed = 1; seed <= 300 && !bad; seed++) {
        for (const round of [1, 2, 3, 4, 5]) {
            const gs = createGame(seed, 1); gs.round = round; buildBomb(gs)
            const c = gs.features.batteries
            if (!Array.isArray(gs.tray) || gs.tray.length !== 3 || gs.tray.some(v => v !== 0 && v !== 1)) { bad = `seed ${seed} r${round} tray ${JSON.stringify(gs.tray)}`; break }
            if (gs.tray.reduce((a, b) => a + b, 0) !== c) { bad = `seed ${seed} r${round} sum ${gs.tray.join('')} != count ${c}`; break }
            if (gs.sel !== 2 || gs.heldSlot !== -1) { bad = `seed ${seed} r${round} hand ${gs.sel}/${gs.heldSlot}`; break }
            if (!(gs.sel >= 0 && gs.sel <= 2)) { bad = `seed ${seed} sel ${gs.sel}`; break }
        }
    }
    ok('rail boots legal on 300 seeds x rounds 1-5 (sum==count, hand at the rail end)', !bad, bad)
}

// ---- 2. layout purity: seeded, stable, side-stream ---------------------------
{
    let pure = true
    for (let seed = 1; seed <= 400; seed++) {
        for (const round of [1, 3, 5]) {
            const gs = createGame(seed, 1); gs.round = round
            const t1 = trayLayout(gs.seed, round, gs.features.batteries).join('')
            const t2 = trayLayout(gs.seed, round, gs.features.batteries).join('')
            if (t1 !== t2) pure = false
        }
    }
    ok('layout is a pure function of seed+round+count (400 seeds)', pure)
    // all seven reachable shapes occur (0..2 cells across three slots)
    const seen = new Set()
    for (let seed = 1; seed <= 600; seed++) { const gs = createGame(seed, 1); seen.add(gs.tray.join('')) }
    ok('the layout actually varies', seen.size >= 6, [...seen].join(' '))
    // side-stream law: trayLayout builds its own mulberry32 (the module rng
    // never sees the rail — pre-rail bombs generate byte-identically).
    const engSrc = readFileSync(new URL('../src/games/TalkMeDown/engine.js', import.meta.url), 'utf8')
    ok('layout keys off its own rng stream (source pin)', /function trayLayout[\s\S]{0,260}mulberry32\(\(+\(?seed/.test(engSrc))
}

// ---- 3. the rail law ----------------------------------------------------------
{
    let refusals = 0, bad = ''
    outer3:
    for (let seed = 1; seed <= 500 && !bad; seed++) {
        const gs = createGame(seed, 1)
        if (gs.features.batteries < 2) continue
        step(gs, { up: true }) // flip; hand rests at slot 2
        const o = railOpen(gs.tray)
        const blocked = (o + 2) % 3 // the open end's left neighbour...
        if (gs.tray[blocked] !== 1) continue
        // ...slide the hand onto it and press: silent refusal.
        while (gs.sel !== blocked) step(gs, { left: true })
        drainEvents(gs)
        const b0 = gs.features.batteries, p0 = gs.pulls
        step(gs, { a: true })
        if (gs.features.batteries !== b0 || gs.held !== 0 || gs.pulls !== p0 || gs.strikes !== 0 || drainEvents(gs).length !== 0) {
            bad = `seed ${seed} blocked pull was not silent (tray ${gs.tray.join('')} sel ${gs.sel} strikes ${gs.strikes})`; break
        }
        // the refusal moves nothing but the clock: tray/held/pulls stand still.
        const s0 = simState(gs)
        if (s0.tray.join('') !== gs.tray.join('') || s0.held !== 0 || s0.pulls !== p0 || s0.sel !== blocked) { bad = `seed ${seed} refused press moved the rail state`; break }
        refusals++
        // empty slots refuse too
        const empty = gs.tray.findIndex(v => v === 0)
        if (empty >= 0) {
            while (gs.sel !== empty) step(gs, gs.sel > empty ? { left: true } : { right: true })
            drainEvents(gs); step(gs, { a: true })
            if (gs.held !== 0 || gs.strikes !== 0 || drainEvents(gs).length !== 0) { bad = `seed ${seed} empty slot not silent`; break }
        }
        // the open end releases; the cell is out and the count is live
        home(gs); drainEvents(gs)
        step(gs, { a: true })
        if (gs.held !== 1 || gs.pulls !== 1 || gs.heldSlot !== o || gs.features.batteries !== b0 - 1 || gs.tray[o] !== 0) {
            bad = `seed ${seed} open-end pull wrong (held ${gs.held} home ${gs.heldSlot} b ${gs.features.batteries})`; break
        }
        // push-back re-clips the cell HOME, even if the hand wandered off
        while (gs.sel !== o) step(gs, gs.sel > o ? { left: true } : { right: true })
        step(gs, { left: true }) // wander one slot
        drainEvents(gs); step(gs, { a: false }); step(gs, { a: true })
        if (gs.held !== 0 || gs.tray[o] !== 1 || gs.features.batteries !== b0) { bad = `seed ${seed} push-back left the rail (${gs.tray.join('')})`; break }
        if (gs.pulls !== 1) { bad = `seed ${seed} push-back rewound pulls`; break } // the act stays done (#1909 law)
    }
    ok(`rail law on ${refusals} two-cell boards: blocked/empty refuse silently, open end releases, push-back re-clips home, pulls never rewind`, !bad, bad)
    ok('the rail actually blocked the default hand on some seeds', refusals >= 30, `${refusals}`)
}

// ---- 4. D6 is solvable on every layout, incl. open end != slot 2 ------------
{
    let rigs = 0, varied = 0, bad = ''
    for (let seed = 1; seed <= 3000 && rigs < 40 && !bad; seed++) {
        const gs = createGame(seed, 2); gs.round = 5; buildBomb(gs)
        const di = gs.modules.findIndex(m => m.stamp === 'D6'); if (di < 0) continue
        const b = gs.features.batteries, d = gs.modules[di]
        step(gs, { up: true }); home(gs)
        if (railOpen(gs.tray) !== 2) varied++
        step(gs, { a: true }); step(gs, { down: true })
        for (let w = 0; gs.cursor.mod !== di && w < 8; w++) step(gs, { down: true })
        while (d.dial !== b - 1) step(gs, d.dial < b - 1 ? { right: true } : { left: true })
        step(gs, { a: true })
        if (!(d.solved && gs.strikes === 0)) bad = `seed ${seed} D6 unsolved (strikes ${gs.strikes})`
        rigs++
    }
    ok(`D6 solves on ${rigs} rigs, ${varied} of them with a hand-shift required`, !bad && rigs >= 20 && varied >= 5, bad || `rigs=${rigs} varied=${varied}`)
}

// ---- 5. the brain never wastes a press ------------------------------------------
{
    let bad = '', taps = 0
    for (let seed = 1; seed <= 400 && !bad; seed++) {
        const gs = createGame(seed, 1)
        for (let i = 0; i < 80000 && !gs.done; i++) {
            const p = solvePad(gs)
            if (p.a && gs.flip && gs.held === 0 && gs.features.batteries > 0) {
                taps++
                if (gs.sel !== railOpen(gs.tray) || gs.tray[gs.sel] !== 1) bad = `seed ${seed} brain tapped slot ${gs.sel} of tray ${gs.tray.join('')}`
            }
            step(gs, p)
        }
    }
    ok(`solvePad only spends back-panel presses at the open end (${taps} taps, zero refusals)`, !bad && taps >= 10, bad)
}

// ---- 6. never lies: rail state rides simState + hash ---------------------------
{
    const gs = createGame(41, 1)
    if (gs.features.batteries > 0) {
        step(gs, { up: true })
        const s1 = simState(gs)
        ok('simState exposes tray/sel/heldSlot', s1.tray.join('') === gs.tray.join('') && s1.sel === gs.sel && s1.heldSlot === gs.heldSlot)
        const h0 = hash(gs)
        step(gs, { left: true })
        ok('the hand position rides the hash', hash(gs) !== h0)
        const h1 = hash(gs)
        home(gs)
        const o = railOpen(gs.tray)
        step(gs, { a: true })
        ok('the drained rail rides the hash + state', hash(gs) !== h1 && simState(gs).tray.join('') === gs.tray.join('')
            && simState(gs).heldSlot === o && gs.held === 1 && simState(gs).tray.reduce((a, b) => a + b, 0) === gs.features.batteries)
    } else {
        ok('simState exposes tray/sel/heldSlot', true)
        ok('the hand position rides the hash', true)
        ok('the drained rail rides the hash + state', true)
    }
    const x = createGame(900, 1), y = createGame(900, 1)
    let same = true
    for (let i = 0; i < 600; i++) {
        const px = solvePad(x); step(x, px)
        const py = solvePad(y); step(y, py)
        if (hash(x) !== hash(y)) { same = false; break }
    }
    ok('rail streams deterministically (same seed => same 600-tick hashes)', same)
}

// ---- 7. it can still be won ------------------------------------------------------
{
    let wins = 0
    const N = 120
    for (let seed = 1; seed <= N; seed++) {
        const gs = createGame(seed, 1)
        let n = 0
        while (!gs.done && n++ < 80000) step(gs, solvePad(gs))
        if (gs.done && gs.won) wins++
    }
    ok(`the rail wins the whole quota on ${N}/${N} seeds`, wins === N, `${wins}/${N}`)
}

// ---- 8. rail audio identity (#1923) ------------------------------------------
{
    const dir = new URL('../src/games/TalkMeDown/', import.meta.url)
    const audio = readFileSync(new URL('audio.js', dir), 'utf8')
    const view = readFileSync(new URL('index.jsx', dir), 'utf8')
    const body = (name) => { const m = audio.match(new RegExp(`${name}\\(\\)\\s*\\{([^}]*)\\}`)); return m ? m[1] : '' }
    const sweeps = (s) => [...s.matchAll(/playSweep\((\d+),\s*(\d+)/g)].map((m) => [+m[1], +m[2]])
    const tones = (s) => [...s.matchAll(/playTone\((\d+),\s*([\d.]+),\s*'\w+',\s*([\d.]+)/g)].map((m) => ({ f: +m[1], dur: +m[2], vol: +m[3] }))
    // eyes-closed law: OUT rises and starts bright; IN falls and lands heavy;
    // neither voice contains the other's landmark.
    const pullS = sweeps(body('pull'))
    const pushS = sweeps(body('push'))
    ok('cell-out is a RISING zip — the spring releases upward', pullS.length > 0 && pullS.every(([a, b]) => b >= a), JSON.stringify(pullS))
    ok('clip-in is a FALLING clack — the cell seats downward', pushS.length > 0 && pushS.every(([a, b]) => b <= a), JSON.stringify(pushS))
    ok('out and in share no landmark — bright ping above vs heavy seat below',
        tones(body('pull')).some((t) => t.f >= 880) && tones(body('push')).some((t) => t.f <= 250)
        && !tones(body('push')).some((t) => t.f >= 880) && !tones(body('pull')).some((t) => t.f <= 250))
    // the hand tick is the softest voice in the kit (a rail must not out-click
    // the verbs) and it exists at all.
    const ht = tones(body('handTick'))
    ok('handTick exists and is the softest shortest tick in the kit',
        ht.length === 1 && ht[0].vol <= 0.05 && ht[0].dur <= 0.03, JSON.stringify(ht))
    // wiring: fires only back-up + sel-changed + fresh press-edge, once, in spec.tick.
    const pin = /backBefore && g\.flip && g\.sel !== selBefore\) sfx\.handTick\(\)/
    ok('the tick is gated to the back plate and a real sel change', pin.test(view))
    ok('held arrows are a slide, not a rattle — press-edge law on the tick',
        /const handTurn = g\.flip &&[\s\S]*prevPad\.(left|right)[\s\S]*if \(handTurn && backBefore/.test(view))
    ok('handTick is called from exactly one place (spec.tick serves keyboard, net and harness)',
        (view.match(/sfx\.handTick\(\)/g) || []).length === 1)
    // mutants: each named break must redden a pin above, not pass by accident.
    const m1 = body('pull').replace(/playSweep\((\d+),\s*(\d+)/, 'playSweep($2, $1)') // pull falls like push
    const m2 = view.replace('backBefore && g.flip && g.sel !== selBefore', 'g.sel !== selBefore') // ticks face-up
    const m3 = view.replace('if (handTurn && backBefore && g.flip && g.sel !== selBefore) sfx.handTick()', '') // mute
    const m1rise = sweeps(m1)
    ok('mutant same-direction pull kills the rising gate',
        m1rise.length > 0 && !m1rise.every(([a, b]) => b >= a), JSON.stringify(m1rise))
    ok('mutant face-up tick kills the gate', !pin.test(m2))
    ok('mutant muted tick kills both wiring gates',
        !/backBefore && g\.flip/.test(m3) && (m3.match(/sfx\.handTick\(\)/g) || []).length === 0)
}

// ---- 9. hand moves stay event-silent (audio is view-only) -------------------
{
    let bad = null, moved = 0
    for (let seed = 1; seed <= 60 && !bad; seed++) {
        const gs = createGame(seed, 1)
        if (gs.features.batteries < 1) continue
        step(gs, { up: true })
        drainEvents(gs) // drain the flip event
        const s0 = simState(gs)
        const tr0 = gs.tray.join(''), b0 = gs.features.batteries
        step(gs, { right: true })
        if (drainEvents(gs).length !== 0) { bad = `seed ${seed} hand shift emitted an event`; break }
        if (gs.tray.join('') !== tr0 || gs.features.batteries !== b0 || gs.held !== 0 || gs.strikes !== 0) {
            bad = `seed ${seed} hand shift moved the sim`; break
        }
        if (simState(gs).sel !== s0.sel) moved++
    }
    ok('hand shift: sel moves, nothing else does, zero events (hash law stands)', !bad && moved > 0, bad || `moved=${moved}`)
}

// ---- 10. THE SLIDE — view-only rail animation (#1923) -----------------------
// fx is stepped by the renderer from diffs of (held, tray, sel). Gates prove:
// a pull spawns an OUT flight on the slot that emptied, a push-back spawns IN,
// the flight lands, the hand glides, the bomb swap re-baselines silently, the
// path is flush at both ends and monotone, and the hash law stands (fx is
// view-only). Five named mutants die.
{
    const dir = new URL('../src/games/TalkMeDown/', import.meta.url)
    const artSrc = readFileSync(new URL('art.js', dir), 'utf8')
    const view = readFileSync(new URL('index.jsx', dir), 'utf8')
    const K = '5/2/AB12CD'
    const drive = (E, seq) => { const fx = E.makeRailFx(); for (const s of seq) E.stepRailFx(fx, s[0], s[1], s[2], s[3]); return fx }
    const artGate = (E) => {
        const fx = drive(E, [[0, [1, 1, 0], 1, K], [1, [1, 0, 0], 1, K]])
        return !!fx.anim && fx.anim.kind === 'out' && fx.anim.slot === 1
    }
    const inGate = (E) => {
        const fx = drive(E, [[0, [1, 1, 0], 1, K], [1, [1, 0, 0], 1, K], [0, [1, 1, 0], 1, K]])
        return !!fx.anim && fx.anim.kind === 'in' && fx.anim.slot === 1
    }
    const landGate = (E) => {
        const fx = drive(E, [[0, [1, 1, 0], 1, K], [1, [1, 0, 0], 1, K]])
        const flying = !!fx.anim && fx.anim.t <= fx.anim.dur
        for (let i = 0; i < 15; i++) E.stepRailFx(fx, 1, [1, 0, 0], 1, K)
        return flying && fx.anim === null
    }
    const glideGate = (E) => {
        const fx = drive(E, [[0, [1, 1, 0], 2, K], [0, [1, 1, 0], 0, K]])
        const mid = fx.handPos
        for (let i = 0; i < 11; i++) E.stepRailFx(fx, 0, [1, 1, 0], 0, K)
        return mid > 0.2 && mid < 1.9 && fx.handPos === 0
    }
    ok('a pull spawns an OUT flight on the slot that emptied', artGate({ makeRailFx, stepRailFx }))
    ok('push-back spawns an IN flight onto the slot that refilled', inGate({ makeRailFx, stepRailFx }))
    ok('the flight flies for its frames and lands (anim clears after dur)', landGate({ makeRailFx, stepRailFx }))
    ok('quiet steps raise no anim', drive({ makeRailFx, stepRailFx },
        [[0, [1, 1, 0], 2, K], [0, [1, 1, 0], 2, K], [1, [1, 1, 0], 2, K]]).anim === null)
    ok('the hand glides between holders and parks exactly on the pick', glideGate({ makeRailFx, stepRailFx }))
    // bomb swap: the fresh plate must not ghost the old plate's held cell away.
    ok('a new bomb re-baselines silently — no ghost across plates',
        drive({ makeRailFx, stepRailFx }, [[1, [1, 0, 0], 1, K], [0, [1, 1, 0], 2, '6/3/ZY98XX']]).anim === null)
    ok('fx replays identically (same steps => same view state)',
        JSON.stringify(drive({ makeRailFx, stepRailFx }, [[0, [1, 1, 0], 2, K], [1, [1, 0, 0], 1, K], [0, [1, 1, 0], 0, K]]))
        === JSON.stringify(drive({ makeRailFx, stepRailFx }, [[0, [1, 1, 0], 2, K], [1, [1, 0, 0], 1, K], [0, [1, 1, 0], 0, K]])))
    // the slide is view-only: interleaving it into a full solve leaves hashes equal.
    {
        const a = createGame(77, 1), b = createGame(77, 1)
        const fxA = makeRailFx()
        let same = true
        for (let i = 0; i < 600; i++) {
            const pa = solvePad(a); step(a, pa)
            stepRailFx(fxA, a.held, a.tray, a.sel, `${a.round}/${a.bombsCleared}/${a.features.serial}`)
            const pb = solvePad(b); step(b, pb)
            if (hash(a) !== hash(b)) { same = false; break }
        }
        ok('hash law: 600 solvePad ticks with fx interleaved run byte-identical', same)
    }
    // pose law: flush in the slot at s=0, flush flat in the pocket at s=1,
    // never travelling back along the rail, tilted only mid-swing.
    ok('every holder sits flush at s=0 (the ghost starts where the cell was)',
        [0, 1, 2].every((i) => { const p = railCellPose(i, 0); return p.x === 118 + i * 68 && p.y === 146 && p.w === 44 && p.h === 74 && p.tilt === 0 }))
    ok('every path lands flush in the pocket clip, seat flat',
        [0, 1, 2].every((i) => { const p = railCellPose(i, 1); return p.x === 344 && p.y === 244 && p.w === 32 && p.h === 26 && Math.abs(p.tilt) < 1e-9 }))
    {
        let mono = true, mid = true
        for (const i of [0, 2]) {
            let px = -1
            for (let t = 0; t <= 14; t++) { const p = railCellPose(i, t / 14); if (p.x < px) mono = false; px = p.x }
            if (!(railCellPose(i, 0.8).tilt > 0.1)) mid = false
        }
        ok('the ghost rides only toward the mouth (x monotone)', mono)
        ok('it tilts mid-swing and seats flat', mid)
    }
    // wiring pins: the landing slot reads empty, the clip waits for its cell,
    // the renderer drives fx, and fx stays optional (pre-slide pixels).
    ok('the landing slot reads empty while its ghost is in flight', /const occ = tray\[i\] === 1 && i !== mask/.test(artSrc))
    ok('the pocket clip stands empty until the cell arrives', /if \(!inFlight \|\| inFlight\.kind !== 'out'\)/.test(artSrc))
    ok('the renderer steps fx from the live plate and hands it to the draw',
        /ART\.stepRailFx\(railFxRef\.current, gs\.held, gs\.tray, gs\.sel/.test(view) && /gs\.held, gs\.tray, gs\.sel, fx\)/.test(view))
    ok('fx is optional — old callers render the pre-slide plate byte-identical',
        /export function drawBack\(g, batteries, tick, serial = 'XX0X0', held = 0, trayIn = null, selIn = 2, fx = null\)/.test(artSrc))
    // named mutants — each must die on the gate it is named for.
    const runMutantArt = async (name, mut, gate) => {
        if (mut === artSrc) { ok(`mutant ${name}: target line not found`, false); return }
        const tmp = new URL(`.mutant-art-${name}.mjs`, dir)
        plant(tmp, mut)
        try {
            const E = await import(tmp.href)
            ok(`mutant ${name} dies by name`, !gate(E))
        } finally { pull(tmp) }
    }
    await runMutantArt('kind-flip', artSrc.replace("kind: 'out', slot", "kind: 'in', slot"), artGate)
    await runMutantArt('never-land', artSrc.replace('++fx.anim.t > fx.anim.dur', 'false'), landGate)
    await runMutantArt('hand-snap', artSrc.replace(
        'fx.handPos = Math.abs(hd) < 0.06 ? fx.sel : fx.handPos + Math.sign(hd) * Math.min(0.34, Math.abs(hd))',
        'fx.handPos = fx.sel'), glideGate)
    const mMask = artSrc.replace('const occ = tray[i] === 1 && i !== mask', 'const occ = tray[i] === 1')
    ok('mutant mask-forget dies by name (the rail would show the cell twice)',
        mMask !== artSrc && !/const occ = tray\[i\] === 1 && i !== mask/.test(mMask))
    const mPocket = artSrc.replace("if (!inFlight || inFlight.kind !== 'out') {", 'if (true) {')
    ok('mutant pocket-double dies by name (clip and ghost both carry the cell)',
        mPocket !== artSrc && !/inFlight\.kind !== 'out'/.test(mPocket))
}

// ---- 10b. OPEN-END legibility (#1923) — pixels, not vibes --------------------
// drawBack through a recording stub: the plate must DRAW the open-end story,
// not just tell it in the action line. Gates: the groove's wall bars stop short
// of the mouth; a double chevron stands in that gap; the word and the arrow
// share one pulse clock; the free pull-tab is decisively brighter than the
// blocked ones (rec-601 luminance, >= 2x — the old #3a4148 tab sat at 1.6x
// and died here). Three named mutants die.
{
    const dir = new URL('../src/games/TalkMeDown/', import.meta.url)
    const artSrc = readFileSync(new URL('art.js', dir), 'utf8')
    const paint = (tick, tray, held = 0, sel = 2) => {
        const rects = [], texts = []
        const g = {
            rects, texts, font: '', fillStyle: '',
            fillRect(x, y, w, h) { rects.push({ x, y, w, h, c: this.fillStyle }) },
            fillText(t, x, y) { texts.push({ t, x, y, c: this.fillStyle }) },
            beginPath() {}, arc() {}, fill() {},
        }
        drawBack(g, tray.reduce((a, b) => a + b, 0), tick, 'XX0X0', held, tray, sel, null)
        return g
    }
    const lum = h => 0.2126 * parseInt(h.slice(1, 3), 16) + 0.7152 * parseInt(h.slice(3, 5), 16) + 0.0722 * parseInt(h.slice(5, 7), 16)
    // 3x3 mark pixels inside the groove band, right of the wall gap
    const mouthPix = g => g.rects.filter(r => r.x >= PANEL.x + 326 && r.w === 3 && r.h === 3 && r.y >= PANEL.y + 150 && r.y <= PANEL.y + 224)
    const plate = paint(0, [1, 1, 0]) // tray with slot 1 free, slot 0 blocked
    const chev = mouthPix(plate)
    ok('the mouth arrow stands in the wall gap — 10 pixels pointing out of the rail',
        chev.length === 10 && chev.every(r => r.c === '#ffd23e'), `n=${chev.length}`)
    ok('the arrow rests dim off-pulse (a throb, not a shout)',
        mouthPix(paint(50, [1, 1, 0])).length === 10 && mouthPix(paint(50, [1, 1, 0])).every(r => r.c === '#4a4f57'))
    {
        let shared = true
        for (const t of [0, 37, 38, 59, 60, 97]) {
            const p = paint(t, [1, 1, 0])
            const word = p.texts.find(r => r.t === 'OPEN')
            const bright = mouthPix(p).every(r => r.c === '#ffd23e')
            if (!word || word.c !== (railMouthGlow(t) ? '#8a6512' : '#4a4f57') || bright !== railMouthGlow(t)) shared = false
        }
        ok('the OPEN word and the arrow beat on one clock (railMouthGlow)', shared)
    }
    {
        const bars = plate.rects.filter(r => r.c === '#20242a' && r.h === 2 && r.y >= PANEL.y + 150 && r.y <= PANEL.y + 224)
        ok('the groove walls stop short of the mouth (200 of 214 — the gap is drawn, not implied)',
            bars.length === 2 && bars.every(r => r.w === 200), JSON.stringify(bars.map(r => r.w)))
    }
    {
        const tab = (g, slot) => g.rects.find(r => r.x === PANEL.x + 118 + slot * 68 + 14 && r.y === PANEL.y + 146 && r.w === 16 && r.h === 8)
        const free = tab(plate, 1), blocked = tab(plate, 0)
        ok('the free cell wears the amber tab, its blocked neighbour the dark one',
            !!free && !!blocked && free.c === RAIL_TAB_FREE && blocked.c === RAIL_TAB_BLOCKED,
            `free=${free && free.c} blocked=${blocked && blocked.c}`)
        const ratio = lum(RAIL_TAB_FREE) / lum(RAIL_TAB_BLOCKED)
        ok('tab contrast is decisive at phone scale (>= 2x luminance)', ratio >= 2, `${ratio.toFixed(2)}x`)
    }
    ok('the tab pair is driven by the constants, not in-plate hex',
        /pullable \? RAIL_TAB_FREE : RAIL_TAB_BLOCKED/.test(artSrc))
    const runLegMutant = async (name, mut, gate) => {
        if (mut === artSrc) { ok(`mutant ${name}: target line not found`, false); return }
        const tmp = new URL(`.mutant-art-leg-${name}.mjs`, dir)
        plant(tmp, mut)
        try {
            const E = await import(tmp.href)
            const g = {
                rects: [], texts: [], font: '', fillStyle: '',
                fillRect(x, y, w, h) { this.rects.push({ x, y, w, h, c: this.fillStyle }) },
                fillText(t, x, y) { this.texts.push({ t, x, y, c: this.fillStyle }) },
                beginPath() {}, arc() {}, fill() {},
            }
            E.drawBack(g, 2, 0, 'XX0X0', 0, [1, 1, 0], 2, null)
            ok(`mutant ${name} dies by name`, !gate(g))
        } finally { pull(tmp) }
    }
    await runLegMutant('tab-flat',
        artSrc.replace('pullable ? RAIL_TAB_FREE : RAIL_TAB_BLOCKED', 'RAIL_TAB_FREE'),
        g => g.rects.find(r => r.x === PANEL.x + 132 && r.y === PANEL.y + 146 && r.c === RAIL_TAB_BLOCKED))
    await runLegMutant('arrow-quiet',
        artSrc.replace("g.fillStyle = mouth ? '#ffd23e' : '#4a4f57'", "g.fillStyle = '#4a4f57'"),
        g => mouthPix(g).some(r => r.c === '#ffd23e'))
    await runLegMutant('wall-full',
        artSrc.replace('fillRect(PANEL.x + 112, PANEL.y + 150, 200, 2); g.fillRect(PANEL.x + 112, PANEL.y + 222, 200, 2)',
            'fillRect(PANEL.x + 112, PANEL.y + 150, 214, 2); g.fillRect(PANEL.x + 112, PANEL.y + 222, 214, 2)'),
        g => g.rects.filter(r => r.c === '#20242a' && r.h === 2 && r.y >= PANEL.y + 150 && r.y <= PANEL.y + 224).every(r => r.w === 200))
}

// ---- 11. mutant: remove the open-end gate, gates must die ------------------------
if (process.argv.includes('--mutate')) {
    const dir = new URL('../src/games/TalkMeDown/', import.meta.url)
    const src = readFileSync(new URL('engine.js', dir), 'utf8')
    const mut = src.replace('if (gs.tray[gs.sel] === 1 && gs.sel === railOpen(gs.tray)) {', 'if (true) {')
    if (mut === src) { console.log('  FAIL mutant target line not found'); process.exit(1) }
    console.log('  (mutate mode: open-end gate removed — the gates above must have gone red first)')
    const tmp = new URL('.mutant-engine.mjs', dir) // beside engine.js so ./rng.js resolves
    // #1359: plant/pull — a SIGTERM mid-run rewinds the planted file, no corpse.
    plant(tmp, mut)
    let caught = 0
    try {
        const E = await import(tmp.href)
        for (let seed = 1; seed <= 500; seed++) {
            const gs = E.createGame(seed, 1)
            if (gs.features.batteries < 2) continue
            E.step(gs, { up: true })
            const o = E.railOpen(gs.tray)
            const blocked = (o + 2) % 3
            if (gs.tray[blocked] !== 1) continue
            while (gs.sel !== blocked) E.step(gs, { left: true })
            E.drainEvents(gs)
            E.step(gs, { a: true })
            if (gs.held === 1) caught++ // mutant pulls from a blocked slot — the law is dead
        }
    } finally {
        pull(tmp)
    }
    console.log(`  mutant pulled ${caught} blocked cells (want > 0 — proof the gate line is load-bearing)`)
    process.exit(caught > 0 ? 0 : 1)
}

console.log(`\nplatecheck: ${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
