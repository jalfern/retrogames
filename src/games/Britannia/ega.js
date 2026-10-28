// BRITANNIA — classic (C) mode with the original tiles from the bundle.
//
// Why not SHAPES.EGA: the terrain -> shape-base table is not present in any
// data file of the 1996 freeware bundle, and the one candidate scanned out of
// AVATAR.EXE (0,8,16,24,32,40,48,64) contradicts the sheet's own colour runs,
// so wiring it would mislabel marsh vs heath vs plains (#1135 checkpoint).
// But Origin shipped terrain tilesets in files NAMED BY THE TERRAIN:
// GRASS/MARSH/BRUSH/HILL/FOREST/SHORE.CON (+BRICK.CON for town walls,
// reserved for the stage-2 cities). The filename is the mapping — nothing is
// guessed, so these ARE the original tiles (fidelity law).
//
// Structure, verified per file by britanniacheck: each .CON is 192 bytes =
// 6 x 32B records of 8x8 chunky 4bpp pixels (high nibble = left pixel).
// Record 1 is byte-identical across every CON file (a global header), record 0
// is the per-terrain signature, and records 2..5 are the four variant tiles.
//
// Palette: the original set the EGA palette through port I/O at runtime, which
// is not in the bundle, so EGA below reproduces the semantic usage the tilesets
// themselves prove — blue/cyan water (SHORE), green ground (GRASS/BRUSH),
// brown trunks (FOREST), grey rock (HILL), cyan/yellow masonry (BRICK).
// Sea, cliff and plains have no named tileset and stay a flat fill: an honest
// approximation, never a mislabelled "original".

export const RECORD = 32
export const HEADER_RECORDS = 2
export const TILE8 = 8

export const CON_TERR = {
    1: 'GRASS.CON',
    2: 'MARSH.CON',
    4: 'HILL.CON',
    5: 'FOREST.CON',
    6: 'BRUSH.CON',
    8: 'SHORE.CON',
}

// sea/cliff/plains: no named tileset in the bundle -> flat fills
export const FLAT = { 0: '#00007c', 3: '#6c6c6c', 7: '#a8a800' }

export const EGA = [
    '#000000', '#0000aa', '#00aaaa', '#55ffff', '#00aa00', '#55ff55', '#aa5500', '#aaaaaa',
    '#555555', '#5555ff', '#aaffaa', '#afffff', '#ff5555', '#ff55ff', '#aaaa00', '#ffffff',
]

// one 32B record -> 64 palette indices (hi nibble = left pixel)
export function decodeRecord(rec, off = 0) {
    const px = new Uint8Array(TILE8 * TILE8)
    for (let i = 0; i < RECORD; i++) {
        px[i * 2] = rec[off + i] >> 4
        px[i * 2 + 1] = rec[off + i] & 15
    }
    return px
}

// a CON file -> the 4 variant tiles (records 2..5) as index arrays
export function decodeCon(bytes) {
    if (!bytes || bytes.length !== 6 * RECORD) {
        throw new Error(`britannia ega: CON is ${bytes && bytes.length} bytes, expected ${6 * RECORD}`)
    }
    const out = []
    for (let r = HEADER_RECORDS; r < 6; r++) out.push(decodeRecord(bytes, r * RECORD))
    return out
}

// variant choice per world tile: deterministic, 0..3
export const variantOf = (hash2, tx, ty, v) => Math.floor(hash2(tx, ty, v) * 4) % 4

// tiles.classic[v] = array of TILE-px canvases (4 stamped variants, or 1 flat fill)
export function buildClassicStamps(zip, TILE, hash2) {
    const classic = []
    for (let v = 0; v < 9; v++) {
        const name = CON_TERR[v]
        const set = name && zip[name] ? decodeCon(zip[name]) : null
        const n = set ? set.length : 1
        const slots = []
        for (let i = 0; i < n; i++) {
            const c = document.createElement('canvas')
            c.width = TILE; c.height = TILE
            const x = c.getContext('2d')
            x.imageSmoothingEnabled = false
            if (set) {
                const sc = TILE / TILE8
                for (let p = 0; p < set[i].length; p++) {
                    x.fillStyle = EGA[set[i][p]]
                    x.fillRect((p % TILE8) * sc, Math.floor(p / TILE8) * sc, sc, sc)
                }
            } else {
                x.fillStyle = FLAT[v]
                x.fillRect(0, 0, TILE, TILE)
            }
            slots.push(c)
        }
        classic.push(slots)
    }
    void hash2
    return classic
}
