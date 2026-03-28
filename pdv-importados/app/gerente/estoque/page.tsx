import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioIdioma } from '@/src/lib/idioma/usuarioIdioma'
import { getMessages } from '@/src/lib/i18n/getMessages'
import { atualizarEstoqueProduto, garantirLinhaEstoque } from './actions'

type EstoqueRow = {
  id: string
  quantidade_atual: number
  estoque_minimo: number
}

type ProdutoComEstoque = {
  id: string
  nome: string
  codigo_barras: string | null
  unidade_medida: string
  estoque: EstoqueRow | EstoqueRow[] | null
}

type EstoqueBaixoRow = {
  id: string
  nome: string
  codigo_barras: string | null
  origem: string
  quantidade_atual: number
  estoque_minimo: number
  deficit: number
}

function normalizaEstoque(
  raw: EstoqueRow | EstoqueRow[] | null
): EstoqueRow | null {
  if (!raw) return null
  if (Array.isArray(raw)) return raw[0] ?? null
  return raw
}

export default async function EstoqueGerentePage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>
}) {
  const { filtro } = await searchParams
  const somenteBaixo = filtro === 'baixo'
  const { idioma } = await getUsuarioIdioma()
  const m = getMessages(idioma)
  const supabase = await createClient()

  let produtos: ProdutoComEstoque[] | null = null
  let estoqueBaixo: EstoqueBaixoRow[] | null = null

  if (somenteBaixo) {
    const { data } = await supabase
      .from('v_estoque_baixo')
      .select(
        'id, nome, codigo_barras, origem, quantidade_atual, estoque_minimo, deficit'
      )
    estoqueBaixo = data as EstoqueBaixoRow[] | null
  } else {
    const { data } = await supabase
      .from('produtos')
      .select(
        'id, nome, codigo_barras, unidade_medida, estoque(id, quantidade_atual, estoque_minimo)'
      )
      .eq('ativo', true)
      .order('nome', { ascending: true })
    produtos = data as ProdutoComEstoque[] | null
  }

  async function submitAtualizar(formData: FormData) {
    'use server'
    const payload = {
      produto_id: formData.get('produto_id'),
      quantidade_atual: formData.get('quantidade_atual'),
      estoque_minimo: formData.get('estoque_minimo'),
    }
    await atualizarEstoqueProduto(payload)
  }

  async function submitGarantir(produtoId: string) {
    'use server'
    await garantirLinhaEstoque({ produto_id: produtoId })
  }

  const navLink = (href: string, active: boolean, label: string) => (
    <Link
      href={href}
      style={{
        padding: '6px 12px',
        borderRadius: 8,
        fontSize: 13,
        textDecoration: 'none',
        background: active ? '#111827' : '#f3f4f6',
        color: active ? '#fff' : '#111827',
        border: active ? 'none' : '1px solid #e5e7eb',
      }}
    >
      {label}
    </Link>
  )

  return (
    <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '8px' }}>
        {m.estoque.titulo}
      </h1>
      <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 16 }}>
        {m.estoque.subtitulo}
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {navLink('/gerente/estoque', !somenteBaixo, m.estoque.nav_todos)}
        {navLink('/gerente/estoque?filtro=baixo', somenteBaixo, m.estoque.nav_baixo)}
      </div>

      {somenteBaixo ? (
        <section
          style={{
            border: '1px solid #e5e5e5',
            borderRadius: 12,
            padding: 16,
            overflowX: 'auto',
          }}
        >
          <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #eee' }}>
                <th style={{ padding: 8 }}>{m.estoque.col_produto}</th>
                <th style={{ padding: 8 }}>{m.estoque.col_codigo}</th>
                <th style={{ padding: 8 }}>{m.estoque.col_atual}</th>
                <th style={{ padding: 8 }}>{m.estoque.col_minimo}</th>
                <th style={{ padding: 8 }}>{m.estoque.col_deficit}</th>
              </tr>
            </thead>
            <tbody>
              {estoqueBaixo?.map((row) => (
                <tr key={row.id} style={{ borderBottom: '1px solid #f3f3f3' }}>
                  <td style={{ padding: 8 }}>{row.nome}</td>
                  <td style={{ padding: 8 }}>{row.codigo_barras ?? '—'}</td>
                  <td style={{ padding: 8 }}>{fmtQty(row.quantidade_atual)}</td>
                  <td style={{ padding: 8 }}>{fmtQty(row.estoque_minimo)}</td>
                  <td style={{ padding: 8, color: '#b45309', fontWeight: 600 }}>
                    {fmtQty(row.deficit)}
                  </td>
                </tr>
              ))}
              {(!estoqueBaixo || estoqueBaixo.length === 0) && (
                <tr>
                  <td colSpan={5} style={{ padding: 12, color: '#6b7280' }}>
                    {m.estoque.vazio_baixo}
                  </td>
                </tr>
 )}
            </tbody>
          </table>
          <p style={{ fontSize: 12, color: '#6b7280', marginTop: 12 }}>
            {m.estoque.dica_baixo}
          </p>
        </section>
      ) : (
        <section
          style={{
            border: '1px solid #e5e5e5',
            borderRadius: 12,
            padding: 16,
            overflowX: 'auto',
          }}
        >
          <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #eee' }}>
                <th style={{ padding: 8 }}>{m.estoque.col_produto}</th>
                <th style={{ padding: 8 }}>{m.estoque.col_codigo}</th>
                <th style={{ padding: 8 }}>{m.estoque.col_unidade}</th>
                <th style={{ padding: 8 }}>{m.estoque.col_ajuste}</th>
              </tr>
            </thead>
            <tbody>
              {produtos?.map((p) => {
                const e = normalizaEstoque(p.estoque)
                const abaixo =
                  e != null &&
                  Number(e.quantidade_atual) <= Number(e.estoque_minimo)
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f3f3f3' }}>
                    <td style={{ padding: 8 }}>
                      {p.nome}
                      {abaixo ? (
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 11,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: '#fef3c7',
                            color: '#92400e',
                          }}
                        >
                          {m.estoque.badge_alerta}
                        </span>
                      ) : null}
                    </td>
                    <td style={{ padding: 8 }}>{p.codigo_barras ?? '—'}</td>
                    <td style={{ padding: 8 }}>{p.unidade_medida}</td>
                    <td style={{ padding: 8, minWidth: 280 }}>
                      {e ? (
                        <form
                          action={submitAtualizar}
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 8,
                            alignItems: 'flex-end',
                          }}
                        >
                          <input type="hidden" name="produto_id" value={p.id} />
                          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                            <span style={{ color: '#6b7280' }}>{m.estoque.col_atual}</span>
                            <input
                              name="quantidade_atual"
                              type="number"
                              min={0}
                              step="0.001"
                              defaultValue={e.quantidade_atual}
                              required
                              style={{
                                width: 104,
                                padding: 6,
                                borderRadius: 8,
                                border: '1px solid #ddd',
                              }}
                            />
                          </label>
                          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                            <span style={{ color: '#6b7280' }}>{m.estoque.col_minimo}</span>
                            <input
                              name="estoque_minimo"
                              type="number"
                              min={0}
                              step="0.001"
                              defaultValue={e.estoque_minimo}
                              required
                              style={{
                                width: 104,
                                padding: 6,
                                borderRadius: 8,
                                border: '1px solid #ddd',
                              }}
                            />
                          </label>
                          <button
                            type="submit"
                            style={{
                              padding: '8px 12px',
                              borderRadius: 8,
                              border: 'none',
                              background: '#111827',
                              color: '#fff',
                              fontSize: 13,
                              cursor: 'pointer',
                            }}
                          >
                            {m.estoque.atualizar}
                          </button>
                        </form>
                      ) : (
                        <form action={async () => submitGarantir(p.id)}>
                          <span style={{ color: '#6b7280', marginRight: 8, fontSize: 13 }}>
                            {m.estoque.sem_linha}
                          </span>
                          <button
                            type="submit"
                            style={{
                              padding: '6px 12px',
                              borderRadius: 8,
                              border: '1px solid #d1d5db',
                              background: '#fff',
                              fontSize: 13,
                              cursor: 'pointer',
                            }}
                          >
                            {m.estoque.inicializar_estoque}
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                )
              })}
              {(!produtos || produtos.length === 0) && (
                <tr>
                  <td colSpan={4} style={{ padding: 12, color: '#6b7280' }}>
                    {m.estoque.vazio_geral}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}

function fmtQty(n: number) {
  return Number(n).toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  })
}
