// WWI DOGFIGHT — the cockpit. The sky lives in ./sim.js (pure, step(state,
// input) at 30 Hz, zero Math.random) and the patrols in ./levels.js; this
// file only paints, listens, and proves the issue's muscles on screen:
//
//   - flight model  → the chase cam is mounted to the SIM's own yaw/pitch/
//     roll; whatever the sim says the nose is doing, that is where the world
//     swings, so "pixels vs state" is the same audit in a browser as in Node,
//   - instruments   → ASI (with the stall arc), altimeter, belt counter and
//     throttle are DOM refs written straight from the sim each frame — the
//     numbers a pilot actually flies by, never a React re-render storm,
//   - determinism   → attract mode IS recordMission()'s proven witness fed
//     back through the real step(), tick for tick; the DEV hook re-replays
//     your live stream and compares hashes.
//
// Arrows pitch and bank (the wings turn you — there is no rudder miracle),
// SPACE is the synchronized Vickers (it only fires rounds the sim will
// honour), Q/E throttle. Altitude is ammo. The deck is the deadline.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { CFG, FIXED_DT, newGame, step, pilotInput, recordMission, replay, stateHash, cloneGame } from './sim.js'
import { MISSION_COUNT } from './levels.js'

const texFrom = (w, h, paint) => {
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    paint(c.getContext('2d'), w, h)
    const t = THREE.CanvasTexture ? new THREE.CanvasTexture(c) : null
    if (t) t.colorSpace = THREE.SRGBColorSpace
    return t
}

const groundTex = () => texFrom(512, 512, (x, w) => {
    x.fillStyle = '#5a6e3a'; x.fillRect(0, 0, w, w)
    for (let i = 0; i < 90; i++) {
        const px = (i * 173) % w, py = (i * 271) % w
        const s = 26 + ((i * 37) % 70)
        x.fillStyle = ['#66794a', '#7d8a4e', '#4d5e33', '#8a7b52', '#5d7040'][i % 5]
        x.fillRect(px, py, s, s * 0.66)
        x.strokeStyle = 'rgba(40,50,25,0.5)'
        x.strokeRect(px, py, s, s * 0.66)
    }
    x.strokeStyle = '#3d4a2c'; x.lineWidth = 5
    x.beginPath(); x.moveTo(30, 500); x.quadraticCurveTo(200, 300, 180, 120); x.stroke()
    x.strokeStyle = '#6b7d8a'; x.lineWidth = 9
    x.beginPath(); x.moveTo(512, 210); x.quadraticCurveTo(330, 260, 300, 420); x.stroke()
    x.strokeStyle = 'rgba(30,36,20,0.7)'; x.lineWidth = 2
    for (let i = 0; i < 10; i++) {
        x.beginPath(); x.moveTo(60 + i * 42, 40 + (i % 3) * 90)
        x.lineTo(120 + i * 40, 150 + (i % 2) * 130); x.stroke()
    }
})

const cloudTex = () => texFrom(128, 128, (x, w) => {
    const g = x.createRadialGradient(w / 2, w / 2, 6, w / 2, w / 2, w / 2)
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.7, 'rgba(246,248,255,0.35)')
    g.addColorStop(1, 'rgba(246,248,255,0)')
    x.fillStyle = g; x.fillRect(0, 0, w, w)
})

const sparkTex = () => texFrom(32, 32, (x, w) => {
    const g = x.createRadialGradient(w / 2, w / 2, 1, w / 2, w / 2, w / 2)
    g.addColorStop(0, 'rgba(255,240,180,1)'); g.addColorStop(0.4, 'rgba(255,150,40,0.8)')
    g.addColorStop(1, 'rgba(255,80,0,0)')
    x.fillStyle = g; x.fillRect(0, 0, w, w)
})

function buildBiplane(faction) {
    const g = new THREE.Group()
    const body = faction === 0 ? 0xb8a06a : 0x7a7d6b
    const trim = faction === 0 ? 0xa03126 : 0x2b2b2b
    const wood = 0x6b4a26
    const mat = (c) => new THREE.MeshLambertMaterial({ color: c })
    const fus = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, 3.4), mat(body))
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.7), mat(0x3a3a3a))
    nose.position.set(0, 0.05, 1.9)
    const cock = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.6), mat(0x2a2018))
    cock.position.set(0, 0.36, -0.2)
    const wing = (y, s) => {
        const w = new THREE.Mesh(new THREE.BoxGeometry(8 * s, 0.14, 1.55 * s), mat(faction === 0 ? 0x9c8a54 : 0x6e7161))
        w.position.set(0, y, 0.2)
        return w
    }
    const tail = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.1, 0.8), mat(faction === 0 ? 0x9c8a54 : 0x6e7161))
    tail.position.set(0, 0, -1.7)
    const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.8), mat(trim))
    rudder.position.set(0, 0.3, -1.7)
    const stab = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.7), mat(0x3a3a3a))
    stab.position.set(0, 0.1, 1.75)
    const prop = new THREE.Group()
    for (const sgn of [1, -1]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.4, 0.06), mat(wood))
        b.rotation.z = sgn * Math.PI / 2
        prop.add(b)
    }
    prop.position.set(0, 0.05, 2.35)
    g.add(fus, nose, cock, wing(1.15, 1), wing(-0.5, 0.92), tail, rudder, stab, prop)
    for (const sx of [2.6, -2.6]) {
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.7, 0.08), mat(wood))
        strut.position.set(sx, 0.35, 0.2)
        g.add(strut)
    }
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.66, 0.3), mat(trim))
    band.position.set(0, 0.02, -1.1)
    g.add(band)
    g.userData.prop = prop
    return g
}

const DogfightGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [end, setEnd] = useState(null)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const overAtRef = useRef(0)
    const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])
    const hudRef = useRef({})
    const setHud = (k) => (el) => { hudRef.current[k] = el }

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const LITE = new URLSearchParams(location.search).has('lite')
        const canvas = document.createElement('canvas')
        canvas.dataset.dogStage = '1'
        canvas.className = 'block w-full h-full'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)

        const renderer = new THREE.WebGLRenderer({
            canvas, antialias: !LITE, alpha: false, powerPreference: 'high-performance',
            preserveDrawingBuffer: !!import.meta.env.DEV,
        })
        renderer.outputColorSpace = THREE.SRGBColorSpace
        renderer.setPixelRatio(LITE ? 1 : Math.min(window.devicePixelRatio || 1, 2))

        const scene = new THREE.Scene()
        scene.background = new THREE.Color(0x9db8d8)
        scene.fog = new THREE.FogExp2(0xa8c2dd, 0.00042)
        const camera = new THREE.PerspectiveCamera(72, 1, 0.5, 2600)
        scene.add(camera)
        const sun = new THREE.DirectionalLight(0xfff3d0, 1.7)
        sun.position.set(-140, 260, 90)
        scene.add(sun, new THREE.HemisphereLight(0xbfd8f2, 0x4c5636, 0.75))

        const disposables = []
        const keep = (o) => { disposables.push(o); return o }

        const gTex = keep(groundTex())
        gTex.wrapS = gTex.wrapT = THREE.RepeatWrapping
        gTex.repeat.set(14, 14)
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600), new THREE.MeshLambertMaterial({ map: gTex }))
        ground.rotation.x = -Math.PI / 2
        scene.add(ground)

        const cTex = keep(cloudTex())
        const clouds = []
        for (let i = 0; i < (LITE ? 14 : 30); i++) {
            const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cTex, transparent: true, opacity: 0.8, depthWrite: false }))
            const sc = 120 + ((i * 71) % 160)
            s.scale.set(sc, sc * 0.42, 1)
            s.position.set(((i * 379) % 1500) - 750, 160 + ((i * 53) % 260), ((i * 227) % 1500) - 750)
            scene.add(s); clouds.push(s)
        }

        const scout = buildBiplane(0)
        const bandits = [buildBiplane(1), buildBiplane(1), buildBiplane(1)]
        scene.add(scout, ...bandits)

        // tracers: one Points cloud per faction, recycled from the sim's bullets
        const MAXB = 160
        const mkTracers = (color) => {
            const geo = keep(new THREE.BufferGeometry())
            const pos = new Float32Array(MAXB * 3)
            geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
            const pts = new THREE.Points(geo, keep(new THREE.PointsMaterial({
                size: 2.4, map: keep(sparkTex()), transparent: true, depthWrite: false,
                blending: THREE.AdditiveBlending, color,
            })))
            pts.frustumCulled = false
            scene.add(pts)
            return { geo, pos, pts }
        }
        const T0 = mkTracers(0xffd76a)
        const T1 = mkTracers(0xff5a3c)
        const paintTracers = (t, bullets, faction) => {
            let n = 0
            for (const b of bullets) {
                if (b.faction !== faction || n >= MAXB) continue
                t.pos[n * 3] = b.x; t.pos[n * 3 + 1] = b.y; t.pos[n * 3 + 2] = b.z
                n++
            }
            for (let i = n; i < MAXB; i++) t.pos[i * 3 + 1] = -9999
            t.geo.attributes.position.needsUpdate = true
            t.pts.visible = n > 0
        }

        const booms = []
        const spawnBoom = (x, y, z) => {
            const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cTexTint, transparent: true, depthWrite: false }))
            s.position.set(x, y, z); s.scale.set(4, 4, 1)
            scene.add(s)
            booms.push({ s, t: 0 })
        }
        const cTexTint = keep(sparkTex())

        let raf = 0, last = 0, acc = 0
        let gs = newGame(0)
        let mission = 0
        let throttle = 0.85
        const keys = new Set()
        let demoCmds = null, demoBy = null, demoMission = 0
        let toast = 0, toastMsg = ''
        let engineAcc = 0, flash = 0
        let shake = 0

        const say = (m) => { toastMsg = m; toast = 120 }

        const handleEvents = (evts) => {
            for (const e of evts) {
                if (e.type === 'shot') {
                    if (e.who === 0) { audioController.playNoise(0.05, 0.06); shake = Math.min(0.4, shake + 0.12) }
                    else audioController.playTone(180, 0.05, 'square', 0.02)
                } else if (e.type === 'dry') audioController.playTone(220, 0.05, 'square', 0.04)
                else if (e.type === 'hit') {
                    if (e.victim === 0) { audioController.playNoise(0.1, 0.09); flash = 1; shake = 0.5; say('YOU HIT — EVASIVE!') } else { audioController.playTone(130, 0.08, 'square', 0.06); say('DIRECT HIT') }
                } else if (e.type === 'down') {
                    spawnBoom(...(e.who === 0 ? [gs.p.x, gs.p.y, gs.p.z] : (() => {
                        const f = gs.foes.find((q) => q.id === e.victim) || gs.foes[0]
                        return [f.x, f.y, f.z]
                    })()))
                    if (e.victim === 'bandit') { audioController.playSweep(300, 700, 0.4, 'square', 0.08); say('BANDIT DOWN') } else audioController.playSweep(300, 40, 0.8, 'sawtooth', 0.1)
                } else if (e.type === 'stall') audioController.playSweep(340, 120, 0.35, 'sawtooth', 0.07)
                else if (e.type === 'crash') { audioController.playNoise(0.3, 0.12); shake = 0.8 }
            }
        }

        const finishRun = () => {
            setEnd({ end: gs.end, why: gs.why, ticks: gs.tick, mission, belt: [gs.p.belt, gs.p.total], hp: gs.p.hp })
            overAtRef.current = performance.now()
            audioController[gs.end === 'win' ? 'playSweep' : 'playDeath'](...(gs.end === 'win' ? [330, 990, 0.9, 'square', 0.09] : []))
            setMode('over')
        }

        const startPlay = (m = 0) => {
            mission = ((m % MISSION_COUNT) + MISSION_COUNT) % MISSION_COUNT
            gs = newGame(mission)
            gs.cmds = []
            throttle = 0.85
            keys.clear()
            setMode('play')
            say('ALTI-SPEED FOR HEIGHT — CLIMB AND FIND THEM')
            audioController.playSweep(220, 660, 0.3, 'square', 0.07)
        }

        const buildDemo = (i) => {
            demoMission = i
            const g = recordMission(i)
            demoCmds = g.cmds
            demoBy = new Map(demoCmds.map((c) => [c.tick, c.in]))
            gs = newGame(i)
        }

        const doSim = () => {
            if (screenRef.current === 'attract') {
                const inp = demoBy.get(gs.tick) ?? null
                step(gs, inp)
                gs.cmds.length = 0
                handleEvents(gs.events.splice(0))
                if (gs.end) buildDemo((demoMission + 1) % MISSION_COUNT)
            } else if (screenRef.current === 'play' && !gs.end) {
                const up = keys.has('ArrowUp') ? 1 : 0, dn = keys.has('ArrowDown') ? 1 : 0
                const lf = keys.has('ArrowLeft') ? 1 : 0, rt = keys.has('ArrowRight') ? 1 : 0
                if (keys.has('KeyE')) throttle = Math.min(1, throttle + 0.01)
                if (keys.has('KeyQ')) throttle = Math.max(0, throttle - 0.01)
                const inp = {
                    roll: rt - lf,
                    pitch: up - dn,
                    throttle,
                    fire: keys.has('Space'),
                }
                gs.cmds.push({ tick: gs.tick, in: inp })
                step(gs, inp)
                handleEvents(gs.events.splice(0))
                if (gs.end) finishRun()
            }
        }

        const fwdv = (p) => {
            const cp = Math.cos(p.pitch)
            return { x: Math.sin(p.yaw) * cp, y: Math.sin(p.pitch), z: Math.cos(p.yaw) * cp }
        }

        const placePlane = (mesh, p) => {
            mesh.visible = true
            mesh.position.set(p.x, p.y, p.z)
            mesh.rotation.order = 'YXZ'
            mesh.rotation.set(-p.pitch, p.yaw, -p.roll)
            mesh.userData.prop.rotation.z += p.throttle * 1.2 + 0.4
        }

        const frame = (ts) => {
            raf = requestAnimationFrame(frame)
            if (!last) last = ts
            const ft = Math.min(ts - last, 250)
            last = ts
            if (!pausedRef.current) {
                acc += ft
                let guard = 0
                while (acc >= FIXED_DT * 1000 && guard < 20) { doSim(); acc -= FIXED_DT * 1000; guard++ }
                if (guard >= 20) acc = 0
            }

            const p = gs.p
            const f = fwdv(p)
            const camGoal = new THREE.Vector3(p.x - f.x * 15, p.y - f.y * 15 + 4.2, p.z - f.z * 15)
            if (shake > 0) {
                camGoal.x += (Math.random() - 0.5) * shake
                camGoal.y += (Math.random() - 0.5) * shake
                shake = Math.max(0, shake - 0.03)
            }
            camera.position.lerp(camGoal, 0.22)
            camera.up.set(-f.x * Math.sin(p.roll), Math.cos(p.roll), -f.z * Math.sin(p.roll))
            camera.lookAt(p.x + f.x * 16, p.y + f.y * 16 + 1.4, p.z + f.z * 16)
            camera.fov = 72 + Math.min(10, Math.max(0, (p.v - 60) * 0.14))
            camera.updateProjectionMatrix()

            placePlane(scout, p)
            if (!p.alive) scout.visible = false
            gs.foes.forEach((q, i) => {
                const mesh = bandits[i]
                if (!mesh) return
                if (q.alive || q.y > 3) placePlane(mesh, q)
                else mesh.visible = false
            })
            paintTracers(T0, gs.bullets, 0)
            paintTracers(T1, gs.bullets, 1)
            for (let i = booms.length - 1; i >= 0; i--) {
                const b = booms[i]
                b.t += ft / 1000
                const k = b.t / 1.6
                b.s.scale.set(4 + k * 40, 4 + k * 40, 1)
                b.s.material.opacity = Math.max(0, 1 - k)
                if (k >= 1) { scene.remove(b.s); booms.splice(i, 1) }
            }

            engineAcc += ft
            if (engineAcc > 130 && screenRef.current === 'play' && p.alive && !pausedRef.current) {
                engineAcc = 0
                audioController.playTone(58 + p.v * 1.05 + throttle * 34, 0.1, 'sawtooth', 0.016)
            }

            syncHud()
            renderer.render(scene, camera)
        }

        let lastHud = 0
        const syncHud = () => {
            const now = performance.now()
            if (now - lastHud < 80) return
            lastHud = now
            const p = gs.p
            const h = hudRef.current
            const knots = Math.max(0, Math.round(p.v * 1.944))
            if (h.asi) h.asi.textContent = String(knots)
            if (h.asiTape) h.asiTape.style.height = `${Math.min(100, (p.v / 130) * 100)}%`
            if (h.alt) h.alt.textContent = String(Math.max(0, Math.round(p.y)))
            if (h.belt) h.belt.textContent = String(Math.max(0, p.belt))
            if (h.beltBar) h.beltBar.style.width = `${(Math.max(0, p.belt) / p.total) * 100}%`
            if (h.thr) h.thr.style.height = `${Math.round(throttle * 100)}%`
            if (h.clock) h.clock.textContent = `${Math.max(0, Math.ceil(gs.clock - gs.tick / 30))}`
            if (h.stall) h.stall.style.opacity = p.alive && p.stalled ? (Math.floor(now / 160) % 2 ? '1' : '0.2') : '0'
            if (h.bank) h.bank.style.transform = `rotate(${-p.roll * 57.3}deg)`
            if (h.hp) h.hp.textContent = '✚'.repeat(Math.max(0, p.hp)) + '·'.repeat(Math.max(0, 4 - p.hp))
            let tgt = null, bd = 1e18
            for (const q of gs.foes) {
                if (!q.alive) continue
                const d = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z)
                if (d < bd) { bd = d; tgt = q }
            }
            if (h.tgt) h.tgt.textContent = tgt ? `${Math.round(bd)}m` : '—'
            if (h.mission) h.mission.textContent = gs.name
            if (h.toast) { h.toast.textContent = toastMsg; h.toast.style.opacity = toast > 0 ? '1' : '0' }
            if (toast > 0 && !pausedRef.current) toast--
            if (h.flash) { h.flash.style.opacity = flash > 0 ? String(flash * 0.6) : '0'; flash = Math.max(0, flash - 0.06) }
            if (h.ret) {
                const nx = tgt ? v2px(tgt) : null
                h.ret.style.opacity = nx ? '1' : '0'
                if (nx) { h.ret.style.left = `${nx.x}%`; h.ret.style.top = `${nx.y}%` }
            }
        }
        const v2px = (q) => {
            const v = new THREE.Vector3(q.x, q.y, q.z).project(camera)
            if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) return null
            return { x: (v.x * 0.5 + 0.5) * 100, y: (-v.y * 0.5 + 0.5) * 100 }
        }

        const onDown = (e) => {
            const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (code === 'Question') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); return }
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault()
            const sc = screenRef.current
            if (sc === 'attract') {
                if (e.code === 'Digit2') return startPlay(1)
                startPlay(0); return
            }
            if (sc === 'over') {
                if (performance.now() - overAtRef.current < 900) return
                if (e.code === 'KeyR' || e.code === 'Enter') { startPlay(mission); return }
                setMode('attract'); return
            }
            if (pausedRef.current) return
            keys.add(e.code)
        }
        const onUp = (e) => keys.delete(e.code)
        const onBlur = () => keys.clear()
        const onPointer = () => {
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(0); return }
            if (sc === 'over' && performance.now() - overAtRef.current > 900) setMode('attract')
        }
        window.addEventListener('keydown', onDown)
        window.addEventListener('keyup', onUp)
        window.addEventListener('blur', onBlur)
        window.addEventListener('pointerdown', onPointer)

        const resize = () => {
            const r = wrap.getBoundingClientRect()
            if (!r.width || !r.height) return
            renderer.setSize(r.width, r.height, false)
            camera.aspect = r.width / r.height
            camera.updateProjectionMatrix()
        }
        window.addEventListener('resize', resize)
        resize()
        buildDemo(0)
        raf = requestAnimationFrame(frame)

        if (import.meta.env.DEV) {
            const ledgerOk = () => [gs.p, ...gs.foes].every((q) =>
                q.belt + q.hits + q.missed + gs.bullets.filter((b) => b.owner === q.id).length === q.total)
            window.__dogTest = {
                probe: () => ({
                    screen: screenRef.current, tick: gs.tick, end: gs.end, why: gs.why, mission,
                    p: { x: gs.p.x, y: gs.p.y, z: gs.p.z, yaw: gs.p.yaw, pitch: gs.p.pitch, roll: gs.p.roll, v: gs.p.v, belt: gs.p.belt, hp: gs.p.hp, alive: gs.p.alive, stalled: gs.p.stalled, throttle },
                    foes: gs.foes.map((q) => ({ x: q.x, y: q.y, z: q.z, v: q.v, alive: q.alive, hp: q.hp })),
                    bullets: gs.bullets.length,
                    ledger: ledgerOk(),
                    total: gs.p.total,
                    foeFired: gs.foes.reduce((s, f) => s + f.fired, 0),
                    cmds: gs.cmds.length,
                    demoTick: screenRef.current === 'attract' ? gs.tick : null,
                }),
                // client-space pixel of a live bandit — the pixels-vs-state audit
                project: (i) => {
                    const q = gs.foes[i]
                    if (!q) return null
                    const v = new THREE.Vector3(q.x, q.y, q.z).project(camera)
                    if (v.z > 1) return null
                    return { x: (v.x * 0.5 + 0.5) * wrap.clientWidth, y: (-v.y * 0.5 + 0.5) * wrap.clientHeight, alive: q.alive }
                },
                start: startPlay,
                hash: () => stateHash(gs),
                replayCheck: () => {
                    const g2 = replay(mission, gs.cmds, { maxTicks: gs.tick })
                    return { live: stateHash(gs), replay: stateHash(g2), match: stateHash(gs) === stateHash(g2), cmds: gs.cmds.length, tick: gs.tick }
                },
                prognose: () => {
                    if (gs.end) return `already ${gs.end}`
                    const g2 = cloneGame(gs)
                    let t = 0
                    while (!g2.end && t < g2.clock * 30) { step(g2, pilotInput(g2)); t++ }
                    return g2.end === 'win'
                        ? `WINNABLE: the pilot still clears this patrol from THIS state (${Math.round(g2.tick / 30)} more seconds, belt ${g2.p.belt})`
                        : `NOT WINNABLE from here: ${g2.end} — ${g2.why}`
                },
            }
            mountDbg({
                title: 'WWI DOGFIGHT',
                getState: () => [
                    `${gs.name} tick ${gs.tick} end ${gs.end || '-'} throttle ${throttle.toFixed(2)}`,
                    `v ${gs.p.v.toFixed(1)} m/s  alt ${gs.p.y.toFixed(0)} m  hp ${gs.p.hp}  belt ${gs.p.belt}/${gs.p.total}`,
                    `bullets ${gs.bullets.length}  bandits ${gs.foes.filter((f) => f.alive).length}/${gs.foes.length}  ledger ${ledgerOk() ? 'exact' : 'BROKEN'}`,
                ],
                actions: [
                    { label: 'PROGNOSIS', run: () => window.__dogTest.prognose() },
                    { label: '+1 ROUND', run: () => { gs.p.belt++; gs.p.total++; return `belt ${gs.p.belt} — slack the solver is NOT allowed to assume` } },
                    { label: 'HIT ME', run: () => { gs.p.hp--; if (gs.p.hp <= 0) { gs.p.alive = false; gs.p.deadT = 0; gs.events.push({ type: 'crash', who: 0 }) } return `hp ${gs.p.hp}` } },
                ],
            })
        }

        return () => {
            if (import.meta.env.DEV) { if (window.__dogTest) delete window.__dogTest; unmountDbg() }
            window.removeEventListener('keydown', onDown)
            window.removeEventListener('keyup', onUp)
            window.removeEventListener('blur', onBlur)
            window.removeEventListener('resize', resize)
            window.removeEventListener('pointerdown', onPointer)
            cancelAnimationFrame(raf)
            for (const b of booms) scene.remove(b.s)
            disposables.forEach((d) => { if (d.dispose) d.dispose() })
            renderer.forceContextLoss()
            renderer.dispose()
            canvas.remove()
        }
    }, [setMode])

    const handleResume = useCallback(() => { setPaused(false); pausedRef.current = false }, [])
    const play = screen === 'play'

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden select-none" style={{ touchAction: 'none' }}>
            <div ref={stageRef} className="absolute inset-0" />

            <div className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${play ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute top-2 left-3 flex items-start gap-4 text-amber-50 font-mono">
                    <div className="bg-black/40 border border-amber-200/30 rounded px-2 py-1 text-center">
                        <div className="text-[9px] tracking-widest opacity-70">AIRSPEED kt</div>
                        <div ref={setHud('asi')} className="text-2xl font-bold text-amber-200 leading-6">0</div>
                        <div className="w-3 h-24 bg-black/40 mt-1 relative overflow-hidden mx-auto rounded-sm">
                            <div ref={setHud('asiTape')} className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-red-500 via-amber-300 to-emerald-300" style={{ height: '0%' }} />
                        </div>
                    </div>
                    <div className="bg-black/40 border border-amber-200/30 rounded px-2 py-1 text-center">
                        <div className="text-[9px] tracking-widest opacity-70">ALT m</div>
                        <div ref={setHud('alt')} className="text-2xl font-bold text-sky-200 leading-6">0</div>
                        <div ref={setHud('bank')} className="text-xl leading-6" style={{ transform: 'rotate(0deg)' }}>◹</div>
                    </div>
                    <div className="bg-black/40 border border-amber-200/30 rounded px-2 py-1">
                        <div className="text-[9px] tracking-widest opacity-70">BELT</div>
                        <div ref={setHud('belt')} className="text-xl font-bold text-yellow-100">0</div>
                        <div className="w-10 h-1.5 bg-black/50 mt-1 rounded overflow-hidden">
                            <div ref={setHud('beltBar')} className="h-full bg-yellow-300" style={{ width: '100%' }} />
                        </div>
                        <div className="text-[9px] tracking-widest opacity-70 mt-1">THR</div>
                        <div className="w-10 h-2 bg-black/50 rounded overflow-hidden flex items-end">
                            <div ref={setHud('thr')} className="w-full bg-orange-400" style={{ height: '85%' }} />
                        </div>
                    </div>
                    <div>
                        <div ref={setHud('mission')} className="bg-black/40 border border-amber-200/30 rounded px-2 py-1 text-[10px] tracking-widest text-amber-100">DAWN PATROL</div>
                        <div className="mt-1 bg-black/40 border border-amber-200/30 rounded px-2 py-1 text-[10px] text-amber-100">TGT <span ref={setHud('tgt')}>—</span> · <span ref={setHud('hp')} className="text-red-300">✚✚✚✚</span></div>
                    </div>
                </div>
                <div className="absolute top-2 right-3 bg-black/40 border border-amber-200/30 rounded px-2 py-1 text-center text-amber-50 font-mono">
                    <div className="text-[9px] tracking-widest opacity-70">FUEL s</div>
                    <div ref={setHud('clock')} className="text-2xl font-bold">170</div>
                </div>
                <div ref={setHud('ret')} className="absolute text-yellow-300/80 font-mono text-xl transition-opacity duration-100" style={{ opacity: 0, transform: 'translate(-50%,-50%)' }}>◎</div>
                <div ref={setHud('stall')} className="absolute inset-x-0 top-1/3 text-center text-red-500 font-mono font-black text-4xl tracking-widest transition-opacity duration-100" style={{ opacity: 0, textShadow: '0 0 18px #f00' }}>STALL</div>
                <div ref={setHud('toast')} className="absolute inset-x-0 top-[42%] text-center text-amber-100 font-mono font-bold text-xl transition-opacity duration-500" style={{ opacity: 0, textShadow: '0 0 12px #000' }} />
                <div ref={setHud('flash')} className="absolute inset-0 transition-opacity duration-150" style={{ boxShadow: 'inset 0 0 120px 40px rgba(200,20,20,0.5)', opacity: 0 }} />
            </div>

            {screen === 'attract' && (
                <div className="absolute inset-x-0 top-8 text-center pointer-events-none">
                    <h1 className="text-5xl font-black" style={{ color: '#e8d9a0', textShadow: '3px 0 0 #7a2b1e, -3px 0 0 #3b5aa0, 0 10px 26px #000' }}>WWI DOGFIGHT</h1>
                    <p className="text-amber-100/90 font-mono mt-1 text-sm">altitude is ammunition &mdash; speed is the coin you pay it in</p>
                    <p className="text-white font-mono font-bold mt-6 animate-pulse">TAP / PRESS ANY KEY &mdash; 1 DAWN PATROL &middot; 2 THE CIRCUS</p>
                    <p className="text-amber-100/80 font-mono text-[11px] mt-2 px-8 leading-4">
                        &uarr;/&darr; pull and push &middot; &larr;/&rarr; bank (the wings turn you &mdash; there is no rudder miracle)<br />
                        SPACE fires the synchronized Vickers &middot; Q/E throttle &middot; below the ASI&apos;s white arc the wing quits: the nose drops itself<br />
                        a zoom climb buys metres with m/s &mdash; the energy ledger never lies &middot; every round is counted, every shot is a receipt<br />
                        the attract demo is the autopilot&apos;s own proven patrol, replayed tick for tick through the real step()
                    </p>
                </div>
            )}

            {screen === 'over' && end && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-amber-50 font-mono px-6">
                    <h2 className={`text-4xl font-black mb-1 ${end.end === 'win' ? 'text-yellow-300' : 'text-red-400'}`}>
                        {end.end === 'win' ? 'PATROL CLEARED' : end.end === 'time' ? 'OUT OF FUEL' : 'SHOT DOWN'}
                    </h2>
                    <p className="text-lg mb-1">{end.why}</p>
                    <p className="text-sm text-amber-200/80 mb-4">
                        {(end.ticks / 30).toFixed(0)} s over {end.belt[1]} rounds in the belt &middot; {(end.belt[1] - end.belt[0])} fired &middot; {end.hp} wounds carried home
                    </p>
                    <p className="text-sm text-amber-100/80 mb-4">R flies it back &middot; any other key returns to the marquee</p>
                    <p className="animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find((g) => g.label === 'WWI DOGFIGHT')} onResume={handleResume} />}
            <VirtualControls secondAction={{ label: 'TH', code: 'KeyE' }} visible={play && !paused} />
        </div>
    )
}

export default DogfightGame
