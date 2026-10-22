// EMBERWOOD — solver: tile-level pathfinding (shared by bot + harness) and a
// logical dungeon prover. The prover answers: can each dungeon be finished with
// ONLY the items the player owns at that point? Enemy killing is abstracted to
// "sword owns any fight" (every enemy dies to the sword); physics-level moves
// (push blocks, arrow lines) are verified as geometric reachability.

import { SCREENS, TS, SW, SH, tileAt, isSolidTile, SHOP } from './world.js'

const openTile = (id, tx, ty, st) => {
    if (tx < 0 || ty < 0 || tx >= SW || ty >= SH) return false
    const s = SCREENS[id]
    const ch = tileAt(s, tx, ty)
    if (ch === 'C') return !!st.cracked[id + ':' + (s.cracks || []).find(c => c.x === tx && c.y === ty)?.id]
    if (isSolidTile(ch)) return false
    if (ch === '.') {
        const d = (s.doors || []).find(q => q.x === tx && q.y === ty)
        if (d) {
            if (st.doors[d.id]) return true
            if (d.kind === 'switch') return !!st.switches[d.switch]
            return false
        }
        if ((s.chests || []).some(c => c.x === tx && c.y === ty && !st.chests[c.id] && (!c.after || st.flags[c.after]))) return false
        if ((s.blocks || []).some(b => b.x === tx && b.y === ty)) return false
    }
    return true
}

// BFS tile path in a screen; returns array of [x,y] tiles or null.
export function tilePath(id, from, to, st) {
    if (!openTile(id, to[0], to[1], st)) return null
    const prev = new Map()
    const key = (x, y) => x + ',' + y
    const q = [from]
    prev.set(key(from[0], from[1]), null)
    while (q.length) {
        const [x, y] = q.shift()
        if (x === to[0] && y === to[1]) {
            const out = []
            let cur = key(x, y)
            while (cur) { const [cx, cy] = cur.split(',').map(Number); out.unshift([cx, cy]); cur = prev.get(cur) }
            return out
        }
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, ny = y + dy
            if (prev.has(key(nx, ny))) continue
            if (!openTile(id, nx, ny, st)) continue
            prev.set(key(nx, ny), key(x, y))
            q.push([nx, ny])
        }
    }
    return null
}

// straight line (tile centers) clear of solid statics — used for arrow switches
const lineClear = (id, a, b) => {
    const dx = Math.sign(b[0] - a[0]), dy = Math.sign(b[1] - a[1])
    if (dx !== 0 && dy !== 0) return false
    let [x, y] = a
    while (x !== b[0] || y !== b[1]) {
        x += dx; y += dy
        if (x === b[0] && y === b[1]) break
        const s = SCREENS[id]
        const ch = tileAt(s, x, y)
        if (isSolidTile(ch) && ch !== 'A') return false
    }
    return true
}

const st0 = () => ({ cracked: {}, doors: {}, switches: {}, chests: {}, flags: {}, killed: {} })

// can the hero stand next to tile t (its own tile may be solid/blocked)?
function reachAdj(id, from, t, st) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = t[0] + dx, ny = t[1] + dy
        if (!openTile(id, nx, ny, st)) continue
        if (tilePath(id, from, [nx, ny], st)) return [nx, ny]
    }
    return null
}

// Push-block reachability: can the block reach the plate? (abstract: same
// connected open region as plate, with room to maneuver)
function blockSolves(id, st) {
    const s = SCREENS[id]
    const blocks = s.blocks || []
    const plates = s.plates || []
    return blocks.length > 0 && plates.length > 0 && blocks.every(b =>
        plates.some(p => tilePath(id, [b.x, b.y], [p.x, p.y], st) !== null))
}

// logical proof over the whole game.
export function proveGame(startKit = { bombs: false, bow: false, shield: false }) {
    const st = st0()
    const kit = { sword: true, bombs: startKit.bombs, bow: startKit.bow, arrows: startKit.bow ? 10 : 0, shield: startKit.shield || false, keys: 0, bigkey: false }

    const reachables = () => {
        const seen = new Set(['ow-11'])
        const q = ['ow-11']
        while (q.length) {
            const id = q.shift()
            const s = SCREENS[id]
            const from = s.spawn || (id === 'ow-11' ? [8, 6] : [7, 8])
            for (const k of Object.keys(SCREENS)) {
                if (seen.has(k)) continue
                // overworld adjacency
                const e = s.exits || {}
                for (const dir of Object.keys(e)) {
                    if (e[dir].to === k) { seen.add(k); q.push(k) }
                }
                // warps
                for (const w of s.warps || []) {
                    if (w.to !== k) continue
                    const p = tilePath(id, from, [w.x, w.y], st)
                    if (p) { seen.add(k); q.push(k) }
                }
                // doors (dungeon links) — need the key at this point
                for (const d of s.doors || []) {
                    if (d.to !== k) continue
                    if (st.doors[d.id]) { seen.add(k); q.push(k); continue }
                    const near = reachAdj(id, from, [d.x, d.y], st)
                    if (!near) continue
                    if (d.kind === 'key' && kit.keys > 0) { kit.keys--; st.doors[d.id] = true; seen.add(k); q.push(k) }
                    else if (d.kind === 'bigkey' && kit.bigkey) { st.doors[d.id] = true; seen.add(k); q.push(k) }
                    else if (d.kind === 'switch' && st.switches[d.switch]) { st.doors[d.id] = true; seen.add(k); q.push(k) }
                }
            }
        }
        return seen
    }

    const route = []
    const actions = (id) => {
        const s = SCREENS[id]
        const from = s.spawn || (id === 'ow-11' ? [8, 6] : [7, 8])
        const out = []
        for (const c of s.chests || []) {
            if (st.chests[c.id]) continue
            if (c.after && !st.flags[c.after]) continue
            if (reachAdj(id, from, [c.x, c.y], st)) out.push({ type: 'chest', id: c.id, item: c.item, screen: id })
        }
        for (const c of s.cracks || []) {
            if (st.cracked[c.id]) continue
            if (!kit.bombs) continue
            if (reachAdj(id, from, [c.x, c.y], st)) out.push({ type: 'crack', id: c.id, reveal: c.reveal, screen: id })
        }
        for (const sw of s.switches || []) {
            if (st.switches[sw.id]) continue
            if (sw.via === 'arrow') {
                if (!(kit.bow && kit.arrows > 0)) continue
                const stand = reachAdj(id, from, [sw.x, sw.y], st)
                if (stand && lineClear(id, stand, [sw.x, sw.y])) out.push({ type: 'switch', id: sw.id, opens: sw.opens, screen: id })
            }
        }
        if ((s.blocks || []).length && blockSolves(id, st)) {
            for (const p of s.plates || []) if (!st.switches[p.id]) out.push({ type: 'plate', id: p.id, screen: id })
        }
        for (const e of s.enemies || []) {
            if (e.boss === 1 && !st.flags.boss1 && kit.sword) out.push({ type: 'boss', id: 'boss1', screen: id })
            if (e.boss === 2 && !st.flags.boss2 && kit.sword && kit.bow && kit.arrows > 0) out.push({ type: 'boss', id: 'boss2', screen: id })
        }
        return out
    }

    let progress = true
    while (progress) {
        progress = false
        const seen = reachables()
        for (const id of seen) {
            for (const a of actions(id)) {
                if (a.type === 'chest') {
                    st.chests[a.id] = true
                    if (a.item === 'key') kit.keys++
                    if (a.item === 'bigkey') kit.bigkey = true
                    if (a.item === 'bow') { kit.bow = true; kit.arrows += 10 }
                    route.push(a)
                    progress = true
                } else if (a.type === 'crack') {
                    st.cracked[a.id] = true
                    if (a.reveal === 'bow') { kit.bow = true; kit.arrows += 10 }
                    route.push(a)
                    progress = true
                } else if (a.type === 'switch' || a.type === 'plate') {
                    st.switches[a.id] = true
                    const sc = SCREENS[a.screen]
                    const d = (sc.doors || []).find(dd => dd.switch === a.id)
                    if (d) st.doors[d.id] = true
                    route.push(a)
                    progress = true
                } else if (a.type === 'boss') {
                    st.flags[a.id] = true
                    route.push(a)
                    progress = true
                }
            }
        }
    }

    const seen = reachables()
    const s4 = SCREENS['d2-f4']
    const won = st.flags.boss2 && seen.has('d2-f4') && !!reachAdj('d2-f4', s4.spawn, [s4.chests[0].x, s4.chests[0].y], st)

    const d1Done = !!st.flags.boss1 && seen.has('d1-e3')
    const bowGot = kit.bow
    return { win: !!won, d1Done, bowGot, kit, route, seen: [...seen] }
}

export const shopTotal = (want) => SHOP.filter(o => want.includes(o.item)).reduce((a, o) => a + o.price, 0)
