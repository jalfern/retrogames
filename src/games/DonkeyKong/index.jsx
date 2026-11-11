import React, { useEffect, useRef } from 'react'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import WatchButton, { WatchToast, AttractWatchButton } from '../../components/WatchButton'
import { isWatchKey, isTakeoverKey, playWatchStart, playWatchStop, watchSfxLog, WATCH_ATTRACT_HINT } from '../../utils/watch'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { GAMES } from '../../config/games'
import { exposeGame, unexposeGame, exposeFeedbackState, unexposeFeedbackState, seedFromQuery, contractHoldsLoop } from '../../utils/gameContract'
import { GW, GH, makeRun, tickDonkeyKong, stateHash } from './sim.js'
import { attractFrame, DIM } from './attract.js'

// DONKEY KONG — shell only since #1637 b27: canvas, sound, chrome, seat.
// The world, physics and dice live in sim.js (seeded, Node-provable by
// kongcheck); WATCH (Y) seats the proven route the sweep certifies — climb
// zigzag, barrel arcs, zero deaths — and any other key, pad push or tap
// takes over from exactly where the watcher left the runner.

const DonkeyKongGame = () => {
    const canvasRef = useRef(null)
    const containerRef = useRef(null)
    const [paused, setPaused] = React.useState(false)
    const pausedRef = useRef(false)
    // The React mirrors of gs.watching / gs.attract — the sim flag is truth,
    // chrome (pill, toast, attract ▶ WATCH) reads the mirror.
    const [watching, setWatching] = React.useState(false)
    const [attractUi, setAttractUi] = React.useState(true)

    const handleResume = () => {
        setPaused(false)
        pausedRef.current = false
        canvasRef.current?.focus()
    }

    useEffect(() => {
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        let animationFrameId

        // =============================================
        // WORLD (fixed coordinate system 224 x 256, sim.js)
        // =============================================
        let seed = Math.floor(Math.random() * 1000000)
        let gs = makeRun(seed, { attract: true })

        const seat = () => {
            gs.watching = true
            setWatching(true)
            playWatchStart()
        }
        const release = (blip = true) => {
            gs.watching = false
            setWatching(false)
            if (blip) playWatchStop()
        }

        // Fresh run: seed regenerated (?seed=N wins), whole board rebuilt.
        const startRun = () => {
            seed = seedFromQuery(window.location.search) ?? Math.floor(Math.random() * 1000000)
            gs = makeRun(seed)
            keys.ArrowLeft = keys.ArrowRight = keys.ArrowUp = keys.ArrowDown = keys.Space = false
            setAttractUi(false)
            gs.watching = false // watch never lingers — a new run starts in your hands
            setWatching(false)
        }

        // =============================================
        // RESIZE (the shell owns the canvas; the world is fixed 224x256)
        // =============================================
        let viewWidth = 0, viewHeight = 0
        let attractTick = 0
        const resize = () => {
            if (containerRef.current && canvas) {
                const { width, height } = containerRef.current.getBoundingClientRect()
                const dpr = window.devicePixelRatio || 1
                canvas.width = width * dpr
                canvas.height = height * dpr
                canvas.style.width = `${width}px`
                canvas.style.height = `${height}px`
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
                viewWidth = width
                viewHeight = height
            }
        }
        window.addEventListener('resize', resize)
        resize()

        // =============================================
        // INPUT
        // =============================================
        const keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, Space: false }

        const overStarts = () => gs.over || gs.attract

        const handleKeyDown = (e) => {
            if (e.key === '?' || (e.shiftKey && e.key === '/')) {
                const newState = !pausedRef.current
                pausedRef.current = newState
                setPaused(newState)
                return
            }
            if (pausedRef.current) return

            // WATCH (b24 law): Y toggles the route. On attract/game over it
            // starts a fresh run AND seats — the proven climb runs from tick 0.
            if (isWatchKey(e)) {
                if (gs.attract || gs.over) { startRun(); seat(); return }
                if (gs.watching) release(); else seat()
                return
            }

            if (overStarts()) {
                startRun()
            }
            if (Object.prototype.hasOwnProperty.call(keys, e.code)) {
                if (gs.watching && isTakeoverKey(e)) release()
                keys[e.code] = true
            }
            if (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'Space') {
                e.preventDefault()
            }
        }
        const handleKeyUp = (e) => {
            if (Object.prototype.hasOwnProperty.call(keys, e.code)) {
                keys[e.code] = false
            }
        }
        // Phones: any tap starts or restarts the run; a tap DURING a watched
        // run is a takeover (the contract).
        const handleCanvasTap = () => {
            if (pausedRef.current) return
            if (overStarts()) startRun()
            else if (gs.watching) release()
        }
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)
        canvas.addEventListener('pointerdown', handleCanvasTap)

        // ------------------------------------------------------------------
        // EVENTS — tickDonkeyKong stamps these; the shell keeps all sound so
        // the sim stays pure enough for Node to replay it.
        // ------------------------------------------------------------------
        const applyEvents = (ev) => {
            if (ev.jump) audioController.playTone(400, 0.08, 'square')
            if (ev.jumpedBarrel) audioController.playTone(600, 0.08, 'square')
            if (ev.died) {
                audioController.playNoise(0.3, 0.4)
                audioController.playSweep(400, 80, 0.4, 'sawtooth')
            }
            if (ev.won) audioController.playSweep(400, 1000, 0.8, 'square')
            if (ev.over && !gs.attract && gs.watching) release(false) // the run ends in your hands (silent)
        }

        const heldInput = () => ({
            left: keys.ArrowLeft,
            right: keys.ArrowRight,
            up: keys.ArrowUp,
            down: keys.ArrowDown,
            jump: keys.Space,
        })

        // =============================================
        // DRAWING (arcade palette; the world is read-only out here)
        // =============================================
        const COL_GIRDER = '#d03030'    // red girders
        const COL_LADDER = '#00ffff'    // cyan ladders
        const COL_BG = '#000000'

        const drawGirder = (p) => {
            ctx.fillStyle = COL_GIRDER
            // Draw platform as a series of small girder bricks
            const brickW = 8
            const brickH = 4
            for (let bx = p.x; bx < p.x + p.w; bx += brickW) {
                const by = p.y + p.slope * (bx - p.x)
                const bw = Math.min(brickW, p.x + p.w - bx)
                // Two rows of bricks, offset
                ctx.fillRect(bx, by, bw - 0.5, brickH)
                ctx.fillRect(bx, by + brickH, bw - 0.5, brickH)
                // Darker line between rows
                ctx.fillStyle = '#801818'
                ctx.fillRect(bx, by + brickH - 0.5, bw, 1)
                ctx.fillStyle = COL_GIRDER
            }
        }

        const drawLadder = (l) => {
            ctx.fillStyle = COL_LADDER
            const h = l.yBot - l.yTop
            // Uprights
            ctx.fillRect(l.x - 4, l.yTop, 1.5, h)
            ctx.fillRect(l.x + 3, l.yTop, 1.5, h)
            // Rungs
            for (let ry = l.yTop + 4; ry < l.yBot; ry += 6) {
                ctx.fillRect(l.x - 4, ry, 8.5, 1.5)
            }
        }

        const drawOilBarrel = () => {
            const ox = 8, oy = 224
            // Barrel shape
            ctx.fillStyle = '#0088ff'
            ctx.fillRect(ox, oy, 16, 20)
            ctx.fillStyle = '#00aaff'
            ctx.fillRect(ox + 2, oy + 2, 12, 4)
            ctx.fillRect(ox + 2, oy + 14, 12, 4)
            // OIL text
            ctx.fillStyle = '#ffffff'
            ctx.font = '5px monospace'
            ctx.textAlign = 'center'
            ctx.fillText('OIL', ox + 8, oy + 13)
            // Fire flicker
            if (gs.tickN % 10 < 5) {
                ctx.fillStyle = '#ff6600'
                ctx.fillRect(ox + 4, oy - 4, 3, 4)
                ctx.fillRect(ox + 9, oy - 6, 3, 6)
                ctx.fillStyle = '#ffff00'
                ctx.fillRect(ox + 5, oy - 2, 2, 2)
                ctx.fillRect(ox + 10, oy - 3, 2, 3)
            } else {
                ctx.fillStyle = '#ff6600'
                ctx.fillRect(ox + 5, oy - 5, 3, 5)
                ctx.fillRect(ox + 8, oy - 3, 3, 3)
                ctx.fillStyle = '#ffff00'
                ctx.fillRect(ox + 6, oy - 2, 2, 2)
            }
        }

        const drawDK = () => {
            // DK position: on 6th platform (index 5), left side
            const dkPlat = gs.platforms[5]
            const dkX = 16
            const dkY = (dkPlat ? dkPlat.y + dkPlat.slope * (dkX + 14 - dkPlat.x) : 72) - 28
            const dkAnimFrame = Math.floor(gs.tickN / 16) % 2 // chest-beat cadence
            const s = 1 // pixel scale

            ctx.fillStyle = '#c84c0c' // brown
            // Body
            ctx.fillRect(dkX + 4*s, dkY + 8*s, 20*s, 12*s)
            // Head
            ctx.fillRect(dkX + 6*s, dkY, 16*s, 10*s)
            // Brow
            ctx.fillStyle = '#000000'
            ctx.fillRect(dkX + 8*s, dkY + 2*s, 12*s, 2*s)
            // Face
            ctx.fillStyle = '#e8a060'
            ctx.fillRect(dkX + 8*s, dkY + 4*s, 12*s, 5*s)
            // Eyes
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(dkX + 10*s, dkY + 4*s, 3*s, 2*s)
            ctx.fillRect(dkX + 16*s, dkY + 4*s, 3*s, 2*s)
            ctx.fillStyle = '#000000'
            ctx.fillRect(dkX + 11*s, dkY + 4*s, 1.5*s, 2*s)
            ctx.fillRect(dkX + 17*s, dkY + 4*s, 1.5*s, 2*s)
            // Mouth
            ctx.fillStyle = '#000000'
            ctx.fillRect(dkX + 12*s, dkY + 7*s, 6*s, 1.5*s)

            ctx.fillStyle = '#c84c0c'
            // Arms
            if (gs.dkThrowing) {
                // Throwing pose: arms forward
                ctx.fillRect(dkX + 22*s, dkY + 8*s, 6*s, 4*s)
                ctx.fillRect(dkX - 2*s, dkY + 10*s, 6*s, 4*s)
            } else if (dkAnimFrame === 0) {
                // Beat chest pose 1
                ctx.fillRect(dkX - 2*s, dkY + 8*s, 6*s, 4*s)
                ctx.fillRect(dkX + 24*s, dkY + 8*s, 6*s, 4*s)
            } else {
                // Beat chest pose 2
                ctx.fillRect(dkX, dkY + 6*s, 4*s, 6*s)
                ctx.fillRect(dkX + 22*s, dkY + 6*s, 4*s, 6*s)
            }
            // Legs
            ctx.fillRect(dkX + 6*s, dkY + 20*s, 6*s, 6*s)
            ctx.fillRect(dkX + 16*s, dkY + 20*s, 6*s, 6*s)
        }

        const drawPauline = () => {
            const topPlat = gs.platforms[6]
            const px = topPlat ? topPlat.x + topPlat.w / 2 - 4 : 108
            const py = topPlat ? topPlat.y + topPlat.slope * (px + 4 - topPlat.x) - 20 : 28
            // Dress (pink)
            ctx.fillStyle = '#ff88aa'
            ctx.beginPath()
            ctx.moveTo(px, py + 16)
            ctx.lineTo(px + 4, py + 6)
            ctx.lineTo(px + 8, py + 16)
            ctx.fill()
            // Head
            ctx.fillStyle = '#e8a060'
            ctx.fillRect(px + 2, py, 4, 5)
            // Hair
            ctx.fillStyle = '#ff88aa'
            ctx.fillRect(px + 1, py - 1, 6, 2)
            // HELP text
            if (gs.tickN % 60 < 40) {
                ctx.fillStyle = '#ffffff'
                ctx.font = '5px monospace'
                ctx.textAlign = 'center'
                ctx.fillText('HELP!', px + 4, py - 4)
            }
        }

        const drawJumpman = () => {
            const p = gs.player
            const mx = p.x
            const my = p.y
            const dir = p.dir

            ctx.save()
            ctx.translate(mx + p.w / 2, my + p.h)
            ctx.scale(dir, 1)

            if (gs.deathTimer > 0) {
                // Death spin animation
                const angle = (90 - gs.deathTimer) * 0.15
                ctx.rotate(angle)
                // Draw simple X
                ctx.strokeStyle = '#ff0000'
                ctx.lineWidth = 2
                ctx.beginPath()
                ctx.moveTo(-5, -14); ctx.lineTo(5, -2)
                ctx.moveTo(5, -14); ctx.lineTo(-5, -2)
                ctx.stroke()
                ctx.restore()
                return
            }

            // Hat (red)
            ctx.fillStyle = '#e40000'
            ctx.fillRect(-4, -16, 10, 3)
            ctx.fillRect(-5, -13, 3, 2)

            // Head (skin)
            ctx.fillStyle = '#e8a060'
            ctx.fillRect(-4, -13, 8, 5)

            // Eyes
            ctx.fillStyle = '#000000'
            ctx.fillRect(1, -12, 2, 2)

            // Body (blue overalls over red shirt)
            ctx.fillStyle = '#e40000'
            ctx.fillRect(-5, -8, 10, 4)
            ctx.fillStyle = '#0000cc'
            ctx.fillRect(-4, -6, 8, 5)

            // Belt
            ctx.fillStyle = '#ffff00'
            ctx.fillRect(-3, -6, 6, 1)

            if (p.climbing) {
                // Climbing animation
                const climbOff = (Math.floor(p.climbFrame / 6) % 2) * 2
                ctx.fillStyle = '#e8a060'
                ctx.fillRect(-5, -1, 3, 3 + climbOff)
                ctx.fillRect(2, -1, 3, 3 + (2 - climbOff))
                // Arms on ladder
                ctx.fillRect(-6, -10 - climbOff, 3, 3)
                ctx.fillRect(3, -10 - (2 - climbOff), 3, 3)
            } else if (Math.abs(p.vx) > 0.3 && p.grounded) {
                // Walking animation
                const step = Math.floor(p.walkFrame / 4) % 4
                ctx.fillStyle = '#e8a060'
                if (step < 2) {
                    ctx.fillRect(-4, -1, 3, 4)
                    ctx.fillRect(2, -1, 3, 3)
                } else {
                    ctx.fillRect(-4, -1, 3, 3)
                    ctx.fillRect(2, -1, 3, 4)
                }
            } else if (!p.grounded) {
                // Jumping
                ctx.fillStyle = '#e8a060'
                ctx.fillRect(-5, -1, 3, 2)
                ctx.fillRect(3, -1, 3, 2)
            } else {
                // Standing
                ctx.fillStyle = '#e8a060'
                ctx.fillRect(-4, -1, 3, 3)
                ctx.fillRect(2, -1, 3, 3)
            }

            ctx.restore()
        }

        const drawBarrel = (b) => {
            ctx.save()
            ctx.translate(b.x + b.w / 2, b.y + b.h / 2)
            if (!b.onLadder) {
                ctx.rotate(b.rot)
            }

            // Barrel body
            ctx.fillStyle = '#c84c0c'
            ctx.beginPath()
            ctx.arc(0, 0, b.w / 2, 0, Math.PI * 2)
            ctx.fill()

            // Barrel bands
            ctx.strokeStyle = '#ffcc00'
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.arc(0, 0, b.w / 2, 0, Math.PI * 2)
            ctx.stroke()
            // Cross detail
            ctx.beginPath()
            ctx.moveTo(-b.w / 3, 0); ctx.lineTo(b.w / 3, 0)
            ctx.moveTo(0, -b.w / 3); ctx.lineTo(0, b.w / 3)
            ctx.stroke()

            ctx.restore()
        }

        const drawHUD = (sx, sy, scale) => {
            // Draw in screen space
            ctx.fillStyle = '#ffffff'
            ctx.font = `${10 * scale}px monospace`
            ctx.textAlign = 'left'
            ctx.fillText(`SCORE`, sx + 4 * scale, sy - 12 * scale)
            ctx.fillStyle = '#00ffff'
            ctx.fillText(`${gs.score}`, sx + 4 * scale, sy - 4 * scale)

            // Lives
            ctx.fillStyle = '#ffffff'
            ctx.textAlign = 'right'
            const livesX = sx + GW * scale
            for (let i = 0; i < gs.lives; i++) {
                // Small jumpman head icon
                ctx.fillStyle = '#e40000'
                ctx.fillRect(livesX - 12 * scale - i * 14 * scale, sy - 12 * scale, 8 * scale, 4 * scale)
                ctx.fillStyle = '#e8a060'
                ctx.fillRect(livesX - 11 * scale - i * 14 * scale, sy - 8 * scale, 6 * scale, 4 * scale)
            }
        }

        // =============================================
        // MAIN DRAW
        // =============================================
        const draw = () => {
            ctx.fillStyle = COL_BG
            ctx.fillRect(0, 0, viewWidth, viewHeight)

            // Scale game world to fit view
            const scale = Math.min(viewWidth / GW, viewHeight / (GH + 24)) * 0.95
            const offsetX = (viewWidth - GW * scale) / 2
            const offsetY = (viewHeight - GH * scale) / 2 + 12 * scale

            // HUD above the game area
            drawHUD(offsetX, offsetY, scale)

            ctx.save()
            ctx.translate(offsetX, offsetY)
            ctx.scale(scale, scale)

            // Platforms
            gs.platforms.forEach(p => drawGirder(p))

            // Ladders (broken ones flicker)
            gs.ladders.forEach(l => {
                if (l.broken && gs.tickN % 30 < 15) return
                drawLadder(l)
            })

            // Oil barrel
            drawOilBarrel()

            // DK
            drawDK()

            // Pauline
            drawPauline()

            // Barrels
            gs.barrels.forEach(b => drawBarrel(b))

            // Player
            drawJumpman()

            // Attract mode overlay
            if (gs.attract) {
                attractTick++
                ctx.fillStyle = DIM
                ctx.fillRect(0, 0, GW, GH)
                ctx.textAlign = 'center'
                for (const l of attractFrame(attractTick, GW, GH)) {
                    ctx.font = `${l.size}px monospace`
                    ctx.fillStyle = l.col
                    ctx.fillText(l.text, l.x, l.y)
                }
                ctx.textAlign = 'start'
            }

            // Game over
            if (gs.over) {
                ctx.fillStyle = 'rgba(0,0,0,0.5)'
                ctx.fillRect(0, 0, GW, GH)
                ctx.fillStyle = '#ff0000'
                ctx.font = '12px monospace'
                ctx.textAlign = 'center'
                ctx.fillText('GAME OVER', GW / 2, GH / 2)
            }

            ctx.restore()
        }

        // =============================================
        // GAME LOOP
        // =============================================
        let lastTime = 0
        let accumulator = 0
        const FIXED_DT = 1000 / 60
        const loop = (timestamp) => {
            if (!lastTime) lastTime = timestamp
            const frameTime = Math.min(timestamp - lastTime, 100)
            lastTime = timestamp
            if (!pausedRef.current) {
                // QA contract: while __game.step() drives the sim, the rAF loop
                // yields the clock so scripted ticks stay deterministic.
                if (!contractHoldsLoop()) {
                    accumulator += frameTime
                    while (accumulator >= FIXED_DT) {
                        // The watcher and the attract demo own the wheel; held
                        // keys only reach the tick when the human is driving.
                        const input = gs.attract || gs.watching ? null : heldInput()
                        applyEvents(tickDonkeyKong(gs, input))
                        accumulator -= FIXED_DT
                    }
                }
                draw()
            }
            animationFrameId = requestAnimationFrame(loop)
        }
        animationFrameId = requestAnimationFrame(loop)

        if (import.meta.env.DEV) {
            window.__dkTest = {
                state: () => ({
                    attract: gs.attract, over: gs.over, score: gs.score, lives: gs.lives,
                    x: gs.player.x, y: gs.player.y, climb: gs.player.climbing, barrels: gs.barrels.length,
                }),
                // #1637 b27 — the watch contract the pilot drives against.
                watching: () => gs.watching,
                watchSfx: watchSfxLog,
                probe: () => ({
                    tick: gs.tickN, score: gs.score, lives: gs.lives,
                    x: Math.round(gs.player.x), y: Math.round(gs.player.y),
                    climbing: gs.player.climbing, barrels: gs.barrels.length,
                    attract: gs.attract, over: gs.over,
                }),
                start: startRun,
            }
            mountDbg({
                title: 'DONKEY KONG',
                getState: () => [
                    `score ${gs.score}  lives ${gs.lives}  barrels ${gs.barrels.length}`,
                    `jumpman ${Math.round(gs.player.x)},${Math.round(gs.player.y)} climb ${gs.player.climbing}  watching ${gs.watching}`,
                    `seed ${gs.seed}  tick ${gs.tickN}  over ${gs.over}`,
                ],
                actions: [
                    { label: 'Drop a barrel on the player', run: () => { gs.deathTimer = 0; gs.barrels.push({ x: gs.player.x, y: gs.player.y + 4, w: 10, h: 10, vx: 0, vy: 0, rot: 0, onLadder: false, falling: false }) } },
                    { label: 'Clear barrels', run: () => { gs.barrels = [] } },
                ],
            })
        }

        // QA contract (#377)
        exposeGame({
            id: 'donkeykong',
            buttons: ['left', 'right', 'up', 'down', 'a'],
            reset: (s) => {
                seed = s >>> 0
                gs = makeRun(seed)
                keys.ArrowLeft = keys.ArrowRight = keys.ArrowUp = keys.ArrowDown = keys.Space = false
                setAttractUi(false)
                gs.watching = false // watch never lingers
                setWatching(false)
            },
            tick: (pad) => {
                applyEvents(tickDonkeyKong(gs, {
                    left: !!pad.left,
                    right: !!pad.right,
                    up: !!pad.up,
                    down: !!pad.down,
                    jump: !!pad.a,
                }))
            },
            state: () => ({
                tick: gs.tickN, score: gs.score, done: gs.over, seed: gs.seed, lives: gs.lives,
                x: Math.round(gs.player.x), y: Math.round(gs.player.y),
                climbing: gs.player.climbing, barrels: gs.barrels.length,
                hash: stateHash(gs),
            }),
            canvas: () => canvas,
            // snapshot/restore omitted: the seeded stream rides gs.rngState and
            // the jump-scoring Set holds barrel refs — JSON would drop world
            // identity mid-rollout (#391).
        })

        // production report carries the seed (#1473)
        exposeFeedbackState(() => ({
            tick: gs.tickN, score: gs.score, done: gs.over, seed: gs.seed, lives: gs.lives,
        }))

        return () => {
            unexposeFeedbackState()
            window.removeEventListener('resize', resize)
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
            canvas.removeEventListener('pointerdown', handleCanvasTap)
            cancelAnimationFrame(animationFrameId)
            if (import.meta.env.DEV && window.__dkTest) delete window.__dkTest
            unexposeGame()
            unmountDbg()
        }
    }, [])

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center p-4">
            <div ref={containerRef} className="relative w-full max-w-[600px] aspect-[3/4] border-2 border-neutral-800 rounded-lg overflow-hidden shadow-2xl shadow-neutral-900 bg-black">
                <canvas ref={canvasRef} className="block w-full h-full" />
                {paused && <PauseOverlay game={GAMES.find(g => g.label === 'DONKEY KONG')} onResume={handleResume} />}
                {/* #1654: the discoverable WATCH line, before the first Y press. */}
                {attractUi && !paused && (
                    <div className="absolute inset-x-0 z-[70] flex flex-col items-center gap-2 pointer-events-none" style={{ bottom: '24%' }}>
                        <div className="text-emerald-200/70 font-mono text-[11px] tracking-widest">{WATCH_ATTRACT_HINT}</div>
                        <AttractWatchButton />
                    </div>
                )}
                {/* #1637 b27 — the proven climb; any key, pad push or tap takes over. */}
                {!attractUi && watching && <WatchToast className="fixed z-50" />}
                {!attractUi && !paused && (
                    <div className="fixed z-50 pointer-events-auto" style={{ top: 'calc(3.5rem + var(--sat, 0px))', right: 'calc(0.75rem + var(--sar, 0px))' }}>
                        <WatchButton on={watching} />
                    </div>
                )}
            </div>
            <VirtualControls visible={!paused} />
        </div>
    )
}

export default DonkeyKongGame
