import type { ItemCarrinhoComPreco } from "@/stores/carrinhoStore"
import { descontoDiscricionarioFromItens, roundMoney2, totaisFromItens } from "./finalizarVendaValidation"

export function validarDescontoManual(itens: ItemCarrinhoComPreco[], id: string, valor: number, limite: number): boolean {
  const item = itens.find((linha) => linha.id === id)
  if (!item || !Number.isFinite(valor) || valor <= 0) return false
  const preco = item.resultado?.precoUnitario ?? item.precoUnitario ?? item.precoOriginal ?? 0
  if (roundMoney2(preco - valor) < Math.max(0.01, item.precoMinimo ?? 0)) return false
  const linhas = itens.map((linha) => ({
    quantidade: linha.quantidade,
    precoOriginal: linha.resultado?.precoOriginal ?? linha.precoOriginal ?? linha.precoUnitario ?? 0,
    precoUnitario: linha.resultado?.precoUnitario ?? linha.precoUnitario ?? 0,
    tipoPreco: linha.resultado?.tipoPreco ?? "VAREJO",
  }))
  const index = itens.indexOf(item)
  linhas[index] = { ...linhas[index], precoUnitario: roundMoney2(preco - valor), tipoPreco: "MANUAL" }
  return descontoDiscricionarioFromItens(linhas) <= totaisFromItens(linhas).totalBruto * limite / 100 + 0.005
}

export function limiteDescontoOperador(raw: string | undefined): number {
  const value = raw?.trim() ? Number(raw) : 10
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 10
}
