/** Barrel: helpers do caixa web no servidor (importar daqui ou dos módulos específicos). */
export {
  sanitizeIlikeFragment,
  mapProdutoRow,
  PRODUTO_COLS,
} from '@/app/caixa/server/caixaProdutoSql'
export { estoqueResumoParaCaixa } from '@/app/caixa/server/caixaEstoqueServer'
export { fetchPdvConfigParaCaixaWeb } from '@/app/caixa/server/caixaPdvConfigRpc'
export { enfileirarDocumentoFiscalPosVenda } from '@/app/caixa/server/caixaFiscalEnqueueServer'
export {
  LIMITE_DIVERGENCIA_FECHAMENTO,
  parseMoneyInput,
} from '@/app/caixa/server/caixaFechamentoServer'
export { coletarAuditoriaRequest } from '@/app/caixa/server/caixaAuditoriaRequest'
export {
  type ItemAutoritativo,
  recalcularItensNoServidor,
} from '@/app/caixa/server/caixaPrecoAutoritativoServer'
