// CIVILIZATION V — Stage 1 "The Founding". Pure deterministic sim.
// No three, no DOM, no Math.random: this module is the single source of truth
// the Node harness (scripts/civcheck.mjs) and the in-browser autopilot import
// unchanged. Turn-based: the player orders units, presses END TURN, then each
// AI civ acts, cities yield + grow, borders expand, the turn advances.
//
// The ruleset (Stage 1 scope, faithful to the 2010 original):
//   - hex map (odd-r pointy-top), varied terrain, one unit per land tile.
//   - fog of war: unseen=black, explored-but-unseen=dimmed memory.
//   - settlers found cities (>= 3 hex from any city, on passable land).
//   - cities work `size` tiles (centre always), produce food/production/gold/
//     science/culture, and GROW on stored food surplus.
//   - borders spread in the owner's colour up to a city's work radius.
//   - Stage-1 milestone/win: your capital reaches size 4 before turn limit.
//     (Tech tree, war units, wonders, the four victories are later stages.)

export const CFG = {
    W: 40, H: 25,
    turnLimit: 40,
    capitalSizeToWin: 4,
    minCitySpacing: 3,          // centre-to-centre hex distance
    movesWarrior: 2,
    movesSettler: 2,
    growBase: 8, growStep: 3,   // stored food needed for the next citizen
    sightWarrior: 2, sightSettler: 2, sightCity: 2,
    cityRingWork: 1,            // Stage 1 works centre + adjacent ring only
}

export const T = { OCEAN: 0, COAST: 1, GRASS: 2, PLAINS: 3, DESERT: 4, HILLS: 5, MOUNTAIN: 6 }
export const CIVS = [
    { id: 0, name: 'ROME', hex: '#b8412f', player: true },
    { id: 1, name: 'EGYPT', hex: '#c9a227', player: false },
    { id: 2, name: 'CHINA', hex: '#2f7fb8', player: false },
    { id: 3, name: 'AZTEC', hex: '#3f9e4f', player: false },
]

// ---- terrain yields (Stage 1 approximation of the Civ V table) --------------
const BASE_YIELD = {
    [T.OCEAN]: { f: 0, p: 0, g: 0 },
    [T.COAST]: { f: 1, p: 0, g: 0 },
    [T.GRASS]: { f: 2, p: 0, g: 0 },
    [T.PLAINS]: { f: 1, p: 1, g: 0 },
    [T.DESERT]: { f: 0, p: 0, g: 0 },
    [T.HILLS]: { f: 0, p: 2, g: 0 },
    [T.MOUNTAIN]: { f: 0, p: 0, g: 0 },
}
const WALKABLE = (t) => t >= T.GRASS && t <= T.HILLS   // not ocean/coast/mountain

// ---- odd-r hex geometry -------------------------------------------------------
const ODD_R_NEIGH = [
    [[+1, 0], [0, -1], [-1, -1], [-1, 0], [-1, +1], [0, +1]],   // odd row
    [[+1, 0], [+1, -1], [0, -1], [-1, 0], [0, +1], [+1, +1]],   // even row
]
export function neighbors(col, row) {
    const tbl = ODD_R_NEIGH[((row & 1) === 1 ? 0 : 1)]
    const out = []
    for (const [dc, dr] of tbl) {
        const c = col + dc, r = row + dr
        if (c >= 0 && r >= 0 && c < CFG.W && r < CFG.H) out.push([c, r])
    }
    return out
}
export function offsetToCube(col, row) {
    const x = col - ((row - ((row & 1) ? 1 : 0)) >> 1)
    const z = row
    return { x, z, y: -x - z }
}
export function hexDist(a, b) {
    const A = offsetToCube(a[0], a[1]), B = offsetToCube(b[0], b[1])
    return (Math.abs(A.x - B.x) + Math.abs(A.y - B.y) + Math.abs(A.z - B.z)) >> 1
}

// ---- seeded PRNG (mulberry32) — never Math.random ---------------------------
export function makeRng(seed) {
    let s = seed >>> 0
    return function () {
        s = (s + 0x6D2B79F5) | 0
        let t = Math.imul(s ^ (s >>> 15), 1 | s)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}
const hash2 = (x, y, s) => {
    let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const idx = (c, r) => r * CFG.W + c
const inMap = (c, r) => c >= 0 && r >= 0 && c < CFG.W && r < CFG.H

// ------------------------------------------------------------------- terrain --
function generateMap(gs) {
    const { W, H } = CFG
    const rng = makeRng(gs.seed * 2654435761 + 12345)
    const cx = W / 2, cy = H / 2
    const elev = new Array(W * H)
    // coarse value-noise blob, bilinearly sampled -> smooth continent
    const G = 9, gw = Math.ceil(W / G) + 1, gh = Math.ceil(H / G) + 1
    const grid = []
    for (let gy = 0; gy < gh; gy++) { grid[gy] = []; for (let gx = 0; gx < gw; gx++) grid[gy][gx] = rng() }
    const sample = (x, y) => {
        const fx = x / G, fy = y / G, ix = Math.floor(fx), iy = Math.floor(fy)
        const tx = fx - ix, ty = fy - iy
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty)
        const a = grid[iy][ix] * (1 - sx) + grid[iy][ix + 1] * sx
        const b = grid[iy + 1][ix] * (1 - sx) + grid[iy + 1][ix + 1] * sx
        return a * (1 - sy) + b * sy
    }
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
        const nx = (c - cx) / (W * 0.52), ny = (r - cy) / (H * 0.52)
        const fall = 1 - Math.sqrt(nx * nx + ny * ny)
        elev[idx(c, r)] = sample(c, r) * 0.72 + fall * 0.28 + (hash2(c, r, gs.seed) - 0.5) * 0.05
    }
    const t = new Array(W * H)
    const forest = new Array(W * H).fill(false)
    const river = new Array(W * H).fill(false)
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
        const e = elev[idx(c, r)]
        let terr
        if (e < 0.34) terr = T.OCEAN
        else if (e < 0.42) terr = T.COAST
        else if (e > 0.72) terr = T.MOUNTAIN
        else if (e > 0.60) terr = T.HILLS
        else {
            const lat = Math.abs(r - cy) / (H * 0.5)
            terr = lat > 0.62 ? T.PLAINS : (hash2(c, r, gs.seed ^ 7) < lat * 0.7 + 0.12 ? T.DESERT : T.GRASS)
        }
        t[idx(c, r)] = terr
    }
    // coast = ocean adjacent to land OR land adjacent to ocean (shallow rims)
    const isLand = (c, r) => inMap(c, r) && t[idx(c, r)] >= T.GRASS
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
        if (t[idx(c, r)] === T.OCEAN) {
            if (neighbors(c, r).some(([nc, nr]) => isLand(nc, nr))) t[idx(c, r)] = T.COAST
        }
    }
    // forest: grass plains away from mountains, seeded thinning
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
        const tt = t[idx(c, r)]
        if ((tt === T.GRASS || tt === T.PLAINS) && hash2(c, r, gs.seed ^ 31) < 0.28) forest[idx(c, r)] = true
    }
    // rivers: from each tall mountain, walk downhill to the sea along neighbours
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
        if (t[idx(c, r)] !== T.MOUNTAIN) continue
        if (hash2(c, r, gs.seed ^ 53) > 0.55) continue
        let cc = c, rr = r, guard = 0
        while (guard++ < 80) {
            river[idx(cc, rr)] = true
            if (t[idx(cc, rr)] <= T.COAST) break
            let best = null, be = elev[idx(cc, rr)]
            for (const [nc, nr] of neighbors(cc, rr)) {
                const e = elev[idx(nc, nr)]
                if (e < be) { be = e; best = [nc, nr] }
            }
            if (!best) break
            cc = best[0]; rr = best[1]
        }
    }
    gs.tiles = t.map((terr, i) => ({
        c: i % W, r: (i - (i % W)) / W, terr, forest: forest[i], river: river[i],
        owner: -1, city: -1,
    }))
}

// ---------------------------------------------------------------- fog/units --
export function tileAt(gs, c, r) { return inMap(c, r) ? gs.tiles[idx(c, r)] : null }
export function unitAt(gs, c, r) { return gs.units.find((u) => u.alive && u.c === c && u.r === r) || null }
export function cityAt(gs, c, r) { const i = idx(c, r); return inMap(c, r) ? gs.tiles[i].city : -1 }

export function reveal(gs, civ, c, r, sight) {
    for (let rr = r - sight; rr <= r + sight; rr++) for (let cc = c - sight; cc <= c + sight; cc++) {
        if (!inMap(cc, rr)) continue
        if (hexDist([cc, rr], [c, r]) > sight) continue
        const i = idx(cc, rr)
        if (gs.explored[civ][i] === 0) gs.events.push({ type: 'explored', civ, c: cc, r: rr })
        gs.fog[civ][i] = 1
        gs.explored[civ][i] = 1
        gs.visible[civ][i] = 2
    }
}
export function clearVisible(gs, civ) { for (let i = 0; i < gs.visible[civ].length; i++) gs.visible[civ][i] = 0 }
export function isVisible(gs, civ, c, r) { return inMap(c, r) && gs.visible[civ][idx(c, r)] > 0 }
export function isExplored(gs, civ, c, r) { return inMap(c, r) && gs.explored[civ][idx(c, r)] > 0 }

// ------------------------------------------------------------------- newGame --
export function newGame(seed = 1, scenario = 0) {
    const gs = {
        seed: seed + scenario * 977, scenario, tick: 0, turn: 1, phase: 'player',
        tiles: [], units: [], cities: [], fog: [], explored: [], visible: [],
        civs: CIVS.map((c) => ({ ...c, gold: 20, science: 0, culture: 0, alive: true })),
        capitalOf: {}, events: [], end: null, endWhy: '',
        selected: -1, _anim: [],
    }
    generateMap(gs)
    const size = CFG.W * CFG.H
    for (let v = 0; v < CIVS.length; v++) {
        gs.fog[v] = new Uint8Array(size)      // 0 unseen, 1 seen(dull), 2 fresh
        gs.explored[v] = new Uint8Array(size)
        gs.visible[v] = new Uint8Array(size)
    }
    // starting land: largest connected walkable blob gets the capitals
    const seats = capitalSeats(gs)
    gs.civs.forEach((civ, i) => {
        const seat = seats[i] || nearestGoodLand(gs, CFG.W >> 1, CFG.H >> 1)
        spawnUnit(gs, civ.id, 'SETTLER', seat[0], seat[1])
        spawnUnit(gs, civ.id, 'WARRIOR', ...firstFreeNeighbor(gs, seat[0], seat[1]))
    })
    gs.civs.forEach((civ) => {
        const s = gs.units.find((u) => u.alive && u.civ === civ.id && u.kind === 'SETTLER')
        reveal(gs, civ.id, s.c, s.r, Math.max(CFG.sightWarrior, CFG.sightSettler))
    })
    // player auto-owns around capital later; nothing founded yet.
    gs.phase = 'player'
    gs.selected = gs.units.find((u) => u.civ === 0 && u.alive)?.id ?? -1
    gs.events = []
    return gs
}

function firstFreeNeighbor(gs, c, r) {
    for (const [nc, nr] of neighbors(c, r)) if (landFree(gs, nc, nr)) return [nc, nr]
    return [c, r]
}
function landFree(gs, c, r) { const tl = tileAt(gs, c, r); return tl && WALKABLE(tl.terr) && !unitAt(gs, c, r) }

function capitalSeats(gs) {
    // one seat per civ: spread the 4 civs over distinct fertile land clusters
    const rng = makeRng(gs.seed * 40503 + 7)
    const regions = [[CFG.W * 0.28, CFG.H * 0.36], [CFG.W * 0.70, CFG.H * 0.30], [CFG.W * 0.72, CFG.H * 0.70], [CFG.W * 0.30, CFG.H * 0.72]]
    return regions.map(([rx, ry]) => nearestGoodLand(gs, Math.round(rx + (rng() - 0.5) * 4), Math.round(ry + (rng() - 0.5) * 4)))
}
function nearestGoodLand(gs, c0, r0) {
    let best = null, bd = 1e9, bs = -Infinity
    for (let r = 1; r < CFG.H - 1; r++) for (let c = 1; c < CFG.W - 1; c++) {
        const tl = gs.tiles[idx(c, r)]
        if (!WALKABLE(tl.terr)) continue
        const d = hexDist([c, r], [c0, r0])
        let score = -d * 3 + (tl.terr === T.GRASS ? 3 : 0) + (tl.river ? 2 : 0) - (tl.terr === T.HILLS ? 1 : 0)
        // prefer a spot with several fertile neighbours (a real capital site)
        const good = neighbors(c, r).filter(([nc, nr]) => gs.tiles[idx(nc, nr)].terr === T.GRASS).length
        score += good * 1.5
        if (score > bs || (score === bs && d < bd)) { bs = score; bd = d; best = [c, r] }
    }
    return best || [Math.round(c0), Math.round(r0)]
}

let unitSeq = 1
function spawnUnit(gs, civ, kind, c, r) {
    const moves = kind === 'SETTLER' ? CFG.movesSettler : CFG.movesWarrior
    const u = { id: unitSeq++, civ, kind, c, r, moves, maxMoves: moves, path: [], anim: { px: 0, pz: 0, moving: false }, alive: true, fortified: false }
    gs.units.push(u)
    return u
}

// ------------------------------------------------------------------- yields --
export function tileYield(gs, i) {
    const tl = gs.tiles[i]
    const y = { ...BASE_YIELD[tl.terr] }
    if (tl.forest) y.p += 1
    if (tl.river) y.g += 1
    return y
}
export function cityWorkedTiles(gs, city) {
    // centre always worked; then pick the best (size-1) neighbours by food, then prod
    const ring = neighbors(city.c, city.r).map(([c, r]) => idx(c, r))
    const scored = ring.map((i) => ({ i, ...tileYield(gs, i) }))
    scored.sort((a, b) => (b.f - a.f) || (b.p - a.p))
    const want = Math.max(0, city.size - 1)
    return [idx(city.c, city.r), ...scored.slice(0, want).map((s) => s.i)]
}
export function cityYield(gs, city) {
    const out = { f: 0, p: 0, g: 0, sci: 0, cult: 0 }
    for (const i of cityWorkedTiles(gs, city)) {
        const y = tileYield(gs, i)
        out.f += y.f; out.p += y.p; out.g += y.g; out.sci += 1; out.cult += 1
    }
    const cy = idx(city.c, city.r)
    out.f += 2; out.p += 2; out.g += 1          // inherent city-centre yields
    if (gs.tiles[cy].river) out.cult += 1       // river city bonus
    out.sci += 1                                // palace-equivalent baseline
    return out
}
export function canFound(gs, civ, c, r, self) {
    const tl = tileAt(gs, c, r)
    if (!tl || !WALKABLE(tl.terr)) return 'water or mountain'
    if (unitAt(gs, c, r) && unitAt(gs, c, r) !== self) return 'occupied'
    if (tl.city >= 0) return 'already a city'
    for (const ct of gs.cities) if (ct.alive && hexDist([ct.c, ct.r], [c, r]) < CFG.minCitySpacing) return 'too close to a city'
    return true
}
function foundCity(gs, civ, c, r) {
    const tl = gs.tiles[idx(c, r)]
    const city = { id: gs.cities.length, civ, c, r, size: 1, storedFood: 0, alive: true, name: cityName(civ, gs.civs[civ].cities || 0), capital: (gs.civs[civ].cities || 0) === 0, culture: 0 }
    gs.cities.push(city)
    tl.city = city.id
    gs.civs[civ].cities = (gs.civs[civ].cities || 0) + 1
    gs.capitalOf[civ] = city.id
    gs.tiles[idx(c, r)].owner = civ
    spreadBorders(gs, civ)
    reveal(gs, civ, c, r, CFG.sightCity)
    gs.events.push({ type: 'found', civ, c, r, city: city.id, capital: city.capital })
    return city
}
function spreadBorders(gs, civ) {
    for (const city of gs.cities) {
        if (city.civ !== civ || !city.alive) continue
        const rad = CFG.cityRingWork + Math.min(2, Math.floor(city.culture || 0) / 40)
        for (let rr = city.r - rad; rr <= city.r + rad; rr++) for (let cc = city.c - rad; cc <= city.c + rad; cc++) {
            if (!inMap(cc, rr)) continue
            if (hexDist([cc, rr], [city.c, city.r]) > rad) continue
            const tl = gs.tiles[idx(cc, rr)]
            if (tl.owner < 0) tl.owner = civ
        }
    }
}
const NAMES = { 0: ['Roma', 'Neapolis', 'Capua', 'Tarentum'], 1: ['Thebes', 'Memphis', 'Heliopolis', 'Nubis'], 2: ['Luoyang', 'Linzi', 'Handan', 'Chengdu'], 3: ['Tenochtitlan', 'Texcoco', 'Tlacopan', 'Cholula'] }
function cityName(civ, n) { return (NAMES[civ] || ['City'])[n % 4] }

// ------------------------------------------------------------------ actions --
export function orderMove(gs, unit, tc, tr) {
    if (!unit || !unit.alive || unit.moves <= 0) return false
    const tl = tileAt(gs, tc, tr)
    if (!tl || !WALKABLE(tl.terr)) return false
    if (unitAt(gs, tc, tr)) return false
    const path = findPath(gs, unit, tc, tr)
    if (!path || path.length === 0) return false
    unit.path = path
    return true
}
// BFS shortest path over passable, unoccupied hexes (respecting unit.moves budget
// is cosmetic here; movement spends one move per hex during animation).
export function findPath(gs, unit, tc, tr) {
    const start = idx(unit.c, unit.r), goal = idx(tc, tr)
    if (start === goal) return []
    const prev = new Int32Array(CFG.W * CFG.H).fill(-2)
    prev[start] = -1
    const q = [[unit.c, unit.r]]
    while (q.length) {
        const [c, r] = q.shift()
        if (idx(c, r) === goal) break
        for (const [nc, nr] of neighbors(c, r)) {
            const ni = idx(nc, nr)
            if (prev[ni] !== -2) continue
            const tl = gs.tiles[ni]
            if (!WALKABLE(tl.terr)) continue
            if (unitAt(gs, nc, nr) && !(nc === tc && nr === tr)) continue
            prev[ni] = idx(c, r)
            q.push([nc, nr])
        }
    }
    if (prev[goal] === -2) return null
    const path = []
    let cur = goal
    while (cur !== -1 && cur !== start) { path.unshift([cur % CFG.W, (cur - (cur % CFG.W)) / CFG.W]); cur = prev[cur] }
    return path
}

export function tryFound(gs, unit) {
    if (!unit || unit.kind !== 'SETTLER' || !unit.alive) return false
    const why = canFound(gs, unit.civ, unit.c, unit.r, unit)
    if (why !== true) { gs.events.push({ type: 'deny', reason: why, c: unit.c, r: unit.r }); return false }
    foundCity(gs, unit.civ, unit.c, unit.r)
    unit.alive = false
    unit.moves = 0
    return true
}

// advance every unit's animation one tick: walk along its path spending moves.
function animateUnits(gs) {
    gs._anim = []
    for (const u of gs.units) {
        if (!u.alive) continue
        if (u.path && u.path.length) {
            u._p = (u._p || 0) + 1
            if (u._p >= 9) {
                u._p = 0
                if (u.moves <= 0) { u.path = []; continue }
                const [nc, nr] = u.path[0]
                if (unitAt(gs, nc, nr)) { u.path = []; continue }
                u._from = [u.c, u.r]
                u.c = nc; u.r = nr; u.moves--; u.path.shift()
                gs._anim.push({ id: u.id, civ: u.civ, kind: u.kind })
                if (u.civ === 0) reveal(gs, 0, nc, nr, u.kind === 'WARRIOR' ? CFG.sightWarrior : CFG.sightSettler)
            }
        }
    }
}

// end the player's visible unit moves: stop everyone, run AI, resolve cities.
function endPlayerTurn(gs) {
    for (const u of gs.units) { if (u.civ === 0) { u.path = []; u.fortified = u.moves <= 0 } }
    for (const civ of gs.civs) { if (!civ.player && civ.alive) aiTurn(gs, civ.id) }
    for (const civ of gs.civs) resolveCiv(gs, civ.id)
    gs.turn++
    gs.phase = 'player'
    for (const u of gs.units) if (u.alive) u.moves = u.maxMoves
    gs.selected = gs.units.find((u) => u.civ === 0 && u.alive)?.id ?? -1
    for (const civ of gs.civs) { clearVisible(gs, civ.id); const own = gs.units.filter((u) => u.civ === civ.id && u.alive)
        for (const u of own) reveal(gs, civ.id, u.c, u.r, u.kind === 'WARRIOR' ? CFG.sightWarrior : CFG.sightSettler)
        for (const ct of gs.cities) if (ct.civ === civ.id && ct.alive) reveal(gs, civ.id, ct.c, ct.r, CFG.sightCity) }
    checkEnd(gs)
}

function resolveCiv(gs, civ) {
    const C = gs.civs[civ]
    let fSur = 0, gold = 0, sci = 0, cult = 0, prod = 0
    for (const city of gs.cities) {
        if (city.civ !== civ || !city.alive) continue
        const y = cityYield(gs, city)
        fSur += y.f - city.size * 2            // each citizen eats 2
        gold += y.g; sci += y.sci; cult += y.cult; prod += y.p
        city.storedFood += y.f - city.size * 2
        const need = CFG.growBase + CFG.growStep * (city.size - 1)
        while (city.storedFood >= need && city.size < 9) { city.storedFood -= need; city.size++; city.culture = city.culture || 0; gs.events.push({ type: 'grow', civ, city: city.id, size: city.size }) }
        if (city.storedFood < 0) city.storedFood = 0
    }
    C.gold += gold; C.science += sci; C.culture += cult
    C.culture = (C.culture || 0) + cult
    spreadBorders(gs, civ)
    gs.events.push({ type: 'turnEnd', civ, gold, sci, cult, prod, fSur })
}

function checkEnd(gs) {
    const cap = gs.cities[gs.capitalOf[0]]
    if (cap && cap.alive && cap.size >= CFG.capitalSizeToWin) { gs.end = 'win'; gs.endWhy = `${cap.name} reached size ${cap.size}`; return }
    if (!gs.civs[0].alive || (gs.capitalOf[0] != null && !gs.cities[gs.capitalOf[0]].alive)) { gs.end = 'lose'; gs.endWhy = 'your capital has fallen'; return }
    if (gs.turn > CFG.turnLimit) { gs.end = 'lose'; gs.endWhy = `turn limit ${CFG.turnLimit} passed before size ${CFG.capitalSizeToWin}` }
}

// ------------------------------------------------------------------- AI turn --
// Each AI civ: settlers expand to good nearby land; after settling a city, it
// rebuilds a settler from production and keeps colonising. Warrior scouts.
function aiTurn(gs, civ) {
    const C = gs.civs[civ]
    // settlers found where they stand if legal, else hop toward fertile land
    for (const u of gs.units) {
        if (!u.alive || u.civ !== civ) continue
        u.moves = u.maxMoves
        if (u.kind === 'SETTLER') {
            // move a couple of hexes toward a good site, then found
            let tries = 0
            while (canFound(gs, civ, u.c, u.r, u) !== true && u.moves > 0 && tries++ < 4) {
                const step = bestExpandHex(gs, civ, u.c, u.r)
                if (!step) break
                u.c = step[0]; u.r = step[1]; u.moves--
            }
            if (canFound(gs, civ, u.c, u.r, u) === true) { tryFound(gs, u) }
        } else if (u.kind === 'WARRIOR') {
            const step = bestExpandHex(gs, civ, u.c, u.r)
            if (step) { u.c = step[0]; u.r = step[1] }
        }
    }
    // cities queue settlers: when production has banked enough, build a settler
    for (const city of gs.cities) {
        if (city.civ !== civ || !city.alive) continue
        city.queue = city.queue || []
        city.buildP = (city.buildP || 0) + cityYield(gs, city).p
        const cost = 14
        if (city.size >= 2 && C.gold >= 40 && (C.cities || 0) < 6) {
            city.buildP -= cost
            spawnUnit(gs, civ, 'SETTLER', city.c, firstFreeAround(gs, city.c, city.r))
            gs.events.push({ type: 'build', civ, city: city.id, unit: 'SETTLER' })
        }
    }
}
function firstFreeAround(gs, c, r) { for (const [nc, nr] of neighbors(c, r)) if (landFree(gs, nc, nr)) return [nc, nr]; return [c, r] }
function bestExpandHex(gs, civ, c, r) {
    let best = null, bs = -1e9
    for (const [nc, nr] of neighbors(c, r)) {
        if (!landFree(gs, nc, nr)) continue
        const tl = gs.tiles[idx(nc, nr)]
        let s = (tl.terr === T.GRASS ? 3 : tl.terr === T.PLAINS ? 2 : 0) + (tl.river ? 2 : 0) + (tl.forest ? 1 : 0)
        s -= hexDist([nc, nr], [c, r]) * 0.1
        if (s > bs) { bs = s; best = [nc, nr] }
    }
    return best
}

// --------------------------------------------------------------------- step --
export function step(gs, input = {}) {
    gs.tick++
    if (gs.end) return
    if (gs.phase !== 'player') { endPlayerTurn(gs); return }
    if (input.select != null) { const u = gs.units.find((x) => x.id === input.select && x.alive && x.civ === 0); if (u) gs.selected = u.id }
    const sel = gs.units.find((u) => u.id === gs.selected && u.alive && u.civ === 0) || null
    if (input.endTurn) { endPlayerTurn(gs); return }
    if (sel) {
        if (input.move) orderMove(gs, sel, input.move[0], input.move[1])
        if (input.found) { tryFound(gs, sel); gs.selected = gs.units.find((u) => u.civ === 0 && u.alive && u.kind === 'SETTLER')?.id ?? -1 }
    }
    animateUnits(gs)
}

export function stateHash(gs) {
    let h = gs.turn * 31 + gs.units.length
    for (const u of gs.units) h = (h * 33 + u.id * 7 + u.c * 3 + u.r + (u.alive ? 1 : 0) * 131) | 0
    for (const ct of gs.cities) h = (h * 33 + ct.size * 5 + ct.c + ct.r * 11 + (ct.alive ? 1 : 0)) | 0
    return (h >>> 0).toString(16)
}
