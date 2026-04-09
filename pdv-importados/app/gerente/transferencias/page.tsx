import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioIdioma } from '@/src/lib/idioma/usuarioIdioma'
import { getMessages } from '@/src/lib/i18n/getMessages'
import { executarTransferencia } from './actions'

export default async function TransferenciasPage() {
  const { idioma } = await getUsuarioIdioma()
  const m = getMessages(idioma)
  const supabase = await createClient()
  const { data: lojas } = await supabase
    .from('lojas')
    .select('id, nome, codigo')
    .eq('ativo', true)
    .order('nome')

  const podeTransferir = (lojas?.length ?? 0) >= 2

  const { data: produtos } = podeTransferir
    ? await supabase
        .from('produtos')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome')
        .limit(300)
    : { data: null }

  async function submit(formData: FormData) {
    'use server'
    await executarTransferencia({
      loja_origem_id: String(formData.get('origem')),
      loja_destino_id: String(formData.get('destino')),
      produto_id: String(formData.get('produto_id')),
      quantidade: Number(formData.get('quantidade')),
      observacao: String(formData.get('observacao') ?? '') || undefined,
    })
  }

  return (
    <div style={{ padding: 24, maxWidth: 640, margin: '0 auto' }}>
      <Link href="/gerente" style={{ fontSize: 14, color: '#2563eb' }}>
        ← {m.gerente.inicio}
      </Link>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginTop: 16 }}>Transferência entre lojas</h1>
      <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 20 }}>
        Saída na origem e entrada no destino, com log de movimento (gerente).
      </p>

      {!podeTransferir ? (
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            border: '1px solid #fde68a',
            background: '#fffbeb',
            color: '#92400e',
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          <strong>Operação indisponível com uma loja.</strong> A transferência exige pelo menos duas lojas
          cadastradas e ativas. Com loja única, todo o estoque já está na mesma unidade; use ajustes de
          entrada/saída (recebimento ou movimentos de estoque) quando existirem no fluxo do gerente.
        </div>
      ) : null}

      {podeTransferir ? (
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
            <span style={{ fontSize: 13, fontWeight: 500 }}>Loja origem</span>
            <select name="origem" required style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }}>
              {(lojas ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome} ({l.codigo})
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>Loja destino</span>
            <select name="destino" required style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }}>
              {(lojas ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome} ({l.codigo})
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>Produto</span>
            <select name="produto_id" required style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }}>
              {(produtos ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13 }}>Quantidade</span>
            <input
              name="quantidade"
              type="number"
              min={0.001}
              step="0.001"
              required
              style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db', maxWidth: 200 }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13 }}>Observação</span>
            <input name="observacao" style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
          </label>
          <button
            type="submit"
            style={{
              marginTop: 8,
              padding: '10px 16px',
              borderRadius: 8,
              border: 'none',
              background: '#111827',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Transferir
          </button>
        </form>
      ) : null}
    </div>
  )
}
