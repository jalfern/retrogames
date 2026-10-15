import React, { useEffect, useRef } from 'react'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { mountDbg } from '../../utils/DebugKit'
import { makeGame, step, CFG, clockText, stateHash } from './sim.js'
import { decide } from './planner.js'
import { drawScene, VW, VH } from './art.js'
import { LEVEL_COUNT } from './levels.js'

const ATTRACT_MSGS = [
    'PRINCE OF PERSIA',
    'THE VIZIER JAFFAR HAS CAST YOU INTO THE DUNGEON',
    'ONE HOUR. ONE PRINCE. A SWORD IF YOU CAN DRAW ONE.',
    'PRESS ANY KEY TO START',
]

const PrinceOfPersiaGame = () => {
    const canvasRef = useRef(null)
    const containerRef = useRef(null)
    const [paused, setPaused] = React.useState(false)
    const pausedRef = useRef(false)

    const handleResume = () => {
        setPaused(false)
        pausedRef.current = false
        canvasRef.current?.focus()
    }

    useEffect(() => {
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')

        let g = makeGame(0)
        let attract = true
        let attractT = 0
        let deadAttract = 0
        const keys = { left: false, right: false, up: false, down: false, jump: false, shift: false, atk: false }
        let lastSeen = false

        const unmountDbg = mountDbg({
            title: 'PRINCE OF PERSIA',
            getState: () => [
                `status=${g.status} level=${g.levelIndex} lives=${g.lives} hp=${g.p.hp}`,
                `pos=${g.p.x.toFixed(1)},${g.p.y.toFixed(1)} vx=${g.p.vx.toFixed(2)} vy=${g.p.vy.toFixed(2)}`,
                `anim=${g.p.anim} stance=${p_stance()} hang=${g.p.hang ? 'y' : 'n'} port=${g.portLatch} clock=${clockText(g)}`,
                `guards=${g.guards.map((q) => `${q.dead ? 'x' : q.hp + '@' + (q.x / 32).toFixed(1) + (q.wind > 0 ? '!w' + q.stance : '')}`).join(' ')}`,
            ],
            actions: [
                { label: 'skip level', run: () => { g.status = 'clear'; g.statusT = 69 } },
                { label: 'win', run: () => { g.levelIndex = LEVEL_COUNT - 1; g.guards.forEach((q) => { q.dead = true }); g.status = 'clear'; g.statusT = 69 } },
                { label: 'strength', run: () => { g.p.strength = true } },
                { label: 'open port', run: () => { g.portLatch = true } },
                { label: 'lose life', run: () => { g.p.hp = 1 } },
            ],
        })
        const p_stance = () => g.p.stance

        window.__popTest = {
            probe: () => ({
                attract, status: g.status, level: g.levelIndex, lives: g.lives,
                x: g.p.x, y: g.p.y, vx: g.p.vx, vy: g.p.vy, hp: g.p.hp,
                hang: !!g.p.hang, port: !!g.portLatch, events: g.events.length, clock: g.clock,
            }),
            hash: () => stateHash(g),
        }

        const readInputs = () => ({ ...keys })

        const handleKeyDown = (e) => {
            if (e.key === '?' || (e.shiftKey && e.key === '/')) {
                const next = !pausedRef.current
                pausedRef.current = next
                setPaused(next)
                return
            }
            if (pausedRef.current) return
            if (attract) {
                attract = false
                g = makeGame(0)
                Object.keys(keys).forEach((k) => { keys[k] = false })
                audioController.playTone(660, 0.08, 'square', 0.12)
            }
            if (e.code === 'Space') { keys.jump = true; e.preventDefault() }
            if (e.code === 'ArrowLeft') { keys.left = true; e.preventDefault() }
            if (e.code === 'ArrowRight') { keys.right = true; e.preventDefault() }
            if (e.code === 'ArrowUp') { keys.up = true; e.preventDefault() }
            if (e.code === 'ArrowDown') { keys.down = true; e.preventDefault() }
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.shift = true
            if (e.code === 'KeyX' || e.code === 'KeyZ') keys.atk = true
        }
        const handleKeyUp = (e) => {
            if (e.code === 'Space') keys.jump = false
            if (e.code === 'ArrowLeft') keys.left = false
            if (e.code === 'ArrowRight') keys.right = false
            if (e.code === 'ArrowUp') keys.up = false
            if (e.code === 'ArrowDown') keys.down = false
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.shift = false
            if (e.code === 'KeyX' || e.code === 'KeyZ') keys.atk = false
        }
        const handleRestartKey = (e) => {
            if (!pausedRef.current && (e.code === 'KeyR') && (g.status === 'win' || g.status === 'lost')) {
                g = makeGame(0)
            }
        }

        // ---- audio driven off sim events ------------------------------------
        const sfx = (before) => {
            const events = g.events.slice(before)
            for (const ev of events) {
                if (ev.type === 'jump') audioController.playTone(300, 0.07, 'triangle', 0.12)
                else if (ev.type === 'grab') audioController.playTone(220, 0.05, 'square', 0.1)
                else if (ev.type === 'climb') audioController.playSweep(240, 420, 0.12, 'triangle', 0.12)
                else if (ev.type === 'swing') audioController.playSweep(900, 300, 0.08, 'sawtooth', 0.06)
                else if (ev.type === 'hit') { audioController.playNoise(0.08, 0.2); audioController.playTone(180, 0.1, 'square', 0.14) }
                else if (ev.type === 'parry') audioController.playNoise(0.06, 0.25)
                else if (ev.type === 'guardWind') audioController.playTone(140 + ev.stance * 40, 0.06, 'square', 0.07)
                else if (ev.type === 'guardDown') { audioController.playSweep(400, 80, 0.25, 'sawtooth', 0.18) }
                else if (ev.type === 'loose') audioController.playNoise(0.15, 0.18)
                else if (ev.type === 'potion') audioController.playSweep(ev.kind === 'X' ? 400 : 300, ev.kind === 'X' ? 90 : 900, 0.2, 'sine', 0.14)
                else if (ev.type === 'die') audioController.playSweep(300, 60, 0.5, 'sawtooth', 0.2)
                else if (ev.type === 'clear') audioController.playSweep(400, 800, 0.3, 'square', 0.14)
                else if (ev.type === 'win') { audioController.playSweep(400, 1200, 0.6, 'square', 0.16) }
            }
        }

        let viewW = VW, viewH = VH
        const resize = () => {
            if (!containerRef.current) return
            const { width, height } = containerRef.current.getBoundingClientRect()
            const dpr = window.devicePixelRatio || 1
            canvas.width = width * dpr
            canvas.height = height * dpr
            canvas.style.width = `${width}px`
            canvas.style.height = `${height}px`
            ctx.setTransform(dpr * (width / VW), 0, 0, dpr * (height / VH), 0, 0)
            ctx.imageSmoothingEnabled = false
            viewW = VW; viewH = VH
        }

        const update = () => {
            const before = g.events.length
            if (attract) {
                attractT++
                step(g, decide(g))
                if (g.status === 'win' || g.status === 'lost') {
                    deadAttract++
                    if (deadAttract > 100 || attractT > 60 * 60 * 3) { g = makeGame(0); attractT = 0; deadAttract = 0 }
                } else deadAttract = 0
            } else {
                if ((g.status === 'win' || g.status === 'lost') && !lastSeen) lastSeen = true
                if (lastSeen && (g.status === 'win' || g.status === 'lost')) {
                    if (keys.jump || keys.atk || keys.right || keys.left) { g = makeGame(0); lastSeen = false }
                }
                step(g, readInputs())
            }
            sfx(before)
        }

        const draw = () => {
            ctx.clearRect(-4, -4, VW + 8, VH + 8)
            drawScene(ctx, g, { attract })

            ctx.textAlign = 'center'
            if (attract) {
                const msg = ATTRACT_MSGS[Math.floor(attractT / 150) % ATTRACT_MSGS.length]
                ctx.font = 'bold 22px monospace'
                ctx.fillStyle = '#e8d060'
                ctx.fillText(msg, viewW / 2, viewH - 40)
                ctx.font = '12px monospace'
                ctx.fillStyle = '#8a8ab0'
                ctx.fillText('AUTOPILOT DEMONSTRATION', viewW / 2, viewH - 18)
            } else if (g.status === 'dying') {
                ctx.font = 'bold 20px monospace'
                ctx.fillStyle = '#e04040'
                const why = { spikes: 'IMPALED', gate: 'THE PORTCULLIS CLAIMS YOU', fall: 'A BAD LANDING', sword: 'SLAIN BY THE SWORD', poison: 'POISONED', time: 'SUNRISE' }[g.deathReason] || 'YOU PERISH'
                ctx.fillText(why, viewW / 2, viewH / 2 - 10)
                ctx.font = '12px monospace'
                ctx.fillStyle = '#8a8ab0'
                ctx.fillText(g.lives > 0 ? `LIVES REMAINING ${g.lives}` : '', viewW / 2, viewH / 2 + 14)
            } else if (g.status === 'clear') {
                ctx.font = 'bold 20px monospace'
                ctx.fillStyle = '#80e0a0'
                ctx.fillText(g.levelIndex === LEVEL_COUNT - 1 ? 'THE DOOR OPENS' : 'YOU ESCAPE THE CELL', viewW / 2, viewH / 2)
            } else if (g.status === 'win') {
                ctx.font = 'bold 26px monospace'
                ctx.fillStyle = '#e8d060'
                ctx.fillText('THE PRINCESS IS FREE', viewW / 2, viewH / 2 - 24)
                ctx.font = 'bold 16px monospace'
                ctx.fillStyle = '#ffffff'
                ctx.fillText(`TIME LEFT ${clockText(g)}`, viewW / 2, viewH / 2 + 6)
                ctx.font = '12px monospace'
                ctx.fillStyle = '#8a8ab0'
                ctx.fillText('PRESS R TO RIDE AGAIN', viewW / 2, viewH / 2 + 34)
            } else if (g.status === 'lost') {
                ctx.font = 'bold 24px monospace'
                ctx.fillStyle = '#e04040'
                ctx.fillText('THE SANDS RUN OUT', viewW / 2, viewH / 2 - 12)
                ctx.font = '12px monospace'
                ctx.fillStyle = '#8a8ab0'
                ctx.fillText('PRESS R TO TRY AGAIN', viewW / 2, viewH / 2 + 16)
            }
        }

        let lastTime = 0
        let acc = 0
        const FIXED_DT = 1000 / 60
        let raf
        const loop = (ts) => {
            if (!lastTime) lastTime = ts
            const frame = Math.min(ts - lastTime, 100)
            lastTime = ts
            if (!pausedRef.current) {
                acc += frame
                let n = 0
                while (acc >= FIXED_DT && n < 6) { update(); acc -= FIXED_DT; n++ }
                if (n === 6) acc = 0
                draw()
            }
            raf = requestAnimationFrame(loop)
        }

        resize()
        window.addEventListener('resize', resize)
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keydown', handleRestartKey)
        window.addEventListener('keyup', handleKeyUp)
        canvas.focus()
        raf = requestAnimationFrame(loop)

        return () => {
            cancelAnimationFrame(raf)
            window.removeEventListener('resize', resize)
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keydown', handleRestartKey)
            window.removeEventListener('keyup', handleKeyUp)
            unmountDbg()
            delete window.__popTest
        }
    }, [])

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center p-4">
            <div ref={containerRef} className="relative w-full max-w-[820px] aspect-[19/12] border-2 border-neutral-800 rounded-lg overflow-hidden shadow-2xl shadow-neutral-900 bg-black">
                <canvas ref={canvasRef} className="block w-full h-full" tabIndex={0} />
                {paused && <PauseOverlay game={GAMES.find((game) => game.label === 'PRINCE OF PERSIA')} onResume={handleResume} />}
            </div>
            <VirtualControls secondAction={{ label: '⚔', code: 'KeyX' }} visible={!paused} />
        </div>
    )
}

export default PrinceOfPersiaGame
