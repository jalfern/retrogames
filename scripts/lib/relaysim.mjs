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

async function loadWorker({ mutate = false } = {}) {
    ensureHooks()
    if (!mutate) return (await import(pathToFileURL(WORKER_FILE).href)).default
    const src = fs.readFileSync(WORKER_FILE, 'utf8')
    if (!src.includes(DOOR)) throw new Error('relaysim: consent-door anchor not found in worker.js — update relaysim DOOR to match')
    fs.writeFileSync(MUTANT_FILE, src.replace(DOOR, '    const v = validateSessionEnvelope(body) // MUTANT: door stripped'))
    try {
        return (await import(pathToFileURL(MUTANT_FILE).href + `?t=${Date.now()}`)).default
    } finally {
        fs.rmSync(MUTANT_FILE, { force: true })
    }
}

export async function startRelaySim({ bind = true, registry = 'ok', mutate = false } = {}) {
    const worker = await loadWorker({ mutate })
    const bucket = bind ? mkR2() : null
    const env = {
        SESSIONS: bucket || undefined,
        REGISTRY: registry === 'dead'
            ? { idFromName: () => { throw new Error('registry down') }, get: () => { throw new Error('registry down') } }
            : { idFromName: (n) => n, get: () => ({ count: async () => 0 }) },
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
        close() { server.closeAllConnections(); server.close() },
    }
}
