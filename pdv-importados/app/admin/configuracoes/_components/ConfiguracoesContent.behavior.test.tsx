/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('@/app/gerente/configuracoes/actions', () => ({
  atualizarDadosLojaAction: vi.fn(),
  atualizarConfiguracoesPdvAction: vi.fn(),
}))

import { ConfiguracoesContent, type ConfiguracoesLabels, type ConfigDados } from './ConfiguracoesContent'
import { AdminV2SessionProvider } from '@/components/ui/admin-v2/AdminV2SessionContext'

const LABELS: ConfiguracoesLabels = {
  titulo: 'Configurações',
  subtitulo: 'Dados da loja e PDV',
  tabLoja: 'Loja',
  tabImpostos: 'Impostos',
  tabPreferencias: 'Preferências',
  loja: {
    secDados: 'Dados', secContato: 'Contato', secEndereco: 'Endereço', secSerieFiscal: 'Série fiscal',
    nome: 'Nome', cnpj: 'CNPJ', razaoSocial: 'Razão social', nomeFantasia: 'Nome fantasia',
    inscricaoEstadual: 'IE', cnae: 'CNAE', telefone: 'Telefone', email: 'E-mail',
    logradouro: 'Logradouro', numero: 'Número', complemento: 'Complemento', bairro: 'Bairro',
    cidade: 'Cidade', uf: 'UF', cep: 'CEP', nfce: 'NFC-e', nfe: 'NF-e',
    phCnpj: '', phCnae: '', phCep: '', sucesso: 'Salvo', btnSalvar: 'Salvar',
  },
  fiscal: {
    sec: 'Fiscal', regime: 'Regime', cfop: 'CFOP', cst: 'CST', phCfop: '', phCst: '',
    warnSalveLoja: 'Salve a loja antes', sucesso: 'Salvo', btnSalvar: 'Salvar',
  },
  prefs: {
    sec: 'Preferências', idioma: 'Idioma', formato: 'Formato',
    checkLembrete: 'Lembrete', checkResumo: 'Resumo', sucesso: 'Salvo', btnSalvar: 'Salvar',
  },
  enums: {
    regimes: {}, idiomas: {}, formatos: {},
  },
}

const DADOS_VAZIOS: ConfigDados = { loja: null, pdvConfig: null }

let container: HTMLDivElement
let root: Root

function render(ui: React.ReactElement) {
  act(() => {
    root.render(<AdminV2SessionProvider idioma="pt">{ui}</AdminV2SessionProvider>)
  })
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
})

describe('ConfiguracoesContent — loadError honesto', () => {
  it('mostra o alerta de falha real e desabilita o Salvar da aba Loja quando loadError está presente', () => {
    render(<ConfiguracoesContent dados={DADOS_VAZIOS} loadError="Não foi possível carregar os dados da loja/PDV." labels={LABELS} />)

    const alerta = container.querySelector('[role="alert"]')
    expect(alerta).not.toBeNull()
    expect(alerta?.textContent).toContain('Não foi possível carregar')

    const botaoSalvar = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Salvar' && b.type === 'submit')
    expect(botaoSalvar?.disabled).toBe(true)
  })

  it('sem loadError, não mostra alerta e o Salvar da aba Loja fica habilitado', () => {
    render(<ConfiguracoesContent dados={DADOS_VAZIOS} loadError={null} labels={LABELS} />)
    expect(container.querySelector('[role="alert"]')).toBeNull()

    const botaoSalvar = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Salvar' && b.type === 'submit')
    expect(botaoSalvar?.disabled).toBe(false)
  })
})

describe('ConfiguracoesContent — tema_padrao (decisão: remover UI morta)', () => {
  it('não renderiza nenhum campo de tema visível (label/select) — só o hidden input que preserva o valor atual', () => {
    render(<ConfiguracoesContent dados={DADOS_VAZIOS} loadError={null} labels={LABELS} />)

    const tabPreferencias = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Preferências')
    act(() => {
      tabPreferencias?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).not.toContain('Tema')

    const hidden = container.querySelector('input[type="hidden"][name="tema_padrao"]') as HTMLInputElement | null
    expect(hidden).not.toBeNull()
    expect(hidden?.value).toBe('noturno')
  })
})
