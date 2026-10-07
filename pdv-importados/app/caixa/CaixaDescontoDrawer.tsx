'use client'

import { useEffect, useState } from 'react'
import { BadgePercent } from 'lucide-react'
import { DragonModal } from '@/components/ui/DragonModal'
import { CaixaDescontoManual } from '@/app/caixa/CaixaDescontoManual'
import { CaixaDescontoComercialDinheiro } from '@/app/caixa/CaixaDescontoComercialDinheiro'

export type CaixaDescontoDrawerTab = 'manual' | 'comercial' | 'gerente'

type Props = {
  open: boolean
  onClose: () => void
  idioma: 'pt' | 'zh'
  limiteManual: number
  disabled?: boolean
  subtotal: number
  descontoPercentualAtual: number
  onSolicitarComercial: (percentual: number) => void
  onLimparComercial: () => void
  /** Abre o fluxo existente de autorização do gerente (modal separado). */
  onAbrirGerente: () => void
  podeComercialDinheiro: boolean
  tabInicial?: CaixaDescontoDrawerTab
}

const COPY = {
  pt: {
    title: 'Aplicar desconto',
    subtitle: 'F3 · escolha o tipo sem poluir o cupom',
    tabManual: 'Manual (item)',
    tabComercial: 'Comercial (dinheiro)',
    tabGerente: 'Gerente',
    gerenteHint:
      'Desconto acima da alçada comercial exige senha e motivo do gerente.',
    gerenteCta: 'Solicitar autorização do gerente',
    comercialBloqueado: 'Disponível só com pagamento 100% em dinheiro (parcela única).',
    fechar: 'Fechar',
  },
  zh: {
    title: '应用折扣',
    subtitle: 'F3 · 在抽屉中选择折扣类型',
    tabManual: '手动（单品）',
    tabComercial: '现金商业折扣',
    tabGerente: '经理授权',
    gerenteHint: '超出操作员权限的折扣需要经理密码与原因。',
    gerenteCta: '申请经理授权',
    comercialBloqueado: '仅在全额现金（单笔）时可用。',
    fechar: '关闭',
  },
} as const

/**
 * Painel único (DragonModal) para os três tipos de desconto do PDV.
 * Reutiliza os formulários existentes — não altera regras de negócio.
 */
export function CaixaDescontoDrawer({
  open,
  onClose,
  idioma,
  limiteManual,
  disabled = false,
  subtotal,
  descontoPercentualAtual,
  onSolicitarComercial,
  onLimparComercial,
  onAbrirGerente,
  podeComercialDinheiro,
  tabInicial = 'manual',
}: Props) {
  const t = COPY[idioma]
  const [tab, setTab] = useState<CaixaDescontoDrawerTab>(tabInicial)

  useEffect(() => {
    if (open) setTab(tabInicial)
  }, [open, tabInicial])

  return (
    <DragonModal
      open={open}
      onClose={onClose}
      title={t.title}
      subtitle={t.subtitle}
      icon={BadgePercent}
      size="md"
      sheet
      closeLabel={t.fechar}
      data-testid="caixa-desconto-drawer"
    >
      <div data-caixa-atalho-bloqueado="true" className="space-y-3">
        <div className="flex flex-wrap gap-1" role="tablist">
          {(
            [
              ['manual', t.tabManual],
              ['comercial', t.tabComercial],
              ['gerente', t.tabGerente],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`rounded-md px-3 py-2 text-sm font-semibold ${
                tab === id
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'manual' ? (
          <CaixaDescontoManual idioma={idioma} limite={limiteManual} disabled={disabled} />
        ) : null}
        {tab === 'comercial' ? (
          podeComercialDinheiro ? (
            <CaixaDescontoComercialDinheiro
              idioma={idioma}
              subtotal={subtotal}
              disabled={disabled}
              descontoPercentualAtual={descontoPercentualAtual}
              onSolicitar={onSolicitarComercial}
              onLimpar={onLimparComercial}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{t.comercialBloqueado}</p>
          )
        ) : null}
        {tab === 'gerente' ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t.gerenteHint}</p>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                onClose()
                onAbrirGerente()
              }}
              className="w-full rounded-md bg-primary px-3 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {t.gerenteCta}
            </button>
          </div>
        ) : null}
      </div>
    </DragonModal>
  )
}
