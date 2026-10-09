import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const css = fs.readFileSync(path.join(__dirname, 'site.css'), 'utf8')
const layout = fs.readFileSync(path.join(__dirname, '..', 'app', '[locale]', 'layout.tsx'), 'utf8')

describe('site.css', () => {
  it('toda var() referenciada está definida no CSS ou pelas fontes do layout', () => {
    const defined = new Set([
      ...[...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]),
      ...[...layout.matchAll(/variable:\s*'(--[\w-]+)'/g)].map((m) => m[1]),
    ])
    const used = new Set([...css.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]))
    expect([...used].filter((name) => !defined.has(name))).toEqual([])
  })
})
