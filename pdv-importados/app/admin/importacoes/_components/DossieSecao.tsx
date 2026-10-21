import { SectionCard, StatusBadge } from '@/components/ui/admin-v2'
import type { Desconto, Despesa, Documento, Item, Tributo } from '@/lib/import/hub/dadosImportacoes'
import type { TextosImport } from './campos'

const ESPERADOS = ['INVOICE', 'PACKING_LIST', 'CONHECIMENTO_EMBARQUE', 'DI_DUIMP', 'NFE', 'COMPROVANTE_PAGAMENTO'] as const

export type Pendencia = { chave: string; detalhe: string }

/** Pendências do dossiê (puras, server-side): documentos faltantes e itens/lançamentos sem conferência. */
export function pendenciasDossie(d: { documentos: Documento[]; itens: Item[]; despesas: Despesa[]; tributos: Tributo[]; descontos: Desconto[] }): {
  checklist: { tipo: (typeof ESPERADOS)[number]; presente: boolean }[]
  pendencias: Pendencia[]
} {
  const tipos = new Set(d.documentos.map((x) => x.tipo))
  const checklist = ESPERADOS.map((tipo) => ({ tipo, presente: tipo === 'DI_DUIMP' ? tipos.has('DI') || tipos.has('DUIMP') : tipos.has(tipo) }))
  const p: Pendencia[] = []
  for (const i of d.itens) if (!i.ncm) p.push({ chave: 'pend_item_sem_ncm', detalhe: i.descricao })
  for (const x of d.despesas) {
    if (x.status_conferencia !== 'CONFERIDO') p.push({ chave: 'pend_despesa_nao_conferida', detalhe: x.tipo })
    if (!x.documento_id) p.push({ chave: 'pend_sem_documento', detalhe: x.tipo })
  }
  for (const x of d.tributos) {
    if (x.status_conferencia !== 'CONFERIDO') p.push({ chave: 'pend_tributo_nao_conferido', detalhe: x.tributo_codigo })
    if (x.status_recuperabilidade === 'PENDENTE_VALIDACAO') p.push({ chave: 'pend_tributo_recuperabilidade', detalhe: x.tributo_codigo })
    if (!x.documento_id) p.push({ chave: 'pend_sem_documento', detalhe: x.tributo_codigo })
  }
  return { checklist, pendencias: p }
}

export function DossieSecao(props: { t: TextosImport; dados: Parameters<typeof pendenciasDossie>[0] }) {
  const { t } = props
  const tk = (k: string) => (t as Record<string, string>)[k] ?? k
  const { checklist, pendencias } = pendenciasDossie(props.dados)
  return (
    <SectionCard title={t.dossie_titulo} subtitle={t.dossie_subtitulo}>
      <ul className="mb-4 flex flex-wrap gap-2" data-testid="imp-dossie-checklist" aria-label={t.dossie_titulo}>
        {checklist.map((c) => (
          <li key={c.tipo}>
            <StatusBadge tone={c.presente ? 'success' : 'warning'}>{c.presente ? '✓' : '○'} {tk(`dossie_${c.tipo}`)}</StatusBadge>
          </li>
        ))}
      </ul>
      {pendencias.length === 0 ? (
        <p className="text-small text-fg-subtle" data-testid="imp-dossie-ok">{t.dossie_sem_pendencias}</p>
      ) : (
        <ul className="list-disc pl-5 text-small" data-testid="imp-dossie-pendencias">
          {pendencias.map((x, i) => <li key={i}>{tk(x.chave)}: <span className="font-mono text-xs">{x.detalhe}</span></li>)}
        </ul>
      )}
    </SectionCard>
  )
}
