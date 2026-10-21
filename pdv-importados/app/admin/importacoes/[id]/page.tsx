import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader, StatusBadge, type StatusBadgeTone } from '@/components/ui/admin-v2'
import { getMessages } from '@/i18n/getMessages'
import { IMPORTACAO_ABAS, ROUTES, adminImportacaoHref, type ImportacaoAba } from '@/lib/navigation/routes'
import { paginaImportacoes } from '@/lib/import/hub/gateImportacoes'
import { carregarCatalogoEmpresa } from '@/lib/import/hub/configImportacao'
import { carregarApuracao, carregarOperacao, opcoesCadastro } from '@/lib/import/hub/dadosImportacoes'
import { cn } from '@/lib/utils'
import { ResumoSecao } from '../_components/ResumoSecao'
import { MercadoriasSecao } from '../_components/MercadoriasSecao'
import { LancamentosSecao } from '../_components/LancamentosSecao'
import { DocumentosSecao } from '../_components/DocumentosSecao'
import { ApuracaoSecao } from '../_components/ApuracaoSecao'
import { VersoesSecao } from '../_components/VersoesSecao'
import { TributosSecao } from '../_components/TributosSecao'
import { XmlImportacaoSecao } from '../_components/XmlImportacaoSecao'
import { DossieSecao } from '../_components/DossieSecao'
import { PrecificacaoSecao } from '../_components/PrecificacaoSecao'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TOM: Record<string, StatusBadgeTone> = { RASCUNHO: 'warning', APROVADA: 'success', CANCELADA: 'neutral' }

type PageProps = {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ aba?: string; apuracao?: string; comparar?: string }>
}

export default async function ImportacaoDetalhePage({ params, searchParams }: PageProps) {
  const ctx = await paginaImportacoes()
  const { id } = await params
  if (!UUID_RE.test(id)) notFound()
  const sp = (searchParams ? await searchParams : {}) ?? {}
  const aba: ImportacaoAba = IMPORTACAO_ABAS.includes(sp.aba as ImportacaoAba) ? (sp.aba as ImportacaoAba) : 'resumo'
  const t = getMessages(ctx.session.idioma).importacoes

  // RLS: operação de outra empresa (ou sem licença) simplesmente não existe para o usuário
  const dados = await carregarOperacao(ctx.client, id)
  if (!dados) notFound()
  const o = dados.operacao
  const editavel = o.status === 'RASCUNHO'

  const idSel =
    (sp.apuracao && UUID_RE.test(sp.apuracao) && dados.apuracoes.some((a) => a.id === sp.apuracao) ? sp.apuracao : null) ??
    (aba === 'versoes' && o.apuracao_aprovada_id ? o.apuracao_aprovada_id : dados.apuracoes[0]?.id ?? null)
  const precisaApuracao = aba === 'apuracao' || aba === 'versoes'
  // Precificação: estimado = última SIMULAÇÃO OK; real = apuração aprovada (ou última APURAÇÃO OK)
  const ultimaSim = dados.apuracoes.find((x) => x.tipo === 'SIMULACAO' && x.status_calculo === 'OK')
  const ultimaReal = (o.apuracao_aprovada_id ? dados.apuracoes.find((x) => x.id === o.apuracao_aprovada_id) : undefined)
    ?? dados.apuracoes.find((x) => x.tipo === 'APURACAO' && x.status_calculo === 'OK')
  const [precEst, precReal] = aba === 'precificacao'
    ? await Promise.all([
        ultimaSim ? carregarApuracao(ctx.client, id, ultimaSim.id) : Promise.resolve(null),
        ultimaReal ? carregarApuracao(ctx.client, id, ultimaReal.id) : Promise.resolve(null),
      ])
    : [null, null]
  const basePreco = (x: typeof precEst) =>
    x ? { versao: x.versao, tipo: x.tipo, aprovada: x.id === o.apuracao_aprovada_id, itens: x.saida.itens.map((i) => ({ item_id: i.item_id, custo_unitario_brl: i.custo_unitario_brl })) } : null

  const [selecionada, comparada, opcoes] = await Promise.all([
    precisaApuracao && idSel ? carregarApuracao(ctx.client, id, idSel) : Promise.resolve(null),
    aba === 'versoes' && sp.comparar && UUID_RE.test(sp.comparar) ? carregarApuracao(ctx.client, id, sp.comparar) : Promise.resolve(null),
    aba === 'resumo' ? opcoesCadastro(ctx.client) : Promise.resolve({ lojas: [], fornecedores: [] }),
  ])

  const rotulos: Record<ImportacaoAba, string> = {
    resumo: t.aba_resumo,
    mercadorias: t.aba_mercadorias,
    lancamentos: t.aba_lancamentos,
    documentos: t.aba_documentos,
    apuracao: t.aba_apuracao,
    versoes: t.aba_versoes,
    tributos: t.aba_tributos,
    precificacao: t.aba_precificacao,
  }
  const moedaPadrao = o.moeda ?? 'USD'

  return (
    <div className="admin-v2-page" data-testid="importacao-detalhe">
      <PageHeader
        title={o.referencia}
        subtitle={`${dados.lojaNome ?? ''}${dados.fornecedorNome ? ` · ${dados.fornecedorNome}` : ''}`}
        actions={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={o.apuracao_aprovada_id ? 'success' : 'warning'}>
              <span data-testid="imp-estado-custo" title={t.custo_estado_hint}>{o.apuracao_aprovada_id ? t.custo_aprovado : t.custo_provisorio}</span>
            </StatusBadge>
            <StatusBadge tone={TOM[o.status]}>{t[`status_${o.status}`]}</StatusBadge>
          </span>
        }
      />
      <p className="mb-3 text-small">
        <Link href={ROUTES.admin.importacoes} className="underline-offset-4 hover:underline">← {t.voltar_lista}</Link>
      </p>
      {!editavel ? (
        <p role="status" className="mb-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2 text-small" data-testid="imp-somente-leitura">
          {t.somente_leitura}
        </p>
      ) : null}

      <nav aria-label={t.titulo} className="mb-5 border-b border-[var(--color-border)]">
        <ul className="flex flex-wrap gap-1" role="list">
          {IMPORTACAO_ABAS.map((a) => (
            <li key={a}>
              <Link
                href={adminImportacaoHref(id, { aba: a })}
                aria-current={a === aba ? 'page' : undefined}
                data-testid={`imp-aba-${a}`}
                className={cn(
                  '-mb-px inline-block border-b-2 px-3 py-2 text-small font-medium outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70',
                  a === aba ? 'border-[var(--color-brand-primary)] text-[var(--color-brand-primary)]' : 'border-transparent text-fg-subtle hover:text-fg',
                )}
              >
                {rotulos[a]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {aba === 'resumo' ? (
        <ResumoSecao t={t} operacao={o} lojaNome={dados.lojaNome} fornecedores={opcoes.fornecedores} cambios={dados.cambios} editavel={editavel} />
      ) : null}
      {aba === 'mercadorias' ? (
        <MercadoriasSecao t={t} operacaoId={id} itens={dados.itens} produtos={dados.produtos} moedaPadrao={moedaPadrao} editavel={editavel} />
      ) : null}
      {aba === 'lancamentos' ? (
        <LancamentosSecao t={t} operacaoId={id} itens={dados.itens} tributos={dados.tributos} despesas={dados.despesas}
          descontos={dados.descontos} documentos={dados.documentos} moedaPadrao={moedaPadrao} editavel={editavel} />
      ) : null}
      {aba === 'documentos' ? (
        <div className="mb-4 flex flex-col gap-4">
          <DossieSecao t={t} dados={{ documentos: dados.documentos, itens: dados.itens, despesas: dados.despesas, tributos: dados.tributos, descontos: dados.descontos }} />
          <XmlImportacaoSecao t={t} operacaoId={id} editavel={editavel} />
        </div>
      ) : null}
      {aba === 'tributos' ? (
        <TributosSecao t={t} operacaoId={id} itens={dados.itens} cambios={dados.cambios} tributos={dados.tributos}
          dataPadrao={o.data_desembaraco ?? new Date().toISOString().slice(0, 10)} editavel={editavel}
          catalogo={await carregarCatalogoEmpresa(ctx.client, ctx.empresaId)} />
      ) : null}
      {aba === 'precificacao' ? (
        <PrecificacaoSecao t={t} nomes={Object.fromEntries(dados.itens.map((i) => [i.id, i.descricao]))} estimado={basePreco(precEst)} real={basePreco(precReal)} />
      ) : null}
      {aba === 'documentos' ? (
        <DocumentosSecao t={t} operacaoId={id} documentos={dados.documentos} usuarios={dados.usuarios} podeRegistrar={o.status !== 'CANCELADA'} />
      ) : null}
      {aba === 'apuracao' ? (
        <ApuracaoSecao t={t} operacaoId={id} apuracao={selecionada} itens={dados.itens} versaoDadosOperacao={o.versao_dados}
          usuarios={dados.usuarios} podeCalcular={editavel} despesas={dados.despesas} tributos={dados.tributos}
          descontos={dados.descontos} documentos={dados.documentos} />
      ) : null}
      {aba === 'versoes' ? (
        <VersoesSecao t={t} operacao={o} apuracoes={dados.apuracoes} selecionada={selecionada} comparada={comparada}
          itens={dados.itens} lancamentos={[...dados.despesas, ...dados.tributos]} aprovacoes={dados.aprovacoes}
          auditoria={dados.auditoria} usuarios={dados.usuarios} ehDono={ctx.ehDono} />
      ) : null}
    </div>
  )
}
