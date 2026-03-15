/**
 * Zork I — Live Shared Viewer (HTTP polling)
 * One game runs on the server (stogabot plays). All visitors watch the same game.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import { GAMES } from '../../config/games'

const API = 'https://retrogames-psi.vercel.app/api'
const POLL_MS = 1500

// ── Map overlay ───────────────────────────────────────────────────────────────

function ZorkMap({ onClose }) {
  const [mapData, setMapData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API}/zork-map`)
      .then(r => r.json())
      .then(d => { setMapData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Layout: normalize positions to canvas coords
  function renderMap(roomGraph, currentRoom) {
    const rooms = Object.entries(roomGraph)
    if (rooms.length === 0) return <text fill="#555" x="50%" y="50%" textAnchor="middle">No rooms explored yet</text>

    // Assign positions to any null rooms — place them in a row below the main map
    const positioned = rooms.filter(([, r]) => r.x !== null && r.y !== null)
    const unpositioned = rooms.filter(([, r]) => r.x === null || r.y === null)
    const maxY = positioned.length ? Math.max(...positioned.map(([, r]) => r.y)) : 0
    unpositioned.forEach(([, r], i) => { r.x = i; r.y = maxY + 2 })

    // Deduplicate positions — if two rooms share coords, nudge duplicates
    const seen = {}
    for (const [name, r] of rooms) {
      const key = `${r.x},${r.y}`
      if (seen[key] && seen[key] !== name) {
        // nudge this room
        r.x += 0.5
        r.y += 0.5
      }
      seen[key] = name
    }

    // Find bounds
    const xs = rooms.map(([, r]) => r.x)
    const ys = rooms.map(([, r]) => r.y)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)

    const CELL = 90, PAD = 60
    const W = (maxX - minX + 1) * CELL + PAD * 2
    const H = (maxY - minY + 1) * CELL + PAD * 2

    function toSvg(rx, ry) {
      return [(rx - minX) * CELL + PAD, (ry - minY) * CELL + PAD]
    }

    // Draw edges first
    const edges = []
    const seen = new Set()
    for (const [name, room] of rooms) {
      for (const [dir, target] of Object.entries(room.exits || {})) {
        const key = [name, target].sort().join('|')
        if (seen.has(key)) continue
        seen.add(key)
        const targetRoom = roomGraph[target]
        if (!targetRoom) continue
        const [x1, y1] = toSvg(room.x || 0, room.y || 0)
        const [x2, y2] = toSvg(targetRoom.x || 0, targetRoom.y || 0)
        edges.push(<line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#1a3a1a" strokeWidth="2" />)
      }
    }

    // Draw nodes
    const nodes = rooms.map(([name, room]) => {
      const [cx, cy] = toSvg(room.x || 0, room.y || 0)
      const isCurrent = name === currentRoom
      const shortName = name.length > 14 ? name.slice(0, 12) + '…' : name
      return (
        <g key={name} transform={`translate(${cx},${cy})`}>
          <rect x={-38} y={-16} width={76} height={32} rx={5}
                fill={isCurrent ? '#14532d' : '#0d1f0d'}
                stroke={isCurrent ? '#22c55e' : '#1a3a1a'}
                strokeWidth={isCurrent ? 2 : 1} />
          <text textAnchor="middle" dominantBaseline="middle"
                fill={isCurrent ? '#4ade80' : '#2a6a2a'}
                fontSize={isCurrent ? 9.5 : 9}
                fontFamily="monospace"
                fontWeight={isCurrent ? 'bold' : 'normal'}>
            {shortName}
          </text>
          {room.visits > 0 && (
            <text x={34} y={-12} fill="#374151" fontSize={8} fontFamily="monospace">{room.visits}×</text>
          )}
        </g>
      )
    })

    return (
      <svg width={Math.max(W, 300)} height={Math.max(H, 200)} style={{ display: 'block' }}>
        {edges}
        {nodes}
      </svg>
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 100,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'monospace'
    }}>
      <div style={{ background: '#0a0a0a', border: '1px solid #1a3a1a', borderRadius: 8, padding: 20, maxWidth: '90vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#33ff33', fontWeight: 700, fontSize: '0.85rem' }}>
            🗺 ZORK I — EXPLORED MAP
            {mapData?.currentRoom && <span style={{ color: '#4ade80', fontWeight: 400 }}> · {mapData.currentRoom}</span>}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid #1a3a1a', borderRadius: 4, color: '#555', fontSize: '0.75rem', padding: '2px 10px', cursor: 'pointer' }}>close</button>
        </div>
        <div style={{ overflow: 'auto', flex: 1 }}>
          {loading && <div style={{ color: '#555', padding: 40, textAlign: 'center' }}>Loading map…</div>}
          {!loading && !mapData && <div style={{ color: '#555', padding: 40, textAlign: 'center' }}>No map data</div>}
          {!loading && mapData && renderMap(mapData.roomGraph, mapData.currentRoom)}
        </div>
        <div style={{ fontSize: '0.7rem', color: '#2a6a2a', borderTop: '1px solid #1a3a1a', paddingTop: 8 }}>
          {Object.keys(mapData?.roomGraph || {}).length} rooms explored
        </div>
      </div>
    </div>
  )
}

// ── Main viewer ───────────────────────────────────────────────────────────────

function ZorkGame({ storyFile, label }) {
  const [lines, setLines] = useState([])
  const [aiStatus, setAIStatus] = useState(null)
  const [connected, setConnected] = useState(false)
  const [paused, setPaused] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [showMap, setShowMap] = useState(false)
  const [currentRoom, setCurrentRoom] = useState(null)
  const outputRef = useRef(null)
  const inputRef = useRef(null)
  const lastTsRef = useRef(0)
  const pollTimerRef = useRef(null)
  const game = GAMES.find(g => g.label === label)

  // ── Polling ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let dead = false
    async function poll() {
      try {
        const since = lastTsRef.current
        const r = await fetch(`${API}/zork-state?since=${since}`)
        if (!r.ok) throw new Error(r.status)
        const { lines: newLines, aiStatus: status, currentRoom: room } = await r.json()
        if (dead) return

        setConnected(true)
        setAIStatus(status)
        if (room) setCurrentRoom(room)

        if (since === 0) {
          setLines(newLines)
          if (newLines.length > 0) lastTsRef.current = newLines[newLines.length - 1].ts
        } else if (newLines.length > 0) {
          setLines(prev => [...prev, ...newLines])
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

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight
  }, [lines])

  // ── Human input ────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault()
    const cmd = inputValue.trim()
    if (!cmd || !connected) return
    setInputValue('')
    try {
      await fetch(`${API}/zork-command`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: cmd })
      })
    } catch {}
  }, [inputValue, connected])

  // ── Pause ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const on = (e) => { if (e.detail?.gameLabel === label) setPaused(true) }
    const off = (e) => { if (e.detail?.gameLabel === label) setPaused(false) }
    window.addEventListener('gamePaused', on)
    window.addEventListener('gameResumed', off)
    return () => { window.removeEventListener('gamePaused', on); window.removeEventListener('gameResumed', off) }
  }, [label])

  // ── Line style ─────────────────────────────────────────────────────────────
  function lineStyle(type) {
    switch(type) {
      case 'room':       return { color: '#4ade80', fontWeight: 700, marginTop: 8 }
      case 'command':    return { color: '#fbbf24', textShadow: '0 0 5px rgba(251,191,36,0.4)' }
      case 'ai-command': return { color: '#4b5563', fontStyle: 'italic' }
      case 'system':     return { color: '#374151', fontStyle: 'italic', fontSize: '0.78rem' }
      default:           return {}
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center">
      <div className="relative w-full h-full max-w-4xl max-h-full flex flex-col font-mono text-sm sm:text-base"
           style={{ color: '#33ff33', textShadow: '0 0 5px rgba(51,255,51,0.2)' }}>

        {/* Header */}
        <div style={{ padding: '6px 16px', borderBottom: '1px solid #1a3a1a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontWeight: 700, color: '#33ff33' }}>
              {game?.title || 'ZORK I'} <span style={{ color: '#2a6a2a', fontWeight: 400 }}>— LIVE</span>
            </span>
            {currentRoom && <span style={{ color: '#2a6a2a' }}>· {currentRoom}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setShowMap(true)}
                    style={{ background: 'none', border: '1px solid #1a3a1a', borderRadius: 4, color: '#2a6a2a', fontSize: '0.7rem', padding: '2px 8px', cursor: 'pointer', fontFamily: 'monospace' }}>
              🗺 map
            </button>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: connected ? '#22c55e' : '#ef4444', display: 'inline-block' }} />
              <span style={{ color: connected ? '#22c55e' : '#ef4444' }}>{connected ? 'LIVE' : 'CONNECTING…'}</span>
            </span>
          </div>
        </div>

        {/* Terminal output */}
        <div ref={outputRef} className="flex-1 overflow-y-auto p-4 pb-2" style={{ scrollbarColor: '#1a3a1a #000' }}>
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
          {aiStatus === 'waiting'  && <span style={{ color: '#444' }}>🤖 stogabot is deciding…</span>}
        </div>

        {/* Human input */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', alignItems: 'center', padding: '4px 12px 8px', gap: 8, borderTop: '1px solid #1a3a1a' }}>
          <span style={{ color: '#2a6a2a', fontSize: '0.75rem', flexShrink: 0 }}>suggest&gt;</span>
          <input ref={inputRef} value={inputValue} onChange={e => setInputValue(e.target.value)}
                 placeholder="type a command to intervene…" disabled={!connected}
                 style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fbbf24', fontFamily: 'monospace', fontSize: '0.9rem', caretColor: '#33ff33' }}
                 autoCorrect="off" autoCapitalize="none" spellCheck={false} />
        </form>

        {paused && <PauseOverlay label={label} />}
      </div>

      {showMap && <ZorkMap onClose={() => setShowMap(false)} />}

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
