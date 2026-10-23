import { describe, expect, it } from 'vitest'
import { resolverTopbarEmpresa } from './topbarEmpresa'

const A = { empresa_id: 'a', loja_id: 'l1', nome: 'Loja A' }
const B = { empresa_id: 'b', loja_id: null, nome: ' Empresa B ' }

describe('resolverTopbarEmpresa', () => {
  it('usa a empresa ativa da sessão', () => {
    expect(resolverTopbarEmpresa([A, B], 'b')).toEqual({ empresaNome: 'Empresa B', podeTrocarEmpresa: true })
  })
  it('vínculo único sem empresa na sessão ⇒ mostra esse e não oferece troca', () => {
    expect(resolverTopbarEmpresa([A], null)).toEqual({ empresaNome: 'Loja A', podeTrocarEmpresa: false })
  })
  it('várias empresas sem ativa ⇒ sem nome, com troca', () => {
    expect(resolverTopbarEmpresa([A, B], null)).toEqual({ empresaNome: null, podeTrocarEmpresa: true })
  })
  it('sem vínculos (ADMIN legado) ⇒ nada', () => {
    expect(resolverTopbarEmpresa([], null)).toEqual({ empresaNome: null, podeTrocarEmpresa: false })
  })
  it('empresa ativa fora dos vínculos ⇒ sem nome', () => {
    expect(resolverTopbarEmpresa([A], 'zzz').empresaNome).toBeNull()
  })
})
