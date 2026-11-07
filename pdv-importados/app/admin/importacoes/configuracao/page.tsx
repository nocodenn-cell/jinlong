import Link from 'next/link'
import { PageHeader } from '@/components/ui/admin-v2'
import { getMessages } from '@/i18n/getMessages'
import { ROUTES } from '@/lib/navigation/routes'
import { paginaImportacoes } from '@/lib/import/hub/gateImportacoes'
import { carregarCatalogoEmpresa } from '@/lib/import/hub/configImportacao'
import { ConfiguracaoImportacao } from '../_components/ConfiguracaoImportacao'

export const dynamic = 'force-dynamic'

/** Onboarding + configuração nacional de importação (UF, porto/modal, % efetivo, alíquotas do cliente, simulador). */
export default async function ConfiguracaoImportacaoPage() {
  const ctx = await paginaImportacoes()
  const t = getMessages(ctx.session.idioma).importacoes
  const catalogo = await carregarCatalogoEmpresa(ctx.client, ctx.empresaId)
  return (
    <div className="admin-v2-page" data-testid="importacoes-configuracao">
      <PageHeader title={t.cfg_titulo} subtitle={t.cfg_subtitulo} />
      <p className="mb-4 text-small">
        <Link className="font-medium text-[var(--color-brand-primary)] underline" href={ROUTES.admin.importacoes}>← {t.cfg_voltar}</Link>
      </p>
      <ConfiguracaoImportacao t={t} catalogo={catalogo} podeEditar={catalogo !== null} />
    </div>
  )
}
