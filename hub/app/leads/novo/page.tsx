import Link from 'next/link'
import { requireMember } from '@/lib/session'
import { ORIGEM_LABEL, ORIGENS_MANUAIS, PRODUCT_LABEL, PRODUCTS } from '@/lib/model'
import { Flash, Shell } from '../../Shell'
import { createLead } from '../actions'

export const dynamic = 'force-dynamic'

export default async function NovoLead({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { demo, papel } = await requireMember()
  const { erro } = await searchParams
  return (
    <Shell demo={demo} active="leads" papel={papel}>
      <p><Link href="/leads" className="hub-link">← Leads</Link></p>
      <h1>Novo lead</h1>
      <p className="hub-help">Para contatos que chegaram fora do site (indicação, prospecção, evento, WhatsApp). Leads do site e do teste grátis entram sozinhos.</p>
      <Flash erro={erro} />
      <form action={createLead} className="hub-panel hub-form-grid">
        <label><span>Nome do contato *</span><input name="name" required minLength={2} maxLength={80} autoComplete="off" /></label>
        <label><span>Empresa / loja *</span><input name="store" required minLength={2} maxLength={120} autoComplete="off" /></label>
        <label><span>Canal *</span>
          <select name="channel" defaultValue="whatsapp"><option value="whatsapp">WhatsApp</option><option value="wechat">WeChat</option><option value="email">E-mail</option></select>
        </label>
        <label><span>Contato (telefone, WeChat ou e-mail) *</span><input name="contact" required minLength={3} maxLength={60} autoComplete="off" /></label>
        <label><span>E-mail</span><input type="email" name="email" maxLength={254} autoComplete="off" /></label>
        <label><span>Produto *</span>
          <select name="product" defaultValue="jinlong">{PRODUCTS.map((p) => <option key={p} value={p}>{PRODUCT_LABEL[p]}</option>)}</select>
        </label>
        <label><span>Origem *</span>
          <select name="origem" defaultValue="prospeccao">{ORIGENS_MANUAIS.map((o) => <option key={o} value={o}>{ORIGEM_LABEL[o]}</option>)}</select>
        </label>
        <label><span>Cidade</span><input name="city" maxLength={80} /></label>
        <label><span>UF</span><input name="uf" maxLength={2} pattern="[A-Za-z]{2}" placeholder="SP" /></label>
        <label className="hub-span2"><span>Observações</span><textarea name="observacoes" maxLength={4000} rows={3} /></label>
        <label className="hub-choice hub-span2"><input type="checkbox" name="forcar" /> Criar mesmo se já existir lead com este contato (use só se tiver certeza de que é outra empresa)</label>
        <div className="hub-span2"><button type="submit" className="hub-btn">Cadastrar lead</button></div>
      </form>
    </Shell>
  )
}
