/** @vitest-environment jsdom */
/**
 * N-03 — trocar de aba com alterações não salvas usava window.confirm()
 * nativo. Prova que agora é um modal do próprio app: sem alteração, a troca
 * é direta; com alteração pendente, abre o modal, nunca window.confirm;
 * "Não" mantém a aba e os dados; "Sim" troca de aba e descarta a edição.
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import { AdminV2SessionProvider } from '@/components/ui/admin-v2/AdminV2SessionContext'
import { ConfiguracoesContent, type ConfiguracoesLabels } from './ConfiguracoesContent'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('@/app/gerente/configuracoes/actions', async () => {
  const actual = await vi.importActual<typeof import('@/app/gerente/configuracoes/actions')>(
    '@/app/gerente/configuracoes/actions',
  )
  return {
    ...actual,
    atualizarDadosLojaAction: vi.fn(),
    atualizarConfiguracoesPdvAction: vi.fn(),
    uploadLogoLojaAction: vi.fn(),
  }
})

const m = getMessages('pt')
const ui = m.admin_ui

const labels: ConfiguracoesLabels = {
  titulo: ui.configuracoes_titulo,
  subtitulo: ui.configuracoes_subtitulo,
  subtituloLoja: ui.configuracoes_subtitulo_loja,
  subtituloImpostos: ui.configuracoes_subtitulo_impostos,
  subtituloPreferencias: ui.configuracoes_subtitulo_preferencias,
  tabsAria: ui.configuracoes_tabs_aria,
  unsavedWarn: ui.configuracoes_unsaved_warn,
  salvando: ui.configuracoes_salvando,
  tabLoja: ui.configuracoes_tab_loja,
  tabImpostos: ui.configuracoes_tab_impostos,
  tabPreferencias: ui.configuracoes_tab_preferencias,
  sim: m.comum.sim,
  nao: m.comum.nao,
  fechar: m.comum.fechar,
  loja: {
    secDados: ui.configuracoes_loja_sec_dados,
    secIdentidade: ui.configuracoes_loja_sec_identidade,
    secContato: ui.configuracoes_loja_sec_contato,
    secEndereco: ui.configuracoes_loja_sec_endereco,
    secSerieFiscal: ui.configuracoes_loja_sec_serie_fiscal,
    hintIdentidade: ui.configuracoes_loja_hint_identidade,
    hintEndereco: ui.configuracoes_loja_hint_endereco,
    hintSerie: ui.configuracoes_loja_hint_serie,
    nome: ui.configuracoes_loja_nome,
    cnpj: ui.configuracoes_loja_cnpj,
    razaoSocial: ui.configuracoes_loja_razao_social,
    nomeFantasia: ui.configuracoes_loja_nome_fantasia,
    inscricaoEstadual: ui.configuracoes_loja_inscricao_estadual,
    cnae: ui.configuracoes_loja_cnae,
    hintCnae: ui.configuracoes_loja_hint_cnae,
    telefone: ui.configuracoes_loja_telefone,
    email: ui.configuracoes_loja_email,
    logradouro: ui.configuracoes_loja_logradouro,
    numero: ui.configuracoes_loja_numero,
    complemento: ui.configuracoes_loja_complemento,
    bairro: ui.configuracoes_loja_bairro,
    cidade: ui.configuracoes_loja_cidade,
    uf: ui.configuracoes_loja_uf,
    cep: ui.configuracoes_loja_cep,
    nfce: ui.configuracoes_loja_nfce,
    nfe: ui.configuracoes_loja_nfe,
    logo: ui.configuracoes_loja_logo,
    hintLogo: ui.configuracoes_loja_hint_logo,
    btnUploadLogo: ui.configuracoes_loja_btn_upload_logo,
    removerLogo: ui.configuracoes_loja_remover_logo,
    logoPreviewAlt: ui.configuracoes_loja_logo_preview_alt,
    phCnpj: ui.configuracoes_loja_ph_cnpj,
    phCnae: ui.configuracoes_loja_ph_cnae,
    phCep: ui.configuracoes_loja_ph_cep,
    phTel: ui.configuracoes_loja_ph_tel,
    sucesso: ui.configuracoes_loja_sucesso,
    btnSalvar: ui.configuracoes_loja_btn_salvar,
  },
  fiscal: {
    sec: ui.configuracoes_fiscal_sec,
    hint: ui.configuracoes_fiscal_hint,
    regime: ui.configuracoes_fiscal_regime,
    cfop: ui.configuracoes_fiscal_cfop,
    cst: ui.configuracoes_fiscal_cst,
    hintCfop: ui.configuracoes_fiscal_hint_cfop,
    hintCst: ui.configuracoes_fiscal_hint_cst,
    autoFiscal: ui.configuracoes_fiscal_auto,
    hintAutoFiscal: ui.configuracoes_fiscal_hint_auto,
    phCfop: ui.configuracoes_fiscal_ph_cfop,
    warnSalveLoja: ui.configuracoes_fiscal_warn_salve_loja,
    sucesso: ui.configuracoes_fiscal_sucesso,
    btnSalvar: ui.configuracoes_fiscal_btn_salvar,
  },
  prefs: {
    sec: ui.configuracoes_prefs_sec,
    hint: ui.configuracoes_prefs_hint,
    idioma: ui.configuracoes_prefs_idioma,
    formato: ui.configuracoes_prefs_formato,
    imprimirAuto: ui.configuracoes_prefs_imprimir_auto,
    hintImprimirAuto: ui.configuracoes_prefs_hint_imprimir_auto,
    sucesso: ui.configuracoes_prefs_sucesso,
    btnSalvar: ui.configuracoes_prefs_btn_salvar,
  },
  enums: {
    regimes: {
      SIMPLES_NACIONAL: ui.configuracoes_enum_regime_simples,
      LUCRO_PRESUMIDO: ui.configuracoes_enum_regime_lucro_presumido,
      LUCRO_REAL: ui.configuracoes_enum_regime_lucro_real,
      MEI: ui.configuracoes_enum_regime_mei,
    },
    idiomas: { pt: ui.configuracoes_enum_idioma_pt, zh: ui.configuracoes_enum_idioma_zh },
    formatos: { TERMICA: ui.configuracoes_enum_formato_termica, A4: ui.configuracoes_enum_formato_a4 },
  },
}

let container: HTMLDivElement
let root: Root
let confirmSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  confirmSpy = vi.spyOn(window, 'confirm')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  confirmSpy.mockRestore()
})

function render() {
  act(() => {
    root.render(
      <AdminV2SessionProvider idioma="pt">
        <ConfiguracoesContent dados={{ loja: null, pdvConfig: null }} labels={labels} />
      </AdminV2SessionProvider>,
    )
  })
}

function editarNomeLoja(valor: string) {
  const input = container.querySelector('#loja-nome') as HTMLInputElement
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, valor)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function clicarAba(id: string) {
  const btn = container.querySelector(`#${id}`) as HTMLButtonElement
  act(() => btn.click())
}

describe('ConfiguracoesContent — confirmação de troca de aba (N-03)', () => {
  it('sem alterações, troca de aba é direta — sem modal, sem window.confirm', () => {
    render()
    clicarAba('config-tab-impostos')

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(container.querySelector('#config-panel-impostos')).toBeTruthy()
  })

  it('com alterações pendentes, trocar de aba abre modal do app, nunca window.confirm', () => {
    render()
    editarNomeLoja('Loja Nova')
    clicarAba('config-tab-impostos')

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(container.querySelector('#config-panel-impostos')).toBeFalsy()
    expect(container.textContent).toContain(labels.unsavedWarn)
  })

  it('"Não" mantém a aba atual e os dados digitados', () => {
    render()
    editarNomeLoja('Loja Nova')
    clicarAba('config-tab-impostos')

    const btnNao = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === labels.nao,
    ) as HTMLButtonElement
    act(() => btnNao.click())

    expect(container.querySelector('#config-panel-loja')).toBeTruthy()
    expect((container.querySelector('#loja-nome') as HTMLInputElement).value).toBe('Loja Nova')
  })

  it('"Sim" troca de aba de fato, descartando a edição', () => {
    render()
    editarNomeLoja('Loja Nova')
    clicarAba('config-tab-impostos')

    const btnSim = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === labels.sim,
    ) as HTMLButtonElement
    act(() => btnSim.click())

    expect(container.querySelector('#config-panel-impostos')).toBeTruthy()
  })
})
