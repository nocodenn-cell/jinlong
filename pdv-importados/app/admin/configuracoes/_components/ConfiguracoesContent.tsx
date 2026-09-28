'use client'

/**
 * FastProduct Admin — ConfiguracoesContent
 *
 * 3 abas: Loja · Impostos e fiscal · Preferências.
 * UI local com primitivos DS; actions existentes de /gerente/configuracoes.
 */

import { Fragment, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, X } from 'lucide-react'
import { PageHeader, SectionCard } from '@/components/ui/admin-v2'
import { Button } from '@/components/ui/button'
import { DragonModal } from '@/components/ui/DragonModal'
import { Field, Input, Select, Switch } from '@/components/ui/forms'
import { ErrorState } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'
import type { IdiomaPadrao, LojaConfig, PdvConfig, RegimeTributario } from '@/app/gerente/configuracoes/actions'
import {
  atualizarDadosLojaAction,
  atualizarConfiguracoesPdvAction,
  uploadLogoLojaAction,
} from '@/app/gerente/configuracoes/actions'
import { ConfigSection } from './ConfigSection'
import { CSTS_COMUNS, UFS_BR, digitsOnly, maskCep, maskCnpj, maskTel } from '../_lib/configMasks'

export type ConfiguracoesLojaLabels = {
  secDados: string
  secIdentidade: string
  secContato: string
  secEndereco: string
  secSerieFiscal: string
  hintIdentidade: string
  hintEndereco: string
  hintSerie: string
  nome: string
  cnpj: string
  razaoSocial: string
  nomeFantasia: string
  inscricaoEstadual: string
  cnae: string
  hintCnae: string
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
  logo: string
  hintLogo: string
  btnUploadLogo: string
  removerLogo: string
  logoPreviewAlt: string
  phCnpj: string
  phCnae: string
  phCep: string
  phTel: string
  sucesso: string
  btnSalvar: string
}

export type ConfiguracoesFiscalLabels = {
  sec: string
  hint: string
  regime: string
  cfop: string
  cst: string
  hintCfop: string
  hintCst: string
  autoFiscal: string
  hintAutoFiscal: string
  phCfop: string
  warnSalveLoja: string
  sucesso: string
  btnSalvar: string
}

export type ConfiguracoesPrefsLabels = {
  sec: string
  hint: string
  idioma: string
  formato: string
  imprimirAuto: string
  hintImprimirAuto: string
  sucesso: string
  btnSalvar: string
}

export type ConfiguracoesEnumsLabels = {
  regimes: Record<string, string>
  idiomas: Record<string, string>
  formatos: Record<string, string>
}

export type ConfiguracoesLabels = {
  titulo: string
  subtitulo: string
  subtituloLoja: string
  subtituloImpostos: string
  subtituloPreferencias: string
  tabsAria: string
  unsavedWarn: string
  salvando: string
  tabLoja: string
  tabImpostos: string
  tabPreferencias: string
  sim: string
  nao: string
  fechar: string
  loja: ConfiguracoesLojaLabels
  fiscal: ConfiguracoesFiscalLabels
  prefs: ConfiguracoesPrefsLabels
  enums: ConfiguracoesEnumsLabels
}

export type ConfigDados = {
  loja: LojaConfig | null
  pdvConfig: PdvConfig | null
}

type Aba = 'loja' | 'impostos' | 'preferencias'

const REGIMES = ['SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'MEI'] as const
const IDIOMAS = ['pt', 'zh'] as const
const FORMATOS = ['TERMICA', 'A4'] as const

function emptyLoja(): LojaConfig {
  return {
    nome: '',
    cnpj: '',
    inscricao_estadual: null,
    telefone: null,
    email: null,
    logo_url: null,
    endereco_logradouro: null,
    endereco_numero: null,
    endereco_complemento: null,
    endereco_bairro: null,
    endereco_cidade: null,
    endereco_uf: 'SP',
    endereco_cep: null,
    razao_social: null,
    nome_fantasia: null,
    cnae: null,
    numero_serie_nfce: 1,
    numero_serie_nfe: 1,
  }
}

function emptyPdv(lojaId: string): PdvConfig {
  return {
    loja_id: lojaId,
    cfop_padrao: '5102',
    cst_padrao: '00',
    regime_tributario: 'SIMPLES_NACIONAL',
    auto_enqueue_fiscal: false,
    idioma_padrao: 'pt',
    tema_padrao: 'noturno',
    imprimir_cupom_auto: false,
    formato_impressao: 'TERMICA',
  }
}

function snapshot(value: unknown): string {
  return JSON.stringify(value)
}

export function ConfiguracoesContent({ dados, labels }: { dados: ConfigDados; labels: ConfiguracoesLabels }) {
  const router = useRouter()
  const [abaAtiva, setAbaAtiva] = useState<Aba>('loja')
  const [loja, setLoja] = useState<LojaConfig>(() => dados.loja ?? emptyLoja())
  const [pdv, setPdv] = useState<PdvConfig>(() => dados.pdvConfig ?? emptyPdv(dados.loja?.id ?? ''))
  const [lojaBaseline, setLojaBaseline] = useState(() => snapshot(dados.loja ?? emptyLoja()))
  const [pdvBaseline, setPdvBaseline] = useState(() => snapshot(dados.pdvConfig ?? emptyPdv(dados.loja?.id ?? '')))

  const [lojaErro, setLojaErro] = useState<string | null>(null)
  const [lojaSucesso, setLojaSucesso] = useState(false)
  const [pdvErro, setPdvErro] = useState<string | null>(null)
  const [pdvSucesso, setPdvSucesso] = useState(false)
  const [salvandoLoja, setSalvandoLoja] = useState(false)
  const [salvandoPdv, setSalvandoPdv] = useState(false)
  const [uploadandoLogo, setUploadandoLogo] = useState(false)

  useEffect(() => {
    const nextLoja = dados.loja ?? emptyLoja()
    const nextPdv = dados.pdvConfig ?? emptyPdv(dados.loja?.id ?? '')
    setLoja(nextLoja)
    setPdv(nextPdv)
    setLojaBaseline(snapshot(nextLoja))
    setPdvBaseline(snapshot(nextPdv))
  }, [dados.loja, dados.pdvConfig])

  const lojaDirty = snapshot(loja) !== lojaBaseline
  const pdvDirty = snapshot(pdv) !== pdvBaseline
  const dirty = abaAtiva === 'loja' ? lojaDirty : pdvDirty

  const subtitulo = useMemo(() => {
    if (abaAtiva === 'impostos') return labels.subtituloImpostos
    if (abaAtiva === 'preferencias') return labels.subtituloPreferencias
    return labels.subtituloLoja
  }, [abaAtiva, labels])

  const tabLabels: Record<Aba, string> = {
    loja: labels.tabLoja,
    impostos: labels.tabImpostos,
    preferencias: labels.tabPreferencias,
  }

  const [pendingAba, setPendingAba] = useState<Aba | null>(null)

  const aplicarTrocaAba = (next: Aba) => {
    setLojaErro(null)
    setPdvErro(null)
    setLojaSucesso(false)
    setPdvSucesso(false)
    setAbaAtiva(next)
  }

  const selectAba = (next: Aba): boolean => {
    if (next === abaAtiva) return false
    if (dirty) {
      setPendingAba(next)
      return false
    }
    aplicarTrocaAba(next)
    return true
  }

  const confirmarTrocaAba = () => {
    if (!pendingAba) return
    const next = pendingAba
    setPendingAba(null)
    aplicarTrocaAba(next)
    requestAnimationFrame(() => {
      document.getElementById(`config-tab-${next}`)?.focus()
    })
  }

  const salvarLoja = async () => {
    setSalvandoLoja(true)
    setLojaErro(null)
    setLojaSucesso(false)
    try {
      const res = await atualizarDadosLojaAction(loja)
      if (!res.ok) {
        setLojaErro(res.error)
        return
      }
      setLoja(res.loja)
      setLojaBaseline(snapshot(res.loja))
      setPdv((prev) => ({ ...prev, loja_id: res.loja.id ?? prev.loja_id }))
      setLojaSucesso(true)
      router.refresh()
      window.setTimeout(() => setLojaSucesso(false), 3000)
    } finally {
      setSalvandoLoja(false)
    }
  }

  const salvarPdv = async () => {
    setSalvandoPdv(true)
    setPdvErro(null)
    setPdvSucesso(false)
    try {
      const payload: PdvConfig = {
        ...pdv,
        loja_id: pdv.loja_id || loja.id || '',
      }
      const res = await atualizarConfiguracoesPdvAction(payload)
      if (!res.ok) {
        setPdvErro(res.error)
        return
      }
      setPdv(res.config)
      setPdvBaseline(snapshot(res.config))
      setPdvSucesso(true)
      router.refresh()
      window.setTimeout(() => setPdvSucesso(false), 3000)
    } finally {
      setSalvandoPdv(false)
    }
  }

  const uploadLogo = async (file: File) => {
    setUploadandoLogo(true)
    setLojaErro(null)
    try {
      const fd = new FormData()
      fd.set('file', file)
      const res = await uploadLogoLojaAction(fd)
      if (!res.ok) {
        setLojaErro(res.error)
        return
      }
      setLoja((prev) => ({ ...prev, logo_url: res.url }))
    } finally {
      setUploadandoLogo(false)
    }
  }

  return (
    <Fragment>
    <div className="admin-v2-page mx-auto max-w-4xl">
      <PageHeader title={labels.titulo} subtitle={subtitulo} />

      <div
        role="tablist"
        aria-label={labels.tabsAria}
        className="mb-6 flex flex-wrap gap-2 border-b border-[var(--color-border-secondary)] pb-3"
      >
        {(['loja', 'impostos', 'preferencias'] as const).map((aba) => {
          const selected = abaAtiva === aba
          return (
            <button
              key={aba}
              type="button"
              role="tab"
              id={`config-tab-${aba}`}
              aria-selected={selected}
              aria-controls={`config-panel-${aba}`}
              tabIndex={selected ? 0 : -1}
              data-active={selected}
              onClick={() => selectAba(aba)}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
                e.preventDefault()
                const order: Aba[] = ['loja', 'impostos', 'preferencias']
                const idx = order.indexOf(abaAtiva)
                const next = e.key === 'ArrowRight'
                  ? order[(idx + 1) % order.length]
                  : order[(idx - 1 + order.length) % order.length]
                if (selectAba(next)) {
                  requestAnimationFrame(() => {
                    document.getElementById(`config-tab-${next}`)?.focus()
                  })
                }
              }}
              className={cn(
                'admin-v2-tab-pill text-small font-medium',
                selected ? 'border-jl-accent text-jl-fg-1' : 'text-jl-fg-3 hover:text-jl-fg-2',
              )}
            >
              {tabLabels[aba]}
            </button>
          )
        })}
      </div>

      {abaAtiva === 'loja' && (
        <SectionCard title={labels.loja.secDados}>
          <form
            id="config-panel-loja"
            role="tabpanel"
            aria-labelledby="config-tab-loja"
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              void salvarLoja()
            }}
          >
            <ConfigSection title={labels.loja.secIdentidade} hint={labels.loja.hintIdentidade}>
              <div className="flex flex-wrap items-center gap-4">
                {loja.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={loja.logo_url}
                    alt={labels.loja.logoPreviewAlt}
                    className="h-20 w-20 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-background-secondary)] object-contain p-1.5"
                  />
                ) : (
                  <div
                    className="flex h-20 w-20 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-background-secondary)] text-h3 text-fg-subtle"
                    aria-hidden
                  >
                    —
                  </div>
                )}
                <div className="space-y-1.5">
                  <span className="text-small font-medium text-fg">{labels.loja.logo}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-background-secondary)] px-3 py-2 text-small font-medium text-fg hover:border-[var(--color-brand-primary)]">
                      <Upload className="h-3.5 w-3.5" aria-hidden />
                      {uploadandoLogo ? labels.salvando : labels.loja.btnUploadLogo}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml"
                        className="sr-only"
                        disabled={uploadandoLogo}
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) void uploadLogo(f)
                          e.target.value = ''
                        }}
                      />
                    </label>
                    {loja.logo_url ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-caption text-fg-subtle hover:text-[var(--color-danger)]"
                        onClick={() => setLoja((prev) => ({ ...prev, logo_url: null }))}
                      >
                        <X className="h-3 w-3" aria-hidden />
                        {labels.loja.removerLogo}
                      </button>
                    ) : null}
                  </div>
                  <p className="text-caption text-fg-subtle">{labels.loja.hintLogo}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field id="loja-nome" label={labels.loja.nome} required>
                  <Input
                    value={loja.nome}
                    maxLength={120}
                    required
                    onChange={(e) => setLoja({ ...loja, nome: e.target.value })}
                  />
                </Field>
                <Field id="loja-cnpj" label={labels.loja.cnpj} required>
                  <Input
                    value={maskCnpj(loja.cnpj)}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={labels.loja.phCnpj}
                    required
                    className="font-mono"
                    onChange={(e) => setLoja({ ...loja, cnpj: digitsOnly(e.target.value, 14) })}
                  />
                </Field>
                <Field id="loja-razao" label={labels.loja.razaoSocial}>
                  <Input
                    value={loja.razao_social ?? ''}
                    onChange={(e) => setLoja({ ...loja, razao_social: e.target.value || null })}
                  />
                </Field>
                <Field id="loja-fantasia" label={labels.loja.nomeFantasia}>
                  <Input
                    value={loja.nome_fantasia ?? ''}
                    onChange={(e) => setLoja({ ...loja, nome_fantasia: e.target.value || null })}
                  />
                </Field>
                <Field id="loja-ie" label={labels.loja.inscricaoEstadual}>
                  <Input
                    value={loja.inscricao_estadual ?? ''}
                    className="font-mono"
                    onChange={(e) => setLoja({ ...loja, inscricao_estadual: e.target.value || null })}
                  />
                </Field>
                <Field id="loja-cnae" label={labels.loja.cnae} hint={labels.loja.hintCnae}>
                  <Input
                    value={loja.cnae ?? ''}
                    inputMode="numeric"
                    maxLength={7}
                    placeholder={labels.loja.phCnae}
                    className="font-mono"
                    onChange={(e) => setLoja({ ...loja, cnae: digitsOnly(e.target.value, 7) || null })}
                  />
                </Field>
              </div>
            </ConfigSection>

            <ConfigSection title={labels.loja.secContato}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field id="loja-tel" label={labels.loja.telefone}>
                  <Input
                    type="tel"
                    value={maskTel(loja.telefone ?? '')}
                    inputMode="tel"
                    placeholder={labels.loja.phTel}
                    onChange={(e) => setLoja({ ...loja, telefone: digitsOnly(e.target.value, 11) || null })}
                  />
                </Field>
                <Field id="loja-email" label={labels.loja.email}>
                  <Input
                    type="email"
                    value={loja.email ?? ''}
                    onChange={(e) => setLoja({ ...loja, email: e.target.value || null })}
                  />
                </Field>
              </div>
            </ConfigSection>

            <ConfigSection title={labels.loja.secEndereco} hint={labels.loja.hintEndereco}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr_100px]">
                <Field id="loja-cep" label={labels.loja.cep}>
                  <Input
                    value={maskCep(loja.endereco_cep ?? '')}
                    inputMode="numeric"
                    placeholder={labels.loja.phCep}
                    className="font-mono"
                    onChange={(e) => setLoja({ ...loja, endereco_cep: digitsOnly(e.target.value, 8) || null })}
                  />
                </Field>
                <Field id="loja-logradouro" label={labels.loja.logradouro}>
                  <Input
                    value={loja.endereco_logradouro ?? ''}
                    onChange={(e) => setLoja({ ...loja, endereco_logradouro: e.target.value || null })}
                  />
                </Field>
                <Field id="loja-numero" label={labels.loja.numero}>
                  <Input
                    value={loja.endereco_numero ?? ''}
                    onChange={(e) => setLoja({ ...loja, endereco_numero: e.target.value || null })}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field id="loja-complemento" label={labels.loja.complemento}>
                  <Input
                    value={loja.endereco_complemento ?? ''}
                    onChange={(e) => setLoja({ ...loja, endereco_complemento: e.target.value || null })}
                  />
                </Field>
                <Field id="loja-bairro" label={labels.loja.bairro}>
                  <Input
                    value={loja.endereco_bairro ?? ''}
                    onChange={(e) => setLoja({ ...loja, endereco_bairro: e.target.value || null })}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
                <Field id="loja-cidade" label={labels.loja.cidade}>
                  <Input
                    value={loja.endereco_cidade ?? ''}
                    onChange={(e) => setLoja({ ...loja, endereco_cidade: e.target.value || null })}
                  />
                </Field>
                <Field id="loja-uf" label={labels.loja.uf}>
                  <Select
                    value={loja.endereco_uf ?? 'SP'}
                    onChange={(e) => setLoja({ ...loja, endereco_uf: e.target.value || null })}
                  >
                    {UFS_BR.map((uf) => (
                      <option key={uf} value={uf}>
                        {uf}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </ConfigSection>

            <ConfigSection title={labels.loja.secSerieFiscal} hint={labels.loja.hintSerie}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field id="loja-serie-nfce" label={labels.loja.nfce}>
                  <Input
                    type="number"
                    min={1}
                    max={999}
                    value={loja.numero_serie_nfce}
                    className="font-mono"
                    onChange={(e) =>
                      setLoja({
                        ...loja,
                        numero_serie_nfce: Math.max(1, Math.min(999, Number(e.target.value) || 1)),
                      })
                    }
                  />
                </Field>
                <Field id="loja-serie-nfe" label={labels.loja.nfe}>
                  <Input
                    type="number"
                    min={1}
                    max={999}
                    value={loja.numero_serie_nfe}
                    className="font-mono"
                    onChange={(e) =>
                      setLoja({
                        ...loja,
                        numero_serie_nfe: Math.max(1, Math.min(999, Number(e.target.value) || 1)),
                      })
                    }
                  />
                </Field>
              </div>
            </ConfigSection>

            {lojaErro ? (
              <ErrorState dense title={lojaErro} description={lojaErro} className="items-start text-left" />
            ) : null}
            {lojaSucesso ? (
              <div role="status" className="admin-v2-alert-success rounded-[var(--radius-lg)] px-3 py-2 text-small">
                {labels.loja.sucesso}
              </div>
            ) : null}

            <div className="flex justify-end border-t border-[var(--color-border)] pt-4">
              <Button type="submit" variant="primary" loading={salvandoLoja} disabled={salvandoLoja || uploadandoLogo}>
                {salvandoLoja ? labels.salvando : labels.loja.btnSalvar}
              </Button>
            </div>
          </form>
        </SectionCard>
      )}

      {abaAtiva === 'impostos' && (
        <SectionCard title={labels.fiscal.sec} subtitle={labels.fiscal.hint}>
          <form
            id="config-panel-impostos"
            role="tabpanel"
            aria-labelledby="config-tab-impostos"
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              void salvarPdv()
            }}
          >
            {!loja.id ? (
              <div className="admin-v2-alert-warning rounded-[var(--radius-lg)] px-3 py-2 text-small">
                {labels.fiscal.warnSalveLoja}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field id="fiscal-regime" label={labels.fiscal.regime} className="sm:col-span-2">
                <Select
                  value={pdv.regime_tributario}
                  onChange={(e) =>
                    setPdv({ ...pdv, regime_tributario: e.target.value as RegimeTributario })
                  }
                >
                  {REGIMES.map((r) => (
                    <option key={r} value={r}>
                      {labels.enums.regimes[r] ?? r}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="fiscal-cfop" label={labels.fiscal.cfop} hint={labels.fiscal.hintCfop}>
                <Input
                  value={pdv.cfop_padrao}
                  inputMode="numeric"
                  maxLength={4}
                  placeholder={labels.fiscal.phCfop}
                  className="font-mono"
                  required
                  onChange={(e) => setPdv({ ...pdv, cfop_padrao: digitsOnly(e.target.value, 4) })}
                />
              </Field>
              <Field id="fiscal-cst" label={labels.fiscal.cst} hint={labels.fiscal.hintCst}>
                <Select
                  value={pdv.cst_padrao}
                  className="font-mono"
                  onChange={(e) => setPdv({ ...pdv, cst_padrao: e.target.value })}
                >
                  {CSTS_COMUNS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="flex items-start justify-between gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-background-secondary)] px-3 py-3">
              <div>
                <p className="text-small font-medium text-fg">{labels.fiscal.autoFiscal}</p>
                <p className="text-caption text-fg-subtle">{labels.fiscal.hintAutoFiscal}</p>
              </div>
              <Switch
                id="fiscal-auto"
                checked={pdv.auto_enqueue_fiscal}
                onCheckedChange={(checked) => setPdv({ ...pdv, auto_enqueue_fiscal: checked })}
                aria-label={labels.fiscal.autoFiscal}
              />
            </div>

            {pdvErro ? (
              <ErrorState dense title={pdvErro} description={pdvErro} className="items-start text-left" />
            ) : null}
            {pdvSucesso ? (
              <div role="status" className="admin-v2-alert-success rounded-[var(--radius-lg)] px-3 py-2 text-small">
                {labels.fiscal.sucesso}
              </div>
            ) : null}

            <div className="flex justify-end border-t border-[var(--color-border)] pt-4">
              <Button type="submit" variant="primary" loading={salvandoPdv} disabled={salvandoPdv || !loja.id}>
                {salvandoPdv ? labels.salvando : labels.fiscal.btnSalvar}
              </Button>
            </div>
          </form>
        </SectionCard>
      )}

      {abaAtiva === 'preferencias' && (
        <SectionCard title={labels.prefs.sec} subtitle={labels.prefs.hint}>
          <form
            id="config-panel-preferencias"
            role="tabpanel"
            aria-labelledby="config-tab-preferencias"
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              void salvarPdv()
            }}
          >
            {!loja.id ? (
              <div className="admin-v2-alert-warning rounded-[var(--radius-lg)] px-3 py-2 text-small">
                {labels.fiscal.warnSalveLoja}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field id="prefs-idioma" label={labels.prefs.idioma}>
                <Select
                  value={pdv.idioma_padrao}
                  onChange={(e) => setPdv({ ...pdv, idioma_padrao: e.target.value as IdiomaPadrao })}
                >
                  {IDIOMAS.map((i) => (
                    <option key={i} value={i}>
                      {labels.enums.idiomas[i] ?? i}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="prefs-formato" label={labels.prefs.formato}>
                <Select
                  value={pdv.formato_impressao}
                  onChange={(e) =>
                    setPdv({ ...pdv, formato_impressao: e.target.value as 'TERMICA' | 'A4' })
                  }
                >
                  {FORMATOS.map((f) => (
                    <option key={f} value={f}>
                      {labels.enums.formatos[f] ?? f}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="flex items-start justify-between gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-background-secondary)] px-3 py-3">
              <div>
                <p className="text-small font-medium text-fg">{labels.prefs.imprimirAuto}</p>
                <p className="text-caption text-fg-subtle">{labels.prefs.hintImprimirAuto}</p>
              </div>
              <Switch
                id="prefs-imprimir"
                checked={pdv.imprimir_cupom_auto}
                onCheckedChange={(checked) => setPdv({ ...pdv, imprimir_cupom_auto: checked })}
                aria-label={labels.prefs.imprimirAuto}
              />
            </div>

            {pdvErro ? (
              <ErrorState dense title={pdvErro} description={pdvErro} className="items-start text-left" />
            ) : null}
            {pdvSucesso ? (
              <div role="status" className="admin-v2-alert-success rounded-[var(--radius-lg)] px-3 py-2 text-small">
                {labels.prefs.sucesso}
              </div>
            ) : null}

            <div className="flex justify-end border-t border-[var(--color-border)] pt-4">
              <Button type="submit" variant="primary" loading={salvandoPdv} disabled={salvandoPdv || !loja.id}>
                {salvandoPdv ? labels.salvando : labels.prefs.btnSalvar}
              </Button>
            </div>
          </form>
        </SectionCard>
      )}
    </div>

    <DragonModal
      open={pendingAba !== null}
      onClose={() => setPendingAba(null)}
      variant="danger"
      size="sm"
      title={labels.unsavedWarn}
      closeLabel={labels.fechar}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={() => setPendingAba(null)}>
            {labels.nao}
          </Button>
          <Button type="button" variant="danger" onClick={confirmarTrocaAba}>
            {labels.sim}
          </Button>
        </>
      }
    >
      <p className="text-sm text-jl-fg-2">{labels.unsavedWarn}</p>
    </DragonModal>
    </Fragment>
  )
}
