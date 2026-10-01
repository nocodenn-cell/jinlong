/** @vitest-environment jsdom */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CaixaHistoricoLinha } from '@/app/gerente/caixas/caixasHistorico'

/**
 * S9/G-01 — prova que clicar num turno fechado abre o detalhe com as
 * movimentações do turno (buscadas sob demanda, mesmo padrão do KardexSheet),
 * e que o valor sistema exibido é o já derivado no `linhas` recebido via
 * prop — este componente não recalcula nada, só renderiza.
 */

const listarMovimentacoesCaixaMock = vi.fn()

vi.mock('@/app/gerente/caixas/actions', () => ({
  listarMovimentacoesCaixa: (id: string) => listarMovimentacoesCaixaMock(id),
}))

const { CaixasHistoricoTable } = await import('./CaixasHistoricoTable')

const labels = {
  colOperador: 'Operador',
  colAbertura: 'Abertura',
  colFechamento: 'Fechamento',
  colValorSistema: 'Valor sistema',
  colValorContado: 'Valor contado',
  colDiferenca: 'Diferença',
  colMotivo: 'Motivo',
  colStatus: 'Status',
  statusFechado: 'Fechado',
  statusDivergencia: 'Divergência',
  statusRetomado: 'Retomado',
  semMotivo: '—',
  vazioTitulo: 'Nenhum caixa fechado ainda',
  vazioSub: 'Turnos fechados aparecerão aqui.',
  detalheTitulo: 'Detalhe do turno',
  detalheValorInicial: 'Valor inicial',
  detalheMovimentacoes: 'Movimentações do turno',
  detalheSemMovimentacoes: 'Nenhuma sangria ou suprimento neste turno.',
  movTipoSangria: 'Sangria',
  movTipoSuprimento: 'Suprimento',
  fecharAria: 'Fechar',
  erroTitulo: 'Não foi possível carregar.',
}

const linhaFechada: CaixaHistoricoLinha = {
  id: 'caixa-1',
  operadorNome: 'Maria',
  dataAbertura: '2026-09-17T10:00:00Z',
  dataFechamento: '2026-09-17T18:00:00Z',
  valorInicial: 100,
  valorSistema: 160,
  valorContado: 150,
  diferenca: -10,
  motivo: 'Falta de troco',
  retomado: false,
}

describe('CaixasHistoricoTable (S9/G-01)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    listarMovimentacoesCaixaMock.mockReset()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('estado vazio usa vazioTitulo/vazioSub quando não há caixas fechados', () => {
    act(() => {
      root.render(<CaixasHistoricoTable linhas={[]} erro={null} locale="pt-BR" labels={labels} />)
    })
    expect(container.textContent).toContain('Nenhum caixa fechado ainda')
  })

  it('erro de carregamento mostra ErrorState em vez de lista vazia disfarçada', () => {
    act(() => {
      root.render(
        <CaixasHistoricoTable linhas={[]} erro="Falha ao consultar." locale="pt-BR" labels={labels} />,
      )
    })
    expect(container.textContent).toContain('Falha ao consultar.')
  })

  it('UX-014: coluna Operador fica fixa durante o scroll horizontal', () => {
    act(() => {
      root.render(
        <CaixasHistoricoTable linhas={[linhaFechada]} erro={null} locale="pt-BR" labels={labels} />,
      )
    })
    const primeiraTh = container.querySelector('thead th') as HTMLElement
    expect(primeiraTh.textContent).toContain('Operador')
    expect(primeiraTh.className).toContain('sticky')
  })

  it('lista o turno com o valor sistema já recebido (não recalcula nada)', () => {
    act(() => {
      root.render(
        <CaixasHistoricoTable linhas={[linhaFechada]} erro={null} locale="pt-BR" labels={labels} />,
      )
    })
    expect(container.textContent).toContain('Maria')
    // valorSistema=160 veio pronto na prop — o componente só formata, não deriva.
    expect(container.textContent).toMatch(/160,00/)
  })

  it('motivo não ocupa coluna da tabela: aparece só no detalhe', async () => {
    listarMovimentacoesCaixaMock.mockResolvedValue({ ok: true, data: [] })
    act(() => {
      root.render(
        <CaixasHistoricoTable linhas={[linhaFechada]} erro={null} locale="pt-BR" labels={labels} />,
      )
    })
    const cabecalhos = Array.from(container.querySelectorAll('thead th')).map((th) => th.textContent)
    expect(cabecalhos).not.toContain('Motivo')
    expect(cabecalhos).toContain('Status')
    expect(container.textContent).not.toContain('Falta de troco')

    const linha = container.querySelector('tbody tr') as HTMLTableRowElement
    await act(async () => {
      linha.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(container.textContent).toContain('Falta de troco')
  })

  it('status: diferença vira Divergência; sem diferença vira Fechado; retomado ganha chip extra', () => {
    const semDiferenca: CaixaHistoricoLinha = { ...linhaFechada, id: 'c2', diferenca: 0, valorContado: 160, motivo: null }
    const retomado: CaixaHistoricoLinha = { ...semDiferenca, id: 'c3', retomado: true }
    act(() => {
      root.render(
        <CaixasHistoricoTable
          linhas={[linhaFechada, semDiferenca, retomado]}
          erro={null}
          locale="pt-BR"
          labels={labels}
        />,
      )
    })
    const linhas = Array.from(container.querySelectorAll('tbody tr'))
    expect(linhas[0].textContent).toContain('Divergência')
    expect(linhas[0].textContent).not.toContain('Retomado')
    expect(linhas[1].textContent).toContain('Fechado')
    expect(linhas[1].textContent).not.toContain('Divergência')
    expect(linhas[2].textContent).toContain('Retomado')
  })

  it('diferença negativa aparece com sinal (falta) e positiva com "+" (sobra)', () => {
    const sobra: CaixaHistoricoLinha = { ...linhaFechada, id: 'c4', diferenca: 5, valorContado: 165 }
    act(() => {
      root.render(
        <CaixasHistoricoTable linhas={[linhaFechada, sobra]} erro={null} locale="pt-BR" labels={labels} />,
      )
    })
    const linhas = Array.from(container.querySelectorAll('tbody tr'))
    expect(linhas[0].textContent).toMatch(/-\s?R\$\s?10,00/)
    expect(linhas[1].textContent).toMatch(/\+\s?R\$\s?5,00/)
  })

  it('tipo da movimentação em minúsculas (como grava o banco) recebe o rótulo traduzido', async () => {
    listarMovimentacoesCaixaMock.mockResolvedValue({
      ok: true,
      data: [
        { id: 'm9', tipo: 'suprimento', valor: 20, motivo: 'Troco', status: 'aprovado', criadaEm: '2026-09-17T12:00:00Z' },
      ],
    })
    act(() => {
      root.render(
        <CaixasHistoricoTable linhas={[linhaFechada]} erro={null} locale="pt-BR" labels={labels} />,
      )
    })
    const linha = container.querySelector('tbody tr') as HTMLTableRowElement
    await act(async () => {
      linha.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(container.textContent).toContain('Suprimento')
    expect(container.textContent).not.toContain('suprimento')
  })

  it('clicar na linha abre o detalhe e busca as movimentações do turno certo', async () => {
    listarMovimentacoesCaixaMock.mockResolvedValue({
      ok: true,
      data: [
        { id: 'm1', tipo: 'SANGRIA', valor: 50, motivo: 'Pagamento fornecedor', status: 'aprovada', criadaEm: '2026-09-17T12:00:00Z' },
      ],
    })

    act(() => {
      root.render(
        <CaixasHistoricoTable linhas={[linhaFechada]} erro={null} locale="pt-BR" labels={labels} />,
      )
    })

    const linha = container.querySelector('tbody tr') as HTMLTableRowElement
    await act(async () => {
      linha.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(listarMovimentacoesCaixaMock).toHaveBeenCalledWith('caixa-1')
    expect(container.textContent).toContain('Detalhe do turno')
    expect(container.textContent).toContain('Sangria')
    expect(container.textContent).toContain('Pagamento fornecedor')
  })

  it('Escape fecha o detalhe e devolve o scroll do body (mesmo padrão do VendaDetailSheet)', async () => {
    listarMovimentacoesCaixaMock.mockResolvedValue({ ok: true, data: [] })
    act(() => {
      root.render(
        <CaixasHistoricoTable linhas={[linhaFechada]} erro={null} locale="pt-BR" labels={labels} />,
      )
    })
    const linha = container.querySelector('tbody tr') as HTMLTableRowElement
    await act(async () => {
      linha.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
    expect(document.body.style.overflow).toBe('hidden')

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('turno sem movimentações mostra a mensagem certa, não uma lista vazia silenciosa', async () => {
    listarMovimentacoesCaixaMock.mockResolvedValue({ ok: true, data: [] })

    act(() => {
      root.render(
        <CaixasHistoricoTable linhas={[linhaFechada]} erro={null} locale="pt-BR" labels={labels} />,
      )
    })
    const linha = container.querySelector('tbody tr') as HTMLTableRowElement
    await act(async () => {
      linha.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Nenhuma sangria ou suprimento neste turno.')
  })
})
