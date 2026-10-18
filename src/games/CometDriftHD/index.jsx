import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { mountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop } from '../../utils/gameContract'
import { makeGame, step, decide, stateHash, fmtTime, CFG, LAPS, TIERS } from '../CometDrift/sim.js'
import { TRACK, surfaceAt, SCENERY } from '../CometDrift/track.js'
import { padState, steerPedals, smoothSteer, STEER_PIPELINE } from '../../utils/padState'
import { rumble } from '../../components/gamepadMap'
import {
    S, trackGeometryStats, buildKart, makePool, buildArch, buildSceneryItem, buildMesas, wallTopYAt,
} from './scene.js'

// =====================================================================
// COMET DRIFT HD — SUNSET GULCH, same machine, modern renderer (#465).
// The race is the unchanged CometDrift sim; this file re-draws it in real
// 3D on three.js WebGPURenderer (WebGL2 fallback on phones): extruded track
// geometry, a low sun with hemisphere fill, GPU drift-spark particles, turbo
// FOV punch, drift camera-lag. Retina-sharp at screen resolution. Retro
// sibling stays exactly as it is; both ride the same certified autopilot.
// =====================================================================

const T = TRACK
const TOUCH = typeof window !== 'undefined' &&
    (window.matchMedia?.('(pointer: coarse)')?.matches === true || 'ontouchstart' in window)

// livery: same drivers, same colors — five-second recognition is the brief
const LIVERY = {
    comet: 0x20b8dc, blaze: 0xe02818, dusty: 0xd8781c, nova: 0xf0c020,
    rex: 0x28a038, zeppa: 0x9030c8, grizz: 0x6a7058,
}
const ACCENT = {
    comet: '#dff4fa', blaze: '#ffd8c8', dusty: '#ffe8cc', nova: '#fff4cc',
    rex: '#d8f0dc', zeppa: '#e8d0ff', grizz: '#e0e4d0',
}
const TIER_COL = ['#48b8ff', '#b878ff', '#ffd23c']
const SPARK_NOCOL = 0xffb040

// the deterministic jitter for juice (never sim): same law as the retro twin,
// own implementation — particle scatter must survive a replayed seed.
const jit = (n) => { const v = Math.sin(n * 12.9898) * 43758.5453; return v - Math.floor(v) }

// ---- canvas texture factories (browser only) --------------------------
function texCanvas(w, h) {
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    return c
}
function asphaltTex() {
    const c = texCanvas(256, 256)
    const x = c.getContext('2d')
    x.fillStyle = '#585464'; x.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 2600; i++) {
        const g = 76 + jit(i * 1.7) * 50
        x.fillStyle = `rgba(${g + 10},${g},${g + 18},0.5)`
        x.fillRect(jit(i * 3.1) * 256, jit(i * 5.3) * 256, 2, 2)
    }
    // worn wheel grooves, darker and slightly polished
    x.fillStyle = 'rgba(40,34,46,0.45)'
    x.fillRect(78, 0, 20, 256); x.fillRect(158, 0, 20, 256)
    x.fillStyle = 'rgba(150,144,164,0.32)'
    x.fillRect(82, 0, 3, 256); x.fillRect(162, 0, 3, 256)
    // sealed cracks with tar lines
    x.strokeStyle = 'rgba(34,28,38,0.7)'; x.lineWidth = 1.4
    for (let k = 0; k < 7; k++) {
        x.beginPath()
        let px0 = jit(k * 7.7) * 256; let py0 = jit(k * 9.1) * 256
        x.moveTo(px0, py0)
        for (let s = 0; s < 5; s++) {
            px0 += (jit(k * 13.3 + s) - 0.5) * 46; py0 += 14 + jit(k * 3.7 + s) * 26
            x.lineTo(px0, py0)
        }
        x.stroke()
    }
    return c
}
function kerbTex() {
    const c = texCanvas(16, 64)
    const x = c.getContext('2d')
    x.fillStyle = '#d02818'; x.fillRect(0, 0, 16, 32)
    x.fillStyle = '#ece4d8'; x.fillRect(0, 32, 16, 32)
    for (let i = 0; i < 90; i++) {
        x.fillStyle = `rgba(0,0,0,${jit(i * 2.9) * 0.18})`
        x.fillRect(jit(i * 4.3) * 16, jit(i * 6.1) * 64, 2, 2)
    }
    return c
}
function sandTex() {
    const c = texCanvas(256, 256)
    const x = c.getContext('2d')
    x.fillStyle = '#8f6038'; x.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 3400; i++) {
        const r = 112 + jit(i * 1.3) * 64
        x.fillStyle = `rgba(${r},${r * 0.66},${r * 0.4},0.45)`
        x.fillRect(jit(i * 2.7) * 256, jit(i * 4.9) * 256, 2, 2)
    }
    x.strokeStyle = 'rgba(70,44,26,0.2)'; x.lineWidth = 2
    for (let k = 0; k < 9; k++) {
        x.beginPath()
        for (let px0 = 0; px0 <= 256; px0 += 16) x.lineTo(px0, k * 28 + jit(k * 5.1 + px0 * 0.01) * 10)
        x.stroke()
    }
    return c
}
function strataTex() {
    const c = texCanvas(256, 256)
    const x = c.getContext('2d')
    const bands = ['#8a4c32', '#9a5c3a', '#6e3826', '#a86848', '#5c3020', '#82503a', '#b47a54', '#66381f']
    let y0 = 0; let k = 0
    while (y0 < 256) {
        const hgt = 14 + jit(k * 7.1) * 30
        x.fillStyle = bands[k % bands.length]
        x.fillRect(0, y0, 256, Math.min(hgt, 256 - y0))
        x.fillStyle = 'rgba(0,0,0,0.28)'
        x.fillRect(0, y0, 256, 2)
        x.fillStyle = 'rgba(255,190,140,0.12)'
        x.fillRect(0, y0 + 2, 256, 2)
        y0 += hgt; k++
    }
    // vertical erosion ribs (#471): the near wall band needs parallax detail
    for (let s = 0; s < 16; s++) {
        const rx0 = jit(s * 8.9) * 256
        const wdt = 2 + jit(s * 4.1) * 4
        x.fillStyle = s % 2 ? 'rgba(255,200,150,0.10)' : 'rgba(0,0,0,0.16)'
        x.fillRect(rx0, 0, wdt, 256)
    }
    for (let i = 0; i < 1600; i++) {
        x.fillStyle = `rgba(0,0,0,${jit(i * 3.3) * 0.16})`
        x.fillRect(jit(i * 1.9) * 256, jit(i * 5.7) * 256, 2, 1)
    }
    x.strokeStyle = 'rgba(24,12,8,0.5)'; x.lineWidth = 1.2
    for (let s = 0; s < 10; s++) {
        x.beginPath()
        let px0 = jit(s * 8.3) * 256
        x.moveTo(px0, 0)
        for (let yy = 0; yy <= 256; yy += 32) { px0 += (jit(s * 3.1 + yy) - 0.5) * 22; x.lineTo(px0, yy) }
        x.stroke()
    }
    return c
}
function skyTex() {
    const c = texCanvas(64, 256)
    const x = c.getContext('2d')
    const gr = x.createLinearGradient(0, 0, 0, 256)
    gr.addColorStop(0, '#1a0f24')
    gr.addColorStop(0.38, '#4a2038')
    gr.addColorStop(0.62, '#9c4430')
    gr.addColorStop(0.8, '#e07838')
    gr.addColorStop(1, '#ffb060')
    x.fillStyle = gr; x.fillRect(0, 0, 64, 256)
    return c
}
function glowTex() {
    const c = texCanvas(128, 128)
    const x = c.getContext('2d')
    const gr = x.createRadialGradient(64, 64, 4, 64, 64, 64)
    gr.addColorStop(0, 'rgba(255,232,170,1)')
    gr.addColorStop(0.35, 'rgba(255,150,70,0.55)')
    gr.addColorStop(1, 'rgba(255,110,50,0)')
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128)
    return c
}
// a readable sun: crisp disc inside the ember wash (#471 item 1)
function discTex() {
    const c = texCanvas(64, 64)
    const x = c.getContext('2d')
    const gr = x.createRadialGradient(32, 32, 1, 32, 32, 30)
    gr.addColorStop(0, 'rgba(255,248,225,1)')
    gr.addColorStop(0.55, 'rgba(255,206,120,0.95)')
    gr.addColorStop(0.75, 'rgba(255,140,70,0.5)')
    gr.addColorStop(1, 'rgba(255,110,50,0)')
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64)
    return c
}
function dotTex() {
    const c = texCanvas(32, 32)
    const x = c.getContext('2d')
    const gr = x.createRadialGradient(16, 16, 1, 16, 16, 16)
    gr.addColorStop(0, 'rgba(255,255,255,1)')
    gr.addColorStop(0.5, 'rgba(255,255,255,0.7)')
    gr.addColorStop(1, 'rgba(255,255,255,0)')
    x.fillStyle = gr; x.fillRect(0, 0, 32, 32)
    return c
}

export default function CometDriftHD() {
    const glRef = useRef(null)
    const hudRef = useRef(null)
    const [paused, setPaused] = useState(false)
    const [padOn, setPadOn] = useState(false)
    const pausedRef = useRef(false)
    const gameRef = useRef(null)
    const screenRef = useRef('attract')
    const keysRef = useRef({})
    const tapRef = useRef(null)

    const handleResume = useCallback(() => { setPaused(false); pausedRef.current = false }, [])

    useEffect(() => {
        let glCanvas = glRef.current
        const hud = hudRef.current
        const host = glCanvas.parentElement
        // a StrictMode remount arrives after the previous lane disposed its
        // substitute canvas — clear it and show the React-owned one again
        for (const old of host.querySelectorAll('canvas[data-hdgl]')) old.remove()
        glCanvas.style.display = ''
        const hctx = hud.getContext('2d')
        const lite = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('lite')
        // WebGPU is the product default; ?gl=webgl2 pins the fallback so
        // pixel-reading harnesses (getImageData) see the frame — WebGPU
        // canvases answer black to 2D copies regardless of the flag.
        const forceGL = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('gl') === 'webgl2'

        const g = makeGame(0)
        gameRef.current = g
        const keys = keysRef.current
        const st = { screen: 'attract', endT: 0, plan: true }
        screenRef.current = 'attract'

        const BEST_KEY = 'arcade.cometHD.bestLap'
        const TOP_KEY = 'arcade.cometHD.topLaps'
        const readBest = () => { try { return Number(localStorage.getItem(BEST_KEY)) || 0 } catch { return 0 } }
        st.best = readBest()
        const readTop = () => {
            try {
                const t = JSON.parse(localStorage.getItem(TOP_KEY) || '[]')
                return Array.isArray(t) ? t.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b).slice(0, 3) : []
            } catch { return [] }
        }
        st.top = readTop()

        // ---- renderer + scene (async WebGPU init, WebGL2 fallback inside) ----
        let renderer = null
        let ready = false
        let disposed = false
        let backendName = 'pending'
        const dpr = Math.min(window.devicePixelRatio || 1, lite ? 1 : 2)

        const scene = new THREE.Scene()
        scene.fog = new THREE.FogExp2(0x8a4a3c, 0.0072)
        const camera = new THREE.PerspectiveCamera(64, 16 / 9, 0.1, 400)

        const sunDir = new THREE.Vector3(Math.cos(-0.6), 0.12, Math.sin(-0.6)).normalize()
        const sun = new THREE.DirectionalLight(0xffc090, 3.6)
        sun.position.copy(sunDir.clone().multiplyScalar(60))
        scene.add(sun)
        scene.add(new THREE.HemisphereLight(0xd06a50, 0x553018, 1.8))
        scene.add(new THREE.AmbientLight(0x6a4050, 0.95))

        const tex = (canvas, rx = 1, ry = 1) => {
            const t = new THREE.CanvasTexture(canvas)
            t.wrapS = t.wrapT = THREE.RepeatWrapping
            t.repeat.set(rx, ry)
            t.colorSpace = THREE.SRGBColorSpace
            return t
        }

        const stats = trackGeometryStats()
        const M = stats.geos
        const mat = (map, extra = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0, side: THREE.DoubleSide, ...extra })
        const roadMesh = new THREE.Mesh(M.road, mat(tex(asphaltTex()), { roughness: 0.82, metalness: 0.05 }))
        scene.add(roadMesh)
        const kerbMat = mat(tex(kerbTex()))
        scene.add(new THREE.Mesh(M.kerbL, kerbMat))
        scene.add(new THREE.Mesh(M.kerbR, kerbMat))
        const sandMat = mat(tex(sandTex()))
        scene.add(new THREE.Mesh(M.gutterL, sandMat))
        scene.add(new THREE.Mesh(M.gutterR, sandMat))
        const strataMat = mat(tex(strataTex()))
        scene.add(new THREE.Mesh(M.wallL, strataMat))
        scene.add(new THREE.Mesh(M.wallR, strataMat))
        const plateauMat = mat(tex(sandTex()), { color: 0xd8a888 })
        scene.add(new THREE.Mesh(M.plateauL, plateauMat))
        scene.add(new THREE.Mesh(M.plateauR, plateauMat))

        // canyon floor beyond the plateau rim, so no void opens under the mesas
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), mat(tex(sandTex()), { color: 0xa87850 }))
        floor.rotation.x = -Math.PI / 2
        floor.position.set(17, -0.4, 17)
        scene.add(floor)

        scene.add(buildArch(tex(strataTex())))
        const sceneryGroup = new THREE.Group()
        for (const sc of SCENERY) sceneryGroup.add(buildSceneryItem(sc))
        scene.add(sceneryGroup)
        scene.add(buildMesas())

        const dome = new THREE.Mesh(
            new THREE.SphereGeometry(150, 24, 16),
            new THREE.MeshBasicMaterial({ map: tex(skyTex()), side: THREE.BackSide, fog: false })
        )
        dome.position.set(17, 0, 17)
        scene.add(dome)
        const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: tex(glowTex()), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true, opacity: 0.95,
        }))
        sunGlow.position.copy(sunDir.clone().multiplyScalar(120)).add(new THREE.Vector3(17, 2, 17))
        sunGlow.scale.set(84, 84, 1)
        scene.add(sunGlow)
        const sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({
            map: tex(discTex()), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true,
        }))
        sunDisc.position.copy(sunGlow.position.clone()).add(new THREE.Vector3(0, 1.5, 0))
        sunDisc.scale.set(24, 24, 1)
        scene.add(sunDisc)

        // karts + blob shadows
        // dusk env-map (#471 item 4): a tiny equirect wash of the gulch sky
        // gives the liveries sky-glass reflections without a real probe.
        const envCanvas = (() => {
            const c = texCanvas(128, 64)
            const x = c.getContext('2d')
            const gr = x.createLinearGradient(0, 0, 0, 64)
            gr.addColorStop(0, '#241432'); gr.addColorStop(0.5, '#7c3a34')
            gr.addColorStop(0.78, '#e07a38'); gr.addColorStop(1, '#40281c')
            x.fillStyle = gr; x.fillRect(0, 0, 128, 64)
            const sg = x.createRadialGradient(88, 40, 2, 88, 40, 22)
            sg.addColorStop(0, 'rgba(255,230,170,1)'); sg.addColorStop(1, 'rgba(255,150,70,0)')
            x.fillStyle = sg; x.fillRect(66, 18, 44, 44)
            return c
        })()
        const envMap = new THREE.CanvasTexture(envCanvas)
        envMap.mapping = THREE.EquirectangularReflectionMapping
        envMap.colorSpace = THREE.SRGBColorSpace
        const kartMeshes = []
        for (const k of g.karts) {
            const m = buildKart(LIVERY[k.color] || 0xcccccc, ACCENT[k.color] || '#fff')
            m.userData.kart = k
            m.userData.body.envMap = envMap
            m.userData.body.envMapIntensity = 0.55
            scene.add(m)
            const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.72, 14),
                new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.34, depthWrite: false }))
            shadow.rotation.x = -Math.PI / 2
            shadow.scale.set(1, 1.5, 1)
            shadow.rotation.z = 0
            scene.add(shadow)
            kartMeshes.push({ m, shadow })
        }
        // exhaust cones on the player's buggy (flame drawn by scale + tint)
        const flames = []
        for (const sx of [-0.26, 0.26]) {
            const cone = new THREE.Mesh(new THREE.ConeGeometry(0.11, 1, 8),
                new THREE.MeshBasicMaterial({ color: 0x60c0ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }))
            cone.rotation.x = -Math.PI / 2
            cone.position.set(sx, 0.3, -1.05)
            cone.visible = false
            kartMeshes[0].m.add(cone)
            flames.push(cone)
        }

        const sparks = makePool(lite ? 260 : 700, lite ? 0.16 : 0.13)
        const dust = makePool(lite ? 200 : 520, lite ? 0.5 : 0.42)
        dust.points.material.map = tex(dotTex())
        sparks.points.material.map = tex(dotTex())
        dust.points.material.blending = THREE.NormalBlending
        scene.add(sparks.points)
        scene.add(dust.points)

        // camera rig state (px-space chase like the retro twin, same lag law).
        // #471: the kart filled the bottom 40% of the frame — the cam sits
        // further back and higher with a long look-ahead (modern chase cam),
        // and it collides: sampling the gulch behind the kart lifts it over
        // the near lip instead of burying it in the cliff.
        let camA = g.karts[0].a
        let camLift = 0
        let shake = 0
        let fovK = 0
        let prevPlace = g.karts[0].place

        const tmpF = new THREE.Vector3()
        const tmpR = new THREE.Vector3()
        const UP = new THREE.Vector3(0, 1, 0)

        let raf = 0; let acc = 0; let last = performance.now()
        let cssW = 2; let cssH = 2

        const relayout = () => {
            const r = host.getBoundingClientRect()
            cssW = Math.max(2, Math.round(r.width))
            cssH = Math.max(2, Math.round(r.height))
            hud.width = Math.round(cssW * dpr)
            hud.height = Math.round(cssH * dpr)
            hctx.setTransform(dpr, 0, 0, dpr, 0, 0)
            camera.aspect = cssW / cssH
            camera.updateProjectionMatrix()
            if (renderer) renderer.setSize(cssW, cssH, false)
        }
        relayout()
        const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => relayout()) : null
        if (ro) ro.observe(host)
        window.addEventListener('resize', relayout)

        // classic WebGL2 path: battle-tested pixel readback, and the runtime
        // refuge when a WebGPU backend dies mid-race (lost-device on some
        // drivers). The substitute goes IN FRONT of the React-owned canvas
        // (never replacing it — React re-attaches its ref on remount and
        // would silently resurrect a dead context); it becomes the first
        // canvas in the DOM, so harnesses and contract frame() see it.
        const buildLegacy = () => {
            const fresh = document.createElement('canvas')
            fresh.dataset.hdgl = '1'
            fresh.className = glCanvas.className
            fresh.style.cssText = glCanvas.style.cssText
            host.insertBefore(fresh, glCanvas)
            glCanvas.style.display = 'none'
            for (const old of host.querySelectorAll('canvas[data-hdgl]')) {
                if (old !== fresh) old.remove()
            }
            glCanvas = fresh
            const r = new THREE.WebGLRenderer({ canvas: fresh, antialias: !lite, preserveDrawingBuffer: true })
            r.setPixelRatio(dpr)
            r.setSize(cssW, cssH, false)
            r.toneMapping = THREE.ACESFilmicToneMapping
            r.toneMappingExposure = 1.35
            renderer = r
            backendName = 'webgl2-legacy'
            ready = true
        }

        ;(async () => {
            try {
                if (forceGL) throw new Error('pinned by ?gl=webgl2')
                renderer = new WebGPURenderer({ canvas: glCanvas, antialias: !lite, alpha: false, preserveDrawingBuffer: true, forceWebGL: false })
                await renderer.init()
                if (disposed) { renderer.dispose(); return }
                backendName = renderer.backend && renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl2'
                renderer.setPixelRatio(dpr)
                renderer.setSize(cssW, cssH, false)
                renderer.toneMapping = THREE.ACESFilmicToneMapping
                renderer.toneMappingExposure = 1.35
                ready = true
            } catch {
                try {
                    buildLegacy()
                } catch {
                    backendName = 'none'
                }
            }
        })()

        // ---- audio -------------------------------------------------------
        const sfx = (evs, live) => {
            if (!live) return
            for (const ev of evs) {
                if (ev.e === 'count') audioController.playTone(660, 0.12, 'square', 0.12)
                if (ev.e === 'go') audioController.playSweep(440, 880, 0.4, 'square', 0.14)
                if (ev.e === 'boost' && ev.who === 'COMET') {
                    // each tier gets its own voice, not just a higher pitch (#471 item 7)
                    if (ev.tier === 0) audioController.playSweep(340, 900, 0.3, 'square', 0.1)
                    else if (ev.tier === 1) { audioController.playSweep(240, 1150, 0.42, 'sawtooth', 0.11); audioController.playTone(1240, 0.09, 'square', 0.07) }
                    else { audioController.playSweep(180, 1450, 0.55, 'sawtooth', 0.12); audioController.playNoise(0.22, 0.1); audioController.playTone(1568, 0.1, 'square', 0.08); audioController.playTone(2093, 0.12, 'square', 0.06) }
                    shake = Math.max(shake, 3 + ev.tier * 2.5)
                }
                if (ev.e === 'spin' && ev.who === 'PLAYER') { audioController.playNoise(0.35, 0.18); shake = 16; rumble(300, 1) }
                if (ev.e === 'bump' && ev.who === 'PLAYER') { audioController.playNoise(0.12, 0.15); shake = 7; rumble(100, 0.4) }
                if (ev.e === 'lap' && ev.who === 'PLAYER') { audioController.playTone(880, 0.1, 'square', 0.12); audioController.playTone(1320, 0.1, 'square', 0.08) }
                if (ev.e === 'end') { if (ev.place === 1) audioController.playFanfare(); else audioController.playDeath() }
            }
        }
        const engine = (live) => {
            if (!live || g.phase !== 'race') return
            const P = g.karts[0]
            if (P.v < 0.5) return
            // layered saws on a gear curve: the pitch ladder steps with speed,
            // turbo sits on top of the gear, not in place of it (#471 item 7)
            const gear = Math.min(5, Math.floor(P.v / 1.6))
            const pull = (P.v * 1.6) % 8
            const base = 44 + gear * 13 + pull * 2.6 + (P.boostT > 0 ? 30 + P.boostTier * 42 : 0)
            const period = Math.max(2, 14 - Math.round(P.v))
            if (g.tick % period === 0) {
                audioController.playTone(base, 0.03, 'sawtooth', 0.022)
                audioController.playTone(base * 1.504, 0.026, 'sawtooth', 0.012)
            }
        }

        // ---- particles: world-space, spawned from live sim state ----------
        const wheelWorld = (k, side, back) => {
            const fx0 = Math.cos(k.a); const fz0 = Math.sin(k.a)
            const pxu = -Math.sin(k.a) * side; const pyu = Math.cos(k.a) * side
            return {
                x: k.x * S - fx0 * back + pxu * 0.36,
                z: k.y * S - fz0 * back + pyu * 0.36,
                fx: fx0, fz: fz0,
            }
        }
        const spawnTick = () => {
            const P = g.karts[0]
            const tier = P.charge >= TIERS[2].t ? 2 : P.charge >= TIERS[1].t ? 1 : P.charge >= TIERS[0].t ? 0 : -1
            if (P.driftT > 0 && P.v > 1) {
                const col = tier >= 0 ? parseInt(TIER_COL[tier].slice(1), 16) : SPARK_NOCOL
                for (const side of [-1, 1]) {
                    const w = wheelWorld(P, side, 0.5)
                    sparks.spawn(w.x, 0.12, w.z, -w.fx * 0.05 + (jit(g.tick + side) - 0.5) * 0.02, 0.02 + jit(g.tick * 1.7 + side) * 0.02, -w.fx * 0.05 + (jit(g.tick * 2.3 + side) - 0.5) * 0.02, 14, col)
                    dust.spawn(w.x, 0.16, w.z, -w.fx * 0.015, 0.008, -w.fz * 0.015, 24, 0xb08058)
                    // gold tier paints short streaks, not just dots (#471 item 6)
                    if (tier === 2) {
                        sparks.spawn(w.x - w.fx * 0.5, 0.13, w.z - w.fz * 0.5, -w.fx * 0.05, 0.018, -w.fz * 0.05, 11, col)
                        sparks.spawn(w.x - w.fx * 0.95, 0.13, w.z - w.fz * 0.95, -w.fx * 0.05, 0.015, -w.fz * 0.05, 9, col)
                    }
                }
            } else if (P.spinT > 0) {
                for (let i = 0; i < 3; i++) {
                    const w = wheelWorld(P, i % 2 ? 1 : -1, 0.2)
                    dust.spawn(w.x, 0.18, w.z, (jit(g.tick * 3.1 + i) - 0.5) * 0.03, 0.012, (jit(g.tick * 2.1 + i) - 0.5) * 0.03, 20, 0xb08058)
                }
            }
            if (P.offroad && P.v > 2 && (g.tick & 1) === 0) {
                const w = wheelWorld(P, 1, 0.4)
                dust.spawn(w.x, 0.14, w.z, 0, 0.006, 0, 18, 0xb08058)
            }
            // the pack drifts too: rivals earn their sparks at half rate,
            // and boost leaves a smoke trail (#471 item 6)
            for (let i = 1; i < g.karts.length; i++) {
                const k = g.karts[i]
                if ((g.tick & 1) !== 0) continue
                const side = (i % 2) * 2 - 1
                if (k.driftT > 0 && k.v > 1) {
                    const kt = k.charge >= TIERS[2].t ? 2 : k.charge >= TIERS[1].t ? 1 : k.charge >= TIERS[0].t ? 0 : -1
                    const w = wheelWorld(k, side, 0.5)
                    sparks.spawn(w.x, 0.12, w.z, -w.fx * 0.04, 0.015, -w.fz * 0.04, 12, kt >= 0 ? parseInt(TIER_COL[kt].slice(1), 16) : SPARK_NOCOL)
                }
                if (k.boostT > 0 && k.v > 2) {
                    const wb = wheelWorld(k, side, 0.9)
                    dust.spawn(wb.x, 0.3, wb.z, 0, 0.012, 0, 22, 0x8a7a82)
                }
            }
            sparks.step(-0.0016)
            dust.step(-0.0004)
        }

        // ---- mesh sync: drawn state is the sim state, every frame ---------
        const syncMeshes = () => {
            for (let i = 0; i < g.karts.length; i++) {
                const k = g.karts[i]
                const { m, shadow } = kartMeshes[i]
                m.position.set(k.x * S, 0, k.y * S)
                m.rotation.y = -k.a
                m.rotation.z = k.driftT > 0 ? (k.steerVis || 1) * 0.14 : 0
                const rough = k.offroad && k.v > 1
                const bob = rough ? (jit(g.tick * 7.7 + i) - 0.5) * 0.05 : 0
                m.position.y = bob
                // suspension squash through the washboard (#471 item 3)
                m.scale.y = rough ? 0.93 + jit(g.tick * 11.3 + i) * 0.08 : 1
                shadow.position.set(k.x * S, 0.052, k.y * S)
                for (const w of m.userData.wheels) {
                    w.rotation.y = -(k.steerVis || 0) * 0.45
                    if (w.children[0]) w.children[0].rotation.x += k.v * 0.6
                }
                const braking = (k.pv !== undefined && k.v < k.pv - 0.08) ||
                    (i === 0 && (keys.KeyS || keys.ArrowDown))
                k.pv = k.v
                if (m.userData.brakes.length) m.userData.brakes[0].material.emissiveIntensity = braking && k.spinT === 0 ? 1.8 : 0
            }
            const P = g.karts[0]
            for (const f of flames) f.visible = P.boostT > 0
            if (P.boostT > 0) {
                const flick = 0.7 + jit(g.tick * 2.9) * 0.6
                const len = (0.8 + P.boostTier * 0.55) * flick
                for (const f of flames) {
                    f.scale.set(1, 1, len)
                    f.material.color.setHex(P.boostTier >= 2 ? 0xffd860 : P.boostTier === 1 ? 0xc090ff : 0x60c0ff)
                    f.material.opacity = 0.75 + jit(g.tick) * 0.25
                }
            }
        }

        const updateCamera = () => {
            const P = g.karts[0]
            const want = P.a
            let da = want - camA
            while (da > Math.PI) da -= Math.PI * 2
            while (da < -Math.PI) da += Math.PI * 2
            camA += da * (P.driftT > 0 ? 0.055 : 0.12)
            const fovTarget = P.boostT > 0 ? 7 + P.boostTier * 5.5 : 0
            fovK += (fovTarget - fovK) * 0.08
            const back = 5.3 + fovK * 0.06
            const fx0 = Math.cos(camA); const fz0 = Math.sin(camA)
            const hx = P.x * S; const hz = P.y * S
            const baseUp = 2.75 + fovK * 0.02
            const behind = surfaceAt((hx - fx0 * back) / S, (hz - fz0 * back) / S, P.hint)
            const need = behind.surf === 'sand' || behind.surf === 'wall'
                ? Math.max(0, wallTopYAt(behind.i) + 0.55 - baseUp) : 0
            camLift += (need - camLift) * 0.22
            camera.position.set(hx - fx0 * back, baseUp + camLift, hz - fz0 * back)
            tmpF.set(fx0, 0, fz0)
            tmpR.crossVectors(tmpF, UP).normalize()
            if (shake > 0.05) {
                const s = shake * 0.55
                camera.position.addScaledVector(tmpR, ((jit(g.tick * 1.3) - 0.5) * s))
                camera.position.y += (jit(g.tick * 2.7) - 0.5) * s * 0.7
                shake *= 0.86
                if (shake < 0.05) shake = 0
            }
            camera.up.set(0, 1, 0)
            camera.lookAt(hx + fx0 * 9, 1.3 + camLift * 0.5, hz + fz0 * 9)
            camera.fov = 64 + fovK
            camera.updateProjectionMatrix()
        }

        // ---- HUD overlay: modern glass cluster in the sky band ------------
        const hs = () => Math.max(0.72, Math.min(2, Math.min(cssH / 240, cssW / 420)))
        const round = (x, y, w, h, r) => {
            hctx.beginPath()
            hctx.moveTo(x + r, y)
            hctx.arcTo(x + w, y, x + w, y + h, r)
            hctx.arcTo(x + w, y + h, x, y + h, r)
            hctx.arcTo(x, y + h, x, y, r)
            hctx.arcTo(x, y, x + w, y, r)
            hctx.closePath()
        }
        const panel = (x, y, w, h) => {
            round(x, y, w, h, 6 * hs())
            hctx.fillStyle = 'rgba(10,16,26,0.62)'
            hctx.fill()
            hctx.strokeStyle = 'rgba(80,200,230,0.4)'
            hctx.lineWidth = 1
            hctx.stroke()
        }
        const fu = (sz) => `bold ${Math.max(1, Math.round(sz * hs()))}px monospace`

        const MAP = (() => {
            let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity
            for (const p of T.pts) {
                minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
                minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
            }
            const padF = 0.08
            const sx = (1 - padF * 2) / (maxX - minX)
            const sy = (1 - padF * 2) / (maxY - minY)
            const sc = Math.min(sx, sy)
            return (x, y) => [padF + (x - minX) * sc + ((1 - padF * 2) - (maxX - minX) * sc) / 2, padF + (y - minY) * sc + ((1 - padF * 2) - (maxY - minY) * sc) / 2]
        })()

        const tierReached = (charge) => {
            let t = -1
            for (let i = 0; i < TIERS.length; i++) if (charge >= TIERS[i].t) t = i
            return t
        }

        const drawHud = () => {
            const P = g.karts[0]
            const u = hs()
            const W = cssW; const H = cssH
            // the app's #437 corner chrome floats over full-bleed canvases;
            // drop the instrument row below it so nothing writes over nothing
            const TOP = 42
            hctx.clearRect(0, 0, W, H)
            // speed streaks at the frame edges: density + tint ride v and boost
            if (P.boostT > 0 || P.v > 7.4) {
                const boost = P.boostT > 0
                const n = boost ? 16 : 9
                hctx.save()
                for (let i = 0; i < n; i++) {
                    const side = i % 2 ? 1 : -1
                    const edge = W * (0.4 + jit(i * 7.3 + (g.tick >> 2)) * 0.1)
                    const x0 = W / 2 + side * edge
                    const y0 = H * (0.35 + jit(i * 3.1 + g.tick) * 0.6)
                    const len = (26 + (boost ? 52 : 16) + jit(i + g.tick * 0.7) * 20) * u
                    hctx.globalAlpha = 0.16 + 0.26 * jit(i + g.tick * 0.5)
                    hctx.strokeStyle = boost && P.boostTier >= 1 ? '#ffe8c0' : '#d8e0f0'
                    hctx.lineWidth = Math.max(1, u * 1.2)
                    hctx.beginPath()
                    hctx.moveTo(x0, y0)
                    hctx.lineTo(x0 + side * len * 0.28, y0 + len)
                    hctx.stroke()
                }
                if (boost) {
                    hctx.globalAlpha = 0.12 + P.boostTier * 0.06
                    const gr = hctx.createLinearGradient(0, 0, W, 0)
                    gr.addColorStop(0, P.boostTier >= 2 ? '#7a4010' : '#20305a')
                    gr.addColorStop(0.5, 'rgba(0,0,0,0)')
                    gr.addColorStop(1, P.boostTier >= 2 ? '#7a4010' : '#20305a')
                    hctx.fillStyle = gr
                    hctx.fillRect(0, 0, W, H)
                }
                hctx.restore()
            }
            hctx.globalAlpha = 1
            // POS
            panel(2 * u, TOP + 2 * u, 40 * u, 30 * u)
            hctx.fillStyle = '#78a0c0'; hctx.font = fu(8)
            hctx.fillText('POS', Math.round(6 * u), Math.round(TOP + 12 * u))
            const suff = ['st', 'nd', 'rd', 'th', 'th', 'th', 'th'][P.place - 1]
            hctx.fillStyle = P.place === 1 ? '#ffd840' : '#e8f0fa'
            hctx.font = fu(18)
            hctx.fillText(`${P.place}${suff}`, Math.round(6 * u), Math.round(TOP + 28 * u))
            // speed + ladder
            panel(2 * u, TOP + 35 * u, 66 * u, 30 * u)
            hctx.fillStyle = '#e8f0fa'; hctx.font = fu(9)
            hctx.fillText(`${Math.round(P.v * 19.5)} KM/H`, Math.round(6 * u), Math.round(TOP + 45 * u))
            hctx.fillStyle = 'rgba(120,160,200,0.25)'
            round(Math.round(6 * u), Math.round(TOP + 49 * u), Math.round(58 * u), Math.round(6 * u), 3 * u); hctx.fill()
            const barW = Math.min(Math.round(58 * u), Math.round(P.v / (CFG.top + TIERS[Math.max(P.boostTier, 0)].over) * 58 * u))
            const bg = hctx.createLinearGradient(0, 0, Math.round(58 * u), 0)
            if (P.boostT > 0) { bg.addColorStop(0, '#4060ff'); bg.addColorStop(1, '#ffd840') } else if (P.offroad) { bg.addColorStop(0, '#f85820'); bg.addColorStop(1, '#f8a040') } else { bg.addColorStop(0, '#18c890'); bg.addColorStop(1, '#70f0c8') }
            if (barW > 1) { round(Math.round(6 * u), Math.round(TOP + 49 * u), barW, Math.round(6 * u), 3 * u); hctx.fillStyle = bg; hctx.fill() }
            for (let i = 0; i < 3; i++) {
                const held = P.driftT > 0 && tierReached(P.charge) >= i
                const pulse = held && tierReached(P.charge) === i && (g.tick >> 2) % 2 === 0
                hctx.fillStyle = held ? (pulse ? '#ffffff' : TIER_COL[i]) : 'rgba(120,160,200,0.25)'
                const cx = Math.round((13 + i * 9) * u); const cy = Math.round(TOP + 60 * u)
                hctx.beginPath()
                hctx.moveTo(cx - 3.4 * u, cy - 2.6 * u); hctx.lineTo(cx, cy); hctx.lineTo(cx - 3.4 * u, cy + 2.6 * u)
                hctx.lineTo(cx - 1.7 * u, cy); hctx.closePath(); hctx.fill()
            }
            // LAP centre
            panel(Math.round((W - 92 * u) / 2), TOP + 2 * u, Math.round(92 * u), Math.round(28 * u))
            hctx.textAlign = 'center'
            hctx.fillStyle = '#78a0c0'; hctx.font = fu(8)
            hctx.fillText('LAP', Math.round(W / 2), Math.round(TOP + 11 * u))
            hctx.fillStyle = '#e8f0fa'; hctx.font = fu(11)
            hctx.fillText(`${Math.min(P.lap + 1, LAPS)}/${LAPS}  ${fmtTime(Math.max(0, g.tick - P.lapStart))}`, Math.round(W / 2), Math.round(TOP + 25 * u))
            hctx.textAlign = 'left'
            // minimap right
            const mw = Math.round(62 * u)
            panel(Math.round(W - mw - 2 * u), TOP + 2 * u, mw, mw)
            hctx.strokeStyle = 'rgba(150,190,220,0.55)'; hctx.lineWidth = Math.max(1, u)
            hctx.beginPath()
            for (let i = 0; i < T.N; i += 6) {
                const [qx, qy] = MAP(T.pts[i].x, T.pts[i].y)
                const px0 = Math.round(W - mw - 2 * u + qx * mw); const py0 = Math.round(TOP + 2 * u + qy * mw)
                if (i === 0) hctx.moveTo(px0, py0); else hctx.lineTo(px0, py0)
            }
            hctx.closePath(); hctx.stroke()
            for (let i = g.karts.length - 1; i >= 0; i--) {
                const k = g.karts[i]
                const [qx, qy] = MAP(k.x, k.y)
                hctx.fillStyle = k.isPlayer ? '#28d8f8' : `#${(LIVERY[k.color] || 0xcccccc).toString(16).padStart(6, '0')}`
                const ds = Math.max(2, Math.round((k.isPlayer ? 4.5 : 3) * u))
                hctx.beginPath()
                hctx.arc(Math.round(W - mw - 2 * u + qx * mw), Math.round(TOP + 2 * u + qy * mw), ds / 2, 0, Math.PI * 2)
                hctx.fill()
            }
            // countdown / GO
            if (st.screen !== 'attract' && (g.phase === 'count' || (g.phase === 'race' && g.tick - P.lapStart < 40))) {
                hctx.textAlign = 'center'
                hctx.font = fu(52)
                hctx.fillStyle = g.phase === 'race' ? '#48f090' : '#e8f0fa'
                hctx.shadowColor = g.phase === 'race' ? '#18c060' : '#6090ff'
                hctx.shadowBlur = 18 * u
                hctx.fillText(g.phase === 'race' ? 'GO!' : String(Math.ceil(g.count / 60)), W / 2, H * 0.5)
                hctx.shadowBlur = 0
                hctx.textAlign = 'left'
            }
        }

        const drawAttract = () => {
            const u = hs(); const W = cssW; const H = cssH
            hctx.fillStyle = 'rgba(8,10,22,0.55)'
            hctx.fillRect(0, Math.round(H * 0.16), W, Math.round(H * 0.62))
            hctx.textAlign = 'center'
            hctx.font = fu(30)
            const gr = hctx.createLinearGradient(0, H * 0.24, 0, H * 0.4)
            gr.addColorStop(0, '#7ae8ff'); gr.addColorStop(1, '#2060f0')
            hctx.fillStyle = gr
            hctx.shadowColor = '#2090ff'; hctx.shadowBlur = 22 * u
            hctx.fillText('COMET DRIFT', W / 2, Math.round(H * 0.32))
            hctx.shadowBlur = 0
            hctx.font = fu(16)
            hctx.fillStyle = '#ffd840'
            hctx.fillText('H D · S U N S E T   G U L C H', W / 2, Math.round(H * 0.38))
            const msgs = ['4 LAPS · 7 KARTS · ONE CANYON', 'X GAS · S BRAKE · ←→ STEER', 'HOLD SPACE / B THROUGH A BEND', 'BLUE VIOLET GOLD — THE LADDER PAYS']
            hctx.font = fu(10)
            hctx.fillStyle = '#9fc8e8'
            hctx.fillText(msgs[Math.floor(g.tick / 120) % msgs.length], W / 2, Math.round(H * 0.55))
            if (st.top.length) {
                hctx.font = fu(8)
                for (let i = 0; i < st.top.length; i++) {
                    hctx.fillStyle = i === 0 ? '#ffd840' : '#8098b8'
                    hctx.fillText(i === 0 ? `BEST  ${fmtTime(st.top[i])}` : ` #${i + 1}  ${fmtTime(st.top[i])}`, W / 2, Math.round(H * 0.62 + i * 10 * u))
                }
            }
            if ((g.tick >> 5) % 2) {
                hctx.font = fu(10)
                hctx.fillStyle = '#e8f0fa'
                hctx.fillText('PRESS ANY KEY / TAP', W / 2, Math.round(H * 0.74))
            }
            hctx.textAlign = 'left'
        }

        const drawEnd = () => {
            const u = hs(); const W = cssW; const H = cssH
            const P = g.karts[0]
            hctx.fillStyle = 'rgba(8,10,22,0.7)'; hctx.fillRect(0, Math.round(H * 0.2), W, Math.round(H * 0.56))
            hctx.textAlign = 'center'
            hctx.font = fu(24)
            hctx.shadowBlur = 20 * u
            hctx.shadowColor = g.end === 'win' ? '#c8a020' : '#f04020'
            hctx.fillStyle = g.end === 'win' ? '#ffd840' : '#f85838'
            hctx.fillText(g.end === 'win' ? 'GULCH CHAMPION!' : `${P.place}TH PLACE`, W / 2, Math.round(H * 0.36))
            hctx.shadowBlur = 0
            hctx.font = fu(11)
            hctx.fillStyle = '#e8f0fa'
            hctx.fillText(`TIME ${fmtTime(P.finishT || g.tick)}  BEST ${st.best ? fmtTime(st.best) : '--'}`, W / 2, Math.round(H * 0.45))
            if (P.lapTimes.length) {
                hctx.font = fu(8)
                hctx.fillStyle = '#9fc8e8'
                hctx.fillText('SPLITS ' + P.lapTimes.map((t) => (t / 60).toFixed(1)).join(' '), W / 2, Math.round(H * 0.52))
            }
            if ((g.tick >> 5) % 5 < 3) { hctx.fillStyle = '#e8f0fa'; hctx.font = fu(11); hctx.fillText('TAP OR ANY KEY', W / 2, Math.round(H * 0.65)) }
            hctx.textAlign = 'left'
        }

        // ---- world clock ---------------------------------------------------
        let steerSm = 0
        const tickWorld = (live) => {
            const p = padState
            const padLive = p.engaged || p.rt > 0.05 || p.lt > 0.05
            let inp
            if (st.plan) {
                inp = decide(g)
            } else if (padLive) {
                const s = steerPedals(p)
                steerSm = smoothSteer(steerSm, s.steer)
                inp = { steer: steerSm, thr: s.thr, brk: s.brk, drift: !!(keys.Space || keys.KeyR || keys.KeyC) }
            } else {
                steerSm = 0
                inp = { u: !!(keys.KeyX || keys.ArrowUp), d: !!(keys.KeyS || keys.ArrowDown), l: !!keys.ArrowLeft, r: !!keys.ArrowRight, drift: !!(keys.Space || keys.KeyZ || keys.KeyR || keys.KeyC) }
            }
            step(g, live ? inp : decide(g))
            const evs = g.events.splice(0)
            if (import.meta.env.DEV) {
                const log = (window.__cometHDLog ||= [])
                for (const ev of evs) log.push({ ...ev, t: g.tick })
                if (log.length > 2000) log.splice(0, log.length - 2000)
            }
            sfx(evs, live)
            engine(live)
            const rose = live && g.karts[0].place < prevPlace
            prevPlace = g.karts[0].place
            if (rose) audioController.playTone(990, 0.06, 'square', 0.08)
            if (live) {
                for (const ev of evs) {
                    if (ev.e === 'lap' && ev.who === 'PLAYER' && ev.t > 60) {
                        if (!st.best || ev.t < st.best) {
                            st.best = ev.t
                            try { localStorage.setItem(BEST_KEY, String(ev.t)) } catch { /* private mode */ }
                        }
                        st.top.push(ev.t); st.top.sort((a, b) => a - b); st.top = st.top.slice(0, 3)
                        try { localStorage.setItem(TOP_KEY, JSON.stringify(st.top)) } catch { /* private mode */ }
                    }
                }
            }
            if (!live && g.end) { st.endT++; if (st.endT > 240) { Object.assign(g, makeGame(0)); st.endT = 0; sparks.clear(); dust.clear() } }
            if (live && g.end) { st.screen = 'end'; screenRef.current = 'end'; st.endT = 0; st.endAt = performance.now(); setPadOn(false) }
            spawnTick()
        }

        // self-heal: some drivers lose the WebGL device under three's
        // WebGPU-node backend while WebGPU itself renders fine. Count hard
        // failures and black frames on GL-backed paths, then rebuild on the
        // classic renderer once — the race must not die with the backend.
        let renderFails = 0
        let blackRuns = 0
        const healIfNeeded = (why) => {
            renderFails = 0; blackRuns = 0
            if (disposed || backendName !== 'webgl2') return
            try { renderer.dispose() } catch { /* already gone */ }
            buildLegacy()
            if (import.meta.env.DEV) console.warn('CometDriftHD: backend rebuilt after ' + why)
        }
        const onRenderFail = () => { if (++renderFails >= 3) healIfNeeded('render failures') }
        const pixelHeartbeat = () => {
            if (backendName !== 'webgl2' || g.tick % 120 !== 0) return
            try {
                const glc = glCanvas.getContext('webgl2') || glCanvas.getContext('webgl')
                if (!glc) return
                const buf = new Uint8Array(4 * 4)
                glc.readPixels(Math.floor(glc.drawingBufferWidth / 2) - 2, Math.floor(glc.drawingBufferHeight / 2) - 2, 4, 4, glc.RGBA, glc.UNSIGNED_BYTE, buf)
                let lum = 0
                for (let i = 0; i < 16; i++) lum += buf[i]
                if (lum === 0 && ++blackRuns >= 2) healIfNeeded('black frames')
                else blackRuns = 0
            } catch { /* no readback available */ }
        }

        const loop = (now) => {
            raf = requestAnimationFrame(loop)
            acc += Math.min(now - last, 250); last = now
            if (contractHoldsLoop()) { acc = 0 } else {
                while (acc >= 1000 / 60) {
                    acc -= 1000 / 60
                    if (!pausedRef.current) tickWorld(st.screen === 'race')
                    updateCamera()
                }
            }
            syncMeshes()
            // heat shimmer on the sunset (#471 item 1)
            const sh = 1 + Math.sin(g.tick * 0.05) * 0.045
            sunGlow.scale.set(84 * sh, 84 * sh, 1)
            sunDisc.scale.set(24 * (2 - sh), 24 * (2 - sh), 1)
            if (ready && renderer) {
                try {
                    if (renderer.renderAsync) renderer.renderAsync(scene, camera).catch(onRenderFail)
                    else renderer.render(scene, camera)
                } catch { onRenderFail() }
                pixelHeartbeat()
            }
            drawHud()
            if (st.screen === 'attract') drawAttract()
            if (st.screen === 'end') drawEnd()
        }

        const resetTo = (screen) => {
            Object.assign(g, makeGame(0))
            st.screen = screen; screenRef.current = screen
            st.plan = screen === 'attract'
            st.endT = 0
            prevPlace = g.karts[0].place
            camA = g.karts[0].a
            camLift = 0
            sparks.clear(); dust.clear()
            setPadOn(screen === 'race')
        }

        tapRef.current = () => {
            if (pausedRef.current) return
            if (st.screen === 'attract') { audioController.init(); resetTo('race') }
            else if (st.screen === 'end' && performance.now() - (st.endAt || 0) > 400) resetTo('attract')
        }

        const kd = (e) => {
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyX', 'KeyS', 'KeyZ', 'KeyR'].includes(e.code)) e.preventDefault()
            if (e.code === 'Question' || e.key === '?') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); return }
            if (pausedRef.current) return
            if (st.screen === 'attract') {
                audioController.init()
                resetTo('race')
                return
            }
            if (st.screen === 'end') {
                st.endT++
                if (performance.now() - (st.endAt || 0) > 400) resetTo('attract')
                return
            }
            keys[e.code] = true
        }
        const ku = (e) => { keys[e.code] = false }
        window.addEventListener('keydown', kd)
        window.addEventListener('keyup', ku)
        raf = requestAnimationFrame(loop)

        const unmount = mountDbg({
            title: 'COMET DRIFT HD',
            getState: () => {
                const P = g.karts[0]
                return [
                    `screen ${st.screen}  phase ${g.phase}  end ${g.end}  gpu ${backendName}`,
                    `pos ${P.place}/${g.karts.length}  lap ${P.lap}/${LAPS}  v ${P.v.toFixed(2)}`,
                    `drift ${P.driftT} charge ${P.charge}  boost ${P.boostT}/tier ${P.boostTier}  spin ${P.spinT}`,
                    `sparks ${sparks.aliveCount} dust ${dust.aliveCount}  fov ${camera.fov.toFixed(1)}  tick ${g.tick}`,
                ]
            },
            actions: [
                { label: 'teleport to grid', run: () => { const P = g.karts[0]; const p = T.pts[2]; P.x = p.x; P.y = p.y; P.idx = 2; P.hint = 2; P.a = p.a; return 'ok' } },
                { label: 'gold turbo', run: () => { g.karts[0].boostT = 90; g.karts[0].boostTier = 2; return 'gold' } },
                { label: 'instant lap', run: () => { const P = g.karts[0]; P.lap = Math.min(LAPS - 1, P.lap + 1); return `lap ${P.lap}` } },
                { label: 'skip countdown', run: () => { g.count = 1; return 'go' } },
            ],
        })

        window.__cometHDTest = {
            game: () => g,
            keys,
            screen: () => st.screen,
            ready: () => ready,
            backend: () => backendName,
            view: () => ({ w: cssW, h: cssH, dpr }),
            press: (k) => { keys[k] = true; setTimeout(() => { keys[k] = false }, 150) },
            setPlan: (v) => { st.plan = !!v },
            best: () => st.best,
            fx: () => {
                const P = g.karts[0]
                return { sparks: sparks.aliveCount, dust: dust.aliveCount, driftT: P.driftT, charge: P.charge, boostT: P.boostT, spinT: P.spinT, v: P.v }
            },
            forceSpin: () => { g.karts[0].spinT = 90; return g.karts[0].spinT },
        }

        exposeGame({
            id: 'comet-drift-hd',
            buttons: ['left', 'right', 'up', 'down', 'a', 'b'],
            steer: STEER_PIPELINE,
            reset: (seed) => {
                Object.assign(g, makeGame(seed))
                st.screen = 'race'; screenRef.current = 'race'
                st.plan = false
                st.endT = 0
                prevPlace = g.karts[0].place
                camA = g.karts[0].a
                camLift = 0
                sparks.clear(); dust.clear()
                setPadOn(false)
            },
            tick: (pad) => {
                if (g.end) { g.tick += 1; return }
                step(g, {
                    u: !!pad.up, d: !!pad.down, l: !!pad.left, r: !!pad.right,
                    a: !!pad.a, b: !!pad.b,
                    steer: typeof pad.x === 'number' && Math.abs(pad.x) > 0.08 ? pad.x : undefined,
                    thr: typeof pad.rt === 'number' && pad.rt > 0.05 ? pad.rt : undefined,
                    brk: typeof pad.lt === 'number' && pad.lt > 0.05 ? pad.lt : undefined,
                })
                spawnTick()
            },
            state: () => {
                const P = g.karts[0]
                return {
                    tick: g.tick, score: Math.round(P.lap * T.len + T.pts[P.idx].s), done: !!g.end,
                    place: P.place, lap: P.lap, phase: g.phase, v: Math.round(P.v * 100) / 100,
                    driftT: P.driftT, charge: P.charge, boostT: P.boostT, spinT: P.spinT,
                    hash: stateHash(g),
                }
            },
            canvas: () => glCanvas,
            snapshot: () => JSON.parse(JSON.stringify(g)),
            restore: (s) => { Object.assign(g, s) },
        })

        return () => {
            disposed = true
            cancelAnimationFrame(raf)
            if (ro) ro.disconnect()
            window.removeEventListener('resize', relayout)
            window.removeEventListener('keydown', kd)
            window.removeEventListener('keyup', ku)
            if (renderer && renderer.dispose) renderer.dispose()
            envMap.dispose()
            scene.traverse((o) => {
                if (o.geometry) o.geometry.dispose()
                if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) { if (m.map) m.map.dispose(); m.dispose() } }
            })
            unmount()
            delete window.__cometHDTest
            unexposeGame()
        }
    }, [])

    return (
        <div
            className="relative flex flex-col items-center justify-center w-full h-full bg-black select-none"
            onPointerDown={() => tapRef.current && tapRef.current()}
        >
            <canvas ref={glRef} className="block absolute inset-0 w-full h-full" style={{ touchAction: 'none' }} />
            <canvas ref={hudRef} className="block absolute inset-0 w-full h-full pointer-events-none" />
            <VirtualControls secondAction={{ label: 'DRIFT', code: 'KeyR' }} visible={padOn && !paused && TOUCH} />
            {paused && <PauseOverlay game={GAMES.find((x) => x.label === 'COMET DRIFT HD')} onResume={handleResume} />}
        </div>
    )
}
