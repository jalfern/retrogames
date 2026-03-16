import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import { GAMES } from '../../config/games'

const AI_INTERVAL_MS = 5000
const AI_MAX_HISTORY = 12

function DosGame({ bundleUrl, label }) {
  const rootRef = useRef(null)
  const dosRef = useRef(null)
  const inputRef = useRef(null)
  const [paused, setPaused] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [inputVal, setInputVal] = useState('')
  const [isMobile, setIsMobile] = useState(false)

  // AI state
  const [aiActive, setAiActive] = useState(false)
  const [aiStatus, setAiStatus] = useState(null)  // null | 'thinking' | 'typing' | 'no-canvas' | 'error'
  const [lastAiCmd, setLastAiCmd] = useState(null)
  const [aiSteps, setAiSteps] = useState(0)
  const aiActiveRef = useRef(false)
  const aiTimerRef = useRef(null)
  const aiHistoryRef = useRef([])

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 900 || 'ontouchstart' in window)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (!rootRef.current) return
    if (typeof window.Dos === 'undefined') {
      setError('DOSBox emulator failed to load')
      return
    }

    let stopped = false

    try {
      const base = import.meta.env.BASE_URL
      const instance = window.Dos(rootRef.current, {
        url: `${base}${bundleUrl}`,
        autoStart: true,
        theme: 'dark',
        imageRendering: 'pixelated',
        renderAspect: '4/3',
        noNetworking: true,
        noCloud: true,
        kiosk: true,
        onEvent: (event) => {
          if (event === 'ci-ready') {
            if (!stopped) setLoading(false)
          }
        },
      })
      dosRef.current = instance
    } catch (e) {
      console.error('DOSBox init error:', e)
      setError(e.message)
    }

    return () => {
      stopped = true
      if (dosRef.current) {
        dosRef.current.stop()
        dosRef.current = null
      }
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

  // Cleanup AI on unmount
  useEffect(() => {
    return () => {
      aiActiveRef.current = false
      clearTimeout(aiTimerRef.current)
    }
  }, [])

  const handleResume = useCallback(() => {
    setPaused(false)
    if (rootRef.current) rootRef.current.focus()
  }, [])

  // Inject text into DOSBox
  const typeIntoDos = useCallback((text) => {
    const canvas = findCanvas()
    if (canvas?.focus) canvas.focus()
    const target = canvas || document
    const fireKey = (key, code, keyCode) => {
      const opts = { key, code, keyCode, which: keyCode, bubbles: true, cancelable: true }
      target.dispatchEvent(new KeyboardEvent('keydown', opts))
      target.dispatchEvent(new KeyboardEvent('keypress', opts))
      target.dispatchEvent(new KeyboardEvent('keyup', opts))
    }
    for (const char of text) {
      const upper = char.toUpperCase()
      fireKey(char, `Key${upper}`, char.charCodeAt(0))
    }
    fireKey('Enter', 'Enter', 13)
  }, [])

  // Inject arrow key into DOSBox
  const pressArrow = useCallback((dir) => {
    const canvas = findCanvas()
    if (canvas?.focus) canvas.focus()
    const target = canvas || document
    const MAP = { up: ['ArrowUp', 38], down: ['ArrowDown', 40], left: ['ArrowLeft', 37], right: ['ArrowRight', 39] }
    const [key, keyCode] = MAP[dir] || MAP.up
    const opts = { key, code: key, keyCode, which: keyCode, bubbles: true, cancelable: true }
    target.dispatchEvent(new KeyboardEvent('keydown', opts))
    setTimeout(() => target.dispatchEvent(new KeyboardEvent('keyup', opts)), 220)
  }, [])

  // Capture DOSBox canvas as JPEG
  // Find DOSBox canvas — js-dos may use shadow DOM, nested divs, or iframes
  const findCanvas = useCallback(() => {
    const root = rootRef.current
    if (!root) return null
    // Direct querySelector
    let c = root.querySelector('canvas')
    if (c) return c
    // Pierce shadow roots of all children
    const walk = (el) => {
      if (!el) return null
      if (el.shadowRoot) {
        const sc = el.shadowRoot.querySelector('canvas')
        if (sc) return sc
        for (const child of el.shadowRoot.children) {
          const r = walk(child); if (r) return r
        }
      }
      for (const child of el.children) {
        const r = walk(child); if (r) return r
      }
      return null
    }
    c = walk(root)
    if (c) return c
    // Last resort: any canvas in the document
    return document.querySelector('canvas')
  }, [])

  const captureScreen = useCallback(() => {
    const canvas = findCanvas()
    if (!canvas) return null
    try {
      const tmp = document.createElement('canvas')
      tmp.width = 320; tmp.height = 200
      tmp.getContext('2d').drawImage(canvas, 0, 0, 320, 200)
      return tmp.toDataURL('image/jpeg', 0.65)
    } catch {
      return null
    }
  }, [findCanvas])

  const fireKey = useCallback((key, code, keyCode) => {
    const canvas = findCanvas()
    if (canvas?.focus) canvas.focus()  // must have focus or DOSBox ignores events
    const target = canvas || document
    const opts = { key, code, keyCode, which: keyCode, bubbles: true, cancelable: true }
    target.dispatchEvent(new KeyboardEvent('keydown', opts))
    setTimeout(() => target.dispatchEvent(new KeyboardEvent('keyup', opts)), 80)
  }, [findCanvas])

  // AI step — runs on a timer when aiActive
  const scheduleAiStep = useRef(null)
  scheduleAiStep.current = async () => {
    if (!aiActiveRef.current) return
    setAiSteps(n => n + 1)

    const screenshot = captureScreen()
    if (!screenshot) {
      setAiStatus('no-canvas')
      aiTimerRef.current = setTimeout(() => scheduleAiStep.current?.(), 2000)
      return
    }

    setAiStatus('thinking')
    try {
      const r = await fetch('/api/kq-ai-move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          screenshot,
          recentCommands: aiHistoryRef.current.slice(-AI_MAX_HISTORY),
        }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const { command, arrow, escape, enter } = await r.json()
      if ((command || arrow || escape || enter) && aiActiveRef.current) {
        setAiStatus('typing')
        const label = escape ? 'ESC' : enter ? 'ENTER' : arrow ? `arrow ${arrow}` : command
        setLastAiCmd(label)
        aiHistoryRef.current = [...aiHistoryRef.current.slice(-AI_MAX_HISTORY * 2), label]
        await new Promise(ok => setTimeout(ok, 400))
        if (escape)      fireKey('Escape', 'Escape', 27)
        else if (enter)  fireKey('Enter',  'Enter',  13)
        else if (arrow)  pressArrow(arrow)
        else             typeIntoDos(command)
      }
    } catch (e) {
      console.error('[KQ AI]', e)
      setAiStatus('error')
    }
    setAiStatus(null)
    if (aiActiveRef.current) {
      aiTimerRef.current = setTimeout(() => scheduleAiStep.current?.(), AI_INTERVAL_MS)
    }
  }

  const toggleAI = useCallback(() => {
    if (aiActiveRef.current) {
      aiActiveRef.current = false
      clearTimeout(aiTimerRef.current)
      setAiActive(false)
      setAiStatus(null)
    } else {
      aiActiveRef.current = true
      aiHistoryRef.current = []
      setAiActive(true)
      setLastAiCmd(null)
      setAiSteps(0)
      setTimeout(() => scheduleAiStep.current?.(), 500)
    }
  }, [])

  const handleSubmit = useCallback((e) => {
    e.preventDefault()
    const text = inputVal.trim()
    if (!text) return
    setInputVal('')
    // Special: "esc" or "escape" → inject ESC key
    if (text.toLowerCase() === 'esc' || text.toLowerCase() === 'escape') {
      const t = findCanvas() || document
      const opts = { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true }
      t.dispatchEvent(new KeyboardEvent('keydown', opts))
      t.dispatchEvent(new KeyboardEvent('keyup', opts))
    } else {
      typeIntoDos(text)
    }
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [inputVal, typeIntoDos])

  const game = GAMES.find(g => g.label === label)

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

        {/* AI status strip — only when AI is active */}
        {aiActive && !error && (
          <div style={{
            flexShrink: 0, padding: '3px 12px',
            background: '#050f05', borderTop: '1px solid #1a3a1a',
            fontFamily: 'monospace', fontSize: 11,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ color: aiStatus === 'thinking' ? '#60a5fa' : aiStatus === 'typing' ? '#4ade80' : aiStatus === 'no-canvas' ? '#f59e0b' : aiStatus === 'error' ? '#ef4444' : '#2a6a2a' }}>
              {aiStatus === 'thinking' ? '🤖 thinking…' :
               aiStatus === 'typing'   ? '🤖 acting…' :
               aiStatus === 'no-canvas'? '⚠️ waiting for canvas…' :
               aiStatus === 'error'    ? '❌ API error' :
                                         '🤖 watching…'}
            </span>
            <span style={{ color: '#374151', fontSize: 10 }}>step {aiSteps}</span>
            {lastAiCmd && <span style={{ color: '#6b7280' }}>last: <span style={{ color: '#d29922' }}>{lastAiCmd}</span></span>}
          </div>
        )}

        {/* Bottom bar — text input + AI toggle */}
        {!error && (
          <div style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
            padding: '5px 10px', background: '#0a0a0a', borderTop: '1px solid #222',
          }}>
            {/* Startup key buttons — ESC + Enter + Space to get through intro screens */}
            {[
              { label: 'ESC',   key: 'Escape', code: 'Escape', keyCode: 27 },
              { label: '↵',     key: 'Enter',  code: 'Enter',  keyCode: 13 },
              { label: '␣',     key: ' ',      code: 'Space',  keyCode: 32 },
            ].map(({ label, key, code, keyCode }) => (
              <button key={label} onClick={() => {
                const t = findCanvas() || document
                const opts = { key, code, keyCode, which: keyCode, bubbles: true, cancelable: true }
                t.dispatchEvent(new KeyboardEvent('keydown', opts))
                setTimeout(() => t.dispatchEvent(new KeyboardEvent('keyup', opts)), 80)
              }} style={{
                flexShrink: 0, background: '#111', border: '1px solid #444',
                borderRadius: 6, color: '#aaa', fontFamily: 'monospace', fontSize: 13,
                padding: '4px 10px', cursor: 'pointer', minWidth: 38, textAlign: 'center',
              }}>{label}</button>
            ))}

            <button onClick={toggleAI} style={{
              flexShrink: 0,
              background: aiActive ? '#14532d' : '#111',
              border: `1px solid ${aiActive ? '#22c55e' : '#333'}`,
              borderRadius: 6, color: aiActive ? '#4ade80' : '#555',
              fontFamily: 'monospace', fontSize: 12, padding: '4px 10px', cursor: 'pointer',
            }}>
              {aiActive ? '⏸ stop AI' : '🤖 AI'}
            </button>

            <form onSubmit={handleSubmit} style={{
              flex: 1, display: isMobile ? 'flex' : (aiActive ? 'none' : 'flex'),
              alignItems: 'center', gap: 6,
            }}>
              <span style={{ color: '#555', fontFamily: 'monospace', fontSize: 14 }}>▶</span>
              <input
                ref={inputRef}
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                placeholder={aiActive ? 'intervene…' : 'type command, tap Send…'}
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
