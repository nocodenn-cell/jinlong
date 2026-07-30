/**
 * Ajuste manual de saldo com auto-reparo da linha de `estoque`.
 *
 * Produtos criados antes da mig. 270 podem não ter linha em `estoque`. A RPC
 * `ajustar_estoque_manual` aborta com AJUSTE_ESTOQUE_LINHA_NAO_ENCONTRADA nesse
 * caso e o operador ficava sem saída: nenhuma tela expõe a criação da linha.
 *
 * Aqui a linha 0/0 é criada (mesma regra de `garantirLinhaEstoque`) e o ajuste é
 * repetido UMA vez. Nada de regra de negócio muda: saldo, motivo e kardex
 * continuam sendo escritos pela RPC canônica.
 */

import {
  INVENTORY_ERROR_CODES,
  type AdjustInventoryCommand,
  type AdjustInventoryResult,
} from '@shared-core/src/inventory'

export type AjustarFn = (command: AdjustInventoryCommand) => Promise<AdjustInventoryResult>

/** Deve devolver `true` quando a linha existe ao final (criada agora ou já existente). */
export type GarantirLinhaFn = (command: AdjustInventoryCommand) => Promise<boolean>

export async function ajustarComLinhaGarantida(
  command: AdjustInventoryCommand,
  deps: { ajustar: AjustarFn; garantirLinha: GarantirLinhaFn },
): Promise<AdjustInventoryResult> {
  const primeira = await deps.ajustar(command)
  if (primeira.ok || primeira.code !== INVENTORY_ERROR_CODES.NOT_FOUND) {
    return primeira
  }

  const criada = await deps.garantirLinha(command)
  if (!criada) return primeira

  return deps.ajustar(command)
}
