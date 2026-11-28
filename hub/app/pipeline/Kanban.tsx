'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'

export interface KCard {
  id: string
  store: string
  name: string
  status: string
  owner: string
  dias: number
  valor: string | null
  proxima: string | null
  atrasada: boolean
}
export interface KColumn { codigo: string; rotulo: string; tipo: 'aberta' | 'ganha' | 'perdida'; cards: KCard[]; total: string | null }

/**
 * Kanban: arrastar e soltar (mouse) ou o seletor "Mover" de cada cartão (teclado/toque).
 * Só envia o formulário; quem valida a transição é o banco (commercial_lead_mover).
 */
export function Kanban({ columns, action }: { columns: KColumn[]; action: (form: FormData) => void | Promise<void> }) {
  const form = useRef<HTMLFormElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const [over, setOver] = useState<string | null>(null)
  const [pend, setPend] = useState<{ id: string; to: string; from: string; store: string } | null>(null)
  const destinos = columns.filter((c) => c.tipo !== 'ganha')
  const rotulo = (c: string) => columns.find((x) => x.codigo === c)?.rotulo ?? c
  const tipo = (c: string) => columns.find((x) => x.codigo === c)?.tipo

  function mover(id: string, from: string, to: string, store: string) {
    if (from === to || tipo(to) === 'ganha' || tipo(from) === 'ganha') return
    setPend({ id, from, to, store })
    if (tipo(to) === 'perdida' || tipo(from) === 'perdida') { dialog.current?.showModal(); return }
    const f = form.current
    if (!f) return
    ;(f.elements.namedItem('leadId') as HTMLInputElement).value = id
    ;(f.elements.namedItem('status') as HTMLInputElement).value = to
    f.requestSubmit()
  }

  return (
    <>
      <form ref={form} action={action} hidden>
        <input type="hidden" name="voltar" value="pipeline" />
        <input type="hidden" name="leadId" defaultValue="" />
        <input type="hidden" name="status" defaultValue="" />
      </form>
      <dialog ref={dialog} className="hub-dialog" aria-labelledby="dlg-t">
        <form action={action} onSubmit={() => dialog.current?.close()}>
          <h2 id="dlg-t">{pend && tipo(pend.to) === 'perdida' ? 'Motivo da perda' : 'Motivo da reabertura'}</h2>
          <p>{pend?.store}: {pend && rotulo(pend.from)} → {pend && rotulo(pend.to)}</p>
          <input type="hidden" name="voltar" value="pipeline" />
          <input type="hidden" name="leadId" value={pend?.id ?? ''} />
          <input type="hidden" name="status" value={pend?.to ?? ''} />
          <label className="hub-block"><span>Motivo (obrigatório)</span><textarea name="motivo" required minLength={3} maxLength={500} rows={3} autoFocus /></label>
          <div className="hub-form-row">
            <button type="submit" className="hub-btn">Confirmar</button>
            <button type="button" className="hub-link" onClick={() => { dialog.current?.close(); setPend(null) }}>Cancelar</button>
          </div>
        </form>
      </dialog>
      <div className="hub-kanban" role="list" aria-label="Pipeline comercial">
        {columns.map((col) => (
          <section
            key={col.codigo}
            role="listitem"
            aria-label={`${col.rotulo}: ${col.cards.length} lead(s)`}
            className={`hub-kcol hub-kcol--${col.tipo}${over === col.codigo ? ' hub-kcol--over' : ''}`}
            onDragOver={(e) => { if (col.tipo !== 'ganha') { e.preventDefault(); setOver(col.codigo) } }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              e.preventDefault(); setOver(null)
              const [id, from, store] = e.dataTransfer.getData('text/plain').split('|')
              if (id && from) mover(id, from, col.codigo, store ?? '')
            }}
          >
            <header>
              <h2>{col.rotulo}</h2>
              <span>{col.cards.length}{col.total ? ` · ${col.total}` : ''}</span>
            </header>
            {col.tipo === 'ganha' && <p className="hub-khint">Entra aqui só pela conversão (proposta aceita).</p>}
            <ul>
              {col.cards.map((c) => (
                <li
                  key={c.id}
                  className="hub-kcard"
                  draggable={col.tipo !== 'ganha'}
                  onDragStart={(e) => { e.dataTransfer.setData('text/plain', `${c.id}|${c.status}|${c.store}`); e.dataTransfer.effectAllowed = 'move' }}
                >
                  <Link href={`/leads/${c.id}`}><strong>{c.store}</strong></Link>
                  <span>{c.name}</span>
                  <span className="hub-kmeta">{c.owner} · {c.dias} dia(s) na etapa</span>
                  {c.valor && <span className="hub-kval">{c.valor}/mês</span>}
                  <span className={c.atrasada ? 'hub-kmeta hub-alert' : 'hub-kmeta'}>{c.proxima ?? 'Sem próxima atividade'}</span>
                  {col.tipo !== 'ganha' && (
                    <label className="hub-kmove">
                      <span className="hub-sr">Mover {c.store} para</span>
                      <select value="" onChange={(e) => e.target.value && mover(c.id, c.status, e.target.value, c.store)}>
                        <option value="">Mover…</option>
                        {destinos.filter((d) => d.codigo !== c.status).map((d) => <option key={d.codigo} value={d.codigo}>{d.rotulo}</option>)}
                      </select>
                    </label>
                  )}
                </li>
              ))}
              {col.cards.length === 0 && <li className="hub-kempty">—</li>}
            </ul>
          </section>
        ))}
      </div>
    </>
  )
}
