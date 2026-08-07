import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Contratos Sprint 0 do FilterBar (UX-S0-06 / UX-S0-25).
 * Garante daterange + reset de page sem depender de next/navigation em jsdom.
 */
describe('FilterBar Sprint 0 contracts', () => {
  const source = readFileSync(join(import.meta.dirname, 'FilterBar.tsx'), 'utf8')

  it('expõe tipo daterange', () => {
    expect(source).toContain("type: 'daterange'")
    expect(source).toContain('keyFrom')
    expect(source).toContain('keyTo')
  })

  it('reseta page em setParam / setDateRange / clearAll', () => {
    const deletes = source.match(/params\.delete\('page'\)/g) ?? []
    expect(deletes.length).toBeGreaterThanOrEqual(3)
  })
})
