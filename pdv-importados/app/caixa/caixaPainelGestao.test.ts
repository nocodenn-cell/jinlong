import { describe, expect, it } from 'vitest'
import { ROUTES } from '@shared-core/navigation/routes'
import { painelGestaoHrefParaPerfil } from './caixaPainelGestao'

describe('painelGestaoHrefParaPerfil (PDV → painel)', () => {
  it.each(['GERENTE', 'DONO', 'ADMIN'])('%s recebe o atalho para o painel', (perfil) => {
    expect(painelGestaoHrefParaPerfil(perfil)).toBe(ROUTES.admin.dashboard)
  })

  it.each(['OPERADOR', 'operador', 'gerente', '', 'QUALQUER_COISA', null, undefined])(
    'perfil %s não recebe atalho (o operador de caixa não vê o painel)',
    (perfil) => {
      expect(painelGestaoHrefParaPerfil(perfil as string | null | undefined)).toBeNull()
    },
  )
})
