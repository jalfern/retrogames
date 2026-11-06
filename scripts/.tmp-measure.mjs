// one-shot: measure '7px monospace' "000000" advance in the same browser the shots use
import { launchChrome } from './lib/chromeboot.mjs'
const browser = await launchChrome({ channel: 'chrome' })
const page = await browser.newPage()
const w = await page.evaluate(() => {
    const c = document.createElement('canvas')
    const x = c.getContext('2d')
    x.font = '7px monospace'
    return { score: x.measureText('000000').width, digit: x.measureText('0').width }
})
console.log(JSON.stringify(w))
await browser.close()
