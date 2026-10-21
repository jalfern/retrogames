// Minimal glTF 2.0 binary (.glb) writer for the shared model shelf.
// Non-indexed triangle soup with POSITION + NORMAL + COLOR_0 and one PBR
// material — enough for lean CC0 scenery, no dependencies. 1 unit = 1 metre,
// +Y up, origin on the ground. Flat shading (normals per triangle).
import { writeFileSync, readFileSync } from 'node:fs'

const MAGIC = 0x46546c67
const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942
const FLOAT = 0x1406
const VEC3 = 'VEC3'
const ARRAY_BUFFER = 34962

export function newSoup() {
    return { pos: [], nrm: [], col: [] }
}

export function merge(into, src) {
    for (let i = 0; i < src.pos.length; i++) {
        into.pos.push(src.pos[i]); into.nrm.push(src.nrm[i]); into.col.push(src.col[i])
    }
    return into
}

function pushTri(s, a, b, c, rgb) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const l = Math.hypot(nx, ny, nz) || 1
    nx /= l; ny /= l; nz /= l
    s.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2])
    s.nrm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz)
    s.col.push(rgb[0], rgb[1], rgb[2], rgb[0], rgb[1], rgb[2], rgb[0], rgb[1], rgb[2])
}

// Axis-aligned box centred at (cx,cy,cz), size (sx,sy,sz).
export function box(s, cx, cy, cz, sx, sy, sz, rgb) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2
    const y0 = cy - sy / 2, y1 = cy + sy / 2
    const z0 = cz - sz / 2, z1 = cz + sz / 2
    const p = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]
    const f = [[4, 5, 6, 7], [1, 0, 3, 2], [5, 1, 2, 6], [0, 4, 7, 3], [3, 7, 6, 2], [0, 1, 5, 4]]
    for (const [a, b, c, d] of f) { pushTri(s, p[a], p[b], p[c], rgb); pushTri(s, p[a], p[c], p[d], rgb) }
    return s
}

// Vertical n-gon prism centred at (cx,cz), radius r, from y0 to y1.
export function prism(s, cx, y0, cz, r, y1, n, rgb) {
    const ring = []
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; ring.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]) }
    for (let i = 0; i < n; i++) {
        const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % n]
        pushTri(s, [ax, y0, az], [bx, y0, bz], [bx, y1, bz], rgb)
        pushTri(s, [ax, y0, az], [bx, y1, bz], [ax, y1, az], rgb)
        pushTri(s, [cx, y1, cz], [bx, y1, bz], [ax, y1, az], rgb)
        pushTri(s, [cx, y0, cz], [ax, y0, az], [bx, y0, bz], rgb)
    }
    return s
}

export function writeGlb(filePath, soup) {
    const n = soup.pos.length / 3
    if (!n) throw new Error('empty soup')
    const pos = new Float32Array(soup.pos), nrm = new Float32Array(soup.nrm), col = new Float32Array(soup.col)
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) {
        const v = pos[i * 3 + k]
        if (v < min[k]) min[k] = v
        if (v > max[k]) max[k] = v
    }
    const bin = new Uint8Array(pos.byteLength + nrm.byteLength + col.byteLength)
    bin.set(new Uint8Array(pos.buffer), 0)
    bin.set(new Uint8Array(nrm.buffer), pos.byteLength)
    bin.set(new Uint8Array(col.buffer), pos.byteLength + nrm.byteLength)
    const bv = (byteOffset, byteLength) => ({ buffer: 0, byteOffset, byteLength, target: ARRAY_BUFFER })
    const acc = (bufferView, type, count, extra = {}) => ({ bufferView, byteOffset: 0, componentType: FLOAT, type, count, ...extra })
    const json = {
        asset: { version: '2.0', generator: 'retrogames model shelf' },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ mesh: 0, name: 'root' }],
        meshes: [{
            name: 'mesh',
            primitives: [{
                attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 },
                material: 0,
                mode: 4,
            }],
        }],
        materials: [{
            name: 'Mat',
            doubleSided: false,
            pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.9 },
        }],
        accessors: [
            acc(0, VEC3, n, { min, max }),
            acc(1, VEC3, n),
            acc(2, VEC3, n),
        ],
        bufferViews: [
            bv(0, pos.byteLength),
            bv(pos.byteLength, nrm.byteLength),
            bv(pos.byteLength + nrm.byteLength, col.byteLength),
        ],
        buffers: [{ byteLength: bin.byteLength }],
    }
    let jsonBytes = Buffer.from(JSON.stringify(json), 'utf8')
    const jsonPad = (4 - (jsonBytes.length % 4)) % 4
    if (jsonPad) jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc(jsonPad, 0x20)])
    const binPad = (4 - (bin.length % 4)) % 4
    const binBytes = binPad ? Buffer.concat([Buffer.from(bin), Buffer.alloc(binPad, 0)]) : Buffer.from(bin)
    const total = 12 + 8 + jsonBytes.length + 8 + binBytes.length
    const out = Buffer.alloc(total)
    let o = 0
    out.writeUInt32LE(MAGIC, o); o += 4
    out.writeUInt32LE(2, o); o += 4
    out.writeUInt32LE(total, o); o += 4
    out.writeUInt32LE(jsonBytes.length, o); o += 4
    out.writeUInt32LE(JSON_CHUNK, o); o += 4
    jsonBytes.copy(out, o); o += jsonBytes.length
    out.writeUInt32LE(binBytes.length, o); o += 4
    out.writeUInt32LE(BIN_CHUNK, o); o += 4
    binBytes.copy(out, o)
    writeFileSync(filePath, out)
    return { bytes: total, verts: n, tris: n / 3, min, max }
}

// Parse just enough of a .glb to recover vertex count + bounds (for shelf stats).
export function readGlb(filePath) {
    const buf = readFileSync(filePath)
    if (buf.readUInt32LE(0) !== MAGIC) throw new Error('not a glb: ' + filePath)
    const jsonLen = buf.readUInt32LE(12)
    const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'))
    const mesh = json.meshes[json.scenes ? json.scenes[json.scene || 0].nodes[0].mesh : 0] || json.meshes[0]
    const prim = mesh.primitives[0]
    const posAcc = json.accessors[prim.attributes.POSITION]
    const count = posAcc.count
    const m = mesh.primitives.length
    return { verts: count, tris: count / 3, primitives: m, sizeBytes: buf.length, min: posAcc.min, max: posAcc.max, materials: json.materials.length, animations: (json.animations || []).length }
}
