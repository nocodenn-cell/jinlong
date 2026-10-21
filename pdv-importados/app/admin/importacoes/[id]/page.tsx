import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader, StatusBadge, type StatusBadgeTone } from '@/components/ui/admin-v2'
import { getMessages } from '@/i18n/getMessages'
import { IMPORTACAO_ABAS, ROUTES, adminImportacaoHref, type ImportacaoAba } from '@/lib/navigation/routes'
import { paginaImportacoes } from '@/lib/import/hub/gateImportacoes'
import { carregarApuracao, carregarOperacao, opcoesCadastro } from '@/lib/import/hub/dadosImportacoes'
import { cn } from '@/lib/utils'
import { ResumoSecao } from '../_components/ResumoSecao'
import { MercadoriasSecao } from '../_components/MercadoriasSecao'
import { LancamentosSecao } from '../_components/LancamentosSecao'
import { DocumentosSecao } from '../_components/DocumentosSecao'
import { ApuracaoSecao } from '../_components/ApuracaoSecao'
import { VersoesSecao } from '../_components/VersoesSecao'

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
  }
  const moedaPadrao = o.moeda ?? 'USD'

  return (
    <div className="admin-v2-page" data-testid="importacao-detalhe">
      <PageHeader
        title={o.referencia}
        subtitle={`${dados.lojaNome ?? ''}${dados.fornecedorNome ? ` · ${dados.fornecedorNome}` : ''}`}
        actions={<StatusBadge tone={TOM[o.status]}>{t[`status_${o.status}`]}</StatusBadge>}
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
          descontos={dados.descontos} moedaPadrao={moedaPadrao} editavel={editavel} />
      ) : null}
      {aba === 'documentos' ? (
        <DocumentosSecao t={t} operacaoId={id} documentos={dados.documentos} usuarios={dados.usuarios} podeRegistrar={o.status !== 'CANCELADA'} />
      ) : null}
      {aba === 'apuracao' ? (
        <ApuracaoSecao t={t} operacaoId={id} apuracao={selecionada} itens={dados.itens} versaoDadosOperacao={o.versao_dados}
          usuarios={dados.usuarios} podeCalcular={editavel} />
      ) : null}
      {aba === 'versoes' ? (
        <VersoesSecao t={t} operacao={o} apuracoes={dados.apuracoes} selecionada={selecionada} comparada={comparada}
          itens={dados.itens} lancamentos={[...dados.despesas, ...dados.tributos]} aprovacoes={dados.aprovacoes}
          auditoria={dados.auditoria} usuarios={dados.usuarios} ehDono={ctx.ehDono} />
      ) : null}
    </div>
  )
}
