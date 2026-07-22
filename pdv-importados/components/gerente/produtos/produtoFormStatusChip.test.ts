import { describe, expect, it } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import { resolveProdutoFormStatusChip } from './produtoFormStatusChip'

const p = getMessages('pt').produtos

describe('resolveProdutoFormStatusChip', () => {
  it('novo cadastro → chip Novo com hint de publicação', () => {
    const chip = resolveProdutoFormStatusChip(false, null, p)
    expect(chip.label).toBe(p.status_chip_novo)
    expect(chip.tone).toBe('novo')
  })

  it('rascunho → badge Rascunho', () => {
    const chip = resolveProdutoFormStatusChip(true, 'DRAFT', p)
    expect(chip.label).toBe(p.rascunho)
    expect(chip.tone).toBe('rascunho')
  })

  it('publicado → No PDV', () => {
    const chip = resolveProdutoFormStatusChip(true, 'PUBLICADO', p)
    expect(chip.label).toBe(p.status_chip_no_pdv)
    expect(chip.tone).toBe('pdv')
  })

  it('inativo → Inativo', () => {
    const chip = resolveProdutoFormStatusChip(true, 'INATIVO', p)
    expect(chip.label).toBe(p.inativo)
    expect(chip.tone).toBe('inativo')
  })
})
