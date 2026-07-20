import { PageHeader } from '@/components/ui/admin-v2'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages } from '@/i18n/getMessages'
import { ROUTES } from '@shared-core/navigation/routes'
import { IMPLANTACAO_ITENS, type ImplantacaoSecao } from './implantacaoCatalog'
import { carregarChecklistImplantacaoAction } from './actions'
import { ImplantacaoChecklistClient } from './ImplantacaoChecklistClient'

type PageProps = {
  searchParams?: Promise<{ lojaId?: string }>
}

export default async function AdminImplantacaoPage({ searchParams }: PageProps) {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.implantacao,
    resource: `route:${ROUTES.admin.implantacao}`,
  })
  const m = getMessages(session.idioma)
  const ui = m.implantacao

  const params = searchParams ? await searchParams : undefined
  const lojaIdOverride =
    session.perfil === 'ADMIN' && params?.lojaId?.trim() ? params.lojaId.trim() : null

  const loaded = await carregarChecklistImplantacaoAction(lojaIdOverride)
  const podeAutorizarGo = session.perfil === 'DONO' || session.perfil === 'ADMIN'

  const secoes = Object.fromEntries(
    (['ambiente', 'loja', 'usuarios', 'cadastro', 'operacao', 'financeiro', 'fiscal', 'homologacao'] as ImplantacaoSecao[]).map(
      (s) => [s, ui.secoes[s]],
    ),
  ) as Record<ImplantacaoSecao, string>

  const itens = Object.fromEntries(
    IMPLANTACAO_ITENS.map((i) => [i.key, ui.itens[i.key as keyof typeof ui.itens] ?? i.key]),
  ) as Record<string, string>

  const subtitle =
    lojaIdOverride && loaded.ok
      ? `${ui.subtitulo} · loja ${loaded.data.lojaId.slice(0, 8)}…`
      : ui.subtitulo

  return (
    <div className="admin-v2-page">
      <PageHeader title={ui.titulo} subtitle={subtitle} />
      {!loaded.ok ? (
        <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {loaded.error}
        </p>
      ) : (
        <ImplantacaoChecklistClient
          inicial={loaded.data}
          podeAutorizarGo={podeAutorizarGo}
          locale={session.idioma}
          labels={{
            gateNaoPronto: ui.gate_nao_pronto,
            gateProntoPendencias: ui.gate_pronto_pendencias,
            gateGoLive: ui.gate_go_live,
            bloqueiosTitulo: ui.bloqueios_titulo,
            autorizar: ui.autorizar,
            autorizando: ui.autorizando,
            revogar: ui.revogar,
            revogando: ui.revogando,
            motivoRevogar: ui.motivo_revogar,
            observacaoGo: ui.observacao_go,
            colItem: ui.col_item,
            colStatus: ui.col_status,
            colResponsavel: ui.col_responsavel,
            colData: ui.col_data,
            colObs: ui.col_obs,
            statusPendente: ui.status_pendente,
            statusConcluido: ui.status_concluido,
            statusNa: ui.status_na,
            obrigatorio: ui.obrigatorio,
            opcional: ui.opcional,
            grupoFiscalHint: ui.grupo_fiscal_hint,
            salvar: ui.salvar,
            itemSalvo: ui.item_salvo,
            validarDados: ui.validar_dados,
            validandoDados: ui.validando_dados,
            dadosOk: ui.dados_ok,
            dadosFalha: ui.dados_falha,
            timelineTitulo: ui.timeline_titulo,
            timelineVazio: ui.timeline_vazio,
            evidenciaHint: ui.evidencia_hint,
            secoes,
            itens,
          }}
        />
      )}
    </div>
  )
}
