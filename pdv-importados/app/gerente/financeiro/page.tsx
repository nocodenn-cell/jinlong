import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioIdioma } from '@/src/lib/idioma/usuarioIdioma'
import { getMessages } from '@/src/lib/i18n/getMessages'
import { PendingSubmitButton } from '@/components/forms/PendingSubmitButton'
import {
  criarCliente,
  criarTituloReceber,
  enfileirarDocFiscalStub,
  liquidarTitulo,
  processarFilaFiscalAgora,
  reprocessarDocumentoFiscal,
} from './actions'

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; msg?: string; err?: string }>
}) {
  const sp = await searchParams
  const { idioma } = await getUsuarioIdioma()
  const m = getMessages(idioma)
  const supabase = await createClient()
  const { data: clientes } = await supabase.from('clientes').select('id, nome').eq('ativo', true).order('nome')
  const { data: titulos } = await supabase
    .from('contas_receber')
    .select('id, valor_total, valor_aberto, status, descricao, cliente_id, clientes(nome)')
    .in('status', ['ABERTO', 'PARCIAL'])
    .order('created_at', { ascending: false })
    .limit(50)
  const { data: docsFiscais } = await supabase
    .from('documentos_fiscais_pendentes')
    .select('id, venda_id, tipo_doc, status, tentativas, ultimo_erro, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(30)

  async function submitCliente(formData: FormData) {
    'use server'
    const r = await criarCliente({
      nome: String(formData.get('nome')),
      documento: String(formData.get('documento') ?? ''),
      telefone: String(formData.get('telefone') ?? ''),
    })
    if (!r.success) {
      redirect(`/gerente/financeiro?err=1&msg=${encodeURIComponent(r.error)}`)
    }
    redirect('/gerente/financeiro?ok=1&msg=Cliente%20criado%20com%20sucesso')
  }

  async function submitTitulo(formData: FormData) {
    'use server'
    const r = await criarTituloReceber({
      cliente_id: String(formData.get('cliente_id')),
      valor_total: Number(formData.get('valor_total')),
      descricao: String(formData.get('descricao') ?? ''),
      vencimento: String(formData.get('vencimento') ?? '') || undefined,
    })
    if (!r.success) {
      redirect(`/gerente/financeiro?err=1&msg=${encodeURIComponent(r.error)}`)
    }
    redirect('/gerente/financeiro?ok=1&msg=T%C3%ADtulo%20criado%20com%20sucesso')
  }

  async function submitLiquidar(formData: FormData) {
    'use server'
    const forma = String(formData.get('forma') ?? 'DINHEIRO')
    const permitidas = ['DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'OUTROS'] as const
    const fp = (permitidas.includes(forma as (typeof permitidas)[number])
      ? forma
      : 'DINHEIRO') as (typeof permitidas)[number]
    const r = await liquidarTitulo({
      titulo_id: String(formData.get('titulo_id')),
      valor: Number(formData.get('valor')),
      forma_pagamento: fp,
    })
    if (!r.success) {
      redirect(`/gerente/financeiro?err=1&msg=${encodeURIComponent(r.error)}`)
    }
    redirect('/gerente/financeiro?ok=1&msg=Liquida%C3%A7%C3%A3o%20registrada')
  }

  async function submitFiscal(formData: FormData) {
    'use server'
    const r = await enfileirarDocFiscalStub(String(formData.get('venda_id')))
    if (!r.success) {
      redirect(`/gerente/financeiro?err=1&msg=${encodeURIComponent(r.error)}`)
    }
    redirect('/gerente/financeiro?ok=1&msg=Documento%20fiscal%20enfileirado')
  }

  async function submitProcessarFila() {
    'use server'
    const r = await processarFilaFiscalAgora(30)
    if (!r.success) {
      redirect(`/gerente/financeiro?err=1&msg=${encodeURIComponent(r.error)}`)
    }
    redirect(
      `/gerente/financeiro?ok=1&msg=${encodeURIComponent(`Fila processada: ${r.data.emitted} emitidos, ${r.data.failed} falhas`)}`,
    )
  }

  async function submitReprocessar(formData: FormData) {
    'use server'
    const r = await reprocessarDocumentoFiscal(String(formData.get('documento_id')))
    if (!r.success) {
      redirect(`/gerente/financeiro?err=1&msg=${encodeURIComponent(r.error)}`)
    }
    redirect('/gerente/financeiro?ok=1&msg=Documento%20marcado%20para%20reprocesso')
  }

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <Link href="/gerente" style={{ fontSize: 14, color: '#2563eb' }}>
        ← {m.gerente.inicio}
      </Link>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginTop: 16 }}>Financeiro &amp; fiscal (stub)</h1>
      <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 24 }}>
        Contas a receber, liquidações e fila de documento fiscal (sem Sefaz).
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

      <div style={{ display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Novo cliente</h2>
          <form action={submitCliente} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input name="nome" required placeholder="Nome" style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
            <input name="documento" placeholder="Documento" style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
            <input name="telefone" placeholder="Telefone" style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
            <PendingSubmitButton
              idleLabel="Salvar"
              pendingLabel="Salvando..."
              style={{ padding: 8, borderRadius: 8, background: '#111827', color: '#fff', border: 'none' }}
            />
          </form>
        </section>

        <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Novo título a receber</h2>
          <form action={submitTitulo} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <select name="cliente_id" required style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }}>
              {(clientes ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
            <input name="valor_total" type="number" min={0.01} step="0.01" required placeholder="Valor" style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
            <input name="descricao" placeholder="Descrição" style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
            <input name="vencimento" type="date" style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
            <PendingSubmitButton
              idleLabel="Criar"
              pendingLabel="Criando..."
              style={{ padding: 8, borderRadius: 8, background: '#111827', color: '#fff', border: 'none' }}
            />
          </form>
        </section>

        <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Fila fiscal (stub)</h2>
          <form action={submitProcessarFila} style={{ marginBottom: 12 }}>
            <PendingSubmitButton
              idleLabel="Processar fila fiscal agora"
              pendingLabel="Processando fila..."
              style={{ padding: 8, borderRadius: 8, background: '#111827', color: '#fff', border: 'none' }}
            />
          </form>
          <form action={submitFiscal} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input name="venda_id" required placeholder="UUID da venda" style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
            <PendingSubmitButton
              idleLabel="Enfileirar NFC-e"
              pendingLabel="Enfileirando..."
              style={{ padding: 8, borderRadius: 8, background: '#374151', color: '#fff', border: 'none' }}
            />
          </form>
        </section>
      </div>

      <section style={{ marginTop: 32, border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Títulos em aberto</h2>
        <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #eee' }}>
              <th style={{ padding: 8 }}>Cliente</th>
              <th style={{ padding: 8 }}>Aberto</th>
              <th style={{ padding: 8 }}>Status</th>
              <th style={{ padding: 8 }}>Liquidar</th>
            </tr>
          </thead>
          <tbody>
            {(titulos ?? []).map((t) => {
              const cn = t.clientes as { nome?: string } | { nome?: string }[] | null
              const nomeCliente = Array.isArray(cn) ? cn[0]?.nome : cn?.nome
              return (
                <tr key={t.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 8 }}>{nomeCliente ?? '—'}</td>
                  <td style={{ padding: 8 }}>{Number(t.valor_aberto).toFixed(2)}</td>
                  <td style={{ padding: 8 }}>{t.status}</td>
                  <td style={{ padding: 8 }}>
                    <form action={submitLiquidar} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <input type="hidden" name="titulo_id" value={t.id} />
                      <input name="valor" type="number" min={0.01} step="0.01" placeholder="Valor" style={{ width: 100, padding: 4 }} />
                      <select name="forma" style={{ padding: 4 }}>
                        <option value="DINHEIRO">DINHEIRO</option>
                        <option value="PIX">PIX</option>
                        <option value="OUTROS">OUTROS</option>
                      </select>
                      <PendingSubmitButton
                        idleLabel="OK"
                        pendingLabel="..."
                        style={{ padding: '4px 8px', fontSize: 12 }}
                      />
                    </form>
                  </td>
                </tr>
              )
            })}
            {(!titulos || titulos.length === 0) && (
              <tr>
                <td colSpan={4} style={{ padding: 12, color: '#6b7280' }}>
                  Nenhum título em aberto.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: 24, border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Documentos fiscais</h2>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #eee' }}>
              <th style={{ padding: 8 }}>Status</th>
              <th style={{ padding: 8 }}>Venda</th>
              <th style={{ padding: 8 }}>Tipo</th>
              <th style={{ padding: 8 }}>Tentativas</th>
              <th style={{ padding: 8 }}>Erro</th>
              <th style={{ padding: 8 }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {(docsFiscais ?? []).map((d) => (
              <tr key={d.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: 8 }}>{d.status}</td>
                <td style={{ padding: 8, fontFamily: 'monospace' }}>{String(d.venda_id).slice(0, 8)}...</td>
                <td style={{ padding: 8 }}>{d.tipo_doc}</td>
                <td style={{ padding: 8 }}>{Number(d.tentativas ?? 0)}</td>
                <td style={{ padding: 8, color: '#b91c1c' }}>{d.ultimo_erro ?? '—'}</td>
                <td style={{ padding: 8 }}>
                  {(d.status === 'ERRO' || d.status === 'PENDENTE') ? (
                    <form action={submitReprocessar}>
                      <input type="hidden" name="documento_id" value={d.id} />
                      <PendingSubmitButton
                        idleLabel="Reprocessar"
                        pendingLabel="..."
                        style={{ padding: '4px 8px', fontSize: 12 }}
                      />
                    </form>
                  ) : (
                    <span style={{ color: '#6b7280' }}>—</span>
                  )}
                </td>
              </tr>
            ))}
            {(!docsFiscais || docsFiscais.length === 0) && (
              <tr>
                <td colSpan={6} style={{ padding: 12, color: '#6b7280' }}>
                  Nenhum documento fiscal na fila.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}
