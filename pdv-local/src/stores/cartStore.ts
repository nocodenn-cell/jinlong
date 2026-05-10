// Importar do store unificado do web (via monorepo)
import { useCartStore, calcularTotaisComGerente, type ItemCarrinhoComPreco } from '@core/stores/unifiedCartStore';

// Reexportar com o nome que o desktop espera
export const useDesktopCartStore = useCartStore;
export { useCartStore, calcularTotaisComGerente };
export { type ItemCarrinhoComPreco };
