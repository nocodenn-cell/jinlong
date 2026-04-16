import { logCaughtServerError } from '@/lib/logging/server-error'

export {
  mensagemErroParaUsuario,
  mensagemErroComSecao,
  mensagemErroComContexto,
  mensagemErroValidacaoZod,
} from '../../../shared/mensagemErroUsuario'

import { mensagemErroDeExcecao as mensagemErroDeExcecaoShared } from '../../../shared/mensagemErroUsuario'

/** Erros em `catch`: registra no servidor e traduz para o usuário. */
export function mensagemErroDeExcecao(e: unknown, fallbackEmPortugues: string): string {
  logCaughtServerError('mensagemErroDeExcecao', e)
  return mensagemErroDeExcecaoShared(e, fallbackEmPortugues)
}
