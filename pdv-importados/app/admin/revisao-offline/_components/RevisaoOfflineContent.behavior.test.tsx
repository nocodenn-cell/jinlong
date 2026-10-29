/** @vitest-environment jsdom */
/**
 * Fila de revisão offline: justificativa obrigatória, evento próprio bloqueado, ordem do caixa,
 * duplo clique não dispara duas decisões, histórico mostra quem/quando/por quê.
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import pt from '@/i18n/pt.json'
import type { RevisaoItem } from '@/lib/revisaoOffline/revisaoOffline'

const decidirMock = vi.fn()
const refreshMock = vi.fn()

vi.mock('../actions', () => ({ decidirRevisaoOffline: (...a: unknown[]) => decidirMock(...a) }))
vi.mock('@/components/ui/admin-v2/OperationalHubNav', () => ({
  OperationalHubNav: ({ hub }: { hub: string }) => <nav data-testid="operational-hub-nav" data-hub={hub} />,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { RevisaoOfflineContent } = await import('./RevisaoOfflineContent')
const t = (pt as unknown as { revisao_offline: Parameters<typeof RevisaoOfflineContent>[0]['t'] }).revisao_offline

const base: RevisaoItem = {
  id: '11111111-2222-4333-8444-555555555555',
  seq: 1,
  eventId: 'ev-1',
  tipo: 'VENDA_REGISTRADA',
  origem: 'legado',
  lojaId: 'l1',
  lojaNome: 'Loja A',
  caixaId: 'c1',
  vendaId: null,
  operadorId: 'op1',
  operadorNome: 'Ana',
  operadorAtivo: false,
  horarioDispositivo: '2026-10-28T09:00:00Z',
  recebidoEm: '2026-10-28T10:00:00Z',
  classificacao: 'APOS_INATIVACAO',
  motivo: 'SEM_PROVA_DO_SERVIDOR_ANTERIOR_A_PERDA',
  evidencias: { recebimentos: 2, segredo: 'nao-mostrar' },
  resumo: { totalLiquido: 50, itens: 2 },
  status: 'PENDENTE',
  decididoPor: null,
  decididoPorNome: null,
  decididoEm: null,
  decisaoMotivo: null,
  anterioresPendentes: 0,
  eMeuEvento: false,
}

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  decidirMock.mockReset()
  refreshMock.mockReset()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function render(itens: RevisaoItem[], filtro: 'PENDENTE' | 'DECIDIDOS' = 'PENDENTE') {
  act(() => root.render(<RevisaoOfflineContent t={t} locale="pt-BR" filtro={filtro} itens={itens} erroLista={null} />))
}
const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null
const qa = (id: string) => Array.from(document.querySelectorAll(`[data-testid="${id}"]`)) as HTMLElement[]
async function digitar(el: HTMLTextAreaElement, v: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    setter.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('RevisaoOfflineContent', () => {
  it('lista vazia e hub de vendas', () => {
    render([])
    expect(q('revisao-vazio')?.textContent).toBe(t.vazio_pendentes)
    expect(q('operational-hub-nav')?.getAttribute('data-hub')).toBe('vendas')
  })

  it('mostra motivo da pendência traduzido e detalhes sem evidências desconhecidas', async () => {
    render([base])
    expect(q('revisao-linha')?.textContent).toContain(t.motivos.SEM_PROVA_DO_SERVIDOR_ANTERIOR_A_PERDA)
    await act(async () => q('revisao-detalhes')!.click())
    const det = q('revisao-detalhe')!.textContent!
    expect(det).toContain(t.detalhe_horario_aviso)
    expect(q('revisao-evidencias')!.textContent).toContain(t.evidencias.recebimentos)
    expect(det).not.toContain('nao-mostrar')
  })

  it('justificativa obrigatória: confirmar desabilitado até 5 caracteres', async () => {
    render([base])
    await act(async () => q('revisao-aprovar')!.click())
    const confirmar = q('revisao-confirmar') as HTMLButtonElement
    expect(confirmar.disabled).toBe(true)
    await digitar(q('revisao-motivo') as HTMLTextAreaElement, '   ab ')
    expect(confirmar.disabled).toBe(true)
    await act(async () => confirmar.click())
    expect(decidirMock).not.toHaveBeenCalled()
    await digitar(q('revisao-motivo') as HTMLTextAreaElement, 'conferido')
    expect((q('revisao-confirmar') as HTMLButtonElement).disabled).toBe(false)
  })

  it('aprova uma única vez mesmo com duplo clique e atualiza a lista', async () => {
    let resolver: (v: unknown) => void = () => {}
    decidirMock.mockImplementation(() => new Promise((r) => (resolver = r)))
    render([base])
    await act(async () => q('revisao-aprovar')!.click())
    await digitar(q('revisao-motivo') as HTMLTextAreaElement, 'conferido com o gerente')
    const confirmar = q('revisao-confirmar') as HTMLButtonElement
    await act(async () => {
      confirmar.click()
      confirmar.click()
    })
    expect(decidirMock).toHaveBeenCalledTimes(1)
    expect(decidirMock).toHaveBeenCalledWith({ id: base.id, decisao: 'APROVAR', motivo: 'conferido com o gerente' })
    await act(async () => resolver({ ok: true, status: 'APROVADO', idempotente: false }))
    expect(q('revisao-sucesso')?.textContent).toBe(t.sucesso_aprovado)
    expect(refreshMock).toHaveBeenCalled()
  })

  it('evento próprio: aprovar e rejeitar desabilitados com aviso', () => {
    render([{ ...base, eMeuEvento: true }])
    expect((q('revisao-aprovar') as HTMLButtonElement).disabled).toBe(true)
    expect((q('revisao-rejeitar') as HTMLButtonElement).disabled).toBe(true)
    expect(q('revisao-bloqueio-meu-evento')?.textContent).toBe(t.bloqueio_meu_evento)
  })

  it('fora de ordem: só rejeitar disponível', () => {
    render([{ ...base, anterioresPendentes: 2 }])
    expect((q('revisao-aprovar') as HTMLButtonElement).disabled).toBe(true)
    expect((q('revisao-rejeitar') as HTMLButtonElement).disabled).toBe(false)
    expect(q('revisao-bloqueio-ordem')?.textContent).toContain('2')
  })

  it('erro do servidor (autoaprovação) aparece no modal e nada é atualizado', async () => {
    decidirMock.mockResolvedValue({ ok: false, erro: 'autoaprovacao' })
    render([base])
    await act(async () => q('revisao-rejeitar')!.click())
    await digitar(q('revisao-motivo') as HTMLTextAreaElement, 'tentativa')
    await act(async () => q('revisao-confirmar')!.click())
    expect(q('revisao-erro-modal')?.textContent).toBe(t.erros.autoaprovacao)
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('já decidida por outro: fecha e recarrega', async () => {
    decidirMock.mockResolvedValue({ ok: false, erro: 'ja_decidida' })
    render([base])
    await act(async () => q('revisao-aprovar')!.click())
    await digitar(q('revisao-motivo') as HTMLTextAreaElement, 'conferido')
    await act(async () => q('revisao-confirmar')!.click())
    expect(q('revisao-confirmar')).toBeNull()
    expect(q('revisao-erro')?.textContent).toBe(t.erros.ja_decidida)
    expect(refreshMock).toHaveBeenCalled()
  })

  it('histórico mostra status, quem, quando e justificativa, sem botões de decisão', () => {
    render(
      [{ ...base, status: 'REJEITADO', decididoPor: 'g1', decididoPorNome: 'Gerente B', decididoEm: '2026-10-28T11:00:00Z', decisaoMotivo: 'venda duplicada' }],
      'DECIDIDOS',
    )
    const d = q('revisao-decisao')!.textContent!
    expect(d).toContain(t.status.REJEITADO)
    expect(d).toContain('Gerente B')
    expect(d).toContain('venda duplicada')
    expect(qa('revisao-aprovar')).toHaveLength(0)
  })
})
