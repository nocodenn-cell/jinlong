import { createHash, randomInt } from 'node:crypto'

/**
 * Peças puras do provisionamento multiempresa (ESPEC_MULTIEMPRESA_V1 §4/§11).
 * O payload vai para `plataforma_provisionar_empresa` (RPC atômica, service_role).
 */

export type PapelEquipe = 'GERENTE' | 'OPERADOR'

export type ProvisionEmpresaInput = {
  empresaNome: string
  empresaCnpj?: string | null
  lojas: { nome: string; codigo?: string | null }[]
  dono: { nome: string; email: string; senha: string }
  equipe: { nome: string; email: string; senha: string; papel: PapelEquipe; lojas: number[] }[]
  idiomaPreferido: 'pt' | 'zh'
}

export type RpcPayload = {
  empresa: { nome: string; cnpj: string | null }
  lojas: { chave: string; nome: string; codigo: string | null }[]
  usuarios: { id: string; nome: string; idioma: 'pt' | 'zh'; papel: 'DONO' | PapelEquipe; lojas?: string[] }[]
}

const TEST_DOMAIN = /@(localhost\.test|example\.com|exemplo\.com)$/i

/** Retorna mensagem de erro (pt-BR) ou null. Regras que a RPC não consegue checar (e-mail/senha). */
export function validarEntradaProvisionamento(input: ProvisionEmpresaInput, senhaMin: number): string | null {
  if (input.lojas.length < 1) return 'Informe ao menos uma loja.'
  if (input.lojas.length > 20) return 'Máximo de 20 lojas por provisionamento.'
  const nomes = new Set<string>()
  for (const l of input.lojas) {
    const k = l.nome.trim().toLowerCase()
    if (k.length < 2) return 'Nome de loja inválido.'
    if (nomes.has(k)) return `Loja repetida: ${l.nome}`
    nomes.add(k)
  }
  const pessoas = [input.dono, ...input.equipe]
  const emails = new Set<string>()
  for (const p of pessoas) {
    const e = p.email.trim().toLowerCase()
    if (TEST_DOMAIN.test(e)) return 'Use e-mails reais do cliente (não use domínios de teste).'
    if (emails.has(e)) return `E-mail repetido: ${e}`
    emails.add(e)
    if (p.senha.length < senhaMin) return `A senha de ${p.nome || e} deve ter pelo menos ${senhaMin} caracteres.`
  }
  for (const m of input.equipe) {
    if (m.lojas.length < 1) return `${m.nome}: escolha ao menos uma loja.`
    if (m.papel === 'OPERADOR' && m.lojas.length > 1) return `${m.nome}: operador trabalha em uma loja só.`
    if (m.lojas.some((i) => !Number.isInteger(i) || i < 0 || i >= input.lojas.length)) return `${m.nome}: loja inválida.`
  }
  return null
}

export function montarPayloadRpc(
  input: ProvisionEmpresaInput,
  ids: { dono: string; equipe: string[] },
): RpcPayload {
  const chave = (i: number) => `L${i + 1}`
  return {
    empresa: {
      nome: input.empresaNome.trim(),
      cnpj: (input.empresaCnpj ?? '').replace(/\D/g, '') || null,
    },
    lojas: input.lojas.map((l, i) => ({
      chave: chave(i),
      nome: l.nome.trim(),
      codigo: l.codigo?.trim() ? l.codigo.trim().toUpperCase() : null,
    })),
    usuarios: [
      { id: ids.dono, nome: input.dono.nome.trim(), idioma: input.idiomaPreferido, papel: 'DONO' },
      ...input.equipe.map((m, i) => ({
        id: ids.equipe[i],
        nome: m.nome.trim(),
        idioma: input.idiomaPreferido,
        papel: m.papel,
        lojas: m.lojas.map(chave),
      })),
    ],
  }
}

const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // sem 0/O/1/I/L

/** Código de ativação do PDV: 12 símbolos (~59 bits), exibido como XXXX-XXXX-XXXX. */
export function gerarCodigoAtivacao(rand: (max: number) => number = randomInt): { exibicao: string; canonico: string } {
  let c = ''
  for (let i = 0; i < 12; i += 1) c += ALFABETO[rand(ALFABETO.length)]
  return { exibicao: `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`, canonico: c }
}

/** Mesma forma canônica do banco (`ativar_dispositivo_pdv`): só [A-Z0-9] maiúsculo. */
export function hashCodigoAtivacao(codigo: string): string {
  const canon = codigo.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return createHash('sha256').update(canon, 'utf8').digest('hex')
}

const ERROS_RPC: Record<string, string> = {
  PROVISIONAR_USUARIO_DE_OUTRA_EMPRESA: 'Um dos e-mails já pertence a outra empresa (ou à equipe da plataforma).',
  PROVISIONAR_LIMITE_LOJAS: 'Limite de lojas do plano excedido.',
  PROVISIONAR_LIMITE_USUARIOS: 'Limite de usuários do plano excedido.',
  PROVISIONAR_OPERADOR_UMA_LOJA: 'Operador trabalha em uma loja só.',
  PROVISIONAR_SEM_DONO: 'Informe o DONO da empresa.',
  PROVISIONAR_LOJA_DUPLICADA: 'Loja repetida.',
  empresas_cnpj_uniq: 'Já existe empresa com este CNPJ.',
}

export function mensagemErroProvisionamento(raw: string): string {
  for (const [k, v] of Object.entries(ERROS_RPC)) if (raw.includes(k)) return v
  return raw
}
