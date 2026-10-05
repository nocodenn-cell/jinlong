'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/forms'
import { formatBRL, parseBRL } from '@/lib/format/money'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { hojeYmd } from '@shared-core/src/financial/policies/tituloVencido'
import type { getMessages } from '@/i18n/getMessages'
import { previewNotaManualNfe, type LinhaPreviewNfe } from './actions'
import type { NfeParsed } from '@/lib/nfe/nfeParser'
import { totalItensEmCentavos, totalParcelasEmCentavos } from './notaManualFinanceiro'
import { ProdutoRecebimentoAutocomplete } from '@/app/gerente/recebimento/ProdutoRecebimentoAutocomplete'
import type { RecebimentoProdutoOpt } from '@/app/gerente/recebimento/RecebimentoGerentePageClient'

type Mi = ReturnType<typeof getMessages>['estoque']['import_nfe']

type ItemForm = {
  produto?: RecebimentoProdutoOpt | null
  nome: string
  ref: string
  gtin: string
  ncm: string
  un: string
  qtd: string
  valor: string
}

type ParcelaForm = { venc: string; valor: string }

const itemVazio = (): ItemForm => ({ nome: '', ref: '', gtin: '', ncm: '', un: 'UN', qtd: '1', valor: '' })

const CONDICOES: Array<{ label: string; dias: number[] }> = [
  { label: 'À vista', dias: [0] },
  { label: '30 dias', dias: [30] },
  { label: '30 / 60 dias', dias: [30, 60] },
  { label: '30 / 60 / 90 dias', dias: [30, 60, 90] },
]

function somaDias(ymd: string, dias: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + dias))
  return dt.toISOString().slice(0, 10)
}

function toNumber(raw: string): number {
  const n = Number(raw.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

type Props = Readonly<{
  mi: Mi
  semDocumento?: boolean
  produtoInicial?: RecebimentoProdutoOpt | null
  onPreview: (data: { parsed: NfeParsed; linhas: LinhaPreviewNfe[] }) => void
}>

/** Nota de chegada digitada à mão. Entrega o mesmo `{ parsed, linhas }` que o XML. */
export function NotaManualForm({ mi, onPreview, semDocumento = false, produtoInicial }: Props) {
  const [aberto, setAberto] = useState(semDocumento)
  const [carregando, setCarregando] = useState(false)
  const [fornecedor, setFornecedor] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [numero, setNumero] = useState('')
  const [serie, setSerie] = useState('')
  const [chave, setChave] = useState('')
  const [dataBaseVencimentos, setDataBaseVencimentos] = useState(hojeYmd())
  const [itens, setItens] = useState<ItemForm[]>([{
    ...itemVazio(), produto: produtoInicial, nome: produtoInicial?.nome ?? '',
    gtin: produtoInicial?.codigo_barras ?? '',
  }])
  const [parcelas, setParcelas] = useState<ParcelaForm[]>([])
  const [validarProdutos, setValidarProdutos] = useState(false)

  const setItem = (idx: number, patch: Partial<ItemForm>) =>
    setItens((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  const setParcela = (idx: number, patch: Partial<ParcelaForm>) =>
    setParcelas((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)))

  const totalItens = totalItensEmCentavos(itens.map((item) => ({
    q_com: toNumber(item.qtd), v_un_com: parseBRL(item.valor) ?? 0,
  }))) / 100
  const totalNota = totalItens
  const totalParcelas = totalParcelasEmCentavos(parcelas.map((p) => ({ valor: parseBRL(p.valor) ?? 0 }))) / 100
  const parcelasDiferem = parcelas.length > 0 && totalParcelas !== totalNota

  function gerarParcelas(idx: number) {
    const cond = CONDICOES[idx]
    if (!cond || totalNota <= 0) {
      emitGerenteToast({ kind: 'error', message: 'Informe os itens antes de gerar as parcelas.' })
      return
    }
    const centavos = Math.round(totalNota * 100)
    const base = Math.floor(centavos / cond.dias.length)
    setParcelas(
      cond.dias.map((d, i) => {
        const c = i === cond.dias.length - 1 ? centavos - base * (cond.dias.length - 1) : base
        return { venc: somaDias(dataBaseVencimentos, d), valor: (c / 100).toFixed(2).replace('.', ',') }
      }),
    )
  }

  if (!aberto) {
    return (
      <div className="mt-3 text-center">
        <Button type="button" variant="outline" size="sm" onClick={() => setAberto(true)}>
          {mi.manual_abrir}
        </Button>
      </div>
    )
  }

  async function continuar() {
    setValidarProdutos(true)
    const itemSemProduto = semDocumento ? itens.findIndex((item) => !item.produto?.id) : -1
    if (itemSemProduto >= 0) {
      emitGerenteToast({ kind: 'error', message: `Item ${itemSemProduto + 1}: selecione o produto na lista de resultados da busca.` })
      return
    }
    const validas = parcelas.filter((p) => p.venc && (parseBRL(p.valor) ?? 0) > 0)
    if (validas.length === 0) {
      emitGerenteToast({
        kind: 'error',
        message: 'Escolha a condição de pagamento: é ela que lança a compra em Contas a pagar.',
      })
      return
    }
    if (parcelasDiferem) {
      emitGerenteToast({
        kind: 'error',
        message: `A soma das parcelas (${formatBRL(totalParcelas)}) precisa ser igual ao total da nota (${formatBRL(totalNota)}).`,
      })
      return
    }
    setCarregando(true)
    try {
      const r = await previewNotaManualNfe({
        sem_documento: semDocumento,
        emitente_nome: fornecedor,
        emitente_cnpj: cnpj,
        numero_nf: numero,
        serie,
        chave_acesso: chave,
        itens: itens.map((i) => ({
          produto_id: i.produto?.id,
          nome_produto: i.nome,
          ref_fornecedor: i.ref,
          gtin: i.gtin,
          ncm: i.ncm,
          u_com: i.un,
          q_com: toNumber(i.qtd),
          v_un_com: parseBRL(i.valor) ?? 0,
        })),
        duplicatas: parcelas
          .filter((p) => p.venc || p.valor.trim())
          .map((p, idx) => ({
            numero: String(idx + 1).padStart(3, '0'),
            data_vencimento: p.venc,
            valor: parseBRL(p.valor) ?? 0,
          })),
      })
      if (!r.success) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      setAberto(false)
      onPreview(r.data)
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-[var(--color-border)] p-4" data-testid="nota-manual">
      <div>
        <p className="text-body font-semibold">{mi.manual_titulo}</p>
        <p className="text-caption text-fg-muted">{mi.manual_ajuda}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <label className="text-caption md:col-span-2">
          {mi.manual_fornecedor}
          <Input value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} />
        </label>
        <label className="text-caption md:col-span-2">
          {mi.manual_cnpj}
          <Input
            value={cnpj}
            inputMode="numeric"
            maxLength={14}
            onChange={(e) => setCnpj(e.target.value.replace(/\D/g, '').slice(0, 14))}
          />
        </label>
        {!semDocumento ? <label className="text-caption">
          {mi.manual_numero}
          <Input value={numero} onChange={(e) => setNumero(e.target.value)} />
        </label> : null}
        {!semDocumento ? <label className="text-caption">
          {mi.manual_serie}
          <Input value={serie} onChange={(e) => setSerie(e.target.value)} />
        </label> : null}
        {!semDocumento ? <label className="text-caption md:col-span-2">
          {mi.manual_chave}
          <Input value={chave} inputMode="numeric" onChange={(e) => setChave(e.target.value)} />
        </label> : null}
        <label className="text-caption">
          Data-base dos vencimentos
          <Input type="date" value={dataBaseVencimentos} onChange={(e) => setDataBaseVencimentos(e.target.value)} />
          <span className="text-fg-muted">Usada somente para gerar as parcelas.</span>
        </label>
      </div>

      <div className="space-y-2">
        <p className="text-caption font-semibold text-fg-muted">{mi.manual_itens}</p>
        {itens.map((it, idx) => (
          <div key={idx} className="grid grid-cols-2 gap-2 rounded-lg bg-[var(--color-surface-soft)] p-2 md:grid-cols-12">
            <label className={`col-span-2 text-caption ${semDocumento ? 'md:col-span-12' : 'md:col-span-4'}`}>
              {mi.manual_item_desc}
              {semDocumento ? (
                <ProdutoRecebimentoAutocomplete
                  name={`produto-manual-${idx}`}
                  placeholder={mi.manual_item_desc}
                  semResultadosLabel="Nenhum produto encontrado"
                  minimoLabel="Digite pelo menos 2 caracteres"
                  limparLabel="Trocar produto"
                  valorInicial={it.produto}
                  onChange={(produto) => setItem(idx, {
                    produto, nome: produto?.nome ?? '', ref: produto?.id ?? '', gtin: produto?.codigo_barras ?? '',
                  })}
                />
              ) : <Input value={it.nome} onChange={(e) => setItem(idx, { nome: e.target.value })} />}
              {semDocumento ? <span role={validarProdutos && !it.produto ? 'alert' : undefined}
                className={`mt-2 block text-caption ${validarProdutos && !it.produto ? 'text-destructive' : 'text-fg-muted'}`}>
                {it.produto ? `Selecionado: ${it.produto.nome}` : 'Digite e selecione o produto na lista. Se não encontrar, cadastre-o no Catálogo.'}
              </span> : null}
            </label>
            {!semDocumento ? <>
            <label className="text-caption md:col-span-2">
              {mi.manual_item_ref}
              <Input value={it.ref} onChange={(e) => setItem(idx, { ref: e.target.value })} />
            </label>
            <label className="text-caption md:col-span-2">
              {mi.manual_item_gtin}
              <Input value={it.gtin} inputMode="numeric" onChange={(e) => setItem(idx, { gtin: e.target.value })} />
            </label>
            <label className="text-caption md:col-span-2">
              {mi.manual_item_ncm}
              <Input value={it.ncm} inputMode="numeric" onChange={(e) => setItem(idx, { ncm: e.target.value })} />
            </label>
            <label className="text-caption md:col-span-2">
              {mi.manual_item_un}
              <Input value={it.un} maxLength={6} onChange={(e) => setItem(idx, { un: e.target.value.toUpperCase() })} />
            </label>
            </> : null}
            <label className="text-caption md:col-span-3">
              {mi.manual_item_qtd}
              <Input value={it.qtd} inputMode="decimal" onChange={(e) => setItem(idx, { qtd: e.target.value })} />
            </label>
            <label className="text-caption md:col-span-3">
              {mi.manual_item_valor}
              <Input value={it.valor} inputMode="decimal" placeholder="0,00" onChange={(e) => setItem(idx, { valor: e.target.value })} />
            </label>
            <div className="col-span-2 flex items-end justify-between gap-2 md:col-span-6">
              <span className="text-caption tabular-nums text-fg-muted">
                {formatBRL(toNumber(it.qtd) * (parseBRL(it.valor) ?? 0))}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={itens.length === 1}
                onClick={() => setItens((rows) => rows.filter((_, i) => i !== idx))}
              >
                {mi.manual_remover}
              </Button>
            </div>
          </div>
        ))}
        <div className="flex items-center justify-between">
          <Button type="button" variant="outline" size="sm" onClick={() => setItens((r) => [...r, itemVazio()])}>
            {mi.manual_add_item}
          </Button>
          <span className="text-caption font-semibold tabular-nums">
            {mi.manual_total_itens}: {formatBRL(totalItens)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-lg bg-[var(--color-surface-soft)] p-3 md:grid-cols-4">
        <div className="text-caption">
          Valor dos produtos
          <p className="mt-1 text-body font-semibold tabular-nums">{formatBRL(totalItens)}</p>
        </div>
        <div className="text-caption">
          Valor total da nota
          <p className="mt-1 text-body font-semibold tabular-nums">{formatBRL(totalNota)}</p>
        </div>
      </div>

      <p className="text-caption text-fg-muted">
        Nesta entrada manual, o total da nota corresponde ao valor dos produtos. Frete e desconto não estão disponíveis.
      </p>

      <div className="space-y-2">
        <p className="text-caption font-semibold text-fg-muted">{mi.manual_parcelas} *</p>
        <label className="block text-caption">
          Condição de pagamento
          <select
            className="app-select mt-1 w-full rounded-lg px-3 py-2 text-sm"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value !== '') gerarParcelas(Number(e.target.value))
              e.target.value = ''
            }}
          >
            <option value="">Escolha para gerar as parcelas…</option>
            {CONDICOES.map((c, i) => (
              <option key={c.label} value={i}>{c.label}</option>
            ))}
          </select>
        </label>
        {parcelas.map((p, idx) => (
          <div key={idx} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <label className="text-caption">
              {mi.manual_parcela_venc}
              <Input type="date" value={p.venc} onChange={(e) => setParcela(idx, { venc: e.target.value })} />
            </label>
            <label className="text-caption">
              {mi.manual_parcela_valor}
              <Input value={p.valor} inputMode="decimal" placeholder="0,00" onChange={(e) => setParcela(idx, { valor: e.target.value })} />
            </label>
            <Button type="button" variant="ghost" size="sm" onClick={() => setParcelas((r) => r.filter((_, i) => i !== idx))}>
              {mi.manual_remover}
            </Button>
          </div>
        ))}
        <div className="flex items-center justify-between">
          <Button type="button" variant="outline" size="sm" onClick={() => setParcelas((r) => [...r, { venc: '', valor: '' }])}>
            {mi.manual_add_parcela}
          </Button>
          {parcelas.length > 0 ? (
            <span className="text-caption font-semibold tabular-nums">
              {mi.manual_total_parcelas}: {formatBRL(totalParcelas)}
            </span>
          ) : null}
        </div>
        {parcelasDiferem ? (
          <p className="text-caption text-[var(--color-warning-strong)]" role="status">
            {mi.manual_parcelas_diferem}
          </p>
        ) : null}
      </div>

      <div className="flex justify-end gap-2 border-t border-[var(--color-border)] pt-3">
        {!semDocumento ? <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(false)}>
          {mi.manual_fechar}
        </Button> : null}
        <Button type="button" variant="primary" size="sm" loading={carregando} onClick={() => void continuar()}>
          {mi.manual_continuar}
        </Button>
      </div>
    </div>
  )
}
