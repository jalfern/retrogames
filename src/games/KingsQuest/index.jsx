/**
 * KING'S QUEST (1984, AGI) — js-dos shell.
 *
 * What this file is: DOSBox boot, manual controls, and the two seams the AI work
 * hangs off — `src/utils/dosKeys` (actuator) and `src/utils/dosCanvas` (sensor),
 * exposed to the harness as `window.__kqTest`.
 *
 * What used to be here, and is now gone deliberately:
 *
 *   - `api/kq-ai-move` → `5.78.145.117:3099`, a vision model on a Hetzner box
 *     that no longer answers. The "🤖 AI" button captured a screenshot every 5 s
 *     and POSTed it into the void. It also fetched `/api/...` root-absolute, so
 *     under `basename="/retrogames"` it never reached this project anyway.
 *   - Four parallel key-injection paths (dispatch-to-all-canvases, an rAF queue,
 *     a document-level dispatch, and the one that works: calling the emulator's
 *     own captured handler). Only the last survives, in dosKeys.js, and its
 *     restore is now triggered by success instead of a 30 s timer.
 *   - A 🔑 debug button that printed how many canvases it could find.
 *
 * There is NO AI button right now, on purpose: a button wired to nothing is how
 * the last attempt stayed alive while dead. The brain lands in stage 6 of
 * AI-PLAN.md and arrives together with `scripts/kqcheck.mjs`, `<AiBadge />`
 * printing which sensor it is using, and the A/B runner.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import { GAMES } from '../../config/games'
import { installDosKeys, resetDosKeys, pressKey, pressArrow, typeText, keysReady, keysDebug, KEY } from '../../utils/dosKeys'
import { findCanvas, sampleBuffer, toDataUrl, framePrint, focusEmulator } from '../../utils/dosCanvas'
import { mountDos } from '../../utils/jsdos'
import { effectiveArm, setArm as selectArm, getArm, armsForGame } from '../../ai/arms'
import AiBadge from '../../components/AiBadge'

function DosGame({ bundleUrl, label }) {
  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const [paused, setPaused] = useState(false)
  // The lab switch (src/ai/arms.js). There is no brain on this title yet —
  // stage 6 mounts one — so the strip says ARMED, not "thinking". When a brain
  // does arrive this badge must keep printing the arm it is sensing with.
  const [arm, setArm] = useState(() => effectiveArm(GAMES.find(g => g.label === label)))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [inputVal, setInputVal] = useState('')

  useEffect(() => {
    if (!rootRef.current) return
    // mountDos loads js-dos on demand (src/utils/jsdos.js) and retries nothing
    // silly: it waits for window.Dos, then boots with `before` — which is where
    // the keyboard handler capture has to happen, because the emulator registers
    // its listeners as it starts.
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

  // Pause handler
  useEffect(() => {
    const handlePause = (e) => {
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault()
        setPaused(p => !p)
      }
    }
    window.addEventListener('keydown', handlePause)
    return () => window.removeEventListener('keydown', handlePause)
  }, [])

  const handleResume = useCallback(() => {
    setPaused(false)
    if (rootRef.current) rootRef.current.focus()
  }, [])

  const handleSubmit = useCallback((e) => {
    e.preventDefault()
    const text = inputVal.trim()
    if (!text) return
    setInputVal('')
    if (/^(esc|escape)$/.test(text.toLowerCase())) pressKey(KEY.escape)
    else typeText(text)
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [inputVal])

  const game = GAMES.find(g => g.label === label)

  // DEV test hook. Stage 0's job for King's Quest is to prove the two AI seams
  // exist: can we reach the emulator's keyboard, and can we read a clean 320x200
  // frame? Everything in stage 3 (OCR, sprite match, screen graph) is built on
  // `grab`/`print` being real, so they are exposed now and asserted now.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const api = {
      keysReady: () => keysReady(),
      keysDebug: () => keysDebug(),
      press: (spec) => pressKey(spec),
      arrow: (dir) => pressArrow(dir),
      focus: () => focusEmulator(rootRef.current),
      type: (text) => typeText(text),
      canvas: () => {
        const c = findCanvas(rootRef.current)
        return c ? { found: true, w: c.width, h: c.height } : { found: false }
      },
      grab: () => toDataUrl(rootRef.current),
      // Returns { w, h, meanLuma, nonBlack } — enough to assert "the emulator is
      // drawing something" without shipping an image through the wire.
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
      // Arm + lab switch, so an A/B run is a query param, not a rebuild.
      arm: () => effectiveArm(GAMES.find(g => g.label === label)),
      setSensor: (next) => { setArm(selectArm(next)); return getArm() },
      state: () => ({ loading, error, paused, keys: keysReady(), wiring: keysDebug(), canvas: api.canvas() }),
    }
    window.__kqTest = api
    return () => { if (window.__kqTest === api) delete window.__kqTest }
  }, [loading, error, paused, label])

  const btn = {
    flexShrink: 0, background: '#111', border: '1px solid #444',
    borderRadius: 6, color: '#aaa', fontFamily: 'monospace', fontSize: 13,
    padding: '4px 10px', cursor: 'pointer', minWidth: 38, textAlign: 'center',
  }

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

        {/* Bottom bar — manual controls only until the brain lands (AI-PLAN §7 stage 6) */}
        {!error && (
          <div style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
            padding: '5px 10px', background: '#0a0a0a', borderTop: '1px solid #222',
          }}>
            {/* The lab switch, visible even with no brain mounted: it states what
                the title *could* sense, and SWITCH ARM lets a paired A/B run be
                driven from the harness without a rebuild. */}
            <AiBadge
              arm={arm}
              running={false}
              arms={armsForGame(GAMES.find(g => g.label === label))}
              onArm={(a) => setArm(selectArm(a))}
            />
            {/* Intro screens / dialogs: ESC, Enter, Space */}
            {[
              { label: 'ESC', spec: KEY.escape },
              { label: '↵', spec: KEY.enter },
              { label: '␣', spec: KEY.space },
            ].map(({ label: l, spec }) => (
              <button key={l} onClick={() => pressKey(spec)} style={btn}>{l}</button>
            ))}

            {[
              { label: '←', dir: 'left' },
              { label: '↑', dir: 'up' },
              { label: '↓', dir: 'down' },
              { label: '→', dir: 'right' },
            ].map(({ label: l, dir }) => (
              <button key={l} onClick={() => pressArrow(dir)} style={{ ...btn, color: '#60a5fa', padding: '4px 8px' }}>{l}</button>
            ))}

            <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: '#555', fontFamily: 'monospace', fontSize: 14 }}>▶</span>
              <input
                ref={inputRef}
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                placeholder="type command, tap Send…"
                autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  color: '#ccc', fontFamily: 'monospace', fontSize: 15, caretColor: '#fff',
                }}
              />
              <button type="submit" style={{
                background: '#1a3a1a', border: '1px solid #2a6a2a', borderRadius: 6,
                color: '#4ade80', fontFamily: 'monospace', fontSize: 13,
                padding: '5px 14px', cursor: 'pointer',
              }}>
                Send
              </button>
            </form>
          </div>
        )}

        {paused && game && <PauseOverlay game={game} onResume={handleResume} />}
      </div>
    </div>
  )
}

const KingsQuestGame = () => (
  <DosGame bundleUrl="games/kingsquest.jsdos" label="KING'S QUEST" />
)

export default KingsQuestGame
