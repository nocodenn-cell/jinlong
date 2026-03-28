import { createClient } from '@/lib/supabase/server'
import { ExportCsvButton } from '@/components/gerente/ExportCsvButton'
import { criarProduto, alternarAtivoProduto } from './actions'
import { getUsuarioIdioma } from '@/src/lib/idioma/usuarioIdioma'
import { getMessages } from '@/src/lib/i18n/getMessages'

type ProdutoRow = {
  id: string
  nome: string
  codigo_barras: string | null
  preco_varejo: number
  origem: string
  tem_nf: boolean
  ativo: boolean
}

export default async function ProdutosPage() {
  const { idioma } = await getUsuarioIdioma()
  const m = getMessages(idioma)

  const supabase = await createClient()
  const { data: produtos } = await supabase
    .from('produtos')
    .select('id, nome, codigo_barras, preco_varejo, origem, tem_nf, ativo')
    .order('nome', { ascending: true })

  async function handleSubmit(formData: FormData) {
    'use server'
    const input = {
      nome: formData.get('nome'),
      codigo_barras: formData.get('codigo_barras'),
      preco_varejo: formData.get('preco_varejo'),
      origem: formData.get('origem'),
      tem_nf: formData.get('tem_nf') === 'on',
    }
    await criarProduto(input)
  }

  async function handleToggleAtivo(id: string, ativo: boolean) {
    'use server'
    await alternarAtivoProduto(id, !ativo)
  }

  return (
    <div style={{ padding: '24px', maxWidth: '960px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '16px' }}>
        {m.produtos.titulo}
      </h1>

      <section
        style={{
          border: '1px solid #e5e5e5',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '24px',
        }}
      >
        <h2 style={{ fontSize: '16px', fontWeight: 500, marginBottom: '12px' }}>
          {m.produtos.cadastro_rapido}
        </h2>
        <form action={handleSubmit} style={{ display: 'grid', gap: '8px' }}>
          <input
            name="nome"
            placeholder={m.produtos.nome}
            required
            style={{ padding: '8px', borderRadius: '8px', border: '1px solid #ddd' }}
          />
          <input
            name="codigo_barras"
            placeholder={m.produtos.codigo_barras}
            style={{ padding: '8px', borderRadius: '8px', border: '1px solid #ddd' }}
          />
          <span style={{ fontSize: 12, color: '#6b7280' }}>
            {m.produtos.codigo_barras_opcional}
          </span>
          <input
            name="preco_varejo"
            type="number"
            step="0.01"
            min="0"
            placeholder={m.produtos.preco_varejo}
            required
            style={{ padding: '8px', borderRadius: '8px', border: '1px solid #ddd' }}
          />
          <select
            name="origem"
            defaultValue="china_manual"
            style={{ padding: '8px', borderRadius: '8px', border: '1px solid #ddd' }}
          >
            <option value="china_manual">{m.produtos.origem_china}</option>
            <option value="brasil_nf">{m.produtos.origem_brasil_nf}</option>
            <option value="brasil_sem_nf">{m.produtos.origem_brasil_sem_nf}</option>
          </select>
          <label style={{ fontSize: '13px' }}>
            <input type="checkbox" name="tem_nf" /> {m.produtos.tem_nf}
          </label>
          <button
            type="submit"
            style={{
              marginTop: '4px',
              padding: '10px',
              borderRadius: '8px',
              border: 'none',
              background: '#111827',
              color: '#fff',
              fontSize: '14px',
              cursor: 'pointer',
              alignSelf: 'flex-start',
            }}
          >
            {m.comum.salvar}
          </button>
        </form>
      </section>

      <section
        style={{
          border: '1px solid #e5e5e5',
          borderRadius: '12px',
          padding: '16px',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 12,
          }}
        >
          <h2 style={{ fontSize: '16px', fontWeight: 500, margin: 0 }}>
            {m.produtos.lista_produtos}
          </h2>
          <ExportCsvButton
            label={m.gerente.exportar_csv}
            filename="gerente-produtos.csv"
            columns={[
              { key: 'id', header: 'id' },
              { key: 'nome', header: m.produtos.nome },
              { key: 'codigo_barras', header: m.produtos.codigo_barras },
              { key: 'preco_varejo', header: m.produtos.preco_varejo },
              { key: 'origem', header: m.produtos.origem_label },
              { key: 'tem_nf', header: m.produtos.tem_nf },
              { key: 'ativo', header: m.produtos.status },
            ]}
            rows={
              (produtos as ProdutoRow[] | null)?.map((p) => ({
                id: p.id,
                nome: p.nome,
                codigo_barras: p.codigo_barras ?? '',
                preco_varejo: Number(p.preco_varejo),
                origem: p.origem,
                tem_nf: p.tem_nf ? '1' : '0',
                ativo: p.ativo ? '1' : '0',
              })) ?? []
            }
          />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #eee' }}>
                <th style={{ padding: '8px' }}>{m.produtos.nome}</th>
                <th style={{ padding: '8px' }}>{m.produtos.codigo_barras}</th>
                <th style={{ padding: '8px' }}>{m.produtos.preco_varejo}</th>
                <th style={{ padding: '8px' }}>{m.produtos.origem_label}</th>
                <th style={{ padding: '8px' }}>{m.produtos.tem_nf}</th>
                <th style={{ padding: '8px' }}>{m.produtos.status}</th>
                <th style={{ padding: '8px' }}>{m.produtos.acoes}</th>
              </tr>
            </thead>
            <tbody>
              {(produtos as ProdutoRow[] | null)?.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #f3f3f3' }}>
                  <td style={{ padding: '8px' }}>{p.nome}</td>
                  <td style={{ padding: '8px' }}>{p.codigo_barras ?? '-'}</td>
                  <td style={{ padding: '8px' }}>
                    R$ {p.preco_varejo.toFixed(2).replace('.', ',')}
                  </td>
                  <td style={{ padding: '8px' }}>{p.origem}</td>
                  <td style={{ padding: '8px' }}>{p.tem_nf ? 'Sim' : 'Não'}</td>
                  <td style={{ padding: '8px' }}>{p.ativo ? 'Ativo' : 'Inativo'}</td>
                  <td style={{ padding: '8px' }}>
                    <form action={async () => handleToggleAtivo(p.id, p.ativo)}>
                      <button
                        type="submit"
                        style={{
                          padding: '4px 8px',
                          borderRadius: '999px',
                          border: '1px solid #ddd',
                          fontSize: '12px',
                          background: p.ativo ? '#fee2e2' : '#dcfce7',
                          cursor: 'pointer',
                        }}
                      >
                        {p.ativo ? m.produtos.inativar : m.produtos.ativar}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {(!produtos || produtos.length === 0) && (
                <tr>
                  <td colSpan={7} style={{ padding: '12px', fontSize: '13px', color: '#6b7280' }}>
                    {m.produtos.nenhum_produto_cadastrado}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
