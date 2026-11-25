// drive grind-city end to end in headless Chrome via the contract.
import { openGame, launch } from './harness.mjs'

const BASE = `http://localhost:${process.env.DEV_PORT || 5178}/retrogames`
const browser = await launch()
try {
    const page = await openGame(browser, { url: `${BASE}/grind-city`, hook: '__grindTest' })
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.waitForFunction('window.__game', { timeout: 20000 })
    const out = []
    const ok = (n, c, x = '') => { out.push(`${c ? 'PASS' : 'FAIL'} ${n} ${x}`) }
    const STEP_MIN = 3   // eighths expected in ~700ms at real speed, halved for slow CI Chrome
    // Space with the focus dance the older legs learned — a click also advances
    // replay/over screens. Checks before it presses: an auto-finishing replay
    // must not be stepped past its screen.
    const skipTo = async (want) => {
        for (let i = 0; i < 4; i++) {
            const s0 = await page.evaluate(() => window.__grindTest.state())
            if (s0.screen === want) return s0
            await page.keyboard.press('Space')
            await new Promise(r => setTimeout(r, 250))
            const s1 = await page.evaluate(() => window.__grindTest.state())
            if (s1.screen === want) return s1
            await page.mouse.click(300, 300)
            await new Promise(r => setTimeout(r, 250))
        }
        return page.evaluate(() => window.__grindTest.state())
    }

    ok('boots clean', errors.length === 0, errors.join(';'))
    const attract = await page.evaluate(() => window.__game.state())
    await new Promise(r => setTimeout(r, 1200))
    const attract2 = await page.evaluate(() => window.__game.state())
    ok('attract skates on its own', attract2.tick > attract.tick + 30 && attract.phase === 'play' && attract.attract === true, `${attract.tick}→${attract2.tick} phase=${attract.phase} speed=${attract.speed}`)
    // #3167: the music bed ticks with the sim clock (its scheduler position)
    const bedA = await page.evaluate(() => window.__grindTest.state().bed)
    await new Promise(r => setTimeout(r, 700))
    const bedB = await page.evaluate(() => window.__grindTest.state().bed)
    ok('music bed runs in attract', bedB > bedA + STEP_MIN, `bed ${bedA}→${bedB}`)
    // #3379: attract must duck its SFX with the bed, street play not at all
    const duckAttract = await page.evaluate(() => window.__grindTest.state().sfxDuck)
    ok('#3379 attract ducks the sfx bank (lobby sits under the title)', duckAttract > 0 && duckAttract < 1, `duck=${duckAttract}`)
    const res = await page.evaluate(async () => {
        const g = window.__game
        const zero = g.reset(7)
        const padDrive = (n, p) => g.step(p, n)
        padDrive(240, { right: false })
        const mid = g.state()
        padDrive(60, { a: true })          // ollies
        padDrive(120, { b: true })        // pumps
        const before = g.state()
        padDrive(7400, {})               // clock out → run over
        const end = g.state()
        g.release()
        return { zero, mid, before, end }
    })
    ok('driving moves the skater', Math.abs(res.mid.x - res.zero.x) + Math.abs(res.mid.z - res.zero.z) > 3)
    ok('#3379 street play keeps the sfx bank at full gain', res.mid.sfxDuck === 1, `duck=${res.mid.sfxDuck}`)
    ok('tricks score', res.before.score >= 0 && res.before.stats.tricks >= 0, `score=${res.before.score} tricks=${res.before.stats.tricks}`)
    ok('gems visible in the contract (#3246)', typeof res.mid.gems === 'number' && res.mid.gemTotal === 14, `gems=${res.mid.gems}/${res.mid.gemTotal}`)
    ok('run ends at the clock', res.end.done === true && res.end.phase === 'over', `t=${res.end.timeLeft}`)

    const png = await page.evaluate(() => window.__game.frame())
    ok('frame is a real PNG', png.startsWith('data:image/png') && png.length > 40000, `${png.length}b`)
    // pixels: the drawn frame is not a black screen (renderer alive)
    const lum = await page.evaluate(async () => {
        const img = new Image()
        img.src = window.__game.frame()
        await img.decode()
        const c = document.createElement('canvas')
        c.width = 64; c.height = 40
        const x = c.getContext('2d')
        x.drawImage(img, 0, 0, 64, 40)
        const d = x.getImageData(0, 0, 64, 40).data
        let s = 0
        for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]
        return s / (d.length / 4)
    })
    ok('scene renders (not black)', lum > 40, `mean lum=${lum.toFixed(1)}`)

    // #3225: a finished run shows the REPLAY screen on the replay cam
    const rp = await page.evaluate(() => window.__grindTest.state())
    ok('run over shows the replay', rp.screen === 'replay' && !!rp.replay && rp.cam === 'replay',
        `cam=${rp.cam} i=${rp.replay ? rp.replay.i : '-'}/${rp.replay ? rp.replay.n : '-'}`)
    // #3167: the replay runs silent — the bed scheduler stands still
    const bedR1 = rp.bed
    await new Promise(r => setTimeout(r, 350))
    const bedR2 = await page.evaluate(() => window.__grindTest.state())
    ok('bed stands still through the replay', bedR2.screen === 'replay' && bedR2.bed === bedR1, `bed ${bedR1}→${bedR2.bed}`)
    // #3325: the replay free cam — C toggles the orbit, hold an arrow to swing the camera
    const orbitPre = await page.evaluate(() => window.__grindTest.state())
    ok('replay starts with the free cam off', orbitPre.orbit === false && orbitPre.screen === 'replay', `orbit=${orbitPre.orbit} screen=${orbitPre.screen}`)
    await page.keyboard.press('KeyC')
    await new Promise(r => setTimeout(r, 200))
    const orbitOn = await page.evaluate(() => window.__grindTest.state())
    ok('C toggles the free cam on', orbitOn.orbit === true && orbitOn.screen === 'replay', `orbit=${orbitOn.orbit}`)
    const a0 = orbitOn.orbitA
    await page.keyboard.down('ArrowRight')
    await new Promise(r => setTimeout(r, 500))
    const a1 = await page.evaluate(() => window.__grindTest.state().orbitA)
    await page.keyboard.up('ArrowRight')
    await new Promise(r => setTimeout(r, 250))
    const a2 = await page.evaluate(() => window.__grindTest.state().orbitA)
    ok('arrows swing the orbit camera', a1 > a0 + 0.2, `orbitA ${a0}→${a1}`)
    ok('orbit holds still with no input', Math.abs(a2 - a1) < 0.05, `${a1}→${a2}`)
    const chip = await page.evaluate(() => {
        const el = document.querySelector('[class~="right-4"]')
        return el ? el.textContent.trim() : null
    })
    ok('HUD chip shows ORBIT', !!chip && /ORBIT/.test(chip), `chip=${chip}`)
    await page.keyboard.press('KeyC')
    await new Promise(r => setTimeout(r, 150))
    const orbitOff = await page.evaluate(() => window.__grindTest.state())
    ok('C toggles the free cam off', orbitOff.orbit === false, `orbit=${orbitOff.orbit}`)

    await page.keyboard.press('Space')   // skip the replay
    await new Promise(r => setTimeout(r, 250))
    let ov = await page.evaluate(() => window.__grindTest.state())
    if (ov.screen === 'replay') {       // focus dance: a tap also skips
        await page.mouse.click(300, 300)
        await new Promise(r => setTimeout(r, 250))
        ov = await page.evaluate(() => window.__grindTest.state())
    }
    ok('Space skips the replay to the results', ov.screen === 'over' && !ov.replay, `screen=${ov.screen}`)

    // keyboard restart from the over screen
    await page.keyboard.press('Space')
    await new Promise(r => setTimeout(r, 700))
    let back = await page.evaluate(() => window.__game.state())
    if (back.phase === 'over') {   // focus dance: click the stage, then Space again
        await page.mouse.click(300, 300)
        await new Promise(r => setTimeout(r, 300))
        back = await page.evaluate(() => window.__game.state())
    }
    ok('over → restart returns to attract', back.phase === 'play' && back.attract === true, `phase=${back.phase} attract=${back.attract}`)

    // #3225: the fisheye action cam cuts in while an air-grab is held
    const ac = await page.evaluate(async () => {
        const g = window.__game
        g.reset(11)
        g.step({ a: true }, 1); g.step({}, 30); g.step({ a: true }, 2)   // ollie → re-press A = grab
        await new Promise(r => setTimeout(r, 150))
        const st = window.__grindTest.state()
        g.release()
        return st
    })
    ok('fisheye action cam on an air grab', ac.cam === 'action' && ac.screen === 'play', `cam=${ac.cam} air=${ac.air}`)

    // #3289 live stall: crouch+A at the coping locks, the action cam cuts in,
    // the balance meter leans, and the pop pays. Real key events throughout.
    const sl = await page.evaluate(async () => {
        const g = window.__game, t = window.__grindTest
        g.reset(7)
        t.teleport({ x: -24.6, z: 0, y: 0, heading: Math.PI, speed: 2 })
        await new Promise(r => setTimeout(r, 150))
        t.press('ArrowDown'); t.press('Space')
        await new Promise(r => setTimeout(r, 120))
        t.release('Space')
        const lock = t.state()
        let balSeen = 0
        for (let i = 0; i < 14; i++) {
            const st = t.state()
            if (!st.stall) break
            balSeen = Math.max(balSeen, Math.abs(st.stallBal))
            t.release('ArrowLeft'); t.release('ArrowRight')
            if (st.stallBal > 0) t.press('ArrowLeft'); else t.press('ArrowRight')
            await new Promise(r => setTimeout(r, 60))
        }
        const held = t.state()
        t.release('ArrowLeft'); t.release('ArrowRight'); t.release('ArrowDown')
        t.press('Space'); await new Promise(r => setTimeout(r, 120)); t.release('Space')
        const popped = t.state()
        g.release()
        return { lock, held, popped, balSeen }
    })
    ok('#3289 crouch+A at the lip locks a live stall', sl.lock.stall === true && sl.lock.speed === 0, `speed=${sl.lock.speed} cam=${sl.lock.cam}`)
    ok('#3289 action cam cuts in for the stall', sl.lock.cam === 'action' && sl.lock.screen === 'play', `cam=${sl.lock.cam}`)
    ok('#3289 the balance meter builds while held', sl.held.stall === true && sl.balSeen > 0.01, `bal=${sl.balSeen.toFixed(3)} t=${sl.held.stallT}`)
    ok('#3289 the pop pays trickle + commit', sl.popped.chainPts >= 100 || sl.popped.score > 0, `chainPts=${sl.popped.chainPts}`)

    // #3289 live rail grab: latch, hold B, release — Feeble lands in the chain
    const rg = await page.evaluate(async () => {
        const g = window.__game, t = window.__grindTest
        g.reset(7)
        t.teleport({ x: -11, z: -2, y: 1.4, heading: 0, speed: 7 })
        await new Promise(r => setTimeout(r, 300))
        const latched = t.state()
        t.press('ShiftLeft')
        await new Promise(r => setTimeout(r, 100))
        const grabbing = t.state()
        for (let i = 0; i < 8; i++) {
            const st = t.state()
            t.release('ArrowLeft'); t.release('ArrowRight')
            if (st.grindBal > 0) t.press('ArrowLeft'); else t.press('ArrowRight')
            await new Promise(r => setTimeout(r, 50))
        }
        const held = t.state()
        t.release('ShiftLeft')
        await new Promise(r => setTimeout(r, 120))
        const paid = t.state()
        g.release()
        return { latched, grabbing, held, paid }
    })
    ok('#3289 B on the rail engages the grab live', rg.grabbing.grinding && rg.grabbing.railGrab === 'Feeble',
        `grind=${rg.grabbing.grinding} grab=${rg.grabbing.railGrab} cam=${rg.grabbing.cam}`)
    ok('#3289 the grab doubles the trickle live', rg.paid.chainPts > rg.latched.chainPts + 30 || rg.paid.score > 0,
        `${rg.latched.chainPts}→${rg.paid.chainPts}`)

    // #3374 near-miss live: a run that banks a letter and dies inside the 2 s
    // floor still watches its line — badged. Letter + clock-out via DEV hooks;
    // everything after that is the real screen flow.
    await page.evaluate(() => { window.__game.reset(5); window.__game.release() })
    await new Promise(r => setTimeout(r, 1500))   // coast ~90 ticks at real speed — under the 2 s floor
    await page.evaluate(() => {
        window.__grindTest.teleport({ letters: { S: true }, timeLeft: 0.01 })
    })
    await new Promise(r => setTimeout(r, 300))
    const nm = await page.evaluate(() => window.__grindTest.state())
    ok('#3374 a sub-2 s lettered run still earns its replay',
        nm.screen === 'replay' && !!nm.replay && nm.replay.near === true,
        `screen=${nm.screen} near=${nm.replay ? nm.replay.near : '-'} n=${nm.replay ? nm.replay.n : '-'}`)
    const badge = await page.evaluate(() => {
        const el = document.querySelector('[class~="top-[30%]"]')
        return el ? { txt: el.textContent, op: Number(el.style.opacity) } : null
    })
    ok('#3374 the near replay wears its badge', !!badge && /NEAR MISS/.test(badge.txt) && badge.op > 0.5, JSON.stringify(badge))
    await skipTo('over')
    const fbAttract = await skipTo('attract')
    const fb = await page.evaluate(() => window.__game.state())
    ok('#3374 short-only history keeps the bot line on attract',
        fb.attractLine === false && fb.attract === true && fbAttract.screen === 'attract',
        `attractLine=${fb.attractLine} screen=${fbAttract.screen}`)

    // #3374 attract remembers: a full-window line banks its seed + pads, and
    // the plaza re-rides it behind the title — and loops. Seed 7 is the proven
    // 2-minute coast (the boot leg rides it clock-out without a bail).
    await page.evaluate(() => {
        const g = window.__game, t = window.__grindTest
        g.reset(7)
        g.step({}, 300)                 // five seconds of line
        t.teleport({ timeLeft: 0 })    // clock it out
        g.release()
    })
    await new Promise(r => setTimeout(r, 450))
    const fr = await page.evaluate(() => window.__grindTest.state())
    ok('#3374 the full line replays without the badge',
        fr.screen === 'replay' && !!fr.replay && fr.replay.near === false,
        `screen=${fr.screen} n=${fr.replay ? fr.replay.n : '-'}`)
    await skipTo('over')
    await skipTo('attract')
    const ar = await page.evaluate(() => window.__game.state())
    ok('#3374 attract re-rides the banked line (seed + pads)',
        ar.attractLine === true && ar.seed === 7 && ar.attract === true && ar.phase === 'play',
        `seed=${ar.seed} tick=${ar.tick}`)
    const chipTxt = await page.evaluate(() => (document.body.innerText.match(/BEST LINE [^\n]+/) || [''])[0])
    ok('#3374 the attract card says it out loud', /BEST LINE \d+ PTS · \d\/5/.test(chipTxt), chipTxt)
    let prevT = 0, wrapped = false
    for (let i = 0; i < 50 && !wrapped; i++) {
        await new Promise(r => setTimeout(r, 250))
        const s = await page.evaluate(() => window.__game.state())
        if (s.attract !== true) break
        if (s.tick < prevT - 50) wrapped = true
        prevT = Math.max(prevT, s.tick)
    }
    ok('#3374 attract loops the remembered line without stalling', wrapped, `max tick ${prevT}`)

    // #3381 all-time: the seed-7 line skated above is the best — it must be in
    // the store, survive a reload, and re-ride the plaza marked ALL-TIME.
    const st0 = await page.evaluate(() => window.__game.state())
    ok('#3381 the record line lands in the store', st0.stored !== null && !!st0.best && st0.stored === st0.best.score, `stored=${st0.stored}`)
    const rawStore = await page.evaluate(() => { try { return JSON.parse(window.localStorage.getItem('grindcity.best.v1') || 'null') } catch { return null } })
    ok('#3381 the store holds a seed + the whole pad log', !!rawStore && rawStore.v === 1 && rawStore.seed === 7 && Array.isArray(rawStore.log) && rawStore.log.length >= 120, `log=${rawStore && rawStore.log ? rawStore.log.length : '-'} ticks`)
    await page.reload()
    await page.waitForFunction('window.__game', { timeout: 20000 })
    await new Promise(r => setTimeout(r, 400))
    const st1 = await page.evaluate(() => window.__game.state())
    ok('#3381 reload remembers: attract re-rides the stored line, marked all-time',
        st1.attract === true && st1.attractLine === true && st1.seed === 7 && st1.allTime === true && st1.stored === st1.best.score,
        `seed=${st1.seed} allTime=${st1.allTime} stored=${st1.stored}`)
    const chipAll = await page.evaluate(() => (document.body.innerText.match(/(ALL-TIME )?BEST LINE [^\n]+/) || [''])[0])
    ok('#3381 the chip says ALL-TIME after a reload', /ALL-TIME BEST LINE \d+ PTS/.test(chipAll), chipAll)

    // #3381 a tie does NOT rewrite history: start a real game, coast, and bank
    // a score EQUAL to the record — no badge, and the store keeps its line.
    await skipTo('attract')
    await skipTo('play')
    await new Promise(r => setTimeout(r, 2500))   // ~150 real ticks of line
    await page.evaluate(({ s, l }) => { window.__grindTest.teleport({ score: s, letters: l ? { S: true } : {}, timeLeft: 0 }) }, { s: st0.stored, l: st0.best.letters >= 1 })
    await new Promise(r => setTimeout(r, 450))
    await skipTo('over')
    const tieBadge = await page.evaluate(() => /NEW ALL-TIME LINE/.test(document.body.innerText))
    const stTie = await page.evaluate(() => window.__game.state())
    ok('#3381 an equal line fakes neither the badge nor the store',
        tieBadge === false && stTie.stored === st0.stored, `stored=${stTie.stored} badge=${tieBadge}`)

    // #3381 beat it for real: +5000 over the record earns the badge, rewrites
    // the store, and S on the replay flashes a copy of the share link.
    await skipTo('attract')
    await skipTo('play')
    await new Promise(r => setTimeout(r, 2500))
    await page.evaluate(({ s, l }) => { window.__grindTest.teleport({ score: s, letters: l ? { S: true } : {}, timeLeft: 0 }) }, { s: st0.stored + 5000, l: st0.best.letters >= 1 })
    await new Promise(r => setTimeout(r, 450))
    const recRp = await page.evaluate(() => window.__grindTest.state())
    ok('#3381 the beating line reaches the replay screen', recRp.screen === 'replay' && !!recRp.replay, `screen=${recRp.screen}`)
    await page.keyboard.press('KeyS')
    await new Promise(r => setTimeout(r, 250))
    const flashRp = await page.evaluate(() => {
        const el = document.querySelector('[class~="top-[38%]"]')
        return el ? { txt: el.textContent, op: Number(el.style.opacity) } : null
    })
    const shareCode = await page.evaluate(() => window.__game.state().shareCode)
    ok('#3381 S on the replay flashes the copy verdict',
        !!flashRp && flashRp.op > 0.5 && /^(LINE COPIED — SEND IT|CLIPBOARD BLOCKED|LINE TOO LONG TO SHARE)$/.test(flashRp.txt),
        JSON.stringify(flashRp))
    ok('#3381 the share code is a real link back to this line',
        typeof shareCode === 'string' && shareCode.split('.').length === 4 && shareCode.length > 4,
        `${shareCode ? shareCode.length : 0} chars`)
    await skipTo('over')
    const recBadge = await page.evaluate(() => /NEW ALL-TIME LINE/.test(document.body.innerText))
    const stRec = await page.evaluate(() => window.__game.state())
    ok('#3381 the strict beat earns the badge and rewrites the store',
        recBadge === true && stRec.stored === st0.stored + 5000, `stored=${stRec.stored} badge=${recBadge}`)

    // #3381 the deep link: open the shared code — the plaza re-rides THAT line
    // (its own seed) behind a SHARED LINE banner until the guest keys in.
    const sharedUrl = await page.evaluate((c) => `${location.origin}${location.pathname}?line=${c}`, shareCode)
    const errs2 = []
    const p2 = await openGame(browser, { url: sharedUrl, hook: '__grindTest' })
    p2.on('pageerror', (e) => errs2.push(e.message))
    await p2.waitForFunction('window.__game', { timeout: 20000 })
    await new Promise(r => setTimeout(r, 600))
    const sh = await p2.evaluate(() => window.__game.state())
    ok('#3381 ?line= rides the guest line on its own seed, banner and all',
        sh.attract === true && sh.shared === st0.stored + 5000 && errs2.length === 0,
        `shared=${sh.shared} seed=${sh.seed} expectPts=${st0.stored + 5000}`)
    const shBanner = await p2.evaluate(() => (document.body.innerText.match(/SHARED LINE [^\n]+/) || [''])[0])
    ok('#3381 the banner says SHARED LINE with the honest score', /SHARED LINE · \d+ PTS/.test(shBanner), shBanner)
    await p2.keyboard.press('Space')
    await new Promise(r => setTimeout(r, 300))
    const shStart = await p2.evaluate(() => window.__game.state())
    ok('#3381 any key hands the plaza back — guest mode ends at first touch',
        shStart.attract === false && shStart.shared === null, `attract=${shStart.attract} shared=${shStart.shared}`)
    await p2.close()

    // #3381 junk in the URL is silence, not a crash: the plaza rides its own.
    const errs3 = []
    const p3 = await openGame(browser, { url: `${BASE}/grind-city?line=zz!!nope`, hook: '__grindTest' })
    p3.on('pageerror', (e) => errs3.push(e.message))
    await p3.waitForFunction('window.__game', { timeout: 20000 })
    await new Promise(r => setTimeout(r, 800))
    const junk = await p3.evaluate(() => window.__game.state())
    ok('#3381 a garbage line code boots to a clean plaza, no shared mode, no page errors',
        junk.shared === null && junk.attract === true && errs3.length === 0, `shared=${junk.shared} errs=${errs3.join(';')}`)
    await p3.close()

    // #3233 tail — phone-width HUD collision gate: the goal/trick banner must clear the
    // persistent S-K-A-T-E checklist, stay on-screen at small-phone widths, and the tall
    // score must not brush the combo line. Worst-case strings the sim actually renders.
    for (const vp of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
        const pg = await openGame(browser, { url: `${BASE}/grind-city`, viewport: vp, hook: '__grindTest', touch: true })
        await pg.waitForFunction('window.__game', { timeout: 20000 })
        await pg.evaluate(() => window.__grindTest.start())
        await new Promise(r => setTimeout(r, 200))
        const hud = await pg.evaluate(() => {
            const msg = document.querySelector('[class~="top-40"]')
            if (msg) msg.textContent = 'OFF THE MAP! SECRET SPOT +2500'   // longest goal banner
            const co = document.querySelector('[class~="top-[46%]"]')
            if (co) { co.textContent = 'ROOF GRIND!'; co.style.opacity = 1; co.style.transform = 'translate(-50%,0)' }
            const rc = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, r: b.right, b: b.bottom, sw: el.scrollWidth, cw: el.clientWidth } }
            const M = rc(msg), C = rc(co), L = rc(document.querySelector('[class~="top-16"]'))
            const S = rc(document.querySelector('[class~="bottom-3"]')), CO = rc(document.querySelector('[class~="bottom-[3.75rem]"]'))
            const vw = window.innerWidth
            const ov = (a, b) => (!a || !b) ? 0 : Math.max(0, Math.min(a.r, b.r) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.y, b.y))
            return { vw, msgLetters: ov(M, L), msgCallout: ov(M, C), scoreCombo: ov(S, CO),
                msgOver: M ? Math.max(0, -M.x, M.r - vw) : 1e3, calloutOver: C ? Math.max(0, -C.x, C.r - vw) : 1e3, msgClip: M ? M.sw - M.cw : 1e3 }
        })
        ok(`phone ${vp.width}px: goal banner clears the S-K-A-T-E checklist`, hud.msgLetters === 0 && hud.msgCallout === 0, `msg×letters=${Math.round(hud.msgLetters)} msg×callout=${Math.round(hud.msgCallout)}`)
        ok(`phone ${vp.width}px: banners stay on-screen`, hud.msgOver === 0 && hud.calloutOver === 0, `msgOverflow=${Math.round(hud.msgOver)} calloutOverflow=${Math.round(hud.calloutOver)}`)
        ok(`phone ${vp.width}px: banner text fits its box`, hud.msgClip <= 1, `clip=${Math.round(hud.msgClip)}px`)
        ok(`phone ${vp.width}px: score clears the combo line`, hud.scoreCombo === 0, `score×combo=${Math.round(hud.scoreCombo)}`)
        // #3379 — the replay tail earned surfaces the old loop never saw: the widest
        // attract chip (ALL-TIME prefix) and the near-miss replay's badge/chip/hint stack.
        // A 25-char badge on nowrap at 0.2em tracking is wider than a 320px screen, and
        // the SHARE chip is pinned into the same corner the skip hint runs through.
        const RC = `(() => {
            const rc = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, r: b.right, b: b.bottom, sw: el.scrollWidth, cw: el.clientWidth } }
            const txt = (s) => [...document.querySelectorAll('div,span')].filter(d => d.textContent.trim().startsWith(s) && d.children.length <= 6).sort((a, b) => a.textContent.length - b.textContent.length)[0]
            return { rc, txt }
        })()`
        // bank a line (reset wipes, the run rewrites the store), skip to attract,
        // reload so the chip wears its longest variant: ALL-TIME BEST LINE … ★ GOALS
        await pg.evaluate(() => { const g = window.__game; g.reset(7); g.step({}, 300); window.__grindTest.teleport({ timeLeft: 0 }); g.release() })
        await new Promise(r => setTimeout(r, 700))
        for (let i = 0; i < 4; i++) {
            const sc = await pg.evaluate(() => window.__grindTest.state().screen)
            if (sc === 'attract') break
            await pg.keyboard.press('Space')
            await new Promise(r => setTimeout(r, 300))
        }
        await pg.reload({ waitUntil: 'load' })
        await pg.waitForFunction('window.__grindTest', { timeout: 20000 })
        await new Promise(r => setTimeout(r, 450))
        const chip = await pg.evaluate(`(() => { const { rc, txt } = ${RC}
            const c = rc(txt('ALL-TIME BEST LINE'))
            return c ? { x: c.x, r: c.r, b: c.b, vw: window.innerWidth } : null })()`)
        ok(`phone ${vp.width}px: attract bank chip exists and keeps its side margins`, !!chip && chip.x > 6 && chip.r <= chip.vw - 6,
            chip ? `chip x=${Math.round(chip.x)} r=${Math.round(chip.r)} vw=${chip.vw}` : 'chip missing')
        // near-miss replay: badge + SPEED chip + SHARE chip + skip hint all on at once
        await pg.evaluate(() => { const g = window.__game; g.reset(5); g.release() })
        await new Promise(r => setTimeout(r, 900))
        await pg.evaluate(() => { window.__grindTest.teleport({ letters: { S: true }, timeLeft: 0.01 }) })
        await new Promise(r => setTimeout(r, 450))
        const rp = await pg.evaluate(`(() => { const { rc, txt } = ${RC}
            const badge = rc(txt('NEAR MISS')), speed = rc(txt('SPEED')), share = rc(txt('SHARE — S')), hint = rc(txt('TAP — SKIP') || txt('SPACE / TAP'))
            const vw = window.innerWidth
            const ov = (a, b) => (!a || !b) ? 0 : Math.max(0, Math.min(a.r, b.r) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.y, b.y))
            const st = window.__grindTest.state()
            return { vw, screen: st.screen, near: !!(st.replay && st.replay.near), shareHint: ov(share, hint), badgeSpeed: ov(badge, speed),
                badgeOver: badge ? Math.max(0, -badge.x, badge.r - vw) : 1e3, badgeClip: badge ? badge.sw - badge.cw : 1e3 } })()`)
        ok(`phone ${vp.width}px: near-miss replay reached with its badge`, rp.screen === 'replay' && rp.near, `screen=${rp.screen} near=${rp.near}`)
        ok(`phone ${vp.width}px: NEAR MISS badge on-screen and inside its box`, rp.badgeOver === 0 && rp.badgeClip <= 1, `overflow=${Math.round(rp.badgeOver)} clip=${Math.round(rp.badgeClip)}px`)
        ok(`phone ${vp.width}px: badge clears SPEED, SHARE clears the skip hint`, rp.badgeSpeed === 0 && rp.shareHint === 0, `badge×speed=${Math.round(rp.badgeSpeed)} share×hint=${Math.round(rp.shareHint)}`)
        await pg.close()
    }

    // ── #3394 the thinking bot rides attract ─────────────────────────────
    // ?style=3 puts the searcher on the FIRST attract loop; a cleared store
    // keeps attract bot-driven (no banked best to re-ride). Sample the live
    // cabinet: the searcher must plan (nSearch), commit (nCommit), score, and
    // never come home on a tumble.
    const errsT = []
    const p4 = await openGame(browser, { url: `${BASE}/grind-city?style=3`, hook: '__grindTest' })
    p4.on('pageerror', (e) => errsT.push(e.message))
    await p4.waitForFunction('window.__game', { timeout: 20000 })
    await p4.evaluate(() => { try { localStorage.clear() } catch { /* private mode */ } })
    await p4.reload()
    await p4.waitForFunction('window.__game', { timeout: 20000 })
    let thinksSeen = false, commits = 0, bestScore = 0, tumble = 0, searchMax = 0
    // #3401 style tell — the corner chip must name the thinker and wear each commit.
    let chipNamed = false, chipFlash = false, chipOver = 0
    const chipOf = (pg) => pg.evaluate(() => {
        const el = document.querySelector('[data-q="attract-style"]')
        if (!el) return null
        const b = el.getBoundingClientRect()
        return { txt: el.textContent, op: Number(el.style.opacity), r: b.right, vw: window.innerWidth }
    })
    for (let k = 0; k < 24; k++) {
        await new Promise(r => setTimeout(r, 500))
        const st = await p4.evaluate(() => window.__grindTest.state())
        if (st.thinks && st.screen === 'attract') thinksSeen = true
        const chip = await chipOf(p4)
        if (chip && chip.op > 0.5) {
            if (/LOOP 4\/4 · THINKING/.test(chip.txt)) chipNamed = true
            if (/✓ COMMIT/.test(chip.txt)) chipFlash = true
            chipOver = Math.max(chipOver, chip.r - (chip.vw - 6))
        }
        if (st.screen !== 'attract') break   // the human took the plaza (shouldn't happen)
        commits = Math.max(commits, st.nCommit || 0)
        searchMax = Math.max(searchMax, st.nSearch || 0)
        bestScore = Math.max(bestScore, st.score)
        if (st.phase === 'tumble') tumble++
    }
    ok('#3394 attract rides the thinking bot (?style=3, clears the bank)', thinksSeen, `thinks=${thinksSeen}`)
    ok('#3394 the searcher plans and commits on the live cabinet', searchMax > 0 && commits > 0, `searched=${searchMax} committed=${commits}`)
    ok('#3394 the searched attract line scores and never bails', bestScore > 0 && tumble === 0, `score=${bestScore} tumble-samples=${tumble}`)
    ok('#3394 zero page errors on the thinking attract', errsT.length === 0, errsT.join(';'))
    ok('#3401 the attract corner names the thinking rider', chipNamed, `named=${chipNamed}`)
    ok('#3401 every searched commit flashes on the chip (0.6 s flash > 0.5 s sampling)', chipFlash && commits > 0, `flash=${chipFlash} commits=${commits}`)
    ok('#3401 the style chip stays inside the frame', chipOver <= 0, `right overflow=${Math.round(chipOver)}px`)
    await p4.close()

    // #3401 — the corner names EVERY rider, not just the thinker; and at phone
    // width the chip must fit while the searcher rides and tap must still start
    // the game mid-search (the long-lived searched line is no hostage).
    const p5 = await openGame(browser, { url: `${BASE}/grind-city`, hook: '__grindTest' })
    await p5.waitForFunction('window.__game', { timeout: 20000 })
    await p5.evaluate(() => { try { localStorage.clear() } catch { /* private mode */ } })
    await p5.reload()
    await p5.waitForFunction('window.__game', { timeout: 20000 })
    await new Promise(r => setTimeout(r, 450))
    const chip0 = await chipOf(p5)
    ok('#3401 a fresh plaza names the classic rider', !!chip0 && /LOOP 1\/4 · CLASSIC/.test(chip0.txt) && chip0.op > 0.5, JSON.stringify(chip0))
    await p5.close()

    const p6 = await openGame(browser, { url: `${BASE}/grind-city?style=3`, viewport: { width: 390, height: 844 }, hook: '__grindTest', touch: true })
    await p6.waitForFunction('window.__game', { timeout: 20000 })
    await p6.evaluate(() => { try { localStorage.clear() } catch { /* private mode */ } })
    await p6.reload()
    await p6.waitForFunction('window.__game', { timeout: 20000 })
    let chipPhone = null
    for (let k = 0; k < 8; k++) {
        await new Promise(r => setTimeout(r, 400))
        const c = await chipOf(p6)
        if (c && c.op > 0.5) { chipPhone = c; break }
    }
    ok('#3401 phone 390px: the thinker wears its chip', !!chipPhone && /LOOP 4\/4 · THINKING/.test(chipPhone.txt) && chipPhone.r <= chipPhone.vw - 6,
        chipPhone ? `txt="${chipPhone.txt}" r=${Math.round(chipPhone.r)}/${chipPhone.vw}` : 'chip missing')
    // the first cut drew the chip into the ARCADE button — pin that corner peace
    // forever: the chip's box must not intersect any chrome button it shares with.
    const coll = await p6.evaluate(() => {
        const q = document.querySelector('[data-q="attract-style"]')
        if (!q) return null
        const qb = q.getBoundingClientRect()
        const hits = [...document.querySelectorAll('button,div,span,a')].filter(el => el.children.length === 0 && ['ARCADE', 'FEEDBACK', 'PAUSE', 'PADS'].includes(el.textContent.trim()))
        let bad = 0
        for (const el of hits) {
            const b = el.getBoundingClientRect()
            if (qb.left < b.right && qb.right > b.left && qb.top < b.bottom && qb.bottom > b.top) bad++
        }
        return { chrome: hits.length, overlaps: bad }
    })
    ok('#3401 the rider chip shares no ink with the chrome buttons', !!coll && coll.chrome >= 2 && coll.overlaps === 0, JSON.stringify(coll))
    await p6.touchscreen.tap(195, 420)
    await new Promise(r => setTimeout(r, 400))
    const tapScreen = await p6.evaluate(() => window.__grindTest.state().screen)
    ok('#3401 phone tap still preempts the search mid-attract', tapScreen === 'play', `screen=${tapScreen}`)
    await p6.close()

    console.log(out.join('\n'))
    console.log(out.every(l => l.startsWith('PASS')) ? 'DRIVE GREEN' : 'DRIVE RED')
    process.exitCode = out.every(l => l.startsWith('PASS')) ? 0 : 1
} finally {
    await browser.close()
}
