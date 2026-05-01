// Reexportar do store unificado para manter compatibilidade
export {
  useCartStore as useCarrinhoStore,
  calcularTotais,
  calcularTotaisComGerente,
  type ItemCarrinhoComPreco
} from './unifiedCartStore';
