import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import { GAMES } from '../../config/games'

const API = '/api'
const AI_INTERVAL_MS = 5000   // how often AI acts (ms)
const AI_MAX_HISTORY = 12     // recent commands tracked for loop detection

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
  const [aiStatus, setAiStatus] = useState(null)  // null | 'thinking' | 'typing'
  const [lastAiCmd, setLastAiCmd] = useState(null)
  const aiActiveRef = useRef(false)
  const aiTimerRef = useRef(null)
  const aiCommandHistory = useRef([])

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
      if (dosRef.current) { dosRef.current.stop(); dosRef.current = null }
    }
  }, [bundleUrl])

  // Pause handler (keyboard ?)
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

  // ── Canvas capture ──────────────────────────────────────────────────────────
  const captureScreen = useCallback(() => {
    const canvas = rootRef.current?.querySelector('canvas')
    if (!canvas) return null
    try {
      // Downscale to 320×200 for smaller payload (~30KB JPEG)
      const tmp = document.createElement('canvas')
      tmp.width = 320; tmp.height = 200
      tmp.getContext('2d').drawImage(canvas, 0, 0, 320, 200)
      return tmp.toDataURL('image/jpeg', 0.65)
    } catch {
      return null
    }
  }, [])

  // ── Keystroke injection into DOSBox ────────────────────────────────────────
  const typeIntoDos = useCallback((text) => {
    const target = rootRef.current?.querySelector('canvas') || document
    const fire = (key, code, keyCode) => {
      const opts = { key, code, keyCode, which: keyCode, bubbles: true, cancelable: true }
      target.dispatchEvent(new KeyboardEvent('keydown', opts))
      target.dispatchEvent(new KeyboardEvent('keypress', opts))
      target.dispatchEvent(new KeyboardEvent('keyup', opts))
    }
    for (const char of text) fire(char, `Key${char.toUpperCase()}`, char.charCodeAt(0))
    fire('Enter', 'Enter', 13)
  }, [])

  const pressArrow = useCallback((dir) => {
    const target = rootRef.current?.querySelector('canvas') || document
    const MAP = { up: ['ArrowUp', 38], down: ['ArrowDown', 40], left: ['ArrowLeft', 37], right: ['ArrowRight', 39] }
    const [key, keyCode] = MAP[dir] || MAP.up
    const opts = { key, code: key, keyCode, which: keyCode, bubbles: true, cancelable: true }
    // Hold for ~200ms to simulate a brief step
    target.dispatchEvent(new KeyboardEvent('keydown', opts))
    setTimeout(() => target.dispatchEvent(new KeyboardEvent('keyup', opts)), 200)
  }, [])

  // ── AI loop ────────────────────────────────────────────────────────────────
  const runAiStep = useCallback(async () => {
    if (!aiActiveRef.current) return

    const screenshot = captureScreen()
    if (!screenshot) {
      if (aiActiveRef.current) aiTimerRef.current = setTimeout(runAiStep, AI_INTERVAL_MS)
      return
    }

    setAiStatus('thinking')
    try {
      const r = await fetch(`${API}/kq-ai-move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          screenshot,
          recentCommands: aiCommandHistory.current.slice(-AI_MAX_HISTORY),
        }),
      })
      const { command, arrow } = await r.json()

      if ((command || arrow) && aiActiveRef.current) {
        setAiStatus('typing')
        const label = arrow ? `→ arrow ${arrow}` : command
        setLastAiCmd(label)
        aiCommandHistory.current.push(label)
        if (aiCommandHistory.current.length > AI_MAX_HISTORY * 2) {
          aiCommandHistory.current = aiCommandHistory.current.slice(-AI_MAX_HISTORY)
        }
        await new Promise(ok => setTimeout(ok, 400))
        if (arrow) {
          pressArrow(arrow)
        } else {
          typeIntoDos(command)
        }
      }
    } catch (e) {
      console.error('[KQ AI]', e)
    }

    setAiStatus(null)
    if (aiActiveRef.current) aiTimerRef.current = setTimeout(runAiStep, AI_INTERVAL_MS)
  }, [captureScreen, typeIntoDos, pressArrow])

  const toggleAI = useCallback(() => {
    if (aiActiveRef.current) {
      // Stop
      aiActiveRef.current = false
      clearTimeout(aiTimerRef.current)
      setAiActive(false)
      setAiStatus(null)
    } else {
      // Start
      aiActiveRef.current = true
      setAiActive(true)
      aiCommandHistory.current = []
      runAiStep()
    }
  }, [runAiStep])

  // Cleanup AI on unmount
  useEffect(() => {
    return () => { aiActiveRef.current = false; clearTimeout(aiTimerRef.current) }
  }, [])

  // ── Manual text submit ────────────────────────────────────────────────────
  const handleSubmit = useCallback((e) => {
    e.preventDefault()
    const text = inputVal.trim()
    if (!text) return
    setInputVal('')
    typeIntoDos(text)
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

        {/* DOS canvas */}
        <div ref={rootRef} style={{ flex: 1, display: error ? 'none' : 'block', minHeight: 0 }} />

        {/* AI status bar — shown when AI is active */}
        {aiActive && !error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '4px 14px', background: '#050f05', borderTop: '1px solid #1a3a1a',
            flexShrink: 0, fontSize: 12, fontFamily: 'monospace',
          }}>
            <span style={{ color: aiStatus === 'thinking' ? '#60a5fa' : aiStatus === 'typing' ? '#4ade80' : '#2a6a2a' }}>
              {aiStatus === 'thinking' ? '🤖 stogabot thinking…' :
               aiStatus === 'typing'   ? '🤖 stogabot typing…' :
                                         '🤖 stogabot watching…'}
            </span>
            {lastAiCmd && (
              <span style={{ color: '#374151' }}>
                last: <span style={{ color: '#d29922' }}>{lastAiCmd}</span>
              </span>
            )}
          </div>
        )}

        {/* Bottom bar: AI toggle + text input */}
        {!error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '5px 10px', background: '#0a0a0a', borderTop: '1px solid #222', flexShrink: 0,
          }}>
            {/* AI toggle */}
            <button onClick={toggleAI} style={{
              background: aiActive ? '#14532d' : '#111',
              border: `1px solid ${aiActive ? '#22c55e' : '#333'}`,
              borderRadius: 6, color: aiActive ? '#4ade80' : '#555',
              fontFamily: 'monospace', fontSize: 12, padding: '4px 10px',
              cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
            }}>
              {aiActive ? '⏸ stop AI' : '🤖 AI play'}
            </button>

            {/* Text input — shown on mobile or when AI is off */}
            <form onSubmit={handleSubmit} style={{
              display: (isMobile || !aiActive) ? 'flex' : 'none',
              flex: 1, alignItems: 'center', gap: 6,
            }}>
              <span style={{ color: '#555', fontFamily: 'monospace', fontSize: 14 }}>▶</span>
              <input
                ref={inputRef}
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                placeholder={aiActive ? 'intervene — type a command…' : 'type command and tap Send…'}
                autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  color: '#ccc', fontFamily: 'monospace', fontSize: 15, caretColor: '#fff',
                }}
              />
              <button type="submit" style={{
                background: '#1a3a1a', border: '1px solid #2a6a2a', borderRadius: 6,
                color: '#4ade80', fontFamily: 'monospace', fontSize: 13,
                padding: '4px 12px', cursor: 'pointer',
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
