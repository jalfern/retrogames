// TEMPEST — the cabinet shell. Atari's 1981 vector tube shooter: slide along the
// glowing rim, fire down the faces, and stop everything before it reaches you.
// All art and audio are synthesized at runtime — see art.js / AudioController.
//
// Layout: 1. setup 2. events/juice 3. render 4. loop 5. input 6. DEV hook
// + DebugKit 7. React.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop } from '../../utils/gameContract'
import { makeGame, step, stateHash, TARGET_WAVES, LEVELS } from './sim.js'
import { plan } from './planner.js'
import { W, H, makeStars, drawStars, drawTube, drawPlayer, drawEnemies, drawBullets, posAt } from './art.js'

const SIM_MS = 1000 / 60
let cachedRun = null
const provenRun = () => { if (!cachedRun) cachedRun = plan(0); return cachedRun }

const TempestGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const overAtRef = useRef(0)
    const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])
    const hud = useRef({})
    const setHud = (k) => (el) => { hud.current[k] = el }
    const board = () => { try { return JSON.parse(localStorage.getItem('tempest.board') || '[]') } catch { return [] } }

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const canvas = document.createElement('canvas')
        canvas.dataset.tempestStage = '1'
        canvas.width = W; canvas.height = H
        canvas.className = 'block w-full h-full'
        canvas.style.imageRendering = 'pixelated'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false

        let gs = makeGame(0)
        let stars = makeStars(0)
        let raf = 0, last = 0, acc = 0
        let demoAt = 0, toast = 0, toastMsg = '', shake = 0, flash = 0
        const held = new Set()
        const evLog = []
        const parts = []

        const say = (m) => { toastMsg = m; toast = 150 }

        const burst = (x, y, n, col, speed, life) => {
            for (let i = 0; i < n; i++) {
                const a = Math.random() * Math.PI * 2
                const v = speed * (0.3 + Math.random())
                parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.5 + Math.random()), col })
            }
        }

        const handleEvents = (evts) => {
            for (const e of evts) evLog.push({ ...e, tick: gs.tick })
            if (evLog.length > 260) evLog.splice(0, evLog.length - 260)
            for (const e of evts) {
                if (e.kind === 'fire') {
                    audioController.playSweep(1200, 480, 0.07, 'square', 0.045)
                } else if (e.kind === 'super') {
                    audioController.playSweep(1700, 220, 0.16, 'sawtooth', 0.06)
                } else if (e.kind === 'kill') {
                    const p = posAt(gs, e.A, e.t)
                    audioController.playNoise(0.1, 0.045)
                    audioController.playTone(e.type === 'flip' ? 300 : e.type === 'spin' ? 220 : 520 + (e.t < 0.5 ? 120 : 0), 0.09, 'square', 0.05)
                    if (e.super) audioController.playTone(980, 0.12, 'square', 0.05)
                    burst(p.x, p.y, e.super ? 26 : 14, e.super ? '#fff2a0' : '#ffb050', 40, 26)
                } else if (e.kind === 'death') {
                    audioController.playDeath()
                    audioController.playNoise(0.55, 0.12)
                    shake = 16; flash = 12
                    const p = posAt(gs, e.A, 1)
                    burst(p.x, p.y, 42, '#ff5030', 70, 40)
                    burst(p.x, p.y, 20, '#ffd76b', 46, 30)
                    say(`SHIP DOWN — WAVE ${gs.level}`)
                } else if (e.kind === 'waveClear') {
                    audioController.playFanfare(); flash = 14
                    say(`WAVE ${e.level} CLEARED — +${1000 * e.level}`)
                } else if (e.kind === 'bonusLife') {
                    audioController.playTone(660, 0.1, 'square', 0.07)
                    audioController.playTone(880, 0.14, 'square', 0.07)
                    say('EXTRA SHIP')
                } else if (e.kind === 'win') { audioController.playFanfare(); flash = 18 } else if (e.kind === 'over') { audioController.playDeath() }
            }
        }

        const finish = () => {
            const sc = Math.round(gs.score)
            const b = board()
            localStorage.setItem('tempest.board', JSON.stringify([...b, { score: sc, date: new Date().toISOString().slice(2, 10) }].sort((a, b2) => b2.score - a.score).slice(0, 8)))
            overAtRef.current = performance.now()
            setMode('over')
        }

        const doSim = (inp) => {
            step(gs, inp)
            handleEvents(gs.events.splice(0))
            if (gs.end) finish()
        }

        const tickDemo = () => {
            const run = provenRun()
            if (demoAt >= run.script.length) { gs = makeGame(0); demoAt = 0 }
            doSim(run.script[demoAt++])
            if (gs.end) { gs = makeGame(0); demoAt = 0 }
        }

        const computeInput = () => ({
            left: held.has('ArrowLeft') || held.has('KeyA'),
            right: held.has('ArrowRight') || held.has('KeyD'),
            fire: held.has('Space') || held.has('KeyZ') || held.has('ArrowUp'),
        })

        const doFrameSim = () => {
            const sc = screenRef.current
            if (sc === 'attract') { tickDemo(); return }
            if (sc !== 'play') return
            doSim(computeInput())
        }

        // ------------------------------------------------------------- render ----
        const text = (s, x, y, size, col, glow = 0, align = 'center') => {
            ctx.font = `bold ${size}px monospace`; ctx.textAlign = align
            if (glow) { ctx.shadowColor = col; ctx.shadowBlur = glow }
            ctx.fillStyle = col; ctx.fillText(s, x, y); ctx.shadowBlur = 0
        }

        const drawWorld = () => {
            ctx.save()
            if (shake > 0) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake -= 0.8 }
            drawStars(ctx, stars, gs.tick)
            drawTube(ctx, gs, gs.tick)
            drawBullets(ctx, gs)
            drawEnemies(ctx, gs, gs.tick)
            drawPlayer(ctx, gs, gs.tick, gs.end === 'over')
            for (let i = parts.length - 1; i >= 0; i--) {
                const p = parts[i]
                p.x += p.vx / 60; p.y += p.vy / 60; p.life--
                if (p.life <= 0) { parts.splice(i, 1); continue }
                ctx.globalAlpha = Math.min(1, p.life / 22)
                ctx.fillStyle = p.col
                ctx.fillRect(p.x - 1, p.y - 1, 2, 2)
                ctx.globalAlpha = 1
            }
            ctx.restore()
            if (flash > 0) { ctx.fillStyle = `rgba(255,230,160,${flash * 0.014})`; ctx.fillRect(0, 0, W, H); flash -= 0.6 }
        }

        const drawHud = () => {
            text(`SCORE ${String(Math.round(gs.score)).padStart(6, '0')}`, 12, 22, 12, '#e9f7ff', 2, 'left')
            const cfg = LEVELS[Math.max(0, gs.level - 1) % LEVELS.length]
            text(`WAVE ${gs.level}/${TARGET_WAVES}`, W - 12, 22, 12, '#ffd76b', 3, 'right')
            text(`${cfg.faces} FACES`, W - 12, 38, 8, '#8fa3d8', 0, 'right')
            for (let i = 0; i < gs.lives; i++) {
                ctx.fillStyle = '#7df0ff'
                ctx.beginPath()
                ctx.moveTo(14 + i * 14, H - 12); ctx.lineTo(10 + i * 14, H - 6); ctx.lineTo(18 + i * 14, H - 6)
                ctx.closePath(); ctx.fill()
            }
        }

        const draw = () => {
            ctx.fillStyle = '#05070d'; ctx.fillRect(0, 0, W, H)
            drawWorld()
            drawHud()
            if (toast > 0) { text(toastMsg, W / 2, H - 44, 11, '#ffd76b', 6); toast-- }

            const sc = screenRef.current
            if (sc === 'attract') {
                ctx.fillStyle = 'rgba(3,4,12,0.72)'; ctx.fillRect(0, 0, W, H)
                text('TEMPEST', W / 2, 110, 44, '#7df0ff', 18)
                text('ATARI 1981 · VECTOR CLASSIC', W / 2, 136, 8, '#8fa3d8')
                if (Math.floor(gs.tick / 24) % 2 === 0) text('PRESS ANY KEY', W / 2, 178, 12, '#e9f7ff', 4)
                const msg = Math.floor(gs.tick / 90) % 3
                if (msg === 0) text('SLIDE THE RIM · FIRE DOWN THE FACES', W / 2, 220, 8, '#5d7094')
                else if (msg === 1) text('NOTHING REACHES THE RIM ALIVE', W / 2, 220, 8, '#5d7094')
                else text('EDGE SHOTS PIERCE BOTH FACES', W / 2, 220, 8, '#5d7094')
                const b = board()[0]; if (b) text(`HI-SCORE ${String(b.score).padStart(6, '0')}`, W / 2, 252, 9, '#ffd76b', 3)
            } else if (sc === 'over') {
                ctx.fillStyle = 'rgba(3,4,12,0.78)'; ctx.fillRect(0, 0, W, H)
                text(gs.end === 'win' ? 'ALL WAVES CLEARED' : 'OUT OF SHIPS', W / 2, 110, 22, gs.end === 'win' ? '#8fff9f' : '#ff5d5d', 12)
                text(`SCORE ${String(Math.round(gs.score)).padStart(6, '0')}   WAVE ${gs.level}/${TARGET_WAVES}`, W / 2, 140, 10, '#ffd76b', 4)
                text(`${gs.superKills} kills by super bullet`, W / 2, 162, 9, '#8fa3d8')
                if (Math.floor(gs.tick / 24) % 2 === 0) text('PRESS ANY KEY', W / 2, 204, 11, '#e9f7ff', 4)
            }
            ctx.fillStyle = 'rgba(0,0,0,0.10)'; for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1)
        }

        // --------------------------------------------------------------- loop ----
        const frame = (now) => {
            raf = requestAnimationFrame(frame)
            const dt = Math.min(now - last, 250); last = now
            if (pausedRef.current) return
            if (contractHoldsLoop()) { acc = 0 }
            else { acc += dt; while (acc >= SIM_MS) { doFrameSim(); acc -= SIM_MS } }
            draw()
            const hh = hud.current
            if (hh.score) hh.score.textContent = String(Math.round(gs.score))
            if (hh.wave) hh.wave.textContent = `${gs.level}/${TARGET_WAVES}`
            if (hh.lives) hh.lives.textContent = String(gs.lives)
        }

        // ------------------------------------------------------------- input ----
        const goPlay = () => {
            gs = makeGame(Math.floor(Math.random() * 1e9) + 1)
            demoAt = 0
            stars = makeStars(gs.seed)
            parts.length = 0
            shake = 0; flash = 0
            setMode('play')
        }
        const onKeyDown = (ev) => {
            if (ev.key === '?' || ev.code === 'Escape' || ev.code === 'Backquote') { ev.preventDefault(); setPaused((p) => !p); return }
            const sc = screenRef.current
            if (sc === 'attract') { goPlay(); return }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(ev.code)) ev.preventDefault()
            held.add(ev.code)
        }
        const onKeyUp = (ev) => { held.delete(ev.code) }
        const onPointer = () => {
            const sc = screenRef.current
            if (sc === 'attract') goPlay()
            else if (sc === 'over' && performance.now() - overAtRef.current > 900) setMode('attract')
        }
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)
        canvas.addEventListener('pointerdown', onPointer)

        // --------------------------------------------------------- DEV hook ----
        if (import.meta.env.DEV) {
            window.__tempestTest = {
                state: () => gs,
                hash: () => stateHash(gs),
                step: (n = 1) => { for (let i = 0; i < n; i++) doSim({ left: false, right: false, fire: false }) },
                stepWith: (inp) => doSim(inp),
                press: (codes) => { for (const c of codes) held.add(c) },
                release: (codes) => { for (const c of codes) held.delete(c) },
                start: () => goPlay(),
                plan: (seed) => plan(seed ?? 0),
                events: () => evLog,
                probe: () => ({
                    tick: gs.tick, screen: screenRef.current,
                    score: Math.round(gs.score), lives: gs.lives, level: gs.level,
                    faces: gs.faces, p: +gs.p.toFixed(2), enemies: gs.enemies.length,
                    bullets: gs.bullets.length, end: gs.end, hash: stateHash(gs),
                }),
                gameTime: () => gs.tick / 60,
            }
            exposeGame({
                id: 'tempest',
                buttons: ['left', 'right', 'up', 'a'],
                reset: (seed) => {
                    gs = makeGame(seed)
                    stars = makeStars(seed)
                    parts.length = 0
                    shake = 0; flash = 0
                    demoAt = 0
                    setMode('play')
                },
                tick: (pad) => doSim({ left: !!pad.left, right: !!pad.right, fire: !!(pad.a || pad.up) }),
                state: () => ({
                    tick: gs.tick, score: gs.score, done: gs.end !== null,
                    level: gs.level, loop: gs.loop, lives: gs.lives, faces: gs.faces, p: gs.p,
                    enemies: gs.enemies.length, bullets: gs.bullets.length, spawned: gs.spawned,
                    superKills: gs.superKills, seed: gs.seed, hash: stateHash(gs),
                }),
                canvas: () => canvas,
                snapshot: () => JSON.parse(JSON.stringify(gs)),
                restore: (s) => { gs = s },
            })
            mountDbg({
                title: 'TEMPEST',
                getState: () => [
                    `WAVE ${gs.level}/${TARGET_WAVES}  ${gs.faces} faces  ships ${gs.lives}  score ${Math.round(gs.score)}`,
                    `p ${gs.p.toFixed(1)}  enemies ${gs.enemies.length}  bullets ${gs.bullets.length}  spawned ${gs.spawned}`,
                    `kills ${gs.killsThisWave}  supers ${gs.superKills}  next life ${gs.nextLife}`,
                ],
                actions: [
                    { label: 'PROGNOSIS', run: () => { const r = plan(gs.seed); return r.won && r.deaths === 0 ? `route still winnable deathless (${(r.ticks / 60).toFixed(0)}s)` : `NOT deathless: deaths ${r.deaths} won ${r.won}` } },
                    { label: '+1 ship', run: () => { gs.lives += 1; return 'ships +1 (cheat)' } },
                    { label: 'clear wave', run: () => { gs.enemies = []; gs.spawned = 0; return 'wave emptied (cheat)' } },
                ],
            })
        }

        last = performance.now()
        raf = requestAnimationFrame(frame)
        return () => {
            cancelAnimationFrame(raf)
            if (canvas.parentNode === wrap) wrap.removeChild(canvas)
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('keyup', onKeyUp)
            if (import.meta.env.DEV) { unmountDbg(); unexposeGame(); delete window.__tempestTest }
        }
    }, [setMode])

    useEffect(() => { pausedRef.current = paused }, [paused])

    const entry = GAMES.find((g) => g.label === 'TEMPEST')

    return (
        <div className="relative w-full h-full flex flex-col items-center justify-center bg-[#05070d] select-none">
            <div ref={stageRef} className="relative w-full max-w-[900px] aspect-[4/3] shadow-[0_0_44px_rgba(125,240,255,0.18)]" />
            <div className="flex gap-6 mt-2 text-[11px] font-mono tracking-widest text-[#8fa3d8]">
                <span>SCORE <span ref={setHud('score')} className="text-[#e9f7ff]">000000</span></span>
                <span>WAVE <span ref={setHud('wave')} className="text-[#ffd76b]">1/4</span></span>
                <span>SHIPS <span ref={setHud('lives')} className="text-[#7df0ff]">4</span></span>
            </div>
            <VirtualControls visible={screen === 'play' && !paused} />
            {paused && <PauseOverlay game={entry} onResume={() => setPaused(false)} />}
        </div>
    )
}

export default TempestGame
