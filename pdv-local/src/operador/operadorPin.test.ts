import { describe, expect, it } from 'vitest'
import {
  aplicarTeclaPin,
  gerentesComPin,
  iniciais,
  mensagemErroPin,
  minutosBloqueio,
  modoPinAtivo,
  type OperadoresStatus,
} from './operadorPin'

const base: OperadoresStatus = {
  disponivel: true,
  expirado: false,
  exigir_pin_operador: true,
  bloqueio_inatividade_min: 3,
  expira_em: null,
  operador_atual: null,
  operadores: [
    { usuario_id: 'a', nome: 'Ana Souza', papel: 'OPERADOR', idioma: 'pt', tem_pin: true },
    { usuario_id: 'b', nome: 'Bruno', papel: 'GERENTE', idioma: 'zh', tem_pin: true },
    { usuario_id: 'c', nome: 'Carla', papel: 'GERENTE', idioma: 'pt', tem_pin: false },
  ],
}

describe('modo PIN', () => {
  it('só liga com flag da loja + alguém com PIN', () => {
    expect(modoPinAtivo(base)).toBe(true)
    expect(modoPinAtivo({ ...base, exigir_pin_operador: false })).toBe(false)
    expect(modoPinAtivo({ ...base, disponivel: false })).toBe(false)
    expect(modoPinAtivo({ ...base, operadores: base.operadores.map((o) => ({ ...o, tem_pin: false })) })).toBe(false)
    expect(modoPinAtivo(null)).toBe(false)
  })
  it('gerentes com PIN e minutos', () => {
    expect(gerentesComPin(base).map((g) => g.usuario_id)).toEqual(['b'])
    expect(minutosBloqueio(base)).toBe(3)
    expect(minutosBloqueio({ ...base, bloqueio_inatividade_min: 0 })).toBe(3)
  })
})

describe('teclado do PIN', () => {
  it('4 dígitos enviam sozinhos', () => {
    let v = ''
    let enviar = false
    for (const t of ['7', '3', '9', '1']) ({ valor: v, enviar } = aplicarTeclaPin(v, t))
    expect(v).toBe('7391')
    expect(enviar).toBe(true)
    expect(aplicarTeclaPin('7391', '5').valor).toBe('7391')
    expect(aplicarTeclaPin('739', 'Backspace').valor).toBe('73')
    expect(aplicarTeclaPin('739', 'Escape').valor).toBe('')
    expect(aplicarTeclaPin('739', 'Enter').enviar).toBe(false)
    expect(aplicarTeclaPin('73', 'a').valor).toBe('73')
  })
})

describe('mensagens', () => {
  it('bilíngue e com minutos restantes', () => {
    expect(mensagemErroPin({ erro: 'PIN_INCORRETO', bloqueado_ate_unix: null })).toContain('错误')
    expect(mensagemErroPin({ erro: 'PIN_BLOQUEADO', bloqueado_ate_unix: 1000 + 240 }, 1000 * 1000)).toContain('4 min')
    expect(mensagemErroPin({ erro: 'PIN_BLOQUEADO_GERENTE', bloqueado_ate_unix: null })).toContain('gerente')
    expect(iniciais('Ana Maria Souza')).toBe('AS')
  })
})
