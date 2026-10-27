// BRITANNIA — the world loader. All geography comes from the real Ultima IV
// data files read out of public/games/ultima4.jsdos at runtime (the 2011
// freeware release): nothing is transcribed into source. The .jsdos is a ZIP
// (stored, no compression in this bundle); WORLD.MAP is one terrain byte per
// tile in 32x32 blocks, blocks row-major over a 256x256 world. 0 = ocean.
// Star-shaped bright POIs (dungeons, shrines, moongates) are detected from
// the tile data itself, not from constants, so a different WORLD.MAP (a
// different world) loads the same way (#1128).

export const MAP_BYTES = 65536
export const MAPW = 256

// Minimal ZIP reader: central directory -> { name: Uint8Array }. Handles the
// stored entries this bundle uses, and deflate via DecompressionStream
// (browser + Node 18+) for robustness against other bundles.
// Minimal raw-deflate inflate (RFC1951). DecompressionStream is strict about
// the padding junk these DOS-packaged zips leave after the stream, so the
// game carries its own tolerant inflater — ~90 lines, no dependencies.
export function inflateRaw(src) {
    let pos = 0, bitPos = 0
    const LIMIT = src.length * 128 + 4096
    const bit = () => { if (pos >= src.length) throw new Error('inflate: truncated'); const b = (src[pos] >>> bitPos) & 1; if (++bitPos === 8) { bitPos = 0; pos++ } return b }
    const bits = n => { let v = 0; for (let i = 0; i < n; i++) v |= bit() << i; return v }
    let out = new Uint8Array(1 << 16)
    let op = 0
    const push = b => { if (op === out.length) { if (op > LIMIT) throw new Error('inflate: runaway'); const n = new Uint8Array(op * 2); n.set(out); out = n } out[op++] = b }
    const LEN = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258]
    const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]
    const DIST = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577]
    const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]
    function huffmanTable(lens) {
        const max = Math.max(...lens, 1)
        const count = new Uint16Array(max + 1)
        for (const l of lens) if (l) count[l]++
        const symbols = []
        for (let l = 1; l <= max; l++) for (let s = 0; s < lens.length; s++) if (lens[s] === l) symbols.push(s)
        return { count, symbols, max }
    }
    function decode(t) {
        let code = 0, first = 0, index = 0
        for (let l = 1; l <= t.max; l++) {
            code = (code << 1) | bit()
            const c = t.count[l]
            if (code - first < c) return t.symbols[index + (code - first)]
            first = (first + c) << 1
            index += c
        }
        throw new Error('inflate: bad code')
    }
    for (;;) {
        const final = bits(1)
        const type = bits(2)
        if (type === 0) {
            if (bitPos) { bitPos = 0; pos++ }
            const len = src[pos] | (src[pos + 1] << 8)
            pos += 4
            for (let i = 0; i < len; i++) push(src[pos++])
        } else if (type === 1 || type === 2) {
            let lt, dt
            if (type === 1) {
                const lens = new Uint8Array(288)
                for (let i = 0; i < 144; i++) lens[i] = 8
                for (let i = 144; i < 256; i++) lens[i] = 9
                for (let i = 256; i < 280; i++) lens[i] = 7
                for (let i = 280; i < 288; i++) lens[i] = 8
                lt = huffmanTable(lens)
                dt = huffmanTable(new Uint8Array(30).fill(5))
            } else {
                const hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4
                const ORD = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]
                const clens = new Uint8Array(19)
                for (let i = 0; i < hclen; i++) clens[ORD[i]] = bits(3)
                const ct = huffmanTable(clens)
                const lens = new Uint8Array(hlit + hdist)
                let i = 0
                while (i < hlit + hdist) {
                    const s = decode(ct)
                    if (s < 16) lens[i++] = s
                    else if (s === 16) { const p = lens[i - 1]; let r = bits(2) + 3; while (r--) lens[i++] = p }
                    else if (s === 17) { let r = bits(3) + 3; while (r--) lens[i++] = 0 }
                    else { let r = bits(7) + 11; while (r--) lens[i++] = 0 }
                }
                lt = huffmanTable(lens.subarray(0, hlit))
                dt = huffmanTable(lens.subarray(hlit))
            }
            for (;;) {
                const s = decode(lt)
                if (s < 256) push(s)
                else if (s === 256) break
                else {
                    const li = s - 257
                    const len = LEN[li] + bits(LEXT[li])
                    const di = decode(dt)
                    const dist = DIST[di] + bits(DEXT[di])
                    for (let k = 0; k < len; k++) push(out[op - dist])
                }
            }
        } else throw new Error('inflate: bad block type')
        if (final) break
    }
    return out.subarray(0, op)
}

export function zipRead(arrayBuffer) {
    const u8 = new Uint8Array(arrayBuffer)
    const dv = new DataView(arrayBuffer)
    let eocd = -1
    for (let i = u8.length - 22; i >= 0 && i > u8.length - 66000; i--) {
        if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break }
    }
    if (eocd < 0) throw new Error('jsdos: not a zip (no EOCD)')
    const count = dv.getUint16(eocd + 10, true)
    let off = dv.getUint32(eocd + 16, true)
    const out = {}
    for (let n = 0; n < count; n++) {
        if (dv.getUint32(off, true) !== 0x02014b50) break
        const method = dv.getUint16(off + 10, true)
        let size = dv.getUint32(off + 24, true)
        const nameLen = dv.getUint16(off + 28, true)
        const extraLen = dv.getUint16(off + 30, true)
        const cmtLen = dv.getUint16(off + 32, true)
        const lho = dv.getUint32(off + 42, true)
        const name = new TextDecoder().decode(u8.subarray(off + 46, off + 46 + nameLen))
        const lnl = dv.getUint16(lho + 26, true)
        const lel = dv.getUint16(lho + 28, true)
        const dstart = lho + 30 + lnl + lel
        if (u8[dstart - 4] === 0x04 && u8[dstart - 3] === 0x03 && u8[dstart - 2] === 0x07 && u8[dstart - 1] === 0x08) {
            // zip64 extra placeholder not present in this bundle
            size = size === 0xffffffff ? Number(dv.getBigUint64(off + 46 + nameLen + extraLen - 8, true)) : size
        }
        const data = u8.subarray(dstart, dstart + size)
        if (method === 0) out[name.toUpperCase()] = data.slice()
        else if (method === 8) {
            try { out[name.toUpperCase()] = inflateRaw(data) } catch { /* junk entries stay out */ }
        }
        off += 46 + nameLen + extraLen + cmtLen
    }
    return out
}

export function makeWorld(mapBytes) {
    if (mapBytes.length !== MAP_BYTES) throw new Error(`britannia: WORLD.MAP is ${mapBytes.length} bytes, expected ${MAP_BYTES}`)
    const get = (x, y) => {
        const tx = ((x % MAPW) + MAPW) % MAPW
        const ty = ((y % MAPW) + MAPW) % MAPW
        const B = (ty >> 5) * 8 + (tx >> 5)
        return mapBytes[B * 1024 + (ty & 31) * 32 + (tx & 31)]
    }
    return { get }
}

// Ocean is 0 (verified: the whole 256-tile border reads 0, and the coast
// bright-values ring every landmass).
export const isSea = v => v === 0
export const isLand = v => v !== 0

// Stars: the original map marks dungeons, shrines and moongates with bright
// 4-arm stars. Detect: a bright core, a solid bright cross at +/-1 and lit
// arms at +/-2, with dark diagonals to reject thick coastlines.
export function findStars(world) {
    const { get } = world
    const bright = v => v >= 7
    const raw = []
    for (let y = 2; y < MAPW - 2; y++) {
        for (let x = 2; x < MAPW - 2; x++) {
            if (get(x, y) < 7) continue
            const cross = get(x - 1, y) >= 6 && get(x + 1, y) >= 6 && get(x, y - 1) >= 6 && get(x, y + 1) >= 6
            const arms = bright(get(x - 2, y)) && bright(get(x + 2, y)) && bright(get(x, y - 2)) && bright(get(x, y + 2))
            if (cross && arms) raw.push([x, y])
        }
    }
    const pts = []
    for (const [x, y] of raw) {
        const n = pts.find(p => Math.abs(p.x - x) < 6 && Math.abs(p.y - y) < 6)
        if (n) { n.x = (n.x * n.n + x) / (n.n + 1); n.y = (n.y * n.n + y) / (n.n + 1); n.n++ }
        else pts.push({ x, y, n: 1 })
    }
    // A gate stands inland: its 8 neighbours at distance 3 are land. That
    // rejects the bright coasts, which pass the star pattern along bays.
    const inland = pts.filter(p => {
        const xi = Math.round(p.x), yi = Math.round(p.y)
        for (const [dx, dy] of [[3, 0], [-3, 0], [0, 3], [0, -3], [3, 3], [3, -3], [-3, 3], [-3, -3]]) {
            if (isSea(get(xi + dx, yi + dy))) return false
        }
        return !isSea(get(xi, yi))
    })
    // Moongates sit well apart from each other; keep the 8 strongest.
    inland.sort((a, b) => b.n - a.n)
    const gates = []
    for (const p of inland) {
        if (gates.length >= 8) break
        const x = Math.round(p.x), y = Math.round(p.y)
        if (gates.every(g => (g.x - x) ** 2 + (g.y - y) ** 2 >= 22 * 22)) {
            gates.push({ x, y, score: p.n })
        }
    }
    // sort gates into a stable "pilgrimage" order: clockwise from north
    gates.sort((a, b) => {
        const aa = Math.atan2(a.y - 128, a.x - 128 + 0.0001)
        const bb = Math.atan2(b.y - 128, b.x - 128 + 0.0001)
        return aa - bb
    })
    return { stars: pts, gates }
}
