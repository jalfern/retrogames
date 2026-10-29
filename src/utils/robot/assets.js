// ROBOT SIM KIT — SimReady asset hookup (issue #1141 stage 2, via #1140).
//
// Every physical entity in the kit carries a SimReady record: who makes the
// real-world counterpart, where its asset lives (LINK only — never mirrored,
// CI never downloads), its license, and the physics the USD layer carries
// (mass, friction, collider). GLB has no physics slot, so this record is what
// keeps SimReady's promise beside the sim: `applyAssetPhysics` transcribes the
// masses and frictions into the live cannon world, and robokitcheck proves the
// world actually wears them.
//
// License law is #1140's `licenseGate()` (src/utils/modelLibrary.js): a
// per-supplier pack is `review` — no mesh may enter the shelf until its asset
// page is checked; `never` fails the build gate. Meshes stay un-pulled here:
// SimReady lives in USD on HuggingFace, outside the GitHub/npm network rule,
// and USD→GLB conversion is the documented manual step.

import { licenseGate } from '../modelLibrary.js'

export const MANIFEST_REV = 'simready-manifest/2'
export const SIMREADY_LIBRARY = 'nvidia-simready'

export const ASSETS = [
    {
        id: 'robotiq_2f85',
        kitSlot: 'gripper',
        name: 'Robotiq 2F-85 parallel gripper',
        supplier: 'Robotiq',
        library: SIMREADY_LIBRARY,
        url: 'https://huggingface.co/spaces/nvidia/simready-central',
        license: 'per-supplier',
        gate: 'review',
        physics: {
            massKg: 1.0,
            friction: 0.7,
            collider: { type: 'box', half: [0.041, 0.045, 0.05] },
        },
        // Stage 3: force-closure law inputs, published 2F-85 figures.
        // Grasp-force setting range 20–140 N; the lab runs 40 N (low-mid).
        grip: { clampForceN: 40, padFriction: 0.7, contacts: 2, safety: 1.35 },
        physicsProvenance: 'published 2F-85 spec: 1.0 kg incl. fingers, 85 mm stroke, 20–140 N grasp force (lab setting 40 N), rubber pads μ≈0.7; live force-closure since stage 3 (links still kinematic)',
        mesh: { pulled: false, formats: 'usd→glb (manual, outside CI)' },
        use: 'the kit fingertip pair',
    },
    {
        id: 'warehouse_carton',
        kitSlot: 'crate',
        name: 'Corrugated carton (warehouse line)',
        supplier: 'warehouse line (per-asset supplier TBD)',
        library: SIMREADY_LIBRARY,
        url: 'https://huggingface.co/spaces/nvidia/simready-central',
        license: 'per-supplier',
        gate: 'review',
        physics: {
            massKg: 0.42,
            friction: 0.5,
            restitution: 0.08,
            collider: { type: 'box', half: [0.0325, 0.0325, 0.0325] },
        },
        physicsProvenance: 'small filled carton estimate pending USD transcription; friction drives the live cardboard material',
        mesh: { pulled: false, formats: 'usd→glb (manual, outside CI)' },
        use: 'pick-and-place cargo',
    },
    {
        id: 'grocery_tin',
        kitSlot: 'can',
        name: 'Canned good (300 ml tin)',
        supplier: 'grocery SKU (per-asset supplier TBD)',
        library: SIMREADY_LIBRARY,
        url: 'https://huggingface.co/spaces/nvidia/simready-central',
        license: 'per-supplier',
        gate: 'review',
        physics: {
            massKg: 0.39,
            friction: 0.3,
            restitution: 0.06,
            collider: { type: 'cylinder', radius: 0.028, height: 0.09 },
        },
        physicsProvenance: 'full 300 ml tin ≈ 0.39 kg published retail mass; friction drives the live tin material',
        mesh: { pulled: false, formats: 'usd→glb (manual, outside CI)' },
        use: 'stow target for the cabinet',
    },
    {
        id: 'lg_crisper_drawer',
        kitSlot: 'drawer',
        name: 'Refrigerator crisper drawer',
        supplier: 'LG Electronics (appliance line)',
        library: SIMREADY_LIBRARY,
        url: 'https://huggingface.co/spaces/nvidia/simready-central',
        license: 'per-supplier',
        gate: 'review',
        physics: {
            massKg: 1.6,
            friction: 0.2,
            collider: { type: 'compound', note: 'bottom + 4 walls, open top (see props.js)' },
        },
        physicsProvenance: 'glass+frame crisper assembly mass estimate pending USD transcription',
        mesh: { pulled: false, formats: 'usd→glb (manual, outside CI)' },
        use: 'rail-mounted task drawer',
    },
    {
        id: 'lg_appliance_door',
        kitSlot: 'door',
        name: 'Refrigerator door panel',
        supplier: 'LG Electronics (appliance line)',
        library: SIMREADY_LIBRARY,
        url: 'https://huggingface.co/spaces/nvidia/simready-central',
        license: 'per-supplier',
        gate: 'review',
        physics: {
            massKg: 0.9,
            friction: 0.2,
            collider: { type: 'box', half: [0.114, 0.118, 0.012] },
        },
        physicsProvenance: 'appliance door panel estimate pending USD transcription',
        mesh: { pulled: false, formats: 'usd→glb (manual, outside CI)' },
        use: 'spring-hinged cabinet door',
    },
    {
        id: 'warehouse_bench',
        kitSlot: 'bench',
        name: 'Industrial workbench',
        supplier: 'warehouse line (per-asset supplier TBD)',
        library: SIMREADY_LIBRARY,
        url: 'https://huggingface.co/spaces/nvidia/simready-central',
        license: 'per-supplier',
        gate: 'review',
        physics: {
            massKg: null,
            static: true,
            friction: 0.32,
            collider: { type: 'box', half: [0.9, 0.45, 0.55] },
        },
        physicsProvenance: 'static fixture — friction drives the wood surface the assets ride',
        mesh: { pulled: false, formats: 'usd→glb (manual, outside CI)' },
        use: 'the bench the whole task sits on',
    },
]

export const SLOTS = ASSETS.map((a) => a.kitSlot)

export function assetFor(slot) {
    return ASSETS.find((a) => a.kitSlot === slot) || null
}

// The declared gate must equal what the law computes — data cannot drift
// (same recompute discipline as modelLibrary.gateFor).
export function gateFor(asset) {
    return licenseGate(asset.license)
}

// Player-visible provenance: one row per physical part.
export function manifestSummary() {
    return ASSETS.map((a) => ({
        slot: a.kitSlot,
        name: a.name,
        supplier: a.supplier,
        gate: gateFor(a),
        massKg: a.physics.massKg,
        pulled: !!a.mesh.pulled,
    }))
}
