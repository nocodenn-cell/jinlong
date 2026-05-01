/**
 * Exemplo de migração das chamadas existentes para a nova versão refatorada
 * 
 * Este arquivo mostra como converter as chamadas da função com 11 parâmetros
 * para a nova versão que usa um objeto único.
 */

import { respondSenhaGerenteInvalida, createGerenteValidationParams } from './caixaGerenteValidation.refactored'
import type { GerenteValidationParams } from './caixaGerenteValidation.types'

// ✅ EXEMPLO 1: Migração direta usando helper function
export async function exemploMigracaoDireta() {
  // ❌ ANTES (11 parâmetros individuais):
  // const result = await respondSenhaGerenteInvalida(
  //   "senha123",
  //   "loja-001",
  //   "device-fingerprint-abc",
  //   "session-xyz",
  //   "Mozilla/5.0...",
  //   "192.168.1.100",
  //   new Date(),
  //   "Desconto autorizado",
  //   150.50,
  //   "operador-001",
  //   "caixa-001"
  // )

  // ✅ DEPOIS (usando helper function):
  const result = await respondSenhaGerenteInvalida(
    createGerenteValidationParams(
      "senha123",
      "loja-001",
      "device-fingerprint-abc",
      "session-xyz",
      "Mozilla/5.0...",
      "192.168.1.100",
      new Date(),
      "Desconto autorizado",
      150.50,
      "operador-001",
      "caixa-001"
    )
  )

  return result
}

// ✅ EXEMPLO 2: Migração usando objeto direto (recomendado)
export async function exemploMigracaoObjetoDireto() {
  const params: GerenteValidationParams = {
    senha: "senha123",
    lojaId: "loja-001",
    deviceFingerprint: "device-fingerprint-abc",
    sessionId: "session-xyz",
    userAgent: "Mozilla/5.0...",
    ipAddress: "192.168.1.100",
    timestamp: new Date(),
    motivo: "Desconto autorizado",
    valor: 150.5,
    operadorId: "operador-001",
    caixaId: "caixa-001"
  }

  const result = await respondSenhaGerenteInvalida(params)
  return result
}

// ✅ EXEMPLO 3: Migração com parâmetros opcionais
export async function exemploMigracaoParametrosOpcionais() {
  const params: GerenteValidationParams = {
    senha: "senha123",
    // Parâmetros obrigatórios
    lojaId: "loja-001",
    deviceFingerprint: "device-fingerprint-abc",
    
    // Parâmetros opcionais (podem ser omitidos)
    // sessionId: undefined,
    // userAgent: undefined,
    // ipAddress: undefined,
    // timestamp: undefined,
    // motivo: undefined,
    // valor: undefined,
    // operadorId: undefined,
    // caixaId: undefined
  }

  const result = await respondSenhaGerenteInvalida(params)
  return result
}

// ✅ EXEMPLO 4: Migração em Server Actions existentes
export async function exemploServerActionMigrada(senha: string, lojaId: string, deviceFingerprint: string) {
  // ❌ ANTES:
  // return await respondSenhaGerenteInvalida(senha, lojaId, deviceFingerprint, "", "", "", new Date(), "", 0, "", "")

  // ✅ DEPOIS:
  return await respondSenhaGerenteInvalida({
    senha,
    lojaId,
    deviceFingerprint,
    // Outros parâmetros opcionais podem ser omitidos
    sessionId: "",
    userAgent: "",
    ipAddress: "",
    timestamp: new Date(),
    motivo: "",
    valor: 0,
    operadorId: "",
    caixaId: ""
  })
}

// ✅ EXEMPLO 5: Migração com valores dinâmicos
export async function exemploMigracaoDinamica(requestData: any) {
  const params: GerenteValidationParams = {
    senha: requestData.senha,
    lojaId: requestData.lojaId,
    deviceFingerprint: requestData.deviceFingerprint,
    sessionId: requestData.sessionId,
    userAgent: requestData.headers?.['user-agent'],
    ipAddress: requestData.ip,
    timestamp: new Date(),
    motivo: requestData.motivo || 'Validação de desconto',
    valor: requestData.valor || 0,
    operadorId: requestData.operadorId,
    caixaId: requestData.caixaId
  }

  return await respondSenhaGerenteInvalida(params)
}

/**
 * SCRIPT DE MIGRAÇÃO AUTOMÁTICA (para uso com find/replace)
 * 
 * Para migrar todas as chamadas existentes automaticamente:
 * 
 * 1. Encontrar: respondSenhaGerenteInvalida\(
 *    ([^,]+),\s*
 *    ([^,]+),\s*
 *    ([^,]+),\s*
 *    ([^,]+),\s*
 *    ([^,]+),\s*
 *    ([^,]+),\s*
 *    ([^,]+),\s*
 *    ([^,]+),\s*
 *    ([^,]+),\s*
 *    ([^,]+),\s*
 *    ([^,]+)\s*
 * \)
 * 
 * 2. Substituir por: respondSenhaGerenteInvalida({
 *    senha: $1,
 *    lojaId: $2,
 *    deviceFingerprint: $3,
 *    sessionId: $4,
 *    userAgent: $5,
 *    ipAddress: $6,
 *    timestamp: $7,
 *    motivo: $8,
 *    valor: $9,
 *    operadorId: $10,
 *    caixaId: $11
 *  })
 */
