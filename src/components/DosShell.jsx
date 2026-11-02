/**
 * DosShell — the shared shell for the keyboard-driven DOS titles (Ultima I–V).
 *
 * WHY (#1451, Jon's iPhone feedback: "need to figure out game controls for
 * these emulated games … i think it needs keyboard and we have space esc and
 * enter only"): each Ultima page carried its own byte-identical copy of a
 * boot+bar component that offered exactly three keys — ESC, ↵, ␣ — plus a text
 * field. Ultima I–V are single-keypress games: movement is the arrow keys and
 * the mid-game verbs are single letters (T talk, O open, A attack, Z stats).
 * On a phone none of that was reachable, so the games were literally
 * unplayable on touch: the text field only helps where DOSBox wants a word +
 * Enter (name entry), never mid-game.
 *
 * This shell puts the whole control surface on screen, through the ONE actuator
 * that is proven to reach js-dos (utils/dosKeys — direct call into the
 * emulator's captured window handlers, works without a user gesture):
 *
 *   - d-pad: ←↑↓→ step-movement (`pressArrow`, the King's Quest pattern)
 *   - per-title primary verbs: the commands that matter mid-game, one tap
 *     each, declared by the game (the sheet below covers the rest)
 *   - ESC / ↵ / ␣: intros, dialogs, combat timing
 *   - ⌨ KEYS: a full A–Z + digits sheet, so *any* command in *any* of these
 *     games is two taps away and the primary-verb picks can never strand a
 *     verb (digits matter: Ultima I cast/spell levels are numbers)
 *   - the text field stays for name entry (types the word, then Enter)
 *
 * The DEV hook `__dosTest` is the harness seam: doscheck asserts the key
 * handlers were captured, that the pad declares arrows + command keys, and
 * that an injected key actually changes the guest frame — a pad that renders
 * but drives nothing (the old failure mode) now fails a required check.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from './PauseOverlay'
import { GAMES } from '../config/games'
import { installDosKeys, resetDosKeys, pressKey, pressArrow, typeText, keysReady, keysDebug, KEY } from '../utils/dosKeys'
import { findCanvas, sampleBuffer, toDataUrl, framePrint, subPrint, bandProfile, regionStats, focusEmulator } from '../utils/dosCanvas'
import { mountDos } from '../utils/jsdos'

// Full keyboard sheet: every letter Ultima's parsers take, then the digits
// (spell levels, quantities). Uppercase keyCodes are what DOS hardware sent;
// the guest applies its own case rules.
export const SHEET_KEYS = ('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789').split('')

const letterKeyCode = (ch) => ch.toUpperCase().charCodeAt(0)

function DosShell({ bundleUrl, label, keys = [] }) {
  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const [paused, setPaused] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [inputVal, setInputVal] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)

  useEffect(() => {
    if (!rootRef.current) return
    // `before` re-installs the key-handler capture on every mount (loadJsDos
    // installs once per page; a remount must re-arm it — see utils/dosKeys).
    const dos = mountDos(rootRef.current, bundleUrl, {
      before: () => installDosKeys(),
      onReady: () => setLoading(false),
      onError: (e) => setError(e.message),
    })
    return () => {
      dos.stop()
      resetDosKeys()
    }
  }, [bundleUrl])

  // '?' toggles the shared PauseOverlay (arcade convention, AGENTS step 2).
  useEffect(() => {
    const handlePause = (e) => {
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault()
        setPaused((p) => !p)
      }
    }
    window.addEventListener('keydown', handlePause)
    return () => window.removeEventListener('keydown', handlePause)
  }, [])

  const handleResume = useCallback(() => {
    setPaused(false)
    if (rootRef.current) rootRef.current.focus()
  }, [])

  const tapKey = useCallback((spec, holdMs) => {
    pressKey(spec, holdMs)
    // A tap on the pad is also the unlock/keep-focus gesture for the emulator.
    if (rootRef.current) focusEmulator(rootRef.current)
  }, [])

  const tapLetter = useCallback((ch) => {
    tapKey({ key: ch, code: `Key${ch.toUpperCase()}`, keyCode: letterKeyCode(ch) })
  }, [tapKey])

  const tapDigit = useCallback((ch) => {
    tapKey({ key: ch, code: `Digit${ch}`, keyCode: letterKeyCode(ch) })
  }, [tapKey])

  const handleSubmit = useCallback((e) => {
    e.preventDefault()
    const text = inputVal.trim()
    if (!text) return
    setInputVal('')
    if (/^(esc|escape)$/.test(text.toLowerCase())) pressKey(KEY.escape)
    else typeText(text)
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [inputVal])

  const game = GAMES.find((g) => g.label === label)

  // DEV hook — doscheck's seam for every DOS title (mirrors __kqTest).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const api = {
      keysReady: () => keysReady(),
      keysDebug: () => keysDebug(),
      press: (spec) => pressKey(spec),
      arrow: (dir) => pressArrow(dir),
      key: (ch) => pressKey({ key: ch, code: `Key${ch.toUpperCase()}`, keyCode: letterKeyCode(ch) }),
      focus: () => focusEmulator(rootRef.current),
      type: (text) => typeText(text),
      canvas: () => {
        const c = findCanvas(rootRef.current)
        return c ? { found: true, w: c.width, h: c.height } : { found: false }
      },
      grab: () => toDataUrl(rootRef.current),
      sample: () => {
        const buf = sampleBuffer(rootRef.current)
        if (!buf) return null
        let lum = 0
        let lit = 0
        for (let i = 0; i < buf.data.length; i += 4) {
          const l = (buf.data[i] * 299 + buf.data[i + 1] * 587 + buf.data[i + 2] * 114) / 1000
          lum += l
          if (l > 24) lit++
        }
        const px = buf.data.length / 4
        return { w: buf.w, h: buf.h, meanLuma: Math.round(lum / px), nonBlack: +(lit / px).toFixed(3) }
      },
      print: () => framePrint(rootRef.current),
      subPrint: (opts) => subPrint(rootRef.current, opts),
      bandProfile: (opts) => bandProfile(rootRef.current, opts),
      regionStats: (opts) => regionStats(rootRef.current, opts),
      // What the touch pad actually offers — the harness asserts this, not a
      // screenshot: arrows + ESC/↵/␣ + the title's primary verbs + the sheet.
      pad: () => ({ arrows: true, basics: ['esc', 'enter', 'space'], keys, sheet: SHEET_KEYS }),
      state: () => ({ loading, error, paused, sheetOpen, keys: keysReady(), wiring: keysDebug(), canvas: api.canvas() }),
    }
    window.__dosTest = api
    return () => { if (window.__dosTest === api) delete window.__dosTest }
  }, [loading, error, paused, sheetOpen, label, keys])

  const btn = {
    flexShrink: 0, background: '#111', border: '1px solid #444',
    borderRadius: 6, color: '#aaa', fontFamily: 'monospace', fontSize: 13,
    padding: '4px 10px', cursor: 'pointer', minWidth: 38, textAlign: 'center',
  }
  const arrow = { ...btn, color: '#60a5fa', padding: '4px 8px' }
  const cmd = { ...btn, color: '#fbbf24', minWidth: 30, padding: '4px 7px' }

  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center">
      <div className="relative flex flex-col w-full h-full max-w-4xl max-h-full">

        {error && (
          <div className="text-red-400 font-mono text-center p-8">
            Failed to load game: {error}
          </div>
        )}

        {/* DOS canvas — takes all remaining space */}
        <div ref={rootRef} style={{ flex: 1, display: error ? 'none' : 'block', minHeight: 0 }} />

        {!error && (
          <>
            {/* Full A–Z + digits sheet: every command reachable from a phone. */}
            {sheetOpen && (
              <div
                data-dos="sheet"
                style={{
                  flexShrink: 0, display: 'grid', gridTemplateColumns: 'repeat(9, minmax(0, 1fr))',
                  gap: 4, padding: '6px 8px', background: '#0d0d0d', borderTop: '1px solid #222',
                }}
              >
                {SHEET_KEYS.map((ch) => (
                  <button
                    key={ch}
                    onClick={() => (letterKeyCode(ch) >= 65 ? tapLetter(ch) : tapDigit(ch))}
                    style={{ ...cmd, minWidth: 0, padding: '6px 0', fontSize: 14 }}
                  >{ch}</button>
                ))}
              </div>
            )}

            {/* Control bar: d-pad · primary verbs · ESC/↵/␣ · sheet · text field.
                Wraps on narrow phones; the canvas keeps flex:1 either way. */}
            <div
              data-dos="pad"
              style={{
                flexShrink: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6,
                padding: '5px 10px calc(5px + env(safe-area-inset-bottom))', background: '#0a0a0a',
                borderTop: '1px solid #222',
              }}
            >
              <div data-dos="dpad" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: 2 }}>
                <span />
                <button style={arrow} onClick={() => tapKey(KEY.up, 220)}>↑</button>
                <span />
                <button style={arrow} onClick={() => tapKey(KEY.left, 220)}>←</button>
                <span />
                <button style={arrow} onClick={() => tapKey(KEY.right, 220)}>→</button>
                <span />
                <button style={arrow} onClick={() => tapKey(KEY.down, 220)}>↓</button>
                <span />
              </div>

              {keys.map((ch) => (
                <button key={ch} data-doskey={ch} style={cmd} onClick={() => tapLetter(ch)}>{ch}</button>
              ))}

              <button style={btn} onClick={() => tapKey(KEY.escape)}>ESC</button>
              <button style={btn} onClick={() => tapKey(KEY.enter)}>↵</button>
              <button style={btn} onClick={() => tapKey(KEY.space)}>␣</button>
              <button
                data-dos="sheet-toggle"
                aria-expanded={sheetOpen}
                onClick={() => setSheetOpen((s) => !s)}
                style={{ ...btn, color: sheetOpen ? '#fde68a' : '#aaa', borderColor: sheetOpen ? '#a16207' : '#444' }}
              >⌨</button>

              <form onSubmit={handleSubmit} style={{ flex: 1, minWidth: 140, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#555', fontFamily: 'monospace', fontSize: 14 }}>▶</span>
                <input
                  ref={inputRef}
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  placeholder="type name / command…"
                  autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
                  style={{
                    flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none',
                    color: '#ccc', fontFamily: 'monospace', fontSize: 15, caretColor: '#fff',
                  }}
                />
                <button type="submit" style={{
                  flexShrink: 0, background: '#1a3a1a', border: '1px solid #2a6a2a', borderRadius: 6,
                  color: '#4ade80', fontFamily: 'monospace', fontSize: 13,
                  padding: '5px 14px', cursor: 'pointer',
                }}>
                  Send
                </button>
              </form>
            </div>
          </>
        )}

        {paused && game && <PauseOverlay game={game} onResume={handleResume} />}
      </div>
    </div>
  )
}

export default DosShell
