// Importar do store unificado do web (via monorepo)
import { useCartStore, calcularTotaisComGerente, type ItemCarrinhoComPreco } from '../../../pdv-importados/stores/unifiedCartStore';

// Reexportar com o nome que o desktop espera
export const useDesktopCartStore = useCartStore;
export { type ItemCarrinhoComPreco };
