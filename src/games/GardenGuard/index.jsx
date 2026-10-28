// GARDEN GUARD — the arcade shell over ./sim.js (rules) and ./art.js (look).
//
// An original lane-defense game in the lineage of Plants vs. Zombies (PC, 2009):
// bank acorns, tap a card then a tile to plant defenders, hold five lanes against
// goblin waves that build to a big final wave; clearing a level unlocks a new
// defender. Pointer/touch first (tap a card, tap a tile), with a d-pad + A/B and
// keyboard as equivalent paths — all three funnel through the same sim actions.
//
// One useEffect owns the fixed-timestep loop. The contract (docs/GAME-SHELL.md)
// hands the clock to a driver while it holds it; the attract autopilot reuses the
// sim's own bot, so the demo can never show a play the harness couldn't replay.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import AttractMessage from '../../components/AttractMessage'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop } from '../../utils/gameContract'
import {
    FIXED_DT, W, H, ROWS, TRAY_H, GLY, rowY, colX, HOUSE_X,
    tileOf, PLANTS,
    newRun, advance, autoStep, moveCursor, selectCard, cycleCard, toggleTrowel, actAt, bankTap,
    waveProgress, bigWaveUp, stateHash, bot,
} from './sim.js'
import {
    drawBackground, drawCottage, drawLawn, drawTray, drawPlant, drawEnemy, drawProj,
    drawAcornDrop, drawAcornIcon, drawMower, drawCursor, drawHud,
} from './art.js'

const SIM_MS = FIXED_DT
const MESSAGES = [
    'Goblins raid the orchard at dusk — line the five lanes.',
    'Tap a card, then a tile to plant. Tap falling acorns (or wait — they bank).',
    'Daisies make acorns, Squirrels shoot, Hedgerows stall, Chili bombs pop clusters.',
    'Each cleared level unlocks a new defender; the Warlord comes last.',
]
const PRESS = 'TAP / PRESS ANY KEY TO PLANT'

const CUR = { l: ['ArrowLeft', 'KeyA'], r: ['ArrowRight', 'KeyD'], u: ['ArrowUp', 'KeyW'], d: ['ArrowDown', 'KeyS'] }
const MOVE_KEYS = new Set([...CUR.l, ...CUR.r, ...CUR.u, ...CUR.d])
const ACTION_KEYS = new Set(['Space', 'Enter', 'NumpadEnter'])
const CYCLE_KEYS = new Set(['KeyB', 'ShiftLeft', 'ShiftRight', 'Tab'])
const TROWEL_KEYS = new Set(['KeyT', 'KeyE'])
const KEY_SET = new Set([...MOVE_KEYS, ...ACTION_KEYS, ...CYCLE_KEYS, ...TROWEL_KEYS, ...'123456'])

const CARD_W = 64, CARD_GAP = 8, CARD_X0 = 178
const nextSeed = (s) => (Math.imul(s, 1664525) + 1013904223) >>> 0

const GardenGuardGame = () => {
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
        let actQueued = false, cycleQueued = false, trowelQueued = false
        let digitPick = -1
        const say = (m) => { toastMsg = m; toast = 110 }

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

        // --------------------------------------------------------- juice ----
        const burst = (x, y, n, col, spd = 3, kind = 'dot') => {
            for (let i = 0; i < n; i++) {
                const a = Math.random() * 6.28, s = spd * (0.4 + Math.random())
                particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 24 + Math.random() * 16, max: 40, col, size: 2 + Math.random() * 3, kind })
            }
        }

        const handleEvents = (s, live) => {
            while (s.events.length) {
                const e = s.events.shift()
                switch (e.t) {
                    case 'plant': audioController.playSweep(240, 540, 0.12, 'square', 0.05); if (live) burst(colX(e.c), rowY(e.r) + 16, 6, '#6b4a2a', 2.4, 'soil'); break
                    case 'dig': audioController.playSweep(420, 170, 0.12, 'square', 0.05); if (live && e.r != null) burst(colX(e.c), rowY(e.r) + 16, 10, '#6b4a2a', 3, 'soil'); break
                    case 'make': audioController.playTone(720, 0.05, 'triangle', 0.04); break
                    case 'sky': audioController.playTone(600, 0.05, 'triangle', 0.035); break
                    case 'bank': audioController.playSweep(680, 900, 0.08, 'triangle', 0.05); if (live && e.x != null) particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 26, max: 26, col: '#c98a4b', size: 6, kind: 'fly', tx: 127, ty: 40 }); break
                    case 'shoot': audioController.playTone(540, 0.04, 'square', 0.035); audioController.playTone(810, 0.03, 'triangle', 0.02); if (live) burst(e.x, e.y, 4, '#ffe6a8', 2.2, 'flash'); break
                    case 'hit': audioController.playTone(300, 0.03, 'square', 0.025); if (live) burst(e.x, e.y, 3, '#d8b98c', 2); break
                    case 'frostshot': audioController.playSweep(760, 1050, 0.08, 'triangle', 0.04); if (live) burst(e.x, e.y, 4, '#bff0ff', 2, 'flash'); break
                    case 'frosthit': audioController.playTone(980, 0.05, 'triangle', 0.035); if (live) burst(e.x, e.y, 6, '#bff0ff', 2.4); break
                    case 'lob': audioController.playSweep(200, 360, 0.14, 'triangle', 0.05); if (live) burst(e.x, e.y, 3, '#e0a24b', 2, 'flash'); break
                    case 'splat': audioController.playNoise(0.12, 0.06); if (live) burst(e.x, e.y, 10, '#e0822b', 3); break
                    case 'boom': audioController.playNoise(0.42, 0.16); shake = 10; if (live) burst(e.x, e.y, 26, '#ff8a3a', 5); break
                    case 'mow': audioController.playNoise(0.5, 0.14); audioController.playSweep(160, 120, 0.4, 'sawtooth', 0.08); shake = 8; if (live) burst(HOUSE_X + 130, rowY(e.r), 14, '#c9c9d2', 4); break
                    case 'breach': audioController.playSweep(320, 80, 0.5, 'sawtooth', 0.12); shake = 12; if (live) burst(HOUSE_X + 10, rowY(e.r), 22, '#e23b2e', 4); break
                    case 'wave': audioController.playSweep(300, 520, 0.22, 'square', 0.06); if (live) say(`WAVE ${e.n}`); break
                    case 'bigwave': audioController.playSweep(220, 120, 0.5, 'sawtooth', 0.1); audioController.playNoise(0.5, 0.12); shake = 14; if (live) say('THE FINAL WAVE'); break
                    case 'level': if (live && e.level > 1) say(`LEVEL ${e.level} — the raid deepens`); break
                    case 'clear': {
                        audioController.playSweep(440, 940, 0.5, 'square', 0.08)
                        if (live) {
                            const nid = e.next != null ? Object.keys(PLANTS).find((k) => PLANTS[k].unlock === e.next) : null
                            if (nid) {
                                say(`NEW DEFENDER: ${PLANTS[nid].name.toUpperCase()}`)
                                audioController.playSweep(520, 1180, 0.4, 'triangle', 0.07)
                                burst(127, 40, 16, '#fff3cf', 4, 'flash')
                            } else say('LANE HELD!')
                        }
                        break
                    }
                    case 'kill': {
                        const gruntBase = { grunt: 220, sprinter: 300, pup: 360, brute: 120, warlord: 90 }[e.id] || 240
                        audioController.playSweep(gruntBase, gruntBase * 0.5, 0.16, 'sawtooth', 0.05)
                        if (live) burst(e.x, e.y, 9, '#8fce5a', 3)
                        break
                    }
                    default: break
                }
            }
        }

        const finish = (s) => {
            if (s.done !== 'win' && s.done !== 'lose') return
            overAtRef.current = performance.now()
            setEndInfo({ end: s.done, why: s.endMsg, score: s.score, level: s.level })
            setSc('over')
        }

        // --------------------------------------------------- pointer/tap ----
        const findAcorn = (px, py) => {
            let best = null, bd = 34
            for (const d of gs.acornDrops) { const dd = Math.hypot(d.x - px, d.y - py); if (dd < bd) { bd = dd; best = d } }
            return best
        }
        const pointerPx = (px, py) => {
            if (!gs || gs.done || screenRef.current !== 'play' || pausedRef.current) return
            if (py < TRAY_H) {
                // card tray: pick a card / trowel
                if (px >= CARD_X0) {
                    const idx = Math.floor((px - CARD_X0) / (CARD_W + CARD_GAP))
                    const within = (px - CARD_X0) % (CARD_W + CARD_GAP)
                    if (within <= CARD_W) {
                        if (idx < gs.unlocked.length) selectCard(gs, idx)
                        else if (idx === gs.unlocked.length) toggleTrowel(gs)
                        audioController.playTone(660, 0.04, 'square', 0.04)
                    }
                }
                return
            }
            const ac = findAcorn(px, py)
            if (ac) { bankTap(gs, ac); audioController.playSweep(680, 980, 0.08, 'triangle', 0.05); return }
            const t = tileOf(px, py)
            if (t) actAt(gs, t.r, t.c)
        }

        // one tick of player input: pad edges + queued taps -> sim actions.
        const drivePad = (pad) => {
            if (!gs || gs.done) { prev.left = pad.left; prev.right = pad.right; prev.up = pad.up; prev.down = pad.down; prev.a = pad.a; prev.b = pad.b; prev.pdown = !!(pad.pointer && pad.pointer.down); return }
            if (pad.left && !prev.left) moveCursor(gs, 0, -1)
            if (pad.right && !prev.right) moveCursor(gs, 0, 1)
            if (pad.up && !prev.up) moveCursor(gs, -1, 0)
            if (pad.down && !prev.down) moveCursor(gs, 1, 0)
            if (pad.b && !prev.b) { cycleCard(gs, 1); audioController.playTone(500, 0.03, 'square', 0.03) }
            const pdown = !!(pad.pointer && pad.pointer.down)
            if (pdown && !prev.pdown) pointerPx(pad.pointer.x * W, pad.pointer.y * H)
            if (pad.a && !prev.a) actAt(gs, gs.cursor.r, gs.cursor.c)
            if (digitPick >= 0) { selectCard(gs, digitPick); digitPick = -1; audioController.playTone(620, 0.04, 'square', 0.04) }
            if (trowelQueued) { toggleTrowel(gs); trowelQueued = false }
            prev.left = pad.left; prev.right = pad.right; prev.up = pad.up; prev.down = pad.down; prev.a = pad.a; prev.b = pad.b; prev.pdown = pdown
        }

        // --------------------------------------------------------- paint ----
        const paintScene = (g, live) => {
            ctx.clearRect(0, 0, W, H)
            const sx = shake ? (Math.random() - 0.5) * shake : 0
            const sy = shake ? (Math.random() - 0.5) * shake : 0
            ctx.save(); ctx.translate(sx, sy)
            drawBackground(ctx, g.sec)
            drawLawn(ctx, g)
            drawCottage(ctx)
            for (let r = 0; r < ROWS; r++) drawMower(ctx, r, g.mowerRun[r])
            const t = g.sec
            // plants back-to-front by row
            const sorted = [...g.plants].sort((a, b) => a.r - b.r)
            for (const p of sorted) drawPlant(ctx, p, t)
            // acorn drops behind enemies
            for (const d of g.acornDrops) drawAcornDrop(ctx, d, t)
            // enemies front-most
            const es = [...g.enemies].sort((a, b) => a.x - b.x)
            for (const e of es) drawEnemy(ctx, e, t)
            for (const pr of g.projs) drawProj(ctx, pr)
            // particles
            for (const p of particles) {
                ctx.globalAlpha = Math.max(0, p.life / p.max)
                if (p.kind === 'fly') { drawAcornIcon(ctx, p.x, p.y, p.size * 2.2); continue }
                ctx.fillStyle = p.col
                ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill()
            }
            ctx.globalAlpha = 1
            if (live && !g.done) drawCursor(ctx, g)
            ctx.restore()
            if (!g.done && bigWaveUp(g)) { const a = 0.1 + Math.sin(g.sec * 6) * 0.05; ctx.fillStyle = `rgba(180,28,18,${a.toFixed(3)})`; ctx.fillRect(0, 0, W, H) }
            drawTray(ctx, g, null)
            drawHud(ctx, g, bigWaveUp(g))
            // banners
            if (g.levelClearAt > 0 && !g.done) banner(ctx, g.level >= 4 ? 'ORCHARD HELD!' : 'LANE HELD — new defender next level', '#fff3cf')
            else if (bigWaveUp(g)) banner(ctx, 'THE FINAL WAVE', '#ffd2c4')
            if (toast > 0 && live) banner(ctx, toastMsg, 'rgba(255,243,214,0.92)', true)
        }

        const banner = (c, text, col, small = false) => {
            c.textAlign = 'center'; c.textBaseline = 'middle'
            const y = GLY + 40
            c.font = `bold ${small ? 16 : 26}px system-ui, sans-serif`
            const w = c.measureText(text).width + 36
            c.fillStyle = 'rgba(40,24,12,0.72)'; c.beginPath()
            c.moveTo(W / 2 - w / 2, y); c.lineTo(W / 2 + w / 2, y); c.lineTo(W / 2 + w / 2 - 12, y + (small ? 26 : 36)); c.lineTo(W / 2 - w / 2 + 12, y + (small ? 26 : 36)); c.closePath(); c.fill()
            c.fillStyle = col; c.fillText(text, W / 2, y + (small ? 13 : 18))
        }

        const paintAttract = () => {
            if (!canvas) return
            ctx.clearRect(0, 0, W, H)
            drawBackground(ctx, Date.now() / 1000)
            drawLawn(ctx, demoG)
            drawCottage(ctx)
            for (let r = 0; r < ROWS; r++) drawMower(ctx, r, 0)
            for (const p of demoG.plants) drawPlant(ctx, p, demoG.sec)
            for (const e of [...demoG.enemies].sort((a, b) => a.x - b.x)) drawEnemy(ctx, e, demoG.sec)
            for (const pr of demoG.projs) drawProj(ctx, pr)
            for (const d of demoG.acornDrops) drawAcornDrop(ctx, d, demoG.sec)
            drawTray(ctx, demoG, null)
            drawHud(ctx, demoG, bigWaveUp(demoG))
        }

        // ------------------------------------------------------------ loop ----
        const stepParticles = () => {
            for (const p of particles) {
                if (p.kind === 'fly') {
                    p.x += (p.tx - p.x) * 0.22; p.y += (p.ty - p.y) * 0.22 - 0.6
                    p.size = Math.max(2, 6 * (p.life / p.max))
                } else {
                    p.x += p.vx; p.y += p.vy
                    p.vy += p.kind === 'flash' ? 0.02 : p.kind === 'soil' ? 0.34 : 0.12
                }
                p.life--
            }
            particles = particles.filter((p) => p.life > 0)
            if (shake > 0) shake = Math.max(0, shake - 0.6)
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
                    if (demoG.done) demoG = newRun((Date.now() >>> 5) ^ 0xbeef)
                } else if (screenRef.current === 'play' && gs && !gs.done) {
                    if (!contractHoldsLoop()) {
                        const pad = { left: heldKeys.left, right: heldKeys.right, up: heldKeys.up, down: heldKeys.down, a: actQueued, b: cycleQueued }
                        drivePad(pad)
                        actQueued = false; cycleQueued = false
                        advance(gs, SIM_MS / 1000)
                        handleEvents(gs, true)
                        finish(gs)
                    }
                }
                if (toast > 0) toast--
                stepParticles()
            }
            if (screenRef.current === 'attract') paintAttract()
            else if (gs) paintScene(gs, screenRef.current === 'play')
        }

        // ---------------------------------------------------------- start ----
        const startPlay = (sd) => {
            if (sd !== undefined) seed = sd >>> 0
            gs = newRun(seed)
            particles = []; shake = 0; toast = 0
            prev.left = prev.right = prev.up = prev.down = prev.a = prev.b = prev.pdown = false
            actQueued = cycleQueued = trowelQueued = false; digitPick = -1
            setEndInfo(null)
            setSc('play')
            audioController.playSweep(260, 620, 0.28, 'square', 0.07)
        }

        // --------------------------------------------------------- input ----
        const onDown = (e) => {
            const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (code === 'Question' || code === 'Escape' || code === 'Backquote') {
                if (screenRef.current === 'play') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current) }
                return
            }
            if (KEY_SET.has(e.code)) e.preventDefault()
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(); return }
            if (sc === 'over') {
                if (performance.now() - overAtRef.current < 800) return
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
            if (CYCLE_KEYS.has(e.code)) cycleQueued = true
            if (TROWEL_KEYS.has(e.code)) trowelQueued = true
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
                if (performance.now() - overAtRef.current < 800) return
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

        demoG = newRun((Date.now() >>> 5) ^ 0x5eed)
        buildCanvas()
        raf = requestAnimationFrame(frame)

        // ---------------------------------------------------- DEV hooks ----
        if (import.meta.env.DEV) {
            window.__gardenTest = {
                probe: () => gs ? ({
                    screen: screenRef.current, tick: gs.tick, level: gs.level, score: gs.score, acorns: gs.acorns,
                    plants: gs.plants.length, enemies: gs.enemies.length, spawned: gs.spawned, total: gs.totalSpawns,
                    mowers: gs.mowers.filter(Boolean).length, done: gs.done, unlocked: gs.unlocked.length,
                    cursor: { ...gs.cursor }, sel: gs.sel, trowel: gs.trowel,
                }) : { screen: screenRef.current, seed },
                start: (sd) => startPlay(sd),
                tap: (px, py) => pointerPx(px, py),
                win: () => { if (gs) { for (const e of gs.enemies) e.hp = 0; for (const w of gs.waves) { w.started = true; w.i = w.entries.length } gs.waveIdx = gs.waves.length; gs.enemies.length = 0 } },
                bot: () => { if (gs) bot(gs) },
                hash: () => (gs ? stateHash(gs) : 0),
            }
            exposeGame({
                id: 'garden-guard',
                method: 'pointer',
                buttons: ['left', 'right', 'up', 'down', 'a', 'b'],
                reads: ['left', 'right', 'up', 'down', 'a', 'b', 'pointer'],
                reset: (sd) => { seed = (sd >>> 0) || 1; startPlay(seed); return state() },
                tick: (pad) => { if (gs && !gs.done) { drivePad(pad || {}); advance(gs, SIM_MS / 1000); handleEvents(gs, false); finish(gs) } },
                state,
                canvas: () => canvas,
                snapshot: () => JSON.parse(JSON.stringify(gs)),
                restore: (s) => { gs = JSON.parse(JSON.stringify(s)) },
            })
            mountDbg({
                title: 'GARDEN GUARD',
                getState: () => gs ? [
                    `L${gs.level} seed ${gs.seed} acorns=${gs.acorns} plants=${gs.plants.length} enemies=${gs.enemies.length} wave=${gs.waveIdx}/${gs.waves.length} mowers=${gs.mowers.filter(Boolean).length}`,
                    `score=${gs.score} tick=${gs.tick} done=${gs.done || '-'} sel=${gs.trowel ? 'trowel' : gs.unlocked[gs.sel] || '-'}`,
                ] : ['attract'],
                actions: [
                    { label: 'CLEAR WAVES', run: () => { window.__gardenTest.win(); return 'waves neutralised — level will clear' } },
                    { label: 'GOD DEFENSE', run: () => { if (!gs) return 'no game'; gs.acorns = 9999; for (const k of Object.keys(gs.cd)) gs.cd[k] = 0; for (let r = 0; r < ROWS; r++) { selectCard(gs, gs.unlocked.indexOf('squirrel')); actAt(gs, r, 4) } return 'squirrels on every lane' } },
                    { label: 'NEW SEED', run: () => { seed = nextSeed(seed); startPlay(); return `reseeded ${seed}` } },
                ],
            })
        }

        function state() {
            return {
                tick: gs.tick, score: gs.score, done: gs.done || false, seed: gs.seed,
                level: gs.level, acorns: gs.acorns, plants: gs.plants.length, enemies: gs.enemies.length,
                spawned: gs.spawned, total: gs.totalSpawns, mowers: gs.mowers.filter(Boolean).length,
                waveProgress: waveProgress(gs), big: bigWaveUp(gs), cursor: [gs.cursor.r, gs.cursor.c], hash: stateHash(gs),
            }
        }

        return () => {
            if (import.meta.env.DEV) { if (window.__gardenTest) delete window.__gardenTest; unexposeGame(); unmountDbg() }
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
                    <h1 className="text-5xl font-black mb-2 tracking-wide" style={{ color: '#ffd24a', textShadow: '3px 3px 0 #7a2c22, 0 8px 22px #000' }}>GARDEN GUARD</h1>
                    <p className="font-mono text-[11px] text-amber-100/70 mb-4 tracking-widest">AUTUMN ORCHARD · LANE DEFENSE</p>
                    <AttractMessage className="mb-4 text-amber-50/85" messages={MESSAGES} />
                    <p className="text-lg font-mono font-bold animate-pulse text-white">{PRESS}</p>
                </div>
            )}

            {screen === 'over' && endInfo && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-amber-50 font-mono px-6">
                    <h2 className={`text-4xl font-black mb-1 ${endInfo.end === 'win' ? 'text-yellow-300' : 'text-red-400'}`} style={{ textShadow: '2px 2px 0 #000' }}>
                        {endInfo.end === 'win' ? 'ORCHARD HELD' : 'THE GATE FELL'}
                    </h2>
                    <p className="text-base mb-1">{endInfo.end === 'win' ? 'Every goblin routed, five levels deep.' : endInfo.why}</p>
                    <p className="text-sm text-amber-200/80 mb-4">reached level {endInfo.level} · score {endInfo.score}</p>
                    <p className="text-sm text-amber-100/80 mb-4">R runs it back on a new raid · any other key returns to the marquee</p>
                    <p className="animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find((g) => g.label === 'GARDEN GUARD')} onResume={handleResume} />}
            <VirtualControls visible={play && !paused} secondAction={{ label: '↻', code: 'KeyB' }} />
        </div>
    )
}

export default GardenGuardGame
