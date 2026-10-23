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
export const ROOM_CAP_MAX = 4
// 'pad','hs','start' are the lockstep wire (#531, Gauntlet). The rest are the
// reusable ROOM layer (#845): 'roster' is server->all presence, 'go' host->all
// kickoff, 'st' every-racer->others live state, 'fin' racer->host finish report,
// 'res' host->all per-heat results, 'pod' host->all final podium, 'bye' graceful
// leave. Every room type is forwarded to ALL OTHER members (see relay()), which
// is what makes the same relay serve a 2P lockstep AND a 4P ghost race.
export const FORWARD_TYPES = ['pad', 'hs', 'start', 'roster', 'go', 'st', 'fin', 'res', 'pod', 'bye']

export function makeCode(rand) {
    let s = ''
    for (let i = 0; i < 4; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)]
    return s
}

export function newRoom(code, maxMembers = MAX_MEMBERS) {
    const max = Math.max(1, Math.min(ROOM_CAP_MAX, maxMembers | 0 || MAX_MEMBERS))
    return { code, members: [], rate: 0, win: 0, max }
}

// rosterOf builds the server->all presence broadcast: which seats are live and
// the room's capacity, so every client can fill the remaining seats with CPUs.
export function rosterOf(room) {
    return { t: 'roster', n: room.members.length, cap: room.max, slots: room.members.map((m) => m.slot) }
}

// join returns { ok, slot, peers } or { ok:false, err }. A rejoin of the same
// id reclaims its seat (browser reload mid-room); otherwise a full room refuses.
export function join(room, id) {
    const again = room.members.find((m) => m.id === id)
    if (again) return { ok: true, slot: again.slot, peers: room.members.length, rejoin: true }
    if (room.members.length >= room.max) return { ok: false, err: 'full' }
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

// CORS (#886) — the FEEDBACK button lives on jalfern.com pages but talks to this
// worker on *.workers.dev, so every /status fetch and /feedback POST is
// cross-origin: without Access-Control-Allow-Origin the browser kills the request
// (the button never shows) and the POST preflight never reaches GitHub. Allowed
// origins are the arcade and its deploy surface plus localhost for dev/QA. An
// unknown origin gets NO ACAO header — the browser blocks it, which is the point:
// this endpoint files GitHub issues, so the allowlist is its only front door.

export const CORS_ALLOW = [
    'https://jalfern.com',
    'https://www.jalfern.com',
    'https://retrogames.jalfern.workers.dev',
]
export const CORS_ALLOW_METHODS = 'GET,POST,OPTIONS'
export const CORS_ALLOW_HEADERS = 'content-type'
export const CORS_MAX_AGE = '86400'

export function corsOrigin(origin) {
    if (!origin || typeof origin !== 'string') return null
    if (CORS_ALLOW.indexOf(origin) >= 0) return origin
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin
    return null
}

export function corsHeaders(origin) {
    const allow = corsOrigin(origin)
    if (!allow) return {}
    return {
        'access-control-allow-origin': allow,
        'access-control-allow-methods': CORS_ALLOW_METHODS,
        'access-control-allow-headers': CORS_ALLOW_HEADERS,
        'access-control-max-age': CORS_MAX_AGE,
        vary: 'Origin',
    }
}

// FEEDBACK (#737) — the in-game feedback button files GitHub issues THROUGH this
// relay so the GitHub token stays server-side and never reaches the browser. The
// payload is a game report: a note plus a screenshot, game/build/state metadata,
// and — the core of it — the last 30 seconds of input in the SAME
// retrogames-rec/v1 shape QA already replays. validateFeedback() is the single
// gate on that payload (size caps so a tester can't POST a 10 MB screenshot); it
// is pure so the token-free part of filing is provable in plain Node.

export const FB_MAX_NOTE = 2000
export const FB_MAX_SCREENSHOT = 1_500_000 // base64 data-url bytes
export const FB_MAX_STATE = 4000
export const FB_MAX_DIAG = 8000
export const FB_MAX_INPUT = 200_000
export const FB_MAX_PADS = 30 * 60 // hard ceiling: 30 s @ 60 fps
export const FB_LABELS = ['feedback']
export const FB_AWAIT_LABEL = 'needs-approval'

const byteLen = (v) => {
    try { return new TextEncoder().encode(JSON.stringify(v)).length } catch { return Infinity }
}

// validateFeedback returns { ok:true } or { ok:false, err }. Every cap is a
// cheap type/size check — no game runs here, the relay only ever files text.
export function validateFeedback(body) {
    if (!body || typeof body !== 'object') return { ok: false, err: 'body must be an object' }
    const note = typeof body.note === 'string' ? body.note.trim() : ''
    if (!note) return { ok: false, err: 'note required' }
    if (note.length > FB_MAX_NOTE) return { ok: false, err: `note too long (>${FB_MAX_NOTE})` }
    if (typeof body.gameId !== 'string' || !body.gameId || body.gameId.length > 64) {
        return { ok: false, err: 'gameId required' }
    }
    if (body.build !== undefined && (typeof body.build !== 'string' || body.build.length > 40)) {
        return { ok: false, err: 'bad build' }
    }
    if (body.route !== undefined && (typeof body.route !== 'string' || body.route.length > 200)) {
        return { ok: false, err: 'bad route' }
    }
    if (body.ua !== undefined && (typeof body.ua !== 'string' || body.ua.length > 200)) {
        return { ok: false, err: 'bad ua' }
    }
    if (body.screenshot !== undefined) {
        if (typeof body.screenshot !== 'string' || !body.screenshot.startsWith('data:image/')
            || body.screenshot.length > FB_MAX_SCREENSHOT) {
            return { ok: false, err: 'bad screenshot' }
        }
    }
    if (body.state !== undefined) {
        if (!body.state || typeof body.state !== 'object' || byteLen(body.state) > FB_MAX_STATE) {
            return { ok: false, err: 'bad state' }
        }
    }
    if (body.diag !== undefined) {
        if (!body.diag || typeof body.diag !== 'object' || byteLen(body.diag) > FB_MAX_DIAG) {
            return { ok: false, err: 'bad diag' }
        }
    }
    if (body.input !== undefined) {
        const inp = body.input
        if (!inp || typeof inp !== 'object') return { ok: false, err: 'bad input' }
        if (inp.seed !== undefined && !Number.isInteger(inp.seed)) return { ok: false, err: 'bad seed' }
        if (!Array.isArray(inp.pads)) return { ok: false, err: 'input.pads must be an array' }
        if (inp.pads.length > FB_MAX_PADS) return { ok: false, err: 'too many pads' }
        for (const f of inp.pads) {
            if (!f || typeof f !== 'object' || !Number.isInteger(f.t) || f.t < 1) {
                return { ok: false, err: 'bad pad frame' }
            }
            if (f.pad !== undefined && typeof f.pad !== 'string' && typeof f.pad !== 'object') {
                return { ok: false, err: 'bad pad codec' }
            }
        }
        if (byteLen(inp) > FB_MAX_INPUT) return { ok: false, err: 'input too large' }
    }
    return { ok: true }
}

// A tester key other than Jon's quarantines the report behind needs-approval
// "as today" (the phone-friend tier). Jon's key files straight into feedback.
export function feedbackLabels(isJon) {
    return isJon ? FB_LABELS.slice() : FB_LABELS.concat(FB_AWAIT_LABEL)
}

// GitHub issue payload from a validated report. No secrets, no network here — the
// worker attaches the Authorization header. The token NEVER appears in the body.
export function buildFeedbackIssue(body, isJon) {
    const note = body.note.trim()
    const title = `FEEDBACK ${body.gameId}: ${note.split('\n')[0].slice(0, 68)}`
    const lines = [note, '']
    lines.push('```', `game:  ${body.gameId}`, `build: ${body.build || '?'}`, `route: ${body.route || '?'}`)
    if (body.ua) lines.push(`ua:    ${body.ua}`)
    lines.push('```')
    if (body.state) lines.push('', 'State:', '```json', JSON.stringify(body.state, null, 2), '```')
    if (body.diag) lines.push('', 'Diagnostics:', '```json', JSON.stringify(body.diag, null, 2), '```')
    if (body.input) {
        lines.push('', `Last ${body.input.durationSec || 30}s of input (seed ${body.input.seed ?? '?'}, retrogames-rec/v1):`, '```json', JSON.stringify(body.input), '```')
    }
    if (body.screenshot) lines.push('', `Screenshot: data URL attached (${Math.round(body.screenshot.length / 1024)} KB base64)`)
    return { title, body: lines.join('\n'), labels: feedbackLabels(!!isJon) }
}

export function registryRemove(reg, code) {
    reg.rooms.delete(code)
}

export function registryCount(reg) {
    return reg.rooms.size
}
