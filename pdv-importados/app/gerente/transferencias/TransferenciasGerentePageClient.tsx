'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { readFormDataString } from '@/lib/forms/readFormDataString'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { getMessages } from '@/i18n/getMessages'
import { executarTransferencia } from './actions'

export type TransferenciaLojaRow = { id: string; nome: string; codigo: string }
export type TransferenciaProdutoOpt = { id: string; nome: string }

type Props = Readonly<{
  idioma: Idioma
  lojas: TransferenciaLojaRow[]
  produtos: TransferenciaProdutoOpt[]
}>

export function TransferenciasGerentePageClient({ idioma, lojas, produtos }: Props) {
  const m = getMessages(idioma)
  const router = useRouter()
  const refetch = useCallback(() => router.refresh(), [router])

  const { mutate, loading } = useGerenteMutation(
    async (p: {
      loja_origem_id: string
      loja_destino_id: string
      produto_id: string
      quantidade: number
      observacao: string
    }) => {
      const r = await executarTransferencia({
        loja_origem_id: p.loja_origem_id,
        loja_destino_id: p.loja_destino_id,
        produto_id: p.produto_id,
        quantidade: p.quantidade,
        observacao: p.observacao || undefined,
      })
      if (!r.success) throw new Error(r.error)
      refetch()
      return null
    },
    { successMessage: 'Transferência concluída.' },
  )

  const podeTransferir = lojas.length >= 2

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
          <strong>Operação indisponível com uma loja.</strong> A transferência exige pelo menos duas lojas cadastradas e
          ativas. Com loja única, todo o estoque já está na mesma unidade; use ajustes de entrada/saída (recebimento ou
          movimentos de estoque) quando existirem no fluxo do gerente.
        </div>
      ) : null}

      {podeTransferir ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            void mutate({
              loja_origem_id: readFormDataString(fd, 'origem'),
              loja_destino_id: readFormDataString(fd, 'destino'),
              produto_id: readFormDataString(fd, 'produto_id'),
              quantidade: Number(fd.get('quantidade')),
              observacao: readFormDataString(fd, 'observacao'),
            })
          }}
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
              {lojas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome} ({l.codigo})
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>Loja destino</span>
            <select name="destino" required style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }}>
              {lojas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome} ({l.codigo})
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>Produto</span>
            <select name="produto_id" required style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }}>
              {produtos.map((p) => (
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
            disabled={loading}
            style={{
              marginTop: 8,
              padding: '10px 16px',
              borderRadius: 8,
              border: 'none',
              background: '#111827',
              color: '#fff',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Transferindo...' : 'Transferir'}
          </button>
        </form>
      ) : null}
    </div>
  )
}
