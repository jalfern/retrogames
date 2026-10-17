// CIVILIZATION V — Stage 7 "The World". Pure deterministic sim.
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
//   - Stage 4 adds the land itself: WORKER civilians build improvements on your
//     tiles (Farm needs Pottery, Mine needs Masonry, Road needs The Wheel) and
//     each job takes real turns; barbarians pillage whatever they walk over.
//     Luxury resources (Wine/Gems/Silver/Dyes/Incense/Spices) sit on fitting
//     terrain and pay +1 gold +1 culture per connected unique type; strategic
//     resources (Horses, Iron) reveal themselves only with their era's tech and
//     gate two original units — the Chariot Archer (Wheel+Horses) and the
//     Legion (Bronze+Iron). A resource counts when it is inside your borders
//     and road-connected to (or adjacent to) one of your cities; roads also
//     halve movement cost on your network.
//   - Stage 5 adds the realm's two ledgers: cities bank culture and borders
//     creep outward ring by ring (40/120), and happiness (palace +2, luxury +1,
//     city −1, war −2) swings growth, gold and city defence; culture points buy
//     social policies from three real branches, adopted in branch order.
//   - Stage 6 adds the marvels: six real wonders (Pyramids, Stonehenge, Hanging
//     Gardens, Great Library, Colossus, Great Wall) are queued in a city like a
//     unit and paid in shields — the first civ to finish one takes it forever
//     and rivals' in-progress copies are torn out of their queues. Cities also
//     bank great-person points (engineer/scientist/merchant; palace +1 engineer,
//     each connected luxury +1 merchant). At threshold a great person can be
//     bought with gold and spent: the engineer finishes a city's current build,
//     the scientist finishes the current research, the merchant trades +200g.
//   - Stage 7 adds the world beyond your border: two neutral CITY-STATES (Tyre,
//     Venice) wait on the coast — discover them with a unit, gift gold for
//     influence, and at 60 influence an ALLIANCE pays a pension every turn.
//     DIPLOMACY between majors is a real ledger: declare war, make peace (peace
//     erases war-weariness from the happiness ledger), and after three honest
//     turns of peace a TRADE AGREEMENT signs, paying both crowns every turn.
//     NAVAL units: the Trireme (Bronze Working) is built only by cities that
//     touch the sea, sails Coast/Ocean only, and raids coastal cities and
//     ships; adjacent land units can board it. City-states can be taken by
//     siege — the sack pays tribute, allies lose the pension.
//   - Stage 8 closes the circle with LATER ERAS and REAL VICTORIES. Nine techs
//     carry the lab from the RENAISSANCE (Education, Banking, Gunpowder) through
//     the INDUSTRIAL age (Steam Power, Astronomy, Railroad) into the MODERN
//     (Industrialization, Electricity, Spaceflight), each with real era effects.
//     Three victories end the game: DOMINATION (every rival capital), SCIENCE
//     (Spaceflight unlocks THE ARK — every beaker after it banks toward launch)
//     and CULTURE (lifetime culture past the threshold, strictly ahead of every
//     living rival). The arcade milestone (capital size N) remains as the
//     golden-age win. The Musket (Gunpowder) and the Galleon (Astronomy — the
//     age of sail storms ports, unlike the Trireme) answer the new era. A rival
//     completing any of the three first loses the world the other way.

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
    luxGold: 1, luxCult: 1,     // per unique connected luxury type, empire-wide
    ironProd: 1, horseFood: 1,  // per city sitting on connected iron / horses
    border2: 40, border3: 120,  // city culture needed to claim ring 2 / ring 3
    palaceHappy: 2, cityUnhappy: 1, warWeariness: 2,   // the happiness ledger
    happyGrowth: 0.25, happyGold: 0.1, angryDef: 0.75, // happy bonuses / angry penalty
    gpThreshold: 8, gpStep: 5,           // points needed for a great person, rising per acquisition
    gpCost: 30, gpCostStep: 25,        // gold to recruit, rising per acquisition
    merchantGold: 200,                  // a Great Merchant's trade mission
    gpPalace: 1, gpLux: 1,            // extra engineer points at the palace, merchant points per luxury
    stoneCult: 2, librarySci: 2, gardenFood: 1, colossusGold: 1, wallDefMult: 1.5,   // wonder effects
    csGift: 25, csInfl: 30, csAlly: 60, csTribute: 40,    // city-state courts: gift cost, influence per gift, alliance threshold, sack tribute
    tradeGold: 3, peaceCool: 3,                             // gold per signed trade pact per turn; turns peace must hold before trade
    arkScience: 70, cultureWin: 350,       // Stage 8 victories: beakers banked into the Ark after Spaceflight; lifetime culture that must lead every rival
}

export const UNIT = {
    WARRIOR: { str: 8, moves: 2, sight: 2, range: 1, cost: 15 },
    ARCHER: { str: 11, moves: 2, sight: 2, range: 2, cost: 22, tech: 'ARCHERY' },
    SETTLER: { str: 0, moves: 2, sight: 2, range: 0, cost: 35 },
    CATAPULT: { str: 7, moves: 2, sight: 2, range: 2, cost: 45, tech: 'ENGINEERING' },
    WORKER: { str: 0, moves: 2, sight: 2, range: 0, cost: 20 },
    // Stage 4: units of the original gated by a strategic resource you must
    // actually own and connect, not just research.
    CHARIOT: { str: 9, moves: 3, sight: 2, range: 2, cost: 32, tech: 'THE_WHEEL', res: 'HORSES' },
    LEGION: { str: 12, moves: 2, sight: 2, range: 1, cost: 38, tech: 'BRONZE_WORKING', res: 'IRON' },
    // Stage 7: the Trireme — Bronze Working; a ship of the coastal waters.
    GALLEY: { str: 10, moves: 3, sight: 3, range: 1, cost: 30, tech: 'BRONZE_WORKING', naval: true },
    // Stage 8: the age of gunpowder and sail. The Musket is the line infantry
    // of the new era; the Galleon is the first ship bold enough to storm ports.
    // Polish pass: the Galleon is also the convoy hull — the age of sail carries
    // two land units in its hold (the Trireme stays a pure raider).
    MUSKET: { str: 15, moves: 2, sight: 2, range: 1, cost: 45, tech: 'GUNPOWDER' },
    GALLEON: { str: 14, moves: 4, sight: 3, range: 1, cost: 48, tech: 'ASTRONOMY', naval: true, ports: true, cargo: 2 },
}

// ---- the tech tree (Stage 3, grown through Stage 8) ----------------------------
// Real Civ V techs with real prerequisite edges across six eras. Costs rise by
// era but stay tuned to this arcade's 40-turn clock: the science path from
// Pottery to Spaceflight plus the Ark's beakers is provably bankable by turn
// ~38 (civcheck §32), where the original would need centuries.
// `effect` is prose for the UI; the mechanic lives where it is applied
// (growth need, cityYield, doAttack, spawnUnit, applyLearn, resolveCiv, checkEnd).
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
    // Stage 8 — Renaissance, Industrial, Modern
    EDUCATION: { name: 'Education', era: 3, cost: 25, prereq: ['WRITING'], effect: '+2 science in every city' },
    BANKING: { name: 'Banking', era: 3, cost: 35, prereq: ['CURRENCY'], effect: '+2 gold in every city' },
    GUNPOWDER: { name: 'Gunpowder', era: 3, cost: 45, prereq: ['PHILOSOPHY'], effect: 'unlocks the Musket' },
    STEAM_POWER: { name: 'Steam Power', era: 4, cost: 40, prereq: ['EDUCATION'], effect: '+2 production in every city' },
    ASTRONOMY: { name: 'Astronomy', era: 4, cost: 35, prereq: ['EDUCATION'], effect: 'unlocks the Galleon — the age of sail storms ports' },
    RAILROAD: { name: 'Railroad', era: 4, cost: 50, prereq: ['STEAM_POWER', 'THE_WHEEL'], effect: 'roads are free to move on' },
    INDUSTRIALIZATION: { name: 'Industrialization', era: 5, cost: 45, prereq: ['STEAM_POWER'], effect: '+3 production in every city' },
    ELECTRICITY: { name: 'Electricity', era: 5, cost: 50, prereq: ['INDUSTRIALIZATION'], effect: '+2 science +1 gold in every city' },
    SPACEFLIGHT: { name: 'Spaceflight', era: 5, cost: 55, prereq: ['ELECTRICITY', 'ASTRONOMY'], effect: 'unlocks THE ARK — bank 70 science to launch' },
}
export const TECH_IDS = Object.keys(TECH)
export const ERAS = ['ANCIENT', 'CLASSICAL', 'MEDIEVAL', 'RENAISSANCE', 'INDUSTRIAL', 'MODERN']

export const T = { OCEAN: 0, COAST: 1, GRASS: 2, PLAINS: 3, DESERT: 4, HILLS: 5, MOUNTAIN: 6 }
// ---- the world beyond the border (Stage 7) --------------------------------------
// Two neutral city-states sit on the coast from turn 1. Discover one with a
// unit, gift gold for influence, and at CFG.csAlly an alliance pays pensions
// every turn. They can be taken by siege (the sack pays tribute) — and allies
// lose the pension when their city falls.
export const CIVS = [
    { id: 0, name: 'ROME', hex: '#b8412f', player: true },
    { id: 1, name: 'EGYPT', hex: '#c9a227', player: false },
    { id: 2, name: 'CHINA', hex: '#2f7fb8', player: false },
    { id: 3, name: 'AZTEC', hex: '#3f9e4f', player: false },
    { id: 4, name: 'BARBARIANS', hex: '#6b6b6b', player: false, barb: true },
    { id: 5, name: 'TYRE', hex: '#c084d8', cs: true, allyGold: 2, allyDesc: '+2 gold every turn' },
    { id: 6, name: 'VENICE', hex: '#7fd4c1', cs: true, allySci: 1, allyCult: 1, allyDesc: '+1 science +1 culture every turn' },
]
export const BARB = 4
export const CS0 = 5
export const CS_IDS = [5, 6]
export const isCS = (id) => id >= CS0

// ---- improvements (Stage 4) -----------------------------------------------------
// Civ V build order: Pottery opens the Farm, Masonry the Mine, The Wheel the
// Road. Each job takes the worker real turns on the tile.
export const IMP = {
    FARM: { name: 'Farm', tech: 'POTTERY', turns: 2, terr: [T.GRASS, T.PLAINS] },
    MINE: { name: 'Mine', tech: 'MASONRY', turns: 2, terr: [T.HILLS] },
    ROAD: { name: 'Road', tech: 'THE_WHEEL', turns: 1, terr: null },
}
export const IMP_IDS = ['FARM', 'MINE', 'ROAD']

// ---- resources (Stage 4) --------------------------------------------------------
// Luxury types pay empire-wide when connected; strategic ones reveal themselves
// only once the era's tech is known and gate the units that need them.
export const RES = {
    WINE: { name: 'Wine', lux: true, terr: [T.HILLS], color: 0xa8447f },
    GEMS: { name: 'Gems', lux: true, terr: [T.HILLS], color: 0x53d6d0 },
    SILVER: { name: 'Silver', lux: true, terr: [T.HILLS], color: 0xcfd6e2 },
    DYES: { name: 'Dyes', lux: true, terr: [T.GRASS], forest: true, color: 0xd060b8 },
    INCENSE: { name: 'Incense', lux: true, terr: [T.DESERT], color: 0xe8c884 },
    SPICES: { name: 'Spices', lux: true, terr: [T.DESERT], color: 0xe08a3c },
    HORSES: { name: 'Horses', lux: false, strategic: true, tech: 'HORSEBACK', terr: [T.PLAINS], color: 0x9a6a3a },
    IRON: { name: 'Iron', lux: false, strategic: true, tech: 'BRONZE_WORKING', terr: [T.HILLS], color: 0x8f9aa8 },
}
export const RES_IDS = Object.keys(RES)

// ---- social policies (Stage 5) ---------------------------------------------------
// Three real Civ V policy branches, each trimmed to two of its real policies,
// adopted in branch order and paid for with culture points from the empire
// pool (as in the original, culture buys policies). Effects are the real
// policies' numbers, simplified: no tech gate, no policy unlock chains beyond
// branch order (full Civ V trees are the later-stage refinement).
export const POLICY = {
    FOUNDATIONS: { branch: 'TRADITION', i: 0, name: 'Foundations of the State', cost: 15, effect: '+3 culture in every city' },
    CEREMONY: { branch: 'TRADITION', i: 1, name: 'Ceremony', cost: 40, effect: '+1 happiness per connected luxury' },
    COLONIAL: { branch: 'LIBERTY', i: 0, name: 'Colonial Offices', cost: 15, effect: 'settlers cost 25 less' },
    COLLEGE: { branch: 'LIBERTY', i: 1, name: 'National College', cost: 40, effect: '+1 science in every city' },
    TRADING_POSTS: { branch: 'COMMERCE', i: 0, name: 'Trading Posts', cost: 15, effect: '+1 gold in every city' },
    TREATIES: { branch: 'COMMERCE', i: 1, name: 'Treaties', cost: 40, effect: 'war weariness halved' },
}
export const POLICY_IDS = ['FOUNDATIONS', 'CEREMONY', 'COLONIAL', 'COLLEGE', 'TRADING_POSTS', 'TREATIES']
export const BRANCHES = ['TRADITION', 'LIBERTY', 'COMMERCE']

// ---- wonders (Stage 6) ---------------------------------------------------------
// Six real Civ V wonders gated by real (in-tree) techs. A wonder is queued in a
// city like a unit and paid in accumulated production; the first civ to finish
// takes it for the whole game — everyone else's half-built copy is abandoned.
// Effects are the real wonders' mechanics, simplified to this sim's levers.
export const WONDER = {
    PYRAMIDS: { name: 'Pyramids', tech: 'THE_WHEEL', cost: 45, effect: 'workers finish improvements one turn sooner' },
    STONEHENGE: { name: 'Stonehenge', tech: 'POTTERY', cost: 18, effect: '+2 culture in every city' },
    HANGING_GARDENS: { name: 'Hanging Gardens', tech: 'AGRICULTURE', cost: 60, effect: '+1 food on every worked farm' },
    GREAT_LIBRARY: { name: 'Great Library', tech: 'WRITING', cost: 65, effect: '+2 science in every city' },
    COLOSSUS: { name: 'Colossus', tech: 'BRONZE_WORKING', cost: 55, effect: '+1 gold per connected luxury' },
    GREAT_WALL: { name: 'Great Wall', tech: 'MASONRY', cost: 50, effect: '+50% city defence' },
}
export const WONDER_IDS = Object.keys(WONDER)

// ---- great people (Stage 6) ----------------------------------------------------
// Every city banks one point per type each turn; the palace seats an extra
// engineer and each connected luxury sends a merchant. When a pool crosses the
// threshold the great person can be recruited for gold (price and threshold
// climb with every acquisition, as Civ V's costs escalate) and spent once.
export const GP_TYPES = ['ENGINEER', 'SCIENTIST', 'MERCHANT']
export const GP = {
    ENGINEER: { name: 'Great Engineer', icon: '⚙', effect: 'complete a city\u0027s current build at once' },
    SCIENTIST: { name: 'Great Scientist', icon: '🔭', effect: 'complete the current research at once' },
    MERCHANT: { name: 'Great Merchant', icon: '⚖', effect: 'open a trade mission: +200 gold' },
}

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
const SEA_OK = (t) => t === T.OCEAN || t === T.COAST   // the trireme's domain
const domainOK = (u, t) => (u && u.naval ? SEA_OK(t) : WALKABLE(t))

// ---- war relations -------------------------------------------------------------
export function atWar(gs, a, b) {
    if (a === b) return false
    if (a === BARB || b === BARB) return true
    return !!gs.wars[Math.min(a, b) + '-' + Math.max(a, b)]
}
export function declareWar(gs, a, b, by) {
    if (a === b) return
    const k = Math.min(a, b) + '-' + Math.max(a, b)
    if (!gs.wars[k]) { gs.wars[k] = true; delete gs.trade[k]; gs.peaceTurn[k] = null; gs.events.push({ type: 'war', a: Math.min(a, b), b: Math.max(a, b), by: by == null ? b : by }) }
}

// ---- diplomacy (Stage 7) --------------------------------------------------------
// One law per rule: panel, harness and AI all pass through these gates.
export function canDeclareWar(gs, a, b) {
    if (a === b) return 'cannot war yourself'
    if (a === BARB || b === BARB) return 'barbarians need no declaration'
    if (!gs.civs[b] || !gs.civs[b].alive) return 'they are already gone'
    if (atWar(gs, a, b)) return 'already at war'
    const pt = gs.peaceTurn[Math.min(a, b) + '-' + Math.max(a, b)]
    if (pt != null && gs.turn - pt < CFG.peaceCool) return `truce holds ${CFG.peaceCool - (gs.turn - pt)} more turn${CFG.peaceCool - (gs.turn - pt) === 1 ? '' : 's'}`
    return true
}
export function canMakePeace(gs, a, b) {
    if (a === BARB || b === BARB) return 'no truce with barbarians'
    if (!atWar(gs, a, b)) return 'not at war'
    return true
}
export function makePeace(gs, a, b) {
    const why = canMakePeace(gs, a, b)
    if (why !== true) { if (a === 0 || b === 0) gs.events.push({ type: 'deny', reason: why, c: -1, r: -1 }); return false }
    const k = Math.min(a, b) + '-' + Math.max(a, b)
    delete gs.wars[k]
    gs.peaceTurn[k] = gs.turn
    gs.events.push({ type: 'peace', a: Math.min(a, b), b: Math.max(a, b) })
    return true
}
export function canTrade(gs, a, b) {
    if (a === b || a >= CS0 || b >= CS0) return 'trade pacts are between empires'
    if (!gs.civs[a].alive || !gs.civs[b].alive) return 'they are already gone'
    if (atWar(gs, a, b)) return 'you are at war with them'
    const k = Math.min(a, b) + '-' + Math.max(a, b)
    if (gs.trade[k]) return 'a trade agreement is already signed'
    const pt = gs.peaceTurn[k]
    if (pt != null && gs.turn - pt < CFG.peaceCool) return `peace must hold ${CFG.peaceCool} turns first (${CFG.peaceCool - (gs.turn - pt)} to go)`
    return true
}
export function makeTrade(gs, a, b) {
    const why = canTrade(gs, a, b)
    if (why !== true) { if (a === 0 || b === 0) gs.events.push({ type: 'deny', reason: why, c: -1, r: -1 }); return false }
    gs.trade[Math.min(a, b) + '-' + Math.max(a, b)] = true
    gs.events.push({ type: 'trade', a: Math.min(a, b), b: Math.max(a, b) })
    return true
}

// ---- city-states (Stage 7) ------------------------------------------------------
export function cityStates(gs) { return CIVS.filter((c) => c.cs && gs.civs[c.id].alive) }
export function csInfo(gs, civ, csId) { return gs.cs[civ][csId] || null }
export function canGift(gs, civ, csId) {
    if (!isCS(csId)) return 'not a city-state'
    if (!gs.civs[csId].alive) return 'their city has fallen'
    const info = gs.cs[civ][csId]
    if (!info || !info.met) return 'you have not met their envoys'
    if (info.ally) return 'already your ally'
    if (gs.civs[civ].gold < CFG.csGift) return 'not enough gold'
    return true
}
export function giftCS(gs, civ, csId) {
    const why = canGift(gs, civ, csId)
    if (why !== true) { if (civ === 0) gs.events.push({ type: 'deny', reason: why, c: -1, r: -1 }); return false }
    gs.civs[civ].gold -= CFG.csGift
    const info = gs.cs[civ][csId]
    info.influence += CFG.csInfl
    gs.events.push({ type: 'csGift', civ, cs: csId, influence: info.influence })
    if (!info.ally && info.influence >= CFG.csAlly) {
        info.ally = true
        gs.events.push({ type: 'csAlly', civ, cs: csId })
    }
    return true
}
// A unit that reaches a city-state's home hex (or next to it) discovers it.
function sweepMeetings(gs) {
    for (const cs of CIVS) {
        if (!cs.cs || !gs.civs[cs.id].alive) continue
        const home = gs.cities.find((c) => c.alive && c.civ === cs.id)
        if (!home) continue
        for (const u of gs.units) {
            if (!u.alive || u.loaded || u.civ >= CS0) continue
            if (hexDist([u.c, u.r], [home.c, home.r]) > 1) continue
            const info = gs.cs[u.civ][cs.id] || (gs.cs[u.civ][cs.id] = { met: false, influence: 0, ally: false })
            if (!info.met) {
                info.met = true
                reveal(gs, u.civ, home.c, home.r, CFG.sightCity)
                gs.events.push({ type: 'csMeet', civ: u.civ, cs: cs.id, c: home.c, r: home.r })
            }
        }
    }
}

// ---- naval domain (Stage 7) -----------------------------------------------------
export function isWater(gs, c, r) { const tl = tileAt(gs, c, r); return !!tl && SEA_OK(tl.terr) }
export function coastalTile(gs, c, r) {
    const tl = tileAt(gs, c, r)
    if (!tl || !WALKABLE(tl.terr)) return false
    return neighbors(c, r).some(([nc, nr]) => isWater(gs, nc, nr))
}
export function coastalCityOf(gs, civ) {
    return gs.cities.find((ct) => ct.alive && ct.civ === civ && coastalTile(gs, ct.c, ct.r)) || null
}
function firstFreeSea(gs, c, r) {
    for (const [nc, nr] of neighbors(c, r)) if (isWater(gs, nc, nr) && !unitAt(gs, nc, nr)) return [nc, nr]
    return null
}
export function tileBlocked(gs, c, r) {
    if (!inMap(c, r)) return true
    const ci = gs.tiles[idx(c, r)].camp
    return ci >= 0 && gs.camps[ci] && gs.camps[ci].alive
}

// ---- transports (polish pass: embark, land, amphibious assault) ---------------
// Faithful to the 2010 original's convoy laws, scaled to this world: the
// Galleon carries two land units. Embarking ends the soldier's move; landing
// onto an enemy beach fights the landing right there; a sunk hull takes its
// cargo to the bottom. Enemy ports still refuse the longboat — land beside
// the fort and besiege by land.
export function transportFor(gs, unit) {
    return gs.units.find((s) => s.alive && !s.loaded && s.naval && s.civ === unit.civ
        && (UNIT[s.kind].cargo || 0) > 0 && s.cargo.length < UNIT[s.kind].cargo
        && hexDist([s.c, s.r], [unit.c, unit.r]) === 1) || null
}
export function canEmbark(gs, unit) {
    if (!unit || !unit.alive || unit.loaded) return 'no unit to embark'
    if (unit.naval) return 'ships do not board ships'
    if (unit.busy != null) return 'worker already working'
    if (!transportFor(gs, unit)) return 'no friendly galleon alongside'
    return true
}
export function embark(gs, unit) {
    const why = canEmbark(gs, unit)
    if (why !== true) { if (unit && unit.civ === 0) gs.events.push({ type: 'deny', reason: why, c: unit.c, r: unit.r }); return false }
    const ship = transportFor(gs, unit)
    ship.cargo.push(unit.id)
    unit.loaded = ship.id
    unit.moves = 0; unit.acted = true; unit.path = []
    gs.events.push({ type: 'embark', civ: unit.civ, kind: unit.kind, ship: ship.id, at: [unit.c, unit.r] })
    return true
}
export function canLand(gs, ship, tc, tr) {
    if (!ship || !ship.alive || !ship.naval) return 'no ship'
    if (!(UNIT[ship.kind] && UNIT[ship.kind].cargo > 0)) return 'this hull carries nothing'
    if (!ship.cargo.length) return 'the hold is empty'
    if (!inMap(tc, tr)) return 'out of reach'
    const tl = gs.tiles[idx(tc, tr)]
    if (!WALKABLE(tl.terr)) return 'transports land on beaches, not open water'
    if (hexDist([ship.c, ship.r], [tc, tr]) !== 1) return 'the ship must lie offshore'
    if (tileBlocked(gs, tc, tr)) return 'a barbarian camp bars the beach'
    const cityI = tl.city
    if (cityI >= 0 && gs.cities[cityI].alive && gs.cities[cityI].civ !== ship.civ) return 'fort ports refuse the longboat'
    const occ = unitAt(gs, tc, tr)
    if (occ && occ.civ === ship.civ) return 'friendly troops hold the sand'
    if (occ && !atWar(gs, ship.civ, occ.civ)) return 'foreign troops bar the beach'
    if (occ) {
        const first = gs.units.find((x) => x.id === ship.cargo[0])
        if (first && first.str <= 0) return 'defenders need soldiers to storm a beach'
    }
    return true
}
export function land(gs, ship, tc, tr) {
    const why = canLand(gs, ship, tc, tr)
    if (why !== true) { if (ship && ship.civ === 0) gs.events.push({ type: 'deny', reason: why, c: tc, r: tr }); return false }
    const def = unitAt(gs, tc, tr)
    const uid = ship.cargo.shift()
    const u = gs.units.find((x) => x.id === uid && x.alive)
    if (!u) return ship.cargo.length ? land(gs, ship, tc, tr) : false
    const ociv = u.civ
    ship.moves = 0; ship.acted = true
    if (def && def.alive && atWar(gs, ociv, def.civ)) {
        // the amphibious assault: the beach fight settles in place — win and
        // the beachhead is yours, lose and the squad is lost, the ship floats
        let strikes = 0, took = false
        while (strikes++ < 4) {
            const atkEff = u.str * (0.5 + 0.5 * u.hp / u.maxHp) * 0.9
            const defEff = def.str * (0.5 + 0.5 * def.hp / def.maxHp) * (1 + defenseBonus(gs, def))
            def.hp -= Math.max(4, Math.round(34 * atkEff / (atkEff + defEff)))
            if (def.hp <= 0) {
                def.hp = 0; def.alive = false; def.moves = 0; def.path = []
                gs.events.push({ type: 'kill', civ: ociv, kind: u.kind, victim: def.civ, victimKind: def.kind, at: [tc, tr], ranged: false })
                took = true
                break
            }
            u.hp -= Math.max(2, Math.round(30 * defEff / (atkEff + defEff)))
            if (u.hp <= 0) break
        }
        gs.events.push({ type: 'strike', civ: ociv, kind: u.kind, from: [ship.c, ship.r], to: [tc, tr], ranged: false, landing: true })
        if (def.civ > 0 && def.civ !== BARB && ociv < BARB) declareWar(gs, ociv, def.civ)
        if (u.hp <= 0) {
            u.hp = 0; u.alive = false; u.path = []; u.loaded = null
            gs.events.push({ type: 'kill', civ: def.civ, kind: def.kind, victim: ociv, victimKind: u.kind, at: [tc, tr], ranged: false })
            return true
        }
        gs.events.push({ type: 'beachhead', civ: ociv, kind: u.kind, at: [tc, tr], took })
        if (!took) { ship.cargo.unshift(uid); return true }   // repelled — the squad rows back aboard
    }
    u.loaded = null
    u.c = tc; u.r = tr
    u.moves = 0; u.acted = true; u.path = []
    gs.events.push({ type: 'land', civ: ociv, kind: u.kind, at: [tc, tr] })
    if (ociv === 0) reveal(gs, 0, tc, tr, UNIT[u.kind].sight)
    return true
}
function drownCargo(gs, ship) {
    if (!ship.cargo || !ship.cargo.length) return
    for (const cid of ship.cargo) {
        const cu = gs.units.find((x) => x.id === cid)
        if (cu && cu.alive) {
            cu.alive = false; cu.hp = 0; cu.path = []; cu.loaded = null
            gs.events.push({ type: 'drown', civ: cu.civ, kind: cu.kind, at: [ship.c, ship.r] })
        }
    }
    ship.cargo = []
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
    const st = UNIT[kind]
    if (!st) return !!WONDER[kind] && canBuildWonder(gs, civ, kind) === true
    if (st.tech && !hasTech(gs, civ, st.tech)) return false
    if (st.res && !connectedResources(gs, civ).includes(st.res)) return false
    if (st.naval && !coastalCityOf(gs, civ)) return false
    return true
}
function applyLearn(gs, civ, id) {
    if (id === 'BRONZE_WORKING') for (const u of gs.units) if (u.alive && u.civ === civ && u.kind === 'WARRIOR') u.str += 2
    if (id === 'HORSEBACK') for (const u of gs.units) if (u.alive && u.civ === civ && UNIT[u.kind].str > 0) { u.maxMoves += 1; u.moves += 1 }
    if (id === 'MASONRY') for (const ct of gs.cities) if (ct.alive && ct.civ === civ) { ct.wallMax = (ct.wallMax || CFG.cityHp) + 100 }
}
export function grantTech(gs, civ, id) {   // test/cheat path: learn instantly
    const R = gs.tech[civ]
    if (R.known[id]) return false
    R.known[id] = true
    if (R.research === id) { R.research = null; R.prog = 0 }
    gs.events.push({ type: 'tech', civ, id })
    applyLearn(gs, civ, id)
    return true
}

// ---- land: improvements, resources, connectivity (Stage 4) ----------------------
export function tileOwnedBy(gs, civ, tl) {
    return tl.owner === civ || (tl.city >= 0 && gs.cities[tl.city] && gs.cities[tl.city].alive && gs.cities[tl.city].civ === civ)
}
export function canImprove(gs, civ, unit, kind) {
    const imp = IMP[kind]
    if (!imp) return 'unknown improvement'
    if (!unit || unit.kind !== 'WORKER' || !unit.alive) return 'needs a worker'
    if (unit.busy != null) return 'worker already working'
    const tl = tileAt(gs, unit.c, unit.r)
    if (!tl || !WALKABLE(tl.terr)) return 'cannot build here'
    if (tl.city >= 0) return 'cannot improve the city centre'
    if (kind === 'ROAD') { if (tl.road) return 'already a road' }
    else {
        if (tl.imp) return 'already improved'
        if (!imp.terr.includes(tl.terr)) return `${imp.name.toLowerCase()} needs different ground`
    }
    if (imp.tech && !hasTech(gs, civ, imp.tech)) return 'requires ' + TECH[imp.tech].name
    if (!tileOwnedBy(gs, civ, tl)) return 'outside your borders'
    return true
}
export function startImprove(gs, unit, kind) {
    const why = canImprove(gs, unit.civ, unit, kind)
    if (why !== true) { if (unit.civ === 0) gs.events.push({ type: 'deny', reason: why, c: unit.c, r: unit.r }); return false }
    const tl = gs.tiles[idx(unit.c, unit.r)]
    const impTurns = Math.max(1, IMP[kind].turns - (gs.wonders && gs.wonders.PYRAMIDS === unit.civ ? 1 : 0))
    tl.build = { kind, civ: unit.civ, left: impTurns, by: unit.id }
    unit.busy = idx(unit.c, unit.r)
    unit.moves = 0; unit.acted = true
    gs.events.push({ type: 'improveStart', civ: unit.civ, c: unit.c, r: unit.r, kind })
    return true
}
function advanceBuilds(gs) {
    for (const tl of gs.tiles) {
        const b = tl.build
        if (!b) continue
        const w = gs.units.find((u) => u.id === b.by)
        if (!w || !w.alive || w.c !== tl.c || w.r !== tl.r) { tl.build = null; if (w && !w.alive) w.busy = null; continue }
        b.left--
        if (b.left <= 0) {
            if (b.kind === 'ROAD') tl.road = true
            else tl.imp = b.kind
            tl.build = null
            w.busy = null
            gs.events.push({ type: 'improved', civ: b.civ, c: tl.c, r: tl.r, kind: b.kind })
        }
    }
}
// Contiguous network of owned-or-road tiles touching this civ's cities; a
// resource inside it counts, as Civ V's land connection demands.
export function resourceNetwork(gs, civ) {
    const seen = new Set()
    const q = []
    for (const ct of gs.cities) if (ct.alive && ct.civ === civ) { const i = idx(ct.c, ct.r); seen.add(i); q.push(i) }
    while (q.length) {
        const i = q.pop()
        const c = i % CFG.W, r = (i - (i % CFG.W)) / CFG.W
        for (const [nc, nr] of neighbors(c, r)) {
            const ni = idx(nc, nr)
            if (seen.has(ni)) continue
            const tl = gs.tiles[ni]
            if (!WALKABLE(tl.terr)) continue
            if (tl.owner === civ || tl.road) { seen.add(ni); q.push(ni) }
        }
    }
    return seen
}
export function connectedResources(gs, civ, net) {
    const N = net || resourceNetwork(gs, civ)
    const out = []
    for (const i of N) {
        const tl = gs.tiles[i]
        if (tl.res < 0) continue
        const id = RES_IDS[tl.res]
        if (!out.includes(id)) out.push(id)
    }
    return out
}
export function resRevealed(gs, civ, i) {
    const tl = gs.tiles[i]
    if (tl.res < 0 || !gs.explored[civ][i]) return false
    const spec = RES[RES_IDS[tl.res]]
    return !spec.strategic || hasTech(gs, civ, spec.tech)
}
export function roadCost(gs, u, c, r) {
    const tl = tileAt(gs, c, r)
    if (!tl || !tl.road) return 1
    return hasTech(gs, u.civ, 'RAILROAD') ? 0 : 0.5   // Stage 8: the rail age travels free
}
export function queueDeny(gs, civ, kind) {
    const st = UNIT[kind]
    if (!st) {
        if (WONDER[kind]) { const w = canBuildWonder(gs, civ, kind); return w === true ? null : w }
        return null
    }
    if (st.tech && !hasTech(gs, civ, st.tech)) return 'requires ' + TECH[st.tech].name
    if (st.res && !connectedResources(gs, civ).includes(st.res)) return 'requires ' + RES[st.res].name
    if (st.naval && !coastalCityOf(gs, civ)) return 'needs a coastal city'
    return null
}

// ---- happiness + policies (Stage 5) -----------------------------------------------
export function hasPolicy(gs, civ, id) { return !!(gs.policies[civ] && gs.policies[civ][id]) }
export function happinessOf(gs, civ) {
    if (civ == null || civ >= BARB) return { net: 0, happy: false, unhappy: false, lux: 0, cities: 0, wars: 0, weary: 0 }
    let lux = 0
    for (const id of connectedResources(gs, civ)) if (RES[id].lux) lux++
    const cities = gs.cities.filter((c) => c.alive && c.civ === civ).length
    const palace = gs.cities.some((c) => c.alive && c.civ === civ && c.capital) ? CFG.palaceHappy : 0
    let wars = 0
    for (const x of [0, 1, 2, 3]) if (x !== civ && gs.civs[x].alive && atWar(gs, civ, x)) wars++
    const weary = hasPolicy(gs, civ, 'TREATIES') ? Math.ceil(wars * CFG.warWeariness / 2) : wars * CFG.warWeariness
    const net = palace + lux + (hasPolicy(gs, civ, 'CEREMONY') ? lux : 0) - CFG.cityUnhappy * cities - weary
    return { net, happy: net >= 1, unhappy: net < 0, lux, cities, wars, weary }
}
export function unitCost(gs, civ, kind) {
    const c = UNIT[kind] ? UNIT[kind].cost : 0
    return kind === 'SETTLER' && hasPolicy(gs, civ, 'COLONIAL') ? Math.max(10, c - 25) : c
}
export function canAdopt(gs, civ, id) {
    const p = POLICY[id]
    if (!p) return 'unknown policy'
    const P = gs.policies[civ]
    if (P[id]) return 'already adopted'
    if (p.i > 0) {
        const prev = POLICY_IDS.find((x) => POLICY[x].branch === p.branch && POLICY[x].i === p.i - 1)
        if (!P[prev]) return 'requires ' + POLICY[prev].name
    }
    if (gs.civs[civ].culture < p.cost) return 'not enough culture'
    return true
}
export function adoptPolicy(gs, civ, id) {
    const why = canAdopt(gs, civ, id)
    if (why !== true) { if (civ === 0) gs.events.push({ type: 'deny', reason: why, c: -1, r: -1 }); return false }
    gs.civs[civ].culture -= POLICY[id].cost
    gs.policies[civ][id] = true
    gs.events.push({ type: 'policy', civ, id })
    return true
}

// ---- wonders + great people (Stage 6) ---------------------------------------------
export function hasWonder(gs, civ, id) { return gs.wonders[id] === civ }
export function canBuildWonder(gs, civ, id) {
    const w = WONDER[id]
    if (!w) return 'unknown wonder'
    if (gs.wonders[id] != null) return gs.wonders[id] === civ ? 'already yours' : `${w.name} was built by ${CIVS[gs.wonders[id]].name}`
    if (!hasTech(gs, civ, w.tech)) return 'requires ' + TECH[w.tech].name
    return true
}
export function gpThreshold(gs, civ, t) { return CFG.gpThreshold + CFG.gpStep * gs.gp[civ].bought[t] }
export function gpCost(gs, civ, t) { return CFG.gpCost + CFG.gpCostStep * gs.gp[civ].bought[t] }
export function gpReady(gs, civ, t) { return gs.gp[civ].pts[t] >= gpThreshold(gs, civ, t) }
export function gpHeld(gs, civ, t) { return gs.gp[civ].held[t] }
export function canRecruit(gs, civ, t) {
    if (!GP[t]) return 'unknown type'
    if (!gpReady(gs, civ, t)) return 'not enough great person points'
    if (gs.civs[civ].gold < gpCost(gs, civ, t)) return 'not enough gold'
    return true
}
export function recruitGP(gs, civ, t) {
    const why = canRecruit(gs, civ, t)
    if (why !== true) { if (civ === 0) gs.events.push({ type: 'deny', reason: why, c: -1, r: -1 }); return false }
    gs.civs[civ].gold -= gpCost(gs, civ, t)
    gs.gp[civ].pts[t] = 0
    gs.gp[civ].ready[t] = false
    gs.gp[civ].held[t] += 1
    gs.gp[civ].bought[t] += 1
    gs.events.push({ type: 'gpAcquired', civ, kind: t, cost: gpCost(gs, civ, t) })
    return true
}
export function canUseGP(gs, civ, t, cityId) {
    if (!GP[t]) return 'unknown type'
    if (gs.gp[civ].held[t] <= 0) return 'no ' + GP[t].name.toLowerCase() + ' yet'
    if (t === 'ENGINEER') {
        const city = cityId != null ? gs.cities[cityId] : gs.cities.find((c) => c.alive && c.civ === civ)
        if (!city || !city.alive || city.civ !== civ) return 'no city of yours there'
        if (!city.queue || !city.queue.length) return 'nothing is under construction there'
    }
    if (t === 'SCIENTIST' && !gs.tech[civ].research) return 'choose something to research first'
    return true
}
export function spendGP(gs, civ, t, cityId) {
    const why = canUseGP(gs, civ, t, cityId)
    if (why !== true) { if (civ === 0) gs.events.push({ type: 'deny', reason: why, c: -1, r: -1 }); return false }
    gs.gp[civ].held[t] -= 1
    if (t === 'MERCHANT') {
        gs.civs[civ].gold += CFG.merchantGold
        gs.events.push({ type: 'gpUsed', civ, kind: t, gold: CFG.merchantGold })
        return true
    }
    if (t === 'SCIENTIST') {
        const R = gs.tech[civ]
        const id = R.research
        R.prog = 0; R.research = null
        R.known[id] = true
        gs.events.push({ type: 'tech', civ, id, instant: true })
        applyLearn(gs, civ, id)
        gs.events.push({ type: 'gpUsed', civ, kind: t, tech: id })
        return true
    }
    const city = cityId != null ? gs.cities[cityId] : gs.cities.find((c) => c.alive && c.civ === civ)
    const kind = city.queue[0]
    const cost = WONDER[kind] ? WONDER[kind].cost : unitCost(gs, civ, kind)
    city.buildP = Math.max(city.buildP || 0, cost)
    pumpCityQueue(gs, city)
    gs.events.push({ type: 'gpUsed', civ, kind: t, city: city.id })
    return true
}

// ---- odd-r hex geometry -------------------------------------------------------
const ODD_R_NEIGH = [
    [[+1, 0], [0, -1], [-1, -1], [-1, 0], [-1, +1], [0, +1]],   // even row
    [[+1, 0], [0, -1], [+1, -1], [-1, 0], [0, +1], [+1, +1]],   // odd row (shifted right, matches hexToWorld + cube distance)
]
export function neighbors(col, row) {
    const tbl = ODD_R_NEIGH[((row & 1) === 1 ? 1 : 0)]
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
        owner: -1, city: -1, camp: -1, res: -1, imp: null, road: false, build: null,
    }))
    placeResources(gs)
}

// ---- Stage 4: scatter resources on fitting terrain, spread apart --------------
const RES_TARGET = { WINE: 2, GEMS: 2, SILVER: 2, DYES: 2, INCENSE: 2, SPICES: 2, HORSES: 3, IRON: 4 }
function placeResources(gs) {
    const rng = makeRng(gs.seed * 9701 + 41)
    const placed = []
    for (const id of RES_IDS) {
        const spec = RES[id]
        const cand = gs.tiles.filter((tl) => spec.terr.includes(tl.terr) && (!spec.forest || tl.forest) && !tl.river && tl.camp < 0)
        for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const tmp = cand[i]; cand[i] = cand[j]; cand[j] = tmp }
        let n = 0
        for (const tl of cand) {
            if (n >= RES_TARGET[id]) break
            if (placed.some((p) => hexDist([p.c, p.r], [tl.c, tl.r]) < 3)) continue
            tl.res = RES_IDS.indexOf(id)
            placed.push(tl)
            n++
        }
    }
}

// ---------------------------------------------------------------- fog/units --
export function tileAt(gs, c, r) { return inMap(c, r) ? gs.tiles[idx(c, r)] : null }
export function unitAt(gs, c, r) { return gs.units.find((u) => u.alive && !u.loaded && u.c === c && u.r === r) || null }
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
        civs: CIVS.map((c) => ({ ...c, gold: 20, science: 0, culture: 0, cultureEarned: 0, happyNet: 0, alive: true })),
        tech: CIVS.map(() => ({ known: {}, research: null, prog: 0 })),
        policies: CIVS.map(() => ({})),
        resKnown: CIVS.map(() => ({})),
        wonders: {},
        cs: CIVS.map(() => ({})),
        trade: {}, peaceTurn: {},
        ark: CIVS.map(() => 0),
        gp: CIVS.map(() => ({ pts: { ENGINEER: 0, SCIENTIST: 0, MERCHANT: 0 }, held: { ENGINEER: 0, SCIENTIST: 0, MERCHANT: 0 }, ready: { ENGINEER: false, SCIENTIST: false, MERCHANT: false }, bought: { ENGINEER: 0, SCIENTIST: 0, MERCHANT: 0 } })),
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
    gs.civs.filter((c) => !c.barb && !c.cs).forEach((civ, i) => {
        const seat = seats[i] || nearestGoodLand(gs, CFG.W >> 1, CFG.H >> 1)
        spawnUnit(gs, civ.id, 'SETTLER', seat[0], seat[1])
        spawnUnit(gs, civ.id, 'WARRIOR', ...firstFreeNeighbor(gs, seat[0], seat[1]))
    })
    placeCamps(gs, seats)
    placeCityStates(gs, seats)
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

// Stage 7: the city-states. Tyre and Venice are founded before the first turn
// on coastal land — clear of capital seats, camps and each other — and their
// home hexes stay hidden until an empire's unit reaches them.
function placeCityStates(gs, seats) {
    const rng = makeRng(gs.seed * 6151 + 17)
    const cand = []
    for (let r = 1; r < CFG.H - 1; r++) for (let c = 1; c < CFG.W - 1; c++) {
        const tl = gs.tiles[idx(c, r)]
        if (!WALKABLE(tl.terr) || tl.river || tl.camp >= 0 || unitAt(gs, c, r)) continue
        if (!neighbors(c, r).some(([nc, nr]) => isWater(gs, nc, nr))) continue
        if (seats.some((s) => hexDist(s, [c, r]) < 4)) continue
        if (gs.camps.some((cp) => cp.alive && hexDist([cp.c, cp.r], [c, r]) < 3)) continue
        cand.push([c, r])
    }
    for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const tmp = cand[i]; cand[i] = cand[j]; cand[j] = tmp }
    const picked = []
    let minSep = CS_IDS.length > 1 ? 6 : 1
    while (picked.length < CS_IDS.length && minSep >= 3) {
        for (const p of cand) {
            if (picked.length >= CS_IDS.length) break
            if (picked.some((q) => hexDist(q, p) < minSep)) continue
            if (picked.includes(p)) continue
            picked.push(p)
        }
        minSep--
    }
    CS_IDS.forEach((csId, i) => {
        const p = picked[i]
        if (!p) return
        const city = foundCity(gs, csId, p[0], p[1])
        city.cs = true
        city.size = 2
        city.name = CIVS[csId].name
        for (let cc = p[0] - 1; cc <= p[0] + 1; cc++) for (let rr = p[1] - 1; rr <= p[1] + 1; rr++) {
            if (!inMap(cc, rr)) continue
            const tl = gs.tiles[idx(cc, rr)]
            if (tl.owner < 0 && WALKABLE(tl.terr)) tl.owner = csId
        }
    })
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
        // score the true working ring: a capital must sit where its first ring
        // can actually feed it (grass yields dominate; river and corn add up)
        let ring = 0
        for (const [nc, nr] of neighbors(c, r)) {
            const q = gs.tiles[idx(nc, nr)]
            ring += q.terr === T.GRASS ? 2 : q.terr === T.PLAINS ? 1 : q.terr === T.HILLS ? 1 : 0
            ring += (q.river ? 1 : 0) + (q.forest ? 0.5 : 0)
        }
        let score = -d * 3 + ring + (tl.terr === T.GRASS ? 4 : tl.terr === T.PLAINS ? 2 : tl.terr === T.HILLS ? -2 : 0) + (tl.river ? 2 : 0) - (tl.terr === T.MOUNTAIN ? 99 : 0)
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
        naval: !!st.naval,
        cargo: st.naval ? [] : null,
        path: [], anim: { px: 0, pz: 0, moving: false },
        alive: true, fortified: false, acted: false, busy: null,
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
    if (tl.imp === 'FARM') {
        y.f += tl.terr === T.GRASS ? 2 : 1
        if (gs.wonders && tl.owner >= 0 && gs.wonders.HANGING_GARDENS === tl.owner) y.f += CFG.gardenFood
    }
    if (tl.imp === 'MINE') y.p += 1 + (hasTech(gs, tl.owner, 'ENGINEERING') ? 1 : 0)
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
    out.cult += 1                             // the capital's court sings too
    if (hasTech(gs, city.civ, 'THE_WHEEL')) out.p += 1      // wheeled transport
    if (hasTech(gs, city.civ, 'CURRENCY')) out.g += 2        // markets
    if (hasTech(gs, city.civ, 'WRITING')) out.sci += 1      // scribes
    if (hasTech(gs, city.civ, 'PHILOSOPHY')) out.cult += 1  // academies
    // Stage 8: the engines of the later eras
    if (hasTech(gs, city.civ, 'EDUCATION')) out.sci += 2         // schools
    if (hasTech(gs, city.civ, 'BANKING')) out.g += 2             // banks
    if (hasTech(gs, city.civ, 'STEAM_POWER')) out.p += 2         // mills
    if (hasTech(gs, city.civ, 'INDUSTRIALIZATION')) out.p += 3   // factories
    if (hasTech(gs, city.civ, 'ELECTRICITY')) { out.sci += 2; out.g += 1 }   // the grid lights the labs and the till
    // Stage 5 policy modifiers
    if (hasPolicy(gs, city.civ, 'FOUNDATIONS')) out.cult += 3
    if (hasPolicy(gs, city.civ, 'COLLEGE')) out.sci += 1
    if (hasPolicy(gs, city.civ, 'TRADING_POSTS')) out.g += 1
    // Stage 6 wonders
    if (gs.wonders && gs.wonders.STONEHENGE === city.civ) out.cult += CFG.stoneCult
    if (gs.wonders && gs.wonders.GREAT_LIBRARY === city.civ) out.sci += CFG.librarySci
    // Stage 4: strategic resources in the connected network feed the city
    const net = resourceNetwork(gs, city.civ)
    const seat = [cy, ...neighbors(city.c, city.r).map(([c, r]) => idx(c, r))]
    const onRes = (rid) => seat.some((i) => net.has(i) && gs.tiles[i].res === RES_IDS.indexOf(rid))
    if (onRes('HORSES')) out.f += CFG.horseFood
    if (onRes('IRON')) out.p += CFG.ironProd
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
    const city = { id: gs.cities.length, civ, c, r, size: 1, storedFood: 0, alive: true, name: cityName(civ, gs.civs[civ].cities || 0), capital: (gs.civs[civ].cities || 0) === 0, culture: 0, border: 1, hp: CFG.cityHp, wallMax: CFG.cityHp, buildP: 0, queue: [] }
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
    // Stage 5: borders creep outward with the city's own culture — first ring
    // at founding, ring 2 at CFG.border2, ring 3 at CFG.border3. Unowned
    // ground is claimed first-come; a rival's tile is never taken by culture.
    for (const city of gs.cities) {
        if (city.civ !== civ || !city.alive) continue
        const cult = city.culture || 0
        const rad = cult >= CFG.border3 ? 3 : cult >= CFG.border2 ? 2 : CFG.cityRingWork
        let claimed = 0
        for (let rr = city.r - rad; rr <= city.r + rad; rr++) for (let cc = city.c - rad; cc <= city.c + rad; cc++) {
            if (!inMap(cc, rr)) continue
            if (hexDist([cc, rr], [city.c, city.r]) > rad) continue
            const tl = gs.tiles[idx(cc, rr)]
            if (tl.owner < 0) { tl.owner = civ; claimed++ }
        }
        if (rad > (city.border || 1)) {
            city.border = rad
            if (claimed > 0) gs.events.push({ type: 'borderGrow', civ, city: city.id, rad, c: city.c, r: city.r })
        }
    }
}
const NAMES = { 0: ['Roma', 'Neapolis', 'Capua', 'Tarentum'], 1: ['Thebes', 'Memphis', 'Heliopolis', 'Nubis'], 2: ['Luoyang', 'Linzi', 'Handan', 'Chengdu'], 3: ['Tenochtitlan', 'Texcoco', 'Tlacopan', 'Cholula'] }
function cityName(civ, n) { return (NAMES[civ] || ['City'])[n % 4] }

// ------------------------------------------------------------------ actions --
export function orderMove(gs, unit, tc, tr) {
    if (!unit || !unit.alive || unit.loaded || unit.moves <= 0) return false
    const tl = tileAt(gs, tc, tr)
    if (!tl || !domainOK(unit, tl.terr)) return false
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
            if (!domainOK(unit, tl.terr)) continue
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
export function cityDefense(gs, city) {
    let d = CFG.cityBaseDef + 3 * city.size
    if (city.civ != null && city.civ < BARB && happinessOf(gs, city.civ).unhappy) d = Math.floor(d * CFG.angryDef)   // angry cities dig in worse
    if (city.civ != null && gs.wonders && gs.wonders.GREAT_WALL === city.civ) d = Math.round(d * CFG.wallDefMult)     // the wall is the city
    return d
}

export function doAttack(gs, u, tc, tr) {
    if (!u || !u.alive || u.loaded || u.str <= 0 || u.moves <= 0) return false
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
        // Stage 7 naval law, faithful to the original: a Trireme masters the
        // sea and strikes ships; only ships may fight ships. Land units beach
        // and board any vessel that comes alongside the shore.
        if (u.naval && !target.naval) return false
        let strikes = 0
        while (strikes++ < 4) {
            const atkEff = u.str * (0.5 + 0.5 * u.hp / u.maxHp) * (tl.river ? 0.9 : 1)
            const defEff = target.str * (0.5 + 0.5 * target.hp / target.maxHp) * (1 + defenseBonus(gs, target))
            target.hp -= Math.max(4, Math.round(34 * atkEff / (atkEff + defEff)))
            if (target.hp <= 0) {
                target.hp = 0; target.alive = false; target.moves = 0; target.path = []
                if (target.naval) drownCargo(gs, target)
                gs.events.push({ type: 'kill', civ: u.civ, kind: u.kind, victim: target.civ, victimKind: target.kind, at: [tc, tr], ranged })
                if (!ranged && u.alive && domainOK(u, tl.terr)) { u.c = tc; u.r = tr; if (u.civ === BARB) pillageAt(gs, gs.tiles[ti]) }        // march in — one unit per tile holds
                if (u.alive && u.civ === 0) reveal(gs, 0, tc, tr, st.sight)
                break
            }
            if (!ranged) u.hp -= Math.max(2, Math.round(30 * defEff / (atkEff + defEff)))
            if (u.hp <= 0) {
                u.hp = 0; u.alive = false; u.path = []
                if (u.naval) drownCargo(gs, u)
                gs.events.push({ type: 'kill', civ: target.civ, kind: target.kind, victim: u.civ, victimKind: u.kind, at: [u.c, u.r], ranged: false })
                break
            }
        }
        u.moves = 0; u.acted = true; u.fortified = false
        gs.events.push({ type: 'strike', civ: ociv, kind: u.kind, from: [ox, oy], to: [tc, tr], ranged })
        if (target.civ > 0 && target.civ !== BARB && u.civ < BARB) declareWar(gs, u.civ, target.civ)
        return true
    }
    const cityI = tl.city
    if (cityI >= 0 && gs.cities[cityI].alive && atWar(gs, u.civ, gs.cities[cityI].civ)) {
        if (u.naval && !(UNIT[u.kind] && UNIT[u.kind].ports)) return false   // the Trireme hovers; the age of sail storms ports
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
                if (u.naval) drownCargo(gs, u)
                gs.events.push({ type: 'kill', civ: city.civ, kind: 'CITY', victim: u.civ, victimKind: u.kind, at: [u.c, u.r], ranged: false })
                break
            }
        }
        u.moves = 0; u.acted = true
        gs.events.push({ type: 'strike', civ: ociv, kind: u.kind, from: [ox, oy], to: [tc, tr], ranged })
        if (city.civ !== BARB && u.civ < BARB) declareWar(gs, u.civ, city.civ)
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
    const wasCS = !!city.cs
    city.civ = civ
    city.wallMax = city.wallMax || CFG.cityHp
    city.hp = Math.floor(city.wallMax * 0.6)
    city.size = Math.max(1, Math.floor(city.size / 2))
    city.storedFood = 0; city.buildP = 0; city.queue = []
    if (wasCS) { city.cs = false; delete city.capital }
    for (const [nc, nr] of neighbors(city.c, city.r)) {
        const tl = gs.tiles[idx(nc, nr)]
        if (tl.owner === old) tl.owner = civ
    }
    gs.tiles[idx(city.c, city.r)].owner = civ
    gs.events.push({ type: 'capture', city: city.id, civ, old, capital: city.capital })
    if (wasCS) {
        if (civ < CIVS.length) { if (civ < CS0) gs.civs[civ].gold += CFG.csTribute; gs.events.push({ type: 'csTaken', cs: old, by: civ, tribute: civ < CS0 ? CFG.csTribute : 0 }) }
        for (let x = 0; x < CS0; x++) if (gs.cs[x][old]) { gs.cs[x][old].ally = false; gs.cs[x][old].fallen = true }
    }
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
function stepTowardSea(gs, u, tgt) {
    let best = null, bd = hexDist([u.c, u.r], tgt)
    for (const [nc, nr] of neighbors(u.c, u.r)) {
        if (!isWater(gs, nc, nr) || unitAt(gs, nc, nr)) continue
        const d = hexDist([nc, nr], tgt)
        if (d < bd) { bd = d; best = [nc, nr] }
    }
    return best
}
function navalTarget(gs, civ, u) {
    // a ship's prey is other ships; Stage 8 galleons also hunt ports from the sea
    let best = null, bd = 9
    for (const x of gs.units) {
        if (!x.alive || !x.naval || !atWar(gs, civ, x.civ)) continue
        const d = hexDist([u.c, u.r], [x.c, x.r])
        if (d < bd) { bd = d; best = [x.c, x.r] }
    }
    if (UNIT[u.kind] && UNIT[u.kind].ports) {
        for (const ct of gs.cities) {
            if (!ct.alive || !atWar(gs, civ, ct.civ)) continue
            const d = hexDist([u.c, u.r], [ct.c, ct.r])
            if (d >= 1 && d * 1.4 < bd) { bd = d * 1.4; best = [ct.c, ct.r] }
        }
    }
    return best
}

// advance every unit's animation one tick: walk along its path spending moves.
function animateUnits(gs) {
    gs._anim = []
    for (const u of gs.units) {
        if (!u.alive || u.loaded) continue
        if (u.path && u.path.length) {
            u._p = (u._p || 0) + 1
            if (u._p >= 9) {
                u._p = 0
                const [nc, nr] = u.path[0]
                const cost = roadCost(gs, u, nc, nr)
                if (u.moves < cost) { u.path = []; continue }
                if (unitAt(gs, nc, nr)) { u.path = []; continue }
                u._from = [u.c, u.r]
                u.c = nc; u.r = nr; u.moves -= cost; u.path.shift(); u.acted = true
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
    for (const u of gs.units) { if (u.civ === 0 && u.alive && !u.loaded) { u.path = []; u.fortified = !u.acted } }
    for (const civ of gs.civs) { if (!civ.player && !civ.barb && !civ.cs && civ.alive) aiTurn(gs, civ.id) }
    barbarianTurn(gs)
    sweepMeetings(gs)
    for (const cs of CIVS) if (cs.cs && gs.civs[cs.id].alive) cityStateTurn(gs, cs.id)
    advanceBuilds(gs)
    for (const civ of gs.civs) if (!civ.barb && !civ.cs) resolveCiv(gs, civ.id)
    gs.turn++
    gs.phase = 'player'
    for (const u of gs.units) {
        if (!u.alive || u.loaded) continue
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
    for (const civ of gs.civs) { clearVisible(gs, civ.id); const own = gs.units.filter((u) => u.civ === civ.id && u.alive && !u.loaded)
        for (const u of own) reveal(gs, civ.id, u.c, u.r, u.kind === 'WARRIOR' ? CFG.sightWarrior : CFG.sightSettler)
        for (const ct of gs.cities) if (ct.civ === civ.id && ct.alive) reveal(gs, civ.id, ct.c, ct.r, CFG.sightCity) }
    checkEnd(gs)
}

function pumpCityQueue(gs, city) {
    city.queue = city.queue || []
    while (city.queue.length) {
        const kind = city.queue[0]
        if (WONDER[kind] && gs.wonders[kind] != null) {           // lost the race while it sat in the queue
            city.queue.shift()
            gs.events.push({ type: 'wonderLost', civ: city.civ, id: kind, by: gs.wonders[kind] })
            continue
        }
        const cost = WONDER[kind] ? WONDER[kind].cost : unitCost(gs, city.civ, kind)
        if (city.buildP < cost) break
        if (WONDER[kind]) {
            city.buildP -= cost; city.queue.shift()
            gs.wonders[kind] = city.civ
            gs.events.push({ type: 'wonderBuilt', civ: city.civ, id: kind, city: city.id, c: city.c, r: city.r })
            for (const q of gs.cities) {
                if (q.alive && q !== city && q.queue && q.queue.includes(kind)) {
                    q.queue = q.queue.filter((k) => k !== kind)
                    gs.events.push({ type: 'wonderLost', civ: q.civ, id: kind, by: city.civ })
                }
            }
            continue
        }
        const st = UNIT[kind]
        const at = st && st.naval ? firstFreeSea(gs, city.c, city.r)
            : landFree(gs, city.c, city.r) ? [city.c, city.r] : firstFreeAround(gs, city.c, city.r)
        if (!at || unitAt(gs, at[0], at[1]) || (st && st.naval ? !isWater(gs, at[0], at[1]) : !landFree(gs, at[0], at[1]))) break   // no room: points keep banking
        city.buildP -= cost; city.queue.shift()
        spawnUnit(gs, city.civ, kind, at[0], at[1])
        gs.events.push({ type: 'build', civ: city.civ, city: city.id, unit: kind })
    }
}

function resolveCiv(gs, civ) {
    const C = gs.civs[civ]
    const net = resourceNetwork(gs, civ)
    const cr = connectedResources(gs, civ, net)
    const hs = happinessOf(gs, civ)          // Stage 5: the realm's mood for this turn
    let fSur = 0, gold = 0, sci = 0, cult = 0, prod = 0
    for (const city of gs.cities) {
        if (city.civ !== civ || !city.alive) continue
        const y = cityYield(gs, city)   // includes connected strategic bonuses + policy modifiers
        fSur += y.f - city.size * 2            // each citizen eats 2
        gold += y.g; sci += y.sci; cult += y.cult; prod += y.p
        city.culture = (city.culture || 0) + y.cult   // culture banks per city, borders eat it later
        const fsur = y.f - city.size * 2
        city.storedFood += fsur + (hs.happy && fsur > 0 ? Math.ceil(fsur * CFG.happyGrowth) : 0)   // happy people have big families
        const need = CFG.growBase + CFG.growStep * (city.size - 1) - (hasTech(gs, civ, 'POTTERY') ? 2 : 0)
        if (!hs.unhappy) while (city.storedFood >= need && city.size < 9) { city.storedFood -= need; city.size++; gs.events.push({ type: 'grow', civ, city: city.id, size: city.size }) }
        if (city.storedFood < 0) city.storedFood = 0
        // production queue: bank shields, deliver units/wonders when the cost is met
        city.buildP = (city.buildP || 0) + y.p
        city.queue = city.queue || []
        pumpCityQueue(gs, city)
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
                if (victim.naval) drownCargo(gs, victim)
                gs.events.push({ type: 'kill', civ, kind: 'CITY', victim: victim.civ, victimKind: victim.kind, at: [victim.c, victim.r] })
            }
        }
    }
    // luxury caravans: each unique connected luxury pays once, empire-wide
    const KN = gs.resKnown ? gs.resKnown[civ] : null
    let lux = 0
    for (const id of cr) {
        if (KN && !KN[id]) {
            KN[id] = 1
            gs.events.push({ type: RES[id].lux ? 'luxury' : 'strategic', civ, id })
        }
        if (RES[id].lux) lux++
    }
    gold += CFG.luxGold * lux; cult += CFG.luxCult * lux
    // Stage 7: signed trade pacts pay both crowns; allied city-states pay pensions
    for (const k of Object.keys(gs.trade)) {
        const [x, y] = k.split('-').map(Number)
        if (x === civ || y === civ) gold += CFG.tradeGold
    }
    for (const cs of CIVS) {
        if (!cs.cs || !gs.civs[cs.id].alive) continue
        const info = gs.cs[civ][cs.id]
        if (info && info.ally) { gold += cs.allyGold || 0; sci += cs.allySci || 0; cult += cs.allyCult || 0 }
    }
    if (gs.wonders && gs.wonders.COLOSSUS === civ) gold += CFG.colossusGold * lux   // bronze giants guard the caravans
    if (hs.happy) gold = Math.round(gold * (1 + CFG.happyGold))   // happy markets tip the till
    // Stage 6: every city sings its people toward legend — one point of each
    // type per city, an extra engineer at the palace, a merchant per luxury.
    const G = gs.gp[civ]
    const myCities = gs.cities.filter((c) => c.alive && c.civ === civ).length
    const gpPalace = gs.cities.some((c) => c.alive && c.civ === civ && c.capital) ? CFG.gpPalace : 0
    G.pts.ENGINEER += myCities + gpPalace
    G.pts.SCIENTIST += myCities
    G.pts.MERCHANT += myCities + CFG.gpLux * lux
    for (const t of GP_TYPES) {
        const now = G.pts[t] >= gpThreshold(gs, civ, t)
        if (now && !G.ready[t]) { G.ready[t] = true; gs.events.push({ type: 'gpReady', civ, kind: t, need: gpThreshold(gs, civ, t), cost: gpCost(gs, civ, t) }) }
        if (!now) G.ready[t] = false
    }
    C.gold += gold; C.science += sci; C.culture += cult
    const mood = hs.net >= 1 ? 'happy' : hs.net < 0 ? 'unhappy' : 'content'
    if (mood !== C.happyState) { C.happyState = mood; C.happyNet = hs.net; gs.events.push({ type: 'happy', civ, net: hs.net, state: mood }) }
    C.happyNet = hs.net
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
    // Stage 8: lifetime culture outlives every policy purchase — it is the
    // ledger the culture victory reads, and it never gets spent.
    C.cultureEarned = (C.cultureEarned || 0) + cult
    // Stage 8: after Spaceflight, every beaker pours into THE ARK.
    if (hasTech(gs, civ, 'SPACEFLIGHT') && gs.ark[civ] < CFG.arkScience) {
        gs.ark[civ] = Math.min(CFG.arkScience, gs.ark[civ] + sci)
        gs.events.push({ type: 'ark', civ, prog: gs.ark[civ], need: CFG.arkScience })
        if (gs.ark[civ] >= CFG.arkScience) gs.events.push({ type: 'arkLaunch', civ })
    }
    const eraNow = highestEra(gs, civ)
    if (eraNow > (C.era == null ? -1 : C.era)) { C.era = eraNow; if (eraNow >= 1) gs.events.push({ type: 'era', civ, era: eraNow }) }
    spreadBorders(gs, civ)
    gs.events.push({ type: 'turnEnd', civ, gold, sci, cult, prod, fSur })
}

function highestEra(gs, civ) {
    let e = -1
    const K = gs.tech[civ].known
    for (const id of TECH_IDS) if (K[id] && TECH[id].era > e) e = TECH[id].era
    return e
}

// Stage 8: the three real victories, judged for any major. DOMINATION first
// (the pen and the sword), then SCIENCE (the Ark), then CULTURE (lifetime
// culture past the threshold, strictly ahead of every living rival). Rome's
// arcade milestone (golden age) stays behind them; a rival achieving any of
// the three first ends the game the other way.
function victoryFor(gs, civ) {
    if (!gs.civs[civ].alive) return null
    if (gs.civs.every((c) => c.barb || c.cs || c.id === civ || !c.alive)) return 'Domination — every rival capital flies your colours'
    if (hasTech(gs, civ, 'SPACEFLIGHT') && gs.ark[civ] >= CFG.arkScience) return 'Science — the Ark leaves the ground; the future is yours'
    const mine = gs.civs[civ].cultureEarned || 0
    if (mine >= CFG.cultureWin && gs.civs.every((c) => c.barb || c.cs || c.id === civ || !c.alive || (c.cultureEarned || 0) < mine)) {
        return 'Culture — the world remembers your name above all others'
    }
    return null
}

function checkEnd(gs) {
    const mine = victoryFor(gs, 0)
    if (mine) { gs.end = 'win'; gs.endWhy = mine; return }
    const cap = gs.capitalOf[0] != null ? gs.cities[gs.capitalOf[0]] : null
    if (cap && cap.alive && cap.civ === 0 && cap.size >= CFG.capitalSizeToWin) { gs.end = 'win'; gs.endWhy = `${cap.name} reached size ${cap.size}`; return }
    for (const c of [1, 2, 3]) {
        const rv = victoryFor(gs, c)
        if (rv) { gs.end = 'lose'; gs.endWhy = `${CIVS[c].name} won by ${rv.split('—')[0].trim().toLowerCase()} first`; return }
    }
    if (!gs.civs[0].alive || (gs.capitalOf[0] != null && gs.cities[gs.capitalOf[0]].civ !== 0)) { gs.end = 'lose'; gs.endWhy = 'your capital has fallen'; return }
    if (gs.turn > CFG.turnLimit) { gs.end = 'lose'; gs.endWhy = `turn limit ${CFG.turnLimit} passed with no victory` }
}

function pillageAt(gs, tl) {
    let hit = false
    if (tl.imp) { tl.imp = null; hit = true }
    if (tl.road) { tl.road = false; hit = true }
    if (tl.build) { const w = gs.units.find((u) => u.id === tl.build.by); if (w) w.busy = null; tl.build = null; hit = true }
    if (hit) gs.events.push({ type: 'pillage', c: tl.c, r: tl.r })
    return hit
}

// ------------------------------------------------------------------- AI turn --
// Each AI civ: settlers expand to good nearby land; warriors/archers seek
// enemies and (once strong) capitals when at war; cities queue settlers and,
// in wartime, military units. From CFG.warDeclareTurn a healthy rival may
// declare war on you on a deterministic pseudo-roll.
function findTarget(gs, civ, u, radius) {
    let best = null, bs = 1e9
    for (const x of gs.units) {
        if (!x.alive || x.loaded || !atWar(gs, civ, x.civ)) continue
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
// Stage 8: the later eras on the rack. Rivals walk the old road first (their
// rotation and early choices are untouched); once the medieval shelf is full
// they climb toward the Ark on a fixed line — a real, if slow, race.
const AI_TECH_ORDER_LATE = ['EDUCATION', 'BANKING', 'GUNPOWDER', 'ASTRONOMY', 'STEAM_POWER', 'RAILROAD', 'INDUSTRIALIZATION', 'ELECTRICITY', 'SPACEFLIGHT']

function aiTurn(gs, civ) {
    const C = gs.civs[civ]
    const warring = gs.civs.some((x) => !x.barb && x.id !== civ && x.alive && atWar(gs, civ, x.id))
    if (!warring && gs.turn >= CFG.warDeclareTurn) {
        const power = gs.units.filter((u) => u.alive && u.civ === civ && u.str > 0).length
        const cities = gs.cities.filter((c) => c.alive && c.civ === civ).length
        if (power + cities >= 5 && hash2(civ, gs.turn, gs.seed ^ 0x9e37) < CFG.warChance && canDeclareWar(gs, civ, 0) === true) declareWar(gs, civ, 0)
    }
    // Stage 7 diplomacy: sue for peace when outmatched or the clock bites,
    // sign trade when peace has held long enough. Same law as the D panel.
    if (atWar(gs, civ, 0)) {
        const mine = gs.units.filter((u) => u.alive && u.civ === civ && u.str > 0).length
        const theirs = gs.units.filter((u) => u.alive && u.civ === 0 && u.str > 0).length
        if ((mine < theirs || gs.turn >= CFG.turnLimit - 8) && hash2(civ, gs.turn, gs.seed ^ 0x51af) < 0.22) makePeace(gs, civ, 0)
    } else if (canTrade(gs, civ, 0) === true && hash2(civ, gs.turn, gs.seed ^ 0x77b1) < 0.3) {
        makeTrade(gs, civ, 0)
    }
    // settlers expand; military units fight or scout
    for (const u of gs.units) {
        if (!u.alive || u.loaded || u.civ !== civ) continue
        u.moves = u.maxMoves
        if (u.kind === 'SETTLER') {
            let tries = 0
            while (canFound(gs, civ, u.c, u.r, u) !== true && u.moves > 0 && tries++ < 4) {
                const step = bestExpandHex(gs, civ, u.c, u.r)
                if (!step) break
                u.c = step[0]; u.r = step[1]; u.moves--; u.acted = true
            }
            if (canFound(gs, civ, u.c, u.r, u) === true) tryFound(gs, u)
        } else if (u.naval) {
            // Stage 7: galleys hunt coastal targets across the water, else roam
            const tgt = navalTarget(gs, civ, u)
            if (tgt) {
                let guard = 0
                while (u.moves > 0 && guard++ < 3) {
                    const d = hexDist([u.c, u.r], tgt)
                    if (d <= 1) { doAttack(gs, u, tgt[0], tgt[1]); break }
                    const step = stepTowardSea(gs, u, tgt)
                    if (!step) break
                    u.c = step[0]; u.r = step[1]; u.moves--; u.acted = true
                }
            } else {
                const dirs = neighbors(u.c, u.r).filter(([nc, nr]) => isWater(gs, nc, nr) && !unitAt(gs, nc, nr))
                if (dirs.length) { const pick = dirs[Math.floor(hash2(u.id, gs.turn, civ ^ 61) * dirs.length)]; u.c = pick[0]; u.r = pick[1]; u.moves = 0; u.acted = true }
            }
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
    // Stage 4: workers farm, mine and road toward unconnected resources
    const aiNet = resourceNetwork(gs, civ)
    for (const u of gs.units) {
        if (!u.alive || u.civ !== civ || u.kind !== 'WORKER' || u.busy != null) continue
        const tl = gs.tiles[idx(u.c, u.r)]
        const ground = tl.terr === T.HILLS ? 'MINE' : tl.terr === T.GRASS || tl.terr === T.PLAINS ? 'FARM' : null
        if (ground && canImprove(gs, civ, u, ground) === true) { startImprove(gs, u, ground); continue }
        if (canImprove(gs, civ, u, 'ROAD') === true && tl.res >= 0) { startImprove(gs, u, 'ROAD'); continue }
        if (u.moves > 0) {
            let tgt = null, bd = 10
            for (const q of gs.tiles) {
                if (q.res < 0 || aiNet.has(idx(q.c, q.r)) || !WALKABLE(q.terr)) continue
                const d = hexDist([u.c, u.r], [q.c, q.r])
                if (d < bd) { bd = d; tgt = [q.c, q.r] }
            }
            if (tgt) { const s = stepToward(gs, u, tgt); if (s) { u.c = s[0]; u.r = s[1]; u.moves--; u.acted = true } }
        }
    }
    // Stage 5: rivals adopt their own deterministic policy line when culture pays
    const AI_POLICY = { 1: ['TRADING_POSTS', 'TREATIES'], 2: ['COLONIAL', 'COLLEGE'], 3: ['FOUNDATIONS', 'CEREMONY'] }
    for (const id of AI_POLICY[civ] || ['FOUNDATIONS', 'CEREMONY']) {
        if (canAdopt(gs, civ, id) === true) { adoptPolicy(gs, civ, id); break }
    }
    // Stage 6: rivals chase wonders on deterministic lines, recruit their great
    // people the moment the price is paid, and spend them without hesitating.
    const G = gs.gp[civ]
    for (const t of GP_TYPES) {
        if (canRecruit(gs, civ, t) === true) { recruitGP(gs, civ, t); break }
    }
    const aiCap = gs.cities.find((c) => c.alive && c.civ === civ)
    const aiR = gs.tech[civ]
    if (G.held.SCIENTIST > 0 && aiR.research && aiR.prog * 2 < TECH[aiR.research].cost) spendGP(gs, civ, 'SCIENTIST')
    else if (G.held.ENGINEER > 0 && aiCap && aiCap.queue && aiCap.queue.length && WONDER[aiCap.queue[0]]) spendGP(gs, civ, 'ENGINEER', aiCap.id)
    else if (G.held.MERCHANT > 0 && C.gold < 300) spendGP(gs, civ, 'MERCHANT')
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
        if (!R.research) for (const id of AI_TECH_ORDER_LATE) if (av.includes(id)) { setResearch(gs, civ, id); break }
    }
    for (const city of gs.cities) {
        if (city.civ !== civ || !city.alive) continue
        city.queue = city.queue || []
        if (city.queue.length >= 3) continue
        // Stage 7: coastal cities lay a keel — wartime fleets, peace patrols.
        // Stage 8: once Astronomy is in, the yard prefers the port-storming Galleon.
        const ship = canQueue(gs, civ, 'GALLEON') === true && hash2(city.id, gs.turn, civ ^ 43) < 0.5 ? 'GALLEON' : 'GALLEY'
        if (!city.queue.includes(ship) && canQueue(gs, civ, ship) === true && coastalTile(gs, city.c, city.r)
            && hash2(city.id, gs.turn, civ ^ 41) < (warring ? 0.4 : 0.15)) { city.queue.push(ship); continue }
        // Stage 6: every rival is in the race — one wonder at a time, per city
        if (!city.queue.some((k) => WONDER[k]) && !WONDER_IDS.some((id) => gs.wonders[id] === civ)) {
            const pick = WONDER_IDS.filter((id) => canBuildWonder(gs, civ, id) === true)
            if (pick.length && hash2(city.id, gs.turn, civ ^ 29) < 0.45) city.queue.push(pick[(civ + city.id) % pick.length])
        }
        const wantSettler = city.size >= 2 && C.gold >= 40 && (C.cities || 0) < 6
        const workers = gs.units.filter((x) => x.alive && x.civ === civ && x.kind === 'WORKER').length + city.queue.filter((k) => k === 'WORKER').length
        if (wantSettler && !city.queue.includes('SETTLER')) city.queue.push('SETTLER')
        else if (workers < 2 && hash2(city.id, gs.turn, civ ^ 3) < 0.5) city.queue.push('WORKER')
        else if (warring && city.queue.filter((k) => k !== 'SETTLER' && k !== 'WORKER').length < 2) {
            if (canQueue(gs, civ, 'MUSKET') && hash2(city.id, gs.turn, civ ^ 53) < 0.5) city.queue.push('MUSKET')
            else if (canQueue(gs, civ, 'CATAPULT') && hash2(city.id, gs.turn, civ ^ 11) < 0.3) city.queue.push('CATAPULT')
            else if (canQueue(gs, civ, 'LEGION') && hash2(city.id, gs.turn, civ ^ 17) < 0.35) city.queue.push('LEGION')
            else if (canQueue(gs, civ, 'CHARIOT') && hash2(city.id, gs.turn, civ ^ 23) < 0.35) city.queue.push('CHARIOT')
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
            pillageAt(gs, gs.tiles[idx(u.c, u.r)])
        }
        if (u.alive && hexDist([u.c, u.r], tgt) <= 1) doAttack(gs, u, tgt[0], tgt[1])
        if (u.alive) pillageAt(gs, gs.tiles[idx(u.c, u.r)])
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

// Stage 7: a city-state is neutral until war comes — but its walls fight back.
function cityStateTurn(gs, csId) {
    const city = gs.cities.find((c) => c.alive && c.civ === csId)
    if (!city) return
    city.hp = Math.min(city.wallMax || CFG.cityHp, city.hp + 4)   // the militia repairs
    let victim = null, vh = 1e9
    for (const [nc, nr] of neighbors(city.c, city.r)) {
        const en = unitAt(gs, nc, nr)
        if (en && en.alive && en.civ < CS0 && atWar(gs, csId, en.civ) && en.hp < vh) { vh = en.hp; victim = en }
    }
    if (victim) {
        victim.hp -= Math.max(5, Math.round(CFG.cityStrike * 0.8 * (0.5 + 0.5 * city.hp / (city.wallMax || CFG.cityHp))))
        gs.events.push({ type: 'cityStrike', civ: csId, city: city.id, at: [victim.c, victim.r] })
        if (victim.hp <= 0) {
            victim.alive = false; victim.hp = 0; victim.path = []
            if (victim.naval) drownCargo(gs, victim)
            gs.events.push({ type: 'kill', civ: csId, kind: 'CITY', victim: victim.civ, victimKind: victim.kind, at: [victim.c, victim.r] })
        }
    }
}

// --------------------------------------------------------------------- step --
export function step(gs, input = {}) {
    gs.tick++
    if (gs.end) return
    if (gs.phase !== 'player') { endPlayerTurn(gs); return }
    if (input.select != null) { const u = gs.units.find((x) => x.id === input.select && x.alive && x.civ === 0); if (u) gs.selected = u.id }
    const sel = gs.units.find((u) => u.id === gs.selected && u.alive && u.civ === 0 && !u.loaded) || null
    if (input.endTurn) { endPlayerTurn(gs); return }
    if (input.research) setResearch(gs, 0, input.research)
    if (input.policy) adoptPolicy(gs, 0, input.policy)
    if (input.recruit) recruitGP(gs, 0, input.recruit)
    if (input.useGP) spendGP(gs, 0, input.useGP.kind, input.useGP.city)
    if (input.declare != null) {
        const why = canDeclareWar(gs, 0, input.declare)
        if (why !== true) gs.events.push({ type: 'deny', reason: why, c: -1, r: -1 })
        else declareWar(gs, 0, input.declare, 0)
    }
    if (input.peace != null) makePeace(gs, 0, input.peace)
    if (input.trade != null) makeTrade(gs, 0, input.trade)
    if (input.gift != null) giftCS(gs, 0, input.gift)
    if (input.queue && (UNIT[input.queue] || WONDER[input.queue])) {
        const deny = queueDeny(gs, 0, input.queue)
        if (deny) gs.events.push({ type: 'deny', reason: deny, c: -1, r: -1 })
        else {
            const city = input.city != null ? gs.cities[input.city]
                : UNIT[input.queue] && UNIT[input.queue].naval ? coastalCityOf(gs, 0)
                    : gs.cities.find((c) => c.civ === 0 && c.alive)
            if (city && city.alive && city.civ === 0 && city.queue.length < 3) { city.queue.push(input.queue); gs.events.push({ type: 'queued', civ: 0, unit: input.queue }) }
        }
    }
    if (sel) {
        if (input.move) orderMove(gs, sel, input.move[0], input.move[1])
        if (input.attack) doAttack(gs, sel, input.attack[0], input.attack[1])
        if (input.improve) startImprove(gs, sel, input.improve)
        if (input.found) { tryFound(gs, sel); gs.selected = gs.units.find((u) => u.civ === 0 && u.alive && u.kind === 'SETTLER')?.id ?? gs.units.find((u) => u.civ === 0 && u.alive)?.id ?? -1 }
        if (input.embark) embark(gs, sel)
        if (input.land) land(gs, sel, input.land[0], input.land[1])
    }
    animateUnits(gs)
}

export function stateHash(gs) {
    const KC = { SETTLER: 1, WARRIOR: 2, ARCHER: 3, CATAPULT: 4, WORKER: 5, CHARIOT: 6, LEGION: 7, GALLEY: 8, MUSKET: 9, GALLEON: 10 }
    let h = gs.turn * 31 + gs.units.length
    for (const u of gs.units) h = (h * 33 + (KC[u.kind] || 99) * 7 + u.c * 3 + u.r + (u.alive ? 1 : 0) * 131 + u.hp * 977 + u.civ * 53 + (u.busy != null ? u.busy + 1 : 0) * 19 + (u.loaded || 0) * 29 + (u.cargo ? u.cargo.length * 71 : 0)) | 0
    for (const ct of gs.cities) h = (h * 33 + ct.size * 5 + ct.c + ct.r * 11 + (ct.alive ? 1 : 0) + ct.hp * 31 + ct.civ * 71 + (ct.culture || 0) * 13) | 0
    for (const cp of gs.camps) h = (h * 33 + cp.c + cp.r * 13 + (cp.alive ? 1 : 0) * 173) | 0
    let L = 0
    for (const tl of gs.tiles) L = (L * 7 + (tl.imp ? IMP_IDS.indexOf(tl.imp) + 1 : 0) + (tl.road ? 4 : 0) + (tl.res + 1) * 11 + (tl.build ? tl.build.left * 3 + tl.build.civ : 0)) | 0
    h = (h * 33 + L) | 0
    h = (h * 33 + Object.keys(gs.wars).length * 613) | 0
    h = (h * 33 + Object.keys(gs.trade).filter((k) => gs.trade[k]).length * 733) | 0
    h = (h * 33 + Object.keys(gs.peaceTurn).filter((k) => gs.peaceTurn[k] != null).length * 179) | 0
    for (const id of WONDER_IDS) h = (h * 31 + (gs.wonders[id] != null ? gs.wonders[id] + 2 : 0)) | 0
    for (const civ of [0, 1, 2, 3]) {
        for (const csId of CS_IDS) {
            const info = gs.cs[civ][csId]
            h = (h * 31 + (info ? (info.met ? 1 : 0) + (info.ally ? 2 : 0) + info.influence * 5 : 0)) | 0
        }
        const R = gs.tech[civ]
        let m = 0
        for (let i = 0; i < TECH_IDS.length; i++) if (R.known[TECH_IDS[i]]) m |= 1 << i
        let rm = 0
        for (const id of connectedResources(gs, civ)) rm |= 1 << RES_IDS.indexOf(id)
        let pm = 0
        for (let i = 0; i < POLICY_IDS.length; i++) if (gs.policies[civ][POLICY_IDS[i]]) pm |= 1 << i
        const G = gs.gp[civ]
        h = (h * 33 + m * 7 + (R.research ? TECH_IDS.indexOf(R.research) + 1 : 0) * 13 + Math.floor(R.prog) * 3 + rm * 29 + pm * 17 + (gs.civs[civ].culture | 0)) | 0
        h = (h * 33 + (Math.floor(G.pts.ENGINEER) + Math.floor(G.pts.SCIENTIST) * 7 + Math.floor(G.pts.MERCHANT) * 11 + G.held.ENGINEER * 17 + G.held.SCIENTIST * 19 + G.held.MERCHANT * 23)) | 0
        h = (h * 33 + Math.floor(gs.ark[civ]) * 41 + ((gs.civs[civ].cultureEarned || 0) | 0) * 23) | 0
    }
    return (h >>> 0).toString(16)
}
