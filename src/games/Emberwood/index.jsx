// EMBERWOOD — an original HD-2D action-adventure (issue #738).
// Pixel heroes in a lit 3D diorama: one overworld + town + shop, two item-gated
// dungeons, six monster species, two bosses. MODERN bar (docs/ART.md).
// Engine notes: ./README.md

import React, { useEffect, useRef, useState } from 'react'
import VirtualControls from '../../components/VirtualControls'
import PauseOverlay from '../../components/PauseOverlay'
import { GAMES } from '../../config/games'
import { exposeGame, unexposeGame, contractHoldsLoop } from '../../utils/gameContract'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { audioController } from '../../utils/AudioController'
import { createSim, stepSim, simState, spawnRoom } from './sim.js'
import { createRenderer } from './render.js'
import { makeTextures } from './art.js'
import { proveGame, tilePath } from './solver.js'
import { SCREENS, TS } from './world.js'

const FIXED_DT = 1000 / 60
const W = 480
const H = 288

const solveSt = (sim) => ({
    cracked: sim.flags.cracked, doors: sim.flags.doorsOpen, switches: sim.flags.switchesOn,
    chests: sim.flags.chestsOpen, flags: sim.flags, killed: sim.flags.killed,
})

// attract autopilot: wander the screen, slash at everything, warp onward.
function attractStep(sim) {
    sim._botT = (sim._botT || 0) + 1
    if (!sim._botPath || !sim._botPath.length || sim._botScreen !== sim.screen || sim._botT % 260 === 0) {
        sim._botScreen = sim.screen
        const s = SCREENS[sim.screen]
        const open = []
        for (let y = 1; y < 10; y++) for (let x = 1; x < 15; x++) {
            const ch = s.rows[y][x]
            if (ch === '.' || ch === ',' || ch === 'S' || ch === '<') open.push([x, y])
        }
        const cur = [Math.floor(sim.hero.x / TS), Math.floor(sim.hero.y / TS)]
        const st = solveSt(sim)
        const pick = open[Math.floor(Math.random() * open.length)] || cur
        sim._botPath = (tilePath(sim.screen, cur, pick, st) || []).slice(1)
    }
    const wp = sim._botPath[0]
    const inp = { lx: 0, ly: 0 }
    if (wp) {
        const tx = wp[0] * TS + 8, ty = wp[1] * TS + 8
        const dx = tx - sim.hero.x, dy = ty - sim.hero.y
        if (Math.hypot(dx, dy) < 5) sim._botPath.shift()
        else {
            inp.lx = Math.abs(dx) > 1.5 ? Math.sign(dx) : 0
            inp.ly = Math.abs(dy) > 1.5 ? Math.sign(dy) : 0
        }
    }
    if (sim._botT % 34 < 3 && sim._botT % 34 !== 0) inp.aHeld = true
    if (sim._botT % 34 === 2) inp.aPressed = true
    if (sim._botT % 34 === 5) inp.aReleased = true
    return inp
}

const fxSound = (e) => {
    const ac = audioController
    try {
        switch (e.k) {
            case 'sword': ac.playTone(560, 0.06, 'square', 0.05); break
            case 'hit': ac.playNoise(0.08, 0.09); break
            case 'die': ac.playSweep(320, 90, 0.28, 'sawtooth', 0.08); break
            case 'cut': ac.playNoise(0.05, 0.05); break
            case 'boom': ac.playSweep(160, 40, 0.4, 'sawtooth', 0.12); ac.playNoise(0.3, 0.1); break
            case 'crack': ac.playNoise(0.25, 0.12); break
            case 'coin': ac.playTone(880, 0.05, 'square', 0.05); ac.playTone(1320, 0.07, 'square', 0.05, 0.05); break
            case 'heart': ac.playTone(660, 0.08, 'square', 0.06); ac.playTone(990, 0.12, 'square', 0.06, 0.07); break
            case 'key': ac.playTone(740, 0.06, 'triangle', 0.06); ac.playTone(1110, 0.1, 'triangle', 0.06, 0.06); break
            case 'unlock': ac.playTone(440, 0.05, 'square', 0.05); ac.playTone(660, 0.09, 'square', 0.05, 0.05); break
            case 'switch': ac.playTone(300, 0.08, 'square', 0.07); ac.playTone(220, 0.12, 'square', 0.05, 0.08); break
            case 'shoot': ac.playTone(700, 0.05, 'triangle', 0.05); break
            case 'spit': ac.playTone(240, 0.06, 'sawtooth', 0.04); break
            case 'hurt': ac.playSweep(220, 110, 0.18, 'sawtooth', 0.09); break
            case 'clank': ac.playTone(1200, 0.04, 'square', 0.05); break
            case 'stagger': ac.playSweep(400, 60, 0.5, 'sawtooth', 0.12); break
            case 'pop': ac.playTone(500, 0.05, 'triangle', 0.05); break
            case 'warp': ac.playSweep(300, 900, 0.25, 'sine', 0.06); break
            case 'grant': [660, 880, 1100, 1320].forEach((f, i) => ac.playTone(f, 0.1, 'square', 0.05, i * 0.09)); break
            case 'buy': ac.playTone(980, 0.06, 'square', 0.05); ac.playTone(1240, 0.08, 'square', 0.05, 0.06); break
            case 'potion': ac.playSweep(400, 800, 0.2, 'sine', 0.06); break
        }
    } catch { /* audio locked */ }
}

const HeartIcon = ({ full }) => (
    <svg width="18" height="16" viewBox="0 0 10 9" style={{ imageRendering: 'pixelated' }}>
        <g fill={full ? '#e8384a' : '#3a2230'}>
            <rect x="1" y="1" width="3" height="2" /><rect x="6" y="1" width="3" height="2" />
            <rect x="0" y="2" width="10" height="3" /><rect x="1" y="5" width="8" height="2" />
            <rect x="3" y="7" width="4" height="1" /><rect x="4" y="8" width="2" height="1" />
        </g>
    </svg>
)

const EMBERWOOD_HELP = GAMES.find(g => g.label === 'EMBERWOOD')

export default function Emberwood() {
    const canvasRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const screenRef = useRef('attract')
    const [paused, setPaused] = useState(false)
    const pausedRef = useRef(false)
    const [hud, setHud] = useState({ hp: 3, max: 3, embers: 0, items: {}, msg: null, shop: false, sel: 0, death: false, win: false, room: '' })
    const [attractLine, setAttractLine] = useState(0)

    useEffect(() => {
        const canvas = canvasRef.current
        const lite = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('lite')
        const sim = createSim(11)
        const rend = createRenderer(canvas, { lite, width: W, height: H })
        rend.loadTex(makeTextures())
        rend.buildScreen('ow-11', sim.flags, sim.cut)

        const keys = new Set()
        let prevA = false, prevB = false, prevUp = false, prevDn = false
        const readPad = () => {
            const lx = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0)
            const ly = (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0)
            const a = keys.has('Space') || keys.has('KeyZ')
            const b = keys.has('KeyX')
            const up = keys.has('ArrowUp') || keys.has('KeyW')
            const dn = keys.has('ArrowDown') || keys.has('KeyS')
            const inp = {
                lx, ly,
                aHeld: a, aPressed: a && !prevA, aReleased: !a && prevA,
                bPressed: b && !prevB, cPressed: keys.has('KeyC') && !keys.has('_c'),
                upPressed: up && !prevUp, downPressed: dn && !prevDn,
                startPressed: keys.has('Enter') && !keys.has('_e'),
            }
            keys.add('_c'); keys.add('_e')
            if (!keys.has('KeyC')) keys.delete('_c')
            if (!keys.has('Enter')) keys.delete('_e')
            prevA = a; prevB = b; prevUp = up; prevDn = dn
            return inp
        }
        const padToInput = (pad, prev) => {
            const lx = (pad.right ? 1 : 0) - (pad.left ? 1 : 0) || (pad.x || 0)
            const ly = (pad.down ? 1 : 0) - (pad.up ? 1 : 0) || (pad.y || 0)
            const inp = {
                lx: Math.abs(lx) > 0.15 ? lx : 0, ly: Math.abs(ly) > 0.15 ? ly : 0,
                aHeld: !!pad.a, aPressed: !!pad.a && !prev.a, aReleased: !pad.a && prev.a,
                bPressed: !!pad.b && !prev.b, cPressed: !!pad.b2 && !prev.b2,
                upPressed: !!pad.up && !prev.up, downPressed: !!pad.down && !prev.down,
            }
            prev.a = !!pad.a; prev.b = !!pad.b; prev.b2 = !!pad.b2; prev.up = !!pad.up; prev.down = !!pad.down
            return inp
        }
        const contractPrev = { a: false, b: false, b2: false, up: false, down: false }

        const setMode = (m) => { screenRef.current = m; setScreen(m) }

        const resetAttract = () => {
            const fresh = createSim((sim.seed + 7) >>> 0)
            Object.assign(sim, fresh)
            rend.buildScreen(sim.screen, sim.flags, sim.cut)
        }

        let raf = 0
        let last = performance.now()
        let acc = 0
        let hudTick = 0

        const loop = (now) => {
            raf = requestAnimationFrame(loop)
            let dt = now - last
            last = now
            if (dt > 250) dt = 250
            acc += dt
            const sc = screenRef.current
            let steps = 0
            while (acc >= FIXED_DT && steps < 8) {
                acc -= FIXED_DT
                steps++
                if (pausedRef.current || contractHoldsLoop()) break
                if (sc === 'attract') {
                    if (sim.win || sim.death) resetAttract()
                    stepSim(sim, attractStep(sim))
                } else if (sc === 'play') {
                    stepSim(sim, readPad())
                }
            }
            if (contractHoldsLoop()) acc = 0

            const fx = sim.fx.splice(0, sim.fx.length)
            if (sc !== 'pause') fx.forEach(fxSound)
            rend.sync(sim, now / 1000)
            rend.setFocus(sim.hero.x, -sim.hero.y)
            rend.draw()

            if (now - hudTick > 120) {
                hudTick = now
                setHud({
                    hp: sim.hero.hp, max: sim.hero.max, embers: sim.score,
                    items: { ...sim.items }, msg: sim.msgT > 0 ? sim.msg : null,
                    shop: sim.shop.open, sel: sim.shop.sel, death: sim.death, win: sim.win,
                    room: sim.roomName,
                })
            }
            if (sc === 'play' && sim.win && !sim._winSeen) {
                sim._winSeen = true
                setMode('win')
            }
            if (sc === 'attract' && Math.floor(now / 4000) !== attractRef.current) {
                attractRef.current = Math.floor(now / 4000)
                setAttractLine(a => (a + 1) % LINES.length)
            }
        }
        const attractRef = { current: 0 }
        raf = requestAnimationFrame(loop)

        const startPlay = () => {
            const fresh = createSim(11)
            Object.assign(sim, fresh)
            rend.buildScreen(sim.screen, sim.flags, sim.cut)
            setMode('play')
        }

        const onKeyDown = (e) => {
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault()
            if (e.code === 'Escape' || e.code === 'Backquote' || e.code === 'Slash') {
                if (screenRef.current === 'play' || screenRef.current === 'win') {
                    pausedRef.current = !pausedRef.current
                    setPaused(pausedRef.current)
                }
                return
            }
            if (screenRef.current === 'attract') { startPlay(); return }
            if (screenRef.current === 'win') { setMode('attract'); return }
            keys.add(e.code)
        }
        const onKeyUp = (e) => { keys.delete(e.code) }
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)

        if (import.meta.env.DEV) {
            exposeGame({
                id: 'emberwood',
                method: 'stick',
                buttons: ['Space', 'KeyX'],
                reads: ['up', 'down', 'left', 'right', 'a', 'b'],
                reset: (seed) => {
                    const fresh = createSim(seed || 11)
                    Object.assign(sim, fresh)
                    rend.buildScreen(sim.screen, sim.flags, sim.cut)
                    setMode('play')
                },
                tick: (pad) => { stepSim(sim, padToInput(pad || {}, contractPrev)) },
                state: () => ({ ...simState(sim), seed: sim.seed }),
                canvas: () => canvasRef.current,
            })
            window.__emberwoodTest = {
                state: () => simState(sim),
                reset: (seed) => { const fresh = createSim(seed || 11); Object.assign(sim, fresh); rend.buildScreen(sim.screen, sim.flags, sim.cut); setMode('play'); return simState(sim) },
                step: (n, pad) => { const p = pad || {}; for (let i = 0; i < n; i++) stepSim(sim, padToInput(p, contractPrev)); return simState(sim) },
                goto: (id, x, y) => {
                    spawnRoom(sim, id, [x ?? SCREENS[id]?.spawn?.[0] ?? 7, y ?? SCREENS[id]?.spawn?.[1] ?? 8])
                    rend.buildScreen(id, sim.flags, sim.cut)
                    return simState(sim)
                },
                prove: (opts) => proveGame(opts || { bombs: true }),
                win: () => { sim.flags.boss1 = true; sim.flags.boss2 = true; return true },
            }
            mountDbg({
                title: 'EMBERWOOD',
                getState: () => simState(sim),
                actions: [
                    { label: '+5 bombs', run: () => { sim.items.bombs += 5 } },
                    { label: '+3 keys', run: () => { sim.items.keys += 3 } },
                    { label: 'give bow', run: () => { sim.items.bow = true; sim.items.arrows += 10 } },
                    { label: 'PROGNOSIS (solver on live kit)', run: () => {
                        const p = proveGame({ bombs: sim.items.bombs > 0, bow: sim.items.bow })
                        console.log('EMBERWOOD PROGNOSIS:', p.win ? 'WINNABLE' : 'STUCK', 'seen:', p.seen.join(','), 'route:', p.route.map(r => r.type + ':' + (r.item || r.id)).join('>'))
                        return p.win ? 'WINNABLE' : 'STUCK'
                    } },
                ],
            })
        }

        const cleanup = () => {
            cancelAnimationFrame(raf)
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('keyup', onKeyUp)
            if (import.meta.env.DEV) { unexposeGame(); unmountDbg(); delete window.__emberwoodTest }
            rend.dispose()
        }
        return cleanup
    }, [])

    const line = LINES[attractLine % LINES.length]

    const inGame = screen === 'play'

    return (
        <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
            <canvas
                ref={canvasRef}
                width={W}
                height={H}
                className="max-w-full max-h-full"
                style={{ imageRendering: 'pixelated', width: 'min(100vw, calc((100vh - 140px) * 1.667))' }}
            />
            {/* HUD */}
            {inGame && !paused && (
                <div className="absolute top-2 left-2 right-2 flex justify-between pointer-events-none font-mono select-none" style={{ textShadow: '2px 2px 0 #000' }}>
                    <div>
                        <div className="flex gap-0.5 flex-wrap max-w-[220px]">
                            {Array.from({ length: hud.max }).map((_, i) => <HeartIcon key={i} full={i < hud.hp} />)}
                        </div>
                        <div className="text-amber-300 text-sm mt-1">EMBER x{hud.embers}{hud.items.keys ? ` · KEY x${hud.items.keys}` : ''}{hud.items.bombs ? ` · BOMB x${hud.items.bombs}` : ''}{hud.items.arrows && hud.items.bow ? ` · ARROW x${hud.items.arrows}` : ''}</div>
                    </div>
                    <div className="text-right">
                        <div className="text-violet-200 text-sm">{hud.room}</div>
                        {hud.items.bigkey && <div className="text-amber-200 text-xs">BIG KEY</div>}
                        {hud.items.shield && <div className="text-sky-200 text-xs">SHIELD</div>}
                    </div>
                </div>
            )}
            {inGame && hud.msg && !hud.shop && (
                <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-black/80 border border-amber-500 text-amber-100 font-mono text-sm px-4 py-2 rounded pointer-events-none text-center max-w-[80%]">
                    {hud.msg}
                </div>
            )}
            {inGame && hud.shop && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 pointer-events-none">
                    <div className="bg-stone-900 border-2 border-amber-600 p-4 font-mono text-sm w-64">
                        <div className="text-amber-300 text-center mb-2">EMBER SHOP</div>
                        {['POTION — 20', 'ARROWS x10 — 20', 'BOMBS x4 — 30', 'SHIELD — 80'].map((l, i) => (
                            <div key={l} className={`px-2 py-1 ${i === hud.sel ? 'bg-amber-600 text-black' : 'text-amber-100'}`}>{l}</div>
                        ))}
                        <div className="text-amber-400/70 mt-2 text-xs text-center">EMBERS: {hud.embers} · A BUY · B LEAVE</div>
                    </div>
                </div>
            )}
            {inGame && hud.death && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/85 font-mono">
                    <div className="text-center">
                        <div className="text-red-500 text-3xl font-bold tracking-widest mb-2">ASH FALLS</div>
                        <div className="text-stone-300 text-sm">PRESS A TO RISE AGAIN</div>
                    </div>
                </div>
            )}
            {screen === 'win' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/85 font-mono">
                    <div className="text-center">
                        <div className="text-amber-300 text-3xl font-bold tracking-widest mb-2">THE EMBER HEART</div>
                        <div className="text-stone-300 text-sm mb-1">The Cinder Wyrm is ash. The vale breathes again.</div>
                        <div className="text-amber-200 text-sm">EMBERS GATHERED: {hud.embers}</div>
                        <div className="text-stone-400 text-xs mt-3">PRESS ANY KEY</div>
                    </div>
                </div>
            )}
            {screen === 'attract' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none font-mono" style={{ textShadow: '3px 3px 0 #000' }}>
                    <div className="text-amber-300 text-5xl font-bold tracking-widest mb-1">EMBERWOOD</div>
                    <div className="text-violet-300 text-sm tracking-widest mb-8">THE CINDER VALE</div>
                    <div className="text-emerald-200 text-base mb-2">{line}</div>
                    <div className="text-white/80 text-sm mt-6 animate-pulse">PRESS ANY KEY OR TAP TO BEGIN</div>
                </div>
            )}
            {paused && <PauseOverlay game={EMBERWOOD_HELP} badge="THE CINDER VALE" onResume={() => { pausedRef.current = false; setPaused(false) }} />}
            <VirtualControls visible={inGame && !paused && !hud.death} secondAction={{ label: 'B', code: 'KeyX' }} />
        </div>
    )
}

const LINES = [
    'THE CINDER WYRM STIRS BENEATH THE SHRINE...',
    'SWORD, BOW, BOMB — THE VALE REMEMBERS YOUR NAME',
    'THE HUSK ONLY FALLS TO STEEL FROM BEHIND',
    'BLAST THE CRACKED WALLS — OLD GIFTS WAIT INSIDE',
    'FIRE AN ARROW INTO THE WYRM\u2019S OPENING MAW',
]
