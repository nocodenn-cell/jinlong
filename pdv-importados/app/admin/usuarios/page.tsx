import { ROUTES } from '@shared-core/navigation/routes'
import { createClient } from '@/lib/supabase/server'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { MetricCard, PageHeader, SectionCard } from '@/components/ui/admin-v2'
import { UsuariosTable, type UsuarioLinha, type LojaOpcao } from './_components/UsuariosTable'

export default async function AdminUsuariosPage() {
  await loadAdminContext({
    pathname: ROUTES.admin.usuarios,
    resource: `route:${ROUTES.admin.usuarios}`,
  })

  const supabase = await createClient()

  const [{ data: usuariosRaw }, { data: lojasRaw }] = await Promise.all([
    supabase
      .from('usuarios')
      .select('id, nome, perfil, idioma_preferido, ativo, created_at, loja_id')
      .order('nome', { ascending: true }),
    supabase.from('lojas').select('id, nome').order('nome'),
  ])

  const lojaNomesMap: Record<string, string> = Object.fromEntries(
    (lojasRaw ?? []).map((l) => [l.id, l.nome as string]),
  )

  const usuarios: UsuarioLinha[] = (usuariosRaw ?? []).map((u) => ({
    id: String(u.id),
    nome: String(u.nome),
    perfil: String(u.perfil),
    idioma_preferido: String(u.idioma_preferido ?? 'pt'),
    ativo: Boolean(u.ativo),
    created_at: String(u.created_at),
    loja_nome: u.loja_id ? (lojaNomesMap[String(u.loja_id)] ?? null) : null,
  }))

  const lojas: LojaOpcao[] = (lojasRaw ?? []).map((l) => ({
    id: String(l.id),
    nome: String(l.nome),
  }))

  const ativos = usuarios.filter((u) => u.ativo).length
  const inativos = usuarios.length - ativos

  return (
    <div className="admin-v2-page">
      <PageHeader
        title="Usuários"
        subtitle="Gerenciar usuários do sistema"
        breadcrumbs={[
          { label: 'Início', href: ROUTES.admin.dashboard },
          { label: 'Usuários' },
        ]}
      />

      <div className="admin-v2-stack">
        <div className="admin-v2-grid-kpi">
          <MetricCard
            label="Total de usuários"
            value={String(usuarios.length)}
            icon="list-filter"
            tone="gold"
          />
          <MetricCard
            label="Ativos"
            value={String(ativos)}
            icon="shopping-bag"
            tone="success"
          />
          <MetricCard
            label="Inativos"
            value={String(inativos)}
            icon="x-circle"
            tone={inativos > 0 ? 'warning' : 'gold'}
          />
        </div>

        <SectionCard title="Usuários cadastrados">
          <UsuariosTable usuarios={usuarios} lojas={lojas} />
        </SectionCard>
      </div>
    </div>
  )
}
