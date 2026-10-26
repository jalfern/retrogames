import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../public/demos/blackhole.html', import.meta.url), 'utf8')

test('URL spin is applied only after the running audio state is initialized', () => {
  const audioState = source.indexOf('let AC = null, master = null, running = false')
  const initialSpin = source.indexOf('if (spinA !== 0) applySpin(spinA)')
  assert.ok(audioState >= 0 && initialSpin > audioState,
    `audio state index ${audioState} must precede initial spin index ${initialSpin}`)
})
