"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { DragonModal } from "@/components/ui/DragonModal"
import { Input } from "@/components/ui/input"
import type { Mensagens } from "@/i18n/getMessages"
import { consultarProdutoRapidoCaixa } from "@/app/caixa/actions"
import type { ConsultaRapidaProdutoDTO } from "@/app/caixa/caixaActionTypes"
import { formatDecimalBRL } from "@/lib/format/money"
import { cn } from "@/lib/utils"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  m: Mensagens
  termoInicial?: string
}

function fmtData(iso: string | null, locale: string): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function CaixaConsultaRapidaModal({ open, onOpenChange, m, termoInicial = "" }: Props) {
  const [termo, setTermo] = useState(termoInicial)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<ConsultaRapidaProdutoDTO | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const fechar = useCallback(() => onOpenChange(false), [onOpenChange])

  useEffect(() => {
    if (!open) return
    setTermo(termoInicial)
    setErro(null)
    setResultado(null)
    queueMicrotask(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [open, termoInicial])

  const consultar = useCallback(async () => {
    const t = termo.trim()
    if (!t) {
      setErro(m.caixa.consulta_rapida_termo_vazio)
      return
    }
    setLoading(true)
    setErro(null)
    try {
      const res = await consultarProdutoRapidoCaixa(t)
      if (!res.ok) {
        setResultado(null)
        setErro(res.error)
        return
      }
      if (res.status === "nao_encontrado") {
        setResultado(null)
        setErro(m.caixa.consulta_rapida_nao_encontrado)
        return
      }
      if (res.status === "ambiguo") {
        setResultado(null)
        setErro(res.mensagem)
        return
      }
      setResultado(res.produto)
      setErro(null)
    } finally {
      setLoading(false)
      queueMicrotask(() => inputRef.current?.select())
    }
  }, [termo, m])

  const moeda = m.caixa.moeda_prefixo

  return (
    <DragonModal
      open={open}
      onClose={fechar}
      title={m.caixa.consulta_rapida_titulo}
      subtitle={m.caixa.consulta_rapida_subtitulo}
      sheet
      size="md"
      closeLabel={m.comum.fechar}
      data-testid="caixa-consulta-rapida-modal"
      footer={
        <Button type="button" variant="secondary" onClick={fechar}>
          {m.comum.fechar}
        </Button>
      }
    >
      <div className="space-y-3" data-caixa-atalho-bloqueado="true">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void consultar()
          }}
        >
          <Input
            ref={inputRef}
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder={m.caixa.consulta_rapida_placeholder}
            className="jl-modal-field flex-1"
            autoComplete="off"
          />
          <Button type="submit" disabled={loading} className="min-h-10 shrink-0">
            {loading ? m.caixa.consulta_rapida_buscando : m.caixa.consulta_rapida_buscar}
          </Button>
        </form>

        {erro ? (
          <p className="text-sm text-destructive" role="alert">
            {erro}
          </p>
        ) : null}

        {resultado ? (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <div className="col-span-2">
              <dt className="text-[11px] uppercase tracking-wide text-jl-fg-3">
                {m.caixa.consulta_rapida_produto}
              </dt>
              <dd className="font-semibold leading-snug">{resultado.nome}</dd>
              {resultado.codigo_barras ? (
                <dd className="mt-0.5 font-mono text-xs text-jl-fg-3">{resultado.codigo_barras}</dd>
              ) : null}
            </div>
            <Campo
              label={m.caixa.consulta_rapida_preco}
              value={`${moeda} ${formatDecimalBRL(resultado.precoCalculado)} (${resultado.tipoPreco})`}
            />
            <Campo
              label={m.caixa.consulta_rapida_estoque}
              value={
                resultado.quantidade_estoque == null
                  ? "—"
                  : formatDecimalBRL(resultado.quantidade_estoque)
              }
            />
            <Campo
              label={m.caixa.consulta_rapida_ultima_venda}
              value={fmtData(resultado.ultimaVendaEm, "pt-BR")}
            />
            <Campo
              label={m.caixa.consulta_rapida_ultima_compra}
              value={fmtData(resultado.ultimaCompraEm, "pt-BR")}
            />
            {resultado.mostrarMargem && resultado.margemPercentual != null ? (
              <Campo
                label={m.caixa.consulta_rapida_margem}
                value={`${formatDecimalBRL(resultado.margemPercentual)}%`}
                className="col-span-2"
              />
            ) : null}
          </dl>
        ) : null}
      </div>
    </DragonModal>
  )
}

function Campo({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className={cn(className)}>
      <dt className="text-[11px] uppercase tracking-wide text-jl-fg-3">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  )
}
