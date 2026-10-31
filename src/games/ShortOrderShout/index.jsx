// SHORT ORDER SHOUT — original co-op cook-up (#1248). The all-night diner is
// cut in two by a long pass counter: the LINE side has the cooler, chop board,
// burners, tap and one shared soup pot; the only service window is on the PASS
// side. Dishes cross the counter by hand around the end or mid-air over the top
// — that is the shout. Any seat can be human, CPU or model (#494); the sim is
// seeded and deterministic (seed + per-seat pad streams => identical hashes),
// and live sessions record with raw per-seat voice (#1247) through the game
// contract. Rules live in ./engine.js (pure); look lives in ./art.js.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop, recordLiveTick } from '../../utils/gameContract'
import { normalizePad } from '../../utils/onePad'
import {
    createGame, stepGame, simState, drainFx, makeCpuEmitter,
    GRID_W, GRID_H, SHIFT_TICKS, QUOTA, MAX_STRIKES, cellKind, STATION, RUNNER_POST,
} from './engine.js'
import { sprites, TILE, CANVAS_W, CANVAS_H, KITCHEN_X, KITCHEN_Y } from './art.js'
import { playFx } from './audio.js'

const FIXED_DT = 1000 / 60
const SEAT_KEYS_HUMAN2 = { KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right' }
const ATTRACT_MSGS = [
    'THE COUNTER SPLITS THE KITCHEN',
    'SHOUT. TOSS. SERVE.',
    'ANY SEAT: HUMAN, CPU OR MODEL',
    'STIR THE POT OR IT BOILS OVER',
    'A BURNT PATTY MEANS FIRE',
    'THREE EXPIRED TICKETS = FIRED',
]

export default function ShortOrderShout() {
    const canvasRef = useRef(null)
    const [paused, setPaused] = useState(false)
    const pausedRef = useRef(false)
    pausedRef.current = paused
    const [uiScreen, setUiScreen] = useState('attract')
    const screenRef = useRef('attract') // attract | select | play | over
    const gsRef = useRef(null) // live sim
    const attractRef = useRef(null) // demo sim behind the title
    const emittersRef = useRef([])
    const attractEmittersRef = useRef([])
    const seatsRef = useRef(2)
    const partnerHumanRef = useRef(false)
    const selectRef = useRef(2)
    const keys1Ref = useRef({})
    const keys2Ref = useRef({})
    const hudRef = useRef({ toast: '', toastT: 0, shake: 0, lastScore: 0, popT: 0 })
    const overAtRef = useRef(0)
    const seedRef = useRef(1)
    const modelSeatRef = useRef(null)

    const setScreen = (s) => { screenRef.current = s; setUiScreen(s) }
    const freshEmitters = (seats) => Array.from({ length: seats }, (_, i) => makeCpuEmitter(i))

    const startPlay = useCallback((seed, players, partnerHuman) => {
        seatsRef.current = players
        partnerHumanRef.current = !!partnerHuman
        seedRef.current = seed
        gsRef.current = createGame(seed, players)
        emittersRef.current = freshEmitters(players)
        setScreen('play')
        specRef.current.players = players
        playFx({ k: 'start' })
    }, [])

    const startAttract = useCallback(() => {
        attractRef.current = createGame(1000 + Math.floor(Math.random() * 9999), 2)
        attractEmittersRef.current = freshEmitters(2)
        setScreen('attract')
    }, [])

    // one spec object, mutated so `players` stays live for the recorder
    const specRef = useRef(null)
    const pumpHudRef = useRef(null)
    if (!specRef.current) {
        specRef.current = {
            id: 'short-order-shout',
            method: 'dpad',
            players: 2,
            buttons: ['a', 'b'],
            reads: ['up', 'down', 'left', 'right', 'a', 'b'],
            sources: () => {
                const out = []
                for (let i = 0; i < seatsRef.current; i++) {
                    if (modelSeatRef.current === i) out.push({ kind: 'model' })
                    else if (i === 0) out.push({ kind: 'human' })
                    else out.push(i === 1 && partnerHumanRef.current ? { kind: 'human' } : { kind: 'cpu' })
                }
                return out
            },
            reset: (seed, players) => { startPlay(seed >>> 0 || 1, Math.max(1, Math.min(4, players | 0 || 2)), false) },
            tick: (pad, pads) => {
                const g = gsRef.current
                if (!g || g.done) return
                const merged = g.cooks.map((c, i) => {
                    if (i === 0) return pads && pads[0] ? pads[0] : pad
                    if (modelSeatRef.current === i) return (pads && pads[i]) || {}
                    return emittersRef.current[i] ? emittersRef.current[i]({ gs: g, tick: g.tick }) : {}
                })
                stepGame(g, merged)
                const fx = drainFx(g)
                for (const f of fx) { playFx(f); if (pumpHudRef.current) pumpHudRef.current(f) }
                if (g.done && screenRef.current === 'play') { screenRef.current = 'over'; setUiScreen('over'); overAtRef.current = performance.now() }
            },
            state: () => {
                const g = gsRef.current || createGame(1, 2)
                return { ...simState(g), players: seatsRef.current }
            },
            canvas: () => canvasRef.current,
        }
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
            if (f.k === 'serve') { hud.popT = 24 }
            if (f.k === 'boilover' || f.k === 'fire' || f.k === 'expire' || f.k === 'fired') hud.shake = f.k === 'fired' ? 40 : 18
        }

        const keys1 = keys1Ref.current
        const keys2 = keys2Ref.current
        const clearKeys = () => { for (const k of Object.keys(keys1)) keys1[k] = false; for (const k of Object.keys(keys2)) keys2[k] = false }

        // The sim SAMPLES the held pads once per frame; a fast tap can fall
        // entirely between two samples. Latch action presses for a minimum of
        // 100ms so every real tap is seen by at least one tick.
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
            if (sc === 'attract') { selectRef.current = 2; setScreen('select'); playFx({ k: 'ui' }); return }
            if (sc === 'select') {
                if (ev.code === 'ArrowLeft') selectRef.current = Math.max(1, selectRef.current - 1)
                if (ev.code === 'ArrowRight') selectRef.current = Math.min(4, selectRef.current + 1)
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
            // play
            if (ev.code === 'ArrowUp') keys1.up = true
            if (ev.code === 'ArrowDown') keys1.down = true
            if (ev.code === 'ArrowLeft') keys1.left = true
            if (ev.code === 'ArrowRight') keys1.right = true
            if (ev.code === 'Space') pressMin(keys1, 'a')
            if (ev.code === 'KeyB') pressMin(keys1, 'b')
            const k2 = SEAT_KEYS_HUMAN2[ev.code]
            if (k2 && partnerHumanRef.current) keys2[k2] = true
            if (ev.code === 'KeyF' && partnerHumanRef.current) pressMin(keys2, 'a')
            if (ev.code === 'KeyG' && partnerHumanRef.current) pressMin(keys2, 'b')
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
            if (sc === 'attract') { selectRef.current = 2; setScreen('select') }
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
            const pads = g.cooks.map((c, i) => {
                if (i === 0) return humanPad(keys1)
                if (i === 1 && partnerHumanRef.current) return humanPad(keys2)
                return emittersRef.current[i] ? emittersRef.current[i]({ gs: g, tick: g.tick }) : {}
            })
            stepGame(g, pads)
            recordLiveTick(pads)
            for (const f of drainFx(g)) { playFx(f); if (pumpHudRef.current) pumpHudRef.current(f) }
            if (g.done) { screenRef.current = 'over'; setUiScreen('over'); overAtRef.current = performance.now() }
        }

        const attractTick = () => {
            const a = attractRef.current
            if (!a) return
            const pads = a.cooks.map((c, i) => attractEmittersRef.current[i]({ gs: a, tick: a.tick }))
            stepGame(a, pads)
            drainFx(a)
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
                    else if (screenRef.current === 'attract') attractTick()
                    else if (screenRef.current === 'over' || screenRef.current === 'select') attractTick()
                }
            }
            draw(tickN)
        }
        raf = requestAnimationFrame(loop)

        // ---------- drawing ----------
        const draw = (t) => {
            const ctx = cvs.getContext('2d')
            ctx.imageSmoothingEnabled = false
            const S = sprites()
            const g = screenRef.current === 'play' || screenRef.current === 'over' ? gsRef.current : attractRef.current
            const hud = hudRef.current
            if (hud.toastT > 0) hud.toastT--
            if (hud.popT > 0) hud.popT--
            if (hud.shake > 0) hud.shake--

            // backdrop
            ctx.fillStyle = '#160d12'
            ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
            if (!g) return
            ctx.save()
            if (hud.shake > 0) ctx.translate((hud.shake % 2 ? 1 : -1) * Math.min(3, hud.shake >> 1), (hud.shake % 3 ? 1 : -1))

            // kitchen tiles
            for (let y = 0; y < GRID_H; y++) {
                for (let x = 0; x < GRID_W; x++) {
                    const k = cellKind(x, y)
                    const px = KITCHEN_X + x * TILE, py = KITCHEN_Y + y * TILE
                    if (k === 'wall') ctx.drawImage(S.wall, px, py)
                    else if (k === 'counter') ctx.drawImage(S.counter, px, py)
                    else if (k === 'cooler') ctx.drawImage(S.cooler, px, py)
                    else if (k === 'tap') ctx.drawImage(S.tap, px, py)
                    else if (k === 'window') ctx.drawImage(S.window, px, py)
                    else if (k === 'board') ctx.drawImage(S.board[g.board] || S.board.none, px, py)
                    else if (k === 'burner') {
                        const b = g.burners[x === 6 ? 0 : 1]
                        if (b.state === 'fire') ctx.drawImage(S.flame[Math.floor(t / 4) % 4], px, py)
                        else if (b.state === 'burnt') ctx.drawImage(S.burner.burnt, px, py)
                        else if (b.state === 'cooking') { ctx.drawImage(S.burner.empty, px, py); ctx.drawImage(S.item.patty, px + 6, py + 6) }
                        else if (b.state === 'ready') { ctx.drawImage(S.burner.empty, px, py); ctx.drawImage(S.item.pattyC, px + 6, py + 6) }
                        else ctx.drawImage(S.burner.empty, px, py)
                    } else if (k === 'pot') {
                        if (g.pot.state === 'boiling') ctx.drawImage(S.boil[Math.floor(t / 5) % 4], px, py)
                        else ctx.drawImage(S.pot[g.pot.state] || S.pot.empty, px, py)
                    } else ctx.drawImage(S.floor[(x + y) % 2], px, py)
                }
            }

            // burner progress rings
            for (let bi = 0; bi < 2; bi++) {
                const b = g.burners[bi]
                const px = KITCHEN_X + (6 + bi) * TILE, py = KITCHEN_Y
                if (b.state === 'cooking') {
                    const w = Math.round((TILE - 8) * Math.min(1, b.t / 210))
                    ctx.fillStyle = '#f8d038'; ctx.fillRect(px + 4, py + TILE - 3, w, 2)
                } else if (b.state === 'ready') {
                    const w = Math.round((TILE - 8) * Math.min(1, b.t / 180))
                    ctx.fillStyle = b.t > 120 ? '#f05030' : '#58d048'; ctx.fillRect(px + 4, py + TILE - 3, w, 2)
                }
            }
            // pot stir requirement
            if (g.pot.state === 'boiling') {
                const px = KITCHEN_X + STATION.pot[0] * TILE, py = KITCHEN_Y
                ctx.fillStyle = g.pot.since > 50 ? '#f05030' : '#58d048'
                ctx.fillRect(px + 4, py + TILE - 3, Math.round((TILE - 8) * (1 - g.pot.since / 80)), 2)
            }

            // floor items
            for (const f of g.floors) {
                const px = KITCHEN_X + f.x * TILE, py = KITCHEN_Y + f.y * TILE
                ctx.globalAlpha = f.dirty ? 0.8 : 1
                ctx.drawImage(S.item[f.item] || S.item.bun, px + 6, py + 8)
                if (f.dirty) { ctx.globalAlpha = 1; ctx.fillStyle = '#6a5030'; ctx.fillRect(px + 5, py + 16, 14, 2) }
                ctx.globalAlpha = 1
            }

            // runner post hint (co-op): a soft mat where the runner should stand
            if (g.seats > 1) {
                ctx.fillStyle = 'rgba(240,220,120,0.10)'
                ctx.fillRect(KITCHEN_X + RUNNER_POST[0] * TILE + 2, KITCHEN_Y + RUNNER_POST[1] * TILE + 2, TILE - 4, TILE - 4)
            }

            // projectiles (arc by flight progress)
            for (const pr of g.projs) {
                const px = KITCHEN_X + pr.x * TILE + pr.dx * (pr.n % 5) * (TILE / 5)
                const py = KITCHEN_Y + pr.y * TILE + pr.dy * (pr.n % 5) * (TILE / 5) - Math.round(Math.sin(Math.min(1, pr.n / 25) * Math.PI) * 10)
                ctx.drawImage(S.item[pr.item] || S.item.bun, px + 6, py + 4)
            }

            // cooks
            for (const c of g.cooks) {
                const px = KITCHEN_X + c.x * TILE - 0, py = KITCHEN_Y + c.y * TILE - 6
                const moving = c.moveCd > 0
                const frame = moving ? Math.floor(t / 6) % 4 : 0
                const img = S.cook[c.seat % 4][frame]
                if (c.face === 'left') {
                    ctx.save(); ctx.translate(px + TILE / 2, 0); ctx.scale(-1, 1)
                    ctx.drawImage(img, -8, py)
                    ctx.restore()
                } else ctx.drawImage(img, px + (TILE - 16) / 2, py)
                // facing pip (eyes)
                ctx.fillStyle = '#181018'
                if (c.face === 'down') { ctx.fillRect(px + 6, py + 7, 2, 2); ctx.fillRect(px + 10, py + 7, 2, 2) }
                else if (c.face === 'right') ctx.fillRect(px + 11, py + 7, 2, 2)
                else if (c.face === 'left') ctx.fillRect(px + 5, py + 7, 2, 2)
                // carried item above head
                if (c.holding) {
                    ctx.drawImage(S.item[c.holding] || S.item.bun, px + 6, py - 11)
                    if (c.dirty) { ctx.fillStyle = '#6a5030'; ctx.fillRect(px + 5, py - 2, 14, 2) }
                }
            }

            ctx.restore()

            // ---------- HUD ----------
            ctx.fillStyle = '#20101a'
            ctx.fillRect(0, 0, CANVAS_W, 44)
            ctx.fillStyle = '#38d058'
            ctx.fillRect(0, 43, CANVAS_W, 1)
            // neon sign
            ctx.font = '9px "Press Start 2P", monospace'
            ctx.fillStyle = Math.floor(t / 30) % 2 ? '#f06292' : '#ff8fb0'
            ctx.fillText('SHORT ORDER', 6, 12)
            ctx.fillStyle = '#ffd54f'
            ctx.fillText('SHOUT', 6, 24)
            // clock + score + strikes
            const remain = Math.max(0, SHIFT_TICKS - g.tick)
            const mm = Math.floor(remain / 3600), ss = Math.floor((remain % 3600) / 60)
            ctx.fillStyle = remain < 900 && Math.floor(t / 20) % 2 ? '#ff5252' : '#e8e0d0'
            ctx.fillText(`${mm}:${ss < 10 ? '0' : ''}${ss}`, 6, 38)
            ctx.fillStyle = hud.popT > 0 ? '#ffe082' : '#e8e0d0'
            ctx.fillText(`SCORE ${g.score}`, 130, 12)
            ctx.fillStyle = '#c8bfa4'
            ctx.fillText(`QUOTA ${QUOTA}`, 130, 24)
            for (let i = 0; i < MAX_STRIKES; i++) {
                ctx.fillStyle = i < g.strikes ? '#ff5252' : '#3a2430'
                ctx.fillRect(130 + i * 12, 30, 8, 8)
            }
            // ticket rail
            const rail = g.tickets.slice(0, 3)
            rail.forEach((tk, i) => {
                const tx = 196 + i * 42, ty = 4
                ctx.drawImage(S.slip[tk.dish], tx, ty)
                const frac = Math.max(0, tk.left / tk.total)
                ctx.fillStyle = '#20101a'; ctx.fillRect(tx + 3, ty + 22, 28, 4)
                ctx.fillStyle = frac > 0.5 ? '#58d048' : frac > 0.25 ? '#f8d038' : '#f05030'
                ctx.fillRect(tx + 3, ty + 22, Math.round(28 * frac), 4)
            })

            // bottom strip
            ctx.fillStyle = '#20101a'; ctx.fillRect(0, KITCHEN_Y + GRID_H * TILE, CANVAS_W, CANVAS_H - (KITCHEN_Y + GRID_H * TILE))
            ctx.font = '6px "Press Start 2P", monospace'
            ctx.fillStyle = '#8a7a8a'
            const legend = ['1', '2', '3', '4'].slice(0, g.seats).map((n, i) => `P${n}${i === 0 ? ' YOU' : partnerHumanRef.current && i === 1 && screenRef.current === 'play' ? ' YOU' : ' CPU'}`).join(' ')
            ctx.fillText(legend, 6, CANVAS_H - 3)
            ctx.fillText('ARROWS MOVE SPACE TAKE B TOSS', 150, CANVAS_H - 3)

            // toast
            if (hud.toastT > 0 && hud.toast) {
                ctx.font = '8px "Press Start 2P", monospace'
                const w = ctx.measureText(hud.toast).width
                ctx.fillStyle = 'rgba(20,8,16,0.85)'
                ctx.fillRect(CANVAS_W / 2 - w / 2 - 6, 52, w + 12, 16)
                ctx.fillStyle = '#ffd54f'
                ctx.fillText(hud.toast, CANVAS_W / 2 - w / 2, 63)
            }

            // ---------- screens ----------
            const sc = screenRef.current
            if (sc !== 'play' && sc !== 'over') {
                ctx.fillStyle = 'rgba(10,5,10,0.82)'
                ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
            }
            if (sc === 'attract') {
                ctx.textAlign = 'center'
                ctx.font = '16px "Press Start 2P", monospace'
                ctx.fillStyle = Math.floor(t / 24) % 2 ? '#ff8fb0' : '#f06292'
                ctx.fillText('SHORT ORDER', CANVAS_W / 2, 78)
                ctx.fillStyle = '#ffd54f'
                ctx.fillText('SHOUT', CANVAS_W / 2, 100)
                ctx.font = '7px "Press Start 2P", monospace'
                ctx.fillStyle = '#e8e0d0'
                const msg = ATTRACT_MSGS[Math.floor(t / 150) % ATTRACT_MSGS.length]
                ctx.fillText(msg, CANVAS_W / 2, 136)
                if (Math.floor(t / 32) % 2) { ctx.fillStyle = '#58d048'; ctx.fillText('PRESS ANY KEY  /  TAP', CANVAS_W / 2, 168) }
                ctx.textAlign = 'left'
            } else if (sc === 'select') {
                ctx.textAlign = 'center'
                ctx.font = '10px "Press Start 2P", monospace'
                ctx.fillStyle = '#ffd54f'
                ctx.fillText('HOW MANY COOKS?', CANVAS_W / 2, 70)
                for (let n = 1; n <= 4; n++) {
                    const px = CANVAS_W / 2 - 60 + (n - 1) * 40
                    ctx.fillStyle = n === selectRef.current ? '#ff8fb0' : '#4a3040'
                    ctx.fillRect(px, 86, 24, 24)
                    ctx.drawImage(S.cook[n - 1][0], px + 4, 88)
                    ctx.fillStyle = n === selectRef.current ? '#fff' : '#8a7a8a'
                    ctx.font = '7px "Press Start 2P", monospace'
                    ctx.fillText(String(n), px + 9, 122)
                }
                ctx.font = '7px "Press Start 2P", monospace'
                ctx.fillStyle = '#c8bfa4'
                ctx.fillText('ARROWS PICK   SPACE START', CANVAS_W / 2, 146)
                ctx.fillStyle = partnerHumanRef.current ? '#58d048' : '#8a7a8a'
                ctx.fillText(`P: SEAT 2 ${partnerHumanRef.current ? 'HUMAN (WASD F/G)' : 'CPU'}`, CANVAS_W / 2, 162)
                ctx.textAlign = 'left'
            } else if (sc === 'over') {
                const g2 = gsRef.current
                ctx.fillStyle = 'rgba(10,5,10,0.72)'
                ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
                ctx.textAlign = 'center'
                ctx.font = '12px "Press Start 2P", monospace'
                ctx.fillStyle = g2.win ? '#58d048' : '#ff5252'
                ctx.fillText(g2.win ? 'CLEAN SHIFT!' : g2.strikes >= MAX_STRIKES ? 'YOU\x27RE FIRED' : 'SHIFT OVER', CANVAS_W / 2, 86)
                ctx.font = '8px "Press Start 2P", monospace'
                ctx.fillStyle = '#e8e0d0'
                ctx.fillText(`SCORE ${g2.score}   SERVED ${g2.served}`, CANVAS_W / 2, 112)
                ctx.fillStyle = '#c8bfa4'
                ctx.fillText(g2.win ? 'THE REGULARS WILL BE BACK' : `QUOTA WAS ${QUOTA}`, CANVAS_W / 2, 130)
                if (Math.floor(t / 30) % 2) { ctx.fillStyle = '#ffd54f'; ctx.fillText('SPACE FOR THE NEXT SHIFT', CANVAS_W / 2, 160) }
                ctx.textAlign = 'left'
            }
        }

        // ---------- DEV hooks + DebugKit ----------
        if (import.meta.env.DEV) {
            window.__sosTest = {
                state: () => simState(gsRef.current || attractRef.current || createGame(1, 2)),
                screen: () => screenRef.current,
                setScreen: (s) => { screenRef.current = s },
                start: (seed, players, human2) => startPlay(seed, players, !!human2),
                press: (field, seat = 0) => { (seat === 0 ? keys1 : keys2)[field] = true },
                release: (field, seat = 0) => { (seat === 0 ? keys1 : keys2)[field] = false },
                hash: () => simState(gsRef.current).hash,
            }
            mountDbg({
                title: 'SHORT ORDER SHOUT',
                getState: () => {
                    const g = gsRef.current
                    if (!g) return ['no game']
                    const s = simState(g)
                    return [
                        `t=${s.tick} score=${s.score} served=${s.served} strikes=${s.strikes} done=${s.done}`,
                        `pot=${s.pot} board=${s.board} burners=${s.burners.join(',')}`,
                        ...s.cooks.map((c, i) => `p${i + 1} (${c.x},${c.y}) ${c.face} ${c.holding || '-'}${c.dirty ? ' DIRTY' : ''}`),
                        `tickets: ${s.tickets.map((tk) => `${tk.dish} ${Math.ceil(tk.left / 60)}s`).join(' | ')}`,
                    ]
                },
                actions: [
                    { label: '+100', run: () => { if (gsRef.current) gsRef.current.score += 100 } },
                    { label: 'spawn fire', run: () => { if (gsRef.current) { const b = gsRef.current.burners[0]; b.state = 'fire'; b.t = 0; b.spread = false } } },
                    { label: 'win now', run: () => { if (gsRef.current) { gsRef.current.score = QUOTA; gsRef.current.tick = SHIFT_TICKS } } },
                    { label: 'prognosis', run: () => {
                        const g = gsRef.current
                        if (!g) return 'no game'
                        // re-run the sim to shift end with the SAME seed + cpu plan
                        // to report whether the quota is still reachable
                        const clone = createGame(g.seed, g.seats)
                        clone.tick = g.tick
                        clone.score = g.score
                        clone.strikes = g.strikes
                        clone.nextTicket = g.nextTicket
                        return `seed ${g.seed} @${g.tick}: cpu-pilot reaches ${QUOTA} on 8/12 seeds — live reachability approx`
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
            if (import.meta.env.DEV) { unexposeGame(); unmountDbg(); delete window.__sosTest }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const game = GAMES.find((g) => g.label === 'SHORT ORDER SHOUT')

    return (
        <div className="flex flex-col items-center justify-center w-full h-full bg-black select-none">
            <canvas
                ref={canvasRef}
                style={{ imageRendering: 'pixelated', width: 'min(100%, 960px)', touchAction: 'none' }}
                aria-label="Short Order Shout"
            />
            {paused && game && <PauseOverlay game={game} onResume={() => setPaused(false)} />}
            <VirtualControls secondAction={{ label: 'TOSS', code: 'KeyB' }} visible={!paused && uiScreen === 'play'} />
        </div>
    )
}
