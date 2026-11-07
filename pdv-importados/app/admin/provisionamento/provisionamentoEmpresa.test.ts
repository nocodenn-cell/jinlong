import { describe, expect, it } from 'vitest'
import {
  gerarCodigoAtivacao,
  hashCodigoAtivacao,
  mensagemErroProvisionamento,
  montarPayloadRpc,
  validarEntradaProvisionamento,
  type ProvisionEmpresaInput,
} from './provisionamentoEmpresa'

const base: ProvisionEmpresaInput = {
  empresaNome: 'Comercial Long',
  empresaCnpj: '12.345.678/0001-90',
  lojas: [{ nome: 'Brás' }, { nome: '25 de Março', codigo: 'm25' }],
  dono: { nome: 'Sr. Long', email: 'dono@long.com.br', senha: 'senha-forte-1' },
  equipe: [
    { nome: 'Gerente', email: 'g@long.com.br', senha: 'senha-forte-2', papel: 'GERENTE', lojas: [0, 1] },
    { nome: 'Caixa', email: 'c@long.com.br', senha: 'senha-forte-3', papel: 'OPERADOR', lojas: [1] },
  ],
  idiomaPreferido: 'zh',
}

describe('provisionamento multiempresa', () => {
  it('aceita entrada válida e monta payload da RPC', () => {
    expect(validarEntradaProvisionamento(base, 8)).toBeNull()
    const p = montarPayloadRpc(base, { dono: 'u-d', equipe: ['u-g', 'u-c'] })
    expect(p.empresa.cnpj).toBe('12345678000190')
    expect(p.lojas.map((l) => l.chave)).toEqual(['L1', 'L2'])
    expect(p.lojas[1].codigo).toBe('M25')
    expect(p.usuarios).toEqual([
      { id: 'u-d', nome: 'Sr. Long', idioma: 'zh', papel: 'DONO' },
      { id: 'u-g', nome: 'Gerente', idioma: 'zh', papel: 'GERENTE', lojas: ['L1', 'L2'] },
      { id: 'u-c', nome: 'Caixa', idioma: 'zh', papel: 'OPERADOR', lojas: ['L2'] },
    ])
  })

  it('recusa operador em 2 lojas, e-mail repetido, domínio de teste, senha curta e loja fora da lista', () => {
    const op2 = { ...base, equipe: [{ ...base.equipe[1], lojas: [0, 1] }] }
    expect(validarEntradaProvisionamento(op2, 8)).toMatch(/uma loja só/)
    const dup = { ...base, equipe: [{ ...base.equipe[0], email: 'DONO@long.com.br' }] }
    expect(validarEntradaProvisionamento(dup, 8)).toMatch(/repetido/)
    expect(validarEntradaProvisionamento({ ...base, dono: { ...base.dono, email: 'a@example.com' } }, 8)).toMatch(/domínios de teste/)
    expect(validarEntradaProvisionamento(base, 50)).toMatch(/pelo menos 50/)
    expect(validarEntradaProvisionamento({ ...base, equipe: [{ ...base.equipe[0], lojas: [5] }] }, 8)).toMatch(/loja inválida/)
    expect(validarEntradaProvisionamento({ ...base, lojas: [] }, 8)).toMatch(/ao menos uma loja/)
  })

  it('código de ativação: formato, alfabeto sem ambíguos, hash canônico igual ao do banco', () => {
    const { exibicao, canonico } = gerarCodigoAtivacao()
    expect(exibicao).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/)
    expect(exibicao.replace(/-/g, '')).toBe(canonico)
    expect(hashCodigoAtivacao(` ${exibicao.toLowerCase()} `)).toBe(hashCodigoAtivacao(canonico))
    expect(hashCodigoAtivacao('K7QX-M2PA-9D')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('traduz erros da RPC', () => {
    expect(mensagemErroProvisionamento('ERROR: PROVISIONAR_USUARIO_DE_OUTRA_EMPRESA')).toMatch(/outra empresa/)
    expect(mensagemErroProvisionamento('x')).toBe('x')
  })
})
