#!/usr/bin/env node
/**
 * SKYWARD ROOM (#3429) — the online proof leg. Two real Chrome pages join one
 * room over the deployed relay (the same wss endpoint SSX/Tidal Rush ship on),
 * race on one seeded sky, and the folded hash must agree at every read — plus
 * the host's R resets the room for both, and a solo page (no ?net=) proves the
 * offline path never touched the wire.
 *
 *   npm run dev -- --port 5173 --strictPort      (leave running)
 *   node scripts/skywardroom.mjs
 */
import { chromium } from 'playwright-core'
import { resolve } from 'node:path'

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = process.env.SKYWARD_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/skyward`

const errors = []
const fails = []
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails.push(msg) }

const browser = await chromium.launchPersistentContext(resolve(process.env.TMPDIR || '/tmp', 'skywardroom-profile'), {
    executablePath: CHROME,
    viewport: { width: 1280, height: 800 },
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required',
        '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
})
const mk = async (name, url) => {
    const page = await browser.newPage()
    page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(`${name}: ${m.text()}`) })
    page.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`))
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForFunction(() => !!window.__skywardTest?.ready, null, { timeout: 60000 })
    return page
}
const probe = (page) => page.evaluate(() => window.__skywardTest.netProbe())
const waitFold = async (page, n = 30000) => page.evaluate((ms) => new Promise((res) => {
    const t0 = Date.now()
    const iv = setInterval(() => {
        const p = window.__skywardTest.netProbe()
        if ((p.racing && p.fold) || Date.now() - t0 > ms) { clearInterval(iv); res(p) }
    }, 250)
}), n)

try {
    // solo leg first — the offline path must not even open a socket
    const solo = await mk('solo', `${BASE}?lite=1`)
    const sp = await probe(solo)
    ok(sp && sp.role === null && sp.racing === false, 'solo (?lite only): no room, no race — offline untouched')

    const host = await mk('host', `${BASE}?lite=1&net=host`)
    let hp = null
    for (let i = 0; i < 40 && !(hp && hp.code); i++) hp = await probe(host)
    ok(!!(hp && hp.code && hp.role === 'host' && hp.slot === 0), `host opened room ${hp && hp.code}`)
    // let the relay settle: a reconnecting seat keeps its slot briefly, so wait
    // for a stable roster of exactly the live members before inviting anyone
    const settled = async (pages, n) => {
        for (let i = 0; i < 60; i++) {
            const ps = await Promise.all(pages.map(probe))
            const s = ps[0].slots.join(',')
            if (ps.every((p) => p.phase === 'waiting' && p.slots.join(',') === s && p.slots.length === n && p.slot >= 0)) return ps
            await new Promise((r) => setTimeout(r, 250))
        }
        return Promise.all(pages.map(probe))
    }
    let [hs1] = await settled([host], 1)
    ok(hs1 && hs1.slots.length === 1, `roster settled to the host alone (${hs1 && hs1.slots})`)

    const guest = await mk('guest', `${BASE}?lite=1&net=join&room=${hs1.code}`)
    const both = await settled([host, guest], 2)
    const [hb, gb] = both
    ok(!!(gb && gb.slot > 0 && hb.slot === 0 && gb.code === hs1.code), `guest joined: seats ${hb && hb.slot}+${gb && gb.slot} in room ${hs1.code}`)

    await host.evaluate(() => window.__skywardTest.netGo())
    const hp2 = await waitFold(host)
    const gp2 = await waitFold(guest)
    ok(hp2.racing && gp2.racing, 'go: both boxes race')
    ok(hp2.seat === 0 && gp2.seat > 0, `sim seats by roster order: host=${hp2.seat} guest=${gp2.seat} (slots ${hp2.roster}/${gp2.roster})`)

    // drive a little: the guest banks left like a player
    await guest.keyboard.down('ArrowLeft')
    await new Promise((r) => setTimeout(r, 6000))
    await guest.keyboard.up('ArrowLeft')

    const hp3 = await probe(host)
    const gp3 = await probe(guest)
    ok(hp3.racing && gp3.racing, 'still racing after the drive leg')
    ok(hp3.scores.length === 4 && gp3.scores.length === 4, 'every box simulates every seat (4 scores)')
    ok(hp3.humans.join(',') === gp3.humans.join(',') && !hp3.humans.includes(1), `the silent seat was handed to the autopilot on both boxes (humans ${hp3.humans}/${gp3.humans}, lost ${hp3.lost}/${gp3.lost})`)
    // the takeover resumes the boxes at different wall moments (frame counts
    // differ); the lag drains at fixed-dt catch-up — prove CONVERGENCE: wait
    // for equal clocks, then the folds must be equal, tick for tick.
    let hc = hp3; let gc = gp3; let conv = false
    for (let i = 0; i < 40; i++) {
        hc = await probe(host); gc = await probe(guest)
        if (hc.racing && gc.racing && Math.abs(hc.raceT - gc.raceT) < 0.05 && hc.fold === gc.fold) { conv = true; break }
        await new Promise((r) => setTimeout(r, 250))
    }
    ok(conv, `the boxes converge to one sky (raceT ${hc.raceT}/${gc.raceT}, fold ${hc.fold} vs ${gc.fold})`)
    ok(hc.raceT > 1 && gc.raceT > 1, `the clock ran on both after the takeover (${hc.raceT}s / ${gc.raceT}s)`)

    // host aborts — the room returns to the waiting room on BOTH boxes
    await host.keyboard.press('KeyR')
    let hp4 = null; let gp4 = null
    for (let i = 0; i < 40; i++) {
        hp4 = await probe(host); gp4 = await probe(guest)
        if (!hp4.racing && !gp4.racing && hp4.phase === 'waiting' && gp4.phase === 'waiting') break
        await new Promise((r) => setTimeout(r, 250))
    }
    ok(hp4 && !hp4.racing && !gp4.racing, 'R aborts the race on both boxes')
    ok(hp4 && hp4.phase === 'waiting' && gp4 && gp4.phase === 'waiting', 'the room survives the abort (waiting again, rematch possible)')

    ok(errors.length === 0, `zero page errors across all legs${errors.length ? ` — ${errors.slice(0, 4).join(' | ')}` : ''}`)
} catch (e) {
    ok(false, `harness threw: ${e.message}`)
} finally {
    await browser.close()
}

console.log(`\nskywardroom: ${fails.length === 0 ? 'PASSED' : `FAILED (${fails.length})`}`)
process.exit(fails.length === 0 ? 0 : 1)
