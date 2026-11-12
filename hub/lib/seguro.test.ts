import { describe, expect, it, vi } from 'vitest'
import { tentar } from './seguro'

describe('tentar', () => {
  it('devolve o valor quando a leitura funciona', async () => {
    const r = await tentar('ok', async () => [1, 2], [])
    expect(r).toEqual({ value: [1, 2], falhou: false })
  })

  it('devolve o fallback e marca falha sem lançar', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await tentar('quebrada', async () => { throw new Error('Falha ao acessar dados (400).') }, [] as number[])
    expect(r).toEqual({ value: [], falhou: true })
    expect(log).toHaveBeenCalledWith('[hub] quebrada falhou:', 'Falha ao acessar dados (400).')
    log.mockRestore()
  })

  it('aceita fallback null para leituras que podem não existir', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await tentar('trial', async () => { throw new Error('x') }, null as { id: string } | null)
    expect(r.value).toBeNull()
    expect(r.falhou).toBe(true)
    log.mockRestore()
  })
})
