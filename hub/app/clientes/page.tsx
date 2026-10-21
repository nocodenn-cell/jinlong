import Link from 'next/link'
import { requireAdmin } from '@/lib/session'
import { PRODUCT_LABEL, SUBSCRIPTION } from '@/lib/model'
import { Shell } from '../Shell'
import { updateCustomer } from './actions'

export const dynamic = 'force-dynamic'

const SUB_LABEL = { ativo: 'Ativo', pausado: 'Pausado', cancelado: 'Cancelado' } as const

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { repo, demo } = await requireAdmin()
  const { msg } = await searchParams
  const customers = await repo.listCustomers()
  return (
    <Shell demo={demo} active="clientes">
      <h1>Lojas contratadas</h1>
      <p className="hub-help">Acompanhamento simples. Plano e valor são campos livres, preparados para assinaturas futuras (nenhuma cobrança automática).</p>
      {msg && <p className="hub-msg" role="status">{msg.slice(0, 120)}</p>}
      <div className="hub-table-wrap">
        <table className="hub-table">
          <caption className="hub-sr">Lojas contratadas</caption>
          <thead>
            <tr><th scope="col">Loja</th><th scope="col">Produto</th><th scope="col">Desde</th><th scope="col">Plano · valor mensal · situação</th></tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id}>
                <td data-label="Loja">{c.lead_id ? <Link href={`/leads/${c.lead_id}`}><strong>{c.store_name}</strong></Link> : <strong>{c.store_name}</strong>}<br /><small>{c.contact}</small></td>
                <td data-label="Produto">{PRODUCT_LABEL[c.product]}</td>
                <td data-label="Desde">{c.contracted_at.split('-').reverse().join('/')}</td>
                <td data-label="Assinatura">
                  <form action={updateCustomer} className="hub-form-row">
                    <input type="hidden" name="id" value={c.id} />
                    <label><span>Plano</span><input name="plan" defaultValue={c.plan ?? ''} maxLength={60} /></label>
                    <label><span>Valor (R$)</span><input name="monthly_value" inputMode="decimal" defaultValue={c.monthly_value ?? ''} size={8} /></label>
                    <label>
                      <span>Situação</span>
                      <select name="subscription_status" defaultValue={c.subscription_status}>
                        {SUBSCRIPTION.map((s) => <option key={s} value={s}>{SUB_LABEL[s]}</option>)}
                      </select>
                    </label>
                    <button type="submit" className="hub-btn">Salvar</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {customers.length === 0 && <p className="hub-empty">Nenhuma loja contratada ainda.</p>}
      </div>
    </Shell>
  )
}
