'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { GerenteStatusBadge } from '@/components/gerente/GerenteStatusBadge'
import { GerenteTable } from '@/components/gerente/GerenteTable'
import { readFormDataString } from '@/lib/forms/readFormDataString'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { getMessages } from '@/i18n/getMessages'
import {
  criarCliente,
  criarTituloReceber,
  enfileirarDocFiscalStub,
  liquidarTitulo,
  processarFilaFiscalAgora,
  reprocessarDocumentoFiscal,
} from './actions'

export type FinanceiroClienteRow = { id: string; nome: string }

export type FinanceiroTituloRow = {
  id: string
  valor_total: number
  valor_aberto: number
  status: string
  descricao: string | null
  cliente_id: string
  cliente_nome: string | null
}

export type FinanceiroDocRow = {
  id: string
  venda_id: string
  tipo_doc: string
  status: string
  tentativas: number | null
  ultimo_erro: string | null
}

const FORMAS = ['DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'OUTROS'] as const

function parseForma(raw: string): (typeof FORMAS)[number] {
  return FORMAS.includes(raw as (typeof FORMAS)[number]) ? (raw as (typeof FORMAS)[number]) : 'DINHEIRO'
}

type Props = Readonly<{
  idioma: Idioma
  clientes: FinanceiroClienteRow[]
  titulos: FinanceiroTituloRow[]
  docsFiscais: FinanceiroDocRow[]
}>

export function FinanceiroGerentePageClient({ idioma, clientes, titulos, docsFiscais }: Props) {
  const m = getMessages(idioma)
  const router = useRouter()
  const refetch = useCallback(() => router.refresh(), [router])

  const { mutate: mutCliente, loading: loadCliente } = useGerenteMutation(
    async (p: { nome: string; documento: string; telefone: string }) => {
      const r = await criarCliente(p)
      if (!r.success) throw new Error(r.error)
      refetch()
      return r.data
    },
    { successMessage: 'Cliente criado com sucesso.' },
  )

  const { mutate: mutTitulo, loading: loadTitulo } = useGerenteMutation(
    async (p: { cliente_id: string; valor_total: number; descricao: string; vencimento: string }) => {
      const r = await criarTituloReceber({
        cliente_id: p.cliente_id,
        valor_total: p.valor_total,
        descricao: p.descricao || undefined,
        vencimento: p.vencimento || undefined,
      })
      if (!r.success) throw new Error(r.error)
      refetch()
      return r.data
    },
    { successMessage: 'Título criado com sucesso.' },
  )

  const { mutate: mutLiquidar, loading: loadLiquidar } = useGerenteMutation(
    async (p: { titulo_id: string; valor: number; forma_pagamento: (typeof FORMAS)[number] }) => {
      const r = await liquidarTitulo(p)
      if (!r.success) throw new Error(r.error)
      refetch()
      return null
    },
    { successMessage: 'Liquidação registrada.' },
  )

  const { mutate: mutFila, loading: loadFila } = useGerenteMutation(
    async (_: null) => {
      const r = await processarFilaFiscalAgora(30)
      if (!r.success) throw new Error(r.error)
      refetch()
      return r.data
    },
    {
      onSuccess: (data) => {
        if (data) {
          emitGerenteToast({
            kind: 'success',
            message: `Fila processada: ${data.emitted} emitidos, ${data.failed} falhas.`,
          })
        }
      },
    },
  )

  const { mutate: mutEnfileirar, loading: loadEnfileirar } = useGerenteMutation(
    async (venda_id: string) => {
      const r = await enfileirarDocFiscalStub(venda_id)
      if (!r.success) throw new Error(r.error)
      refetch()
      return null
    },
    { successMessage: 'Documento fiscal enfileirado.' },
  )

  const { mutate: mutReprocessar, loading: loadReprocessar } = useGerenteMutation(
    async (documento_id: string) => {
      const r = await reprocessarDocumentoFiscal(documento_id)
      if (!r.success) throw new Error(r.error)
      refetch()
      return null
    },
    { successMessage: 'Documento marcado para reprocesso.' },
  )

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <Link href="/gerente" style={{ fontSize: 14, color: '#2563eb' }}>
        ← {m.gerente.inicio}
      </Link>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginTop: 16 }}>Financeiro &amp; fiscal (stub)</h1>
      <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 24 }}>
        Contas a receber, liquidações e fila de documento fiscal (sem Sefaz).
      </p>

      <div style={{ display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Novo cliente</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              void mutCliente({
                nome: readFormDataString(fd, 'nome'),
                documento: readFormDataString(fd, 'documento'),
                telefone: readFormDataString(fd, 'telefone'),
              })
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
          >
            <input name="nome" required placeholder="Nome" style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
            <input name="documento" placeholder="Documento" style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
            <input name="telefone" placeholder="Telefone" style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
            <button
              type="submit"
              disabled={loadCliente}
              style={{
                padding: 8,
                borderRadius: 8,
                background: '#111827',
                color: '#fff',
                border: 'none',
                cursor: loadCliente ? 'not-allowed' : 'pointer',
                opacity: loadCliente ? 0.7 : 1,
              }}
            >
              {loadCliente ? 'Salvando...' : 'Salvar'}
            </button>
          </form>
        </section>

        <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Novo título a receber</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              void mutTitulo({
                cliente_id: readFormDataString(fd, 'cliente_id'),
                valor_total: Number(fd.get('valor_total')),
                descricao: readFormDataString(fd, 'descricao'),
                vencimento: readFormDataString(fd, 'vencimento'),
              })
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
          >
            <select name="cliente_id" required style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }}>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
            <input name="valor_total" type="number" min={0.01} step="0.01" required placeholder="Valor" style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
            <input name="descricao" placeholder="Descrição" style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
            <input name="vencimento" type="date" style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
            <button
              type="submit"
              disabled={loadTitulo}
              style={{
                padding: 8,
                borderRadius: 8,
                background: '#111827',
                color: '#fff',
                border: 'none',
                cursor: loadTitulo ? 'not-allowed' : 'pointer',
                opacity: loadTitulo ? 0.7 : 1,
              }}
            >
              {loadTitulo ? 'Criando...' : 'Criar'}
            </button>
          </form>
        </section>

        <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Fila fiscal (stub)</h2>
          <button
            type="button"
            disabled={loadFila}
            onClick={() => void mutFila(null)}
            style={{
              marginBottom: 12,
              padding: 8,
              borderRadius: 8,
              background: '#111827',
              color: '#fff',
              border: 'none',
              cursor: loadFila ? 'not-allowed' : 'pointer',
              width: '100%',
              opacity: loadFila ? 0.7 : 1,
            }}
          >
            {loadFila ? 'Processando fila...' : 'Processar fila fiscal agora'}
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              void mutEnfileirar(readFormDataString(fd, 'venda_id').trim())
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
          >
            <input name="venda_id" required placeholder="UUID da venda" style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
            <button
              type="submit"
              disabled={loadEnfileirar}
              style={{
                padding: 8,
                borderRadius: 8,
                background: '#374151',
                color: '#fff',
                border: 'none',
                cursor: loadEnfileirar ? 'not-allowed' : 'pointer',
                opacity: loadEnfileirar ? 0.7 : 1,
              }}
            >
              {loadEnfileirar ? 'Enfileirando...' : 'Enfileirar NFC-e'}
            </button>
          </form>
        </section>
      </div>

      <section style={{ marginTop: 32, border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Títulos em aberto</h2>
        <GerenteTable
          columns={[
            { key: 'c', header: 'Cliente' },
            { key: 'a', header: 'Aberto' },
            { key: 's', header: 'Status' },
            { key: 'l', header: 'Liquidar' },
          ]}
        >
          {titulos.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ padding: 12, color: '#6b7280' }}>
                Nenhum título em aberto.
              </td>
            </tr>
          ) : (
            titulos.map((t) => (
              <tr key={t.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                <td style={{ padding: 10 }}>{t.cliente_nome ?? '—'}</td>
                <td style={{ padding: 10 }}>{Number(t.valor_aberto).toFixed(2)}</td>
                <td style={{ padding: 10 }}>
                  <GerenteStatusBadge status={t.status} />
                </td>
                <td style={{ padding: 10 }}>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      const fd = new FormData(e.currentTarget)
                      const forma = parseForma(readFormDataString(fd, 'forma', 'DINHEIRO'))
                      void mutLiquidar({
                        titulo_id: t.id,
                        valor: Number(fd.get('valor')),
                        forma_pagamento: forma,
                      })
                    }}
                    style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}
                  >
                    <input name="valor" type="number" min={0.01} step="0.01" placeholder="Valor" style={{ width: 100, padding: 4 }} />
                    <select name="forma" style={{ padding: 4 }}>
                      <option value="DINHEIRO">DINHEIRO</option>
                      <option value="PIX">PIX</option>
                      <option value="CARTAO_DEBITO">CARTAO_DEBITO</option>
                      <option value="CARTAO_CREDITO">CARTAO_CREDITO</option>
                      <option value="OUTROS">OUTROS</option>
                    </select>
                    <button
                      type="submit"
                      disabled={loadLiquidar}
                      style={{ padding: '4px 8px', fontSize: 12, cursor: loadLiquidar ? 'not-allowed' : 'pointer' }}
                    >
                      {loadLiquidar ? '...' : 'OK'}
                    </button>
                  </form>
                </td>
              </tr>
            ))
          )}
        </GerenteTable>
      </section>

      <section style={{ marginTop: 24, border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Documentos fiscais</h2>
        <GerenteTable
          columns={[
            { key: 'st', header: 'Status' },
            { key: 'v', header: 'Venda' },
            { key: 'tp', header: 'Tipo' },
            { key: 't', header: 'Tentativas' },
            { key: 'e', header: 'Erro' },
            { key: 'dt', header: 'Detalhe' },
            { key: 'ac', header: 'Ações' },
          ]}
        >
          {docsFiscais.length === 0 ? (
            <tr>
              <td colSpan={7} style={{ padding: 12, color: '#6b7280' }}>
                Nenhum documento fiscal na fila.
              </td>
            </tr>
          ) : (
            docsFiscais.map((d) => (
              <tr key={d.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                <td style={{ padding: 10 }}>
                  <GerenteStatusBadge status={d.status} />
                </td>
                <td style={{ padding: 10, fontFamily: 'monospace' }}>{String(d.venda_id).slice(0, 8)}...</td>
                <td style={{ padding: 10 }}>{d.tipo_doc}</td>
                <td style={{ padding: 10 }}>{Number(d.tentativas ?? 0)}</td>
                <td style={{ padding: 10, color: '#b91c1c' }}>{d.ultimo_erro ?? '—'}</td>
                <td style={{ padding: 10 }}>
                  <Link href={`/gerente/financeiro/documento/${d.id}`} style={{ fontSize: 13, color: '#2563eb' }}>
                    Ver timeline
                  </Link>
                </td>
                <td style={{ padding: 10 }}>
                  {d.status === 'ERRO' || d.status === 'PENDENTE' ? (
                    <button
                      type="button"
                      disabled={loadReprocessar}
                      onClick={() => void mutReprocessar(d.id)}
                      style={{ padding: '4px 8px', fontSize: 12, cursor: loadReprocessar ? 'not-allowed' : 'pointer' }}
                    >
                      {loadReprocessar ? '...' : 'Reprocessar'}
                    </button>
                  ) : (
                    <span style={{ color: '#6b7280' }}>—</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </GerenteTable>
      </section>
    </div>
  )
}
