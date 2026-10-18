#!/usr/bin/env node
// TAP — a pass-through proxy in front of one oMLX server that copies the
// model's streamed output (text AND reasoning) into a file you can `tail -f`.
//
//   node scripts/tap.mjs --listen 8010 --upstream 8000 --out /tmp/forge/stream-builder.log
//
// Why: `opencode run` only writes a step to the session log once the step
// finishes, so a long reasoning stretch at 70 t/s is invisible until it ends.
// This shows the tokens as they are generated (watch.sh --live).
//
// Rules this file keeps (each one is the reason it is safe to sit in the path):
// - Bytes go to the client exactly as received, chunk by chunk, never buffered
//   or rewritten. The copy to the file is a side effect that can fail freely.
// - Nothing here can throw into the request path: every parse is try/catch'd.
// - Upstream down -> 502 at once (opencode sees what it would see without us).
// - Client hangs up -> upstream request is aborted (no orphaned generations).
// - The file is truncated past MAX_BYTES so it cannot fill the disk.
//
// Rollback: point the provider back at the upstream port; nothing else uses this.

import http from 'node:http'
import fs from 'node:fs'

const arg = (name, dflt) => {
    const i = process.argv.indexOf(`--${name}`)
    return i > 0 ? process.argv[i + 1] : dflt
}
const LISTEN = Number(arg('listen', 8010))
const UPSTREAM = Number(arg('upstream', 8000))
const HOST = arg('host', '127.0.0.1')
const OUT = arg('out', '/tmp/forge/stream-builder.log')
const MAX_BYTES = 8 * 1024 * 1024

const D = '\x1b[2m', Y = '\x1b[33m', C = '\x1b[36m', N = '\x1b[0m'
let mode = null // 'think' | 'text' | null — what we are printing right now

function write(s) {
    try {
        let size = 0
        try { size = fs.statSync(OUT).size } catch { /* new file */ }
        if (size > MAX_BYTES) fs.truncateSync(OUT, 0)
        fs.appendFileSync(OUT, s)
    } catch { /* the copy is best-effort; the request never waits on it */ }
}

function emit(kind, s) {
    if (!s) return
    if (kind !== mode) {
        write(kind === 'think' ? `\n${D}[thinking]${N} ${D}` : `\n${N}${Y}[output]${N} `)
        mode = kind
    }
    write(s)
}

// One SSE `data:` payload from an OpenAI-style /chat/completions stream.
function onEvent(json) {
    let ev
    try { ev = JSON.parse(json) } catch { return }
    for (const ch of ev.choices || []) {
        const d = ch.delta || ch.message || {}
        emit('think', d.reasoning_content ?? d.reasoning ?? '')
        emit('text', typeof d.content === 'string' ? d.content : '')
        for (const tc of d.tool_calls || []) {
            if (tc.function?.name) emit('text', `\n${C}[tool ${tc.function.name}]${N} `)
            emit('text', tc.function?.arguments || '')
        }
    }
}

const server = http.createServer((req, res) => {
    const started = Date.now()
    const watch = /\/chat\/completions/.test(req.url)
    if (watch) {
        write(`\n\n${C}── ${new Date().toTimeString().slice(0, 8)} request ──${N}`)
        mode = null
    }

    const up = http.request({
        host: HOST, port: UPSTREAM, path: req.url, method: req.method,
        headers: { ...req.headers, host: `${HOST}:${UPSTREAM}` },
    }, (upRes) => {
        res.writeHead(upRes.statusCode, upRes.headers)
        res.flushHeaders()
        let pending = ''
        upRes.on('data', (chunk) => {
            res.write(chunk) // client first, always
            if (!watch) return
            try {
                pending += chunk.toString('utf8')
                const lines = pending.split('\n')
                pending = lines.pop()
                for (const line of lines) {
                    const t = line.trim()
                    if (t.startsWith('data:') && t !== 'data: [DONE]') onEvent(t.slice(5).trim())
                }
            } catch { /* never let the copy break the stream */ }
        })
        upRes.on('end', () => {
            res.end()
            if (!watch) return
            // A non-streaming reply arrives as one JSON body with no "data:".
            if (pending.trim().startsWith('{')) onEvent(pending)
            write(`${N}\n${D}── done ${((Date.now() - started) / 1000).toFixed(1)}s ──${N}\n`)
            mode = null
        })
        upRes.on('error', () => res.destroy())
    })

    up.on('error', (e) => {
        if (watch) write(`${N}\n${C}── upstream error: ${e.code || e.message} ──${N}\n`)
        if (!res.headersSent) {
            res.writeHead(502, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: { message: `tap: upstream :${UPSTREAM} ${e.code || e.message}` } }))
        } else res.destroy()
    })
    // If the client goes away, stop the generation upstream too.
    res.on('close', () => { if (!res.writableFinished) up.destroy() })
    req.pipe(up)
})

server.requestTimeout = 0 // generations can run for many minutes
server.headersTimeout = 0
server.keepAliveTimeout = 120_000
server.listen(LISTEN, HOST, () => {
    write(`\n${D}tap up: :${LISTEN} -> :${UPSTREAM} (${new Date().toISOString()})${N}\n`)
})
