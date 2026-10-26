// VIPER PIT stages (#1096) — dark, atmospheric arenas designed from the 1992
// arcade idiom of the gritty fighter: a lit fighting floor surrounded by night.
// Three pits, each with its own fog, key light, and background furniture; the
// renderer reads only this data.

export const STAGES = [
    {
        id: 'alley', name: 'BACK ALLEY, 2 A.M.',
        ground: '#2c2a26', groundLine: '#201e1a', fog: 0x0a0c12, fogD: 0.052,
        key: 0xd8c8a8, keyI: 1.15, rim: 0x3a5f8a,
        props: 'dumpster',
        trash: ['#4a463e', '#3a3630', '#565045'],
        neonSigns: [
            { x: -7.2, y: 7.6, c: 0xff3030, w: 3.2, h: 0.5, label: 'OPEN' },
            { x: 6.4, y: 8.6, c: 0x30d0ff, w: 2.4, h: 0.44, label: 'BAR' },
        ],
        crowd: '#0d0f16', crowdLit: 0x5a6a8a,
        lampColor: 0xffe6b0, lamps: [-5.5, 5.5],
    },
    {
        id: 'foundry', name: 'THE FOUNDRY',
        ground: '#33261e', groundLine: '#241a14', fog: 0x160b06, fogD: 0.045,
        key: 0xffb070, keyI: 1.35, rim: 0xd8582a,
        props: 'girders',
        trash: ['#4c3426', '#5c3c28', '#3a2a1e'],
        neonSigns: [
            { x: 0, y: 9.2, c: 0xff7a20, w: 4.2, h: 0.55, label: 'MELT' },
            { x: -8, y: 7.2, c: 0xffb03c, w: 1.6, h: 0.4, label: '' },
        ],
        crowd: '#150c08', crowdLit: 0x9a5a30,
        lampColor: 0xff9040, lamps: [-6.5, 0, 6.5],
    },
    {
        id: 'subway', name: 'MIDTOWN, LAST TRAIN',
        ground: '#26262e', groundLine: '#1b1b22', fog: 0x07070d, fogD: 0.05,
        key: 0xcfd8ff, keyI: 1.0, rim: 0x4a7ad8,
        props: 'tiles',
        trash: ['#3c3c48', '#484856', '#30303c'],
        neonSigns: [
            { x: -6.8, y: 7.8, c: 0xffd23e, w: 2.8, h: 0.46, label: 'EXIT' },
            { x: 5.6, y: 8.4, c: 0xb04aff, w: 2.6, h: 0.46, label: 'LINE 9' },
        ],
        crowd: '#0b0c14', crowdLit: 0x6878b0,
        lampColor: 0xcfe0ff, lamps: [-4.5, 4.5],
    },
]
