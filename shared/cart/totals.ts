/**
 * Re-exports from the canonical shared-core implementations.
 *
 * Previously this file had its own `roundMoney2` + `calcularTotais*`
 * with a backward import into pdv-importados. Now everything comes
 * from `shared-core` so the dependency graph stays clean.
 */
export { roundMoney2 } from '../../shared-core/src/money/roundMoney'
export {
  calcularTotais,
  calcularTotaisComGerente,
  type ItemCarrinhoComPreco,
} from '../../shared-core/src/stores/unifiedCartStore'
