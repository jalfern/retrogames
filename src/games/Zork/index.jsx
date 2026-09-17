import React, { useEffect, useRef, useState, useCallback } from 'react'
import { ZVM } from 'ifvms'
import { createGlk } from './GlkAdapter'
import PauseOverlay from '../../components/PauseOverlay'
import AiBadge from '../../components/AiBadge'
import { AgentLoop } from '../../ai/loop'
import { ZorkExplorer } from './agent/explorer'
import { GAMES } from '../../config/games'
import { TranscriptSensor } from './sensors/transcript'
import { effectiveArm, armsForGame, setArm as selectArm, getArm } from '../../ai/arms'

function ZorkGame({ storyFile, label, route = '/zork' }) {
  const [lines, setLines] = useState([])
  const [inputEnabled, setInputEnabled] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [paused, setPaused] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // ── STAGE 5a: the first face ────────────────────────────────────────────────
  // The brain has lived in Node since it was written; this is the first time a
  // visitor can press it. `aiOn` is the truth of who owns the keyboard, and
  // `aiStatus` is the loop's own report (never a decoration — AiBadge prints its
  // reason when it stops).
  const [aiOn, setAiOn] = useState(false)
  const [aiStatus, setAiStatus] = useState(null)
  const [aiNote, setAiNote] = useState(null)
  const [arm, setArmState] = useState(() => getArm())

  const loopRef = useRef(null)
  const brainRef = useRef(null)
  const replyWaiterRef = useRef(null)
  const bootedRef = useRef(false)

  const vmRef = useRef(null)
  const inputResolverRef = useRef(null)
  const historyRef = useRef([])
  const historyIndexRef = useRef(-1)
  const outputRef = useRef(null)
  const inputRef = useRef(null)
  const containerRef = useRef(null)

  // ── AI seam (see src/ai/percept.js) ─────────────────────────────────────────
  // logRef mirrors the printed text synchronously, because setLines is batched
  // and a harness that reads `lines` right after a command would see nothing.
  // pendingRef remembers which command the machine is currently replying to, so
  // the reply can be paired with it when the NEXT input request arrives — that
  // is the only moment we know the whole response has been printed.
  const logRef = useRef([])
  const pendingRef = useRef(null)
  const sensorRef = useRef(new TranscriptSensor())

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
            logRef.current.push(text)
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
              return newLines
            })
          },
          clear() {
            setLines([])
          },
          waitForInput(callback) {
            // The machine has finished replying to the previous command: hand that
            // exchange to the sensor before asking for the next one.
            const pending = pendingRef.current
            if (pending) {
              pendingRef.current = null
              // One sample for the actuator's own rhythm: how long a command→prompt
              // round trip costs on THIS machine, right now. It is what bounds the
              // next wait instead of a guessed constant.
              promptMsRef.current.push(performance.now() - pending.at)
              if (promptMsRef.current.length > 12) promptMsRef.current.shift()
              const reply = logRef.current.slice(pending.mark).join('')
              try {
                // saw() FIRST: the brain's next sense() must never read a world
                // state that hasn't been fed the reply it is waiting on.
                sensorRef.current.saw(pending.cmd, reply)
              } catch (e) {
                console.error('[zork sensor]', e)
              }
              const waiter = replyWaiterRef.current
              replyWaiterRef.current = null
              if (waiter) waiter(reply)
            } else if (!bootedRef.current) {
              // THE OPENING. Zork prints its banner and the first room description
              // BEFORE it ever asks for a command, and this sensor only learned
              // replies to commands — so the browser brain woke up with no origin
              // at all and sat still until the watchdog called it idle. The room
              // description was right there in the log. `look` is the honest label
              // for what the game just did to us: described where we are.
              bootedRef.current = true
              try { sensorRef.current.saw('look', logRef.current.join('')) }
              catch (e) { console.error('[zork sensor opening]', e) }
            }
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

  // The single actuator for this game: humans reach it through the form, the AI
  // (and every check) reach it through __zorkTest.send. Keeping one path means
  // the AI cannot pass a test the player's own input path would fail.
  const sendCommand = useCallback((command) => {
    const text = String(command ?? '')
    setInputValue('')
    setInputEnabled(false)

    if (text.trim()) {
      historyRef.current.push(text)
      historyIndexRef.current = historyRef.current.length
    }

    setLines(prev => [...prev, { type: 'command', text: `> ${text}` }])
    pendingRef.current = { cmd: text, mark: logRef.current.length, at: performance.now() }

    const resolver = inputResolverRef.current
    if (resolver) {
      inputResolverRef.current = null
      resolver(text)
      if (vmRef.current && !vmRef.current.quit) {
        try {
          vmRef.current.resume(text.length)
        } catch (err) {
          console.error('VM resume error:', err)
          setLines(prev => [...prev, { type: 'error', text: `VM Error: ${err.message}` }])
        }
      }
    }
  }, [])

  /**
   * The agent's actuator. SAME `sendCommand` the form calls — which is the whole
   * point of the seam: the brain cannot pass a turn the player's keyboard would
   * fail. It resolves only when the machine has finished replying, because a
   * brain that acts before reading the reply is a brain walking into walls.
   * If the VM is mid-reply we wait for the prompt rather than dropping the
   * command on the floor.
   *
   * But "wait for the prompt" cannot mean *forever*. The first version polled
   * `inputResolverRef` on a 60 ms chain with no bound at all, so a machine that
   * never returned to the prompt parked the whole loop inside one `await` —
   * `aiRunning()` still said true, `exchanges` never moved again, and every
   * observer (the HUD, `zorkuicheck`, the person watching) saw an agent that was
   * "still thinking" forever. That is the bug `zorkuicheck` hit under load.
   *
   * So the wait is bounded by the machine's own rhythm, not a guessed constant:
   * the last few command→prompt latencies are measured, and the budget is
   * `max(3 s, 8 × median)` — on a box taking 1 s a turn it is 8 s, on one taking
   * 4 s a turn it is 32 s. Overrun, the turn is handed back empty, the loop sees
   * a percept that has not changed, and the watchdog does what a watchdog is for:
   * stop, with a reason anyone can read.
   */
  const systemLine = useCallback((text) => {
    setLines(prev => [...prev, { type: 'system', text }])
  }, [])

  const promptMsRef = useRef([])
  const inFlightRef = useRef(false)
  const actStatRef = useRef({ timeouts: 0, waited: 0, worst: 0 })

  const agentSend = useCallback((command) => new Promise((resolve) => {
    const myLoop = loopRef.current
    const t0 = performance.now()
    let timer = null
    const finish = (reply) => {
      if (timer) { clearTimeout(timer); timer = null }
      const dt = performance.now() - t0
      actStatRef.current.waited = dt
      if (dt > actStatRef.current.worst) actStatRef.current.worst = dt
      resolve(reply)
    }
    const attempt = () => {
      // THIS loop, still running. `loopRef.current` is replaced when a human takes
      // the keyboard and PLAY is pressed again, and an attempt from the old loop
      // must not fire a command into the new one's turn.
      if (loopRef.current !== myLoop || !myLoop?.running) return finish('')
      const lat = promptMsRef.current
      const med = lat.length >= 3 ? lat.slice(-5).sort((a, b) => a - b)[Math.floor(Math.min(5, lat.length) / 2)] : 700
      // Scaled to the machine's own rhythm, but CEILED: a median contaminated by a
      // starved runner must not buy a five-minute wait. The point of the bound is
      // that a wedge becomes a visible, recoverable event inside seconds.
      const budget = Math.min(20000, Math.max(3000, med * 8))
      if (performance.now() - t0 > budget) {
        actStatRef.current.timeouts++
        inFlightRef.current = false
        systemLine(`[ai] the machine did not answer within ${Math.round(budget / 100) / 10} s — handing the turn back`)
        return finish('')
      }
      // ONE command in flight. `sendCommand` with no pending prompt is a silent
      // drop — it echoes the line and never resumes the machine — so a second act
      // launched while one is still waiting does not just fail, it desynchronises
      // the interpreter: `resume()` can arrive for an input event that was already
      // consumed, and the machine then waits for a keystroke nobody will send.
      if (!inputResolverRef.current || inFlightRef.current) { timer = setTimeout(attempt, 60); return }
      inFlightRef.current = true
      const earlier = replyWaiterRef.current
      replyWaiterRef.current = (reply) => {
        if (earlier) earlier(reply)
        inFlightRef.current = false
        finish(reply)
      }
      sendCommand(command)
    }
    attempt()
  }), [sendCommand, systemLine])


  const stopAi = useCallback((reason = 'stopped') => {
    if (loopRef.current) loopRef.current.stop(reason)
    loopRef.current = null
    replyWaiterRef.current = null
    inFlightRef.current = false
    setAiOn(false)
    setAiStatus({ running: false, reason, diary: [], stuck: 0, invalid: 0, successRate: null })
    return null
  }, [])

  const startAi = useCallback(() => {
    if (loopRef.current?.running || paused) return null
    const brain = new ZorkExplorer({ send: agentSend, sensor: sensorRef.current, onEvent: () => {} })
    const loop = new AgentLoop({
      brain,
      arm: effectiveArm(GAMES.find(g => g.path === route)),
      watchdog: 14,          // a human is watching; give it rope before crying stuck
      maxIdleTicks: 3,
      minActionGapMs: 600,   // slow enough that a person can read each reply
    })
    brainRef.current = brain
    loopRef.current = loop
    setAiOn(true)
    setAiStatus(null)
    setAiNote(`taking the keyboard — arm: ${arm}`)
    // ONE driver. `loop.start()` already arms its own timer chain, and this used
    // to run a second chain here (`while (running) await tick()`), so two `tick()`s
    // were in flight at once: two `agentSend`s, both looking for the prompt, one
    // `resume()` arriving at a machine that was not asking. That is the wedge the
    // CI run saw as "1 rooms" — the loop still said `running`, and nothing ever
    // moved again. The loop's clock is the timer; this component only watches,
    // through `onStatus`, which is also why the HUD updates on the beat now.
    loop.onStatus = (st) => {
      setAiStatus(st)
      if (!st.running && loopRef.current === loop) {
        loopRef.current = null
        setAiOn(false)
        systemLine(`[ai] stopped — ${st.reason || 'no move'}`)
      }
    }
    loop.start()
    return null
  }, [agentSend, arm, paused, route, systemLine])

  /**
   * ARBITRATION — one keyboard, one owner, decided by whoever typed last.
   *
   * While the agent plays, the input field is disabled, so a human keystroke
   * cannot interleave with an agent command ("n" landing inside the half-typed
   * "north" the machine is waiting for). That is the safe half, and it was the
   * easy half: the honest answer to "who drives?" is that the human ALWAYS wins,
   * so ANY keypress ends the agent's turn immediately and hands the field back.
   * An agent that steals a turn it cannot give back is a broken feature, however
   * well it plays the game.
   */
  const takeOver = useCallback(() => {
    if (!loopRef.current?.running) return
    stopAi('you took the keyboard')
    setAiNote('keyboard is yours — press PLAY to hand it back')
    systemLine('[ai] paused — the keyboard is yours again')
    if (inputRef.current) inputRef.current.focus()
  }, [stopAi, systemLine])

  useEffect(() => {
    if (!aiOn) return
    const onKey = (e) => {
      if (e.key === '?' || (e.shiftKey && e.key === '/')) return   // pause menu still works
      e.preventDefault()
      takeOver()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [aiOn, takeOver])

  // Never leave a loop running behind an unmount or the pause screen.
  useEffect(() => () => { if (loopRef.current) loopRef.current.stop('unmounted') }, [])
  useEffect(() => { if (paused && loopRef.current) stopAi('paused') }, [paused, stopAi])

  const handleSubmit = useCallback((e) => {
    e.preventDefault()
    sendCommand(inputValue)
  }, [inputValue, sendCommand])

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

  // DEV test hook — see AGENTS.md › Self-verifying. Exists only under
  // import.meta.env.DEV, so a check must target `npm run dev`, never a build.
  // NOTE: the browser check is a smoke test; the real Zork gate (scripts/
  // zorkcheck.mjs) drives the story in Node with no browser at all.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const api = {
      ready: () => !!vmRef.current,
      arm: () => effectiveArm(GAMES.find(g => g.path === route)),
      // Lab switch for the A/B harness (?sensor=eye, window.__aiSensor). The
      // per-game HUD badge arrives with the brain that reads it.
      setSensor: (next) => { selectArm(next); return getArm() },
      armLabel: () => effectiveArm(GAMES.find(g => g.path === route)),
      send: (command) => { sendCommand(command); return true },
      async play(commands, gapMs = 80) {
        for (const c of commands || []) {
          sendCommand(c)
          await new Promise(res => setTimeout(res, gapMs))
        }
        return api.state()
      },
      state: () => {
        const s = sensorRef.current
        return {
          ready: !!vmRef.current,
          inputEnabled: !!inputResolverRef.current,
          lines: logRef.current.length,
          exchanges: s.exchanges.length,
          moves: s.moves,
          room: s.room,
          roomConf: s.roomConf,
          score: s.score,
          maxScore: s.maxScore,
          dark: s.dark,
          inventory: s.inventory.slice(),
          verdict: s.lastVerdict,
        }
      },
      transcript: () => logRef.current.join(''),
      exchanges: () => sensorRef.current.exchanges.map(e => ({ command: e.command, verdict: e.verdict, room: e.room })),
      reset: () => { sensorRef.current.reset(); logRef.current = [] },
      // Stage 5a — the browser brain. `aiStart` mounts the SAME ZorkExplorer and
      // AgentLoop the Node gate drives, through the SAME sendCommand the form uses.
      aiStart: () => { startAi(); return true },
      aiStop: (why) => { stopAi(why || 'check'); return true },
      aiRunning: () => !!loopRef.current?.running,
      aiStatus: () => loopRef.current?.stats() || null,
      aiRooms: () => (brainRef.current ? brainRef.current.map.stats().rooms : 0),
      aiMap: () => (brainRef.current ? {
        stats: brainRef.current.map.stats(),
        at: brainRef.current.map.at,
        keys: [...brainRef.current.map.rooms.keys()],
        lastVerdict: sensorRef.current.lastVerdict,
        room: sensorRef.current.room,
      } : null),
      // The actuator's own health: how long the last command→prompt round trip took
      // on THIS machine, and how many turns it handed back rather than hanging. The
      // difference between "the box is slow" and "the agent is stuck" is a number now.
      aiActuator: () => ({ ...actStatRef.current, medianMs: promptMsRef.current.length
        ? Math.round(promptMsRef.current.slice(-5).sort((a, b) => a - b)[Math.floor(Math.min(5, promptMsRef.current.length) / 2)])
        : null }),
      aiDiary: () => (brainRef.current ? brainRef.current.diary || [] : []),
      aiCommits: () => (brainRef.current ? (brainRef.current.commits || []).slice(-14) : []),
    }
    window.__zorkTest = api
    return () => { if (window.__zorkTest === api) delete window.__zorkTest }
  }, [sendCommand, game, route, startAi, stopAi])

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
                 className={line.type === 'command' ? 'text-amber-400' : line.type === 'error' ? 'text-red-400' : line.type === 'system' ? 'text-cyan-400 italic' : ''}
                 style={line.type === 'command' ? { textShadow: '0 0 5px rgba(251, 191, 36, 0.5)' } : undefined}>
              {line.text || '\u00A0'}
            </div>
          ))}
        </div>

        {/* The AI strip. Rendered only when a brain is actually mounted here,
            which until stage 5a meant "never" on this page. */}
        {game && (
          <AiBadge
            status={aiStatus}
            running={aiOn}
            arm={effectiveArm(game)}
            arms={armsForGame(game)}
            onArm={(next) => { selectArm(next); setArmState(getArm()) }}
            onToggle={aiOn ? () => stopAi('you stopped it') : startAi}
            progress={aiStatus?.progress ? { label: 'PROGRESS', value: aiStatus.progress, max: null } : null}
            detail={aiNote || (aiOn ? 'any key takes the keyboard back' : null)}
          />
        )}

        {/* Input line */}
        <form onSubmit={handleSubmit} className="flex items-center p-4 pt-2">
          <span className="mr-2 select-none">&gt;</span>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!inputEnabled || paused || aiOn}
            placeholder={aiOn ? 'the agent is driving — press any key to take over' : undefined}
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
export const ZorkI = () => <ZorkGame storyFile="games/zork/zork1.z3" label="ZORK I" route="/zork" />
export const ZorkII = () => <ZorkGame storyFile="games/zork/zork2.z3" label="ZORK II" route="/zork2" />
export const ZorkIII = () => <ZorkGame storyFile="games/zork/zork3.z3" label="ZORK III" route="/zork3" />
