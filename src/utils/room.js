// ROOM (#845) — the reusable client for head-to-head rooms over the relay.
// Gauntlet's lockstep (#531) is ONE pair on the relay; this generalises it to a
// ROOM of up to ROOM_CAP_MAX (4) racers that any game can adopt: a host opens a
// 4-letter code, friends join, the roster fills, the host starts, and every
// racer's live state flows to every OTHER racer. It is deliberately transport-
// agnostic: `makeTransport(url)` is injected (the browser passes a WebSocket
// factory; scripts/roomcheck.mjs passes an in-memory pipe) so the whole lobby,
// roster and seat logic is provable in plain Node without a network or a DOM.
//
// The relay itself (relay/core.js) only moves bytes and guards the free tier;
// presence is rebuilt client-side from the `welcome` (your seat) + `roster`
// (live seats) the server broadcasts on every join/leave. Seat 0 is the host
// (first to open the room). The game layer that rides a room decides what each
// message MEANS (SSX uses go/st/fin/res/pod); room.js just routes them and
// tracks who is here.

export const HOST_SLOT = 0

// decodeCode accepts the ?room=CODE url param, upper-cased; '' when absent/bad.
export function decodeCode(raw) {
    const s = String(raw || '').toUpperCase()
    return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/.test(s) ? s : ''
}

// seatKinds turns the live roster into per-seat labels for the waiting room and
// for filling the CPU field: seats in `slots` are humans, the rest up to `cap`
// are 'cpu'. Slot 0 is the host. `names`/`selfSlot` let the HUD label itself.
export function seatKinds(cap, slots) {
    const live = new Set(slots)
    return Array.from({ length: cap }, (_, i) => (live.has(i) ? (i === HOST_SLOT ? 'host' : 'human') : 'cpu'))
}

// createRoom manages one connection. opts:
//   makeTransport(url) -> { send(str), onClose(cb), close() }  (required)
//   relay  base url, e.g. 'wss://host'  (url = `${relay}/room/${code}?cap=N`)
//   onError({err}) / onPhase(phase) / onRoster({n,cap,slots}) lifecycle hooks
//   onJoin(slot) onLeave(slot) onPeer(slot) onGone()  presence deltas
//   on(type, handler)  subscribe a forwarded game message (go/st/fin/res/pod)
export function createRoom(opts = {}) {
    const relay = opts.relay || ''
    const makeTransport = opts.makeTransport
    const handlers = new Map()
    const emit = (type, msg) => { const h = handlers.get(type); if (h) h(msg) }

    const room = {
        phase: 'idle',       // idle | connecting | waiting | racing | gone | offline
        role: null,          // 'host' | 'guest' (assigned on welcome)
        code: '',
        cap: 2,
        yourSlot: -1,
        slots: [],           // live human seats
        peers: 0,
        info: '',
        ws: null,
        attempt: 0,
        maxRetry: 0,
        retryTimer: 0,
        _lastRoster: '',

        setPhase(p) { room.phase = p; if (opts.onPhase) opts.onPhase(p) },

        connect(code, cap = 0) {
            if (!makeTransport) throw new Error('room: makeTransport required')
            room.code = code
            if (cap > 0) room.cap = cap
            room.clearRetry()
            if (room.ws) { try { room.ws.close() } catch { /* gone */ } room.ws = null }
            room.setPhase('connecting')
            let t
            try { t = makeTransport(`${relay}/room/${code}${cap > 0 ? `?cap=${cap}` : ''}`) } catch { room.setPhase('offline'); return }
            room.ws = t
            t.onMessage((str) => { let obj = null; try { obj = JSON.parse(str) } catch { return } room.recv(obj) })
            t.onClose(room.onClosed)
            return t
        },

        // feed an parsed inbound message (the transport's onMessage routes here).
        recv(obj) {
            if (!obj || typeof obj !== 'object') return
            const t = obj.t
            if (t === 'welcome') {
                room.attempt = 0
                room.yourSlot = obj.you | 0
                room.role = room.yourSlot === HOST_SLOT ? 'host' : 'guest'
                if (Number.isFinite(obj.cap)) room.cap = obj.cap
                room.setPhase('waiting')
            } else if (t === 'roster') {
                room.cap = obj.cap || room.cap
                const prev = new Set(room.slots)
                room.slots = (obj.slots || []).slice().sort((a, b) => a - b)
                room.peers = room.slots.length
                const nowSet = new Set(room.slots)
                // presence deltas are about OTHER racers — never yourself.
                for (const s of room.slots) if (!prev.has(s) && s !== room.yourSlot) { emit('join', { slot: s }); if (opts.onJoin) opts.onJoin({ slot: s }) }
                for (const s of prev) if (!nowSet.has(s) && s !== room.yourSlot) { emit('leave', { slot: s }); if (opts.onLeave) opts.onLeave({ slot: s }) }
                room._lastRoster = room.slots.join(',')
                if (opts.onRoster) opts.onRoster({ n: room.peers, cap: room.cap, slots: room.slots })
            } else if (t === 'peer') {
                // legacy 2P signal (Gauntlet-era). Kept so old peers still pair.
                room.peers = Math.max(room.peers, obj.n | 0)
                emit('peer', { n: obj.n })
            } else if (t === 'gone') {
                // A racer left but the room lives on (the relay closes the socket
                // itself when it empties). Ghost lifecycle is driven by roster
                // deltas; 'gone' is just a heads-up the game reads per-phase.
                emit('gone', {})
            } else if (t === 'err') {
                room.info = obj.e || 'refused'
                room.setPhase('offline')
            } else if (typeof t === 'string') {
                emit(t, obj)
            }
        },

        // onClosed decides (with backoff) whether a dropped socket is worth
        // retrying; the caller drives retryDelay so roomcheck can pin the ladder.
        onClosed() {
            if (room.phase === 'racing' || room.phase === 'gone' || room.phase === 'offline') return
            if (opts.onClose) opts.onClose(room.attempt)
        },

        clearRetry() { clearTimeout(room.retryTimer); room.retryTimer = 0 },

        send(type, payload) {
            if (!room.ws) return false
            const msg = Object.assign({ t: type, s: room.yourSlot }, payload || {})
            try { room.ws.send(JSON.stringify(msg)) } catch { return false }
            return true
        },

        on(type, handler) { handlers.set(type, handler) },

        // human seats still empty up to cap — the game fills these with CPUs.
        cpuSeats() {
            const live = new Set(room.slots)
            const out = []
            for (let i = 0; i < room.cap; i++) if (!live.has(i)) out.push(i)
            return out
        },

        reset() {
            room.clearRetry()
            if (room.ws) { try { room.ws.close() } catch { /* gone */ } room.ws = null }
            room.phase = 'idle'; room.role = null; room.code = ''; room.yourSlot = -1
            room.slots = []; room.peers = 0; room.info = ''; room.attempt = 0
        },
    }

    // per-type subscriptions from opts.on: { go:fn, st:fn, ... }
    if (opts.on) for (const k of Object.keys(opts.on)) room.on(k, opts.on[k])

    return room
}
