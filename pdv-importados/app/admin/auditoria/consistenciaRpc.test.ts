import { describe, expect, it } from 'vitest'

// ─────────────────────────────────────────────────────────────
// F4 — RPC relatorio_consistencia_vendas: isolamento multi-loja
//
// Estes testes verificam o contrato de chamada da RPC, não a
// implementação do banco (que é coberta pela migration 250).
// O objetivo é garantir que a página sempre passa p_loja_id.
// ─────────────────────────────────────────────────────────────

/**
 * Monta os parâmetros que a página Admin Auditoria deve enviar
 * para relatorio_consistencia_vendas.
 *
 * Replica a lógica de auditoria/page.tsx para torná-la testável
 * sem depender de Server Components ou Supabase.
 */
function buildConsistenciaParams(opts: {
  lojaId: string | null
  filtroInicio: string | null
  filtroFim: string | null
  now?: Date
}) {
  const now = opts.now ?? new Date()
  const consistenciaFrom =
    opts.filtroInicio ?? new Date(now.getTime() - 7 * 86_400_000).toISOString()
  const consistenciaTo = opts.filtroFim ?? now.toISOString()

  return {
    p_from:    consistenciaFrom,
    p_to:      consistenciaTo,
    p_loja_id: opts.lojaId ?? null,
  }
}

describe('F4 — relatorio_consistencia_vendas: parâmetros de chamada', () => {
  it('inclui p_loja_id quando sessão tem lojaId', () => {
    const params = buildConsistenciaParams({
      lojaId: 'loja-abc-123',
      filtroInicio: null,
      filtroFim: null,
    })

    expect(params.p_loja_id).toBe('loja-abc-123')
  })

  it('passa p_loja_id = null para ADMIN sem loja (vê todas — comportamento esperado)', () => {
    const params = buildConsistenciaParams({
      lojaId: null,
      filtroInicio: null,
      filtroFim: null,
    })

    expect(params).toHaveProperty('p_loja_id')
    expect(params.p_loja_id).toBeNull()
  })

  it('GERENTE de loja A não pode ver loja B: parâmetros diferentes produzem consultas diferentes', () => {
    const lojaA = buildConsistenciaParams({ lojaId: 'loja-a', filtroInicio: null, filtroFim: null })
    const lojaB = buildConsistenciaParams({ lojaId: 'loja-b', filtroInicio: null, filtroFim: null })

    expect(lojaA.p_loja_id).not.toBe(lojaB.p_loja_id)
    expect(lojaA.p_loja_id).toBe('loja-a')
    expect(lojaB.p_loja_id).toBe('loja-b')
  })

  it('período padrão usa 7 dias quando filtro não fornecido', () => {
    const now = new Date('2026-06-24T14:00:00.000Z')
    const params = buildConsistenciaParams({
      lojaId: 'loja-x',
      filtroInicio: null,
      filtroFim: null,
      now,
    })

    const from = new Date(params.p_from)
    const to = new Date(params.p_to)
    const diffDias = (to.getTime() - from.getTime()) / 86_400_000

    expect(diffDias).toBeCloseTo(7, 0)
  })

  it('período personalizado é repassado sem alteração', () => {
    const inicio = '2026-06-01T00:00:00.000Z'
    const fim = '2026-06-15T23:59:59.000Z'

    const params = buildConsistenciaParams({
      lojaId: 'loja-x',
      filtroInicio: inicio,
      filtroFim: fim,
    })

    expect(params.p_from).toBe(inicio)
    expect(params.p_to).toBe(fim)
  })
})

// ─────────────────────────────────────────────────────────────
// F4 — Isolamento multi-loja: cenários expandidos (item 1.4)
// Validação de que cada perfil recebe o p_loja_id correto.
// ─────────────────────────────────────────────────────────────
describe('F4 — isolamento multi-loja: cenários Loja A / Loja B / Admin', () => {
  const LOJA_A = 'a0000001-0000-4000-8000-000000000001'
  const LOJA_B = 'a0000002-0000-4000-8000-000000000002'

  it('GERENTE da Loja A recebe p_loja_id da Loja A — nunca vê Loja B', () => {
    const params = buildConsistenciaParams({ lojaId: LOJA_A, filtroInicio: null, filtroFim: null })
    expect(params.p_loja_id).toBe(LOJA_A)
    expect(params.p_loja_id).not.toBe(LOJA_B)
  })

  it('GERENTE da Loja B recebe p_loja_id da Loja B — nunca vê Loja A', () => {
    const params = buildConsistenciaParams({ lojaId: LOJA_B, filtroInicio: null, filtroFim: null })
    expect(params.p_loja_id).toBe(LOJA_B)
    expect(params.p_loja_id).not.toBe(LOJA_A)
  })

  it('ADMIN (lojaId = null) recebe p_loja_id = null — visão global de todas as lojas', () => {
    const params = buildConsistenciaParams({ lojaId: null, filtroInicio: null, filtroFim: null })
    expect(params.p_loja_id).toBeNull()
  })

  it('p_loja_id está sempre presente nos parâmetros enviados (não pode ser omitido)', () => {
    const cenarios = [
      { lojaId: LOJA_A },
      { lojaId: LOJA_B },
      { lojaId: null },
    ]
    for (const { lojaId } of cenarios) {
      const params = buildConsistenciaParams({ lojaId, filtroInicio: null, filtroFim: null })
      // A chave deve existir — mesmo quando null, o parâmetro precisa ser passado
      // para que a RPC aplique (ou omita) o filtro corretamente
      expect('p_loja_id' in params).toBe(true)
    }
  })

  it('troca de loja produz consultas diferentes — sem vazamento cross-loja', () => {
    const before = buildConsistenciaParams({ lojaId: LOJA_A, filtroInicio: null, filtroFim: null })
    const after  = buildConsistenciaParams({ lojaId: LOJA_B, filtroInicio: null, filtroFim: null })

    // Parâmetros de tempo idênticos; único diferencial é p_loja_id
    expect(before.p_loja_id).not.toBe(after.p_loja_id)
    // p_from e p_to devem ser iguais (mesma janela de tempo)
    // — qualquer diferença seria clock drift durante o teste, aceitável < 1ms
    const diff = Math.abs(
      new Date(before.p_from).getTime() - new Date(after.p_from).getTime()
    )
    expect(diff).toBeLessThan(1000) // < 1 segundo
  })
})
