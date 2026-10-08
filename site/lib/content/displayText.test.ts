import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getHomeContent } from './index'
import { cjkDisplayChars } from './displayText'

const CHARS_FILE = path.resolve(__dirname, '../../app/fonts/noto-serif-sc-600.chars.txt')

describe('subset da fonte de títulos zh-CN', () => {
  it('cobre todos os caracteres chineses usados nos títulos (rode npm run fonts:subset se falhar)', () => {
    const covered = new Set(fs.readFileSync(CHARS_FILE, 'utf8').trim())
    const missing = [...cjkDisplayChars(getHomeContent('zh-CN'))].filter((c) => !covered.has(c))
    expect(missing).toEqual([])
  })

  it('a licença OFL acompanha o arquivo de fonte derivado', () => {
    const license = fs.readFileSync(path.resolve(__dirname, '../../app/fonts/OFL.txt'), 'utf8')
    expect(license).toContain('SIL Open Font License')
  })
})
