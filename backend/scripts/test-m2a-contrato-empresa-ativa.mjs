#!/usr/bin/env node
/**
 * M2-A — validador do contrato conceitual de empresa ativa (puro, sintético).
 * NÃO altera ERP / schema / RLS. Apenas especifica o algoritmo fail-closed.
 */
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import test from 'node:test'

/**
 * @typedef {{ empresaId: string, lojaId: string|null, papel: string, ativo: boolean }} Vinculo
 * @typedef {{ authUserId: string|null, ativo: boolean, vinculos: Vinculo[], solicitado?: { empresaId?: string|null, lojaId?: string|null }, empresaAtivaPersistida?: string|null, lojas: Record<string,{empresaId:string}> }} Input
 */

/** Resolve contexto operacional — fail closed. */
export function resolverContextoEmpresaAtiva(input) {
  if (!input.authUserId) return { ok: false, code: 'NAO_AUTENTICADO' }
  if (!input.ativo) return { ok: false, code: 'USUARIO_INATIVO' }
  const ativos = (input.vinculos || []).filter((v) => v.ativo)
  if (ativos.length === 0) return { ok: false, code: 'SEM_VINCULO' }

  const empresas = [...new Set(ativos.map((v) => v.empresaId))]
  let empresaId = input.solicitado?.empresaId ?? input.empresaAtivaPersistida ?? null

  if (!empresaId) {
    if (empresas.length === 1) empresaId = empresas[0]
    else return { ok: false, code: 'EMPRESA_ATIVA_OBRIGATORIA' }
  }

  if (!empresas.includes(empresaId)) return { ok: false, code: 'EMPRESA_NAO_AUTORIZADA' }

  const vinculosEmpresa = ativos.filter((v) => v.empresaId === empresaId)
  let lojaId = input.solicitado?.lojaId ?? null

  if (lojaId) {
    const loja = input.lojas[lojaId]
    if (!loja || loja.empresaId !== empresaId) return { ok: false, code: 'LOJA_FORA_DA_EMPRESA' }
    const pode = vinculosEmpresa.some(
      (v) => v.papel === 'DONO' || v.lojaId === lojaId,
    )
    if (!pode) return { ok: false, code: 'LOJA_NAO_AUTORIZADA' }
  } else {
    const op = vinculosEmpresa.find((v) => v.papel === 'OPERADOR' && v.lojaId)
    if (op) lojaId = op.lojaId
    else if (vinculosEmpresa.length === 1 && vinculosEmpresa[0].lojaId) lojaId = vinculosEmpresa[0].lojaId
    // DONO sem loja: lojaId null permitido em telas consolidadas
  }

  const papel =
    vinculosEmpresa.find((v) => v.papel === 'DONO')?.papel ||
    vinculosEmpresa.find((v) => v.lojaId === lojaId)?.papel ||
    vinculosEmpresa[0].papel

  return {
    ok: true,
    authUserId: input.authUserId,
    empresaId,
    lojaId,
    papel,
    // cliente nunca é fonte de verdade
    fontes: { identidade: 'auth.uid', escopo: 'usuario_vinculos', selecao: 'servidor_validada' },
  }
}

const E_A = 'ea', E_B = 'eb', L_A1 = 'la1', L_B1 = 'lb1'
const lojas = { [L_A1]: { empresaId: E_A }, [L_B1]: { empresaId: E_B } }
const results = []

function case_(id, input, expectCodeOrOk) {
  const r = resolverContextoEmpresaAtiva(input)
  const pass = typeof expectCodeOrOk === 'string' ? r.code === expectCodeOrOk : r.ok === true
  results.push({ id, esperado: expectCodeOrOk, observado: r.ok ? r : r.code, pass })
  assert.ok(pass, `${id}: ${JSON.stringify(r)}`)
}

test('M2-A contrato fail-closed', () => {
  case_('T1-sem-auth', { authUserId: null, ativo: true, vinculos: [], lojas }, 'NAO_AUTENTICADO')
  case_('T2-sem-vinculo', { authUserId: 'u', ativo: true, vinculos: [], lojas }, 'SEM_VINCULO')
  case_('T3-dual-sem-ativa', {
    authUserId: 'u', ativo: true, lojas,
    vinculos: [
      { empresaId: E_A, lojaId: L_A1, papel: 'GERENTE', ativo: true },
      { empresaId: E_B, lojaId: L_B1, papel: 'GERENTE', ativo: true },
    ],
  }, 'EMPRESA_ATIVA_OBRIGATORIA')
  case_('T4-empresa-alheia', {
    authUserId: 'u', ativo: true, lojas,
    vinculos: [{ empresaId: E_A, lojaId: L_A1, papel: 'OPERADOR', ativo: true }],
    solicitado: { empresaId: E_B },
  }, 'EMPRESA_NAO_AUTORIZADA')
  case_('T5-loja-outra-empresa', {
    authUserId: 'u', ativo: true, lojas,
    vinculos: [{ empresaId: E_A, lojaId: L_A1, papel: 'GERENTE', ativo: true }],
    solicitado: { empresaId: E_A, lojaId: L_B1 },
  }, 'LOJA_FORA_DA_EMPRESA')
  case_('T6-header-falsificado-loja-B', {
    authUserId: 'u', ativo: true, lojas,
    vinculos: [{ empresaId: E_A, lojaId: L_A1, papel: 'OPERADOR', ativo: true }],
    empresaAtivaPersistida: E_A,
    solicitado: { lojaId: L_B1 },
  }, 'LOJA_FORA_DA_EMPRESA')
  case_('T7-unica-empresa-auto', {
    authUserId: 'u', ativo: true, lojas,
    vinculos: [{ empresaId: E_A, lojaId: L_A1, papel: 'OPERADOR', ativo: true }],
  }, true)
  case_('T8-dual-com-ativa-A', {
    authUserId: 'u', ativo: true, lojas,
    vinculos: [
      { empresaId: E_A, lojaId: L_A1, papel: 'GERENTE', ativo: true },
      { empresaId: E_B, lojaId: L_B1, papel: 'GERENTE', ativo: true },
    ],
    empresaAtivaPersistida: E_A,
    solicitado: { lojaId: L_A1 },
  }, true)
  case_('T9-vinculo-revogado', {
    authUserId: 'u', ativo: true, lojas,
    vinculos: [{ empresaId: E_A, lojaId: L_A1, papel: 'OPERADOR', ativo: false }],
    empresaAtivaPersistida: E_A,
  }, 'SEM_VINCULO')
  case_('T10-inativo', {
    authUserId: 'u', ativo: false, lojas,
    vinculos: [{ empresaId: E_A, lojaId: L_A1, papel: 'OPERADOR', ativo: true }],
  }, 'USUARIO_INATIVO')

  mkdirSync('/opt/cursor/artifacts', { recursive: true })
  writeFileSync(
    '/opt/cursor/artifacts/m2a-contrato-empresa-ativa.json',
    JSON.stringify({ suite: 'm2a-contrato', pass: results.filter(r=>r.pass).length, total: results.length, results }, null, 2),
  )
})
