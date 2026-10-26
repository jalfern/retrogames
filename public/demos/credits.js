// credits.js — the BUILT BY card for /retrogames/demos/ (#674).
//
// One shared injector so every demo carries the same story: a small corner
// tag (bottom-right, out of the HUD way) that opens a card naming the
// builder + model, the GitHub issue that asked for it, the rough issue->ship
// span, and how much help the build got (solo test vs guided brief).
//
// A demo opts in with 2 tags before </body>:
//   <script>
//   window.DEMO_CREDITS = {
//     name: 'OCEAN', accent: '#ffb060',
//     issues: [451], span: '~1 h', shipped: '2026-10-18',
//     assist: 'guided', note: 'brief named the stack (WebGPU + FFT waves)',
//   }
//   </script>
//   <script src="credits.js"></script>
//
// The index sets window.DEMO_INDEX = { demos: [{el:'ocean', issues:[451],
// span:'~1 h', assist:'guided'}, ...] } instead, and this script stamps a
// built-by line into each card + a factory credit under .wrap.
//
// See public/demos/README.md — every new demo must ship the block (checked
// by npm run creditscheck).

(function () {
  var MODEL = 'Qwen3.8-Flash-Next-oQ4e-mtp'
  var MACHINE = 'Mac Studio, running locally — no cloud'
  var ISSUE_URL = 'https://github.com/jalfern/retrogames/issues/'

  var cfg = window.DEMO_CREDITS
  var idx = window.DEMO_INDEX

  function el(tag, cls, html) {
    var n = document.createElement(tag)
    if (cls) n.className = cls
    if (html != null) n.innerHTML = html
    return n
  }

  function line(c) {
    var issues = (c.issues || []).map(function (n) {
      return '<a href="' + ISSUE_URL + n + '" target="_blank" rel="noopener">#' + n + '</a>'
    }).join(' + ')
    var assist = c.assist === 'solo'
      ? 'SOLO TEST — only a goal was given'
      : 'GUIDED BRIEF — methods spelled out'
    if (c.note) assist += ' · ' + c.note
    return { issues: issues, assist: assist }
  }

  var css =
    '#credits-tag{position:fixed;right:max(12px,env(safe-area-inset-right));' +
    'bottom:max(12px,env(safe-area-inset-bottom));z-index:7;pointer-events:auto;' +
    'display:inline-flex;align-items:center;box-sizing:border-box;min-height:32px;' +
    'font:9px/1 ui-monospace,Menlo,monospace;letter-spacing:.28em;text-transform:uppercase;' +
    'color:rgba(255,255,255,.55);background:rgba(6,8,14,.55);border:1px solid rgba(255,255,255,.16);' +
    'border-radius:999px;padding:7px 11px;cursor:pointer;backdrop-filter:blur(4px);' +
    '-webkit-backdrop-filter:blur(4px);transition:color .25s,border-color .25s;}' +
    '#credits-tag:hover{color:#fff;border-color:var(--credits-accent,#fff);}' +
    '#credits-card{position:fixed;inset:0;z-index:8;display:none;place-items:center;' +
    'padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) ' +
    'max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));' +
    'background:rgba(3,4,8,.62);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);}' +
    '#credits-card.open{display:grid;animation:cc-fade .22s ease-out;}' +
    '#credits-card.open .cc-box{animation:cc-rise .28s ease-out;}' +
    '@keyframes cc-fade{from{opacity:0}}' +
    '@keyframes cc-rise{from{opacity:0;transform:translateY(2px)}}' +
    '@media (prefers-reduced-motion:reduce){#credits-card.open,#credits-card.open .cc-box{animation:none}}' +
    '.cc-box{max-width:min(88vw,430px);max-height:100%;overflow:auto;' +
    'background:#0b0d13;border:1px solid var(--credits-accent,#666);' +
    'border-radius:10px;padding:26px 28px;font:11px/1.9 ui-monospace,Menlo,monospace;' +
    'letter-spacing:.12em;color:#d7dbe4;text-transform:uppercase;cursor:default;}' +
    '.cc-name{font-size:15px;font-weight:800;letter-spacing:.3em;color:#fff;margin-bottom:14px;}' +
    '.cc-name i{font-style:normal;color:var(--credits-accent,#fff);}' +
    '.cc-k{color:#6b7280;}' +
    '.cc-box a{color:var(--credits-accent,#6cf);text-decoration:none;}' +
    '.cc-box a:hover{color:#fff;}' +
    '.cc-solo{color:#4dffb8;}.cc-guided{color:#ffb347;}' +
    '.cc-close{margin-top:16px;font-size:8px;letter-spacing:.35em;color:#6b7280;}' +
    '.credits-built{margin-top:6px;font-size:8px;letter-spacing:.3em;color:#6b7280;text-transform:uppercase;}' +
    '.credits-built a{color:#9ca3af;text-decoration:none;}.credits-built a:hover{color:#fff;}'

  function mount() {
    var s = document.createElement('style')
    s.textContent = css
    document.head.appendChild(s)

    if (idx) {
      var wrap = document.querySelector('.wrap')
      if (!wrap) return
      idx.demos.forEach(function (d) {
        var card = document.getElementById(d.el)
        if (!card) return
        var l = line(d)
        card.appendChild(el('p', 'credits-built',
          '<span class="' + (d.assist === 'solo' ? 'cc-solo' : 'cc-guided') + '">' +
          (d.assist === 'solo' ? 'SOLO' : 'GUIDED') + '</span> · BUILT BY QWEN · ' +
          d.span + ' ISSUE→SHIP · ' + l.issues))
      })
      var foot = wrap.querySelector('footer')
      var fact = el('p', 'credits-built',
        'ALL DEMOS BUILT BY <a href="https://github.com/jalfern/retrogames" target="_blank" rel="noopener">QWEN ' + MODEL + '</a> · ' + MACHINE.toUpperCase())
      fact.id = 'credits-factory'
      if (foot) wrap.insertBefore(fact, foot)
      return
    }

    if (!cfg || !cfg.name) return
    var root = document.documentElement
    if (cfg.accent) root.style.setProperty('--credits-accent', cfg.accent)
    var l = line(cfg)

    var tag = el('button', null, 'BUILT BY QWEN ▸')
    tag.id = 'credits-tag'
    tag.setAttribute('aria-label', 'Credits for ' + cfg.name)
    var box = el('div', 'cc-box',
      '<div class="cc-name"><i>' + cfg.name + '</i> — DEMO</div>' +
      '<div><span class="cc-k">Built by</span> QWEN ' + MODEL + '</div>' +
      '<div><span class="cc-k">Where</span> ' + MACHINE + '</div>' +
      '<div><span class="cc-k">Requested in</span> ' + l.issues + '</div>' +
      '<div><span class="cc-k">Build time</span> ' + cfg.span + ' ISSUE → SHIP · SHIPPED ' + cfg.shipped + '</div>' +
      '<div><span class="cc-k">Help</span> <span class="' + (cfg.assist === 'solo' ? 'cc-solo' : 'cc-guided') + '">' + l.assist + '</span></div>' +
      '<div class="cc-close">TAP ANYWHERE TO CLOSE ✕</div>')
    var card = el('div')
    card.id = 'credits-card'
    card.appendChild(box)

    function open() { card.classList.add('open') }
    function close() { card.classList.remove('open') }
    tag.addEventListener('pointerdown', function (e) { e.stopPropagation() })
    tag.addEventListener('click', function (e) { e.stopPropagation(); open() })
    card.addEventListener('pointerdown', function (e) { e.stopPropagation() })
    card.addEventListener('click', function () { close() })
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && card.classList.contains('open')) { e.stopPropagation(); close() }
    })
    document.body.appendChild(tag)
    document.body.appendChild(card)

    // The bottom-left caption (#hud) wraps at viewport width, so on phones its
    // last lines run under the corner tag (#1078). Reserve the tag's column:
    // cap the caption so its lines break before the badge instead of beneath it.
    // #1099: then keep the whole caption inside the viewport — tighten the font
    // one px at a time, and as a last resort clamp to the lines that fit, so
    // no demo caption is ever clipped or stacked over the badge in any mode.
    function reserveCaption() {
      var hud = document.getElementById('hud')
      if (!hud) return
      hud.style.maxWidth = ''
      hud.style.fontSize = ''
      hud.style.maxHeight = ''
      hud.style.overflow = ''
      hud.style.display = ''
      hud.style.webkitBoxOrient = ''
      hud.style.webkitLineClamp = ''
      var tr = tag.getBoundingClientRect()
      var hr = hud.getBoundingClientRect()
      var crossing = hr.top < tr.bottom && hr.bottom > tr.top
      if (crossing && hr.right > tr.left - 8) {
        hud.style.maxWidth = Math.max(48, Math.floor(tr.left - 8 - hr.left)) + 'px'
        hr = hud.getBoundingClientRect()
      }
      var base = parseFloat(window.getComputedStyle(hud).fontSize) || 11
      var vh = window.innerHeight
      var fs = base
      while ((hr.top < 4 || hr.bottom > vh - 4) && fs > 8) {
        fs -= 1
        hud.style.fontSize = fs + 'px'
        hr = hud.getBoundingClientRect()
      }
      if (hr.top < 4) {
        var lineH = parseFloat(window.getComputedStyle(hud).lineHeight) || fs * 1.7
        var lines = Math.max(1, Math.floor((vh - 16) / lineH))
        hud.style.display = '-webkit-box'
        hud.style.webkitBoxOrient = 'vertical'
        hud.style.webkitLineClamp = String(lines)
        hud.style.overflow = 'hidden'
        // Drop whole · segments from the end so the clamp never cuts mid-word.
        var orig = hud.innerHTML
        var segs = orig.split(/&nbsp;·&nbsp;|\s·\s/)
        if (segs.length > 1) {
          for (var n = segs.length - 1; n >= 1; n--) {
            hud.innerHTML = segs.slice(0, n).join(' · ') + ' · …'
            hr = hud.getBoundingClientRect()
            if (hr.top >= 4 && hr.bottom <= vh - 4) break
            if (n === 1) hud.innerHTML = orig
          }
        }
      }
    }
    reserveCaption()
    window.addEventListener('resize', reserveCaption)
    window.addEventListener('orientationchange', reserveCaption)
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(reserveCaption)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount)
  else mount()
})()
