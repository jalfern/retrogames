// SKYWARD — three.js world. MODERN bar, phone discipline: one 1800 m Gerstner
// sea (the SAME wave table the sim rides, emitted by world.waterGLSL()), a
// gradient sky with sun glitter, vertex-coloured terrain sand→grass→rock→snow,
// billboard cumuli (one per thermal), a rain-shaft storm cell with lightning,
// procedural craft, ring gates, marker beacons, and a chase-cam with FOV kick.
// No shadow maps, pixel ratio capped at 2, single-pass forward — the frame
// budget the SHORE demo never held.

import * as THREE from 'three'
import { sockChain, dustFlow } from './sim.js'
import { scuffTell } from './sim.js'

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const lerp = (a, b, t) => a + (b - a) * t

function softSprite(inner = 'rgba(255,255,255,0.95)') {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const x = c.getContext('2d')
    const g = x.createRadialGradient(32, 32, 4, 32, 32, 30)
    g.addColorStop(0, inner)
    g.addColorStop(1, 'rgba(255,255,255,0)')
    x.fillStyle = g
    x.fillRect(0, 0, 64, 64)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
}

function labelSprite(text, color = '#ffffff') {
    const c = document.createElement('canvas')
    c.width = 320
    c.height = 72
    const x = c.getContext('2d')
    x.font = 'bold 40px ui-monospace, Menlo, monospace'
    x.textAlign = 'center'
    x.textBaseline = 'middle'
    x.shadowColor = 'rgba(0,0,0,.65)'
    x.shadowBlur = 8
    x.fillStyle = color
    x.fillText(text, 160, 38)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
}

// #3310 — the zone numbers, painted flat on the asphalt so a first-timer
// learns 150/300/450/700 mid-air instead of only from the banner.
function runwayNumber(text) {
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 160
    const x = c.getContext('2d')
    x.font = 'bold 112px ui-monospace, Menlo, monospace'
    x.textAlign = 'center'
    x.textBaseline = 'middle'
    x.lineWidth = 12
    x.strokeStyle = 'rgba(10,12,16,.85)'
    x.strokeText(text, 128, 84)
    x.fillStyle = '#f2f4f5'
    x.fillText(text, 128, 84)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
}

function bullseyeTexture() {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const x = c.getContext('2d')
    const bands = ['#e63b3b', '#ffffff', '#e63b3b', '#ffffff', '#e63b3b']
    for (let i = 0; i < bands.length; i++) {
        x.fillStyle = bands[i]
        x.beginPath()
        x.arc(64, 64, 62 - i * 12, 0, Math.PI * 2)
        x.fill()
    }
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
}

export function createSkywardGL(canvas, opts = {}) {
    const lite = !!opts.lite
    const world = opts.world
    const renderer = new THREE.WebGLRenderer({
        canvas, antialias: !lite, alpha: false, powerPreference: 'high-performance',
        preserveDrawingBuffer: !!import.meta.env.DEV,
    })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setPixelRatio(lite ? 1 : Math.min(window.devicePixelRatio || 1, 2))

    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0xbfdcec, 600, 2100)
    const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 2600)
    scene.add(camera)

    const hemi = new THREE.HemisphereLight(0xdff1ff, 0x3f5d4a, 1.1)
    scene.add(hemi)
    const sun = new THREE.DirectionalLight(0xfff3dc, 1.35)
    sun.position.set(-180, 260, 120)
    scene.add(sun)
    const sunDir = sun.position.clone().normalize()

    // ── sky: gradient dome + sun glow, dimmed by the storm, flashed by it ──
    const skyMat = new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: { uSun: { value: sunDir }, uFlash: { value: 0 }, uStormDir: { value: new THREE.Vector3(0.86, 0.34, -0.06) }, uCam: { value: new THREE.Vector3(0, 60, 520) } },
        vertexShader: `varying vec3 vP; varying vec3 vW; void main(){ vP = normalize(position); vW = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `
varying vec3 vP; varying vec3 vW; uniform vec3 uSun; uniform float uFlash; uniform vec3 uStormDir; uniform vec3 uCam;
void main(){
    float h = clamp(vP.y * 1.15 + 0.06, 0.0, 1.0);
    vec3 zen = mix(vec3(0.16,0.38,0.66), vec3(0.24,0.52,0.84), h);
    vec3 col = mix(vec3(0.80,0.90,0.95), zen, smoothstep(0.0,0.42,h));
    float s = max(dot(normalize(vP), uSun), 0.0);
    col += vec3(1.0,0.92,0.72) * pow(s, 220.0) * 1.6;
    col += vec3(1.0,0.85,0.6) * pow(s, 10.0) * 0.16;
    // #3272 item 3: dim toward where the CELL is (uStormDir = camera→deck),
    // camera-relative so the darkening sits behind the painted clouds at any
    // point on the course — the old fixed east vector lagged the ±64 m drift.
    float storm = smoothstep(0.35, 0.9, dot(normalize(uStormDir), normalize(vW - uCam)));
    col = mix(col, vec3(0.30,0.33,0.38), storm * 0.55);
    col += vec3(0.85,0.9,1.0) * uFlash * storm;
    gl_FragColor = vec4(col, 1.0);
}`,
    })
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(2400, 24, 16), skyMat))

    // ── sea: the sim's Gerstner table, displaced in the vertex shader ──────
    const seaGeo = new THREE.PlaneGeometry(2200, 2200, lite ? 110 : 190, lite ? 110 : 190)
    seaGeo.rotateX(-Math.PI / 2)
    {
        const pos = seaGeo.attributes.position
        const n = pos.count
        const shore = new Float32Array(n)
        for (let i = 0; i < n; i++) {
            const t = world.terrainHeight(pos.getX(i), pos.getZ(i))
            shore[i] = clamp((3.2 - t) / 9, 0, 1) // 1 = shoal/land
        }
        seaGeo.setAttribute('aShore', new THREE.BufferAttribute(shore, 1))
    }
    const seaMat = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 }, uSun: { value: sunDir }, uCam: { value: new THREE.Vector3() },
        },
        vertexShader: `
${world.waterGLSL()}
uniform float uTime;
attribute float aShore;
varying vec3 vW; varying float vH; varying float vShore; varying vec3 vN;
void main(){
    vec3 p = position;
    float h; float sx; float sz;
    float damp = 1.0 - aShore * 0.75;
    waveSum(p.xz, damp, uTime, h, sx, sz);
    p.y += h;
    vN = normalize(vec3(-sx, 1.0, -sz));
    vW = p; vH = h; vShore = aShore;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`,
        fragmentShader: `
varying vec3 vW; varying float vH; varying float vShore; varying vec3 vN;
uniform vec3 uSun; uniform vec3 uCam; uniform float uTime;
void main(){
    vec3 v = normalize(uCam - vW);
    float fres = pow(1.0 - max(dot(vN, v), 0.0), 3.0);
    vec3 deep = vec3(0.035, 0.22, 0.38);
    vec3 mid = vec3(0.06, 0.45, 0.56);
    vec3 shal = vec3(0.20, 0.72, 0.72);
    vec3 col = mix(mix(deep, mid, smoothstep(0.0,0.5,fres)), shal, vShore);
    vec3 r = reflect(-uSun, vN);
    float spec = pow(max(dot(r, v), 0.0), 90.0);
    col += vec3(1.0,0.95,0.8) * spec * (0.9 + 0.4 * sin(vW.x * 0.7 + uTime * 3.0));
    float crest = smoothstep(0.52, 0.78, vH) * (1.0 - vShore);
    float lace = vShore * smoothstep(0.4, 0.16, abs(sin(vW.x * 0.06 + vW.z * 0.05 - uTime * 0.9)));
    col = mix(col, vec3(0.96), clamp(crest + lace, 0.0, 1.0));
    gl_FragColor = vec4(col, 1.0);
}`,
    })
    const sea = new THREE.Mesh(seaGeo, seaMat)
    sea.position.y = 0
    scene.add(sea)

    // ── terrain: the island, vertex-coloured ────────────────────────────────
    const TER_N = lite ? 96 : 132
    const terGeo = new THREE.PlaneGeometry(760, 760, TER_N, TER_N)
    terGeo.rotateX(-Math.PI / 2)
    {
        const pos = terGeo.attributes.position
        const col = new Float32Array(pos.count * 3)
        const c = new THREE.Color()
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i)
            const z = pos.getZ(i) - 40
            const h = Math.max(world.terrainHeight(x, z), -1.8)
            pos.setY(i, h)
            pos.setZ(i, z)
            if (h < 0.6) c.setHex(0xe9d9a6)
            else if (h < 9) c.setHex(0x5f9a4f).lerp(new THREE.Color(0xe9d9a6), 1 - (h - 0.6) / 8.4)
            else if (h < 52) c.setHex(0x58843f).lerp(new THREE.Color(0x8b7f6d), (h - 9) / 43)
            else if (h < 82) c.setHex(0x8b7f6d)
            else c.setHex(0x8b7f6d).lerp(new THREE.Color(0xf1f3f5), clamp((h - 82) / 18, 0, 1))
            const g = 0.92 + 0.16 * ((Math.sin(x * 1.7) + Math.sin(z * 2.3)) * 0.25 + 0.5)
            col[i * 3] = c.r * g; col[i * 3 + 1] = c.g * g; col[i * 3 + 2] = c.b * g
        }
        terGeo.setAttribute('color', new THREE.BufferAttribute(col, 3))
        terGeo.computeVertexNormals()
    }
    const terrain = new THREE.Mesh(terGeo, new THREE.MeshLambertMaterial({ vertexColors: true }))
    scene.add(terrain)

    // ── clouds: cumuli over the thermals + scattered fair-weather puffs ─────
    const puff = softSprite()
    const clouds = []
    const addCloud = (x, y, z, s, tint) => {
        const m = new THREE.SpriteMaterial({ map: puff, transparent: true, opacity: 0.9, depthWrite: false, color: tint })
        const sp = new THREE.Sprite(m)
        sp.position.set(x, y, z)
        sp.scale.set(s, s * 0.52, 1)
        scene.add(sp)
        clouds.push(sp)
        return sp
    }
    const rngp = (n) => ((Math.sin(n * 127.1) * 43758.5453) % 1 + 1) % 1
    const thermalClouds = []
    world.thermals.forEach((c, i) => {
        const a = addCloud(c.x, 96 + i * 7, c.z, 110, 0xffffff)
        const b = addCloud(c.x + 26, 104 + i * 5, c.z - 18, 74, 0xf4f8ff)
        thermalClouds.push({ c, sprites: [a, b] })
    })
    for (let i = 0; i < 14; i++) {
        const a = rngp(i * 3 + 1) * Math.PI * 2
        addCloud(Math.cos(a) * (420 + rngp(i) * 700), 130 + rngp(i * 7) * 90, Math.sin(a) * (420 + rngp(i * 5) * 700) - 60, 90 + rngp(i * 11) * 120, 0xf6faff)
    }
    // storm cell: dark cluster + rain shaft — #3267: the whole deck rides in
    // one group so the painted cell follows stormPos(t); the sim answers for
    // the weather at the same place (thermalPos law → the cloud you see is
    // the weather you get).
    const stormCell = new THREE.Group()
    scene.add(stormCell)
    for (let i = 0; i < 16; i++) {
        const a = rngp(i * 13 + 5) * Math.PI * 2
        const r = rngp(i * 17) * world.storm.r * 0.8
        stormCell.add(addCloud(world.storm.x + Math.cos(a) * r, 150 + rngp(i * 19) * 70, world.storm.z + Math.sin(a) * r, 150 + rngp(i * 23) * 140, 0x57616f))
    }
    const rainN = lite ? 240 : 520
    const rainPos = new Float32Array(rainN * 3)
    for (let i = 0; i < rainN; i++) {
        rainPos[i * 3] = world.storm.x + (rngp(i) - 0.5) * world.storm.r * 1.6
        rainPos[i * 3 + 1] = rngp(i * 3) * 150
        rainPos[i * 3 + 2] = world.storm.z + (rngp(i * 7) - 0.5) * world.storm.r * 1.6
    }
    const rainGeo = new THREE.BufferGeometry()
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3))
    const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0xa8c4e4, size: lite ? 2.4 : 1.8, transparent: true, opacity: 0.55, depthWrite: false }))
    stormCell.add(rain)
    // #3362 item 1 — the attract orbit sweeps past the cell's west edge at
    // ~80 m, so the painted shafts engulfed the title card on east frames.
    // orbitAttract parks the camera clear of weather; render() hands the cell
    // back to flight, where being inside the rain is the point.
    const showCell = (on) => { stormCell.visible = on }

    // lightning bolt — a jagged ribbon from the cell base down to the water
    // near the core, flashing on the same peaks the sky goes bright. The sky
    // flash alone is invisible air; something visibly strikes the water.
    const boltSegs = []
    const BOLT_N = 9
    for (let i = 0; i < BOLT_N; i++) {
        const seg = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            new THREE.MeshBasicMaterial({ color: 0xdceaff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false })
        )
        boltSegs.push(seg)
        scene.add(seg)
    }
    const boltGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softSprite('rgba(225,240,255,0.95)'), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }))
    boltGlow.scale.set(48, 30, 1)
    scene.add(boltGlow)
    const boltUp = new THREE.Vector3(0, 1, 0)
    const boltDir = new THREE.Vector3()

    // thermal shimmer columns (where the lift lives)
    const thermCols = world.thermals.map((c) => {
        const m = new THREE.Mesh(
            new THREE.CylinderGeometry(c.r * 0.7, c.r * 0.9, 80, 14, 1, true),
            new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false })
        )
        m.position.set(c.x, 42, c.z)
        scene.add(m)
        return m
    })

    // ── rings, pads, markers ────────────────────────────────────────────────
    const ringMeshes = world.rings.map((r, i) => {
        const prev = i > 0 ? world.rings[i - 1] : { x: r.x, z: r.z - 100 }
        const next = i < world.rings.length - 1 ? world.rings[i + 1] : { x: r.x, z: r.z + 100 }
        const mat = new THREE.MeshBasicMaterial({ color: 0xff5d5d })
        const mesh = new THREE.Mesh(new THREE.TorusGeometry(9, 0.55, 8, 36), mat)
        mesh.position.set(r.x, r.y, r.z)
        mesh.rotation.y = Math.atan2(next.x - prev.x, next.z - prev.z)
        scene.add(mesh)
        return mesh
    })
    const padBands = []
    // thunderpass gates — violet torus rings through the cell, facing along
    // the line (same orientation discipline as the bay rings)
    const passMeshes = world.passRings.map((p, i) => {
        const prev = i > 0 ? world.passRings[i - 1] : { x: p.x - 100, z: p.z }
        const next = i < world.passRings.length - 1 ? world.passRings[i + 1] : { x: p.x + 100, z: p.z }
        const mesh = new THREE.Mesh(new THREE.TorusGeometry(11, 0.6, 8, 36), new THREE.MeshBasicMaterial({ color: 0xb39cff, transparent: true, opacity: 0.8 }))
        mesh.position.set(p.x, p.y, p.z)
        mesh.rotation.y = Math.atan2(next.x - prev.x, next.z - prev.z)
        scene.add(mesh)
        return mesh
    })
    for (let i = 0; i < 4; i++) {
        const rr = [4.5, 9, 15, 24][i]
        const band = new THREE.Mesh(
            new THREE.RingGeometry(rr - (i % 2 ? 2.2 : 0.9), rr, 40),
            new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffffff : 0xe63b3b, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
        )
        band.rotation.x = -Math.PI / 2
        band.position.set(world.pad.x, world.terrainHeight(world.pad.x, world.pad.z) + 0.12, world.pad.z)
        scene.add(band)
        padBands.push(band)
    }
    const bull = bullseyeTexture()
    // #3302 — the second strip: an airfield on the south beach (Pilotwings'
    // landing test in our keys). Readable from cruise height: dark band, white
    // edge lines + piano keys at the threshold, centreline dashes, zone ticks
    // where the score steps, windsock + ground board at the threshold.
    let sockProps = null // #3310 — the windsock's pivot + tail, ridden in render()
    let windBoard = null // #3331 — pulses red when a plane arrives crabbed
    {
        const R = world.runway
        const cx = (R.ax + R.bx) / 2, cz = (R.az + R.bz) / 2
        const len = world.STRIP_LEN, wid = R.half * 2
        const deck = world.terrainHeight(cx, cz) // the carve makes this exact
        // #3310 item 4 — dusk contrast: the cell dims the sand toward grey, and
        // a plain Lambert deck + markings dim with it (dark band on dark sand).
        // Both get an emissive floor so the airfield keeps its silhouette while
        // the storm soaks the beach.
        const asphalt = new THREE.Mesh(new THREE.BoxGeometry(len, 0.14, wid), new THREE.MeshLambertMaterial({ color: 0x3a3f47, emissive: 0x10151c }))
        asphalt.position.set(cx, deck + 0.07, cz)
        scene.add(asphalt)
        const white = new THREE.MeshLambertMaterial({ color: 0xf2f4f5, emissive: 0x7b8187 })
        const mark = (l, w, x, z) => {
            const m = new THREE.Mesh(new THREE.BoxGeometry(l, 0.06, w), white)
            m.position.set(x, deck + 0.16, z)
            scene.add(m)
        }
        mark(len - 1, 0.35, cx, cz - R.half + 0.35)
        mark(len - 1, 0.35, cx, cz + R.half - 0.35)
        for (let d = 14; d < len - 8; d += 16) mark(6, 0.5, R.ax + d, cz)
        for (const off of [-4.5, -1.5, 1.5, 4.5]) mark(9, 1.1, R.ax + 5.5, cz + off) // piano keys
        for (const f of [0.25, 0.5, 0.75]) mark(0.6, wid - 1.4, R.ax + f * len, cz) // zone ticks
        // #3310 item 2 — the score ladder painted in the north lane (centrelines
        // keep their dashes): each zone names its price at its own centre. The
        // glyph tops point down-strip (+x): an inbound west→east pilot reads them
        // upright, exactly like real runway distance paint.
        // #3370 item 2 — and a wheels-abort rolls the other way, so the south
        // lane carries a faint mirrored set (tops toward −x): the builder call
        // is the real-airfield convention — each direction reads its own set,
        // the same price standing at the same place (zones pay by position,
        // not by heading). The faint opacity keeps the primary ladder loud.
        for (let zi = 0; zi < 4; zi++) {
            const dec = new THREE.Mesh(new THREE.PlaneGeometry(11, 6.4),
                new THREE.MeshBasicMaterial({ map: runwayNumber([150, 300, 450, 700][zi]), transparent: true, opacity: 0.94, depthWrite: false }))
            dec.rotation.order = 'YXZ'
            dec.rotation.x = -Math.PI / 2 // flat on the deck
            dec.rotation.y = -Math.PI / 2 // glyph tops → +x (east, down the strip)
            dec.position.set(R.ax + ((zi + 0.5) / 4) * len, deck + 0.17, cz - 3.6)
            scene.add(dec)
            const echo = new THREE.Mesh(new THREE.PlaneGeometry(11, 6.4),
                new THREE.MeshBasicMaterial({ map: runwayNumber([150, 300, 450, 700][zi]), transparent: true, opacity: 0.6, depthWrite: false }))
            echo.rotation.order = 'YXZ'
            echo.rotation.x = -Math.PI / 2
            echo.rotation.y = Math.PI / 2 // mirrored: tops → −x, read by east→west traffic
            echo.position.set(R.ax + ((zi + 0.5) / 4) * len, deck + 0.17, cz + 3.6)
            scene.add(echo)
        }
        { // windsock at the threshold — an airfield is nothing without one,
          // and this one FLIES (#3310 item 6). #3370 item 1 gave it fabric:
          // three tapered joints hinged at the pole top, each drooping a
          // heavier share and flutters on the sim clock lagged one joint
          // behind the last (sockChain) — a gust snap now travels DOWN the
          // tail instead of snapping one rigid cone around.
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 5, 8), new THREE.MeshLambertMaterial({ color: 0xd9dde1, emissive: 0x3c4045 }))
            pole.position.set(R.ax - 2, deck + 2.5, cz + R.half + 3)
            scene.add(pole)
            const sockGroup = new THREE.Group()
            sockGroup.position.set(R.ax - 2, deck + 4.95, cz + R.half + 3)
            scene.add(sockGroup)
            const sockSegs = []
            const RADS = [0.55, 0.4, 0.26, 0.1] // throat → tip, same 1.8 m tail
            const segMat = [
                new THREE.MeshLambertMaterial({ color: 0xff8b3d, side: THREE.DoubleSide, emissive: 0x5c2b00 }),
                new THREE.MeshLambertMaterial({ color: 0xf2f4f5, side: THREE.DoubleSide, emissive: 0x595d61 }), // white band reads at dusk too
                new THREE.MeshLambertMaterial({ color: 0xff8b3d, side: THREE.DoubleSide, emissive: 0x5c2b00 }),
            ]
            for (let i = 0; i < segMat.length; i++) {
                const joint = new THREE.Group()
                joint.position.set(i * 0.6, 0, 0) // hinge at the previous junction
                const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(RADS[i + 1], RADS[i], 0.6, 10, 1, true), segMat[i])
                sleeve.rotation.z = -Math.PI / 2 // cylinder axis (y) → +x, tail
                sleeve.position.set(0.3, 0, 0)
                joint.add(sleeve)
                sockGroup.add(joint)
                sockSegs.push(joint)
            }
            sockProps = { group: sockGroup, segs: sockSegs, x: R.ax - 2, z: cz + R.half + 3 }
            const board = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelSprite('RUNWAY', '#ffd23f'), transparent: true, depthWrite: false }))
            board.scale.set(22, 5, 1)
            board.position.set(R.ax - 3, deck + 2.4, cz - R.half - 4)
            scene.add(board)
            windBoard = board
        }
    }
    const _targetMeshes = world.targets.map((t) => {
        const m = new THREE.Mesh(new THREE.CircleGeometry(6.5, 28), new THREE.MeshBasicMaterial({ map: bull, side: THREE.DoubleSide }))
        m.rotation.x = -Math.PI / 2
        m.position.set(t.x, world.terrainHeight(t.x, t.z) + 0.14, t.z)
        scene.add(m)
        return m
    })
    const beamGeo = new THREE.CylinderGeometry(2.4, 3.4, 70, 12, 1, true)
    const markerBeam = (x, z, color, text, yOff = 0) => {
        const g = new THREE.Group()
        const base = world.terrainHeight(x, z)
        const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.24, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }))
        beam.position.y = 35
        g.add(beam)
        const lbl = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelSprite(text, '#ffffff'), transparent: true, depthWrite: false }))
        lbl.scale.set(30, 6.8, 1)
        lbl.position.y = 74
        g.add(lbl)
        g.position.set(x, base + yOff, z)
        scene.add(g)
        return g
    }
    const r0 = world.rings[0]
    const beacons = {
        ring: markerBeam(r0.x, r0.z - 150, 0xffd23f, 'RING RUN', 0),
        spot: markerBeam(world.launch.x, world.launch.z, 0x59d7ff, 'SPOT LANDING'),
        drop: markerBeam(world.school.x + 30, world.school.z + 40, 0x6ee7a0, 'TARGET DROP'),
        pass: markerBeam(world.passStart.x, world.passStart.z, 0xb06bff, 'THUNDERPASS'),
    }

    // dock
    {
        const dock = new THREE.Mesh(new THREE.BoxGeometry(6, 0.5, 18), new THREE.MeshLambertMaterial({ color: 0x9a7648 }))
        const dx = world.school.x, dz = world.school.z + 66
        dock.position.set(dx, Math.max(world.terrainHeight(dx, dz), 0.6) + 0.5, dz)
        scene.add(dock)
    }

    // ── craft ───────────────────────────────────────────────────────────────
    const B = (g, geo, color, x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => {
        const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }))
        m.position.set(x, y, z)
        m.rotation.set(rx, ry, rz)
        if (s !== 1) m.scale.setScalar(s)
        g.add(m)
        return m
    }
    const buildPlane = () => {
        const g = new THREE.Group()
        B(g, new THREE.CylinderGeometry(0.55, 0.42, 6.4, 10), 0xf5f6f8, 0, 0, 0, Math.PI / 2)
        B(g, new THREE.BoxGeometry(10.5, 0.16, 1.5), 0xe8453c, 0, 0.05, 0.3)
        B(g, new THREE.BoxGeometry(3.4, 0.12, 1.0), 0xe8453c, 0, 0.15, -2.9)
        B(g, new THREE.BoxGeometry(0.14, 1.3, 1.2), 0xe8453c, 0, 0.75, -2.8)
        B(g, new THREE.SphereGeometry(0.5, 10, 8), 0x2b3d5c, 0, 0.45, 1.4)
        const prop = B(g, new THREE.BoxGeometry(3.2, 0.12, 0.16), 0x333a44, 0, 0, 3.3)
        B(g, new THREE.BoxGeometry(0.5, 0.9, 0.5), 0x2c3038, 0, -0.75, -1.2)
        g.userData.prop = prop
        // #3375 — gear, renderer-only (the sim never hears about it). Two
        // mains at the wing roots, a nose under the cowl: a strut that
        // stretches from the attach point with a wheel on the tip. The
        // render loop springs gearT 0→1 on approach (and on any grounded
        // hull), so a rollout reads as a machine with ground contact and
        // liftoff retracts her away.
        const gearMat = new THREE.MeshLambertMaterial({ color: 0x2c3038 })
        const gearTire = new THREE.MeshLambertMaterial({ color: 0x191c22 })
        const gearHub = new THREE.MeshLambertMaterial({ color: 0x9aa0aa })
        const mkGear = (x, z, strutLen, wheelR) => {
            const mount = new THREE.Group()
            mount.position.set(x, -0.3, z)
            const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 1, 6), gearMat)
            const wheel = new THREE.Group()
            const tire = new THREE.Mesh(new THREE.CylinderGeometry(wheelR, wheelR, 0.2, 12), gearTire)
            tire.rotation.z = Math.PI / 2
            const hub = new THREE.Mesh(new THREE.CylinderGeometry(wheelR * 0.45, wheelR * 0.45, 0.24, 8), gearHub)
            hub.rotation.z = Math.PI / 2
            wheel.add(tire, hub)
            mount.add(strut, wheel)
            mount.visible = false
            g.add(mount)
            return { mount, strut, wheel, strutLen, wheelR }
        }
        g.userData.gear = {
            mains: [mkGear(-1.15, -0.3, 1.02, 0.27), mkGear(1.15, -0.3, 1.02, 0.27)],
            nose: mkGear(0, 2.05, 0.85, 0.22),
        }
        // #3300 item 2 — engine work gets a tell. Twin exhaust streaks off the
        // lower cowl: short dark pipes at the ports, and behind each an
        // additive flame-cone that the render loop stretches, brightens and
        // whiten-heats with the live engine-bed load. Presentation only — the
        // sim never hears about them, nothing here is hashed.
        const heatMat = new THREE.MeshBasicMaterial({ color: 0xff7a33, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
        const streak = (x) => {
            const grp = new THREE.Group()
            B(grp, new THREE.CylinderGeometry(0.09, 0.11, 0.55, 6), 0x24282f, 0, 0, -0.15, Math.PI / 2)
            const geo = new THREE.ConeGeometry(0.12, 1, 8)
            geo.translate(0, 0.5, 0) // base at the port, tip aft
            const s = new THREE.Mesh(geo, heatMat)
            s.rotation.x = -Math.PI / 2
            grp.add(s)
            grp.position.set(x, -0.45, -1.6)
            g.add(grp)
            return s
        }
        g.userData.exhaust = { L: streak(-0.36), R: streak(0.36), mat: heatMat }
        return g
    }
    const buildGlider = () => {
        const g = new THREE.Group()
        const wing = new THREE.Mesh(new THREE.ConeGeometry(4.6, 7.5, 3), new THREE.MeshLambertMaterial({ color: 0xffcf3f }))
        wing.rotation.x = -Math.PI / 2
        wing.scale.set(1, 0.16, 1)
        wing.position.y = 0.4
        g.add(wing)
        B(g, new THREE.BoxGeometry(0.1, 0.1, 3.6), 0x8a6a2a, 0, 0.0, 0.6, 0, 0, 0)
        B(g, new THREE.CapsuleGeometry(0.32, 0.9, 4, 8), 0x2f5fa8, 0, -0.85, 0.2, Math.PI / 2)
        B(g, new THREE.SphereGeometry(0.3, 8, 8), 0xe8c9a0, 0, -0.6, 0.85)
        B(g, new THREE.BoxGeometry(1.6, 0.08, 0.08), 0x8a6a2a, 0, -0.35, 0.5)
        return g
    }
    const buildBelt = () => {
        const g = new THREE.Group()
        B(g, new THREE.CylinderGeometry(0.34, 0.34, 1.7, 8), 0x2fb3a0, -0.5, 0.15, 0)
        B(g, new THREE.CylinderGeometry(0.34, 0.34, 1.7, 8), 0x2fb3a0, 0.5, 0.15, 0)
        B(g, new THREE.BoxGeometry(0.9, 0.5, 0.4), 0x323841, 0, 0.1, 0.35)
        B(g, new THREE.ConeGeometry(0.3, 0.5, 8), 0x555e6b, -0.5, -0.95, 0, Math.PI)
        B(g, new THREE.ConeGeometry(0.3, 0.5, 8), 0x555e6b, 0.5, -0.95, 0, Math.PI)
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.6, 8), new THREE.MeshBasicMaterial({ color: 0xffb24d, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending }))
        flame.position.set(0, -1.7, 0)
        flame.scale.set(2.4, 1, 1)
        g.add(flame)
        g.userData.flame = flame
        // #3344 — the chocks. Two wedges tucked under the nozzle feet,
        // hidden while she flies: the park reads through the hull, the
        // chocks and the silenced flame — a settled machine, not a hover.
        const chocks = new THREE.Group()
        const chockMat = new THREE.MeshLambertMaterial({ color: 0x2a2e36 })
        const chockGeo = new THREE.BoxGeometry(0.46, 0.26, 0.52)
        // tucked at deck level under the nozzle feet (local −1.12: the parked
        // hull puts the nozzle tips ~0.05 above the deck)
        for (const sx of [-0.5, 0.5]) {
            const ck = new THREE.Mesh(chockGeo, chockMat)
            ck.position.set(sx, -1.12, 0.15)
            ck.rotation.y = sx < 0 ? 0.32 : -0.32
            chocks.add(ck)
        }
        chocks.visible = false
        g.add(chocks)
        g.userData.chocks = chocks
        B(g, new THREE.SphereGeometry(0.34, 8, 8), 0xe8c9a0, 0, 0.9, 0.1)
        B(g, new THREE.BoxGeometry(0.65, 0.75, 0.4), 0xd64545, 0, 0.35, 0.1)
        return g
    }
    const craft = { plane: buildPlane(), glider: buildGlider(), belt: buildBelt() }
    Object.values(craft).forEach((c) => scene.add(c))

    // blob shadow — no shadow maps (by design), but a craft without ground
    // contact reads as floating clipart. One soft ellipse, pressed onto the
    // exact surface under the hull (terrain or the live Gerstner swell),
    // widening and fading with altitude like a real penumbra. (#3138)
    const shadowMesh = new THREE.Mesh(
        new THREE.CircleGeometry(1, 24),
        new THREE.MeshBasicMaterial({ map: softSprite('rgba(6,14,20,0.75)'), transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
    )
    shadowMesh.rotation.x = -Math.PI / 2
    scene.add(shadowMesh)
    const SHADOW_SPAN = { plane: 5.8, glider: 5.0, belt: 1.9 }

    // crates pool
    const cratePool = []
    for (let i = 0; i < 4; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), new THREE.MeshLambertMaterial({ color: 0xb98a4a }))
        m.visible = false
        scene.add(m)
        cratePool.push(m)
    }

    // particle burst pool (splash / dust / spark)
    const PN = lite ? 90 : 160
    const pPos = new Float32Array(PN * 3)
    const pCol = new Float32Array(PN * 3)
    const pVel = new Float32Array(PN * 3)
    const pLife = new Float32Array(PN)
    const pGeo = new THREE.BufferGeometry()
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3))
    pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3))
    const pts = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: lite ? 3 : 2.4, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false }))
    scene.add(pts)
    let pHead = 0
    let dustTick = 0 // #3331 — rollout dust emission rate limiter (view-side only)
    // #3375 — the gear's spring state (renderer-only, lives in the frame loop)
    let gearT = 0, gearV = 0, gearLocked = false
    const burst = (x, y, z, color = [0.9, 0.97, 1.0], n = 18, up = 6) => {
        for (let i = 0; i < n; i++) {
            const j = pHead++ % PN
            pPos[j * 3] = x; pPos[j * 3 + 1] = y; pPos[j * 3 + 2] = z
            const a = Math.random() * Math.PI * 2
            const r = Math.random()
            pVel[j * 3] = Math.cos(a) * r * 5
            pVel[j * 3 + 1] = up * (0.4 + Math.random())
            pVel[j * 3 + 2] = Math.sin(a) * r * 5
            pCol[j * 3] = color[0]; pCol[j * 3 + 1] = color[1]; pCol[j * 3 + 2] = color[2]
            pLife[j] = 1
        }
    }

    // ── per-frame update ────────────────────────────────────────────────────
    const camPos = new THREE.Vector3(0, 60, 520)
    const camLook = new THREE.Vector3(0, 20, 150)
    const tmp = new THREE.Vector3()

    const resize = () => {
        const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 640
        const h = canvas.clientHeight || canvas.parentElement?.clientHeight || 360
        renderer.setSize(w, h, false)
        camera.aspect = w / Math.max(h, 1)
        camera.updateProjectionMatrix()
    }

    const render = (g, dt, fx = null) => {
        const t = g.t
        seaMat.uniforms.uTime.value = t
        seaMat.uniforms.uCam.value.copy(camera.position)
        const flash = world.stormFlash(t)
        skyMat.uniforms.uFlash.value = flash
        // #3267 — the painted cell tracks the sim's cell: stormPos(t) is the
        // one position both the weather and the sky read this frame.
        const cellP = world.stormPos(t)
        stormCell.position.set(cellP.x - world.storm.x, 0, cellP.z - world.storm.z)
        showCell(true) // flight paints the cell from any distance — incl. inside
        // #3310 item 6 — the sock flies: downwind, drooping at slack wind,
        // fluttering on the sim clock; passing-cell gusts make it snap.
        // #3370 item 1 — the snap runs through the joints: absolute per-joint
        // pose becomes local hinge deltas, so droop accumulates toward the
        // tip and each joint's sway lags the one before it.
        if (sockProps) {
            const gust = world.stormAt(sockProps.x, sockProps.z, t).gust
            const p = sockChain(world.wind, t, gust)
            if (p.dir) {
                const yaw = Math.atan2(-p.dir.z, p.dir.x) // +x-tail → downwind
                let d = yaw - sockProps.group.rotation.y
                while (d > Math.PI) d -= Math.PI * 2
                while (d < -Math.PI) d += Math.PI * 2
                sockProps.group.rotation.y += d * 0.08
            }
            let prevDroop = 0
            let prevSway = 0
            for (let i = 0; i < sockProps.segs.length; i++) {
                const s = p.segs[i]
                sockProps.segs[i].rotation.z = -(s.droop - prevDroop)
                sockProps.segs[i].rotation.y = s.sway - prevSway
                prevDroop = s.droop
                prevSway = s.sway
            }
        }
        // bolt to the water near the core, on flash peaks — re-jittered at
        // 26 Hz so it flickers rather than shimmers
        if (flash > 0) {
            const baseX = cellP.x + 12, baseZ = cellP.z - 8
            const tickQ = Math.floor(t * 26)
            const topY = 150, botY = 2.5
            const pts = []
            for (let i = 0; i <= boltSegs.length; i++) {
                const y = topY + (botY - topY) * (i / boltSegs.length)
                const jag = (i === 0 || i === boltSegs.length) ? 0 : (rngp(tickQ * 7 + i * 13) - 0.5) * 46
                const jagZ = (i === 0 || i === boltSegs.length) ? 0 : (rngp(tickQ * 11 + i * 29) - 0.5) * 34
                pts.push({ x: baseX + jag, y, z: baseZ + jagZ })
            }
            for (let i = 0; i < boltSegs.length; i++) {
                const a = pts[i], b = pts[i + 1]
                const seg = boltSegs[i]
                const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z
                const len = Math.hypot(dx, dy, dz)
                seg.visible = true
                seg.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
                seg.scale.set(1.4, len, 1.4)
                seg.quaternion.setFromUnitVectors(boltUp, boltDir.set(dx, dy, dz).normalize())
                seg.material.opacity = (i === boltSegs.length - 1 ? 1.0 : 0.75) * flash
            }
            boltGlow.visible = true
            boltGlow.position.set(baseX, 3.4, baseZ)
            boltGlow.material.opacity = flash * 0.9
        } else {
            for (const seg of boltSegs) seg.visible = false
            boltGlow.visible = false
        }
        // inside the cell the grey closes in: fog shuts down to gate distance
        const sS = g.stormS || 0
        hemi.intensity = 1.1 + flash * 1.4 - sS * 0.5
        scene.fog.near = lerp(600, 130, sS)
        scene.fog.far = lerp(2100, 760, sS)

        // rain
        const rp = rainGeo.attributes.position
        for (let i = 0; i < rainN; i++) {
            let y = rp.getY(i) - (46 + (i % 7)) * dt
            if (y < 2) y = 150
            rp.setY(i, y)
        }
        rp.needsUpdate = true

        // thermals pulse + drift (rung 2: the cloud IS the lift, same thermalPos)
        for (let i = 0; i < thermCols.length; i++) {
            const th = world.thermals[i]
            const tp = world.thermalPos(th, t)
            const tc = thermalClouds[i]
            if (tc) {
                tc.sprites[0].position.x = tp.x; tc.sprites[0].position.z = tp.z
                tc.sprites[1].position.x = tp.x + 26; tc.sprites[1].position.z = tp.z - 18
            }
            thermCols[i].position.x = tp.x
            thermCols[i].position.z = tp.z
            const pulse = world.thermalLift(tp.x, tp.z, t)
            thermCols[i].material.opacity = 0.035 + pulse * 0.02
            thermCols[i].rotation.y = t * 0.1
        }

        // rings: active pulses gold, passed dim green
        for (let i = 0; i < ringMeshes.length; i++) {
            const doneI = g.phase === 'ring' ? i < g.ringsPassed : (g.grad.ring != null || i < 0)
            const active = g.phase === 'ring' && i === g.ringsPassed
            const m = ringMeshes[i].material
            if (active) { m.color.setHex(0xffd23f); m.opacity = 0.85 + 0.15 * Math.sin(t * 7); m.transparent = true }
            else if (doneI && g.phase === 'ring') { m.color.setHex(0x3ddc84); m.opacity = 0.8; m.transparent = true }
            else { m.color.setHex(0xff7a6a); m.opacity = 0.7; m.transparent = true }
        }
        // thunderpass gates: same active/passed language as the bay rings
        for (let i = 0; i < passMeshes.length; i++) {
            const m = passMeshes[i].material
            if (g.phase === 'pass' && i === g.passIdx) { m.color.setHex(0xffd23f); m.opacity = 0.85 + 0.15 * Math.sin(t * 7) }
            else if (g.phase === 'pass' && i < g.passIdx) { m.color.setHex(0x3ddc84); m.opacity = 0.8 }
            else if (g.stormWings) { m.color.setHex(0x3ddc84); m.opacity = 0.55 }
            else { m.color.setHex(0xb39cff); m.opacity = 0.7 }
        }
        // beacons: pulse when relevant marker is active
        const near = g.marker
        Object.entries(beacons).forEach(([k, bE]) => {
            const on = near === k
            bE.children[0].material.opacity = on ? 0.5 + 0.25 * Math.sin(t * 6) : 0.16
            bE.visible = !(g.phase !== 'free' && !on && k !== (g.phase === 'ring' ? 'ring' : g.phase === 'spot' ? 'spot' : g.phase === 'pass' ? 'pass' : 'drop'))
        })

        // craft pose
        const c = craft[g.craft]
        Object.entries(craft).forEach(([k, cc]) => { cc.visible = k === g.craft })
        c.visible = true
        c.position.set(g.p.x, g.p.y + (g.craft === 'plane' ? 0.9 : g.craft === 'glider' ? 1.1 : 1.4), g.p.z)
        c.rotation.set(-g.pitch * 0.75, -g.heading + Math.PI, g.roll * 0.9, 'YXZ')
        // #3331 item 2 — grounded posture: the wheels-down hull sits low on
        // its gear with a nose-up trim, so a rollout reads as a machine with
        // ground contact, not a low hover (renderer-only; the sim is clean).
        if (g.craft === 'plane' && g.ground) { c.position.y -= 0.14; c.rotation.x -= 0.07 }
        // #3344 — parked read: the hull sits LOW on the deck (the chocks take
        // the weight) and the flame dies — a settled machine, not a hover.
        if (g.craft === 'belt' && g.park) c.position.y = g.p.y + 0.45
        if (g.craft === 'plane') {
            c.userData.prop.rotation.z = t * (8 + g.speed * 0.9)
            // #3300 item 2 — the load tell. Streak length, glow and heat all
            // ride fx.raw (the pre-duck load, so driving through rain still
            // shows the engine WORKING even while the bed ducks); the two
            // flames flicker off the deterministic sim clock, not a RNG.
            const ex = c.userData.exhaust
            const load = fx && Number.isFinite(fx.raw) ? clamp(fx.raw / 0.034, 0, 1) : 0
            const show = load > 0.04 && g.respawnT <= 0
            ex.L.visible = ex.R.visible = show
            if (show) {
                // #3362 item 2 — on a 390px portrait canvas (and lite CI's
                // 426) the tell shrank toward a pixel: scale it up on small
                // render targets (short side < 560 device px) and hold a
                // visibility floor so a loaded engine always reads, while the
                // whitening-when-hot law still rewards full load.
                const legible = clamp(560 / Math.max(1, Math.min(canvas.width || 640, canvas.height || 360)), 1, 2.2)
                const len = (0.45 + load * 2.2) * legible
                const sx = (1 + load * 0.7) * legible
                ex.L.scale.set(sx, len * (0.8 + 0.2 * Math.sin(t * 41)), sx)
                ex.R.scale.set(sx, len * (0.8 + 0.2 * Math.sin(t * 41 + 2.1)), sx)
                ex.mat.opacity = Math.min(0.75, Math.max(0.18, load * (0.3 + 0.45 * load)))
                ex.mat.color.setRGB(1, 0.48 + 0.42 * load, 0.2 + 0.55 * load)
            }
        }
        // #3375 — the gear spring. Down-and-lock on approach or any grounded
        // hull, retracted away after liftoff/abort. Renderer-only, never
        // hashed. The lock gets a small puff of asphalt when the hull is
        // down — the spring itself already overshoots into a bounce.
        const gear = c.userData.gear
        if (gear) {
            const floorY = Math.max(g.world.terrainHeight(g.p.x, g.p.z), g.world.waterHeightAt(g.p.x, g.p.z, t))
            const altAgL = g.p.y - floorY
            const target = g.craft === 'plane' && g.respawnT <= 0 && g.ditchT <= 0
                && (g.ground || (g._depart <= 0 && altAgL < 12)) ? 1 : 0
            const dtC = Math.min(dt, 1 / 30)
            gearV += (64 * (target - gearT) - 9 * gearV) * dtC
            gearT += gearV * dtC
            const vis = gearT > 0.03
            const spin = t * (6 + g.speed * 0.8)
            for (const gr of [...gear.mains, gear.nose]) {
                gr.mount.visible = vis
                if (!vis) continue
                const L = gr.strutLen * gearT
                gr.strut.scale.y = L
                gr.strut.position.y = -L / 2
                gr.wheel.position.y = -L - gr.wheelR
                gr.wheel.rotation.x = spin
            }
            if (target === 1 && !gearLocked && gearT > 0.93) {
                gearLocked = true
                if (g.ground || altAgL < 1.5) burst(g.p.x, floorY + 0.15, g.p.z, [0.85, 0.8, 0.64], 6, 1.3)
            } else if (target === 0) gearLocked = false
        }
        if (g.craft === 'belt') {
            const fl = c.userData.flame
            const parked = !!g.park
            fl.visible = !parked && g.thrusting
            fl.scale.y = 0.7 + Math.abs(Math.sin(t * 30)) * 0.5
            fl.scale.x = 2.4; fl.scale.z = 2.4
            c.userData.chocks.visible = parked
        }

        // #3331 item 2 — dust streaks off the mains: asphalt gripping the
        // hull. View-side tick-rate emission; the sim never sees it.
        // #3370 item 6 — plumes are earned: emission scales with deck speed,
        // so a parked belt (locked, 0 m/s) never puffs and a hot rollout
        // spits hard. dustFlow is the same pure law the cabinet's touchdown
        // puff uses.
        {
            const deckRoll = (g.craft === 'plane' && g.ground) || (g.craft === 'belt' && g.park)
            const flow = deckRoll ? dustFlow(g.speed) : 0
            if (flow > 0.02) {
                if (++dustTick % 3 === 0) {
                    const bx = g.p.x - Math.sin(g.heading) * 3.4, bz = g.p.z - Math.cos(g.heading) * 3.4
                    const bd = Math.max(g.world.terrainHeight(bx, bz), g.world.waterHeightAt(bx, bz, t))
                    burst(bx, bd + 0.25, bz, [0.82, 0.76, 0.6], 2 + Math.round(flow * 3), 0.8 + flow * 1.2)
                }
            } else dustTick = 0
        }

        // blob shadow: pressed onto whatever is under the hull (land or the
        // live swell). Sample the blob's edges too so it rides a slope instead
        // of clipping through it, and fade the whole thing out high up.
        {
            const gy = (x, z) => Math.max(g.world.terrainHeight(x, z), g.world.waterHeightAt(x, z, t))
            // #3331 — a rolling hull presses its shadow: tighter, darker, the
            // ground contact the chase-cam can finally read.
            const grounded = g.craft === 'plane' && g.ground
            const span = SHADOW_SPAN[g.craft] * (1 + Math.max(0, g.p.y - gy(g.p.x, g.p.z)) * 0.014) * (grounded ? 0.88 : 1)
            const gx = g.p.x, gz = g.p.z
            const groundY = Math.max(gy(gx, gz),
                gy(gx + span * 0.5, gz), gy(gx - span * 0.5, gz),
                gy(gx, gz + span * 0.5), gy(gx, gz - span * 0.5))
            const agl = g.p.y - groundY
            if (agl > -0.5 && agl < 110) {
                shadowMesh.visible = true
                shadowMesh.position.set(gx, groundY + 0.22, gz)
                shadowMesh.scale.set(span, span, 1)
                shadowMesh.material.opacity = (grounded ? 0.55 : 0.4) * Math.pow(1 - agl / 110, 1.6)
            } else {
                shadowMesh.visible = false
            }
        }

        // #3331 item 4 — the ground board shouts what the gauge knows: a hull
        // on short final drifting toward the crab limit makes RUNWAY glow hot.
        if (windBoard) {
            const tell = g.craft === 'plane' && g.phase === 'free' && !g.ground && g.respawnT <= 0
                ? scuffTell(g.world, g.p.x, g.p.z, g.heading, g.p.y) : null
            const hot = tell && tell.tell >= 0.55
            windBoard.material.color.setRGB(1, hot ? 0.45 + 0.12 * Math.sin(t * 9) : 1, hot ? 0.3 : 1)
        }

        // crates
        for (let i = 0; i < cratePool.length; i++) {
            const cr = g.crates[i]
            cratePool[i].visible = !!cr
            if (cr) cratePool[i].position.set(cr.x, cr.y, cr.z)
        }

        // particles
        for (let i = 0; i < PN; i++) {
            if (pLife[i] > 0) {
                pLife[i] -= dt * 1.6
                pVel[i * 3 + 1] -= 9 * dt
                pPos[i * 3] += pVel[i * 3] * dt
                pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt
                pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt
            } else {
                pPos[i * 3 + 1] = -50
            }
        }
        pGeo.attributes.position.needsUpdate = true
        pGeo.attributes.color.needsUpdate = true

        // camera
        const fwdX = Math.sin(g.heading), fwdZ = Math.cos(g.heading)
        const trail = g.craft === 'belt' ? 15 : 20
        const lift = g.craft === 'belt' ? 5.5 : 8
        tmp.set(g.p.x - fwdX * trail, g.p.y + lift - g.vy * 0.35, g.p.z - fwdZ * trail)
        camPos.lerp(tmp, 1 - Math.pow(0.0018, dt))
        camLook.lerp(tmp.set(g.p.x + fwdX * 14, g.p.y + 1 - g.vy * 0.5, g.p.z + fwdZ * 14), 1 - Math.pow(0.0008, dt))
        camera.position.copy(camPos)
        camera.lookAt(camLook)
        const fovT = g.craft === 'plane' ? 60 + clamp((g.speed - 32) * 0.45, 0, 16) : g.craft === 'glider' ? 58 : 64
        camera.fov = lerp(camera.fov, fovT, 1 - Math.pow(0.01, dt))
        camera.updateProjectionMatrix()

        // #3272 item 3 — the sky's dim band aims where the cell STANDS, from
        // this frame's camera (after the chase-cam move, so it matches the
        // pixels the painted clouds land on).
        const sd = world.skyDimDir(t, camera.position.x, camera.position.y, camera.position.z)
        skyMat.uniforms.uStormDir.value.set(sd.x, sd.y, sd.z)
        skyMat.uniforms.uCam.value.copy(camera.position)

        renderer.render(scene, camera)
    }

    const orbitAttract = (g, dt) => {
        // attract camera: a slow vista orbit of the isle. #3370 item 5 — the
        // orbit always passed the strip small and low in frame, so once per
        // cycle, as the south leg crests, the look glides down the coast onto
        // the airfield: the painted numbers, the flying sock and the RUNWAY
        // board sell themselves on the idle screen. Camera path only — the
        // attract autopilot still flies its mat-bound line (#3310 honesty).
        // #3362 item 1 — and the framing is no longer desktop-only: at
        // 390×844 a fixed 62° fov squeezes the horizontal to ~31° and cuts
        // the isle in half behind the title card, so portrait opens the fov,
        // pulls in a touch, drops the eye and aims at the island's centre;
        // the cell is never painted from inside (rain and cluster go dark
        // while the camera stands in them — flight gets them all back).
        const a = g.t * 0.045
        const portrait = camera.aspect < 0.8
        const R = portrait ? 440 : 480
        const H = portrait ? 112 : 130
        tmp.set(Math.sin(a) * R, H, -40 + Math.cos(a) * R)
        camPos.lerp(tmp, 1 - Math.pow(0.02, dt))
        camera.position.copy(camPos)
        const south = Math.pow(Math.max(0, (Math.cos(a) + 1) / 2), 3) // 1 at the south apex
        camLook.lerp(tmp.set(50 * south, (portrait ? 20 : 30) - 10 * south, -40 + 190 * south), 1 - Math.pow(0.01, dt))
        camera.lookAt(camLook)
        camera.fov = lerp(camera.fov, portrait ? 72 : 62, 0.02)
        camera.updateProjectionMatrix()
        // The vista orbit existed only as camera math — nothing ever pointed a
        // draw at it, so the canvas sat empty behind the SKYWARD card on every
        // load (found in the #3300 audit). Drive the clock uniforms and draw;
        // and since no hull is flying in attract, park the craft and the blob
        // shadow out of the shot (render() turns them back on with play).
        Object.values(craft).forEach((cc) => { cc.visible = false })
        shadowMesh.visible = false
        showCell(world.stormAt(camera.position.x, camera.position.z, g.t).s <= 0.05)
        seaMat.uniforms.uTime.value = g.t
        seaMat.uniforms.uCam.value.copy(camera.position)
        skyMat.uniforms.uFlash.value = world.stormFlash(g.t)
        const sd = world.skyDimDir(g.t, camera.position.x, camera.position.y, camera.position.z)
        skyMat.uniforms.uStormDir.value.set(sd.x, sd.y, sd.z)
        skyMat.uniforms.uCam.value.copy(camera.position)
        renderer.render(scene, camera)
    }

    const dispose = () => {
        scene.traverse((o) => {
            if (o.geometry) o.geometry.dispose()
            if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
                Object.values(m).forEach((v) => { if (v && v.isTexture) v.dispose() })
                m.dispose()
            })
        })
        renderer.dispose()
    }

    resize()
    return { render, orbitAttract, resize, dispose, burst, camera }
}
