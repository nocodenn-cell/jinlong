// Reexportar do store unificado para manter compatibilidade.
// PDV web usa a variante que hidrata só depois do status do caixa (recuperação P0-3).
export {
  useCartStoreRecuperavel as useCarrinhoStore,
  calcularTotais,
  calcularTotaisComGerente,
  type ItemCarrinhoComPreco
} from './unifiedCartStore';
