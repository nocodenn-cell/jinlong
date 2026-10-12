import { getUsuarioAtual, type UsuarioAtual } from '@/lib/auth/usuarioAtual'
import { getMessages } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'

type ChavePalm = keyof ReturnType<typeof getMessages>['palm']

export type SessaoPalm =
  | { ok: true; usuario: UsuarioAtual & { userId: string; lojaId: string } }
  | { ok: false; error: string }

export function textoPalm(idioma: Idioma, chave: ChavePalm): string {
  return getMessages(idioma).palm[chave]
}

export async function exigirSessaoPalm(): Promise<SessaoPalm> {
  const usuario = await getUsuarioAtual()
  if (!usuario.userId) return { ok: false, error: textoPalm(usuario.idioma, 'erro_sessao') }
  if (!usuario.lojaId) return { ok: false, error: textoPalm(usuario.idioma, 'erro_loja') }
  if (!perfilPalm(usuario.perfil)) return { ok: false, error: textoPalm(usuario.idioma, 'erro_perfil') }
  return { ok: true, usuario: { ...usuario, userId: usuario.userId, lojaId: usuario.lojaId } }
}

function perfilPalm(perfil: string): boolean {
  return perfil === 'OPERADOR' || perfil === 'GERENTE' || perfil === 'DONO' || perfil === 'ADMIN'
}

const CODIGOS: { codigo: string; chave: ChavePalm }[] = [
  { codigo: 'sessao_expirada', chave: 'erro_sessao' },
  { codigo: 'nao_autorizado', chave: 'erro_perfil' },
  { codigo: 'perfil_nao_autorizado', chave: 'erro_perfil' },
  { codigo: 'loja_nao_autorizada', chave: 'erro_loja' },
  { codigo: 'estoque_insuficiente', chave: 'estoque_insuficiente' },
  { codigo: 'pedido_ja_assumido', chave: 'erro_assumido' },
  { codigo: 'pedido_idempotencia_payload_divergente', chave: 'erro_idempotencia' },
  { codigo: 'pedido_idempotencia_conflito', chave: 'erro_idempotencia' },
  { codigo: 'cliente_invalido', chave: 'erro_cliente' },
  { codigo: 'motivo_obrigatorio', chave: 'erro_motivo' },
  { codigo: 'produto_nao_encontrado', chave: 'sem_resultado' },
  { codigo: 'quantidade_invalida', chave: 'erro_quantidade' },
  { codigo: 'carrinho_vazio', chave: 'vazio' },
]

export function traduzirErroPalm(raw: string, idioma: Idioma): string {
  const encontrado = CODIGOS.find((item) => raw.includes(item.codigo))
  if (!encontrado) return textoPalm(idioma, 'erro_generico')
  return textoPalm(idioma, encontrado.chave)
}
