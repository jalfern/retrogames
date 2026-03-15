/**
 * Zork I — Live Shared Viewer (HTTP polling)
 * One game runs on the server (stogabot plays). All visitors watch the same game.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import { GAMES } from '../../config/games'

const POLL_MS = 1500   // how often to fetch new lines

function ZorkGame({ storyFile, label }) {
  const [lines, setLines] = useState([])
  const [aiStatus, setAIStatus] = useState(null)
  const [connected, setConnected] = useState(false)
  const [paused, setPaused] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const outputRef = useRef(null)
  const inputRef = useRef(null)
  const lastTsRef = useRef(0)
  const pollTimerRef = useRef(null)
  const game = GAMES.find(g => g.label === label)

  // ── Polling ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    let dead = false

    async function poll() {
      try {
        const since = lastTsRef.current
        const url = `https://retrogames-psi.vercel.app/api/zork-state?since=${since}`
        const r = await fetch(url)
        if (!r.ok) throw new Error(r.status)
        const { lines: newLines, aiStatus: status, ts } = await r.json()
        if (dead) return

        setConnected(true)
        setAIStatus(status)

        if (since === 0) {
          // First load — replace everything
          setLines(newLines)
        } else if (newLines.length > 0) {
          setLines(prev => [...prev, ...newLines])
        }

        if (newLines.length > 0) {
          lastTsRef.current = newLines[newLines.length - 1].ts
        } else if (since === 0 && newLines.length > 0) {
          lastTsRef.current = newLines[newLines.length - 1].ts
        }
      } catch {
        if (!dead) setConnected(false)
      }
      if (!dead) pollTimerRef.current = setTimeout(poll, POLL_MS)
    }

    poll()
    return () => { dead = true; clearTimeout(pollTimerRef.current) }
  }, [])

  // Fix: set lastTsRef after first load
  useEffect(() => {
    if (lines.length > 0 && lastTsRef.current === 0) {
      lastTsRef.current = lines[lines.length - 1].ts
    }
  }, [lines])

  // ── Auto-scroll ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [lines])

  // ── Human input ──────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault()
    const cmd = inputValue.trim()
    if (!cmd || !connected) return
    setInputValue('')
    try {
      await fetch('https://retrogames-psi.vercel.app/api/zork-command', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: cmd })
      })
    } catch {}
  }, [inputValue, connected])

  // ── Pause ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const on = (e) => { if (e.detail?.gameLabel === label) setPaused(true) }
    const off = (e) => { if (e.detail?.gameLabel === label) setPaused(false) }
    window.addEventListener('gamePaused', on)
    window.addEventListener('gameResumed', off)
    return () => { window.removeEventListener('gamePaused', on); window.removeEventListener('gameResumed', off) }
  }, [label])

  // ── Line style ───────────────────────────────────────────────────────────────
  function lineStyle(type) {
    switch(type) {
      case 'command':    return { color: '#fbbf24', textShadow: '0 0 5px rgba(251,191,36,0.4)' }
      case 'ai-command': return { color: '#4b5563', fontStyle: 'italic' }
      case 'system':     return { color: '#374151', fontStyle: 'italic', fontSize: '0.78rem' }
      case 'ai-error':   return { color: '#92400e', fontStyle: 'italic' }
      default:           return {}
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center">
      <div className="relative w-full h-full max-w-4xl max-h-full flex flex-col font-mono text-sm sm:text-base"
           style={{ color: '#33ff33', textShadow: '0 0 5px rgba(51,255,51,0.3)' }}>

        {/* Header */}
        <div style={{ padding: '6px 16px', borderBottom: '1px solid #1a3a1a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', color: '#2a6a2a' }}>
          <span style={{ fontWeight: 700, color: '#33ff33' }}>
            {game?.title || 'ZORK I'} <span style={{ color: '#2a6a2a', fontWeight: 400 }}>— LIVE</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: connected ? '#22c55e' : '#ef4444', display: 'inline-block' }} />
            <span style={{ color: connected ? '#22c55e' : '#ef4444' }}>{connected ? 'LIVE' : 'CONNECTING…'}</span>
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

        {/* AI status */}
        <div style={{ minHeight: 26, padding: '2px 16px', fontSize: '0.72rem', borderTop: '1px solid #0d200d' }}>
          {aiStatus === 'thinking' && <span style={{ color: '#60a5fa' }}>🤖 stogabot is thinking<span className="ai-dots">...</span></span>}
          {aiStatus === 'typing'   && <span style={{ color: '#4ade80' }}>🤖 stogabot is typing<span className="ai-dots">...</span></span>}
          {aiStatus === 'waiting'  && <span style={{ color: '#555' }}>🤖 stogabot is deciding…</span>}
        </div>

        {/* Human input */}
        <form onSubmit={handleSubmit}
              style={{ display: 'flex', alignItems: 'center', padding: '4px 12px 8px', gap: 8, borderTop: '1px solid #1a3a1a' }}>
          <span style={{ color: '#2a6a2a', fontSize: '0.75rem', flexShrink: 0 }}>suggest&gt;</span>
          <input ref={inputRef}
                 value={inputValue}
                 onChange={e => setInputValue(e.target.value)}
                 placeholder="type a command to intervene…"
                 disabled={!connected}
                 style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fbbf24', fontFamily: 'monospace', fontSize: '0.9rem', caretColor: '#33ff33' }}
                 autoCorrect="off" autoCapitalize="none" spellCheck={false} />
        </form>

        {paused && <PauseOverlay label={label} />}
      </div>

      <style>{`
        .ai-dots { display: inline-block; overflow: hidden; width: 0; animation: dots 1.2s steps(4,end) infinite; }
        @keyframes dots { 0%{width:0} 25%{width:0.4em} 50%{width:0.8em} 75%{width:1.2em} 100%{width:0} }
      `}</style>
    </div>
  )
}

export default ZorkGame
export function ZorkI(props)   { return <ZorkGame {...props} label="Zork I"   storyFile="/games/zork/zork1.z3" /> }
export function ZorkII(props)  { return <ZorkGame {...props} label="Zork II"  storyFile="/games/zork/zork2.z3" /> }
export function ZorkIII(props) { return <ZorkGame {...props} label="Zork III" storyFile="/games/zork/zork3.z3" /> }
