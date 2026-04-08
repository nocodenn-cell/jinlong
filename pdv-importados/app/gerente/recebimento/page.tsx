import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioIdioma } from '@/src/lib/idioma/usuarioIdioma'
import { getMessages } from '@/src/lib/i18n/getMessages'
import { PendingSubmitButton } from '@/components/forms/PendingSubmitButton'
import { criarRemessaConferencia } from './actions'

export default async function RecebimentoPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; msg?: string; err?: string }>
}) {
  const sp = await searchParams
  const { idioma } = await getUsuarioIdioma()
  const m = getMessages(idioma)
  const supabase = await createClient()
  const { data: produtos } = await supabase
    .from('produtos')
    .select('id, nome, codigo_barras')
    .eq('ativo', true)
    .order('nome', { ascending: true })
    .limit(200)

  async function submit(formData: FormData) {
    'use server'
    const origem = String(formData.get('origem') ?? '')
    const observacao = String(formData.get('observacao') ?? '')
    const pid = String(formData.get('produto_id') ?? '')
    const qEsp = Number(formData.get('qtd_esperada'))
    const qConf = Number(formData.get('qtd_conferida'))
    if (!pid || Number.isNaN(qEsp) || Number.isNaN(qConf) || qEsp < 0 || qConf < 0) {
      redirect('/gerente/recebimento?err=1&msg=Dados%20inv%C3%A1lidos%20para%20a%20remessa')
    }
    const r = await criarRemessaConferencia({
      origem,
      observacao: observacao || undefined,
      itens: [
        {
          produto_id: pid,
          quantidade_esperada: qEsp,
          quantidade_conferida: qConf,
        },
      ],
    })
    if (!r.success) {
      redirect(`/gerente/recebimento?err=1&msg=${encodeURIComponent(r.error)}`)
    }
    redirect(`/gerente/recebimento?ok=1&msg=${encodeURIComponent(`Remessa ${r.data} confirmada com sucesso`)}`)
  }

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <Link href="/gerente" style={{ fontSize: 14, color: '#2563eb' }}>
        ← {m.gerente.inicio}
      </Link>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginTop: 16 }}>Recebimento / remessa</h1>
      <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 24 }}>
        Entrada sem NF: origem livre, conferência e aplicação de estoque na sua loja (gerente).
      </p>
      {sp.msg && (
        <div
          style={{
            marginBottom: 16,
            borderRadius: 8,
            padding: 12,
            fontSize: 13,
            border: `1px solid ${sp.err ? '#fecaca' : '#bbf7d0'}`,
            background: sp.err ? '#fef2f2' : '#f0fdf4',
            color: sp.err ? '#991b1b' : '#166534',
          }}
        >
          {sp.msg}
        </div>
      )}

      <form
        action={submit}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          padding: 16,
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>Origem (ex.: loja parceira, container)</span>
          <input name="origem" required style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 13 }}>Observação</span>
          <input name="observacao" style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>Produto</span>
          <select
            name="produto_id"
            required
            style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }}
          >
            <option value="">—</option>
            {(produtos ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome} {p.codigo_barras ? `(${p.codigo_barras})` : ''}
              </option>
            ))}
          </select>
        </label>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13 }}>Qtd. esperada</span>
            <input
              name="qtd_esperada"
              type="number"
              min={0}
              step="0.001"
              required
              style={{ width: 140, padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13 }}>Qtd. conferida</span>
            <input
              name="qtd_conferida"
              type="number"
              min={0}
              step="0.001"
              required
              style={{ width: 140, padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }}
            />
          </label>
        </div>
        <PendingSubmitButton
          idleLabel="Confirmar entrada"
          pendingLabel="Confirmando entrada..."
          style={{
            marginTop: 8,
            padding: '10px 16px',
            borderRadius: 8,
            border: 'none',
            background: '#111827',
            color: '#fff',
            fontWeight: 600,
          }}
        />
      </form>
    </div>
  )
}
