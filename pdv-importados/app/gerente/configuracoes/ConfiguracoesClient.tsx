'use client'

import { useCallback, useState } from 'react'
import { Store, Receipt, Settings, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { getMessages } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { cn } from '@/lib/utils'
import {
  atualizarConfiguracoesPdvAction,
  atualizarDadosLojaAction,
  uploadLogoLojaAction,
  type IdiomaPadrao,
  type LojaConfig,
  type PdvConfig,
  type RegimeTributario,
} from './actions'

type Aba = 'loja' | 'fiscal' | 'preferencias'

type Props = Readonly<{
  idioma: Idioma
  lojaInicial: LojaConfig | null
  pdvConfigInicial: PdvConfig | null
}>

const UFs = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']
const CSTs = ['00','10','20','30','40','41','50','51','60','70','90']

function maskCNPJ(raw: string): string {
  const x = raw.replace(/\D/g, '').slice(0, 14)
  if (x.length === 14) return x.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return x
}
function maskTel(raw: string): string {
  const x = raw.replace(/\D/g, '').slice(0, 11)
  if (x.length === 11) return x.replace(/(\d{2})(\d{1})(\d{4})(\d{4})/, '($1) $2 $3-$4')
  if (x.length === 10) return x.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
  return x
}
function maskCEP(raw: string): string {
  const x = raw.replace(/\D/g, '').slice(0, 8)
  if (x.length === 8) return x.replace(/(\d{5})(\d{3})/, '$1-$2')
  return x
}

const finIn = 'h-10 w-full rounded-md px-3 text-sm app-input'
const finSelect = 'h-10 w-full rounded-md px-3 text-sm app-select'

export function ConfiguracoesClient({ idioma, lojaInicial, pdvConfigInicial }: Props) {
  const m = getMessages(idioma)
  const [aba, setAba] = useState<Aba>('loja')

  // — Aba LOJA —
  const [loja, setLoja] = useState<LojaConfig>(
    lojaInicial ?? {
      nome: '',
      cnpj: '',
      inscricao_estadual: '',
      telefone: '',
      email: '',
      logo_url: '',
      endereco_logradouro: '',
      endereco_numero: '',
      endereco_complemento: '',
      endereco_bairro: '',
      endereco_cidade: '',
      endereco_uf: 'SP',
      endereco_cep: '',
      razao_social: '',
      nome_fantasia: '',
      cnae: '',
      numero_serie_nfce: 1,
      numero_serie_nfe: 1,
    },
  )
  const [salvandoLoja, setSalvandoLoja] = useState(false)
  const [uploadando, setUploadando] = useState(false)

  // — Aba FISCAL + PREFERENCIAS —
  const [pdv, setPdv] = useState<PdvConfig>(
    pdvConfigInicial ?? {
      loja_id: lojaInicial?.id ?? '',
      cfop_padrao: '5102',
      cst_padrao: '00',
      regime_tributario: 'SIMPLES_NACIONAL',
      auto_enqueue_fiscal: true,
      idioma_padrao: 'pt',
      tema_padrao: 'noturno',
      imprimir_cupom_auto: true,
      formato_impressao: 'TERMICA',
    },
  )
  const [salvandoPdv, setSalvandoPdv] = useState(false)

  const salvarLoja = useCallback(async () => {
    setSalvandoLoja(true)
    try {
      const r = await atualizarDadosLojaAction(loja)
      if (!r.ok) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      setLoja(r.loja)
      setPdv((p) => ({ ...p, loja_id: r.loja.id ?? p.loja_id }))
      emitGerenteToast({ kind: 'success', message: m.configuracoes.toast_loja_salva })
    } finally {
      setSalvandoLoja(false)
    }
  }, [loja, m])

  const salvarPdv = useCallback(async () => {
    setSalvandoPdv(true)
    try {
      const r = await atualizarConfiguracoesPdvAction(pdv)
      if (!r.ok) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      setPdv(r.config)
      emitGerenteToast({ kind: 'success', message: m.configuracoes.toast_pdv_salvo })
    } finally {
      setSalvandoPdv(false)
    }
  }, [pdv, m])

  async function fazerUploadLogo(file: File) {
    setUploadando(true)
    try {
      const fd = new FormData()
      fd.set('file', file)
      const r = await uploadLogoLojaAction(fd)
      if (!r.ok) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      setLoja((l) => ({ ...l, logo_url: r.url }))
      emitGerenteToast({ kind: 'success', message: m.configuracoes.toast_logo_enviado })
    } finally {
      setUploadando(false)
    }
  }

  return (
    <>
      {/* Tabs */}
      <div role="tablist" aria-label={m.configuracoes.tabs_aria}
        className="mb-5 flex flex-wrap gap-1 rounded-lg app-border border bg-jl-surface-soft p-1">
        {[
          { id: 'loja' as const,         label: m.configuracoes.aba_loja,         Icon: Store },
          { id: 'fiscal' as const,       label: m.configuracoes.aba_fiscal,       Icon: Receipt },
          { id: 'preferencias' as const, label: m.configuracoes.aba_preferencias, Icon: Settings },
        ].map(({ id, label, Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={aba === id}
            aria-controls={`config-panel-${id}`}
            id={`config-tab-${id}`}
            onClick={() => setAba(id)}
            className={cn(
              'inline-flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
              aba === id
                ? 'bg-gradient-to-b from-amber-300 to-amber-600 font-semibold text-slate-900'
                : 'text-jl-fg-3 hover:text-jl-fg-1',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden /> {label}
          </button>
        ))}
      </div>

      {/* ABA LOJA */}
      {aba === 'loja' && (
        <Card role="tabpanel" id="config-panel-loja" aria-labelledby="config-tab-loja" className="dragon-glass-card">
          <CardHeader className="border-b border-jl-border-1 px-5 pb-3 pt-5 sm:px-6">
            <div className="flex items-center gap-3">
              <Store className="h-5 w-5 text-[color:var(--accent)]" aria-hidden />
              <CardTitle className="text-lg font-semibold">{m.configuracoes.aba_loja}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 px-5 py-5 sm:px-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-jl-fg-3">
                {m.configuracoes.field_nome_loja}<span className="ml-0.5 text-[color:var(--accent)]">*</span>
                <input className={`${finIn} mt-1`} value={loja.nome} maxLength={120}
                  onChange={(e) => setLoja({ ...loja, nome: e.target.value })} />
              </label>
              <label className="text-xs font-medium text-jl-fg-3">
                {m.configuracoes.field_cnpj}<span className="ml-0.5 text-[color:var(--accent)]">*</span>
                <input className={`${finIn} mt-1 font-mono`} value={maskCNPJ(loja.cnpj)} inputMode="numeric"
                  placeholder="00.000.000/0000-00"
                  onChange={(e) => setLoja({ ...loja, cnpj: e.target.value.replace(/\D/g, '') })} />
              </label>
              <label className="text-xs font-medium text-jl-fg-3">
                {m.configuracoes.field_ie}
                <input className={`${finIn} mt-1 font-mono`} value={loja.inscricao_estadual ?? ''}
                  onChange={(e) => setLoja({ ...loja, inscricao_estadual: e.target.value })} />
              </label>
              <label className="text-xs font-medium text-jl-fg-3">
                {m.configuracoes.field_telefone}
                <input className={`${finIn} mt-1 tabular-nums`} value={maskTel(loja.telefone ?? '')} type="tel"
                  placeholder="(11) 9 0000-0000"
                  onChange={(e) => setLoja({ ...loja, telefone: e.target.value.replace(/\D/g, '') })} />
              </label>
              <label className="text-xs font-medium text-jl-fg-3 sm:col-span-2">
                {m.configuracoes.field_email}
                <input className={`${finIn} mt-1`} value={loja.email ?? ''} type="email"
                  onChange={(e) => setLoja({ ...loja, email: e.target.value })} />
              </label>
            </div>

            {/* Logo */}
            <div>
              <span className="mb-1.5 block text-xs font-medium text-jl-fg-3">
                {m.configuracoes.field_logo}
              </span>
              <div className="flex flex-wrap items-center gap-4">
                {loja.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={loja.logo_url}
                    alt={m.configuracoes.logo_preview_alt}
                    className="h-20 w-20 rounded-lg object-contain app-border border bg-jl-surface-soft/80 p-1.5"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-lg app-border border bg-jl-surface-soft/80 text-2xl text-amber-400/60" style={{ fontFamily: 'var(--font-serif-han)' }}>
                    金
                  </div>
                )}
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md app-border border bg-jl-surface-soft px-3 py-2 text-sm font-medium text-jl-fg-3 transition-colors hover:border-amber-400 hover:text-jl-fg-1">
                  <Upload className="h-3.5 w-3.5" aria-hidden />
                  {uploadando ? m.comum.carregando : m.configuracoes.btn_upload_logo}
                  <input type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void fazerUploadLogo(f) }} />
                </label>
                {loja.logo_url && (
                  <button type="button" onClick={() => setLoja({ ...loja, logo_url: null })}
                    className="inline-flex items-center gap-1 text-xs text-jl-fg-3 hover:text-red-300">
                    <X className="h-3 w-3" aria-hidden /> {m.configuracoes.remover_logo}
                  </button>
                )}
              </div>
              <p className="mt-1.5 text-[11px] text-jl-fg-3">{m.configuracoes.hint_logo}</p>
            </div>

            {/* Identidade fiscal (Focus NFe) */}
            <div className="mt-2 border-t border-dashed border-jl-border-1 pt-4">
              <div className="mb-3 flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-jl-fg-3">
                {m.configuracoes.section_identidade_fiscal}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-jl-fg-3 sm:col-span-2">
                  {m.configuracoes.field_razao_social}
                  <input className={`${finIn} mt-1`} value={loja.razao_social ?? ''}
                    onChange={(e) => setLoja({ ...loja, razao_social: e.target.value })} />
                </label>
                <label className="text-xs font-medium text-jl-fg-3">
                  {m.configuracoes.field_nome_fantasia}
                  <input className={`${finIn} mt-1`} value={loja.nome_fantasia ?? ''}
                    onChange={(e) => setLoja({ ...loja, nome_fantasia: e.target.value })} />
                </label>
                <label className="text-xs font-medium text-jl-fg-3">
                  {m.configuracoes.field_cnae}
                  <input className={`${finIn} mt-1 font-mono tabular-nums`} inputMode="numeric" maxLength={7}
                    value={loja.cnae ?? ''}
                    placeholder="0000000"
                    onChange={(e) => setLoja({ ...loja, cnae: e.target.value.replace(/\D/g, '').slice(0, 7) })} />
                  <span className="mt-1 block text-[11px] text-jl-fg-3">{m.configuracoes.hint_cnae}</span>
                </label>
                <label className="text-xs font-medium text-jl-fg-3">
                  {m.configuracoes.field_serie_nfce}
                  <input className={`${finIn} mt-1 font-mono tabular-nums`} inputMode="numeric" maxLength={3}
                    value={loja.numero_serie_nfce}
                    onChange={(e) => setLoja({ ...loja, numero_serie_nfce: Math.max(1, Math.min(999, Number(e.target.value.replace(/\D/g, '')) || 1)) })} />
                </label>
                <label className="text-xs font-medium text-jl-fg-3">
                  {m.configuracoes.field_serie_nfe}
                  <input className={`${finIn} mt-1 font-mono tabular-nums`} inputMode="numeric" maxLength={3}
                    value={loja.numero_serie_nfe}
                    onChange={(e) => setLoja({ ...loja, numero_serie_nfe: Math.max(1, Math.min(999, Number(e.target.value.replace(/\D/g, '')) || 1)) })} />
                </label>
              </div>
            </div>

            {/* Endereço */}
            <div className="mt-2 border-t border-dashed border-jl-border-1 pt-4">
              <div className="mb-3 flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-jl-fg-3">
                {m.configuracoes.section_endereco}
                <span className="text-xs font-medium tracking-[0.08em] text-[color:var(--accent)]" style={{ fontFamily: 'var(--font-serif-han)' }}>地址</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr_100px]">
                <label className="text-xs font-medium text-jl-fg-3">
                  {m.configuracoes.field_cep}
                  <input className={`${finIn} mt-1 font-mono tabular-nums`} inputMode="numeric"
                    value={maskCEP(loja.endereco_cep ?? '')} placeholder="00000-000"
                    onChange={(e) => setLoja({ ...loja, endereco_cep: e.target.value.replace(/\D/g, '') })} />
                </label>
                <label className="text-xs font-medium text-jl-fg-3">
                  {m.configuracoes.field_logradouro}
                  <input className={`${finIn} mt-1`} value={loja.endereco_logradouro ?? ''}
                    onChange={(e) => setLoja({ ...loja, endereco_logradouro: e.target.value })} />
                </label>
                <label className="text-xs font-medium text-jl-fg-3">
                  {m.configuracoes.field_numero}
                  <input className={`${finIn} mt-1`} value={loja.endereco_numero ?? ''}
                    onChange={(e) => setLoja({ ...loja, endereco_numero: e.target.value })} />
                </label>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-jl-fg-3">
                  {m.configuracoes.field_complemento}
                  <input className={`${finIn} mt-1`} value={loja.endereco_complemento ?? ''}
                    onChange={(e) => setLoja({ ...loja, endereco_complemento: e.target.value })} />
                </label>
                <label className="text-xs font-medium text-jl-fg-3">
                  {m.configuracoes.field_bairro}
                  <input className={`${finIn} mt-1`} value={loja.endereco_bairro ?? ''}
                    onChange={(e) => setLoja({ ...loja, endereco_bairro: e.target.value })} />
                </label>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
                <label className="text-xs font-medium text-jl-fg-3">
                  {m.configuracoes.field_cidade}
                  <input className={`${finIn} mt-1`} value={loja.endereco_cidade ?? ''}
                    onChange={(e) => setLoja({ ...loja, endereco_cidade: e.target.value })} />
                </label>
                <label className="text-xs font-medium text-jl-fg-3">
                  {m.configuracoes.field_uf}
                  <select className={`${finSelect} mt-1`} value={loja.endereco_uf ?? 'SP'}
                    onChange={(e) => setLoja({ ...loja, endereco_uf: e.target.value })}>
                    {UFs.map((u) => <option key={u}>{u}</option>)}
                  </select>
                </label>
              </div>
            </div>

            <div className="flex justify-end border-t border-jl-border-1 pt-4">
              <Button type="button" className="app-btn-accent" disabled={salvandoLoja} onClick={() => void salvarLoja()}>
                {salvandoLoja ? m.comum.carregando : m.configuracoes.btn_salvar}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ABA FISCAL */}
      {aba === 'fiscal' && (
        <Card role="tabpanel" id="config-panel-fiscal" aria-labelledby="config-tab-fiscal" className="dragon-glass-card">
          <CardHeader className="border-b border-jl-border-1 px-5 pb-3 pt-5 sm:px-6">
            <div className="flex items-center gap-3">
              <Receipt className="h-5 w-5 text-[color:var(--accent)]" aria-hidden />
              <CardTitle className="text-lg font-semibold">{m.configuracoes.aba_fiscal}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 px-5 py-5 sm:px-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-jl-fg-3">
                {m.configuracoes.field_regime}
                <select className={`${finSelect} mt-1`} value={pdv.regime_tributario}
                  onChange={(e) => setPdv({ ...pdv, regime_tributario: e.target.value as RegimeTributario })}>
                  <option value="SIMPLES_NACIONAL">{m.configuracoes.regime_simples}</option>
                  <option value="LUCRO_PRESUMIDO">{m.configuracoes.regime_presumido}</option>
                  <option value="LUCRO_REAL">{m.configuracoes.regime_real}</option>
                  <option value="MEI">MEI</option>
                </select>
              </label>
              <label className="text-xs font-medium text-jl-fg-3">
                {m.configuracoes.field_cfop}
                <input className={`${finIn} mt-1 font-mono tabular-nums`} inputMode="numeric" maxLength={4}
                  value={pdv.cfop_padrao} placeholder="5102"
                  onChange={(e) => setPdv({ ...pdv, cfop_padrao: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
                <span className="mt-1 block text-[11px] text-jl-fg-3">{m.configuracoes.hint_cfop}</span>
              </label>
              <label className="text-xs font-medium text-jl-fg-3">
                {m.configuracoes.field_cst}
                <select className={`${finSelect} mt-1 font-mono`} value={pdv.cst_padrao}
                  onChange={(e) => setPdv({ ...pdv, cst_padrao: e.target.value })}>
                  {CSTs.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <span className="mt-1 block text-[11px] text-jl-fg-3">{m.configuracoes.hint_cst}</span>
              </label>
              <div className="text-xs font-medium text-jl-fg-3">
                {m.configuracoes.field_auto_fiscal}
                <label className="mt-1 flex cursor-pointer items-start gap-2.5 rounded-md app-border border bg-jl-surface-soft px-3 py-2.5">
                  <input type="checkbox" checked={pdv.auto_enqueue_fiscal} className="mt-0.5 h-4 w-4 rounded"
                    onChange={(e) => setPdv({ ...pdv, auto_enqueue_fiscal: e.target.checked })} />
                  <span className="text-jl-fg-1">{m.configuracoes.hint_auto_fiscal}</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end border-t border-jl-border-1 pt-4">
              <Button type="button" className="app-btn-accent" disabled={salvandoPdv || !pdv.loja_id} onClick={() => void salvarPdv()}>
                {salvandoPdv ? m.comum.carregando : m.configuracoes.btn_salvar}
              </Button>
            </div>
            {!pdv.loja_id && (
              <p className="text-[11px] text-amber-400">{m.configuracoes.aviso_salve_loja_primeiro}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ABA PREFERÊNCIAS */}
      {aba === 'preferencias' && (
        <Card role="tabpanel" id="config-panel-preferencias" aria-labelledby="config-tab-preferencias" className="dragon-glass-card">
          <CardHeader className="border-b border-jl-border-1 px-5 pb-3 pt-5 sm:px-6">
            <div className="flex items-center gap-3">
              <Settings className="h-5 w-5 text-[color:var(--accent)]" aria-hidden />
              <CardTitle className="text-lg font-semibold">{m.configuracoes.aba_preferencias}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 px-5 py-5 sm:px-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-jl-fg-3">
                {m.configuracoes.field_idioma}
                <select className={`${finSelect} mt-1`} value={pdv.idioma_padrao}
                  onChange={(e) => setPdv({ ...pdv, idioma_padrao: e.target.value as IdiomaPadrao })}>
                  <option value="pt">Português (BR)</option>
                  <option value="zh">简体中文</option>
                </select>
              </label>
              <label className="text-xs font-medium text-jl-fg-3">
                {m.configuracoes.field_tema}
                <select className={`${finSelect} mt-1`} value={pdv.tema_padrao}
                  onChange={(e) => setPdv({ ...pdv, tema_padrao: e.target.value as 'noturno' | 'novem' })}>
                  <option value="noturno">{m.configuracoes.tema_noturno}</option>
                  <option value="novem">{m.configuracoes.tema_novem}</option>
                </select>
              </label>
              <div className="text-xs font-medium text-jl-fg-3">
                {m.configuracoes.field_imprimir_auto}
                <label className="mt-1 flex cursor-pointer items-center gap-2.5 rounded-md app-border border bg-jl-surface-soft px-3 py-2.5">
                  <input type="checkbox" checked={pdv.imprimir_cupom_auto} className="h-4 w-4 rounded"
                    onChange={(e) => setPdv({ ...pdv, imprimir_cupom_auto: e.target.checked })} />
                  <span className="text-jl-fg-1">{m.configuracoes.hint_imprimir_auto}</span>
                </label>
              </div>
              <label className="text-xs font-medium text-jl-fg-3">
                {m.configuracoes.field_formato}
                <select className={`${finSelect} mt-1`} value={pdv.formato_impressao}
                  onChange={(e) => setPdv({ ...pdv, formato_impressao: e.target.value as 'TERMICA' | 'A4' })}>
                  <option value="TERMICA">{m.configuracoes.formato_termica}</option>
                  <option value="A4">A4</option>
                </select>
              </label>
            </div>

            <div className="flex justify-end border-t border-jl-border-1 pt-4">
              <Button type="button" className="app-btn-accent" disabled={salvandoPdv || !pdv.loja_id} onClick={() => void salvarPdv()}>
                {salvandoPdv ? m.comum.carregando : m.configuracoes.btn_salvar}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  )
}
