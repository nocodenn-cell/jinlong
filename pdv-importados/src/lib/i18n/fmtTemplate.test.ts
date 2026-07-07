import { describe, expect, it } from 'vitest'
import { fmtTemplate } from './fmtTemplate'

describe('fmtTemplate', () => {
  it('replaces single placeholder', () => {
    expect(fmtTemplate('Hello {{name}}', { name: 'World' })).toBe('Hello World')
  })

  it('replaces multiple placeholders', () => {
    expect(fmtTemplate('{{a}} + {{b}} = {{c}}', { a: 1, b: 2, c: 3 })).toBe('1 + 2 = 3')
  })

  it('replaces missing keys with empty string', () => {
    expect(fmtTemplate('Hi {{user}}!', {})).toBe('Hi !')
  })

  it('returns template unchanged when no placeholders', () => {
    expect(fmtTemplate('no vars', { x: 1 })).toBe('no vars')
  })

  it('handles numeric values', () => {
    expect(fmtTemplate('Total: {{total}}', { total: 42 })).toBe('Total: 42')
  })

  it('replaces repeated placeholder', () => {
    expect(fmtTemplate('{{x}} and {{x}}', { x: 'ok' })).toBe('ok and ok')
  })
})
