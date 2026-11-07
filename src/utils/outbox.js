// OUTBOX SHELL (#1711 S6) — IndexedDB mechanics for "uploads survive the
// phone". Rules live in outboxCore.js (pure, pinned by recordcheck); this
// file is the holding pen and the retry loop:
//
//   queueRun(rec, player)   — persist a finished take BEFORE the upload is
//                             attempted (the crash window is exactly the await
//                             on fetch); returns the entry, or null when the
//                             device has no IndexedDB (private mode Firefox:
//                             today's single-attempt behavior, honest degrade).
//   drain({ upload, motion }) — retry the queue oldest-first against whatever
//                             `upload` says. Success removes the entry (the
//                             store has it); permanent failures remove it by
//                             rule; a dead store ENDS THE PASS with the queue
//                             intact — no hammering, the next trigger retries.
//
// The IDB factory is injectable (`setOutboxFactory`) so recordcheck drives
// the whole shell in Node with a fake store; the browser passes the real
// indexedDB. Entries are structured-clone plain data (voice is base64 — the
// whole rec is JSON-safe), so the browser and the fake agree by construction.

import { planAdd, planDrain, classifyFailure } from './outboxCore.js'

export const OUTBOX_DB = 'retrogames-outbox-v1'
export const OUTBOX_STORE = 'outbox'

// --- IDB adapter ------------------------------------------------------------
// makeOutbox(factory) -> store handle { all, add, remove, count } or null.
// The adapter is small and the API surface it touches is exactly: open +
// createObjectStore(keyPath 'id') + readwrite transactions with add/getAll/
// delete/count — recordcheck's fake implements the same contract.

export function makeOutbox(factory) {
    if (!factory || typeof factory.open !== 'function') return null
    let dbPromise = null
    const db = () => {
        if (!dbPromise) {
            dbPromise = new Promise((resolve, reject) => {
                let req
                try { req = factory.open(OUTBOX_DB, 1) } catch (e) { return reject(e) }
                req.onupgradeneeded = () => {
                    const d = req.result
                    if (!d.objectStoreNames.contains(OUTBOX_STORE)) d.createObjectStore(OUTBOX_STORE, { keyPath: 'id' })
                }
                req.onsuccess = () => {
                    const d = req.result
                    d.onversionchange = () => { d.close(); dbPromise = null }
                    resolve(d)
                }
                req.onerror = () => reject(req.error || new Error('indexedDB open failed'))
                req.onblocked = () => reject(new Error('indexedDB open blocked'))
            }).catch((e) => { dbPromise = null; throw e })
        }
        return dbPromise
    }
    const tx = (mode, fn) => db().then((d) => new Promise((resolve, reject) => {
        try {
            const t = d.transaction(OUTBOX_STORE, mode)
            const req = fn(t.objectStore(OUTBOX_STORE))
            t.oncomplete = () => resolve(req && req.result)
            t.onerror = () => reject(t.error || new Error('indexedDB transaction failed'))
            t.onabort = () => reject(t.error || new Error('indexedDB transaction aborted'))
        } catch (e) { reject(e) }
    }))
    return {
        all: () => tx('readonly', (s) => s.getAll()),
        count: () => tx('readonly', (s) => s.count()),
        add: (entry) => tx('readwrite', (s) => s.add(entry)),
        remove: (id) => tx('readwrite', (s) => s.delete(id)),
    }
}

let store = null
let factoryInjected = false

// setOutboxFactory — tests inject a fake; the browser gets the real thing on
// first use. Pass null to force the unavailable path (honest no-op).
export function setOutboxFactory(factory) {
    factoryInjected = true
    store = makeOutbox(factory)
}

function theStore() {
    if (!factoryInjected) {
        factoryInjected = true
        store = makeOutbox(typeof globalThis !== 'undefined' ? globalThis.indexedDB : null)
    }
    return store
}

// --- queue operations ---------------------------------------------------------

export function newEntryId(rec) {
    return `${rec.game}-seed${rec.seed}-t${rec.ticks}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

// queueRun — persist a finished take for retry. Evicted entries (cap overflow)
// are removed from the pen; the fresh entry is never the victim (planAdd).
// Returns the entry, or null when there is no pen (then endRun behaves as
// before the outbox existed).
export async function queueRun(rec, player = 'player') {
    const s = theStore()
    if (!s || !rec) return null
    const entry = {
        id: newEntryId(rec),
        savedAt: Date.now(),
        game: rec.game,
        seed: rec.seed,
        ticks: rec.ticks,
        player: String(player || 'player'),
        rec,
    }
    try {
        const { evicted } = planAdd((await s.all()) || [], entry)
        for (const v of evicted) { try { await s.remove(v.id) } catch { /* one failed eviction still leaves room if add lands */ } }
        await s.add(entry)
        return entry
    } catch {
        return null // pen unusable (quota/private): behave like a device without an outbox
    }
}

// dropEntry — remove one entry by id (endRun's success path: the store has
// it, so the pen must not). Silent on missing (already gone is success).
export async function dropEntry(id) {
    const s = theStore()
    if (!s || !id) return false
    try { await s.remove(id); return true } catch { return false }
}

// drain — single-flight retry pass. `upload(entry)` resolves to the
// uploadSession-shaped { uploaded, reason?, key? }; `motion` is the LIVE
// consent flag (planDrain purges everything when it is false).
let draining = null

export function drain(opts = {}) {
    if (draining) return draining
    draining = runDrain(opts).finally(() => { draining = null })
    return draining
}

async function runDrain({ upload = null, motion = false, now = Date.now(), maxAgeMs, classify = classifyFailure } = {}) {
    const s = theStore()
    const out = { available: !!s, sent: [], dropped: [], kept: [], queued: 0 }
    if (!s || typeof upload !== 'function') {
        try { out.queued = s ? await s.count() : 0 } catch { /* unreadable pen reads as empty */ }
        return out
    }
    let all = []
    try { all = (await s.all()) || [] } catch { return out }
    const plan = planDrain(all, { motion, now, maxAgeMs })
    for (const d of plan.drop) {
        try { await s.remove(d.id); out.dropped.push(d) } catch { /* keep trying the rest */ }
    }
    for (const e of plan.send) {
        let res = null
        try { res = await upload(e) } catch (err) { res = { uploaded: false, reason: `store unreachable: ${String((err && err.message) || err)}` } }
        if (res && res.uploaded) {
            try { await s.remove(e.id) } catch { /* store has it — a lingering local copy re-uploads at worst dupes a row, and rows stamp on upload time; honest enough, note it */ }
            out.sent.push({ id: e.id, key: res.key || null })
            continue
        }
        const why = (res && res.reason) || 'upload failed'
        if (classify(why) === 'drop') {
            try { await s.remove(e.id); out.dropped.push({ id: e.id, reason: why }) } catch { /* nothing left to do */ }
        } else {
            out.kept.push({ id: e.id, reason: why })
            break // store down — end the pass quietly; boot/online triggers retry
        }
    }
    try { out.queued = await s.count() } catch { /* stats only */ }
    return out
}
