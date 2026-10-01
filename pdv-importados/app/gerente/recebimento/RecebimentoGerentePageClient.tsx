'use client'

import { labelStatusOperacional } from '@/lib/format/vendaLabels'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CadastroRapidoBlock } from '@/components/gerente/cadastro'
import { DataTable, type Column } from '@/components/ui/DataTable'
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
import { EmptyState } from '@/components/ui/feedback'
import { StatusChip } from '@/components/ui/StatusChip'
import { Field, Input } from '@/components/ui/forms'
import { ROUTES } from '@/lib/navigation/routes'
import { criarRemessaConferencia } from './actions'
import { obterOrdemCompraDetalhe, type OcDetalheDTO, type OcListaDTO } from '../compras/actions'
import { fmtQtd, textoPosEntrada } from '../compras/ocRecebimento'
import { ProdutoRecebimentoAutocomplete } from './ProdutoRecebimentoAutocomplete'
import { OrdemCompraVinculoAutocomplete } from './OrdemCompraVinculoAutocomplete'

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
  // Produtos adicionais da MESMA entrada (só "Sem documento"): a RPC já recebe uma lista de itens.
  const [extras, setExtras] = useState<Array<{ key: number; produto: RecebimentoProdutoOpt | null; qtd: string }>>([])
  const proximaChaveExtra = useRef(1)
  const [qtdConfStr, setQtdConfStr] = useState('')
  const idempotencyKeyRef = useRef(crypto.randomUUID())
  // Depois de confirmar a entrada o formulário volta ao estado inicial: com os
  // campos preenchidos e uma nova chave de idempotência, um segundo clique
  // criaria outra entrada (e outro crédito de estoque) com os mesmos dados.
  const [formKey, setFormKey] = useState(0)
  const [usarProdutoPreSelecionado, setUsarProdutoPreSelecionado] = useState(true)
  // "Como chegou?": a NF-e tem tela própria (link); aqui a entrada é com pedido ou sem documento.
  const [via, setVia] = useState<'SEM_DOCUMENTO' | 'ORDEM_COMPRA'>('SEM_DOCUMENTO')
  const [ocEscolhida, setOcEscolhida] = useState<OcListaDTO | null>(null)
  const [ocSaldo, setOcSaldo] = useState<OcDetalheDTO | null>(null)
  const [ocSaldoCarregando, setOcSaldoCarregando] = useState(false)
  const [ocSaldoErro, setOcSaldoErro] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)
  // Produto escolhido no autocomplete (só para mostrar o nome na confirmação).
  const [produtoEscolhido, setProdutoEscolhido] = useState<RecebimentoProdutoOpt | null>(
    produtoPreSelecionado,
  )

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

  const escolherVia = useCallback((v: 'SEM_DOCUMENTO' | 'ORDEM_COMPRA') => {
    setVia(v)
    if (v === 'SEM_DOCUMENTO') {
      // Sem documento não há expectativa: some o campo e a divergência deixa de existir.
      setOcEscolhida(null)
      setQtdEspStr('')
    } else {
      // Com pedido a conferência é de um item por vez (a divergência é calculada por item).
      setExtras([])
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
      adicionais?: Array<{ produto_id: string; qtd_conferida: number }>
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
          setExtras([])
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

      {semProdutos ? (
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

      <CadastroRapidoBlock title={r.sec_formulario} defaultOpen className="mt-8">
        <form
          key={formKey}
          id="recebimento-form"
          className="space-y-0"
          onSubmit={(e) => {
            e.preventDefault()
            if (semProdutos) return
            const fd = new FormData(e.currentTarget)
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
            // Linhas extras: ignora as totalmente em branco; as parciais ou repetidas são recusadas.
            const adicionais: Array<{ produto_id: string; qtd_conferida: number }> = []
            const vistos = new Set<string>([pid])
            for (const ex of via === 'SEM_DOCUMENTO' ? extras : []) {
              const qtd = Number(ex.qtd.replace(',', '.'))
              if (!ex.produto && ex.qtd.trim() === '') continue
              if (!ex.produto || !Number.isFinite(qtd) || qtd <= 0) {
                emitGerenteToast({ kind: 'error', message: r.toast_dados_invalidos })
                return
              }
              if (vistos.has(ex.produto.id)) {
                emitGerenteToast({ kind: 'error', message: r.toast_produto_repetido })
                return
              }
              vistos.add(ex.produto.id)
              adicionais.push({ produto_id: ex.produto.id, qtd_conferida: qtd })
            }
            setResultado(null)
            void mutate({
              origem: readFormDataString(fd, 'origem'),
              observacao: readFormDataString(fd, 'observacao'),
              produto_id: pid,
              produto_nome: produtoEscolhido?.nome ?? '',
              qtd_esperada: qEsp,
              qtd_conferida: qConf,
              adicionais,
              idempotency_key: idempotencyKeyRef.current,
              ordem_compra_id: readFormDataString(fd, 'ordem_compra_id'),
            })
          }}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Como chegou? — a mesma entrada, três caminhos, sem tela nova. */}
            <div className="md:col-span-2" data-testid="rec-como-chegou">
              <p className="mb-1.5 text-caption font-semibold text-fg-muted">{r.como_chegou}</p>
              <div role="group" aria-label={r.como_chegou} className="flex flex-wrap gap-2">
                <Link
                  href={ROUTES.admin.importNfe}
                  className="fp-focus-ring rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-body font-medium text-fg hover:bg-[var(--color-surface-soft)]"
                  title={r.via_nfe_ajuda}
                >
                  {r.via_nfe}
                </Link>
                {(
                  [
                    ['ORDEM_COMPRA', r.via_pedido],
                    ['SEM_DOCUMENTO', r.via_sem_documento],
                  ] as const
                ).map(([v, rotulo]) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={via === v}
                    onClick={() => escolherVia(v)}
                    disabled={semProdutos}
                    className={`fp-focus-ring rounded-lg border px-3 py-1.5 text-body font-medium ${
                      via === v
                        ? 'border-[var(--color-brand)] bg-[var(--color-brand)] text-[var(--color-brand-fg)]'
                        : 'border-[var(--color-border)] text-fg hover:bg-[var(--color-surface-soft)]'
                    }`}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-caption text-fg-subtle">
                {via === 'ORDEM_COMPRA' ? r.via_pedido_ajuda : r.via_sem_documento_ajuda}
              </p>
            </div>
            <Field id="rec-origem" label={r.label_origem} required>
              <Input
                name="origem"
                required
                disabled={semProdutos}
                placeholder={r.ph_origem}
              />
            </Field>
            <Field id="rec-prod" label={r.label_produto} required>
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
            </Field>
            {via === 'ORDEM_COMPRA' ? (
              <Field
                id="rec-oc"
                label={r.label_ordem_compra}
                hint={r.ordem_compra_ajuda}
                required
                className="md:col-span-2"
              >
                {/* UX-04 — a entrada abate o saldo do pedido, item a item. Sem escolher o pedido
                    (modo "Sem documento") nada é enviado e a entrada segue como sempre. */}
                <OrdemCompraVinculoAutocomplete
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
            <Field id="rec-obs" label={r.label_observacao} className="md:col-span-2">
              <Input
                name="observacao"
                disabled={semProdutos}
                placeholder={r.ph_observacao}
              />
            </Field>
            {via === 'ORDEM_COMPRA' ? (
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
            <Field id="rec-q-conf" label={r.label_qtd_conferida} required>
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
            </Field>
            {via === 'SEM_DOCUMENTO' ? (
              <div className="space-y-2 md:col-span-2" data-testid="rec-itens-extra">
                {extras.map((ex, idx) => (
                  <div key={ex.key} className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_9rem_auto]">
                    <Field id={`rec-extra-prod-${ex.key}`} label={r.label_produto}>
                      <ProdutoRecebimentoAutocomplete
                        disabled={semProdutos}
                        placeholder={r.ph_produto_busca}
                        semResultadosLabel={r.produto_sem_resultados}
                        minimoLabel={r.produto_busca_minimo}
                        limparLabel={r.produto_limpar}
                        onChange={(produto) =>
                          setExtras((atual) => atual.map((x) => (x.key === ex.key ? { ...x, produto } : x)))
                        }
                      />
                    </Field>
                    <Field id={`rec-extra-qtd-${ex.key}`} label={r.label_qtd_item}>
                      <Input
                        type="number"
                        min="0.001"
                        step="0.001"
                        disabled={semProdutos}
                        value={ex.qtd}
                        onChange={(e) =>
                          setExtras((atual) => atual.map((x) => (x.key === ex.key ? { ...x, qtd: e.target.value } : x)))
                        }
                      />
                    </Field>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setExtras((atual) => atual.filter((x) => x.key !== ex.key))}
                      aria-label={`${r.btn_remover_item} ${idx + 2}`}
                    >
                      {r.btn_remover_item}
                    </Button>
                  </div>
                ))}
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={semProdutos}
                    onClick={() =>
                      setExtras((atual) => [...atual, { key: proximaChaveExtra.current++, produto: null, qtd: '' }])
                    }
                  >
                    {r.btn_add_item}
                  </Button>
                  {extras.length > 0 ? (
                    <span className="text-caption text-fg-subtle">{r.itens_extra_ajuda}</span>
                  ) : null}
                </div>
              </div>
            ) : null}
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
          <div className="mt-6 flex justify-end border-t border-[var(--color-border)] pt-5">
            <Button type="submit" variant="primary" loading={loading} disabled={semProdutos}>
              {loading ? r.btn_confirmando : r.btn_confirmar}
            </Button>
          </div>
        </form>
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
      </CadastroRapidoBlock>

      <SectionCard title={r.sec_recentes} subtitle={r.sec_recentes_ajuda} className="mt-10">
        <DataTable
          columns={remessaColumns}
          data={remessasRecentes}
          rowKey={(row) => row.id}
          compact
          emptyState={
            <EmptyState
              title={r.empty_recentes}
              actionLabel={r.btn_confirmar}
              onAction={() => {
                document.getElementById('recebimento-form')?.scrollIntoView({ behavior: 'smooth' })
              }}
            />
          }
        />
      </SectionCard>
    </div>
  )
}
