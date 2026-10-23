// chromecleanup — #907: Forge's headless Chrome must die with its check script.
//
// The *check.mjs scripts spawn Chrome and kill it only in a `finally`, but
// `finally` never runs when the node process itself is killed (the forge-qa
// hard cap does `kill $OC`, sessions get interrupted mid-check) — Chrome was
// left orphaned under launchd eating CPU/RAM. Guard the child at spawn time:
// the returned cleanup runs from the script's `finally` AND from
// exit/SIGTERM/SIGINT, killing Chrome and pkill-ing anything still holding
// its /tmp/forge profile. Use it like:
//   const chrome = spawn(CHROME, [... `--user-data-dir=${profDir}` ...])
//   const cleanup = guardChrome(chrome, profDir)   // + { detached: true }
//   try { ... } finally { cleanup() }
import { spawnSync } from 'node:child_process'

export function guardChrome(chrome, profDir, { detached = false } = {}) {
  let done = false
  const cleanup = () => {
    if (done) return
    done = true
    if (detached) { try { process.kill(-chrome.pid) } catch { /* gone */ } }
    try { chrome.kill('SIGKILL') } catch { /* gone */ }
    try { spawnSync('pkill', ['-f', `user-data-dir=${profDir}`]) } catch { /* gone */ }
  }
  process.on('exit', cleanup)
  process.on('SIGINT', () => { cleanup(); process.exit(130) })
  process.on('SIGTERM', () => { cleanup(); process.exit(143) })
  return cleanup
}
