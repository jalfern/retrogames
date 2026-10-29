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
import { exposeGame, unexposeGame, contractHoldsLoop, recordLiveTick } from '../../utils/gameContract'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { createRobotSim, createAutopilot, createEpisode, saveEpisode, manifestSummary, MANIFEST_REV } from '../../utils/robot'

const FIXED_DT = 1000 / 60
const TOUCH = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches
const LITE = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('lite')

const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Space: 'a', ShiftLeft: 'b', KeyB: 'b' }

const ASSEMBLY = manifestSummary()
const GATE_COLOR = { ship: 'text-emerald-300', credit: 'text-sky-300', review: 'text-amber-300', never: 'text-rose-400' }

export default function RobotLab() {
    const mountRef = useRef(null)
    const canvasRef = useRef(null)
    const [phase, setPhase] = useState('attract')
    const [paused, setPaused] = useState(false)
    const phaseRef = useRef('attract')
    const pausedRef = useRef(false)
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
        cam.position.set(0.12, 1.52, 1.18)
        cam.lookAt(0, 0.9, -0.18)
        const key = new THREE.DirectionalLight(0xfff2df, 2.6)
        key.position.set(1.4, 2.4, 1.6)
        key.castShadow = !LITE
        scene.add(key)
        scene.add(new THREE.HemisphereLight(0x9db4d8, 0x1c2333, 1.1))
        const rim = new THREE.PointLight(0x35e0c8, 6, 3)
        rim.position.set(-0.9, 1.6, -0.6)
        scene.add(rim)

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
        meshes.drawer.userData.kit = 'drawer'
        meshes.door.userData.kit = 'door'
        meshes.crate.userData.kit = 'crate'
        meshes.can.userData.kit = 'can'
        meshes.handle.userData.kit = 'drawer'
        meshes.knob.userData.kit = 'door'

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
        const startRun = (seed) => {
            sim = createRobotSim(seed)
            ep = createEpisode({ gameId: 'robot-lab', method: 'stick', seed, players: 1, task: 'crate-in-drawer + can-in-cabinet', assets: MANIFEST_REV })
        }

        const onKey = (ev) => {
            if ((ev.code === 'KeyQ' || ev.code === 'Slash') && phaseRef.current === 'play') { setPaused((p) => !p); return }
            if (phaseRef.current === 'attract' || phaseRef.current === 'won') { setPhase('play'); startRun((Date.now() % 100000) | 0); audioController.playTone(660, 0.08, 'square'); return }
            if (ev.code in KEYS) { keys.add(ev.code); ev.preventDefault() }
        }
        const onUp = (ev) => { if (ev.code in KEYS) keys.delete(ev.code) }
        window.addEventListener('keydown', onKey)
        window.addEventListener('keyup', onUp)
        const onTapStart = () => {
            if (phaseRef.current === 'attract') { setPhase('play'); startRun((Date.now() % 100000) | 0) }
        }
        canvas.addEventListener('pointerdown', onTapStart)

        let autopilot = createAutopilot(sim)
        let acc = 0
        let last = performance.now()
        let raf = 0
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
                    const pad = phaseRef.current === 'attract' ? autopilot() : padNow()
                    const st = sim.step({ pad })
                    if (phaseRef.current === 'play' && ep) {
                        ep.addTick([pad], null, st.hash, st.poses)
                        recordLiveTick([pad])
                        if (st.done && ep.ticks > 0) {
                            const file = ep.finish({ success: true, score: st.score, finalHash: st.hash })
                            saveEpisode(file)
                            ep = null
                            setPhase('won')
                            audioController.playSweep(440, 880, 0.3)
                        }
                    }
                    if (phaseRef.current === 'attract' && (sim.done || sim.tick > 1400)) {
                        sim = createRobotSim(((performance.now() | 0) % 9973) | 0)
                        autopilot = createAutopilot(sim)
                    }
                }
            }
            sync()
            renderer.render(scene, cam)
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
                    sim = createRobotSim(seed); autopilot = createAutopilot(sim)
                    ep = createEpisode({ gameId: 'robot-lab', method: 'stick', seed, players: 1, task: 'crate-in-drawer + can-in-cabinet', assets: MANIFEST_REV })
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
        }

        return () => {
            cancelAnimationFrame(raf)
            window.removeEventListener('keydown', onKey)
            window.removeEventListener('keyup', onUp)
            window.removeEventListener('resize', resize)
            canvas.removeEventListener('pointerdown', onPointer)
            canvas.removeEventListener('pointerdown', onTapStart)
            unexposeGame()
            unmountDbg()
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
            <PauseOverlay visible={paused} game={entry} onResume={() => setPaused(false)} />
            <VirtualControls visible={phase === 'play' && !paused} secondAction={{ label: 'LIFT', code: 'ShiftLeft' }} />
        </div>
    )
}
