// HOMEBODY — the arcade shell over ./sim.js (rules) and ./art.js (look).
//
// An original people sim in the spirit of The Sims (Maxis, PC 2000) — its own
// IP, names and art. Command two residents on a little suburban lot: tap an
// object to order them (they pathfind and use it), juggle five needs against a
// clock that never stops, work at the mailbox for §, buy furniture to raise the
// home's ambience, and bank 80 contentment to grant the lifetime wish. Ignore
// the household and it collapses.
//
// One useEffect owns the fixed-timestep loop; the contract hands the clock to a
// driver while it holds it. Attract runs the sim's own demo autopilot.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import AttractMessage from '../../components/AttractMessage'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop } from '../../utils/gameContract'
import {
    FIXED_DT, W, H, PANEL_X, TILE, LOT_X, LOT_Y, WIN_CONTENT,
    tileOf, CATALOG, NEEDS, SFX,
    newRun, advance, autoStep, cmdUse, cmdWalk, cmdWork, tryUse,
    place, sellAt, cellItem, targetsOf, walkable, manualMove, placeOk,
    stateHash,
} from './sim.js'
import {
    drawGround, drawGate, drawItem, drawPerson, nightTint, drawPanel, drawTopBar,
    drawCatalog, catalogHit, drawBuildCursor, drawThoughts, drawClouds,
} from './art.js'

const SIM_MS = FIXED_DT
const MESSAGES = [
    'Two residents, five needs, one little house. You are the voice in their heads.',
    'Tap a fridge, a bed, the TV — they walk over and use it. Feed them, rest them.',
    'The mailbox pays the bills on workdays. § buys furniture to raise the home.',
    'Fern the neighbour wanders in by day — chat fills the blue bar.',
    'Bank 80 contentment and the lifetime wish comes true.',
]
const PRESS = 'TAP / PRESS ANY KEY TO MOVE IN'

const CUR = { l: ['ArrowLeft', 'KeyA'], r: ['ArrowRight', 'KeyD'], u: ['ArrowUp', 'KeyW'], d: ['ArrowDown', 'KeyS'] }
const MOVE_KEYS = new Set([...CUR.l, ...CUR.r, ...CUR.u, ...CUR.d])
const ACTION_KEYS = new Set(['Space', 'Enter', 'NumpadEnter'])
const BUILD_KEYS = new Set(['KeyB'])
const SWITCH_KEYS = new Set(['KeyG', 'Tab'])
const KEY_SET = new Set([...MOVE_KEYS, ...ACTION_KEYS, ...BUILD_KEYS, ...SWITCH_KEYS, ...'123456789'])

const nextSeed = (s) => (Math.imul(s, 1664525) + 1013904223) >>> 0

const HomebodyGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [endInfo, setEndInfo] = useState(null)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const overAtRef = useRef(0)

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const setSc = (s) => { screenRef.current = s; setScreen(s) }

        let canvas = null, ctx = null
        let raf = 0, last = 0, acc = 0
        let gs = null, demoG = null
        let seed = 20261023
        let particles = [], shake = 0
        let toastMsg = '', toast = 0
        const prev = { left: false, right: false, up: false, down: false, a: false, b: false, pdown: false }
        const heldKeys = { left: false, right: false, up: false, down: false }
        let actQueued = false, buildQueued = false, switchQueued = false
        let digitPick = -1
        const say = (m) => { toastMsg = m; toast = 120 }

        const buildCanvas = () => {
            if (canvas) canvas.remove()
            canvas = document.createElement('canvas')
            canvas.width = W; canvas.height = H
            canvas.className = 'block'
            canvas.style.imageRendering = 'pixelated'
            canvas.style.touchAction = 'none'
            wrap.appendChild(canvas)
            ctx = canvas.getContext('2d')
            ctx.imageSmoothingEnabled = false
            resize()
        }

        // ------------------------------------------------------------ audio ----
        const handleEvents = (s, live) => {
            while (s.events.length) {
                const e = s.events.shift()
                switch (e.t) {
                    case 'satisfied': {
                        const fx = SFX[e.need] || SFX.hunger
                        fx.seq.forEach((m, i) => audioController.playTone(fx.f * m, 0.09, fx.type, 0.05, i * 0.07))
                        if (fx.noise) audioController.playFilteredNoise(fx.noise, 0.08, 1400)
                        if (live) burst(e.x ?? W / 2, e.y ?? H / 2, 6, '#ffe6a8', 2.2, 'flash')
                        break
                    }
                    case 'content': audioController.playTone(880, 0.05, 'triangle', 0.03); if (live) sparkles(); break
                    case 'redcross':
                        audioController.playTone(300, 0.06, 'square', 0.05, 0)
                        audioController.playTone(230, 0.1, 'square', 0.05, 0.08)
                        if (live) say(`${e.name.toUpperCase()} NEEDS ${e.need.toUpperCase()}`)
                        break
                    case 'place': audioController.playTone(200, 0.09, 'square', 0.06); if (live) burst(tilePx(e.c), tilePy(e.r) + 16, 8, '#c9b48a', 2.6); break
                    case 'sell': audioController.playSweep(420, 180, 0.12, 'square', 0.05); break
                    case 'work-go': audioController.playSweep(260, 620, 0.3, 'square', 0.06); if (live) say(`${e.name.toUpperCase()} LEAVES FOR WORK`); break
                    case 'pay': audioController.playTone(880, 0.06, 'triangle', 0.05); audioController.playTone(1175, 0.06, 'triangle', 0.05); audioController.playTone(1568, 0.1, 'triangle', 0.05); if (live) say(`PAYDAY  §${e.pay}`); break
                    case 'visit': audioController.playTone(660, 0.14, 'sine', 0.06); setTimeout(() => audioController.playTone(880, 0.18, 'sine', 0.06), 150); if (live) say('THE NEIGHBOUR RINGS'); break
                    case 'visit-end': audioController.playSweep(520, 300, 0.2, 'sine', 0.04); break
                    case 'faint': audioController.playNoise(0.3, 0.1); audioController.playSweep(300, 60, 0.5, 'sawtooth', 0.09); shake = 10; if (live) { say(`${e.name.toUpperCase()} COLLAPSED!`); burst(e.x, e.y, 16, '#e23b2e', 3.4) } break
                    case 'wake': audioController.playSweep(440, 760, 0.2, 'triangle', 0.05); break
                    case 'day': audioController.playTone(1245, 0.06, 'sine', 0.03); setTimeout(() => audioController.playTone(1568, 0.09, 'sine', 0.03), 90); if (live && s.day > 1) say(`DAY ${s.day}`); break
                    default: break
                }
            }
        }
        const tilePx = (c) => LOT_X + c * TILE + TILE / 2
        const tilePy = (r) => LOT_Y + r * TILE + TILE / 2

        const burst = (x, y, n, col, spd = 3, kind = 'dot') => {
            for (let i = 0; i < n; i++) {
                const a = Math.random() * 6.28, v = spd * (0.4 + Math.random())
                particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 22 + Math.random() * 14, max: 36, col, size: 1.6 + Math.random() * 2.4, kind })
            }
        }
        const sparkles = () => {
            const x = PANEL_X + 56, y = H - 76
            for (let i = 0; i < 5; i++) particles.push({ x: x + (Math.random() - 0.5) * 40, y: y - Math.random() * 8, vx: 0, vy: -0.6, life: 22, max: 22, col: '#ffd24a', size: 1.8, kind: 'flash' })
        }

        const finish = (s) => {
            if (s.done !== 'win' && s.done !== 'lose') return
            overAtRef.current = performance.now()
            if (s.done === 'win') {
                audioController.playSweep(523, 1046, 0.5, 'square', 0.08)
                setTimeout(() => audioController.playSweep(659, 1318, 0.5, 'square', 0.08), 220)
            } else {
                audioController.playSweep(330, 82, 0.7, 'sawtooth', 0.1)
            }
            setEndInfo({ end: s.done, why: s.endMsg, content: s.content, day: s.day, money: s.money })
            setSc('over')
        }

        // ---------------------------------------------------------- pointer ----
        const pointerPx = (px, py) => {
            if (!gs || gs.done || screenRef.current !== 'play' || pausedRef.current) return
            if (gs.build) {
                const i = catalogHit(px, py)
                if (i >= 0) { gs.sel = i; audioController.playTone(640, 0.04, 'square', 0.04); return }
                const t = tileOf(px, py)
                if (!t) return
                const occ = cellItem(gs, t.r, t.c)
                if (occ && occ.id !== 'mail') { sellAt(gs, t.r, t.c); return }
                gs.cursor = t
                place(gs, t.r, t.c)
                return
            }
            const p = gs.people[gs.active]
            // tap a person to switch
            for (const q of gs.people) {
                if (Math.hypot(q.x - px, q.y - py) < 18) {
                    if (gs.people.indexOf(q) !== gs.active) {
                        gs.active = gs.people.indexOf(q)
                        audioController.playTone(760, 0.05, 'triangle', 0.04)
                        say(`${q.name.toUpperCase()} IS YOUR RESIDENT NOW`)
                    }
                    return
                }
            }
            const t = tileOf(px, py)
            if (!t) return
            const it = cellItem(gs, t.r, t.c)
            if (it) {
                if (it.id === 'mail') { if (cmdWork(gs, p)) return; say(p.workedToday ? 'NOT WORK TODAY — IT IS THE WEEKEND' : 'CLOCK IN DURING WORK HOURS'); return }
                if (cmdUse(gs, p, it)) { audioController.playTone(560, 0.04, 'triangle', 0.03); return }
                say('CANNOT REACH THAT')
                return
            }
            // an object whose use-spot was tapped?
            let near = null, bd = 1
            for (const o of gs.items) {
                for (const tg of targetsOf(gs, o)) {
                    const d = Math.hypot(tilePx(tg.c) - px, tilePy(tg.r) - py)
                    if (d < 22 && d < bd + 22) { bd = d; near = o }
                }
            }
            if (near && near.id !== 'mail' && cmdUse(gs, p, near)) { audioController.playTone(560, 0.04, 'triangle', 0.03); return }
            if (near && near.id === 'mail' && cmdWork(gs, p)) return
            if (walkable(gs, t.r, t.c)) cmdWalk(gs, p, t.r, t.c)
        }

        // one tick of player input
        const drivePad = (pad) => {
            if (!gs || gs.done) { prev.left = pad.left; prev.right = pad.right; prev.up = pad.up; prev.down = pad.down; prev.a = pad.a; prev.b = pad.b; prev.pdown = !!(pad.pointer && pad.pointer.down); return }
            const p = gs.people[gs.active]
            const dx = (pad.right || heldKeys.right ? 1 : 0) - (pad.left || heldKeys.left ? 1 : 0)
            const dy = (pad.down || heldKeys.down ? 1 : 0) - (pad.up || heldKeys.up ? 1 : 0)
            if ((dx || dy) && !gs.build) manualMove(gs, p, dx, dy, SIM_MS / 1000)
            if (gs.build && (dx || dy)) {
                gs.cursor = { r: Math.max(0, Math.min(12, gs.cursor.r + dy)), c: Math.max(0, Math.min(15, gs.cursor.c + dx)) }
            }
            if (pad.b && !prev.b) { gs.build = !gs.build; audioController.playSweep(gs.build ? 320 : 620, gs.build ? 620 : 320, 0.14, 'square', 0.05) }
            const pdown = !!(pad.pointer && pad.pointer.down)
            if (pdown && !prev.pdown) pointerPx(pad.pointer.x * W, pad.pointer.y * H)
            if (pad.a && !prev.a) {
                if (gs.build) {
                    if (cellItem(gs, gs.cursor.r, gs.cursor.c) && cellItem(gs, gs.cursor.r, gs.cursor.c).id !== 'mail') sellAt(gs, gs.cursor.r, gs.cursor.c)
                    else place(gs, gs.cursor.r, gs.cursor.c)
                } else if (!tryUse(gs, p)) {
                    say('NOTHING IN REACH — TAP SOMETHING')
                }
            }
            if (switchQueued) { gs.active = (gs.active + 1) % gs.people.length; switchQueued = false; audioController.playTone(720, 0.05, 'triangle', 0.04) }
            if (digitPick >= 0) { if (gs.build && digitPick < CATALOG.length) { gs.sel = digitPick; audioController.playTone(640, 0.04, 'square', 0.04) } digitPick = -1 }
            prev.left = pad.left; prev.right = pad.right; prev.up = pad.up; prev.down = pad.down; prev.a = pad.a; prev.b = pad.b; prev.pdown = pdown
        }

        // ------------------------------------------------------------- paint ----
        const paintScene = (g, live) => {
            ctx.clearRect(0, 0, W, H)
            const sx = shake ? (Math.random() - 0.5) * shake : 0
            const sy = shake ? (Math.random() - 0.5) * shake : 0
            ctx.save(); ctx.translate(sx, sy)
            drawGround(ctx)
            drawGate(ctx, g.sec)
            drawClouds(ctx, g.sec)
            for (const it of g.items) drawItem(ctx, it, g.sec)
            const order = [...g.people.map((p) => ({ p, v: p.y })), ...(g.visitor ? [{ p: g.visitor, v: g.visitor.y }] : [])].sort((a, b) => a.v - b.v)
            for (const o of order) drawPerson(ctx, o.p, g.sec, g.people[g.active] === o.p)
            if (live && g.build) drawBuildCursor(ctx, g, placeOk(g, g.cursor.r, g.cursor.c))
            stepParticlesDraw()
            ctx.restore()
            nightTint(ctx, g.hour)
            drawTopBar(ctx, g)
            drawPanel(ctx, g, g.sec)
            drawThoughts(ctx, g)
            if (g.build) drawCatalog(ctx, g)
            if (g.fastT > 0) {
                ctx.fillStyle = 'rgba(18,24,38,0.5)'
                ctx.fillRect(0, H / 2 - 26, W, 52)
                ctx.fillStyle = '#ffd24a'; ctx.font = 'bold 20px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
                ctx.fillText('· · · AT WORK · · ·', W / 2, H / 2)
            }
            if (toast > 0 && live) banner(ctx, toastMsg)
        }

        const stepParticlesDraw = () => {
            for (const pt of particles) {
                ctx.globalAlpha = Math.max(0, pt.life / pt.max)
                if (pt.kind === 'flash') {
                    ctx.fillStyle = pt.col
                    ctx.fillRect(pt.x, pt.y, pt.size * 1.6, pt.size * 1.6)
                } else {
                    ctx.fillStyle = pt.col
                    ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, 7); ctx.fill()
                }
            }
            ctx.globalAlpha = 1
        }

        const banner = (c, text, small = false) => {
            c.textAlign = 'center'; c.textBaseline = 'middle'
            const y = H / 2 - 90
            c.font = `bold ${small ? 14 : 20}px monospace`
            const w = c.measureText(text).width + 34
            c.fillStyle = 'rgba(28,36,54,0.88)'
            c.fillRect(W / 2 - w / 2, y - 14, w, 30)
            c.strokeStyle = '#ffd24a'; c.lineWidth = 1
            c.strokeRect(W / 2 - w / 2 + 0.5, y - 13.5, w - 1, 29)
            c.fillStyle = '#ffe9a8'; c.fillText(text, W / 2, y + 1)
        }

        const paintAttract = () => {
            if (!canvas) return
            paintScene(demoG, false)
        }

        // -------------------------------------------------------------- loop ----
        const stepParticles = () => {
            for (const pt of particles) { pt.x += pt.vx; pt.y += pt.vy; pt.vy += pt.kind === 'flash' ? 0.02 : 0.14; pt.life-- }
            particles = particles.filter((pt) => pt.life > 0)
            if (shake > 0) shake = Math.max(0, shake - 0.6)
            if (toast > 0) toast--
        }

        const frame = (ts) => {
            raf = requestAnimationFrame(frame)
            if (!last) last = ts
            const ft = Math.min(ts - last, 250)
            last = ts
            if (pausedRef.current) return
            acc += ft
            while (acc >= SIM_MS) {
                acc -= SIM_MS
                if (screenRef.current === 'attract') {
                    autoStep(demoG, SIM_MS / 1000)
                    handleEvents(demoG, false)
                    if (demoG.done) demoG = freshDemo()
                } else if (screenRef.current === 'play' && gs && !gs.done) {
                    if (!contractHoldsLoop()) {
                        drivePad({ left: heldKeys.left, right: heldKeys.right, up: heldKeys.up, down: heldKeys.down, a: actQueued, b: buildQueued })
                        actQueued = false; buildQueued = false
                        advance(gs, SIM_MS / 1000)
                        handleEvents(gs, true)
                        finish(gs)
                    }
                }
                stepParticles()
            }
            if (screenRef.current === 'attract') paintAttract()
            else if (gs) paintScene(gs, screenRef.current === 'play')
        }

        // ------------------------------------------------------------- start ----
        const freshDemo = () => { const d = newRun((Date.now() >>> 5) ^ 0x5eed); return d }

        const startPlay = (sd) => {
            if (sd !== undefined) seed = sd >>> 0
            gs = newRun(seed)
            particles = []; shake = 0; toast = 0
            prev.left = prev.right = prev.up = prev.down = prev.a = prev.b = prev.pdown = false
            actQueued = buildQueued = switchQueued = false; digitPick = -1
            setEndInfo(null)
            setSc('play')
            audioController.playSweep(262, 523, 0.24, 'square', 0.07)
        }

        // -------------------------------------------------------------- input ----
        const onDown = (e) => {
            const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (code === 'Question' || code === 'Escape' || code === 'Backquote') {
                if (screenRef.current === 'play') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current) }
                return
            }
            if (e.code === 'Tab') e.preventDefault()
            if (KEY_SET.has(e.code)) e.preventDefault()
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(); return }
            if (sc === 'over') {
                if (performance.now() - overAtRef.current < 900) return
                if (e.code === 'Enter' || e.code === 'KeyR') { seed = nextSeed(seed); startPlay() }
                else setSc('attract')
                return
            }
            if (pausedRef.current || sc !== 'play') return
            if (CUR.l.includes(e.code)) heldKeys.left = true
            if (CUR.r.includes(e.code)) heldKeys.right = true
            if (CUR.u.includes(e.code)) heldKeys.up = true
            if (CUR.d.includes(e.code)) heldKeys.down = true
            if (ACTION_KEYS.has(e.code)) actQueued = true
            if (BUILD_KEYS.has(e.code)) buildQueued = true
            if (SWITCH_KEYS.has(e.code)) switchQueued = true
            if (/^Digit[1-9]$/.test(e.code)) digitPick = parseInt(e.code.slice(5), 10) - 1
        }
        const onUp = (e) => {
            if (CUR.l.includes(e.code)) heldKeys.left = false
            if (CUR.r.includes(e.code)) heldKeys.right = false
            if (CUR.u.includes(e.code)) heldKeys.up = false
            if (CUR.d.includes(e.code)) heldKeys.down = false
        }
        const onPointer = (e) => {
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(); return }
            if (sc === 'over') {
                if (performance.now() - overAtRef.current < 900) return
                setSc('attract'); return
            }
            if (sc !== 'play' || pausedRef.current || !canvas || e.target !== canvas) return
            const r = canvas.getBoundingClientRect()
            if (!r.width) return
            pointerPx((e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H)
        }
        window.addEventListener('keydown', onDown)
        window.addEventListener('keyup', onUp)
        window.addEventListener('pointerdown', onPointer)

        const resize = () => {
            if (!canvas) return
            const r = wrap.getBoundingClientRect()
            if (!r.width || !r.height) return
            const s = Math.min((r.width - 8) / W, (r.height - 8) / H)
            canvas.style.width = `${Math.max(1, Math.floor(W * s))}px`
            canvas.style.height = `${Math.max(1, Math.floor(H * s))}px`
        }
        window.addEventListener('resize', resize)

        demoG = freshDemo()
        buildCanvas()
        raf = requestAnimationFrame(frame)

        // ------------------------------------------------------------ hooks ----
        function state() {
            return {
                tick: gs.tick, score: gs.content, done: gs.done || false, seed: gs.seed,
                money: gs.money, content: gs.content, day: gs.day, hour: Math.round(gs.hour * 10) / 10,
                items: gs.items.length, visitors: gs.visitor ? 1 : 0,
                hero: [Math.round(gs.people[gs.active].x), Math.round(gs.people[gs.active].y)], cursor: [gs.cursor.r, gs.cursor.c],
                needs: Object.fromEntries(gs.people.map((p) => [p.name, Object.fromEntries(NEEDS.map((n) => [n, Math.round(p.needs[n] * 100) / 100]))])),
                hash: stateHash(gs),
            }
        }

        if (import.meta.env.DEV) {
            window.__homebodyTest = {
                probe: () => gs ? ({
                    screen: screenRef.current, tick: gs.tick, done: gs.done, content: gs.content, money: gs.money,
                    day: gs.day, hour: Math.round(gs.hour * 10) / 10, build: gs.build, sel: gs.sel,
                    people: gs.people.map((p) => ({ name: p.name, needs: { ...p.needs }, working: p.working, fainted: p.faintT > 0 })),
                    items: gs.items.map((it) => ({ id: it.id, r: it.r, c: it.c })),
                    visitor: gs.visitor ? gs.visitor.name : null,
                }) : { screen: screenRef.current, seed },
                start: (sd) => startPlay(sd),
                tap: (px, py) => pointerPx(px, py),
                press: (code) => onDown({ code, preventDefault: () => {} }),
                win: () => { if (gs) { gs.content = WIN_CONTENT; gs.done = 'win'; gs.endMsg = 'forced' } },
                collapseAll: () => { if (gs) for (const p of gs.people) p.faintT = 2 },
                money: (v) => { if (gs) gs.money = v },
                select: (i) => { if (gs) gs.sel = i },
                hash: () => (gs ? stateHash(gs) : 0),
            }
            exposeGame({
                id: 'homebody',
                method: 'pointer',
                buttons: ['left', 'right', 'up', 'down', 'a', 'b'],
                reads: ['left', 'right', 'up', 'down', 'a', 'b', 'x', 'y', 'pointer'],
                reset: (sd) => { seed = (sd >>> 0) || 1; startPlay(seed); return state() },
                tick: (pad) => {
                    if (gs && !gs.done) {
                        drivePad(pad || {})
                        advance(gs, SIM_MS / 1000)
                        handleEvents(gs, false)
                        finish(gs)
                    }
                },
                state,
                canvas: () => canvas,
            })
            mountDbg({
                title: 'HOMEBODY',
                getState: () => gs ? [
                    `d${gs.day} ${gs.hour.toFixed(1)}h §${gs.money} wish ${gs.content}/${WIN_CONTENT} items=${gs.items.length} build=${gs.build}${gs.visitor ? ' Fern!' : ''}`,
                    gs.people.map((p) => `${p.name}:${NEEDS.map((n) => Math.round(p.needs[n] * 100)).join('/')}${p.working ? ' @work' : ''}${p.faintT > 0 ? ' FAINT' : ''}`).join('  '),
                ] : ['attract'],
                actions: [
                    { label: 'GIVE §500', run: () => { if (gs) gs.money += 500; return 'rent money' } },
                    { label: 'GRANT WISH', run: () => { if (gs) { gs.content = WIN_CONTENT } return 'wish banked — next content tick wins' } },
                    { label: 'RING FERN', run: () => { if (gs) { gs.visitAfter = Math.min(gs.visitAfter, Math.floor(gs.hour)); gs.visitGap = 0 } return 'the bell rings soon' } },
                    { label: 'NEW SEED', run: () => { seed = nextSeed(seed); startPlay(); return `reseeded ${seed}` } },
                ],
            })
        }

        return () => {
            if (import.meta.env.DEV) { if (window.__homebodyTest) delete window.__homebodyTest; unexposeGame(); unmountDbg() }
            window.removeEventListener('keydown', onDown)
            window.removeEventListener('keyup', onUp)
            window.removeEventListener('pointerdown', onPointer)
            window.removeEventListener('resize', resize)
            cancelAnimationFrame(raf)
            if (canvas) canvas.remove()
        }
    }, [])

    const handleResume = useCallback(() => { setPaused(false); pausedRef.current = false }, [])
    const play = screen === 'play'

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden select-none" style={{ touchAction: 'none' }}>
            <div ref={stageRef} className="absolute inset-0 flex items-center justify-center" />

            {screen === 'attract' && (
                <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/10 to-black/45 flex flex-col items-center justify-end pb-24 text-center px-6 pointer-events-none">
                    <h1 className="text-5xl font-black mb-2 tracking-wide" style={{ color: '#ffd24a', textShadow: '3px 3px 0 #2c5aa0, 0 8px 22px #000' }}>HOMEBODY</h1>
                    <p className="font-mono text-[11px] text-sky-100/70 mb-4 tracking-widest">A LITTLE SUBURBAN LIFE SIM</p>
                    <AttractMessage className="mb-4 text-amber-50/85" messages={MESSAGES} />
                    <p className="text-lg font-mono font-bold animate-pulse text-white">{PRESS}</p>
                </div>
            )}

            {screen === 'over' && endInfo && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-amber-50 font-mono px-6">
                    <h2 className={`text-4xl font-black mb-1 ${endInfo.end === 'win' ? 'text-yellow-300' : 'text-red-400'}`} style={{ textShadow: '2px 2px 0 #000' }}>
                        {endInfo.end === 'win' ? 'LIFETIME WISH GRANTED' : 'THE HOUSEHOLD FELL APART'}
                    </h2>
                    <p className="text-base mb-1">{endInfo.end === 'win' ? 'A happy, humming little home — yours.' : endInfo.why}</p>
                    <p className="text-sm text-amber-200/80 mb-4">day {endInfo.day} · content {endInfo.content} · §{endInfo.money}</p>
                    <p className="text-sm text-amber-100/80 mb-4">R moves into a new lot · any other key returns to the marquee</p>
                    <p className="animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find((g) => g.label === 'HOMEBODY')} onResume={handleResume} />}
            <VirtualControls visible={play && !paused} secondAction={{ label: '⚒', code: 'KeyB' }} />
        </div>
    )
}

export default HomebodyGame
