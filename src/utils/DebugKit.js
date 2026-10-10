// DebugKit — the forge's in-game surgery kit. DEV builds only.
//
// Any game can mount it:
//   const unmount = mountDbg({ title, getState, actions })
//     getState() → array of strings drawn live in the F1 overlay
//     actions   → [{ label, run }] rendered as clickable cheat buttons
//
// F1 toggles the panel; production never sees any of it.
// window.__dbg is also exposed: { state(), act('label') } for console work.
// Games with an existing DEV hook (window.__<game>Test) keep that hook
// untouched — the panel is for humans poking at a symptom; the hook stays
// the harness's read-only contract.

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
