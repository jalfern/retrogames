// MISSILE COMMAND — pure spawn dice (#1473 seedpin batch 15).
// The warheads' whole personality is three draws per spawn: which surviving
// structure is targeted, where the trail enters the sky, and where the warhead
// itself starts (the original drew both independently, giving slanted trails).
// All three come from the injected rand (seedRng(seed) upstream), so ?seed=N
// replays the exact barrage — targets, angles and all.

export const SCREEN_WIDTH = 800

export function chooseEnemySpawn(rand, targets, width = SCREEN_WIDTH) {
    const target = targets[Math.floor(rand() * targets.length)]
    return { target, x: rand() * width, startX: rand() * width }
}
