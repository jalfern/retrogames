// ROBOT SIM KIT — Plaicraft episodes (issue #1141).
//
// Every run saves an EPISODE: the retrogames-rec/v1 recording (seed, one
// pad + raw device view per slot per tick, checkpoint hashes, slot sources
// human|cpu|model) PLUS an `episode` block: what task the run was, whether
// it succeeded, which input methods the player used, and a downsampled
// object-pose track (positions/orientations of every tracked body).
//
// The base format is untouched: `episode` is an OPTIONAL block, old files
// validate unchanged, and a v1-capable replay tool ignores it. Training
// consumers that want physics truth read poses + the hash checkpoints (the
// replay proof that the poses are exactly what the physics produced).
//
// Bulk export: EpisodeStore keeps finished episodes in localStorage (browser
// only); exportEpisodes() serializes them as JSON-lines, one episode per
// line — a dataset in one file.

import { createRecorder, validate } from '../recording.js'

export const EPISODE_POSE_EVERY = 6

export function createEpisode(opts = {}) {
    const { task = 'unspecified', poseEvery = EPISODE_POSE_EVERY, sources, assets = null, ...rest } = opts
    const rec = createRecorder({ ...rest, sources })
    const poses = []
    const methodsUsed = []
    let poseSeq = 0

    return {
        get ticks() { return rec.ticks },
        noteMethod(m) { if (m && !methodsUsed.includes(m)) methodsUsed.push(m) },
        addTick(pads, raws = null, hash = null, posesNow = null, pings = null) {
            rec.addTick(pads, raws, hash, pings)
            if (posesNow && rec.ticks % poseEvery === 0) {
                poses.push({ t: rec.ticks, o: posesNow })
                poseSeq++
            }
        },
        finish({ success = false, score = 0, finalHash = null } = {}) {
            const file = rec.finish(finalHash)
            file.episode = {
                task,
                success: !!success,
                score,
                poseEvery,
                poseCount: poseSeq,
                poses,
                methodsUsed: methodsUsed.length ? [...methodsUsed] : [file.method],
            }
            // Asset pin (#1141 stage 2): which SimReady manifest revision's
            // physics this run was played against — datasets stay honest about
            // the transcribed masses/frictions they were generated with.
            if (assets) file.episode.assets = assets
            return file
        },
    }
}

export function validateEpisode(rec) {
    const base = validate(rec)
    if (base) return base
    const ep = rec.episode
    if (ep === undefined) return null
    if (!ep || typeof ep !== 'object') return 'episode must be an object'
    if (typeof ep.task !== 'string' || !ep.task) return 'episode.task missing'
    if (typeof ep.success !== 'boolean') return 'episode.success must be boolean'
    if (!Number.isFinite(ep.score)) return 'episode.score must be a number'
    if (!Number.isInteger(ep.poseEvery) || ep.poseEvery < 1) return 'episode.poseEvery must be a positive integer'
    if (!Array.isArray(ep.poses)) return 'episode.poses must be an array'
    if (!Number.isInteger(ep.poseCount) || ep.poseCount !== ep.poses.length) return 'episode.poseCount must match poses'
    let lastT = 0
    for (const x of ep.poses) {
        if (!x || !Number.isInteger(x.t) || x.t < 1 || x.t > rec.ticks || x.t <= lastT) return 'episode pose ticks must increase within ticks'
        if (!x.o || typeof x.o !== 'object') return 'episode pose entry needs a body map'
        for (const k of Object.keys(x.o)) {
            const b = x.o[k]
            if (!Array.isArray(b.p) || b.p.length !== 3 || !b.p.every(Number.isFinite)) return `episode pose ${k}: p must be [x,y,z]`
            if (!Array.isArray(b.q) || b.q.length !== 4 || !b.q.every(Number.isFinite)) return `episode pose ${k}: q must be [x,y,z,w]`
        }
        lastT = x.t
    }
    if (!Array.isArray(ep.methodsUsed) || !ep.methodsUsed.length) return 'episode.methodsUsed must be a non-empty list'
    if (ep.assets !== undefined && (typeof ep.assets !== 'string' || !ep.assets)) return 'episode.assets must be a non-empty string'
    return null
}

export function episodeDownload(rec) {
    const bad = validateEpisode(rec)
    if (bad) throw new Error(`episodeDownload: ${bad}`)
    return {
        filename: `${rec.game}-ep-seed${rec.seed}-t${rec.ticks}-${rec.episode.success ? 'win' : 'loss'}.json`,
        text: JSON.stringify(rec) + '\n',
    }
}

export function exportEpisodes(list) {
    const clean = []
    for (const ep of list) {
        const bad = validateEpisode(ep)
        if (bad) throw new Error(`exportEpisodes: ${bad}`)
        clean.push(JSON.stringify(ep))
    }
    return { filename: `plaicraft-episodes-${list.length}.jsonl`, text: clean.join('\n') + (clean.length ? '\n' : '') }
}

const LS_KEY = 'retrogames-episodes'
const LS_MAX = 50

export function saveEpisode(ep) {
    if (typeof localStorage === 'undefined') return 0
    const list = loadEpisodes()
    list.push(ep)
    while (list.length > LS_MAX) list.shift()
    localStorage.setItem(LS_KEY, JSON.stringify(list))
    return list.length
}

export function loadEpisodes() {
    if (typeof localStorage === 'undefined') return []
    try {
        const raw = localStorage.getItem(LS_KEY)
        const list = raw ? JSON.parse(raw) : []
        return Array.isArray(list) ? list : []
    } catch { return [] }
}
