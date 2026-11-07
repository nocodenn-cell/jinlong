// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const invokeMock = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }))

import { AtivacaoPdvGate } from './AtivacaoPdvGate'

const naoAtivado = { ativado: false, loja_id: null, dispositivo_id: null, endpoint: null, usando_env_legado: false }

describe('AtivacaoPdvGate', () => {
  beforeEach(() => invokeMock.mockReset())
  afterEach(() => cleanup())

  it('PDV legado (.env com SYNC_KEY) entra direto', async () => {
    invokeMock.mockResolvedValueOnce({ ...naoAtivado, usando_env_legado: true })
    render(<AtivacaoPdvGate forceTauri><div>caixa</div></AtivacaoPdvGate>)
    expect(await screen.findByText('caixa')).toBeTruthy()
  })

  it('sem ativação pede o código e libera o caixa após ativar', async () => {
    invokeMock.mockResolvedValueOnce(naoAtivado)
    invokeMock.mockResolvedValueOnce({ ...naoAtivado, ativado: true, loja_id: 'l1' })
    render(<AtivacaoPdvGate forceTauri><div>caixa</div></AtivacaoPdvGate>)
    const input = await screen.findByTestId('ativacao-codigo')
    const btn = screen.getByTestId('ativacao-enviar') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    fireEvent.change(input, { target: { value: 'k7qx-m2pa-9dzz' } })
    fireEvent.click(btn)
    expect(await screen.findByText('caixa')).toBeTruthy()
    expect(invokeMock).toHaveBeenLastCalledWith('ativar_pdv_cmd', { codigo: 'K7QX-M2PA-9DZZ', endpoint: null, nome: null })
  })

  it('mostra erro do servidor e continua bloqueado', async () => {
    invokeMock.mockResolvedValueOnce(naoAtivado)
    invokeMock.mockRejectedValueOnce('Código inválido, já usado ou expirado. Peça um novo código no painel.')
    render(<AtivacaoPdvGate forceTauri><div>caixa</div></AtivacaoPdvGate>)
    fireEvent.change(await screen.findByTestId('ativacao-codigo'), { target: { value: 'AAAA-BBBB-CCCC' } })
    fireEvent.click(screen.getByTestId('ativacao-enviar'))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Código inválido/))
    expect(screen.queryByText('caixa')).toBeNull()
  })
})
