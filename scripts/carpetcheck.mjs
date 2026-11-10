// carpetcheck.mjs — MAGIC CARPET proof: boots, rules hold, nine worlds reach equilibrium.
//
// Node-first (sim is pure), then a short real-browser pass via the game contract.
// Run: npm run dev in another terminal, then `npm run carpetcheck`.
//
// Mutation guide (prove it can fail): change the win check `gs.bank >= gs.quota`
// to `gs.bank >= gs.quota * 100` in src/games/MagicCarpet/sim.js and watch
// 'equilibrium' go red; restore.

import { readFile } from 'node:fs/promises'
import { launch, openGame, requireDevServer, Report } from './lib/harness.mjs'
import {
    LEVELS, QUOTA, SPILLS, BOUNTY, MAP, spellById, sampleH,
    makeGame, step, autopilot, stateHash, CRATER_GLOW, glowOf, toppleTower, settleGround, CRUMBLE_T,
    setHand, INVIS_T, hudTap, cycleL, TAP, TRAY, W, H, HUD_H,
    muffleOf, OPEN_CUTOFF, MUFFLE_CUTOFF, volcanoErupt, raiseTerrain, shatterAt, SHATTER_R, WATER, crater, diveOf,
    DISSOLVE_R, DISSOLVE_SINK, dissolveLand, GRID, CELL,
    crumbleFeel, CRUMBLE_HEAR_R, castBearing, CUE_LOUD_R, CUE_HEAR_R, CUE_FLOOR,
    cloneAt, CLONE_R, CLONE_MAX, SPAWN_HP, lookPoint, genWorld,
    atCastle, bookOpen, bookClose, bookKey, bookTap, BOOK, BOOK_PROMPT, CFG,
    SEL, selectTap, cursorStep,
    scareVillagers, VIL_PANIC_R, VIL_FLAME_R, VIL_WANDER_R,
    VIL_GRAB_R, VIL_GRAB_ALT, VIL_TRIBUTE_T, VIL_TRIBUTE_M,
    FOG_NEAR, FOG_D, HAZE, hazeOf, airOf, aerialFog,
    DIVE_DRAG, DIVE_NOFIRE,
} from '../src/games/MagicCarpet/sim.js'
import { WAVE_CYCLE } from '../src/games/MagicCarpet/renderer.js' // #1764 item 4 stage 4: the wave law's clock constant, for the JS twin

const wrap = (v, m) => ((v % m) + m) % m
const wrapD = (v) => wrap(v + MAP / 2, MAP) - MAP / 2

const r = new Report('carpetcheck')
const run = (seed, maxTicks, scriptFn = autopilot) => {
    const gs = makeGame(seed)
    let i = 0
    while (!gs.end && i < maxTicks) { step(gs, scriptFn(gs)); i++ }
    return gs
}

// ---- boot
const fresh = makeGame(7)
r.check('world 1 built: 56 pearls, wizard hoards 80, 12 books, one known spell, empty vault',
    fresh.pearls.length === 56 && fresh.wizard.mana === LEVELS[0].hoard && fresh.books.length === 12 &&
    fresh.learned.length === 1 && fresh.bank === 0 && fresh.level === 0,
    `pearls=${fresh.pearls.length} hoard=${fresh.wizard.mana} books=${fresh.books.length} bank=${fresh.bank}`)
const g0 = run(7, 600, () => ({}))
r.check('boots and steps 600 ticks idle', g0.tick === 600 && !g0.end, `tick=${g0.tick}`)

// ---- determinism
const d1 = run(7, 600), d2 = run(7, 600), d3 = run(8, 600)
r.check('seed 7 twice → identical hash', stateHash(d1) === stateHash(d2), `${stateHash(d1)} vs ${stateHash(d2)}`)
r.check('seed 8 → different hash', stateHash(d1) !== stateHash(d3))

// ---- nine worlds: level progression and equilibrium (#1740)
{
    const gs = run(7, 300000)
    r.check('nine worlds: seed 7 clears I→IX and wins at the final quota',
        gs.end === 'win' && gs.level === LEVELS.length - 1 && gs.levelClears === LEVELS.length - 1 && gs.bank >= gs.quota,
        `end=${gs.end} level=${gs.level + 1} bank=${Math.floor(gs.bank)}/${gs.quota} tick=${gs.tick}`)
    r.check('banked vault (not carried mana) is what reaches the quota', gs.bank >= QUOTA, `bank=${Math.floor(gs.bank)} quota=${QUOTA}`)
    const gs2 = run(88, 300000)
    r.check('seed 88 also restores all nine worlds', gs2.end === 'win' && gs2.level === LEVELS.length - 1, `end=${gs2.end} level=${gs2.level + 1}`)
}

// ---- #1740 WORLDS: the campaign table, the economy floor and the select math
{
    r.check('nine named worlds, quotas/hoards/HP/pearls strictly escalate',
        LEVELS.length === 9 && new Set(LEVELS.map((l) => l.name)).size === 9 &&
        LEVELS.every((l, i) => i === 0 || (l.quota > LEVELS[i - 1].quota && l.hoard > LEVELS[i - 1].hoard &&
            l.wizHp > LEVELS[i - 1].wizHp && l.pearls >= LEVELS[i - 1].pearls)),
        LEVELS.map((l) => `${l.name}:${l.quota}`).join(' '))
    r.check('supply floor: worst-case pearls (every one at the minimum m) + the wizard hoard already beat each quota',
        LEVELS.every((l) => l.pearls * 2 + l.hoard >= l.quota),
        LEVELS.map((l) => `${l.pearls * 2 + l.hoard}/${l.quota}`).join(' '))
    r.check('QUOTA exports the final world (the win condition is the ninth vault)',
        QUOTA === LEVELS[LEVELS.length - 1].quota, `QUOTA=${QUOTA}`)
    r.check('makeGame pins every level, clamps out-of-range, and pins are deterministic',
        LEVELS.every((l, n) => makeGame(7, n).level === n &&
            stateHash(makeGame(7, n)) === stateHash(makeGame(7, n))) &&
        makeGame(7, 99).level === LEVELS.length - 1 && makeGame(7, -5).level === 0 &&
        stateHash(makeGame(7, 0)) !== stateHash(makeGame(7, 1)))
    {
        const gs = makeGame(3)
        const seen = []
        let i = 0
        while (!gs.end && i < 300000) {
            step(gs, autopilot(gs))
            for (const e of gs.events) if (e.type === 'level') seen.push(e.name)
            gs.events.length = 0
            i++
        }
        r.check('a live campaign visits every world by name in order',
            gs.end === 'win' && seen.join('|') === LEVELS.slice(1).map((l) => l.name).join('|'),
            seen.join(' > ') || `end=${gs.end}`)
    }
    r.check('title select geometry: thumb-sized zones that never overlap and never fire between the arrows',
        SEL.zw >= 44 && SEL.h >= 44 && SEL.zw * 2 < W &&
        selectTap(2, SEL.y + 1) === 'prev' && selectTap(SEL.zw - 1, SEL.y + SEL.h - 1) === 'prev' &&
        selectTap(W - 2, SEL.y + SEL.h - 1) === 'next' && selectTap(W - SEL.zw + 1, SEL.y + 1) === 'next' &&
        selectTap(W / 2, SEL.y + SEL.h / 2) === null && selectTap(2, SEL.y - 1) === null && selectTap(W - 2, SEL.y + SEL.h + 1) === null)
    r.check('the cursor cycles nine worlds both directions (never leaves the table)',
        cursorStep(0, -1) === LEVELS.length - 1 && cursorStep(LEVELS.length - 1, 1) === 0 &&
        cursorStep(4, -9) === 4 && cursorStep(4, 9) === 4 && cursorStep(4, 2) === 6)
    {
        const src = await readFile(new URL('../src/games/MagicCarpet/renderer.js', import.meta.url), 'utf8')
        r.check('the renderer CYCLES its three atmospheres over nine worlds (no clamp to the third)',
            src.includes('PAL[level % PAL.length]') && !src.includes('PAL[Math.min(level'),
            'source pin')
    }
    {
        const src = await readFile(new URL('../src/games/MagicCarpet/renderer.js', import.meta.url), 'utf8')
        r.check('#1764 item 4: the ocean is a HARD 4-level band whose palette index marches with world time (4-bit cycle, no smooth band interpolation)',
            /export const WAVE_CYCLE = \{ levels: 4, stepTicks: 6 \}/.test(src)
            && src.includes('clamp(floor(bpos), 0.0, ${WAVE_CYCLE.levels - 1}.0)')
            && src.includes('mod(lvl + floor(uWorldTime / ${WAVE_CYCLE.stepTicks}.0), ${WAVE_CYCLE.levels}.0)')
            && !src.includes('smoothstep(0.3, 0.7, fract(bpos))'),
            'source pin')
    }
    {
        // #1764 item 4 stage 4 — TRAVELLING CRESTS. Stage 1 left the wave
        // shapes still while the colours walked; the sea must MOVE. The bpos
        // noise field advects with uWorldTime at WAVE_TRAVEL noise-units per
        // sim tick. Proven here with a JS twin of NOISE_GLSL + the bpos law:
        // (a) export sane (diagonal NE drift, crest speed a walk-pace, same
        // family as the sparkle field's 0.02/0.014 on scale 0.55),
        // (b) source pin (advected sample, static field banned),
        // (c) churn (band edges cross fixed points — a static field churns 0),
        // (d) rigid travel (the whole field is a pure translation of t=0),
        // (e) purity (the law is presentation-only — sim.js never mentions it).
        const WT = (await import('../src/games/MagicCarpet/renderer.js')).WAVE_TRAVEL
        const src = await readFile(new URL('../src/games/MagicCarpet/renderer.js', import.meta.url), 'utf8')
        const simS = await readFile(new URL('../src/games/MagicCarpet/sim.js', import.meta.url), 'utf8')
        r.check('#1764 item 4 stage 4: WAVE_TRAVEL exports a sane diagonal drift (NE, unequal axes, crest speed 1–4 u/s)',
            WT && Number.isFinite(WT.x) && Number.isFinite(WT.y) &&
            WT.x > 0 && WT.y > 0 && WT.x !== WT.y &&
            WT.x / WT.y >= 1.2 && WT.x / WT.y <= 1.45 &&
            60 * WT.x / 0.7 >= 1 && 60 * WT.x / 0.7 <= 4 &&
            60 * WT.y / 0.7 >= 1 && 60 * WT.y / 0.7 <= 4,
            JSON.stringify(WT))
        r.check('#1764 item 4 stage 4: the bpos wave field samples an advected noise coordinate (uWorldTime · WAVE_TRAVEL) and the static field is banned',
            src.includes('fbm2(vWorld.xz * 0.7 + uWorldTime * vec2(${WAVE_TRAVEL.x}, ${WAVE_TRAVEL.y}) + 3.3)')
            && !src.includes('fbm2(vWorld.xz * 0.7 + 3.3)'),
            'source pin')
        const fract = (v) => v - Math.floor(v)
        const hash21 = (x, y) => {
            const px = fract(x * 234.34), py = fract(y * 435.345)
            const d = px * (px + 34.23) + py * (py + 34.23)
            return fract((px + d) * (py + d))
        }
        const vnoise = (x, y) => {
            const ix = Math.floor(x), iy = Math.floor(y)
            let fx = fract(x), fy = fract(y)
            fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy)
            const a = hash21(ix, iy), b = hash21(ix + 1, iy), c = hash21(ix, iy + 1), d = hash21(ix + 1, iy + 1)
            return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy
        }
        const fbm2 = (x, y) => vnoise(x, y) * 0.6 + vnoise(x * 2.7 + 13.1, y * 2.7 + 13.1) * 0.4
        const bposT = (x, z, depth, t) =>
            depth * 0.28 + fbm2(x * 0.7 + WT.x * t + 3.3, z * 0.7 + WT.y * t + 3.3) * 0.45
        const lvlT = (v) => Math.min(Math.max(Math.floor(v), 0), WAVE_CYCLE.levels - 1)
        const pts = []
        for (let i = 0; i < 12; i++) pts.push([(i * 137 + 21) % 512, (i * 89 + 63) % 512])
        let churnMin = Infinity
        for (const [x, z] of pts) {
            let prev = lvlT(bposT(x, z, 3, 0)), ch = 0
            for (let t = 1; t <= 3600; t++) {
                const l = lvlT(bposT(x, z, 3, t))
                if (l !== prev) { ch++; prev = l }
            }
            if (ch < churnMin) churnMin = ch
        }
        r.check('#1764 item 4 stage 4: band edges CHURN the sea — every fixed watch point changes crest level over one minute (static shapes churn 0)',
            churnMin >= 8, `min churn over 12 points/3600 ticks = ${churnMin}`)
        let maxShiftErr = 0
        for (const [x, z] of pts) {
            for (const t of [600, 1800, 3600]) {
                const e = Math.abs(bposT(x, z, 3, t) -
                    bposT(x + (WT.x / 0.7) * t, z + (WT.y / 0.7) * t, 3, 0))
                if (e > maxShiftErr) maxShiftErr = e
            }
        }
        r.check('#1764 item 4 stage 4: the drift is rigid travel, not swirl — the bpos field at tick t is the t=0 field translated by WAVE_TRAVEL/0.7 world-u per tick',
            maxShiftErr < 1e-9, `max |Δbpos| = ${maxShiftErr.toExponential(2)}`)
        r.check('#1764 item 4 stage 4: presentation-only law — sim.js never mentions WAVE_TRAVEL (stateHash and the seed stream untouched)',
            !simS.includes('WAVE_TRAVEL'),
            'source pin')
    }
    {
        const simS = await readFile(new URL('../src/games/MagicCarpet/sim.js', import.meta.url), 'utf8')
        const renS = await readFile(new URL('../src/games/MagicCarpet/renderer.js', import.meta.url), 'utf8')
        r.check('#1764 item 4 stage 2: diveable sea floor in sim.js (dry law intact, old blanket floor banned) and the underwater mix in the composite',
            simS.includes('gH < WATER ? gH + 1.6 : Math.max(WATER + 3, gH + 1.6)')
            && !simS.includes('Math.max(WATER + 3, sampleH(gs, gs.x, gs.y) + 1.6)')
            && simS.includes('export const diveOf = (gs) => Math.max(0, WATER - gs.alt)')
            && renS.includes('(WATER - gs.alt) / 6')
            && renS.includes('uniform float uBloomAmt, uSub, uWorldTime')
            && renS.includes('subUniform'),
            'source pin')
    }
    {
        const src = await readFile(new URL('../src/games/MagicCarpet/index.jsx', import.meta.url), 'utf8')
        r.check('attract arrows move the cursor and any other start launches AT it (both key and pointer paths)',
            (src.match(/startPlay\(selCur\)/g) || []).length === 2 &&
            src.includes('cursorStep(selCur, -1)') && src.includes('cursorStep(selCur, 1)') &&
            src.includes('selectTap(') && src.includes('paintSelect()'),
            'source pin')
    }
}

// ---- carrying an over-quota load does NOT win; only delivery does
{
    const gs = makeGame(7)
    gs.mana = QUOTA + 50
    gs.x = wrap(gs.castle.x + 120, MAP); gs.y = gs.castle.y
    for (let i = 0; i < 30; i++) step(gs, {})
    r.check('carrying more than the quota away from the castle does not win',
        !gs.end && gs.bank === 0, `end=${gs.end} bank=${gs.bank}`)
}

// ---- bank-by-delivery over the castle
{
    const gs = makeGame(7)
    gs.mana = 24
    gs.x = gs.castle.x; gs.y = gs.castle.y; gs.alt = Math.max(gs.alt, sampleH(gs, gs.x, gs.y) + 4)
    for (let i = 0; i < 20; i++) step(gs, {})
    r.check('hovering the castle banks the carried load into the vault',
        gs.bank === 24 && gs.mana === 0, `bank=${gs.bank} carry=${gs.mana}`)
}

// ---- death spills the carried load, the vault endures
{
    const gs = makeGame(7)
    gs.bank = 40; gs.mana = 30; gs.shield = 0; gs.hp = 6
    const wolf = gs.monsters.find((m) => m.kind === 'wolf')
    let i = 0
    while (gs.deaths === 0 && i < 400) {
        step(gs, {})
        if (gs.monsters.includes(wolf)) { wolf.x = gs.x + 3; wolf.y = gs.y; wolf.grabbed = false; wolf.cool = 0; gs.alt = Math.min(gs.alt, sampleH(gs, wolf.x, wolf.y) + 4) }
        i++
    }
    r.check('death spills the carried load but the vault (and respawn) survives',
        gs.deaths === 1 && !gs.end && gs.bank === 40 && gs.mana === 0 && gs.spilled === 30,
        `deaths=${gs.deaths} bank=${gs.bank} carry=${gs.mana} spilled=${gs.spilled}`)
    const gs2 = makeGame(7)
    gs2.bank = 0; gs2.mana = 5; gs2.shield = 0; gs2.hp = 6
    const w2 = gs2.monsters.find((m) => m.kind === 'wolf')
    let j = 0
    while (!gs2.end && j < 400) {
        step(gs2, {})
        if (gs2.monsters.includes(w2)) { w2.x = gs2.x + 3; w2.y = gs2.y; w2.grabbed = false; w2.cool = 0; gs2.alt = Math.min(gs2.alt, sampleH(gs2, w2.x, w2.y) + 4) }
        j++
    }
    r.check('dying with an empty vault ends the flight (load lost with it)',
        gs2.end === 'dead' && gs2.spilled === 5, `end=${gs2.end} spilled=${gs2.spilled}`)
}

// ---- terrain reshaping: fireballs and lightning crater the land itself
{
    const gs = makeGame(7)
    gs.monsters.length = 0
    gs.wizard.alive = false
    gs.mana = 15; gs.coolL = 0
    const snap = { heights: gs.heights.slice() }
    let impact = null
    let i = 0
    while (i < 80 && !impact) {
        step(gs, i === 0 ? { castL: true } : {})
        for (const e of gs.events) if (e.type === 'boom') impact = e
        gs.events.length = 0
        i++
    }
    const hB = impact ? sampleH(snap, impact.x, impact.y) : 0
    // #1694 crumble: the crater unfolds over CRUMBLE_T ticks — land it before sampling
    if (impact) settleGround(gs)
    const hA = impact ? sampleH(gs, impact.x, impact.y) : 0
    r.check('fireball impact craters the terrain (heightmap actually deforms)',
        impact && hB - hA >= 3, `impact=${!!impact} ${hB.toFixed(1)} → ${hA.toFixed(1)}`)

    const gs2 = makeGame(7)
    gs2.monsters.length = 0
    gs2.wizard.alive = false
    gs2.mana = 25; gs2.coolR = 0
    gs2.learned.push('lightning'); gs2.hands.R = 'lightning'
    const snap2 = { heights: gs2.heights.slice() }
    let zapAt = null
    let j = 0
    while (j < 10 && !zapAt) { step(gs2, j === 0 ? { castR: true } : {}); for (const e of gs2.events) if (e.type === 'zap') zapAt = e; gs2.events.length = 0; j++ }
    if (zapAt) settleGround(gs2)
    const hL0 = zapAt ? sampleH(snap2, zapAt.x, zapAt.y) : 0
    const hL1 = zapAt ? sampleH(gs2, zapAt.x, zapAt.y) : 0
    r.check('lightning craters the ground where it strikes',
        zapAt && hL0 - hL1 >= 2, `zap=${!!zapAt} ${hL0.toFixed(1)} → ${hL1.toFixed(1)}`)
}

// ---- villages burn: fire that touches a hut ignites it, and it falls
{
    const gs = makeGame(7)
    gs.monsters.length = 0
    gs.wizard.alive = false
    gs.mana = 15; gs.coolL = 0
    const scout = JSON.parse(JSON.stringify(gs))
    let boomSpot = null
    let k = 0
    while (k < 80 && !boomSpot) {
        step(scout, k === 0 ? { castL: true } : {})
        for (const e of scout.events) if (e.type === 'boom') boomSpot = e
        scout.events.length = 0
        k++
    }
    const hs = gs.huts[0]
    hs.x = boomSpot.x; hs.y = boomSpot.y
    hs.burn = 0; hs.dead = false
    let ignited = false, i = 0
    while (i < 80 && !ignited) {
        step(gs, i === 0 ? { castL: true } : {})
        for (const e of gs.events) if (e.type === 'ignite') ignited = true
        gs.events.length = 0
        i++
    }
    let j = 0
    while (j < 260 && !hs.dead) { step(gs, {}); gs.events.length = 0; j++ }
    r.check('a hut in the blast ignites and burns to rubble', ignited && hs.dead, `ignited=${ignited} dead=${hs.dead}`)
}

// ---- fire spreads: a burning hut arms its neighbours (~120 ticks), far huts stay safe
{
    const gs = makeGame(7)
    gs.monsters.length = 0
    gs.wizard.alive = false
    gs.quota = 9999
    gs.huts.length = 0
    gs.huts.push({ x: 100, y: 100, v: 0, burn: 200, dead: false, catchT: 0 })
    gs.huts.push({ x: 112, y: 100, v: 1, burn: 0, dead: false, catchT: 0 })
    gs.huts.push({ x: 160, y: 100, v: 2, burn: 0, dead: false, catchT: 0 })
    const near = gs.huts[1], far = gs.huts[2]
    let caughtAt = -1, i = 0
    while (i < 190 && caughtAt < 0) {
        step(gs, {})
        if (caughtAt < 0 && near.burn > 0) caughtAt = i
        gs.events.length = 0
        i++
    }
    r.check('fire spreads: neighbouring hut catches ~120 ticks later, a 60u hut never does',
        caughtAt > 110 && caughtAt < 130 && far.burn === 0 && far.catchT === 0,
        `caughtAt=${caughtAt} farBurn=${far.burn} farCatchT=${far.catchT}`)
}

// ---- fresh craters glow with lava and cool over ~300 ticks (fire craters only)
{
    const gs = makeGame(7)
    gs.monsters.length = 0
    gs.wizard.alive = false
    gs.quota = 9999
    gs.mana = 15; gs.coolL = 0
    let boom = null, i = 0
    while (i < 80 && !boom) {
        step(gs, i === 0 ? { castL: true } : {})
        for (const e of gs.events) if (e.type === 'boom') boom = e
        gs.events.length = 0
        i++
    }
    const hot = boom ? gs.craters.find((c) => c.hot === 1) : null
    const freshGlow = hot ? glowOf(gs, hot) : 0
    for (let j = 0; j < CRATER_GLOW + 5; j++) { step(gs, {}); gs.events.length = 0 }
    const oldGlow = hot ? glowOf(gs, hot) : 1
    r.check('a fireball crater is born glowing hot and its lava cools to nothing after CRATER_GLOW ticks',
        boom && hot && freshGlow > 0.9 && oldGlow === 0 && gs.craters.length <= 10,
        `glow ${freshGlow.toFixed(2)} → ${oldGlow.toFixed(2)} craters=${gs.craters.length}`)
}

// ---- telekinesis throws and fireballs topple the wizard's tower at its base
{
    const gs = makeGame(7)
    gs.quota = 9999
    const tx = gs.wizard.tx, ty = gs.wizard.ty
    const hp0 = gs.wizard.hp
    r.check('toppling is refused far from the tower base',
        toppleTower(gs, gs.wizard.tx + 40, gs.wizard.ty + 40) === false && !gs.towerDown)
    const down = toppleTower(gs, tx + 3, ty - 2)
    r.check('a throw landing at the tower base topples it (once per world, wizard takes the fall)',
        down && gs.towerDown && gs.wizard.hp === hp0 - 30 &&
        toppleTower(gs, tx, ty) === false,
        `down=${down} towerDown=${gs.towerDown} hp ${hp0}→${gs.wizard.hp}`)
}

// ---- #1764 item 2: the rival wizard's castle grows over world time
{
    const gs = makeGame(7)
    r.check('the rival castle starts at its foundations (fresh world: stage 0, worldT 0)',
        gs.wizStage === 0 && gs.worldT === 0, `stage=${gs.wizStage} worldT=${gs.worldT}`)
    for (let i = 0; i < 1800; i++) step(gs, () => ({}))
    r.check('30s of world time raises the rival castle to stage 1 (curtain wall)',
        gs.wizStage === 1, `stage=${gs.wizStage} worldT=${gs.worldT}`)
    for (let i = 0; i < 3600; i++) step(gs, () => ({}))
    r.check('the longer the world is held the taller the rival builds (stage 3 keep)',
        gs.wizStage === 3, `stage=${gs.wizStage} worldT=${gs.worldT}`)
    const grown = gs.events.some((e) => e.type === 'wizGrow' && e.n === 3)
    r.check('each raising is announced (wizGrow events ride the log)',
        [1, 2, 3].every((n) => gs.events.some((e) => e.type === 'wizGrow' && e.n === n)))
    // the tell is per-world: the next wizard starts over
    const preStage = gs.wizStage
    gs.bank = gs.quota
    step(gs, () => ({}))
    r.check('a level transition starts the next wizard\'s castle at its foundations',
        preStage === 3 && gs.level === 1 && gs.wizStage === 0 && gs.worldT === 0,
        `pre=${preStage} level=${gs.level} stage=${gs.wizStage} worldT=${gs.worldT}`)
}
{
    // a grown castle defends itself; a blind or distant carpet is left alone
    const gs = makeGame(7)
    gs.quota = 9999
    gs.wizStage = 1
    gs.invis = 0
    gs.x = wrap(gs.wizard.tx + 70, MAP); gs.y = gs.wizard.ty
    gs.alt = sampleH(gs, gs.x, gs.y) + 30
    const n0 = gs.projs.length
    step(gs, () => ({}))
    const shots = gs.projs.filter((p) => p.from === 't')
    r.check('the grown tower looses a violet arrow at a visible carpet inside reach',
        gs.projs.length === n0 + 1 && shots.length === 1 && shots[0].kind === 'tarrow' && shots[0].dmg === 2,
        `projs ${n0}→${gs.projs.length} from-t=${shots.length}`)
    gs.invis = 30; gs.wizGuardFire = 0
    const n1 = gs.projs.length
    step(gs, () => ({}))
    r.check('the veil holds the tower\'s shots (a blind castle fires at nothing)',
        gs.projs.length === n1, `projs ${n1}→${gs.projs.length}`)
    gs.invis = 0; gs.wizGuardFire = 0
    gs.x = wrap(gs.wizard.tx + 160, MAP); gs.y = gs.wizard.ty
    const n2 = gs.projs.length
    step(gs, () => ({}))
    r.check('the tower holds while the carpet sits outside its 110u reach',
        gs.projs.length === n2, `projs ${n2}→${gs.projs.length}`)
    // stage 0 never fires
    const gs0 = makeGame(7); gs0.quota = 9999
    gs0.x = wrap(gs0.wizard.tx + 70, MAP); gs0.y = gs0.wizard.ty; gs0.invis = 0
    const n3 = gs0.projs.length
    step(gs0, () => ({}))
    r.check('the unbuilt tower (stage 0) has nothing to fire from',
        gs0.projs.length === n3 && !gs0.projs.some((p) => p.from === 't'))
    // a felled tower never rebuilds and never fires
    const gd = makeGame(7); gd.quota = 9999
    toppleTower(gd, gd.wizard.tx, gd.wizard.ty)
    for (let i = 0; i < 5400; i++) step(gd, () => ({}))
    r.check('a toppled tower never rebuilds', gd.towerDown && gd.wizStage === 0,
        `down=${gd.towerDown} stage=${gd.wizStage} worldT=${gd.worldT}`)
    r.check('a toppled tower never fires (ruins hold no guards)',
        !gd.projs.some((p) => p.from === 't') && !gd.events.some((e) => e.type === 'towerFire'))
    // dead wizard builds nothing
    const gk = makeGame(7); gk.quota = 9999
    gk.wizard.alive = false
    for (let i = 0; i < 5400; i++) step(gk, () => ({}))
    r.check('a slain wizard raises no walls (growth freezes with the defeat)',
        gk.wizStage === 0, `stage=${gk.wizStage}`)
}

// ---- mana conservation through a real campaign (vault + pouch + pearls + hoard)
{
    const gs = makeGame(7)
    const pearlMana = (s) => s.pearls.reduce((a, p) => a + (p.alive ? p.m : 0), 0)
    const total = (s) => Math.floor(s.bank) + Math.floor(s.mana) + pearlMana(s) + (s.wizard.alive ? s.wizard.mana : 0)
    let t0 = total(gs)
    let spent = 0, bounty = 0
    let i = 0
    while (!gs.end && i < 300000) {
        step(gs, autopilot(gs))
        for (const e of gs.events) {
            if (e.type === 'cast') spent += spellById(e.id).cost
            if (e.type === 'kill') bounty += BOUNTY[e.kind]
            if (e.type === 'spill') spent += e.m
            if (e.type === 'tribute') bounty += e.m // #1764 stage 2: the converted hut pays
            if (e.type === 'hutDown' && e.loot) bounty += e.m // #1764 stage 2: the ashes pay
            if (e.type === 'level') {
                t0 -= e.reset.bank + e.reset.pearls + e.reset.hoard
                t0 += pearlMana(gs) + LEVELS[e.n].hoard
            }
        }
        gs.events.length = 0
        i++
    }
    const t1 = total(gs)
    r.check('mana conserved: vault+pouch+pearls+hoard == start + bounty − spent − spilled (world resets rebased)',
        t1 === t0 + bounty - spent, `${t0} +${bounty} -${spent} = ${t0 + bounty - spent}, saw ${t1} (end=${gs.end})`)
}

// ---- acquisition risk: the book both grants and eludes, across seeds
{
    let learns = 0, fizzles = 0
    for (let seed = 1; seed <= 40; seed++) {
        const gs = makeGame(seed)
        let i = 0
        while (!gs.end && i < 6000) {
            step(gs, autopilot(gs))
            for (const e of gs.events) {
                if (e.type === 'learn') learns++
                if (e.type === 'fizzle') fizzles++
            }
            gs.events.length = 0
            i++
        }
    }
    r.check('grimoire acquisition risk: both learn and fizzle happen', learns > 0 && fizzles > 0, `learns=${learns} fizzles=${fizzles}`)
}

// ---- spells cost carried mana and refuse without it
{
    const gs = makeGame(7)
    gs.mana = 0
    gs.coolL = 0
    step(gs, { castL: true })
    const denied = gs.events.some((e) => e.type === 'nomana' || e.type === 'deny')
    r.check('casting without mana is denied (no fireball, no debt)', denied && gs.projs.length === 0 && gs.mana === 0)
    gs.mana = 15
    step(gs, { castL: true })
    const castOk = gs.events.some((e) => e.type === 'cast') && gs.mana === 0 && gs.projs.some((p) => p.kind === 'fireball')
    r.check('fireball fires for exactly its cost from the pouch', castOk, `mana=${gs.mana}`)
}

// ---- carpet rules: cannot crash, auto-rises
{
    const gs = makeGame(7)
    let minClear = 1e9, minAlt = 1e9, dryDip = 0
    for (let i = 0; i < 2000 && !gs.end; i++) {
        step(gs, { up: false, down: true })
        const gH = sampleH(gs, gs.x, gs.y)
        minClear = Math.min(minClear, gs.alt - gH)
        minAlt = Math.min(minAlt, gs.alt)
        if (gs.alt < WATER && gH >= WATER) dryDip++
    }
    r.check('holding down never buries the carpet', minClear > 1.4, `min clearance ${minClear.toFixed(1)}`)
    // #1764 item 4 stage 2 reshaped this gate: "never buries" is ground-relative now
    // (hover clearance over any surface), the dry law is its own gate, and the flood
    // dive is proven positive below. Mutation guide: restore the old blanket
    // `max(WATER + 3, ground + 1.6)` floor and both stage-2 gates go red (no dive).
    r.check('#1764 item 4 stage 2: over dry ground the carpet never dips under sea (the old law holds)',
        dryDip === 0, `${dryDip} ticks below sea over dry ground`)
    r.check('#1764 item 4 stage 2: the seed-7 sweep finds flooded low ground and dives it (min alt under WATER)',
        minAlt < WATER, `min alt ${minAlt.toFixed(1)} (WATER ${WATER})`)
}

// ---- #1764 item 4 stage 2: craters sunk below sea are diveable — the original's
// underwater view. digFlood sinks a shaft under the carpet until its floor goes
// under WATER (crater() is rng-free, so the dig replays); holding down dips the
// carpet below the surface, diveOf(gs) reads the depth, and the world muffles.
// Mutation guide: restore the blanket `max(WATER + 3, ground + 1.6)` floor in
// step() and the dive, the sub-muffle and the determinism gates all go red.
{
    const digFlood = (g) => {
        let n = 0
        while (sampleH(g, g.x, g.y) > WATER - 4 && n < 12) { crater(g, g.x, g.y, 14, 24, 0); settleGround(g); n++ }
        return n
    }
    const playDive = () => {
        const g = makeGame(7)
        g.shield = 1e9
        const digs = digFlood(g)
        let maxSub = 0, minClear = 1e9, mAtSub = 0
        for (let i = 0; i < 400 && g.end === null; i++) {
            step(g, { down: true })
            const sub = diveOf(g)
            if (sub > 0) {
                maxSub = Math.max(maxSub, sub)
                minClear = Math.min(minClear, g.alt - sampleH(g, g.x, g.y))
                mAtSub = muffleOf(g)
            }
        }
        let rose = -1
        for (let i = 0; i < 600 && g.end === null; i++) { step(g, { up: true }); if (diveOf(g) === 0) { rose = i; break } }
        return { digs, maxSub, minClear, mAtSub, rose, mOpen: muffleOf(g), h: stateHash(g) }
    }
    const a = playDive(), b = playDive()
    r.check('#1764 item 4 stage 2: flooded pits are diveable — hold down and the carpet dips below the sea',
        a.digs > 0 && a.maxSub > 1, `digs=${a.digs} max depth ${a.maxSub.toFixed(1)}u`)
    r.check('#1764 item 4 stage 2: underwater the carpet is never buried either (hover clearance ≥ 1.4u)',
        a.minClear > 1.4, `min clearance ${a.minClear.toFixed(1)}`)
    r.check('#1764 item 4 stage 2: submerged the world muffles, and opens back up once you rise (diveOf = 0)',
        a.mAtSub === MUFFLE_CUTOFF && a.rose >= 0 && a.mOpen === OPEN_CUTOFF,
        `sub-muffle ${a.mAtSub}, escaped after ${a.rose} climb ticks, open ${a.mOpen}`)
    const pur = makeGame(7)
    const hp0 = stateHash(pur); diveOf(pur); const hp1 = stateHash(pur)
    r.check('#1764 item 4 stage 2: diveOf is a pure read — it never disturbs the state hash', hp0 === hp1, `${hp0} vs ${hp1}`)
    r.check('#1764 item 4 stage 2: the dive is deterministic — same seed + same digs + same yoke → identical hash',
        a.h === b.h, `${a.h} vs ${b.h}`)
}

// ---- #1764 item 4 stage 3: UNDERWATER HANDLING — water is heavy and fire drowns.
// While diveOf(gs) > 0 the throttle multiplies by DIVE_DRAG, and the flame-family
// spells are refused BEFORE cost and cooldown (`wetFizzle`: mana, cool-down and the
// world all stay whole). The law keys on alt alone, rng-free — a recorded dive
// replays identical. Mutation guide: DIVE_DRAG -> 1 kills the swim gate; deleting
// the drown block kills every refusal gate; moving it after the mana subtract kills
// the costs-nothing gate; adding 'heal' to DIVE_NOFIRE kills the non-flame gate.
{
    const simS3 = await readFile(new URL('../src/games/MagicCarpet/sim.js', import.meta.url), 'utf8')
    const digFlood = (g) => {
        let n = 0
        while (sampleH(g, g.x, g.y) > WATER - 4 && n < 12) { crater(g, g.x, g.y, 14, 24, 0); settleGround(g); n++ }
        return n
    }
    const sink = (g) => { // hold down until the depth read says we are under
        let t = 0
        while (t < 400 && g.end === null && diveOf(g) === 0) { step(g, { down: true }); t++ }
        return diveOf(g) > 0
    }
    r.check('#1764 item 4 stage 3: the law is pinned to literals — DIVE_DRAG 0.5, drowned books fireball + volcano',
        DIVE_DRAG === 0.5 && DIVE_NOFIRE.join(',') === 'fireball,volcano',
        `drag ${DIVE_DRAG}, nofire ${DIVE_NOFIRE.join(',')}`)
    r.check('#1764 item 4 stage 3: source pins — the drag rides the throttle line and the drown block sits before nomana',
        simS3.includes('* (diveOf(gs) > 0 ? DIVE_DRAG : 1)')
        && simS3.includes("if (DIVE_NOFIRE.includes(id) && diveOf(gs) > 0) { gs.events.push({ type: 'wetFizzle', id }); return }")
        && simS3.indexOf("type: 'wetFizzle'") < simS3.indexOf("if (gs.mana < sp.cost)"),
        'drag/block literals or their order moved')

    // The swim: hold down off the pit rim, then every tick that STARTED submerged
    // advances exactly CFG.speed * DIVE_DRAG — no steer, no boost, a literal product.
    let subTicks = 0, worstErr = 0
    const g3 = makeGame(7)
    g3.shield = 1e9
    digFlood(g3)
    for (let i = 0; i < 400 && g3.end === null; i++) {
        const px = g3.x, py = g3.y, pre = diveOf(g3)
        step(g3, { down: true })
        if (pre > 0) {
            const d = Math.hypot(wrapD(g3.x - px), wrapD(g3.y - py))
            subTicks++
            worstErr = Math.max(worstErr, Math.abs(d - CFG.speed * DIVE_DRAG))
        }
    }
    r.check('#1764 item 4 stage 3: a submerged carpet swims at exactly DIVE_DRAG of its throttle (seed 7 flooded pit)',
        subTicks >= 30 && worstErr < 1e-9, `${subTicks} submerged ticks, worst step error ${worstErr.toExponential(2)}`)

    // Dry is undragged: full throttle, tick after tick (and the pit world never
    // drags ABOVE the surface — flight over flooded ground is not swimming).
    const g4 = makeGame(7)
    let dryTicks = 0, dryErr = 0
    for (let i = 0; i < 60 && g4.end === null; i++) {
        const px = g4.x, py = g4.y
        step(g4, {})
        dryTicks++
        dryErr = Math.max(dryErr, Math.abs(Math.hypot(wrapD(g4.x - px), wrapD(g4.y - py)) - CFG.speed))
    }
    r.check('#1764 item 4 stage 3: dry air keeps full throttle — the drag never bites above the sea',
        dryTicks === 60 && dryErr < 1e-9, `60 dry ticks, worst error ${dryErr.toExponential(2)}`)

    // The drown: every flame book refuses underwater, and the refusal costs nothing.
    const fireGate = (id) => {
        const g = makeGame(7)
        g.shield = 1e9
        g.mana = 500
        g.learned.push(id); g.hands.R = id; g.coolR = 0
        // measure far from home: seed 7 spawns at the castle and bank-by-delivery
        // would move mana on every tick we watch (line 1158's law, not our block).
        g.x = wrap(g.x + 120, MAP); g.y = wrap(g.y + 120, MAP)
        digFlood(g)
        const sank = sink(g)
        const projs0 = g.projs.length
        g.pearls.length = 0 // no pickup can ride the same tick as the measured cast
        const mana0 = g.mana
        step(g, { castR: true })
        const manaBlocked = g.mana // snapshot NOW — the after-rising cast must spend
        const coolBlocked = g.coolR
        const wet = g.events.find((e) => e.type === 'wetFizzle')
        const casted = g.events.some((e) => e.type === 'cast')
        const volcanoSilent = id !== 'volcano' || !g.events.some((e) => e.type === 'volcano' || e.type === 'boom')
        g.events.length = 0
        // ...and once back in the air the same hand lights again.
        let rose = -1
        for (let i = 0; i < 600 && g.end === null; i++) { step(g, { up: true }); if (diveOf(g) === 0) { rose = i; break } }
        g.pearls.length = 0 // same isolation for the after-rising cast
        step(g, { castR: true })
        const lit = g.projs.length > projs0 && g.mana < mana0 && g.events.some((e) => e.type === 'cast')
        return { sank, wet: !!wet && wet.id === id, casted, costsNothing: manaBlocked === mana0, coolClean: coolBlocked === 0, volcanoSilent, rose, lit }
    }
    const fb = fireGate('fireball'), vc = fireGate('volcano')
    r.check('#1764 item 4 stage 3: fireball drowns — no cast, one wetFizzle, and no world state behind it',
        fb.sank && fb.wet && !fb.casted && fb.volcanoSilent, `wet=${fb.wet} cast=${fb.casted}`)
    r.check('#1764 item 4 stage 3: volcano drowns too — the mountain stays shut under the sea',
        vc.sank && vc.wet && !vc.casted && vc.volcanoSilent, `wet=${vc.wet} cast=${vc.casted}`)
    r.check('#1764 item 4 stage 3: the drowned cast costs NOTHING — mana stays whole and no cool-down burns (block sits before the cost)',
        fb.sank && fb.costsNothing && fb.coolClean,
        `mana intact=${fb.costsNothing}, coolR unburnt=${fb.coolClean}`)
    r.check('#1764 item 4 stage 3: a drowned flame is doused, not dead — the same hand lights again in dry air',
        fb.rose >= 0 && fb.lit, `rose after ${fb.rose} ticks, lit=${fb.lit}`)

    // Non-flame magic ignores the water.
    {
        const g = makeGame(7)
        g.shield = 1e9
        g.mana = 500
        g.learned.push('protect'); g.hands.R = 'protect'; g.coolR = 0
        const sank = sink(g) || (digFlood(g), sink(g))
        step(g, { castR: true })
        r.check('#1764 item 4 stage 3: the non-flame books stay wet-safe — protect shields through the sea',
            sank && g.shield === 150 && g.events.some((e) => e.type === 'cast') && !g.events.some((e) => e.type === 'wetFizzle'),
            `sank=${sank} shield=${g.shield}`)
    }

    // Determinism: dig, sink, drown a fireball, cruise — twice, identical.
    const runDive3 = () => {
        const g = makeGame(7)
        g.shield = 1e9
        g.mana = 500
        g.learned.push('fireball'); g.hands.R = 'fireball'; g.coolR = 0
        digFlood(g)
        sink(g)
        for (let i = 0; i < 120 && g.end === null; i++) step(g, i === 10 ? { down: true, castR: true } : { down: true })
        return stateHash(g)
    }
    r.check('#1764 item 4 stage 3: the whole swim is deterministic — same seed + same digs + same yoke → identical hash',
        runDive3() === runDive3())
}

// ---- charge-glide: the speed button (Shift / hold ▲ in the shell → inp.boost)
// Mutation guide: set CFG.boost to 1 in sim.js and the speed check goes red;
// set CFG.boostTurn to 1 and the wide-turn check goes red.
{
    const glide = (inp) => {
        const gs = makeGame(7)
        const x0 = gs.x, y0 = gs.y
        let prevM = gs.mana, spent = 0
        for (let i = 0; i < 60 && !gs.end; i++) {
            step(gs, inp)
            if (gs.mana < prevM) spent += prevM - gs.mana
            prevM = gs.mana
        }
        return { d: Math.hypot(wrapD(gs.x - x0), wrapD(gs.y - y0)), yaw: Math.abs(gs.yaw), spent }
    }
    const sN = glide({}), sB = glide({ boost: true })
    const tN = glide({ left: true }), tB = glide({ left: true, boost: true })
    const speed = sB.d / sN.d
    const turn = tB.yaw / tN.yaw
    r.check('charge-glide: 60 boosted ticks cover ~1.6× the cruise distance',
        speed > 1.5 && speed < 1.7, `ratio ${speed.toFixed(2)} (${sN.d.toFixed(0)} → ${sB.d.toFixed(0)} u)`)
    r.check('charge-glide turns wider: heading gain ~0.55× at speed',
        turn > 0.5 && turn < 0.6, `yaw ratio ${turn.toFixed(2)} (radius ×${(speed / turn).toFixed(1)})`)
    r.check('charge-glide is mana-free (nothing spent while gliding)',
        sB.spent === 0 && tB.spent === 0, `spent ${sB.spent}/${tB.spent}`)
}

// ---- wizard hoard scatters (as pearls) when tower and wizard fall
{
    const gs = makeGame(7)
    const hoard = gs.wizard.mana
    const tx = gs.wizard.tx, ty = gs.wizard.ty
    gs.quota = 9999
    const hBefore = sampleH(gs, tx, ty)
    gs.mana = 160
    gs.wizard.hp = 14
    const before = gs.pearls.filter((p) => p.alive).reduce((a, p) => a + p.m, 0)
    let i = 0
    while (gs.wizard.alive && i < 4000) { step(gs, autopilot(gs)); i++ }
    settleGround(gs) // #1694: let the tower crater land before reading it
    const after = gs.pearls.filter((p) => p.alive).reduce((a, p) => a + p.m, 0) + Math.floor(gs.mana)
    const hAfter = sampleH(gs, tx, ty)
    r.check('slaying the wizard scatters his hoard as pearls and craters his tower',
        !gs.wizard.alive && after >= before + hoard - 15 && hBefore - hAfter >= 3,
        `pearl mana ${before} → ${after} (hoard ${hoard}), tower ground ${hBefore.toFixed(0)} → ${hAfter.toFixed(0)}`)
}

// ---- roster + INVISIBILITY (#1610): the original's veil, done whole
// (#1612 item 5 grew the roster to eight with VOLCANO; #1639 to ten with
// SHATTER and RAISE; #1668 to eleven with DISSOLVE; #1680 to twelve with CLONE.)
{
    r.check('twelve signature spells with costs', SPILLS.length === 12 &&
        ['fireball', 'lightning', 'heal', 'protect', 'slow', 'telekinesis', 'invisibility', 'volcano', 'shatter', 'raise', 'dissolve', 'clone'].every((id) => spellById(id)?.cost > 0))

    const veilUp = (gs) => {
        gs.learned.push('invisibility')
        setHand(gs, 'L', 'invisibility')
        gs.mana = 40
        step(gs, { castL: true })
    }
    // Cast mechanics: spends the pouch, raises the veil for INVIS_T world ticks.
    {
        const gs = makeGame(7)
        veilUp(gs)
        const castEv = gs.events.some((e) => e.type === 'cast' && e.id === 'invisibility')
        gs.events.length = 0
        let expired = false
        for (let i = 0; i < INVIS_T + 5 && !expired; i++) {
            expired = gs.events.some((e) => e.type === 'invisEnd'); gs.events.length = 0; step(gs, {})
        }
        r.check('INVISIBILITY spends 20 from the pouch and veils for INVIS_T ticks, then lifts cleanly',
            castEv && gs.invis === 0 && expired, `cast=${castEv} expiry=${expired}`)
    }
    // The wizard: control fires at a visible carpet; a veiled one is never shot at,
    // and a bolt already in flight passes through the veil untouched.
    const wizRig = (veil, near = true) => {
        const gs = makeGame(7)
        for (const m of gs.monsters) if (m.kind !== 'cow') { m.x = wrap(m.x + 231, MAP); m.y = wrap(m.y + 231, MAP) }
        gs.shield = 500 // separate the hit channel: shieldHit = contact, hurt would mean breach
        if (veil) veilUp(gs)
        let fired = false, hit = false
        const place = () => { gs.x = wrap(gs.wizard.x + 10, MAP); gs.y = wrap(gs.wizard.y + 10, MAP) }
        for (let i = 0; i < 80; i++) {
            if (near) place()
            if (gs.events.some((e) => e.type === 'wizfire')) fired = true
            if (gs.events.some((e) => e.type === 'shieldHit' || e.type === 'hurt')) hit = true
            gs.events.length = 0
            step(gs, {})
        }
        return { fired, hit }
    }
    const wc = wizRig(false)
    const wv = wizRig(true)
    r.check('a visible carpet is shot at; a veiled carpet is never targeted nor hit',
        wc.fired && wc.hit && !wv.fired && !wv.hit, `ctrl fire=${wc.fired} hit=${wc.hit} veiled fire=${wv.fired} hit=${wv.hit}`)
    // In-flight refusal: a bolt launched before the veil still passes through.
    {
        const gs = makeGame(7)
        for (const m of gs.monsters) if (m.kind !== 'cow') { m.x = wrap(m.x + 231, MAP); m.y = wrap(m.y + 231, MAP) }
        gs.shield = 500
        let hit = false
        for (let i = 0; i < 80; i++) {
            gs.x = wrap(gs.wizard.x + 10, MAP); gs.y = wrap(gs.wizard.y + 10, MAP)
            if (gs.events.some((e) => e.type === 'wizfire')) gs.invis = 40 // veil drops as the bolt flies
            if (gs.events.some((e) => e.type === 'shieldHit' || e.type === 'hurt')) hit = true
            gs.events.length = 0
            step(gs, {})
        }
        r.check('a bolt launched before the veil passes through the ghost carpet', !hit, `hit=${hit}`)
    }
    // Expiry: the paused fuse resumes on the cadence the tick you become visible.
    {
        const gs = makeGame(7)
        for (const m of gs.monsters) if (m.kind !== 'cow') { m.x = wrap(m.x + 231, MAP); m.y = wrap(gs.wizard.y + 231, MAP) }
        veilUp(gs)
        gs.invis = 3
        let resumed = false
        for (let i = 0; i < 80 && !resumed; i++) {
            gs.x = wrap(gs.wizard.x + 10, MAP); gs.y = wrap(gs.wizard.y + 10, MAP)
            resumed = gs.events.some((e) => e.type === 'wizfire'); gs.events.length = 0; step(gs, {})
        }
        r.check('the wizard opens fire again the moment the veil expires', resumed, `resumed=${resumed}`)
    }
    // Monsters: wolves chase+bite a visible low carpet; veiled they neither.
    const wolfRig = (veil) => {
        const gs = makeGame(7)
        if (veil) veilUp(gs)
        const wolf = gs.monsters.find((m) => m.kind === 'wolf')
        const hp0 = gs.hp
        for (let i = 0; i < 60; i++) {
            gs.x = wrap(wolf.x + 2, MAP); gs.y = wrap(wolf.y + 2, MAP); gs.alt = 17
            step(gs, {}); gs.events.length = 0
        }
        return gs.hp < hp0
    }
    const giantRig = (veil) => {
        const gs = makeGame(7)
        if (veil) veilUp(gs)
        const gi = gs.monsters.find((m) => m.kind === 'giant')
        let sling = false
        for (let i = 0; i < 120 && !sling; i++) {
            gs.x = wrap(gi.x + 5, MAP); gs.y = wrap(gi.y + 5, MAP)
            sling = gs.events.some((e) => e.type === 'rocksling'); gs.events.length = 0; step(gs, {})
        }
        return sling
    }
    r.check('wolves bite a visible low carpet but cannot see a veiled one',
        wolfRig(false) && !wolfRig(true))
    r.check('giants sling at a visible carpet and refuse a veiled one',
        giantRig(false) && !giantRig(true))
    // Your own hands work untouched behind the veil: pearls still come to you.
    {
        const gs = makeGame(7)
        veilUp(gs)
        const pearl = gs.pearls.find((p) => p.alive)
        gs.x = pearl.x; gs.y = pearl.y; gs.alt = pearl.z
        step(gs, {})
        r.check('the veil hides you from enemies only — pearls still gather',
            gs.events.some((e) => e.type === 'pickup'))
    }
    // The veil rides the state hash, and the grimoire carries it in every world.
    {
        const a = makeGame(7)
        const b = makeGame(7)
        veilUp(b)
        r.check('stateHash sees the veil', stateHash(a) !== stateHash(b))
        r.check('the INVISIBILITY grimoire spawns in every world',
            [0, 1, 2].every((lv) => makeGame(7, lv).books.some((bk) => bk.id === 'invisibility')))
    }
    // Lost-target cue (#1612 item 1): the tick the veil rises, every enemy that
    // HAD the carpet in its sights loses it — the sim marks cosmetic lostT and
    // fires a `lost` event (the shell blips, the renderer floats a '?').
    // Out-of-range watchers stay quiet, the cue fires once per veil, decays,
    // and a visible carpet never triggers it. lostT never steers the AI.
    const lostRig = (placeFar) => {
        const gs = makeGame(7)
        gs.learned.push('invisibility')
        const wolf = gs.monsters.find((m) => m.kind === 'wolf')
        const gi = gs.monsters.find((m) => m.kind === 'giant')
        // Composition-proof (#1612): the volcano book shifted world-gen rng, so
        // seed 7 now rolls a 2nd giant (and 2nd wolf) that can sit inside sight
        // of the parked carpet and emit stray `lost` events. Keep exactly the
        // one giant + one wolf this rig places — the gate is about the cue, not
        // about how many monsters the seed happens to roll.
        gs.monsters = gs.monsters.filter((m) => m === wolf || m === gi)
        const wz = gs.wizard
        gs.x = wrap(wz.x + (placeFar ? 120 : 20), MAP); gs.y = wz.y
        wolf.x = wrap(gs.x + (placeFar ? 120 : 8), MAP); wolf.y = gs.y
        gi.x = wrap(gs.x + (placeFar ? 120 : -30), MAP); gi.y = wrap(gs.y + 20, MAP)
        return { gs, wolf, gi, wz }
    }
    {
        const { gs, wolf, gi, wz } = lostRig(false)
        setHand(gs, 'L', 'invisibility'); gs.mana = 40
        step(gs, { castL: true })
        const kinds = gs.events.filter((e) => e.type === 'lost').map((e) => e.kind).sort()
        r.check('casting the veil marks every enemy caught looking (wizard + wolf + giant emit `lost`)',
            kinds.join(',') === 'giant,wizard,wolf' && wz.lostT === 40 && wolf.lostT === 40 && gi.lostT === 40,
            `kinds=${kinds.join(',')} lostT w/w/g ${wz.lostT}/${wolf.lostT}/${gi.lostT}`)
        gs.events.length = 0
        for (let i = 0; i < 60; i++) step(gs, {})
        const repeats = gs.events.filter((e) => e.type === 'lost').length
        r.check('the lost cue fires once per veil and decays while it holds (never spams)',
            repeats === 0 && wz.lostT === 0 && wolf.lostT === 0 && gi.lostT === 0,
            `repeats=${repeats} lostT ${wz.lostT}/${wolf.lostT}`)
    }
    {
        const { gs, wolf, gi, wz } = lostRig(true)
        setHand(gs, 'L', 'invisibility'); gs.mana = 40
        step(gs, { castL: true })
        const n = gs.events.filter((e) => e.type === 'lost').length
        r.check('enemies outside their sight range get no lost cue (only those that had you)',
            n === 0 && wz.lostT === 0 && wolf.lostT === 0 && gi.lostT === 0, `n=${n}`)
    }
    {
        const { gs } = lostRig(false)
        let n = 0
        for (let i = 0; i < 60; i++) { step(gs, {}); n += gs.events.filter((e) => e.type === 'lost').length; gs.events.length = 0 }
        r.check('a visible carpet never triggers the lost cue (you must vanish to be lost)', n === 0, `n=${n}`)
    }
    // Balance: the veil must not make the autopilot worse — the documented bar
    // is 60/60 seeds restored (README).
    {
        let wins = 0, slowest = 0
        for (let s = 1; s <= 60; s++) {
            const gs = makeGame(s)
            let i = 0
            while (!gs.end && i < 300000) { step(gs, autopilot(gs)); i++ }
            if (gs.end === 'win') { wins++; if (i > slowest) slowest = i }
        }
        r.check('60-seed balance sweep: the autopilot still restores all nine worlds, all 60 seeds',
            wins === 60, `wins ${wins}/60, slowest ${slowest} ticks`)
    }
}

// ---- #1612 item 5: VOLCANO — the ground tears open where you look.
{
    r.check('volcano is the 8th spell: cost 60, a grimoire waits in the world',
        SPILLS.length === 12 && spellById('volcano').cost === 60 &&
        fresh.books.some((b) => b.id === 'volcano'), `n=${SPILLS.length}`)
    {
        const gv = makeGame(7)
        gv.learned.push('volcano')
        gv.mana = 100
        gv.coolL = 0
        setHand(gv, 'L', 'volcano')
        const before = gv.craters.length
        step(gv, { castL: true })
        const ev = gv.events.filter((e) => e.type === 'volcano')
        r.check('cast tears 4 hot vents open and pays 60 mana',
            gv.craters.length - before === 4 && gv.craters.every((c) => c.hot === 1) && gv.mana === 40 && ev.length === 1 && ev[0].vents.length === 4,
            `craters +${gv.craters.length - before} mana=${gv.mana} vents=${ev[0]?.vents.length}`)
        const mainC = gv.craters[before]
        r.check('fresh vents glow with lava and cool over CRATER_GLOW',
            glowOf(gv, mainC) > 0 && glowOf({ ...gv, tick: gv.tick + CRATER_GLOW }, mainC) === 0,
            `glow now=${glowOf(gv, mainC).toFixed(2)}`)
    }
    {
        const gm = makeGame(7)
        gm.learned.push('volcano')
        gm.mana = 30
        setHand(gm, 'L', 'volcano')
        const bm = gm.craters.length
        step(gm, { castL: true })
        r.check('no mana, no mountain: denied, ground untouched',
            gm.craters.length === bm && gm.events.some((e) => e.type === 'nomana'), `craters=${gm.craters.length}`)
    }
    {
        const gt = makeGame(7)
        volcanoErupt(gt, gt.wizard.tx, gt.wizard.ty)
        r.check('an eruption at the tower base topples it (wizard takes the fall)',
            gt.towerDown === true && gt.wizard.hp < LEVELS[0].wizHp, `down=${gt.towerDown} hp=${gt.wizard.hp}`)
    }
    {
        const eruptOnce = () => {
            const g = makeGame(7)
            g.learned.push('volcano'); g.mana = 100; g.coolL = 0
            setHand(g, 'L', 'volcano')
            step(g, { castL: true })
            for (let i = 0; i < 50; i++) step(g, {})
            return stateHash(g)
        }
        const h1 = eruptOnce(), h2 = eruptOnce()
        r.check('eruptions are deterministic: same seed + same cast → identical hash', h1 === h2, `${h1} vs ${h2}`)
    }
}

// ---- #1639: SHATTER + RAISE — the book grows to ten.
// Shatter is kill-without-cinders: creatures die at the look point, the land
// is provably untouched (craters, scorch marks, fire and the tower never move,
// even cast at the tower base). Raise is crater()'s mirror: a quadratic mound
// that lifts a ridge, pays from the pouch, and drains a flooded crater — the
// counter-spell to the game's own flooding. Mutation guide: drop shatter's
// kill radius to 4 and the kill gate goes red; delete the raiseTerrain body
// and the mound + flood-drain gates go red.
{
    r.check('shatter and raise join the book (costs 30/25) with grimoires in the world',
        spellById('shatter').cost === 30 && spellById('raise').cost === 25 &&
        fresh.books.some((b) => b.id === 'shatter') && fresh.books.some((b) => b.id === 'raise'))
    {
        const gs = makeGame(7)
        gs.learned.push('shatter'); gs.mana = 100; gs.coolL = 0
        setHand(gs, 'L', 'shatter')
        // Aim by coordinates (the cast point itself), so the kill-radius gate
        // does not ride lookPoint's terrain scan.
        const px = wrap(gs.x + 30, MAP), py = wrap(gs.y, MAP)
        const near = gs.monsters.find((m) => m.kind === 'wolf')
        const far = gs.monsters.find((m) => m.kind === 'giant' &&
            Math.hypot(wrapD(m.x - px), wrapD(m.y - py)) > SHATTER_R + 20)
        near.x = wrap(px + 3, MAP); near.y = wrap(py + 3, MAP)
        const before = { craters: gs.craters.length, marks: gs.fireMarks.length }
        const kills0 = gs.kills, pearls0 = gs.pearls.length
        shatterAt(gs, px, py)
        r.check('shatter kills everything inside SHATTER_R, its victims pay bounties',
            !gs.monsters.includes(near) && gs.kills === kills0 + 1 &&
            gs.pearls.length > pearls0 && gs.events.some((e) => e.type === 'shatter'),
            `kills+${gs.kills - kills0} pearls +${gs.pearls.length - pearls0}`)
        r.check('shatter spares what stands outside the ring', gs.monsters.includes(far))
        r.check('the kill leaves no cinders: no crater, no fire mark',
            gs.craters.length === before.craters && gs.fireMarks.length === before.marks,
            `craters ${before.craters}→${gs.craters.length}, marks ${before.marks}→${gs.fireMarks.length}`)
        const killEv = gs.events.filter((e) => e.type === 'kill')
        r.check('every kill names its kind and stands somewhere — the crumble FX fuel (#1646)',
            killEv.length === 1 && ['wolf', 'giant', 'cow'].includes(killEv[0].kind) &&
            Number.isFinite(killEv[0].x) && Number.isFinite(killEv[0].y),
            killEv.map((e) => `${e.kind}@${e.x.toFixed(0)},${e.y.toFixed(0)}`).join(' ') || 'no kill event')
        gs.events.length = 0; gs.pearls.length = 0
        step(gs, { castL: true })
        r.check('casting shatter from a hand spends the pouch (30)', gs.mana === 70 && gs.events.some((e) => e.type === 'cast'),
            `mana=${gs.mana}`)
    }
    {
        const gt = makeGame(7)
        gt.learned.push('shatter'); gt.mana = 100; gt.coolL = 0
        setHand(gt, 'L', 'shatter')
        // The ring at the wizard himself: he takes the force, yet the tower
        // stands and the ground keeps its shape — shatter is not a blast.
        const cr0 = gt.craters.length
        shatterAt(gt, gt.wizard.x, gt.wizard.y)
        r.check('shatter at the wizard wounds him yet never topples or craters',
            gt.events.some((e) => e.type === 'wizHit') && gt.towerDown === false && gt.craters.length === cr0,
            `down=${gt.towerDown} craters=${gt.craters.length}`)
    }
    {
        const gm = makeGame(7)
        gm.learned.push('shatter'); gm.mana = 10; gm.coolL = 0
        setHand(gm, 'L', 'shatter')
        r.check('no mana, no kill: shatter denied',
            step(gm, { castL: true }) && gm.events.some((e) => e.type === 'nomana') && gm.mana === 10)
    }
    {
        const gs = makeGame(7)
        gs.learned.push('raise'); gs.mana = 100; gs.coolL = 0
        setHand(gs, 'L', 'raise')
        const px = wrap(gs.x + 30, MAP), py = wrap(gs.y, MAP)
        const h0 = sampleH(gs, px, py), hEdge = sampleH(gs, wrap(px + 24, MAP), py)
        raiseTerrain(gs, px, py, 16, 14)
        settleGround(gs) // #1694: read the mound after its swell window
        r.check('raise pushes a mound up where you look',
            sampleH(gs, px, py) > h0 + 4 && gs.events.some((e) => e.type === 'raise'),
            `h ${h0.toFixed(1)}→${sampleH(gs, px, py).toFixed(1)}`)
        r.check('the mound is local: 24u out the ground is unmoved',
            Math.abs(sampleH(gs, wrap(px + 24, MAP), py) - hEdge) < 0.5,
            `edge ${hEdge.toFixed(1)}→${sampleH(gs, wrap(px + 24, MAP), py).toFixed(1)}`)
        gs.events.length = 0; gs.pearls.length = 0
        step(gs, { castL: true })
        r.check('casting raise from a hand spends the pouch (25)', gs.mana === 75 && gs.events.some((e) => e.type === 'cast'),
            `mana=${gs.mana}`)
    }
    {
        // The counter-spell: a crater sunk below sea floods; raise drains it.
        // Depths are sized with the bilinear-sampling floor in mind: a point
        // at a crater's centre still reads ≥0.35×depth down, and a mound's
        // centre still reads ≥5.8 up (r16/h14) — so flood (≤WATER−4) then
        // drain (>WATER) are provable at the cast point, not luck of the grid.
        const gs = makeGame(7)
        const px = wrap(gs.castle.x + 60, MAP), py = wrap(gs.castle.y + 60, MAP)
        const h0 = sampleH(gs, px, py)
        crater(gs, px, py, 14, Math.max(8, Math.ceil((h0 - WATER + 4) * 2.9)))
        settleGround(gs) // #1694: flood after the sink window
        const flooded = sampleH(gs, px, py) < WATER
        raiseTerrain(gs, px, py, 16, 14)
        settleGround(gs) // #1694: drain after the swell window
        r.check('raise drains a flooded crater — land lifted above the sea',
            flooded && sampleH(gs, px, py) > WATER,
            `h0=${h0.toFixed(1)} flooded=${flooded} after=${sampleH(gs, px, py).toFixed(1)}`)
    }
    {
        const castTwice = () => {
            const g = makeGame(21)
            g.learned.push('shatter', 'raise'); g.mana = 200
            setHand(g, 'L', 'shatter'); step(g, { castL: true })
            setHand(g, 'L', 'raise'); g.coolL = 0; step(g, { castL: true })
            for (let i = 0; i < 80; i++) step(g, {})
            return stateHash(g)
        }
        const a = castTwice(), b = castTwice()
        r.check('the new spells are deterministic: same seed + same casts → identical hash', a === b, `${a} vs ${b}`)
    }
    {
        // Fairness invariant (#1639 sweep): every generated wizard tower sits
        // within the castle guards' reach (<200u, arrows carry ~300). An
        // unreachable hoarding wizard with a broke carpet is a soft-locked
        // world — seed 14 rolled exactly that pre-invariant.
        let bad = 0
        for (let s = 1; s <= 20 && bad === 0; s++) {
            for (const lv of [0, 1, 2]) {
                const g = makeGame(s, lv)
                if (Math.hypot(wrapD(g.wizard.tx - g.castle.x), wrapD(g.wizard.ty - g.castle.y)) > 200) bad++
            }
        }
        r.check('every wizard tower stands within guard reach (all 60 worlds of seeds 1–20)',
            bad === 0, `out-of-reach towers: ${bad}`)
    }
    {
        // Twelve books can crowd the mid-height band; the spread fallback must
        // never leave a grimoire unplaced on any seed or level.
        let missing = 0
        for (let s = 1; s <= 40 && missing === 0; s++) {
            for (const lv of [0, 1, 2]) if (makeGame(s, lv).books.length !== 12) missing++
        }
        r.check('all twelve grimoires are placed in every world of seeds 1–40 (spread fallback holds)',
            missing === 0, `worlds short of twelve books: ${missing}`)
    }
}

// ---- #1668: DISSOLVE — the 11th spell erases land, it does not crack it.
// The clamp (min(h, WATER−dip)) guarantees the wound floods even on the
// highest peak — a crater()-style subtraction would only bite low ground, and
// that is the mutant: replace the clamp line with crater(gs,x,y,DISSOLVE_R,
// DISSOLVE_SINK,0) and the flood-on-peak gate goes red. Delete the hut splice
// and the dissolve/keep gates go red; add igniteHuts inside dissolveLand and
// the cold-promise gate goes red. Mutants proven once, 2026-11-06.
{
    r.check('dissolve is the 11th spell: cost 40, its grimoire waits in the world',
        SPILLS.length === 12 && SPILLS[10].id === 'dissolve' && spellById('dissolve').cost === 40 &&
        fresh.books.some((b) => b.id === 'dissolve'), `n=${SPILLS.length}`)
    {
        // The signature: clamp-flood on the HIGHEST ground on the map — no
        // terrain in any world is high enough to keep its dry land.
        const gs = makeGame(7)
        let hx = 0, hy = 0, hh = -1
        for (let j = 0; j < GRID; j++) {
            for (let i = 0; i < GRID; i++) {
                const h = gs.heights[j * GRID + i]
                if (h > hh) { hh = h; hx = i * CELL + CELL / 2; hy = j * CELL + CELL / 2 }
            }
        }
        dissolveLand(gs, hx, hy)
        settleGround(gs) // #1694: the wound opens over the window — read the drowned land after it
        r.check('dissolve floods guaranteed: even the highest peak sinks below the sea',
            hh > WATER + 40 && sampleH(gs, hx, hy) < WATER,
            `peak ${hh.toFixed(1)} → ${sampleH(gs, hx, hy).toFixed(1)} (sea ${WATER})`)
        const hEdge = (() => { const g2 = makeGame(7); return sampleH(g2, wrap(hx + DISSOLVE_R + 8, MAP), hy) })()
        r.check('the flood is local: outside DISSOLVE_R the map is unmoved',
            Math.abs(sampleH(gs, wrap(hx + DISSOLVE_R + 8, MAP), hy) - hEdge) < 0.01,
            `edge ${hEdge.toFixed(1)}→${sampleH(gs, wrap(hx + DISSOLVE_R + 8, MAP), hy).toFixed(1)}`)
        const sink = WATER - gs.heights[Math.floor(hy / CELL) * GRID + Math.floor(hx / CELL)]
        r.check('the wound floor cell sits DISSOLVE_SINK below sea at the centre',
            Math.abs(sink - DISSOLVE_SINK) < 0.01, `sink ${sink.toFixed(2)} (raw cell; sampleH reads ~3 with the bilinear neighbour mix)`)
    }
    {
        // Huts dissolve — swallowed whole, no burning, no rubble. The far hut
        // keeps its spot; each loss announces itself for the FX layer.
        const gs = makeGame(7)
        const px = wrap(gs.castle.x + 80, MAP), py = wrap(gs.castle.y + 80, MAP)
        gs.huts.length = 0
        gs.huts.push({ x: wrap(px + 4, MAP), y: py, v: 1, burn: 0, dead: false, catchT: 0 })
        gs.huts.push({ x: wrap(px - 10, MAP), y: wrap(py + 8, MAP), v: 0, burn: 0, dead: false, catchT: 0 })
        gs.huts.push({ x: wrap(px + DISSOLVE_R + 15, MAP), y: py, v: 2, burn: 0, dead: false, catchT: 0 })
        const n0 = gs.huts.length
        dissolveLand(gs, px, py)
        const hutsEv = gs.events.filter((e) => e.type === 'dissolveHut')
        const ev = gs.events.find((e) => e.type === 'dissolve')
        r.check('huts inside the radius dissolve: gone, no burn, no rubble',
            gs.huts.length === n0 - 2 && hutsEv.length === 2 && gs.huts[0] &&
            Math.hypot(wrapD(gs.huts[0].x - (px + DISSOLVE_R + 15)), wrapD(gs.huts[0].y - py)) < 1,
            `huts ${n0}→${gs.huts.length}, events ${hutsEv.length}`)
        r.check('the dissolve event carries its ring and count — the FX fuel',
            !!ev && ev.r === DISSOLVE_R && ev.huts === 2, JSON.stringify(ev))
    }
    {
        // The cold promise at the tower base: flood, yes — topple, burn, mark,
        // wound, or kill, no. The wizard keeps his standing island.
        const gs = makeGame(7)
        const tx = gs.wizard.tx, ty = gs.wizard.ty
        const wolf = gs.monsters.find((m) => m.kind === 'wolf')
        wolf.x = wrap(tx + 3, MAP); wolf.y = wrap(ty + 3, MAP)
        const cr0 = gs.craters.length, mk0 = gs.fireMarks.length, hp0 = gs.wizard.hp
        dissolveLand(gs, tx, ty)
        settleGround(gs) // #1694: flood reads after the sink window (the promise is unchanged)
        r.check('dissolve at the tower floods the base yet never topples, burns, marks or wounds',
            gs.towerDown === false && gs.craters.length === cr0 && gs.fireMarks.length === mk0 &&
            gs.wizard.hp === hp0 && sampleH(gs, tx, ty) < WATER,
            `down=${gs.towerDown} craters ${cr0}→${gs.craters.length} marks ${mk0}→${gs.fireMarks.length} hp ${gs.wizard.hp}`)
        r.check('creatures swim: a wolf in the flood survives (huts and land are the targets)',
            gs.monsters.includes(wolf))
    }
    {
        // Hand plumbing: pays from the pouch, denies when broke.
        const gs = makeGame(7)
        gs.learned.push('dissolve'); gs.mana = 100; gs.coolL = 0
        setHand(gs, 'L', 'dissolve')
        gs.events.length = 0
        step(gs, { castL: true })
        const paid = gs.mana === 60 && gs.events.some((e) => e.type === 'cast' && e.id === 'dissolve')
        gs.mana = 10; gs.coolL = 0; gs.events.length = 0
        step(gs, { castL: true })
        r.check('casting dissolve pays 40 from the pouch and denies when broke',
            paid && gs.mana === 10 && gs.events.some((e) => e.type === 'nomana'), `mana=${gs.mana}`)
    }
    {
        // The counter-spell pairing stays symmetric: RAISE drains the wound.
        const gs = makeGame(7)
        let hx = 0, hy = 0, hh = -1
        for (let j = 0; j < GRID; j++) {
            for (let i = 0; i < GRID; i++) {
                const h = gs.heights[j * GRID + i]
                if (h > hh) { hh = h; hx = i * CELL + CELL / 2; hy = j * CELL + CELL / 2 }
            }
        }
        dissolveLand(gs, hx, hy)
        settleGround(gs) // #1694: flooded reads after the wound opens fully
        const flooded = sampleH(gs, hx, hy) < WATER
        raiseTerrain(gs, hx, hy, 16, 14)
        settleGround(gs) // #1694: drain reads after the mound fully swells
        r.check('RAISE drains the dissolve wound — the counter-spell pairing holds',
            flooded && sampleH(gs, hx, hy) > WATER,
            `flooded=${flooded} after=${sampleH(gs, hx, hy).toFixed(1)}`)
    }
    {
        // Touch plumbing: the 11th tray cell equips DISSOLVE like any other.
        const gs = makeGame(7)
        gs.learned.push('dissolve')
        gs.book = true
        const cx = TRAY[0] + 10 * 14 + 7, cy = TRAY[1] + 8
        const hit = hudTap(gs, cx, cy)
        r.check('the touch tray reaches the 11th slot: tap equips DISSOLVE to the left hand',
            hit === 'equip' && gs.hands.L === 'dissolve' && gs.book === false,
            `hit=${hit} handL=${gs.hands.L}`)
        r.check('the twelve-slot tray still sits inside the HUD',
            TRAY[0] >= 0 && TRAY[0] + TRAY[2] <= W && TRAY[1] >= 0 && TRAY[1] + TRAY[3] <= H,
            `TRAY=${TRAY.join(',')}`)
    }
    {
        const castTwice = () => {
            const g = makeGame(21)
            g.learned.push('dissolve'); g.mana = 200
            setHand(g, 'L', 'dissolve'); step(g, { castL: true })
            for (let i = 0; i < 80; i++) step(g, {})
            return stateHash(g)
        }
        const a = castTwice(), b = castTwice()
        r.check('dissolve is deterministic: same seed + same cast → identical hash', a === b, `${a} vs ${b}`)
    }
}

// ---- #1680: CLONE — the 12th spell doubles the bestiary, never the land.
// Mutation guide (prove it can fail): delete `gs.monsters.push(cp)` in
// cloneAt (sim.js) and the litter/economy gates go red; replace the mirrored
// position with the original's (`nx = m.x; ny = m.y`) and the twin-stands-
// opposite gate goes red; move `toppleTower(gs, cx, cy)` into cloneAt and the
// cold-promise gate goes red; call rnd(gs) once inside cloneAt and the
// determinism gate goes red (rng-free contract). Mutants to prove on demand.
{
    r.check('clone is the 12th spell: cost 35, its grimoire waits in the world',
        SPILLS.length === 12 && SPILLS[11].id === 'clone' && spellById('clone').cost === 35 &&
        fresh.books.some((b) => b.id === 'clone'), `n=${SPILLS.length}`)
    {
        // The signature: everything in the ring gains a twin at the MIRRORED
        // position across the cast point, at its kind's full spawn health;
        // what stands outside keeps its solitude.
        const gs = makeGame(7)
        gs.monsters.length = 0
        const px = 100, py = 100
        const wolf = { kind: 'wolf', x: wrap(px + 8, MAP), y: py, hp: SPAWN_HP.wolf, dir: 1.2, cool: 0, wanderT: 0, lostT: 0 }
        const cow = { kind: 'cow', x: px, y: wrap(py - 14, MAP), hp: SPAWN_HP.cow, dir: 2.5, cool: 0, wanderT: 0, lostT: 0 }
        const giant = { kind: 'giant', x: wrap(px + CLONE_R + 12, MAP), y: py, hp: SPAWN_HP.giant, dir: 0.5, cool: 0, wanderT: 0, lostT: 0 }
        gs.monsters.push(wolf, cow, giant)
        const litter = cloneAt(gs, px, py)
        const twins = gs.monsters.filter((m) => m !== wolf && m !== cow && m !== giant)
        const mirrorOK = (orig, cp) => {
            const dx = wrapD(orig.x - px), dy = wrapD(orig.y - py)
            const d = Math.hypot(dx, dy)
            const md = Math.max(d, 6)
            const ux = d >= 1 ? dx / d : 1, uy = d >= 1 ? dy / d : 0
            return Math.abs(wrapD(cp.x - wrap(px - ux * md, MAP))) < 1e-6 &&
                Math.abs(wrapD(cp.y - wrap(py - uy * md, MAP))) < 1e-6
        }
        const tw = twins.find((m) => m.kind === 'wolf')
        const tc = twins.find((m) => m.kind === 'cow')
        r.check('clone doubles everything inside CLONE_R at the mirrored spot, at full spawn HP',
            litter.length === 2 && twins.length === 2 && !!tw && !!tc &&
            tw.hp === SPAWN_HP.wolf && tc.hp === SPAWN_HP.cow &&
            mirrorOK(wolf, tw) && mirrorOK(cow, tc),
            `litter=${litter.length} twins=${twins.map((m) => m.kind).join(',')} mirrored=${!!tw && mirrorOK(wolf, tw)}`)
        r.check('the pack outside the ring keeps its solitude', gs.monsters.includes(giant) && twins.every((m) => m.kind !== 'giant'))
        const ev = gs.events.find((e) => e.type === 'clone')
        r.check('the clone event carries ring, count and per-twin spots — the FX fuel',
            !!ev && ev.r === CLONE_R && ev.count === 2 && ev.copies.length === 2 &&
            ev.copies.every((c) => Number.isFinite(c.x) && Number.isFinite(c.y)),
            JSON.stringify(ev && { r: ev.r, count: ev.count, copies: ev.copies.length }))
        r.check('a doubled wolf is a real monster: it joins the sim and dies for the ordinary bounty',
            (() => {
                gs.learned.push('shatter'); gs.mana = 100; gs.coolL = 0
                setHand(gs, 'L', 'shatter')
                const kills0 = gs.kills, pearls0 = gs.pearls.length
                shatterAt(gs, px, py) // both originals AND both twins stand within SHATTER_R of the cast point (8u and 14u out)
                return gs.kills === kills0 + 4 && gs.pearls.length > pearls0 && gs.monsters.includes(giant)
            })(),
            'bounty economy: originals and twins all pay like their kind (kill count proves it)')
    }
    {
        // The cold promise: clone touches the bestiary ONLY — heights, craters,
        // fire, huts, pearls, books, wizard and tower all untouched. Deleting
        // this promise is the classic blast-shaped mutant.
        const gs = makeGame(7)
        gs.learned.push('clone'); gs.mana = 100; gs.coolL = 0
        setHand(gs, 'L', 'clone')
        // Aim through the REAL look point (the arrow the cast lands on), so
        // this gate proves the cast path end to end, not just cloneAt.
        const lp = lookPoint(gs)
        const wolf = gs.monsters.find((m) => m.kind === 'wolf')
        gs.monsters.length = 0
        gs.monsters.push(wolf)
        wolf.x = lp.x; wolf.y = lp.y
        const h0 = gs.heights.slice(), cr0 = gs.craters.length, mk0 = gs.fireMarks.length
        const hut0 = gs.huts.length, prl0 = gs.pearls.reduce((a, p) => a + (p.alive ? p.m : 0), 0)
        const whp0 = gs.wizard.hp, books0 = gs.books.length, mons0 = gs.monsters.length
        gs.events.length = 0
        step(gs, { castL: true })
        const heightsSame = gs.heights.every((h, i) => h === h0[i])
        const prl1 = gs.pearls.reduce((a, p) => a + (p.alive ? p.m : 0), 0)
        r.check('casting clone pays 35 from the pouch',
            gs.mana === 65 && gs.events.some((e) => e.type === 'cast' && e.id === 'clone'), `mana=${gs.mana}`)
        r.check('the land never feels clone: no height change, no crater, no fire, no hut lost, no topple',
            heightsSame && gs.craters.length === cr0 && gs.fireMarks.length === mk0 &&
            gs.huts.length === hut0 && gs.towerDown === false,
            `heights same=${heightsSame} craters ${cr0}→${gs.craters.length} marks ${mk0}→${gs.fireMarks.length} huts ${hut0}→${gs.huts.length}`)
        r.check('no free mana: clone spawns no pearls — only kills pay',
            prl1 === prl0 && gs.books.length === books0 && gs.wizard.hp === whp0,
            `pearls ${prl0}→${prl1}`)
        r.check('one cast, one twin: the wolf in the ring stands twice',
            gs.monsters.length === mons0 + 1 && gs.monsters.includes(wolf),
            `monsters ${mons0}→${gs.monsters.length}`)
    }
    {
        // The wizard is unique: clone at his tower and the bestiary grows, but
        // he never does.
        const gs = makeGame(7)
        const n0 = gs.monsters.length
        const litter = cloneAt(gs, gs.wizard.tx, gs.wizard.ty)
        r.check('the wizard is never cloned: no second wizard, only creatures answered',
            gs.wizard.alive && litter.every((c) => c.kind !== 'wizard') && gs.monsters.length === n0 + litter.length,
            `litter=${litter.length}`)
    }
    {
        // Empty ring and the world guard: an honest miss still announces
        // itself; CLONE_MAX keeps ring-upon-ring from melting the sim.
        const gs = makeGame(7)
        gs.monsters.length = 0
        gs.events.length = 0
        const litter = cloneAt(gs, 250, 250)
        r.check('an empty ring is an honest miss: zero twins, the event still lands',
            litter.length === 0 && gs.events.some((e) => e.type === 'clone' && e.count === 0))
        const g2 = makeGame(7)
        g2.monsters.length = 0
        for (let i = 0; i < CLONE_MAX; i++) g2.monsters.push({ kind: 'cow', x: wrap(10 + i, MAP), y: 10, hp: SPAWN_HP.cow, dir: 0, cool: 0, wanderT: 0, lostT: 0 })
        cloneAt(g2, 10, 10)
        r.check('CLONE_MAX holds even when a full ring of cows asks for doubles',
            g2.monsters.length === CLONE_MAX, `monsters=${g2.monsters.length}`)
    }
    {
        // Pouch denial: broke is broke.
        const gs = makeGame(7)
        gs.learned.push('clone'); gs.mana = 10; gs.coolL = 0
        setHand(gs, 'L', 'clone')
        gs.events.length = 0
        step(gs, { castL: true })
        r.check('no mana, no twins: clone denied',
            gs.events.some((e) => e.type === 'nomana') && gs.mana === 10, `mana=${gs.mana}`)
    }
    {
        // Touch plumbing: the 12th tray cell equips CLONE like any other.
        const gs = makeGame(7)
        gs.learned.push('clone')
        gs.book = true
        const cx = TRAY[0] + 11 * 14 + 7, cy = TRAY[1] + 8
        const hit = hudTap(gs, cx, cy)
        r.check('the touch tray reaches the 12th slot: tap equips CLONE to the left hand',
            hit === 'equip' && gs.hands.L === 'clone' && gs.book === false,
            `hit=${hit} handL=${gs.hands.L}`)
    }
    {
        const castTwice = () => {
            const g = makeGame(21)
            g.learned.push('clone'); g.mana = 200
            setHand(g, 'L', 'clone'); step(g, { castL: true })
            for (let i = 0; i < 80; i++) step(g, {})
            return stateHash(g)
        }
        const a = castTwice(), b = castTwice()
        r.check('clone is deterministic (rng-free contract): same seed + same cast → identical hash', a === b, `${a} vs ${b}`)
    }
}

// ---- #1612 item 4: behind the veil the WORLD muffles. muffleOf(gs) is the pure
// cutoff the shell drives its ambience low-pass from — open when visible, a short
// closed band while veiled, back to open on expiry, and it never touches the rules
// or the hash. The veil is the only thing that muffles (no shield/heal tie-in).
// Mutation guide: read gs.shield instead of gs.invis in muffleOf and the visible/
// veiled gates flip; hardcode OPEN and the veiled gate goes red.
{
    const veil = (gs) => { gs.learned.push('invisibility'); setHand(gs, 'L', 'invisibility'); gs.mana = 40; step(gs, { castL: true }) }
    const vis = makeGame(7)
    r.check('a visible carpet hears the world open (muffleOf = OPEN_CUTOFF)',
        muffleOf(vis) === OPEN_CUTOFF, `${muffleOf(vis)}`)
    const gs = makeGame(7)
    veil(gs)
    r.check('casting the veil drops the world cutoff to MUFFLE_CUTOFF',
        muffleOf(gs) === MUFFLE_CUTOFF, `${muffleOf(gs)}`)
    // Pure: the readout must not nudge the sim (same discipline as the tray).
    const h0 = stateHash(gs); muffleOf(gs); const h1 = stateHash(gs)
    r.check('muffleOf is a pure read — it never disturbs the state hash', h0 === h1, `${h0} vs ${h1}`)
    // Recovery: the bed opens back up the tick the veil lifts.
    let i = 0
    while (gs.invis > 0 && i < INVIS_T + 10) { step(gs, {}); gs.events.length = 0; i++ }
    r.check('the world opens again the tick the veil expires',
        gs.invis === 0 && muffleOf(gs) === OPEN_CUTOFF, `invis=${gs.invis} cutoff=${muffleOf(gs)}`)
    // Only invisibility muffles: a shielded/healing carpet is still heard clearly.
    const shielded = makeGame(7)
    shielded.shield = 500; shielded.hp = shielded.hp + 1
    r.check('the veil alone muffles — shield or heal never closes the bed',
        muffleOf(shielded) === OPEN_CUTOFF, `${muffleOf(shielded)}`)
    r.check('the muffle band is genuinely narrow (MUFFLE_CUTOFF well below open)',
        MUFFLE_CUTOFF > 100 && MUFFLE_CUTOFF < 1200 && OPEN_CUTOFF > 10000 && MUFFLE_CUTOFF < OPEN_CUTOFF / 10,
        `muffle ${MUFFLE_CUTOFF}Hz vs open ${OPEN_CUTOFF}Hz`)
}

// ---- #1612 mobile spellbook: the HUD itself equips hands, like the original's
// mouse-first UI. hudTap is pure (sim.js), so the whole touch path — slots cycle,
// gold book tab opens the tray, learned cells assign the left hand, click-out
// closes without casting — is proven without a browser. The tray is UI state:
// it must never disturb the sim hash. Mutation guide: make hudTap return 'world'
// for a slotL tap (the pre-fix behavior) and the slot gates go red; mix gs.book
// into stateHash and the determinism gate goes red.
{
    const ctr = (r) => [r[0] + r[2] / 2, r[1] + r[3] / 2]
    const [slx, sly] = ctr(TAP.slotL)
    const [srx, sry] = ctr(TAP.slotR)
    const [bkx, bky] = ctr(TAP.book)
    const gs = makeGame(7)
    gs.learned.push('heal', 'invisibility')
    r.check('tapping a hand slot cycles that hand through learned spells (touch parity with 1-7/Q)',
        hudTap(gs, slx, sly) === 'slotL' && gs.hands.L === 'heal' &&
        hudTap(gs, slx, sly) === 'slotL' && gs.hands.L === 'invisibility' &&
        hudTap(gs, slx, sly) === 'slotL' && gs.hands.L === 'fireball' &&
        hudTap(gs, srx, sry) === 'slotR' && gs.hands.R === 'fireball' &&
        hudTap(gs, srx, sry) === 'slotR' && gs.hands.R === 'heal',
        `L=${gs.hands.L} R=${gs.hands.R}`)
    r.check('slot taps emit equip events (the shell sounds and names them)',
        gs.events.filter((e) => e.type === 'equip').length === 5)
    const handsBefore = `${gs.hands.L}/${gs.hands.R}`
    r.check('a world tap stays a cast — nothing equips above the strip',
        hudTap(gs, 160, 80) === 'world' && `${gs.hands.L}/${gs.hands.R}` === handsBefore)
    r.check('the dead HUD strip never fires a stray cast',
        hudTap(gs, 100, H - HUD_H + 8) === 'none')
    r.check('the gold book tab toggles the spell tray',
        hudTap(gs, bkx, bky) === 'book' && gs.book === true &&
        hudTap(gs, bkx, bky) === 'book' && gs.book === false)
    {
        gs.book = true
        const i = SPILLS.findIndex((sp) => sp.id === 'invisibility')
        const cx = TRAY[0] + i * 14 + 7, cy = TRAY[1] + 8
        r.check('tapping a learned tray cell assigns the LEFT hand and closes the book',
            hudTap(gs, cx, cy) === 'equip' && gs.hands.L === 'invisibility' && gs.book === false)
        gs.book = true
        const j = SPILLS.findIndex((sp) => !gs.learned.includes(sp.id))
        const ux = TRAY[0] + j * 14 + 7, uy = TRAY[1] + 8
        r.check('unlearned tray cells are inert — no equip, book stays open',
            hudTap(gs, ux, uy) === 'none' && gs.hands.L === 'invisibility' && gs.book === true)
        gs.hands.L = 'fireball'
        r.check('clicking out while the tray is open closes it WITHOUT casting',
            hudTap(gs, 160, 60) === 'close' && gs.book === false && gs.hands.L === 'fireball')
    }
    r.check('every touch hit box lives inside the 320×200 HUD',
        [...Object.values(TAP), TRAY].every((b) => b[0] >= 0 && b[1] >= 0 && b[0] + b[2] <= W && b[1] + b[3] <= H))
    {
        const a = makeGame(9)
        const b = makeGame(9)
        // Open/close the tray mid-run: pure UI, the sim must not notice.
        // (Equipping is NOT tested here — it changes hands on purpose.)
        for (let i = 0; i < 300; i++) {
            step(a, {}); step(b, {})
            if (i === 50) hudTap(b, bkx, bky)
            if (i === 90) hudTap(b, 160, 60)
            if (i === 200) hudTap(b, bkx, bky)
        }
        r.check('the spellbook UI never disturbs the simulation — hashes match a clean run',
            stateHash(a) === stateHash(b) && b.book === true,
            `${stateHash(a)} vs ${stateHash(b)} (book ${b.book})`)
    }
    {
        const gs2 = makeGame(7)
        gs2.book = true
        gs2.learned.push('slow')
        // Bank the whole world-1 quota at the castle: the level transition must
        // close an open book along with the rest of the world state.
        gs2.mana = gs2.quota + 20
        let t = 0
        while (gs2.level === 0 && t < 400) {
            gs2.x = gs2.castle.x; gs2.y = gs2.castle.y // hover: pin over the castle
            step(gs2, {}); t++
        }
        r.check('a world regen closes an open spellbook', gs2.level === 1 && gs2.book === false,
            `level ${gs2.level + 1} book ${gs2.book} bank ${Math.floor(gs2.bank)} at t=${t}`)
    }
}

// ---- #1764 item 1: the castle spell book — the menu at home ----------------
// The original's spell selection was a browseable book, and the book lives at
// the castle. The whole menu is sim-pure (bookOpen/bookKey/bookTap in
// sim.js), so this section proves it without a browser:
//   - the book opens ONLY at the castle (bank-by-delivery's own 26u rule);
//     away from it bookOpen is a flat refusal — a bookNo event, zero state
//   - while open, step() holds: tick, position, mana and hash all frozen
//   - pages wrap at twelve; digits jump; L/R arm the hands — learned only,
//     an unlearned page fizzles exactly like the tray does
//   - under an open book a tap never reaches the world (no stray cast)
//   - stateHash carries the book: an open book is a different world
// Mutation guide: drop the `if (gs.spellBook) return` freeze from step() and
// the freeze gate goes red; move the atCastle check out of bookOpen and the
// refusal gate goes red; remove spellBook from stateHash and the hash gate
// goes red.
{
    const at = (gs) => { gs.x = gs.castle.x; gs.y = gs.castle.y }
    const away = (gs) => { gs.x = wrap(gs.castle.x + 80, MAP); gs.y = gs.castle.y }

    r.check('atCastle is the bank rule itself (the 26u reach, no more)',
        (() => {
            const g = makeGame(7)
            g.x = wrap(g.castle.x + 25, MAP); g.y = g.castle.y
            const near = atCastle(g)
            g.x = wrap(g.castle.x + 27, MAP); g.y = g.castle.y
            return near === true && atCastle(g) === false
        })())
    {
        const a = makeGame(11)
        at(a)
        a.book = true // an open tray must give way to the book
        r.check('at the castle the book opens, and the tray gives way',
            bookOpen(a) === 'open' && a.spellBook === true && a.book === false && a.bookPage === 0)
        r.check('opening twice is a no-op', bookOpen(a) === 'none' && a.spellBook === true)
    }
    {
        const b = makeGame(11)
        away(b)
        const hb = stateHash(b)
        r.check('away from the castle the book refuses — a bookNo event, zero state change',
            bookOpen(b) === 'no' && b.spellBook === false && b.events.some((e) => e.type === 'bookNo') &&
            stateHash(b) === hb,
            `spellBook=${b.spellBook} hash ${hb} vs ${stateHash(b)}`)
    }
    {
        const c = makeGame(11)
        at(c)
        bookOpen(c)
        c.mana = 50
        const hc = stateHash(c)
        const tc = c.tick
        for (let i = 0; i < 60; i++) step(c, { left: true, up: true, castL: true })
        r.check('while the book is open the world holds its breath — driving input included',
            c.tick === tc && stateHash(c) === hc && c.mana === 50,
            `tick ${tc} -> ${c.tick} hash ${hc} vs ${stateHash(c)}`)
        bookClose(c)
        step(c, {})
        r.check('closing the book lets the world breathe again', c.tick === tc + 1, `tick ${tc} -> ${c.tick}`)
    }
    {
        const d = makeGame(11)
        at(d)
        bookOpen(d)
        r.check('pages wrap at twelve in both directions',
            bookKey(d, 'right') === 'page' && d.bookPage === 1 &&
            bookKey(d, 'left') === 'page' && d.bookPage === 0 &&
            bookKey(d, 'left') === 'page' && d.bookPage === 11 &&
            bookKey(d, 'right') === 'page' && d.bookPage === 0,
            `page ${d.bookPage}`)
        r.check('a digit jumps straight to its page', bookKey(d, 7) === 'page' && d.bookPage === 7)
    }
    {
        const e = makeGame(11)
        at(e)
        bookOpen(e)
        e.learned.push('lightning')
        bookKey(e, 1) // the LIGHTNING page
        r.check('L arms the learned page to the left hand',
            bookKey(e, 'L') === 'equip' && e.hands.L === 'lightning')
        r.check('R arms the same page to the right hand (a spell may live in both hands)',
            bookKey(e, 'R') === 'equip' && e.hands.R === 'lightning')
        bookKey(e, 4) // SLOW TIME — unlearned
        r.check('an unlearned page fizzles — no arm, the hands keep their spells',
            bookKey(e, 'L') === 'no' && e.hands.L === 'lightning' && e.events.some((ev) => ev.type === 'fizzle'))
        const he = stateHash(e)
        bookKey(e, 11) // CLONE — unlearned, far page (the page turn itself moves the hash)
        const he2 = stateHash(e)
        bookKey(e, 'R')
        r.check('fizzling on a far page changes nothing — hands and hash steady on that page',
            e.hands.R === 'lightning' && stateHash(e) === he2,
            `R=${e.hands.R} hash ${he2} vs ${stateHash(e)}`)
    }
    {
        const f = makeGame(11)
        at(f)
        bookOpen(f)
        f.learned.push('heal')
        const mana0 = f.mana
        r.check('book taps page, select and equip — the left column wraps to the last page',
            bookTap(f, 24, 96) === 'page' && f.bookPage === 11 &&
            bookTap(f, 296, 96) === 'page' && f.bookPage === 0 &&
            bookTap(f, 100, BOOK.row0 + 2 * BOOK.rowH + 4) === 'page' && f.bookPage === 2,
            `page ${f.bookPage}`)
        r.check('the L HAND button arms the selected learned page (HEAL)',
            bookTap(f, BOOK.btnL[0] + 10, BOOK.btnL[1] + 10) === 'equip' && f.hands.L === 'heal')
        r.check('the R HAND button arms the right hand',
            bookTap(f, BOOK.btnR[0] + 10, BOOK.btnR[1] + 10) === 'equip' && f.hands.R === 'heal')
        r.check('CLOSE shuts the book', bookTap(f, BOOK.btnC[0] + 10, BOOK.btnC[1] + 10) === 'close' && f.spellBook === false)
        r.check('a tap under the book never reaches the world (no stray cast)',
            (() => {
                bookOpen(f)
                const hf = stateHash(f)
                const res = hudTap(f, 160, 60)
                const steady = stateHash(f) === hf && f.mana === mana0
                bookClose(f)
                return res === 'none' && steady
            })())
        r.check('the very same tap with the book shut would have cast — the book is what stops it',
            (() => { const g = makeGame(11); at(g); return hudTap(g, 160, 60) === 'world' })())
    }
    {
        const s1 = makeGame(11)
        at(s1)
        const h1 = stateHash(s1)
        bookOpen(s1)
        const s2 = makeGame(11)
        at(s2)
        bookOpen(s2)
        r.check('stateHash carries the open book', stateHash(s1) !== h1 && stateHash(s1) === stateHash(s2))
        bookKey(s1, 'right')
        r.check('...and the page it sits on', stateHash(s1) !== stateHash(s2) && stateHash(s1) !== h1)
        bookClose(s1)
        r.check('closing returns the hash to the pre-book world', stateHash(s1) === h1)
    }
    r.check('genWorld closes the book (a fresh world is a closed book)',
        (() => { const g = makeGame(7); g.spellBook = true; g.bookPage = 5; genWorld(g); return g.spellBook === false && g.bookPage === 0 })())
    r.check('every book hit box lives inside the 320×200 surface, rows clear the band',
        [BOOK.btnL, BOOK.btnR, BOOK.btnC, BOOK_PROMPT].every((b) => b[0] >= 0 && b[1] >= 0 && b[0] + b[2] <= W && b[1] + b[3] <= H) &&
        BOOK.row0 + BOOK.rowH * SPILLS.length <= BOOK.band && BOOK.colL < BOOK.colR,
        `rows end ${BOOK.row0 + BOOK.rowH * SPILLS.length} band ${BOOK.band}`)
}

// ---- #1764 item 3: village life, stage 1 — the huts are homes ------------
// The original's villages were alive: villagers kept to their home lane,
// broke into a run when fire or lightning came, and burned if caught in the
// flames. Stage 1 ships exactly that (no convert/burn/prisoner economy yet —
// they are neutral: no mana, no bounty, never hostile). All rules are sim
// pure, so the whole village is Node-provable.
// Mutation guide (prove it can fail): (1) make the wander radius 0
// (`VIL_WANDER_R = 0`) → the wander/return gates go red; (2) drop the
// `fear` flee branch (villagers never set dir away) → the fire + lightning
// panic gates go red; (3) remove the `d < VIL_FLAME_R` splice → the burn gate
// goes red and the hash gate (census changed) goes red too.
{
    const homeOf = (v) => ({ x: v.hx, y: v.hy })
    const fresh = makeGame(7)
    r.check('every hut houses 2–3 villagers (14–21 for seven huts), all on land near home',
        fresh.villagers.length >= 14 && fresh.villagers.length <= 21 &&
        fresh.villagers.every((v) => Math.hypot(wrapD(v.x - v.hx), wrapD(v.y - v.hy)) <= 10 && v.v >= 0 && v.v < 3),
        `census=${fresh.villagers.length} variants=${[...new Set(fresh.villagers.map((v) => v.v))].join('')}`)
    r.check('the village census is deterministic (two fresh worlds agree villager-by-villager)',
        (() => {
            const a = makeGame(7).villagers, b = makeGame(7).villagers
            return a.length === b.length && a.every((v, i) => v.x === b[i].x && v.y === b[i].y && v.v === b[i].v)
        })())
    {
        const gs = makeGame(7)
        const spawn = gs.villagers.map((v) => ({ x: v.x, y: v.y }))
        for (let i = 0; i < 300; i++) step(gs, {})
        r.check('villagers wander: they move on idle ticks and stay inside their home lane',
            gs.villagers.every((v, i) => Math.hypot(wrapD(v.x - spawn[i].x), wrapD(v.y - spawn[i].y)) > 1) &&
            gs.villagers.every((v) => Math.hypot(wrapD(v.x - v.hx), wrapD(v.y - v.hy)) <= VIL_WANDER_R + 2),
            `max home-dist=${Math.max(...gs.villagers.map((v) => Math.hypot(wrapD(v.x - v.hx), wrapD(v.y - v.hy)))).toFixed(1)}`)
    }
    {
        // Fire in the lane: every villager inside the panic ring (and outside
        // the flame) ends FARTHER from the burning hut, not closer.
        const gs = makeGame(7)
        const hut = gs.huts[0]
        const inRing = gs.villagers
            .map((v) => ({ v, d0: Math.hypot(wrapD(v.x - hut.x), wrapD(v.y - hut.y)) }))
            .filter((o) => o.d0 >= VIL_FLAME_R && o.d0 < VIL_PANIC_R)
        hut.burn = 200
        for (let i = 0; i < 40; i++) step(gs, {})
        const ok = inRing.length > 0 && inRing.every(({ v, d0 }) =>
            gs.villagers.includes(v) && Math.hypot(wrapD(v.x - hut.x), wrapD(v.y - hut.y)) > d0)
        r.check('a burning hut sends the lane running: every villager in the panic ring ends farther from the fire',
            ok, `in-ring=${inRing.length} after=${inRing.map(({ v, d0 }) => `${d0.toFixed(0)}→${Math.hypot(wrapD(v.x - hut.x), wrapD(v.y - hut.y)).toFixed(0)}`).join(' ')}`)
    }
    {
        // Caught in the flames: a villager inside the flame radius burns where
        // they stand — one `villager` burn event, census minus one, and the
        // burn pays no mana (stage 1 is neutral: no bounty, no economy yet).
        // Everyone else is moved well outside the ring first: villagers spawn
        // 2–10u from their hut, so a second one can sit inside the flame and
        // burn too — the rule is "everyone in the ring burns", and this gate
        // wants exactly one body.
        const gs = makeGame(7)
        const hut = gs.huts[1]
        const vl = gs.villagers[0]
        for (const o of gs.villagers) if (o !== vl) { o.x = wrap(hut.x + 100, MAP); o.y = wrap(hut.y + 100, MAP) }
        vl.x = wrap(hut.x + 3, MAP); vl.y = hut.y
        const mana = gs.mana, census = gs.villagers.length
        const h0 = stateHash(gs)
        hut.burn = 200
        gs.events.length = 0
        step(gs, {})
        const ev = gs.events.find((e) => e.type === 'villager')
        r.check('a villager in the flame burns where they stand (burn event, census −1, no mana paid)',
            ev && ev.what === 'burn' && Math.hypot(wrapD(ev.x - vl.x), wrapD(ev.y - vl.y)) < 0.01 &&
            gs.villagers.length === census - 1 && gs.mana === mana && stateHash(gs) !== h0,
            `ev=${ev ? ev.what : 'none'} census ${census}→${gs.villagers.length} mana=${mana}→${gs.mana}`)
    }
    {
        // Lightning in the lane: the bolt's strike point is a scare point —
        // villagers inside the ring panic on the cast tick, villagers far from
        // the strike stay calm. (Scare radii match the fire ring on purpose:
        // one "the ground just took a hit" rule for every impact.) Ring
        // membership is decided by the PRE-step distance: the scare runs on
        // the cast tick, before the villagers move, so post-step positions
        // straddle the boundary (a panicked villager has already fled 0.9u,
        // a calm one may have wandered toward the strike).
        const gs = makeGame(7)
        const target = gs.huts[3]
        gs.learned.push('lightning')
        setHand(gs, 'L', 'lightning')
        gs.mana = 30; gs.coolL = 0
        gs.x = wrap(target.x - 60, MAP); gs.y = target.y; gs.yaw = 0
        gs.events.length = 0
        const pre = gs.villagers.map((v) => ({ v, x: v.x, y: v.y }))
        step(gs, { castL: true })
        const zap = gs.events.find((e) => e.type === 'zap')
        const d0 = (o) => Math.hypot(wrapD(o.x - zap.x), wrapD(o.y - zap.y))
        const near = pre.filter((o) => d0(o) < VIL_PANIC_R - 1)
        const far = pre.filter((o) => d0(o) > VIL_PANIC_R + 1)
        r.check('lightning in the lane scares only the ring: inside panics on the cast tick, far stays calm',
            !!zap && near.length > 0 && near.every((o) => o.v.panicT > 0) && far.every((o) => o.v.panicT === 0),
            `near=${near.length} panicked=${near.filter((o) => o.v.panicT > 0).length} far=${far.length} calm=${far.filter((o) => o.v.panicT === 0).length}`)
    }
    {
        // The run ends at the door: a villager stranded beyond the lane walks
        // home (dir points at the hut once they are past the edge), and the
        // scareVillagers export is the same ring rule the impacts use.
        const gs = makeGame(7)
        const vl = gs.villagers[0]
        vl.x = wrap(vl.hx + 60, MAP); vl.y = vl.hy; vl.dir = Math.PI
        step(gs, {})
        const homeAng = Math.atan2(wrapD(vl.hy - vl.y), wrapD(vl.hx - vl.x))
        const dAng = (a, b) => Math.abs(((a - b + Math.PI) % (Math.PI * 2)) - Math.PI)
        r.check('a villager past the lane edge walks home (dir points at the hut)',
            dAng(vl.dir, homeAng) < 0.01, `dir=${vl.dir.toFixed(2)} want=${homeAng.toFixed(2)}`)
        scareVillagers(gs, vl.x, vl.y)
        r.check('scareVillagers sets the ring (panicT + away dir) and leaves the far ones untouched',
            vl.panicT > 0 && gs.villagers.some((o) => o !== vl && Math.hypot(wrapD(o.x - vl.x), wrapD(o.y - vl.y)) > VIL_PANIC_R + 1 && o.panicT === 0))
    }
    {
        const src = await readFile(new URL('../src/games/MagicCarpet/renderer.js', import.meta.url), 'utf8')
        const art = await readFile(new URL('../src/games/MagicCarpet/art.js', import.meta.url), 'utf8')
        r.check('the world pass draws the village (billboards from the atlas, one tile per tunic variant)',
            src.includes('villager${vl.v}') && src.includes('villager0:') && art.includes('drawVillager'),
            'source pin')
    }
}

// ---- #1764 item 3: village life, stage 2 — the village economy ------------
// The original's signature loop: descend into the lanes, snag a villager by
// touch (the catch band is the wolf band — altitude is armor AND the price of
// a prisoner), fly the prisoner to your castle, and the home hut converts:
// pennant up, and it pays a 2-man pearl every VIL_TRIBUTE_T ticks. The other
// path burns the hut for its savings. All sim-pure, so Node-provable.
// Mutation guide (prove it can fail): (1) drop the
// `gs.alt <= sampleH(...) + VIL_GRAB_ALT` condition in the grab block → the
// band gates go red; (2) delete `hs.ally = true` in the delivery block → the
// convert gate goes red (the tribute dies with it); (3) remove the
// `dropPearls(...)` call in the hutDown branch → the burn-loot gate goes red;
// (4) delete the prisoner release in hurtPlayer → the death gate goes red;
// (5) drop the `gs.prisoner`/`hs.ally` mixes from stateHash → the hash gates
// go red.
{
    const lowGrab = (seed = 7) => {
        const gs = makeGame(seed)
        const vl = gs.villagers[0]
        // Park on the villager at the floor (the lowest possible altitude —
        // always inside the band); one step drifts 2u forward, still inside
        // VIL_GRAB_R, and the grab reads post-move positions like the pearl
        // magnet. The wizard is fenced out: these gates are the economy's,
        // not his.
        gs.x = vl.x; gs.y = vl.y; gs.yaw = 0; gs.alt = 0
        gs.wizard.alive = false
        step(gs, {})
        return { gs, vl }
    }
    {
        const { gs, vl } = lowGrab()
        const ev = gs.events.find((e) => e.type === 'villager' && e.what === 'grab')
        r.check('a carpet at the floor over a villager snags them (grip set, lane −1, grab event)',
            !!gs.prisoner && gs.prisoner.hut === vl.hut && gs.prisoner.v === vl.v &&
            gs.villagers.length === fresh.villagers.length - 1 && !!ev,
            `prisoner=${gs.prisoner ? `hut${gs.prisoner.hut}/v${gs.prisoner.v}` : 'none'} lane=${gs.villagers.length} ev=${ev ? 'grab' : 'none'}`)
        const gs2 = makeGame(7)
        const vl2 = gs2.villagers[0]
        gs2.x = vl2.x; gs2.y = vl2.y; gs2.yaw = 0
        gs2.alt = sampleH(gs2, vl2.x, vl2.y) + VIL_GRAB_ALT + 1
        gs2.wizard.alive = false
        step(gs2, {})
        r.check('high flight over the same lane never snags (the band, not the distance, is the rule)',
            gs2.prisoner === null && gs2.villagers.length === fresh.villagers.length,
            `prisoner=${gs2.prisoner ? 'set' : 'none'} alt=${gs2.alt.toFixed(1)} band-ceiling=${(sampleH(gs2, vl2.x, vl2.y) + VIL_GRAB_ALT).toFixed(1)}`)
    }
    {
        const { gs } = lowGrab()
        const first = gs.prisoner
        const v2 = gs.villagers[0]
        gs.x = v2.x; gs.y = v2.y; gs.alt = 0
        step(gs, {})
        r.check('the grip holds one: a second touch in the band snags nothing',
            gs.prisoner === first && gs.villagers.length === fresh.villagers.length - 1,
            `prisoner=${gs.prisoner ? `hut${gs.prisoner.hut}` : 'none'} lane=${gs.villagers.length}`)
    }
    {
        const { gs } = lowGrab()
        const hi = gs.prisoner.hut
        const hut = gs.huts[hi]
        gs.x = gs.castle.x; gs.y = gs.castle.y; gs.alt = 52
        gs.shield = 1e9; gs.bank = 5
        step(gs, {})
        const ev = gs.events.find((e) => e.type === 'villager' && e.what === 'convert')
        r.check('delivering the prisoner at the castle converts the home hut (pennant up, tribute clock, grip empty)',
            gs.prisoner === null && hut.ally === true && hut.tributeT === VIL_TRIBUTE_T - 1 && !!ev && ev.hut === hi,
            `prisoner=${gs.prisoner ? 'held' : 'none'} ally=${hut.ally} tributeT=${hut.tributeT} ev=${ev ? 'convert' : 'none'}`)
        // The tribute is exactly on its clock: nothing early, the pearl at the hut.
        const t0 = gs.tick
        let trib = null
        for (let t = 0; t < VIL_TRIBUTE_T && !trib; t++) {
            gs.events.length = 0
            step(gs, {})
            trib = gs.events.find((e) => e.type === 'tribute')
        }
        const pearl = gs.pearls.find((p) => p.alive && p.m === VIL_TRIBUTE_M &&
            Math.hypot(wrapD(p.x - hut.x), wrapD(p.y - hut.y)) < 8)
        r.check('the converted hut pays tribute on the clock (2-man pearl at the hut, nothing early)',
            !!trib && gs.tick - t0 === VIL_TRIBUTE_T - 1 && !!pearl,
            `trib=${trib ? 'yes' : 'no'} after ${trib ? gs.tick - t0 : 'full window'} ticks pearl=${pearl ? 'at hut' : 'none'}`)
    }
    {
        const gs = makeGame(7)
        gs.wizard.alive = false
        const hs = gs.huts[2]
        hs.burn = 1
        let ev = null
        for (let t = 0; t < 260 && !ev; t++) {
            step(gs, {})
            ev = gs.events.find((e) => e.type === 'hutDown' && e.x === hs.x && e.y === hs.y)
        }
        const loot = gs.pearls.filter((p) => p.alive && Math.hypot(wrapD(p.x - hs.x), wrapD(p.y - hs.y)) < 10)
        const total = loot.reduce((a, p) => a + p.m, 0)
        r.check('a burned hut scatters its savings (4–8 man at the rubble; the hutDown carries the tell)',
            !!ev && ev.loot === true && hs.dead && total >= 4 && total <= 8 && loot.length >= 1,
            `ev=${ev ? `loot=${ev.loot}` : 'none'} pearls=${loot.length} man=${total}`)
    }
    {
        const gs = makeGame(7)
        gs.wizard.alive = false
        const hs = gs.huts[3]
        const n0 = gs.huts.length
        const p0 = gs.pearls.length
        dissolveLand(gs, hs.x, hs.y)
        const ev = gs.events.find((e) => e.type === 'dissolve')
        const newNear = gs.pearls.slice(p0).filter((p) => Math.hypot(wrapD(p.x - hs.x), wrapD(p.y - hs.y)) < 10)
        r.check('dissolve stays cold: a drowned hut is swallowed whole (gone from the world, no loot, no burn)',
            !!ev && gs.huts.length === n0 - ev.huts && !gs.huts.includes(hs) && newNear.length === 0 &&
            !gs.events.some((e) => e.type === 'hutDown'),
            `huts ${n0}→${gs.huts.length} gone=${ev ? ev.huts : 'no ev'} newPearlsNear=${newNear.length} hutDown=${gs.events.some((e) => e.type === 'hutDown')}`)
    }
    {
        const { gs, vl } = lowGrab()
        gs.bank = 5
        gs.monsters.push({ kind: 'wolf', x: gs.x, y: gs.y, hp: 50, dir: 0, cool: 0, wanderT: 0, lostT: 0 })
        gs.alt = sampleH(gs, gs.x, gs.y) + 5
        gs.hp = 5; gs.shield = 0; gs.safeT = 0
        const laneBefore = gs.villagers.length
        step(gs, {})
        const back = gs.villagers[gs.villagers.length - 1]
        r.check('death drops the prisoner where the carpet fell (lane +1, home kept, panicked, grip empty)',
            gs.prisoner === null && gs.villagers.length === laneBefore + 1 &&
            back.hut === vl.hut && back.panicT > 0 && gs.safeT > 0,
            `prisoner=${gs.prisoner ? 'held' : 'none'} lane ${laneBefore}→${gs.villagers.length} backHome=${back.hut === vl.hut} panic=${back.panicT}`)
    }
    {
        const { gs } = lowGrab()
        const h1 = stateHash(gs)
        const pr = gs.prisoner
        gs.prisoner = null
        const h2 = stateHash(gs)
        gs.prisoner = pr
        r.check('stateHash senses the grip (mutant: drop the prisoner mix → red)',
            h1 !== h2 && stateHash(gs) === h1, `${h1} vs ${h2}`)
        const { gs: g2 } = lowGrab()
        const hi2 = g2.prisoner.hut
        g2.x = g2.castle.x; g2.y = g2.castle.y; g2.alt = 52
        g2.shield = 1e9; g2.bank = 5
        step(g2, {})
        const h3 = stateHash(g2)
        g2.huts[hi2].ally = false
        r.check('stateHash senses the pennant (mutant: drop the ally mix → red)',
            h3 !== stateHash(g2), `${h3} vs ${stateHash(g2)}`)
    }
    {
        // The whole loop replayed: floor grab → carry home → convert → tribute.
        const script = (gs) => {
            if (gs.tick === 0) {
                const vl = gs.villagers[0]
                gs.x = vl.x; gs.y = vl.y; gs.yaw = 0; gs.alt = 0
                gs.wizard.alive = false; gs.shield = 1e9; gs.bank = 5
            } else if (gs.tick === 5 && gs.prisoner) {
                gs.x = gs.castle.x; gs.y = gs.castle.y; gs.alt = 52
            }
            return {}
        }
        const drive = () => {
            const gs = makeGame(7)
            for (let i = 0; i < 800 && !gs.end; i++) step(gs, script(gs))
            return gs
        }
        const s1 = drive(), s2 = drive()
        r.check('the whole economy replays bit-identical (grab → carry → convert → tribute)',
            stateHash(s1) === stateHash(s2) && s1.huts.some((h) => h.ally) &&
            s1.pearls.some((p) => p.alive && p.m === VIL_TRIBUTE_M),
            `hash ${stateHash(s1).slice(0, 6)}==${stateHash(s2).slice(0, 6)} ally=${s1.huts.some((h) => h.ally)} tributePearl=${s1.pearls.some((p) => p.alive && p.m === VIL_TRIBUTE_M)}`)
    }
}

// ---- HUD geometry: the score must stay inside the canvas (#1681)
// The score is the only HUD text pinned to a fixed x near the right edge. At
// x=302 in 7px monospace its six-digit box spanned [302, 327.2] against
// W=320, so the last digits were clipped in EVERY orientation (desktop
// full-bleed, portrait and landscape letterbox alike). Measure the extent the
// way the browser will: monospace advance is 0.6em (Chrome's default measured
// 0.6001em at 7px on 2026-11-06), digit count from the padStart.
// Mutation guide: restore `fillText(..., 302, y0 + 11)` left-aligned @7px → red.
{
    const hudSrc = await readFile(new URL('../src/games/MagicCarpet/index.jsx', import.meta.url), 'utf8')
    const lines = hudSrc.split('\n')
    const si = lines.findIndex((l) => /fillText\(String\(gs\.score\)\.padStart\(\d+,\s*'0'\)/.test(l))
    let fit = false, detail = 'score fillText not found'
    if (si >= 0) {
        const scoreLine = lines[si]
        const digits = +scoreLine.match(/padStart\((\d+),\s*'0'\)/)[1]
        const xExpr = scoreLine.match(/padStart\(\d+,\s*'0'\),\s*([^,]+),/)[1].trim()
        const wm = xExpr.match(/^W\s*-\s*(\d+)$/)
        const x = wm ? W - +wm[1] : parseFloat(xExpr)
        // Canvas state = last assignment wins: walk up to the nearest font and
        // textAlign before the fillText (they may be any number of lines apart).
        let fs = null, align = null
        for (let i = si - 1; i >= 0 && (fs === null || align === null); i--) {
            const fm = lines[i].match(/ctx\.font = '(\d+(?:\.\d+)?)px/)
            const am = lines[i].match(/ctx\.textAlign = '(\w+)'/)
            if (fm && fs === null) fs = parseFloat(fm[1])
            if (am && align === null) align = am[1]
        }
        if (fs === null) fs = 7
        if (align === null) align = 'left'
        const tw = digits * 0.6 * fs
        const [x0, x1] = align === 'right' ? [x - tw, x] : [x, x + tw]
        fit = x0 >= 0 && x1 <= W
        detail = `font ${fs}px ${align} x=${wm ? `W-${wm[1]}` : x} extent [${x0.toFixed(1)}, ${x1.toFixed(1)}] vs W=${W}`
    }
    r.check('HUD score fits inside the canvas (#1681)', fit, detail)
}

// ---- browser pass: boots in Chrome, starts, drives through the contract, zero errors
// ---- #1694: CRUMBLE RIPPLE — ground deformations unfold over ticks.
// Mutation guide (prove it can fail): (1) make crater() land instantly (append
// settleGround(gs) before its return) — the no-pop and rim gates go red while
// the convergence gates stay green (that IS the promise: honest landing);
// (2) swap sinkCurve for a linear ramp — the accelerate gate goes red (a real
// collapse starts gently: a quarter of the window must not sink half);
// (3) delete `gs.deforms = []` in genWorld — the fresh-world gate goes red;
// (4) cut the drainDeforms call in step() — the no-pop gate itself goes red
// (the queue never drains, nothing lands). All restored after proving.
{
    const giAt = (x, y) => Math.floor(wrap(y, MAP) / CELL) * GRID + Math.floor(wrap(x, MAP) / CELL)
    const cellD = (gi, x, y) => Math.hypot((gi % GRID + 0.5 - wrap(x, MAP) / CELL) * CELL, (Math.floor(gi / GRID) + 0.5 - wrap(y, MAP) / CELL) * CELL)
    {
        // Pure crater law: queue on cast → partial sink → honest landing.
        const gs = makeGame(7)
        gs.deforms.length = 0
        const base = gs.heights.slice()
        const X = 100, Y = 120, R = 14, D = 10
        crater(gs, X, Y, R, D)
        const gi0 = giAt(X, Y)
        const full = D * (1 - cellD(gi0, X, Y) / R) ** 2
        r.check('the land never pops: a crater queues and lands nothing on its cast tick',
            gs.deforms.length === 1 && gs.heights.every((h, i) => h === base[i]), `deforms=${gs.deforms.length}`)
        for (let t = 0; t < Math.floor(CRUMBLE_T / 4); t++) step(gs, {})
        const q = base[gi0] - gs.heights[gi0]
        r.check('collapse accelerates (ease-in): a quarter-window sinks a sliver, far under linear',
            q > 0.001 && q < full * 0.1, `sunk ${(q / full).toFixed(3)} of full at t=${Math.floor(CRUMBLE_T / 4)} (linear would read 0.20)`);
        const rimSeen = (() => {
            // capture the rim heave at mid-window: any ring cell strictly above base
            let up = 0
            for (let i = 0; i < GRID * GRID; i++) {
                const d = cellD(i, X, Y)
                if (d > R && d <= R * 1.25 && gs.heights[i] > base[i] + 0.02) up++
            }
            return up
        })()
        for (let t = Math.floor(CRUMBLE_T / 4); t < CRUMBLE_T; t++) step(gs, {})
        let worst = 0, outside = 0
        for (let i = 0; i < GRID * GRID; i++) {
            const d = cellD(i, X, Y)
            const want = d <= R ? Math.max(0, base[i] - D * (1 - d / R) ** 2) : base[i]
            worst = Math.max(worst, Math.abs(gs.heights[i] - want))
            if (d > R * 1.25 && Math.abs(gs.heights[i] - base[i]) > 1e-9) outside++
        }
        r.check('crumble converges: the land equals the instant machine at cast+CRUMBLE_T',
            worst < 1e-9, `worst ${worst.toExponential(2)}`)
        r.check('the shockwave is no erosion: outside the ring nothing moved, ever',
            outside === 0, `offenders ${outside}`)
        r.check('the shockwave rim heaves mid-window (the ground is pushed aside as it falls)',
            rimSeen > 0, `rim cells up at mid-window ${rimSeen}`)
    }
    {
        // RAISE swells ease-out — most of the mound is visible by quarter-window.
        const gs = makeGame(7)
        gs.deforms.length = 0
        const X = 300, Y = 80, R = 16, HG = 14
        const base = gs.heights.slice()
        raiseTerrain(gs, X, Y, R, HG)
        const gi0 = giAt(X, Y)
        const full = HG * (1 - cellD(gi0, X, Y) / R) ** 2
        for (let t = 0; t < Math.floor(CRUMBLE_T / 4); t++) step(gs, {})
        const q = gs.heights[gi0] - base[gi0]
        r.check('mounds swell ease-out: a third of the mound already there by quarter-window',
            q > full * 0.3, `lift ${q.toFixed(2)} of ${full.toFixed(2)} at t=${Math.floor(CRUMBLE_T / 4)}`)
        for (let t = Math.floor(CRUMBLE_T / 4); t < CRUMBLE_T; t++) step(gs, {})
        let worst = 0
        for (let i = 0; i < GRID * GRID; i++) {
            const d = cellD(i, X, Y)
            const want = d <= R ? Math.min(96, base[i] + HG * (1 - d / R) ** 2) : base[i]
            worst = Math.max(worst, Math.abs(gs.heights[i] - want))
        }
        r.check('RAISE converges to the instant mound (counter-spell maths unchanged)',
            worst < 1e-9, `worst ${worst.toExponential(2)}`)
    }
    {
        // Queue mechanics are rng-free and regen-safe: replay bit-identical,
        // a fresh world never inherits a pending ripple.
        const drive = () => {
            const gs = makeGame(7)
            gs.learned.push('raise', 'dissolve'); gs.mana = 500
            let i = 0
            for (; i < 900; i++) {
                const inp = autopilot(gs)
                if (i === 120 || i === 480) { gs.hands.L = 'raise'; inp.castL = true }
                if (i === 240) { gs.hands.L = 'dissolve'; inp.castL = true }
                gs.mana = Math.max(gs.mana, 100)
                step(gs, inp)
            }
            return gs
        }
        const a = drive(), b = drive()
        r.check('crumbling is deterministic: same seed → identical heights and hash',
            stateHash(a) === stateHash(b) && a.heights.every((h, i) => h === b.heights[i]), stateHash(a))
        const stale = drive()
        crater(stale, 60, 60, 18, 12, 1)
        step(stale, {})
        stale.level = 1
        genWorld(stale)
        r.check('regen clears pending ripples — fresh land is never dug by stale work',
            stale.deforms.length === 0)
        const h0 = stale.heights.slice()
        for (let t = 0; t < CRUMBLE_T + 2; t++) step(stale, {})
        let dug = 0
        for (let j = 4; j < 12; j++) for (let i = 4; i < 12; i++) if (stale.heights[j * GRID + i] < h0[j * GRID + i] - 1e-9) dug++
        r.check('and the drained queue leaves the fresh world untouched', dug === 0, `cells dug ${dug}`)
    }
    {
        // Source pins: the drain sits in step() (one driver), regen clears,
        // and the queue is part of the contract-visible state.
        const simSrc = await readFile(new URL('../src/games/MagicCarpet/sim.js', import.meta.url), 'utf8')
        r.check('crumble law pinned in source: step() drains before casts, genWorld clears',
            // window 1200 -> 1600: #1764 item 4 stage 3 legitimately grew step()'s
            // throttle block (the DIVE_DRAG law + its comment). The invariant is the
            // ORDER (drain precedes casts in the one driver); the window only bounds
            // how much may sit between them.
            /drainDeforms\(gs\) \/\/[\s\S]{0,1600}if \(inp\.castL/.test(simSrc) &&
            /function genWorld\(gs\) \{\s*\n\s*gs\.deforms = \[\]/.test(simSrc))
    }
}

// ---- #1697: CRUMBLE FEEDBACK — the landing thuds, slurps, shakes and throws
// grit, all driven off the deform queue's landing (cast + CRUMBLE_T), and all
// presentation-only. Mutation guide: (1) delete the gs.events.push in
// drainDeforms' last branch — the landing, scaling, distance and flood gates go
// red while the #1694 convergence gates hold; (2) return constant prox in
// crumbleFeel — the scaling/distance gates go red; (3) raise the mag threshold
// above 12 or drop the flooded flag — the gates named for them go red;
// (4) route the thud to playTone in index.jsx — the bus-pin goes red;
// (5) delete spawnGrit — the browser grit gate goes red.
{
    const drainTo = (gs) => {
        // step ticks until a crumble event lands (or bail); returns that event.
        for (let t = 0; t < CRUMBLE_T + 2; t++) {
            step(gs, {})
            const e = gs.events.find((ev) => ev.type === 'crumble')
            if (e) return { e, t: t + 1 }
        }
        return null
    }
    {
        const gs = makeGame(7)
        gs.x = 100; gs.y = 100
        crater(gs, 110, 100, 14, 10, 1)
        gs.events.length = 0
        const mid = (() => { for (let t = 0; t < CRUMBLE_T - 1; t++) step(gs, {}); return gs.events.some((e) => e.type === 'crumble') })()
        const land = drainTo(gs)
        r.check('#1697 a sink lands: one crumble event, exactly at the window close',
            !mid && !!land && land.e.kind === 'crater' && land.e.hot === 1 && gs.deforms.length === 0,
            `mid=${mid} land=${land ? JSON.stringify({ k: land.e.kind, t: land.t }) : 'never'}`)
        const f = crumbleFeel(gs, land.e)
        r.check('#1697 a crater dropping under the carpet shakes the view (size>0, prox>0)',
            f.shake > 1 && f.vol > 0.2 && f.prox > 0, JSON.stringify(f))
        r.check('#1697 feel is a pure read — computing the thud never disturbs the hash',
            stateHash(gs) === (() => { crumbleFeel(gs, { x: 110, y: 100, mag: 7 }); return stateHash(gs) })())
    }
    {
        const gs = makeGame(7)
        gs.x = 100; gs.y = 100
        crater(gs, 400, 100, 14, 10, 1) // over the next hill: 300u away
        gs.events.length = 0
        const land = drainTo(gs)
        const f = crumbleFeel(gs, land.e)
        r.check('#1697 distant casts land silent — no thud, no shake beyond ear-shot',
            land.e.x === wrap(400, MAP) && f.prox === 0 && f.vol === 0 && f.shake === 0 &&
            crumbleFeel(gs, { ...land.e, x: wrap(gs.x + CRUMBLE_HEAR_R + 1, MAP), y: gs.y }).vol === 0,
            JSON.stringify(f))
    }
    {
        // size-scaled: at equal distance, more earth moved = louder and harder.
        const gs = makeGame(7)
        gs.x = 100; gs.y = 100
        const feelAt = (d) => crumbleFeel(gs, { x: wrap(gs.x + d, MAP), y: gs.y, mag: 10 })
        const a = feelAt(80), b = feelAt(40), c = feelAt(0)
        r.check('#1697 thud falls off smoothly with distance (0 at horizon, louder closer)',
            a.vol > 0 && a.vol < b.vol && b.vol < c.vol && c.prox === 1,
            `${a.vol.toFixed(2)} < ${b.vol.toFixed(2)} < ${c.vol.toFixed(2)}`)
        const mk = (depth) => { const g = makeGame(7); g.x = 100; g.y = 100; crater(g, 100, 100, 14, depth, 0); const mag = g.deforms[0].mag; return { mag, ...crumbleFeel(g, { x: 100, y: 100, mag }) } }
        const small = mk(4), big = mk(12)
        r.check('#1697 a volcano vent thuds harder than a bolt crater (mag scales shake and vol)',
            big.mag > small.mag && big.shake > small.shake && big.vol > small.vol,
            `bolt ${small.mag.toFixed(1)}/${small.shake.toFixed(2)} vs vent ${big.mag.toFixed(1)}/${big.shake.toFixed(2)}`)
        // the real casts: fireball (depth 10) vs the volcano's main vent (12).
        const fb = makeGame(7); crater(fb, 100, 100, 14, 10, 1)
        const v0 = makeGame(7); volcanoErupt(v0, 100, 100)
        const ventMag = Math.max(...v0.deforms.map((d) => d.mag))
        r.check('#1697 the volcano main vent queues more earth than a fireball (landing scaling is real)',
            ventMag > fb.deforms[0].mag, `fireball ${fb.deforms[0].mag.toFixed(1)} vs vent ${ventMag.toFixed(1)}`)
    }
    {
        const gs = makeGame(7)
        gs.x = 100; gs.y = 100
        dissolveLand(gs, 110, 100)
        gs.events.length = 0
        const land = drainTo(gs)
        r.check('#1697 a dissolve wound lands flooded — the slurp knows the sea arrived',
            land && land.e.kind === 'dissolve' && land.e.flooded === 1 &&
            sampleH(gs, 110, 100) < WATER,
            land ? `kind=${land.e.kind} flooded=${land.e.flooded} h=${sampleH(gs, 110, 100).toFixed(1)}<${WATER}` : 'never')
        const gs2 = makeGame(7)
        gs2.x = 100; gs2.y = 100
        raiseTerrain(gs2, 110, 100, 16, 14)
        gs2.events.length = 0
        for (let t = 0; t < CRUMBLE_T + 2; t++) step(gs2, {})
        r.check('#1697 mounds land upward and stay silent — no impact event for RAISE',
            !gs2.events.some((e) => e.type === 'crumble') && gs2.deforms.length === 0)
    }
    {
        const idxSrc = await readFile(new URL('../src/games/MagicCarpet/index.jsx', import.meta.url), 'utf8')
        const rendSrc = await readFile(new URL('../src/games/MagicCarpet/renderer.js', import.meta.url), 'utf8')
        const handler = idxSrc.match(/e\.type === 'crumble'\) \{[\s\S]{0,1400}?\n\s+\} else if/)
        r.check('#1697 landing sound rides the MUFFLE bus (amb* behind the veil, never destination)',
            !!handler && /ambTone\(/.test(handler[0]) && /ambSweep\(/.test(handler[0]) &&
            !/audioController\.play(Tone|Sweep|Noise)\(/.test(handler[0]) && /crumbleFeel\(gs, e\)/.test(handler[0]))
        r.check('#1697 grit rides the ash pool only at the rim of craters — cold, size-gated, no scorch',
            /e\.type === 'crumble'\) spawnGrit/.test(rendSrc) &&
            /spawnGrit[\s\S]{0,1400}'ash'/.test(rendSrc) &&
            /kind !== 'crater' \|\| e\.mag < 3/.test(rendSrc) &&
            !/spawnGrit[\s\S]{0,1200}addScorch/.test(rendSrc))
    }
}

// ---- #1746 item 7: SPATIAL CAST CUE — a wizfire crack lands on the stereo
// field where the wizard stands, computed by castBearing (pure read, like
// muffleOf/crumbleFeel). Mutation guide: (1) strip x/y from the wizfire push
// in sim.js — the carrier and sign gates go red while determinism holds;
// (2) swap sin for cos in castBearing — the side gates go red, ahead/behind
// survive; (3) drop the pan arg in index.jsx — the shell pin goes red;
// (4) make AudioController pan even when pan===null — the default-path pin
// goes red (every other title's sweep must keep the old direct graph).
{
    const near = (a, b) => Math.abs(a - b) < 0.02
    {
        // The carrier: the event knows where the bolt was born.
        const gs = makeGame(7)
        const wz = gs.wizard
        gs.x = wz.x; gs.y = wz.y; gs.invis = 0; gs.wizFire = 0
        gs.events.length = 0
        step(gs, {})
        const e = gs.events.find((ev) => ev.type === 'wizfire')
        r.check('#1746 wizfire carries the cast point (event x/y equal the wizard at the shot)',
            !!e && e.x === wrap(wz.x, MAP) && e.y === wrap(wz.y, MAP) &&
            gs.projs.some((p) => p.kind === 'bolt' && p.from === 'w'),
            e ? JSON.stringify({ x: e.x, y: e.y }) : 'no wizfire')
    }
    {
        // Geometry: yaw 0 faces +x; the renderer's camera right is +world y
        // (cross(fwd,up) at yaw 0), so pan = sin(rel) is +right, and the
        // half-plane behind the nose is cos(rel) < 0. All four cardinal casts.
        const gs = makeGame(7)
        gs.x = 100; gs.y = 100; gs.yaw = 0
        const ahead = castBearing(gs, 150, 100)
        const behind = castBearing(gs, 50, 100)
        const right = castBearing(gs, 100, 150)
        const left = castBearing(gs, 100, 50)
        r.check('#1746 a cast dead ahead centres (pan 0) and is not behind',
            near(ahead.pan, 0) && !ahead.behind, JSON.stringify(ahead))
        r.check('#1746 a cast over the shoulder flags behind (pan still centred)',
            near(behind.pan, 0) && behind.behind, JSON.stringify(behind))
        r.check('#1746 right/left casts pan hard to the matching ear (+y is camera-right at yaw 0)',
            right.pan > 0.99 && !right.behind && left.pan < -0.99 && !left.behind,
            `R ${right.pan.toFixed(2)} L ${left.pan.toFixed(2)}`)
        // A turned carpet: the answer follows the nose, not the world axes.
        const t = { ...gs, yaw: Math.PI / 2 }
        const upAhead = castBearing(t, 100, 150)
        r.check('#1746 pan is nose-relative — the same point ahead at yaw 90° centres',
            near(upAhead.pan, 0) && !upAhead.behind, JSON.stringify(upAhead))
        // The map wraps: a wizard across the seam is heard the short way round.
        const seam = castBearing({ ...gs, x: 4, y: 100 }, wrap(4 + 50, MAP), 100)
        const seamBack = castBearing({ ...gs, x: 4, y: 100 }, wrap(4 - 50, MAP), 100)
        r.check('#1746 the bearing takes the short way across the map seam',
            near(seam.pan, 0) && !seam.behind && near(seamBack.pan, 0) && seamBack.behind,
            `seam ${JSON.stringify(seam)} back ${JSON.stringify(seamBack)}`)
    }
    {
        // Pure read: the same discipline as muffleOf — computing bearings must
        // never nudge the sim, so determinism gates stay green with the cue in.
        const gs = makeGame(7)
        const h0 = stateHash(gs)
        castBearing(gs, gs.wizard.x, gs.wizard.y)
        r.check('#1746 castBearing is a pure read — it never disturbs the state hash',
            h0 === stateHash(gs), `${h0} vs ${stateHash(gs)}`)
    }
    {
        const idxSrc = await readFile(new URL('../src/games/MagicCarpet/index.jsx', import.meta.url), 'utf8')
        const acSrc = await readFile(new URL('../src/utils/AudioController.js', import.meta.url), 'utf8')
        const handler = idxSrc.match(/e\.type === 'wizfire'\) \{([\s\S]{0,900}?)\n\s+\}(?: else if|\s*\n\s*else if)/)
        r.check('#1746 the shell pans the wizfire crack by the bearing (behind = longer, softer)',
            !!handler && /castBearing\(gs, e\.x, e\.y\)/.test(handler[0]) &&
            /playSweep\([^;]*?br\.prox, br\.pan\)/.test(handler[0]) &&
            /br\.behind \? 0\.18 : 0\.14/.test(handler[0]) &&
            /br\.behind \? 0\.04 : 0\.05/.test(handler[0]),
            handler ? 'routed' : 'wizfire handler not pinned')
        r.check('#1746 pan is opt-in in AudioController — null keeps the direct graph untouched',
            /playSweep\(startFreq, endFreq, duration, type = 'triangle', vol = 0\.1, pan = null, delay = 0\)/.test(acSrc) &&
            /if \(pan !== null && this\.ctx\.createStereoPanner\)/.test(acSrc) &&
            /\} else \{\s*\n\s*gain\.connect\(this\.ctx\.destination\)/.test(acSrc))
    }
}

// ---- #1764 item 7 stage 3: POSITIONED CREATURE/VILLAGE/LIGHTNING CUES ----
// The rest of the original's stereo field: lightning crashes, bites, slung
// rocks, burning villagers, tribute coins and the growl bed all lean to the
// side of the world they come from, on the same castBearing as the wizfire.
// Mutation guide: (1) strip x/y from the bite or rocksling push in sim.js —
// the carrier gates go red while determinism holds; (2) place the wolf on the
// carpet's LEFT and the composite sign gate goes red (sin/cos swap); (3) drop
// a pan arg in any handler — that handler's shell pin goes red; (4) make
// playTone/playNoise/ambTone pan even when pan===null — the opt-in pin below
// goes red (every other title's one-shot must keep the old direct graph).
{
    {
        // Carrier: a bite knows which wolf bit (position at the chomp tick).
        const gs = makeGame(7)
        gs.invis = 0
        // One wolf does the chomping: the rest sit far and busy on cooldown,
        // so the bite we catch is provably the one we placed.
        gs.monsters.forEach((m) => { m.cool = 999 })
        const wolf = gs.monsters.find((m) => m.kind === 'wolf')
        wolf.x = wrap(gs.x + 0.5, MAP); wolf.y = wrap(gs.y + 5, MAP) // dead right at yaw 0, pd≈5
        wolf.cool = 0
        gs.alt = Math.max(1, sampleH(gs, wolf.x, wolf.y) + 1)
        // The carpet auto-drifts +x every tick (no stick, no brake) — the bear
        // must be judged from where the nose was when the bite was BORN.
        const px = gs.x, py = gs.y
        gs.events.length = 0
        step(gs, {})
        const b = gs.events.find((ev) => ev.type === 'bite')
        const bp = b ? castBearing({ ...gs, x: px, y: py }, b.x, b.y) : null
        r.check('#1764-7 bite carries the wolf at the chomp — and a wolf on the right pans right',
            !!b && b.x === wrap(wolf.x, MAP) && b.y === wrap(wolf.y, MAP) &&
            !!bp && bp.pan > 0.9 && !bp.behind,
            b ? `${JSON.stringify({ x: b.x, y: b.y })} pan=${bp.pan.toFixed(2)}` : 'no bite')
    }
    {
        // Carrier: a sling knows which giant threw.
        const gs = makeGame(7)
        gs.invis = 0
        gs.monsters.forEach((m) => { m.cool = 999 })
        const giant = gs.monsters.find((m) => m.kind === 'giant')
        giant.x = wrap(gs.x + 20, MAP); giant.y = wrap(gs.y + 20, MAP) // diagonal ahead-right
        giant.cool = 0
        gs.events.length = 0
        step(gs, {})
        const s = gs.events.find((ev) => ev.type === 'rocksling')
        const sp = s ? castBearing(gs, s.x, s.y) : null
        r.check('#1764-7 rocksling carries the giant at the throw — bearing sits ahead-right',
            !!s && s.x === wrap(giant.x, MAP) && s.y === wrap(giant.y, MAP) &&
            !!sp && sp.pan > 0.5 && !sp.behind,
            s ? `${JSON.stringify({ x: s.x, y: s.y })} pan=${sp.pan.toFixed(2)}` : 'no rocksling')
    }
    {
        // Pure read: panning the world must never nudge the sim (same law as
        // #1746 — the audio half of the game stays as provable as its rules).
        const gs = makeGame(7)
        const h0 = stateHash(gs)
        gs.monsters.forEach((m) => castBearing(gs, m.x, m.y))
        r.check('#1764-7 bearing every monster is still a pure read — the hash never moves',
            h0 === stateHash(gs), `${h0} vs ${stateHash(gs)}`)
    }
    {
        const idxSrc = await readFile(new URL('../src/games/MagicCarpet/index.jsx', import.meta.url), 'utf8')
        const acSrc = await readFile(new URL('../src/utils/AudioController.js', import.meta.url), 'utf8')
        const zapH = idxSrc.match(/e\.type === 'zap'\) \{([\s\S]{0,900}?)\n\s+\} else if/)
        r.check('#1764-7 the shell pans the lightning crack by the strike bearing (behind = softer)',
            !!zapH && /castBearing\(gs, e\.x, e\.y\)/.test(zapH[0]) &&
            /playNoise\(0\.16, \(bz\.behind \? 0\.07 : 0\.09\) \* bz\.prox, bz\.pan\)/.test(zapH[0]) &&
            /playSweep\(1500, 260, 0\.2, 'square', \(bz\.behind \? 0\.045 : 0\.06\) \* bz\.prox, bz\.pan\)/.test(zapH[0]) &&
            /bz\.behind \? 0\.07 : 0\.09/.test(zapH[0]),
            zapH ? 'routed' : 'zap handler not pinned')
        r.check('#1764-7 the creature strikes lean — bite and rocksling ride the bearing',
            /else if \(e\.type === 'rocksling'\) \{ const bs = castBearing\(gs, e\.x, e\.y\); audioController\.playNoise\(0\.07, 0\.05 \* bs\.prox, bs\.pan\) \}/.test(idxSrc) &&
            /else if \(e\.type === 'bite'\) \{ const bk = castBearing\(gs, e\.x, e\.y\); audioController\.playTone\(170, 0\.06, 'square', 0\.05 \* bk\.prox, 0, bk\.pan\) \}/.test(idxSrc))
        r.check('#1764-7 the growl bed is a VOICE — ambTone pans to the creature it came from',
            /const bg = castBearing\(gs, near\.x, near\.y\)/.test(idxSrc) &&
            /ambTone\(near\.kind === 'giant' \? 44 : 62, 0\.34, 'sawtooth', 0\.026 \* bg\.prox, 0, bg\.pan\)/.test(idxSrc))
        r.check('#1764-7 village sounds land at the village — ignite, burn, hut crash and tribute coin all pan',
            /e\.type === 'ignite'\)[\s\S]{0,400}playNoise\(0\.12, 0\.05 \* bi\.prox, bi\.pan\)/.test(idxSrc) &&
            /const bb = castBearing\(gs, e\.x, e\.y\)[\s\S]{0,300}playSweep\(300, 90, 0\.3, 'triangle', 0\.04 \* bb\.prox, bb\.pan\)/.test(idxSrc) &&
            /const hp = castBearing\(gs, e\.x, e\.y\)[\s\S]{0,400}playNoise\(0\.2, 0\.08 \* hp\.prox, hp\.pan\)/.test(idxSrc) &&
            /playTone\(880, 0\.04, 'sine', 0\.03 \* bt\.prox, 0, bt\.pan\)/.test(idxSrc))
        r.check('#1764-7 the chirp of a creature that lost you comes from THEIR side',
            /const bl = castBearing\(gs, e\.x, e\.y\)[\s\S]{0,300}playSweep\(f, f \* 0\.78, 0\.14, 'triangle', 0\.035 \* bl\.prox, bl\.pan\)/.test(idxSrc) &&
            /playSweep\(f \* 0\.78, f \* 1\.1, 0\.16, 'triangle', 0\.022 \* bl\.prox, bl\.pan, 0\.13\)/.test(idxSrc))
        r.check('#1764-7 pan is opt-in in EVERY one-shot — null keeps the old direct graph',
            /playTone\(freq, duration, type = 'square', vol = 0\.1, delay = 0, pan = null\)/.test(acSrc) &&
            /playNoise\(duration, vol = 0\.2, pan = null\)/.test(acSrc) &&
            /ambTone\(freq, duration, type = 'square', vol = 0\.1, delay = 0, pan = null\)/.test(acSrc) &&
            (acSrc.match(/if \(pan !== null && this\.ctx\.createStereoPanner\)/g) || []).length >= 4,
            `guards=${(acSrc.match(/if \(pan !== null && this\.ctx\.createStereoPanner\)/g) || []).length}`)
    }
}

// #1764 item 7 stage 4 (2026-11-10, QA studio): THE DISTANCE LAW — every
// panned cue also scales its loudness with how FAR its source stands, on the
// same pure-read castBearing (now {pan, behind, prox}). The horizon keeps
// crackling at CUE_FLOOR — depth is added, a cue's warning role never taken.
// Mutation guide: (1) CUE_FLOOR -> 1 and the floor gates go red (the field
// flattens back to mono-loud); (2) fold yaw into prox and the facing gate goes
// red; (3) strip one `* b*.prox` at any shell site — the loudness census goes
// red; (4) swap the chirp echo's pan/delay args back — the echo pin goes red
// (pan silently received 0.13 while the bearing sat ignored: the bug fixed here).
{
    const gs = makeGame(7)
    // Distances ride the seam, so an axis-aligned d > 256 FOLDS back below the
    // floor line — beyond-half-map is only reachable on the diagonal.
    const atD = (dx, dy, dyaw = 0) =>
        castBearing({ ...gs, yaw: gs.yaw + dyaw }, wrap(gs.x + dx, MAP), wrap(gs.y + dy, MAP))
    const at = (d, dyaw = 0) => atD(d, 0, dyaw)
    const at45 = (d) => atD(d / Math.SQRT2, d / Math.SQRT2)
    const mid = (CUE_LOUD_R + CUE_HEAR_R) / 2
    r.check('#1764-7s4 prox is a flat top in earshot — d=0 and d=CUE_LOUD_R read full loudness',
        at(0).prox === 1 && at(CUE_LOUD_R).prox === 1,
        `d0=${at(0).prox} dLoud=${at(CUE_LOUD_R).prox}`)
    r.check('#1764-7s4 the floor at half the map, kept past it — the horizon crackles, never mutes',
        // literal pins: a mutant that raises CUE_FLOOR itself must go red here,
        // not just feed its own constant through the comparison (the first
        // mutant run proved the constants-only form passes vacuously at 1).
        CUE_FLOOR === 0.3 && CUE_LOUD_R === 40 && CUE_HEAR_R === 256 &&
        at(CUE_HEAR_R).prox === CUE_FLOOR && at45(CUE_HEAR_R + 60).prox === CUE_FLOOR &&
        at45(Math.hypot(256, 256)).prox === CUE_FLOOR && at45(Math.hypot(256, 256)).prox < 1,
        `dHear=${at(CUE_HEAR_R).prox} dDiag=${at45(CUE_HEAR_R + 60).prox}`)
    r.check('#1764-7s4 the decay is linear between the edges',
        Math.abs(at(mid).prox - (1 + CUE_FLOOR) / 2) < 1e-9 &&
        Math.abs(at(CUE_LOUD_R + 10).prox - (1 - (1 - CUE_FLOOR) * 10 / (CUE_HEAR_R - CUE_LOUD_R))) < 1e-9,
        `mid=${at(mid).prox} expected=${((1 + CUE_FLOOR) / 2).toFixed(4)}`)
    r.check('#1764-7s4 loudness falls monotonically with distance all the way across the map',
        [at(10), at(60), at(120), at(200), at45(260), at45(340)].map((b) => b.prox)
            .every((v, i, a) => i === 0 || v <= a[i - 1]) &&
        at(10).prox > at(120).prox && at(120).prox > at45(340).prox,
        `d120=${at(120).prox.toFixed(3)} d340diag=${at45(340).prox.toFixed(3)}`)
    r.check('#1764-7s4 prox is ONLY distance — one far source reads the same loudness from any facing',
        at(180).prox === at(180, 1.3).prox && at(180).prox === at(180, -2.4).prox &&
        at45(300).prox === atD(212, -212).prox,
        `yaw0=${at(180).prox} turned=${at(180, 1.3).prox}`)
    r.check('#1764-7s4 distance rides the seam — 30u across the wrap is at the ear, not 482u away',
        castBearing({ ...gs, x: 4 }, wrap(4 + 30, MAP), gs.y).prox === 1 &&
        castBearing({ ...gs, x: 4 }, wrap(4 - 30, MAP), gs.y).prox === 1 &&
        castBearing({ ...gs, x: 4 }, wrap(4 + CUE_HEAR_R, MAP), gs.y).prox === CUE_FLOOR)
    {
        const h0 = stateHash(gs)
        castBearing(gs, wrap(gs.x + 300, MAP), wrap(gs.y - 300, MAP))
        r.check('#1764-7s4 prox rides the same pure-read law — the hash never moves',
            h0 === stateHash(gs), `${h0} vs ${stateHash(gs)}`)
    }
}
{
    // Census: 10 panned sites, 18 volume args — every one multiplied by prox.
    // Pan without distance is stage 3; a site that quietly drops the multiply
    // mid-refactor goes red here, not half-spatial.
    const idxSrc = await readFile(new URL('../src/games/MagicCarpet/index.jsx', import.meta.url), 'utf8')
    const m = idxSrc.match(/\* [a-z]\w*\.prox/g) || []
    r.check('#1764-7s4 loudness census — every panned volume arg is scaled by prox (>= 18)',
        m.length >= 18 &&
        /const bi = castBearing[\s\S]{0,200}0\.05 \* bi\.prox/.test(idxSrc) &&
        /const br = castBearing[\s\S]{0,300}br\.prox, br\.pan/.test(idxSrc) &&
        /const bz = castBearing[\s\S]{0,500}0\.028 \* bz\.prox/.test(idxSrc),
        `prox-multiples=${m.length}`)
    // The echo fix: playSweep gained delay as a trailing opt-in arg — the
    // chirp's second voice finally pans AND lands 0.13s after the first.
    const acSrc = await readFile(new URL('../src/utils/AudioController.js', import.meta.url), 'utf8')
    r.check('#1764-7s4 playSweep delay is opt-in — trailing arg, t = now + delay through the whole graph',
        /playSweep\(startFreq, endFreq, duration, type = 'triangle', vol = 0\.1, pan = null, delay = 0\)/.test(acSrc) &&
        /const t = this\.ctx\.currentTime \+ delay/.test(acSrc) &&
        /osc\.start\(t\); osc\.stop\(t \+ duration\)/.test(acSrc))
}

// ---- #1764 item 5 stage 5: AERIAL PERSPECTIVE — the haze layer law (#1764).
// The gap said the fog was a per-object distance mix with no altitude; the fix
// is a ground-hugging haze layer (dense at/below floorY, crisp keep above topY)
// plus a camera-altitude path thinning (airOf), mirrored in GLSL by AIR_GLSL,
// which BAKES these same literals — the mirror is by construction, and the
// census below proves every fog site routes through it. Renderer-side numbers,
// pure geometry: the sim hash never moves.
//
// Mutation guide: (1) hazeOf -> 1.0 and the peak-vs-lowland contrast dies;
// (2) airOf -> 1.0 and the climb gates go red (far ground never resolves);
// (3) nudge HAZE.topY/keep/floor and the literal pins go red; (4) put
// `smoothstep(70.0, uFogD, vDist)` back at the terrain site and the census
// (distance-only residue) goes red; (5) drop the max() horizon-fuse term and
// the fuse pin goes red — the grid edge must still dissolve into the sky.
{
    r.check('#1764-5s5 the law literals are pinned — a 56u haze band, half-crisp peaks, 40/100 eye path',
        FOG_NEAR === 70 && FOG_D === 260 && HAZE.floorY === 18 && HAZE.topY === 74 &&
        HAZE.keep === 0.5 && HAZE.nearY === 40 && HAZE.farY === 100 && HAZE.floor === 0.6,
        `HAZE=${JSON.stringify(HAZE)}`)
    r.check('#1764-5s5 the haze hugs the ground — full density at sea and beach, clamped past both edges',
        hazeOf(WATER) === 1 && hazeOf(HAZE.floorY) === 1 && hazeOf(HAZE.floorY - 30) === 1 &&
        hazeOf((HAZE.floorY + HAZE.topY) / 2) === 0.75 && hazeOf(HAZE.topY) === HAZE.keep &&
        hazeOf(HAZE.topY + 50) === HAZE.keep,
        `sea=${hazeOf(WATER)} mid=${hazeOf((HAZE.floorY + HAZE.topY) / 2)} top=${hazeOf(HAZE.topY)}`)
    r.check('#1764-5s5 haze density falls monotonically with altitude across the band',
        [0, 18, 32, 46, 60, 74, 90].map(hazeOf).every((v, i, a) => i === 0 || v <= a[i - 1]) &&
        hazeOf(18) > hazeOf(46) && hazeOf(46) > hazeOf(74))
    r.check('#1764-5s5 climbing thins the path — full at low eye, floor at and past farY, never past it',
        airOf(8) === 1 && airOf(HAZE.nearY) === 1 &&
        airOf((HAZE.nearY + HAZE.farY) / 2) === 0.8 && airOf(HAZE.farY) === HAZE.floor &&
        airOf(120) === HAZE.floor && airOf(500) === HAZE.floor,
        `mid=${airOf(70)} high=${airOf(120)}`)
    r.check('#1764-5s5 far ground at full range: lowland sits in haze, a summit keeps half — exactly 2:1',
        aerialFog(FOG_D, WATER, HAZE.nearY) === 1 && aerialFog(FOG_D, HAZE.topY, HAZE.nearY) === 0.5 &&
        aerialFog(FOG_D, HAZE.topY, HAZE.farY) === HAZE.keep * HAZE.floor,
        `low=${aerialFog(FOG_D, WATER, HAZE.nearY)} peak=${aerialFog(FOG_D, HAZE.topY, HAZE.nearY)}`)
    r.check('#1764-5s5 nothing inside earshot is fogged, and the mix grows with distance',
        aerialFog(0, WATER, 20) === 0 && aerialFog(FOG_NEAR, WATER, 20) === 0 &&
        [80, 120, 160, 200, 240, 260].map((d) => aerialFog(d, WATER, 20)).every((v, i, a) => i === 0 || v >= a[i - 1]) &&
        aerialFog(120, WATER, 20) > 0 && aerialFog(260, WATER, 20) > aerialFog(120, WATER, 20))
    r.check('#1764-5s5 the law is monotone in both altitudes — peaks crisper, climbs clearer, all the way',
        [14, 40, 74, 110].map((y) => aerialFog(220, y, 20)).every((v, i, a) => i === 0 || v <= a[i - 1]) &&
        [20, 40, 70, 100, 120].map((c) => aerialFog(220, WATER, c)).every((v, i, a) => i === 0 || v <= a[i - 1]) &&
        aerialFog(220, WATER, 20) > aerialFog(220, WATER, 110) &&
        aerialFog(220, WATER, 20) > aerialFog(220, 90, 20),
        `lowland=${aerialFog(220, WATER, 20).toFixed(3)} peak=${aerialFog(220, 90, 20).toFixed(3)} climb=${aerialFog(220, WATER, 110).toFixed(3)}`)
    {
        const gs = makeGame(7)
        const h0 = stateHash(gs)
        aerialFog(200, WATER, gs.alt); hazeOf(gs.alt); airOf(gs.alt)
        r.check('#1764-5s5 a pure read — the hash never moves (presentation law, sim untouched)',
            h0 === stateHash(gs), `${h0} vs ${stateHash(gs)}`)
    }
}
{
    // Census: every fog site routes through the baked mirror, no distance-only
    // residue survives, and the horizon fuse still reaches the grid edge.
    const src = await readFile(new URL('../src/games/MagicCarpet/renderer.js', import.meta.url), 'utf8')
    const half = (72 * (MAP / GRID)) / 2
    r.check('#1764-5s5 census — the aerial mirror is injected at all three fog sites (terrain, sprites, bolts)',
        (src.match(/aerialG\(/g) || []).length >= 4 && // definition + 3 sites
        /vFog = aerialG\(length\(rel\), aPos\.y, uCamPos\.y\)/.test(src) &&
        /max\(aerialG\(vDist, vH, uCamPos\.y\)/.test(src) &&
        /vFog = aerialG\(length\(position - uCamPos\), position\.y, uCamPos\.y\)/.test(src))
    r.check('#1764-5s5 census — no distance-only fog site survived the pass',
        !/smoothstep\(70\.0, uFogD, (length\(rel\)|vDist)\)/.test(src) &&
        !/smoothstep\(70\.0, 260\.0, vD\)/.test(src),
        `residue=${(src.match(/smoothstep\(70\.0[^;]*\)/g) || []).length}`)
    r.check('#1764-5s5 GLSL bakes the law\'s own literals — the mirror is by construction, not by hand',
        // The shaders interpolate HAZE/FOG_* straight out of sim.js: change the
        // law and every site changes with it. This reads the construction site.
        /import \{[^}]*FOG_NEAR, FOG_D, HAZE[^}]*\} from '\.\/sim\.js'/.test(src) &&
        src.includes('float hazeOfG(float y){ return ${HAZE.keep} + ${1 - HAZE.keep} * clamp((${HAZE.topY}.0 - y) / ${(HAZE.topY - HAZE.floorY)}.0, 0.0, 1.0); }') &&
        src.includes('float airOfG(float camY){ return max(${HAZE.floor}, 1.0 - ${1 - HAZE.floor} * max(0.0, camY - ${HAZE.nearY}.0) / ${(HAZE.farY - HAZE.nearY)}.0); }') &&
        src.includes('float aerialG(float dist, float y, float camY){ return smoothstep(${FOG_NEAR}.0, uFogD, dist) * hazeOfG(y) * airOfG(camY); }'))
    r.check('#1764-5s5 the horizon fuse survives the gradient — grid edge still dissolves at 0.92',
        src.includes('smoothstep(${HALF - 28}.0, ${HALF - 4}.0, vDist) * 0.92') && half === 288, `HALF=${half}`)
}

await requireDevServer(`http://localhost:${process.env.DEV_PORT || 5173}/retrogames/magic-carpet`)
const browser = await launch()
const page = await openGame(browser, { url: `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/magic-carpet`, hook: '__game', start: false })
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
const gpuErrs = []
page.on('console', (m) => { if (m.type() === 'error' && /shader|webgl/i.test(m.text())) gpuErrs.push(m.text().slice(0, 160)) })

const meta = await page.evaluate(() => window.__game.meta)
r.check('contract meta magic-carpet with A+B', meta?.id === 'magic-carpet' && meta.buttons.includes('a') && meta.buttons.includes('b'))
const png = await page.evaluate(() => window.__game.frame())
r.check('frame() paints the world', typeof png === 'string' && png.startsWith('data:image/png') && png.length > 2000, `${png?.length}b`)
const det = await page.evaluate(() => {
    const g = window.__game
    const runIt = () => {
        g.reset(7)
        for (let i = 0; i < 200; i++) g.step({ up: i % 4 < 2, a: i % 13 < 2 }, 1)
        return g.state()
    }
    const a = runIt(); const b = runIt()
    g.release()
    return { same: a.hash === b.hash, tick: a.tick, done: a.done }
})
r.check('browser determinism: reset(7)+200 twice → same hash', det.same && det.tick === 200, JSON.stringify(det))
const hooked = await page.evaluate(() => {
    const t = window.__carpetTest
    t.start()
    return t.probe().screen
})
r.check('__carpetTest starts play mode', hooked === 'play', hooked)
await page.waitForTimeout(700)
const live = await page.evaluate(() => window.__carpetTest.probe())
r.check('play mode ticks with no stuck loop', live.tick > 20, `tick=${live.tick}`)
// #1764 item 3: the village is live in the browser world too (state-based, so
// it holds on the degraded-Chrome box where the pixel family is flaky).
r.check('the village is alive in the browser world (14–21 villagers at seed 7)',
    live.villagers >= 14 && live.villagers <= 21, `villagers=${live.villagers}`)
// #1764 stage 2: the economy is live in the browser world too (state-based).
const eco1 = await page.evaluate(() => window.__carpetTest.villageEconomy('grab'))
r.check('the browser world snags a villager at the floor (grip set, lane −1)',
    !!eco1.prisoner && eco1.villagers >= 13 && eco1.villagers <= 20, JSON.stringify(eco1))
const eco2 = await page.evaluate(() => window.__carpetTest.villageEconomy('deliver'))
r.check('the browser world converts the hut on delivery (pennant up, grip empty)',
    eco2.prisoner === null && eco2.allyHuts === 1, JSON.stringify(eco2))

// #1764 item 4 stage 1: the ocean's palette cycle lives in the browser world
// too (state-based — the shader clock must be sim ticks, never wall time).
// Paints arrive on rAF cadence (irregular on loaded boxes), so poll until the
// uniform equals the tick; the wait is bounded — a clock stuck off ticks goes red.
const wave = await page.evaluate(async () => {
    const t = window.__carpetTest
    window.__game.reset(7)
    for (let i = 0; i < 20; i++) window.__game.step({}, 1)
    let p0 = null
    for (let i = 0; i < 40 && !p0; i++) {
        await new Promise((res) => setTimeout(res, 50))
        const p = t.probe()
        if (p.waveTick === p.tick) p0 = p
    }
    for (let i = 0; i < 6; i++) window.__game.step({}, 1)
    let p1 = null
    for (let i = 0; i < 40 && !p1; i++) {
        await new Promise((res) => setTimeout(res, 50))
        const p = t.probe()
        if (p.waveTick === p.tick && p.tick >= 26) p1 = p
    }
    return p0 && p1
        ? { i0: p0.waveIdx, i1: p1.waveIdx, t0: p0.tick, t1: p1.tick, w0: p0.waveTick, w1: p1.waveTick }
        : { miss: true, p0, p1 }
})
r.check('#1764 item 4: the ocean palette index rides sim ticks (shader clock equals tick on painted frames; index = floor(tick/6) % 4; clock moves)',
    !wave.miss
    && wave.i0 === Math.floor(wave.t0 / 6) % 4 && wave.i1 === Math.floor(wave.t1 / 6) % 4
    && wave.t1 >= wave.t0 + 6 && wave.w1 > wave.w0,
    JSON.stringify(wave))

// #1764 item 4 stage 2: the LIVE world dives a flooded crater, and the mix the
// shader actually painted (subU) equals the sim-derived depth min(1, sub/6) on a
// painted frame — the underwater view is driven by gs, never wall time. State-based
// by intent: the flaky pixel family (#1090/#1703) must not gate the dive.
const dive = await page.evaluate(async () => {
    const t = window.__carpetTest
    window.__game.reset(7)
    for (let i = 0; i < 10; i++) window.__game.step({}, 1)
    const dig = t.diveDig()
    let p = null
    for (let i = 0; i < 120 && !p; i++) {
        window.__game.step({ down: true }, 1)
        for (let k = 0; k < 10 && !p; k++) {
            await new Promise((res) => setTimeout(res, 40))
            const q = t.probe()
            if (q.sub > 1 && q.subU > 0 && Math.abs(q.subU - Math.min(1, q.sub / 6)) < 0.02) p = q
        }
    }
    return p ? { sub: p.sub, subU: p.subU, alt: p.alt, flooded: dig.flooded, floor: dig.floor, digs: dig.digs }
        : { miss: true, dig, last: t.probe() }
})
r.check('#1764 item 4 stage 2: the LIVE carpet dives a flooded crater and the underwater mix reaches the shader (diveOf depth, sim-driven)',
    !dive.miss && dive.flooded && dive.sub > 1 && dive.subU > 0 && dive.alt < WATER,
    JSON.stringify(dive))

// ---- GPU world pass (#1083): the GPU must actually render the world, craters
// must visibly feed the terrain upload (glow), lava cools, scorch persists.
// Reload first so every shader compile lands under the console listener.
await page.reload({ waitUntil: 'load' })
await page.waitForFunction(() => window.__game && window.__carpetTest, null, { timeout: 15000 })
await page.waitForTimeout(500)
const gpuA = await page.evaluate(() => {
    const t = window.__carpetTest
    t.start()
    const stats = (x, y, w, h) => {
        const p = t.pixels(x, y, w, h)
        if (!p) return null
        let rs = 0, gs = 0, bs = 0, n = 0
        const lum = []
        for (let i = 0; i < p.length; i += 4) {
            rs += p[i]; gs += p[i + 1]; bs += p[i + 2]
            lum.push(0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2])
            n++
        }
        const mr = rs / n, mg = gs / n, mb = bs / n
        const m = lum.reduce((a, b) => a + b, 0) / n
        const sd = Math.sqrt(lum.reduce((a, b) => a + (b - m) * (b - m), 0) / n)
        return { r: mr, g: mg, b: mb, mean: m, sd }
    }
    return { gl2: t.gl2(), sky: stats(0.5, 0.10, 40, 8), ground: stats(0.5, 0.80, 40, 8), center: stats(0.35, 0.42, 48, 110) }
})
r.check('GPU world pass present (WebGL2 renderer alive)', gpuA.gl2 === true)
r.check('sky paints: bright and blue-dominant', gpuA.sky && gpuA.sky.mean > 28 && gpuA.sky.b > gpuA.sky.r + 12,
    gpuA.sky ? `mean ${gpuA.sky.mean.toFixed(0)} rgb ${gpuA.sky.r.toFixed(0)},${gpuA.sky.g.toFixed(0)},${gpuA.sky.b.toFixed(0)}` : 'no readback')
r.check('terrain reads different from sky below the horizon', gpuA.ground && gpuA.sky &&
    Math.hypot(gpuA.ground.r - gpuA.sky.r, gpuA.ground.g - gpuA.sky.g, gpuA.ground.b - gpuA.sky.b) > 24,
    gpuA.ground ? `ground rgb ${gpuA.ground.r.toFixed(0)},${gpuA.ground.g.toFixed(0)},${gpuA.ground.b.toFixed(0)} vs sky rgb ${gpuA.sky.r.toFixed(0)},${gpuA.sky.g.toFixed(0)},${gpuA.sky.b.toFixed(0)}` : 'no readback')
r.check('the world has texture, not a flat fill', gpuA.center && gpuA.center.sd > 6, `sd ${gpuA.center ? gpuA.center.sd.toFixed(1) : 'n/a'}`)
await page.evaluate(() => { window.__carpetTest.digHot() })
await page.waitForTimeout(150)
const gpuDig = await page.evaluate(() => {
    const t = window.__carpetTest
    const p = t.pixels(0.35, 0.72, 48, 18)
    if (!p) return null
    const lum = []
    for (let i = 0; i < p.length; i += 4) lum.push(0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2])
    const m = lum.reduce((a, b) => a + b, 0) / lum.length
    return { mean: m, sd: Math.sqrt(lum.reduce((a, b) => a + (b - m) ** 2, 0) / lum.length) }
})
r.check('digging at the feet lights the near ground (camera sits ON its terrain grid)',
    gpuDig && gpuA.ground && Math.abs(gpuDig.mean - gpuA.ground.mean) > 3 && gpuDig.sd > 2,
    gpuDig ? `after dig mean ${gpuDig.mean.toFixed(1)} sd ${gpuDig.sd.toFixed(1)} vs ground mean ${gpuA.ground.mean.toFixed(1)}` : 'no readback')
await page.evaluate(() => { window.__carpetTest.digHot(); window.__carpetTest.fx({ type: 'boom', x: 100, y: 100 }) })
await page.waitForTimeout(200)
const gpuB = await page.evaluate(() => ({ glow: window.__carpetTest.glowCells(), scorch: window.__carpetTest.scorchCells() }))
r.check('a hot crater feeds lava glow into the terrain upload', gpuB.glow >= 4, `glow cells ${gpuB.glow}`)
r.check('blasts leave persistent scorch in the terrain upload', gpuB.scorch >= 6, `scorch cells ${gpuB.scorch}`)
await page.evaluate(() => { for (let i = 0; i < 320; i++) window.__game.step({}, 1) })
await page.waitForTimeout(200)
const gpuC = await page.evaluate(() => ({ glow: window.__carpetTest.glowCells(), scorch: window.__carpetTest.scorchCells(), tick: window.__carpetTest.probe().tick }))
r.check('lava glow cools to nothing after CRATER_GLOW ticks', gpuC.glow === 0, `glow cells ${gpuC.glow} at tick ${gpuC.tick}`)
r.check('scorch outlives the glow', gpuC.scorch >= 6, `scorch cells ${gpuC.scorch}`)

// ---- #1090 polish A: the world pass is world-time driven, not wall-clock.
// Water shimmer, lava flicker, clouds and cloud shadows all sample uWorldTime
// (sim ticks), so two captures at the SAME tick must be pixel-identical. Run
// before the rubble gate so no particles exist on screen yet (particles
// integrate per paint frame). Mutation guide: switch the water block back to
// uTime (performance.now) in renderer.js tFrag and consecutive captures
// diverge — this gate goes red.
const sameTick = await page.evaluate(async () => {
    const t = window.__carpetTest
    window.__game.reset(7)
    for (let i = 0; i < 40; i++) window.__game.step({}, 1)
    await new Promise((res) => setTimeout(res, 150))
    const grab = () => t.pixels(0.3, 0.75, 64, 10)
    const a = grab()
    await new Promise((res) => setTimeout(res, 150))
    const b = grab()
    if (!a || !b) return { ok: false, why: 'no readback' }
    let diff = 0
    for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i])
    return { ok: a.length === b.length && diff === 0, diff, tick: t.probe().tick }
})
r.check('same tick renders identical frames: water/clouds/shadow animate on WORLD time (#1090)',

    sameTick.ok, `sumAbsDiff=${sameTick.diff} at tick ${sameTick.tick}${sameTick.why ? ' (' + sameTick.why + ')' : ''}`)

// ---- #1090 polish B: rubble keeps smouldering long after the fire is gone.
// Reset clears particles; killHut marks a hut dead (burn 0); after 40 ticks the
// dead-rubble emitter must still be breathing smoke with no hot crater anywhere
// (glow===0 rules out crater/blast smoke as the source). Mutation guide: delete
// the `hs.dead` smoke branch in renderer.js emitAmbient and this gate goes red.
await page.evaluate(() => { window.__game.reset(7) })
await page.waitForTimeout(250)
const smokeLate = await page.evaluate(async () => {
    const t = window.__carpetTest
    t.killHut()
    for (let i = 0; i < 40; i++) window.__game.step({}, 1)
    await new Promise((res) => setTimeout(res, 800))
    return { puffs: t.smokePuffs(), glow: t.glowCells() }
})
r.check('dead rubble keeps smouldering long after the fire is gone (#1090)',
    smokeLate.puffs > 0 && smokeLate.glow === 0, `smoke instances ${smokeLate.puffs}, glow ${smokeLate.glow}`)

// ---- #1764 item 5 stage 5 live: the law rides the LIVE camera. Same tile,
// same yaw; eye pinned at 20 (inside the layer) vs 110 (above farY). The
// probe reports aerialFog at the carpet's own altitude — deck vs climb must
// show the airOf ratio (0.6) and the peak-vs-lowland ratio (0.5) the shaders
// bake. (A pixel-strip comparison was tried first and rejected: pitch moves the
// horizon band with altitude, so it measured viewpoint, not the law — rule 8.)
await page.evaluate(() => { window.__game.reset(7); window.__carpetTest.start(); for (let i = 0; i < 80; i++) window.__game.step({}, 1) })
const airClimb = await page.evaluate(async () => {
    const t = window.__carpetTest
    const wait = (ms) => new Promise((res) => setTimeout(res, ms))
    const p = t.probe()
    const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    const grab = async (alt) => {
        for (let i = 0; i < 6; i++) { window.__game.step({}, 1); t.holdCarpet(p.x, p.y, alt) }
        await wait(260)
        const s = t.pixels(0.2, 0.6, 96, 10)
        const sky = t.pixels(0.2, 0.28, 40, 6)
        let skyL = 0, n = 0
        for (let i = 0; i < sky.length; i += 4) { skyL += lum(sky, i); n++ }
        skyL /= n
        let dev = 0; n = 0
        for (let i = 0; i < s.length; i += 4) { dev += Math.abs(lum(s, i) - skyL); n++ }
        return { dev: dev / n, law: t.aerial(200) }
    }
    const low = await grab(20)
    const high = await grab(110)
    return { low, high }
})
r.check('#1764-5s5 live: the aerial law rides the live camera — peaks keep half, climbing thins the path',
    airClimb.low.law.camY < 40 && airClimb.high.law.camY > 100 &&
    airClimb.low.law.low > airClimb.low.law.peak * 1.8 &&
    airClimb.high.law.low < airClimb.low.law.low * 0.75 && airClimb.high.law.low > 0,
    `deck low=${airClimb.low.law.low} peak=${airClimb.low.law.peak}; climb low=${airClimb.high.law.low} (air floor 0.6)`)

// ---- #1612 item 1: the veiled carpet breathes additive ghost motes behind it.
// Mutation guide: delete the `gs0.invis > 0` block in fillParticles (renderer.js)
// and this gate goes red while every other gate holds.
await page.evaluate(() => { window.__game.reset(7) })
await page.waitForTimeout(250)
const trail = await page.evaluate(async () => {
    const t = window.__carpetTest
    const clean = t.trailMotes()
    t.veil()
    await new Promise((res) => setTimeout(res, 600))
    return { clean, motes: t.trailMotes(), invis: t.probe().invis }
})
r.check('the veiled carpet leaves a ghost trail in the GL pass (#1612)',
    trail.invis > 0 && trail.motes > trail.clean + 8, `motes ${trail.clean} -> ${trail.motes} (veil ${trail.invis})`)

// ---- #1646 item 1: killed bodies crumble to ash where they stand, like the
// original. Ash is a distinct particle kind, so this counts cold grit only.
// Mutation guide: delete the `kill` branch in renderer.js handleEvents and this
// gate goes red (crumbles stays 0 while every other gate holds). The world
// reset must clear the grit — no particle leak across worlds.
await page.evaluate(() => { window.__game.reset(7); window.__carpetTest.start() })
await page.waitForTimeout(250)
const crumble = await page.evaluate(async () => {
    const t = window.__carpetTest
    const clean = t.crumbles()
    const p = t.probe()
    t.fx({ type: 'kill', kind: 'giant', x: p.x + 15, y: p.y + 15 })
    await new Promise((res) => setTimeout(res, 150))
    const seen = t.crumbles()
    window.__game.reset(7)
    await new Promise((res) => setTimeout(res, 150))
    return { clean, seen, cleared: t.crumbles() }
})
r.check('a killed creature crumbles to ash in place (#1646)',
    crumble.clean === 0 && crumble.seen >= 12 && crumble.cleared === 0,
    `ash ${crumble.clean} -> ${crumble.seen} -> cleared ${crumble.cleared}`)

// #1697 browser leg: the landing event drives real particles and real
// scheduled sound, scaled by distance; raise landings throw nothing.
const land1697 = await page.evaluate(() => {
    // AudioContext needs the page's own unlock gesture before any one-shot
    // schedules; a synthetic keydown runs the App's once-listener.
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }))
    const t = window.__carpetTest
    const { x, y } = t.carpet()
    const ev = (kind, dx, mag) => t.fx({ type: 'crumble', kind, mag, x: x + dx, y, r: 28, hot: 0, flooded: kind === 'dissolve' ? 1 : 0 })
    const ash0 = t.crumbles(), sfx0 = t.sfx()
    ev('crater', 40, 10)
    const ashNear = t.crumbles(), sfxNear = t.sfx()
    ev('raise', 40, 14)
    const ashRaise = t.crumbles(), sfxRaise = t.sfx()
    ev('crater', 260, 10)
    const sfxFar = t.sfx()
    return { ash0, ashNear, ashRaise, sfx0, sfxNear, sfxRaise, sfxFar }
})
r.check('#1697 a crater landing throws cold grit through the ash pool (#1697)',
    land1697.ashNear - land1697.ash0 >= 8 && land1697.ashRaise === land1697.ashNear,
    `ash ${land1697.ash0} -> ${land1697.ashNear} (raise ${land1697.ashRaise})`)
r.check('#1697 a near landing schedules the thud; a distant one schedules nothing (#1697)',
    land1697.sfxNear > land1697.sfx0 && land1697.sfxRaise > land1697.sfxNear && land1697.sfxFar === land1697.sfxRaise,
    `sfx ${land1697.sfx0} -> ${land1697.sfxNear} -> ${land1697.sfxRaise} -> ${land1697.sfxFar}`)

// ---- #1612 item 4 (browser): veiling actually closes the ambience low-pass the
// shell drives the wind/growl bed through. Mutation guide: drop the
// setMuffle(muffleOf(gs)) call in index.jsx and the veiled reading is null.
await page.evaluate(() => { window.__game.reset(7); window.__carpetTest.start() })
await page.waitForTimeout(300)
const muffleOpen = await page.evaluate(() => window.__carpetTest.muffle())
await page.evaluate(() => { window.__carpetTest.veil() })
await page.waitForTimeout(300)
const muffleVeil = await page.evaluate(() => window.__carpetTest.muffle())
if (muffleOpen === null || muffleVeil === null) {
    // headless shells without an audio device never bring up the ambience bus —
    // a question this box cannot ask, not a wrong answer (Report.skip doctrine).
    r.skip('the veil muffles the world — ambience low-pass', `bus not up on this box (open=${muffleOpen} veiled=${muffleVeil})`)
} else {
    r.check('the veil muffles the world — the ambience bus low-pass drops while veiled, open when visible',
        muffleOpen >= 10000 && muffleVeil > 0 && muffleVeil <= 1000, `open=${muffleOpen} veiled=${muffleVeil}`)
}
// ---- #1790 ANAGLYPH STEREO: the original's stereo glasses, in red/cyan.
// Gates run on a frozen world (the #1090 reset+step trick), so the mono and
// stereo readings see byte-identical sim state and the ONLY difference is the
// two cameras. The metric is the horizontal peak of the cross-correlation
// between the red channel (left eye) and the green channel (right eye): with
// one view red ≈ green and the peak sits at dx 0; with eyes apart the views
// shift by ipd·f/depth px — the peak moves off-axis, and its SIGN pins which
// eye feeds which channel (red = left eye is the convention anaglyph glasses
// are ground for). Mutation guide: (1) IPD to 0 → near/mid collapse to 0 red;
// (2) swap uL/uR in the combine → polarity flips, mid band red; (3) force
// stereo true at init → the mono baseline reads parallax and goes red;
// (4) drop the left-eye half-shift → far/near spread breaks gate 4.
await page.evaluate(() => { window.__game.reset(7); for (let i = 0; i < 40; i++) window.__game.step({}, 1) })
await page.waitForTimeout(250)
const anag = await page.evaluate(async () => {
    const t = window.__carpetTest
    const wait = (ms) => new Promise((res) => setTimeout(res, ms))
    const W = 90, H = 40
    const peak = (region) => {
        const px = (x, y) => region[(y * W + x) * 4]
        const py = (x, y) => region[(y * W + x) * 4 + 1]
        let best = null
        for (let dx = -24; dx <= 24; dx++) {
            let sxy = 0, sx = 0, sy = 0, sxx = 0, syy = 0, n = 0
            for (let y = 2; y < H - 2; y++) for (let x = 24; x < W - 24; x++) {
                const a = px(x, y), c = py(x + dx, y)
                sxy += a * c; sx += a; sy += c; sxx += a * a; syy += c * c; n++
            }
            const cov = sxy / n - (sx / n) * (sy / n)
            const cor = cov / (Math.sqrt(sxx / n - (sx / n) ** 2) * Math.sqrt(syy / n - (sy / n) ** 2))
            if (!best || cor > best.cor) best = { dx, cor }
        }
        return best
    }
    const bands = () => ({ far: peak(t.pixels(0.25, 0.48, W, H)), mid: peak(t.pixels(0.25, 0.62, W, H)), near: peak(t.pixels(0.25, 0.78, W, H)) })
    const sky = () => {
        const p = t.pixels(0.5, 0.10, 40, 8)
        let r = 0, g = 0, b = 0, n = 0
        for (let i = 0; i < p.length; i += 4) { r += p[i]; g += p[i + 1]; b += p[i + 2]; n++ }
        return { r: r / n, g: g / n, b: b / n }
    }
    const mono0 = bands()
    const sky0 = sky()
    t.setStereo(true)
    await wait(400)
    const ster = bands()
    const skyS = sky()
    // the HUD reminder (flat overlay canvas): red pip over cyan pip.
    const hud = document.querySelector('canvas[data-mc-hud="1"]')
    const hc = hud.getContext('2d')
    const pip = (x) => { const d = hc.getImageData(x, 17, 4, 4).data; return { r: d[0], g: d[1], b: d[2] } }
    const chipOn = { red: pip(8), cyan: pip(14) }
    t.setStereo(false)
    await wait(400)
    const mono1 = bands()
    const chipOff = { red: pip(8) }
    return { mono0, ster, mono1, sky0, skyS, chipOn, chipOff, ipd: t.ipd() }
})
r.check('#1790 default is one view: red↔green correlation peaks at zero shift on every band',
    ['far', 'mid', 'near'].every((k) => Math.abs(anag.mono0[k].dx) <= 1) && anag.ipd > 0,
    ['far', 'mid', 'near'].map((k) => `${k} ${anag.mono0[k].dx}@${anag.mono0[k].cor.toFixed(2)}`).join(' | ') + ` ipd ${anag.ipd}`)
// The bands are taken strongest-of(mid,near): under software-GL load this box
// sometimes lands a band on flat sky (main's own sky/texture readback gates
// flake the same way) — a flat band carries no correlation peak, so the
// separation claim rides on whichever near band the frame actually shows.
const anagPeak = Math.max(Math.abs(anag.ster.mid.dx), Math.abs(anag.ster.near.dx))
const anagSigned = Math.abs(anag.ster.mid.dx) >= Math.abs(anag.ster.near.dx) ? anag.ster.mid.dx : anag.ster.near.dx
r.check('#1790 glasses ON: red(left) vs green(right) peaks 4–24 px off-axis over near ground, negative — left-eye polarity (the convention glasses are ground for)',
    anagPeak >= 4 && anagPeak <= 24 && anagSigned < 0,
    `mid ${anag.ster.mid.dx}@${anag.ster.mid.cor.toFixed(2)} near ${anag.ster.near.dx}@${anag.ster.near.cor.toFixed(2)}`)
r.check('#1790 depth lives: the far band parallaxes less than the strongest near band (|dx far| ≤ 8 and < peak − 2)',
    Math.abs(anag.ster.far.dx) <= 8 && Math.abs(anag.ster.far.dx) < anagPeak - 2,
    `far ${anag.ster.far.dx} vs peak ${anagSigned}`)
r.check('#1790 the stereo frame is still Magic Carpet sky: bright and blue-dominant (channels split views, not hue)',
    anag.skyS.b > 28 && anag.skyS.b > anag.skyS.r + 12,
    `rgb ${anag.skyS.r.toFixed(0)},${anag.skyS.g.toFixed(0)},${anag.skyS.b.toFixed(0)}`)
r.check('#1790 glasses OFF restores mono pixel-for-pixel (peak back at zero on every band)',
    ['far', 'mid', 'near'].every((k) => Math.abs(anag.mono1[k].dx) <= 1),
    ['far', 'mid', 'near'].map((k) => `${k} ${anag.mono1[k].dx}`).join(' '))
r.check('#1790 the HUD wears its own reminder, flat: red+cyan pips while ON, gone while OFF',
    anag.chipOn.red.r > 150 && anag.chipOn.red.g < 110 && anag.chipOn.cyan.b > 150 && anag.chipOn.cyan.g > 150 && anag.chipOff.red.r < 120,
    `on ${JSON.stringify(anag.chipOn.red)}/${JSON.stringify(anag.chipOn.cyan)} off ${JSON.stringify(anag.chipOff.red)}`)
// the real V key + persistence + the phone entry (?stereo=1 outranks storage).
await page.evaluate(() => { try { localStorage.removeItem('mc-stereo') } catch {} })
await page.keyboard.press('KeyV')
await page.waitForTimeout(120)
const vOn = await page.evaluate(() => ({ on: window.__carpetTest.stereo(), ls: localStorage.getItem('mc-stereo') }))
r.check('#1790 V flips the glasses and the choice is remembered (localStorage)',
    vOn.on === true && vOn.ls === '1', JSON.stringify(vOn))
await page.reload({ waitUntil: 'load' })
await page.waitForFunction(() => window.__carpetTest, null, { timeout: 15000 })
const vPersist = await page.evaluate(() => window.__carpetTest.stereo())
r.check('#1790 glasses survive a reload (you keep the ones you wore)', vPersist === true, `${vPersist}`)
await page.keyboard.press('KeyV')
await page.waitForTimeout(120)
await page.goto(`http://localhost:${process.env.DEV_PORT || 5173}/retrogames/magic-carpet?stereo=1`, { waitUntil: 'load' })
await page.waitForFunction(() => window.__carpetTest, null, { timeout: 15000 })
const paramOn = await page.evaluate(() => window.__carpetTest.stereo())
r.check('#1790 ?stereo=1 opens the glasses on a fresh link even when storage says off (the phone hand)',
    paramOn === true, `param ${paramOn} vs stored ${await page.evaluate(() => localStorage.getItem('mc-stereo'))}`)
await page.goto(`http://localhost:${process.env.DEV_PORT || 5173}/retrogames/magic-carpet`, { waitUntil: 'load' })
await page.waitForFunction(() => window.__carpetTest, null, { timeout: 15000 })
const backOff = await page.evaluate(() => window.__carpetTest.stereo())
r.check('#1790 the param does not stick: the plain link honours storage (off)', backOff === false, `${backOff}`)

r.check('no shader/WebGL console errors', gpuErrs.length === 0, gpuErrs.join(' | '))
r.check('zero page errors', errs.length === 0, errs.join(' | '))

// ---- #1673: phone-size DISSOLVE pass (390x844, real touchscreen taps).
// Why this section exists: on 2026-11-06 the phone look&feel pass could not run at
// all — copied-lane worktrees inherit main checkout's self-referential
// `node_modules/node_modules` symlink, Vite's optimizer then resolves react twice and
// EVERY page dies on "Invalid hook call" (the #1622 react-dup half, previously misread
// as a MagicCarpet failure). Gate 1 is that regression catcher: phone viewport loads
// with zero page errors. Mutation guide: delete `resolve.dedupe` from vite.config.js
// in a copied tree and gate 1 goes red. The tray gates below drive real touch events
// through the shell's own onPointer (CSS->HUD mapping), which no Node gate can see:
// change the slot stride in sim.js TRAY or the 11-key row in index.jsx and the
// slot-11 / Minus gates go red.
// a second WebGL page inside the same --single-process shell is a crash risk
// (#1622 ladder boots shell+sp here) — give the phone pass its own browser.
await browser.close()
const pBrowser = await launch()
const phone = await openGame(pBrowser, {
    url: `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/magic-carpet`,
    viewport: { width: 390, height: 844 }, touch: true, start: false, hook: '__game',
})
const pErrs = []
phone.on('pageerror', (e) => pErrs.push(e.message))
await phone.waitForTimeout(600)
r.check('#1673 dev-graph on phones: 390x844 touch load, zero page errors (one react)',
    pErrs.length === 0, pErrs.join(' | '))
const hud = await phone.evaluate(() => window.__carpetTest.hudRect())
const toCss = (hx, hy) => [hud.left + (hx / W) * hud.w, hud.top + (hy / H) * hud.h]
// The #1147 hint is up at this size (portrait + wide canvas) — before any tap
// can dismiss it, prove it does not swallow the stage: MagicCarpet's portrait
// band runs through the screen centre and its tray sits under the card, so a
// pointer-events-auto card made every mid-canvas tap vanish (#1673's four red
// touch gates). Mutation guide: card back to pointer-events-auto → red here.
const hintUp = await phone.evaluate(() => !!document.querySelector('[data-nav="rotate-dismiss"]'))
const centreCss = toCss(W / 2, H / 2 - 40)
const centreHit = await phone.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y)
    return el ? `${el.tagName.toLowerCase()}${el.dataset.vc ? '[vc]' : ''}` : 'none'
}, centreCss)
r.check('#1673 ROTATE hint is click-through: canvas centre hit-tests to the canvas while the hint is up',
    hintUp && centreHit === 'canvas', `hint up=${hintUp}, centre hit=${centreHit}`)
// start by tap (any tap leaves attract), exactly the forgotten-how-to-play gesture
await phone.touchscreen.tap(...toCss(W / 2, H / 2 - 40))
await phone.waitForTimeout(500)
r.check('#1673 attract yields to a single phone tap',
    (await phone.evaluate(() => window.__carpetTest.probe())).screen === 'play',
    `screen=${(await phone.evaluate(() => window.__carpetTest.probe())).screen}`)
// 1) SPELLS tab by real touch, then the 11th tray cell equips DISSOLVE left-handed
await phone.touchscreen.tap(...toCss(TAP.book[0] + TAP.book[2] / 2, TAP.book[1] + TAP.book[3] / 2))
await phone.waitForTimeout(120)
const trayOpen = (await phone.evaluate(() => window.__carpetTest.probe())).book
await phone.evaluate(() => window.__carpetTest.arm('dissolve'))
const s11 = [TRAY[0] + 10 * 14 + 7, TRAY[1] + TRAY[3] / 2] // slot 11 centre, HUD px
await phone.touchscreen.tap(...toCss(...s11))
await phone.waitForTimeout(120)
const after = await phone.evaluate(() => window.__carpetTest.probe())
r.check('#1673 real touch: SPELLS tab opens the tray at phone size', trayOpen === true)
r.check('#1673 slot 11 is inside the HUD and tappable at 390x844 (tray strip on-screen)',
    s11[0] >= 0 && s11[0] <= W && hud.w > 0 && hud.h > 0,
    `slot@css ${Math.round(toCss(...s11)[0])},${Math.round(toCss(...s11)[1])} of 390x844, hud ${Math.round(hud.w)}x${Math.round(hud.h)}`)
r.check('#1673 tap on the 11th cell equips DISSOLVE to the left hand and closes the tray',
    after.hands.L === 'dissolve' && after.book === false, `L=${after.hands.L} book=${after.book}`)
r.info('#1673 legibility', `each tray cell ≈ ${(14 * hud.w / W).toFixed(1)}x${(22 * hud.h / H).toFixed(1)} CSS px at 390x844 (below the 44pt HIG target — accepted: 11 slots on the original's 320px strip, keyboard/pad carry casts)`)
// 4) the `-` keycap: Minus equips the 11th spell on a desktop keyboard
await phone.evaluate(() => { window.__game.reset(7); window.__carpetTest.start(); window.__carpetTest.arm('dissolve') })
await phone.waitForTimeout(150)
await phone.evaluate(() => { window.__carpetTest.tap(0, 0) })
await phone.keyboard.press('Minus')
await phone.waitForTimeout(120)
r.check('#1673 Minus equips DISSOLVE (the row after Digit0)',
    (await phone.evaluate(() => window.__carpetTest.probe())).hands.L === 'dissolve')
// 2) cold FX: a dissolving ground sprays cyan particles — and provably no ash/fire
await phone.evaluate(() => window.__game.reset(7))
await phone.waitForTimeout(200)
const pBefore = await phone.evaluate(() => window.__carpetTest.trailMotes())
await phone.evaluate(() => window.__carpetTest.fx({ type: 'dissolve', x: 100, y: 100, r: 22, huts: 0 }))
await phone.waitForTimeout(100)
const fxA = await phone.evaluate(() => ({ parts: window.__carpetTest.trailMotes(), ash: window.__carpetTest.crumbles() }))
await phone.screenshot({ path: 'docs/shots/issue-1673-dissolve-fx.png' })
r.check('#1673 DISSOLVE FX: cold cyan spray spawns on the wound, zero fire/ash',
    fxA.parts >= pBefore + 16 && fxA.ash === 0, `particles ${pBefore} -> ${fxA.parts}, ash ${fxA.ash}`)
// 3) the banner row at phone size: cast for real (touch the world) and the shell says it
await phone.evaluate(() => { window.__game.reset(7); window.__carpetTest.start(); window.__carpetTest.arm('dissolve'); window.__carpetTest.equipL('dissolve') })
await phone.waitForTimeout(200)
const mA = (await phone.evaluate(() => window.__carpetTest.probe())).mana
const mM = await phone.evaluate(() => window.__carpetTest.trailMotes())
await phone.touchscreen.tap(...toCss(W / 2, 60)) // world tap above the strip = cast
await phone.waitForTimeout(250)
const cast = await phone.evaluate(() => ({ mana: window.__carpetTest.probe().mana, screen: window.__carpetTest.probe().screen, motes: window.__carpetTest.trailMotes() }))
await phone.screenshot({ path: 'docs/shots/issue-1673-phone-play.png' })
r.check('#1673 world tap casts DISSOLVE at phone size (40 mana paid, spray rides the wound, banner rides the HUD)',
    cast.screen === 'play' && cast.mana <= mA - 40 && cast.motes >= mM + 16,
    `mana ${mA}->${cast.mana}, motes ${mM}->${cast.motes}, screen=${cast.screen}`)
// ---- #1764 item 1: the castle spell book, driven through the REAL shell.
// holdCarpet (the same pin the crumble proof uses) teleports the carpet home,
// then real keys: B opens, an arrow pages, L arms, Space closes. State-based
// only (the probe) — no pixels — so the #1622 degraded-Chrome pixel family
// cannot flake it. Mutation guide: break the shell's KeyB branch or the
// bookKey routing and the open/page/arm gates go red; remove the step() freeze
// and the tick-frozen gate goes red.
await phone.evaluate(() => { window.__game.reset(7); window.__carpetTest.start() })
await phone.waitForTimeout(250)
const cc = await phone.evaluate(() => {
    const c = window.__carpetTest.probe().castle
    window.__carpetTest.holdCarpet(c.x, c.y, 34)
    return window.__carpetTest.probe()
})
r.check('#1764 the teleport lands at the castle (atCastle true)', cc.atCastle === true,
    `atCastle=${cc.atCastle} x=${cc.x} castle=${JSON.stringify(cc.castle)}`)
await phone.keyboard.press('KeyB')
await phone.waitForTimeout(150)
const bOpen = await phone.evaluate(() => window.__carpetTest.probe())
r.check('#1764 B at the castle opens the spell book on the first page',
    bOpen.spellBook === true && bOpen.bookPage === 0, `spellBook=${bOpen.spellBook} page=${bOpen.bookPage}`)
const tFrozen = bOpen.tick
await phone.waitForTimeout(400)
const tAfter = (await phone.evaluate(() => window.__carpetTest.probe())).tick
r.check('#1764 the world holds still while the book is open (tick frozen across real frames)',
    tAfter === tFrozen, `tick ${tFrozen} -> ${tAfter}`)
await phone.keyboard.press('ArrowRight')
await phone.waitForTimeout(120)
await phone.evaluate(() => window.__carpetTest.arm('lightning'))
await phone.keyboard.press('KeyL')
await phone.waitForTimeout(120)
const bEq = await phone.evaluate(() => window.__carpetTest.probe())
r.check('#1764 a real arrow pages and L arms the learned page (LIGHTNING) to the left hand',
    bEq.bookPage === 1 && bEq.hands.L === 'lightning', `page=${bEq.bookPage} L=${bEq.hands.L}`)
await phone.screenshot({ path: 'docs/shots/issue-1764-spell-book.png' })
await phone.keyboard.press('Space')
await phone.waitForTimeout(120)
r.check('#1764 Space (the pad\'s A) closes the book',
    (await phone.evaluate(() => window.__carpetTest.probe())).spellBook === false)
// ---- #1703 phone proof: the crumble RENDERS at 390px — rim silhouette and
// mid-window animation measured on pixels, not assumed. Reuses the phone page
// above. The camera is PINNED via holdCarpet (same pose for every capture) so
// before/peak/settled frames share one viewpoint; craterAt leaves the crumble
// window OPEN so a capture can land exactly on the rim peak (a=CRUMBLE_T/2,
// sin(π/2)=1). Premise correction (issue item 2): this title has NO non-WebGL
// world — ?lite=1 is low-spec WebGL (antialias off, dpr cap 1), the only 2D
// canvas is the HUD; so the lite proof is: the crumble animates under lite-GL.
// Mutation guide: zero the rim (0.18*depth → 0 in queueDeform, sim.js) and the
// lift gate goes red while the boot gates hold; pin sinkCurve to 1 (instant
// crater) and the animation gate (AC > 1.25×AB) goes red.
await phone.evaluate(() => { window.__game.reset(7); window.__carpetTest.start() })
await phone.waitForTimeout(300)
const proof = await phone.evaluate(async () => {
    const t = window.__carpetTest, g = window.__game
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms))
    const r0 = t.hudRect()
    const dpr = window.devicePixelRatio || 1
    const strip = { w: 200, h: 170 }
    strip.x0n = 0.5 - 100 / (r0.w * dpr)
    strip.y0n = 0.56 // normalized from TOP (pixels(): y=1 is top); h=170 spans
    // the horizon wherever the smoothed camera pitch parks it on degraded boxes.
    const pin = () => { const p = t.probe(); t.holdCarpet(p.x, p.y, p.alt) }
    pin(); await sleep(350); pin()
    const A = t.pixels(strip.x0n, strip.y0n, strip.w, strip.h)
    const p = t.probe()
    t.craterAt(p.x + Math.cos(p.yaw) * 70, p.y + Math.sin(p.yaw) * 70, 14, 10, 1)
    for (let a = 0; a < 5;) {
        g.step({}, 1); pin()
        const d = t.deforms()
        if (d.length && d[d.length - 1].a > a) a = d[d.length - 1].a
    }
    await sleep(350); pin()
    const B = t.pixels(strip.x0n, strip.y0n, strip.w, strip.h)
    for (let i = 0; i < 8; i++) { g.step({}, 1); pin() }
    await sleep(350); pin()
    const C = t.pixels(strip.x0n, strip.y0n, strip.w, strip.h)
    const diff = (P, Q) => {
        let changed = 0, sum = 0
        for (let i = 0; i < P.length; i += 4) {
            const d = Math.abs(P[i] - Q[i]) + Math.abs(P[i + 1] - Q[i + 1]) + Math.abs(P[i + 2] - Q[i + 2])
            sum += d / 3
            if (d > 30) changed++
        }
        return { changed, mean: +(sum / (P.length / 4)).toFixed(2) }
    }
    const W = strip.w, H = strip.h
    const get = (P, c, r) => { const i = ((H - 1 - r) * W + c) * 4; return [P[i], P[i + 1], P[i + 2]] }
    // crest row per column: topmost strongly-changed row (r=0 strip top).
    // A lifted rim silhouette is exactly this edge: above it the frames agree.
    const crests = []
    for (let c = 20; c < W - 20; c += 4) {
        let top = -1
        for (let r = 0; r < H; r++) {
            const a1 = get(A, c, r), b1 = get(B, c, r)
            if (Math.abs(a1[0] - b1[0]) + Math.abs(a1[1] - b1[1]) + Math.abs(a1[2] - b1[2]) > 48) { top = r; break }
        }
        crests.push(top)
    }
    // vertical alignment shift per column near the crest band, then relative
    // to the BACKGROUND mode: the pin holds pos/alt but the renderer camera
    // pitch eases a hair between captures, shifting every column equally —
    // subtracting the modal shift isolates the RIM's extra lift.
    const cs = crests.filter((v) => v >= 0).sort((x, y) => x - y)
    const bandLo = cs.length ? Math.max(0, cs[Math.floor(cs.length / 2)] - 2) : H - 30
    const raw = []
    for (let c = 20; c < W - 20; c += 4) {
        let best = null, bestS = 1e18
        for (let dlt = -14; dlt <= 14; dlt++) {
            let s = 0, n = 0
            for (let r = bandLo; r < Math.min(bandLo + 24, H); r++) {
                const ra = r - dlt // rows grow down: content lifted gives negative Δ
                if (ra < 0 || ra >= H) continue
                const a1 = get(A, c, ra), b1 = get(B, c, r)
                s += (a1[0] - b1[0]) ** 2 + (a1[1] - b1[1]) ** 2 + (a1[2] - b1[2]) ** 2; n++
            }
            if (n) { s /= n; if (s < bestS) { bestS = s; best = dlt } }
        }
        if (best !== null) raw.push(-best) // positive = lifted
    }
    if (!raw.length) return { dpr, AB: { changed: 0, mean: 0 }, AC: { changed: 0, mean: 0 }, BC: { changed: 0, mean: 0 }, crestN: 0, crestSpread: 0, liftMed: 0, liftMax: 0, liftN: 0, mode: 0 }
    const sorted = raw.slice().sort((x, y) => x - y)
    const mode = sorted[Math.floor(sorted.length / 2)] // uniform drift baseline
    const rel = raw.map((v) => v - mode).filter((v) => v >= 1) // columns the rim lifted past background
    rel.sort((x, y) => x - y)
    return {
        dpr, AB: diff(A, B), AC: diff(A, C), BC: diff(B, C),
        crestN: cs.length, crestSpread: cs.length ? cs[cs.length - 1] - cs[0] : 0,
        liftMed: rel.length ? rel[Math.floor(rel.length / 2)] : 0,
        liftMax: rel.length ? rel[rel.length - 1] : 0,
        liftN: rel.length, mode,
    }
})
const phoneProof = (pr) => pr.AB.changed >= 1200 && pr.AB.mean >= 3 &&
    pr.AC.changed >= 1200 && pr.BC.changed >= 800 &&
    pr.crestN >= 25 && pr.crestSpread >= 4 && pr.liftN >= 10 && pr.liftMed >= 1 && pr.liftMax >= 2
    // NB: no before/peak/settled RATIO gate — cloud/water motion on world time
    // inflates both diffs on software-rendered boxes and squeezes the ratio to
    // ~1 (flaky). Progressivity is proven by the independent lift + crest-arc
    // gates: instant-crater and zero-rim mutants both fall to those.
r.check('#1703 crumble renders + animates on phones at 390px: visible mid-window diff, progressive landing, rim crest arc',
    phoneProof(proof),
    `mid-window ${proof.AB.changed}px (mean ${proof.AB.mean}), settled ${proof.AC.changed}px (peak→settled ${proof.BC.changed}px), crest cols ${proof.crestN} spread ${proof.crestSpread}px`)
r.check('#1703 rim silhouette lift ≥ 1px at phone size (column lift over background drift)',
    proof.AB.changed >= 1200 && proof.liftN >= 10 && proof.liftMed >= 1 && proof.liftMax >= 2,
    `${proof.liftN} columns lifted ≥1px over background (mode shift ${proof.mode}px, median excess ${proof.liftMed}px, max ${proof.liftMax}px, dpr ${proof.dpr}) — above the 1px bar, rim amp stays`)
// The page shot above can't carry the proof for human eyes: at 390x844 the
// rotate-your-phone modal sits exactly over the horizon, hiding the crater.
// The canvas-element close-up shows the rim itself, and the landscape page shot
// pins a fresh crater AT rim peak (age CRUMBLE_T/2 = 5) — the mid-window view
// a landscape phone player sees, same camera-pin protocol as the gates.
await phone.screenshot({ path: 'docs/shots/issue-1703-phone-crumble.png' })
const shotPos = await phone.evaluate(() => {
    const p = window.__carpetTest.probe()
    return { x: p.x + Math.cos(p.yaw) * 80, y: p.y + Math.sin(p.yaw) * 80, cx: p.x, cy: p.y, alt: p.alt }
})
await phone.evaluate((q) => { window.__carpetTest.craterAt(q.x, q.y, 14, 10, 1) }, shotPos)
for (let a = 0; a < 5;) {
    await phone.evaluate((q) => { window.__game.step({}, 1); window.__carpetTest.holdCarpet(q.cx, q.cy, q.alt) }, shotPos)
    const ds = await phone.evaluate(() => window.__carpetTest.deforms())
    if (ds.length && ds[ds.length - 1].a > a) a = ds[ds.length - 1].a
}
await phone.evaluate((q) => window.__carpetTest.holdCarpet(q.cx, q.cy, q.alt), shotPos)
const rimCanvas = (await phone.evaluateHandle(() => [...document.querySelectorAll('canvas')].find((c) => !c.dataset.mcHud))).asElement()
if (rimCanvas) await rimCanvas.screenshot({ path: 'docs/shots/issue-1703-phone-rim-canvas.png' })
await phone.setViewportSize({ width: 844, height: 390 })
await phone.waitForTimeout(450)
await phone.evaluate((q) => { window.__game.step({}, 1); window.__carpetTest.holdCarpet(q.cx, q.cy, q.alt) }, shotPos)
await phone.waitForTimeout(250)
await phone.evaluate((q) => window.__carpetTest.holdCarpet(q.cx, q.cy, q.alt), shotPos)
await phone.screenshot({ path: 'docs/shots/issue-1703-phone-crumble-landscape.png' })
// ---- #1703 item 2: the same proof under ?lite=1 (low-spec GL). There is no
// ray-marched 2D world in this title — lite must show the crumble too.
await phone.goto(new URL(`http://localhost:${process.env.DEV_PORT || 5173}/retrogames/magic-carpet?lite=1`).href, { waitUntil: 'load' })
await phone.waitForFunction(() => window.__game && window.__carpetTest, null, { timeout: 15000 })
await phone.evaluate(() => { window.__game.reset(7); window.__carpetTest.start() })
await phone.waitForTimeout(400)
const liteProof = await phone.evaluate(async () => {
    const t = window.__carpetTest, g = window.__game
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms))
    const r0 = t.hudRect()
    const dpr = window.devicePixelRatio || 1
    const strip = { w: 200, h: 170 }
    strip.x0n = 0.5 - 100 / (r0.w * dpr)
    strip.y0n = 0.56
    const pin = () => { const p = t.probe(); t.holdCarpet(p.x, p.y, p.alt) }
    pin(); await sleep(350); pin()
    const A = t.pixels(strip.x0n, strip.y0n, strip.w, strip.h)
    const p = t.probe()
    t.craterAt(p.x + Math.cos(p.yaw) * 70, p.y + Math.sin(p.yaw) * 70, 14, 10, 1)
    for (let a = 0; a < 5;) { g.step({}, 1); pin(); const d = t.deforms(); if (d.length && d[d.length - 1].a > a) a = d[d.length - 1].a }
    await sleep(350); pin()
    const B = t.pixels(strip.x0n, strip.y0n, strip.w, strip.h)
    for (let i = 0; i < 8; i++) { g.step({}, 1); pin() }
    await sleep(350); pin()
    const C = t.pixels(strip.x0n, strip.y0n, strip.w, strip.h)
    const diff = (P, Q) => {
        let changed = 0, sum = 0
        if (!P || !Q) return { changed: -1, mean: -1 }
        for (let i = 0; i < P.length; i += 4) {
            const d = Math.abs(P[i] - Q[i]) + Math.abs(P[i + 1] - Q[i + 1]) + Math.abs(P[i + 2] - Q[i + 2])
            sum += d / 3
            if (d > 30) changed++
        }
        return { changed, mean: +(sum / (P.length / 4)).toFixed(2) }
    }
    return { gl2: t.gl2(), AB: diff(A, B), BC: diff(B, C), AC: diff(A, C) }
})
r.check('#1703 lite-GL: the crumble animates at low spec too (no 2D world exists — lite IS the fallback)',
    liteProof.gl2 === true && liteProof.AB.changed >= 200 && liteProof.BC.changed >= 400 &&
    liteProof.AC.changed >= 200 && liteProof.AC.changed - liteProof.AB.changed >= 200,
    `mid-window ${liteProof.AB.changed}px (mean ${liteProof.AB.mean}), landed ${liteProof.AC.changed}px, peak→settled ${liteProof.BC.changed}px`)
r.info('#1703 premise', 'issue item 2\'s "non-WebGL 2D world" does not exist here: ?lite=1 is low-spec WebGL (antialias off, dpr cap 1, CAP_P 140); without WebGL createCarpetGL throws and no world draws. Proof above covers the real fallback path.')
// ---- #1740 WORLD SELECT for real: arrows + Space, and a real touchscreen tap
// on the thumb-sized chevrons at 390x844, both through the live attract screen
// (the source pins above keep these honest in CI lite). Both legs ride the
// phone page — degraded sandbox boots (chromeboot --single-process, #1622)
// cannot open a second page, and keyboard works fine in a touch viewport.
{
    const DEV_URL = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/magic-carpet?seed=7`
    const pErrs2 = []
    phone.on('pageerror', (e) => pErrs2.push(e.message))
    await phone.goto(DEV_URL, { waitUntil: 'load' })
    await phone.waitForFunction(() => window.__carpetTest && window.__game, null, { timeout: 15000 })
    await phone.waitForTimeout(500)
    const s0 = await phone.evaluate(() => window.__carpetTest.probe())
    await phone.keyboard.press('ArrowRight')
    await phone.keyboard.press('ArrowRight')
    await phone.waitForTimeout(150)
    const s2 = await phone.evaluate(() => window.__carpetTest.probe())
    await phone.keyboard.press('ArrowLeft')
    await phone.waitForTimeout(150)
    const s1 = await phone.evaluate(() => window.__carpetTest.probe())
    r.check('#1740 attract arrows cycle the cursor (fresh=W1, ▶▶=W3, ◀=W2) and never start the game',
        s0.screen === 'attract' && s0.sel === 0 && s2.sel === 2 && s1.sel === 1 && s1.screen === 'attract',
        `sel ${s0.sel}->${s2.sel}->${s1.sel}, screen ${s1.screen}`)
    await phone.keyboard.press('Space')
    await phone.waitForTimeout(350)
    const go = await phone.evaluate(() => window.__carpetTest.probe())
    r.check('#1740 any-key start launches AT the cursor (seed-pinned world 2)',
        go.screen === 'play' && go.level === 1 && go.seed === 7, `screen ${go.screen} level ${go.level + 1} seed ${go.seed}`)
    r.check('#1740 keyboard select pass: zero page errors', pErrs2.length === 0, pErrs2.join(' | '))

    await phone.goto(DEV_URL, { waitUntil: 'load' })
    await phone.waitForFunction(() => window.__carpetTest && window.__game, null, { timeout: 15000 })
    await phone.waitForTimeout(500)
    const hud3 = await phone.evaluate(() => window.__carpetTest.hudRect())
    const toCss3 = (hx, hy) => [hud3.left + (hx / W) * hud3.w, hud3.top + (hy / H) * hud3.h]
    const ps0 = await phone.evaluate(() => window.__carpetTest.probe())
    await phone.touchscreen.tap(...toCss3(W - SEL.zw / 2, SEL.y + SEL.h / 2))
    await phone.waitForTimeout(150)
    await phone.touchscreen.tap(...toCss3(W - SEL.zw / 2, SEL.y + SEL.h / 2))
    await phone.waitForTimeout(150)
    const ps2 = await phone.evaluate(() => window.__carpetTest.probe())
    await phone.touchscreen.tap(...toCss3(SEL.zw / 2, SEL.y + SEL.h / 2))
    await phone.waitForTimeout(150)
    const ps1 = await phone.evaluate(() => window.__carpetTest.probe())
    r.check('#1740 phone chevron taps cycle the world at 390px (real touchscreen, sim-routed zones)',
        ps0.screen === 'attract' && ps0.sel === 0 && ps2.sel === 2 && ps1.sel === 1 && ps1.screen === 'attract',
        `sel ${ps0.sel}->${ps2.sel}->${ps1.sel}`)
    await phone.touchscreen.tap(...toCss3(W / 2, SEL.y + SEL.h / 2)) // between the plaques = a world tap: start
    await phone.waitForTimeout(350)
    const pgo = await phone.evaluate(() => window.__carpetTest.probe())
    r.check('#1740 phone tap-to-start honors the cursor (world 2, seed pinned)',
        pgo.screen === 'play' && pgo.level === 1 && pgo.seed === 7, `screen ${pgo.screen} level ${pgo.level + 1} seed ${pgo.seed}`)
    r.check('#1740 phone select pass: zero page errors', pErrs2.length === 0, pErrs2.join(' | '))
}

await phone.close()
await pBrowser.close()

r.exit()
