// BEEZEE — a first-person honeybee flier for the arcade.
//
// Magic Carpet meets Bug's Life: you leave the hive, fight the wind down to
// knee-high grass, drink flower centers a human cannot even see (UV vision is a
// real aiming mode, not a filter), dodge webs, wasps, a bird and the landlord's
// pet gecko, and bank the nectar before the sun sets.
//
// This file is the shell: renderer, first-person camera, runtime art, input, HUD.
// It decides NOTHING about the game — `sim.step()` does that, in a module plain
// Node can import (scripts/beecheck.mjs proves every garden is winnable with the
// same autopilot that flies the attract demo). The split is the heistcheck rule.
//
// Shell layout: 1. renderer 2. shared art caches (every texture is a canvas)
// 3. fixed-timestep loop 4. input 5. DEV hook 6. React shell + HUD.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { newGame, step, autopilot, windAt, CFG, FIXED_DT } from './sim.js'

const texFrom = (w, h, paint) => {
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    paint(c.getContext('2d'), w, h)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
}

const petalTex = (base, edge) => texFrom(64, 64, (x, w) => {
    const g = x.createRadialGradient(w / 2, w * 0.9, 2, w / 2, w * 0.9, w)
    g.addColorStop(0, base); g.addColorStop(1, edge)
    x.fillStyle = g
    x.beginPath(); x.ellipse(w / 2, w / 2, w / 2, w * 0.4, 0, 0, 7); x.fill()
})

const centerTex = () => texFrom(64, 64, (x, w) => {
    x.fillStyle = '#6b4a12'; x.beginPath(); x.arc(w / 2, w / 2, w / 2, 0, 7); x.fill()
    x.fillStyle = '#8a621a'
    for (let i = 0; i < 26; i++) {
        const a = i * 2.4, r = (i % 5) * 5
        x.fillRect(w / 2 + Math.cos(a) * r - 1.5, w / 2 + Math.sin(a) * r - 1.5, 3, 3)
    }
})

// What a bee sees that a human cannot: a bullseye of UV-reflective paint.
const uvCenterTex = () => texFrom(64, 64, (x, w) => {
    x.fillStyle = '#160b2e'; x.beginPath(); x.arc(w / 2, w / 2, w / 2, 0, 7); x.fill()
    x.strokeStyle = '#7df3ff'; x.lineWidth = 6
    x.beginPath(); x.arc(w / 2, w / 2, 18, 0, 7); x.stroke()
    x.strokeStyle = '#b78cff'; x.lineWidth = 3
    x.beginPath(); x.arc(w / 2, w / 2, 9, 0, 7); x.stroke()
    x.fillStyle = '#ffffff'; x.beginPath(); x.arc(w / 2, w / 2, 3, 0, 7); x.fill()
})

const waspTex = () => texFrom(64, 32, (x) => {
    x.fillStyle = '#e8b32a'; x.beginPath(); x.ellipse(32, 16, 26, 11, 0, 0, 7); x.fill()
    x.fillStyle = '#221503'
    x.fillRect(20, 6, 6, 20); x.fillRect(34, 6, 6, 20); x.fillRect(46, 8, 5, 16)
    x.fillStyle = '#111'; x.beginPath(); x.arc(8, 14, 4, 0, 7); x.fill()
})

const birdTex = () => texFrom(64, 40, (x) => {
    x.fillStyle = '#3a3f4a'
    x.beginPath(); x.ellipse(32, 24, 16, 9, 0, 0, 7); x.fill()
    x.beginPath(); x.moveTo(20, 22); x.quadraticCurveTo(4, 2, 2, 20); x.quadraticCurveTo(12, 22, 22, 26); x.fill()
    x.beginPath(); x.moveTo(44, 22); x.quadraticCurveTo(60, 2, 62, 20); x.quadraticCurveTo(52, 22, 42, 26); x.fill()
    x.fillStyle = '#8c2f2f'; x.beginPath(); x.arc(21, 20, 3.4, 0, 7); x.fill()
    x.fillStyle = '#e6a83a'; x.fillRect(13, 22, 7, 3)
})

const webTex = () => texFrom(128, 128, (x, w) => {
    x.strokeStyle = 'rgba(240,246,255,0.85)'; x.lineWidth = 1.4
    for (let i = 0; i < 9; i++) {
        const a = i / 9 * Math.PI * 2
        x.beginPath(); x.moveTo(w / 2, w / 2)
        x.lineTo(w / 2 + Math.cos(a) * 62, w / 2 + Math.sin(a) * 62); x.stroke()
    }
    for (let r = 12; r < 60; r += 10) {
        x.beginPath()
        for (let i = 0; i <= 9; i++) {
            const a = i / 9 * Math.PI * 2
            const rr = r + Math.sin(i * 3.1) * 3
            x.lineTo(w / 2 + Math.cos(a) * rr, w / 2 + Math.sin(a) * rr)
        }
        x.stroke()
    }
})

const grassTex = () => texFrom(128, 128, (x, w) => {
    x.fillStyle = '#5d9b3f'; x.fillRect(0, 0, w, w)
    for (let i = 0; i < 420; i++) {
        const r = 60 + Math.random() * 60, g = 120 + Math.random() * 90
        x.strokeStyle = `rgb(${r * 0.7 | 0},${g | 0},${r * 0.5 | 0})`
        const px = Math.random() * w, py = Math.random() * w
        x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.random() * 3 - 1.5, py - 4 - Math.random() * 4); x.stroke()
    }
})

const PAL = {
    daisy: { base: '#ffffff', edge: '#eef0f8', uvEdge: '#31226e', uvBase: '#241a54' },
    tulip: { base: '#e4572e', edge: '#8e2f3a', uvEdge: '#4a2f8e', uvBase: '#221544' },
    deepcup: { base: '#f2b134', edge: '#c9631b', uvEdge: '#6d54d6', uvBase: '#1b1240' },
}

const BeeGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [end, setEnd] = useState(null)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const overAtRef = useRef(0)

    const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])
    // HUD text is written straight to DOM refs from the rAF loop — React state at
    // 60 Hz is a re-render storm for six numbers. The refs live at component scope
    // because JSX needs them too; the loop fills them.
    const hudRef = useRef({})
    const setHud = (k) => (el) => { hudRef.current[k] = el }
    const board = () => {
        try { return JSON.parse(localStorage.getItem('beezee.board') || '[]') } catch { return [] }
    }

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const LITE = new URLSearchParams(location.search).has('lite')
        // A fresh canvas per mount, not a JSX one: <StrictMode> mounts the effect
        // twice, and forceContextLoss on a JSX-owned canvas hands the second mount
        // a dead WebGL context (the RaccoonHeist lesson).
        const canvas = document.createElement('canvas')
        canvas.dataset.beeStage = '1'
        canvas.className = 'block w-full h-full'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)

        const renderer = new THREE.WebGLRenderer({
            canvas, antialias: !LITE, alpha: false, powerPreference: 'high-performance',
            // dev-only readback for the pixel checks; paying for it on a phone is a real fps
            preserveDrawingBuffer: !!import.meta.env.DEV,
        })
        renderer.outputColorSpace = THREE.SRGBColorSpace
        renderer.setPixelRatio(LITE ? 1 : Math.min(window.devicePixelRatio || 1, 2))

        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(76, 1, 0.05, 300)
        scene.add(camera)
        const sunLight = new THREE.DirectionalLight(0xfff2cf, 1.5)
        scene.add(sunLight, new THREE.HemisphereLight(0xbfe3ff, 0x4a6b2e, 0.85))

        const disposables = []
        const keep = (o) => { disposables.push(o); return o }

        // ---------- shared art (built once per mount) ----------
        const gTex = keep(grassTex())
        gTex.wrapS = gTex.wrapT = THREE.RepeatWrapping
        gTex.repeat.set(30, 30)
        const ground = new THREE.Mesh(new THREE.CircleGeometry(CFG.radius + 26, 44), new THREE.MeshLambertMaterial({ map: gTex }))
        ground.rotation.x = -Math.PI / 2
        scene.add(ground)

        const sun = new THREE.Mesh(new THREE.SphereGeometry(6, 18, 18), new THREE.MeshBasicMaterial({ color: 0xffd873 }))
        scene.add(sun)

        const stemGeo = keep(new THREE.CylinderGeometry(0.05, 0.075, 1, 6))
        const petalGeo = keep(new THREE.PlaneGeometry(0.5, 0.5))
        const centerGeo = keep(new THREE.CircleGeometry(0.2, 16))
        const stemMat = keep(new THREE.MeshLambertMaterial({ color: 0x3f7a2c }))
        const kindMats = {}
        for (const [kind, p] of Object.entries(PAL)) {
            kindMats[kind] = {
                petal: keep(new THREE.MeshBasicMaterial({ map: keep(petalTex(p.base, p.edge)), transparent: true, side: THREE.DoubleSide, alphaTest: 0.35 })),
                uvPetal: keep(new THREE.MeshBasicMaterial({ map: keep(petalTex(p.uvEdge, p.uvBase)), transparent: true, side: THREE.DoubleSide, alphaTest: 0.35 })),
                center: keep(new THREE.MeshBasicMaterial({ map: keep(centerTex()) })),
                uvCenter: keep(new THREE.MeshBasicMaterial({ map: keep(uvCenterTex()) })),
            }
        }

        const hive = new THREE.Group()
        for (let i = 0; i < 4; i++) {
            const s = new THREE.Mesh(new THREE.SphereGeometry(1.15 - i * 0.22, 12, 10), new THREE.MeshLambertMaterial({ color: 0xc99a2e }))
            s.position.y = 0.3 + i * 0.72
            hive.add(s)
        }
        const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.34, 14), new THREE.MeshBasicMaterial({ color: 0x3a2405 }))
        mouth.position.set(0, 0.5, 1.02)
        hive.add(mouth)
        scene.add(hive)

        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7), new THREE.MeshLambertMaterial({ color: 0x8d8577 }))
        rock.position.set(4.6, 0.34, 0.5); rock.scale.set(1.3, 0.7, 1.1)
        scene.add(rock)
        const gecko = new THREE.Group()
        const gbody = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.42, 4, 8), new THREE.MeshLambertMaterial({ color: 0x57b84a }))
        gbody.rotation.z = Math.PI / 2
        const tongue = new THREE.Mesh(new THREE.BoxGeometry(1, 0.025, 0.045), new THREE.MeshBasicMaterial({ color: 0xe05a7a }))
        tongue.position.set(0.65, 0.02, 0); tongue.visible = false
        gecko.add(gbody, tongue)
        for (const zz of [0.07, -0.07]) {
            const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffd23e }))
            e.position.set(0.32, 0.08, zz)
            gecko.add(e)
        }
        gecko.position.set(4.6, 0.82, 0.5)
        scene.add(gecko)

        const wTex = keep(webTex())
        const waspGeo = keep(new THREE.PlaneGeometry(0.6, 0.3))
        const waspMat = keep(new THREE.MeshBasicMaterial({ map: keep(waspTex()), transparent: true, side: THREE.DoubleSide, alphaTest: 0.4 }))
        const birdMat = keep(new THREE.SpriteMaterial({ map: keep(birdTex()), transparent: true, depthWrite: false }))
        const birdMesh = new THREE.Sprite(birdMat)
        birdMesh.scale.set(1.7, 1.06, 1)
        scene.add(birdMesh)

        // wind streaks: the vector, made visible
        const WINDN = 80
        const windPos = new Float32Array(WINDN * 6)
        const windGeo = keep(new THREE.BufferGeometry())
        windGeo.setAttribute('position', new THREE.BufferAttribute(windPos, 3))
        const windLines = new THREE.LineSegments(windGeo, keep(new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16 })))
        scene.add(windLines)
        const windDots = Array.from({ length: WINDN }, () => ({
            x: (Math.random() - 0.5) * 70, y: Math.random() * 6 + 0.4, z: (Math.random() - 0.5) * 70,
        }))

        // first-person bee body: wings + a fuzzy thorax rim, parented to the camera
        const wingMat = keep(new THREE.MeshBasicMaterial({
            map: keep(texFrom(32, 32, (x, w) => {
                x.fillStyle = 'rgba(225,238,255,0.55)'
                x.beginPath(); x.ellipse(w / 2, w / 2, w / 2, w * 0.26, 0, 0, 7); x.fill()
            })),
            transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false,
        }))
        const wingL = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.16, 0.075)), wingMat)
        wingL.position.set(0.08, -0.15, -0.28)
        const wingR = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.16, 0.075)), wingMat)
        wingR.position.set(-0.08, -0.15, -0.28)
        const thorax = new THREE.Mesh(keep(new THREE.SphereGeometry(0.075, 10, 8)), new THREE.MeshLambertMaterial({ color: 0xcaa23c }))
        thorax.position.set(0, -0.2, -0.26)
        camera.add(wingL, wingR, thorax)

        // ---------- flower/hazard assembly (rebuilt per garden) ----------
        let flowerNodes = []   // { f, group, head, center, petals }
        let webNodes = []
        let waspNodes = []
        const clearNodes = () => {
            for (const n of flowerNodes) scene.remove(n.group)
            for (const n of webNodes) scene.remove(n)
            for (const n of waspNodes) scene.remove(n)
            flowerNodes = []; webNodes = []; waspNodes = []
        }
        const buildWorldNodes = (world) => {
            clearNodes()
            for (const f of world.flowers) {
                const mats = kindMats[f.kind]
                const g = new THREE.Group()
                const stem = new THREE.Mesh(stemGeo, stemMat)
                stem.scale.y = f.stemH; stem.position.y = f.stemH / 2
                g.add(stem)
                const head = new THREE.Group()
                head.position.y = f.stemH + 0.02
                const nP = f.kind === 'daisy' ? 8 : 6
                const petals = []
                for (let i = 0; i < nP; i++) {
                    const p = new THREE.Mesh(petalGeo, mats.petal)
                    const a = i / nP * Math.PI * 2
                    p.position.set(Math.cos(a) * 0.27, 0.07, Math.sin(a) * 0.27)
                    p.rotation.set(-Math.PI / 2.1, 0, -a)
                    head.add(p); petals.push(p)
                }
                const center = new THREE.Mesh(centerGeo, mats.center)
                center.rotation.x = -Math.PI / 2
                center.position.y = 0.07
                head.add(center)
                g.add(head)
                g.position.set(f.x, 0, f.z)
                scene.add(g)
                flowerNodes.push({ f, group: g, head, center, petals, mats })
            }
            for (const w of world.webs) {
                const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: wTex, transparent: true, opacity: 0.85, depthWrite: false }))
                s.scale.set(w.r * 2.3, w.r * 2.3, 1)
                s.position.set(w.x, w.y, w.z)
                scene.add(s); webNodes.push(s)
            }
            for (const _w of world.wasps) {
                const m = new THREE.Mesh(waspGeo, waspMat)
                scene.add(m); waspNodes.push(m)
            }
        }

        const paintUv = (uv) => {
            scene.background = new THREE.Color(uv ? 0x2a1150 : 0x8ec9ea)
            scene.fog = new THREE.FogExp2(uv ? 0x3b1d63 : 0x9ecbe0, uv ? 0.015 : 0.0105)
            sunLight.intensity = uv ? 0.12 : 1.5
            for (const n of flowerNodes) {
                n.center.material = uv ? n.mats.uvCenter : n.mats.center
                for (const p of n.petals) p.material = uv ? n.mats.uvPetal : n.mats.petal
            }
        }

        // ---------- state + loop ----------
        let gardenIdx = 0
        let gs = newGame(0)
        buildWorldNodes(gs.world)
        paintUv(false)
        const keys = new Set()
        const input = { yaw: 0, pitch: 0, thrust: false, sprint: false, uv: false }
        let demoT = 0
        let buzzAcc = 0
        let raf = 0
        let last = 0
        let acc = 0
        const sunA = new THREE.Color(0xffd873)
        const sunDusk = new THREE.Color(0xff5a2a)
        const skyDay = new THREE.Color(0x8ec9ea)
        const skyDusk = new THREE.Color(0xe07a3c)

        const handleEvents = (evts) => {
            for (const e of evts) {
                if (e.type === 'collect') audioController.playTone(720 + (e.flower % 3) * 130, 0.09, 'triangle', 0.09)
                else if (e.type === 'deliver') { audioController.playSweep(520, 1040, 0.25, 'square', 0.1); audioController.playTone(1568, 0.12, 'square', 0.07) }
                else if (e.type === 'sting') { audioController.playSweep(300, 80, 0.3, 'sawtooth', 0.13); audioController.playNoise(0.18, 0.1) }
                else if (e.type === 'web') { audioController.playNoise(0.22, 0.05); audioController.playSweep(240, 150, 0.2, 'triangle', 0.05) }
                else if (e.type === 'spill') audioController.playSweep(620, 220, 0.15, 'sine', 0.07)
            }
        }

        const finishRun = () => {
            const entry = { score: gs.score, nectar: gs.delivered, garden: gs.world.name, date: new Date().toISOString().slice(2, 10) }
            const b = [...board(), entry].sort((x, y) => y.score - x.score).slice(0, 8)
            localStorage.setItem('beezee.board', JSON.stringify(b))
            setEnd({
                score: gs.score, delivered: gs.delivered,
                cause: gs.end === 'sun' ? 'THE SUN SET' : 'STUNG DOWN',
                cleared: gs.end === 'delivered',
            })
            overAtRef.current = performance.now()
            setMode('over')
            audioController.playDeath()
        }

        const restart = (autoNext) => {
            if (!autoNext) gardenIdx = 0
            else gardenIdx = (gardenIdx + 1) % 2
            gs = newGame(gardenIdx)
            buildWorldNodes(gs.world)
            paintUv(false)
            demoT = 0
            keys.clear()
        }

        const doSim = () => {
            if (screenRef.current === 'attract') {
                demoT += FIXED_DT
                handleEvents(step(gs, autopilot(gs)).events)
                if (gs.end || demoT > 70) restart(true)
            } else if (screenRef.current === 'play') {
                input.uv = keys.has('KeyV')
                input.thrust = keys.has('Space') || keys.has('KeyZ')
                input.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight')
                input.yaw = (keys.has('ArrowLeft') ? 1 : 0) - (keys.has('ArrowRight') ? 1 : 0)
                input.pitch = (keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0)
                handleEvents(step(gs, input).events)
                if (gs.end) finishRun()
            }
        }

        const frame = (ts) => {
            raf = requestAnimationFrame(frame)
            if (!last) last = ts
            const ft = Math.min(ts - last, 250)
            last = ts
            if (pausedRef.current) return
            acc += ft
            while (acc >= FIXED_DT * 1000) { doSim(); acc -= FIXED_DT * 1000 }

            const b = gs.bee
            const dayF = Math.min(1, gs.t / CFG.day)

            camera.position.set(b.x, b.y + 0.04 + Math.sin(gs.t * 9) * (input.thrust ? 0.02 : 0.007), b.z)
            camera.rotation.set(0, 0, b.stuck > 0 ? Math.sin(gs.t * 7) * 0.09 : 0)
            camera.rotateY(Math.PI + b.yaw)
            camera.rotateX(-b.pitch + Math.sin(gs.t * 13) * 0.005)

            const sa = 0.25 + dayF * 1.1
            sun.position.set(Math.cos(sa) * 130, Math.sin(sa) * 60, -75)
            sunLight.position.set(-Math.cos(sa) * 18, Math.max(1.5, Math.sin(sa) * 26), -12)
            const dusk = gs.uv ? 0 : Math.max(0, (dayF - 0.55) / 0.45)
            if (!gs.uv) {
                scene.background.lerpColors(skyDay, skyDusk, dusk * 0.8)
                scene.fog.color.copy(scene.background)
            }
            sun.material.color.lerpColors(sunA, sunDusk, Math.max(dusk, gs.uv ? 1 : 0))
            sunLight.intensity = gs.uv ? 0.12 : 1.5 - dusk * 0.9

            const [wx, wz] = windAt(gs.world, gs.t)
            for (const n of flowerNodes) {
                n.group.rotation.z = Math.sin(gs.t * 1.7 + n.f.sway) * 0.05 * (1 + Math.abs(wx) * 0.12)
                n.head.visible = n.f.nectar > 0
            }
            gs.world.wasps.forEach((w, i) => {
                const m = waspNodes[i]
                if (!m) return
                m.position.set(w.x, w.y, w.z)
                m.lookAt(camera.position.x, w.y, camera.position.z)
                m.scale.setScalar(gs.uv ? 1.15 : 1)
            })
            gecko.position.set(gs.world.gecko.x, 0.82, gs.world.gecko.z)
            gecko.rotation.y = Math.atan2(b.x - gs.world.gecko.x, b.z - gs.world.gecko.z)
            tongue.visible = gs.world.gecko.lash > 0
            tongue.scale.x = gs.world.gecko.lash > 0 ? Math.min(1, (0.35 - gs.world.gecko.lash) * 7) : 0.01
            birdMesh.visible = gs.bird.on
            if (gs.bird.on) birdMesh.position.set(gs.bird.x, gs.bird.y, gs.bird.z)

            const wm = Math.hypot(wx, wz) || 0.01
            for (let i = 0; i < WINDN; i++) {
                const d = windDots[i]
                d.x += wx * FIXED_DT * 2; d.z += wz * FIXED_DT * 2
                if (Math.abs(d.x - b.x) > 32 || Math.abs(d.z - b.z) > 32) {
                    d.x = b.x + (Math.random() - 0.5) * 52; d.z = b.z + (Math.random() - 0.5) * 52
                }
                const L = 0.5 + wm * 0.32
                windPos[i * 6] = d.x; windPos[i * 6 + 1] = d.y; windPos[i * 6 + 2] = d.z
                windPos[i * 6 + 3] = d.x - (wx / wm) * L; windPos[i * 6 + 4] = d.y; windPos[i * 6 + 5] = d.z - (wz / wm) * L
            }
            windGeo.attributes.position.needsUpdate = true

            wingL.rotation.z = Math.sin(gs.t * 55) * 0.9
            wingR.rotation.z = -Math.sin(gs.t * 55) * 0.9

            buzzAcc += ft
            if (buzzAcc > 140) {
                buzzAcc = 0
                if (screenRef.current === 'play' && input.thrust && !gs.end && !pausedRef.current) {
                    audioController.playSweep(input.sprint ? 190 : 148, input.sprint ? 208 : 168, 0.14, 'sawtooth', 0.02)
                }
            }

            syncHud(dayF, wx, wz)
            renderer.render(scene, camera)
        }

        // ---------- HUD ----------
        const hud = hudRef.current
        let lastHud = 0
        const syncHud = (dayF, wx, wz) => {
            const now = performance.now()
            if (now - lastHud < 90) return
            lastHud = now
            const b = gs.bee
            if (hud.sun) hud.sun.style.width = `${(1 - dayF) * 100}%`
            if (hud.nectar) hud.nectar.textContent = '●'.repeat(b.nectar) + '○'.repeat(Math.max(0, CFG.carry - b.nectar))
            if (hud.pollen) hud.pollen.textContent = String(b.pollen)
            if (hud.score) hud.score.textContent = String(gs.score).padStart(5, '0')
            if (hud.hearts) hud.hearts.textContent = '❤'.repeat(Math.max(0, gs.health)) + '·'.repeat(Math.max(0, CFG.health - gs.health))
            if (hud.wind) hud.wind.style.transform = `rotate(${Math.atan2(wx, wz) * 180 / Math.PI + 180}deg)`
            if (hud.uv) hud.uv.style.opacity = gs.uv ? '1' : '0.15'
            if (hud.scare) hud.scare.style.opacity = gs.scare > 0 ? '1' : '0'
        }

        // ---------- input ----------
        const startPlay = () => {
            restart(false)
            setMode('play')
            audioController.playSweep(330, 660, 0.2, 'square', 0.07)
        }
        const onDown = (e) => {
            const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (code === 'Question') {
                pausedRef.current = !pausedRef.current
                setPaused(pausedRef.current)
                return
            }
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault()
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(); return }
            if (sc === 'over') {
                // never let the key that got you killed instantly restart the run
                if (performance.now() - overAtRef.current > 900) setMode('attract')
                return
            }
            if (pausedRef.current) return
            keys.add(e.code)
            if (e.code === 'KeyV' && !e.repeat) audioController.playTone(1046, 0.08, 'sine', 0.05)
        }
        const onUp = (e) => keys.delete(e.code)
        const onBlur = () => keys.clear()
        const onPointer = () => {
            if (screenRef.current === 'attract') startPlay()
            else if (screenRef.current === 'over' && performance.now() - overAtRef.current > 900) setMode('attract')
        }
        window.addEventListener('keydown', onDown)
        window.addEventListener('keyup', onUp)
        window.addEventListener('blur', onBlur)
        canvas.addEventListener('pointerdown', onPointer)

        const resize = () => {
            const r = wrap.getBoundingClientRect()
            if (!r.width || !r.height) return
            renderer.setSize(r.width, r.height, false)
            camera.aspect = r.width / r.height
            camera.updateProjectionMatrix()
        }
        window.addEventListener('resize', resize)
        resize()
        raf = requestAnimationFrame(frame)

        // ---------- DEV hook (read-only probe; only keys act) ----------
        if (import.meta.env.DEV) {
            window.__beeTest = {
                probe: () => {
                    const b = gs.bee
                    const [wx, wz] = windAt(gs.world, gs.t)
                    let bd = -1, buv = false
                    for (const f of gs.world.flowers) {
                        if (f.nectar <= 0) continue
                        const d = Math.hypot(f.x - b.x, f.z - b.z)
                        if (bd < 0 || d < bd) { bd = d; buv = f.uv }
                    }
                    return {
                        screen: screenRef.current, t: gs.t, day: CFG.day, score: gs.score,
                        delivered: gs.delivered, health: gs.health, end: gs.end, garden: gs.world.name,
                        x: b.x, y: b.y, z: b.z, yaw: b.yaw, pitch: b.pitch,
                        vx: b.vx, vy: b.vy, vz: b.vz, uv: gs.uv, nectar: b.nectar, pollen: b.pollen,
                        stuck: b.stuck, scare: gs.scare, wind: [wx, wz],
                        flowersLeft: gs.world.flowers.reduce((s, f) => s + f.nectar, 0),
                        targetDist: bd, targetUv: buv, keys: [...keys], board: board(),
                    }
                },
                start: startPlay,
            }
        }

        const cleanup = () => {
            if (import.meta.env.DEV && window.__beeTest) delete window.__beeTest
            window.removeEventListener('keydown', onDown)
            window.removeEventListener('keyup', onUp)
            window.removeEventListener('blur', onBlur)
            window.removeEventListener('resize', resize)
            canvas.removeEventListener('pointerdown', onPointer)
            cancelAnimationFrame(raf)
            clearNodes()
            disposables.forEach(d => { if (d.dispose) d.dispose() })
            renderer.forceContextLoss()
            renderer.dispose()
            canvas.remove()
        }
        return cleanup
    }, [setMode])

    const handleResume = useCallback(() => {
        setPaused(false)
        pausedRef.current = false
    }, [])

    const play = screen === 'play'
    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden select-none" style={{ touchAction: 'none' }}>
            <div ref={stageRef} className="absolute inset-0" />

            <div className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${play ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute top-3 left-4 right-4 flex items-center gap-3 text-amber-50 font-mono">
                    <span className="text-sm font-bold tracking-widest">SUN</span>
                    <div className="w-36 h-3 bg-black/40 rounded-full overflow-hidden border border-black/40">
                        <div ref={setHud('sun')} className="h-full rounded-full" style={{ background: 'linear-gradient(90deg,#ffd873,#ff5a2a)', width: '100%' }} />
                    </div>
                    <span className="text-lg"><span ref={setHud('nectar')} className="tracking-tighter text-yellow-300" /></span>
                    <span className="text-sm opacity-90">✿×<span ref={setHud('pollen')}>0</span></span>
                    <span className="ml-auto text-2xl font-bold" style={{ textShadow: '0 2px 6px #000' }}>
                        <span ref={setHud('score')}>00000</span>
                    </span>
                </div>
                <div className="absolute bottom-44 left-4 text-2xl tracking-widest" style={{ textShadow: '0 2px 8px #000' }}>
                    <span ref={setHud('hearts')} className="text-red-400" />
                </div>
                <div className="absolute bottom-44 right-4 flex items-center gap-3 text-amber-100 font-mono text-xs">
                    <span ref={setHud('uv')} className="text-fuchsia-300 text-xl font-bold transition-opacity duration-200" style={{ opacity: 0.15 }}>UV◎</span>
                    <div className="flex flex-col items-center">
                        <div ref={setHud('wind')} className="text-2xl" style={{ transform: 'rotate(0deg)' }}>➤</div>
                        <span>WIND</span>
                    </div>
                </div>
                <div ref={setHud('scare')} className="absolute inset-0 opacity-0 transition-opacity duration-150" style={{ boxShadow: 'inset 0 0 90px 30px rgba(220,30,30,0.45)' }} />
            </div>

            {screen === 'attract' && (
                <div className="absolute inset-x-0 top-14 text-center pointer-events-none">
                    <h1 className="text-6xl font-black text-amber-300" style={{ textShadow: '0 4px 0 #7a4a00, 0 10px 28px #000' }}>BEEZEE</h1>
                    <p className="text-amber-100/90 font-mono mt-2 text-sm">a honeybee&apos;s last hour of light</p>
                    <p className="text-white font-mono font-bold mt-10 animate-pulse">TAP / PRESS ANY KEY</p>
                    <p className="text-amber-200/80 font-mono text-xs mt-2 px-6">
                        hover flower centers — deep cups only answer in UV —<br />fly into the hive to bank the nectar before the sun sets
                    </p>
                </div>
            )}

            {screen === 'over' && end && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-amber-50 font-mono px-6">
                    <h2 className="text-4xl font-black mb-1">{end.cause}</h2>
                    <p className="text-lg mb-4">
                        {end.score} pts · {end.nectar}🌼 banked{end.cleared ? ' · MEADOW CLEARED' : ''}
                    </p>
                    <div className="bg-black/50 border border-amber-500/40 rounded-lg p-4 w-80 max-w-full text-sm">
                        <div className="text-amber-300 font-bold mb-1 tracking-widest">NECTAR LEDGER</div>
                        {board().map((r, i) => (
                            <div key={i} className="flex justify-between gap-2">
                                <span>{i + 1}. {r.garden}</span>
                                <span>{r.nectar}🌼 {r.score}</span>
                                <span className="opacity-60">{r.date}</span>
                            </div>
                        ))}
                    </div>
                    <p className="mt-6 animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find(g => g.label === 'BEEZEE')} onResume={handleResume} />}
            <VirtualControls secondAction={{ label: 'UV', code: 'KeyV' }} visible={play && !paused} />
        </div>
    )
}

export default BeeGame
