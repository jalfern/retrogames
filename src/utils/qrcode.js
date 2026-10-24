// QR CODE encoder (#926) — dependency-free, for the link-pads join card.
//
// Renders a scannable QR of the pad join URL (`jalfern.com/retrogames/pad?room=CODE`)
// so a phone opens the pad with one camera-tap instead of typing 4 letters.
// No third-party lib, no assets: it synthesizes the module grid itself.
//
// Scope (the join URL is short and fixed-shape, so a tiny subset covers it):
// QR Model 2, byte mode (ISO-8859-1), error-correction level L, versions 1..4
// — each of which is a SINGLE Reed-Solomon block, so no block interleaving.
// A payload longer than v4-L can hold returns null; callers fall back to the
// text code. Mask selection is the standard four-rule penalty, so the grid is
// a real, spec-conformant QR (not just "some black-and-white pattern").
//
// Everything here is pure: `encode(text)` returns { size, modules } where
// modules[r][c] is 0/1, plus `joinUrl(code)` so the harness and the component
// agree on the exact payload string. Correctness is pinned in padlinkcheck by
// a byte-exact codeword golden (the pre-mask data stream is mask-independent)
// AND, when jsQR is installed, a rasterise-and-decode round-trip.

// --- version table (EC level L only) ------------------------------------------
// cw = total codewords, ec = EC codewords (single block), align = alignment
// pattern centres for that version. size = 17 + 4*version.
const VERSIONS = [
    { v: 1, size: 21, cw: 26, ec: 7, align: [] },
    { v: 2, size: 25, cw: 44, ec: 10, align: [6, 18] },
    { v: 3, size: 29, cw: 70, ec: 15, align: [6, 22] },
    { v: 4, size: 33, cw: 100, ec: 20, align: [6, 26] },
]

// The join target the pill points at; the phone reads ?room= (pages/PadLink.jsx).
export function joinUrl(code, relayOverride) {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://jalfern.com'
    let url = `${origin}/retrogames/pad?room=${code}`
    if (relayOverride) url += `&relay=${relayOverride}`
    return url
}

// --- GF(256) arithmetic (primitive poly 0x11D) ------------------------------
const EXP = new Uint8Array(512)
const LOG = new Uint8Array(256)
;(function initGF() {
    let x = 1
    for (let i = 0; i < 255; i++) {
        EXP[i] = x
        LOG[x] = i
        x <<= 1
        if (x & 0x100) x ^= 0x11d
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]
})()
const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]])

function genPoly(degree) {
    // g(x) = Π (x - α^i), i = 0..degree-1 ; coefficients highest-first.
    let g = [1]
    for (let i = 0; i < degree; i++) {
        const next = new Array(g.length + 1).fill(0)
        const root = EXP[i]
        for (let j = 0; j < g.length; j++) {
            next[j] ^= g[j]
            next[j + 1] ^= mul(g[j], root)
        }
        g = next
    }
    return g
}

function ecBytes(data, ecLen) {
    // polynomial remainder of data·x^ecLen mod g(x) → ecLen bytes.
    const g = genPoly(ecLen)
    const rem = new Uint8Array(ecLen)
    for (const byte of data) {
        const factor = byte ^ rem[0]
        rem.copyWithin(0, 1)
        rem[ecLen - 1] = 0
        if (factor) for (let i = 0; i < ecLen; i++) rem[i] ^= mul(g[i + 1], factor)
    }
    return rem
}

// --- bit buffer --------------------------------------------------------------
class BitBuf {
    constructor() { this.bits = [] }
    put(value, len) { for (let i = len - 1; i >= 0; i--) this.bits.push((value >> i) & 1) }
    get length() { return this.bits.length }
}

function pickVersion(byteLen) {
    for (const ver of VERSIONS) {
        const dataBits = (ver.cw - ver.ec) * 8
        const capacity = Math.floor((dataBits - 4 - 8) / 8) // mode(4) + count(8)
        if (byteLen <= capacity) return ver
    }
    return null
}

// data codewords (mask-independent, the byte-exact part). Returns Uint8Array.
export function dataCodewords(text, ver) {
    const bytes = Array.from(text).map((ch) => {
        const c = ch.charCodeAt(0)
        if (c > 255) throw new Error('QR byte mode needs ISO-8859-1 chars only')
        return c
    })
    const bb = new BitBuf()
    bb.put(0b0100, 4) // byte mode
    bb.put(bytes.length, 8) // char count (8 bits for v1..9 byte mode)
    for (const b of bytes) bb.put(b, 8)
    const dataCw = ver.cw - ver.ec
    const cap = dataCw * 8
    // terminator: up to 4 zero bits, but not past capacity.
    let term = Math.min(4, cap - bb.length)
    while (term-- > 0) bb.put(0, 1)
    // pad to a whole byte
    while (bb.length % 8 !== 0) bb.put(0, 1)
    // pad bytes 0xEC, 0x11 alternating
    const PAD = [0xec, 0x11]
    let pi = 0
    while (bb.length < cap) bb.put(PAD[pi++ & 1], 8)
    const out = new Uint8Array(dataCw)
    for (let i = 0; i < dataCw; i++) {
        let b = 0
        for (let j = 0; j < 8; j++) b = (b << 1) | bb.bits[i * 8 + j]
        out[i] = b
    }
    return out
}

// full codeword sequence = data ++ EC (single block for v1..4).
export function codewords(text, ver) {
    const data = dataCodewords(text, ver)
    const ec = ecBytes(data, ver.ec)
    const all = new Uint8Array(ver.cw)
    all.set(data, 0)
    all.set(ec, data.length)
    return all
}

// --- function patterns -------------------------------------------------------
function buildFunctionGrid(ver) {
    const n = ver.size
    const mods = Array.from({ length: n }, () => new Uint8Array(n))
    const reserved = Array.from({ length: n }, () => new Uint8Array(n)) // 1 = function/format

    const setBlock = (row, col) => {
        // 7x7 finder with its 1-module separator, anchored so (row,col) is the
        // finder's top-left; writes into the grid and marks it reserved.
        for (let r = -1; r <= 7; r++) {
            for (let c = -1; c <= 7; c++) {
                const rr = row + r, cc = col + c
                if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue
                const inFinder = r >= 0 && r <= 6 && c >= 0 && c <= 6
                const ring = (r === 0 || r === 6 || c === 0 || c === 6)
                const core = r >= 2 && r <= 4 && c >= 2 && c <= 4
                mods[rr][cc] = inFinder && (ring || core) ? 1 : 0
                reserved[rr][cc] = 1
            }
        }
    }
    setBlock(0, 0)             // top-left
    setBlock(0, n - 7)         // top-right
    setBlock(n - 7, 0)         // bottom-left

    // timing patterns (row 6 / col 6), alternating starting dark.
    for (let i = 8; i < n - 8; i++) {
        const bit = i % 2 === 0 ? 1 : 0
        mods[6][i] = bit; reserved[6][i] = 1
        mods[i][6] = bit; reserved[i][6] = 1
    }

    // alignment patterns (skip any overlapping a finder).
    const centers = ver.align
    for (const r of centers) {
        for (const c of centers) {
            const nearFinder =
                (r <= 8 && c <= 8) ||
                (r <= 8 && c >= n - 9) ||
                (r >= n - 9 && c <= 8)
            if (nearFinder) continue
            for (let dr = -2; dr <= 2; dr++) {
                for (let dc = -2; dc <= 2; dc++) {
                    const ring = Math.max(Math.abs(dr), Math.abs(dc))
                    mods[r + dr][c + dc] = ring === 1 ? 0 : 1
                    reserved[r + dr][c + dc] = 1
                }
            }
        }
    }

    // dark module (always dark, sits above the bottom-left finder).
    mods[n - 8][8] = 1; reserved[n - 8][8] = 1

    // reserve format-information areas (around the two top finders).
    for (let i = 0; i <= 8; i++) {
        if (i !== 6) { reserved[8][i] = 1; reserved[i][8] = 1 }
    }
    for (let i = 0; i < 8; i++) reserved[8][n - 1 - i] = 1
    for (let i = 0; i < 7; i++) reserved[n - 1 - i][8] = 1

    return { mods, reserved, n }
}

// BCH(15,5) format info, EC-L (01) + mask, masked with 0x5412.
export function formatBits(mask) {
    const ec = 0b01 // level L
    let data = (ec << 3) | mask
    let d = data << 10
    const G = 0b10100110111 // generator
    for (let i = 14; i >= 10; i--) if (d & (1 << i)) d ^= G << (i - 10)
    return ((data << 10) | d) ^ 0b101010000010010
}

function placeFormat(mods, n, mask) {
    const bits = formatBits(mask) // bit 14 is MSB
    const at = (i) => (bits >> i) & 1
    // top-left: skip col 6 / row 6 timing crossings.
    for (let i = 0; i <= 5; i++) mods[8][i] = at(i)
    mods[8][7] = at(6)
    mods[8][8] = at(7)
    mods[7][8] = at(8)
    for (let i = 9; i <= 14; i++) mods[14 - i][8] = at(i)
    // top-right + bottom-left copies.
    for (let i = 0; i <= 7; i++) mods[8][n - 1 - i] = at(i)
    for (let i = 8; i <= 14; i++) mods[n - 15 + i][8] = at(i)
    mods[n - 8][8] = 1 // dark module stays dark
}

const MASKS = [
    (i, j) => (i + j) % 2 === 0,
    (i) => i % 2 === 0,
    (i, j) => j % 3 === 0,
    (i, j) => (i + j) % 3 === 0,
    (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
    (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
    (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
    (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0,
]

function placeData(mods, reserved, n, cw) {
    // two-module zigzag, right-to-left, up/down per pair, skipping col 6.
    let bit = 0
    let up = true
    const total = cw.length * 8
    for (let right = n - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5
        for (let vert = 0; vert < n; vert++) {
            for (let dx = 0; dx < 2; dx++) {
                const col = right - dx
                const row = up ? n - 1 - vert : vert
                if (reserved[row][col]) continue
                let b = 0
                if (bit < total) b = (cw[bit >> 3] >> (7 - (bit & 7))) & 1
                mods[row][col] = b
                bit++
            }
        }
        up = !up
    }
}

function applyMask(mods, reserved, n, mask) {
    const f = MASKS[mask]
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            if (reserved[i][j]) continue
            if (f(i, j)) mods[i][j] ^= 1
        }
    }
}

// --- mask penalty (ISO/IEC 18004 four rules) -------------------------------
function penalty(mods, n) {
    let score = 0
    // rule 1: runs of same colour in rows and columns.
    for (let k = 0; k < n; k++) {
        for (const axis of [0, 1]) {
            let run = 1, prev = -1
            for (let t = 0; t < n; t++) {
                const v = axis === 0 ? mods[k][t] : mods[t][k]
                if (v === prev) run++
                else { if (run >= 5) score += 3 + (run - 5); prev = v; run = 1 }
            }
            if (run >= 5) score += 3 + (run - 5)
        }
    }
    // rule 2: 2x2 blocks of one colour.
    for (let i = 0; i < n - 1; i++) {
        for (let j = 0; j < n - 1; j++) {
            const v = mods[i][j]
            if (v === mods[i][j + 1] && v === mods[i + 1][j] && v === mods[i + 1][j + 1]) score += 3
        }
    }
    // rule 3: 1:1:3:1:1 finder-like patterns with 4 light on one side.
    const P = [1, 0, 1, 1, 1, 0, 1]
    const matchAt = (get, t) => P.every((p, k) => get(t + k) === p)
    for (let k = 0; k < n; k++) {
        const row = (t) => mods[k][t]
        const col = (t) => mods[t][k]
        for (let t = 0; t + 7 <= n; t++) {
            if (matchAt(row, t)) score += 40
            if (matchAt(col, t)) score += 40
        }
    }
    // rule 4: balance from 50% dark.
    let dark = 0
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) dark += mods[i][j]
    const pct = (dark * 100) / (n * n)
    score += Math.floor(Math.abs(pct - 50) / 5) * 10
    return score
}

// --- public API ------------------------------------------------------------
// encode(text) -> { size, modules } (modules[r][c] = 0|1), or null if the
// text is too long for v1..4-L or holds non-Latin-1 characters.
export function encode(text) {
    const ver = pickVersion(text.length)
    if (!ver) return null
    const cw = codewords(text, ver)

    let best = null
    for (let mask = 0; mask < 8; mask++) {
        const { mods, reserved, n } = buildFunctionGrid(ver)
        placeData(mods, reserved, n, cw)
        applyMask(mods, reserved, n, mask)
        placeFormat(mods, n, mask)
        const p = penalty(mods, n)
        if (!best || p < best.score) best = { score: p, mods, n }
    }
    return { size: best.n, modules: best.mods }
}

// SVG path `d` for a grid (crisp, no raster), with a quiet zone baked into the
// viewBox so a phone camera has margin. One rect per dark module.
export function toSvgPath(encodeResult, quiet = 2) {
    const { size, modules } = encodeResult
    let d = ''
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (modules[r][c]) d += `M${c + quiet} ${r + quiet}h1v1h-1z`
        }
    }
    const dim = size + quiet * 2
    return { d, dim }
}

// Rasterise a module grid onto an offscreen canvas with a quiet zone, for
// drawing or for feeding a decoder. `scale` = pixels per module.
export function toCanvas(encodeResult, scale = 4, quiet = 4) {
    const { size, modules } = encodeResult
    const dim = (size + quiet * 2) * scale
    const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null
    if (!canvas) return null
    canvas.width = dim
    canvas.height = dim
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, dim, dim)
    ctx.fillStyle = '#000000'
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (modules[r][c]) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale)
        }
    }
    return canvas
}
