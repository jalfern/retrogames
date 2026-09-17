// RACCOON HEIST — a 3D stealth caper for the arcade.
//
// You run a crew of trash pandas through a series of night heists: slip past the
// watchman's torch, carry the loot one sack at a time to the getaway cart, and be over
// the gate before the heat climbs. three.js for the frame, every texture and mesh
// generated at runtime (art.js/world.js), every sound synthesised (audio.js), and the
// whole ruleset (sight, noise, heat, gait) in pure functions that Node can test
// (stealth.js/levels.js, audited by `npm run heistcheck`).
//
// This file is only the *shell*: renderer, camera, input, HUD, and the job flow. It
// decides nothing about the game — `engine.update()` does that. That split is what
// lets heistcheck drive the sim with no browser at all.
//
//   1. renderer bootstrap (StrictMode-safe: the effect owns the canvas)
//   2. per-job world + engine mount, with the lamp-light pool
//   3. fixed-timestep loop
//   4. resize + aspect (a phone in portrait needs a wider lens)
//   5. input: keyboard, mouse-drag camera, twin-stick touch pad → one input object
//   6. DEV-only `window.__heistTest`
//   7. React shell: canvas, HUD, pads, cards
//
// Note on controls: this title does NOT use the shared <VirtualControls />. That pad
// emits discrete arrow-key presses, and an analog thumb position is not a discrete key
// — a 3D game with an 8-way tap-pad feels like driving a shopping trolley through a
// letterbox. Instead there is a proper floating stick (HeistPad) plus the same key
// codes the shared pad uses (Arrow*/Space), so harnesses and keyboards still work.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import PauseOverlay from '../../components/PauseOverlay'
import { GAMES } from '../../config/games'
import { LEVELS, T, at, cellOf } from './levels.js'
import { PAL, disposables, makeNightEnv } from './art'
import { makeAlley } from './alley'
import { buildWorld } from './world.js'
import { createEngine } from './engine.js'
import { heistAudio } from './audio.js'

/**
 * The one key table. Handlers read it, the attract card and the pause card are written
 * from it, and `npm run heistplay` parses it and cross-checks every key promised in
 * `src/config/games.js`. That contract exists because the printed controls once said
 * "B / E: fling a shiny · F: crouch" while B did nothing, E grabbed, and F lured — so
 * the help screen was a list of things that did not work, which is worse than no help
 * screen. Two keys per action is fine; a documented key that does nothing is not.
 */
const KEYMAP = {
    grab: ['KeyE', 'Space', 'KeyZ'],
    throw: ['KeyF', 'KeyB'],
    swap: ['KeyQ', 'KeyX', 'Tab'],
    cam: ['KeyG'],
}
const HOLD_KEYS = KEYMAP.grab
const CROUCH_KEYS = ['KeyC', 'ControlLeft', 'ControlRight']
const DASH_KEYS = ['ShiftLeft', 'ShiftRight', 'KeyR']
const KEY_LABEL = { grab: 'E / SPACE', throw: 'F / B', swap: 'Q / X', cam: 'G' }
const HELD_LABEL = 'HOLD E / SPACE'

const FIXED_DT = 1000 / 60
/** Catch-up window, in ms of world time per frame. See `frame()` for why 250. */
const MAX_CATCHUP = 250
const MAX_STEPS = Math.round(MAX_CATCHUP / FIXED_DT)
const MOON = new THREE.Vector3(-9, 14, -7)

const isTouch = () => matchMedia('(hover: none) and (pointer: coarse)').matches || navigator.maxTouchPoints > 0
// The pad is for thumbs. On a mouse-and-keyboard machine it is two large discs
// covering the level, so it stays home — except via ?pad=1, which is how the browser
// harness exercises the touch layout on a desktop runner (same trick as ?sensor=eye
// in the AI spine: an escape hatch on the URL, never a rebuild).
const wantPad = () => isTouch() || new URLSearchParams(location.search).has('pad')

// Human-readable cell type for the harness probe: "a raccoon stuck in a wall" should
// print as "WALL", not "3".
const CELL_NAME = Object.fromEntries(Object.entries(T).map(([k, v]) => [v, k]))
const cellName = (lvl, wx, wz) => {
    const [cx, cy] = cellOf(lvl, wx, wz)
    return CELL_NAME[at(lvl, cx, cy)] || '??'
}

/**
 * "Is this actually drawn" is a question about the whole parent chain: a mesh inside an
 * invisible group renders nowhere while answering `visible === true` itself. Every scene
 * interrogation in this file goes through it — the first affordance check used the leaf
 * flag and so survived the mutation that hid the padlock inside an invisible group.
 */
const drawn = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true }

const RaccoonHeistGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [job, setJob] = useState(0)
    const [hud, setHud] = useState(null)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const jobRef = useRef(0)
    const apiRef = useRef(null)
    const engineRef = useRef(null)
    const inputRef = useRef({
        mx: 0, my: 0, keys: new Set(), stick: { x: 0, y: 0 }, look: { x: 0, y: 0 },
        actions: [], hold: false,
    })

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
        renderer.toneMappingExposure = 1.34
        renderer.shadowMap.enabled = true
        renderer.shadowMap.type = THREE.PCFSoftShadowMap
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, touch ? 1.55 : 2))

        const scene = new THREE.Scene()
        scene.background = new THREE.Color(PAL.nightDeep)
        scene.fog = new THREE.FogExp2(0x14293c, 0.022)
        // The one env map in the game. Metal, puddles and the vault dial need something
        // to reflect or "wet and shiny" renders as flat black.
        const env = makeNightEnv(renderer)
        scene.environment = env

        const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 190)
        camera.position.set(8, 6, 10)

        // Night key light: the moon. Cold, low-ish, and the only shadow caster in the
        // scene — a second one doubles the shadow pass for very little extra read.
        const moonLight = new THREE.DirectionalLight(0xa8d4ff, 1.8)
        moonLight.position.copy(MOON)
        moonLight.castShadow = true
        moonLight.shadow.mapSize.set(touch ? 512 : 1024, touch ? 512 : 1024)
        moonLight.shadow.camera.near = 1
        moonLight.shadow.camera.far = 70
        const SH = 22
        moonLight.shadow.camera.left = -SH
        moonLight.shadow.camera.right = SH
        moonLight.shadow.camera.top = SH
        moonLight.shadow.camera.bottom = -SH
        moonLight.shadow.bias = -0.0012
        moonLight.shadow.normalBias = 0.02
        scene.add(moonLight)
        scene.add(moonLight.target)

        // Sky bounce + a floor bounce that is nearly black, so undersides stay dark —
        // that contrast is what makes a lit window read as warm. The sky term still has
        // to be generous: the moon is the only shadow caster, and without a fat
        // hemisphere fill every underside goes pure black and the scene reads as a cave
        // instead of a street.
        const hemi = new THREE.HemisphereLight(0x4d7dab, 0x16283a, 1.5)
        scene.add(hemi)

        // ---------------------------------------------------- 2. world per job --
        // The alley is the attract diorama; a level is the job. Both live in one scene
        // and swap, so the title screen and the game are lit by a single rig and cannot
        // drift apart in look.
        const alley = makeAlley({ seed: 11 })
        scene.add(alley.group)

        let world = null
        let engine = null
        let level = null
        // Lamp lights: three pooled PointLights re-bound every 0.2 s to the three
        // lamps nearest the player. Lighting all 8 by real light would be 8 more
        // lights in every fragment shader; two pools read identically at night.
        // Plus one light that rides with the raccoon you control. Not a torch — a
        // fill. Night scenes have a specific failure where the character you are steering
        // becomes a dark lump against a dark wall, and no amount of careful moonlight
        // fixes it, because the moon is behind the wall. Every third-person night game
        // solves it the same dishonest way, and so does this one.
        const playerLight = new THREE.PointLight(0xffd9a8, 2.2, 4.6, 2)
        playerLight.castShadow = false
        scene.add(playerLight)

        const pool = []
        const POOL = touch ? 2 : 3
        for (let i = 0; i < POOL; i++) {
            const pl = new THREE.PointLight(0xffb968, 0, 9, 1.9)
            pl.castShadow = false
            scene.add(pl)
            pool.push(pl)
        }
        let poolT = 0

        const mountJob = (index) => {
            if (engine) {
                engine.dispose()
                for (const g of disposables(engine.group)) g.dispose()
                if (engine.group.parent === scene) scene.remove(engine.group)
            }
            if (world) {
                for (const g of disposables(world.group)) g.dispose()
                scene.remove(world.group)
            }
            alley.group.visible = false
            level = LEVELS[index]
            world = buildWorld(level)
            scene.add(world.group)
            engine = createEngine({ level, world, camera, audio: heistAudio, onEvent: onEngineEvent })
            // The engine owns the cast — crew, guards, loot, the cat — in its own group.
            // Mounting the world and forgetting the cast is the nastiest bug this file
            // has had: the level looked perfect, the harness went green, and the
            // raccoons did not exist. The play check now asserts they are on screen.
            scene.add(engine.group)
            engineRef.current = engine
            engine.reset()
            // Fog is exponential and the world just got 2.2x wider; the old density
            // swallowed the far half of every yard in pure black.
            scene.fog.density = (level.fog ?? 0.019) * 0.42
            scene.background = new THREE.Color(level.theme === 'museum' ? 0x11222f : PAL.nightDeep)
            moonLight.intensity = level.theme === 'manor' ? 0.35 : 1.8
            hemi.intensity = level.theme === 'museum' ? 1.1 : 1.5
            renderer.toneMappingExposure = level.theme === 'manor' ? 1.45 : 1.34
            // Job 1 is the tutorial dressed as a job: warm moon, two patrols, no lasers.
            // Thumbs are attached to a phone held at arm's length: pull the camera in a
            // little and lift it, because a small screen cannot show a wide frame and
            // keep the raccoon readable.
            engine.setCam(undefined, 0.5, touch ? 7.6 : 6.8)
        }

        const seen = []
        const onEngineEvent = (e) => {
            seen.push({ ...e, t: +performance.now().toFixed(0) })
            if (seen.length > 200) seen.shift()
            if (e.type === 'clear' || e.type === 'bust') {
                window.setTimeout(() => setMode(e.type), 900)
            }
        }

        if (screenRef.current !== 'attract') mountJob(jobRef.current)

        // ------------------------------------------------------------- 3. loop
        let raf = 0
        let last = performance.now()
        let acc = 0
        let elapsed = 0
        let hudT = 0
        let frameMs = 0
        let started = false

        const orbitLook = new THREE.Vector3(0.25, 0.8, 0.9)
        let orbit = 0

        const update = (dt) => {
            const scr = screenRef.current
            if (scr === 'attract') {
                alley.animate(dt, elapsed)
                orbit += dt * 0.05
                const a = 2.16 + Math.sin(orbit * 0.5) * 0.09
                const r = 11.4 + Math.sin(orbit * 0.33) * 0.4
                camera.position.set(Math.cos(a) * r, 4.4 + Math.sin(orbit * 0.42) * 0.3, Math.sin(a) * r)
                camera.lookAt(orbitLook)
                return
            }
            if (!engine) return
            const inp = inputRef.current
            const k = inp.keys
            let mx = inp.stick.x
            let my = -inp.stick.y
            if (Math.abs(mx) < 0.08 && Math.abs(my) < 0.08) {
                mx = (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0)
                my = (k.has('ArrowUp') || k.has('KeyW') ? 1 : 0) - (k.has('ArrowDown') || k.has('KeyS') ? 1 : 0)
                const m = Math.hypot(mx, my)
                if (m > 1) { mx /= m; my /= m }
            }
            const lookX = inp.look.x + (k.has('KeyJ') ? -1 : 0) + (k.has('KeyL') ? 1 : 0)
            const lookY = inp.look.y
            inp.look.x = 0
            inp.look.y = 0
            const acts = inp.actions.slice()
            inp.actions.length = 0
            // Only the play screen feeds the sim. Every other screen still animates the
            // world (rain, cones, breathing crew) so a pause looks like a held breath
            // rather than a dead tab.
            const playing = scr === 'play'
            engine.update(dt, {
                mx, my,
                crouch: CROUCH_KEYS.some(c => k.has(c)),
                dash: DASH_KEYS.some(c => k.has(c)),
                lookX, lookY,
                actions: playing ? acts : [],
                hold: playing && (HOLD_KEYS.some(c => k.has(c)) || inp.hold),
            })

            // Thunder flash: the moon light and the exposure both kick, which is what
            // sells "the whole street just went white" for the price of two property sets.
            const flash = engine.st.flash || 0
            moonLight.intensity = (level.theme === 'manor' ? 0.35 : 1.8) + flash * 5.5
            hemi.intensity = (level.theme === 'museum' ? 1.1 : 1.5) + flash * 1.2
            moonLight.position.set(MOON.x * (1 + flash * 0.15), MOON.y * (1 + flash * 0.25), MOON.z)
            if (world.lamps.length) {
                poolT -= dt
                if (poolT <= 0) {
                    poolT = 0.2
                    const a = engine.activeCrew
                    const near = world.lamps.map(l => ({ l, d: Math.hypot(l.x - a.x, l.z - a.z) }))
                        .sort((p, q) => p.d - q.d).slice(0, POOL)
                    pool.forEach((pl, i) => {
                        const n = near[i]
                        const on = n && n.d < 16
                        pl.position.set(on ? n.l.x : 0, 3.3, on ? n.l.z : -900)
                        pl.distance = on ? 11 : 0
                        // Three pools for eight lamps: the two behind you are dark on
                        // purpose, because a night this blue only ever had three of them.
                        pl.intensity = on ? 16 * (0.92 + Math.sin(elapsed * 11.7 + n.l.x) * 0.06) : 0
                    })
                }
            }
            heistAudio.setHeat(engine.st.heat / 100)
            // The shadow frustum follows the raccoon, not the map: a 40 m sheet of
            // 1024 shadow map is mush, an 18 m one centred on you is crisp.
            const a = engine.activeCrew
            playerLight.position.set(a.x, 0.85 + (a.hidden ? -0.3 : 0), a.z)
            playerLight.intensity = 2.2 * (a.crouched ? 0.7 : 1)
            moonLight.target.position.set(a.x, 0, a.z)
            moonLight.position.set(a.x + MOON.x, MOON.y, a.z + MOON.z)
        }

        const frame = (now) => {
            raf = requestAnimationFrame(frame)
            // **The clock is the game.** A fixed timestep capped at five ticks per frame
            // simulates 83 ms of world per frame, so anything under 12 fps runs the whole
            // heist in slow motion — torch timers, guard speed, the job clock, all of it.
            // On the CI runner (~4 fps in headless Chrome) that made the play harness red
            // for the wrong reason; on a weak phone it would make the game quietly easier.
            // The cap is there so a backgrounded tab *skips* time instead of fast-forwarding
            // guards through a wall of frames, so it has to be generous enough that every
            // foreground frame rate keeps real time: 250 ms of catch-up holds real time
            // down to 4 fps, and discards anything past that.
            const raw = Math.min(MAX_CATCHUP, now - last)
            last = now
            if (pausedRef.current) return
            acc += raw
            let steps = 0
            while (acc >= FIXED_DT && steps < MAX_STEPS) {
                const dt = FIXED_DT / 1000
                elapsed += dt
                update(dt)
                acc -= FIXED_DT
                steps++
            }
            if (acc > MAX_CATCHUP) acc = 0
            const t0 = performance.now()
            renderer.render(scene, camera)
            // Exponential moving average of the *render* cost, which is the number a
            // phone-scale frame budget is judged against.
            frameMs += (performance.now() - t0 - frameMs) * 0.05
            hudT += raw
            if (hudT > 90 && engine && screenRef.current !== 'attract') {
                hudT = 0
                setHud(engine.snapshot())
            }
        }

        // ------------------------------------------------------------- 4. resize
        const resize = () => {
            const w = wrap.clientWidth || window.innerWidth
            const h = wrap.clientHeight || window.innerHeight
            renderer.setSize(w, h, false)
            camera.aspect = w / h
            // A phone held vertically needs a wider lens to see threats off-screen-side;
            // a desktop monitor can afford the tighter, filmier framing.
            camera.fov = w / h < 1 ? 64 : 52
            camera.updateProjectionMatrix()
        }
        resize()
        const ro = new ResizeObserver(resize)
        ro.observe(wrap)
        window.addEventListener('orientationchange', resize)

        // ------------------------------------------------------------- 5. input
        const beginJob = () => {
            if (!engine) mountJob(jobRef.current)
            engine?.start()
            setMode('play')
            setHud(engine?.snapshot())
        }

        const start = () => {
            const scr = screenRef.current
            if (scr === 'attract') {
                started = true
                setMode('brief')
                heistAudio.start('sneak')
                mountJob(jobRef.current)
                setHud(engine?.snapshot())
            } else if (scr === 'brief') beginJob()
        }

        const onKeyDown = (e) => {
            if ((e.code === 'Slash' && e.shiftKey) || e.code === 'Escape') {   // '?' / Esc
                e.preventDefault()
                setPaused(p => { pausedRef.current = !p; return !p })
                return
            }
            if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault()
            const scr = screenRef.current
            if (scr === 'attract' || scr === 'brief') { start(); return }
            if (scr === 'clear' || scr === 'bust') { if (e.code === 'Enter' || e.code === 'Space') next(); return }
            if (e.repeat) return
            inputRef.current.keys.add(e.code)
            // Every action is looked up in ONE table, which is also the table the help
            // screen is written from and the table `heistplay` audits against the
            // registry text. The old code hard-coded each `e.code ===` branch and the
            // printed controls drifted straight off it: the pause card promised "B / E:
            // fling a shiny" when B did nothing and E grabbed, and "F: crouch" when F
            // lured. A player who trusts the help screen is told the game is broken.
            for (const [action, codes] of Object.entries(KEYMAP)) {
                if (codes.includes(e.code)) inputRef.current.actions.push(action)
            }
        }
        const onKeyUp = (e) => {
            inputRef.current.keys.delete(e.code)
            if (HOLD_KEYS.includes(e.code)) inputRef.current.hold = false
        }
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)

        // Camera: drag anywhere on the canvas. On a phone the left thumb owns the
        // stick and the right owns the camera, which is the only two-thumb mapping
        // that does not require looking at the screen to find the pad.
        let drag = null
        const onDown = (e) => {
            if (e.target !== canvas) { start(); return }
            drag = { id: e.pointerId, x: e.clientX, y: e.clientY }
            canvas.setPointerCapture?.(e.pointerId)
            if (screenRef.current === 'attract' || screenRef.current === 'brief') start()
        }
        const onMove = (e) => {
            if (!drag || e.pointerId !== drag.id) return
            const dx = e.clientX - drag.x
            const dy = e.clientY - drag.y
            drag.x = e.clientX
            drag.y = e.clientY
            if (screenRef.current === 'play') engine?.nudgeCamera(dx * 0.006, dy * 0.005)
        }
        const onUp = (e) => {
            if (drag && e.pointerId === drag.id) drag = null
        }
        const onWheel = (e) => {
            if (!engine) return
            e.preventDefault()
            engine.st.camDist = Math.max(4.5, Math.min(13, engine.st.camDist + Math.sign(e.deltaY) * 0.6))
        }
        canvas.addEventListener('pointerdown', onDown)
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
        canvas.addEventListener('wheel', onWheel, { passive: false })

        // --------------------------------------------------------- 6. dev hook
        // `jobRef` rather than the `job` state inside this closure: the effect runs once
        // and the state variable it captured would stay frozen at job 0 forever, so
        // "NEXT JOB" would rebuild the level you were just standing in.
        const switchJob = (i) => {
            jobRef.current = i
            setJob(i)
            mountJob(i)
            setMode('brief')
            setHud(engine ? engine.snapshot() : null)
        }
        const next = () => {
            const win = engine?.st.result?.win
            switchJob(win ? Math.min(LEVELS.length - 1, jobRef.current + 1) : jobRef.current)
        }
        apiRef.current = { next, switchJob }
        const api = {
            version: 2,
            scene: () => scene,
            engine: () => engine,
            world: () => world,
            state: () => ({
                screen: screenRef.current, paused: pausedRef.current, elapsed: +elapsed.toFixed(2),
                frameMs: +frameMs.toFixed(2), touch, started, job: jobRef.current,
                cam: camera.position.toArray().map(n => +n.toFixed(2)),
                fox: engine ? [engine.activeCrew.x, engine.activeCrew.z].map(n => +n.toFixed(2)) : null,
                sim: engine ? engine.snapshot() : null,
            }),
            press: () => start(),
            goto: (m) => setMode(m),
            // Keys through the *real* path, so a harness cannot pass by poking the sim.
            key: (code, down = true) => {
                if (down) inputRef.current.keys.add(code)
                else inputRef.current.keys.delete(code)
            },
            tap: (a) => inputRef.current.actions.push(a),
            stick: (x, y) => { inputRef.current.stick.x = x; inputRef.current.stick.y = y },
            look: (dx, dy) => engine?.nudgeCamera(dx, dy),
            /**
             * DEV-only scene interrogator. A screenshot tells you something looks wrong;
             * this tells you *what*, by listing the geometry nearest the camera with its
             * world position and material — which is how "a cardboard box is on the
             * spawn" gets found in one run instead of six screenshots.
             */
            near: (n = 10) => {
                if (!engine) return []
                const a = engine.activeCrew
                const out = []
                const v = new THREE.Vector3()
                scene.traverse((o) => {
                    if (!o.isMesh || !drawn(o) || o.isInstancedMesh || o.isSprite) return
                    o.getWorldPosition(v)
                    const d = Math.hypot(v.x - a.x, v.z - a.z)
                    if (d > 9) return
                    out.push({
                        d: +d.toFixed(2), y: +v.y.toFixed(2),
                        at: [+v.x.toFixed(2), +v.z.toFixed(2)],
                        geo: o.geometry?.type || '?',
                        mat: o.material?.name || (o.material?.color ? '#' + o.material.color.getHexString() : '?'),
                        tri: (o.geometry?.index?.count || o.geometry?.attributes?.position?.count || 0) / 3,
                    })
                })
                return out.sort((p, q) => p.d - q.d).slice(0, n)
            },
            /**
             * Affordance interrogator: the verb the sim is offering right now, and
             * whether there is a *body* in the world where that verb points. The pound
             * asked for `CHEW ULTRA LOOSE` while drawing no lock at all (playtest: "I
             * don't see a lock"), so this is what `heistplay` walks the route with.
             *
             * Distance is measured to each mesh's world bounding box rather than to its
             * origin, because the level is deliberately merged into a handful of batches:
             * a "can" is a few tris inside a 40-mesh behemoth whose origin is the middle
             * of the map. For the two lock verbs the mesh must also be *the lock* (its
             * material name), because cage bars are meshes too and none of them is
             * something you can chew.
             */
            afford: (tol = 0.6) => {
                if (!engine) return null
                const a = engine.affordance()
                if (!a || !a.at) return a ? { ...a, near: [], hit: null } : null
                const p = new THREE.Vector3(a.at[0], a.at[1], a.at[2])
                const bb = new THREE.Box3()
                const found = []
                scene.traverse((o) => {
                    if (!o.isMesh || !drawn(o) || !o.geometry) return
                    const nm = o.material?.name || ''
                    if (a.want && !nm.includes(a.want)) return
                    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox()
                    bb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld)
                    const d = bb.distanceToPoint(p)
                    if (d > 2.5) return
                    found.push({ d: +d.toFixed(2), mat: nm || '?', geo: o.geometry.type, instanced: !!o.isInstancedMesh })
                })
                found.sort((x, y) => x.d - y.d)
                return { ...a, tol, near: found.slice(0, 5), hit: found.length ? found[0].d : null, ok: found.length > 0 && found[0].d <= tol }
            },
            /** Put the actor somewhere on purpose: interaction tests need positioning. */
            moveTo: (wx, wz) => {
                const a = engine?.activeCrew
                if (!a) return null
                a.x = wx; a.z = wz
                return [a.x, a.z]
            },
            hold: (on) => { inputRef.current.hold = !!on },
            switchTo: (i) => engine?.switchTo(i),
            /** One number-soup-free snapshot of everything a play-through asserts on. */
            probe: () => {
                if (!engine) return null
                const a = engine.activeCrew
                const v = new THREE.Vector3(a.x, 1, a.z).project(camera)
                const d = Math.hypot(camera.position.x - a.x, camera.position.z - a.z)
                return {
                    phase: engine.st.phase, x: +a.x.toFixed(2), z: +a.z.toFixed(2), yaw: +a.yaw.toFixed(2),
                    cell: cellName(level, a.x, a.z), speed: +a.speed.toFixed(2), wind: +a.wind.toFixed(2),
                    det: +(a.det || 0).toFixed(3), caged: a.caged, hidden: a.hidden, held: a.held ? a.held.label : null,
                    camDist: +d.toFixed(2), camY: +camera.position.y.toFixed(2),
                    camYaw: +engine.st.camYaw.toFixed(3),
                    camEff: +(engine.st.camYawEff ?? engine.st.camYaw).toFixed(3),
                    camSide: +(engine.st.camSide || 0).toFixed(3),
                    camAt: [+camera.position.x.toFixed(1), +camera.position.z.toFixed(1)],
                    pitch: +engine.st.camPitch.toFixed(2),
                    // Where the raccoon lands on screen: |x|,|y| < 1 means on-screen.
                    ndc: [+v.x.toFixed(2), +v.y.toFixed(2)],
                    heat: Math.round(engine.st.heat), gate: engine.st.gateOpen,
                    delivered: engine.st.delivered, msg: engine.st.msg,
                    vaults: engine.focusLabel ? engine.focusLabel() : '',
                }
            },
            watchers: () => (engine ? engine.debugWatchers() : []),
            camClear: () => engine?.camClear() || null,
            clearAt: (dx, dz) => engine?.clearAt(dx, dz) || null,
            tightSpot: () => engine?.tightSpot() || null,
            warpWatcher: (i, x, z, state) => engine?.warpWatcher(i, x, z, state) || null,
            release: (i, x, z) => engine?.release(i, x, z) || null,
            calm: () => engine?.calmWatchers() ?? -1,
            setCam: (yaw, pitch, dist) => engine?.setCam(yaw, pitch, dist),
            why: () => (engine ? engine.why() : []),
            lootList: () => (engine ? engine.debugLoot() : []),
            props: () => (world ? world.props : []),
            stamped: () => (world ? world.stamped : []),
            marks: () => (level ? level.marks.map(m => ({ ch: m.ch, x: m.x, y: m.y, wx: +m.wx.toFixed(2), wz: +m.wz.toFixed(2) })) : []),
            events: () => seen.splice(0, seen.length),
            info: () => ({
                calls: renderer.info.render.calls,
                tris: renderer.info.render.triangles,
                geoms: renderer.info.memory.geometries,
                progs: renderer.info.programs?.length || 0,
            }),
            job: (i) => switchJob(i),
            next: () => next(),
            perf: () => ({ frameMs: +frameMs.toFixed(2) }),
        }
        if (import.meta.env.DEV) window.__heistTest = api

        raf = requestAnimationFrame(frame)

        return () => {
            cancelAnimationFrame(raf)
            ro.disconnect()
            env.dispose()
            window.removeEventListener('orientationchange', resize)
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('keyup', onKeyUp)
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointerup', onUp)
            canvas.removeEventListener('pointerdown', onDown)
            canvas.removeEventListener('wheel', onWheel)
            if (import.meta.env.DEV && window.__heistTest) delete window.__heistTest
            heistAudio.stop()
            for (const g of disposables(alley.group)) g.dispose()
            scene.remove(alley.group)
            if (engine) { engine.dispose(); for (const g of disposables(engine.group)) g.dispose() }
            if (world) for (const g of disposables(world.group)) g.dispose()
            engineRef.current = null
            apiRef.current = null
            renderer.dispose()
            // NB: deliberately NOT forceContextLoss() — see the canvas comment above.
            if (canvas.parentNode === wrap) wrap.removeChild(canvas)
        }
    }, [setMode])

    const resume = useCallback(() => {
        pausedRef.current = false
        setPaused(false)
    }, [])

    const swapTo = useCallback((i) => {
        engineRef.current?.switchTo(i)
    }, [])

    const playing = screen === 'play'
    const padOn = wantPad()

    // --------------------------------------------------------------- 7. shell --
    return (
        <div ref={stageRef} className="fixed inset-0 bg-black overflow-hidden select-none" style={{ touchAction: 'none' }}>

            {/* vignette + scrim: the two cheapest things that make a 3D night look graded */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: 'radial-gradient(ellipse at 50% 42%, rgba(0,0,0,0) 40%, rgba(3,10,17,0.5) 80%, rgba(2,6,10,0.88) 100%)' }}
            />
            {hud?.masked && (
                <div className="absolute inset-0 pointer-events-none animate-pulse" style={{ background: 'radial-gradient(ellipse at 50% 30%, rgba(200,230,255,0.16), rgba(0,0,0,0) 60%)' }} />
            )}
            {hud?.alarm && playing && (
                <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: 'inset 0 0 120px 30px rgba(255,40,40,0.22)', animation: 'pulse 1s infinite' }} />
            )}
            {/* readable floor under the bottom copy (App.jsx pins a footer here too) */}
            <div
                className="absolute inset-x-0 bottom-0 h-[26vh] pointer-events-none"
                style={{ background: 'linear-gradient(to top, rgba(2,8,14,0.72), rgba(2,8,14,0))' }}
            />

            {screen === 'attract' && <TitleCard />}
            {screen === 'brief' && <BriefCard level={LEVELS[job]} job={job} />}
            {playing && hud && <Hud hud={hud} level={LEVELS[job]} onSwap={swapTo} />}
            {(screen === 'clear' || screen === 'bust') && hud && (
                <ResultCard hud={hud} job={job} onNext={() => apiRef.current?.next()} hasNext={job < LEVELS.length - 1} />
            )}

            {playing && padOn && (
                <HeistPad
                    inputRef={inputRef}
                    hint={hud?.hint}
                    shinies={hud?.shinies ?? 0}
                    onSwap={swapTo}
                />
            )}

            {paused && (
                <PauseOverlay game={GAMES.find(g => g.label === 'RACCOON HEIST')} onResume={resume} />
            )}
        </div>
    )
}

// -------------------------------------------------------------------- HUD ------
function Hud({ hud, level, onSwap }) {
    const secs = Math.floor(hud.elapsed)
    const mm = String(Math.floor(secs / 60)).padStart(2, '0')
    const ss = String(secs % 60).padStart(2, '0')
    return (
        <>
            <div className="absolute top-2 left-2 sm:top-4 sm:left-5 font-mono pointer-events-none">
                <p className="text-[8px] sm:text-[10px] tracking-[0.3em] text-cyan-200/55">{level.sub}</p>
                <p className="text-[11px] sm:text-base font-black tracking-[0.16em] text-[#ffb45c]">{hud.objective}</p>
                <p className="text-[9px] sm:text-[11px] tracking-[0.2em] text-cyan-100/60 mt-1">
                    CART {hud.delivered}/{hud.total} · ${hud.value} · T {mm}:{ss}
                </p>
            </div>

            {/* heat: the whole tension of the game in one horizontal bar */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-[42vw] max-w-[300px] pointer-events-none">
                <div className="flex justify-between font-mono text-[8px] sm:text-[10px] tracking-[0.25em] mb-1">
                    <span className="text-cyan-200/50">HEAT</span>
                    <span className={hud.alarm ? 'text-red-400 animate-pulse' : 'text-cyan-200/50'}>{hud.alarm ? 'POLICE' : hud.masked ? 'THUNDER' : 'QUIET'}</span>
                </div>
                <div className="h-2 border border-cyan-200/25 bg-black/50 overflow-hidden">
                    <div
                        className="h-full transition-[width] duration-150"
                        style={{
                            width: `${Math.round(hud.heat)}%`,
                            background: hud.heat > 65 ? 'linear-gradient(90deg,#ff6b3d,#ff2a1e)' : 'linear-gradient(90deg,#7de3a4,#ffcf5c)',
                        }}
                    />
                </div>
            </div>

            {hud.msg && (
                <div className="absolute top-[19%] inset-x-0 text-center font-mono text-[12px] sm:text-lg tracking-[0.18em] text-[#f3e7c8] px-6 pointer-events-none"
                    style={{ textShadow: '0 2px 10px rgba(0,0,0,0.9)' }}>
                    {hud.msg}
                </div>
            )}

            {/* crew chips: tap one to become that raccoon */}
            <div className="absolute top-2 right-2 sm:top-4 sm:right-5 space-y-1 pointer-events-auto">
                {hud.crew.map((c) => (
                    <button
                        key={c.name}
                        onClick={() => onSwap(c.idx ?? hud.crew.indexOf(c))}
                        className={`block w-[92px] sm:w-[124px] text-left font-mono text-[8px] sm:text-[10px] tracking-[0.14em] border px-1.5 py-1 backdrop-blur-[1px] ${c.active ? 'border-[#ffb45c] bg-[#ffb45c]/12 text-[#ffd9a0]' : 'border-cyan-200/20 bg-black/35 text-cyan-100/70'}`}
                    >
                        <span className="inline-block w-2 h-2 mr-1" style={{ background: c.caged ? '#ff4a3a' : `#${c.bandana.toString(16).padStart(6, '0')}` }} />
                        {c.caged ? 'IN POUND' : c.name}
                        {c.held ? ' ◆' : ''}
                        {c.hidden ? ' ≡' : ''}
                        <span className="block h-[3px] mt-1 bg-cyan-200/15">
                            <span className="block h-full" style={{ width: `${Math.round(c.wind * 100)}%`, background: c.det > 0.5 ? '#ff6b3d' : '#7de3a4' }} />
                        </span>
                    </button>
                ))}
            </div>
        </>
    )
}

// ------------------------------------------------------------- touch pad -------
/**
 * Floating stick + action cluster. The stick re-anchors wherever the thumb lands
 * (dead-zone relative, not absolute), because a fixed on-screen stick on a 6-inch
 * phone is always half an inch from where your thumb actually is.
 */
function HeistPad({ inputRef, hint, shinies, onSwap }) {
    const baseRef = useRef(null)
    const [knob, setKnob] = useState({ x: 0, y: 0, on: false })
    const pid = useRef(null)

    const R = 52
    const fromEvent = (e) => {
        const el = baseRef.current
        if (!el) return { x: 0, y: 0 }
        const r = el.getBoundingClientRect()
        const cx = r.left + r.width / 2
        const cy = r.top + r.height / 2
        let dx = e.clientX - cx
        let dy = e.clientY - cy
        const d = Math.hypot(dx, dy)
        if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R }
        return { x: dx, y: dy }
    }

    const down = (e) => {
        e.preventDefault()
        pid.current = e.pointerId
        e.currentTarget.setPointerCapture?.(e.pointerId)
        const p = fromEvent(e)
        setKnob({ x: p.x, y: p.y, on: true })
        inputRef.current.stick.x = p.x / R
        inputRef.current.stick.y = -p.y / R
    }
    const move = (e) => {
        if (pid.current !== e.pointerId) return
        const p = fromEvent(e)
        setKnob({ x: p.x, y: p.y, on: true })
        inputRef.current.stick.x = p.x / R
        inputRef.current.stick.y = -p.y / R
    }
    const up = (e) => {
        if (pid.current !== e.pointerId) return
        pid.current = null
        setKnob({ x: 0, y: 0, on: false })
        inputRef.current.stick.x = 0
        inputRef.current.stick.y = 0
    }

    const tap = (a) => (e) => {
        e.preventDefault()
        e.stopPropagation()
        inputRef.current.actions.push(a)
    }

    return (
        <>
            <div
                ref={baseRef}
                onPointerDown={down}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={up}
                className="absolute left-3 bottom-[13vh] w-[132px] h-[132px] rounded-full border-2 border-cyan-200/20 bg-black/30 backdrop-blur-[1px] touch-none"
                style={{ touchAction: 'none' }}
            >
                <div
                    className="absolute left-1/2 top-1/2 w-14 h-14 rounded-full border-2"
                    style={{
                        transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`,
                        borderColor: knob.on ? '#ffb45c' : 'rgba(160,220,255,0.35)',
                        background: knob.on ? 'rgba(255,180,92,0.22)' : 'rgba(10,25,38,0.5)',
                    }}
                />
                <span className="absolute -top-5 left-1/2 -translate-x-1/2 font-mono text-[8px] tracking-[0.25em] text-cyan-200/40">SNEAK</span>
            </div>

            <div className="absolute right-3 bottom-[11vh] flex flex-col items-end gap-2 touch-none">
                <div className="flex gap-2">
                    <button
                        onPointerDown={tap('throw')}
                        className="w-14 h-14 rounded-full border-2 border-cyan-200/25 bg-black/40 font-mono text-[9px] tracking-widest text-cyan-100/80 active:scale-95"
                        style={{ touchAction: 'none' }}
                    >
                        LURE<br /><span className="text-[#ffd47a]">{shinies}</span>
                    </button>
                    <button
                        onPointerDown={tap('swap')}
                        className="w-14 h-14 rounded-full border-2 border-cyan-200/25 bg-black/40 font-mono text-[9px] tracking-widest text-cyan-100/80 active:scale-95"
                        style={{ touchAction: 'none' }}
                    >
                        CREW
                    </button>
                </div>
                <button
                    onPointerDown={(e) => { e.preventDefault(); inputRef.current.hold = true; inputRef.current.actions.push('grab') }}
                    onPointerUp={() => { inputRef.current.hold = false }}
                    onPointerCancel={() => { inputRef.current.hold = false }}
                    onPointerLeave={() => { inputRef.current.hold = false }}
                    className="w-24 h-24 rounded-full border-2 font-mono text-[10px] leading-tight tracking-widest active:scale-95"
                    style={{
                        touchAction: 'none',
                        borderColor: hint ? '#ffb45c' : 'rgba(160,220,255,0.22)',
                        background: hint ? 'rgba(255,140,40,0.26)' : 'rgba(6,16,26,0.45)',
                        color: hint ? '#ffe0b0' : 'rgba(180,220,240,0.5)',
                    }}
                >
                    {hint ? hint.split(' ')[0] : '···'}
                    <span className="block text-[8px] opacity-70">{hint ? hint.split(' ').slice(1).join(' ') : 'HOLD E'}</span>
                </button>
            </div>

            <p className="absolute bottom-[2vh] right-3 font-mono text-[8px] tracking-[0.2em] text-cyan-200/35 pointer-events-none">
                DRAG RIGHT SIDE = LOOK · G RECENTRE
            </p>
            <CrouchButton inputRef={inputRef} />
            {/* crew chips in the HUD are the swap control — this pad does not duplicate them */}
            {onSwap && null}
        </>
    )
}

function CrouchButton({ inputRef }) {
    const [on, setOn] = useState(false)
    const flip = (e) => {
        e.preventDefault()
        const next = !on
        setOn(next)
        if (next) inputRef.current.keys.add('KeyC')
        else inputRef.current.keys.delete('KeyC')
    }
    return (
        <button
            onPointerDown={flip}
            className="absolute bottom-[13vh] left-[168px] w-16 h-16 rounded-full border-2 font-mono text-[9px] tracking-widest active:scale-95"
            style={{
                touchAction: 'none',
                borderColor: on ? '#7de3a4' : 'rgba(160,220,255,0.22)',
                background: on ? 'rgba(60,180,120,0.22)' : 'rgba(6,16,26,0.45)',
                color: on ? '#bff3d4' : 'rgba(180,220,240,0.55)',
            }}
        >
            CROUCH
        </button>
    )
}

// --------------------------------------------------------------- title card ----
function TitleCard() {
    return (
        <div className="absolute inset-0 flex flex-col items-center justify-between pt-[7vh] pb-[24vh] px-5 pointer-events-none">
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
                    THREE JOBS · ONE CART · NO PLAN
                </p>
            </div>

            <div className="text-center">
                <p className="font-mono text-[11px] sm:text-sm tracking-[0.3em] text-[#ffb45c] animate-pulse">
                    TAP / PRESS ANY KEY TO START
                </p>
                <p className="font-mono text-[9px] sm:text-[11px] tracking-[0.18em] text-cyan-200/45 mt-3">
                    WASD MOVE · SHIFT/R SPRINT · C CROUCH · E HOLD TO WORK · F LURE · Q SWITCH<br />
                    DRAG TO LOOK · WHEEL ZOOM · ? FOR CONTROLS
                </p>
            </div>
        </div>
    )
}

function BriefCard({ level, job }) {
    return (
        <div className="absolute inset-0 flex items-center justify-center p-5 pb-[18vh] pointer-events-none">
            <div className="max-w-md w-full border-2 border-[#ffb45c]/60 bg-[#08131d]/92 p-5 font-mono text-[#f3e7c8] shadow-2xl">
                <p className="text-[9px] tracking-[0.35em] text-cyan-200/60">JOB 0{job + 1} · BRIEFING</p>
                <h2 className="text-xl sm:text-2xl font-black tracking-widest mt-1 text-[#ffb45c]">{level.name}</h2>
                <p className="text-[11px] leading-relaxed mt-2 text-cyan-100/85">{level.brief}</p>
                <div className="grid grid-cols-3 gap-2 mt-4 text-[9px] tracking-[0.15em] text-cyan-200/60">
                    <span>PAR {level.par}s</span>
                    <span>{level.routes.length} WATCHERS</span>
                    <span>{level.rain >= 800 ? 'THUNDER' : level.rain >= 400 ? 'DRIZZLE' : 'OVERCAST'}</span>
                </div>
                <p className="text-[10px] tracking-[0.28em] text-[#ffb45c] mt-4 animate-pulse">
                    TAP / ANY KEY TO BEGIN
                </p>
            </div>
        </div>
    )
}

function ResultCard({ hud, job, onNext, hasNext }) {
    const win = hud.result?.win
    return (
        <div className="absolute inset-0 flex items-center justify-center p-5 pb-[16vh] bg-black/55 pointer-events-auto">
            <div className={`max-w-md w-full border-2 p-5 font-mono shadow-2xl ${win ? 'border-[#ffb45c]/70 bg-[#0a1620]/95' : 'border-red-500/70 bg-[#170a0c]/95'}`}>
                <p className="text-[9px] tracking-[0.35em] text-cyan-200/60">JOB 0{job + 1}</p>
                <h2 className={`text-2xl sm:text-3xl font-black tracking-widest mt-1 ${win ? 'text-[#ffb45c]' : 'text-red-400'}`}>
                    {win ? 'CLEAN GETAWAY' : 'POUNDED'}
                </h2>
                <p className="text-[11px] leading-relaxed mt-2 text-cyan-100/85">
                    {win
                        ? 'The cart rolls out the gate under a wet moon, full of things that belonged to other people. Nobody saw a raccoon. Nobody ever does.'
                        : 'Three raccoons in a metal box with a sign on it. Somebody is coming to claim you, and it is not going to be a raccoon.'}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-y-1 gap-x-4 text-[11px] tracking-[0.12em]">
                    <span className="text-cyan-200/55">LOOT</span><span>{hud.result?.delivered}/{hud.total} · ${hud.result?.value}</span>
                    <span className="text-cyan-200/55">TIME</span><span>{hud.result?.secs}s (par {hud.par})</span>
                    <span className="text-cyan-200/55">CAUGHT</span><span>{hud.result?.caught}</span>
                    <span className="text-cyan-200/55">CREW FREE</span><span>{hud.result?.left}/3</span>
                    {win && hud.result?.clean > 0 && <><span className="text-cyan-200/55">NERVE BONUS</span><span className="text-[#7de3a4]">+{hud.result.clean * 6}</span></>}
                </div>
                <button
                    onClick={onNext}
                    className="mt-5 w-full py-3 border-2 border-[#ffb45c] bg-[#ffb45c]/15 text-[#ffd9a0] font-mono text-sm tracking-[0.25em] active:scale-[0.98]"
                >
                    {win && hasNext ? 'NEXT JOB' : win ? 'RIDE AGAIN' : 'TRY AGAIN'}
                </button>
                <p className="mt-2 text-[9px] tracking-[0.2em] text-cyan-200/40 text-center">ENTER / SPACE</p>
            </div>
        </div>
    )
}

export default RaccoonHeistGame
