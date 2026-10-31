// DebugKit — the forge's in-game surgery kit. DEV builds only.
//
// Any game can mount it:
//   const unmount = mountDbg({ title, getState, actions })
//     getState() → array of strings drawn live in the F1 overlay
//     actions   → [{ label, run }] rendered as clickable cheat buttons
//
// F1 toggles the panel; production never sees any of it.
// window.__dbg is also exposed: { state(), act('label') } for console work.
// A built-in "REC" button records a LIVE session (the game's own rAF loop
// banks each tick, #527 item 1) and "download rec .json" saves the last
// recording (#527 item 6).
// Games with an existing DEV hook (window.__<game>Test) keep that hook
// untouched — the panel is for humans poking at a symptom; the hook stays
// the harness's read-only contract.

import { recDownload } from './recording.js'

let el = null
let teardown = null

export function mountDbg({ title, getState, actions = [] }) {
    if (!import.meta.env.DEV) return () => {}
    unmountDbg()

    el = document.createElement('div')
    el.style.cssText = 'position:fixed;top:0;left:0;z-index:9999;display:none;' +
        'background:rgba(0,0,10,.92);border:1px solid #0f0;color:#0f0;font:11px/1.5 monospace;' +
        'padding:8px 10px;max-width:440px;white-space:pre-wrap;user-select:none'
    const head = document.createElement('div')
    head.style.cssText = 'font-weight:bold;letter-spacing:2px;margin-bottom:4px;color:#8f8'
    head.textContent = `DEBUG — ${title}`
    const body = document.createElement('div')
    const btnRow = document.createElement('div')
    btnRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-top:6px'

    let flashMsg = ''
    let flashUntil = 0
    const flash = m => { flashMsg = `» ${m}`; flashUntil = Date.now() + 3000 }

    actions.forEach(a => {
        const b = document.createElement('button')
        b.textContent = a.label
        b.style.cssText = 'background:#031;color:#0f0;border:1px solid #0f0;font:10px monospace;padding:2px 6px;cursor:pointer'
        b.onclick = () => {
            try { const r = a.run(); flash(r === undefined ? a.label : String(r)) }
            catch (e) { flash('ERR ' + e.message) }
        }
        btnRow.appendChild(b)
    })

    // #527 item 1 — record a LIVE session. The game's own rAF loop banks each
    // tick via recordLiveTick, so no harness drives step: press to start, play
    // for real, press again to stop + save. Works on any wired game.
    const liveRecBtn = document.createElement('button')
    liveRecBtn.textContent = 'REC'
    liveRecBtn.style.cssText = 'background:#310;color:#f88;border:1px solid #f88;font:10px monospace;padding:2px 8px;cursor:pointer'
    liveRecBtn.onclick = async () => {
        const g = window.__game
        if (!g || typeof g.recordStart !== 'function') { flash('no __game (game not wired)'); return }
        try {
            if (g.isRecording && g.isRecording()) {
                const rec = g.recordStop()
                if (!rec) { flash('REC: nothing captured'); return }
                if (window.__voiceFlush) { try { await window.__voiceFlush } catch { /* voice optional */ } } // #1247: mic flushes its last chunk async
                const dl = recDownload(rec)
                const url = URL.createObjectURL(new Blob([dl.text], { type: 'application/json' }))
                const a = document.createElement('a')
                a.href = url; a.download = dl.filename
                document.body.appendChild(a); a.click(); a.remove()
                setTimeout(() => URL.revokeObjectURL(url), 0)
                flash(`REC saved ${dl.filename} (${rec.ticks} ticks)`)
            } else {
                g.recordStart(30)
                flash('REC on — play, press again to save')
            }
        } catch (e) { flash('ERR ' + e.message) }
    }
    btnRow.appendChild(liveRecBtn)

    // #527 item 6 — one-click save of a hand-recorded session (DEV only).
    const recBtn = document.createElement('button')
    recBtn.textContent = 'download rec .json'
    recBtn.style.cssText = 'background:#103;color:#8cf;border:1px solid #8cf;font:10px monospace;padding:2px 6px;cursor:pointer'
    recBtn.onclick = async () => {
        try {
            const rec = window.__lastRecording
            if (!rec) { flash('no recording — recordStart() then recordStop() first'); return }
            if (window.__voiceFlush) { try { await window.__voiceFlush } catch { /* voice optional */ } } // #1247
            const dl = recDownload(rec)
            const url = URL.createObjectURL(new Blob([dl.text], { type: 'application/json' }))
            const a = document.createElement('a')
            a.href = url
            a.download = dl.filename
            document.body.appendChild(a)
            a.click()
            a.remove()
            setTimeout(() => URL.revokeObjectURL(url), 0)
            flash('saved ' + dl.filename)
        } catch (e) { flash('ERR ' + e.message) }
    }
    btnRow.appendChild(recBtn)

    el.append(head, body, btnRow)
    document.body.appendChild(el)

    const timer = setInterval(() => {
        if (el.style.display === 'none') return
        body.textContent = getState().join('\n') + (Date.now() < flashUntil ? '\n' + flashMsg : '')
    }, 120)

    const onKey = e => {
        if (e.key === 'F1') {
            e.preventDefault()
            el.style.display = el.style.display === 'none' ? 'block' : 'none'
        }
    }
    window.addEventListener('keydown', onKey)

    teardown = () => { clearInterval(timer); window.removeEventListener('keydown', onKey) }

    window.__dbg = {
        state: () => getState(),
        act: label => {
            const a = actions.find(x => x.label === label)
            if (a) a.run()
            return !!a
        },
    }
    return unmountDbg
}

export function unmountDbg() {
    if (teardown) teardown()
    teardown = null
    if (el) { el.remove(); el = null }
    delete window.__dbg
}
