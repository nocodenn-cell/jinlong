import { describe, expect, it } from 'vitest'
import { escapeCsvCell, objectsToCsv, rowsToCsv } from './csv'

describe('escapeCsvCell', () => {
  it('returns empty string for null', () => {
    expect(escapeCsvCell(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(escapeCsvCell(undefined)).toBe('')
  })

  it('returns plain string as-is', () => {
    expect(escapeCsvCell('hello')).toBe('hello')
  })

  it('converts number to string', () => {
    expect(escapeCsvCell(42)).toBe('42')
  })

  it('wraps strings with commas in quotes', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"')
  })

  it('wraps strings with quotes and escapes inner quotes', () => {
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""')
  })

  it('wraps strings with newlines', () => {
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"')
  })
})

describe('rowsToCsv', () => {
  it('produces BOM-prefixed CSV with headers and rows', () => {
    const csv = rowsToCsv(['A', 'B'], [['1', '2'], ['3', '4']])
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('A,B')
    expect(csv).toContain('1,2')
    expect(csv).toContain('3,4')
  })

  it('produces only header when no data rows', () => {
    const csv = rowsToCsv(['X', 'Y'], [])
    expect(csv).toBe('\uFEFFX,Y')
  })
})

describe('objectsToCsv', () => {
  it('maps columns from objects to CSV', () => {
    const columns = [
      { key: 'name' as const, header: 'Nome' },
      { key: 'price' as const, header: 'Preço' },
    ]
    const rows = [
      { name: 'Widget', price: 10 },
      { name: 'Gadget', price: 20 },
    ]
    const csv = objectsToCsv(columns, rows)
    expect(csv).toContain('Nome,Preço')
    expect(csv).toContain('Widget,10')
    expect(csv).toContain('Gadget,20')
  })
})
