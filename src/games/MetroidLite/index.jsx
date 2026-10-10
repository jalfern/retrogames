// METROID-LITE — the arcade shell. Hand-carved cave, everything synthesized at
// runtime: tiles, sprites, the three-LAYER PARALLAX sky, and all audio. The
// issue's second named muscle is parallax, and the renderer's contract for it
// is exact: layer k draws at `cam * LAYERS[k].f` — no more, no less — because
// `scripts/metroidplay.mjs` predicts a star's REAL screen pixel from
// `starScreenX(layer, k, cam)` (metroidplay hardcodes the factors itself, so
// a renderer that scrolls every layer at the camera paints its stars where
// the prediction goes DARK).
//
// Layout: 1. the proven script (planRun — the attract demo IS the flow
// machine's zero-hit win) 2. painter 3. fixed-timestep loop 4. input
// 5. DEV hook 6. React + HUD.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import {
    TS, MW, MH, VIEW_W, VIEW_H, EMPTY, ROCK, CRACK, BULK, SPIKE,
    PLAYER, LAYERS, makeGame, planRun, step, footCell,
    stateHash, starWorld, starScreenX, tileAt,
} from './sim.js'

const SIM_MS = 1000 / 60
const RIGHT_WALL = MW * TS - VIEW_W
const BOTTOM = MH * TS - VIEW_H
const speck = (x, y) => ((x * 7349 + y * 8453 + x * y * 31) % 11) / 11

let proven = null
const provenScript = () => {
    if (!proven) {
        const r = planRun()
        proven = r.ok ? r.script : []
    }
    return proven
}

const MetroidGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [end, setEnd] = useState(null)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const overAtRef = useRef(0)
    const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])
    const hudRef = useRef({})
    const setHud = (k) => (el) => { hudRef.current[k] = el }
    const board = () => { try { return JSON.parse(localStorage.getItem('metroid.board') || '[]') } catch { return [] } }

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const canvas = document.createElement('canvas')
        canvas.dataset.metroidStage = '1'
        canvas.width = VIEW_W; canvas.height = VIEW_H
        canvas.className = 'block w-full h-full'
        canvas.style.imageRendering = 'pixelated'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false

        // ---------- world / loop state ----------
        let gs = makeGame()
        let demoAt = 0
        let raf = 0, last = 0, acc = 0
        let toast = 0, toastMsg = ''
        const keys = { left: false, right: false, down: false }
        let jumpEdge = false, jumpCut = false, fireEdge = false, bombEdge = false

        const cam = () => ({
            x: Math.max(0, Math.min(RIGHT_WALL, Math.round(gs.p.x + gs.p.w / 2 - VIEW_W / 2))),
            y: Math.max(0, Math.min(BOTTOM, Math.round(gs.p.y + gs.p.h / 2 - VIEW_H / 2))),
        })

        const say = (msg) => { toastMsg = msg; toast = 90 }

        const handleEvents = (evts) => {
            for (const e of evts) {
                if (e.type === 'fire') audioController.playSweep(1200, 500, 0.09, 'square', 0.05)
                else if (e.type === 'bomb') audioController.playTone(180, 0.08, 'triangle', 0.05)
                else if (e.type === 'boom') { audioController.playNoise(0.3, 0.12); audioController.playSweep(160, 40, 0.35, 'sawtooth', 0.09) }
                else if (e.type === 'crack') audioController.playNoise(0.12, 0.07)
                else if (e.type === 'bulk') { audioController.playNoise(0.25, 0.11); audioController.playSweep(300, 60, 0.3, 'square', 0.07) }
                else if (e.type === 'item') { audioController.playSweep(660, 1760, 0.25, 'square', 0.08); say(e.label + ' ACQUIRED') }
                else if (e.type === 'save') { audioController.playTone(880, 0.12, 'sine', 0.06); audioController.playTone(1320, 0.18, 'sine', 0.05); say('BEACON SYNCED') }
                else if (e.type === 'hit') { audioController.playNoise(0.15, 0.09); audioController.playSweep(240, 70, 0.25, 'sawtooth', 0.07) }
                else if (e.type === 'die') audioController.playDeath()
                else if (e.type === 'respawn') { audioController.playSweep(220, 880, 0.4, 'triangle', 0.07); say('RECOVERED AT LAST BEACON') }
                else if (e.type === 'kill') audioController.playNoise(0.1, 0.06)
                else if (e.type === 'relic') { audioController.playSweep(440, 1760, 0.7, 'square', 0.09); say('THE RELIC IS YOURS') }
            }
        }

        const finish = () => {
            const sc = gs.score
            setEnd({ score: sc, deaths: gs.deaths })
            if (sc > 0) localStorage.setItem('metroid.board', JSON.stringify([...board(), { score: sc, deaths: gs.deaths, date: new Date().toISOString().slice(2, 10) }].sort((a, b) => b.score - a.score).slice(0, 8)))
            overAtRef.current = performance.now()
            setMode('over')
        }

        const doSim = () => {
            const sc = screenRef.current
            if (sc === 'attract') {
                const script = provenScript()
                if (demoAt >= script.length) {
                    if (demoAt >= script.length + 150) { gs = makeGame(); demoAt = 0 }
                    demoAt++
                    if (!gs.end) step(gs, {})
                    return
                }
                const inp = script[demoAt++]
                step(gs, inp)
                handleEvents(gs.events)
                if (gs.end === 'win') { demoAt = script.length }
                return
            }
            if (sc !== 'play') return
            const before = gs.events.length
            step(gs, {
                left: keys.left, right: keys.right, down: keys.down,
                jumpEdge, jumpCut, fireEdge, bombEdge,
            })
            handleEvents(gs.events.slice(before))
            jumpEdge = false; jumpCut = false; fireEdge = false; bombEdge = false
            if (gs.end === 'win') finish()
        }

        // ---------- painter ----------
        const paint = () => {
            const c = cam()
            const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H)
            sky.addColorStop(0, '#050810'); sky.addColorStop(1, '#0c1322')
            ctx.fillStyle = sky
            ctx.fillRect(0, 0, VIEW_W, VIEW_H)
            // parallax stars: layer k MUST scroll at exactly LAYERS[k].f —
            // metroidplay samples the predicted pixel and fails the paint if
            // a layer moves at the camera's rate instead.
            for (let li = 0; li < LAYERS.length; li++) {
                const L = LAYERS[li]
                ctx.fillStyle = L.color
                for (let k = 0; k < L.n; k++) {
                    const sx = starScreenX(li, k, c.x)
                    if (sx >= VIEW_W) continue
                    const s = starWorld(li, k)
                    const tw = 0.6 + 0.4 * Math.sin(gs.tick / 20 + k * 2 + li)
                    ctx.globalAlpha = (0.25 + li * 0.25) * tw
                    ctx.fillRect(sx, s.y, li + 1, li + 1)
                }
            }
            ctx.globalAlpha = 1
            // distant ridges behind the stars (also parallaxed, mid factor)
            ctx.fillStyle = '#101a2e'
            for (let i = 0; i < 24; i++) {
                const bx = ((i * 337) % 2000) - (c.x * 0.28) % 2000
                const px = ((bx % 2000) + 2000) % 2000
                if (px >= VIEW_W + 120 || px <= -120) continue
                const hgt = 60 + (i % 5) * 26
                ctx.beginPath()
                ctx.moveTo(px - 90, VIEW_H)
                ctx.lineTo(px, VIEW_H - hgt)
                ctx.lineTo(px + 90, VIEW_H)
                ctx.fill()
            }
            // tiles
            const x0 = Math.floor(c.x / TS), x1 = Math.ceil((c.x + VIEW_W) / TS)
            const y0 = Math.floor(c.y / TS), y1 = Math.ceil((c.y + VIEW_H) / TS)
            for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
                const t = tileAt(gs.world.grid, tx, ty)
                if (t === EMPTY) continue
                const px = tx * TS - c.x, py = ty * TS - c.y
                if (t === ROCK) {
                    const sp = speck(tx, ty)
                    ctx.fillStyle = sp > 0.66 ? '#232f47' : sp > 0.33 ? '#1b2538' : '#161f30'
                    ctx.fillRect(px, py, TS, TS)
                    ctx.fillStyle = 'rgba(9,12,20,0.9)'
                    ctx.fillRect(px, py + TS - 2, TS, 1); ctx.fillRect(px + TS - 1, py, 1, TS)
                    if (sp > 0.82) { ctx.fillStyle = '#2c3a58'; ctx.fillRect(px + 3, py + 4, 3, 2) }
                } else if (t === SPIKE) {
                    ctx.fillStyle = '#38111a'
                    ctx.fillRect(px, py + TS - 5, TS, 5)
                    ctx.fillStyle = '#c0392b'
                    for (let k = 0; k < 4; k++) {
                        ctx.beginPath()
                        ctx.moveTo(px + k * 4, py + TS - 4)
                        ctx.lineTo(px + k * 4 + 2, py + 1)
                        ctx.lineTo(px + k * 4 + 4, py + TS - 4)
                        ctx.fill()
                    }
                } else if (t === CRACK) {
                    ctx.fillStyle = '#4a3320'
                    ctx.fillRect(px, py, TS, TS)
                    ctx.strokeStyle = '#e67e22'; ctx.lineWidth = 1.5
                    ctx.beginPath()
                    ctx.moveTo(px + 3, py + 1); ctx.lineTo(px + 7, py + 8); ctx.lineTo(px + 4, py + 15)
                    ctx.moveTo(px + 11, py + 2); ctx.lineTo(px + 9, py + 9); ctx.lineTo(px + 13, py + 14)
                    ctx.stroke()
                    ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.strokeRect(px + 0.5, py + 0.5, TS - 1, TS - 1)
                } else if (t === BULK) {
                    ctx.fillStyle = '#1d4d3a'
                    ctx.fillRect(px, py, TS, TS)
                    ctx.fillStyle = '#2e7d5b'
                    ctx.fillRect(px + 2, py + 2, TS - 4, TS - 4)
                    ctx.fillStyle = '#123527'
                    ctx.fillRect(px + 3, py + 3, 2, 2); ctx.fillRect(px + TS - 5, py + 3, 2, 2)
                    ctx.fillRect(px + 3, py + TS - 5, 2, 2); ctx.fillRect(px + TS - 5, py + TS - 5, 2, 2)
                }
            }
            // beacons
            for (const b of gs.world.beacons) {
                const px = b.x * TS + 8 - c.x, py = b.y * TS + 16 - c.y
                const on = gs.save.x === b.x && gs.save.y === b.y
                ctx.fillStyle = '#39404f'
                ctx.fillRect(px - 2, py - 20, 4, 20)
                const pulse = on ? 0.75 + 0.25 * Math.sin(gs.tick / 8) : 0.35 + 0.1 * Math.sin(gs.tick / 25)
                ctx.fillStyle = on ? `rgba(255,190,70,${pulse.toFixed(2)})` : `rgba(120,160,190,${pulse.toFixed(2)})`
                ctx.beginPath(); ctx.arc(px, py - 22, 5, 0, Math.PI * 2); ctx.fill()
                ctx.strokeStyle = on ? 'rgba(255,190,70,0.35)' : 'rgba(120,160,190,0.2)'
                ctx.beginPath(); ctx.arc(px, py - 22, 9 + (gs.tick % 30) * 0.25, 0, Math.PI * 2); ctx.stroke()
            }
            // items
            for (const it of gs.world.items) {
                if (it.taken) continue
                const px = it.x * TS + 8 - c.x, py = it.y * TS + 8 - c.y + Math.sin(gs.tick / 14) * 2
                ctx.fillStyle = 'rgba(0,0,0,0.35)'
                ctx.fillRect(px - 8, py - 8, 16, 16)
                ctx.fillStyle = it.id === 'beam' ? '#39d2ff' : it.id === 'bomb' ? '#ff9f43' : '#ff5cf5'
                ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = '#0b1020'
                if (it.id === 'beam') ctx.fillRect(px - 4, py - 1, 8, 2)
                else if (it.id === 'bomb') { ctx.fillRect(px - 1, py - 6, 2, 4) } else { ctx.fillRect(px - 3, py - 3, 6, 2); ctx.fillRect(px - 3, py + 1, 6, 2) }
            }
            // relic: a pulsing gold shard
            {
                const r = gs.world.relic
                const px = r.x * TS + 8 - c.x, py = r.y * TS + 8 - c.y
                const a = 0.6 + 0.4 * Math.sin(gs.tick / 9)
                ctx.fillStyle = `rgba(255,215,80,${a.toFixed(2)})`
                ctx.beginPath()
                ctx.moveTo(px, py - 8); ctx.lineTo(px + 5, py); ctx.lineTo(px, py + 8); ctx.lineTo(px - 5, py)
                ctx.fill()
                ctx.strokeStyle = `rgba(255,240,180,${(a * 0.5).toFixed(2)})`
                ctx.beginPath(); ctx.arc(px, py, 11 + (gs.tick % 26) * 0.2, 0, Math.PI * 2); ctx.stroke()
            }
            // crawlers
            for (const cr of gs.world.crawlers) {
                if (!cr.alive) continue
                const px = cr.x - c.x, py = cr.y - c.y
                const legs = Math.floor(gs.tick / 6) % 2
                ctx.strokeStyle = '#6d2f8f'; ctx.lineWidth = 2
                for (let k = 0; k < 3; k++) {
                    ctx.beginPath()
                    ctx.moveTo(px + 3 + k * 4, py + 6)
                    ctx.lineTo(px + k * 4 + (legs ? 1 : 0), py + 11)
                    ctx.stroke()
                }
                ctx.fillStyle = '#8e44ad'
                ctx.beginPath(); ctx.ellipse(px + 7, py + 5, 7, 4.5, 0, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = '#ff4d4d'
                ctx.fillRect(px + (cr.dir > 0 ? 10 : 2), py + 3, 2, 2)
            }
            // bombs + booms
            for (const b of gs.bombs) {
                const px = b.x - c.x, py = b.y - c.y
                ctx.fillStyle = '#ffb14d'
                ctx.beginPath(); ctx.arc(px + 5, py + 5, 5, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = b.fuse % 8 < 4 ? '#fff' : '#e74c3c'
                ctx.fillRect(px + 4, py - 2, 2, 3)
            }
            for (const bo of gs.booms) {
                const k = (gs.tick - bo.t) / 18
                const px = bo.x - c.x, py = bo.y - c.y
                ctx.strokeStyle = `rgba(255,${Math.floor(200 - k * 140)},60,${(1 - k).toFixed(2)})`
                ctx.lineWidth = 3
                ctx.beginPath(); ctx.arc(px, py, 6 + k * 26, 0, Math.PI * 2); ctx.stroke()
            }
            // beams
            for (const s of gs.shots) {
                const px = s.x - c.x, py = s.y - c.y
                ctx.fillStyle = '#7dffd8'
                ctx.fillRect(px, py, 8, 3)
                ctx.fillStyle = '#fff'
                ctx.fillRect(px + (s.vx > 0 ? 5 : 0), py + 1, 3, 1)
            }
            // the hunter
            {
                const p = gs.p
                const px = Math.round(p.x - c.x), py = Math.round(p.y - c.y)
                const blink = gs.invuln > 0 && gs.tick % 6 < 3
                if (!blink && !(gs.dead > 0)) {
                    const f = p.face
                    ctx.fillStyle = '#e67e22'                       // suit torso
                    ctx.fillRect(px + 1, py + 7, 8, 8)
                    ctx.fillStyle = '#c0392b'
                    ctx.fillRect(px + 1, py + 12, 8, 2)
                    ctx.fillStyle = '#dfe6ee'                       // helmet
                    ctx.fillRect(px + 1, py, 8, 7)
                    ctx.fillStyle = '#39d2ff'                       // visor
                    ctx.fillRect(f > 0 ? px + 5 : px + 1, py + 2, 4, 3)
                    ctx.fillStyle = '#8d5524'                       // legs
                    const run = gs.tick % 12 < 6 && Math.abs(p.vx) > 0.4
                    if (p.onGround) {
                        ctx.fillRect(px + (run ? 2 : 1), py + 15, 3, 5)
                        ctx.fillRect(px + (run ? 6 : 5), py + 15, 3, 4)
                    } else {
                        ctx.fillRect(px + 2, py + 15, 3, 4); ctx.fillRect(px + 5, py + 14, 3, 4)
                    }
                    ctx.fillStyle = '#9aa7b8'                       // arm cannon
                    ctx.fillRect(f > 0 ? px + 7 : px - 2, py + 8, 5, 3)
                }
            }
        }

        const hud = hudRef.current
        let lastHud = 0
        const syncHud = () => {
            const now = performance.now()
            if (now - lastHud < 90) return
            lastHud = now
            if (hud.energy) hud.energy.textContent = '\u25AE'.repeat(Math.max(0, gs.energy)) + '\u25AD'.repeat(Math.max(0, PLAYER.energy - gs.energy))
            if (hud.beam) hud.beam.style.opacity = gs.abil.beam ? '1' : '0.25'
            if (hud.bomb) hud.bomb.style.opacity = gs.abil.bomb ? '1' : '0.25'
            if (hud.sj) hud.sj.style.opacity = gs.abil.sjump ? '1' : '0.25'
            if (hud.score) hud.score.textContent = String(gs.score).padStart(5, '0')
            if (hud.toast) { hud.toast.textContent = toastMsg; hud.toast.style.opacity = toast > 0 ? '1' : '0' }
            if (toast > 0 && !pausedRef.current) toast--
        }

        const frame = (ts) => {
            raf = requestAnimationFrame(frame)
            if (!last) last = ts
            const ft = Math.min(ts - last, 250)          // the heist lesson: world-second cap
            last = ts
            if (!pausedRef.current) {
                acc += ft
                while (acc >= SIM_MS) { doSim(); acc -= SIM_MS }
            }
            paint()
            syncHud()
        }

        // ---------- input ----------
        const startPlay = () => {
            gs = makeGame()
            setMode('play')
            audioController.playSweep(330, 660, 0.2, 'square', 0.07)
        }
        const JUMP = ['Space', 'KeyZ']
        const FIRE = ['KeyX', 'KeyF']
        const onDown = (e) => {
            const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (code === 'Question') {
                pausedRef.current = !pausedRef.current
                setPaused(pausedRef.current)
                return
            }
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault()
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(); return }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
            if (pausedRef.current) return
            if (e.repeat) return
            if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
                if (e.code === 'ArrowLeft') keys.left = true
                else keys.right = true
            }
            if (e.code === 'ArrowDown') keys.down = true
            if (JUMP.includes(e.code)) jumpEdge = true
            if (FIRE.includes(e.code)) (keys.down ? bombEdge : fireEdge) = true
            if (e.code === 'KeyB') bombEdge = true
        }
        const onUp = (e) => {
            if (e.code === 'ArrowLeft') keys.left = false
            if (e.code === 'ArrowRight') keys.right = false
            if (e.code === 'ArrowDown') keys.down = false
            if (JUMP.includes(e.code) && gs.p.vy < 0) jumpCut = true
        }
        const onBlur = () => { keys.left = keys.right = keys.down = false }
        const onPointer = () => {
            const sc = screenRef.current
            if (sc === 'attract') startPlay()
            else if (sc === 'over' && performance.now() - overAtRef.current > 900) setMode('attract')
        }
        window.addEventListener('keydown', onDown)
        window.addEventListener('keyup', onUp)
        window.addEventListener('blur', onBlur)
        window.addEventListener('pointerdown', onPointer)

        const resize = () => {
            const r = wrap.getBoundingClientRect()
            if (!r.width || !r.height) return
            const sc = Math.min(r.width / VIEW_W, r.height / VIEW_H)
            canvas.style.width = `${VIEW_W * sc}px`
            canvas.style.height = `${VIEW_H * sc}px`
        }
        window.addEventListener('resize', resize)
        resize()
        raf = requestAnimationFrame(frame)

        // ---------- DEV hook ----------
        if (import.meta.env.DEV) {
            window.__metroidTest = {
                probe: () => ({
                    screen: screenRef.current, tick: gs.tick, t: gs.tick / 60,
                    player: { x: Math.round(gs.p.x), y: Math.round(gs.p.y), foot: footCell(gs.p) },
                    cam: cam(),
                    energy: gs.energy, deaths: gs.deaths, score: gs.score,
                    abil: { ...gs.abil },
                    items: gs.world.items.map(i => ({ id: i.id, taken: i.taken })),
                    taken: gs.world.items.filter(i => i.taken).length,
                    save: { ...gs.save },
                    cracks: gs.cracks, bulks: gs.bulks,
                    end: gs.end, win: gs.win, hash: stateHash(gs),
                    crawlers: gs.world.crawlers.map(cr => ({ x: Math.round(cr.x), alive: cr.alive })),
                    onGround: gs.p.onGround,
                    board: board(),
                }),
                camX: () => cam().x,
                // the renderer's OWN star placement — the harness predicts the
                // screen pixel of star (layer,k) at the CURRENT camera from
                // LAYERS factors it hardcodes itself, then samples the canvas.
                star: (layer, k) => ({ wx: starWorld(layer, k), sx: starScreenX(layer, k, cam().x) }),
                // DEV rig: relocate the body (setup only — damage and death
                // still come from the real collision loop, dashcheck lesson).
                teleport: (tx, ty) => {
                    if (screenRef.current !== 'play' || gs.end) return false
                    gs.p.x = tx * TS + 3; gs.p.y = (ty + 1) * TS - PLAYER.h
                    gs.p.vx = 0; gs.p.vy = 0
                    return true
                },
                start: startPlay,
                board: () => board(),
            }
        }

        return () => {
            if (import.meta.env.DEV && window.__metroidTest) delete window.__metroidTest
            window.removeEventListener('keydown', onDown)
            window.removeEventListener('keyup', onUp)
            window.removeEventListener('blur', onBlur)
            window.removeEventListener('pointerdown', onPointer)
            window.removeEventListener('resize', resize)
            cancelAnimationFrame(raf)
            canvas.remove()
        }
    }, [setMode])

    const handleResume = useCallback(() => {
        setPaused(false)
        pausedRef.current = false
    }, [])

    const play = screen === 'play'
    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden select-none" style={{ touchAction: 'none' }}>
            <div ref={stageRef} className="absolute inset-0 flex items-center justify-center" />

            <div className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${play ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute top-2 left-3 right-3 flex items-center gap-3 text-cyan-50 font-mono text-xs">
                    <span ref={setHud('energy')} className="text-red-400 text-sm tracking-widest" />
                    <span ref={setHud('beam')} className="border border-cyan-400/70 text-cyan-300 px-1.5 py-0.5 rounded">BEAM</span>
                    <span ref={setHud('bomb')} className="border border-orange-400/70 text-orange-300 px-1.5 py-0.5 rounded">BOMB</span>
                    <span ref={setHud('sj')} className="border border-fuchsia-400/70 text-fuchsia-300 px-1.5 py-0.5 rounded">SJUMP</span>
                    <span className="ml-auto text-xl font-bold" style={{ textShadow: '0 2px 5px #000' }}>
                        <span ref={setHud('score')}>00000</span>
                    </span>
                </div>
                <div ref={setHud('toast')} className="absolute inset-x-0 top-1/3 text-center text-amber-200 font-mono font-bold text-2xl transition-opacity duration-500" style={{ opacity: 0, textShadow: '0 0 12px #fa0' }} />
            </div>

            {screen === 'attract' && (
                <div className="absolute inset-x-0 top-6 text-center pointer-events-none">
                    <h1 className="text-5xl font-black text-emerald-300" style={{ textShadow: '0 4px 0 #0a3a2a, 0 10px 24px #000' }}>METROID-LITE</h1>
                    <p className="text-cyan-100/90 font-mono mt-1 text-sm">one cave. three upgrades. the way back is the way forward.</p>
                    <p className="text-white font-mono font-bold mt-5 animate-pulse">TAP / PRESS ANY KEY</p>
                    <p className="text-cyan-200/80 font-mono text-xs mt-2 px-6">
                        arrows / D-pad: move · SPACE / A: jump (press again mid-air once you own the SPACE JUMP)<br />
                        X / B button: FIRE the beam · hold DOWN + FIRE: drop a BOMB · beacons save and recharge you<br />
                        cracked blocks melt to beams, bulkheads fall to bombs, the relic sits above a shaft no single jump can clear<br />
                        this demo is the flow machine&apos;s own proven route, played tick for tick
                    </p>
                </div>
            )}

            {screen === 'over' && end && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-emerald-50 font-mono px-6">
                    <h2 className="text-4xl font-black mb-1 text-amber-300">RELIC RECOVERED</h2>
                    <p className="text-lg mb-4">{end.score} pts · {end.deaths} deaths</p>
                    <div className="bg-black/50 border border-emerald-500/40 rounded-lg p-4 w-80 max-w-full text-sm">
                        <div className="text-amber-300 font-bold mb-1 tracking-widest">HUNT LOG</div>
                        {board().map((r, i) => (
                            <div key={i} className="flex justify-between gap-2">
                                <span>{i + 1}.</span><span>{r.deaths} deaths</span><span>{r.score}</span>
                            </div>
                        ))}
                    </div>
                    <p className="mt-5 animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find(g => g.label === 'METROID-LITE')} onResume={handleResume} />}
            <VirtualControls secondAction={{ label: 'B', code: 'KeyX' }} visible={play && !paused} />
        </div>
    )
}

export default MetroidGame
