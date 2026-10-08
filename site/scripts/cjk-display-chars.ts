/**
 * Gera app/fonts/noto-serif-sc-600.chars.txt com os caracteres chineses dos títulos.
 * Rodar sempre que o texto zh-CN mudar (ex.: após a revisão nativa):
 *   npm run fonts:subset -w jinlong-site
 */
import fs from 'node:fs'
import path from 'node:path'
import { getHomeContent } from '../lib/content'
import { cjkDisplayChars } from '../lib/content/displayText'

const target = path.join(__dirname, '..', 'app', 'fonts', 'noto-serif-sc-600.chars.txt')
const chars = cjkDisplayChars(getHomeContent('zh-CN'))
fs.writeFileSync(target, `${chars}\n`, 'utf8')
process.stdout.write(`${chars.length} caracteres -> ${path.relative(process.cwd(), target)}\n`)
