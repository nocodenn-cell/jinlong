'use client'

import { labelStatusOperacional } from '@/lib/format/vendaLabels'
import Link from 'next/link'
import { FileText, ClipboardList, PackagePlus, Truck, History } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type Column } from '@/components/ui/DataTable'
import { readFormDataString } from '@/lib/forms/readFormDataString'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { fmtGerenteDateTime, fmtGerenteIdCurto } from '@/lib/format/gerenteValues'
import { formatDecimalPlaces } from '@/lib/format/money'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { getMessages } from '@/i18n/getMessages'
import { fmtTemplate } from '@/i18n/fmtTemplate'
import { PageHeader, SectionCard } from '@/components/ui/admin-v2'
import { Button } from '@/components/ui/button'
import { StatusChip } from '@/components/ui/StatusChip'
import { Field, Input } from '@/components/ui/forms'
import { ROUTES } from '@/lib/navigation/routes'
import { criarRemessaConferencia } from './actions'
import { produtosPendentes, ItensPedidoRecebimento } from './ItensPedidoRecebimento'
import { ImportarNfePageClient } from '../estoque/importar-nfe/ImportarNfePageClient'
import { obterOrdemCompraDetalhe, type OcDetalheDTO, type OcListaDTO } from '../compras/actions'
import { fmtQtd, textoPosEntrada } from '../compras/ocRecebimento'
import { ProdutoRecebimentoAutocomplete } from './ProdutoRecebimentoAutocomplete'
import { HistoricoEntregas } from './HistoricoEntregas'
import { OrdemCompraVinculoAutocomplete } from './OrdemCompraVinculoAutocomplete'

const VIA_ICONS = { NFE: FileText, ORDEM_COMPRA: ClipboardList, SEM_DOCUMENTO: PackagePlus, FISICA: Truck, HISTORICO: History }

export type RecebimentoProdutoOpt = { id: string; nome: string; codigo_barras: string | null }

export type RemessaRecenteRow = {
  id: string
  origem_descricao: string
  status: string
  created_at: string
}

type Props = Readonly<{
  idioma: Idioma
  /** Há ao menos um produto na loja? Sem isso o formulário fica desabilitado. */
  temProdutos: boolean
  remessasRecentes: RemessaRecenteRow[]
  /** Admin hub S6: oculta link “voltar” redundante com abas de estoque. */
  embeddedInAdminHub?: boolean
  /** Deep-link "Repor" a partir de um item crítico em `/admin/estoque`. */
  produtoPreSelecionado?: RecebimentoProdutoOpt | null
}>

export function RecebimentoGerentePageClient({
  idioma,
  temProdutos,
  remessasRecentes,
  embeddedInAdminHub = false,
  produtoPreSelecionado = null,
}: Props) {
  const m = getMessages(idioma)
  const r = m.gerente.recebimento_page
  const locale = useMemo(() => localeFromIdioma(idioma), [idioma])
  const router = useRouter()
  const refetch = useCallback(() => router.refresh(), [router])
  const semProdutos = !temProdutos

  const [qtdEspStr, setQtdEspStr] = useState('')
  const [qtdConfStr, setQtdConfStr] = useState('')
  const idempotencyKeyRef = useRef(crypto.randomUUID())
  // Depois de confirmar a entrada o formulário volta ao estado inicial: com os
  // campos preenchidos e uma nova chave de idempotência, um segundo clique
  // criaria outra entrada (e outro crédito de estoque) com os mesmos dados.
  const [formKey, setFormKey] = useState(0)
  const [usarProdutoPreSelecionado, setUsarProdutoPreSelecionado] = useState(true)
  const searchParams = useSearchParams()
  const [via, setVia] = useState<'SEM_DOCUMENTO' | 'ORDEM_COMPRA' | 'NFE' | 'HISTORICO' | 'FISICA'>(searchParams.get('modo') === 'pedido' ? 'ORDEM_COMPRA' : searchParams.get('modo') === 'nfe' ? 'NFE' : searchParams.get('modo') === 'historico' ? 'HISTORICO' : 'SEM_DOCUMENTO')
  const [ocEscolhida, setOcEscolhida] = useState<OcListaDTO | null>(null)
  const [ocSaldo, setOcSaldo] = useState<OcDetalheDTO | null>(null)
  const [ocSaldoCarregando, setOcSaldoCarregando] = useState(false)
  const [ocSaldoErro, setOcSaldoErro] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)
  // Produto escolhido no autocomplete (só para mostrar o nome na confirmação).
  const [produtoEscolhido, setProdutoEscolhido] = useState<RecebimentoProdutoOpt | null>(
    produtoPreSelecionado,
  )

  const pedidoInicial = searchParams.get('oc')
  useEffect(() => {
    if (!pedidoInicial) return
    let ativo = true
    void obterOrdemCompraDetalhe(pedidoInicial).then((res) => {
      if (!ativo) return
      if (res.success && ['CONFIRMADA', 'EM_TRANSITO'].includes(res.data.status)) setOcEscolhida(res.data)
      else setOcSaldoErro(true)
    }).catch(() => { if (ativo) setOcSaldoErro(true) })
    return () => { ativo = false }
  }, [pedidoInicial])

  // Saldo por item do pedido escolhido, para o operador ver o que ainda falta ANTES de lançar.
  useEffect(() => {
    if (!ocEscolhida) {
      setOcSaldo(null)
      setOcSaldoErro(false)
      return
    }
    let ativo = true
    setOcSaldoCarregando(true)
    setOcSaldoErro(false)
    void obterOrdemCompraDetalhe(ocEscolhida.id)
      .then((res) => {
        if (!ativo) return
        setOcSaldo(res.success ? res.data : null)
        setOcSaldoErro(!res.success)
      })
      .catch(() => {
        if (!ativo) return
        setOcSaldo(null)
        setOcSaldoErro(true)
      })
      .finally(() => {
        if (ativo) setOcSaldoCarregando(false)
      })
    return () => {
      ativo = false
    }
  }, [ocEscolhida])

  const escolherVia = useCallback((v: 'SEM_DOCUMENTO' | 'ORDEM_COMPRA' | 'NFE' | 'HISTORICO' | 'FISICA') => {
    setVia(v)
    if (v !== 'ORDEM_COMPRA') {
      // Sem documento não há expectativa: some o campo e a divergência deixa de existir.
      setOcEscolhida(null)
      setQtdEspStr('')
    }
  }, [])

  const divergenciaDetalhe = useMemo(() => {
    if (via !== 'ORDEM_COMPRA') return null
    const esp = Number(qtdEspStr.replace(',', '.'))
    const conf = Number(qtdConfStr.replace(',', '.'))
    if (qtdEspStr === '' || qtdConfStr === '') return null
    if (Number.isNaN(esp) || Number.isNaN(conf)) return null
    if (esp === conf) return null
    const delta = esp - conf
    const abs = Math.abs(delta)
    const pct = esp > 1e-9 ? (abs / esp) * 100 : 100
    const grave = pct >= 10 || abs >= 5
    return { esp, conf, delta, abs, pct, grave }
  }, [via, qtdEspStr, qtdConfStr])

  const numLocale = idioma === 'pt' ? 'pt-BR' : 'zh-CN'

  const { mutate, loading } = useGerenteMutation(
    async (p: {
      origem: string
      observacao: string
      produto_id: string
      produto_nome: string
      /** Ausente na entrada sem documento (a action assume esperada = conferida). */
      qtd_esperada?: number
      qtd_conferida: number
      /** Produtos adicionais da mesma entrada (UX-018). */
      adicionais?: Array<{ produto_id: string; qtd_conferida: number; qtd_esperada?: number }>
      idempotency_key: string
      ordem_compra_id: string
    }) => {
      const res = await criarRemessaConferencia({
        origem: p.origem,
        observacao: p.observacao || undefined,
        idempotency_key: p.idempotency_key,
        ordemCompraId: p.ordem_compra_id || undefined,
        itens: [
          {
            produto_id: p.produto_id,
            ...(p.qtd_esperada !== undefined ? { quantidade_esperada: p.qtd_esperada } : {}),
            quantidade_conferida: p.qtd_conferida,
          },
          ...(p.adicionais ?? []).map((a) => ({
            produto_id: a.produto_id,
            quantidade_conferida: a.qtd_conferida,
            quantidade_esperada: a.qtd_esperada,
          })),
        ],
      })
      if (!res.success) throw new Error(res.error)
      refetch()
      return {
        ...res.data,
        produtoNome: p.produto_nome,
        creditado: p.qtd_conferida,
        totalProdutos: 1 + (p.adicionais?.length ?? 0),
      }
    },
    {
      onSuccess: (data) => {
        if (data) {
          const id = fmtGerenteIdCurto(data.remessaId)
          idempotencyKeyRef.current = crypto.randomUUID()
          setQtdEspStr('')
          setQtdConfStr('')
          setUsarProdutoPreSelecionado(false)
          setOcEscolhida(null)
          setProdutoEscolhido(null)
          setFormKey((k) => k + 1)
          // Depois da entrada: o que mudou de fato (estoque, saldo do pedido, se o pedido fechou),
          // não uma mensagem genérica.
          const vars = { id, produto: data.produtoNome, qtd: fmtQtd(data.creditado) }
          const saldo =
            data.saldoAtual === null || data.saldoAtual === undefined
              ? ''
              : ` ${fmtTemplate(r.resultado_saldo, { n: fmtQtd(data.saldoAtual) })}`
          const texto = data.totalProdutos > 1
            ? fmtTemplate(r.resultado_multi, { id, n: String(data.totalProdutos) })
            : data.oc
            ? `${fmtTemplate(r.resultado_com_pedido, vars)} ${textoPosEntrada(
                { estoque: m.compras.pos_entrada_estoque, parcial: m.compras.pos_entrada_parcial, completo: m.compras.resumo_completo },
                data.oc,
                data.creditado,
              )}${saldo}`
            : `${fmtTemplate(r.resultado_sem_pedido, vars)}${saldo}`
          setResultado(texto)
          emitGerenteToast({ kind: 'success', message: texto })
        }
      },
    },
  )

  const remessaColumns: Column<RemessaRecenteRow>[] = useMemo(
    () => [
      {
        key: 'id',
        header: r.col_remessa,
        priority: 'primary',
        cell: (row) => (
          <span className="font-mono text-caption">{fmtGerenteIdCurto(row.id)}</span>
        ),
      },
      {
        key: 'origem',
        header: r.col_origem,
        cell: (row) => (
          <span className="max-w-[220px] truncate text-body" title={row.origem_descricao}>
            {row.origem_descricao}
          </span>
        ),
      },
      {
        key: 'status',
        header: m.gerente.col_status,
        cell: (row) => <StatusChip status={row.status} label={labelStatusOperacional(row.status, m)} />,
      },
      {
        key: 'data',
        header: r.col_data,
        priority: 'contextual',
        cell: (row) => (
          <span className="whitespace-nowrap tabular-nums text-body">
            {fmtGerenteDateTime(row.created_at, locale)}
          </span>
        ),
      },
    ],
    [locale, m, r.col_data, r.col_origem, r.col_remessa],
  )

  return (
    <div
      className={
        embeddedInAdminHub
          ? idioma === 'pt'
            ? ''
            : 'font-chinese'
          : `admin-v2-page ${idioma === 'pt' ? '' : 'font-chinese'}`
      }
    >
      <PageHeader
        title={r.titulo}
        subtitle={r.subtitulo}
        filters={
          <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2.5 py-0.5 text-caption font-semibold text-fg-muted">
            {via === 'ORDEM_COMPRA' ? r.badge_pedido : r.badge}
          </span>
        }
      />

      {!embeddedInAdminHub ? (
        <Link href={ROUTES.admin.estoque} className="gerente-nav-back text-sm font-medium hover:underline">
          ← {m.gerente.inicio}
        </Link>
      ) : null}

      {semProdutos && (via === 'ORDEM_COMPRA' || via === 'FISICA') ? (
        <div
          className="mt-8 rounded-xl border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] p-5 text-[var(--color-warning-strong)] shadow-sm"
          role="status"
        >
          <p className="font-semibold">{r.sem_produtos_titulo}</p>
          <p className="mt-2 text-body">{r.sem_produtos_texto}</p>
          <Link
            href={ROUTES.admin.catalogo}
            className="mt-4 inline-flex text-body font-semibold underline decoration-current/60 underline-offset-2"
          >
            {r.link_produtos}
          </Link>
        </div>
      ) : null}

      <SectionCard title={r.sec_formulario} className="mt-8">
            {/* Como chegou? — a mesma entrada, três caminhos, sem tela nova. */}
            <div className="mb-6" data-testid="rec-como-chegou">
              <p className="mb-1.5 text-caption font-semibold text-fg-muted">{r.como_chegou}</p>
              <div role="group" aria-label={r.como_chegou} className="flex flex-wrap gap-2">
                {(
                  [
                    ['NFE', r.via_nfe],
                    ['ORDEM_COMPRA', r.via_pedido],
                    ['SEM_DOCUMENTO', idioma === 'pt' ? 'Sem documento, com valores' : '无单据，已知金额'],
                    ['FISICA', idioma === 'pt' ? 'Receber sem valores' : '仅收货，金额未知'],
                    ['HISTORICO', idioma === 'pt' ? 'Histórico de entradas' : '入库记录'],
                  ] as const
                ).map(([v, rotulo]) => { const Icon = VIA_ICONS[v]; return (
                  <Button
                    variant={via === v ? 'primary' : 'outline'}
                    key={v}
                    type="button"
                    aria-pressed={via === v}
                    onClick={() => escolherVia(v)}
                    disabled={loading}
                  >
                    <Icon aria-hidden />{rotulo}
                  </Button>
                )})}
              </div>
              {via !== 'SEM_DOCUMENTO' && via !== 'HISTORICO' ? <p className="mt-3 text-caption leading-relaxed text-fg-subtle">
                {via === 'ORDEM_COMPRA' ? r.via_pedido_ajuda : via === 'NFE' ? r.via_nfe_ajuda : via === 'FISICA' ? (idioma === 'pt' ? 'Registra somente a mercadoria conferida. Não gera contas a pagar nem atualiza custo; associe a nota ou cobrança depois à mesma entrega.' : '仅记录实收商品，不生成应付款或更新成本。后续单据应关联原收货。') : r.via_sem_documento_ajuda}
              </p> : null}
            </div>

        {via === 'NFE' || via === 'HISTORICO' ? <ImportarNfePageClient idioma={idioma} embeddedInAdminHub historicoOnly={via === 'HISTORICO'} /> : null}
        {via === 'SEM_DOCUMENTO' ? (
          <ImportarNfePageClient idioma={idioma} embeddedInAdminHub semDocumento produtoInicial={produtoPreSelecionado} />
        ) : null}
        {via === 'ORDEM_COMPRA' || via === 'FISICA' ? (<form
          key={formKey}
          id="recebimento-form"
          className="mt-6 space-y-6"
          onSubmit={(e) => {
            e.preventDefault()
            if (semProdutos) return
            const fd = new FormData(e.currentTarget)
            if (ocSaldo) {
              const rows = produtosPendentes(ocSaldo.itens).map((row, index) => ({ ...row,
                quantidade_conferida: Number(fd.get(index === 0 ? 'qtd_conferida' : `qtd_${row.produto_id}`) ?? '') }))
              const invalid = rows.some((row) => !Number.isFinite(row.quantidade_conferida) || row.quantidade_conferida < 0 || row.quantidade_conferida > row.quantidade_esperada)
              const arrived = rows.filter((row) => row.quantidade_conferida > 0)
              if (invalid || !arrived.length) { emitGerenteToast({ kind: 'error', message: r.toast_dados_invalidos }); return }
              const first = arrived[0]
              void mutate({ origem: String(fd.get('origem') || ocSaldo.fornecedor_nome || ocSaldo.id),
                observacao: String(fd.get('observacao') ?? ''), produto_id: first.produto_id, produto_nome: first.nome,
                qtd_esperada: first.quantidade_esperada, qtd_conferida: first.quantidade_conferida,
                adicionais: arrived.slice(1).map((row) => ({ produto_id: row.produto_id, qtd_conferida: row.quantidade_conferida, qtd_esperada: row.quantidade_esperada })),
                idempotency_key: idempotencyKeyRef.current, ordem_compra_id: ocSaldo.id })
              return
            }
            const pid = readFormDataString(fd, 'produto_id')
            // Só o modo Pedido tem "esperada"; sem documento a action assume esperada = conferida.
            const qEsp = via === 'ORDEM_COMPRA' ? Number(fd.get('qtd_esperada')) : undefined
            const qConf = Number(fd.get('qtd_conferida'))
            if (
              !pid ||
              !Number.isFinite(qConf) ||
              qConf <= 0 ||
              (qEsp !== undefined && (!Number.isFinite(qEsp) || qEsp <= 0))
            ) {
              emitGerenteToast({ kind: 'error', message: r.toast_dados_invalidos })
              return
            }
            const ocId = readFormDataString(fd, 'ordem_compra_id')
            if (via === 'ORDEM_COMPRA' && !ocId) {
              emitGerenteToast({ kind: 'error', message: r.ordem_compra_obrigatoria })
              return
            }
            setResultado(null)
            void mutate({
              origem: readFormDataString(fd, 'origem'),
              observacao: readFormDataString(fd, 'observacao'),
              produto_id: pid,
              produto_nome: produtoEscolhido?.nome ?? '',
              qtd_esperada: qEsp,
              qtd_conferida: qConf,
              idempotency_key: idempotencyKeyRef.current,
              ordem_compra_id: readFormDataString(fd, 'ordem_compra_id'),
            })
          }}
        >
          <div className="grid grid-cols-1 gap-x-6 gap-y-6 md:grid-cols-2">
            <Field id="rec-origem" label={r.label_origem} required>
              <Input
                name="origem"
                required
                disabled={semProdutos}
                placeholder={r.ph_origem}
              />
            </Field>
            {!ocSaldo ? <Field id="rec-prod" label={r.label_produto} required>
              {/* Busca server-side: o `<select>` anterior carregava só os 500
                  primeiros produtos e o resto ficava inalcançável, sem aviso. */}
              <ProdutoRecebimentoAutocomplete
                disabled={semProdutos}
                placeholder={r.ph_produto_busca}
                semResultadosLabel={r.produto_sem_resultados}
                minimoLabel={r.produto_busca_minimo}
                limparLabel={r.produto_limpar}
                valorInicial={usarProdutoPreSelecionado ? produtoPreSelecionado : null}
                onChange={setProdutoEscolhido}
              />
            </Field> : null}
            {via === 'ORDEM_COMPRA' ? (
              <Field
                id="rec-oc"
                label={r.label_ordem_compra}
                hint={idioma === 'pt' ? 'A conferência abaixo usa o saldo pendente deste pedido.' : '下方验收以此采购单的待收数量为准。'}
                required
                className="md:col-span-2"
              >
                {/* UX-04 — a entrada abate o saldo do pedido, item a item. Sem escolher o pedido
                    (modo "Sem documento") nada é enviado e a entrada segue como sempre. */}
                <OrdemCompraVinculoAutocomplete
                  valorInicial={ocEscolhida}
                  disabled={semProdutos}
                  placeholder={r.ph_ordem_compra_busca}
                  semResultadosLabel={r.ordem_compra_sem_resultados}
                  minimoLabel={r.produto_busca_minimo}
                  limparLabel={r.produto_limpar}
                  statusLabels={{
                    CONFIRMADA: m.compras.status_CONFIRMADA,
                    EM_TRANSITO: m.compras.status_EM_TRANSITO,
                  }}
                  faltamLabel={(n) => fmtTemplate(r.oc_faltam_opcao, { n })}
                  onChange={setOcEscolhida}
                />
              </Field>
            ) : null}
            {via === 'ORDEM_COMPRA' && ocEscolhida ? (
              <div
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2 text-body md:col-span-2"
                data-testid="rec-oc-saldo"
                role="status"
              >
                <p className="text-caption font-semibold text-fg-muted">{r.oc_saldo_titulo}</p>
                {ocSaldoCarregando ? (
                  <p className="text-caption text-fg-subtle">{r.oc_saldo_carregando}</p>
                ) : ocSaldo ? (
                  ocSaldo.pendente_total <= 0 ? (
                    <p className="text-caption">{r.oc_saldo_zerado}</p>
                  ) : (
                    <ul className="mt-1 space-y-0.5">
                      {ocSaldo.itens.map((it) => (
                        <li key={it.id} className="text-caption tabular-nums">
                          {fmtTemplate(r.oc_saldo_linha, {
                            produto: it.produto_nome ?? it.descricao ?? '—',
                            pedido: fmtQtd(it.quantidade),
                            recebido: fmtQtd(it.quantidade_recebida),
                            faltam: fmtQtd(it.saldo_pendente),
                          })}
                        </li>
                      ))}
                    </ul>
                  )
                ) : ocSaldoErro ? (
                  <p className="text-caption text-[var(--color-warning-strong)]">{r.oc_saldo_erro}</p>
                ) : null}
              </div>
            ) : null}
            {ocSaldo ? <ItensPedidoRecebimento key={ocSaldo.id} itens={ocSaldo.itens} zh={idioma === 'zh'} loading={loading}
 /> : null}
            <Field id="rec-obs" label={r.label_observacao} className="md:col-span-2">
              <Input
                name="observacao"
                disabled={semProdutos}
                placeholder={r.ph_observacao}
              />
            </Field>
            {via === 'ORDEM_COMPRA' && !ocSaldo ? (
              <Field id="rec-q-esp" label={r.label_qtd_esperada} required>
                <Input
                  name="qtd_esperada"
                  type="number"
                  min="0.001"
                  step="0.001"
                  required
                  disabled={semProdutos}
                  value={qtdEspStr}
                  onChange={(e) => setQtdEspStr(e.target.value)}
                />
              </Field>
            ) : null}
            {!ocSaldo ? <Field id="rec-q-conf" label={r.label_qtd_conferida} required>
              <Input
                name="qtd_conferida"
                type="number"
                min="0.001"
                step="0.001"
                required
                disabled={semProdutos}
                value={qtdConfStr}
                onChange={(e) => setQtdConfStr(e.target.value)}
              />
            </Field> : null}
            {divergenciaDetalhe ? (
              <div
                className={`rounded-lg border px-3 py-2 text-body md:col-span-2 ${
                  divergenciaDetalhe.grave
                    ? 'border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-strong)]'
                    : 'border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] text-[var(--color-warning-strong)]'
                }`}
                role="status"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip
                    status={divergenciaDetalhe.grave ? 'ERRO' : 'ALERTA'}
                    label={divergenciaDetalhe.grave ? r.divergencia_grave : r.divergencia_moderada}
                  />
                  <span className="font-mono text-caption tabular-nums sm:text-body">
                    {r.divergencia_calculo
                      .replace('{{esperada}}', formatDecimalPlaces(divergenciaDetalhe.esp, 3))
                      .replace('{{conferida}}', formatDecimalPlaces(divergenciaDetalhe.conf, 3))
                      .replace(
                        '{{delta}}',
                        (divergenciaDetalhe.delta >= 0 ? '+' : '') +
                          formatDecimalPlaces(divergenciaDetalhe.delta, 3),
                      )}
                  </span>
                </div>
                <p className="mt-2 text-caption text-fg-muted">
                  {r.divergencia_legenda_pct.replace(
                    '{{pct}}',
                    divergenciaDetalhe.pct.toLocaleString(numLocale, { maximumFractionDigits: 1 }),
                  )}
                </p>
                <p className="mt-2 text-body leading-snug">{r.divergencia_alerta}</p>
              </div>
            ) : null}
          </div>
          {!ocSaldo ? <div className="mt-6 flex justify-end border-t border-[var(--color-border)] pt-5">
            <Button type="submit" variant="primary" loading={loading} disabled={semProdutos}>
              {loading ? r.btn_confirmando : r.btn_confirmar}
            </Button>
          </div> : null}
        </form>) : null}
        {resultado ? (
          <div
            className="mt-4 rounded-lg border border-[var(--color-success-border)] bg-[var(--color-success-bg)] px-3 py-2 text-body text-[var(--color-success-strong)]"
            role="status"
            data-testid="rec-resultado"
          >
            <p className="text-caption font-semibold">{r.resultado_titulo}</p>
            <p>{resultado}</p>
          </div>
        ) : null}
      </SectionCard>

      {via === 'HISTORICO' ? <SectionCard title={r.sec_recentes} subtitle={r.sec_recentes_ajuda} className="mt-10">
        <HistoricoEntregas inicial={remessasRecentes} columns={remessaColumns} zh={idioma === 'zh'} />
      </SectionCard> : null}
    </div>
  )
}
