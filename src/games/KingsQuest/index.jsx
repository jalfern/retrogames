import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import { GAMES } from '../../config/games'

function DosGame({ bundleUrl, label }) {
  const rootRef = useRef(null)
  const dosRef = useRef(null)
  const inputRef = useRef(null)
  const [paused, setPaused] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [inputVal, setInputVal] = useState('')
  const [isMobile, setIsMobile] = useState(false)

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

  const handleResume = useCallback(() => {
    setPaused(false)
    if (rootRef.current) rootRef.current.focus()
  }, [])

  // Type text into DOSBox by dispatching keyboard events to the canvas element
  const typeIntoDos = useCallback((text) => {
    // js-dos listens on the canvas inside rootRef; dispatch to document works too
    const target = rootRef.current?.querySelector('canvas') || document

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
    // Enter
    fireKey('Enter', 'Enter', 13)
  }, [])

  const handleSubmit = useCallback((e) => {
    e.preventDefault()
    const text = inputVal.trim()
    if (!text) return
    setInputVal('')
    typeIntoDos(text)
    // Refocus input so keyboard stays up on mobile
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

        {/* DOS canvas — takes most of screen */}
        <div ref={rootRef} style={{ flex: 1, display: error ? 'none' : 'block', minHeight: 0 }} />

        {/* Text input bar — always shown on mobile, hidden on desktop */}
        {!error && (
          <form onSubmit={handleSubmit}
                style={{
                  display: isMobile ? 'flex' : 'none',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 10px',
                  background: '#0a0a0a',
                  borderTop: '1px solid #333',
                  flexShrink: 0,
                }}>
            <span style={{ color: '#555', fontFamily: 'monospace', fontSize: 14 }}>▶</span>
            <input
              ref={inputRef}
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              placeholder="type command and tap Send…"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#ccc',
                fontFamily: 'monospace',
                fontSize: 15,
                caretColor: '#fff',
              }}
            />
            <button type="submit"
                    style={{
                      background: '#1a3a1a',
                      border: '1px solid #2a6a2a',
                      borderRadius: 6,
                      color: '#4ade80',
                      fontFamily: 'monospace',
                      fontSize: 13,
                      padding: '5px 14px',
                      cursor: 'pointer',
                    }}>
              Send
            </button>
          </form>
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
