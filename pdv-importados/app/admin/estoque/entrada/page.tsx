/**
 * FastProduct Admin — Entrada de mercadoria (ponto de partida único).
 *
 * Paridade de experiência com o Bling: lá, quem vai dar entrada em mercadoria
 * entra em "Estoque → Compras" e encontra, no mesmo lugar, Pedidos de Compra e
 * Notas Fiscais de Entrada. No Jinlong os três caminhos de entrada existem e
 * funcionam, mas viviam em telas desconectadas com vocabulários diferentes —
 * o operador precisava saber de antemão qual era a certa.
 *
 * Esta tela não executa nada: ela roteia, mostra o que já está em andamento e
 * declara o efeito de cada caminho em Estoque e Financeiro antes da escolha.
 */

import Link from 'next/link'
import { FileDown, PackageCheck, Truck } from 'lucide-react'
import {
  ROUTES,
  hrefComprasPorStatus,
  hrefFinanceiroPagar,
} from '@shared-core/navigation/routes'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { createClient } from '@/lib/supabase/server'
import { getMessages } from '@/i18n/getMessages'
import { PageHeader, SectionCard } from '@/components/ui/admin-v2'
import { EstoqueHubNav } from '@/components/ui/admin-v2/EstoqueHubNav'
import { Button } from '@/components/ui/button'
import {
  EntradaCaminhoCard,
  type CaminhoEntrada,
} from './_components/EntradaCaminhoCard'
import {
  EntradaPendencias,
  type PendenciaEntrada,
} from './_components/EntradaPendencias'

type Contagens = Readonly<{ nfe: number; oc: number; remessa: number; erro: boolean }>

const REMESSA_STATUS_ABERTOS = ['RASCUNHO', 'EM_CONFERENCIA', 'CONFERIDO', 'DIVERGENTE'] as const

async function contarEntradasEmAndamento(lojaId: string | null): Promise<Contagens> {
  if (!lojaId) return { nfe: 0, oc: 0, remessa: 0, erro: true }

  const supabase = await createClient()
  const contar = (tabela: 'importacoes_nfe' | 'ordens_compra' | 'remessas') =>
    supabase.from(tabela).select('id', { count: 'exact', head: true }).eq('loja_id', lojaId)

  const [nfe, oc, remessa] = await Promise.all([
    contar('importacoes_nfe').eq('status', 'EM_CONFERENCIA'),
    contar('ordens_compra').eq('status', 'EM_TRANSITO'),
    contar('remessas').in('status', [...REMESSA_STATUS_ABERTOS]),
  ])

  // Uma consulta que falhou não pode virar "0 em andamento": zero é uma
  // afirmação operacional, e afirmar que não há nada pendente quando não se
  // sabe é pior que dizer que não deu para consultar.
  return {
    nfe: nfe.count ?? 0,
    oc: oc.count ?? 0,
    remessa: remessa.count ?? 0,
    erro: Boolean(nfe.error ?? oc.error ?? remessa.error),
  }
}

export default async function AdminEstoqueEntradaPage() {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.estoqueEntrada,
    resource: `route:${ROUTES.admin.estoqueEntrada}`,
  })

  const e = getMessages(session.idioma).estoque.entrada
  const contagens = await contarEntradasEmAndamento(session.lojaId)

  const caminhos: readonly CaminhoEntrada[] = [
    {
      id: 'nfe',
      icone: FileDown,
      titulo: e.nfe_titulo,
      descricao: e.nfe_desc,
      cta: e.nfe_cta,
      href: ROUTES.admin.importNfe,
      efeitos: [e.efeito_estoque, e.efeito_financeiro],
      emAndamento: contagens.nfe,
    },
    {
      id: 'oc',
      icone: PackageCheck,
      titulo: e.oc_titulo,
      descricao: e.oc_desc,
      cta: e.oc_cta,
      href: hrefComprasPorStatus('EM_TRANSITO'),
      efeitos: [e.efeito_estoque],
      emAndamento: contagens.oc,
    },
    {
      id: 'remessa',
      icone: Truck,
      titulo: e.remessa_titulo,
      descricao: e.remessa_desc,
      cta: e.remessa_cta,
      href: ROUTES.admin.estoqueRecebimento,
      efeitos: [e.efeito_estoque],
      emAndamento: contagens.remessa,
    },
  ]

  const pendencias: readonly PendenciaEntrada[] = [
    { id: 'nfe', label: e.pend_nfe, total: contagens.nfe, href: ROUTES.admin.importNfe },
    {
      id: 'oc',
      label: e.pend_oc,
      total: contagens.oc,
      href: hrefComprasPorStatus('EM_TRANSITO'),
    },
    {
      id: 'remessa',
      label: e.pend_remessa,
      total: contagens.remessa,
      href: ROUTES.admin.estoqueRecebimento,
    },
  ]

  return (
    <div className="admin-v2-page">
      <EstoqueHubNav />
      <PageHeader title={e.titulo} subtitle={e.subtitulo} />

      <div className="admin-v2-stack">
        <SectionCard title={e.escolha_titulo}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {caminhos.map((caminho) => (
              <EntradaCaminhoCard
                key={caminho.id}
                caminho={caminho}
                efeitoLabel={e.efeito_label}
                emAndamentoLabel={e.em_andamento_badge}
              />
            ))}
          </div>
        </SectionCard>

        <div className="grid gap-4 lg:grid-cols-2">
          <EntradaPendencias
            titulo={e.pendencias_titulo}
            subtitulo={e.pendencias_sub}
            vazio={contagens.erro ? e.pendencias_erro : e.pendencias_vazio}
            retomarLabel={e.pend_retomar}
            pendencias={pendencias}
          />

          <SectionCard title={e.depois_titulo}>
            <ul className="space-y-2.5 text-body text-fg-muted">
              <li>{e.depois_estoque}</li>
              <li>{e.depois_financeiro}</li>
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={ROUTES.admin.estoque}>{e.ver_estoque}</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={hrefFinanceiroPagar()}>{e.ver_contas}</Link>
              </Button>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
