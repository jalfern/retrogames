// feedback.js — the demo half of the in-game FEEDBACK button (#737).
//
// Same law as the game-side button (src/utils/feedback.js): a tap captures a
// note plus a canvas screenshot + route metadata and files it THROUGH the
// Cloudflare relay — the GitHub token stays server-side, a report without Jon's
// key lands behind needs-approval, and the button self-hides until the relay
// advertises /status.feedback, so a page deployed ahead of the relay shows no
// dead button. `?feedback=1` forces it on for local/QA testing (the relay is
// cross-origin, so file:// previews can never reach it).
//
// The demo twist (#737 spec): a demo report carries a DIAGNOSTICS block instead
// of the 30 s input ring — browser, GPU, settings, and the last ~10 s of REAL
// frame times with hitches — because "it stutters" from a demo is a performance
// complaint, not an input one. This replaces reading numbers off the screen
// (#702): the same panel that files the note also files the proof.
//
// Self-contained, like credits.js: no build step, one tag before </body>:
//   <script src="feedback.js"></script>
// The tag stacks in the bottom-right column ABOVE the credits tag (the caption
// reserve in credits.js keeps #hud out of that column at any height, #1078).
//
// The pure logic is exposed on window.__demoFeedback so the harness
// (scripts/feedbackcheck.mjs) drives it in plain Node; the DOM mounts only
// when a document exists.

(function () {
  'use strict'

  var RELAY = 'https://retrogames.jalfern.workers.dev'
  var JONKEY_PARAM = 'jonkey'
  var JONKEY_STORE = 'rg.jonkey' // same origin as the game side: one key, both surfaces
  var FRAME_WINDOW_MS = 10_000   // "~10 s of real frame times" (#737)
  var HITCH_MS = 33.4            // one frame below 30 fps = a hitch
  var DIAG_MAX_BYTES = 8000      // the relay's FB_MAX_DIAG — never exceed it

  // ── pure logic (harness-visible via window.__demoFeedback) ──────────────────

  // Ring of REAL frame deltas from the page's rAF clock, trimmed to the last
  // `windowMs`. A delta is the gap between consecutive presentation frames, so
  // a hitch is one large sample — exactly what "stutters" means on a demo.
  function makeFrameRing(windowMs) {
    var w = windowMs || FRAME_WINDOW_MS
    var buf = []
    return {
      push: function (at, ms) {
        if (!(at >= 0)) return
        buf.push({ at: at, ms: ms })
        var cutoff = at - w
        while (buf.length && buf[0].at < cutoff) buf.shift()
      },
      size: function () { return buf.length },
      summary: function (at) {
        var n = buf.length
        if (!n) return { n: 0, spanMs: 0, avgMs: 0, maxMs: 0, hitches: [] }
        var sum = 0, max = 0, hitches = []
        for (var i = 0; i < n; i++) {
          var f = buf[i]
          sum += f.ms
          if (f.ms > max) max = f.ms
          if (f.ms >= HITCH_MS) hitches.push({ t: Math.round(f.at), ms: Math.round(f.ms) })
        }
        return {
          n: n,
          spanMs: Math.round(at - buf[0].at),
          avgMs: Math.round((sum / n) * 100) / 100,
          maxMs: Math.round(max),
          hitches: hitches,
        }
      },
    }
  }

  // The GPU string QA reads off the screen today — from the page itself.
  function gpuInfo(win) {
    try {
      var doc = win && win.document
      if (!doc || !doc.createElement) return 'n/a'
      var c = doc.createElement('canvas')
      var gl = null
      try { gl = c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl') } catch (e) { /* no GL */ }
      if (!gl) return 'n/a'
      var ext = null
      try { ext = gl.getExtension('WEBGL_debug_renderer_info') } catch (e) { /* fine */ }
      var s = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
      return String(s || 'n/a').slice(0, 200)
    } catch (e) { return 'n/a' }
  }

  function demoNameFrom(route) {
    var parts = String(route || '').split('/').filter(Boolean)
    var last = parts[parts.length - 1] || ''
    return last.replace(/\.html?$/i, '') || 'unknown'
  }

  function bLen(s) {
    try { return new TextEncoder().encode(s).length } catch (e) { return s.length }
  }

  // The #737 diagnostics block: browser, GPU, settings, and the last ~10 s of
  // real frame times with hitches. `window.DEMO_DIAG` (object or zero-arg
  // function) lets a demo append its own settings without touching this file.
  // Always stays under the relay's diag cap: hitch detail is thinned first,
  // dropped (count kept) last.
  function buildDiag(opts) {
    opts = opts || {}
    var win = opts.win != null ? opts.win : (typeof window !== 'undefined' ? window : null)
    var route = opts.route || (win && win.location && win.location.pathname) || ''
    var frames = opts.frames || { n: 0, spanMs: 0, avgMs: 0, maxMs: 0, hitches: [] }
    var extra = null
    try {
      var hook = win && win.DEMO_DIAG
      if (typeof hook === 'function') extra = hook()
      else if (hook && typeof hook === 'object') extra = hook
    } catch (e) { extra = null }
    if (extra && typeof extra !== 'object') extra = null
    var cfg = (win && win.DEMO_CREDITS) || null
    var settings = { demo: demoNameFrom(route) }
    if (cfg) { settings.accent = cfg.accent; settings.shipped = cfg.shipped }
    settings.dpr = (win && win.devicePixelRatio != null) ? win.devicePixelRatio : null
    settings.viewport = (win && win.innerWidth) ? (win.innerWidth + 'x' + (win.innerHeight || 0)) : null
    if (extra) {
      var k
      for (k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) settings[k] = extra[k] }
    }
    var diag = {
      browser: {
        ua: String((win && win.navigator && win.navigator.userAgent) || 'n/a').slice(0, 200),
        deviceMemory: (win && win.navigator && win.navigator.deviceMemory != null) ? win.navigator.deviceMemory : null,
        cores: (win && win.navigator && win.navigator.hardwareConcurrency != null) ? win.navigator.hardwareConcurrency : null,
      },
      gpu: gpuInfo(win),
      settings: settings,
      frames: {
        n: frames.n, spanMs: frames.spanMs, avgMs: frames.avgMs, maxMs: frames.maxMs,
        hitches: frames.hitches.slice(),
      },
    }
    var bytes = bLen(JSON.stringify(diag))
    while (bytes > DIAG_MAX_BYTES && diag.frames.hitches.length > 1) {
      diag.frames.hitches = diag.frames.hitches.filter(function (h, i) { return i % 2 === 0 })
      bytes = bLen(JSON.stringify(diag))
    }
    if (bytes > DIAG_MAX_BYTES && diag.frames.hitches.length) {
      diag.frames = {
        n: frames.n, spanMs: frames.spanMs, avgMs: frames.avgMs, maxMs: frames.maxMs,
        hitches: [], hitchesDropped: frames.hitches.length,
      }
    }
    return diag
  }

  // Assemble a validated-shape demo report. The relay accepts it as-is: note +
  // gameId + route + build + diag (+ screenshot when a canvas will render one).
  function captureDemoFeedback(opts) {
    opts = opts || {}
    var win = opts.win != null ? opts.win : (typeof window !== 'undefined' ? window : null)
    var route = opts.route || (win && win.location && win.location.pathname) || ''
    var payload = {
      note: String(opts.note == null ? '' : opts.note),
      gameId: demoNameFrom(route),
      build: 'static',
      route: route,
      ts: opts.ts != null ? opts.ts : Date.now(),
    }
    if (win && win.navigator && win.navigator.userAgent) payload.ua = String(win.navigator.userAgent).slice(0, 200)
    if (opts.screenshot) payload.screenshot = opts.screenshot
    payload.diag = buildDiag({ win: win, route: route, frames: opts.frames || null })
    return payload
  }

  // Does the relay currently accept feedback reports? `?feedback=1` forces true
  // (file:// and local QA); otherwise the probe must see feedback:true.
  function probe(opts) {
    opts = opts || {}
    var win = opts.win != null ? opts.win : (typeof window !== 'undefined' ? window : null)
    if (win && win.location && /[?&]feedback=1/.test(win.location.search || '')) return Promise.resolve(true)
    var doFetch = opts.fetchImpl || (typeof fetch === 'function' ? fetch : null)
    if (!doFetch) return Promise.resolve(false)
    return doFetch((opts.base || RELAY) + '/status')
      .then(function (res) { return res.json().catch(function () { return {} }) })
      .then(function (j) { return !!(j && j.feedback) })
      .catch(function () { return false })
  }

  // File via the relay. Never throws: a failed submit must not break the demo.
  function submit(payload, opts) {
    opts = opts || {}
    var doFetch = opts.fetchImpl || (typeof fetch === 'function' ? fetch : null)
    if (!doFetch) return Promise.resolve({ ok: false, err: 'no fetch' })
    var body = {}
    var k
    for (k in payload) { if (Object.prototype.hasOwnProperty.call(payload, k)) body[k] = payload[k] }
    var key = readJonKey(opts.storage)
    if (key) body.key = key
    return doFetch((opts.base || RELAY) + '/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function (res) {
        return res.json().catch(function () { return {} }).then(function (j) {
          return {
            ok: !!(j && j.ok),
            issue: (j && j.issue) || null,
            err: (j && j.err) || (res.ok ? null : 'http ' + res.status),
          }
        })
      })
      .catch(function (e) { return { ok: false, err: String((e && e.message) || e) } })
  }

  // Jon's key (#886) — same store as the game side (one origin), so a key saved
  // on a game page rides demo reports too, and the one-time link works here.
  function storeJonKey(search, storage) {
    var m = new RegExp('[?&]' + JONKEY_PARAM + '=([^&#]+)').exec(search || '')
    if (!m || !storage) return null
    var key = m[1]
    try { key = decodeURIComponent(key) } catch (e) { /* raw value */ }
    if (!key) return null
    try { storage.setItem(JONKEY_STORE, key) } catch (e) { /* private mode */ }
    return key
  }
  function readJonKey(storage) {
    if (!storage) return null
    try { return storage.getItem(JONKEY_STORE) } catch (e) { return null }
  }
  function saveJonKey(value, storage) {
    var key = String(value == null ? '' : value).trim()
    if (!key || !storage) return null
    try { storage.setItem(JONKEY_STORE, key) } catch (e) { /* private mode */ }
    return key
  }

  var api = {
    makeFrameRing: makeFrameRing,
    gpuInfo: gpuInfo,
    demoNameFrom: demoNameFrom,
    buildDiag: buildDiag,
    captureDemoFeedback: captureDemoFeedback,
    probe: probe,
    submit: submit,
    storeJonKey: storeJonKey,
    readJonKey: readJonKey,
    saveJonKey: saveJonKey,
    RELAY: RELAY,
    JONKEY_STORE: JONKEY_STORE,
    HITCH_MS: HITCH_MS,
    FRAME_WINDOW_MS: FRAME_WINDOW_MS,
    DIAG_MAX_BYTES: DIAG_MAX_BYTES,
  }
  if (typeof window !== 'undefined') window.__demoFeedback = api

  // ── DOM ─────────────────────────────────────────────────────────────────────

  if (typeof window === 'undefined' || typeof document === 'undefined') return
  var win = window
  var doc = document

  try {
    if (storeJonKey(win.location.search, win.localStorage) != null) {
      var cleaned = (win.location.search || '')
        .replace(new RegExp('([?&])' + JONKEY_PARAM + '=[^&#]*', 'g'), '$1')
        .replace(/([?&])$/, '')
        .replace('?&', '?')
      win.history.replaceState({}, '', win.location.pathname + cleaned + (win.location.hash || ''))
    }
  } catch (e) { /* storage blocked */ }

  // The real frame-time ring: one sample per presentation frame from page load.
  var ring = makeFrameRing()
  var lastT = null
  function loop(t) {
    if (lastT != null && t - lastT > 0) ring.push(t, t - lastT)
    lastT = t
    win.requestAnimationFrame(loop)
  }
  if (typeof win.requestAnimationFrame === 'function') win.requestAnimationFrame(loop)

  function captureShot() {
    var cs = doc.querySelectorAll('canvas')
    for (var i = cs.length - 1; i >= 0; i--) {
      var c = cs[i]
      if (!c.width || !c.height) continue
      try {
        var url = c.toDataURL('image/png')
        if (url && url.length > 64) return url
      } catch (e) { /* tainted / WebGL: fall through */ }
    }
    return null
  }

  var statusEl, noteEl, toastEl, keyInputEl
  function setStatus(t) { if (statusEl) statusEl.textContent = t }

  function closePanel() {
    var card = doc.getElementById('dfeedback-card')
    if (card) card.classList.remove('open')
    setStatus('')
  }

  function send() {
    var note = noteEl ? noteEl.value : ''
    if (!note.trim()) return
    setStatus('sending…')
    var payload = captureDemoFeedback({
      note: note,
      route: win.location.pathname,
      frames: ring.summary(performance.now()),
      screenshot: captureShot(),
      win: win,
    })
    submit(payload, { storage: win.localStorage }).then(function (res) {
      if (res.ok) {
        var n = String(res.issue || '').split('/').pop()
        noteEl.value = ''
        closePanel()
        if (toastEl) {
          toastEl.textContent = 'sent #' + n
          toastEl.classList.add('on')
          setTimeout(function () {
            if (toastEl) { toastEl.textContent = ''; toastEl.classList.remove('on') }
          }, 1800)
        }
      } else {
        setStatus('failed: ' + res.err)
      }
    })
  }

  function saveKey() {
    var v = keyInputEl ? keyInputEl.value : ''
    if (saveJonKey(v, win.localStorage)) {
      if (keyInputEl) keyInputEl.value = ''
      var row = doc.getElementById('dfeedback-keyrow')
      if (row) {
        row.innerHTML = ''
        var s = doc.createElement('span')
        s.className = 'dfeedback-keystored'
        s.textContent = 'Jon key saved on this device'
        row.appendChild(s)
      }
    }
  }

  function mount() {
    var s = doc.createElement('style')
    s.textContent =
      '#dfeedback-tag{position:fixed;right:max(12px,env(safe-area-inset-right));' +
      'bottom:calc(max(12px,env(safe-area-inset-bottom)) + 40px);z-index:7;pointer-events:auto;' +
      'display:inline-flex;align-items:center;box-sizing:border-box;min-height:32px;' +
      'font:9px/1 ui-monospace,Menlo,monospace;letter-spacing:.28em;text-transform:uppercase;' +
      'color:rgba(255,255,255,.55);background:rgba(6,8,14,.55);border:1px solid rgba(255,255,255,.16);' +
      'border-radius:999px;padding:7px 11px;cursor:pointer;backdrop-filter:blur(4px);' +
      '-webkit-backdrop-filter:blur(4px);transition:color .25s,border-color .25s;}' +
      '#dfeedback-tag:hover{color:#fff;border-color:var(--credits-accent,#fff);}' +
      '#dfeedback-toast{position:fixed;right:max(12px,env(safe-area-inset-right));' +
      'bottom:calc(max(12px,env(safe-area-inset-bottom)) + 80px);z-index:75;' +
      'font:9px/1 ui-monospace,Menlo,monospace;letter-spacing:.28em;text-transform:uppercase;' +
      'color:rgba(255,255,255,.85);background:rgba(6,8,14,.75);border:1px solid rgba(255,255,255,.2);' +
      'border-radius:999px;padding:8px 12px;pointer-events:none;opacity:0;transition:opacity .3s;}' +
      '#dfeedback-toast.on{opacity:1;}' +
      '#dfeedback-card{position:fixed;inset:0;z-index:8;display:none;place-items:center;' +
      'padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) ' +
      'max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));' +
      'background:rgba(3,4,8,.62);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);}' +
      '#dfeedback-card.open{display:grid;animation:cc-fade .22s ease-out;}' +
      '@media (prefers-reduced-motion:reduce){#dfeedback-card.open{animation:none}}' +
      '.dfeedback-box{max-width:min(88vw,430px);max-height:100%;overflow:auto;' +
      'background:#0b0d13;border:1px solid var(--credits-accent,#666);border-radius:10px;' +
      'padding:22px 24px;font:11px/1.8 ui-monospace,Menlo,monospace;letter-spacing:.12em;' +
      'color:#d7dbe4;text-transform:uppercase;cursor:default;}' +
      '.dfeedback-k{color:#6b7280;}' +
      '.dfeedback-note{width:100%;box-sizing:border-box;margin-top:10px;resize:none;' +
      'background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.18);border-radius:6px;' +
      'padding:8px;font:11px/1.6 ui-monospace,Menlo,monospace;color:#eef1f7;text-transform:none;' +
      'letter-spacing:.02em;outline:none;}' +
      '.dfeedback-row{display:flex;gap:8px;margin-top:10px;align-items:center;}' +
      '.dfeedback-key{flex:1;min-width:0;background:rgba(255,255,255,.05);' +
      'border:1px solid rgba(255,255,255,.18);border-radius:6px;padding:6px 8px;' +
      'font:10px ui-monospace,Menlo,monospace;color:#eef1f7;outline:none;}' +
      '.dfeedback-keystored{font-size:9px;letter-spacing:.2em;color:rgba(215,219,228,.7);}' +
      '.dfeedback-btn{font-size:9px;letter-spacing:.3em;color:#d7dbe4;background:transparent;' +
      'border:1px solid rgba(255,255,255,.3);border-radius:6px;padding:6px 12px;cursor:pointer;}' +
      '.dfeedback-btn:hover{color:#fff;border-color:#fff;}' +
      '.dfeedback-btn:disabled{opacity:.4;cursor:default;}' +
      '.dfeedback-status{margin-top:8px;font-size:9px;letter-spacing:.2em;color:rgba(215,219,228,.7);text-transform:none;}'
    doc.head.appendChild(s)

    var tag = doc.createElement('button')
    tag.id = 'dfeedback-tag'
    tag.setAttribute('aria-label', 'Feedback about this demo')
    tag.setAttribute('data-feedback', 'open')
    tag.textContent = 'FEEDBACK ▸'

    var box = doc.createElement('div')
    box.className = 'dfeedback-box'
    box.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
      '<span style="font-size:13px;font-weight:800;letter-spacing:.3em;color:#fff;">FEEDBACK</span>' +
      '<button class="dfeedback-btn" data-feedback="close" aria-label="Close feedback">CLOSE</button></div>' +
      '<p style="margin:10px 0 0;"><span class="dfeedback-k">What happened? </span>' +
      'The last ~10 s of frame times + GPU/browser come along automatically.</p>' +
      '<textarea class="dfeedback-note" data-feedback="note" rows="4" maxlength="2000" ' +
      'placeholder="e.g. stutters after the third wave, black flash on resize…"></textarea>' +
      '<div class="dfeedback-row" id="dfeedback-keyrow"></div>' +
      '<div class="dfeedback-row">' +
      '<button class="dfeedback-btn" data-feedback="send">SEND</button>' +
      '<span class="dfeedback-status" data-feedback="status"></span></div>'

    var card = doc.createElement('div')
    card.id = 'dfeedback-card'
    card.appendChild(box)

    toastEl = doc.createElement('div')
    toastEl.id = 'dfeedback-toast'
    toastEl.setAttribute('data-feedback', 'toast')

    noteEl = box.querySelector('[data-feedback="note"]')
    statusEl = box.querySelector('[data-feedback="status"]')
    var sendBtn = box.querySelector('[data-feedback="send"]')

    var hasKey = false
    try { hasKey = !!readJonKey(win.localStorage) } catch (e) { /* fine */ }
    if (!hasKey) {
      var row = box.querySelector('#dfeedback-keyrow')
      var ki = doc.createElement('input')
      ki.className = 'dfeedback-key'
      ki.type = 'password'
      ki.placeholder = 'Jon key (optional)'
      ki.setAttribute('data-feedback', 'keyinput')
      keyInputEl = ki
      var kb = doc.createElement('button')
      kb.className = 'dfeedback-btn'
      kb.setAttribute('data-feedback', 'keysave')
      kb.textContent = 'SAVE KEY'
      row.appendChild(ki)
      row.appendChild(kb)
    }

    tag.addEventListener('pointerdown', function (e) { e.stopPropagation() })
    tag.addEventListener('click', function (e) { e.stopPropagation(); card.classList.add('open') })
    card.addEventListener('pointerdown', function (e) { e.stopPropagation() })
    card.querySelector('[data-feedback="close"]').addEventListener('click', function (e) { e.stopPropagation(); closePanel() })
    card.addEventListener('click', function () { closePanel() })
    sendBtn.addEventListener('click', function (e) { e.stopPropagation(); send() })
    box.querySelector('#dfeedback-keyrow').addEventListener('click', function (e) { e.stopPropagation() })
    var kb2 = box.querySelector('[data-feedback="keysave"]')
    if (kb2) kb2.addEventListener('click', function (e) { e.stopPropagation(); saveKey() })
    // typing in the panel must not steer the demo: the demos listen on
    // window/document in the bubble phase, so a capture-phase shield keeps
    // keystrokes out of the game while the browser default still writes them.
    var shield = function (e) {
      if (card.classList.contains('open') && card.contains(e.target)) {
        if (e.key === 'Escape') closePanel()
        e.stopPropagation()
      }
    }
    doc.addEventListener('keydown', shield, true)
    doc.addEventListener('keyup', shield, true)
    noteEl && noteEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send() }
    })

    doc.body.appendChild(tag)
    doc.body.appendChild(card)
    doc.body.appendChild(toastEl)
    // keep the toast element referenced for textContent + class
    toastEl = doc.getElementById('dfeedback-toast')
  }

  probe({ win: win }).then(function (on) {
    if (!on) return
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', mount)
    else mount()
  })
})()
