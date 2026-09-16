// RACCOON HEIST — a 3D stealth caper for the arcade.
//
// You run a crew of trash pandas through a series of night heists: sneak past the
// watchmen's torches, grab the loot one sack at a time, drop it in the getaway cart,
// and be over the gate before the heat climbs. Built on three.js with every texture
// and mesh generated at runtime (see art.js) and every sound synthesised (audio.js).
//
// Structure of this file, in order:
//   1. renderer + scene bootstrap (StrictMode-safe: full teardown on cleanup)
//   2. camera rig (orbit for the attract diorama, chase rig for play)
//   3. fixed-timestep loop, one `update(dt)` per 60Hz tick
//   4. resize + aspect (camera-critical: a phone in portrait needs a wider lens)
//   5. input (keyboard + thumbstick feeding one object)
//   6. DEV-only `window.__heistTest` for scripts/heist*.mjs
//   7. React shell: canvas, HUD, overlays, touch pad
//
// The attract screen is a real 3D alley (alley.js) rebuilt from the concept frame that
// started this game, so the palette and the lighting rig are proven before a single
// level exists.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import PauseOverlay from '../../components/PauseOverlay'
import { GAMES } from '../../config/games'
import { PAL, disposables, makeNightEnv } from './art'
import { makeAlley } from './alley'

const FIXED_DT = 1000 / 60
const MOON = new THREE.Vector3(-9, 14, -7)

const isTouch = () => matchMedia('(hover: none) and (pointer: coarse)').matches || navigator.maxTouchPoints > 0

const RaccoonHeistGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)

    const setMode = useCallback((m) => {
        screenRef.current = m
        setScreen(m)
    }, [])

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        // The canvas is created here rather than rendered by JSX, and that is a
        // StrictMode fix, not a style preference: <StrictMode> mounts the effect twice,
        // and a React-owned <canvas> that had `forceContextLoss()` called on it hands the
        // second mount a dead WebGL context (three then dies in WebGLCapabilities with
        // "Cannot read properties of null (reading 'precision')"). Fresh canvas per
        // mount = fresh context per mount, and the harness can still find it by name.
        const canvas = document.createElement('canvas')
        canvas.dataset.heistStage = '1'
        canvas.className = 'block w-full h-full'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)

        // ---------------------------------------------------------- 1. bootstrap
        const touch = isTouch()
        const renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: !touch,
            alpha: false,
            powerPreference: 'high-performance',
            // Only dev needs readback (screenshot checks). Paying for
            // preserveDrawingBuffer on a phone is a real framerate, so prod skips it.
            preserveDrawingBuffer: !!import.meta.env.DEV,
        })
        renderer.outputColorSpace = THREE.SRGBColorSpace
        renderer.toneMapping = THREE.ACESFilmicToneMapping
        renderer.toneMappingExposure = 1.22
        renderer.shadowMap.enabled = true
        renderer.shadowMap.type = THREE.PCFSoftShadowMap
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, touch ? 1.6 : 2))

        const scene = new THREE.Scene()
        scene.background = new THREE.Color(PAL.nightDeep)
        scene.fog = new THREE.FogExp2(0x14293c, 0.022)
        // The one env map in the game. Metal, puddles and the vault dial need something
        // to reflect or "wet and shiny" renders as flat black.
        const env = makeNightEnv(renderer)
        scene.environment = env

        const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 160)
        camera.position.set(8, 6, 10)

        // Night key light: the moon. Cold, low-ish, and the only shadow caster in the
        // scene — a second one doubles the shadow pass for very little read.
        const moonLight = new THREE.DirectionalLight(0xa8d4ff, 1.8)
        moonLight.position.copy(MOON)
        moonLight.castShadow = true
        moonLight.shadow.mapSize.set(touch ? 512 : 1024, touch ? 512 : 1024)
        moonLight.shadow.camera.near = 1
        moonLight.shadow.camera.far = 60
        moonLight.shadow.camera.left = -16
        moonLight.shadow.camera.right = 16
        moonLight.shadow.camera.top = 16
        moonLight.shadow.camera.bottom = -16
        moonLight.shadow.bias = -0.0012
        moonLight.shadow.normalBias = 0.02
        scene.add(moonLight)
        scene.add(moonLight.target)

        // Sky bounce + a floor bounce that is almost black, so undersides stay dark
        // (that contrast is what makes the window glow read as warm).
        scene.add(new THREE.HemisphereLight(0x3a648c, 0x0a1622, 1.15))

        const alley = makeAlley({ seed: 11 })
        scene.add(alley.group)

        // ------------------------------------------------------------- 2. camera
        // Attract: a slow breath of an orbit that keeps the lit window on the right
        // third and the crew low-centre — the framing of the concept frame. The azimuth
        // is deliberately on the -X side of the yard: the other side is inside the brick
        // building, which is how the first screenshot of this scene ended up a close-up
        // of one enormous brick.
        let orbit = 0
        const look = new THREE.Vector3(0.25, 0.8, 0.9)
        const camAttract = (t) => {
            orbit += t * 0.05
            const a = 2.16 + Math.sin(orbit * 0.5) * 0.09
            const r = 11.4 + Math.sin(orbit * 0.33) * 0.4
            // ~24 degrees of pitch. Higher than that and the crew are two grey dots
            // seen from the ceiling; the concept frame sits at about this height.
            camera.position.set(Math.cos(a) * r, 4.4 + Math.sin(orbit * 0.42) * 0.3, Math.sin(a) * r)
            camera.lookAt(look)
        }

        // ------------------------------------------------------------- 3. loop
        let raf = 0
        let last = performance.now()
        let acc = 0
        let elapsed = 0
        let frameMs = 0
        let started = false

        const update = (dt) => {
            const t = elapsed
            alley.animate(dt, t)
            if (screenRef.current === 'attract') camAttract(dt)
            else {
                // Play mode lands in the next commit: the same alley, from behind the
                // sneaking raccoon, so the chase rig can be reviewed on its own.
                const r = alley.sneaker.position
                camera.position.lerp(new THREE.Vector3(r.x - 3.4, r.y + 2.5, r.z - 4.6), Math.min(1, dt * 3))
                camera.lookAt(r.x + 0.6, r.y + 0.5, r.z + 1.2)
                alley.sneaker.rotation.y += dt * 0.4
                if (alley.sneaker.position.length() < 8) alley.sneaker.translateZ(dt * 0.6)
            }
        }

        const frame = (now) => {
            raf = requestAnimationFrame(frame)
            const raw = Math.min(120, now - last)
            last = now
            if (pausedRef.current) return
            acc += raw
            // Never simulate more than 5 catch-up ticks: a backgrounded tab should skip
            // time, not fast-forward the guards through a wall of frames.
            let steps = 0
            while (acc >= FIXED_DT && steps < 5) {
                const dt = FIXED_DT / 1000
                elapsed += dt
                update(dt)
                acc -= FIXED_DT
                steps++
            }
            if (acc > FIXED_DT * 5) acc = 0
            const t0 = performance.now()
            renderer.render(scene, camera)
            // Exponential moving average of the *render* cost, which is the number a
            // phone-scale frame budget is judged against.
            frameMs += (performance.now() - t0 - frameMs) * 0.05
        }

        // ------------------------------------------------------------- 4. resize
        const resize = () => {
            const w = wrap.clientWidth || window.innerWidth
            const h = wrap.clientHeight || window.innerHeight
            renderer.setSize(w, h, false)
            camera.aspect = w / h
            // A phone held vertically needs a wider lens to see threats off-screen-side;
            // a desktop monitor can afford the tighter, filmier framing.
            camera.fov = w / h < 1 ? 62 : 52
            camera.updateProjectionMatrix()
        }
        resize()
        const ro = new ResizeObserver(resize)
        ro.observe(wrap)
        window.addEventListener('orientationchange', resize)

        // ------------------------------------------------------------- 5. input
        // Only the attract gesture for now; the movement rig lands with the sim.
        const start = () => {
            if (screenRef.current === 'attract') {
                started = true
                setMode('brief')
                window.setTimeout(() => { if (screenRef.current === 'brief') setMode('play') }, 2400)
            }
        }
        const onKeyDown = (e) => {
            if (e.code === 'Slash' && e.shiftKey) {           // '?'
                e.preventDefault()
                setPaused(p => { pausedRef.current = !p; return !p })
                return
            }
            if (['Space', 'Enter', 'NumpadEnter'].includes(e.code)) e.preventDefault()
            start()
        }
        const onPointer = () => start()
        window.addEventListener('keydown', onKeyDown)
        canvas.addEventListener('pointerdown', onPointer)

        // --------------------------------------------------------- 6. dev hook
        if (import.meta.env.DEV) {
            window.__heistTest = {
                version: 1,
                scene: () => scene,          // checks walk the graph (draw calls, materials)
                state: () => ({
                    screen: screenRef.current, paused: pausedRef.current, elapsed: +elapsed.toFixed(2),
                    cam: camera.position.toArray().map(n => +n.toFixed(2)),
                    fox: alley.sneaker.position.toArray().map(n => +n.toFixed(2)),
                    touch: isTouch(), started,
                }),
                press: () => start(),
                goto: (m) => setMode(m),
                step: (n = 60) => { for (let i = 0; i < n; i++) { elapsed += FIXED_DT / 1000; update(FIXED_DT / 1000) } },
                perf: () => ({ frameMs: +frameMs.toFixed(2) }),
            }
        }

        raf = requestAnimationFrame(frame)

        return () => {
            cancelAnimationFrame(raf)
            ro.disconnect()
            env.dispose()
            window.removeEventListener('orientationchange', resize)
            window.removeEventListener('keydown', onKeyDown)
            canvas.removeEventListener('pointerdown', onPointer)
            if (import.meta.env.DEV && window.__heistTest) delete window.__heistTest
            for (const g of disposables(alley.group)) g.dispose()
            scene.remove(alley.group)
            renderer.dispose()
            // NB: deliberately NOT forceContextLoss() — see the canvas comment above.
            if (canvas.parentNode === wrap) wrap.removeChild(canvas)
        }
    }, [setMode])

    const resume = useCallback(() => {
        pausedRef.current = false
        setPaused(false)
    }, [])

    // --------------------------------------------------------------- 7. shell --
    return (
        <div ref={stageRef} className="fixed inset-0 bg-black overflow-hidden select-none" style={{ touchAction: 'none' }}>

            {/* vignette + scrim: the two cheapest things that make a 3D night look graded */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: 'radial-gradient(ellipse at 50% 42%, rgba(0,0,0,0) 40%, rgba(3,10,17,0.5) 80%, rgba(2,6,10,0.88) 100%)' }}
            />
            {/* readable floor under the bottom copy (App.jsx pins a footer here too) */}
            <div
                className="absolute inset-x-0 bottom-0 h-[34vh] pointer-events-none"
                style={{ background: 'linear-gradient(to top, rgba(2,8,14,0.82), rgba(2,8,14,0))' }}
            />

            {screen === 'attract' && <TitleCard />}
            {screen === 'brief' && <BriefCard />}

            {paused && (
                <PauseOverlay game={GAMES.find(g => g.label === 'RACCOON HEIST')} onResume={resume} />
            )}
        </div>
    )
}

function TitleCard() {
    return (
        <div className="absolute inset-0 flex flex-col items-center justify-between pt-[7vh] pb-[26vh] px-5 pointer-events-none">
            <div className="text-center">
                <p className="font-mono text-[9px] sm:text-[11px] tracking-[0.42em] text-cyan-200/70 mb-2">JALFERN ARCADE PRESENTS</p>
                <h1
                    className="font-mono font-black leading-[0.86] text-[min(15vw,5.6rem)] text-[#f3e7c8]"
                    style={{ textShadow: '0 0 22px rgba(255,170,60,0.30), 0 4px 0 #0b1826, 0 10px 22px rgba(0,0,0,0.8)' }}
                >
                    RACCOON<br />
                    <span className="text-[#ffb45c]">HEIST</span>
                </h1>
                <p className="font-mono text-[9px] sm:text-[11px] tracking-[0.28em] text-cyan-100/75 mt-3">
                    THREE JOBS · ONE DUMPSTER · NO PLAN
                </p>
            </div>

            <div className="text-center">
                <p className="font-mono text-[11px] sm:text-sm tracking-[0.3em] text-[#ffb45c] animate-pulse">
                    TAP / PRESS ANY KEY TO START
                </p>
                <p className="font-mono text-[9px] sm:text-[11px] tracking-[0.18em] text-cyan-200/45 mt-3">
                    SNEAK · GRAB · LURE · CRACK · SCRAM
                </p>
            </div>
        </div>
    )
}

function BriefCard() {
    return (
        <div className="absolute inset-0 flex items-center justify-center p-5 pb-[24vh] pointer-events-none">
            <div className="max-w-sm w-full border-2 border-[#ffb45c]/60 bg-[#08131d]/90 p-5 font-mono text-[#f3e7c8] shadow-2xl">
                <p className="text-[9px] tracking-[0.35em] text-cyan-200/60">JOB 01 · BRIEFING</p>
                <h2 className="text-xl font-black tracking-widest mt-1 text-[#ffb45c]">THE CORNER BANK</h2>
                <p className="text-[11px] leading-relaxed mt-2 text-cyan-100/80">
                    The night watchman walks the yard at ten past midnight. Two sacks of
                    coin in the vault antechamber, one cart by the gate. Nobody sees a
                    raccoon. Nobody ever does.
                </p>
                <p className="text-[10px] tracking-[0.28em] text-[#ffb45c] mt-4 animate-pulse">
                    ASSEMBLING THE CREW…
                </p>
            </div>
        </div>
    )
}

export default RaccoonHeistGame
