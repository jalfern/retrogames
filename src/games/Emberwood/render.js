// EMBERWOOD — HD-2D renderer: pixel sprites and tiles on a lit 3D diorama.
//
// Coordinate convention: X = east (tileX*TS), Y = south (tileY*TS), Z = height.
// The camera perches south-above and looks north-down (Octopath's tilted stage).
// A +Z-up stage viewed from above with camera.up=(0,-1,0) puts north on top but
// mirrors the X axis (screen-right = world west), so every view-space x passes
// through FX() — east reads right on screen, matching the tile data (#772).
// Floor planes keep their default +Z normal (they face the sky); blob shadows
// lie flat on them. Sprites billboard to the camera. Post chain: bright → blur →
// bloom, big-radius soft blur mixed by tilt-shift focus on the hero, vignette.
// `?lite=1` skips post + shadows.

import * as THREE from 'three'
import { SCREENS, TS, SW, SH, tileAt } from './world.js'

const WALL_H = 12
const FX = (x) => SW * TS - x

// #789 living foliage — one deterministic wind field drives every plant. The
// vale breathes: gusts (slow gain) ride over two swells so no two spots rock
// in lockstep. Trees sway slow and wide, bushes rustle fast and tight, tall
// grass shivers as a texture offset (the blades shift inside their tile).
export const WIND = {
    gust: (x, y, t) => 0.55 + 0.45 * Math.sin(t * 0.37 + x * 0.008 - y * 0.011),
    field: (x, y, t, sp, ph) => Math.sin(t * sp + x * 0.05 + y * 0.03 + ph) * 0.65 + Math.sin(t * sp * 0.47 - y * 0.041 + x * 0.013 + ph * 1.7) * 0.35,
    tree: (x, y, t) => WIND.field(x, y, t, 1.35, 0) * WIND.gust(x, y, t) * 0.05,
    bush: (x, y, t) => WIND.field(x, y, t, 3.1, 1.9) * WIND.gust(x, y, t) * 0.09,
    grass: (x, y, t) => WIND.field(x, y, t, 2.6, 0.7) * WIND.gust(x, y, t) * 0.06,
}

const SOLID_H = { '#': WALL_H, 'T': 2, 'H': WALL_H, 'R': WALL_H, '=': 5, 'I': 3 }

// #939 shelf pull — the vale's tree/bush mass is real shelf models (#637), not
// painted quads, so the facing law (#901) runs through a game: facingOf(id)
// decides each prop's stance — 'radial' gets a deterministic yaw and stands
// upright on the stage, '+z' billboards square to the camera, 'rigged' keeps
// its pose. If the shelf never attaches, the painted billboards below carry
// the look; the upgrade degrades whole (#638 pattern).
export const SHELF_DECOR = {
    trees: ['tree_pine', 'tree_oak', 'tree_pine_tall'],
    bush: 'bush',
}

// #829 crisp: full quality renders at device resolution (css px x dpr, capped)
// so lighting, bloom, vignette and geometry edges read smooth on phone+desktop;
// the sprite/tile textures stay NearestFilter, so the pixel art keeps its
// identity. `?lite=1` pins the CI buffer to the logical 480x288. Blur radii are
// uv-space (res uniform stays logical), so the look is identical, just sampled
// at more pixels.
const MAX_LONG = 1280
const DPR_CAP = 2

export function createRenderer(canvas, { lite = false, width = 480, height = 288 } = {}) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: true })
    renderer.setPixelRatio(1)
    renderer.setSize(width, height, false)
    renderer.shadowMap.enabled = !lite
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.35
    const gl2 = renderer.capabilities.isWebGL2

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#1a1626')

    const aspect = width / height
    // #959: full-bleed portrait. viewH grows on narrow aspects so the world
    // width never drops below COVER_W — the 16-tile screen keeps its east/west
    // columns (today's 4:3 portrait framed exactly 280 units) and the extra
    // height lands in the diorama's dark ground instead of letterbox bars.
    const BASE_VIEW_H = 210
    const COVER_W = 280
    let viewH = Math.max(BASE_VIEW_H, COVER_W / aspect)
    const camera = new THREE.OrthographicCamera(-viewH * aspect / 2, viewH * aspect / 2, viewH / 2, -viewH / 2, 1, 900)
    const CAM_Y = 88 + 120 // perch south of the screen centre
    camera.position.set(128, CAM_Y, 150)
    camera.up.set(0, -1, 0)
    camera.lookAt(128, 88, 2)

    const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x3c3226, 1.15)
    scene.add(hemi)
    const sun = new THREE.DirectionalLight(0xffd9a0, 2.4)
    sun.position.set(FX(-80), 200, 150)
    sun.target.position.set(128, 88, 0)
    if (!lite) {
        sun.castShadow = true
        sun.shadow.mapSize.set(1024, 1024)
        sun.shadow.camera.left = -180; sun.shadow.camera.right = 180
        sun.shadow.camera.top = 180; sun.shadow.camera.bottom = -180
        sun.shadow.camera.near = 1; sun.shadow.camera.far = 600
        sun.shadow.bias = -0.0018
    }
    scene.add(sun); scene.add(sun.target)
    const lantern = new THREE.PointLight(0xffb36b, 0, 90, 1.4)
    scene.add(lantern)
    const torchLights = []
    for (let i = 0; i < 4; i++) {
        const l = new THREE.PointLight(0xff9a3c, 0, 72, 1.3)
        scene.add(l); torchLights.push(l)
    }

    const makeTex = (cnv) => {
        const t = new THREE.CanvasTexture(cnv)
        t.magFilter = THREE.NearestFilter
        t.minFilter = THREE.NearestFilter
        t.generateMipmaps = false
        t.colorSpace = THREE.SRGBColorSpace
        return t
    }
    let TEX = null
    const texCache = new Map()
    const T = (key) => {
        if (!TEX) return null
        const raw = key.split('/').reduce((o, k) => o && o[k], TEX)
        if (!raw) return null
        if (!texCache.has(key)) texCache.set(key, makeTex(raw))
        return texCache.get(key)
    }

    const mkRT = (w, h, srgb = false, samples = 0) => {
        const opts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }
        if (samples > 0 && gl2) opts.samples = samples
        const rt = new THREE.WebGLRenderTarget(w, h, opts)
        if (srgb) rt.texture.colorSpace = THREE.SRGBColorSpace
        return rt
    }
    let bufW = width, bufH = height
    let samples = 0
    const rtScene = mkRT(bufW, bufH, true, 4)
    const rtA = mkRT(bufW / 2, bufH / 2)
    const rtB = mkRT(bufW / 2, bufH / 2)
    const rtC = mkRT(bufW / 2, bufH / 2)
    const rtD = mkRT(bufW / 2, bufH / 2)
    samples = lite ? 0 : (gl2 ? 4 : 0)

    // #829: match the drawing buffer to the canvas's CSS size x devicePixelRatio
    // (capped DPR_CAP x MAX_LONG); lite stays at the logical resolution.
    function resize() {
        const cw = canvas.clientWidth || width
        const ch = canvas.clientHeight || height
        let bw, bh
        if (lite) {
            // #959: lite follows the box aspect too — landscape stays pinned at
            // the 480-wide CI buffer, portrait gets a 640-tall narrow buffer so a
            // full-bleed phone never stretches the scene.
            const bar = cw / ch
            if (bar >= 1) { bw = width; bh = Math.round(width / bar) }
            else { bh = 640; bw = Math.round(640 * bar) }
        } else {
            const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP)
            bw = Math.round(cw * dpr)
            bh = Math.round(ch * dpr)
            const long = Math.max(bw, bh)
            if (long > MAX_LONG) {
                const k = MAX_LONG / long
                bw = Math.round(bw * k); bh = Math.round(bh * k)
            }
        }
        bw = Math.max(2, bw); bh = Math.max(2, bh)
        if (bw === bufW && bh === bufH) return
        bufW = bw; bufH = bh
        renderer.setSize(bw, bh, false)
        rtScene.setSize(bw, bh)
        const hw = Math.max(1, Math.round(bw / 2)), hh = Math.max(1, Math.round(bh / 2))
        rtA.setSize(hw, hh); rtB.setSize(hw, hh); rtC.setSize(hw, hh); rtD.setSize(hw, hh)
        const ar = bw / bh
        viewH = Math.max(BASE_VIEW_H, COVER_W / ar)
        camera.left = -viewH * ar / 2; camera.right = viewH * ar / 2
        camera.top = viewH / 2; camera.bottom = -viewH / 2
        camera.updateProjectionMatrix()
    }
    const quadGeo = new THREE.PlaneGeometry(2, 2)
    const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const quad = new THREE.Mesh(quadGeo, null)
    const quadScene = new THREE.Scene()
    quadScene.add(quad)

    const VS = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }'
    const brightMat = new THREE.ShaderMaterial({
        uniforms: { tSrc: { value: null } },
        vertexShader: VS,
        fragmentShader: 'uniform sampler2D tSrc; varying vec2 vUv; void main(){ vec3 c=texture2D(tSrc,vUv).rgb; float l=dot(c,vec3(.25,.6,.15)); gl_FragColor=vec4(c*smoothstep(0.55,0.92,l),1.0); }',
    })
    const blurMat = new THREE.ShaderMaterial({
        uniforms: { tSrc: { value: null }, dir: { value: new THREE.Vector2(1, 0) }, r: { value: 1.0 }, res: { value: new THREE.Vector2(width, height) } },
        vertexShader: VS,
        fragmentShader: 'uniform sampler2D tSrc; uniform vec2 dir; uniform float r; uniform vec2 res; varying vec2 vUv; void main(){ vec2 px=dir*r/res; vec3 s=texture2D(tSrc,vUv).rgb*0.227; s+=texture2D(tSrc,vUv+px*1.384).rgb*0.316; s+=texture2D(tSrc,vUv-px*1.384).rgb*0.316; s+=texture2D(tSrc,vUv+px*3.230).rgb*0.070; s+=texture2D(tSrc,vUv-px*3.230).rgb*0.070; gl_FragColor=vec4(s,1.0); }',
    })
    const compMat = new THREE.ShaderMaterial({
        uniforms: { tScene: { value: null }, tBloom: { value: null }, tSoft: { value: null }, focus: { value: new THREE.Vector2(0.5, 0.5) } },
        vertexShader: VS,
        fragmentShader: `
uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tSoft;
uniform vec2 focus; varying vec2 vUv;
vec3 lin2srgb(vec3 c){
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
void main(){
  vec3 c = texture2D(tScene, vUv).rgb;
  c += texture2D(tBloom, vUv).rgb * 0.7;
  float f = smoothstep(0.16, 0.42, distance(vUv, focus));
  c = mix(c, texture2D(tSoft, vUv).rgb, f * 0.5);
  float v = 1.0 - 0.4 * pow(length(vUv - 0.5) * 1.42, 2.2);
  c *= clamp(v, 0.55, 1.0);
  // The scene RT samples back as linear; the canvas is blitted raw, so encode
  // here or the whole diorama lands near-black (#773 — measured mean 15.8/255
  // on town in plain Chrome, lite path 58). WebKit and Blink agree once the
  // encode lives in the shader instead of depending on the framebuffer.
  gl_FragColor = vec4(lin2srgb(c), 1.0);
}`,
    })

    let screenGroup = new THREE.Group()
    scene.add(screenGroup)
    resize()
    let currentScreen = null
    let structureSig = ''
    const staticMeshes = []
    const canopies = []
    const bushes = []
    const grassTiles = []
    const dynamic = { doors: new Map(), cracks: new Map(), chests: new Map(), switches: new Map(), npcs: new Map() }

    // #939 shelf state: templates load once; geometry/material maps are shared
    // across clones and screens, so disposeScreen must never free them.
    let shelf = null
    let lastScreenArgs = null
    const shelfShared = new Set()

    async function attachShelf() {
        try {
            const { loadModel, facingOf } = await import('../../utils/modelShelf.js')
            const ids = [...new Set([...SHELF_DECOR.trees, SHELF_DECOR.bush])]
            const loaded = await Promise.all(ids.map(async (id) => ({ id, root: await loadModel(id), facing: await facingOf(id) })))
            if (loaded.some((l) => !l.root || !l.facing)) return
            const map = {}
            for (const l of loaded) {
                const box = new THREE.Box3().setFromObject(l.root)
                const size = box.getSize(new THREE.Vector3())
                const src = l.root.clone(true)
                src.traverse((o) => {
                    if (o.geometry) shelfShared.add(o.geometry)
                    if (o.material) {
                        shelfShared.add(o.material)
                        if (o.material.map) shelfShared.add(o.material.map)
                    }
                })
                map[l.id] = { src, facing: l.facing, h: size.y || size.z || 1 }
            }
            shelf = map
            if (currentScreen && lastScreenArgs) buildScreen(...lastScreenArgs)
        } catch { shelf = null }
    }

    const STAND_UP = Math.PI / 2

    // Place one shelf prop on the stage (origin on the ground, Y-up model into
    // Z-up stage via rotation.x = 90°; fronted ids billboard to the camera).
    function putShelfProp(id, x, y, targetH, yaw) {
        const t = shelf && shelf[id]
        if (!t) return null
        const src = t.src.clone(true)
        const mats = []
        src.traverse((o) => {
            if (!o.isMesh) return
            o.material = o.material.clone()
            mats.push(o.material)
            if (!lite) o.castShadow = true
        })
        src.scale.setScalar(targetH / t.h)
        if (t.facing === '+z') src.quaternion.copy(camera.quaternion)
        else src.rotation.set(STAND_UP, 0, yaw)
        const g = new THREE.Group()
        g.add(src)
        g.position.set(FX(x), y, 0)
        screenGroup.add(g); staticMeshes.push(g)
        return { group: g, mats, facing: t.facing }
    }

    const tileTexKey = (ch) => ({
        '.': 'grass', '"': 'tallgrass', ',': 'path', '~': 'water', 'T': 'grass', '#': 'stone',
        '=': 'grass', 'H': 'house', 'R': 'roof', 'I': 'grass', 'C': 'stone', 'S': 'stairs', '<': 'stone', 'A': 'stone',
    }[ch] || 'grass')

    function buildScreen(id, flags, cut) {
        disposeScreen()
        currentScreen = id
        lastScreenArgs = [id, flags, cut]
        const s = SCREENS[id]
        const dark = !!s.dark
        scene.background = new THREE.Color(dark ? '#0d0b14' : '#22305a')
        hemi.intensity = dark ? 0.5 : 1.15
        sun.intensity = dark ? 0.12 : 2.4
        lantern.intensity = dark ? 4 : 0
        const spots = []
        if (dark) {
            for (const d of s.doors || []) spots.push([d.x, d.y === 0 ? 1 : d.y - 1])
            for (const c of s.chests || []) spots.push([c.x, c.y === 0 ? 1 : c.y - 1])
            spots.push([2, 1], [13, 9])
        }
        spots.slice(0, 4).forEach((p, i) => {
            torchLights[i].position.set(FX(p[0] * TS + 8), p[1] * TS + 8, 10)
            torchLights[i].intensity = dark ? 7 : 0
        })

        const floorGeo = new THREE.PlaneGeometry(TS, TS)
        const reserved = new Set()
        for (const arr of [s.doors, s.chests, s.switches, s.plates, s.cracks, s.npcs, s.signs, s.warps, s.enemies]) {
            for (const e of arr || []) reserved.add(`${e.x},${e.y}`)
        }
        if (s.spawn) reserved.add(`${s.spawn[0]},${s.spawn[1]}`)
        for (let y = 0; y < SH; y++) {
            for (let x = 0; x < SW; x++) {
                const ch = tileAt(s, x, y)
                const tex = T(tileTexKey(ch))
                const z0 = ch === '~' ? -0.6 : 0
                const m = new THREE.Mesh(floorGeo, new THREE.MeshLambertMaterial({ map: tex }))
                m.position.set(FX(x * TS + 8), y * TS + 8, z0)
                m.receiveShadow = !lite
                if (ch === '~') m.material.color.set('#9fc8e8')
                if (ch === '"' && cut && cut[`${id}:${x},${y}`]) m.material.map = T('grass')
                else if (ch === '"' && T('tallgrass')) {
                    const cl = T('tallgrass').clone()
                    cl.wrapS = cl.wrapT = THREE.MirroredRepeatWrapping
                    cl.needsUpdate = true
                    m.material.map = cl
                    grassTiles.push({ tex: cl, x: x * TS + 8, y: y * TS + 8 })
                }
                screenGroup.add(m); staticMeshes.push(m)
                if (ch === '.') {
                    const nearTree = tileAt(s, x - 1, y) === 'T' || tileAt(s, x + 1, y) === 'T' || tileAt(s, x, y - 1) === 'T' || tileAt(s, x, y + 1) === 'T'
                    if (nearTree && x > 0 && y > 0 && x < SW - 1 && y < SH - 1 && !reserved.has(`${x},${y}`) && (x * 7 + y * 13) % 3 === 0 && T('bush')) {
                        const px = x * TS + 8, py = y * TS + 8
                        const sp = putShelfProp(SHELF_DECOR.bush, px, py, 10, ((x * 11 + y * 5) % 12) * Math.PI / 6)
                        if (sp) {
                            bushes.push({ mesh: sp.group, mats: sp.mats, facing: sp.facing, x: px, y: py })
                        } else {
                            const bu = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), new THREE.MeshLambertMaterial({ map: T('bush'), transparent: true, alphaTest: 0.4 }))
                            bu.quaternion.copy(camera.quaternion)
                            bu.position.set(FX(px), py, 5)
                            screenGroup.add(bu); staticMeshes.push(bu)
                            bushes.push({ mesh: bu, x: px, y: py })
                        }
                    }
                }
                if (ch === 'T') {
                    const px = x * TS + 8, py = y * TS + 8
                    const sp = putShelfProp(SHELF_DECOR.trees[(x * 7 + y * 13) % SHELF_DECOR.trees.length], px, py + 4, 30, ((x * 5 + y * 7) % 12) * Math.PI / 6)
                    if (sp) {
                        canopies.push({ mesh: sp.group, mats: sp.mats, facing: sp.facing, x: px, y: py, o: 1 })
                    } else {
                        const tr = new THREE.Mesh(new THREE.PlaneGeometry(24, 30), new THREE.MeshLambertMaterial({ map: T('tree'), transparent: true, alphaTest: 0.4 }))
                        tr.quaternion.copy(camera.quaternion)
                        tr.position.set(FX(px), py + 6, 12)
                        screenGroup.add(tr); staticMeshes.push(tr)
                        canopies.push({ mesh: tr, x: px, y: py, o: 1 })
                    }
                }
                if (ch === 'I') {
                    const sg = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.MeshLambertMaterial({ map: T('sign'), transparent: true, alphaTest: 0.4 }))
                    sg.quaternion.copy(camera.quaternion)
                    sg.position.set(FX(x * TS + 8), y * TS + 6, 8)
                    screenGroup.add(sg); staticMeshes.push(sg)
                }
                if (ch === '<') {
                    const pt = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ map: T('portal'), transparent: true }))
                    pt.position.set(FX(x * TS + 8), y * TS + 8, 0.2)
                    screenGroup.add(pt); staticMeshes.push(pt)
                }
                const h = SOLID_H[ch]
                if (h && ch !== 'T' && ch !== 'I' && ch !== '<' && ch !== 'C') {
                    const topKey = ch === '#' ? 'wallTop' : (ch === 'H' || ch === 'R' ? 'roof' : (ch === '=' ? 'fence' : 'rock'))
                    const box = new THREE.Mesh(new THREE.BoxGeometry(TS, TS, h), new THREE.MeshLambertMaterial({ map: ch === '#' ? T('wall') : (ch === '=' ? T('fence') : T(topKey)), color: ch === '#' ? '#9a95ad' : 0xffffff }))
                    box.position.set(FX(x * TS + 8), y * TS + 8, h / 2)
                    if (!lite) { box.castShadow = true; box.receiveShadow = true }
                    screenGroup.add(box); staticMeshes.push(box)
                }
            }
        }
        for (const p of s.plates || []) {
            const ring = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ map: T('plate'), transparent: true, color: 0xc9a24a }))
            ring.position.set(FX(p.x * TS + 8), p.y * TS + 8, 0.15)
            screenGroup.add(ring); staticMeshes.push(ring)
        }
        for (const sw of s.switches || []) {
            const plaque = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshLambertMaterial({ map: T('switchP') }))
            plaque.position.set(FX(sw.x * TS + 8), sw.y * TS + 8, 8)
            screenGroup.add(plaque); staticMeshes.push(plaque)
            dynamic.switches.set(sw.id, plaque)
        }
        for (const c of s.chests || []) {
            const ch2 = new THREE.Mesh(new THREE.PlaneGeometry(14, 12), new THREE.MeshLambertMaterial({ map: T('chest/closed'), transparent: true, alphaTest: 0.4 }))
            ch2.quaternion.copy(camera.quaternion)
            ch2.position.set(FX(c.x * TS + 8), c.y * TS + 8, 6)
            screenGroup.add(ch2); staticMeshes.push(ch2)
            dynamic.chests.set(c.id, ch2)
        }
        for (const d of s.doors || []) {
            const box = new THREE.Mesh(new THREE.BoxGeometry(TS, TS, WALL_H), new THREE.MeshLambertMaterial({ map: T(d.kind === 'bigkey' ? 'doorBig' : 'door') }))
            box.position.set(FX(d.x * TS + 8), d.y * TS + 8, WALL_H / 2)
            if (!lite) box.castShadow = true
            screenGroup.add(box); staticMeshes.push(box)
            dynamic.doors.set(d.id, box)
        }
        for (const cr of s.cracks || []) {
            const box = new THREE.Mesh(new THREE.BoxGeometry(TS, TS, WALL_H), new THREE.MeshLambertMaterial({ map: T('crack') }))
            box.position.set(FX(cr.x * TS + 8), cr.y * TS + 8, WALL_H / 2)
            if (!lite) box.castShadow = true
            screenGroup.add(box); staticMeshes.push(box)
            dynamic.cracks.set(cr.id, box)
        }
        for (const n of s.npcs || []) {
            const cnv = document.createElement('canvas'); cnv.width = 14; cnv.height = 18
            const g = cnv.getContext('2d')
            g.fillStyle = n.kind === 'shop' ? '#a04a3c' : '#7a6a8a'; g.fillRect(3, 6, 8, 8)
            g.fillStyle = '#e8b48a'; g.fillRect(4, 1, 6, 5)
            g.fillStyle = n.kind === 'shop' ? '#3c2c1c' : '#cfc8dc'; g.fillRect(3, 0, 8, 2)
            const nn = new THREE.Mesh(new THREE.PlaneGeometry(14, 18), new THREE.MeshLambertMaterial({ map: makeTex(cnv), transparent: true, alphaTest: 0.4 }))
            nn.quaternion.copy(camera.quaternion)
            nn.position.set(FX(n.x * TS + 8), n.y * TS + 8, 9)
            if (n.requires) { nn.userData.requires = n.requires; nn.visible = false }
            screenGroup.add(nn); staticMeshes.push(nn)
            dynamic.npcs.set(n.id, nn)
        }
    }

    function disposeScreen() {
        const cached = new Set(texCache.values())
        screenGroup.traverse(o => {
            if (o.geometry && !shelfShared.has(o.geometry)) o.geometry.dispose()
            if (o.material) { if (o.material.map && !cached.has(o.material.map) && !shelfShared.has(o.material.map)) o.material.map.dispose(); if (!shelfShared.has(o.material)) o.material.dispose() }
        })
        scene.remove(screenGroup)
        screenGroup = new THREE.Group()
        scene.add(screenGroup)
        staticMeshes.length = 0
        canopies.length = 0
        bushes.length = 0
        grassTiles.length = 0
        dynamic.doors.clear(); dynamic.cracks.clear(); dynamic.chests.clear(); dynamic.switches.clear(); dynamic.npcs.clear()
    }

    // ---- entity billboards ----
    const billboards = []
    const mkBillboard = (w, h) => {
        const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
        m.quaternion.copy(camera.quaternion)
        scene.add(m)
        const shadow = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, h * 0.5), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }))
        scene.add(shadow)
        const b = { mesh: m, shadow, mat, texKey: '' }
        billboards.push(b)
        return b
    }
    const heroBB = mkBillboard(16, 18)
    // ---- sword swipe arc: additive crescent that sweeps in the facing direction ----
    const ARC_DUR = 12
    const ARC_DIRS = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 }
    const ARC_DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }
    const arcCnv = document.createElement('canvas'); arcCnv.width = 32; arcCnv.height = 32
    {
        const g = arcCnv.getContext('2d')
        g.clearRect(0, 0, 32, 32)
        g.lineCap = 'round'
        g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 4
        g.beginPath(); g.arc(16, 23, 15, Math.PI * 1.12, Math.PI * 1.88); g.stroke()
        g.strokeStyle = 'rgba(255,244,210,1)'; g.lineWidth = 2
        g.beginPath(); g.arc(16, 23, 15, Math.PI * 1.18, Math.PI * 1.82); g.stroke()
    }
    const arcMat = new THREE.MeshBasicMaterial({ map: makeTex(arcCnv), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })
    const arcMesh = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), arcMat)
    arcMesh.quaternion.copy(camera.quaternion)
    arcMesh.visible = false
    scene.add(arcMesh)
    const bbPool = []
    for (let i = 0; i < 12; i++) bbPool.push(mkBillboard(16, 16))
    const projPool = []
    for (let i = 0; i < 10; i++) projPool.push(mkBillboard(12, 8))
    const dropPool = []
    for (let i = 0; i < 14; i++) dropPool.push(mkBillboard(10, 10))
    // #888 the Wyrm tail gets its own shingled segment billboards — never the
    // drop pool. 20 plates sample the 60-point spine; each orients along the
    // spine tangent, z-shingles head→tip, tapers, and lifts with the drive.
    const tailPool = []
    for (let i = 0; i < 20; i++) tailPool.push(Object.assign(mkBillboard(12, 12), { lastYaw: 0, yaw: 0, spd: 0, oriented: 0 }))
    let tailLive = 0
    const bombPool = []
    for (let i = 0; i < 4; i++) bombPool.push(mkBillboard(10, 12))
    const blockBBs = []
    for (let i = 0; i < 2; i++) {
        const b = mkBillboard(14, 14)
        const cnv = document.createElement('canvas'); cnv.width = 14; cnv.height = 14
        const g = cnv.getContext('2d')
        g.fillStyle = '#6e6a7e'; g.fillRect(1, 1, 12, 12)
        g.fillStyle = '#84809a'; g.fillRect(2, 2, 10, 4)
        g.strokeStyle = '#3f3c4c'; g.strokeRect(1.5, 1.5, 11, 11)
        b.mat.map = makeTex(cnv); b.mat.needsUpdate = true
        blockBBs.push(b)
    }

    const setTex = (b, key) => {
        if (b.texKey === key) return
        const t = T(key)
        if (t) { b.mat.map = t; b.mat.needsUpdate = true; b.texKey = key }
    }

    // ---- particles ----
    const PARTS = 90
    const parts = []
    const partGeo = new THREE.PlaneGeometry(3, 3)
    for (let i = 0; i < PARTS; i++) {
        const m = new THREE.Mesh(partGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }))
        m.visible = false
        scene.add(m)
        parts.push({ m, life: 0, vx: 0, vy: 0, vz: 0 })
    }
    let partIdx = 0
    function spawnParts(x, y, colors, n, spread = 2.4, up = 1.6) {
        for (let i = 0; i < n; i++) {
            const p = parts[partIdx]; partIdx = (partIdx + 1) % PARTS
            p.m.visible = true
            p.m.material.color.set(colors[Math.floor(Math.random() * colors.length)])
            p.m.position.set(FX(x), y, 6 + Math.random() * 8)
            p.vx = (Math.random() - 0.5) * spread
            p.vy = (Math.random() - 0.5) * spread
            p.vz = Math.random() * up
            p.life = 18 + Math.random() * 18
        }
    }
    const JUICE = { hit: ['#ffd27a', '#ff9a3c'], blood: ['#8a4030', '#c96a4a'], cut: ['#8cc45f', '#b7e08a'], boom: ['#ffd27a', '#ff9a3c', '#ff5a2a'], coin: ['#ffe08a', '#ffb238'], magic: ['#8ce0ff', '#bff2ff'], dust: ['#9b8254', '#8a714a', '#6e5a3a'], shard: ['#7c3d30', '#5c2f2f', '#c9613a'] }

    function spawnDust(x, y, dirx, diry, n) {
        // ground-hugging earth puffs that drift back along the charge line
        for (let i = 0; i < n; i++) {
            const p = parts[partIdx]; partIdx = (partIdx + 1) % PARTS
            p.m.visible = true
            p.m.material.color.set(JUICE.dust[Math.floor(Math.random() * JUICE.dust.length)])
            p.m.position.set(FX(x + (Math.random() - 0.5) * 4), y + (Math.random() - 0.5) * 3, 1 + Math.random() * 2)
            p.vx = dirx * 0.5 + (Math.random() - 0.5) * 0.7
            p.vy = diry * 0.5 + (Math.random() - 0.5) * 0.7
            p.vz = 0.15 + Math.random() * 0.35
            p.life = 12 + Math.random() * 10
        }
    }
    let shake = 0
    function onFx(events) {
        if (!events || !events.length) return
        for (const e of events) {
            switch (e.k) {
                case 'sword': spawnParts(e.x + (e.dir === 'left' ? -8 : e.dir === 'right' ? 8 : 0), e.y + (e.dir === 'down' ? 8 : e.dir === 'up' ? -8 : 0), ['#ffffff', '#ffd87a'], 3, 1.4, 1); break
                case 'hit': spawnParts(e.x, e.y, JUICE.hit, 7); shake = Math.max(shake, 3); break
                case 'die': spawnParts(e.x, e.y, JUICE.blood, 12); shake = Math.max(shake, 4); break
                case 'cut': spawnParts(e.x, e.y, JUICE.cut, 6, 1.8, 1.2); break
                case 'boom': spawnParts(e.x, e.y, JUICE.boom, 26, 4.5, 3); shake = Math.max(shake, 7); break
                case 'crack': spawnParts(e.x, e.y, ['#8d8999', '#4e4a5a', '#ffd27a'], 16, 3.5, 2.4); break
                case 'coin': spawnParts(e.x, e.y, JUICE.coin, 4, 1.2, 1.4); break
                case 'heart': spawnParts(e.x, e.y, ['#ff8896', '#e8384a'], 5, 1.4, 1.4); break
                case 'key': case 'unlock': spawnParts(e.x, e.y, ['#e8c24a', '#fff3cf'], 8, 2, 1.6); break
                case 'switch': spawnParts(e.x, e.y, ['#c9a24a', '#ffe08a'], 10, 2.2, 1.8); break
                case 'shoot': spawnParts(e.x, e.y, ['#e8e2d0'], 2, 1, 0.6); break
                case 'spit': spawnParts(e.x, e.y, JUICE.magic, 4, 1.6, 1); break
                case 'hurt': shake = Math.max(shake, 6); break
                case 'clank': spawnParts(e.x, e.y, ['#ffffff', '#cfd6e6'], 5, 2, 1.2); break
                case 'stagger': spawnParts(e.x, e.y, ['#ff9a3c', '#ffd27a', '#ffffff'], 22, 4, 3); shake = Math.max(shake, 8); break
                case 'pop': spawnParts(e.x, e.y, JUICE.cut, 6, 2, 1.4); break
                case 'dust': spawnDust(e.x, e.y + 3, e.dirx || 0, e.diry || 0, 3); break
                case 'split': spawnParts(e.x, e.y, JUICE.shard, 10, 3.2, 2); spawnParts(e.x, e.y, ['#ff9a3c', '#ffd87a'], 6, 2, 2.4); shake = Math.max(shake, 3); break
                case 'warp': spawnParts(e.x, e.y, ['#8ce0ff', '#bff2ff'], 12, 2.4, 2); break
                case 'grant': spawnParts(e.x, e.y, ['#ffd27a', '#fff3cf', '#8ce0ff'], 14, 2.6, 2.2); break
            }
        }
    }

    const probeLight = (x, y, dark) => {
        if (!dark) return 1
        let v = 0.5
        for (const l of torchLights) {
            if (l.intensity <= 0) continue
            const d = Math.hypot(l.position.x - FX(x), l.position.y - y)
            v += Math.max(0, 1 - d / 70) * 1.6
        }
        const dl = Math.hypot(lantern.position.x - FX(x), lantern.position.y - y)
        v += Math.max(0, 1 - dl / 66) * 0.9
        return Math.min(1.3, v)
    }

    const simFocus = [128, 88]
    let waterTime = 0

    function sync(sim, tSec) {
        if (!TEX) return
        const dark = !!SCREENS[sim.screen]?.dark
        const sig = sim.screen + '|' + Object.keys(sim.flags.cracked).length + '|' + Object.keys(sim.flags.doorsOpen).length + '|' + Object.keys(sim.flags.chestsOpen).length
        if (sig !== structureSig || sim.screen !== currentScreen) {
            buildScreen(sim.screen, sim.flags, sim.cut)
            structureSig = sig
            for (const [cid, mesh] of dynamic.chests) if (sim.flags.chestsOpen[cid]) { mesh.material.map = T('chest/open'); mesh.material.needsUpdate = true }
            for (const [did, mesh] of dynamic.doors) if (sim.flags.doorsOpen[did]) mesh.visible = false
            for (const [kid, mesh] of dynamic.cracks) if (sim.flags.cracked[kid]) mesh.visible = false
            for (const [sid2, mesh] of dynamic.switches) if (sim.flags.switchesOn[sid2]) mesh.material.color.set('#4aff7a')
        }
        const s = SCREENS[sim.screen]
        for (const d of s.doors || []) {
            const mesh = dynamic.doors.get(d.id)
            if (!mesh) continue
            const open = (d.kind === 'switch' ? !!sim.flags.switchesOn[d.switch] : !!sim.flags.doorsOpen[d.id])
            mesh.visible = !open
        }
        for (const [, mesh] of dynamic.npcs) {
            if (mesh.userData.requires) mesh.visible = !!sim.items[mesh.userData.requires]
        }

        const hx = sim.hero.x, hy = sim.hero.y
        for (const cp of canopies) {
            const under = Math.abs(hx - cp.x) < 11 && hy > cp.y - 10 && hy < cp.y + 12
            cp.o += ((under ? 0.5 : 1) - cp.o) * 0.25
            if (cp.mats) {
                const faded = cp.o < 0.999
                for (const m of cp.mats) {
                    m.opacity = cp.o
                    m.transparent = faded
                    m.depthWrite = !faded
                }
                cp.mesh.rotation.x = STAND_UP + WIND.tree(cp.x, cp.y, tSec)
            } else {
                cp.mesh.material.opacity = cp.o
                cp.mesh.quaternion.copy(camera.quaternion)
                cp.mesh.rotateZ(WIND.tree(cp.x, cp.y, tSec))
            }
        }
        for (const b of bushes) {
            if (b.mats) {
                b.mesh.rotation.x = STAND_UP + WIND.bush(b.x, b.y, tSec)
            } else {
                b.mesh.quaternion.copy(camera.quaternion)
                b.mesh.rotateZ(WIND.bush(b.x, b.y, tSec))
            }
            b.mesh.position.x = FX(b.x) + Math.sin(tSec * 4.7 + b.x * 0.11) * WIND.gust(b.x, b.y, tSec) * 0.35
        }
        for (const gt of grassTiles) gt.tex.offset.x = WIND.grass(gt.x, gt.y, tSec)
        camera.position.x += (FX(128 + (hx - 128) * 0.5) - camera.position.x) * 0.08
        camera.position.y += ((CAM_Y + (hy - 88) * 0.5) - camera.position.y) * 0.08
        const lookX = camera.position.x, lookY = camera.position.y - 120
        camera.lookAt(lookX, lookY, 2)
        if (shake > 0.2) {
            camera.position.x += (Math.random() - 0.5) * shake
            camera.position.y += (Math.random() - 0.5) * shake
            shake *= 0.82
        }
        lantern.position.set(FX(hx), hy, 12)

        const anim = Math.floor(tSec * 7) % 2
        const pose = sim.swing > 0 ? 'slash' : (sim.drawing ? 'draw' : (sim.moving ? 'w' + (anim + 1) : 'w1'))
        setTex(heroBB, `hero/${sim.hero.dir}/${pose}`)
        heroBB.mesh.position.set(FX(hx), hy, 9)
        heroBB.mesh.scale.x = 1
        const hl = probeLight(hx, hy, dark)
        heroBB.mat.color.setRGB(hl, hl, hl)
        if (sim.hero.hurt > 0 && Math.floor(tSec * 14) % 2 === 0) heroBB.mat.color.set('#ff5c5c')
        heroBB.shadow.position.set(FX(hx), hy, 0.12)

        if (sim.arc > 0) {
            const af = sim.arc / ARC_DUR
            const [avx, avy] = ARC_DIRV[sim.arcDir] || [0, -1]
            arcMesh.visible = true
            arcMesh.quaternion.copy(camera.quaternion)
            arcMesh.rotateZ((ARC_DIRS[sim.arcDir] || 0) + (0.5 - af) * 0.9)
            arcMesh.position.set(FX(hx + avx * 11), hy + avy * 11, 10)
            const grow = 0.82 + (1 - af) * 0.4
            arcMesh.scale.set(grow, grow, 1)
            arcMat.opacity = af
            arcMat.color.setRGB(...(sim.items.blade ? [1.25, 0.72, 0.38] : [1.15, 1.0, 0.72]))
        } else {
            arcMesh.visible = false
        }

        for (let i = 0; i < bbPool.length; i++) {
            const b = bbPool[i]
            const e = sim.enemies[i]
            if (!e || e.dead || e.hidden) { b.mesh.visible = false; b.shadow.visible = false; continue }
            b.mesh.visible = true; b.shadow.visible = true
            let key
            if (e.type === 'bat') key = `bat/${anim}`
            else if (e.type === 'spitter') key = `spitter/${e.t % 60 < 8 ? 1 : 0}`
            else if (e.type === 'husk') key = `husk/${anim}`
            else if (e.type === 'wisp') key = `wisp/${anim}`
            else if (e.type === 'sprig') key = `sprig/${e.hidden ? 0 : 1}`
            else if (e.type === 'tuskroot') key = `tuskroot/${e.charging > 0 ? 3 : e.st > 0 ? 2 : anim}`
            else if (e.type === 'pod') key = `pod/${e.t % 70 < 26 ? 1 : 0}`
            else if (e.type === 'maw') key = `maw/${e.open ? 'open' : 'closed'}`
            else if (e.type === 'wyrm') key = `wyrm/${e.open ? 'open' : 'closed'}`
            else key = `cinder/${anim}`
            setTex(b, key)
            b.mesh.scale.set(1, 1, 1)
            if (e.type === 'maw') b.mesh.scale.set(28 / 16, 28 / 16, 1)
            if (e.type === 'wyrm') b.mesh.scale.set(24 / 16, 20 / 16, 1)
            b.mesh.position.set(FX(e.x), e.y, 8 + (e.type === 'bat' || e.type === 'wisp' ? 6 : 0))
            b.mesh.scale.x *= (e.fx > 0.1 ? -1 : 1)
            const el = e.hitT > 0 ? 1.7 : probeLight(e.x, e.y, dark)
            b.mat.color.setRGB(Math.min(1.6, el), e.hitT > 0 ? 1.1 : el, e.hitT > 0 ? 1.1 : el)
            b.mat.opacity = e.type === 'wisp' ? 0.65 + 0.3 * Math.sin(tSec * 6 + e.i) : 1
            b.shadow.position.set(FX(e.x), e.y, 0.12)
            b.shadow.scale.setScalar(e.boss ? 2 : 1)
        }
        const wyrm = sim.enemies.find(en => en.type === 'wyrm' && !en.dead)
        tailLive = 0
        for (let i = 0; i < tailPool.length; i++) {
            const t = tailPool[i]
            const si = wyrm && wyrm.seg ? i * 3 + 1 : -1
            const p = si >= 0 && si < wyrm.seg.length ? wyrm.seg[si] : null
            if (!p) { t.mesh.visible = false; t.shadow.visible = false; continue }
            const pa = wyrm.seg[si - 1] || p
            const pb = wyrm.seg[Math.min(wyrm.seg.length - 1, si + 1)] || p
            tailLive++
            t.mesh.visible = true
            setTex(t, i % 2 ? 'wyrm/segB' : 'wyrm/seg')
            // orient along the spine tangent in screen space (FX mirrors x);
            // the plate is head-tail symmetric so the sign of the tangent is free
            const tx = FX(pa.x) - FX(pb.x)
            const ty = pa.y - pb.y
            if (Math.abs(tx) + Math.abs(ty) > 0.01) { t.lastYaw = Math.atan2(ty, tx); t.oriented = 1 }
            t.mesh.quaternion.copy(camera.quaternion)
            t.mesh.rotateZ(t.lastYaw)
            // drive lift: how fast this slice of the chain is moving (samples
            // are 3 ticks apart); a diving wyrm presses the front plates down
            // and the ripple runs back along the body
            const spd = Math.hypot(p.x - pb.x, p.y - pb.y) / 3
            const taper = 1 - i * 0.038
            t.mesh.scale.set(taper * (1 + Math.min(0.16, spd * 0.16)), taper * (1 - Math.min(0.22, spd * 0.2)), 1)
            t.mesh.position.set(FX(p.x), p.y, 7.4 - i * 0.17 + Math.min(1.1, spd * 1.3) * (1 - i / tailPool.length))
            const wl = probeLight(p.x, p.y, dark)
            if (wyrm.hitT > 0) t.mat.color.setRGB(1.7, 1.2, 1.2)
            else if (wyrm.stagger > 0 && (i + Math.floor(tSec * 12)) % 3 === 0) t.mat.color.setRGB(1.5, 0.85, 0.4)
            else t.mat.color.setRGB(wl, wl, wl)
            t.shadow.visible = false
            t.yaw = t.lastYaw
            t.spd = spd
        }
        for (let i = 0; i < dropPool.length; i++) {
            const d = dropPool[i]
            const dr = sim.drops[i]
            if (!dr) { d.mesh.visible = false; d.shadow.visible = false; continue }
            d.mesh.visible = true; d.shadow.visible = true
            setTex(d, dr.kind === 'ember' ? `ember/${anim}` : dr.kind)
            d.mesh.position.set(FX(dr.x), dr.y, 5 + Math.sin(tSec * 5 + dr.t * 0.1) * 1.5)
            const dl2 = probeLight(dr.x, dr.y, dark)
            d.mat.color.setRGB(dl2, dl2, dl2)
            d.shadow.position.set(FX(dr.x), dr.y, 0.12)
        }
        for (let i = 0; i < projPool.length; i++) {
            const p = projPool[i]
            const pr = sim.projectiles[i]
            if (!pr) { p.mesh.visible = false; p.shadow.visible = false; continue }
            p.mesh.visible = true
            setTex(p, pr.kind === 'arrow' ? 'arrow' : 'orb')
            p.mesh.position.set(FX(pr.x), pr.y, 8)
            p.mesh.rotation.z = Math.atan2(pr.vy, pr.vx)
            const pl = probeLight(pr.x, pr.y, dark)
            p.mat.color.setRGB(pl, pl, pl)
            p.shadow.visible = false
        }
        for (let i = 0; i < bombPool.length; i++) {
            const b = bombPool[i]
            const bb = sim.bombs[i]
            if (!bb) { b.mesh.visible = false; b.shadow.visible = false; continue }
            b.mesh.visible = true; setTex(b, 'bomb')
            const puls = bb.fuse < 22 && Math.floor(tSec * 10) % 2 === 0
            b.mesh.position.set(FX(bb.x), bb.y, 6)
            b.mat.color.setRGB(puls ? 2 : 1, puls ? 1.2 : 1, puls ? 1.2 : 1)
            b.shadow.position.set(FX(bb.x), bb.y, 0.12)
        }
        const blocks = sim.blocks || []
        for (let i = 0; i < blockBBs.length; i++) {
            const b = blockBBs[i]
            const bk = blocks[i]
            if (!bk) { b.mesh.visible = false; b.shadow.visible = false; continue }
            b.mesh.visible = true
            b.mesh.position.set(FX(bk.x * TS + 8), bk.y * TS + 8, 7)
            const bl = probeLight(bk.x * TS + 8, bk.y * TS + 8, dark)
            b.mat.color.setRGB(bl, bl, bl)
            b.shadow.position.set(FX(bk.x * TS + 8), bk.y * TS + 8, 0.12)
        }
        for (const p of parts) {
            if (p.life <= 0) { p.m.visible = false; continue }
            p.life--
            p.m.position.x += p.vx
            p.m.position.y += p.vy
            p.m.position.z += p.vz
            p.vz -= 0.06
            p.m.material.opacity = Math.min(1, p.life / 14)
            p.m.quaternion.copy(camera.quaternion)
        }
        for (const l of torchLights) if (l.intensity > 0) l.intensity = 6.5 + Math.sin(tSec * 11 + l.position.x) * 0.25 + Math.random() * 0.12
    }

    function draw() {
        if (!TEX) return
        waterTime += 0.01
        const wt = texCache.get('water')
        if (wt) { wt.offset.x = Math.sin(waterTime) * 0.06; wt.offset.y = waterTime * 0.05 }
        if (lite) {
            renderer.setRenderTarget(null)
            renderer.render(scene, camera)
            return
        }
        renderer.setRenderTarget(rtScene); renderer.render(scene, camera)
        quad.material = brightMat; brightMat.uniforms.tSrc.value = rtScene.texture
        renderer.setRenderTarget(rtA); renderer.render(quadScene, quadCam)
        quad.material = blurMat
        blurMat.uniforms.r.value = 1
        blurMat.uniforms.tSrc.value = rtA.texture; blurMat.uniforms.dir.value.set(1, 0)
        renderer.setRenderTarget(rtB); renderer.render(quadScene, quadCam)
        blurMat.uniforms.tSrc.value = rtB.texture; blurMat.uniforms.dir.value.set(0, 1)
        renderer.setRenderTarget(rtA); renderer.render(quadScene, quadCam)
        blurMat.uniforms.r.value = 2.2
        blurMat.uniforms.tSrc.value = rtScene.texture; blurMat.uniforms.dir.value.set(1, 0)
        renderer.setRenderTarget(rtC); renderer.render(quadScene, quadCam)
        blurMat.uniforms.tSrc.value = rtC.texture; blurMat.uniforms.dir.value.set(0, 1)
        renderer.setRenderTarget(rtD); renderer.render(quadScene, quadCam)
        quad.material = compMat
        compMat.uniforms.tScene.value = rtScene.texture
        compMat.uniforms.tBloom.value = rtA.texture
        compMat.uniforms.tSoft.value = rtD.texture
        const v = new THREE.Vector3(FX(simFocus[0]), simFocus[1], 0).project(camera)
        compMat.uniforms.focus.value.set((v.x + 1) / 2, (v.y + 1) / 2)
        renderer.setRenderTarget(null)
        renderer.render(quadScene, quadCam)
    }

    function setFocus(x, y) { simFocus[0] = x; simFocus[1] = y }
    function screenPos(x, y, z = 0) {
        const v = new THREE.Vector3(FX(x), y, z).project(camera)
        return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 }
    }
    function loadTex(texObj) { TEX = texObj; texCache.clear() }
    function dispose() {
        disposeScreen()
        billboards.forEach(b => { b.mesh.geometry.dispose(); b.mesh.material.dispose(); b.shadow.geometry.dispose(); b.shadow.material.dispose() })
        parts.forEach(p => { p.m.geometry.dispose(); p.m.material.dispose() })
        rtScene.dispose(); rtA.dispose(); rtB.dispose(); rtC.dispose(); rtD.dispose()
        renderer.dispose()
    }

    return {
        loadTex, buildScreen, sync, draw, onFx, setFocus, screenPos, dispose, resize, attachShelf,
        renderInfo: () => ({
            bufferW: bufW, bufferH: bufH,
            cssW: canvas.clientWidth || width, cssH: canvas.clientHeight || height,
            viewW: camera.right - camera.left, viewH,
            dpr: Math.min(window.devicePixelRatio || 1, DPR_CAP),
            samples, lite, gl2,
        }),
        get camera() { return camera },
        foliage: () => ({
            trees: canopies.length, bushes: bushes.length, grass: grassTiles.length,
            shelfTrees: canopies.filter((c) => c.mats).length,
            shelfBushes: bushes.filter((b) => b.mats).length,
            shelfAttached: !!shelf,
            // billboard quads sway around z; shelf props stand on the stage and
            // lean around x (the upright base is STAND_UP, the wind rides on top)
            treeRot: canopies.slice(0, 5).map(c => (c.mats ? c.mesh.rotation.x - STAND_UP : c.mesh.rotation.z)),
            bushRot: bushes.slice(0, 5).map(b => (b.mats ? b.mesh.rotation.x - STAND_UP : b.mesh.rotation.z)),
            grassOff: grassTiles.slice(0, 6).map(g => g.tex.offset.x),
        }),
        tailStats: () => {
            const live = tailPool.filter(t => t.mesh.visible)
            return {
                n: tailLive,
                yaws: live.map(t => +t.yaw.toFixed(3)),
                zs: live.map(t => +t.mesh.position.z.toFixed(2)),
                scales: live.map(t => +t.mesh.scale.x.toFixed(3)),
                oriented: live.filter(t => t.oriented).length,
                dropVis: dropPool.filter(d => d.mesh.visible).length,
            }
        },
    }
}
