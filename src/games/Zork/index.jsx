/**
 * Zork I — Live Shared Viewer
 * One game runs on the server (stogabot plays). All visitors watch the same game.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import { GAMES } from '../../config/games'

const WS_URL = 'ws://5.78.145.117/zork-ws'

function ZorkGame({ storyFile, label }) {
  const [lines, setLines] = useState([])
  const [aiStatus, setAIStatus] = useState(null)   // null | 'thinking' | 'typing' | 'waiting'
  const [countdown, setCountdown] = useState(null)
  const [connected, setConnected] = useState(false)
  const [paused, setPaused] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [inputEnabled] = useState(true)             // always allow human suggestions
  const outputRef = useRef(null)
  const wsRef = useRef(null)
  const countdownRef = useRef(null)
  const inputRef = useRef(null)
  const game = GAMES.find(g => g.label === label)

  // ── WebSocket connection ────────────────────────────────────────────────────
  useEffect(() => {
    let ws
    let reconnectTimer

    function connect() {
      ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        setLines(prev => [...prev, { type: 'system', text: '[ Connected to live game ]' }])
      }

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data)
        if (msg.type === 'history') {
          setLines(msg.lines)
        } else if (msg.type === 'line') {
          setLines(prev => [...prev, msg.line])
        } else if (msg.type === 'ai-status') {
          setAIStatus(msg.status)
          if (msg.status === 'waiting' && msg.countdown) {
            startCountdown(msg.countdown)
          } else {
            stopCountdown()
          }
        }
      }

      ws.onclose = () => {
        setConnected(false)
        setAIStatus(null)
        stopCountdown()
        setLines(prev => [...prev, { type: 'system', text: '[ Disconnected — reconnecting... ]' }])
        reconnectTimer = setTimeout(connect, 3000)
      }

      ws.onerror = () => ws.close()
    }

    connect()
    return () => {
      clearTimeout(reconnectTimer)
      stopCountdown()
      if (ws) ws.close()
    }
  }, [])

  // ── Auto-scroll ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [lines])

  // ── Countdown ───────────────────────────────────────────────────────────────
  function startCountdown(secs) {
    stopCountdown()
    setCountdown(secs)
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(countdownRef.current); return null }
        return prev - 1
      })
    }, 1000)
  }

  function stopCountdown() {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null }
    setCountdown(null)
  }

  // ── Human input (suggestion) ────────────────────────────────────────────────
  const handleSubmit = useCallback((e) => {
    e.preventDefault()
    const cmd = inputValue.trim()
    if (!cmd || !wsRef.current || wsRef.current.readyState !== 1) return
    wsRef.current.send(JSON.stringify({ type: 'command', text: cmd }))
    setInputValue('')
  }, [inputValue])

  // ── Pause ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const handlePause = (e) => {
      if (e.detail?.gameLabel === label) setPaused(true)
    }
    const handleResume = (e) => {
      if (e.detail?.gameLabel === label) setPaused(false)
    }
    window.addEventListener('gamePaused', handlePause)
    window.addEventListener('gameResumed', handleResume)
    return () => {
      window.removeEventListener('gamePaused', handlePause)
      window.removeEventListener('gameResumed', handleResume)
    }
  }, [label])

  // ── Line colors ─────────────────────────────────────────────────────────────
  function lineStyle(type) {
    switch(type) {
      case 'command':    return { color: '#fbbf24', textShadow: '0 0 5px rgba(251,191,36,0.4)' }
      case 'ai-command': return { color: '#6b7280', fontStyle: 'italic' }
      case 'system':     return { color: '#374151', fontStyle: 'italic' }
      case 'ai-error':   return { color: '#92400e', fontStyle: 'italic' }
      default:           return {}
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center">
      <div className="relative w-full h-full max-w-4xl max-h-full flex flex-col font-mono text-sm sm:text-base"
           style={{ color: '#33ff33', textShadow: '0 0 5px rgba(51,255,51,0.3)' }}>

        {/* Header bar */}
        <div style={{ padding: '6px 16px', borderBottom: '1px solid #1a3a1a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', color: '#2a6a2a' }}>
          <span style={{ fontWeight: 700, color: '#33ff33' }}>
            {game?.title || 'ZORK I'} <span style={{ color: '#2a6a2a', fontWeight: 400 }}>— LIVE</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: connected ? '#22c55e' : '#ef4444', display: 'inline-block' }} />
            <span style={{ color: connected ? '#22c55e' : '#ef4444' }}>{connected ? 'LIVE' : 'RECONNECTING'}</span>
          </span>
        </div>

        {/* Terminal output */}
        <div ref={outputRef}
             className="flex-1 overflow-y-auto p-4 pb-2"
             style={{ scrollbarColor: '#1a3a1a #000' }}>
          {lines.map((line, i) => (
            <div key={i} style={{ lineHeight: '1.6', ...lineStyle(line.type) }}>
              {line.text || '\u00A0'}
            </div>
          ))}
        </div>

        {/* AI status bar */}
        <div style={{ minHeight: 28, padding: '2px 16px', fontSize: '0.72rem', fontFamily: 'monospace', borderTop: '1px solid #1a3a1a' }}>
          {aiStatus === 'thinking' && (
            <span style={{ color: '#60a5fa' }}>
              🤖 stogabot is thinking
              <span className="ai-dots">...</span>
            </span>
          )}
          {aiStatus === 'typing' && (
            <span style={{ color: '#4ade80' }}>
              🤖 stogabot is typing
              <span className="ai-dots">...</span>
            </span>
          )}
          {(aiStatus === 'waiting' || aiStatus === null) && countdown !== null && (
            <span style={{ color: countdown <= 3 ? '#d29922' : '#444' }}>
              🤖 stogabot moves in <span style={{ fontWeight: 700 }}>{countdown}s</span>
            </span>
          )}
        </div>

        {/* Human input — suggestions */}
        <form onSubmit={handleSubmit}
              style={{ display: 'flex', alignItems: 'center', padding: '4px 12px 8px', gap: 8, borderTop: '1px solid #1a3a1a' }}>
          <span style={{ color: '#2a6a2a', fontSize: '0.75rem' }}>suggest&gt;</span>
          <input
            ref={inputRef}
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            placeholder="type a command to take over..."
            disabled={!connected}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: '#fbbf24', fontFamily: 'monospace', fontSize: '0.9rem',
              caretColor: '#33ff33',
            }}
            autoCorrect="off" autoCapitalize="none" spellCheck={false}
          />
        </form>

        {paused && <PauseOverlay label={label} />}
      </div>

      <style>{`
        .ai-dots { display: inline-block; animation: dots 1.2s steps(4, end) infinite; overflow: hidden; width: 0; }
        @keyframes dots { 0%{width:0} 25%{width:0.4em} 50%{width:0.8em} 75%{width:1.2em} 100%{width:0} }
      `}</style>
    </div>
  )
}

export default ZorkGame

// Named exports for each Zork — all share the same live server (Zork I)
export function ZorkI(props)   { return <ZorkGame {...props} label="Zork I"   storyFile="/games/zork/zork1.z3" /> }
export function ZorkII(props)  { return <ZorkGame {...props} label="Zork II"  storyFile="/games/zork/zork2.z3" /> }
export function ZorkIII(props) { return <ZorkGame {...props} label="Zork III" storyFile="/games/zork/zork3.z3" /> }
