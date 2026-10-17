// heatWorker.js — computes the lab generalisation heatmap off the main thread.
// Reports each cell (row vi, column xi) as it finishes. Vite bundles this via
// new Worker(new URL('./heatWorker.js', import.meta.url), { type: 'module' }).
import { CFG } from './sim.js'
import { heatCell } from './policy.js'

self.onmessage = (e) => {
    const { policy, gravity, xs, vxs, episodes } = e.data
    if (Number.isFinite(gravity) && gravity !== 1) CFG.gravity = CFG.gravity * gravity
    for (let vi = 0; vi < vxs.length; vi++) {
        for (let xi = 0; xi < xs.length; xi++) {
            self.postMessage({ vi, xi, pads: heatCell(policy, xs[xi], vxs[vi], episodes) })
        }
    }
    self.postMessage({ done: true })
}
