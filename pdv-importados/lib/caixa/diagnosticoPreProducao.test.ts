import { describe, expect, it } from 'vitest'
import {
  calcularVereditoDiagnostico,
  contarPorStatus,
  type DiagnosticoCheck,
} from '@/lib/caixa/diagnosticoPreProducaoTypes'
import { avaliarFlagsAmbienteCaixa } from '@/lib/caixa/diagnosticoPreProducaoEnv'

describe('diagnosticoPreProducaoTypes', () => {
  it('bloqueia quando há falha', () => {
    const checks: DiagnosticoCheck[] = [
      { id: 'a', categoria: 'flags', titulo: 'A', status: 'ok', detalhe: '' },
      { id: 'b', categoria: 'rpc', titulo: 'B', status: 'falha', detalhe: '' },
    ]
    expect(calcularVereditoDiagnostico(checks)).toBe('BLOQUEADO')
    expect(contarPorStatus(checks)).toEqual({ totalFalhas: 1, totalAvisos: 0 })
  })

  it('piloto quando só ok e avisos', () => {
    const checks: DiagnosticoCheck[] = [
      { id: 'a', categoria: 'flags', titulo: 'A', status: 'ok', detalhe: '' },
      { id: 'b', categoria: 'estoque', titulo: 'B', status: 'aviso', detalhe: '' },
    ]
    expect(calcularVereditoDiagnostico(checks)).toBe('PRONTO_PILOTO')
  })
})

describe('avaliarFlagsAmbienteCaixa', () => {
  it('marca falha sem URL Supabase', () => {
    const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const prevKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key'

    try {
      const checks = avaliarFlagsAmbienteCaixa()
      const url = checks.find((c) => c.id === 'flag_supabase_url')
      expect(url?.status).toBe('falha')
    } finally {
      if (prevUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl
      else delete process.env.NEXT_PUBLIC_SUPABASE_URL
      if (prevKey !== undefined) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevKey
      else delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    }
  })
})
