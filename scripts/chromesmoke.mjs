#!/usr/bin/env node
// chromesmoke — #1622 session-start screenshot smoke test.
//
//   node scripts/chromesmoke.mjs           # launch, screenshot a blank page, close
//   node scripts/chromesmoke.mjs --pulse  # print the pulse field from the last status
//
// ~1 s on a warm machine (cached mode), a few seconds cold. Writes its verdict
// to /tmp/forge/chrome-smoke.json so the warden can put `shots=ok(mode)` or
// `shots=broken(reason)` on the pulse line — "screenshots are dead on this
// box" becomes visible instead of every PR quietly skipping its shots.
// Exit 0 = screenshots work (any mode), 1 = they don't.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { launchChrome, shotsField, SMOKE_FILE } from './lib/chromeboot.mjs'

function writeStatus(status) {
    try { mkdirSync(dirname(SMOKE_FILE), { recursive: true }); writeFileSync(SMOKE_FILE, JSON.stringify(status) + '\n') } catch { /* best effort */ }
}

if (process.argv.includes('--pulse')) {
    let status = null
    try { status = JSON.parse(readFileSync(SMOKE_FILE, 'utf8')) } catch { /* none */ }
    console.log(shotsField(status))
    process.exit(0)
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47])
let browser = null
try {
    browser = await launchChrome({ quiet: true })
    const page = await browser.newPage({ viewport: { width: 160, height: 100 } })
    await page.goto('about:blank')
    const shot = await page.screenshot({ type: 'png' })
    if (shot.length < 100 || !shot.subarray(0, 4).equals(PNG)) throw new Error('blank-not-png')
    const mode = browser.__bootMode || 'chrome'
    await browser.close()
    browser = null
    writeStatus({ ok: true, mode, at: Math.floor(Date.now() / 1000), bytes: shot.length })
    console.log(`CHROMESMOKE ok mode=${mode} bytes=${shot.length}`)
    process.exit(0)
} catch (e) {
    if (browser) { try { await browser.close() } catch { /* gone */ } }
    const reason = String((e && e.message) || e).split('\n')[0].slice(0, 120).replace(/\s+/g, ' ')
    writeStatus({ ok: false, reason: 'launch', detail: reason, at: Math.floor(Date.now() / 1000) })
    console.log(`CHROMESMOKE fail reason=${reason}`)
    process.exit(1)
}
