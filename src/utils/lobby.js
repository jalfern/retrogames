// LOBBY (#1039) — ONE join flow for every multiplayer game. SSX's room layer
// (#845) worked; this lifts the shared shape out of the games so hosting and
// joining feel identical everywhere: the host opens a 4-letter code, friends
// join a waiting room, the host starts. It rides src/utils/room.js (transport,
// roster, seats) and never touches the relay; games keep their own meaning for
// the bytes (SSX ghosts, Blob lockstep, Gauntlet heroes + hashes) and plug it
// in via onStart(payload) / lobby.room.on(type, handler).
//
// The slot model is the generic one from src/utils/slotSources.js (#494):
// every seat is 'host' | 'human' | 'cpu' | 'model'. Human seats come from the
// live roster; cpu seats fill the field so a room is always playable solo; the
// host may mark open seats 'model' (QA bot / RL driver — the shelf), and model
// seats are still seats, not cheaters: they only ever drive through the pad.
//
// Pure: no DOM, no React, no WebSocket. `makeTransport` is injected, so
// scripts/lobbycheck.mjs proves the whole flow in plain Node over an
// in-memory pipe AND over the real relay.

import { createRoom, decodeCode, HOST_SLOT } from './room.js'
import { retryDelay } from './lockstep.js'
import { CODE_ALPHABET, CODE_RE, makeCode } from '../../relay/core.js'

export { decodeCode, makeCode, CODE_ALPHABET, CODE_RE, HOST_SLOT }

export const LOBBY_PARAM = 'net'
export const ROOM_PARAM = 'room'

// lobbyRole reads the canonical query: ?net=host / ?net=join&room=CODE.
// Every game parses the join flow the same way — that sameness IS the feature.
export function lobbyRole(search) {
    const q = new URLSearchParams(String(search || ''))
    return q.get(LOBBY_PARAM) === 'host' ? 'host' : q.get(LOBBY_PARAM) === 'join' ? 'guest' : null
}

export function relayFromQuery(search, fallback = 'wss://retrogames.jalfern.workers.dev') {
    const q = new URLSearchParams(String(search || ''))
    return (q.get('relay') || fallback).replace(/^http/, 'ws')
}

// joinHref is the share link for a game's lobby — same shape in every game:
// /retrogames/<slug>?net=join&room=CODE (+ relay override when pointed elsewhere).
export function joinHref(slug, code, relay) {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://jalfern.com'
    let url = `${origin}/retrogames/${slug}?net=join&room=${code}`
    if (relay) url += `&relay=${relay}`
    return url
}

// seatModel labels every seat up to cap with the generic slot vocabulary.
// `models` (iterable of seat numbers) upgrades OPEN seats to 'model'; a model
// label never overwrites a human — a friend at the wheel outranks a bot plan.
export function seatModel(cap, slots, models) {
    const live = new Set(slots || [])
    const chosen = new Set(models || [])
    return Array.from({ length: cap }, (_, i) => (
        live.has(i) ? (i === HOST_SLOT ? 'host' : 'human') : (chosen.has(i) ? 'model' : 'cpu')
    ))
}

// displayPhase folds the room's phase + refusal info into the label every
// game shows, so "ROOM FULL" reads the same in SSX, Blob Battle and Gauntlet.
export function displayPhase(room) {
    if (room.phase === 'offline' && room.info) return 'refused'
    return room.phase
}

// createLobby(opts):
//   slug          game path segment for the share link ('ssx', 'blob-battle', 'gauntlet')
//   cap           seats in the room (2 for pairs, 4 for SSX)
//   relay         ws base url
//   makeTransport injectable transport factory (required; browser passes WS)
//   models        iterable of open seat numbers to mark 'model' at the start
//   retry         auto-reconnect while waiting (default on, 6 tries, #546 ladder)
//   onStart(payload)  the room kicked off (host's local start AND guest 'go')
//   onState(state)    every observable change — the games push it into React
//   onJoin/onLeave/onGone/onClose/onError  presence + lifecycle passthrough
//   on          { go, st, pad, hs, ... } game-message handlers ride room.on
export function createLobby(opts = {}) {
    const cap = opts.cap || 2
    const retry = opts.retry !== false
    const maxRetry = opts.maxRetry != null ? opts.maxRetry : 6
    const models = new Set(opts.models || [])

    const state = () => ({
        slug: opts.slug || '',
        role: room.role,
        phase: displayPhase(room),
        code: room.code,
        slot: room.yourSlot,
        cap: room.cap,
        seats: seatModel(room.cap, liveSlots(), models),
        models: [...models].sort((a, b) => a - b),
        joinHref: room.code ? joinHref(opts.slug, room.code, opts.shareRelay ? opts.relay : '') : '',
        info: room.info,
    })

    const push = () => { if (opts.onState) opts.onState(state()) }

    // seats know yourself: before the first roster lands, your own seat is
    // already taken — the host seat must show as HOST from the first frame.
    const liveSlots = () => {
        const s = room.slots.slice()
        if (room.yourSlot >= 0 && s.indexOf(room.yourSlot) < 0) { s.push(room.yourSlot); s.sort((a, b) => a - b) }
        return s
    }

    const room = createRoom({
        relay: opts.relay,
        makeTransport: opts.makeTransport,
        onPhase: () => push(),
        onRoster: (r) => { if (opts.onRoster) opts.onRoster(r); push() },
        onJoin: (e) => { if (opts.onJoin) opts.onJoin(e); push() },
        onLeave: (e) => { if (opts.onLeave) opts.onLeave(e); push() },
        onClose: (attempt) => {
            if (opts.onClose) opts.onClose(attempt)
            if (room.phase === 'idle') return
            if (!retry || attempt >= maxRetry) { room.setPhase('offline'); return }
            room.attempt = attempt + 1
            room.setPhase('reconnecting')
            room.clearRetry()
            room.retryTimer = setTimeout(() => room.connect(room.code, cap), retryDelay(attempt))
        },
        on: Object.assign({}, opts.on, {
            go: (m) => {
                if (room.role !== 'host') { room.setPhase('racing'); if (opts.onStart) opts.onStart(m) }
            },
        }),
    })

    const lobby = {
        room,
        state,
        push,

        open(code) {
            const c = code || makeCode(Math.random)
            if (!CODE_RE.test(c)) return false
            room.connect(c, cap)
            push()
            return true
        },

        join(code) {
            const c = decodeCode(code)
            if (!c) return false
            room.connect(c, 0)
            push()
            return true
        },

        // start is host-only, waiting-only: the host gets the room, the host
        // starts the room. Payload (seed, heroes, tier…) is the game's own.
        start(payload) {
            if (room.role !== 'host' || room.phase !== 'waiting') return false
            room.send('go', payload || {})
            room.setPhase('racing')
            if (opts.onStart) opts.onStart(payload || {})
            push()
            return true
        },

        modelSeat(seat) {
            if (room.slots.indexOf(seat) >= 0 || seat >= cap) return false
            models.add(seat)
            push()
            return true
        },

        unmodelSeat(seat) {
            if (!models.delete(seat)) return false
            push()
            return true
        },

        modelSeats() {
            const live = liveSlots()
            return [...models].filter((s) => live.indexOf(s) < 0 && s < cap).sort((a, b) => a - b)
        },

        close() {
            room.reset()
            models.clear()
            push()
        },
    }
    return lobby
}
