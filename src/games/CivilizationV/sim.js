// CIVILIZATION V — Stage 3 "The Tech Tree". Pure deterministic sim.
// No three, no DOM, no Math.random: this module is the single source of truth
// the Node harness (scripts/civcheck.mjs) and the in-browser autopilot import
// unchanged. Turn-based: the player orders units, presses END TURN, then each
// AI civ acts, barbarians roam from their camps, cities yield + grow +
// bombard, borders expand, the turn advances.
//
// The ruleset (Stage 2 scope, faithful to the 2010 original):
//   - hex map (odd-r pointy-top), varied terrain, one unit per land tile —
//     enforced in battle: a melee killer marches in, never two survivors/tile.
//   - fog of war: unseen=black, explored-but-unseen=dimmed memory.
//   - settlers found cities (>= 3 hex from any city, on passable land).
//   - cities work `size` tiles (centre always), produce food/production/gold/
//     science/culture, GROW on stored food surplus, and bombard one adjacent
//     enemy each turn. Walls at 0 => captured; last city lost => civ destroyed.
//   - combat: 100 HP units, deterministic effective-strength exchanges.
//     Modifiers: hills +25%, fortified +25%, city-tile support +50%,
//     attacking across a river -10%. Ranged (range 2) takes no retaliation.
//   - barbarian camps spawn roamers always at war; burning a camp stops it.
//   - cities bank production into queued units (WARRIOR/ARCHER/SETTLER).
//   - wounded units heal at rest (faster on home soil, faster still fortified).
//   - victories: founding milestone (capital size 4) or DOMINATION (every
//     rival capital captured). Loss: capital falls or the turn limit passes.
//     (Wonders and the other three victories are later stages.)
//   - Stage 3 adds the tech tree: city science is spent on a researchable tree
//     (12 techs across Ancient/Classical/Medieval, real Civ V prerequisites).
//     Techs gate units (ARCHER needs Archery, CATAPULT needs Engineering) and
//     apply era effects (Bronze +str, Horseback +move, Pottery/Agriculture
//     growth, Masonry walls, Currency/Writing/Philosophy yields). The AI
//     researches its own deterministic paths; barbarians stay timeless.

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
    cityBaseDef: 10,            // city defence strength 10 + 3*size
    cityHp: 100,
    cityStrike: 16,             // city bombardment damage vs adjacent units
    barbCap: 7, barbSpawn: 6, barbSeek: 6,   // global live-barbarian cap, spawn cadence, roam radius
    campCount: 3, campHp: 60,
    healHome: 12, healField: 5, healFortify: 8,
    warDeclareTurn: 12,         // rival AI may declare war from here
    warChance: 0.34,            // deterministic pseudo-odds per AI civ per turn
}

export const UNIT = {
    WARRIOR: { str: 8, moves: 2, sight: 2, range: 1, cost: 15 },
    ARCHER: { str: 11, moves: 2, sight: 2, range: 2, cost: 22, tech: 'ARCHERY' },
    SETTLER: { str: 0, moves: 2, sight: 2, range: 0, cost: 35 },
    CATAPULT: { str: 7, moves: 2, sight: 2, range: 2, cost: 45, tech: 'ENGINEERING' },
}

// ---- the tech tree (Stage 3) ---------------------------------------------------
// 12 real Civ V techs, real prerequisite edges, three eras. Costs rise by era
// so a frontier town tastes Ancient techs by ~turn 10 and Classical by ~20.
// `effect` is prose for the UI; the mechanic lives where it is applied
// (growth need, cityYield, doAttack, spawnUnit, applyLearn, resolveCiv).
export const TECH = {
    POTTERY: { name: 'Pottery', era: 0, cost: 24, prereq: [], effect: 'Granaries: -2 food per new citizen' },
    AGRICULTURE: { name: 'Agriculture', era: 0, cost: 24, prereq: [], effect: '+1 food on worked grassland' },
    ARCHERY: { name: 'Archery', era: 0, cost: 28, prereq: [], effect: 'unlocks the Archer' },
    THE_WHEEL: { name: 'The Wheel', era: 0, cost: 30, prereq: [], effect: '+1 production in every city' },
    BRONZE_WORKING: { name: 'Bronze Working', era: 0, cost: 32, prereq: [], effect: '+2 strength for warriors' },
    MASONRY: { name: 'Masonry', era: 0, cost: 34, prereq: [], effect: '+100 city walls' },
    WRITING: { name: 'Writing', era: 1, cost: 70, prereq: ['POTTERY'], effect: '+1 science in every city' },
    CURRENCY: { name: 'Currency', era: 1, cost: 75, prereq: ['BRONZE_WORKING'], effect: '+2 gold in every city' },
    HORSEBACK: { name: 'Horseback Riding', era: 1, cost: 80, prereq: ['THE_WHEEL'], effect: '+1 movement for military' },
    PHILOSOPHY: { name: 'Philosophy', era: 1, cost: 90, prereq: ['WRITING'], effect: '+1 culture in every city' },
    ENGINEERING: { name: 'Engineering', era: 1, cost: 100, prereq: ['THE_WHEEL', 'MASONRY'], effect: 'unlocks the Catapult (x2 vs cities)' },
    MATHEMATICS: { name: 'Mathematics', era: 2, cost: 150, prereq: ['PHILOSOPHY', 'ENGINEERING'], effect: '+4 city bombardment' },
}
export const TECH_IDS = Object.keys(TECH)
export const ERAS = ['ANCIENT', 'CLASSICAL', 'MEDIEVAL']

export const T = { OCEAN: 0, COAST: 1, GRASS: 2, PLAINS: 3, DESERT: 4, HILLS: 5, MOUNTAIN: 6 }
export const CIVS = [
    { id: 0, name: 'ROME', hex: '#b8412f', player: true },
    { id: 1, name: 'EGYPT', hex: '#c9a227', player: false },
    { id: 2, name: 'CHINA', hex: '#2f7fb8', player: false },
    { id: 3, name: 'AZTEC', hex: '#3f9e4f', player: false },
    { id: 4, name: 'BARBARIANS', hex: '#6b6b6b', player: false, barb: true },
]
export const BARB = 4

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

// ---- war relations -------------------------------------------------------------
export function atWar(gs, a, b) {
    if (a === b) return false
    if (a === BARB || b === BARB) return true
    return !!gs.wars[Math.min(a, b) + '-' + Math.max(a, b)]
}
export function declareWar(gs, a, b) {
    if (a === b) return
    const k = Math.min(a, b) + '-' + Math.max(a, b)
    if (!gs.wars[k]) { gs.wars[k] = true; gs.events.push({ type: 'war', a: Math.min(a, b), b: Math.max(a, b) }) }
}
export function tileBlocked(gs, c, r) {
    if (!inMap(c, r)) return true
    const ci = gs.tiles[idx(c, r)].camp
    return ci >= 0 && gs.camps[ci] && gs.camps[ci].alive
}

// ---- tech tree ---------------------------------------------------------------
export function hasTech(gs, civ, id) { return !!(gs.tech[civ] && gs.tech[civ].known[id]) }
export function availableTechs(gs, civ) {
    const R = gs.tech[civ]
    return TECH_IDS.filter((id) => !R.known[id] && TECH[id].prereq.every((p) => R.known[p]))
}
export function setResearch(gs, civ, id) {
    const R = gs.tech[civ]
    if (!id) return false
    if (R.known[id]) return false
    if (!TECH[id].prereq.every((p) => R.known[p])) return false
    R.research = id
    gs.events.push({ type: 'research', civ, id })
    return true
}
export function canQueue(gs, civ, kind) {
    const need = UNIT[kind] && UNIT[kind].tech
    return !need || hasTech(gs, civ, need)
}
function applyLearn(gs, civ, id) {
    if (id === 'BRONZE_WORKING') for (const u of gs.units) if (u.alive && u.civ === civ && u.kind === 'WARRIOR') u.str += 2
    if (id === 'HORSEBACK') for (const u of gs.units) if (u.alive && u.civ === civ && UNIT[u.kind].str > 0) { u.maxMoves += 1; u.moves += 1 }
    if (id === 'MASONRY') for (const ct of gs.cities) if (ct.alive && ct.civ === civ) { ct.wallMax = (ct.wallMax || CFG.cityHp) + 100 }
}

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
        owner: -1, city: -1, camp: -1,
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
    unitSeq = 1
    const gs = {
        seed: seed + scenario * 977, scenario, tick: 0, turn: 1, phase: 'player',
        tiles: [], units: [], cities: [], camps: [], wars: {},
        fog: [], explored: [], visible: [],
        civs: CIVS.map((c) => ({ ...c, gold: 20, science: 0, culture: 0, alive: true })),
        tech: CIVS.map(() => ({ known: {}, research: null, prog: 0 })),
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
    gs.civs.filter((c) => !c.barb).forEach((civ, i) => {
        const seat = seats[i] || nearestGoodLand(gs, CFG.W >> 1, CFG.H >> 1)
        spawnUnit(gs, civ.id, 'SETTLER', seat[0], seat[1])
        spawnUnit(gs, civ.id, 'WARRIOR', ...firstFreeNeighbor(gs, seat[0], seat[1]))
    })
    placeCamps(gs, seats)
    gs.civs.forEach((civ) => {
        const s = gs.units.find((u) => u.alive && u.civ === civ.id && u.kind === 'SETTLER')
        if (s) reveal(gs, civ.id, s.c, s.r, Math.max(CFG.sightWarrior, CFG.sightSettler))
    })
    // player auto-owns around capital later; nothing founded yet.
    gs.phase = 'player'
    gs.selected = gs.units.find((u) => u.civ === 0 && u.alive)?.id ?? -1
    gs.events = []
    return gs
}

function placeCamps(gs, seats) {
    // barbarian camps: walkable open land >= 4 hex from any capital seat,
    // >= 3 from starting units, spread >= 6 apart. Deterministic shuffle.
    const rng = makeRng(gs.seed * 7919 + 13)
    const cand = []
    for (let r = 1; r < CFG.H - 1; r++) for (let c = 1; c < CFG.W - 1; c++) {
        const tl = gs.tiles[idx(c, r)]
        if (!WALKABLE(tl.terr) || tl.river || tl.forest) continue
        if (seats.some((s) => hexDist(s, [c, r]) < 4)) continue
        if (gs.units.some((u) => u.alive && hexDist([u.c, u.r], [c, r]) < 3)) continue
        cand.push([c, r])
    }
    for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const tmp = cand[i]; cand[i] = cand[j]; cand[j] = tmp }
    const picked = []
    for (const p of cand) {
        if (picked.length >= CFG.campCount) break
        if (picked.every((q) => hexDist(q, p) >= 6)) picked.push(p)
    }
    for (const [c, r] of picked) {
        const camp = { id: gs.camps.length, c, r, hp: CFG.campHp, alive: true }
        gs.camps.push(camp)
        gs.tiles[idx(c, r)].camp = camp.id
    }
}

function firstFreeNeighbor(gs, c, r) {
    for (const [nc, nr] of neighbors(c, r)) if (landFree(gs, nc, nr)) return [nc, nr]
    return [c, r]
}
function landFree(gs, c, r) { const tl = tileAt(gs, c, r); return tl && WALKABLE(tl.terr) && !unitAt(gs, c, r) && !tileBlocked(gs, c, r) }

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
export function spawnUnit(gs, civ, kind, c, r, opts = {}) {
    const st = UNIT[kind]
    const str = opts.str != null ? opts.str : st.str + (kind === 'WARRIOR' && hasTech(gs, civ, 'BRONZE_WORKING') ? 2 : 0)
    const moves = st.moves + (st.str > 0 && hasTech(gs, civ, 'HORSEBACK') ? 1 : 0)
    const u = {
        id: unitSeq++, civ, kind, c, r,
        str, hp: 100, maxHp: 100,
        moves, maxMoves: moves,
        path: [], anim: { px: 0, pz: 0, moving: false },
        alive: true, fortified: false, acted: false,
    }
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
        if (gs.tiles[i].terr === T.GRASS && hasTech(gs, city.civ, 'AGRICULTURE')) y.f += 1
        out.f += y.f; out.p += y.p; out.g += y.g; out.sci += 1; out.cult += 1
    }
    const cy = idx(city.c, city.r)
    out.f += 2; out.p += 2; out.g += 1          // inherent city-centre yields
    if (gs.tiles[cy].river) out.cult += 1       // river city bonus
    out.sci += 1                                // palace-equivalent baseline
    if (hasTech(gs, city.civ, 'THE_WHEEL')) out.p += 1      // wheeled transport
    if (hasTech(gs, city.civ, 'CURRENCY')) out.g += 2        // markets
    if (hasTech(gs, city.civ, 'WRITING')) out.sci += 1      // scribes
    if (hasTech(gs, city.civ, 'PHILOSOPHY')) out.cult += 1  // academies
    return out
}
export function canFound(gs, civ, c, r, self) {
    const tl = tileAt(gs, c, r)
    if (!tl || !WALKABLE(tl.terr)) return 'water or mountain'
    if (unitAt(gs, c, r) && unitAt(gs, c, r) !== self) return 'occupied'
    if (tl.city >= 0) return 'already a city'
    if (tileBlocked(gs, c, r)) return 'barbarian camp'
    for (const ct of gs.cities) if (ct.alive && hexDist([ct.c, ct.r], [c, r]) < CFG.minCitySpacing) return 'too close to a city'
    return true
}
function foundCity(gs, civ, c, r) {
    const tl = gs.tiles[idx(c, r)]
    const city = { id: gs.cities.length, civ, c, r, size: 1, storedFood: 0, alive: true, name: cityName(civ, gs.civs[civ].cities || 0), capital: (gs.civs[civ].cities || 0) === 0, culture: 0, hp: CFG.cityHp, wallMax: CFG.cityHp, buildP: 0, queue: [] }
    gs.cities.push(city)
    tl.city = city.id
    gs.civs[civ].cities = (gs.civs[civ].cities || 0) + 1
    if (city.capital) gs.capitalOf[civ] = city.id
    tl.owner = civ
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
    if (tileBlocked(gs, tc, tr)) return false
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
            if (tl.camp >= 0 && gs.camps[tl.camp] && gs.camps[tl.camp].alive) continue
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

// ------------------------------------------------------------------- combat --
// Deterministic effective-strength exchanges — fidelity to Civ V's feel
// (HP, terrain, fortification, city walls, retaliation) without its dice.
export function defenseBonus(gs, u) {
    const tl = tileAt(gs, u.c, u.r)
    let b = 0
    if (tl.terr === T.HILLS) b += 0.25
    if (u.fortified) b += 0.25
    if (tl.city >= 0) b += 0.5
    return b
}
export function cityDefense(gs, city) { return CFG.cityBaseDef + 3 * city.size }

export function doAttack(gs, u, tc, tr) {
    if (!u || !u.alive || u.str <= 0 || u.moves <= 0) return false
    const d = hexDist([u.c, u.r], [tc, tr])
    const st = UNIT[u.kind]
    if (d < 1 || d > Math.max(1, st.range)) return false
    if (!inMap(tc, tr)) return false
    const ti = idx(tc, tr)
    const tl = gs.tiles[ti]
    const ranged = d >= 2
    const ox = u.c, oy = u.r, ociv = u.civ
    const target = unitAt(gs, tc, tr)
    if (target && target.alive && atWar(gs, u.civ, target.civ)) {
        let strikes = 0
        while (strikes++ < 4) {
            const atkEff = u.str * (0.5 + 0.5 * u.hp / u.maxHp) * (tl.river ? 0.9 : 1)
            const defEff = target.str * (0.5 + 0.5 * target.hp / target.maxHp) * (1 + defenseBonus(gs, target))
            target.hp -= Math.max(4, Math.round(34 * atkEff / (atkEff + defEff)))
            if (target.hp <= 0) {
                target.hp = 0; target.alive = false; target.moves = 0; target.path = []
                gs.events.push({ type: 'kill', civ: u.civ, kind: u.kind, victim: target.civ, victimKind: target.kind, at: [tc, tr], ranged })
                if (!ranged && u.alive) { u.c = tc; u.r = tr }        // march in — one unit per tile holds
                if (u.alive && u.civ === 0) reveal(gs, 0, tc, tr, st.sight)
                break
            }
            if (!ranged) u.hp -= Math.max(2, Math.round(30 * defEff / (atkEff + defEff)))
            if (u.hp <= 0) {
                u.hp = 0; u.alive = false; u.path = []
                gs.events.push({ type: 'kill', civ: target.civ, kind: target.kind, victim: u.civ, victimKind: u.kind, at: [u.c, u.r], ranged: false })
                break
            }
        }
        u.moves = 0; u.acted = true; u.fortified = false
        gs.events.push({ type: 'strike', civ: ociv, kind: u.kind, from: [ox, oy], to: [tc, tr], ranged })
        if (target.civ > 0 && target.civ < BARB && u.civ < BARB) declareWar(gs, u.civ, target.civ)
        return true
    }
    const cityI = tl.city
    if (cityI >= 0 && gs.cities[cityI].alive && atWar(gs, u.civ, gs.cities[cityI].civ)) {
        const city = gs.cities[cityI]
        const wallMax = city.wallMax || CFG.cityHp
        let strikes = 0
        while (strikes++ < 4) {
            const atkEff = u.str * (0.5 + 0.5 * u.hp / u.maxHp) * (u.kind === 'CATAPULT' ? 2 : 1)
            const defEff = cityDefense(gs, city) * (0.5 + 0.5 * city.hp / wallMax)
            city.hp -= Math.max(3, Math.round(26 * atkEff / (atkEff + defEff)))
            gs.events.push({ type: 'siege', civ: u.civ, city: city.id, at: [tc, tr] })
            if (city.hp <= 0) { captureCity(gs, city, u.civ); break }
            if (!ranged) u.hp -= Math.max(2, Math.round(22 * defEff / (atkEff + defEff)))
            if (u.hp <= 0) {
                u.hp = 0; u.alive = false; u.path = []
                gs.events.push({ type: 'kill', civ: city.civ, kind: 'CITY', victim: u.civ, victimKind: u.kind, at: [u.c, u.r], ranged: false })
                break
            }
        }
        u.moves = 0; u.acted = true
        gs.events.push({ type: 'strike', civ: ociv, kind: u.kind, from: [ox, oy], to: [tc, tr], ranged })
        if (city.civ < BARB && u.civ < BARB) declareWar(gs, u.civ, city.civ)
        return true
    }
    const ci = tl.camp
    if (ci >= 0 && gs.camps[ci] && gs.camps[ci].alive) {
        const camp = gs.camps[ci]
        camp.hp -= Math.max(15, Math.round(30 * (0.5 + 0.5 * u.hp / u.maxHp)))
        gs.events.push({ type: 'raid', civ: u.civ, at: [tc, tr] })
        if (camp.hp <= 0) {
            camp.alive = false
            if (u.civ < BARB) { gs.civs[u.civ].gold += 12; gs.events.push({ type: 'campRazed', civ: u.civ, c: tc, r: tr }) }
        }
        u.moves = 0; u.acted = true
        return true
    }
    return false
}

function captureCity(gs, city, civ) {
    const old = city.civ
    city.civ = civ
    city.wallMax = city.wallMax || CFG.cityHp
    city.hp = Math.floor(city.wallMax * 0.6)
    city.size = Math.max(1, Math.floor(city.size / 2))
    city.storedFood = 0; city.buildP = 0; city.queue = []
    for (const [nc, nr] of neighbors(city.c, city.r)) {
        const tl = gs.tiles[idx(nc, nr)]
        if (tl.owner === old) tl.owner = civ
    }
    gs.tiles[idx(city.c, city.r)].owner = civ
    gs.events.push({ type: 'capture', city: city.id, civ, old, capital: city.capital })
    declareWar(gs, civ, old)
    if (civ < BARB) reveal(gs, civ, city.c, city.r, CFG.sightCity)
    checkCivDeath(gs)
}

function checkCivDeath(gs) {
    for (const civ of gs.civs) {
        if (civ.barb || !civ.alive) continue
        if (!gs.cities.some((c) => c.alive && c.civ === civ.id)) { civ.alive = false; gs.events.push({ type: 'civDead', civ: civ.id }) }
    }
}

export function stepToward(gs, u, tgt) {
    let best = null, bd = hexDist([u.c, u.r], tgt)
    for (const [nc, nr] of neighbors(u.c, u.r)) {
        if (!landFree(gs, nc, nr)) continue
        const d = hexDist([nc, nr], tgt)
        if (d < bd) { bd = d; best = [nc, nr] }
    }
    return best
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
                u.c = nc; u.r = nr; u.moves--; u.path.shift(); u.acted = true
                gs._anim.push({ id: u.id, civ: u.civ, kind: u.kind })
                if (u.civ === 0) reveal(gs, 0, nc, nr, u.kind === 'WARRIOR' ? CFG.sightWarrior : CFG.sightSettler)
            }
        }
    }
}

// end the player's visible unit moves: stop everyone, run AI, run barbarians,
// resolve cities (economy, production, bombardment), heal the unwounded,
// advance the turn.
function endPlayerTurn(gs) {
    for (const u of gs.units) { if (u.civ === 0 && u.alive) { u.path = []; u.fortified = !u.acted } }
    for (const civ of gs.civs) { if (!civ.player && !civ.barb && civ.alive) aiTurn(gs, civ.id) }
    barbarianTurn(gs)
    for (const civ of gs.civs) if (!civ.barb) resolveCiv(gs, civ.id)
    gs.turn++
    gs.phase = 'player'
    for (const u of gs.units) {
        if (!u.alive) continue
        if (!u.acted) {
            const home = inMap(u.c, u.r) && gs.tiles[idx(u.c, u.r)].owner === u.civ
            const h = (home ? CFG.healHome : CFG.healField) + (u.fortified && home ? CFG.healFortify : 0)
            u.hp = Math.min(u.maxHp, u.hp + h)
        }
        u.acted = false
        u.moves = u.maxMoves
        if (u.civ !== 0) u.fortified = false
    }
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
        const need = CFG.growBase + CFG.growStep * (city.size - 1) - (hasTech(gs, civ, 'POTTERY') ? 2 : 0)
        while (city.storedFood >= need && city.size < 9) { city.storedFood -= need; city.size++; city.culture = city.culture || 0; gs.events.push({ type: 'grow', civ, city: city.id, size: city.size }) }
        if (city.storedFood < 0) city.storedFood = 0
        // production queue: bank shields, deliver units when the cost is met
        city.buildP = (city.buildP || 0) + y.p
        city.queue = city.queue || []
        while (city.queue.length) {
            const kind = city.queue[0], cost = UNIT[kind].cost
            if (city.buildP < cost) break
            const at = landFree(gs, city.c, city.r) ? [city.c, city.r] : firstFreeAround(gs, city.c, city.r)
            if (unitAt(gs, at[0], at[1]) || !landFree(gs, at[0], at[1])) break   // no room: points keep banking
            city.buildP -= cost; city.queue.shift()
            spawnUnit(gs, civ, kind, at[0], at[1])
            gs.events.push({ type: 'build', civ, city: city.id, unit: kind })
        }
        // city bombardment: one adjacent enemy unit per turn, weakest first
        let victim = null, vh = 1e9
        for (const [nc, nr] of neighbors(city.c, city.r)) {
            const en = unitAt(gs, nc, nr)
            if (en && en.alive && atWar(gs, civ, en.civ) && en.hp < vh) { vh = en.hp; victim = en }
        }
        if (victim) {
            const strike = CFG.cityStrike + (hasTech(gs, civ, 'MATHEMATICS') ? 4 : 0)
            victim.hp -= Math.max(6, Math.round(strike * (0.5 + 0.5 * city.hp / (city.wallMax || CFG.cityHp))))
            gs.events.push({ type: 'cityStrike', civ, city: city.id, at: [victim.c, victim.r] })
            if (victim.hp <= 0) {
                victim.alive = false; victim.hp = 0; victim.path = []
                gs.events.push({ type: 'kill', civ, kind: 'CITY', victim: victim.civ, victimKind: victim.kind, at: [victim.c, victim.r] })
            }
        }
    }
    C.gold += gold; C.science += sci; C.culture += cult
    C.culture = (C.culture || 0) + cult
    // research: spend this turn's science on the current tech (overflow carries)
    const R = gs.tech[civ]
    if (!R.research) { const av = availableTechs(gs, civ); if (av.length) R.research = av[0] }
    if (R.research) {
        R.prog += sci
        const t = TECH[R.research]
        if (R.prog >= t.cost) {
            R.prog -= t.cost
            R.known[R.research] = true
            gs.events.push({ type: 'tech', civ, id: R.research })
            applyLearn(gs, civ, R.research)
            R.research = null
        }
    }
    spreadBorders(gs, civ)
    gs.events.push({ type: 'turnEnd', civ, gold, sci, cult, prod, fSur })
}

function checkEnd(gs) {
    if (gs.civs[0].alive && gs.civs.every((c) => c.barb || c.player || !c.alive)) {
        gs.end = 'win'; gs.endWhy = 'Domination — every rival capital flies your colours'; return
    }
    const cap = gs.capitalOf[0] != null ? gs.cities[gs.capitalOf[0]] : null
    if (cap && cap.alive && cap.civ === 0 && cap.size >= CFG.capitalSizeToWin) { gs.end = 'win'; gs.endWhy = `${cap.name} reached size ${cap.size}`; return }
    if (!gs.civs[0].alive || (gs.capitalOf[0] != null && gs.cities[gs.capitalOf[0]].civ !== 0)) { gs.end = 'lose'; gs.endWhy = 'your capital has fallen'; return }
    if (gs.turn > CFG.turnLimit) { gs.end = 'lose'; gs.endWhy = `turn limit ${CFG.turnLimit} passed before size ${CFG.capitalSizeToWin}` }
}

// ------------------------------------------------------------------- AI turn --
// Each AI civ: settlers expand to good nearby land; warriors/archers seek
// enemies and (once strong) capitals when at war; cities queue settlers and,
// in wartime, military units. From CFG.warDeclareTurn a healthy rival may
// declare war on you on a deterministic pseudo-roll.
function findTarget(gs, civ, u, radius) {
    let best = null, bs = 1e9
    for (const x of gs.units) {
        if (!x.alive || !atWar(gs, civ, x.civ)) continue
        const d = hexDist([u.c, u.r], [x.c, x.r])
        if (d <= radius && d < bs) { bs = d; best = [x.c, x.r] }
    }
    for (const ct of gs.cities) {
        if (!ct.alive || !atWar(gs, civ, ct.civ)) continue
        const d = hexDist([u.c, u.r], [ct.c, ct.r])
        if (d <= radius && d * 1.6 < bs) { bs = d * 1.6; best = [ct.c, ct.r] }
    }
    if (civ !== BARB) for (const cp of gs.camps) {
        if (!cp.alive) continue
        const d = hexDist([u.c, u.r], [cp.c, cp.r])
        if (d <= radius && d * 1.25 < bs) { bs = d * 1.25; best = [cp.c, cp.r] }
    }
    return best
}

const AI_TECH_ORDER = ['ARCHERY', 'BRONZE_WORKING', 'THE_WHEEL', 'POTTERY', 'AGRICULTURE', 'MASONRY', 'CURRENCY', 'WRITING', 'HORSEBACK', 'PHILOSOPHY', 'ENGINEERING', 'MATHEMATICS']

function aiTurn(gs, civ) {
    const C = gs.civs[civ]
    const warring = gs.civs.some((x) => !x.barb && x.id !== civ && x.alive && atWar(gs, civ, x.id))
    if (!warring && gs.turn >= CFG.warDeclareTurn) {
        const power = gs.units.filter((u) => u.alive && u.civ === civ && u.str > 0).length
        const cities = gs.cities.filter((c) => c.alive && c.civ === civ).length
        if (power + cities >= 5 && hash2(civ, gs.turn, gs.seed ^ 0x9e37) < CFG.warChance) declareWar(gs, civ, 0)
    }
    // settlers expand; military units fight or scout
    for (const u of gs.units) {
        if (!u.alive || u.civ !== civ) continue
        u.moves = u.maxMoves
        if (u.kind === 'SETTLER') {
            let tries = 0
            while (canFound(gs, civ, u.c, u.r, u) !== true && u.moves > 0 && tries++ < 4) {
                const step = bestExpandHex(gs, civ, u.c, u.r)
                if (!step) break
                u.c = step[0]; u.r = step[1]; u.moves--; u.acted = true
            }
            if (canFound(gs, civ, u.c, u.r, u) === true) tryFound(gs, u)
        } else if (u.str > 0) {
            const tgt = findTarget(gs, civ, u, warring ? 7 : 3)
            if (tgt) {
                const st = UNIT[u.kind]
                let guard = 0
                while (u.moves > 0 && guard++ < 3) {
                    const d = hexDist([u.c, u.r], tgt)
                    if (d <= Math.max(1, st.range)) { doAttack(gs, u, tgt[0], tgt[1]); break }
                    const step = stepToward(gs, u, tgt)
                    if (!step) break
                    u.c = step[0]; u.r = step[1]; u.moves--; u.acted = true
                }
            } else {
                const step = bestExpandHex(gs, civ, u.c, u.r)
                if (step) { u.c = step[0]; u.r = step[1]; u.acted = true }
            }
        }
    }
    // city production choices (points are banked/delivered in resolveCiv)
    // research: a stable per-civ priority path, rotated so rivals diverge
    const R = gs.tech[civ]
    if (!R.research) {
        const av = availableTechs(gs, civ)
        const rot = (civ * 5) % AI_TECH_ORDER.length
        for (let k = 0; k < AI_TECH_ORDER.length; k++) {
            const id = AI_TECH_ORDER[(rot + k) % AI_TECH_ORDER.length]
            if (av.includes(id)) { setResearch(gs, civ, id); break }
        }
    }
    for (const city of gs.cities) {
        if (city.civ !== civ || !city.alive) continue
        city.queue = city.queue || []
        if (city.queue.length >= 3) continue
        const wantSettler = city.size >= 2 && C.gold >= 40 && (C.cities || 0) < 6
        if (wantSettler && !city.queue.includes('SETTLER')) city.queue.push('SETTLER')
        else if (warring && city.queue.filter((k) => k !== 'SETTLER').length < 2) {
            if (hasTech(gs, civ, 'ENGINEERING') && hash2(city.id, gs.turn, civ ^ 11) < 0.3) city.queue.push('CATAPULT')
            else if (canQueue(gs, civ, 'ARCHER') && hash2(city.id, gs.turn, civ) < 0.5) city.queue.push('ARCHER')
            else city.queue.push('WARRIOR')
        }
    }
}

// ---------------------------------------------------------- barbarian turn --
// Camps spew warriors on CFG.barbSpawn turns (global cap barbCap); roamers
// seek the nearest soft target — a unit, or a border city — and throw
// themselves at it. Always at war with everyone.
function barbarianTurn(gs) {
    const barbs = gs.units.filter((u) => u.alive && u.civ === BARB)
    if (gs.turn % CFG.barbSpawn === 0) {
        for (const camp of gs.camps) {
            if (!camp.alive || barbs.length >= CFG.barbCap) continue
            const spot = firstFreeAround(gs, camp.c, camp.r)
            if (unitAt(gs, spot[0], spot[1])) continue
            if (tileBlocked(gs, spot[0], spot[1]) && !(spot[0] === camp.c && spot[1] === camp.r)) continue
            const nb = spawnUnit(gs, BARB, 'WARRIOR', spot[0], spot[1], { str: 7 })
            gs.events.push({ type: 'barbSpawn', c: spot[0], r: spot[1] })
            barbs.push(nb)
        }
    }
    for (const u of barbs) {
        if (!u.alive) continue
        u.moves = u.maxMoves
        const tgt = findTarget(gs, BARB, u, CFG.barbSeek)
        if (!tgt) continue
        let guard = 0
        while (u.moves > 0 && guard++ < 3) {
            const d = hexDist([u.c, u.r], tgt)
            if (d <= 1) { doAttack(gs, u, tgt[0], tgt[1]); break }
            const step = stepToward(gs, u, tgt)
            if (!step) break
            u.c = step[0]; u.r = step[1]; u.moves--; u.acted = true
        }
        if (u.alive && hexDist([u.c, u.r], tgt) <= 1) doAttack(gs, u, tgt[0], tgt[1])
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
    if (input.research) setResearch(gs, 0, input.research)
    if (input.queue && UNIT[input.queue]) {
        const need = UNIT[input.queue].tech
        if (need && !hasTech(gs, 0, need)) { gs.events.push({ type: 'deny', reason: 'requires ' + TECH[need].name, c: -1, r: -1 }) }
        else {
            const city = input.city != null ? gs.cities[input.city] : gs.cities.find((c) => c.civ === 0 && c.alive)
            if (city && city.alive && city.civ === 0 && city.queue.length < 3) { city.queue.push(input.queue); gs.events.push({ type: 'queued', civ: 0, unit: input.queue }) }
        }
    }
    if (sel) {
        if (input.move) orderMove(gs, sel, input.move[0], input.move[1])
        if (input.attack) doAttack(gs, sel, input.attack[0], input.attack[1])
        if (input.found) { tryFound(gs, sel); gs.selected = gs.units.find((u) => u.civ === 0 && u.alive && u.kind === 'SETTLER')?.id ?? gs.units.find((u) => u.civ === 0 && u.alive)?.id ?? -1 }
    }
    animateUnits(gs)
}

export function stateHash(gs) {
    const KC = { SETTLER: 1, WARRIOR: 2, ARCHER: 3, CATAPULT: 4 }
    let h = gs.turn * 31 + gs.units.length
    for (const u of gs.units) h = (h * 33 + (KC[u.kind] || 9) * 7 + u.c * 3 + u.r + (u.alive ? 1 : 0) * 131 + u.hp * 977 + u.civ * 53) | 0
    for (const ct of gs.cities) h = (h * 33 + ct.size * 5 + ct.c + ct.r * 11 + (ct.alive ? 1 : 0) + ct.hp * 31 + ct.civ * 71) | 0
    for (const cp of gs.camps) h = (h * 33 + cp.c + cp.r * 13 + (cp.alive ? 1 : 0) * 173) | 0
    h = (h * 33 + Object.keys(gs.wars).length * 613) | 0
    for (const civ of [0, 1, 2, 3]) {
        const R = gs.tech[civ]
        let m = 0
        for (let i = 0; i < TECH_IDS.length; i++) if (R.known[TECH_IDS[i]]) m |= 1 << i
        h = (h * 33 + m * 7 + (R.research ? TECH_IDS.indexOf(R.research) + 1 : 0) * 13 + Math.floor(R.prog) * 3) | 0
    }
    return (h >>> 0).toString(16)
}
