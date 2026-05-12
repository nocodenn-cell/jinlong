import { describe, expect, it } from 'vitest'
import {
  PRODUTO_IMAGEM_BUCKET,
  storagePathFromProdutoImagemPublicUrl,
} from '@/lib/gerente/produtoImagemStorage'

describe('produtoImagemStorage', () => {
  it('extrai caminho do objecto a partir da URL pública', () => {
    const url = `https://xyz.supabase.co/storage/v1/object/public/${PRODUTO_IMAGEM_BUCKET}/abc/def.jpg`
    expect(storagePathFromProdutoImagemPublicUrl(url)).toBe('abc/def.jpg')
  })

  it('devolve null se URL não for do bucket', () => {
    expect(storagePathFromProdutoImagemPublicUrl('https://example.com/x')).toBeNull()
  })
})
