'use client'

/**
 * ConfiguracoesContent — Sprint 4 / RFC-UX-020
 * PageShell + TabNav URL + FormSection + emitToast (sem banners de sucesso).
 */

import { useRouter } from 'next/navigation'
import { PageShell, SectionCard, TabNav } from '@/components/ui/admin-v2'
import { FormSection } from '@/components/ui/FormSection'
import { InlineAlert } from '@/components/ui/InlineAlert'
import { Button } from '@/components/ui/button'
import { emitToast } from '@/lib/gerente/toast'
import { ROUTES, pathWithQuery } from '@shared-core/navigation/routes'
import type { IdiomaPadrao, LojaConfig, PdvConfig } from '@/app/gerente/configuracoes/actions'
import { atualizarDadosLojaAction, atualizarConfiguracoesPdvAction } from '@/app/gerente/configuracoes/actions'

export type ConfiguracoesLojaLabels = {
  secDados: string
  secContato: string
  secEndereco: string
  secSerieFiscal: string
  nome: string
  cnpj: string
  razaoSocial: string
  nomeFantasia: string
  inscricaoEstadual: string
  cnae: string
  telefone: string
  email: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
  cep: string
  nfce: string
  nfe: string
  phCnpj: string
  phCnae: string
  phCep: string
  sucesso: string
  btnSalvar: string
}

export type ConfiguracoesFiscalLabels = {
  sec: string
  regime: string
  cfop: string
  cst: string
  phCfop: string
  phCst: string
  warnSalveLoja: string
  sucesso: string
  btnSalvar: string
}

export type ConfiguracoesPrefsLabels = {
  sec: string
  idioma: string
  tema: string
  formato: string
  checkLembrete: string
  checkResumo: string
  sucesso: string
  btnSalvar: string
}

export type ConfiguracoesEnumsLabels = {
  regimes: Record<string, string>
  idiomas: Record<string, string>
  temas: Record<string, string>
  formatos: Record<string, string>
}

export type ConfiguracoesLabels = {
  titulo: string
  subtitulo: string
  tabLoja: string
  tabImpostos: string
  tabPreferencias: string
  loja: ConfiguracoesLojaLabels
  fiscal: ConfiguracoesFiscalLabels
  prefs: ConfiguracoesPrefsLabels
  enums: ConfiguracoesEnumsLabels
}

export type ConfigDados = {
  loja: LojaConfig | null
  pdvConfig: PdvConfig | null
}

export type ConfigTab = 'loja' | 'impostos' | 'preferencias'

const REGIMES = ['SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'MEI'] as const
const IDIOMAS = ['pt', 'zh'] as const
const FORMATOS = ['TERMICA', 'A4'] as const

const inputClass =
  'admin-v2-input w-full px-2.5 py-2 text-xs outline-none transition-colors focus:border-jl-accent/50'

function tabHref(tab: ConfigTab): string {
  const p = new URLSearchParams()
  if (tab !== 'loja') p.set('tab', tab)
  return pathWithQuery(ROUTES.admin.configuracoes, p)
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-fg-subtle">{label}</span>
      {children}
    </label>
  )
}

function CheckboxLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-xs text-fg-muted [&_input]:accent-[var(--color-brand)]">
      {children}
    </label>
  )
}

function buildLojaPayload(fd: FormData, dados: ConfigDados): LojaConfig {
  return {
    id: dados.loja?.id,
    nome: String(fd.get('nome') ?? ''),
    cnpj: String(fd.get('cnpj') ?? ''),
    inscricao_estadual: fd.get('inscricao_estadual') ? String(fd.get('inscricao_estadual')) : null,
    telefone: fd.get('telefone') ? String(fd.get('telefone')) : null,
    email: fd.get('email') ? String(fd.get('email')) : null,
    logo_url: fd.get('logo_url') ? String(fd.get('logo_url')) : dados.loja?.logo_url ?? null,
    endereco_logradouro: fd.get('endereco_logradouro') ? String(fd.get('endereco_logradouro')) : null,
    endereco_numero: fd.get('endereco_numero') ? String(fd.get('endereco_numero')) : null,
    endereco_complemento: fd.get('endereco_complemento')
      ? String(fd.get('endereco_complemento'))
      : null,
    endereco_bairro: fd.get('endereco_bairro') ? String(fd.get('endereco_bairro')) : null,
    endereco_cidade: fd.get('endereco_cidade') ? String(fd.get('endereco_cidade')) : null,
    endereco_uf: fd.get('endereco_uf') ? String(fd.get('endereco_uf')) : null,
    endereco_cep: fd.get('endereco_cep') ? String(fd.get('endereco_cep')) : null,
    razao_social: fd.get('razao_social') ? String(fd.get('razao_social')) : null,
    nome_fantasia: fd.get('nome_fantasia') ? String(fd.get('nome_fantasia')) : null,
    cnae: fd.get('cnae') ? String(fd.get('cnae')) : null,
    numero_serie_nfce: Number(fd.get('numero_serie_nfce')) || 1,
    numero_serie_nfe: Number(fd.get('numero_serie_nfe')) || 1,
  }
}

function buildPdvPayload(fd: FormData, dados: ConfigDados): PdvConfig {
  return {
    loja_id: String(fd.get('loja_id') ?? dados.loja?.id ?? ''),
    cfop_padrao: String(fd.get('cfop_padrao') ?? dados.pdvConfig?.cfop_padrao ?? '5102'),
    cst_padrao: String(fd.get('cst_padrao') ?? dados.pdvConfig?.cst_padrao ?? '00'),
    regime_tributario: String(
      fd.get('regime_tributario') ?? dados.pdvConfig?.regime_tributario ?? 'SIMPLES_NACIONAL',
    ) as PdvConfig['regime_tributario'],
    auto_enqueue_fiscal: fd.get('auto_enqueue_fiscal')
      ? fd.get('auto_enqueue_fiscal') === 'on'
      : (dados.pdvConfig?.auto_enqueue_fiscal ?? false),
    idioma_padrao: String(fd.get('idioma_padrao') ?? dados.pdvConfig?.idioma_padrao ?? 'pt') as IdiomaPadrao,
    tema_padrao: String(fd.get('tema_padrao') ?? dados.pdvConfig?.tema_padrao ?? 'noturno') as
      | 'noturno'
      | 'novem',
    imprimir_cupom_auto: fd.get('imprimir_cupom_auto')
      ? fd.get('imprimir_cupom_auto') === 'on'
      : (dados.pdvConfig?.imprimir_cupom_auto ?? false),
    formato_impressao: String(
      fd.get('formato_impressao') ?? dados.pdvConfig?.formato_impressao ?? 'TERMICA',
    ) as 'TERMICA' | 'A4',
  }
}

export function ConfiguracoesContent({
  dados,
  labels,
  tab,
}: {
  dados: ConfigDados
  labels: ConfiguracoesLabels
  tab: ConfigTab
}) {
  const router = useRouter()

  async function handleLojaSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const res = await atualizarDadosLojaAction(buildLojaPayload(fd, dados))
    if (!res.ok) {
      emitToast({ kind: 'error', message: res.error })
      return
    }
    emitToast({ kind: 'success', message: labels.loja.sucesso })
    router.refresh()
  }

  async function handlePdvSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const res = await atualizarConfiguracoesPdvAction(buildPdvPayload(fd, dados))
    if (!res.ok) {
      emitToast({ kind: 'error', message: res.error })
      return
    }
    const msg = tab === 'preferencias' ? labels.prefs.sucesso : labels.fiscal.sucesso
    emitToast({ kind: 'success', message: msg })
    router.refresh()
  }

  return (
    <PageShell title={labels.titulo} subtitle={labels.subtitulo}>
      <TabNav
        aria-label={labels.titulo}
        value={tab}
        items={[
          { id: 'loja', label: labels.tabLoja, href: tabHref('loja') },
          { id: 'impostos', label: labels.tabImpostos, href: tabHref('impostos') },
          { id: 'preferencias', label: labels.tabPreferencias, href: tabHref('preferencias') },
        ]}
      />

      {tab === 'loja' ? (
        <SectionCard title={labels.loja.secDados}>
          <form onSubmit={(e) => void handleLojaSubmit(e)} className="space-y-6">
            <FormSection title={labels.loja.secDados} dense>
              <FormField label={labels.loja.nome}>
                <input name="nome" type="text" defaultValue={dados.loja?.nome ?? ''} className={inputClass} required />
              </FormField>
              <FormField label={labels.loja.cnpj}>
                <input
                  name="cnpj"
                  type="text"
                  defaultValue={dados.loja?.cnpj ?? ''}
                  placeholder={labels.loja.phCnpj}
                  className={inputClass}
                  required
                />
              </FormField>
              <FormField label={labels.loja.razaoSocial}>
                <input name="razao_social" type="text" defaultValue={dados.loja?.razao_social ?? ''} className={inputClass} />
              </FormField>
              <FormField label={labels.loja.nomeFantasia}>
                <input name="nome_fantasia" type="text" defaultValue={dados.loja?.nome_fantasia ?? ''} className={inputClass} />
              </FormField>
              <FormField label={labels.loja.inscricaoEstadual}>
                <input
                  name="inscricao_estadual"
                  type="text"
                  defaultValue={dados.loja?.inscricao_estadual ?? ''}
                  className={inputClass}
                />
              </FormField>
              <FormField label={labels.loja.cnae}>
                <input
                  name="cnae"
                  type="text"
                  defaultValue={dados.loja?.cnae ?? ''}
                  placeholder={labels.loja.phCnae}
                  className={inputClass}
                />
              </FormField>
            </FormSection>

            <FormSection title={labels.loja.secContato} dense>
              <FormField label={labels.loja.telefone}>
                <input name="telefone" type="tel" defaultValue={dados.loja?.telefone ?? ''} className={inputClass} />
              </FormField>
              <FormField label={labels.loja.email}>
                <input name="email" type="email" defaultValue={dados.loja?.email ?? ''} className={inputClass} />
              </FormField>
            </FormSection>

            <FormSection title={labels.loja.secEndereco} dense>
              <FormField label={labels.loja.logradouro}>
                <input
                  name="endereco_logradouro"
                  type="text"
                  defaultValue={dados.loja?.endereco_logradouro ?? ''}
                  className={inputClass}
                />
              </FormField>
              <FormField label={labels.loja.numero}>
                <input name="endereco_numero" type="text" defaultValue={dados.loja?.endereco_numero ?? ''} className={inputClass} />
              </FormField>
              <FormField label={labels.loja.complemento}>
                <input
                  name="endereco_complemento"
                  type="text"
                  defaultValue={dados.loja?.endereco_complemento ?? ''}
                  className={inputClass}
                />
              </FormField>
              <FormField label={labels.loja.bairro}>
                <input name="endereco_bairro" type="text" defaultValue={dados.loja?.endereco_bairro ?? ''} className={inputClass} />
              </FormField>
              <FormField label={labels.loja.cidade}>
                <input name="endereco_cidade" type="text" defaultValue={dados.loja?.endereco_cidade ?? ''} className={inputClass} />
              </FormField>
              <FormField label={labels.loja.uf}>
                <input name="endereco_uf" type="text" defaultValue={dados.loja?.endereco_uf ?? ''} maxLength={2} className={inputClass} />
              </FormField>
              <FormField label={labels.loja.cep}>
                <input
                  name="endereco_cep"
                  type="text"
                  defaultValue={dados.loja?.endereco_cep ?? ''}
                  placeholder={labels.loja.phCep}
                  className={inputClass}
                />
              </FormField>
            </FormSection>

            <FormSection title={labels.loja.secSerieFiscal} dense>
              <FormField label={labels.loja.nfce}>
                <input
                  name="numero_serie_nfce"
                  type="number"
                  min="1"
                  max="999"
                  defaultValue={dados.loja?.numero_serie_nfce ?? 1}
                  className={inputClass}
                />
              </FormField>
              <FormField label={labels.loja.nfe}>
                <input
                  name="numero_serie_nfe"
                  type="number"
                  min="1"
                  max="999"
                  defaultValue={dados.loja?.numero_serie_nfe ?? 1}
                  className={inputClass}
                />
              </FormField>
            </FormSection>

            <Button type="submit">{labels.loja.btnSalvar}</Button>
          </form>
        </SectionCard>
      ) : null}

      {tab === 'impostos' ? (
        <SectionCard title={labels.fiscal.sec}>
          <form onSubmit={(e) => void handlePdvSubmit(e)} className="space-y-4">
            {!dados.loja?.id ? (
              <InlineAlert tone="warning">{labels.fiscal.warnSalveLoja}</InlineAlert>
            ) : null}

            <input type="hidden" name="loja_id" value={dados.loja?.id ?? ''} />
            <input type="hidden" name="idioma_padrao" value={dados.pdvConfig?.idioma_padrao ?? 'pt'} />
            <input type="hidden" name="tema_padrao" value={dados.pdvConfig?.tema_padrao ?? 'noturno'} />
            <input type="hidden" name="formato_impressao" value={dados.pdvConfig?.formato_impressao ?? 'TERMICA'} />
            <input
              type="hidden"
              name="auto_enqueue_fiscal"
              value={dados.pdvConfig?.auto_enqueue_fiscal ? 'on' : 'off'}
            />
            <input
              type="hidden"
              name="imprimir_cupom_auto"
              value={dados.pdvConfig?.imprimir_cupom_auto ? 'on' : 'off'}
            />

            <FormSection title={labels.fiscal.sec} dense>
              <FormField label={labels.fiscal.regime}>
                <select
                  name="regime_tributario"
                  defaultValue={dados.pdvConfig?.regime_tributario ?? 'SIMPLES_NACIONAL'}
                  className={inputClass}
                >
                  {REGIMES.map((r) => (
                    <option key={r} value={r}>
                      {labels.enums.regimes[r] ?? r}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label={labels.fiscal.cfop}>
                <input
                  name="cfop_padrao"
                  type="text"
                  defaultValue={dados.pdvConfig?.cfop_padrao ?? '5102'}
                  placeholder={labels.fiscal.phCfop}
                  className={inputClass}
                  required
                />
              </FormField>
              <FormField label={labels.fiscal.cst}>
                <input
                  name="cst_padrao"
                  type="text"
                  defaultValue={dados.pdvConfig?.cst_padrao ?? '00'}
                  placeholder={labels.fiscal.phCst}
                  maxLength={2}
                  className={inputClass}
                  required
                />
              </FormField>
            </FormSection>

            <Button type="submit" disabled={!dados.loja?.id}>
              {labels.fiscal.btnSalvar}
            </Button>
          </form>
        </SectionCard>
      ) : null}

      {tab === 'preferencias' ? (
        <SectionCard title={labels.prefs.sec}>
          <form onSubmit={(e) => void handlePdvSubmit(e)} className="space-y-4">
            <input type="hidden" name="loja_id" value={dados.loja?.id ?? ''} />
            <input
              type="hidden"
              name="regime_tributario"
              value={dados.pdvConfig?.regime_tributario ?? 'SIMPLES_NACIONAL'}
            />
            <input type="hidden" name="cfop_padrao" value={dados.pdvConfig?.cfop_padrao ?? '5102'} />
            <input type="hidden" name="cst_padrao" value={dados.pdvConfig?.cst_padrao ?? '00'} />
            <input type="hidden" name="tema_padrao" value={dados.pdvConfig?.tema_padrao ?? 'noturno'} />
            <input
              type="hidden"
              name="auto_enqueue_fiscal"
              value={dados.pdvConfig?.auto_enqueue_fiscal ? 'on' : 'off'}
            />
            <input
              type="hidden"
              name="imprimir_cupom_auto"
              value={dados.pdvConfig?.imprimir_cupom_auto ? 'on' : 'off'}
            />

            <FormSection title={labels.prefs.sec} dense>
              <FormField label={labels.prefs.idioma}>
                <select name="idioma_padrao" defaultValue={dados.pdvConfig?.idioma_padrao ?? 'pt'} className={inputClass}>
                  {IDIOMAS.map((i) => (
                    <option key={i} value={i}>
                      {labels.enums.idiomas[i] ?? i}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label={labels.prefs.formato}>
                <select
                  name="formato_impressao"
                  defaultValue={dados.pdvConfig?.formato_impressao ?? 'TERMICA'}
                  className={inputClass}
                >
                  {FORMATOS.map((f) => (
                    <option key={f} value={f}>
                      {labels.enums.formatos[f] ?? f}
                    </option>
                  ))}
                </select>
              </FormField>
            </FormSection>

            <div className="space-y-2">
              <CheckboxLabel>
                <input type="checkbox" disabled />
                {labels.prefs.checkLembrete}
              </CheckboxLabel>
              <CheckboxLabel>
                <input type="checkbox" disabled />
                {labels.prefs.checkResumo}
              </CheckboxLabel>
            </div>

            <Button type="submit" disabled={!dados.loja?.id}>
              {labels.prefs.btnSalvar}
            </Button>
          </form>
        </SectionCard>
      ) : null}
    </PageShell>
  )
}
