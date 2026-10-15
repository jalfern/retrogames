import React, { useEffect, useRef } from 'react'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { mountDbg } from '../../utils/DebugKit'
import { makeGame, step, cloneGame, CFG, clockText, stateHash } from './sim.js'
import { decide } from './planner.js'
import { drawScene, VW, VH } from './art.js'
import { LEVEL_COUNT, LEVEL_NAMES, RW } from './levels.js'
import { SFX, trackFor } from './music.js'

const ATTRACT_MSGS = [
    'PRINCE OF PERSIA',
    'JAFFAR HAS THROWN YOU INTO THE DUNGEON',
    'ONE HOUR  ·  A SWORD, IF YOU FIND ONE',
    'PRESS ANY KEY TO START',
]

const DEATH_WHY = {
    spikes: 'IMPALED ON THE SPIKES',
    chomper: 'THE JAWS CLOSE ON YOU',
    fall: 'A BAD LANDING',
    sword: 'SLAIN BY THE SWORD',
    poison: 'POISONED',
    gate: 'THE PORTCULLIS CLAIMS YOU',
    shadow: 'THE SHADOW OVERTOOK YOU',
}

const INTERLUDES = [
    '"Sultan, your vizier has locked the palace.',
    'Only the prince can save her now."',
    '"The port gate is barred from within —',
    'find the hidden lever, or a way around."',
    '"Guards patrol the checkpoint. Steel,',
    'not speed, opens the way through."',
    '"A magic mirror stands in the barred',
    'corridor. Some glass shows other ways."',
    '"A shadow gathers behind you —',
    'what it drinks, you cannot."',
    '"The fat guard never tires. Time',
    'his swing; answer with your own."',
    '"The palace floor has fallen away.',
    'With grace, the fall will not kill."',
    '"The princess\'s mouse has escaped',
    'her cage. It knows the buttons."',
    '"In the inverted hall the world',
    'turns over. Trust your feet."',
    '"Two blades guard the inner court.',
    'Parry first — Persia favors patience."',
    '"There is no way back, prince.',
    'Only forward, and the hour drains."',
    '"Jaffar waits with your own face.',
    'Sheathe your sword and take it back."',
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
        let endAttract = 0
        const keys = { left: false, right: false, up: false, down: false, jump: false, shift: false, atk: false }
        let endSeen = false

        const prognose = () => {
            const c = cloneGame(g)
            let t = 0
            while (!(c.status === 'win' || c.status === 'lost') && t < 60 * 60 * 12) { step(c, decide(c)); t++ }
            return c.status
        }

        const unmountDbg = mountDbg({
            title: 'PRINCE OF PERSIA',
            getState: () => [
                `status=${g.status} level=${g.levelIndex} room=${g.room}/${g.level.nRooms} hp=${g.p.hp}/${g.p.maxHP} sword=${g.sword ? 'y' : 'n'}`,
                `pos=${g.p.x.toFixed(1)},${g.p.y.toFixed(1)} vx=${g.p.vx.toFixed(2)} vy=${g.p.vy.toFixed(2)} anim=${g.p.anim}`,
                `hang=${g.p.hang ? 'y' : 'n'} block=${g.p.block} atk=${g.p.atk} gate=${(g.gateOpen[g.room] || 0).toFixed(2)} exit=${g.exitOpen ? 'open' : 'shut'}`,
                `guards=${g.guards.map((q) => `${q.dead ? 'x' : q.hp + '@' + (q.x / 32).toFixed(1) + (q.wind > 0 ? '!w' : '')}`).join(' ')}`,
                `clock=${clockText(g)} cp=${g.cpReached ? 'y' : 'n'} lev=${g.p.lev} flip=${g.p.flip}`,
            ],
            actions: [
                { label: 'skip level', run: () => { g.status = 'clear'; g.statusT = 69 } },
                { label: 'win', run: () => { g.levelIndex = LEVEL_COUNT - 1; g.guards.forEach((q) => { q.dead = true }); g.status = 'clear'; g.statusT = 69 } },
                { label: 'give sword', run: () => { g.sword = true } },
                { label: 'open gate', run: () => { g.gateOpen[g.room] = 1 } },
                { label: 'prognosis', run: () => { prognose() === 'win' ? audioController.playTone(880, 0.1, 'square', 0.1) : audioController.playTone(110, 0.2, 'square', 0.12) } },
                { label: 'hurt', run: () => { g.p.hp = 1 } },
            ],
        })

        window.__popTest = {
            probe: () => ({
                attract, status: g.status, level: g.levelIndex, room: g.room,
                x: g.p.x, y: g.p.y, vx: g.p.vx, vy: g.p.vy, hp: g.p.hp, maxHP: g.p.maxHP,
                sword: g.sword, hang: !!g.p.hang, block: !!p_block(), gate: g.gateOpen[g.room],
                exit: g.exitOpen, clock: g.clock, events: g.events.length,
                music: trackFor(g),
            }),
            hash: () => stateHash(g),
            musicState: () => ({ ...audioController._musicState(), peak: audioController._peak() }),
        }
        const p_block = () => g.p.block

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
            if (!pausedRef.current && e.code === 'KeyR' && (g.status === 'lost' || g.status === 'win')) g = makeGame(0)
        }

        // ---- audio driven off sim events ----------------------------------------
        // Every sim event gets a voice via the SFX table in music.js; popcheck
        // pins that table against the sim, so nothing can ship silently muted.
        const play = (steps) => {
            for (const st of steps) {
                if (st[0] === 'tone') audioController.playTone(st[1], st[2], st[3], st[4], st[5])
                else if (st[0] === 'sweep') audioController.playSweep(st[1], st[2], st[3], st[4], st[5])
                else if (st[0] === 'noise') audioController.playNoise(st[1], st[2])
            }
        }
        const sfx = (before) => {
            const events = g.events.slice(before)
            for (const ev of events) {
                const recipe = SFX[ev.type]
                if (recipe) play(recipe(ev))
                if (ev.type === 'die') audioController.playDeath()
                if (ev.type === 'win') audioController.playFanfare()
            }
        }

        // the bed under the hour: silence on the attract screen and when you die
        // (the original drops to silence); the vizier's theme while Jaffar
        // stands in the room; palace stone gets its own grander bed.
        let musicTrack = null
        const music = () => {
            const wanted = attract ? null : trackFor(g)
            if (wanted === musicTrack) return
            musicTrack = wanted
            if (wanted) audioController.startMusic(wanted)
            else audioController.stopMusic()
        }

        // torch ambience: a thin crackle, denser where the room carries flame.
        // Deterministic pseudo-crackle (tick arithmetic) keeps replays honest.
        const ambience = () => {
            if (attract || g.status !== 'play' || g.tick % 18 !== 0) return
            const roomTorches = g.level.torches.filter((t) => Math.floor(t.c / RW) === g.room).length
            const beat = g.tick / 18
            if (beat % 7 < 2 + Math.min(3, roomTorches)) {
                play([['noise', 0.02 + ((g.tick * 13) % 5) * 0.004, 0.028]])
            }
        }

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
        }

        const update = () => {
            const before = g.events.length
            if (attract) {
                attractT++
                step(g, decide(g))
                if (g.status === 'win' || g.status === 'lost') {
                    endAttract++
                    if (endAttract > 100 || attractT > 60 * 60 * 3) { g = makeGame(0); attractT = 0; endAttract = 0 }
                } else endAttract = 0
            } else {
                if ((g.status === 'win' || g.status === 'lost') && !endSeen) endSeen = true
                if (endSeen && (keys.jump || keys.atk || keys.right || keys.left)) { g = makeGame(0); endSeen = false }
                step(g, readInputs())
            }
            sfx(before)
            music()
            ambience()
        }

        const draw = () => {
            ctx.clearRect(0, 0, VW, VH)
            drawScene(ctx, g, { attract })

            ctx.textAlign = 'center'
            if (attract) {
                const msg = ATTRACT_MSGS[Math.floor(attractT / 150) % ATTRACT_MSGS.length]
                // one message at a time, on a slim band under the HUD — never a
                // curtain across the playfield, so the autopilot demo stays seen
                const bandTop = 22
                const bandH = 48
                ctx.fillStyle = 'rgba(6,6,14,0.82)'
                ctx.fillRect(0, bandTop, VW, bandH)
                ctx.strokeStyle = 'rgba(232,208,96,0.55)'
                ctx.beginPath(); ctx.moveTo(0, bandTop + 0.5); ctx.lineTo(VW, bandTop + 0.5)
                ctx.moveTo(0, bandTop + bandH - 0.5); ctx.lineTo(VW, bandTop + bandH - 0.5); ctx.stroke()
                ctx.font = 'bold 18px monospace'
                ctx.fillStyle = '#e8d060'
                ctx.fillText(msg, VW / 2, bandTop + 22)
                ctx.font = '9px monospace'
                ctx.fillStyle = '#8a8ab0'
                ctx.fillText('AUTOPILOT DEMONSTRATION', VW / 2, bandTop + 38)
            } else if (g.status === 'dying') {
                ctx.font = 'bold 13px monospace'
                ctx.fillStyle = '#e04040'
                ctx.fillText(DEATH_WHY[g.deathReason] || 'YOU PERISH', VW / 2, VH / 2 - 16)
                ctx.font = '9px monospace'
                ctx.fillStyle = '#8a8ab0'
                ctx.fillText('THE HOUR KEEPS RUNNING', VW / 2, VH / 2 + 2)
            } else if (g.status === 'clear') {
                const last = g.levelIndex === LEVEL_COUNT - 1
                ctx.fillStyle = 'rgba(0,0,0,0.72)'
                ctx.fillRect(0, VH / 2 - 54, VW, 108)
                ctx.font = 'bold 14px monospace'
                ctx.fillStyle = '#80e0a0'
                ctx.fillText(last ? 'JAFFAR HAS FALLEN' : `LEVEL ${g.levelIndex + 1} CLEARED`, VW / 2, VH / 2 - 30)
                if (!last) {
                    ctx.font = 'bold 12px monospace'
                    ctx.fillStyle = '#e8d060'
                    ctx.fillText(LEVEL_NAMES[g.levelIndex + 1], VW / 2, VH / 2 - 8)
                }
                ctx.font = '8px monospace'
                ctx.fillStyle = '#8a8ab0'
                const pair = last
                    ? ['"The shadow folds into you. The hour is', 'nearly spent — she is waiting."']
                    : INTERLUDES.slice(g.levelIndex * 2, g.levelIndex * 2 + 2)
                ctx.fillText(pair[0] || '', VW / 2, VH / 2 + 14)
                ctx.fillText(pair[1] || '', VW / 2, VH / 2 + 26)
            } else if (g.status === 'win') {
                ctx.fillStyle = 'rgba(0,0,0,0.6)'
                ctx.fillRect(0, VH / 2 - 40, VW, 80)
                ctx.font = 'bold 17px monospace'
                ctx.fillStyle = '#e8d060'
                ctx.fillText('THE PRINCESS IS FREE', VW / 2, VH / 2 - 16)
                ctx.font = 'bold 11px monospace'
                ctx.fillStyle = '#ffffff'
                ctx.fillText(`TIME LEFT ${clockText(g)}`, VW / 2, VH / 2 + 4)
                ctx.font = '9px monospace'
                ctx.fillStyle = '#8a8ab0'
                ctx.fillText('PRESS R TO RIDE AGAIN', VW / 2, VH / 2 + 24)
            } else if (g.status === 'lost') {
                ctx.fillStyle = 'rgba(0,0,0,0.6)'
                ctx.fillRect(0, VH / 2 - 36, VW, 72)
                ctx.font = 'bold 15px monospace'
                ctx.fillStyle = '#e04040'
                ctx.fillText('THE SANDS RUN OUT', VW / 2, VH / 2 - 12)
                ctx.font = '9px monospace'
                ctx.fillStyle = '#8a8ab0'
                ctx.fillText('PRESS R TO TRY AGAIN', VW / 2, VH / 2 + 8)
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
            } else if (musicTrack) {
                audioController.stopMusic()
                musicTrack = null
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
            audioController.stopMusic()
            delete window.__popTest
        }
    }, [])

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center p-4">
            <div ref={containerRef} className="relative w-full max-w-[640px] aspect-[10/11] border-2 border-neutral-800 rounded-lg overflow-hidden shadow-2xl shadow-neutral-900 bg-black">
                <canvas ref={canvasRef} className="block w-full h-full" tabIndex={0} />
                {paused && <PauseOverlay game={GAMES.find((game) => game.label === 'PRINCE OF PERSIA')} onResume={handleResume} />}
            </div>
            <VirtualControls secondAction={{ label: '⚔', code: 'KeyX' }} visible={!paused} />
        </div>
    )
}

export default PrinceOfPersiaGame
