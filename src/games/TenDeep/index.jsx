// TEN-DEEP — the arcade shell. Everything is runtime art: the corridor is the
// SHARED WebGL2 dungeon renderer (#1129 → #1127 stage 4: torch-lit brick,
// fog, animated steps), and every other surface (RIM, interiors, bench,
// combat plates, automap, HUD) is painted on a 2D layer stacked above it
// (256x224). No WebGL2 → the original shaded wireframe painter stands in.
// The attract demo is the Node-proven solver driving THIS state machine
// live — tendeepcheck's witness and the demo are the same code.
//
// Layout: 1. projection + sprites 2. fixed-timestep shell (commands are
// discrete; the clock only drives fades/bob) 3. input 4. DEV hook + DebugKit
// 5. React HUD. The pixel contract the harness samples: the GL view paints
// the corridor at cell centres (pose x+0.5, yaw = (dir−1)·π/2); a wall one
// pace ahead puts LIT BRICK in the centre column (the torch lights what is
// near), a clear hall leaves the centre DARK (light falls off into fog) —
// the mirror image of the wireframe's blue-wall signal, on purpose.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { loadDungeonRenderer } from '../../utils/dungeonRenderer'
import { makeRun, step, stateHash, cloneState, SIZE, W, H, DX, DY, purse, canBuy, servicePrice, createPriceFor, isVacant, padB, BUILDINGS, SERVICES, TOWN, SPELLS, CLASSES, canCast, automapRing, automapShade } from './sim.js'
import { RACES, ALIGNMENTS, ALIGN_ORDER, compose } from './people.js'
import { mulberry32 } from './dungeon.js'
import { nextAction, playOut } from './solver.js'
import AttractMessage from '../../components/AttractMessage'
import { MESSAGES, PRESS } from './attract.js'
import { fitSize, fitTwoCols } from './hudfit.js'

const SIM_MS = 1000 / 60
const DEMO_MS = 170
const CX = 128
const DEPTH = 6

// ring(d) = the projected far edge of the cell d steps ahead.
const ring = (d) => {
    const k = 1 / d
    return { l: CX - 118 * k, r: CX + 118 * k, t: 100 - 86 * k, b: 100 + 86 * k }
}

const lerpShade = (c1, c2, t) => {
    const p = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]
    const a = p(c1), b = p(c2)
    const m = a.map((v, i) => Math.round(v + (b[i] - v) * t))
    return `rgb(${m[0]},${m[1]},${m[2]})`
}
const dim = (t) => lerpShade('#04050c', '#4a54a0', t)
const dimSide = (t) => lerpShade('#03040a', '#343d78', t)

// runtime monster plates: 10x10 bitmaps, palette letters
const ART = {
    rat: { s: 5, pal: { b: '#a8763e', d: '#6b4519', e: '#ff5252', w: '#e8d8b8' }, rows: [
        '..bb......', '.bbbb.....', 'bbdbe.bb..', 'bbbbb.bbb.', '.bbbbb.bbb', '.bdbbb.bd.', '..bbbbbb..', '..bd..db..', '...b..b...', '..........'] },
    snake: { s: 5, pal: { g: '#5fae4e', d: '#2f6b2a', e: '#ffe082' }, rows: [
        '..........', '....gg....', '...gege...', '..ggdggg..', '.gg...dg..', 'gd....gg..', 'g......dg.', '.......gg.', '......gd..', '..........'] },
    goblin: { s: 5, pal: { g: '#79b85c', d: '#3f6b2e', e: '#ffd54f', r: '#b3402e', m: '#8a6b46' }, rows: [
        '...gg.....', '..gggg....', '.gegge....', '.ggggg..m.', '..gdg...m.', '.grrrrg.m.', '.grddrg.m.', '..grrg.mm.', '..g..g....', '.gg..gg...'] },
    skelet: { s: 6, pal: { w: '#dfe3e8', d: '#8f98a6', e: '#222', r: '#c8503c' }, rows: [
        '..wwww....', '.wwwwww...', '.wewwew...', '.wwddww...', '..wddw....', '...ww..r..', '..wwww.wr.', '.w.ww.w.r.', '...ww...r.', '..ww.ww...'] },
    wraith: { s: 6, pal: { p: '#8f9bff', d: '#3a3f8f', e: '#c6ff00' }, rows: [
        '..pppp....', '.pppppp...', 'peppppep..', 'pppppppp..', '.ppddpp...', '..pddp....', '..pddp.pp.', '...pp.pp..', '...pp.p...', '..p..p....'] },
    ghoul: { s: 6, pal: { g: '#9db87a', d: '#4f6b34', e: '#ff5252', c: '#e8e0c8' }, rows: [
        '..gg......', '.gggg.....', '.gegge....', '.ggggg.cc.', '..gddg.cc.', '.gggggg.c.', 'gg.gggg...', '.g.gg.g...', 'gg.gg.gg..', '.d...d....'] },
    troll: { s: 7, pal: { t: '#6f9a52', b: '#3c5a2a', e: '#ffd54f', w: '#e8e0c8', c: '#8a6b46' }, rows: [
        '.tttttt...', 'tttttttt..', '.tebbet...', 'ttttttttc.', 'ttwttwttc.', 'tbbbbbbbc.', '.ttttttc..', '.tttttt...', '.tt..tt...', '.ttt..ttt.'] },
    minotaur: { s: 8, pal: { m: '#8a5a3a', b: '#5c3a22', e: '#ff5252', h: '#e8e0c8', a: '#8a6b46', x: '#b8bec9' }, rows: [
        'hh.mm.mmhh', '.hmmmmmmh.', '.memmmmem.', '.mmmbbmmm.', 'mmmmbbmmmx', '.mmmmmmmax', '.mbmmmmmax', '..mm.mm.ax', '.mmm..mmm.', '.mmm...mm.'] },
    wyrm: { s: 7, pal: { s: '#4f8a7a', d: '#2f5a4a', e: '#ffe082', f: '#e8e0c8' }, rows: [
        '....ss....', '..ssssss..', '.sseesssd.', 'ssssssfdd.', 'ssssssfd..', '.ssssss...', '..ssssss..', '...ssssss.', '....ssssd.', '.....ss...'] },
    king: { s: 9, pal: { k: '#4b4f6b', d: '#23263a', g: '#7dffce', y: '#ffd54f', w: '#e8ecf5' }, rows: [
        '...yyyy...', '..ywwwwy..', '.ywkddkwy.', '.wkddddkw.', '.wgddddgw.', '..kddddk..', '.kkddddkk.', 'kkkddddkkk', 'k.kddddk.k', '...kkkk...'] },
}

const drawMob = (ctx, art, x, y, size, flash) => {
    const A = ART[art]
    if (!A) return
    const u = size / 10
    for (let r = 0; r < A.rows.length; r++) {
        for (let c = 0; c < 10; c++) {
            const ch = A.rows[r][c]
            if (ch === '.' || !ch) continue
            ctx.fillStyle = flash ? '#ffffff' : (A.pal[ch] || '#fff')
            ctx.fillRect(x + c * u, y + r * u, u + 0.6, u + 0.6)
        }
    }
}

// --------------------------------------------------------------- THE RIM ----
// dusk over the hamlet on the lip of the well: seeded stars, the Hollow Keep
// brooding on the skyline, four lit facades and the well-mouth glowing amber.
const RIM = (() => {
    const rnd = mulberry32(0xC0FFEE)
    return {
        stars: Array.from({ length: 42 }, () => ({ x: Math.floor(rnd() * W), y: Math.floor(rnd() * 92), tw: rnd() })),
        flecks: Array.from({ length: 90 }, () => ({ x: Math.floor(rnd() * W), y: 124 + Math.floor(rnd() * 74), w: 1 + Math.floor(rnd() * 3) })),
        keep: [[0, 118], [18, 118], [26, 92], [34, 92], [34, 74], [44, 74], [44, 96], [70, 96], [78, 66], [86, 66], [86, 48], [97, 60], [108, 48], [108, 88], [140, 88], [148, 70], [156, 70], [156, 96], [196, 96], [204, 82], [212, 82], [212, 104], [256, 104], [256, 130], [0, 130]],
    }
})()

const FACADE_X = [12, 76, 140, 204]

const drawFacade = (ctx, b, x, sel, bob) => {
    const y = sel ? 66 : 70
    const w = 40, wall = 44
    const wobble = sel ? Math.sin(bob / 9) * 1.2 : 0
    ctx.fillStyle = '#171426'; ctx.fillRect(x - 2, y - 8 + wobble, w + 4, wall + 10)
    ctx.fillStyle = '#241d33'; ctx.fillRect(x, y + wobble, w, wall)
    ctx.fillStyle = '#2e2440'
    for (let r = 0; r < 5; r++) ctx.fillRect(x, y + r * 9 + wobble, w, 1)
    ctx.fillStyle = '#0d0a16'; ctx.fillRect(x + 15, y + 26 + wobble, 10, 18)
    if (b.key === 'T') {
        ctx.fillStyle = '#ffb84d'; ctx.fillRect(x + 4, y + 8 + wobble, 8, 7); ctx.fillRect(x + 28, y + 8 + wobble, 8, 7)
        ctx.fillStyle = '#b3402e'; ctx.fillRect(x + 14, y - 6 + wobble, 12, 8)
        ctx.fillStyle = '#ffd54f'; ctx.fillRect(x + 17, y - 3 + wobble, 6, 2)
    } else if (b.key === 'V') {
        ctx.fillStyle = '#cdd6f0'; ctx.fillRect(x + 6, y + 6 + wobble, 28, 3)
        ctx.fillStyle = '#9fb4ff'
        for (let i = 0; i < 9; i++) {
            const a = (i / 9) * Math.PI * 2
            ctx.fillRect(x + 20 + Math.cos(a) * 7, y + 16 + wobble + Math.sin(a) * 7, 2, 2)
        }
    } else if (b.key === 'G') {
        ctx.fillStyle = '#4c5b43'
        for (let i = 0; i < 5; i++) ctx.fillRect(x + 2 + i * 8, y + 24 + wobble, 3, 20)
        ctx.fillStyle = '#8a94a6'; ctx.fillRect(x + 16, y + 8 + wobble, 8, 10)
        ctx.fillStyle = '#c8503c'; ctx.fillRect(x + 18, y + 10 + wobble, 4, 6)
    } else {
        ctx.fillStyle = '#7d4fd8'; ctx.fillRect(x + 5, y + 7 + wobble, 9, 8)
        ctx.fillStyle = '#b98cff'; ctx.fillRect(x + 27, y + 7 + wobble, 9, 8)
        ctx.fillStyle = '#57e389'; ctx.fillRect(x + 18, y + 22 + wobble + ((Math.sin(bob / 6) * 1.5) | 0), 4, 5)
    }
    if (sel) {
        ctx.strokeStyle = '#ffffff'
        ctx.strokeRect(x - 3.5, y - 11.5 + wobble, w + 7, wall + 15)
        ctx.fillStyle = '#ffd54f'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'
        ctx.fillText(b.name, x + w / 2, y - 15 + wobble)
        ctx.fillStyle = '#9fb4ff'; ctx.font = '6px monospace'
        ctx.fillText(b.sign, x + w / 2, y + wall + 16 + wobble)
    }
}

const paintRim = (ctx, gs, bob, uiSel) => {
    const g = ctx.createLinearGradient(0, 0, 0, 130)
    g.addColorStop(0, '#070a24'); g.addColorStop(0.7, '#1c1638'); g.addColorStop(1, '#43263f')
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 130)
    RIM.stars.forEach((s) => {
        const tw = 0.5 + 0.5 * Math.sin(bob / 20 + s.tw * 9)
        ctx.fillStyle = `rgba(220,228,255,${(0.25 + 0.55 * tw * s.tw).toFixed(2)})`
        ctx.fillRect(s.x, s.y, 1, 1)
    })
    ctx.fillStyle = '#e8ecf5'; ctx.beginPath(); ctx.arc(212, 26, 9, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#1c1638'; ctx.beginPath(); ctx.arc(216, 23, 8, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#05060f'
    ctx.beginPath(); ctx.moveTo(RIM.keep[0][0], RIM.keep[0][1])
    for (const p of RIM.keep) ctx.lineTo(p[0], p[1])
    ctx.closePath(); ctx.fill()
    const glow = 0.4 + 0.25 * Math.sin(bob / 14)
    ctx.fillStyle = `rgba(125,255,206,${glow.toFixed(2)})`
    ctx.fillRect(89, 54, 3, 4); ctx.fillRect(93, 54, 3, 4)
    const gr = ctx.createLinearGradient(0, 124, 0, H)
    gr.addColorStop(0, '#241d33'); gr.addColorStop(1, '#120e1c')
    ctx.fillStyle = gr; ctx.fillRect(0, 124, W, H - 124)
    ctx.fillStyle = '#2e2440'
    RIM.flecks.forEach((f) => ctx.fillRect(f.x, f.y, f.w, 1))
    BUILDINGS.forEach((b, i) => drawFacade(ctx, b, FACADE_X[i], i === uiSel && !gs.town.b, bob))
    const wx = 128, wy = 158
    ctx.fillStyle = '#3a3f5c'; ctx.fillRect(wx - 14, wy - 10, 28, 18)
    ctx.fillStyle = '#8a94a6'
    for (let i = 0; i < 7; i++) ctx.fillRect(wx - 14 + i * 4, wy - 10 + (i % 2), 4, 3)
    ctx.fillStyle = '#050408'; ctx.fillRect(wx - 9, wy - 6, 18, 10)
    ctx.fillStyle = `rgba(255,180,60,${(0.3 + 0.2 * Math.sin(bob / 8)).toFixed(2)})`
    ctx.fillRect(wx - 6, wy - 3, 12, 4)
    ctx.fillStyle = '#6b4519'; ctx.fillRect(wx - 14, wy - 24, 2, 14); ctx.fillRect(wx + 12, wy - 24, 2, 14)
    ctx.fillStyle = '#4a3320'; ctx.fillRect(wx - 16, wy - 26, 32, 3)
    ctx.fillStyle = '#0c1024'; ctx.fillRect(0, 176, W, 24)
    ctx.fillStyle = '#9fb4ff'; ctx.font = '7px monospace'; ctx.textAlign = 'center'
    ctx.fillText(gs.wipe ? 'THE RIM — THE TEMPLE OPENS ALL NIGHT' : 'THE RIM — THE LIP OF THE WELL', 128, 184)
    ctx.fillStyle = '#ffd54f'
    ctx.fillText('←→ DOORS · SPACE ENTER · F DESCEND TO THE DEEP', 128, 194)
    void gs
}

const ROOM_TINT = { T: ['#241608', '#3a2410'], V: ['#0e1a30', '#1c3050'], G: ['#141f14', '#223322'], A: ['#1c0e30', '#301a4c'] }
const CLERK = { T: 'OLD BRANNOCK POLISHES GLASS', V: 'SISTER YANNE COUNTS COINS', G: 'SERGEANT OWL EYES THE SIX', A: 'MAD SIXVIAL WEIGHS POWDER' }

// six candidate papers at the tavern bench: paper, race/class tag, the stat
// line as the chosen alignment composes it, and the honest gate verdict
const paintBench = (ctx, gs) => {
    ctx.textAlign = 'left'
    ctx.fillStyle = '#ffd54f'; ctx.font = 'bold 7px monospace'
    ctx.fillText('THE CREATION BENCH', 8, 26)
    ctx.fillStyle = '#9fb4ff'; ctx.font = '6px monospace'; ctx.textAlign = 'right'
    const way = ALIGNMENTS[ALIGN_ORDER[gs.town.ali]]
    ctx.fillText(`WAY: ${way.name} — ${way.desc}`, 248, 26)
    const slot = gs.party[gs.town.hero]
    ctx.fillStyle = slot.alive ? '#9fb4ff' : '#e05555'
    ctx.textAlign = 'left'; ctx.font = '6px monospace'
    ctx.fillText(slot.alive ? 'THE OPEN SLOT: A FRESH POST, AWAITING ITS PAPER' : 'THE OPEN SLOT: A GRAVE, AWAITING A NAME', 8, 34)
    gs.town.cand.forEach((cbody, i) => {
        const y = 44 + i * 17
        const sel = i === gs.town.ci
        const c = compose(cbody, ALIGN_ORDER[gs.town.ali])
        ctx.fillStyle = sel ? '#ffffff' : cbody.pass ? '#9fb4ff' : '#6b5f7e'
        ctx.font = 'bold 6px monospace'
        ctx.fillText((sel ? '▸' : ' ') + c.name.slice(0, 7), 8, y)
        ctx.fillStyle = sel ? '#ffd54f' : '#5f6aa0'
        ctx.fillText(`${RACES[c.race].abbr}-${CLASSES[c.cls].abbr}`, 50, y)
        ctx.fillStyle = sel ? '#cdd6f0' : '#4a5488'
        ctx.fillText(`hp${c.hp} mp${c.mp} a${c.atk} d${c.def} s${c.spd} af${c.aff}`, 74, y)
        ctx.fillStyle = cbody.pass ? '#57e389' : '#e05555'
        ctx.textAlign = 'right'
        ctx.fillText(cbody.pass ? 'OK' : 'FAIL', 248, y)
        ctx.textAlign = 'left'
        if (sel) {
            ctx.fillStyle = '#6b7699'; ctx.font = '5px monospace'
            const ban = RACES[cbody.race].bans ? ' · race bans ' + RACES[cbody.race].bans.map(b => CLASSES[b].abbr).join('/') : ''
            ctx.fillText(CLASSES[cbody.cls].reqText + ban, 8, y + 6)
            ctx.font = 'bold 6px monospace'
        }
    })
}

const paintInterior = (ctx, gs, bob) => {
    const b = gs.town.b
    const tint = ROOM_TINT[b]
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, tint[0]); g.addColorStop(1, tint[1])
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#00000030'
    for (let y = 0; y < H; y += 6) ctx.fillRect(0, y, W, 1)
    ctx.fillStyle = '#0c1024'; ctx.fillRect(0, 0, W, 16)
    const B = BUILDINGS.find((q) => q.key === b)
    ctx.fillStyle = '#ffd54f'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'left'
    ctx.fillText(B.name, 8, 11)
    ctx.fillStyle = '#9fb4ff'; ctx.font = '6px monospace'; ctx.textAlign = 'right'
    ctx.fillText(B.sign, 248, 11)
    ctx.fillStyle = '#4a3320'; ctx.fillRect(0, 150, W, 8)
    ctx.fillStyle = '#6b4519'; ctx.fillRect(0, 150, W, 2)
    ctx.fillStyle = '#cdd6f0'; ctx.font = '6px monospace'; ctx.textAlign = 'center'
    ctx.fillText(CLERK[b], 128, 146 + Math.sin(bob / 12) * 0.8)
    ctx.textAlign = 'left'
    ctx.fillStyle = '#cdd6f0'; ctx.font = 'bold 7px monospace'
    ctx.fillText('THE COMPANY', 8, 26)
    gs.party.forEach((h, i) => {
        const y = 32 + i * 19
        const sel = i === gs.town.hero
        ctx.fillStyle = sel ? '#ffffff' : h.alive ? '#9fb4ff' : '#e05555'
        ctx.fillText((sel ? '▸ ' : '  ') + h.name.slice(0, 7), 8, y)
        ctx.fillStyle = h.alive ? '#ffd54f' : '#6b4050'
        ctx.font = '5px monospace'
        ctx.fillText(`${RACES[h.race].abbr}-${CLASSES[h.cls].abbr}·${ALIGNMENTS[h.ali].abbr}${Object.keys(CLASSES[h.cls].spells).length ? '*' : ''}`, 8, y + 6)
        ctx.font = 'bold 7px monospace'
        ctx.fillStyle = '#333'; ctx.fillRect(52, y - 5, 34, 3)
        ctx.fillStyle = h.alive ? '#e5484d' : '#4a2020'
        ctx.fillRect(52, y - 5, 34 * Math.max(0, h.hp / h.maxHp), 3)
        ctx.fillStyle = '#224'; ctx.fillRect(52, y - 1, 34, 3)
        ctx.fillStyle = '#4f9dff'; ctx.fillRect(52, y - 1, 34 * (h.mp / h.maxMp), 3)
        ctx.fillStyle = h.alive ? '#ffd54f' : '#e05555'
        ctx.fillText(h.alive ? `L${h.lvl} ${h.gold}g` : 'FALLEN', 90, y)
        ctx.fillStyle = h.fresh ? '#57e389' : '#4a5488'; ctx.font = '5px monospace'
        ctx.fillText(h.alive ? (h.fresh ? 'POSTED — bench open' : '') : '', 90, y + 6)
        ctx.font = 'bold 7px monospace'
    })
    if (gs.town.b === 'T' && gs.town.cand) {
        paintBench(ctx, gs)
        ctx.fillStyle = '#0c1024'; ctx.fillRect(0, H - 24, W, 24)
        ctx.fillStyle = '#ffd54f'; ctx.font = '7px monospace'; ctx.textAlign = 'center'
        ctx.fillText(`PURSE ${purse(gs)}g · ACCEPT ${createPriceFor()}g`, 128, H - 14)
        ctx.fillStyle = '#9fb4ff'
        ctx.fillText('↑↓ PAPER · ←→ WAY · R REROLL · SPACE ACCEPT · L LEAVE', 128, H - 5)
        return
    }
    ctx.textAlign = 'right'
    ctx.fillStyle = '#cdd6f0'; ctx.font = 'bold 7px monospace'
    ctx.fillText('SERVICES', 248, 26)
    SERVICES[b].forEach((svc, i) => {
        const y = 32 + i * 14
        const sel = i === gs.town.svc
        const price = servicePrice(gs, svc)
        const ok = canBuy(gs) && gs.town.svc === i
        ctx.fillStyle = sel ? '#ffffff' : '#9fb4ff'
        ctx.textAlign = 'right'
        ctx.fillText((sel ? '◂ ' : '') + svc.label, 214, y)
        ctx.fillStyle = sel ? (ok ? '#57e389' : '#e05555') : '#ffd54f'
        ctx.fillText(svc.id === 'create' && ok ? 'OPEN' : `${price}g`, 248, y)
        if (sel) {
            ctx.fillStyle = '#9fb4ff'; ctx.font = '6px monospace'; ctx.textAlign = 'right'
            ctx.fillText(svc.desc, 248, y + 8)
            ctx.font = 'bold 7px monospace'
        }
    })
    ctx.fillStyle = '#0c1024'; ctx.fillRect(0, H - 24, W, 24)
    ctx.fillStyle = '#ffd54f'; ctx.font = '7px monospace'; ctx.textAlign = 'center'
    ctx.fillText(`PURSE ${purse(gs)}g · POTIONS ${gs.potions}`, 128, H - 14)
    ctx.fillStyle = '#9fb4ff'
    ctx.fillText('↑↓ HERO · ←→ SERVICE · SPACE BUY · L LEAVE', 128, H - 5)
    void b
}

const TenDeepGame = () => {
    const stageRef = useRef(null)
    const mapRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [end, setEnd] = useState(null)
    // #1275 — the mode-aware B button (padB in sim.js is the law; this is
    // its live echo). A ref guards the comparison so the 100ms HUD sync only
    // re-renders React when the verb actually changes.
    const [bAct, setBAct] = useState(null)
    const bActRef = useRef(null)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const overAtRef = useRef(0)
    const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])
    const hudRef = useRef({})
    const setHud = (k) => (el) => { hudRef.current[k] = el }

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        // holder div: in-flow, letterboxed exactly like the old bare canvas;
        // the GL view sits absolute underneath, the 2D HUD layer relative on
        // top (paint order: positioned-with-z-index beats static).
        const holder = document.createElement('div')
        holder.style.position = 'relative'
        holder.className = 'block'
        wrap.appendChild(holder)
        const glCanvas = document.createElement('canvas')
        glCanvas.dataset.deepGl = '1'
        glCanvas.className = 'absolute inset-0 w-full h-full'
        glCanvas.style.touchAction = 'none'
        glCanvas.style.display = 'none'
        glCanvas.width = W * 2; glCanvas.height = H * 2   // sane readback size until R.resize() lands
        holder.appendChild(glCanvas)
        const canvas = document.createElement('canvas')
        canvas.dataset.deepView = '1'
        canvas.width = W; canvas.height = H
        canvas.className = 'block relative w-full h-full'
        canvas.style.imageRendering = 'pixelated'
        canvas.style.touchAction = 'none'
        canvas.style.zIndex = '1'
        holder.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false

        // --- the shared dungeon renderer (#1129), loaded on demand ----------
        // The sim never learns rendering exists: R only ever receives poses
        // the sim already took. No WebGL2 (or loader failure) leaves R null
        // and the wireframe paintMap below paints exactly as before.
        let R = null
        let glSync = null          // last pose pushed to R { x, y, dir, floor }
        let disposed = false
        loadDungeonRenderer().then((DR) => {
            if (disposed || !DR) return
            R = DR.create(glCanvas, { dpr: Math.min(window.devicePixelRatio || 1, 2) })
            // sizing happens in syncGl the first time the view is actually
            // visible — a hidden canvas measures zero
        })

        const YAW = (dir) => (dir - 1) * Math.PI / 2
        const glMaze = (map) => {
            const cells = map.grid.slice()
            if (map.stairs) cells[map.stairs.y * SIZE + map.stairs.x] = 5    // real steps down
            for (const sp of map.springs) {                                    // a spring reads as water
                const t = sp.y * SIZE + sp.x
                if (cells[t] === 0) cells[t] = 3
            }
            return { w: SIZE, h: SIZE, cells }
        }
        const glOn = () => !!R && (screenRef.current === 'play' || screenRef.current === 'attract') && gs.mode === 'map' && !!gs.map
        let glWasOn = false
        let lastBeacons = 0
        const syncGl = () => {
            if (!R) return
            const on = glOn()
            // become visible BEFORE measuring: a hidden canvas has no clientWidth
            glCanvas.style.display = on ? 'block' : 'none'
            if (on && !glWasOn) R.resize()
            glWasOn = on
            R.drawing = on
            if (!on) { glSync = null; return }
            if (glSync && glSync.floor === gs.floor && glSync.x === gs.x && glSync.y === gs.y && glSync.dir === gs.dir) return
            // pose mismatch with no act() animation registered (run start,
            // descend, wipe, dev setup): snap — the renderer never guesses.
            R.setMaze(glMaze(gs.map))
            R.snapTo(gs.x + 0.5, gs.y + 0.5, 0, YAW(gs.dir))
            glSync = { x: gs.x, y: gs.y, dir: gs.dir, floor: gs.floor }
        }
        const glideGl = () => {
            // act() moved/turned the party; the eye glides to the truth. A
            // floor change snaps — you do not glide between deeps.
            if (!R || !glOn()) return
            if (!glSync || glSync.floor !== gs.floor) { syncGl(); return }
            if (glSync.x === gs.x && glSync.y === gs.y && glSync.dir === gs.dir) return
            R.animateTo(gs.x + 0.5, gs.y + 0.5, 0, YAW(gs.dir), gs.dir !== glSync.dir ? 190 : 250)
            glSync = { x: gs.x, y: gs.y, dir: gs.dir, floor: gs.floor }
        }
        const glFrame = (dt) => {
            if (!R) return
            syncGl()
            if (!glOn()) return
            if (gs.map.throne) {
                const d = Math.hypot(gs.map.throne.x + 0.5 - gs.x, gs.map.throne.y + 0.5 - gs.y)
                if (d < 7) R.light(gs.map.throne.x + 0.5, gs.map.throne.y + 0.5, 0, 1.0, 0.16, 0.10, 5.0, 90)
            }
            // #1275: springs get a faint cyan beacon (the throne-crimson
            // pattern) — the water shimmer tells at arm's length, the torch
            // falls off before it does, and the one healing light in the deep
            // should be findable from the next hall over. A DRUNK spring is
            // spent: gs.springs, not gs.map.springs, owns the beacon list.
            let bc = gs.map.throne && Math.hypot(gs.map.throne.x + 0.5 - gs.x, gs.map.throne.y + 0.5 - gs.y) < 7 ? 1 : 0
            for (const t of gs.springs) {
                const sx = t % SIZE, sy = (t - sx) / SIZE
                const d = Math.hypot(sx + 0.5 - gs.x, sy + 0.5 - gs.y)
                if (d < 6) { R.light(sx + 0.5, sy + 0.5, 0, 0.22, 0.62, 0.72, 3.5, 90); bc++ }
            }
            lastBeacons = bc
            R.frame(dt)
        }

        let gs = makeRun()
        let raf = 0, last = 0, acc = 0, demoAcc = 0, bob = 0
        let toast = 0, toastMsg = ''
        let uiSel = 0
        const evLog = []
        let shake = 0, flashHit = 0
        // presentation-only combat feedback (never in gs/stateHash): a bolt on a
        // cast, sparkles on a heal, a dissolve + XP floater on a kill.
        const fxList = []
        // combat staging (presentation-only, never in stateHash): the ambush
        // group slides in from the right — 300 ms per mob + 70 ms stagger,
        // ease-out — and under the crown the banner pulses while the field
        // dims with it. combatT0 is performance.now() at the fight's start;
        // the sim knows nothing of it.
        const SLIDE_MS = 300, SLIDE_STAGGER = 70
        let combatT0 = 0
        const slideX = (i, sx, size) => {
            if (!combatT0) return sx
            const age = performance.now() - combatT0 - i * SLIDE_STAGGER
            if (age >= SLIDE_MS) return sx
            const p = Math.max(0, age / SLIDE_MS)
            const e = 1 - (1 - p) * (1 - p)
            const x0 = W + size / 2
            return x0 + (sx - x0) * e
        }
        const slideRemain = (n) => {
            if (!combatT0) return 0
            return Math.max(0, SLIDE_MS + n * SLIDE_STAGGER - (performance.now() - combatT0))
        }
        // the walk breathes: fwd/back glide the projection ~130ms (presentation
        // only — the sim steps instantly and the endpoints render exactly the
        // snapped frame). off>0 = a step was taken toward the view's old pose.
        const EASE_MS = 130
        let ease = { from: 0, t0: 0 }
        const easeOff = () => {
            if (!ease.from) return 0
            const p = (performance.now() - ease.t0) / EASE_MS
            if (p >= 1) { ease.from = 0; return 0 }
            return ease.from * (1 - p * p * (3 - 2 * p))
        }

        const say = (m) => { toastMsg = m; toast = 150 }

        const handleEvents = (evts) => {
            for (const e of evts) evLog.push({ ...e, tick: gs.tick })
            if (evLog.length > 260) evLog.splice(0, evLog.length - 260)
            for (const e of evts) {
                if (e.type === 'ambush') { combatT0 = performance.now(); audioController.playSweep(180, 60, 0.5, 'sawtooth', 0.09); say(e.boss ? 'THE HOLLOW KING RISES!' : `AMBUSH: ${e.group.join(', ')}`) }
                else if (e.type === 'hit') { audioController.playNoise(0.12, 0.07); shake = 4; flashHit = 0.25 }
                else if (e.type === 'slay') {
                    audioController.playSweep(420, 90, 0.22, 'square', 0.06); say(`${e.name} SLAIN`)
                    const s = mobSlot(e.mob); if (s) fxList.push({ kind: 'slay', t0: performance.now(), x: s.sx, y: 140 - s.size * 0.5, size: s.size, art: s.art, xp: e.xp })
                }
                else if (e.type === 'fire' || e.type === 'spell') {
                    audioController.playSweep(e.spell === 'firestorm' ? 900 : 700, 180, e.spell === 'firestorm' ? 0.32 : 0.18, 'sawtooth', 0.05)
                    if (e.type === 'spell' && e.mob != null) { const s = mobSlot(e.mob); if (s) fxList.push({ kind: 'bolt', t0: performance.now(), from: [CX, 188], to: [s.sx, 140 - s.size * 0.5], hot: e.spell === 'firestorm', jit: boltJit(e.spell, e.mob) }) }
                }
                else if (e.type === 'guard') { audioController.playTone(140, 0.14, 'square', 0.06); say('SHIELDS HELD — WHAT LANDS, LANDS HALF') }
                else if (e.type === 'ward') { audioController.playSweep(500, 1400, 0.4, 'sine', 0.05); say('WARD — THE DARK BLINKS') }
                else if (e.type === 'prayer') { audioController.playSweep(260, 780, 0.5, 'sine', 0.06); say(e.got > 0 ? 'A PRAYER, SHARED AND ANSWERED' : 'HEAVEN IS SILENT — NO ONE WAS HURT'); if (e.got > 0) fxList.push({ kind: 'spark', t0: performance.now(), wide: true }) }
                else if (e.type === 'spellDry') { audioController.playTone(120, 0.08, 'triangle', 0.05); say('NO ONE BLEEDS — THE LETTER GOES TO WASTE') }
                else if (e.type === 'subdue') { audioController.playSweep(360, 120, 0.3, 'triangle', 0.06); say(`${e.name} KNEELS`) }
                else if (e.type === 'noLetter') { audioController.playTone(85, 0.1, 'square', 0.05); say(`${(SPELLS[e.spell] || { name: e.spell }).name} — NOT IN ANY OPEN SPELLBOOK`) }
                else if (e.type === 'heal' || e.type === 'potion') {
                    audioController.playSweep(320, 880, 0.24, 'sine', 0.06)
                    if (e.type === 'heal' && e.on) { const idx = gs.party.findIndex(h => h.name === e.on); if (idx >= 0) fxList.push({ kind: 'spark', t0: performance.now(), x: idx * 42 + 23 }) }
                }
                else if (e.type === 'levelup') { audioController.playSweep(400, 1200, 0.5, 'square', 0.07); say(`${e.who} — LEVEL ${e.lvl}!`) }
                else if (e.type === 'fall') { audioController.playSweep(300, 60, 0.7, 'sawtooth', 0.09); say(`${e.who} HAS FALLEN`) }
                else if (e.type === 'victory') { audioController.playSweep(500, 1600, 0.7, 'square', 0.08); say(e.boss ? '' : 'BATTLE WON') }
                else if (e.type === 'pickup') { audioController.playTone(880, 0.09, 'square', 0.05); say('A POTION!') }
                else if (e.type === 'spring') { audioController.playSweep(240, 640, 0.4, 'sine', 0.06); say('THE SPRING RESTORES YOUR POWER') }
                else if (e.type === 'descend') audioController.playSweep(600, 120, 0.6, 'triangle', 0.08)
                else if (e.type === 'bump') audioController.playTone(90, 0.05, 'square', 0.05)
                else if (e.type === 'fled') audioController.playSweep(500, 150, 0.3, 'square', 0.06)
                else if (e.type === 'noback') say('THERE IS NO FLIGHT FROM THE KING')
                else if (e.type === 'empty') audioController.playTone(70, 0.06, 'triangle', 0.05)
                else if (e.type === 'wipe') { audioController.playSweep(220, 55, 0.9, 'sawtooth', 0.1); say('THE BODIES RETURN TO THE RIM — HALF THE PURSE BUYS PASSAGE') }
                else if (e.type === 'townEnter') { audioController.playTone(180, 0.08, 'triangle', 0.05); say(`${e.name} — DOORS OPEN`) }
                else if (e.type === 'townBuy') audioController.playTone(1245, 0.05, 'square', 0.04)
                else if (e.type === 'hire') { audioController.playSweep(300, 900, 0.4, 'square', 0.06); say(`WELCOME, ${e.who} THE ${e.cls} — THE POST IS FILLED`) }
                else if (e.type === 'townOpenBench') { audioController.playTone(220, 0.1, 'triangle', 0.05); say('THE BENCH OPENS — SIX PAPERS, ONE COMPANY') }
                else if (e.type === 'townRoll') { audioController.playNoise(0.15, 0.05); say('OLD BRANNOCK SHUFFLES FRESH PAPERS') }
                else if (e.type === 'shift') { audioController.playTone(330, 0.06, 'square', 0.04); say(`THE WAY OF ${e.ali}`) }
                else if (e.type === 'create') { audioController.playSweep(320, 1200, 0.55, 'square', 0.07); say(`${e.who} THE ${e.cls} (${e.race}, ${e.ali}) JOINS THE COMPANY`) }
                else if (e.type === 'mourn') { audioController.playSweep(200, 800, 0.6, 'sine', 0.08); say(`${e.who} RETURNS FROM THE DARK AT 1 HP`) }
                else if (e.type === 'restore') { audioController.playSweep(300, 1100, 0.5, 'sine', 0.08); say(`${e.who} — LIFE AND LIMB RESTORED`) }
                else if (e.type === 'buyPotion') { audioController.playTone(880, 0.09, 'square', 0.05); say('A FRESH VIAL FOR THE SATCHEL') }
                else if (e.type === 'broke') { audioController.playTone(80, 0.12, 'triangle', 0.06); say('THE PURSE REFUSES') }
                else if (e.type === 'townNo') audioController.playTone(90, 0.05, 'square', 0.04)
                else if (e.type === 'noBreathers') { audioController.playTone(70, 0.14, 'sawtooth', 0.06); say('NO BREATHING HERO WALKS YOU DOWN') }
            }
        }

        const finish = (win) => {
            setEnd({ win, tick: gs.tick })
            overAtRef.current = performance.now()
            setMode('over')
        }

        const act = (cmd) => {
            if (gs.end) return
            const bx = gs.x, by = gs.y, bd = gs.dir, bm = gs.mode
            step(gs, cmd)
            if (bm === 'map' && gs.mode === 'map' && gs.dir === bd && (gs.x !== bx || gs.y !== by)) {
                ease = { from: (gs.x - bx) === DX[bd] && (gs.y - by) === DY[bd] ? 1 : -1, t0: performance.now() }
            }
            if (bm === 'map' && gs.mode === 'map' && (gs.x !== bx || gs.y !== by || gs.dir !== bd)) glideGl()
            handleEvents(gs.events.splice(0))
            // the attract demo may win or die — that is theatre, not a game over;
            // only the PLAYER's run ends the screen
            if (gs.end && screenRef.current === 'play') finish(gs.end === 'win')
        }

        const tickDemo = () => {
            if (gs.end || (gs.mode === 'town' && !gs.party.some(h => h.alive))) { gs = makeRun(); uiSel = 0; return }
            act(nextAction(gs))
        }

        const doFrameSim = () => {
            if (screenRef.current === 'attract') {
                demoAcc += SIM_MS
                if (demoAcc >= DEMO_MS) { demoAcc = 0; tickDemo() }
            }
        }

        // ---------------------------------------------------------------- paint ----
        const ahead = (i) => ({ x: gs.x + DX[gs.dir] * i, y: gs.y + DY[gs.dir] * i })
        const ringE = (d) => ring(Math.max(d + easeOff(), 0.62))

        const quad = (x0, y0, x1, y1, x2, y2, x3, y3, col) => {
            ctx.fillStyle = col
            ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath(); ctx.fill()
        }

        const paintMap = () => {
            if (!gs.map) { ctx.fillStyle = '#05060d'; ctx.fillRect(0, 0, W, 200); return }   // ended at the RIM: no corridor left to show
            ctx.fillStyle = '#05060d'; ctx.fillRect(0, 0, W, 200)
            for (let i = DEPTH; i >= 1; i--) {
                const o = ringE(i - 1 === 0 ? 0.62 : i - 1)
                const n = ringE(i)
                const lit = (DEPTH - i + 1) / DEPTH
                const cell = ahead(i)
                const solid = gs.map.wall(cell.x, cell.y)
                // ceiling + floor strips of this cell
                quad(o.l, 0, o.r, 0, n.r, n.t, n.l, n.t, lerpShade('#02030a', '#151a38', lit * 0.5))
                quad(o.l, 200, o.r, 200, n.r, n.b, n.l, n.b, dimSide(lit * 0.32))
                // side walls
                const lx = cell.x + DX[(gs.dir + 3) % 4], ly = cell.y + DY[(gs.dir + 3) % 4]
                const rx = cell.x + DX[(gs.dir + 1) % 4], ry = cell.y + DY[(gs.dir + 1) % 4]
                if (gs.map.wall(lx, ly)) quad(o.l, o.t, o.l, o.b, n.l, n.b, n.l, n.t, dimSide(lit * 0.6))
                if (gs.map.wall(rx, ry)) quad(o.r, o.t, o.r, o.b, n.r, n.b, n.r, n.t, dimSide(lit * 0.82))
                // front face
                if (solid) {
                    quad(n.l, n.t, n.r, n.t, n.r, n.b, n.l, n.b, dim(lit))
                    ctx.strokeStyle = lerpShade('#04050c', '#7c88e8', lit)
                    ctx.strokeRect(n.l, n.t, n.r - n.l, n.b - n.t)
                    return
                }
                // floor features on this open cell
                const t = cell.y * SIZE + cell.x
                const inRing = (h) => {
                    const y = n.b - (n.b - n.t) * h
                    return [n.l + (n.r - n.l) * 0.5, y]
                }
                if (gs.pots.has(t)) {
                    const [fx, fy] = inRing(0.28)
                    ctx.fillStyle = '#c98f4e'
                    ctx.fillRect(fx - 3 * (2 / i), fy - 4 / i, 6 * (2 / i), 4 / i + 1)
                }
                if (gs.springs.has(t)) {
                    const [fx, fy] = inRing(0.16)
                    ctx.fillStyle = '#2e6fd8'
                    ctx.fillRect(fx - 10 / i, fy - 2 / i, 20 / i, 3 / i + 1)
                    ctx.fillStyle = '#7fc4ff'
                    ctx.fillRect(fx - 5 / i + (Math.sin(bob / 9 + i) * 3) / i, fy - 3 / i, 4 / i, 1)
                }
                if (gs.map.stairs && gs.map.stairs.y === cell.y && gs.map.stairs.x === cell.x) {
                    const [fx, fy] = inRing(0.2)
                    ctx.fillStyle = '#57e389'
                    for (let s = 0; s < 3; s++) ctx.fillRect(fx - (12 - s * 3) / i, fy - s * (3 / i), (24 - s * 6) / i, 1.6)
                }
                if (gs.map.throne && gs.map.throne.y === cell.y && gs.map.throne.x === cell.x) {
                    ctx.fillStyle = '#b3402e'
                    ctx.fillRect(n.l + 2, n.t + 2, n.r - n.l - 4, n.b - n.t - 4)
                    ctx.fillStyle = '#ffd54f'
                    ctx.fillRect(n.l + (n.r - n.l) * 0.4, n.t + (n.b - n.t) * 0.25, (n.r - n.l) * 0.2, (n.b - n.t) * 0.5)
                }
                // an ambush-still-hidden tile has no tell — honest darkness
            }
            // crosshair
            ctx.fillStyle = 'rgba(255,255,255,0.35)'
            ctx.fillRect(CX - 4, 100, 9, 1); ctx.fillRect(CX, 96, 1, 9)
        }

        // ------------------------------------------------ combat feedback ----
        // The bolt, the sparkle and the dissolve ride on top of the painted
        // world. They touch NO state: the sim resolves a cast the instant it
        // happens, this is only the light we let it leave. mobSlot mirrors
        // paintCombat's projection to the pixel, so a bolt lands exactly where
        // its target is drawn — and a bolt for a gone target simply has no slot.
        const mobSlot = (i) => {
            if (!gs.combat) return null
            const m = gs.combat.mobs[i]
            if (!m) return null
            const n = gs.combat.mobs.length
            const sx = 128 + (i - (n - 1) / 2) * 62
            const A = ART[m.art]
            const size = (A ? A.s * 10 : 50) * (m.key === 'KING' ? 1.25 : 1)
            return { sx, size, art: m.art }
        }
        // a deterministic per-bolt offset in [0,1): repeated casts of the same
        // letter at the same foe trace the same path (the harness can trust it),
        // while different foes/spears fan out. No Math.random anywhere near it.
        const boltJit = (spell, mob) => {
            let h = 2166136261
            const s = String(spell) + ':' + mob
            for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619) }
            return ((h >>> 0) % 1000) / 1000
        }
        const paintFx = (now) => {
            if (!fxList.length) return
            for (let i = fxList.length - 1; i >= 0; i--) {
                const f = fxList[i]
                const age = now - f.t0
                if (f.kind === 'bolt') {
                    const D = 280
                    if (age > D) { fxList.splice(i, 1); continue }
                    const p = age / D
                    const e = 1 - (1 - p) * (1 - p)   // ease-out: fast launch, soft landing
                    const [x0, y0] = f.from, [x1, y1] = f.to
                    const dx = x1 - x0, dy = y1 - y0
                    const L = Math.hypot(dx, dy) || 1
                    const ox = (-dy / L) * (f.jit - 0.5) * 16
                    const oy = (dx / L) * (f.jit - 0.5) * 10
                    const tx = x0 + dx * e + ox * e, ty = y0 + dy * e + oy * e
                    ctx.save()
                    ctx.globalCompositeOperation = 'lighter'
                    ctx.lineCap = 'round'
                    ctx.strokeStyle = f.hot ? 'rgba(255,150,40,0.45)' : 'rgba(96,206,255,0.45)'
                    ctx.lineWidth = 4
                    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(tx, ty); ctx.stroke()
                    ctx.strokeStyle = f.hot ? '#fff3c4' : '#dbf5ff'
                    ctx.lineWidth = 1.5
                    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(tx, ty); ctx.stroke()
                    if (p > 0.55) {
                        const a = (p - 0.55) / 0.45
                        ctx.fillStyle = f.hot ? `rgba(255,210,120,${a * 0.9})` : `rgba(160,230,255,${a * 0.9})`
                        ctx.beginPath(); ctx.arc(x1 + ox, y1 + oy, 3 + a * 6, 0, 7); ctx.fill()
                    }
                    ctx.restore()
                } else if (f.kind === 'spark') {
                    const D = 520
                    if (age > D) { fxList.splice(i, 1); continue }
                    const p = age / D
                    const cx0 = f.wide ? 128 : f.x
                    const yBase = f.wide ? 150 : 216
                    const spread = f.wide ? 120 : 12
                    ctx.save()
                    ctx.globalCompositeOperation = 'lighter'
                    const N = f.wide ? 14 : 7
                    for (let k = 0; k < N; k++) {
                        const j = boltJit(f.wide ? 'w' : 's', k + (f.x | 0))
                        const jx = (j - 0.5) * spread * 2
                        const yy = yBase - p * (14 + j * 10) - j * 4
                        const a = (1 - p) * (0.5 + 0.5 * j)
                        ctx.fillStyle = f.wide ? `rgba(255,226,122,${a})` : `rgba(125,255,176,${a})`
                        ctx.fillRect(cx0 + jx - 1, yy - 1, 2, 2)
                    }
                    ctx.restore()
                } else if (f.kind === 'slay') {
                    const D = 460
                    if (age > D) { fxList.splice(i, 1); continue }
                    const p = age / D
                    const cy = f.y != null ? f.y : 140 - f.size * 0.5
                    if (p < 0.6) {
                        ctx.save()
                        ctx.globalAlpha = 1 - p / 0.6
                        drawMob(ctx, f.art, f.x - f.size / 2, 140 - f.size + p * 22, f.size, false)
                        ctx.restore()
                    }
                    ctx.save()
                    ctx.globalCompositeOperation = 'lighter'
                    for (let k = 0; k < 8; k++) {
                        const j = boltJit('slay', k + ((f.x | 0) % 97))
                        const a = 1 - p
                        ctx.fillStyle = `rgba(255,${120 + ((j * 80) | 0)},60,${a * 0.8})`
                        ctx.fillRect(f.x + (j - 0.5) * f.size * p * 2.4, cy - p * 26 - j * 6, 2, 2)
                    }
                    ctx.restore()
                    if (f.xp) {
                        const a = 1 - p
                        ctx.fillStyle = `rgba(125,255,176,${a})`
                        ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'
                        ctx.fillText('+' + f.xp, f.x, cy - 4 - p * 20)
                    }
                }
            }
        }

        const paintCombat = () => {
            const g = ctx.createLinearGradient(0, 0, 0, 150)
            g.addColorStop(0, '#131633'); g.addColorStop(1, '#2a1d3d')
            ctx.fillStyle = g; ctx.fillRect(0, 0, W, 150)
            ctx.fillStyle = '#0d0a16'; ctx.fillRect(0, 150, W, 50)
            const mobs = gs.combat ? gs.combat.mobs : []
            const live = mobs.filter((m) => m.hp > 0)
            const wob = Math.sin(bob / 7) * 2
            mobs.forEach((m, i) => {
                const n = Math.max(live.length, mobs.length)
                const slot = mobs.indexOf(m)
                const sx = 128 + (slot - (n - 1) / 2) * 62
                const A = ART[m.art]
                const size = (A ? A.s * 10 : 50) * (m.key === 'KING' ? 1.25 : 1)
                const mx = slideX(slot, sx, size)
                if (m.hp > 0) {
                    drawMob(ctx, m.art, mx - size / 2, 140 - size + wob, size, flashHit > 0)
                    if (i === gs.target) {
                        ctx.strokeStyle = '#ffffff'
                        ctx.beginPath()
                        ctx.moveTo(mx - size / 2 - 3, 140 - size + wob + 6)
                        ctx.lineTo(mx - size / 2 - 3, 140 + wob)
                        ctx.moveTo(mx + size / 2 + 3, 140 - size + wob + 6)
                        ctx.lineTo(mx + size / 2 + 3, 140 + wob)
                        ctx.stroke()
                    }
                    ctx.fillStyle = '#222'; ctx.fillRect(mx - 16, 144, 32, 4)
                    ctx.fillStyle = m.hp / m.maxHp > 0.4 ? '#e5484d' : '#ff8a3d'
                    ctx.fillRect(mx - 16, 144, 32 * (m.hp / m.maxHp), 4)
                }
            })
            if (gs.combat && gs.combat.boss) {
                // the crown's warning: the banner pulses on the beat and the
                // field dims with it, so the words cut through the dark
                const pulse = 0.5 + 0.5 * Math.sin(bob / 5)
                ctx.fillStyle = `rgba(4,0,10,${(0.1 + 0.14 * pulse).toFixed(3)})`
                ctx.fillRect(0, 0, W, 150)
                ctx.fillStyle = `rgba(255,82,82,${(0.55 + 0.45 * pulse).toFixed(3)})`
                ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'
                ctx.fillText('THE HOLLOW KING — NO FLIGHT', 128, 14)
            }
        }

        const paint = () => {
            bob++
            if (flashHit > 0) flashHit -= 0.02
            const sx = shake > 0 ? ((performance.now() % 7) - 3) * shake * 0.4 : 0
            const sy = shake > 0 ? ((performance.now() % 5) - 2) * shake * 0.4 : 0
            if (shake > 0) { shake *= 0.85; if (shake < 0.4) shake = 0 }
            ctx.save(); ctx.translate(sx, sy)
            if (gs.mode === 'town') { if (gs.town.b) paintInterior(ctx, gs, bob); else paintRim(ctx, gs, bob, uiSel) }
            else if (screenRef.current === 'play' && gs.mode === 'combat') paintCombat()
            else if (glOn()) {
                // the WebGL corridor draws through from the layer below; the 2D
                // frame keeps only the sighter over it (the party strip, automap
                // and FX already paint opaquely over their own rows above)
                ctx.clearRect(0, 0, W, 200)
                ctx.fillStyle = 'rgba(255,255,255,0.35)'
                ctx.fillRect(CX - 4, 100, 9, 1); ctx.fillRect(CX, 96, 1, 9)
            }
            else paintMap()
            ctx.restore()
            ctx.fillStyle = '#000'; ctx.fillRect(0, 200, W, H - 200)
            // six mini panels along the foot — text is measured, never assumed
            // (#1282): names grow to the largest size that fits the 34px panel so
            // they read on a phone, and the level/class row is sized so its two
            // columns never collide or clip. See TenDeep/hudfit.js.
            gs.party.forEach((h, i) => {
                const px = 4 + i * 42
                ctx.fillStyle = h.alive ? '#0c1024' : '#1a0d12'
                ctx.fillRect(px, 204, 38, 18)
                const name = fitSize(h.name, 34, [7, 6, 5], ctx)
                ctx.fillStyle = h.alive ? '#9fb4ff' : '#6b4050'
                ctx.font = `${name.size}px monospace`; ctx.textAlign = 'left'
                ctx.fillText(name.text, px + 2, 210)
                ctx.fillStyle = '#333'; ctx.fillRect(px + 2, 213, 34, 2)
                ctx.fillStyle = '#e5484d'; ctx.fillRect(px + 2, 213, 34 * Math.max(0, h.hp / h.maxHp), 2)
                ctx.fillStyle = '#224'; ctx.fillRect(px + 2, 216, 34, 2)
                ctx.fillStyle = '#4f9dff'; ctx.fillRect(px + 2, 216, 34 * (h.mp / h.maxMp), 2)
                const clsTag = CLASSES[h.cls].abbr + (Object.keys(CLASSES[h.cls].spells).length ? '*' : '')
                const row = fitTwoCols('L' + h.lvl, clsTag, 17, 15, [6, 5], ctx)
                ctx.font = `${row.size}px monospace`
                ctx.fillStyle = '#ffd54f'; ctx.textAlign = 'left'
                ctx.fillText(row.left, px + 2, 221)
                ctx.fillStyle = h.alive && Object.keys(CLASSES[h.cls].spells).length ? '#7fc4ff' : '#6b7699'
                ctx.textAlign = 'right'
                ctx.fillText(row.right, px + 36, 221)
                ctx.textAlign = 'left'
            })
            drawAutomap()
            paintFx(performance.now())
        }

        const drawAutomap = () => {
            const cv = mapRef.current
            if (!cv) return
            const inDeep = gs.mode === 'map' || gs.mode === 'combat'
            cv.style.display = inDeep && screenRef.current === 'play' ? 'block' : 'none'
            if (!inDeep) return
            const g = cv.getContext('2d')
            const C = 5
            g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height)
            for (const t of gs.explored) {
                const x = t % SIZE, y = Math.floor(t / SIZE)
                g.fillStyle = automapShade(automapRing(x, y, gs.x, gs.y))
                g.fillRect(x * C, y * C, C, C)
            }
            // floor ruler gutter: stairs/throne remembered on EVERY floor visited
            g.fillStyle = '#000'
            g.fillRect(SIZE * C, 0, cv.width - SIZE * C, cv.height)
            for (let fi = 0; fi <= gs.floor; fi++) {
                const ry = fi * 9 + 2
                g.font = '6px monospace'
                g.textAlign = 'left'
                g.fillStyle = fi === gs.floor ? '#ffd54f' : '#4a5578'
                g.fillText(String(fi + 1), SIZE * C + 2, ry + 4)
                for (const m of gs.marks) if (m.floor === fi) {
                    g.fillStyle = m.kind === 'stairs' ? '#57e389' : '#ff5252'
                    g.fillText(m.kind === 'stairs' ? 'v' : 'K', SIZE * C + 7, ry + 4)
                }
            }
            if (gs.map.stairs && gs.explored.has(gs.map.stairs.y * SIZE + gs.map.stairs.x)) {
                g.fillStyle = '#57e389'; g.fillRect(gs.map.stairs.x * C, gs.map.stairs.y * C, C, C)
            }
            if (gs.map.throne && gs.explored.has(gs.map.throne.y * SIZE + gs.map.throne.x)) {
                g.fillStyle = '#ff5252'; g.fillRect(gs.map.throne.x * C, gs.map.throne.y * C, C, C)
            }
            for (const t of gs.springs) if (gs.explored.has(t)) { g.fillStyle = '#2e6fd8'; g.fillRect((t % SIZE) * C, Math.floor(t / SIZE) * C, C, C) }
            // the hero: amber square + a barrel of facing
            const hx = gs.x * C, hy = gs.y * C
            g.fillStyle = '#ffd54f'; g.fillRect(hx, hy, C, C)
            g.fillStyle = '#fff'
            g.fillRect(hx + C / 2 + DX[gs.dir] * 3 - 1, hy + C / 2 + DY[gs.dir] * 3 - 1, 2, 2)
        }

        let lastHud = 0
        const syncHud = () => {
            const now = performance.now()
            if (now - lastHud < 100) return
            lastHud = now
            const h = hudRef.current
            if (h.floor) h.floor.textContent = gs.mode === 'map' || gs.mode === 'combat' ? gs.map.name : TOWN
            if (h.potions) h.potions.textContent = String(gs.potions)
            if (h.gold) h.gold.textContent = String(purse(gs))
            if (h.toast) { h.toast.textContent = toastMsg; h.toast.style.opacity = toast > 0 ? '1' : '0' }
            if (h.cmd) h.cmd.textContent = gs.mode === 'town'
                ? (gs.town.b ? (gs.town.b === 'T' && gs.town.cand ? '↑↓ paper · ←→ way · R reroll · SPACE accept · L leave' : '↑↓ hero · ←→ service · SPACE buys · L leave') : '←→ doors · SPACE enter · F descends')
                : gs.mode === 'combat' ? `SPACE attack · G guard · F ${pickSpell('dmg') ? SPELLS[pickSpell('dmg')].name : 'no fire'} · H ${pickSpell('heal') ? SPELLS[pickSpell('heal')].name : 'no heal'} · P drink · L flee` : 'ARROWS walk · SPACE use · P potion'
            if (h.dir) h.dir.textContent = ['EAST', 'SOUTH', 'WEST', 'NORTH'][gs.dir]
            // keep the pad's B verb honest with the mode (#1275): DRINK in the
            // corridor, LEAVE in a building, DESCEND on the street, fire/GUARD
            // in battle. React only re-renders when the verb actually changes.
            const nb = padB(gs, gs.mode === 'combat' ? pickSpell('dmg') : null)
            const ob = bActRef.current
            if (!ob || ob.label !== nb.label || ob.code !== nb.code) { bActRef.current = nb; setBAct(nb) }
            if (toast > 0 && !pausedRef.current) toast--
        }

        const frame = (ts) => {
            raf = requestAnimationFrame(frame)
            if (!last) last = ts
            const ft = Math.min(ts - last, 250)
            last = ts
            if (!pausedRef.current) {
                acc += ft
                while (acc >= SIM_MS) { doFrameSim(); acc -= SIM_MS }
            }
            paint()
            glFrame(ft)
            syncHud()
        }

        const startPlay = () => {
            gs = makeRun()
            uiSel = 0
            evLog.length = 0
            setMode('play')
            say('THE RIM — THE LIP OF THE WELL')
            audioController.playSweep(220, 660, 0.3, 'square', 0.07)
        }

        // which letter the key will work: the mightiest the company has
        // LEARNED, preferring one it can pay for this instant
        const pickSpell = (family) => {
            const ids = family === 'heal' ? ['prayer', 'heal'] : ['firestorm', 'firebolt']
            const alive = gs.party.filter(h => h.alive)
            const know = ids.filter(id => alive.some(h => CLASSES[h.cls].spells[id] !== undefined && h.lvl >= CLASSES[h.cls].spells[id]))
            const ready = know.filter(id => alive.some(h => canCast(h, id)))
            return ready[0] || know[0] || null
        }

        const onDown = (e) => {
            const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (code === 'Question') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); return }
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault()
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(); return }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
            if (pausedRef.current) return
            if (gs.mode === 'town') {
                if (gs.town.b) {
                    if (gs.town.b === 'T' && gs.town.cand) {
                        if (e.code === 'ArrowUp') act('sel-')
                        else if (e.code === 'ArrowDown') act('sel+')
                        else if (e.code === 'ArrowLeft') act('shift-')
                        else if (e.code === 'ArrowRight') act('shift+')
                        else if (e.code === 'KeyR') act('roll')
                        else if (e.code === 'Space') act('accept')
                        else if (e.code === 'KeyL') act('leave')
                        else if (e.code === 'KeyP') act('potion')
                        return
                    }
                    if (e.code === 'ArrowUp') act('sel-')
                    else if (e.code === 'ArrowDown') act('sel+')
                    else if (e.code === 'ArrowLeft') act('svc-')
                    else if (e.code === 'ArrowRight') act('svc+')
                    else if (e.code === 'Space' || e.code === 'KeyF') {
                        const svc = SERVICES[gs.town.b][gs.town.svc]
                        act(svc && svc.id === 'create' ? 'open' : 'buy')
                    }
                    else if (e.code === 'KeyL') act('leave')
                    else if (e.code === 'KeyP') act('potion')
                } else {
                    if (e.code === 'ArrowLeft') uiSel = (uiSel + BUILDINGS.length - 1) % BUILDINGS.length
                    else if (e.code === 'ArrowRight') uiSel = (uiSel + 1) % BUILDINGS.length
                    else if (e.code === 'Space') act(`enter-${BUILDINGS[uiSel].key}`)
                    else if (e.code === 'KeyF' || e.code === 'ArrowUp') act('down')
                    else if (e.code === 'KeyP') act('potion')
                }
                return
            }
            const fighting = gs.mode === 'combat'
            if (!fighting && e.repeat && ['Space', 'KeyP', 'KeyF'].includes(e.code)) return
            if (e.code === 'ArrowUp') act(fighting ? 'target+' : 'fwd')
            else if (e.code === 'ArrowDown') act(fighting ? 'target-' : 'back')
            else if (e.code === 'ArrowLeft') act(fighting ? 'target-' : 'left')
            else if (e.code === 'ArrowRight') act(fighting ? 'target+' : 'right')
            else if (e.code === 'Space') act(fighting ? 'attack' : 'use')
            else if (e.code === 'KeyF') act(fighting ? `cast ${pickSpell('dmg') || 'firebolt'}` : 'use')
            else if (e.code === 'KeyH') act(fighting ? `cast ${pickSpell('heal') || 'heal'}` : 'wait')
            else if (e.code === 'KeyG') act(fighting ? 'guard' : 'wait')
            else if (e.code === 'KeyP') act('potion')
            else if (e.code === 'KeyL') act(fighting ? 'flee' : 'wait')
        }
        window.addEventListener('keydown', onDown)

        const onPointer = () => {
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(); return }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
        }
        window.addEventListener('pointerdown', onPointer)

        const resize = () => {
            const r = wrap.getBoundingClientRect()
            if (!r.width || !r.height) return
            const sc = Math.min(r.width / W, r.height / (H + 40))
            holder.style.width = `${W * sc}px`
            holder.style.height = `${H * sc}px`
            if (R && glWasOn) R.resize()
        }
        window.addEventListener('resize', resize)
        resize()
        raf = requestAnimationFrame(frame)

        if (import.meta.env.DEV) {
            window.__deepTest = {
                probe: () => ({
                    screen: screenRef.current, mode: gs.mode, end: gs.end, tick: gs.tick,
                    ease: easeOff(),
                    gl: !!R,
                    glFrames: R ? R.frameCount : 0,
                    glLag: (() => {
                        if (!R) return 0
                        const p = R.pose(), e = R.renderPose()
                        return Math.hypot(p.x - e.x, p.y - e.y)
                            + Math.abs(((p.yaw - e.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
                    })(),
                    slide: gs.combat ? slideRemain(gs.combat.mobs.length) : 0,
                    slideX: (() => {
                        if (!gs.combat || !gs.combat.mobs.length) return null
                        const m = gs.combat.mobs[0]
                        const n = Math.max(gs.combat.mobs.filter((q) => q.hp > 0).length, gs.combat.mobs.length)
                        const sx = 128 + (0 - (n - 1) / 2) * 62
                        const A = ART[m.art]
                        const size = (A ? A.s * 10 : 50) * (m.key === 'KING' ? 1.25 : 1)
                        return { x: slideX(0, sx, size), sx, size }
                    })(),
                    fx: (() => { const b = fxList.find((f) => f.kind === 'bolt'); return { count: fxList.length, kinds: fxList.map((f) => f.kind), bolt: b ? { from: b.from, to: b.to } : null } })(),
                    floor: gs.floor, x: gs.x, y: gs.y, dir: gs.dir, potions: gs.potions,
                    gold: purse(gs), wipe: gs.wipe, ward: gs.ward,
                    town: gs.mode === 'town' ? {
                        b: gs.town.b, hero: gs.town.hero, svc: gs.town.svc, sel: uiSel,
                        ci: gs.town.ci, ali: ALIGN_ORDER[gs.town.ali],
                        cand: gs.town.cand ? gs.town.cand.map(c => ({ ...c, composed: compose(c, ALIGN_ORDER[gs.town.ali]) })) : null,
                        createPrice: createPriceFor(),
                        vacant: gs.party.map((_, i) => isVacant(gs, i)),
                        services: gs.town.b ? SERVICES[gs.town.b].map((s, i) => ({
                            id: s.id, price: servicePrice(gs, s), ok: canBuy(gs) && gs.town.svc === i,
                        })) : null,
                    } : null,
                    wallAhead: !!(gs.map && gs.map.wall(gs.x + DX[gs.dir], gs.y + DY[gs.dir])),
                    // the sim's OWN hands: facing dir, left = dir+3, right = dir+1.
                    // The mirror gate (#1293) grades which screen side the GL view
                    // paints these cells on — the view must agree with these.
                    wallLeft: !!(gs.map && gs.map.wall(gs.x + DX[(gs.dir + 3) % 4], gs.y + DY[(gs.dir + 3) % 4])),
                    wallRight: !!(gs.map && gs.map.wall(gs.x + DX[(gs.dir + 1) % 4], gs.y + DY[(gs.dir + 1) % 4])),
                    stairs: gs.map ? gs.map.stairs : null, throne: gs.map ? gs.map.throne : null,
                    springHere: gs.springs.has(gs.y * SIZE + gs.x),
                    potHere: gs.pots.has(gs.y * SIZE + gs.x),
                    explored: gs.explored.size,
                    marks: gs.marks,
                    view: (() => {
                        // what the wireframe can see: first solid depth + features
                        // in front, exactly as paintMap walks the corridor
                        let wallDist = 7, pots = 0, springs = 0, stairs = false
                        if (!gs.map) return { wallDist: 0, pots, springs, stairs }
                        for (let i = 1; i <= DEPTH; i++) {
                            const cell = { x: gs.x + DX[gs.dir] * i, y: gs.y + DY[gs.dir] * i }
                            if (gs.map.wall(cell.x, cell.y)) { wallDist = i; break }
                            const t = cell.y * SIZE + cell.x
                            if (gs.pots.has(t)) pots = i
                            if (gs.springs.has(t)) springs = i
                            if ((gs.map.stairs && gs.map.stairs.y === cell.y && gs.map.stairs.x === cell.x) ||
                                (gs.map.throne && gs.map.throne.y === cell.y && gs.map.throne.x === cell.x)) stairs = true
                        }
                        return { wallDist, pots, springs, stairs }
                    })(),
                    mobPx: gs.combat ? gs.combat.mobs.map((m, i) => {
                        const liveN = gs.combat.mobs.filter((q) => q.hp > 0).length
                        const n = Math.max(liveN, gs.combat.mobs.length)
                        const slot = gs.combat.mobs.indexOf(m)
                        const sx = 128 + (slot - (n - 1) / 2) * 62
                        const A = ART[m.art]
                        const size = (A ? A.s * 10 : 50) * (m.key === 'KING' ? 1.25 : 1)
                        return { i, sx, size, hp: m.hp }
                    }) : [],
                    party: gs.party.map((h) => ({ ...h })),
                    combat: gs.combat ? { boss: gs.combat.boss, round: gs.combat.round, mobs: gs.combat.mobs.map((m) => ({ ...m })), target: gs.target } : null,
                    ledger: { ...gs.ledger },
                    potTiles: gs.ledger.potTiles.slice(),
                    springTiles: gs.ledger.springTiles.slice(),
                    glBeacons: lastBeacons,
                    springsNear: (() => {
                        let n = 0
                        for (const t of gs.springs) { const sx = t % SIZE, sy = (t - sx) / SIZE; if (Math.hypot(sx + 0.5 - gs.x, sy + 0.5 - gs.y) < 6) n++ }
                        return n
                    })(),
                    springCells: [...gs.springs].map((t) => [t % SIZE, (t - (t % SIZE)) / SIZE]),
                    throneNear: !!(gs.map && gs.map.throne && Math.hypot(gs.map.throne.x + 0.5 - gs.x, gs.map.throne.y + 0.5 - gs.y) < 7),
                    padB: padB(gs, gs.mode === 'combat' ? pickSpell('dmg') : null),
                    automapCursor: [gs.x * 5, gs.y * 5],
                    evLog: evLog.slice(-140),
                }),
                start: startPlay,
                hash: () => stateHash(gs),
                // what one cell holds, for the harness's pose search (#1293):
                // the mirror gate needs a cell whose flanks disagree.
                cellAt: (x, y) => (gs.map ? {
                    wall: !!gs.map.wall(x, y),
                    spring: gs.springs.has(y * SIZE + x),
                    pot: gs.pots.has(y * SIZE + x),
                    stair: !!(gs.map.stairs && gs.map.stairs.y === y && gs.map.stairs.x === x),
                    throne: !!(gs.map.throne && gs.map.throne.y === y && gs.map.throne.x === x),
                } : null),
                wallAt: (x, y) => !!(gs.map && gs.map.wall(x, y)),
                cmd: (c) => { act(c); return true },
                setup: (opts = {}) => {
                    if (screenRef.current !== 'play') return false
                    if (opts.gold !== undefined) {
                        for (const h of gs.party) h.gold = 0
                        gs.party[0].gold = opts.gold
                        gs.ledger.goldIn += Math.max(0, opts.gold - 120)
                    }
                    if (opts.kill !== undefined) { const h = gs.party[opts.kill]; if (h) { h.alive = false; h.hp = 0 } }
                    if (opts.townB !== undefined) {
                        gs.mode = 'town'; gs.combat = null
                        gs.town = { b: opts.townB || null, svc: 0, hero: 0, cand: null, ci: 0, ali: 0 }
                        return true
                    }
                    if (gs.mode === 'town') step(gs, 'down')
                    if (opts.floor !== undefined && opts.floor !== gs.floor && opts.floor < 10) {
                        for (let f = gs.floor; f < opts.floor; f++) step(gs, 'wait')
                        gs = makeRun()
                        step(gs, 'down')
                        while (gs.floor < opts.floor) {
                            gs.combat = null
                            gs.x = gs.map.stairs.x; gs.y = gs.map.stairs.y
                            step(gs, 'use')
                        }
                    }
                    if (opts.party) for (const p of opts.party) {
                        const h = gs.party.find((q) => q.name === p.name) || gs.party[p.i]
                        if (h) { if (p.hp !== undefined) { h.hp = p.hp; h.alive = p.hp > 0 } if (p.mp !== undefined) h.mp = p.mp }
                    }
                    if (opts.potions !== undefined) gs.potions = opts.potions
                    if (opts.at) {
                        const [ax, ay] = opts.at
                        let guard = 0
                        while ((gs.x !== ax || gs.y !== ay) && guard++ < 4000) {
                            const d = [0, 1, 2, 3].find((d) => !gs.map.wall(gs.x + DX[d], gs.y + DY[d]) && ((d === 0 && ax > gs.x) || (d === 1 && ay > gs.y) || (d === 2 && ax < gs.x) || (d === 3 && ay < gs.y)) && true)
                            if (d === undefined) { gs.dir = (gs.dir + 1) % 4; continue }
                            gs.dir = d
                            act('fwd')
                            if (gs.mode === 'combat') { gs.combat = null; gs.mode = 'map' }
                        }
                        gs.x = ax; gs.y = ay
                    }
                    if (opts.facing !== undefined) gs.dir = opts.facing
                    evLog.length = 0
                    return true
                },
            }
            mountDbg({
                title: 'TEN-DEEP',
                getState: () => [
                    gs.mode === 'map' || gs.mode === 'combat' ? `${gs.map.name}  (${gs.x},${gs.y}) facing ${['E', 'S', 'W', 'N'][gs.dir]}  mode ${gs.mode}` : `THE RIM — ${gs.town.b ? BUILDINGS.find((b) => b.key === gs.town.b).name : (gs.end ? 'cold ground' : 'the street')}  purse ${purse(gs)}`,
                    `potions ${gs.potions}  explored ${gs.explored.size}  dealt ${gs.ledger.dealt} taken ${gs.ledger.taken}`,
                    gs.party.map((h) => `${h.name}[${CLASSES[h.cls].abbr}/${RACES[h.race].abbr}/${ALIGNMENTS[h.ali].abbr}] ${h.hp}/${h.maxHp}mp${h.mp}L${h.lvl}${h.alive ? '' : ' x'}[${Object.keys(CLASSES[h.cls].spells).filter(id => h.lvl >= CLASSES[h.cls].spells[id]).join('+') || 'no-book'}]`).join('  '),
                    gs.combat ? `ROUND ${gs.combat.round}: ${gs.combat.mobs.map((m) => `${m.name} ${m.hp}`).join(' | ')}` : `end ${gs.end}`,
                ],
                actions: [
                    {
                        label: 'PROGNOSIS', run: () => {
                            if (gs.end) return `already ${gs.end}`
                            const cl = cloneState(gs)
                            const r = playOut(cl, 60000)
                            return r.won
                                ? `WINNABLE from HERE: solved in ${r.ticks} more commands (${r.ledger.potionsUsed} potions, ${r.ledger.springsUsed} springs to spend)`
                                : `NOT winnable from here with the autopilot: end=${r.end} after ${r.ticks} ticks — if you cheated the state, that is expected; on a clean run this must never appear`
                        },
                    },
                    { label: '+5 POTIONS', run: () => { gs.potions += 5; return 'five crimson vials' } },
                    { label: 'FULL HEAL', run: () => { for (const h of gs.party) { h.hp = h.maxHp; h.mp = h.maxMp; if (h.hp > 0) h.alive = true } return 'the party is whole' } },
                    { label: 'WARP TO STAIRS', run: () => { if (!gs.map.stairs) return 'the King owns this floor'; gs.x = gs.map.stairs.x; gs.y = gs.map.stairs.y; return 'the stair glows' } },
                ],
            })
        }

        return () => {
            disposed = true
            if (import.meta.env.DEV) { if (window.__deepTest) delete window.__deepTest; unmountDbg() }
            window.removeEventListener('keydown', onDown)
            window.removeEventListener('pointerdown', onPointer)
            window.removeEventListener('resize', resize)
            cancelAnimationFrame(raf)
            holder.remove()
        }
    }, [setMode])

    const handleResume = useCallback(() => { setPaused(false); pausedRef.current = false }, [])
    const play = screen === 'play'

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden select-none" style={{ touchAction: 'none' }}>
            <div ref={stageRef} className="absolute inset-0 flex items-center justify-center" />
            <canvas ref={mapRef} data-deep-map="1" width={115} height={95}
                className="absolute bottom-3 left-3 border border-indigo-500/40 bg-black/80 rounded opacity-90 pointer-events-none"
                style={{ imageRendering: 'pixelated', display: play ? 'block' : 'none', width: '143px', height: '118px' }} />

            <div className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${play ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute top-20 left-3 right-3 flex items-center gap-3 text-white font-mono text-xs">
                    <span ref={setHud('floor')} className="border border-indigo-400/60 text-indigo-200 px-2 py-0.5 rounded bg-black/40">LEVEL 1</span>
                    <span className="text-amber-200">POTIONS <b ref={setHud('potions')}>1</b></span>
                    <span className="text-yellow-100">PURSE <b ref={setHud('gold')}>120</b></span>
                    <span className="text-cyan-200">FACING <b ref={setHud('dir')}>EAST</b></span>
                    <span ref={setHud('cmd')} className="ml-auto text-white/60" />
                </div>
                <div ref={setHud('toast')} className="absolute inset-x-0 top-1/3 text-center text-amber-100 font-mono font-bold text-xl transition-opacity duration-500" style={{ opacity: 0, textShadow: '0 0 12px #33f' }} />
            </div>

            {screen === 'attract' && (
                <div className="absolute inset-0 bg-black/55 flex flex-col items-center justify-center text-center px-6 pointer-events-none">
                    <h1 className="text-5xl font-black tracking-widest mb-6" style={{ color: '#ffd54f', textShadow: '3px 3px 0 #6b21a8, 0 10px 28px #000' }}>TEN-DEEP</h1>
                    {/* #1275: the attract demo runs over a TORCH-LIT wall now,
                        not the old dark RIM — ART rule 6 contrast: the cycling
                        line carries its own shadow so it stays readable on the
                        brightest brick. */}
                    <span className="mb-6 inline-block" style={{ textShadow: '0 2px 8px #000, 0 0 22px #000' }}>
                        <AttractMessage className="text-indigo-100/80" messages={MESSAGES} />
                    </span>
                    <p className="text-lg font-mono font-bold animate-pulse text-white">{PRESS}</p>
                </div>
            )}

            {screen === 'over' && end && (
                <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center text-amber-50 font-mono px-6 text-center">
                    <h2 className={`text-4xl font-black mb-2 ${end.win ? 'text-yellow-300' : 'text-red-400'}`}>{end.win ? 'THE HOLLOW KING HAS FALLEN' : 'THE PARTY PERISHES'}</h2>
                    <p className="text-lg mb-4">{end.win ? 'Ten deeps below, the throne is silent. The Deep is yours.' : 'The dark keeps what it takes — this company has no gold left at the RIM to call them back.'}</p>
                    <p className="text-sm text-white/70">{(end.win ? 'Victory at tick ' : 'Fallen at tick ') + end.tick}</p>
                    <p className="mt-6 animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find((g) => g.label === 'TEN-DEEP')} onResume={handleResume} />}
            <VirtualControls visible={play && !paused} secondAction={bAct || undefined} />
        </div>
    )
}

export default TenDeepGame
