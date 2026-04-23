'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { readFormDataString } from '@/lib/forms/readFormDataString'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { getMessages } from '@/i18n/getMessages'
import { criarRemessaConferencia } from './actions'

export type RecebimentoProdutoOpt = { id: string; nome: string; codigo_barras: string | null }

type Props = Readonly<{
  idioma: Idioma
  produtos: RecebimentoProdutoOpt[]
}>

export function RecebimentoGerentePageClient({ idioma, produtos }: Props) {
  const m = getMessages(idioma)
  const router = useRouter()
  const refetch = useCallback(() => router.refresh(), [router])

  const { mutate, loading } = useGerenteMutation(
    async (p: {
      origem: string
      observacao: string
      produto_id: string
      qtd_esperada: number
      qtd_conferida: number
    }) => {
      const r = await criarRemessaConferencia({
        origem: p.origem,
        observacao: p.observacao || undefined,
        itens: [
          {
            produto_id: p.produto_id,
            quantidade_esperada: p.qtd_esperada,
            quantidade_conferida: p.qtd_conferida,
          },
        ],
      })
      if (!r.success) throw new Error(r.error)
      refetch()
      return r.data
    },
    {
      onSuccess: (id) => {
        if (id) {
          emitGerenteToast({ kind: 'success', message: `Remessa ${id} confirmada com sucesso.` })
        }
      },
    },
  )

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <Link href="/gerente" style={{ fontSize: 14, color: '#2563eb' }}>
        ← {m.gerente.inicio}
      </Link>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginTop: 16 }}>Recebimento / remessa</h1>
      <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 24 }}>
        Entrada sem NF: origem livre, conferência e aplicação de estoque na sua loja (gerente).
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          const pid = readFormDataString(fd, 'produto_id')
          const qEsp = Number(fd.get('qtd_esperada'))
          const qConf = Number(fd.get('qtd_conferida'))
          if (!pid || Number.isNaN(qEsp) || Number.isNaN(qConf) || qEsp < 0 || qConf < 0) {
            emitGerenteToast({ kind: 'error', message: 'Dados inválidos para a remessa.' })
            return
          }
          void mutate({
            origem: readFormDataString(fd, 'origem'),
            observacao: readFormDataString(fd, 'observacao'),
            produto_id: pid,
            qtd_esperada: qEsp,
            qtd_conferida: qConf,
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
          <span style={{ fontSize: 13, fontWeight: 500 }}>Origem (ex.: loja parceira, container)</span>
          <input name="origem" required style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 13 }}>Observação</span>
          <input name="observacao" style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>Produto</span>
          <select name="produto_id" required style={{ padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }}>
            <option value="">—</option>
            {produtos.map((p) => (
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
          {loading ? 'Confirmando entrada...' : 'Confirmar entrada'}
        </button>
      </form>
    </div>
  )
}
