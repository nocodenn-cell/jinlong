import type { FinanceiroPainel } from '../financeiroLojaTypes'

export function ContaOptions({ data, incluirInativas = false }: { data: FinanceiroPainel; incluirInativas?: boolean }) {
 return <><option value="">Selecione a conta</option>{data.contas.filter(c => incluirInativas || c.ativo).map(c => <option key={c.id} value={c.id}>{c.nome}{c.ativo ? '' : ' (inativa)'}</option>)}</>
}
export function CategoriaOptions({ data, tipo }: { data: FinanceiroPainel; tipo?: 'RECEITA' | 'DESPESA' }) {
 return <><option value="">Selecione a categoria</option>{data.categorias.filter(c => c.ativo && (!tipo || c.tipo === tipo || c.tipo === 'AMBOS')).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</>
}
