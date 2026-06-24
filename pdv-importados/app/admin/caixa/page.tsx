import { ROUTES } from '@shared-core/navigation/routes'
import { createClient } from '@/lib/supabase/server'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { MetricCard, PageHeader, SectionCard } from '@/components/ui/admin-v2'
import { formatBRL } from '@/lib/format/money'
import { CaixaHistoricoTable, type FechamentoCaixa } from './_components/CaixaHistoricoTable'

const LIMITE = 120

export default async function AdminCaixaPage() {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.caixa,
    resource: `route:${ROUTES.admin.caixa}`,
  })

  const supabase = await createClient()

  const { data: fechamentosRaw } = await supabase
    .from('caixas')
    .select('id, operador_id, data_abertura, data_fechamento, valor_inicial, valor_fechamento, saldo_atual, fechamento_diferenca, fechamento_observacao')
    .eq('status', 'FECHADO')
    .order('data_fechamento', { ascending: false })
    .limit(LIMITE)

  const operadorIds = [
    ...new Set(
      (fechamentosRaw ?? []).map((r) => r.operador_id).filter(Boolean) as string[],
    ),
  ]

  let nomesMap: Record<string, string> = {}
  if (operadorIds.length > 0) {
    const { data: operadores } = await supabase
      .from('usuarios')
      .select('id, nome')
      .in('id', operadorIds)
    if (operadores) {
      nomesMap = Object.fromEntries(operadores.map((u) => [u.id, u.nome as string]))
    }
  }

  const fechamentos: FechamentoCaixa[] = (fechamentosRaw ?? []).map((r) => ({
    id: String(r.id),
    operador_nome: r.operador_id ? (nomesMap[String(r.operador_id)] ?? null) : null,
    data_abertura: String(r.data_abertura),
    data_fechamento: String(r.data_fechamento ?? ''),
    valor_inicial: Number(r.valor_inicial ?? 0),
    valor_fechamento: r.valor_fechamento != null ? Number(r.valor_fechamento) : null,
    saldo_atual: Number(r.saldo_atual ?? 0),
    fechamento_diferenca: r.fechamento_diferenca != null ? Number(r.fechamento_diferenca) : null,
    fechamento_observacao: r.fechamento_observacao != null ? String(r.fechamento_observacao) : null,
  }))

  // KPIs rápidos
  const totalFechamentos = fechamentos.length
  const diferencaTotal = fechamentos.reduce((acc, f) => acc + (f.fechamento_diferenca ?? 0), 0)
  const caixasComDiferenca = fechamentos.filter(
    (f) => f.fechamento_diferenca != null && Math.abs(f.fechamento_diferenca) >= 0.01,
  ).length

  void session

  return (
    <div className="admin-v2-page">
      <PageHeader
        title="Caixa"
        subtitle="Histórico de fechamentos de caixa"
        breadcrumbs={[
          { label: 'Início', href: ROUTES.admin.dashboard },
          { label: 'Caixa' },
        ]}
      />

      <div className="admin-v2-stack">
        <div className="admin-v2-grid-kpi">
          <MetricCard
            label="Fechamentos"
            value={String(totalFechamentos)}
            icon="list-filter"
            tone="gold"
          />
          <MetricCard
            label="Com diferença"
            value={String(caixasComDiferenca)}
            icon="alert-circle"
            tone={caixasComDiferenca > 0 ? 'warning' : 'gold'}
          />
          <MetricCard
            label="Diferença acumulada"
            value={formatBRL(diferencaTotal)}
            icon="dollar-sign"
            tone={Math.abs(diferencaTotal) < 0.01 ? 'gold' : diferencaTotal < 0 ? 'danger' : 'success'}
          />
        </div>

        <SectionCard title="Fechamentos de caixa">
          <CaixaHistoricoTable fechamentos={fechamentos} />
        </SectionCard>
      </div>
    </div>
  )
}
