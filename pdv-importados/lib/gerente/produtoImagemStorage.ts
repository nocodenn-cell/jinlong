/** Bucket público (leitura); escrita via RLS em `storage.objects`. */
export const PRODUTO_IMAGEM_BUCKET = 'produto-imagens'

export const PRODUTO_IMAGEM_MAX_BYTES = 2 * 1024 * 1024

export const PRODUTO_IMAGEM_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const

export type ProdutoImagemMime = (typeof PRODUTO_IMAGEM_MIMES)[number]

const PUBLIC_MARKER = `/object/public/${PRODUTO_IMAGEM_BUCKET}/`

/** Extrai a chave do objeto no bucket a partir da URL pública gravada em `produtos.imagem_url`. */
export function storagePathFromProdutoImagemPublicUrl(url: string): string | null {
  const t = url.trim()
  if (!t) return null
  const i = t.indexOf(PUBLIC_MARKER)
  if (i === -1) return null
  try {
    return decodeURIComponent(t.slice(i + PUBLIC_MARKER.length).split('?')[0] ?? '')
  } catch {
    return null
  }
}

export function extensaoPorMime(mime: string): 'jpg' | 'png' | 'webp' | null {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  return null
}
