// RESOLVE HOOK (#1711 S5) — maps the virtual `cloudflare:workers` specifier
// to scripts/lib/cfworkers-shim.mjs so the production worker file loads under
// plain Node. Registered once by relaysim.mjs via module.register().

const SHIM = new URL('./cfworkers-shim.mjs', import.meta.url).href

export function resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') return { url: SHIM, shortCircuit: true }
    return nextResolve ? nextResolve(specifier, context) : undefined
}
