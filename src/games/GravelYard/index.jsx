// GRAVEL YARD — original co-op heavy-metal sandbox (#1253). A gravel pile, a
// shaker screen and a customer gate: three machines, three seats, and the
// information cut three ways — the DIGGER sees the wet seams in the pile, the
// SCREEN wears the grade chart, the TRUCK owns the order board. Nobody alone
// knows the whole job, so the crew SHOUTS on the radio. Any seat can be you:
// seat 1 digger, seat 2 truck (optionally WASD + F/G on a second set of hands),
// seat 3 the screen operator; unfilled seats run CPU emitters that emit only
// pads (#494), ready for a model seat later. Rules live in ./engine.js (pure);
// look lives in ./art.js.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop, recordLiveTick } from '../../utils/gameContract'
import { normalizePad } from '../../utils/onePad'
import {
    createGame, stepGame, simState, drainFx, makeCpuEmitter, simulate,
    GRID_W, GRID_H, SHIFT_TICKS, QUOTA, MAX_STRIKES, BAY_CAP, cellKind,
    HOPPER_FRONT, CONSOLE_FRONT, HOPPER_STAND, CONSOLE_STAND, BAY, BAY_LOAD,
    DOCK_SPOTS, digSwingFrame, tipSeqFrame, TIP_TICKS,
} from './engine.js'
import { sprites, TILE, CANVAS_W, CANVAS_H, WORLD_X, WORLD_Y } from './art.js'
import { playFx } from './audio.js'

const FIXED_DT = 1000 / 60
const SEAT_KEYS_HUMAN2 = { KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right' }
const ATTRACT_MSGS = [
    'ONE SEES THE PILE. ONE THE CHART. ONE THE ORDERS.',
    'DIG. SHAKE. HAUL. SHOUT.',
    'WET GRAVEL JAMS THE SCREEN - JOG IT',
    'GATE WIDE = COARSE. GATE NARROW = FINES',
    'WRONG GRADE AT THE GATE = STRIKE',
    'ANY SEAT: HUMAN, CPU OR MODEL',
]
const GRADE_COLOR = { coarse: '#b09878', fines: '#e0c898' }
const PAL_DECK_A = '#a08658' // deck stones, two gravel tints (#1390)
const PAL_DECK_B = '#d8bc84'

export default function GravelYard() {
    const canvasRef = useRef(null)
    const [paused, setPaused] = useState(false)
    const pausedRef = useRef(false)
    pausedRef.current = paused
    const [uiScreen, setUiScreen] = useState('attract')
    const screenRef = useRef('attract') // attract | select | play | over
    const gsRef = useRef(null)
    const attractRef = useRef(null)
    const emittersRef = useRef([])
    const attractEmittersRef = useRef([])
    const seatsRef = useRef(1)
    const partnerHumanRef = useRef(false)
    const selectRef = useRef(1)
    const keys1Ref = useRef({})
    const keys2Ref = useRef({})
    const hudRef = useRef({ toast: '', toastT: 0, radio: null, radioT: 0, shake: 0, flash: 0, popT: 0, popCents: 0, boardShake: 0, stampT: 0, jamFlash: 0, tipT: 0, puffs: [], plumes: [] })
    const overAtRef = useRef(0)
    const seedRef = useRef(1)
    const modelSeatRef = useRef(null)

    const setScreen = (s) => { screenRef.current = s; setUiScreen(s) }
    const freshEmitters = () => [makeCpuEmitter(0), makeCpuEmitter(1), makeCpuEmitter(2)]
    const human2Active = () => partnerHumanRef.current && seatsRef.current >= 2

    const startPlay = useCallback((seed, players, partnerHuman) => {
        seatsRef.current = Math.max(1, Math.min(3, players | 0 || 1))
        partnerHumanRef.current = !!partnerHuman
        seedRef.current = seed
        gsRef.current = createGame(seed, seatsRef.current)
        emittersRef.current = freshEmitters()
        setScreen('play')
        specRef.current.players = seatsRef.current
        playFx({ k: 'start' })
    }, [])

    const startAttract = useCallback(() => {
        const a = createGame(1000 + Math.floor(Math.random() * 9999), 3)
        const ems = freshEmitters()
        // #1390: seed the attract sim near a pay-off — run it to the first
        // dump/tip/batch-end (then a beat more) so the marquee opens mid-chain
        // instead of standing empty. Capped so boot never lags.
        let payoff = false
        for (let i = 0; i < 4000 && !a.done; i++) {
            stepGame(a, ems.map((em) => em({ gs: a, tick: a.tick })))
            const fx = drainFx(a)
            if (!payoff && fx.some((f) => f.k === 'dump' || f.k === 'tip' || f.k === 'batchEnd')) payoff = true
            if (payoff && a.tick >= 1200) break
        }
        attractRef.current = a
        attractEmittersRef.current = ems
        setScreen('attract')
    }, [])

    const specRef = useRef(null)
    const pumpHudRef = useRef(null)
    if (!specRef.current) {
        specRef.current = {
            id: 'gravel-yard',
            method: 'dpad',
            players: 1,
            buttons: ['a', 'b'],
            reads: ['up', 'down', 'left', 'right', 'a', 'b'],
            sources: () => {
                const out = []
                for (let i = 0; i < seatsRef.current; i++) {
                    if (modelSeatRef.current === i) out.push({ kind: 'model' })
                    else if (i === 0) out.push({ kind: 'human' })
                    else out.push(i === 1 && human2Active() ? { kind: 'human' } : { kind: 'cpu' })
                }
                return out
            },
            reset: (seed, players) => startPlay(seed >>> 0 || 1, Math.max(1, Math.min(3, players | 0 || 1)), false),
            tick: (pad, pads) => {
                const g = gsRef.current
                if (!g || g.done) return
                const merged = seatPads(g, pads && pads.length ? pads : [pad])
                stepGame(g, merged)
                const fx = drainFx(g)
                for (const f of fx) { playFx(f); if (pumpHudRef.current) pumpHudRef.current(f) }
                if (g.done && screenRef.current === 'play') { screenRef.current = 'over'; setUiScreen('over'); overAtRef.current = performance.now(); if (g.win) hudRef.current.stampT = 50 }
            },
            state: () => {
                const g = gsRef.current || createGame(1, 1)
                return { ...simState(g), players: seatsRef.current }
            },
            canvas: () => canvasRef.current,
        }
    }

    // which seats take which pad stream: humans read keys; every unfilled seat
    // (and any seat above the crew count) runs its CPU emitter
    const seatPads = (g, pads) => {
        const out = [{}, {}, {}]
        for (let i = 0; i < 3; i++) {
            if (i === 0) out[i] = pads[0] || {}
            else if (i === 1 && human2Active()) out[i] = pads[1] || pads[0] || {}
            else if (modelSeatRef.current === i) out[i] = (pads && pads[i]) || {}
            else out[i] = emittersRef.current[i] ? emittersRef.current[i]({ gs: g, tick: g.tick }) : {}
        }
        return out
    }

    useEffect(() => {
        const cvs = canvasRef.current
        if (!cvs) return undefined
        cvs.width = CANVAS_W; cvs.height = CANVAS_H
        startAttract()
        if (import.meta.env.DEV) exposeGame(specRef.current)

        pumpHudRef.current = (f) => {
            const hud = hudRef.current
            if (f.k === 'toast') { hud.toast = f.msg; hud.toastT = 110 }
            if (f.k === 'radio') { hud.radio = { who: f.who, text: f.text }; hud.radioT = 170 }
            if (f.k === 'orderDone') { hud.popT = 26; hud.popCents = f.cents || 0 }
            if (f.k === 'jam') { hud.shake = 26; hud.jamFlash = 30 }
            if (f.k === 'spill' || f.k === 'refuse') hud.shake = 16
            if (f.k === 'refuse') hud.boardShake = 22 // the order board rattles on a strike
            if (f.k === 'ruined') hud.shake = 40
            // #1390 mid-game juice: dust at the bite, bed-tip cycle, chute plumes
            if (f.k === 'digStart') hud.puffs.push({ x: f.x, y: f.y, t: 22 })
            if (f.k === 'tip') hud.tipT = TIP_TICKS
            if (f.k === 'batchEnd') hud.plumes.push({ c: f.c, f: f.f, t: 28 })
            if (hud.puffs.length > 8) hud.puffs.splice(0, hud.puffs.length - 8)
            if (hud.plumes.length > 2) hud.plumes.splice(0, hud.plumes.length - 2)
        }

        const keys1 = keys1Ref.current
        const keys2 = keys2Ref.current
        const clearKeys = () => { for (const k of Object.keys(keys1)) keys1[k] = false; for (const k of Object.keys(keys2)) keys2[k] = false }

        const MIN_MS = 100
        const pressMin = (keys, field) => {
            keys[field] = true
            keys[field + '_at'] = performance.now()
            if (keys[field + '_t']) clearTimeout(keys[field + '_t'])
            keys[field + '_t'] = setTimeout(() => { keys[field] = false }, MIN_MS)
        }
        const releaseMin = (keys, field) => {
            const held = performance.now() - (keys[field + '_at'] || 0)
            if (keys[field + '_t']) clearTimeout(keys[field + '_t'])
            if (held >= MIN_MS) keys[field] = false
            else keys[field + '_t'] = setTimeout(() => { keys[field] = false }, MIN_MS - held)
        }

        const onKeyDown = (ev) => {
            if (ev.code === 'Escape' || ev.code === 'Backquote') { ev.preventDefault(); setPaused((p) => !p); return }
            if (pausedRef.current) return
            const sc = screenRef.current
            if (sc === 'attract') { selectRef.current = 1; setScreen('select'); playFx({ k: 'ui' }); return }
            if (sc === 'select') {
                if (ev.code === 'ArrowLeft') selectRef.current = Math.max(1, selectRef.current - 1)
                if (ev.code === 'ArrowRight') selectRef.current = Math.min(3, selectRef.current + 1)
                if (ev.code === 'KeyP') partnerHumanRef.current = !partnerHumanRef.current
                if (ev.code === 'Space' || ev.code === 'Enter' || ev.code === 'Digit1') {
                    startPlay(seedRef.current, selectRef.current, partnerHumanRef.current)
                }
                return
            }
            if (sc === 'over') {
                if (performance.now() - overAtRef.current > 900 && (ev.code === 'Space' || ev.code === 'Enter')) {
                    seedRef.current = (seedRef.current + 1) >>> 0
                    setScreen('select')
                }
                return
            }
            if (ev.code === 'ArrowUp') keys1.up = true
            if (ev.code === 'ArrowDown') keys1.down = true
            if (ev.code === 'ArrowLeft') keys1.left = true
            if (ev.code === 'ArrowRight') keys1.right = true
            if (ev.code === 'Space') pressMin(keys1, 'a')
            if (ev.code === 'KeyB') pressMin(keys1, 'b')
            const k2 = SEAT_KEYS_HUMAN2[ev.code]
            if (k2 && human2Active()) keys2[k2] = true
            if (ev.code === 'KeyF' && human2Active()) pressMin(keys2, 'a')
            if (ev.code === 'KeyG' && human2Active()) pressMin(keys2, 'b')
        }
        const onKeyUp = (ev) => {
            if (ev.code === 'ArrowUp') keys1.up = false
            if (ev.code === 'ArrowDown') keys1.down = false
            if (ev.code === 'ArrowLeft') keys1.left = false
            if (ev.code === 'ArrowRight') keys1.right = false
            if (ev.code === 'Space') releaseMin(keys1, 'a')
            if (ev.code === 'KeyB') releaseMin(keys1, 'b')
            const k2 = SEAT_KEYS_HUMAN2[ev.code]
            if (k2) keys2[k2] = false
            if (ev.code === 'KeyF') releaseMin(keys2, 'a')
            if (ev.code === 'KeyG') releaseMin(keys2, 'b')
        }
        const onPointer = () => {
            const sc = screenRef.current
            if (sc === 'attract') { selectRef.current = 1; setScreen('select') }
            else if (sc === 'over' && performance.now() - overAtRef.current > 900) { seedRef.current = (seedRef.current + 1) >>> 0; setScreen('select') }
        }
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)
        cvs.addEventListener('pointerdown', onPointer)

        // ---------- the loop ----------
        let raf = 0
        let last = performance.now()
        let acc = 0
        let tickN = 0

        const humanPad = (keys) => normalizePad({
            up: !!keys.up, down: !!keys.down, left: !!keys.left, right: !!keys.right,
            a: !!keys.a, b: !!keys.b,
        }, 'dpad')

        const liveTick = () => {
            const g = gsRef.current
            if (!g || g.done) return
            const pads = [{}, {}, {}]
            pads[0] = humanPad(keys1)
            if (human2Active()) pads[1] = humanPad(keys2)
            for (let i = 0; i < 3; i++) {
                if (i !== 0 && !(i === 1 && human2Active()) && modelSeatRef.current !== i) pads[i] = emittersRef.current[i]({ gs: g, tick: g.tick })
                else if (modelSeatRef.current === i) pads[i] = {}
            }
            stepGame(g, pads)
            // seat 0 is the recording stream's human; cpu streams are banked too
            recordLiveTick(pads)
            for (const f of drainFx(g)) { playFx(f); if (pumpHudRef.current) pumpHudRef.current(f) }
            if (g.done) { screenRef.current = 'over'; setUiScreen('over'); overAtRef.current = performance.now(); if (g.win) hudRef.current.stampT = 50 }
        }

        const attractTick = () => {
            const a = attractRef.current
            if (!a) return
            const pads = attractEmittersRef.current.map((em) => em({ gs: a, tick: a.tick }))
            stepGame(a, pads)
            // marquee gets the visual juice but stays silent (no radio/toast)
            for (const f of drainFx(a)) {
                if (f.k === 'digStart' || f.k === 'tip' || f.k === 'batchEnd') pumpHudRef.current(f)
            }
            if (a.done) startAttract()
        }

        const loop = (now) => {
            raf = requestAnimationFrame(loop)
            const elapsed = Math.min(now - last, 250)
            last = now
            acc += elapsed
            let steps = 0
            while (acc >= FIXED_DT && steps < 8) {
                acc -= FIXED_DT
                steps++
                if (!pausedRef.current && !contractHoldsLoop()) {
                    tickN++
                    if (screenRef.current === 'play') liveTick()
                    else attractTick()
                }
            }
            draw(tickN)
        }
        raf = requestAnimationFrame(loop)

        // ---------- drawing ----------
        const cellPx = (x, y) => [WORLD_X + x * TILE, WORLD_Y + y * TILE]

        const draw = (t) => {
            const ctx = cvs.getContext('2d')
            ctx.imageSmoothingEnabled = false
            const S = sprites()
            const g = screenRef.current === 'play' || screenRef.current === 'over' ? gsRef.current : attractRef.current
            const hud = hudRef.current
            if (hud.toastT > 0) hud.toastT--
            if (hud.radioT > 0) hud.radioT--
            if (hud.popT > 0) hud.popT--
            if (hud.boardShake > 0) hud.boardShake--
            if (hud.stampT > 0) hud.stampT--
            if (hud.shake > 0) hud.shake--
            if (hud.jamFlash > 0) hud.jamFlash--
            if (hud.tipT > 0) hud.tipT--
            for (const p of hud.puffs) p.t--
            hud.puffs = hud.puffs.filter((p) => p.t > 0)
            for (const p of hud.plumes) p.t--
            hud.plumes = hud.plumes.filter((p) => p.t > 0)

            ctx.fillStyle = '#1a120c'
            ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
            if (!g) return
            ctx.save()
            if (hud.shake > 0) ctx.translate((hud.shake % 2 ? 1 : -1) * Math.min(3, hud.shake >> 1), (hud.shake % 3 ? 1 : -1))

            // ground + fences + stations
            for (let y = 0; y < GRID_H; y++) {
                for (let x = 0; x < GRID_W; x++) {
                    const k = cellKind(x, y)
                    const [px, py] = cellPx(x, y)
                    if (k === 'fence') ctx.drawImage(S.fence, px, py)
                    else if (k === 'board') ctx.drawImage(S.board, px, py)
                    else if (k === 'dock') ctx.drawImage(S.trailer, px, py) // parked across the fence gap
                    else if (k === 'bay') {
                        const grade = x === BAY.coarse[0] && y === BAY.coarse[1] ? 'coarse' : 'fines'
                        ctx.drawImage(S.bay[grade][Math.min(BAY_CAP, g.bays[grade])], px, py)
                    } else if (k === 'pile') {
                        const c = g.pile.find((pc) => pc.x === x && pc.y === y)
                        const u = c ? c.units : 0
                        ctx.drawImage(c && c.wet ? (Math.floor(t / 8) % 2 ? S.pile.wetB[u] : S.pile.wet[u]) : S.pile.dry[u], px, py)
                    } else if (k === 'hopper' || k === 'console') {
                        ctx.drawImage(S.dirt[1], px, py) // face cells belong to the plant sprite
                    } else ctx.drawImage(S.dirt[(x + y) % 2], px, py)
                }
            }

            // the plant shudders while running
            const plantX = WORLD_X + 7 * TILE
            const plantY = WORLD_Y + 1 * TILE + (g.plant.running && !g.plant.jammed ? Math.floor(t / 3) % 2 : 0)
            ctx.drawImage(S.plant, plantX, plantY)
            // #1390 shaker life: stones bounce on the deck while it runs...
            if (g.plant.running && !g.plant.jammed) {
                for (let i = 0; i < 5; i++) {
                    const ph = [0, 2, 3, 1, 0][Math.floor((t + i * 4) / 3) % 5]
                    ctx.fillStyle = i % 2 ? PAL_DECK_A : PAL_DECK_B
                    ctx.fillRect(plantX + 10 + i * 15, plantY + 3 - ph, 2, 2)
                }
            }
            // ...grey smoke puffs off the stack while jammed...
            if (g.plant.jammed) {
                for (let k = 0; k < 3; k++) {
                    const age = (t + k * 8) % 24
                    ctx.globalAlpha = 0.5 - age / 60
                    ctx.fillStyle = '#9a9a9a'
                    ctx.beginPath(); ctx.arc(plantX + 12 + k + Math.floor(age / 4), plantY - 2 - age, 2 + age / 8, 0, Math.PI * 2); ctx.fill()
                }
                ctx.globalAlpha = 1
            }
            // ...and a discharge plume sized to the batch, coarse top / fines low
            for (const pl of hud.plumes) {
                const p = 1 - pl.t / 28
                for (let i = 0; i < 8; i++) {
                    const isC = i < pl.c && pl.c >= pl.f
                    if (i >= Math.max(pl.c, pl.f)) break
                    const q = Math.min(1, p * 1.4 - i * 0.07)
                    if (q <= 0) continue
                    const bayC = isC ? BAY.coarse : BAY.fines
                    const [sx2, sy2] = [plantX + 90, plantY + (isC ? 26 : 42)]
                    const [tx2, ty2] = cellPx(bayC[0], bayC[1])
                    ctx.fillStyle = isC ? '#8d7a60' : '#c8a878'
                    ctx.fillRect(Math.round(sx2 + (tx2 + 14 - sx2) * q),
                        Math.round(sy2 + (ty2 + 14 - sy2) * q - Math.sin(q * Math.PI) * 10), 2, 2)
                }
            }
            // gate dial on the console face
            {
                const [cx, cy] = cellPx(CONSOLE_FRONT[0], CONSOLE_FRONT[1])
                ctx.fillStyle = '#120c08'
                ctx.fillRect(cx + 4, cy + 2, 24, 10)
                ctx.fillStyle = g.plant.gate === 'wide' ? '#58d048' : g.plant.gate === 'medium' ? '#f8d038' : '#f09030'
                ctx.font = '6px "Press Start 2P", monospace'
                ctx.fillText(g.plant.gate === 'wide' ? 'WIDE' : g.plant.gate === 'medium' ? 'MED' : 'NARO', cx + 5, cy + 9)
            }
            // hopper fill meter on the funnel face
            {
                const [hx, hy] = cellPx(HOPPER_FRONT[0], HOPPER_FRONT[1])
                ctx.fillStyle = '#120c08'
                ctx.fillRect(hx + 4, hy + 20, 24, 8)
                ctx.fillStyle = g.plant.hopperWet > 0 ? '#58a8d8' : '#c8b890'
                ctx.fillRect(hx + 5, hy + 21 + (6 - Math.min(6, g.plant.hopper)), 22, Math.min(6, g.plant.hopper))
                if (g.plant.running) {
                    const frac = Math.min(1, g.plant.t / (120 + 15 * g.plant.batch))
                    ctx.fillStyle = '#120c08'; ctx.fillRect(hx + 4, hy + 12, 24, 4)
                    ctx.fillStyle = '#58d048'; ctx.fillRect(hx + 5, hy + 13, Math.round(22 * frac), 2)
                }
                if (g.plant.jammed) {
                    ctx.fillStyle = hud.jamFlash > 0 && Math.floor(t / 4) % 2 ? '#ff5040' : '#c02018'
                    ctx.font = '7px "Press Start 2P", monospace'
                    ctx.fillText('JAM x' + g.plant.jamNeed, hx - 4, hy + 8)
                }
            }

            // work-spot hints (always visible; they teach the chain)
            const hint = (x, y, col) => {
                const [px, py] = cellPx(x, y)
                ctx.fillStyle = col
                ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4)
            }
            const dim = 'rgba(255,210,90,0.10)'
            hint(HOPPER_STAND[0], HOPPER_STAND[1], dim)
            hint(CONSOLE_STAND[0], CONSOLE_STAND[1], dim)
            hint(BAY_LOAD.coarse[0], BAY_LOAD.coarse[1], dim)
            hint(BAY_LOAD.fines[0], BAY_LOAD.fines[1], dim)
            for (const [dx2, dy2] of DOCK_SPOTS) hint(dx2, dy2, dim)

            // dust puffs behind rolling machines (juice only)
            if (screenRef.current === 'play' && Math.random() < 0.25) {
                const m = Math.random() < 0.5 ? g.digger : g.truck
                if (m.moveCd > 2) {
                    const [px, py] = cellPx(m.x, m.y)
                    ctx.fillStyle = 'rgba(200,170,130,0.25)'
                    ctx.beginPath(); ctx.arc(px + 16 + (Math.random() * 8 - 4), py + 24 + (Math.random() * 4 - 2), 3 + Math.random() * 2, 0, Math.PI * 2); ctx.fill()
                }
            }

            // #1390 bite-dust: a puff bursts over the pile cell being dug
            for (const pf of hud.puffs) {
                const [px, py] = cellPx(pf.x, pf.y)
                const a = pf.t / 22
                ctx.globalAlpha = a * 0.5
                ctx.fillStyle = '#c8a878'
                for (let i = 0; i < 4; i++) {
                    ctx.beginPath()
                    ctx.arc(px + 16 + (i - 1.5) * 6 * (1.3 - a), py + 20 - (22 - pf.t) * 0.8 - (i % 2) * 4, 2 + (1 - a) * 2, 0, Math.PI * 2)
                    ctx.fill()
                }
                ctx.globalAlpha = 1
            }

            // machines (sprites face right; rotate to facing)
            const ROTS = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }
            const drawMachine = (m, sprite, w, h, extra) => {
                const cx = WORLD_X + m.x * TILE + TILE / 2
                const cy = WORLD_Y + m.y * TILE + TILE / 2
                ctx.save()
                ctx.translate(cx, cy)
                ctx.rotate(ROTS[m.face] || 0)
                const wob = m.moveCd > 0 && m.job === null ? (Math.floor(t / 5) % 2) : 0
                ctx.drawImage(sprite[wob], -w / 2, -h / 2)
                if (extra) extra(ctx)
                ctx.restore()
            }
            drawMachine(g.digger, g.digger.job && g.digger.job.kind === 'dig'
                ? [S.diggerDig[digSwingFrame(g.digger.job.t)]] : S.digger, 40, 30)
            // bucket indicator above the digger (count, wet tint)
            {
                const [px, py] = cellPx(g.digger.x, g.digger.y)
                if (g.digger.bucket > 0) {
                    ctx.fillStyle = g.digger.wet > 0 ? '#58a8d8' : '#c8b890'
                    for (let i = 0; i < g.digger.bucket; i++) ctx.fillRect(px + 8 + i * 6, py - 4, 5, 5)
                }
            }
            const tipK = hud.tipT > 0 ? tipSeqFrame(TIP_TICKS - hud.tipT) : -1
            drawMachine(g.truck, tipK >= 0 ? S.truckTip : S.truck, 42, 26, (ctx) => {
                if (g.truck.bed > 0 && tipK < 1) { // load rides until the bed gets steep
                    ctx.drawImage(S.bedLoad[g.truck.bed - 1], -12, -12)
                    if (g.bedGrade === 'fines') { ctx.fillStyle = '#e0c898'; ctx.fillRect(-10, -13, 20, 2) }
                }
            })

            ctx.restore()

            // ---------- HUD top bar ----------
            ctx.fillStyle = '#241812'
            ctx.fillRect(0, 0, CANVAS_W, 42)
            ctx.fillStyle = '#e8b020'
            ctx.fillRect(0, 42, CANVAS_W, 2)
            ctx.font = '9px "Press Start 2P", monospace'
            ctx.fillStyle = Math.floor(t / 40) % 2 ? '#ffd048' : '#e8b020'
            ctx.fillText('GRAVEL', 6, 12)
            ctx.fillStyle = '#c8b890'
            ctx.fillText('YARD', 6, 24)
            const remain = Math.max(0, SHIFT_TICKS - g.tick)
            const mm = Math.floor(remain / 3600), ss = Math.floor((remain % 3600) / 60)
            ctx.fillStyle = remain < 1800 && Math.floor(t / 20) % 2 ? '#ff5252' : '#f0e8d0'
            ctx.fillText(`${mm}:${ss < 10 ? '0' : ''}${ss}`, 6, 37)
            ctx.fillStyle = hud.popT > 0 ? '#ffe082' : '#f0e8d0'
            ctx.fillText(`${g.score}C`, 120, 12)
            if (hud.popT > 0 && hud.popCents > 0) { // cents ticker floats up off the score
                ctx.font = '8px "Press Start 2P", monospace'
                ctx.globalAlpha = Math.min(1, hud.popT / 12)
                ctx.fillStyle = '#7ae07a'
                ctx.fillText(`+${hud.popCents}C`, 158, 12 - (26 - hud.popT) * 0.45)
                ctx.globalAlpha = 1
                ctx.font = '9px "Press Start 2P", monospace'
            }
            ctx.fillStyle = '#a89878'
            ctx.fillText(`GOAL ${QUOTA}C`, 120, 24)
            for (let i = 0; i < MAX_STRIKES; i++) {
                ctx.fillStyle = i < g.strikes ? '#ff5252' : '#3a281c'
                ctx.fillRect(120 + i * 12, 30, 8, 8)
            }
            // order cards (they rattle when the gate refuses a load)
            const bx = hud.boardShake > 0 ? (hud.boardShake % 2 ? 2 : -2) : 0
            g.orders.slice(0, 2).forEach((o, i) => {
                const ox = 210 + i * 78 + bx, oy = 4
                ctx.fillStyle = '#120c08'; ctx.fillRect(ox, oy, 72, 30)
                ctx.fillStyle = GRADE_COLOR[o.grade]; ctx.fillRect(ox + 2, oy + 2, 8, 8)
                ctx.fillStyle = '#f0e8d0'
                ctx.font = '6px "Press Start 2P", monospace'
                ctx.fillText(o.grade === 'coarse' ? 'COARSE' : 'FINES', ox + 13, oy + 9)
                ctx.fillText(`x${o.units}`, ox + 52, oy + 9)
                const frac = Math.max(0, o.left / o.total)
                ctx.fillStyle = '#241812'; ctx.fillRect(ox + 2, oy + 20, 68, 5)
                ctx.fillStyle = frac > 0.5 ? '#58d048' : frac > 0.25 ? '#f8d038' : '#f05030'
                ctx.fillRect(ox + 2, oy + 20, Math.round(68 * frac), 5)
            })

            // gate-state icon (#1390): an aperture preview of the screen's gate
            {
                const gx = 396, gy = 8
                ctx.font = '6px "Press Start 2P", monospace'
                ctx.fillStyle = '#8a7458'
                ctx.fillText('GATE', gx, gy + 4)
                ctx.fillStyle = '#c8b890'
                ctx.beginPath()
                ctx.moveTo(gx, gy + 8); ctx.lineTo(gx + 18, gy + 8); ctx.lineTo(gx + 12, gy + 18); ctx.lineTo(gx + 6, gy + 18)
                ctx.closePath(); ctx.fill()
                const slotW = g.plant.gate === 'wide' ? 7 : g.plant.gate === 'medium' ? 4 : 2
                ctx.fillStyle = '#120c08'; ctx.fillRect(gx + 9 - (slotW >> 1), gy + 16, slotW, 3)
                ctx.fillStyle = g.plant.running ? '#58d048' : '#3a281c'
                ctx.fillRect(gx + 9 - (slotW >> 1), gy + 17, Math.max(1, slotW - 1), 1)
                ctx.fillStyle = '#a89878'
                ctx.fillText(g.plant.gate === 'wide' ? 'WIDE' : g.plant.gate === 'medium' ? 'MED' : 'NARO', gx + 22, gy + 18)
            }

            // radio banner
            if (hud.radioT > 0 && hud.radio) {
                ctx.font = '7px "Press Start 2P", monospace'
                const txt = `${hud.radio.who}: ${hud.radio.text}`
                const w = ctx.measureText(txt).width
                ctx.fillStyle = 'rgba(18,10,6,0.9)'
                ctx.fillRect(CANVAS_W / 2 - w / 2 - 8, CANVAS_H - 34, w + 16, 16)
                ctx.fillStyle = '#7ae07a'
                ctx.fillText(txt, CANVAS_W / 2 - w / 2, CANVAS_H - 23)
                ctx.fillStyle = hud.radioT > 140 ? '#ffd048' : 'rgba(255,208,72,0.4)'
                ctx.fillRect(CANVAS_W / 2 - w / 2 - 8, CANVAS_H - 20, (w + 16) * Math.min(1, hud.radioT / 170), 2)
            }

            // bottom strip
            ctx.fillStyle = '#241812'
            ctx.fillRect(0, CANVAS_H - 12, CANVAS_W, 12)
            ctx.font = '6px "Press Start 2P", monospace'
            ctx.fillStyle = '#8a7458'
            const legend = ['DIG', 'TRK', 'OPR']
            const seatTags = legend.slice(0, Math.max(3, g.seats)).map((n, i) => {
                if (i === 0) return n + ' YOU'
                if (i === 1) return n + (human2Active() && screenRef.current === 'play' ? ' YOU' : ' CPU')
                return n + ' CPU'
            }).join('  ')
            ctx.fillText(seatTags, 6, CANVAS_H - 4)
            ctx.fillText('SPACE WORK  B DUMP/TIP', 340, CANVAS_H - 4)

            // ---------- screens ----------
            const sc = screenRef.current
            if (sc !== 'play' && sc !== 'over') {
                ctx.fillStyle = 'rgba(12,7,4,0.82)'
                ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
            }
            if (sc === 'attract') {
                ctx.textAlign = 'center'
                ctx.font = '16px "Press Start 2P", monospace'
                ctx.fillStyle = Math.floor(t / 24) % 2 ? '#ffd048' : '#e8b020'
                ctx.fillText('GRAVEL', CANVAS_W / 2, 84)
                ctx.fillStyle = '#c8b890'
                ctx.fillText('YARD', CANVAS_W / 2, 106)
                ctx.font = '7px "Press Start 2P", monospace'
                ctx.fillStyle = '#f0e8d0'
                ctx.fillText(ATTRACT_MSGS[Math.floor(t / 150) % ATTRACT_MSGS.length], CANVAS_W / 2, 142)
                if (Math.floor(t / 32) % 2) { ctx.fillStyle = '#58d048'; ctx.fillText('PRESS ANY KEY  /  TAP', CANVAS_W / 2, 176) }
                ctx.textAlign = 'left'
            } else if (sc === 'select') {
                ctx.textAlign = 'center'
                ctx.font = '10px "Press Start 2P", monospace'
                ctx.fillStyle = '#ffd048'
                ctx.fillText('HOW MANY HANDS?', CANVAS_W / 2, 76)
                const names = ['DIGGER', '+TRUCK', '+OPER']
                for (let n = 1; n <= 3; n++) {
                    const px = CANVAS_W / 2 - 72 + (n - 1) * 52
                    ctx.fillStyle = n === selectRef.current ? '#e8b020' : '#4a3418'
                    ctx.fillRect(px, 92, 40, 28)
                    ctx.fillStyle = n === selectRef.current ? '#241812' : '#8a7458'
                    ctx.font = '9px "Press Start 2P", monospace'
                    ctx.fillText(String(n), px + 15, 112)
                    ctx.font = '5px "Press Start 2P", monospace'
                    ctx.fillStyle = n === selectRef.current ? '#f0e8d0' : '#8a7458'
                    ctx.fillText(names[n - 1], px + 2, 132)
                }
                ctx.font = '7px "Press Start 2P", monospace'
                ctx.fillStyle = '#c8b890'
                ctx.fillText('ARROWS PICK   SPACE START', CANVAS_W / 2, 158)
                ctx.fillStyle = partnerHumanRef.current ? '#58d048' : '#8a7458'
                ctx.fillText(`P: TRUCK SEAT ${partnerHumanRef.current ? 'HUMAN (WASD F/G)' : 'CPU'}`, CANVAS_W / 2, 174)
                ctx.fillStyle = '#8a7458'
                ctx.fillText('UNFILLED SEATS RUN BY THE CREW (CPU)', CANVAS_W / 2, 192)
                ctx.textAlign = 'left'
            } else if (sc === 'over') {
                const g2 = gsRef.current
                ctx.fillStyle = 'rgba(12,7,4,0.72)'
                ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
                ctx.textAlign = 'center'
                ctx.font = '12px "Press Start 2P", monospace'
                ctx.fillStyle = g2.win ? '#58d048' : '#ff5252'
                ctx.fillText(g2.win ? 'CLEAN SHIFT!' : g2.strikes >= MAX_STRIKES ? 'YARD RUINED' : 'SHIFT OVER', CANVAS_W / 2, 92)
                ctx.font = '8px "Press Start 2P", monospace'
                ctx.fillStyle = '#f0e8d0'
                ctx.fillText(`${g2.score}C OF ${QUOTA}   HAULED ${g2.delivered}`, CANVAS_W / 2, 118)
                ctx.fillStyle = '#c8b890'
                ctx.fillText(g2.win ? 'THE FOREMAN NODS' : `GOAL WAS ${QUOTA}C${g2.strikes >= MAX_STRIKES ? ' - THREE REFUSALS' : ''}`, CANVAS_W / 2, 136)
                if (Math.floor(t / 30) % 2) { ctx.fillStyle = '#ffd048'; ctx.fillText('SPACE FOR THE NEXT SHIFT', CANVAS_W / 2, 166) }
                if (g2.win && hud.stampT > 0) { // #1306 the foreman's stamp slams in
                    const age = 50 - hud.stampT
                    const k = age < 8 ? 2.4 - 1.4 * (age / 8) : 1
                    ctx.save()
                    ctx.translate(CANVAS_W / 2 + 96, 214)
                    ctx.rotate(-0.14)
                    ctx.scale(k, k)
                    ctx.globalAlpha = age < 4 ? 0.35 + age * 0.16 : 1
                    ctx.strokeStyle = '#e04838'; ctx.lineWidth = 3
                    ctx.strokeRect(-74, -18, 148, 36)
                    ctx.lineWidth = 1.5
                    ctx.strokeRect(-69, -13, 138, 26)
                    ctx.fillStyle = '#e04838'
                    ctx.font = '12px "Press Start 2P", monospace'
                    ctx.fillText('CLEAN SHIFT', 0, 5)
                    ctx.restore()
                }
                ctx.textAlign = 'left'
            }
        }

        // ---------- DEV hooks + DebugKit ----------
        if (import.meta.env.DEV) {
            let refCache = null
            window.__gyTest = {
                state: () => simState(gsRef.current || attractRef.current || createGame(1, 1)),
                screen: () => screenRef.current,
                setScreen: (s) => { screenRef.current = s },
                start: (seed, players, human2) => startPlay(seed, players, !!human2),
                press: (field, seat = 0) => { (seat === 0 ? keys1 : keys2)[field] = true },
                release: (field, seat = 0) => { (seat === 0 ? keys1 : keys2)[field] = false },
                hash: () => simState(gsRef.current).hash,
                // #1390 render-animation probes + deterministic staging for gravelcheck
                anim: () => {
                    const g = gsRef.current
                    if (!g) return null
                    const hud = hudRef.current
                    return {
                        boom: g.digger.job && g.digger.job.kind === 'dig' ? digSwingFrame(g.digger.job.t) : -1,
                        tip: hud.tipT > 0 ? tipSeqFrame(TIP_TICKS - hud.tipT) : -1,
                        stones: g.plant.running && !g.plant.jammed ? 1 : 0,
                        smoke: g.plant.jammed ? 1 : 0,
                        plumes: hud.plumes.length,
                        puffs: hud.puffs.length,
                    }
                },
                prime: (what) => {
                    const g = gsRef.current
                    if (!g) return false
                    if (what === 'tip') {
                        g.truck.bed = 2; g.bedGrade = 'coarse'
                        if (!g.orders.some((o) => o.grade === 'coarse')) g.orders.push({ id: 999, grade: 'coarse', units: 4, left: 1000, total: 1000 })
                        g.truck.x = DOCK_SPOTS[0][0]; g.truck.y = DOCK_SPOTS[0][1]; g.truck.face = 'left'
                        return true
                    }
                    if (what === 'batch') { g.plant.hopper = 4; g.plant.hopperWet = 0; return true }
                    if (what === 'jam') { g.plant.jammed = true; g.plant.jamNeed = 2; return true }
                    if (what === 'dig') {
                        g.digger.x = 3; g.digger.y = 3; g.digger.face = 'up'
                        const c = g.pile.find((pc) => pc.x === 3 && pc.y === 2)
                        if (c) { c.units = Math.max(1, c.units); c.wet = false }
                        return true
                    }
                    return false
                },
            }
            mountDbg({
                title: 'GRAVEL YARD',
                getState: () => {
                    const g = gsRef.current
                    if (!g) return ['no game']
                    const s = simState(g)
                    return [
                        `t=${s.tick} ${s.score}C strikes=${s.strikes} delivered=${s.delivered} done=${s.done}`,
                        `plant: gate=${s.plant.gate} hop=${s.plant.hopper}(w${s.plant.hopperWet}) run=${s.plant.running} jam=${s.plant.jammed}x${s.plant.jamNeed}`,
                        `bays C=${s.bays.coarse} F=${s.bays.fines} pile=${s.pile.map((c) => c.units).join('')}`,
                        `digger (${s.digger.x},${s.digger.y})${s.digger.face} bucket=${s.digger.bucket}(w${s.digger.wet}) ${s.digger.job || ''}`,
                        `truck (${s.truck.x},${s.truck.y})${s.truck.face} bed=${s.truck.bed}${s.truck.grade ? ' ' + s.truck.grade : ''} ${s.truck.job || ''}`,
                        `orders: ${s.orders.map((o) => `${o.grade}x${o.units} ${Math.ceil(o.left / 60)}s`).join(' | ') || 'none'}`,
                    ]
                },
                actions: [
                    { label: '+100C', run: () => { if (gsRef.current) gsRef.current.score += 100 } },
                    { label: 'jam it', run: () => { if (gsRef.current) { const p = gsRef.current.plant; p.jammed = true; p.jamNeed = 2 } } },
                    { label: 'win now', run: () => { if (gsRef.current) { gsRef.current.score = QUOTA; gsRef.current.tick = SHIFT_TICKS } } },
                    { label: 'prognosis', run: () => {
                        const g = gsRef.current
                        if (!g) return 'no game'
                        if (!refCache || refCache.seed !== g.seed) refCache = { seed: g.seed, cpu: simulate(g.seed, 3) }
                        const pace = g.tick > 0 ? g.score / g.tick : 0
                        const cpuPace = refCache.cpu.score / SHIFT_TICKS
                        return `seed ${g.seed}: cpu crew finishes ${refCache.cpu.score}C; you are ${g.score}C at ${Math.round(g.tick / 60)}s — pace ${pace >= cpuPace ? 'OK' : 'BEHIND'} (need ${Math.ceil((QUOTA - g.score) / Math.max(1, (SHIFT_TICKS - g.tick) / 60))}C/min)`
                    } },
                ],
            })
        }

        return () => {
            cancelAnimationFrame(raf)
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('keyup', onKeyUp)
            cvs.removeEventListener('pointerdown', onPointer)
            clearKeys()
            if (import.meta.env.DEV) { unexposeGame(); unmountDbg(); delete window.__gyTest }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const game = GAMES.find((g) => g.label === 'GRAVEL YARD')

    return (
        <div className="flex flex-col items-center justify-center w-full h-full bg-black select-none">
            <canvas
                ref={canvasRef}
                style={{ imageRendering: 'pixelated', width: 'min(100%, 960px)', touchAction: 'none' }}
                aria-label="Gravel Yard"
            />
            {paused && game && <PauseOverlay game={game} onResume={() => setPaused(false)} />}
            <VirtualControls secondAction={{ label: 'DUMP', code: 'KeyB' }} visible={!paused && uiScreen === 'play'} />
        </div>
    )
}
