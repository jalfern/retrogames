// CLOUDFLARE WORKERS SHIM (#1711 S5) — the minimum surface relay/worker.js
// needs to be IMPORTED in plain Node: `import { DurableObject } from
// 'cloudflare:workers'` runs at module top level (Room/Registry extend it),
// but the session-store routes touch no DO — the class only has to exist.
// Resolved via scripts/lib/cfworkers-hooks.mjs (module.register). DO runtime
// behavior is NOT faked here: netcheck's Node relay covers the WS side;
// relaysim drives the plain-HTTP routes, which is what phones use.

export class DurableObject {
    constructor(ctx = {}, env = {}) {
        this.ctx = ctx
        this.env = env
    }
}

export default { DurableObject }
