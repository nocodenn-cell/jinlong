import { ROUTES } from '@shared-core/navigation/routes'
import type { HubTabDef } from './hubNavModel'

/** Hub Catálogo — produtos + taxonomias (rotas SSOT inalteradas). */
export const CATALOGO_HUB_TABS: readonly HubTabDef[] = [
  { id: 'produtos', label: 'Produtos', href: ROUTES.admin.catalogo, match: 'prefix' },
  {
    id: 'categorias',
    label: 'Categorias',
    href: ROUTES.admin.categoriasProdutos,
    match: 'prefix',
  },
  { id: 'marcas', label: 'Marcas', href: ROUTES.admin.marcasProdutos, match: 'prefix' },
] as const
