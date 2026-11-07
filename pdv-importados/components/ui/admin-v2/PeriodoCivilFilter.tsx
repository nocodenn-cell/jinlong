'use client'

/**
 * Filtro de período padrão (A3 da auditoria UI/UX): presets Hoje · 7 dias · Mês atual · Personalizado,
 * datas civis no fuso da loja e estado só na URL (`?de=&ate=`). Mostra o chip do período quando ele
 * difere do padrão da tela, com "Limpar filtros" (volta ao padrão preservando aba e demais parâmetros).
 */
import { useState, type FormEvent } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  PRESETS_PERIODO_CIVIL,
  hrefComPeriodo,
  intervaloDoPreset,
  resolverPeriodoCivil,
  type PresetPeriodoCivil,
} from '@/lib/admin/periodoCivil'
import { formatarDataCivilNumerica } from '@/lib/relatorios/periodoRelatorio'
import { FiltrosAtivosChips } from './FiltrosAtivosChips'

export type PeriodoCivilFilterLabels = {
  presetsAria: string
  hoje: string
  '7d': string
  mes: string
  personalizado: string
  de: string
  ate: string
  aplicar: string
  /** Ex.: "Período: {{label}}" */
  chip: string
  chipRemover: string
  filtrosAtivos: string
  limpar: string
}

export function PeriodoCivilFilter({
  de,
  ate,
  hoje,
  locale,
  labels,
  padrao = 'mes',
  pathname: pathnameProp,
}: {
  de: string
  ate: string
  /** Hoje civil (YYYY-MM-DD) no fuso da loja, calculado no servidor. */
  hoje: string
  locale: string
  labels: PeriodoCivilFilterLabels
  padrao?: Exclude<PresetPeriodoCivil, 'personalizado'>
  pathname?: string
}) {
  const router = useRouter()
  const search = useSearchParams()
  const pathnameAtual = usePathname()
  const pathname = pathnameProp ?? pathnameAtual
  const atual = resolverPeriodoCivil(de, ate, hoje, padrao)
  const [personalizado, setPersonalizado] = useState(atual.preset === 'personalizado')
  const qs = search?.toString() ?? ''

  const ir = (url: string) => router.push(url, { scroll: false })

  const escolher = (preset: PresetPeriodoCivil) => {
    if (preset === 'personalizado') {
      setPersonalizado(true)
      return
    }
    setPersonalizado(false)
    ir(hrefComPeriodo(pathname, qs, preset === padrao ? null : intervaloDoPreset(preset, hoje)))
  }

  const aplicar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const r = resolverPeriodoCivil(String(fd.get('de') ?? ''), String(fd.get('ate') ?? ''), hoje, padrao)
    ir(hrefComPeriodo(pathname, qs, r.ehPadrao ? null : r))
  }

  const presetAtivo: PresetPeriodoCivil = personalizado ? 'personalizado' : atual.preset
  const opcoes: PresetPeriodoCivil[] = [...PRESETS_PERIODO_CIVIL, 'personalizado']
  const rotuloIntervalo =
    atual.preset === 'personalizado'
      ? `${formatarDataCivilNumerica(atual.de, locale)} – ${formatarDataCivilNumerica(atual.ate, locale)}`
      : labels[atual.preset]
  const limparHref = hrefComPeriodo(pathname, qs, null)

  return (
    <div className="mb-4 flex flex-col gap-2" data-testid="periodo-civil-filter">
      <div className="flex flex-wrap items-end gap-3">
        <div className="admin-v2-segmented" role="group" aria-label={labels.presetsAria}>
          {opcoes.map((p) => (
            <button
              key={p}
              type="button"
              data-preset={p}
              data-active={presetAtivo === p}
              aria-pressed={presetAtivo === p}
              onClick={() => escolher(p)}
              className="admin-v2-filter-pill rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
            >
              {labels[p]}
            </button>
          ))}
        </div>
        {personalizado ? (
          <form className="flex flex-wrap items-end gap-2" onSubmit={aplicar} key={`${atual.de}_${atual.ate}`}>
            <label className="flex flex-col gap-1 text-caption text-jl-fg-3">
              {labels.de}
              <input name="de" type="date" defaultValue={atual.de} max={hoje} className="admin-v2-input px-2 py-1.5 text-small" />
            </label>
            <label className="flex flex-col gap-1 text-caption text-jl-fg-3">
              {labels.ate}
              <input name="ate" type="date" defaultValue={atual.ate} className="admin-v2-input px-2 py-1.5 text-small" />
            </label>
            <button type="submit" className="admin-v2-btn-secondary">
              {labels.aplicar}
            </button>
          </form>
        ) : null}
      </div>
      <FiltrosAtivosChips
        chips={atual.ehPadrao ? [] : [{ key: 'periodo', label: labels.chip.replace('{{label}}', rotuloIntervalo), href: limparHref }]}
        limparHref={limparHref}
        labels={{ regiao: labels.filtrosAtivos, remover: labels.chipRemover, limpar: labels.limpar }}
      />
    </div>
  )
}

/** Rótulos a partir do dicionário admin_ui (pt/zh). */
export function periodoCivilLabelsAdmin(ui: Record<string, string>): PeriodoCivilFilterLabels {
  return {
    presetsAria: ui.periodo_civil_presets_aria,
    hoje: ui.vendas_periodo_label_hoje,
    '7d': ui.auditoria_periodo_7d,
    mes: ui.vendas_periodo_label_mes,
    personalizado: ui.periodo_civil_personalizado,
    de: ui.periodo_civil_de,
    ate: ui.periodo_civil_ate,
    aplicar: ui.periodo_civil_aplicar,
    chip: ui.periodo_civil_chip,
    chipRemover: ui.catalogo_chip_remover,
    filtrosAtivos: ui.filtros_ativos_aria,
    limpar: ui.vendas_limpar_filtros,
  }
}
