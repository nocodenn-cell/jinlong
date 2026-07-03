/**
 * Variantes de leitura (scanner/teclado) para bater com `codigo_barras`.
 *
 * FONTE ÚNICA: `shared-core/src/caixa/variantesChaveLeitura`. Este módulo apenas
 * reexporta para consumidores web que importam via `@/core/caixa/...`, eliminando
 * a segunda implementação (idêntica em comportamento) que o pdv-local já consumia
 * direto do shared-core — evitando drift silencioso entre web e desktop.
 */
export { variantesChaveLeitura } from '@shared-core/src/caixa/variantesChaveLeitura'
