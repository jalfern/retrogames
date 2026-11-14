// RELAY SIM (#1711 S5) — the PRODUCTION worker (relay/worker.js) running in
// plain Node behind a real HTTP server on 127.0.0.1, with a faithful in-memory
// R2 mock. Until now every store proof graded the client against a stub that
// re-implemented relay/core.js rules; nothing executed worker.js itself — its
// route dispatch, OPTIONS/CORS answers, GET key regex, the customMetadata
// round-trip (put → head → sessionRow), the SES_MAX_BODY cap and the /status
// capability bool were un-executed code. When #1730 binds the bucket, Jon's
// phone talks to THIS file, so this file is what the harness must run.
//
// Faithfulness notes (the parts the routes actually use):
//  - list() returns keys in lexicographic order, honoring `limit` and `prefix`,
//    with truncated flagged — R2's documented list semantics.
//  - head() returns customMetadata + uploaded; get() returns a stream body.
//  - content-length survives the http→Request bridge (undici keeps explicit
//    headers over the body) so the 413 cap is exercisable.
//  - DO runtime is not faked (see cfworkers-shim.mjs): sessions routes touch
//    no Durable Object, and the /status REGISTRY probe is exercised through a
//    stub — or a DEAD one, to prove the honest fallback.
//
// mutate:true strips the consent-door line from worker.js SOURCE (not from
// core.js) so the unconsented POST lands — the proof that the enforcement
// lives in the deployed file. The mutant copy is a transient file next to
// worker.js (relative './core.js' must resolve) and is deleted at close.
// mutateReadlock:true strips the read-lock doors (#1711 S8) — without the
// key, reads land; that's the mutant Jon asked for ("a read without the
// key is refused" must die when the door is gone).
// env.JON_KEY defaults to SIM_READ_KEY because the deployed worker Jon is
// about to configure DOES have JON_KEY — every read in the harness sends it
// (and relaycheck pins the refusal). readKey:null models the fail-closed
// pre-deploy worker: reads refused, nobody can unlock them.

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as nodeModule from 'node:module'
import { resolve as resolveHook } from './cfworkers-hooks.mjs'
const RELAY_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../relay')
const WORKER_FILE = path.join(RELAY_DIR, 'worker.js')
const MUTANT_FILE = path.join(RELAY_DIR, '.relaycheck-mutant.mjs')
// The exact door inside handleSessionUpload (the same text exists in
// handleFeedback — anchor on the validate call above it to hit only sessions).
const DOOR = "    const v = validateSessionEnvelope(body)\n    if (!v.ok) return json({ ok: false, err: v.err }, origin, 400)"
// The identical two-line door in handleSessionList and handleSessionGet
// (#2093 item 1: relabel writes rode the same lockdown; #2142 split the door
// — stripping the readlock here must open reads AND writes, so WRITE_DOOR is
// stripped in the same mutant run and all gates go red together).
const READ_DOOR = "    const d = readDenied(req, env, origin)\n    if (d) return d"
const WRITE_DOOR = "    const d = writeDenied(req, env, origin)\n    if (d) return d"

export const SIM_READ_KEY = 'test-jon-key'
export const SIM_WRITE_KEY = 'test-write-key'

let hooksDone = false
const ensureHooks = () => {
    if (hooksDone) return
    if (typeof nodeModule.registerHooks === 'function') nodeModule.registerHooks({ resolve: resolveHook })
    else nodeModule.register('./cfworkers-hooks.mjs', import.meta.url) // Node 22/24 (DEP0205 on 26)
    hooksDone = true
}

// faithful-enough R2 for the store's surface: put/get/head/list.
export function mkR2() {
    const m = new Map()
    return {
        async put(key, value, opts = {}) {
            m.set(key, {
                value: String(value),
                meta: opts.customMetadata ? { ...opts.customMetadata } : null,
                uploaded: new Date(),
                contentType: (opts.httpMetadata && opts.httpMetadata.contentType) || null,
            })
        },
        async list({ limit = 1000, prefix = '' } = {}) {
            const keys = [...m.keys()].filter((k) => !prefix || k.startsWith(prefix)).sort()
            const take = keys.slice(0, Math.max(1, limit | 0))
            return { objects: take.map((k) => ({ key: k, size: m.get(k).value.length, uploaded: m.get(k).uploaded })), truncated: keys.length > take.length }
        },
        async head(key) {
            const e = m.get(key)
            return e ? { key, size: e.value.length, customMetadata: e.meta, uploaded: e.uploaded, httpMetadata: { contentType: e.contentType } } : null
        },
        async get(key) {
            const e = m.get(key)
            if (!e) return null
            return { key, size: e.value.length, customMetadata: e.meta, body: new Blob([e.value]).stream() }
        },
        _map: m,
    }
}

async function loadWorker({ mutate = false, mutateReadlock = false } = {}) {
    ensureHooks()
    if (!mutate && !mutateReadlock) return (await import(pathToFileURL(WORKER_FILE).href)).default
    let src = fs.readFileSync(WORKER_FILE, 'utf8')
    if (mutate) {
        if (!src.includes(DOOR)) throw new Error('relaysim: consent-door anchor not found in worker.js — update relaysim DOOR to match')
        src = src.replace(DOOR, '    const v = validateSessionEnvelope(body) // MUTANT: door stripped')
    }
    if (mutateReadlock) {
        if (!src.includes(READ_DOOR)) throw new Error('relaysim: read-lock door anchor not found in worker.js — update relaysim READ_DOOR to match')
        src = src.split(READ_DOOR).join('    // MUTANT: read-lock door stripped')
        if (!src.includes(WRITE_DOOR)) throw new Error('relaysim: write-lock door anchor not found in worker.js — update relaysim WRITE_DOOR to match')
        src = src.split(WRITE_DOOR).join('    // MUTANT: write-lock door stripped')
    }
    fs.writeFileSync(MUTANT_FILE, src)
    try {
        return (await import(pathToFileURL(MUTANT_FILE).href + `?t=${Date.now()}`)).default
    } finally {
        fs.rmSync(MUTANT_FILE, { force: true })
    }
}

export async function startRelaySim({ bind = true, registry = 'ok', mutate = false, mutateReadlock = false, readKey = SIM_READ_KEY, writeKey = null } = {}) {
    const worker = await loadWorker({ mutate, mutateReadlock })
    const bucket = bind ? mkR2() : null
    const env = {
        SESSIONS: bucket || undefined,
        REGISTRY: registry === 'dead'
            ? { idFromName: () => { throw new Error('registry down') }, get: () => ({ count: async () => 0 }) }
            : { idFromName: (n) => n, get: () => ({ count: async () => 0 }) },
        // Jon's deploy carries JON_KEY (feedback already uses it) — the read
        // lockdown pins the deployed shape. Pass readKey:null for the
        // fail-closed pre-deploy worker. SESSION_WRITE_KEY (#2142 separation)
        // is deliberately UNset by default — the pins see the status-quo
        // fallback (JON_KEY opens writes); pass writeKey for the separated door.
        JON_KEY: readKey || undefined,
        SESSION_WRITE_KEY: writeKey || undefined,
        // GITHUB_TOKEN/GH_REPO deliberately unset → /status feedback:false (the
        // honest "not configured" half of the capability flag).
    }
    const server = http.createServer(async (req, res) => {
        const chunks = []
        for await (const c of req) chunks.push(c)
        const headers = new Headers()
        for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.append(k, Array.isArray(v) ? v.join(', ') : v)
        const init = { method: req.method, headers }
        if (req.method !== 'GET' && req.method !== 'HEAD') init.body = Buffer.concat(chunks)
        let out
        try {
            out = await worker.fetch(new Request(`http://127.0.0.1:${server.address().port}${req.url}`, init), env)
        } catch (e) {
            res.writeHead(500, { 'content-type': 'application/json' })
            return res.end(JSON.stringify({ ok: false, err: `worker threw: ${e && e.message}` }))
        }
        const h = {}
        out.headers.forEach((v, k) => { h[k] = v })
        const text = await out.text()
        res.writeHead(out.status, h)
        res.end(text)
    })
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    return {
        base: `http://127.0.0.1:${server.address().port}`,
        bucket,
        readHeaders: readKey ? { 'x-session-key': readKey } : {},
        writeHeaders: { 'x-session-key': writeKey || readKey || '' },
        writeKey: writeKey || readKey || null,
        readKey: readKey || null,
        close() { server.closeAllConnections(); server.close() },
    }
}
