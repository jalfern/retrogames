import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { WebGPURenderer, PostProcessing } from 'three/webgpu'
import { pass, viewportSharedTexture, uniform, vec2, vec4, smoothstep, luminance, screenUV } from 'three/tsl'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { mountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop } from '../../utils/gameContract'
import { makeGame, step, decide, stateHash, fmtTime, CFG, LAPS, TIERS } from '../CometDrift/sim.js'
import { bankVoices, engineRegister, crowdSwellGain, nearestStandPx, CROWD_GAIN, CROWD_PERIOD, CROWD_BURST, CROWD_FREQ } from './audio.js'
import { TRACK, surfaceAt, SCENERY, COURSE, COURSES, selectCourse } from '../CometDrift/track.js'
import { padState, steerPedals, smoothSteer, STEER_PIPELINE } from '../../utils/padState'
import { rumble } from '../../components/gamepadMap'
import {
    S, trackGeometryStats, buildKart, makePool, buildArch, buildTireBars, buildSceneryItem, buildMesas, buildHills, wallTopYAt, worldAnchor, courseFloorY,
    loadBuggy, decorateBuggy, kartYaw, BUGGY_SCALE, elevAt, roadRollYAt, roadRollAt, buildDriver, spinBlurAt, landingSquash, makeStreakPool,
    applySkyDither, makeStarDefs, twinkle, makeBlobShadow, exhaustOutlets, BRAKE_IDLE, BRAKE_ON, STEER_MAX,
    hudScale, hudTop, tintFor, envWashFor, SKY_STOPS, refOverlayStats, attractLayout,
} from './scene.js'
import { tracksidePlan, buildTracksidePrimitives, attachShelfProps } from './scenery.js'

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
function skyTex(stops) {
    const c = texCanvas(64, 256)
    const x = c.getContext('2d')
    const gr = x.createLinearGradient(0, 0, 0, 256)
    // sphere mapping: canvas fraction f lands at v = 1 - f, so the HORIZON
    // (v=0.5) is the CANVAS MIDDLE. The shipped sky put its dusk band at the
    // canvas bottom = under the south pole — the sun washed out invisible for
    // the whole race (#471 item 1 root cause). Orange now straddles f=0.5.
    // #502 item 1: the eight colours come from the course tint (dusk = the
    // shipped skin, stop for stop; noon runs blue-white, dawn rose-to-amber).
    const cols = stops || tintFor('dusk').sky
    SKY_STOPS.forEach((p, i) => gr.addColorStop(p, cols[i]))
    x.fillStyle = gr; x.fillRect(0, 0, 64, 256)
    // #478 item 6: deterministic dither breaks the 8-bit dusk bands that
    // stripe OLED/phone screens (same noise every boot — see scene.js).
    const id = x.getImageData(0, 0, 64, 256)
    applySkyDither(id.data, 64, 256)
    x.putImageData(id, 0, 0)
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
        // #478: ?renderer=webgl(2) is Jon's pin name for the same fallback.
        const qs = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
        const forceGL = !!qs && (qs.get('gl') === 'webgl2' || qs.get('renderer') === 'webgl' || qs.get('renderer') === 'webgl2')
        // #478 item 9: QA pin for the three WebGPU-node-on-WebGL state — the
        // exact device condition the self-heal refuge was built for. forceWebGL
        // skips the adapter search, so backendName is deterministically 'webgl2'
        // and WEBGL_lose_context can exercise the auto-heal headlessly.
        const forceGLNode = !!qs && qs.get('gl') === 'webgl-node'
        // #530 item 4: ?ref=1 draws the traced real-map centerline over the
        // circuit (debug aid — see scene.js refOverlayStats). Off by default.
        const refOn = !!qs && qs.get('ref') === '1'

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
        let nodeGL = null
        let ready = false
        let disposed = false
        let backendName = 'pending'
        const dpr = Math.min(window.devicePixelRatio || 1, lite ? 1 : 2)

        const scene = new THREE.Scene()
        scene.fog = new THREE.FogExp2(0x8a4a3c, 0.0072)
        const camera = new THREE.PerspectiveCamera(64, 16 / 9, 0.1, 400)

        let sunDir = new THREE.Vector3(Math.cos(-0.6), 0.12, Math.sin(-0.6)).normalize()
        const sun = new THREE.DirectionalLight(0xffc090, 3.6)
        sun.position.copy(sunDir.clone().multiplyScalar(60))
        scene.add(sun)
        const hemi = new THREE.HemisphereLight(0xd06a50, 0x553018, 1.8)
        const amb = new THREE.AmbientLight(0x6a4050, 0.95)
        scene.add(hemi, amb)

        // ---- #478 item 1: earned bloom + boost radial blur (post chain) ----
        // The node pipeline samples its own scene pass: a 21-tap donut blur is
        // the glow source, a luminance threshold lets ONLY the sun, the flames
        // and the gold sparks bloom (earned — the sky never glows), and a
        // center-pull radial smear rides the boost, decaying to nothing when
        // the tank is dry. The classic WebGL2 refuge builds no chain at all.
        const BLOOM_STRENGTH = 0.5
        const bloomGain = uniform(BLOOM_STRENGTH)
        const radialAmt = uniform(0)
        const buildPostChain = (r) => {
            const scenePass = pass(scene, camera)
            let sum = scenePass
            for (let i = 1; i <= 13; i++) {
                const ang = i * 2.39996323
                const rad = 0.0045 + 0.0075 * (i / 13)
                sum = sum.add(viewportSharedTexture(screenUV.add(vec2(Math.cos(ang) * rad, Math.sin(ang) * rad))))
            }
            for (let i = 1; i <= 8; i++) {
                const ang = i * 2.39996323 + 1.2
                const rad = 0.02 + 0.01 * (i / 8)
                sum = sum.add(viewportSharedTexture(screenUV.add(vec2(Math.cos(ang) * rad, Math.sin(ang) * rad))))
            }
            const soft = sum.div(22)
            const glow = smoothstep(0.82, 1.45, luminance(soft.rgb))
            const radDir = screenUV.sub(vec2(0.5))
            const pull = (k) => viewportSharedTexture(screenUV.add(radDir.mul(radialAmt.mul(k))))
            const radial = scenePass.add(pull(-0.02)).add(pull(-0.05)).add(pull(-0.09)).div(4)
            const post = new PostProcessing(r, vec4(radial.rgb.add(soft.rgb.mul(glow).mul(bloomGain)), 1))
            post.needsUpdate = true
            return post
        }
        let post = null
        let chainMode = null

        const tex = (canvas, rx = 1, ry = 1) => {
            const t = new THREE.CanvasTexture(canvas)
            t.wrapS = t.wrapT = THREE.RepeatWrapping
            t.repeat.set(rx, ry)
            t.colorSpace = THREE.SRGBColorSpace
            return t
        }

        const mat = (map, extra = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0, side: THREE.DoubleSide, ...extra })
        const kerbMat = mat(tex(kerbTex()))
        const sandMat = mat(tex(sandTex()), { vertexColors: true })
        const strataMat = mat(tex(strataTex()), { vertexColors: true })
        const plateauMat = mat(tex(sandTex()), { color: 0xd8a888 })
        // #493: the circuit itself lives in one group, so the attract-screen
        // course selector can swap geometry (and the SCENERY that lines it)
        // without touching karts, sky or lights.
        const trackGroup = new THREE.Group()
        scene.add(trackGroup)
        // #639: trackside dressing lives in its own group so it can rebuild with
        // the circuit. Primitive stand-ins paint immediately; the real shelf GLBs
        // upgrade it asynchronously. propsRev guards the async attach against a
        // course swap mid-load (a stale attach must never edit a dead group).
        let propsGroup = null
        let propsPlan = null // resolved plan (grandstand centres) for the crowd swell
        let propsRev = 0
        const disposeProps = (g) => { if (g) g.traverse((o) => { if (o.isMesh && o.geometry && !o.userData.keepGeo) o.geometry.dispose() }) }
        const buildTrackMeshes = () => {
            disposeProps(propsGroup)
            while (trackGroup.children.length) {
                const m = trackGroup.children.pop()
                if (m.geometry) m.geometry.dispose()
            }
            propsRev++
            const M = trackGeometryStats().geos
            trackGroup.add(new THREE.Mesh(M.road, mat(tex(asphaltTex()), { roughness: 0.82, metalness: 0.05, vertexColors: true })))
            trackGroup.add(new THREE.Mesh(M.kerbL, kerbMat))
            trackGroup.add(new THREE.Mesh(M.kerbR, kerbMat))
            trackGroup.add(new THREE.Mesh(M.gutterL, sandMat))
            trackGroup.add(new THREE.Mesh(M.gutterR, sandMat))
            trackGroup.add(new THREE.Mesh(M.wallL, strataMat))
            trackGroup.add(new THREE.Mesh(M.wallR, strataMat))
            trackGroup.add(new THREE.Mesh(M.plateauL, plateauMat))
            trackGroup.add(new THREE.Mesh(M.plateauR, plateauMat))
            trackGroup.add(buildArch(tex(strataTex())))
            if (refOn) {
                const ro = refOverlayStats()
                if (ro) {
                    const rg = new THREE.BufferGeometry()
                    rg.setAttribute('position', new THREE.Float32BufferAttribute(ro.coords, 3))
                    const refLine = new THREE.Line(rg, new THREE.LineBasicMaterial({ color: 0x00e5ff, depthTest: false, transparent: true, opacity: 0.9 }))
                    refLine.renderOrder = 999
                    refLine.name = 'refOverlay'
                    trackGroup.add(refLine)
                }
            }
            trackGroup.add(buildTireBars(
                new THREE.MeshStandardMaterial({ color: 0xc8281e, roughness: 0.85 }),
                new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.8 }),
            ))
            for (const sc of SCENERY) trackGroup.add(buildSceneryItem(sc))
            const plan = tracksidePlan()
            propsPlan = plan
            propsGroup = buildTracksidePrimitives(plan)
            trackGroup.add(propsGroup)
            const rev = propsRev
            attachShelfProps(plan, propsGroup, () => propsRev === rev).catch(() => {})
        }
        buildTrackMeshes()

        // #542: the horizon furniture used to be pinned at the old 2560px
        // course's center/radius — the grown world drives karts clean through
        // it. Floor, mesas, dome and sun now derive from the live course
        // bounds (and the mesas rebuild with every course swap).
        const horizonGroup = new THREE.Group()
        scene.add(horizonGroup)
        const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: tex(glowTex()), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true, opacity: 0.95,
        }))
        sunGlow.scale.set(84, 84, 1)
        scene.add(sunGlow)
        const sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({
            map: tex(discTex()), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true,
        }))
        sunDisc.scale.set(24, 24, 1)
        scene.add(sunDisc)
        // #478 item 6: a few twinkling stars in the UPPER sky band only —
        // additive point sprites just inside the dome, brightness modulated
        // per tick by twinkle(); the dusk rim and the sun stay star-free.
        const starDefs = makeStarDefs()
        const starMat = new THREE.PointsMaterial({
            map: tex(dotTex()), vertexColors: true, transparent: true, opacity: 0.9,
            blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
            size: lite ? 2.4 : 3.2, sizeAttenuation: false,
        })
        let starMesh = null
        const twinkleStars = (tick) => {
            if (!starMesh) return
            const c = starMesh.geometry.getAttribute('color')
            for (let i = 0; i < starDefs.length; i++) {
                const s = twinkle(starDefs[i].phase, tick) * starDefs[i].gain
                c.setXYZ(i, s, s * 0.97, s * 0.9)
            }
            c.needsUpdate = true
        }
        // #471 item 4: a tiny equirect wash gives the liveries sky-glass
        // reflections without a real probe. #511 item 2: the wash rides the
        // course palette (dusk reproduces the shipped canvas stop for stop;
        // noon runs blue-white with a high sun, dawn rose-to-amber low).
        const envCanvas = texCanvas(128, 64)
        const paintEnv = (palette) => {
            const x = envCanvas.getContext('2d')
            const w = envWashFor(palette)
            const gr = x.createLinearGradient(0, 0, 0, 64)
            for (const [col, at] of w.stops) gr.addColorStop(at, col)
            x.fillStyle = gr; x.fillRect(0, 0, 128, 64)
            const sg = x.createRadialGradient(w.sunX, w.sunY, 2, w.sunX, w.sunY, w.sunR)
            sg.addColorStop(0, `rgba(${parseInt(w.sun[0].slice(1, 3), 16)},${parseInt(w.sun[0].slice(3, 5), 16)},${parseInt(w.sun[0].slice(5, 7), 16)},1)`)
            sg.addColorStop(1, `rgba(${parseInt(w.sun[1].slice(1, 3), 16)},${parseInt(w.sun[1].slice(3, 5), 16)},${parseInt(w.sun[1].slice(5, 7), 16)},0)`)
            x.fillStyle = sg; x.fillRect(w.sunX - w.sunR - 4, w.sunY - w.sunR - 4, (w.sunR + 4) * 2, (w.sunR + 4) * 2)
        }
        const envMap = new THREE.CanvasTexture(envCanvas)
        envMap.mapping = THREE.EquirectangularReflectionMapping
        envMap.colorSpace = THREE.SRGBColorSpace
        // #502 item 1: the course skin — every light, the fog, the sand floor,
        // mesas, dome and stars ride the palette of the SELECTED circuit
        // (dusk values reproduce the shipped Gulch exactly). Runs at boot and
        // on every course swap, before buildHorizon so the dome gets fresh sky.
        const applyCourseTint = () => {
            const t = tintFor(COURSE.palette)
            scene.fog = new THREE.FogExp2(t.fog, t.fogD)
            sunDir = new THREE.Vector3(Math.cos(-0.6), t.sunElev, Math.sin(-0.6)).normalize()
            sun.color.setHex(t.sun)
            sun.intensity = t.sunI
            sun.position.copy(sunDir.clone().multiplyScalar(60))
            hemi.color.setHex(t.hemiSky)
            hemi.groundColor.setHex(t.hemiGround)
            hemi.intensity = t.hemiI
            amb.color.setHex(t.amb)
            amb.intensity = t.ambI
            plateauMat.color.setHex(t.plateau)
            starMat.opacity = 0.9 * t.starGain
            sunGlow.material.color.setHex(t.sunWash)
            sunDisc.material.color.setHex(t.sunWash)
            paintEnv(COURSE.palette)
            envMap.needsUpdate = true
        }
        const buildHorizon = () => {
            while (horizonGroup.children.length) {
                const m = horizonGroup.children.pop()
                if (m.geometry) m.geometry.dispose()
            }
            const t = tintFor(COURSE.palette)
            const A = worldAnchor()
            const span = A.R * 2 + 320
            const floorY = courseFloorY()
            const floor = new THREE.Mesh(new THREE.PlaneGeometry(span, span), mat(tex(sandTex()), { color: t.floor }))
            floor.rotation.x = -Math.PI / 2
            floor.position.set(A.cx, floorY, A.cz)
            horizonGroup.add(floor)
            horizonGroup.add(buildMesas(t.mesa, floorY))
            horizonGroup.add(buildHills(t.hills, floorY))
            const dome = new THREE.Mesh(
                new THREE.SphereGeometry(A.R + 130, 24, 16),
                new THREE.MeshBasicMaterial({ map: tex(skyTex(t.sky)), side: THREE.BackSide, fog: false })
            )
            dome.position.set(A.cx, 0, A.cz)
            horizonGroup.add(dome)
            const sPos = new Float32Array(starDefs.length * 3)
            const sCol = new Float32Array(starDefs.length * 3)
            for (let i = 0; i < starDefs.length; i++) {
                const d = starDefs[i]
                sPos[i * 3] = d.dir[0] * (A.R + 112)
                sPos[i * 3 + 1] = d.dir[1] * (A.R + 112)
                sPos[i * 3 + 2] = d.dir[2] * (A.R + 112)
                sCol[i * 3] = d.gain; sCol[i * 3 + 1] = d.gain * 0.97; sCol[i * 3 + 2] = d.gain * 0.9
            }
            const sGeo = new THREE.BufferGeometry()
            sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3))
            const sColAttr = new THREE.BufferAttribute(sCol, 3)
            sColAttr.setUsage(THREE.DynamicDrawUsage)
            sGeo.setAttribute('color', sColAttr)
            starMesh = new THREE.Points(sGeo, starMat)
            starMesh.frustumCulled = false
            starMesh.position.set(A.cx, 0, A.cz)
            horizonGroup.add(starMesh)
            const sd = sunDir.clone().multiplyScalar((A.R + 130) * 0.82).add(new THREE.Vector3(A.cx, 2, A.cz))
            sunGlow.position.copy(sd)
            sunDisc.position.copy(sd).add(new THREE.Vector3(0, 1.5, 0))
        }
        applyCourseTint()
        buildHorizon()

        // karts + blob shadows (env canvas + map built above, before the tint)
        const kartMeshes = []
        for (const k of g.karts) {
            const m = new THREE.Group()
            m.userData.kart = k
            const view = buildKart(LIVERY[k.color] || 0xcccccc, ACCENT[k.color] || '#fff', kartMeshes.length)
            view.userData.body.envMap = envMap
            view.userData.body.envMapIntensity = 0.55
            m.add(view)
            m.userData.view = view
            m.userData.body = view.userData.body
            m.userData.brakeMat = view.userData.brakes.length ? view.userData.brakes[0].material : null
            m.userData.wheelDefs = view.userData.wheelDefs
            // #478 item 3: the driver rides the kart root, not the view — it
            // survives the GLB swap and tilts with the suspension.
            const driver = buildDriver(ACCENT[k.color] || '#fff')
            m.add(driver)
            scene.add(m)
            // #481 item 2: an ellipse hugging the buggy footprint that steers
            // with the kart, replacing the fixed-axis disc that dwarfed it.
            const shadow = makeBlobShadow()
            scene.add(shadow)
            kartMeshes.push({ m, shadow, spinMats: view.userData.spinMats })
        }
        // exhaust cones on the player's buggy (#481 item 4: aligned to the
        // model's measured chrome outlets, not eyeballed mid-air)
        const flames = []
        for (const o of exhaustOutlets()) {
            const cone = new THREE.Mesh(new THREE.ConeGeometry(0.085, 1, 8),
                new THREE.MeshBasicMaterial({ color: 0x60c0ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }))
            cone.rotation.x = -Math.PI / 2
            cone.position.set(o.x, o.y, o.z - 0.12)
            cone.visible = false
            kartMeshes[0].m.add(cone)
            flames.push(cone)
        }
        // #477: swap the boxed fallback for Jon's authored dune buggy once the
        // GLB lands (cached). If it fails to load the primitives stay — the
        // race never dead-loads on a missing model.
        ;(async () => {
            const model = await loadBuggy()
            if (!model || disposed) return
            kartMeshes.forEach((km, i) => {
                const m = km.m
                const k = g.karts[i]
                const dec = decorateBuggy(model.clone(true), LIVERY[k.color] || 0xcccccc, ACCENT[k.color] || '#fff')
                if (!dec.wheels.length || !dec.body) return
                dec.group.scale.setScalar(BUGGY_SCALE)
                dec.body.envMap = envMap
                dec.body.envMapIntensity = 0.55
                m.remove(m.userData.view)
                m.add(dec.group)
                m.userData.view = dec.group
                m.userData.body = dec.body
                m.userData.brakeMat = dec.brakeMat
                m.userData.wheelDefs = dec.wheels
                km.spinMats = dec.spinMats
            })
        })()

        const sparks = makePool(lite ? 260 : 700, lite ? 0.16 : 0.13)
        const dust = makePool(lite ? 200 : 520, lite ? 0.5 : 0.42)
        dust.points.material.map = tex(dotTex())
        sparks.points.material.map = tex(dotTex())
        dust.points.material.blending = THREE.NormalBlending
        scene.add(sparks.points)
        scene.add(dust.points)

        // #478 item 4: gold sparks as camera-aligned streak quads, not tripled
        // points — the pool billboards each dash onto the camera plane.
        const streaks = makeStreakPool(lite ? 48 : 96, { width: lite ? 0.06 : 0.075 })
        scene.add(streaks.mesh)

        // camera rig state (px-space chase like the retro twin, same lag law).
        // #471: the kart filled the bottom 40% of the frame — the cam sits
        // further back and higher with a long look-ahead (modern chase cam),
        // and it collides: sampling the gulch behind the kart lifts it over
        // the near lip instead of burying it in the cliff.
        let camA = g.karts[0].a
        let camLift = 0
        let shake = 0
        let fovK = 0
        let crestK = 0
        let dipK = 0
        let prevPlace = g.karts[0].place

        const tmpF = new THREE.Vector3()
        const tmpR = new THREE.Vector3()
        const UP = new THREE.Vector3(0, 1, 0)

        let raf = 0; let acc = 0; let last = performance.now()
        let cssW = 2; let cssH = 2
        let safeTop = 0

        const readSafeTop = () => {
            try {
                const v = getComputedStyle(document.documentElement).getPropertyValue('--sat')
                return parseFloat(v) || 0
            } catch { return 0 }
        }

        const relayout = () => {
            const r = host.getBoundingClientRect()
            cssW = Math.max(2, Math.round(r.width))
            cssH = Math.max(2, Math.round(r.height))
            safeTop = readSafeTop()
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
            if (post) { try { post.dispose() } catch { /* gone */ } }
            post = null
            chainMode = null
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
                let attempt = 0
                for (;;) {
                    renderer = new WebGPURenderer({ canvas: glCanvas, antialias: !lite, alpha: false, preserveDrawingBuffer: true, forceWebGL: forceGLNode })
                    await renderer.init()
                    if (disposed) { renderer.dispose(); return }
                    backendName = renderer.backend && renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl2'
                    if (backendName === 'webgl2') {
                        nodeGL = (renderer.getContext && renderer.getContext()) || (renderer.backend && renderer.backend.gl) || null
                        // A dev remount (StrictMode) can inherit a force-lost GL
                        // context: three's WebGLBackend.dispose() calls
                        // WEBGL_lose_context.loseContext(), and a canvas hands out
                        // its context exactly once. Swap in a fresh canvas (the
                        // refuge's trick, marked for the next mount's sweep) and
                        // re-init once — otherwise the node backend renders into a
                        // dead context and neither heartbeat nor heal can see it.
                        if (nodeGL && nodeGL.isContextLost() && attempt === 0 && glCanvas.parentNode) {
                            attempt++
                            try { renderer.dispose() } catch { /* already gone */ }
                            const fresh = document.createElement('canvas')
                            fresh.dataset.hdgl = '1'
                            fresh.className = glCanvas.className
                            fresh.style.cssText = glCanvas.style.cssText
                            glCanvas.parentNode.insertBefore(fresh, glCanvas)
                            glCanvas.style.display = 'none'
                            glCanvas = fresh
                            nodeGL = null
                            if (import.meta.env.DEV) console.warn('CometDriftHD: inherited lost GL context — retrying on a fresh canvas')
                            continue
                        }
                        if (import.meta.env.DEV && !nodeGL) console.warn('CometDriftHD: node backend up but no GL context stashed — heartbeat/heal will be blind')
                    }
                    break
                }
                if (backendName === 'webgl2') {
                    // Canonical device-loss signal: some dead contexts make
                    // readPixels throw (the heartbeat's black-frame net then
                    // never closes), but the canvas always fires webglcontextlost.
                    glCanvas.addEventListener('webglcontextlost', (e) => {
                        e.preventDefault()
                        healIfNeeded('webglcontextlost')
                    })
                }
                renderer.setPixelRatio(dpr)
                renderer.setSize(cssW, cssH, false)
                renderer.toneMapping = THREE.ACESFilmicToneMapping
                renderer.toneMappingExposure = 1.35
                try {
                    post = buildPostChain(renderer)
                    chainMode = backendName === 'webgpu' ? 'bloom-tsl-webgpu' : 'bloom-tsl-webgl2'
                } catch { post = null; chainMode = null }
                ready = true
            } catch (e) {
                if (import.meta.env.DEV) console.warn('CometDriftHD: WebGPU init failed, legacy WebGL2 takes over —', e && e.message)
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
                    // each tier gets its own voice, not just a higher pitch (#471 item 7);
                    // GOLD adds a rising bell chime the lower tiers never ring (#478 item 5)
                    for (const v of bankVoices(ev.tier)) {
                        if (v.k === 'sweep') audioController.playSweep(v.a, v.b, v.d, v.t, v.g)
                        else if (v.k === 'noise') audioController.playNoise(v.d, v.g)
                        else audioController.playTone(v.f, v.d, v.t, v.g, v.delay || 0)
                    }
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
            const base = (44 + gear * 13 + pull * 2.6 + (P.boostT > 0 ? 30 + P.boostTier * 42 : 0)) * engineRegister(COURSE.palette)
            const period = Math.max(2, 14 - Math.round(P.v))
            if (g.tick % period === 0) {
                audioController.playTone(base, 0.03, 'sawtooth', 0.022)
                audioController.playTone(base * 1.504, 0.026, 'sawtooth', 0.012)
            }
        }
        // #675: the crowd swells as the player nears the grandstands and dies on
        // the backstretch — a lowpassed murmur bed (bursts longer than their
        // period), gated by the pure law in audio.js. The engine is untouched.
        const crowd = (live) => {
            if (!live || g.phase !== 'race' || !propsPlan) return
            const P = g.karts[0]
            const gain = crowdSwellGain(nearestStandPx(propsPlan, P.x, P.y))
            if (gain <= 0.02) return
            if (g.tick % CROWD_PERIOD !== 0) return
            if (import.meta.env.DEV) {
                const log = (window.__cometHDLog ||= [])
                log.push({ e: 'crowd', g: +gain.toFixed(3), t: g.tick })
                if (log.length > 2000) log.splice(0, log.length - 2000)
            }
            const wob = 0.85 + jit(g.tick * 1.3) * 0.3
            audioController.playFilteredNoise(CROWD_BURST, CROWD_GAIN * gain * wob, CROWD_FREQ)
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
                    sparks.spawn(w.x, liftAt(P) + 0.12, w.z, -w.fx * 0.05 + (jit(g.tick + side) - 0.5) * 0.02, 0.02 + jit(g.tick * 1.7 + side) * 0.02, -w.fx * 0.05 + (jit(g.tick * 2.3 + side) - 0.5) * 0.02, 14, col)
                    dust.spawn(w.x, liftAt(P) + 0.16, w.z, -w.fx * 0.015, 0.008, -w.fz * 0.015, 24, 0xb08058)
                    // gold tier paints camera-aligned streaks, not tripled
                    // dots (#471 item 6, re-cut as quads for #478 item 4)
                    if (tier === 2) {
                        streaks.spawn(w.x - w.fx * 0.35, liftAt(P) + 0.13, w.z - w.fz * 0.35, -w.fx * 0.05, 0.018, -w.fz * 0.05, 11, col, 0.34)
                        streaks.spawn(w.x - w.fx * 0.8, liftAt(P) + 0.12, w.z - w.fz * 0.8, -w.fx * 0.055, 0.012, -w.fz * 0.055, 8, col, 0.24)
                    }
                }
            } else if (P.spinT > 0) {
                for (let i = 0; i < 3; i++) {
                    const w = wheelWorld(P, i % 2 ? 1 : -1, 0.2)
                    dust.spawn(w.x, liftAt(P) + 0.18, w.z, (jit(g.tick * 3.1 + i) - 0.5) * 0.03, 0.012, (jit(g.tick * 2.1 + i) - 0.5) * 0.03, 20, 0xb08058)
                }
            }
            if (P.offroad && P.v > 2 && (g.tick & 1) === 0) {
                const w = wheelWorld(P, 1, 0.4)
                dust.spawn(w.x, liftAt(P) + 0.14, w.z, 0, 0.006, 0, 18, 0xb08058)
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
                    sparks.spawn(w.x, liftAt(k) + 0.12, w.z, -w.fx * 0.04, 0.015, -w.fz * 0.04, 12, kt >= 0 ? parseInt(TIER_COL[kt].slice(1), 16) : SPARK_NOCOL)
                }
                if (k.boostT > 0 && k.v > 2) {
                    const wb = wheelWorld(k, side, 0.9)
                    dust.spawn(wb.x, liftAt(k) + 0.3, wb.z, 0, 0.012, 0, 22, 0x8a7a82)
                    // short afterburner trails off both exhaust tips (#478 item 4)
                    for (const es of [-1, 1]) {
                        const we = wheelWorld(k, es, 0.75)
                        streaks.spawn(we.x, liftAt(k) + 0.3, we.z, -we.fx * 0.085, 0.004, -we.fz * 0.085, 7, k.boostTier >= 2 ? 0xffcf50 : 0xff8a30, 0.22)
                    }
                }
            }
            sparks.step(-0.0016, liftAt(P) - 0.05)
            dust.step(-0.0004, liftAt(P) - 0.12)
            streaks.step(-0.001, liftAt(P) - 0.02, camera)
            twinkleStars(g.tick)
        }

        // ---- mesh sync: drawn state is the sim state, every frame ---------
        // #518: karts sit on the height profile. Height and pitch are smoothed
        // per kart (the profile is sampled at the nearest centerline point, so
        // the raw value steps as points pass under the wheels). Pitch rides
        // local X after yaw (YXZ), so cresting lifts the nose the way the
        // road actually tilts.
        // #530: the same smoothing carries the banked roll — the surface under
        // the kart rises with its lateral offset (roadRollYAt) and the mesh
        // rolls to match the surface tilt (rotation.z), outside edge up.
        const liftAt = (k) => (k.hSm || 0) + (k.rSm || 0)
        const syncMeshes = () => {
            for (let i = 0; i < g.karts.length; i++) {
                const k = g.karts[i]
                const { m, shadow, spinMats } = kartMeshes[i]
                const hT = elevAt(k.idx); const pT = Math.atan(k.grade || 0)
                const rT = roadRollYAt(k.idx, k.lat || 0); const bT = -roadRollAt(k.idx)
                k.hSm = k.hSm === undefined ? hT : k.hSm + (hT - k.hSm) * 0.4
                k.rSm = k.rSm === undefined ? rT : k.rSm + (rT - k.rSm) * 0.4
                k.rollSm = k.rollSm === undefined ? bT : k.rollSm + (bT - k.rollSm) * 0.3
                k.pitchSm = k.pitchSm === undefined ? pT : k.pitchSm + (pT - k.pitchSm) * 0.3
                const h = k.hSm + k.rSm
                m.position.set(k.x * S, h, k.y * S)
                m.rotation.order = 'YXZ'
                m.rotation.set(-k.pitchSm, kartYaw(k.a), (k.driftT > 0 ? (k.steerVis || 1) * 0.14 : 0) + (k.rollSm || 0))
                const rough = k.offroad && k.v > 1
                const bob = rough ? (jit(g.tick * 7.7 + i) - 0.5) * 0.05 : 0
                m.position.y = h + bob
                // #478 item 3: suspension carries LOAD at crest/landing moments,
                // not just offroad — the slope dropping away under a fast kart
                // compresses the spring, which then rebounds and settles.
                const imp = landingSquash(k.gPrev === undefined ? k.grade : k.gPrev, k.grade || 0, k.v)
                k.gPrev = k.grade || 0
                k.sq = ((k.sq || 0) + imp * 0.18) * 0.78
                if (k.sq < 1e-4) k.sq = 0
                const squash = Math.min(0.18, k.sq)
                m.scale.y = Math.max(0.8, (rough ? 0.93 + jit(g.tick * 11.3 + i) * 0.08 : 1) - squash)
                m.scale.x = m.scale.z = 1 + squash * 0.6
                shadow.position.set(k.x * S, h + 0.052, k.y * S)
                shadow.rotation.y = kartYaw(k.a)
                // wheel rig (#477): steer the front pivots about vertical, roll all
                // four about their axle. baseQuat keeps the model's baked right-side
                // flip; steer/roll signs undo it so both sides turn/spin alike.
                k.rollA = (k.rollA || 0) + k.v * 0.6
                const steerV = (k.steerVis || 0) * STEER_MAX
                for (const wd of m.userData.wheelDefs) {
                    wd.node.quaternion.copy(wd.baseQuat)
                    if (wd.front) wd.node.rotateOnAxis(UP, steerV * wd.steerSign)
                    for (const mesh of wd.meshes) mesh.rotation.x = k.rollA * wd.rollSign
                }
                // #478 item 3: spokes sharpen at a standstill, dissolve into the
                // ghost streak at top speed (single uniform pair per kart).
                if (spinMats) {
                    const bl = spinBlurAt(k.v)
                    spinMats.sharp.opacity = 1 - bl * 0.75
                    spinMats.ghost.opacity = bl * 0.8
                }
                const braking = (k.pv !== undefined && k.v < k.pv - 0.08) ||
                    (i === 0 && (keys.KeyS || keys.ArrowDown))
                k.pv = k.v
                if (m.userData.brakeMat) m.userData.brakeMat.emissiveIntensity = braking && k.spinT === 0 ? BRAKE_ON : BRAKE_IDLE
            }
            const P = g.karts[0]
            for (const f of flames) f.visible = P.boostT > 0
            if (P.boostT > 0) {
                const flick = 0.7 + jit(g.tick * 2.9) * 0.6
                const len = (0.45 + P.boostTier * 0.3) * flick
                for (const f of flames) {
                    f.scale.set(1, 1, len)
                    f.material.color.setHex(P.boostTier >= 2 ? 0xffd860 : P.boostTier === 1 ? 0xc090ff : 0x60c0ff)
                    f.material.opacity = 0.4 + jit(g.tick) * 0.2
                }
            }
        }

        const updateCamera = () => {
            const P = g.karts[0]
            const want = P.a
            let da = want - camA
            while (da > Math.PI) da -= Math.PI * 2
            while (da < -Math.PI) da += Math.PI * 2
            camA += da * (P.driftT > 0 ? 0.062 : 0.13)
            // #530 item 2: the road's crest/dip ride the camera too. Over a brow
            // the ground drops away — punch the FOV wider and let the nose fall so
            // the far side reveals itself a beat late (the crest-lip FOV dip). In a
            // dip the view narrows and the eye sinks, so walls loom and the band
            // darkens. crestK/dipK are eased so the punch is a swell, not a snap.
            const cAt = (TRACK.pts[P.hint] && TRACK.pts[P.hint].crest) || 0
            const dAt = (TRACK.pts[P.hint] && TRACK.pts[P.hint].dip) || 0
            crestK += (cAt - crestK) * 0.12
            dipK += (dAt - dipK) * 0.12
            const fovTarget = (P.boostT > 0 ? 7 + P.boostTier * 5.5 : 0) + crestK * 6 - dipK * 3
            fovK += (fovTarget - fovK) * 0.08
            // #542: a closer, lower eye with a longer look down the road — the
            // old rig floated 2.75u over the nose and the widened courses made
            // the scenery read as a ceiling. The lift law now also clears
            // crests: heights tripled with the world, so hills ahead can hide
            // the racing line until the eye climbs over them.
            const back = 4.55 + fovK * 0.05
            const fx0 = Math.cos(camA); const fz0 = Math.sin(camA)
            const hx = P.x * S; const hz = P.y * S
            const hp = liftAt(P)
            const baseUp = 2.45 + fovK * 0.02 - dipK * 0.35
            const behind = surfaceAt((hx - fx0 * back) / S, (hz - fz0 * back) / S, P.hint)
            const needWall = behind.surf === 'sand' || behind.surf === 'wall'
                ? Math.max(0, wallTopYAt(behind.i) + 0.45 - (hp + baseUp)) : 0
            let crest = hp
            for (let w = 4; w <= 32; w += 4) crest = Math.max(crest, TRACK.pts[(P.hint + w + TRACK.N) % TRACK.N].h * S)
            const needCrest = Math.max(0, crest + 0.6 - (hp + baseUp))
            camLift += (Math.max(needWall, needCrest) - camLift) * 0.18
            camera.position.set(hx - fx0 * back, hp + baseUp + camLift, hz - fz0 * back)
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
            camera.lookAt(hx + fx0 * 11, hp + 0.95 + camLift * 0.5, hz + fz0 * 11)
            camera.fov = 64 + fovK
            camera.updateProjectionMatrix()
        }

        // ---- HUD overlay: modern glass cluster in the sky band ------------
        const hs = () => hudScale(cssW, cssH)
        const layoutOf = (u, W, H, top) => {
            const mw = Math.round(62 * u)
            return {
                u, W, H, top,
                pos: { x: 2 * u, y: top + 2 * u, w: 40 * u, h: 30 * u },
                speed: { x: 2 * u, y: top + 35 * u, w: 66 * u, h: 30 * u },
                lap: { x: Math.round((W - 92 * u) / 2), y: top + 2 * u, w: Math.round(92 * u), h: Math.round(28 * u) },
                mini: { x: Math.round(W - mw - 2 * u), y: top + 2 * u, w: mw, h: mw },
            }
        }
        let hudRects = layoutOf(hs(), cssW, cssH, hudTop(safeTop))
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

        // #502 item 5: the normaliser is REBUILT when the selector swaps the
        // course — the circuits' bounding boxes differ by nearly 2x, and a
        // frozen Gulch box clipped Sandbank/Corkscomb off the minimap. Cached
        // by TRACK.id, rebuilt on the fly (course switches are rare).
        const makeMapNorm = () => {
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
        }
        let mapId = T.id
        let MAP = makeMapNorm()
        const mapNow = () => {
            if (mapId !== T.id) { mapId = T.id; MAP = makeMapNorm() }
            return MAP
        }

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
            // drop the instrument row below it (and below the notch inset the
            // chrome itself rides) so nothing writes over nothing
            const TOP = hudTop(safeTop)
            hudRects = layoutOf(u, W, H, TOP)
            hctx.clearRect(0, 0, W, H)
            // speed streaks at the frame edges: density + tint ride v and boost
            if (P.boostT > 0 || P.v > 7.9) {
                const boost = P.boostT > 0
                const n = boost ? 14 : 7
                hctx.save()
                for (let i = 0; i < n; i++) {
                    const side = i % 2 ? 1 : -1
                    const edge = W * (0.42 + jit(i * 7.3 + (g.tick >> 2)) * 0.1)
                    const x0 = W / 2 + side * edge
                    const y0 = H * (0.35 + jit(i * 3.1 + g.tick) * 0.6)
                    const len = (20 + (boost ? 40 : 12) + jit(i + g.tick * 0.7) * 16) * u
                    hctx.globalAlpha = 0.08 + 0.14 * jit(i + g.tick * 0.5)
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
            const m0 = mapNow()
            hctx.beginPath()
            for (let i = 0; i < T.N; i += 6) {
                const [qx, qy] = m0(T.pts[i].x, T.pts[i].y)
                const px0 = Math.round(W - mw - 2 * u + qx * mw); const py0 = Math.round(TOP + 2 * u + qy * mw)
                if (i === 0) hctx.moveTo(px0, py0); else hctx.lineTo(px0, py0)
            }
            hctx.closePath(); hctx.stroke()
            for (let i = g.karts.length - 1; i >= 0; i--) {
                const k = g.karts[i]
                const [qx, qy] = m0(k.x, k.y)
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
            // #511 item 4: stack, don't fraction — every attract line clears the
            // next by a glyph-aware gap and the long letter-spaced name is
            // squeezed to the corridor between the POS column and the minimap.
            const A = attractLayout(u, W, H, st.top.length, COURSE.name.length)
            const fa = (n) => `bold ${Math.max(1, Math.round(n))}px monospace`
            hctx.fillStyle = 'rgba(8,10,22,0.55)'
            hctx.fillRect(0, Math.round(A.band[0]), W, Math.round(A.band[1] - A.band[0]))
            hctx.textAlign = 'center'
            hctx.font = fa(A.title.fs)
            const gr = hctx.createLinearGradient(0, A.title.y - A.title.fs, 0, A.title.y + 4)
            gr.addColorStop(0, '#7ae8ff'); gr.addColorStop(1, '#2060f0')
            hctx.fillStyle = gr
            hctx.shadowColor = '#2090ff'; hctx.shadowBlur = 22 * u
            hctx.fillText('COMET DRIFT', W / 2, Math.round(A.title.y))
            hctx.shadowBlur = 0
            hctx.font = fa(A.name.fs)
            hctx.fillStyle = '#ffd840'
            const spaced = 'H D · ' + COURSE.name.split('').join(' ')
            const realW = hctx.measureText(spaced).width
            const fit = Math.min(1, A.availW / Math.max(1, realW))
            if (fit < 1) {
                hctx.save()
                hctx.translate(W / 2, 0); hctx.scale(fit, 1)
                hctx.fillText(spaced, 0, Math.round(A.name.y))
                hctx.restore()
            } else {
                hctx.fillText(spaced, W / 2, Math.round(A.name.y))
            }
            hctx.font = fa(A.sel.fs)
            hctx.fillStyle = '#7ae8ff'
            hctx.fillText('<  ' + COURSE.name + '  >', W / 2, Math.round(A.sel.y))
            // #502 item 5: mini-map outline preview — the selected circuit's
            // shape centred under the selector line, so cycling courses shows
            // the track itself, not just its name.
            const pbs = Math.round(A.prev.size)
            const pbx = Math.round(W / 2 - pbs / 2); const pby = Math.round(A.prev.top)
            const m1 = mapNow()
            hctx.strokeStyle = 'rgba(122,232,255,0.32)'; hctx.lineWidth = Math.max(1, Math.round(1.4 * u))
            hctx.beginPath()
            for (let i = 0; i < T.N; i += 6) {
                const [qx, qy] = m1(T.pts[i].x, T.pts[i].y)
                const px1 = pbx + qx * pbs; const py1 = pby + qy * pbs
                if (i === 0) hctx.moveTo(px1, py1); else hctx.lineTo(px1, py1)
            }
            hctx.closePath(); hctx.stroke()
            const msgs = ['4 LAPS · 7 KARTS · SELECT CIRCUIT WITH ← →', 'X GAS · S BRAKE · ←→ STEER', 'HOLD SPACE / B THROUGH A BEND', 'BLUE VIOLET GOLD — THE LADDER PAYS']
            hctx.font = fa(A.msg.fs)
            hctx.fillStyle = '#9fc8e8'
            hctx.fillText(msgs[Math.floor(g.tick / 120) % msgs.length], W / 2, Math.round(A.msg.y))
            if (st.top.length && A.best) {
                hctx.font = fa(A.best.fs)
                for (let i = 0; i < st.top.length; i++) {
                    hctx.fillStyle = i === 0 ? '#ffd840' : '#8098b8'
                    hctx.fillText(i === 0 ? `BEST  ${fmtTime(st.top[i])}` : ` #${i + 1}  ${fmtTime(st.top[i])}`, W / 2, Math.round(A.best.y + i * A.best.step))
                }
            }
            if ((g.tick >> 5) % 2) {
                hctx.font = fa(A.blink.fs)
                hctx.fillStyle = '#e8f0fa'
                hctx.fillText('PRESS ANY KEY / TAP', W / 2, Math.round(A.blink.y))
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
            hctx.fillText(g.end === 'win' ? `${COURSE.short} CHAMPION!` : `${P.place}TH PLACE`, W / 2, Math.round(H * 0.36))
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
            crowd(live)
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
            if (!live && g.end) { st.endT++; if (st.endT > 240) { Object.assign(g, makeGame(0)); st.endT = 0; sparks.clear(); dust.clear(); streaks.clear() } }
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
            nodeGL = null
            try { renderer.dispose() } catch { /* already gone */ }
            buildLegacy()
            if (import.meta.env.DEV) console.warn('CometDriftHD: backend rebuilt after ' + why)
        }
        const onRenderFail = () => { if (++renderFails >= 3) healIfNeeded('render failures') }
        const pixelHeartbeat = () => {
            if (backendName !== 'webgl2' || g.tick % 120 !== 0) return
            try {
                if (!nodeGL) nodeGL = (renderer && ((renderer.getContext && renderer.getContext()) || (renderer.backend && renderer.backend.gl))) || glCanvas.getContext('webgl2') || glCanvas.getContext('webgl')
                const glc = nodeGL
                if (!glc) return
                if (glc.isContextLost && glc.isContextLost()) { healIfNeeded('lost GL context') ; return }
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
                radialAmt.value = g.karts[0].boostT > 0 ? 0.32 + g.karts[0].boostTier * 0.26 : 0
                try {
                    if (post && post.renderAsync) post.renderAsync().catch(onRenderFail)
                    else if (post) post.render()
                    else if (renderer.renderAsync) renderer.renderAsync(scene, camera).catch(onRenderFail)
                    else renderer.render(scene, camera)
                } catch { onRenderFail() }
                pixelHeartbeat()
            }
            drawHud()
            if (st.screen === 'attract') drawAttract()
            if (st.screen === 'end') drawEnd()
        }

        const cycleCourse = (dir) => {
            const i = Math.max(0, COURSES.findIndex((c) => c.id === COURSE.id))
            selectCourse(COURSES[(i + dir + COURSES.length) % COURSES.length].id)
            buildTrackMeshes()
            applyCourseTint()
            buildHorizon()
            Object.assign(g, makeGame(0))
            st.endT = 0
            prevPlace = g.karts[0].place
            camA = g.karts[0].a
            camLift = 0
            sparks.clear(); dust.clear(); streaks.clear()
        }

        const resetTo = (screen) => {
            Object.assign(g, makeGame(0))
            st.screen = screen; screenRef.current = screen
            st.plan = screen === 'attract'
            st.endT = 0
            prevPlace = g.karts[0].place
            camA = g.karts[0].a
            camLift = 0
            sparks.clear(); dust.clear(); streaks.clear()
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
                if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { cycleCourse(e.code === 'ArrowRight' ? 1 : -1); return }
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
                    `drift ${P.driftT} charge ${Math.round(P.charge)}  boost ${P.boostT}/tier ${P.boostTier}  spin ${P.spinT}`,
                    `sparks ${sparks.aliveCount} dust ${dust.aliveCount} streaks ${streaks.aliveCount}  fov ${camera.fov.toFixed(1)}  tick ${g.tick}`,
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
            simulateDeviceLoss: () => {
                const gl = nodeGL || (renderer && ((renderer.getContext && renderer.getContext()) || (renderer.backend && renderer.backend.gl))) || glCanvas.getContext('webgl2') || glCanvas.getContext('webgl')
                const ext = gl && gl.getExtension('WEBGL_lose_context')
                if (!ext) return false
                ext.loseContext()
                return true
            },
            hasNodeGL: () => !!nodeGL,
            keys,
            screen: () => st.screen,
            ready: () => ready,
            backend: () => backendName,
            view: () => ({ w: cssW, h: cssH, dpr }),
            hud: () => ({ ...hudRects, safeTop }),
            attract: () => attractLayout(hs(), cssW, cssH, st.top.length, COURSE.name.length),
            press: (k) => { keys[k] = true; setTimeout(() => { keys[k] = false }, 150) },
            setPlan: (v) => { st.plan = !!v },
            course: () => COURSE.id,
            setCourse: (id) => { selectCourse(id); buildTrackMeshes(); applyCourseTint(); buildHorizon(); Object.assign(g, makeGame(0)); camA = g.karts[0].a; return COURSE.id },
            cycleCourse: (dir) => { cycleCourse(dir | 0); return COURSE.id },
            best: () => st.best,
            fx: () => {
                const P = g.karts[0]
                return { sparks: sparks.aliveCount, dust: dust.aliveCount, streaks: streaks.aliveCount, driftT: P.driftT, charge: Math.round(P.charge), boostT: P.boostT, spinT: P.spinT, v: P.v }
            },
            fxChain: () => ({ mode: chainMode, pipeline: !!post, bloom: bloomGain.value, radial: Math.round(radialAmt.value * 1000) / 1000, backend: backendName }),
            shadowBlob: () => ({ parts: kartMeshes[0].shadow.children.length, rotY: Math.round(kartMeshes[0].shadow.rotation.y * 1000) / 1000 }),
            brakeGlow: () => Math.round((kartMeshes[0].m.userData.brakeMat?.emissiveIntensity ?? -1) * 100) / 100,
            stars: () => {
                const c = starMesh && starMesh.geometry.getAttribute('color')
                const p = starMesh && starMesh.geometry.getAttribute('position')
                return {
                    count: starDefs.length,
                    upper: starDefs.every((d) => d.dir[1] >= 0.55),
                    radius: p ? Math.round(Math.hypot(p.getX(0), p.getY(0), p.getZ(0))) : 0,
                    bright: c ? Math.round(c.getX(0) * 1000) / 1000 : 0,
                    tick: g.tick,
                }
            },
            setBloom: (v) => { bloomGain.value = Math.max(0, Number(v) || 0); return chainMode },
            modelLoaded: () => {
                const v = kartMeshes[0].m.userData.view
                return !!(v && v.getObjectByName && v.getObjectByName('DuneBuggy'))
            },
            forceSpin: () => { g.karts[0].spinT = 90; return g.karts[0].spinT },
            kartWorld: () => {
                const m = kartMeshes[0].m
                return { pos: [m.position.x.toFixed(2), m.position.y.toFixed(2), m.position.z.toFixed(2)],
                    rot: [m.rotation.x.toFixed(3), m.rotation.y.toFixed(3), m.rotation.z.toFixed(3)],
                    visible: m.visible, children: m.children.length,
                    cam: [camera.position.x.toFixed(2), camera.position.y.toFixed(2), camera.position.z.toFixed(2)] }
            },
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
                sparks.clear(); dust.clear(); streaks.clear()
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
                    course: COURSE.id,
                    place: P.place, lap: P.lap, phase: g.phase, v: Math.round(P.v * 100) / 100,
                    driftT: P.driftT, charge: Math.round(P.charge), boostT: P.boostT, spinT: P.spinT,
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
            if (post) { try { post.dispose() } catch { /* gone */ } post = null }
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
            {paused && <PauseOverlay game={GAMES.find((x) => x.label === 'COMET DRIFT HD')} badge={COURSE.name} onResume={handleResume} />}
        </div>
    )
}
