"use client"

import { useState } from "react"
import { BadgePercent } from "lucide-react"
import { useCarrinhoStore } from "@/stores/carrinhoStore"
import { CaixaMoneyInput } from "./CaixaMoneyInput"
import { validarDescontoManual } from "./descontoManualPolicy"
import { formatDecimalBRL } from "@/lib/format/money"

const textos = {
  pt: { title: "Desconto manual", item: "Produto", mode: "Tipo de desconto", value: "Desconto por unidade", percent: "Percentual (%)", amount: "Valor (R$)", apply: "Aplicar desconto", help: "Desconto sobre o preço atual, por unidade. O total será recalculado. Limite do operador:", error: "Desconto inválido, abaixo do preço mínimo ou acima da alçada. Revise o valor ou solicite autorização de gerente.", success: "Desconto aplicado ao cupom.", total: "Redução nesta linha" },
  zh: { title: "手动折扣", item: "商品", mode: "折扣类型", value: "每件折扣", percent: "百分比 (%)", amount: "金额 (R$)", apply: "应用折扣", help: "按当前单价计算折扣并更新总额。操作员权限上限：", error: "折扣无效、低于最低价或超出权限。请核对金额或申请经理授权。", success: "折扣已应用。", total: "该商品合计减免" },
}

export function CaixaDescontoManual({ idioma, limite, disabled = false }: { idioma: "pt" | "zh"; limite: number; disabled?: boolean }) {
  const itens = useCarrinhoStore((state) => state.itens)
  const aplicar = useCarrinhoStore((state) => state.aplicarDescontoManual)
  const [id, setId] = useState("")
  const [mode, setMode] = useState("valor")
  const [value, setValue] = useState(0)
  const [feedback, setFeedback] = useState("")
  const t = textos[idioma]
  const item = itens.find((linha) => linha.id === id)
  const preco = item?.resultado?.precoUnitario ?? item?.precoUnitario ?? 0
  const desconto = mode === "valor" ? value : preco * value / 100
  function submit() {
    if (!validarDescontoManual(itens, id, desconto, limite)) { setFeedback(t.error); return }
    try { aplicar(id, desconto, undefined, limite); setValue(0); setFeedback(t.success) }
    catch (error) { setFeedback(error instanceof Error ? error.message : t.error) }
  }
  return <details className="rounded-lg border border-slate-400 bg-white p-3">
    <summary className="cursor-pointer font-semibold text-blue-800"><BadgePercent className="mr-2 inline h-5 w-5" aria-hidden />{t.title}</summary>
    <fieldset disabled={disabled || itens.length === 0} className="mt-3 grid gap-2">
      <p className="text-sm text-slate-700">{t.help} {limite}%</p>
      <label>{t.item}<select aria-label={t.item} className="mt-1 w-full rounded border p-2" value={id} onChange={(event) => { setId(event.target.value); setFeedback("") }}><option value="">—</option>{itens.map((linha) => <option key={linha.id} value={linha.id}>{linha.nome}</option>)}</select></label>
      <label>{t.mode}<select aria-label={t.mode} className="mt-1 w-full rounded border p-2" value={mode} onChange={(event) => { setMode(event.target.value); setValue(0) }}><option value="valor">{t.amount}</option><option value="percentual">{t.percent}</option></select></label>
      <label>{mode === "valor" ? t.value : t.percent}<CaixaMoneyInput className="mt-1 w-full rounded border p-2 text-lg font-semibold" value={value} onValueChange={setValue} data-caixa-atalho-bloqueado="true" /></label>
      <p>{t.total}: R$ {formatDecimalBRL(desconto * (item?.quantidade ?? 0))}</p>
      <button type="button" className="rounded bg-blue-700 px-3 py-2 font-semibold text-white disabled:opacity-50" disabled={!item || value <= 0} onClick={submit}>{t.apply}</button>
      {item && feedback && <p role="status" className="text-sm font-semibold">{feedback}</p>}
    </fieldset>
  </details>
}
