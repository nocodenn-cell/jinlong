/**
 * Resumo legível do que cada perfil pode fazer.
 *
 * ⚠️ **Isto é descrição, não autoridade.** Quem decide o que um perfil pode
 * fazer é a RLS no banco (policies + checagem de perfil dentro das RPCs). Este
 * arquivo existe só para que quem atribui um perfil na tela de Funcionários veja
 * o que está concedendo — hoje o `<select>` diz "GERENTE" e nada mais.
 *
 * Nenhuma permissão nova é criada aqui, e nada nesta lista é consultado para
 * autorizar ação alguma. Se divergir da RLS, a RLS está certa.
 *
 * Fonte: `docs/AUTHORIZATION_MATRIX.md`.
 */

export type PerfilComCapacidades = 'OPERADOR' | 'GERENTE' | 'DONO' | 'ADMIN'

export type CapacidadesPerfil = {
  /** O que o perfil passa a poder fazer. */
  permite: readonly string[]
  /** O que continua vedado — tão importante quanto o que libera. */
  naoPermite: readonly string[]
}

export const CAPACIDADES_PERFIL: Record<PerfilComCapacidades, CapacidadesPerfil> = {
  OPERADOR: {
    permite: [
      'Vender no PDV e abrir o próprio caixa',
      'Ver apenas as próprias vendas',
      'Registrar suprimento e sangria no próprio caixa',
    ],
    naoPermite: [
      'Ver vendas de outros operadores',
      'Cancelar venda',
      'Alterar produtos ou ajustar estoque',
      'Acessar financeiro e documentos fiscais',
    ],
  },
  GERENTE: {
    permite: [
      'Tudo do Operador',
      'Ver e cancelar vendas de toda a loja',
      'Alterar produtos e ajustar estoque manualmente',
      'Autorizar desconto e sangria acima do limite',
      'Acessar financeiro, contas a receber e documentos fiscais',
      'Transferir estoque entre lojas',
    ],
    naoPermite: ['Ver dados de outras lojas'],
  },
  DONO: {
    permite: [
      'Tudo do Gerente',
      'Visão macro: vendas e estoque de TODAS as lojas',
    ],
    naoPermite: [],
  },
  ADMIN: {
    permite: [
      'Tudo do Gerente na própria loja',
      'Provisionamento e configuração do sistema',
    ],
    naoPermite: ['Visão macro multi-loja (é exclusiva do Dono)'],
  },
}

export function capacidadesDoPerfil(perfil: string): CapacidadesPerfil | null {
  return perfil in CAPACIDADES_PERFIL
    ? CAPACIDADES_PERFIL[perfil as PerfilComCapacidades]
    : null
}
