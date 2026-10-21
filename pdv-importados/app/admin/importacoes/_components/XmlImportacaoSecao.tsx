'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { SectionCard } from '@/components/ui/admin-v2'
import { formatarDecimal } from '@/lib/import/hub/decimais'
import type { PropostaXml } from '@/lib/import/xml/lerXmlImportacao'
import { aplicarXmlAction, lerXmlAction } from '../actions-inteligencia'
import { ErroFormulario, useAcao, type TextosImport } from './campos'

/** Importar NF-e/DI em XML → proposta → conferência → aplicar (mercadorias + tributos pendentes). */
export function XmlImportacaoSecao(props: { t: TextosImport; operacaoId: string; editavel: boolean }) {
  const { t } = props
  const { executar, pendente, erro } = useAcao(t)
  const [xml, setXml] = useState<string | null>(null)
  const [proposta, setProposta] = useState<PropostaXml | null>(null)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [tributos, setTributos] = useState(true)

  async function aoEscolher(f: File | undefined) {
    setProposta(null)
    if (!f) return
    const texto = await f.text()
    setXml(texto)
    executar(() => lerXmlAction(props.operacaoId, texto), (p) => { setProposta(p); setSel(new Set(p.itens.map((_, i) => i))) }, undefined, { atualizar: false })
  }

  return (
    <SectionCard title={t.xml_titulo} subtitle={t.xml_subtitulo}>
      {props.editavel ? (
        <label className="flex flex-col gap-1 text-small">
          <span className="font-medium">{t.xml_arquivo}</span>
          <input type="file" accept=".xml,text/xml,application/xml" data-testid="imp-xml-arquivo"
            onChange={(e) => void aoEscolher(e.target.files?.[0])} className="text-small" />
        </label>
      ) : <p className="text-small text-fg-subtle">{t.somente_leitura}</p>}
      <p className="mt-2 text-xs text-fg-subtle" data-testid="imp-ia-desligada">{t.xml_ia_desligada}</p>
      <ErroFormulario mensagem={erro} />
      {proposta ? (
        <div className="mt-4 flex flex-col gap-3" data-testid="imp-xml-proposta">
          <p className="text-small"><strong>{proposta.tipo}</strong> {proposta.numero ?? ''} · {proposta.data_documento ?? '—'} — {t.xml_conferir}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-small">
              <caption className="sr-only">{t.xml_titulo}</caption>
              <thead>
                <tr className="text-left text-[11px] uppercase text-fg-subtle">
                  <th scope="col" className="px-2 py-1"><span className="sr-only">{t.trib_ncm_selecionar}</span></th>
                  <th scope="col" className="px-2 py-1">{t.merc_descricao}</th>
                  <th scope="col" className="px-2 py-1">{t.merc_ncm}</th>
                  <th scope="col" className="px-2 py-1 text-right">{t.xml_quantidade}</th>
                  <th scope="col" className="px-2 py-1 text-right">{t.xml_valor}</th>
                  <th scope="col" className="px-2 py-1">{t.xml_tributos}</th>
                </tr>
              </thead>
              <tbody>
                {proposta.itens.map((it, i) => (
                  <tr key={i} className="border-t border-[var(--color-border)]/60">
                    <td className="px-2 py-1.5"><input type="checkbox" aria-label={it.descricao} checked={sel.has(i)}
                      onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(i); else n.delete(i); setSel(n) }} /></td>
                    <td className="px-2 py-1.5">{it.descricao}</td>
                    <td className="px-2 py-1.5 font-mono">{it.ncm ?? '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatarDecimal(it.quantidade)} {it.unidade}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatarDecimal(it.valor_brl)}</td>
                    <td className="px-2 py-1.5 text-xs">{proposta.tributos.filter((x) => x.item_indice === i).map((x) => `${x.tributo_codigo} ${formatarDecimal(x.valor_brl)}`).join(' · ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {proposta.alertas.length > 0 ? (
            <ul className="list-disc pl-5 text-xs text-[var(--color-warning-strong)]" data-testid="imp-xml-alertas">
              {proposta.alertas.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          ) : null}
          <label className="flex items-center gap-2 text-small">
            <input type="checkbox" checked={tributos} onChange={(e) => setTributos(e.target.checked)} /> {t.xml_incluir_tributos}
          </label>
          <div>
            <Button type="button" disabled={pendente || sel.size === 0 || !xml} data-testid="imp-xml-aplicar"
              onClick={() => executar(() => aplicarXmlAction(props.operacaoId, xml!, { itens: [...sel], tributos }), () => { setProposta(null); setXml(null) }, t.xml_aplicado)}>
              {pendente ? t.salvando : t.xml_aplicar}
            </Button>
          </div>
        </div>
      ) : null}
    </SectionCard>
  )
}
