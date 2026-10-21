'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { SectionCard } from '@/components/ui/admin-v2'
import type { Documento } from '@/lib/import/hub/dadosImportacoes'
import { registrarDocumentoAction } from '../actions'
import { ErroFormulario, Selecao, Texto, useAcao, type TextosImport } from './campos'

const TIPOS = ['INVOICE', 'PACKING_LIST', 'CONHECIMENTO_EMBARQUE', 'DI', 'DUIMP', 'NFE', 'COMPROVANTE_PAGAMENTO', 'CONTRATO_CAMBIO', 'OUTRO'] as const

/**
 * Referências documentais. O envio de ARQUIVO não está disponível: a retenção (D8) ainda
 * depende de validação jurídica. Nada aqui simula um upload.
 */
export function DocumentosSecao(props: {
  t: TextosImport
  operacaoId: string
  documentos: Documento[]
  usuarios: Record<string, string>
  podeRegistrar: boolean
}) {
  const { t } = props
  const { executar, pendente, erro } = useAcao(t)
  const vazio = { tipo: 'INVOICE', numero: '', data_documento: '', substitui: '' }
  const [f, setF] = useState(vazio)
  const set = (k: keyof typeof vazio) => (v: string) => setF((s) => ({ ...s, [k]: v }))
  const tk = (k: string) => (t as Record<string, string>)[k] ?? k

  return (
    <SectionCard title={t.doc_titulo}>
      <p role="note" className="mb-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2 text-small" data-testid="imp-doc-upload-indisponivel">
        {t.doc_upload_indisponivel}
      </p>
      {props.documentos.length === 0 ? (
        <p className="mb-4 text-small text-fg-subtle">{t.doc_vazio}</p>
      ) : (
        <div className="mb-4 overflow-x-auto">
          <table className="w-full text-small" data-testid="imp-documentos">
            <caption className="sr-only">{t.doc_titulo}</caption>
            <thead>
              <tr className="text-left text-[11px] uppercase text-fg-subtle">
                <th scope="col" className="px-2 py-1">{t.doc_tipo}</th>
                <th scope="col" className="px-2 py-1">{t.doc_numero}</th>
                <th scope="col" className="px-2 py-1">{t.doc_data}</th>
                <th scope="col" className="px-2 py-1 text-right">{t.doc_versao}</th>
                <th scope="col" className="px-2 py-1">{t.doc_arquivo}</th>
                <th scope="col" className="px-2 py-1">{t.doc_registrado_por}</th>
                <th scope="col" className="px-2 py-1">{t.doc_em}</th>
              </tr>
            </thead>
            <tbody>
              {props.documentos.map((d) => (
                <tr key={d.id} id={`doc-${d.id}`} className="border-t border-[var(--color-border)] target:bg-[var(--color-surface-soft)]">
                  <td className="px-2 py-1.5">{tk(`tipo_${d.tipo}`)}</td>
                  <td className="px-2 py-1.5 font-mono">{d.numero ?? '—'}</td>
                  <td className="px-2 py-1.5 tabular-nums">{d.data_documento ?? '—'}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{d.versao}</td>
                  <td className="px-2 py-1.5 text-xs">{d.storage_path ? `sha256 ${d.sha256?.slice(0, 12)}…` : t.doc_sem_arquivo}</td>
                  <td className="px-2 py-1.5">{props.usuarios[d.enviado_por] ?? '—'}</td>
                  <td className="px-2 py-1.5 tabular-nums">{new Date(d.enviado_em).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {props.podeRegistrar ? (
        <form
          className="grid gap-3 md:grid-cols-4"
          aria-label={t.doc_adicionar}
          onSubmit={(e) => {
            e.preventDefault()
            executar(() => registrarDocumentoAction(props.operacaoId, f), () => setF(vazio), t.salvo)
          }}
        >
          <Selecao rotulo={t.doc_tipo} valor={f.tipo} onChange={set('tipo')} opcoes={TIPOS.map((x) => ({ valor: x, rotulo: tk(`tipo_${x}`) }))} testId="imp-doc-tipo" />
          <Texto rotulo={t.doc_numero} valor={f.numero} onChange={set('numero')} maxLength={120} testId="imp-doc-numero" />
          <Texto rotulo={t.doc_data} valor={f.data_documento} onChange={set('data_documento')} tipo="date" />
          <Selecao
            rotulo={t.doc_substitui}
            valor={f.substitui}
            onChange={set('substitui')}
            opcoes={[{ valor: '', rotulo: '—' }, ...props.documentos.map((d) => ({ valor: d.id, rotulo: `${tk(`tipo_${d.tipo}`)} ${d.numero ?? ''} v${d.versao}` }))]}
          />
          <div className="md:col-span-4">
            <ErroFormulario mensagem={erro} />
            <Button type="submit" variant="outline" disabled={pendente} data-testid="imp-doc-salvar">
              {pendente ? t.salvando : t.doc_adicionar}
            </Button>
          </div>
        </form>
      ) : null}
    </SectionCard>
  )
}
