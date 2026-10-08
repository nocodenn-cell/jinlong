/**
 * Gera app/fonts/cjk-<peso>.chars.txt com os caracteres chineses de cada papel tipográfico.
 * Rode sempre que um texto chinês de título, interface ou marca mudar (ex.: após a revisão nativa):
 *   npm run fonts:subset -w jinlong-site -- --source <pasta com node_modules/@fontsource/noto-sans-sc>
 */
import fs from 'node:fs'
import path from 'node:path'
import { CJK_WEIGHTS, cjkCharsByWeight } from '../lib/content/displayText'

const fontsDir = path.join(__dirname, '..', 'app', 'fonts')
const chars = cjkCharsByWeight()

for (const weight of CJK_WEIGHTS) {
  const target = path.join(fontsDir, `cjk-${weight}.chars.txt`)
  fs.writeFileSync(target, `${chars[weight]}\n`, 'utf8')
  process.stdout.write(`${weight}: ${chars[weight].length} caracteres\n`)
}
