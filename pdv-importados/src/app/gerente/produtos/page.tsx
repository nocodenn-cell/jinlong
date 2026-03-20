import { createClient } from '@/lib/supabase/server'
import { criarProduto, alternarAtivoProduto } from '@/app/gerente/produtos/actions'

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
        Produtos
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
          Cadastro rápido
        </h2>
        <form action={handleSubmit} style={{ display: 'grid', gap: '8px' }}>
          <input
            name="nome"
            placeholder="Nome do produto"
            required
            style={{ padding: '8px', borderRadius: '8px', border: '1px solid #ddd' }}
          />
          <input
            name="codigo_barras"
            placeholder="Código de barras"
            style={{ padding: '8px', borderRadius: '8px', border: '1px solid #ddd' }}
          />
          <input
            name="preco_varejo"
            type="number"
            step="0.01"
            min="0"
            placeholder="Preço varejo (R$)"
            required
            style={{ padding: '8px', borderRadius: '8px', border: '1px solid #ddd' }}
          />
          <select
            name="origem"
            defaultValue="china_manual"
            style={{ padding: '8px', borderRadius: '8px', border: '1px solid #ddd' }}
          >
            <option value="china_manual">China (sem NF)</option>
            <option value="brasil_nf">Brasil (com NF)</option>
            <option value="brasil_sem_nf">Brasil (sem NF)</option>
          </select>
          <label style={{ fontSize: '13px' }}>
            <input type="checkbox" name="tem_nf" /> Tem nota fiscal
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
            Salvar produto
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
        <h2 style={{ fontSize: '16px', fontWeight: 500, marginBottom: '12px' }}>
          Lista de produtos
        </h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #eee' }}>
                <th style={{ padding: '8px' }}>Nome</th>
                <th style={{ padding: '8px' }}>Código</th>
                <th style={{ padding: '8px' }}>Preço</th>
                <th style={{ padding: '8px' }}>Origem</th>
                <th style={{ padding: '8px' }}>NF</th>
                <th style={{ padding: '8px' }}>Status</th>
                <th style={{ padding: '8px' }}>Ações</th>
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
                        {p.ativo ? 'Inativar' : 'Ativar'}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {(!produtos || produtos.length === 0) && (
                <tr>
                  <td colSpan={7} style={{ padding: '12px', fontSize: '13px', color: '#6b7280' }}>
                    Nenhum produto cadastrado ainda.
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

