// ROBOT LAB — Plaicraft robot-sim-kit showcase (issue #1141 stage 1).
//
// Three.js MODERN render of the robot sim kit (src/utils/robot/*): a bench,
// a 4-DOF arm with a parallel gripper, a drawer on real rails, a spring-
// hinged cabinet, a crate and a can. Task: crate into the drawer and close
// it; stow the can in the open cabinet and swing the door shut.
//
// The SIM is pure Node (importable, deterministic); this component only maps
// body poses to meshes and funnels input (stick/keys/pointer) into pads.

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import VirtualControls from '../../components/VirtualControls'
import PauseOverlay from '../../components/PauseOverlay'
import { exposeGame, unexposeGame, contractHoldsLoop, recordLiveTick, exposeFeedbackState, unexposeFeedbackState, seedFromQuery } from '../../utils/gameContract'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { createRobotSim, createAutopilot, createEpisode, saveEpisode, episodeStats, manifestSummary, MANIFEST_REV } from '../../utils/robot'
import { isWatchKey, isTakeoverKey, playWatchStart, playWatchStop, watchSfxLog, NO_GUIDE } from '../../utils/watch'
import WatchButton, { WatchToast } from '../../components/WatchButton'

const FIXED_DT = 1000 / 60
const TOUCH = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches
const LITE = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('lite')

        const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Space: 'a', ShiftLeft: 'b', KeyB: 'b' }

        const ASSEMBLY = manifestSummary()
        const GATE_COLOR = { ship: 'text-emerald-300', credit: 'text-sky-300', review: 'text-amber-300', never: 'text-rose-400' }
        const JOINT_ROWS = [['yaw', 'YAW'], ['phi1', 'SHL'], ['phi2', 'ELB'], ['gamw', 'WRS']]

        export default function RobotLab() {
            const mountRef = useRef(null)
            const canvasRef = useRef(null)
            const [phase, setPhase] = useState('attract')
            const [paused, setPaused] = useState(false)
            const [tq, setTq] = useState(null)
            const [runs, setRuns] = useState(() => episodeStats())
            const [wristOn, setWristOn] = useState(true)
            const phaseRef = useRef('attract')
            const pausedRef = useRef(false)
            const wristRef = useRef(true)
            const [watching, setWatching] = useState(false) // #1637 WATCH: the proven autopilot drives the arm
            const watchingRef = useRef(false)
            const [noGuide, setNoGuide] = useState(false) // #1637 honesty: off the proven line, Y declines
            const noGuideRef = useRef(false)
            useEffect(() => { phaseRef.current = phase }, [phase])
            useEffect(() => { pausedRef.current = paused }, [paused])

    useEffect(() => {
        const mount = mountRef.current
        const canvas = canvasRef.current
        const W = () => mount.clientWidth || 640
        const H = () => mount.clientHeight || 480
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LITE, preserveDrawingBuffer: true })
        renderer.setPixelRatio(LITE ? 1 : Math.min(window.devicePixelRatio || 1, TOUCH ? 1.5 : 2))
        renderer.setSize(W(), H(), false)
        renderer.shadowMap.enabled = !LITE
        renderer.setClearColor(0x10151f)

        const scene = new THREE.Scene()
        scene.fog = new THREE.Fog(0x10151f, 2.2, 4.0)
        const cam = new THREE.PerspectiveCamera(46, W() / H(), 0.05, 12)
        const CAM_BASE = [0.12, 1.52, 1.18]
        cam.position.set(...CAM_BASE)
        cam.lookAt(0, 0.9, -0.18)
        const key = new THREE.DirectionalLight(0xfff2df, 2.6)
        key.position.set(1.4, 2.4, 1.6)
        key.castShadow = !LITE
        scene.add(key)
        scene.add(new THREE.HemisphereLight(0x9db4d8, 0x1c2333, 1.1))
        const rim = new THREE.PointLight(0x35e0c8, 6, 3)
        rim.position.set(-0.9, 1.6, -0.6)
        scene.add(rim)

        const wcam = new THREE.PerspectiveCamera(58, 4 / 3, 0.02, 4)

        const mat = {
            steel: new THREE.MeshStandardMaterial({ color: 0x9fb0c4, metalness: 0.85, roughness: 0.35 }),
            dark: new THREE.MeshStandardMaterial({ color: 0x2b3648, metalness: 0.6, roughness: 0.5 }),
            wood: new THREE.MeshStandardMaterial({ color: 0x7c5a38, roughness: 0.8 }),
            crate: new THREE.MeshStandardMaterial({ color: 0xe0a13c, roughness: 0.55 }),
            can: new THREE.MeshStandardMaterial({ color: 0xd8464f, metalness: 0.7, roughness: 0.3 }),
            accent: new THREE.MeshStandardMaterial({ color: 0x35e0c8, emissive: 0x0f7a68, roughness: 0.4 }),
            floor: new THREE.MeshStandardMaterial({ color: 0x171e2b, roughness: 0.9 }),
        }
        const box = (w, h, d, m, x, y, z) => {
            const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
            o.position.set(x, y, z)
            o.castShadow = !LITE
            o.receiveShadow = !LITE
            scene.add(o)
            return o
        }

        let sim = createRobotSim(1)

        const ground = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), mat.floor)
        ground.rotation.x = -Math.PI / 2
        ground.receiveShadow = !LITE
        scene.add(ground)
        const benchTop = box(1.8, 0.05, 1.1, mat.wood, 0, 0.875, -0.15)
        benchTop.userData.kit = 'bench'
        const legs = [[-0.82, -0.55], [0.82, -0.55], [-0.82, 0.28], [0.82, 0.28]].map(([x, z]) => box(0.06, 0.86, 0.06, mat.dark, x, 0.43, z))
        void legs

        const meshes = {
            base: box(0.11, 0.42, 0.11, mat.dark, 0, 1.11, -0.30),
            yoke: box(0.1, 0.1, 0.09, mat.steel, 0, 1.30, -0.30),
            upper: box(0.064, 0.30, 0.064, mat.steel, 0, 1.2, -0.30),
            fore: box(0.056, 0.30, 0.056, mat.accent, 0, 1.1, -0.20),
            hand: box(0.07, 0.04, 0.06, mat.steel, 0, 1.0, -0.10),
            fingerL: box(0.024, 0.07, 0.04, mat.dark, 0.04, 0.95, -0.10),
            fingerR: box(0.024, 0.07, 0.04, mat.dark, -0.04, 0.95, -0.10),
            drawer: box(0.4, 0.09, 0.32, mat.steel, 0.16, 0.945, -0.08),
            handle: box(0.12, 0.02, 0.02, mat.accent, 0.16, 1.002, 0.088),
            cabinet: box(0.28, 0.26, 0.30, mat.dark, -0.26, 1.03, -0.36),
            door: box(0.28, 0.26, 0.024, mat.steel, -0.26, 1.03, -0.212),
            knob: box(0.03, 0.03, 0.03, mat.accent, -0.358, 1.03, -0.19),
            crate: box(0.065, 0.065, 0.065, mat.crate, 0.05, 0.93, 0.15),
            can: new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.09, 18), mat.can),
        }
        meshes.can.castShadow = !LITE
        scene.add(meshes.can)
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.013, 0.016, 10), mat.dark)
        lens.position.set(0, 0.028, 0)
        meshes.hand.add(lens)
        meshes.drawer.userData.kit = 'drawer'
        meshes.door.userData.kit = 'door'
        meshes.crate.userData.kit = 'crate'
        meshes.can.userData.kit = 'can'
        meshes.handle.userData.kit = 'drawer'
        meshes.knob.userData.kit = 'door'

        // --- stage 4a juice (issue #1570 item 3): contact sparks and dust ----
        // One additive-blended THREE.Points pool — fade happens in the color
        // (additive black = invisible), so no per-particle alpha shader and no
        // new asset files. Sparks are hot cyan and fast; dust is tan, slow,
        // and settles. Spawn sites: slips (grinding pads), hard landings
        // (cargo slamming the bench), grip strikes.
        const P_MAX = 96
        const pPos = new Float32Array(P_MAX * 3)
        const pCol = new Float32Array(P_MAX * 3)
        const pGeo = new THREE.BufferGeometry()
        pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3))
        pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3))
        const points = new THREE.Points(pGeo, new THREE.PointsMaterial({
            size: 0.016, vertexColors: true, transparent: true, opacity: 0.95,
            depthWrite: false, blending: THREE.AdditiveBlending,
        }))
        points.frustumCulled = false
        scene.add(points)
        const parts = []
        const spawn = (n, p, kind) => {
            for (let i = 0; i < n && parts.length < P_MAX; i++) {
                const r = Math.random
                if (kind === 'spark') {
                    parts.push({ x: p[0], y: p[1], z: p[2], vx: (r() - 0.5) * 1.6, vy: r() * 1.4, vz: (r() - 0.5) * 1.6, life: 0.22 + r() * 0.14, max: 0.36, c: [0.45, 1.0, 0.9] })
                } else {
                    parts.push({ x: p[0] + (r() - 0.5) * 0.03, y: p[1], z: p[2] + (r() - 0.5) * 0.03, vx: (r() - 0.5) * 0.35, vy: 0.12 + r() * 0.25, vz: (r() - 0.5) * 0.35, life: 0.5 + r() * 0.3, max: 0.8, c: [0.5, 0.4, 0.26] })
                }
            }
        }
        const stepParts = () => {
            for (let i = parts.length - 1; i >= 0; i--) {
                const q = parts[i]
                q.life -= FIXED_DT
                if (q.life <= 0) { parts.splice(i, 1); continue }
                q.vy -= (q.c[0] > 0.4 && q.c[1] > 0.9 ? 6.5 : 1.6) * FIXED_DT
                q.x += q.vx * FIXED_DT; q.y += q.vy * FIXED_DT; q.z += q.vz * FIXED_DT
            }
            for (let i = 0; i < P_MAX; i++) {
                const q = parts[i]
                if (!q) { pPos[i * 3] = 0; pPos[i * 3 + 1] = -5; pPos[i * 3 + 2] = 0; pCol[i * 3] = pCol[i * 3 + 1] = pCol[i * 3 + 2] = 0; continue }
                const f = Math.max(0, q.life / q.max)
                pPos[i * 3] = q.x; pPos[i * 3 + 1] = q.y; pPos[i * 3 + 2] = q.z
                pCol[i * 3] = q.c[0] * f; pCol[i * 3 + 1] = q.c[1] * f; pCol[i * 3 + 2] = q.c[2] * f
            }
            pGeo.attributes.position.needsUpdate = true
            pGeo.attributes.color.needsUpdate = true
        }

        const sync = () => {
            const st = sim.state()
            const bodies = { ...sim.arm.bodies }
            const put = (m, b) => {
                m.position.set(b.position.x, b.position.y, b.position.z)
                m.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w)
            }
            for (const k of ['yoke', 'upper', 'fore', 'hand', 'fingerL', 'fingerR']) put(meshes[k], bodies[k])
            put(meshes.drawer, sim.drawer.body)
            put(meshes.door, sim.cabinet.body)
            meshes.handle.position.copy(meshes.drawer.position).add(new THREE.Vector3(0, 0.057, 0.168).applyQuaternion(meshes.drawer.quaternion))
            meshes.knob.position.copy(meshes.door.position).add(new THREE.Vector3(-0.098, 0, 0.022).applyQuaternion(meshes.door.quaternion))
            put(meshes.crate, sim.crate)
            put(meshes.can, sim.can)
            return st
        }

        const keys = new Set()
        const padNow = () => ({
            left: keys.has('ArrowLeft'), right: keys.has('ArrowRight'),
            up: keys.has('ArrowUp'), down: keys.has('ArrowDown'),
            a: keys.has('Space'), b: keys.has('ShiftLeft'),
            x: (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0),
            y: (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0),
        })

        const ray = new THREE.Raycaster()
        const ndc = new THREE.Vector2()
        const pickables = [meshes.drawer, meshes.door, meshes.handle, meshes.knob, meshes.crate, meshes.can, benchTop]
        const onPointer = (ev) => {
            if (phaseRef.current !== 'play' || pausedRef.current) return
            // #1637 WATCH: a touch on the bench is the player driving — hand back first.
            if (watchingRef.current) { watchingRef.current = false; setWatching(false); playWatchStop() }
            const r = canvas.getBoundingClientRect()
            ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1)
            ray.setFromCamera(ndc, cam)
            const hit = ray.intersectObjects(pickables, false)[0]
            if (hit) {
                const p = hit.point
                sim.tap(hit.object.userData.kit, [p.x, p.y, p.z])
            }
            audioController.playTone(330, 0.05, 'square')
        }
        canvas.addEventListener('pointerdown', onPointer)

        let ep = null
        let lastSlips = 0
        let shake = 0
        let prevHeld = null
        let whineT = 0
        const fall = { crate: null, can: null }
        let runSeed = 1
        const startRun = (seed) => {
            runSeed = seed >>> 0
            sim = createRobotSim(seed)
            autopilot = createAutopilot(sim) // keep the driver bound to the live sim (#1637: watch seats it mid-run)
            ep = createEpisode({ gameId: 'robot-lab', method: 'stick', seed, players: 1, task: 'crate-in-drawer + can-in-cabinet', assets: MANIFEST_REV })
            lastSlips = 0
            shake = 0
            prevHeld = null
            fall.crate = null; fall.can = null
            watchingRef.current = false; setWatching(false) // #1637 a new bench starts in your hands
            noGuideRef.current = false; setNoGuide(false)
        }

        const onKey = (ev) => {
            if (ev.code === 'KeyC' && phaseRef.current !== 'won') { wristRef.current = !wristRef.current; setWristOn(wristRef.current); return }
            if ((ev.code === 'KeyQ' || ev.code === 'Slash') && phaseRef.current === 'play') { setPaused((p) => !p); return }
            if (phaseRef.current === 'attract' || phaseRef.current === 'won' || phaseRef.current === 'lost') { setPhase('play'); startRun(((seedFromQuery() ?? (Date.now() % 100000)) | 0)); audioController.playTone(660, 0.08, 'square'); return }
            // #1637 WATCH: Y seats the robokitcheck-proven autopilot — but only at
            // a clean bench (nothing held, no task goal banked yet). Once the player
            // has altered the task state, the script's waypoint route no longer
            // applies, and Y declines rather than replay a fake route (Paperboy
            // junction semantics). Any driving key or tap takes the wheel back.
            if (isWatchKey(ev)) {
                ev.preventDefault()
                if (watchingRef.current) { watchingRef.current = false; setWatching(false); playWatchStop() }
                else {
                    const st = sim.state()
                    const clean = !st.done && !st.timeout && !st.held && !Object.values(st.goals).some(Boolean)
                    if (clean) { watchingRef.current = true; setWatching(true); noGuideRef.current = false; setNoGuide(false); playWatchStart() }
                    else { // the bench no longer matches the script's proven start
                        noGuideRef.current = true
                        setNoGuide(true)
                        clearTimeout(ngTimer)
                        ngTimer = setTimeout(() => { noGuideRef.current = false; setNoGuide(false) }, 2600)
                    }
                }
                return
            }
            if (watchingRef.current && isTakeoverKey(ev)) { watchingRef.current = false; setWatching(false); playWatchStop() }
            if (ev.code in KEYS) { keys.add(ev.code); ev.preventDefault() }
        }
        const onUp = (ev) => { if (ev.code in KEYS) keys.delete(ev.code) }
        window.addEventListener('keydown', onKey)
        window.addEventListener('keyup', onUp)
        const onTapStart = () => {
            if (phaseRef.current === 'attract') { setPhase('play'); startRun(((seedFromQuery() ?? (Date.now() % 100000)) | 0)) }
        }
        canvas.addEventListener('pointerdown', onTapStart)

        let autopilot = createAutopilot(sim)
        let ngTimer = 0 // #1637 the no-guide toast's fuse
        let acc = 0
        let last = performance.now()
        let raf = 0
        const wd = new THREE.Vector3()
        const wu = new THREE.Vector3()
        const hud = () => {
            const st = sim.state()
            return st
        }

        const loop = (now) => {
            raf = requestAnimationFrame(loop)
            const dt = Math.min(now - last, 250)
            last = now
            if (contractHoldsLoop()) acc = 0
            else if (!pausedRef.current) {
                acc += dt
                let steps = 0
                while (acc >= FIXED_DT && steps < 5) {
                    acc -= FIXED_DT
                    steps++
                    // #1637 WATCH: seat the proven autopilot (its waypoint phases
                    // steer by live sim state, and robokitcheck proves the win).
                    const pad = phaseRef.current === 'attract' || watchingRef.current ? autopilot() : padNow()
                    const st = sim.step({ pad })
                    if (phaseRef.current === 'play' && ep) {
                        ep.addTick([pad], null, st.hash, st.poses)
                        recordLiveTick([pad])
                        if (st.slips > lastSlips) {
                            shake = 1
                            audioController.playNoise(0.14, 0.4)
                            audioController.playTone(85, 0.22, 'sine', 0.3)
                            spawn(10, st.hand, 'spark')
                        }
                        lastSlips = st.slips
                        // Stage 4a juice edges (#1570 item 3): grip catch clicks
                        // and showers a spark, releasing the load shakes and
                        // thuds small, the joints whine pitched by the
                        // harshest torque, and hard landings puff dust.
                        if (st.held && !prevHeld) {
                            audioController.playTone(1350, 0.035, 'square', 0.12)
                            audioController.playTone(720, 0.05, 'square', 0.07, 0.035)
                            spawn(6, st.hand, 'spark')
                        } else if (!st.held && prevHeld) {
                            shake = Math.max(shake, 0.45)
                            audioController.playTone(105, 0.09, 'sine', 0.16)
                            spawn(5, st.hand, 'dust')
                        }
                        prevHeld = st.held
                        whineT++
                        if (whineT % 6 === 0) {
                            const e = Math.max(Math.abs(st.torque.yaw), Math.abs(st.torque.phi1), Math.abs(st.torque.phi2), Math.abs(st.torque.gamw))
                            if (e > 12) audioController.playTone(150 + e * 8.5, 0.085, 'sawtooth', 0.03 + e * 0.0005)
                        }
                        for (const [name, body] of [['crate', sim.crate], ['can', sim.can]]) {
                            const vy = (body.position.y - (fall[name] ?? body.position.y)) * 60
                            if ((fall[`${name}V`] ?? 0) < -1.4 && vy > -0.5 && st.held !== name) {
                                spawn(7, [body.position.x, body.position.y - 0.02, body.position.z], 'dust')
                            }
                            fall[name] = body.position.y
                            fall[`${name}V`] = vy
                        }
                        if (st.done && ep.ticks > 0) {
                            const file = ep.finish({ success: true, score: st.score, finalHash: st.hash })
                            saveEpisode(file)
                            setRuns(episodeStats())
                            ep = null
                            setPhase('won')
                            watchingRef.current = false; setWatching(false) // #1637 the shift is over — the wheel is yours again
                            audioController.playSweep(440, 880, 0.3)
                        } else if (st.timeout && ep.ticks > 0) {
                            const file = ep.finish({ success: false, score: st.score, finalHash: st.hash })
                            saveEpisode(file)
                            setRuns(episodeStats())
                            ep = null
                            setPhase('lost')
                            watchingRef.current = false; setWatching(false) // #1637 the shift is over
                            audioController.playSweep(300, 110, 0.5)
                        }
                    }
                    if (phaseRef.current === 'attract' && (sim.done || sim.tick > 1400)) {
                        runSeed = ((performance.now() | 0) % 9973) | 0
                        sim = createRobotSim(runSeed)
                        autopilot = createAutopilot(sim)
                    }
                }
            }
            sync()
            stepParts()
            if (shake > 0.02) {
                shake *= 0.86
                cam.position.set(CAM_BASE[0] + (Math.random() - 0.5) * 0.024 * shake, CAM_BASE[1] + (Math.random() - 0.5) * 0.016 * shake, CAM_BASE[2])
            } else if (shake > 0) {
                shake = 0
                cam.position.set(CAM_BASE[0], CAM_BASE[1], CAM_BASE[2])
            }
            renderer.render(scene, cam)
            if (wristRef.current) {
                wd.set(0, -1, 0).applyQuaternion(meshes.hand.quaternion)
                wu.set(0, 0, -1).applyQuaternion(meshes.hand.quaternion)
                const hp = meshes.hand.position
                wcam.position.set(hp.x + wd.x * 0.03, hp.y + wd.y * 0.03, hp.z + wd.z * 0.03)
                wcam.up.copy(wu)
                wcam.lookAt(hp.x + wd.x * 0.28, hp.y + wd.y * 0.28, hp.z + wd.z * 0.28)
                const pw = Math.max(120, Math.round(W() * 0.28))
                const ph = Math.round(pw * 0.75)
                const px = W() - pw - 8
                const py = H() - ph - 8
                renderer.setViewport(px, py, pw, ph)
                renderer.setScissor(px, py, pw, ph)
                renderer.setScissorTest(true)
                renderer.render(scene, wcam)
                renderer.setScissorTest(false)
                renderer.setViewport(0, 0, W(), H())
            }
            if (phaseRef.current !== 'attract' && sim.tick % 8 === 0) {
                const s2 = sim.state()
                setTq({ t: s2.torque, sat: s2.sat, g: s2.gripN, b: s2.budgetN, s: s2.slips, p: s2.gap, h: s2.held, sr: s2.baseStrainN, bd: s2.baseDelta })
            }
        }
        raf = requestAnimationFrame(loop)

        const resize = () => {
            renderer.setSize(W(), H(), false)
            cam.aspect = W() / H()
            cam.updateProjectionMatrix()
        }
        window.addEventListener('resize', resize)

        if (import.meta.env.DEV) {
            exposeGame({
                id: 'robot-lab',
                method: 'stick',
                players: 1,
                buttons: ['a', 'b'],
                reads: ['x', 'y'],
                reset: (seed) => {
                    runSeed = seed >>> 0
                    sim = createRobotSim(seed); autopilot = createAutopilot(sim)
                    ep = createEpisode({ gameId: 'robot-lab', method: 'stick', seed, players: 1, task: 'crate-in-drawer + can-in-cabinet', assets: MANIFEST_REV })
                    lastSlips = 0; shake = 0
                    prevHeld = null; fall.crate = null; fall.can = null
                    phaseRef.current = 'play'; setPhase('play')
                    return sim.state()
                },
                tick: (pad) => { sim.step({ pad }) },
                state: () => sim.state(),
                canvas: () => canvas,
                snapshot: () => sim.snapshot(),
                restore: (s) => sim.restore(s),
            })
            mountDbg({
                title: 'ROBOT LAB',
                getState: () => hud(),
                actions: [
                    { label: 'RESEED', run: () => startRun((performance.now() | 0) % 9973) },
                ],
            })
            // #1637 watchcheck pilot drives this.
            window.__robotTest = {
                watching: () => watchingRef.current,
                noGuide: () => noGuideRef.current,
                probe: () => {
                    const st = sim.state()
                    return { tick: sim.tick, score: st.score, held: st.held, goals: { ...st.goals }, hand: [...st.hand], done: st.done, timeout: st.timeout }
                },
                watchSfx: watchSfxLog,
            }
        }

        // #1473: production-safe feedback state (seed for replay), every build
        exposeFeedbackState(() => ({ tick: sim.tick, score: sim.state().score, done: !!sim.done, seed: runSeed, wrist: !!wristRef.current }))

        return () => {
            unexposeFeedbackState()
            cancelAnimationFrame(raf)
            window.removeEventListener('keydown', onKey)
            window.removeEventListener('keyup', onUp)
            window.removeEventListener('resize', resize)
            canvas.removeEventListener('pointerdown', onPointer)
            canvas.removeEventListener('pointerdown', onTapStart)
            unexposeGame()
            unmountDbg()
            clearTimeout(ngTimer)
            if (window.__robotTest) delete window.__robotTest
            renderer.dispose()
        }
    }, [])

    const entry = GAMES.find((x) => x.label === 'ROBOT LAB')
    return (
        <div className="relative h-full w-full overflow-hidden bg-[#10151f]">
            <div ref={mountRef} className="absolute inset-0">
                <canvas ref={canvasRef} className="h-full w-full" />
            </div>
            <div className="pointer-events-none absolute left-3 top-2 select-none font-mono text-[11px] leading-4 text-emerald-300/90">
                <div>ROBOT LAB</div>
                <div>PUT THE CRATE IN THE DRAWER · STOW THE CAN · CLOSE UP</div>
                {phase !== 'attract' && <div className="text-slate-500">EPISODES {runs.saved} SAVED · {runs.won} WON</div>}
            </div>
            {phase !== 'attract' && (
                <div className="pointer-events-none absolute bottom-2 left-3 select-none font-mono text-[9px] leading-[13px] text-slate-400">
                    <div className="text-slate-500">ASSEMBLY · {MANIFEST_REV} · SIMREADY LINK-LIST, NOTHING MIRRORED</div>
                    {ASSEMBLY.map((a) => (
                        <div key={a.slot}>
                            {a.slot.toUpperCase()} · {a.supplier.length > 26 ? `${a.supplier.slice(0, 25)}…` : a.supplier} · <span className={GATE_COLOR[a.gate] || 'text-slate-400'}>{a.gate.toUpperCase()}</span>
                            {a.massKg === null ? ' · static' : ` · ${a.massKg.toFixed(2)} kg`}
                        </div>
                    ))}
                </div>
            )}
            {phase !== 'attract' && tq && (
                <div className="pointer-events-none absolute left-3 top-10 select-none font-mono text-[9px] leading-[13px] text-slate-400">
                    <div className="text-slate-500">JOINT TORQUE · τ/τmax · C=WRIST-CAM</div>
                    {JOINT_ROWS.map(([k, lbl]) => {
                        const v = tq.t[k]
                        const hot = Math.abs(v) >= 99
                        return (
                            <div key={k} className="flex items-center justify-end gap-1">
                                <span>{lbl}</span>
                                <span className="inline-block h-[5px] w-16 overflow-hidden bg-slate-700/60">
                                    <span className={`block h-full ${hot ? 'bg-rose-400' : 'bg-emerald-400'}`} style={{ width: `${Math.min(100, Math.abs(v))}%` }} />
                                </span>
                                <span className={hot ? 'text-rose-400' : ''}>{hot ? 'SAT' : `${v}%`}</span>
                            </div>
                        )
                    })}
                    {tq.b !== null && <div>GRIP {tq.g.toFixed(1)} / {tq.b.toFixed(0)} N</div>}
                    <div className={tq.sr > 20 ? 'text-amber-300' : ''}>
                        BASE STRAIN {tq.sr.toFixed(1)} N{tq.sr > 20 ? ' · REACTION' : ''}
                    </div>
                    {tq.bd && (
                        <div>BASE ΔX {(tq.bd.dx * 1000).toFixed(0)} mm · ΔZ {(tq.bd.dz * 1000).toFixed(0)} mm · TILT {tq.bd.tiltDeg.toFixed(1)}°</div>
                    )}
                    <div>
                        <span className={`mr-1 inline-block h-[6px] w-[6px] align-middle ${tq.h ? 'bg-emerald-400' : tq.p < 0.07 ? 'bg-amber-300' : 'bg-slate-600'}`} />
                        GRIPPER {tq.h ? `CLOSED · HOLDING ${String(tq.h).toUpperCase()}` : tq.p < 0.07 ? 'CLOSED · EMPTY' : 'OPEN'}
                    </div>
                    {tq.s > 0 && <div className="text-rose-400">CARGO SLIPPED ×{tq.s}</div>}
                </div>
            )}
            {phase !== 'attract' && wristOn && (
                <div className="pointer-events-none absolute font-mono text-[8px] text-emerald-300/70" style={{ right: 8, top: 8, width: 'max(120px, 28%)', aspectRatio: '4 / 3', border: '1px solid rgba(53,224,200,0.35)' }}>
                    <span className="absolute left-1 top-0.5">WRIST-CAM</span>
                    <span className="absolute left-1/2 top-1/2 h-2 w-px -translate-x-1/2 -translate-y-1/2 bg-emerald-300/40" />
                    <span className="absolute left-1/2 top-1/2 h-px w-2 -translate-x-1/2 -translate-y-1/2 bg-emerald-300/40" />
                </div>
            )}
            {phase === 'attract' && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-black/40 font-mono text-center">
                    <div className="text-3xl font-bold tracking-widest text-emerald-300">ROBOT LAB</div>
                    <div className="mt-2 text-xs text-slate-300">A PLAICRAFT MANIPULATION SANDBOX</div>
                    <div className="mt-6 animate-pulse text-sm text-white">PRESS ANY KEY · TAP TO START</div>
                </div>
            )}
            {phase === 'won' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 font-mono text-center">
                    <div className="text-3xl font-bold text-emerald-300">TASKS COMPLETE</div>
                    <div className="mt-2 text-xs text-slate-300">EPISODE SAVED · PRESS ANY KEY</div>
                </div>
            )}
            {phase === 'lost' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 font-mono text-center">
                    <div className="text-3xl font-bold text-rose-400">TASK TIMEOUT</div>
                    <div className="mt-2 text-xs text-slate-300">EPISODE SAVED · PRESS ANY KEY</div>
                </div>
            )}
            {paused && <PauseOverlay game={entry} onResume={() => { pausedRef.current = false; setPaused(false) }} />}
            {/* #1624 WATCH — the arm runs the proven task script. */}
            {phase === 'play' && watching && <WatchToast className="absolute z-50" />}
            {noGuide && (
                <div className="absolute top-10 left-1/2 -translate-x-1/2 bg-black/85 border border-amber-500 text-amber-100 font-mono text-xs tracking-widest px-4 py-2 rounded pointer-events-none z-50 uppercase">
                    {NO_GUIDE}
                </div>
            )}
            {phase === 'play' && !paused && (
                <div className="absolute pointer-events-auto z-50" style={{ top: 'calc(3.5rem + var(--sat, 0px))', right: 'calc(0.75rem + var(--sar, 0px))' }}>
                    <WatchButton on={watching} />
                </div>
            )}
            <VirtualControls visible={phase === 'play' && !paused} secondAction={{ label: 'LIFT', code: 'ShiftLeft' }} />
        </div>
    )
}
