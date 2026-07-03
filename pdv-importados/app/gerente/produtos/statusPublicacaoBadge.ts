import type { StatusPublicacao } from '@/core/ports/produto'

/**
 * Mapa status_publicacao → chave de tom do badge + chave i18n do rótulo.
 *
 * DRAFT ganha badge próprio ("Rascunho"/warning) para não ficar indistinguível
 * de um produto inativado deliberadamente. A verdade de vendabilidade continua
 * única em `productEngine` (vendável ⇔ status_publicacao === 'PUBLICADO'); este
 * mapa só decide a apresentação do status na listagem do gerente.
 */
export const STATUS_PUBLICACAO_BADGE: Record<
  StatusPublicacao,
  { key: string; labelKey: 'ativo' | 'inativo' | 'rascunho' }
> = {
  PUBLICADO: { key: 'ATIVO', labelKey: 'ativo' },
  DRAFT: { key: 'RASCUNHO', labelKey: 'rascunho' },
  INATIVO: { key: 'INATIVO', labelKey: 'inativo' },
}
