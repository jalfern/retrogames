#!/usr/bin/env node
// tps.mjs — one-line JSON snapshot of generation tokens/s per machine (#1266).
//
// watch.sh has shown gen t/s live from oMLX's own dashboard feed for a while,
// but nothing RECORDED it: the #1258 trial report could only use items/day.
// This samples the same feed telemetry can store: one line, printed once:
//   {"omlx":{"state":"gen","tps":41.3,"ctx":31204,"n":2},
//    "omlxmini":{"state":"idle","tps":0,"ctx":0,"n":0},"omlxmbp":{"state":"down",...}}
// Keys are the provider names in ~/.config/opencode/opencode.json; ports are
// the same ones watch.sh reads (:8000 Studio, :18000/:18001 tunnels).
// Contract (scripts/tpscheck.mjs pins it):
// - exits 0 and prints exactly one JSON object even when every machine is down;
// - state ∈ gen|prefill|idle|down; tps is a number, 0 unless state=gen;
// - ctx = prompt tokens of the generating slot (0 when not generating).
// Callers (telemetry.sh) embed it verbatim, so output must stay one line.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'

// Ports are overridable for the tpscheck mutant (unreachable ports exercise
// the down-fallback on machines where the real servers are up).
let BOXES = [
  ['omlx', 8000],       // the Studio (builder + studio QA share it)
  ['omlxmini', 18000],  // Mac mini via the tunnel
  ['omlxmbp', 18001],   // MacBook via the tunnel
]
try {
  const o = JSON.parse(process.env.TPS_BOXES || 'null')
  if (o && typeof o === 'object') BOXES = Object.entries(o).map(([k, v]) => [k, Number(v)])
} catch { /* default ports */ }

let cfg = {}
try {
  cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config', 'opencode', 'opencode.json'), 'utf8'))
} catch { /* no config: no keys, feeds answer 401 -> state unknown below */ }

function sample(port, key) {
  return new Promise((resolve) => {
    const req = http.get({
      host: '127.0.0.1', port, path: '/admin/api/activity', timeout: 2000,
      headers: key ? { Authorization: `Bearer ${key}` } : {},
    }, (res) => {
      let body = ''
      res.on('data', (c) => { body += c })
      res.on('end', () => {
        try {
          const models = JSON.parse(body).active_models.models || []
          let g = null, p = null
          for (const m of models) {
            if (!g && m.generating?.length) g = m.generating[0]
            if (!p && m.prefilling?.length) p = m.prefilling[0]
          }
          const n = models.reduce((s, m) => s + (m.generating?.length || 0) + (m.prefilling?.length || 0), 0)
          if (g) resolve({ state: 'gen', tps: Math.round((g.tokens_per_second || 0) * 10) / 10, ctx: g.prompt_tokens || 0, n })
          else if (p) resolve({ state: 'prefill', tps: 0, ctx: p.total || 0, n })
          else resolve({ state: 'idle', tps: 0, ctx: 0, n: 0 })
        } catch { resolve({ state: 'idle', tps: 0, ctx: 0, n: 0 }) } // up, feed unreadable
      })
    })
    req.on('error', () => resolve({ state: 'down', tps: 0, ctx: 0, n: 0 }))
    req.on('timeout', () => { req.destroy(); resolve({ state: 'down', tps: 0, ctx: 0, n: 0 }) })
  })
}

const out = {}
await Promise.all(BOXES.map(async ([name, port]) => {
  out[name] = await sample(port, cfg.provider?.[name]?.options?.apiKey || '')
}))
console.log(JSON.stringify(out))
