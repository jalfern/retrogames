import React, { useEffect, useRef, useState, useCallback } from 'react'
import { ZVM } from 'ifvms'
import { createGlk } from './GlkAdapter'
import PauseOverlay from '../../components/PauseOverlay'
import { GAMES } from '../../config/games'

function ZorkGame({ storyFile, label }) {
  const [lines, setLines] = useState([])
  const [inputEnabled, setInputEnabled] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [paused, setPaused] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isAIPlaying, setIsAIPlaying] = useState(false)
  const aiTimerRef = useRef(null)
  const linesRef = useRef([])

  const vmRef = useRef(null)
  const inputResolverRef = useRef(null)
  const historyRef = useRef([])
  const historyIndexRef = useRef(-1)
  const outputRef = useRef(null)
  const inputRef = useRef(null)
  const containerRef = useRef(null)

  const scrollToBottom = useCallback(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [])

  useEffect(scrollToBottom, [lines, scrollToBottom])

  // Focus input when enabled
  useEffect(() => {
    if (inputEnabled && inputRef.current && !paused) {
      inputRef.current.focus()
    }
  }, [inputEnabled, paused])

  // Initialize VM
  useEffect(() => {
    let cancelled = false

    async function loadGame() {
      try {
        const base = import.meta.env.BASE_URL
        const response = await fetch(`${base}${storyFile}`)
        if (!response.ok) throw new Error(`Failed to load ${storyFile}: ${response.status}`)
        const arrayBuffer = await response.arrayBuffer()
        const gameData = new Uint8Array(arrayBuffer)

        if (cancelled) return

        const terminal = {
          print(text) {
            if (!text) return
            setLines(prev => {
              const newLines = [...prev]
              const parts = text.split('\n')
              parts.forEach((part, i) => {
                if (i === 0 && newLines.length > 0 && newLines[newLines.length - 1].type === 'output') {
                  // Append to last output line if it didn't end with newline
                  newLines[newLines.length - 1] = {
                    type: 'output',
                    text: newLines[newLines.length - 1].text + part
                  }
                } else {
                  newLines.push({ type: 'output', text: part })
                }
              })
              linesRef.current = newLines
              return newLines
            })
          },
          clear() {
            setLines([])
          },
          waitForInput(callback) {
            inputResolverRef.current = callback
            setInputEnabled(true)
          },
          handleError(msg) {
            setLines(prev => [...prev, { type: 'error', text: `Error: ${msg}` }])
          }
        }

        const savePrefix = label.toLowerCase().replace(/\s+/g, '-')
        const Glk = createGlk(terminal, savePrefix)

        if (cancelled) return

        const vm = new ZVM()
        vm.prepare(gameData, { Glk })
        vmRef.current = vm
        setLoading(false)
        try {
          vm.start()
        } catch (startErr) {
          console.error('VM start error:', startErr)
          console.error('Stack:', startErr.stack)
          if (!cancelled) setError(`VM start: ${startErr.message}\n${startErr.stack}`)
        }
      } catch (e) {
        console.error('Failed to load Zork game:', e)
        console.error('Stack:', e.stack)
        if (!cancelled) setError(`${e.message}\n${e.stack}`)
      }
    }

    loadGame()
    return () => { cancelled = true }
  }, [storyFile, label])

  const handleSubmit = useCallback((e) => {
    e.preventDefault()
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current)
    setIsAIPlaying(false)
    const command = inputValue
    setInputValue('')
    setInputEnabled(false)

    // Add to history
    if (command.trim()) {
      historyRef.current.push(command)
      historyIndexRef.current = historyRef.current.length
    }

    // Echo command
    setLines(prev => [...prev, { type: 'command', text: `> ${command}` }])

    // Resolve input and resume VM
    if (inputResolverRef.current) {
      const resolver = inputResolverRef.current
      inputResolverRef.current = null
      resolver(command)
      if (vmRef.current && !vmRef.current.quit) {
        try {
          vmRef.current.resume(command.length)
        } catch (err) {
          console.error('VM resume error:', err)
          setLines(prev => [...prev, { type: 'error', text: `VM Error: ${err.message}` }])
        }
      }
    }
  }, [inputValue])

  const triggerAIMove = useCallback(async () => {
    if (!inputResolverRef.current || paused) return
    setIsAIPlaying(true)
    try {
      const response = await fetch('/api/ai-move', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ transcript: linesRef.current.slice(-25) })
      })
      const { command } = await response.json()
      if (command && inputResolverRef.current) {
        setLines(prev => [...prev, { type: 'ai-command', text: `> ${command}` }])
        const resolver = inputResolverRef.current
        inputResolverRef.current = null
        setInputEnabled(false)
        resolver(command)
        if (vmRef.current && !vmRef.current.quit) {
          vmRef.current.resume(command.length)
        }
      }
    } catch(e) { console.error('AI move failed:', e) }
    finally { setIsAIPlaying(false) }
  }, [paused])

  useEffect(() => {
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current)
    if (inputEnabled && !paused) {
      aiTimerRef.current = setTimeout(triggerAIMove, 30000)
    }
    return () => { if (aiTimerRef.current) clearTimeout(aiTimerRef.current) }
  }, [inputEnabled, paused, triggerAIMove])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (historyRef.current.length === 0) return
      historyIndexRef.current = Math.max(0, historyIndexRef.current - 1)
      setInputValue(historyRef.current[historyIndexRef.current])
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndexRef.current >= historyRef.current.length - 1) {
        historyIndexRef.current = historyRef.current.length
        setInputValue('')
      } else {
        historyIndexRef.current++
        setInputValue(historyRef.current[historyIndexRef.current])
      }
    }
  }, [])

  // Pause handler
  useEffect(() => {
    const handlePause = (e) => {
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        // Don't capture if user is typing in the input field
        if (document.activeElement === inputRef.current && !paused) return
        e.preventDefault()
        setPaused(p => !p)
      }
    }
    window.addEventListener('keydown', handlePause)
    return () => window.removeEventListener('keydown', handlePause)
  }, [paused])

  const handleResume = useCallback(() => {
    setPaused(false)
    if (inputRef.current) inputRef.current.focus()
  }, [])

  // Click anywhere to focus input
  const handleContainerClick = useCallback(() => {
    if (inputRef.current && inputEnabled && !paused) {
      inputRef.current.focus()
    }
  }, [inputEnabled, paused])

  const game = GAMES.find(g => g.label === label)

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center"
         onClick={handleContainerClick}>
      <div ref={containerRef}
           className="relative w-full h-full max-w-4xl max-h-full flex flex-col font-mono text-sm sm:text-base"
           style={{ color: '#33ff33', textShadow: '0 0 5px rgba(51, 255, 51, 0.5)' }}>

        {/* Terminal output */}
        <div ref={outputRef}
             className="flex-1 overflow-y-auto p-4 pb-0 scrollbar-thin"
             style={{ scrollbarColor: '#33ff33 #111' }}>
          {loading && !error && (
            <div className="animate-pulse">Loading {label}...</div>
          )}
          {error && (
            <div style={{ color: '#ff3333' }}>Failed to load game: {error}</div>
          )}
          {lines.map((line, i) => (
            <div key={i}
                 className={line.type === 'command' ? 'text-amber-400' : line.type === 'error' ? 'text-red-400' : line.type === 'ai-command' ? 'text-gray-600 italic' : ''}
                 style={line.type === 'command' ? { textShadow: '0 0 5px rgba(251, 191, 36, 0.5)' } : undefined}>
              {line.text || '\u00A0'}
            </div>
          ))}
        </div>

        {/* Input line */}
        {isAIPlaying && (
          <div style={{padding:'2px 16px',fontSize:'0.72rem',color:'#666',fontFamily:'monospace'}}>🤖 stogabot is playing...</div>
        )}
        {inputEnabled && !isAIPlaying && !paused && (
          <div style={{padding:'2px 16px',fontSize:'0.68rem',color:'#333',fontFamily:'monospace'}}>type to play · AI takes over in 30s</div>
        )}
        <form onSubmit={handleSubmit} className="flex items-center p-4 pt-2">
          <span className="mr-2 select-none">&gt;</span>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!inputEnabled || paused}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            className="flex-1 bg-transparent border-none outline-none caret-current"
            style={{ color: 'inherit', fontFamily: 'inherit', fontSize: 'inherit' }}
          />
        </form>

        {/* Scanline overlay for CRT effect */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
             style={{
               background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)'
             }} />

        {paused && game && <PauseOverlay game={game} onResume={handleResume} />}
      </div>
    </div>
  )
}

// Export wrapper components for each Zork game
export const ZorkI = () => <ZorkGame storyFile="games/zork/zork1.z3" label="ZORK I" />
export const ZorkII = () => <ZorkGame storyFile="games/zork/zork2.z3" label="ZORK II" />
export const ZorkIII = () => <ZorkGame storyFile="games/zork/zork3.z3" label="ZORK III" />
