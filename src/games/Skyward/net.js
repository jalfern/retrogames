// SKYWARD ONLINE (#3429) — what the room bytes mean when up to four pilots
// share one seeded sky. Transport + roster live in src/utils/room.js, tick-sync
// in src/utils/lockstep.js (#531 sampling law, #1705 N-peer mode — Tidal Rush
// is the shipped precedent), the waiting room is the shared <Lobby/>.
//
// The Skyward twist: the school is per-pilot, not one shared field, so every
// box simulates EVERY seat. The world is seed-deterministic (same seed ⇒ the
// same island, weather cell, rungs and strip), and each seat's instance
// consumes one pad stream: human seats ride the wire, open seats fly the
// planner autopilot — which reads state that is identical on every box, so
// CPU bytes never need to travel. A pilot's hull is a mesh in every sky, and
// the folded hash (every instance hash + tick) proves every box ran every sky
// identically. Pure: no DOM, no WebSocket — skywardcheck pins it over
// in-memory pipes before a browser ever loads.

import { HOST_SLOT } from '../../utils/room.js'

export const SEATS = 4               // cap 4 pilots; open seats fly the planner
export const PAD_DELAY = 8          // ~133 ms: past round-trip, below feel (the Blob law)
export const HASH_EVERY = 30
export const STALL_CAP = 90         // ticks a silent seat may freeze the sky before the autopilot takes it (~1.5 s: far above D+RTT jitter, far below "it's stuck forever")
export const RACE_T = 180          // seconds on the bell; the ROOM podium ranks by score
export const REMATCH = true        // host GO re-seeds without anyone re-entering a code

// Seat identity is the same in every box: seat i wears color i. Hull tints and
// the legend chips on the HUD are both keyed off this table, so "who is who"
// never depends on join order at the local cabinet.
export const PILOT_COLORS = [0x22d3ee, 0xf472b6, 0xa3e635, 0xfbbf24]
export const PILOT_CSS = ['#22d3ee', '#f472b6', '#a3e635', '#fbbf24']
export const PILOT_NAMES = ['CYAN', 'MAGENTA', 'LIME', 'AMBER']

const clamp1 = (v) => (v > 1 ? 1 : v < -1 ? -1 : v)

// Wire pads are the six lockstep bits PLUS the analog stick as two numbers —
// lockstep's normalizeWirePad carries finite numeric fields (#1705 opened the
// pipeline for the GravelYard mask; skyward is a stick game, and bang-bang
// bits would make a remote pilot wobble where a local one glides). x/y ride at
// 1/100 of stick — below the sim's 1/1000 hash quantiser, so both boxes feed
// their sims the exact same numbers.
export function toWire(pad) {
    const p = pad || {}
    return {
        l: !!p.left, r: !!p.right, u: !!p.up, d: !!p.down,
        s: !!p.b, a: !!p.a,
        x: Math.round(clamp1(p.x || 0) * 100) / 100,
        y: Math.round(clamp1(p.y || 0) * 100) / 100,
    }
}

export function fromWire(w) {
    const p = w || {}
    return {
        a: !!p.a, b: !!p.s,
        x: Number.isFinite(p.x) ? clamp1(p.x) : (p.r ? 1 : 0) - (p.l ? 1 : 0),
        y: Number.isFinite(p.y) ? clamp1(p.y) : (p.u ? 1 : 0) - (p.d ? 1 : 0),
        left: !!p.l, right: !!p.r, up: !!p.u, down: !!p.d,
    }
}

export const EMPTY_PAD = () => ({
    a: false, b: false, x: 0, y: 0,
    left: false, right: false, up: false, down: false,
})

// seatPads answers, for tick k, which human seats have a pad in the mirrors.
// Missing (stalled) seats are simply absent — the caller refuses to run tick k
// until every LIVE seat is in (lockstep.ready already gates that).
export function assembleSeatPads(mirrors, k, humanSeats) {
    const out = {}
    for (const s of humanSeats) {
        const m = mirrors[s]
        out[s] = m && m.has(k) ? fromWire(m.get(k)) : EMPTY_PAD()
    }
    return out
}

// foldHash is the room-level proof: every seat's stateHash, plus the shared
// tick, folded FNV-1a in seat order. If the skies match everywhere, so does
// the fold — and CPU seats ride inside it for free (decide() is pure).
export function foldHash(instances) {
    let h = 0x811c9dc5
    for (const g of instances) {
        const parts = [g.tick | 0, g.hash >>> 0]
        for (const n of parts) {
            for (let i = 0; i < 4; i++) { h ^= (n >>> (i * 8)) & 255; h = Math.imul(h, 0x01000193) }
        }
    }
    return h >>> 0
}

// hostSeed rolls a 32-bit room seed at kickoff.
export function hostSeed(now = Date.now) {
    return ((now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0) || 0x9e37
}

// --- podium -------------------------------------------------------------------
// Lockstep means every box already holds identical scores, but the host still
// broadcasts the rows (room.js §pod precedent, Tidal's #3253 shape) so a guest
// reads the ROOM's answer instead of trusting its own sort.
// Score first (the school always answers score); crashes break ties — the
// calmer pilot placed ahead — then seat keeps the order canonical.
export function podiumRows(instances, humans) {
    const live = new Set(humans)
    return instances.map((g, seat) => ({
        seat, score: g.score | 0, crashes: g.crashes | 0, human: live.has(seat),
    })).sort((a, b) => (b.score - a.score) || (a.crashes - b.crashes) || (a.seat - b.seat))
}

// podWire squashes rows onto the wire: seat, score, crashes, human bit.
export function podWire(rows) {
    return rows.map((r) => [r.seat, r.score | 0, r.crashes | 0, r.human ? 1 : 0])
}

// podRows inflates the host's broadcast into the local sheet — names come from
// this cabinet's own seat table, rank is the order the host settled.
export function podRows(rows, names = PILOT_NAMES) {
    return (rows || []).map((r, i) => ({
        seat: r[0] | 0,
        rank: i + 1,
        name: names[r[0] | 0] || `SEAT ${r[0]}`,
        score: r[1] | 0,
        crashes: r[2] | 0,
        human: !!r[3],
    }))
}

// --- takeover ---------------------------------------------------------------
// A pilot who vanishes must never stall the sky forever, and must never make
// the boxes disagree. The relay law does the work for free: a `roster`/`gone`
// broadcast reaches every box AFTER every pad the departed pilot ever sent
// (the server forwards each connection in order, and it saw the close last).
// So when THIS box processes "slot s left", s's stream is already complete in
// the mirrors everywhere — switch s to the autopilot from the next tick and
// every box makes the swap at the same stream position. No new protocol bytes,
// no wall-clock decision inside the sim.
export function humansMinus(slots, gone) {
    return (slots || []).filter((s) => s !== gone).sort((a, b) => a - b)
}

// --- desync evidence ----------------------------------------------------------
// The referee freezes the sky on divergence (#863 law: never silent) — and the
// report rides Tidal's ring: every hash boundary keeps tick, my hash, every
// peer hash that landed; when the bite lands, the bad row is marked and the
// block is copyable. Pure so skywardcheck can pin the report without a browser.
export const EVIDENCE_LIMIT = 8

export function hex32(h) { return (h >>> 0).toString(16).toUpperCase().padStart(8, '0') }

export function createEvidence(limit = EVIDENCE_LIMIT) {
    const ring = []
    const at = (k) => {
        let e = ring.find((x) => x.k === k)
        if (!e) {
            e = { k, mine: null, peers: {}, bad: false, badSlot: -1 }
            ring.push(e)
            if (ring.length > limit) ring.shift()
        }
        return e
    }
    return {
        get rows() { return ring },
        reset() { ring.length = 0 },
        mine(k, h) { at(k).mine = h >>> 0 },
        peer(k, h, slot) { at(k).peers[slot | 0] = h >>> 0 },
        mismatchSlot(k) {
            const e = ring.find((x) => x.k === k)
            if (!e) return -1
            for (const s of Object.keys(e.peers)) if (e.peers[s] !== e.mine) return s | 0
            return -1
        },
        markBad(k, slot, mine, theirs) {
            const e = at(k)
            e.bad = true
            e.badSlot = slot | 0
            e.mine = mine >>> 0
            e.theirs = theirs >>> 0
        },
        text(roomCode = '', seat = 0) {
            const slots = [...new Set(ring.flatMap((e) => Object.keys(e.peers).map(Number)))].sort((a, b) => a - b)
            const pad = (s, w) => String(s).padEnd(w)
            const cell = (h) => (h === null || h === undefined ? '--------' : hex32(h))
            const out = [`SKYWARD desync evidence — room ${roomCode || '????'} · seat ${seat}`]
            out.push(pad('tick', 6) + pad('mine', 9) + slots.map((s) => pad(`seat${s}`, 9)).join(''))
            for (const e of ring) {
                out.push(pad(e.k, 6) + pad(cell(e.mine), 9) + slots.map((s) => pad(cell(e.peers[s]), 9)).join('')
                    + (e.bad ? `  ← MISMATCH seat${e.badSlot}: mine ${hex32(e.mine)} theirs ${hex32(e.theirs)}` : ''))
            }
            return out.join('\n')
        },
    }
}

export { HOST_SLOT }
