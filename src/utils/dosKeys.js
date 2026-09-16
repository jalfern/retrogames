/**
 * dosKeys — the one place that knows how to push a key into a running js-dos
 * (DOSBox-in-wasm) instance.
 *
 * WHY THIS EXISTS
 * ---------------
 * DOSBox does not read React's synthetic events, and iOS Safari will not
 * dispatch a synthetic KeyboardEvent from an async context (no user gesture).
 * What *does* work — and cost a whole branch of failed commits to find — is to
 * reach the handler js-dos registers for the keyboard, and either call it
 * directly or dispatch a real bubbling KeyboardEvent at the element that holds it.
 * DOSBox wants a *down* and an *up* for one key press, hence the short hold.
 *
 * THE TARGET IS window (found in stage 0, while wiring `__kqTest`)
 * ---------------------------------------------------------------
 * Instrumenting a live King's Quest boot shows js-dos 8 registers keydown/keyup
 * on **window**, and the only element-level keyboard listener on the page is
 * React's own delegation on #root. The original version of this file patched
 * `HTMLCanvasElement.prototype.addEventListener`, so it captured nothing, ever:
 * `keysReady()` was always false and every call fell through to the DOM-dispatch
 * path. Same class of bug this repo keeps hitting — an actuator that looks wired
 * and is not — and the fix is the same: capture it, then ASSERT it worked.
 *
 * DOSBox wants a *down* and an *up* for one key press, hence the short hold.
 *
 * Previously this logic lived inline in KingsQuest/index.jsx together with four
 * different half-working injection paths (dispatch to all canvases, an rAF
 * queue, a document-level dispatch, a "press the 🔑 button and read the canvas
 * count" diagnostic). All but one were dead weight, and the 30s restore timer
 * meant a late-mounted emulator silently lost keyboard input. Extracted here so
 * there is exactly one path, it restores as soon as it has done its job, and any
 * DOS title can use it (Ultima I–V currently do not).
 *
 * Usage:
 *   import { installDosKeys, pressKey, typeText, KEY } from '../../utils/dosKeys'
 *   installDosKeys()            // BEFORE Dos() is constructed
 *   pressKey(KEY.escape)
 *   typeText('look')            // types, then presses Enter
 */

// Legacy `keyCode` values DOSBox actually consumes. `key`/`code` are kept for
// logging and for the fallback DOM path only.
export const KEY = {
  escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
  enter: { key: 'Enter', code: 'Enter', keyCode: 13 },
  space: { key: ' ', code: 'Space', keyCode: 32 },
  up: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  down: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  left: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  right: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
}

const state = {
  orig: null,        // original EventTarget.prototype.addEventListener
  down: null,        // the captured keydown handler
  up: null,          // the captured keyup handler
  target: null,      // the element they were registered on (js-dos' root DIV)
  installed: false,
}

function fakeEvent(keyCode, target) {
  return {
    keyCode,
    which: keyCode,
    location: 0,
    target: target || {},
    currentTarget: target || {},
    stopPropagation() {},
    preventDefault() {},
  }
}

function restore() {
  if (state.installed && state.orig) {
    EventTarget.prototype.addEventListener = state.orig
  }
  state.installed = false
  state.orig = null
}

/**
 * Start listening for the emulator's keyboard handlers. Call this BEFORE
 * constructing the Dos instance. window/document listeners are ignored — those
 * are js-dos' own global plumbing (blur, paste), not the game's input.
 * The prototype is restored as soon as both handlers are captured, so a slow
 * emulator still gets patched and a fast one is not left patched forever.
 */
export function installDosKeys({ timeoutMs = 60000 } = {}) {
  if (typeof EventTarget === 'undefined') return false
  restore() // idempotent: re-install cleanly (hot reload, remount)

  const orig = EventTarget.prototype.addEventListener
  state.orig = orig
  state.installed = true

  EventTarget.prototype.addEventListener = function patched(type, handler) {
    // js-dos 8 attaches its keyboard to **window** (verified by instrumenting a
    // live boot: keydown/keyup/blur@window). The only element keyboard listener
    // on the page belongs to React's event delegation on #root, which is
    // installed long before this patch — so "first keydown we see" is js-dos.
    if (typeof handler === 'function' && (type === 'keydown' || type === 'keyup')) {
      if (type === 'keydown' && !state.down) { state.down = handler; state.target = this }
      else if (type === 'keyup' && !state.up) { state.up = handler }
    }
    if (state.down && state.up) restore()
    return orig.apply(this, arguments)
  }

  setTimeout(restore, timeoutMs)
  return true
}

/** True once the emulator's keydown handler has been captured. */
export function keysReady() {
  return !!state.down
}

/**
 * Diagnostics for the harness: is the patch still installed, did we capture a
 * handler, and on what element? Without this, "the AI cannot move" and "the
 * emulator never booted" look identical from the outside — which is exactly how
 * the canvas-patch version stayed broken unnoticed.
 */
export function keysDebug() {
  return { installed: state.installed, captured: !!state.down, up: !!state.up, target: state.target ? state.target.tagName : null }
}

/** Forget captured handlers (unmount / hot reload). */
export function resetDosKeys() {
  restore()
  state.down = null
  state.up = null
  state.target = null
}

/**
 * Press one key. Prefers calling the captured handler directly (works from any
 * context — timers, AI loops, checks — because it is just a function call).
 * Falls back to dispatching a bubbling KeyboardEvent at the element that holds
 * the handlers, which is what reaches the emulator when nothing was captured.
 */
export function injectKey(keyCode, holdMs = 80) {
  if (state.down) {
    const evt = fakeEvent(keyCode, state.target)
    state.down(evt)
    if (state.up) setTimeout(() => state.up(evt), holdMs)
    return true
  }
  const char = keyCode >= 32 ? String.fromCharCode(keyCode) : ''
  const node = state.target || document.querySelector('.jsdos-rso') || document.querySelector('canvas') || document.body
  let sent = false
  const fire = (type) => node.dispatchEvent(new KeyboardEvent(type, {
    key: char, code: char, keyCode, which: keyCode, bubbles: true, cancelable: true,
  }))
  try { fire('keydown'); fire('keyup'); sent = true } catch { sent = false }
  return sent
}

export function pressKey(spec, holdMs) {
  return injectKey(spec.keyCode, holdMs)
}

export function pressArrow(dir, holdMs = 220) {
  const spec = KEY[dir]
  return spec ? injectKey(spec.keyCode, holdMs) : false
}

/**
 * Type a literal string into the DOS guest, then Enter.
 * Returns the total delay in ms, so callers can schedule what happens next
 * instead of guessing at a fixed wait (the old code hardcoded 400ms).
 */
export function typeText(text, { charDelay = 120, enter = true, onKey } = {}) {
  let delay = 0
  for (const ch of String(text)) {
    const upper = ch.toUpperCase()
    const code = upper.charCodeAt(0)
    const isAlnum = (code >= 65 && code <= 90) || (code >= 48 && code <= 57)
    if (!isAlnum && code !== 32) continue // DOSBox-era text boxes: letters, digits, space
    const spec = { key: ch, code: code === 32 ? 'Space' : `Key${upper}`, keyCode: code }
    const at = delay
    setTimeout(() => {
      pressKey(spec)
      if (onKey) onKey(ch)
    }, at)
    delay += charDelay
  }
  if (enter) setTimeout(() => pressKey(KEY.enter), delay + 60)
  else delay += 60
  return delay + 60
}
