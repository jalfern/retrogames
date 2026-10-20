// ONLINE 2P RELAY (#531) — pure room logic, shared by three hosts:
//   relay/worker.js   Cloudflare Worker + Durable Object (production)
//   relay/server.mjs  plain Node/ws server (netcheck browser tier)
//   scripts/netcheck.mjs  in-process unit tier
// The relay NEVER runs the game: it forwards JSON pads between exactly two
// browsers. Lockstep, seeds and desync checks live client-side (src/utils/
// lockstep.js); the relay only moves bytes and guards the free tier:
// 4-letter codes (no I/O/0/1), 512B messages, a per-room rate window, an
// idle-room alarm and a global room cap.

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/
export const MAX_MSG = 512
export const RATE_MAX = 240
export const RATE_WINDOW = 1000
export const IDLE_MS = 90000
export const REG_TTL_MS = 3600000
export const MAX_ROOMS = 120
export const MAX_MEMBERS = 2
export const FORWARD_TYPES = ['pad', 'hs', 'start']

export function makeCode(rand) {
    let s = ''
    for (let i = 0; i < 4; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)]
    return s
}

export function newRoom(code) {
    return { code, members: [], rate: 0, win: 0 }
}

// join returns { ok, slot, peers } or { ok:false, err }. A rejoin of the same
// id reclaims its seat (browser reload mid-room); otherwise a full room refuses.
export function join(room, id) {
    const again = room.members.find((m) => m.id === id)
    if (again) return { ok: true, slot: again.slot, peers: room.members.length, rejoin: true }
    if (room.members.length >= MAX_MEMBERS) return { ok: false, err: 'full' }
    room.members.push({ id, slot: room.members.length })
    return { ok: true, slot: room.members.length - 1, peers: room.members.length }
}

export function leave(room, id) {
    const i = room.members.findIndex((m) => m.id === id)
    if (i < 0) return { gone: false, empty: room.members.length === 0 }
    room.members.splice(i, 1)
    return { gone: room.members.length > 0, empty: room.members.length === 0 }
}

// relay is the ONLY data path: rate-window guard, size is the caller's job
// (workers get bytes first), type allowlist, forward to the other member only.
export function relay(room, fromId, obj) {
    const now = Date.now()
    if (now - room.win > RATE_WINDOW) { room.win = now; room.rate = 0 }
    room.rate++
    if (room.rate > RATE_MAX) return { ok: false, err: 'rate' }
    if (!obj || typeof obj !== 'object' || FORWARD_TYPES.indexOf(obj.t) < 0) return { ok: false, err: 'type' }
    const to = room.members.filter((m) => m.id !== fromId).map((m) => m.id)
    return { ok: true, to }
}

export function newRegistry() {
    return { rooms: new Map() }
}

// registry guards the free tier: at most MAX_ROOMS live codes. Entries older
// than REG_TTL_MS are stale leases (crashed rooms) and get reclaimed.
export function registryAdd(reg, code, now) {
    if (reg.rooms.has(code)) return true
    if (reg.rooms.size >= MAX_ROOMS) {
        for (const [c, at] of reg.rooms) if (now - at > REG_TTL_MS) reg.rooms.delete(c)
        if (reg.rooms.size >= MAX_ROOMS) return false
    }
    reg.rooms.set(code, now)
    return true
}

export function registryRemove(reg, code) {
    reg.rooms.delete(code)
}

export function registryCount(reg) {
    return reg.rooms.size
}
