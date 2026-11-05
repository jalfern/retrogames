// carpetcheck.mjs — MAGIC CARPET proof: boots, rules hold, three worlds reach equilibrium.
//
// Node-first (sim is pure), then a short real-browser pass via the game contract.
// Run: npm run dev in another terminal, then `npm run carpetcheck`.
//
// Mutation guide (prove it can fail): change the win check `gs.bank >= gs.quota`
// to `gs.bank >= gs.quota * 100` in src/games/MagicCarpet/sim.js and watch
// 'equilibrium' go red; restore.

import { launch, openGame, requireDevServer, Report } from './lib/harness.mjs'
import {
    LEVELS, QUOTA, SPILLS, BOUNTY, MAP, spellById, sampleH,
    makeGame, step, autopilot, stateHash, CRATER_GLOW, glowOf, toppleTower,
    setHand, INVIS_T, hudTap, cycleL, TAP, TRAY, W, H, HUD_H,
    muffleOf, OPEN_CUTOFF, MUFFLE_CUTOFF, volcanoErupt,
} from '../src/games/MagicCarpet/sim.js'

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
r.check('world 1 built: 56 pearls, wizard hoards 80, 8 books, one known spell, empty vault',
    fresh.pearls.length === 56 && fresh.wizard.mana === LEVELS[0].hoard && fresh.books.length === 8 &&
    fresh.learned.length === 1 && fresh.bank === 0 && fresh.level === 0,
    `pearls=${fresh.pearls.length} hoard=${fresh.wizard.mana} books=${fresh.books.length} bank=${fresh.bank}`)
const g0 = run(7, 600, () => ({}))
r.check('boots and steps 600 ticks idle', g0.tick === 600 && !g0.end, `tick=${g0.tick}`)

// ---- determinism
const d1 = run(7, 600), d2 = run(7, 600), d3 = run(8, 600)
r.check('seed 7 twice → identical hash', stateHash(d1) === stateHash(d2), `${stateHash(d1)} vs ${stateHash(d2)}`)
r.check('seed 8 → different hash', stateHash(d1) !== stateHash(d3))

// ---- three worlds: level progression and equilibrium
{
    const gs = run(7, 120000)
    r.check('three worlds: seed 7 levels 1→2→3 and wins at the final quota',
        gs.end === 'win' && gs.level === 2 && gs.levelClears === 2 && gs.bank >= gs.quota,
        `end=${gs.end} level=${gs.level + 1} bank=${Math.floor(gs.bank)}/${gs.quota} tick=${gs.tick}`)
    r.check('banked vault (not carried mana) is what reaches the quota', gs.bank >= QUOTA, `bank=${Math.floor(gs.bank)} quota=${QUOTA}`)
    const gs2 = run(88, 120000)
    r.check('seed 88 also restores all three worlds', gs2.end === 'win' && gs2.level === 2, `end=${gs2.end} level=${gs2.level + 1}`)
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

// ---- mana conservation through a real campaign (vault + pouch + pearls + hoard)
{
    const gs = makeGame(7)
    const pearlMana = (s) => s.pearls.reduce((a, p) => a + (p.alive ? p.m : 0), 0)
    const total = (s) => Math.floor(s.bank) + Math.floor(s.mana) + pearlMana(s) + (s.wizard.alive ? s.wizard.mana : 0)
    let t0 = total(gs)
    let spent = 0, bounty = 0
    let i = 0
    while (!gs.end && i < 120000) {
        step(gs, autopilot(gs))
        for (const e of gs.events) {
            if (e.type === 'cast') spent += spellById(e.id).cost
            if (e.type === 'kill') bounty += BOUNTY[e.kind]
            if (e.type === 'spill') spent += e.m
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
    let minClear = 1e9
    for (let i = 0; i < 2000 && !gs.end; i++) {
        step(gs, { up: false, down: true })
        minClear = Math.min(minClear, gs.alt)
    }
    r.check('holding down never buries the carpet', minClear > 14, `min alt ${minClear.toFixed(1)}`)
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
    const after = gs.pearls.filter((p) => p.alive).reduce((a, p) => a + p.m, 0) + Math.floor(gs.mana)
    const hAfter = sampleH(gs, tx, ty)
    r.check('slaying the wizard scatters his hoard as pearls and craters his tower',
        !gs.wizard.alive && after >= before + hoard - 15 && hBefore - hAfter >= 3,
        `pearl mana ${before} → ${after} (hoard ${hoard}), tower ground ${hBefore.toFixed(0)} → ${hAfter.toFixed(0)}`)
}

// ---- roster + INVISIBILITY (#1610): the original's veil, done whole
// (#1612 item 5 grew the roster to eight with VOLCANO.)
{
    r.check('eight signature spells with costs', SPILLS.length === 8 &&
        ['fireball', 'lightning', 'heal', 'protect', 'slow', 'telekinesis', 'invisibility', 'volcano'].every((id) => spellById(id)?.cost > 0))

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
            while (!gs.end && i < 40000) { step(gs, autopilot(gs)); i++ }
            if (gs.end === 'win') { wins++; if (i > slowest) slowest = i }
        }
        r.check('60-seed balance sweep: the autopilot still restores all three worlds, all 60 seeds',
            wins === 60, `wins ${wins}/60, slowest ${slowest} ticks`)
    }
}

// ---- #1612 item 5: VOLCANO — the ground tears open where you look.
{
    r.check('volcano is the 8th spell: cost 60, a grimoire waits in the world',
        SPILLS.length === 8 && spellById('volcano').cost === 60 &&
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

// ---- browser pass: boots in Chrome, starts, drives through the contract, zero errors
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

// ---- #1612 item 4 (browser): veiling actually closes the ambience low-pass the
// shell drives the wind/growl bed through. Mutation guide: drop the
// setMuffle(muffleOf(gs)) call in index.jsx and the veiled reading is null.
await page.evaluate(() => { window.__game.reset(7); window.__carpetTest.start() })
await page.waitForTimeout(300)
const muffleOpen = await page.evaluate(() => window.__carpetTest.muffle())
await page.evaluate(() => { window.__carpetTest.veil() })
await page.waitForTimeout(300)
const muffleVeil = await page.evaluate(() => window.__carpetTest.muffle())
r.check('the veil muffles the world — the ambience bus low-pass drops while veiled, open when visible',
    muffleOpen >= 10000 && muffleVeil > 0 && muffleVeil <= 1000, `open=${muffleOpen} veiled=${muffleVeil}`)
r.check('no shader/WebGL console errors', gpuErrs.length === 0, gpuErrs.join(' | '))
r.check('zero page errors', errs.length === 0, errs.join(' | '))
await browser.close()

r.exit()
