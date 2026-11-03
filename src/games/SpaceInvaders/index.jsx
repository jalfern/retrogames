import React, { useEffect, useRef } from 'react'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { exposeGame, unexposeGame, exposeFeedbackState, unexposeFeedbackState, seedFromQuery, seedRng } from '../../utils/gameContract'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { attractFrame, DIM } from './attract.js'
import { GW, GH, PLAYER_W, PLAYER_H, PLAYER_Y, INVADER_W, INVADER_H, BULLET_W, BULLET_H, UFO_Y, makeWorld, step, hash, done, activeCount } from './sim.js'

// SPACE INVADERS (Taito 1978) — world sim lives in sim.js (Node-provable).
// Pixel title: draws at the original's 224x256 world resolution, integer-scaled
// to the canvas, imageSmoothingEnabled off (AGENTS.md / docs/ART.md).

// Monochrome sprites as bit rows ('1' = lit pixel), original shapes.
const SPR = {
    squid: [
        ['00011000', '00111100', '01111110', '11011011', '11111111', '00100100', '01011010', '10100101'],
        ['00011000', '00111100', '01111110', '11011011', '11111111', '01100110', '10011001', '00100100'],
    ],
    crab: [
        ['00100000100', '00010001000', '00111111100', '01101110110', '11111111111', '10111111101', '10100000101', '00011011000'],
        ['00100000100', '10010001001', '10111111101', '11101110111', '11111111111', '01111111110', '00100000100', '01000000010'],
    ],
    octo: [
        ['000011110000', '011111111110', '111111111111', '111000000111', '111111111111', '001110011100', '011001100110', '110000000011'],
        ['000011110000', '011111111110', '111111111111', '111000000111', '111111111111', '001110011100', '110001100011', '011000000110'],
    ],
    player: ['0000001000000', '0000011100000', '0000011100000', '0111111111110', '1111111111111', '1111111111111', '1111111111111', '1111111111111'],
    ufo: ['0000011111100000', '0011111111111100', '0111111111111110', '1111111111111111', '0111111111111110', '0011100110011100', '0001000000001000'],
}
const ROW_SPRITE = ['squid', 'crab', 'crab', 'octo']

const drawSprite = (ctx, rows, x, y, col) => {
    ctx.fillStyle = col
    for (let r = 0; r < rows.length; r++) {
        for (let c = 0; c < rows[r].length; c++) {
            if (rows[r][c] === '1') ctx.fillRect(x + c, y + r, 1, 1)
        }
    }
}

const SpaceInvadersGame = () => {
    const canvasRef = useRef(null)
    const containerRef = useRef(null)
    const [paused, setPaused] = React.useState(false)
    const pausedRef = useRef(false)
    const [uiOver, setUiOver] = React.useState(false)

    const handleResume = () => {
        setPaused(false)
        pausedRef.current = false
        canvasRef.current?.focus()
    }

    useEffect(() => {
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        let animationFrameId

        // ---------- world + seed (#1473 seed-param) ----------
        // All gameplay entropy draws from a seeded mulberry32 stream; the
        // attract demo runs the SAME sim, so the seed regenerates at every
        // human start and ?seed=N replays the exact world.
        let seed = Math.floor(Math.random() * 1000000)
        let rand = seedRng(seed)
        let world = makeWorld(rand)
        const newRun = () => {
            seed = seedFromQuery(window.location.search) ?? Math.floor(Math.random() * 1000000)
            rand = seedRng(seed)
            world = makeWorld(rand)
        }

        let viewW = 0
        let viewH = 0
        let viewScale = 1
        let viewOX = 0
        let viewOY = 0
        let initialized = false
        const resize = () => {
            if (!containerRef.current || !canvas) return
            const { width, height } = containerRef.current.getBoundingClientRect()
            if (width === 0 || height === 0) return
            const dpr = window.devicePixelRatio || 1
            canvas.width = width * dpr
            canvas.height = height * dpr
            canvas.style.width = `${width}px`
            canvas.style.height = `${height}px`
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
            ctx.imageSmoothingEnabled = false
            viewW = width
            viewH = height
            viewScale = Math.max(1, Math.floor(Math.min(width / GW, height / GH)))
            viewOX = Math.floor((width - GW * viewScale) / 2)
            viewOY = Math.floor((height - GH * viewScale) / 2)
            if (!initialized) {
                initialized = true
            }
        }

        // ---------- input ----------
        let isAttractMode = true
        let attractTick = 0
        const keys = { ArrowLeft: false, ArrowRight: false, Space: false }

        const startFromAttract = () => {
            if (!isAttractMode) return
            isAttractMode = false
            newRun()
        }
        const restartToAttract = () => {
            isAttractMode = true
            attractTick = 0
            setUiOver(false)
            newRun()
        }

        const handleKeyDown = (e) => {
            if (e.key === '?' || (e.shiftKey && e.key === '/')) {
                const next = !pausedRef.current
                pausedRef.current = next
                setPaused(next)
                return
            }
            if (pausedRef.current) return
            if (done(world)) { restartToAttract(); return }
            startFromAttract()
            if (keys[e.code] !== undefined) keys[e.code] = true
        }
        const handleKeyUp = (e) => {
            if (keys[e.code] !== undefined) keys[e.code] = false
        }

        const handlePointerDown = () => {
            if (pausedRef.current) return
            if (done(world)) restartToAttract()
            else startFromAttract()
        }

        window.addEventListener('resize', resize)
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)
        window.addEventListener('pointerdown', handlePointerDown)
        resize()

        // ---------- attract autopilot (drives the SAME sim) ----------
        const attractInput = (s) => {
            const input = { left: false, right: false, fire: false }
            const dangerous = s.enemyBullets
                .filter((b) => b.y > GH - 80 && Math.abs(b.x - (s.playerX + PLAYER_W / 2)) < 12)
                .sort((a, b) => b.y - a.y)[0]
            if (dangerous) {
                if (dangerous.x > s.playerX + PLAYER_W / 2) input.left = true
                else input.right = true
            } else {
                const act = s.invaders.filter((i) => i.alive)
                if (act.length > 0) {
                    const target = act[s.tick % act.length]
                    const cx = s.playerX + PLAYER_W / 2
                    if (target.x + INVADER_W / 2 > cx + 3) input.right = true
                    else if (target.x + INVADER_W / 2 < cx - 3) input.left = true
                    else input.fire = true
                }
            }
            return input
        }

        // ---------- sim driving ----------
        let uiOverMirror = false
        const doSim = (input) => {
            const was = world.phase
            const prevCount = activeCount(world)
            const prevScore = world.score
            world = step(world, input, rand)
            if (world.score > prevScore) audioController.playNoise(0.08, 0.12)
            else if (prevScore === world.score && was === 'play' && world.phase === 'dying') audioController.playNoise(0.4, 0.25)
            if (was === 'play' && world.phase === 'over') audioController.playSweep(400, 80, 0.5)
            if (prevCount > 0 && activeCount(world) === 0) audioController.playSweep(200, 600, 0.3)
            if (world.phase === 'over' && !uiOverMirror) { uiOverMirror = true; setUiOver(true) }
        }

        const update = () => {
            if (isAttractMode) {
                attractTick++
                world = step(world, attractInput(world), rand)
                if (done(world)) { newRun(); attractTick = 0 }
                return
            }
            doSim({ left: keys.ArrowLeft, right: keys.ArrowRight, fire: keys.Space })
        }

        // ---------- render ----------
        const drawWorld = () => {
            ctx.save()
            ctx.translate(viewOX, viewOY)
            ctx.scale(viewScale, viewScale)
            ctx.fillStyle = '#000000'
            ctx.fillRect(0, 0, GW, GH)

            // original-style score header
            ctx.fillStyle = '#ffffff'
            ctx.font = '8px monospace'
            ctx.textAlign = 'left'
            ctx.fillText(`SCORE<1> ${String(world.score).padStart(4, '0')}`, 40, 10)
            ctx.fillText(`HI ${String(Math.max(world.score, 0)).padStart(4, '0')}`, 160, 10)

            // invaders, marching 2-frame animation
            const frame = Math.floor(world.tick / 16) % 2
            for (const i of world.invaders) {
                if (!i.alive) continue
                const sp = SPR[ROW_SPRITE[i.row]][frame]
                drawSprite(ctx, sp, i.x + (INVADER_W - sp[0].length) / 2, i.y, '#ffffff')
            }

            // UFO
            if (world.ufo) drawSprite(ctx, SPR.ufo, world.ufo.x, UFO_Y, '#ffffff')

            // shots
            ctx.fillStyle = '#ffffff'
            if (world.playerBullet) ctx.fillRect(world.playerBullet.x, world.playerBullet.y, BULLET_W, BULLET_H)
            for (const b of world.enemyBullets) ctx.fillRect(b.x, b.y, BULLET_W, BULLET_H)

            // player cannon — blinks during respawn
            const blink = world.phase === 'dying' && Math.floor(world.tick / 6) % 2 === 0
            if (!blink) drawSprite(ctx, SPR.player, Math.round(world.playerX), PLAYER_Y, '#ffffff')

            // green ground line
            ctx.fillStyle = '#00ff00'
            ctx.fillRect(0, PLAYER_Y + PLAYER_H + 2, GW, 1)

            // remaining lives (original shows n-1 spare cannons bottom-left)
            for (let l = 0; l < world.lives - 1 && world.phase !== 'over'; l++) {
                drawSprite(ctx, SPR.player, 4 + l * 16, GH - 8, '#ffffff')
            }
            ctx.fillStyle = '#ffffff'
            ctx.font = '8px monospace'
            ctx.textAlign = 'right'
            ctx.fillText(`WAVE ${world.wave}`, GW - 4, GH - 1)

            ctx.restore()
        }

        const draw = () => {
            ctx.fillStyle = '#000000'
            ctx.fillRect(0, 0, viewW, viewH)
            drawWorld()

            if (isAttractMode) {
                ctx.fillStyle = DIM
                ctx.fillRect(viewOX, viewOY, GW * viewScale, GH * viewScale)
                ctx.textAlign = 'center'
                for (const l of attractFrame(attractTick, viewW, viewH)) {
                    ctx.font = `${l.size}px monospace`
                    ctx.fillStyle = l.col
                    ctx.fillText(l.text, l.x, l.y)
                }
            } else if (done(world)) {
                ctx.fillStyle = 'rgba(0,0,0,0.72)'
                ctx.fillRect(viewOX, viewOY, GW * viewScale, GH * viewScale)
                ctx.textAlign = 'center'
                ctx.fillStyle = '#ffffff'
                ctx.font = `bold ${Math.max(16, Math.floor(viewW / 14))}px monospace`
                ctx.fillText('GAME OVER', viewW / 2, viewH / 2 - 10)
                ctx.font = `${Math.max(10, Math.floor(viewW / 28))}px monospace`
                ctx.fillText(`SCORE ${world.score}  WAVE ${world.wave}`, viewW / 2, viewH / 2 + 14)
                ctx.fillText('PRESS ANY KEY', viewW / 2, viewH / 2 + 30)
            }
        }

        // ---------- harness contract ----------
        exposeGame({
            id: 'invaders',
            buttons: ['left', 'right', 'a'],
            reset: (s) => {
                seed = s >>> 0
                rand = seedRng(seed)
                world = makeWorld(rand)
                uiOverMirror = false
                setUiOver(false)
                isAttractMode = false
                keys.ArrowLeft = keys.ArrowRight = keys.Space = false
            },
            tick: (pad) => {
                if (done(world)) { world.tick += 1; return }
                doSim({ left: !!pad.left, right: !!pad.right, fire: !!pad.a })
            },
            state: () => ({
                tick: world.tick, score: world.score, done: done(world),
                seed: seed, wave: world.wave, lives: world.lives,
                invadersLeft: activeCount(world), playerX: Math.round(world.playerX),
                phase: world.phase, hash: hash(world),
            }),
            canvas: () => canvas,
            // snapshot/restore omitted: state lives in sim.js and JSON-copies
            // cleanly, but the seed stream (rand closure) cannot round-trip —
            // optional part of the contract skipped per #391.
        })

        // production report carries the seed (#1473)
        exposeFeedbackState(() => ({
            tick: world.tick, score: world.score, done: done(world), seed: seed, lives: world.lives, wave: world.wave,
        }))

        mountDbg({
            title: 'SPACE INVADERS',
            getState: () => [
                `wave ${world.wave}  score ${world.score}  lives ${world.lives}  phase ${world.phase}`,
                `player ${Math.round(world.playerX)}  fleet ${activeCount(world)}/32  shots on field ${world.enemyBullets.length + (world.playerBullet ? 1 : 0)}`,
                `seed ${seed}  tick ${world.tick}  hash ${hash(world)}`,
            ],
            actions: [
                { label: 'Clear wave', run: () => { world.invaders.forEach((i) => { i.alive = false }) } },
                { label: 'Spawn UFO', run: () => { world.ufo = { x: 20, points: 100 } } },
                { label: 'Force game over', run: () => { world.lives = 0; world.phase = 'over' } },
            ],
        })

        // ---------- loop ----------
        let lastTime = 0
        let accumulator = 0
        const FIXED_DT = 1000 / 60
        const loop = (timestamp) => {
            if (!lastTime) lastTime = timestamp
            const frameTime = Math.min(timestamp - lastTime, 100)
            lastTime = timestamp
            if (!initialized) resize()
            if (!pausedRef.current && initialized) {
                accumulator += frameTime
                while (accumulator >= FIXED_DT) {
                    update()
                    accumulator -= FIXED_DT
                }
                draw()
            }
            animationFrameId = requestAnimationFrame(loop)
        }
        animationFrameId = requestAnimationFrame(loop)

        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
            window.removeEventListener('resize', resize)
            window.removeEventListener('pointerdown', handlePointerDown)
            cancelAnimationFrame(animationFrameId)
            unexposeGame()
            unexposeFeedbackState()
            unmountDbg()
        }
    }, [])

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center p-4">
            <div ref={containerRef} className="relative w-full max-w-[600px] aspect-[7/8] border-2 border-neutral-800 rounded-lg overflow-hidden shadow-2xl shadow-neutral-900 bg-black">
                <canvas ref={canvasRef} className="block w-full h-full" style={{ background: 'black' }} />
                {paused && <PauseOverlay game={GAMES.find(g => g.label === 'SPACE INVADERS')} onResume={handleResume} />}
            </div>
            <VirtualControls visible={!uiOver && !paused} />
        </div>
    )
}

export default SpaceInvadersGame
