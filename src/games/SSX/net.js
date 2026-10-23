// SSX ONLINE (#845) — pure logic, no DOM, no React, no WebSocket. Proven by
// scripts/roomcheck.mjs in plain Node. The transport + roster live in
// src/utils/room.js; this module is the *meaning* those bytes carry for a snowball
// fight down a mountain: how a roster becomes a rider field, how a racer's live
// pose is squashed into the relay's 512-byte budget, and how a tournament of
// heats becomes standings and a podium.
//
// NO LOCKSTEP, BY DESIGN (the issue): riders don't collide, so no two browsers
// need identical sims. Each racer runs the mountain locally and sees the others as
// GHOSTS driven by the position snapshots they broadcast. That means a remote
// rider's exact sim can't be reproduced bit-for-bit on another box, so the
// ONLINE STANDINGS rank the HUMANS by their reported finish times — never by a
// locally-simulated CPU — and the SAME pure reducer runs on every client from the
// SAME finish table the host broadcasts, so the podium is identical everywhere.
// CPU riders are the pace field everyone races against and fills the open seats;
// they ride locally for company but are not scored into the friends' standings.

import { PLACE_PTS } from './sim.js'

export const FIELD = 6 // the original's field size: you + five rivals

// seatIds maps the live roster to local sim rider ids. Your own seat is always
// rider 0 (the camera follows rider 0); the other human seats take ids 1..N in
// seat order; every remaining id up to FIELD is a CPU. Pure + deterministic, so
// every client agrees which field slots are humans vs CPU.
export function seatIds(yourSlot, slots, cap) {
    const remote = (slots || []).filter((s) => s !== yourSlot).sort((a, b) => a - b)
    const seatToId = { [yourSlot]: 0 }
    remote.forEach((seat, i) => { seatToId[seat] = i + 1 })
    const used = new Set(Object.values(seatToId))
    const cpuIds = []
    for (let id = 0; id < FIELD; id++) if (!used.has(id)) cpuIds.push(id)
    return { seatToId, remoteSeats: remote, cpuIds, cap: Math.min(cap || 2, FIELD) }
}

// ---- live-state snapshot codec -----------------------------------------------
// One message per racer per send; quantised hard to stay far under the relay's
// 512-byte ceiling (worst case here is ~150 bytes). A ghost needs only its
// kinematics + the pose selectors the renderer reads.
export const Q = (v, q) => Math.round((v || 0) / q) * q

export function encodeState(r, heat) {
    return {
        t: 'st', h: heat,
        d: Q(r.s, 0.05), x: Q(r.x, 0.004), y: Q(r.y, 0.05),
        v: Q(r.v, 0.05), vy: Q(r.vy, 0.05),
        sp: Q(r.spin, 5), fl: Q(r.flip, 5), iv: Q(r.invert, 5),
        gb: r.grab ? 1 : 0, gk: r.grabKind || 0, stn: r.stance || 0,
        tm: r.tumble > 0 ? 1 : 0, bs: r.boost ? 1 : 0, tk: r.tuck ? 1 : 0,
        sc: r.scrub ? 1 : 0, cr: r.crouch ? 1 : 0, ar: r.air ? 1 : 0,
        fi: r.finished ? 1 : 0, tr: r.score | 0,
    }
}

export function decodeState(m) {
    return {
        s: m.d, x: m.x, y: m.y, v: m.v, vy: m.vy,
        spin: m.sp, flip: m.fl, invert: m.iv,
        grab: !!m.gb, grabKind: m.gk | 0, stance: m.stn | 0,
        tumble: m.tm ? 1 : 0, boost: !!m.bs, tuck: !!m.tk, scrub: !!m.sc,
        crouch: !!m.cr, air: !!m.ar, finished: !!m.fi, trickScore: m.tr | 0,
        heat: m.h | 0,
    }
}

// pruneGhosts drops ghosts whose local rider id is no longer a live remote seat
// (#858 #3: a friend who leaves mid-heat leaves a ghost parked at their last
// position — the roster already shed the seat, but the stale pose must go too,
// or the renderer keeps drawing a ghost for a racer who is gone). Returns the
// ids it removed so the caller can log/verify. Pure (mutates the given map).
export function pruneGhosts(ghosts, liveIds) {
    const live = new Set(liveIds)
    const removed = []
    for (const k of Object.keys(ghosts)) {
        const id = k | 0
        if (!live.has(id)) { delete ghosts[k]; removed.push(id) }
    }
    return removed
}

// applyGhost overwrites the LOCAL stand-in rider with a remote racer's snapshot so
// the existing poseRider path draws them at the right place on the shared course.
// The caller (index.jsx) must have already skipped sim-stepping this id.
export function applyGhost(r, gs) {
    if (!gs) return r
    r.s = gs.s; r.x = gs.x; r.y = gs.y; r.v = gs.v; r.vy = gs.vy
    r.spin = gs.spin; r.flip = gs.flip; r.invert = gs.invert
    r.grab = gs.grab; r.grabKind = gs.grabKind; r.stance = gs.stance
    r.tumble = gs.tumble; r.boost = gs.boost; r.tuck = gs.tuck; r.scrub = gs.scrub
    r.crouch = gs.crouch; r.air = gs.air; r.finished = gs.finished
    r.score = gs.trickScore
    return r
}

// ---- standings reducer -----------------------------------------------------
// heatOrder ranks human seats by finish time (fastest first); missing seats get
// the bottom, order-stable. Returns seats in placement order.
export function heatOrder(seats, finishes) {
    const arr = seats.slice()
    arr.sort((a, b) => {
        const ta = finishes[a], tb = finishes[b]
        const da = ta == null ? Infinity : ta
        const db = tb == null ? Infinity : tb
        if (da !== db) return da - db
        return a - b // deterministic tie-break by seat
    })
    return arr
}

// heatPoints maps placement order to the original's place points (1st=10 ...).
export function heatPoints(order) {
    const pts = {}
    order.forEach((seat, i) => { pts[seat] = PLACE_PTS[Math.min(PLACE_PTS.length - 1, i)] })
    return pts
}

// makeTournament is the standings accumulator shared verbatim by host and guests.
// Feed it the SAME heat results (broadcast by the host) and every box converges on
// an identical podium — that is the "standings and a podium" clause, provable here.
export function makeTournament(seats) {
    const total = {}
    seats.forEach((s) => { total[s] = 0 })
    const heats = []
    return {
        seats: seats.slice(),
        total,
        heats,
        addHeat(seat, heatResults) {
            heats.push({ heat: seat, results: heatResults })
        },
        applyResult(order, pts) {
            for (const seat of Object.keys(pts)) {
                const s = seat | 0
                total[s] = (total[s] || 0) + pts[s]
            }
            heats.push({ order: order.slice(), pts: Object.assign({}, pts) })
        },
        podium() {
            return seats.slice().sort((a, b) => {
                if ((total[b] || 0) !== (total[a] || 0)) return (total[b] || 0) - (total[a] || 0)
                return a - b
            })
        },
        standings() { return Object.assign({}, total) },
    }
}

// resolveHeat: given the human seats and their reported finish times, produce the
// placement order + points + the running totals. One call per heat; identical on
// every client given the same `finishes`.
export function resolveHeat(seats, finishes, totals) {
    const order = heatOrder(seats, finishes)
    const pts = heatPoints(order)
    const next = Object.assign({}, totals)
    for (const seat of seats) next[seat] = (next[seat] || 0) + pts[seat]
    return { order, pts, totals: next }
}

// podiumSeats ranks seats by accumulated points (ties by seat).
export function podiumSeats(seats, totals) {
    return seats.slice().sort((a, b) => {
        if ((totals[b] || 0) !== (totals[a] || 0)) return (totals[b] || 0) - (totals[a] || 0)
        return a - b
    })
}

// computeStandings is THE online standings reducer. `heats[seat]` is an array of
// that racer's finish time per heat (null if not (yet) finished). It scores every
// heat by finish order (missing = last, ties by seat), sums the place points, and
// returns { totals, podium, done } where done = every seat finished every heat.
// Pure + deterministic: the relay forwards each racer's finish to ALL others, so
// every box holds the SAME heats table and lands on the SAME podium — the friends'
// standings converge with no lockstep and no authority.
export function computeStandings(seats, heats, heatCount) {
    const totals = {}
    seats.forEach((s) => { totals[s] = 0 })
    const n = Math.max(1, heatCount)
    for (let h = 0; h < n; h++) {
        const fin = {}
        for (const s of seats) fin[s] = heats[s] && heats[s][h] != null ? heats[s][h] : null
        const order = heatOrder(seats, fin)
        const pts = heatPoints(order)
        for (const s of seats) totals[s] += pts[s]
    }
    let done = true
    for (const s of seats) for (let h = 0; h < n; h++) if (!(heats[s] && heats[s][h] != null)) done = false
    return { totals, podium: podiumSeats(seats, totals), done }
}
