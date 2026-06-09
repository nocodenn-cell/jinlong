import {
  FILTRO_PRODUTO_VENDAVEL,
  STATUS_PUBLICACAO_PUBLICADO,
} from '@/lib/catalog/isProdutoVendavel'

/** Constantes para `.eq('ativo', …).eq('status_publicacao', …)` em queries Supabase. */
export const PRODUTO_VENDAVEL_FILTRO_ATIVO = FILTRO_PRODUTO_VENDAVEL.ativo
export const PRODUTO_VENDAVEL_FILTRO_STATUS = FILTRO_PRODUTO_VENDAVEL.status_publicacao

export { STATUS_PUBLICACAO_PUBLICADO }
