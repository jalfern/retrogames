// Shared 3D model shelf loader (#637).
// One index every game can browse (`/retrogames/models/shelf.json`) and a
// helper to load a model by id. Kept side-effect free so importing it in Node
// (the harness) never touches DOM/WebGL/fetch until a function is called.
//
//   const scene = await loadModel('tree_pine')
//   const shelf = await browse()                 // every entry + provenance
//   const url = await modelUrl('grandstand')     // resolve a path by id
//
// 1 unit = 1 metre, +Y up, origin on the ground. CC0 only — see each entry's
// `license` in the index and the LICENSE.txt files beside the models.

const base = () => (import.meta.env && import.meta.env.BASE_URL) || '/'

export function shelfUrl() {
    return `${base()}models/shelf.json`
}

let cache = null

export async function browse(force = false) {
    if (force || !cache) {
        const res = await fetch(shelfUrl())
        if (!res.ok) throw new Error(`shelf index ${res.status}`)
        cache = await res.json()
    }
    return cache
}

export async function shelfEntry(id) {
    const shelf = await browse()
    return shelf.entries.find((e) => e.id === id) || null
}

export async function modelUrl(id) {
    const e = await shelfEntry(id)
    if (!e) throw new Error(`unknown model id: ${id}`)
    return `${base()}${e.path}`
}

export async function loadModel(id) {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js')
    const url = await modelUrl(id)
    const gltf = await new GLTFLoader().loadAsync(url)
    return gltf.scene
}

// Ids of a category, handy for "give me every scenery prop the track can use".
export async function idsByCategory(category) {
    const shelf = await browse()
    return shelf.entries.filter((e) => e.category === category).map((e) => e.id)
}
