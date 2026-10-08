#!/usr/bin/env node
/**
 * Espelho F1 do resolver TS (pdv-importados/lib/admin/auth/tenantContext.ts).
 * Ambiente cloud sem vitest/vite — valida o mesmo algoritmo.
 */
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import test from 'node:test'

function resolverContextoEmpresaAtiva(input) {
  if (!input.authUserId) return { ok: false, code: 'NAO_AUTENTICADO' }
  if (!input.ativo) return { ok: false, code: 'USUARIO_INATIVO' }
  const ativos = input.vinculos.filter((v) => v.ativo)
  if (ativos.length === 0) {
    if (input.legacyLojaId) {
      return {
        ok: true,
        authUserId: input.authUserId,
        empresaId: '',
        lojaId: input.legacyLojaId,
        mode: 'legacy_single_loja',
      }
    }
    return { ok: false, code: 'SEM_VINCULO' }
  }
  const empresas = [...new Set(ativos.map((v) => v.empresaId))]
  let empresaId = input.solicitado?.empresaId ?? input.persistido?.empresaId ?? null
  if (!empresaId) {
    if (empresas.length === 1) empresaId = empresas[0]
    else return { ok: false, code: 'EMPRESA_ATIVA_OBRIGATORIA' }
  }
  if (!empresas.includes(empresaId)) return { ok: false, code: 'EMPRESA_NAO_AUTORIZADA' }
  if (
    input.empresaEsperadaOperacao != null &&
    input.empresaEsperadaOperacao !== '' &&
    input.empresaEsperadaOperacao !== empresaId
  ) {
    return { ok: false, code: 'EMPRESA_DIVERGENTE' }
  }
  const vinculosEmpresa = ativos.filter((v) => v.empresaId === empresaId)
  let lojaId = input.solicitado?.lojaId ?? input.persistido?.lojaId ?? null
  if (lojaId) {
    const loja = input.lojas[lojaId]
    if (!loja || loja.empresaId !== empresaId) return { ok: false, code: 'LOJA_FORA_DA_EMPRESA' }
    const pode = vinculosEmpresa.some((v) => v.papel === 'DONO' || v.lojaId === lojaId)
    if (!pode) return { ok: false, code: 'LOJA_NAO_AUTORIZADA' }
  }
  return { ok: true, empresaId, lojaId, mode: 'multiempresa' }
}

const E_A = 'ea', E_B = 'eb', L_A1 = 'la1', L_B1 = 'lb1'
const lojas = { [L_A1]: { empresaId: E_A }, [L_B1]: { empresaId: E_B } }
const out = []

test('resolver F1 espelho TS', () => {
  const cases = [
    [
      'dual',
      {
        authUserId: 'u',
        ativo: true,
        lojas,
        vinculos: [
          { empresaId: E_A, lojaId: L_A1, papel: 'GERENTE', ativo: true },
          { empresaId: E_B, lojaId: L_B1, papel: 'GERENTE', ativo: true },
        ],
      },
      'EMPRESA_ATIVA_OBRIGATORIA',
    ],
    [
      'single',
      {
        authUserId: 'u',
        ativo: true,
        lojas,
        vinculos: [{ empresaId: E_A, lojaId: L_A1, papel: 'OPERADOR', ativo: true }],
      },
      true,
    ],
    [
      'adulteracao',
      {
        authUserId: 'u',
        ativo: true,
        lojas,
        vinculos: [{ empresaId: E_A, lojaId: L_A1, papel: 'OPERADOR', ativo: true }],
        solicitado: { empresaId: E_B },
      },
      'EMPRESA_NAO_AUTORIZADA',
    ],
    [
      'divergente',
      {
        authUserId: 'u',
        ativo: true,
        lojas,
        vinculos: [
          { empresaId: E_A, lojaId: L_A1, papel: 'GERENTE', ativo: true },
          { empresaId: E_B, lojaId: L_B1, papel: 'GERENTE', ativo: true },
        ],
        persistido: { empresaId: E_B, lojaId: L_B1, version: 2 },
        empresaEsperadaOperacao: E_A,
      },
      'EMPRESA_DIVERGENTE',
    ],
    [
      'legado',
      { authUserId: 'u', ativo: true, lojas: {}, vinculos: [], legacyLojaId: L_A1 },
      true,
    ],
  ]
  for (const [id, input, expect] of cases) {
    const r = resolverContextoEmpresaAtiva(input)
    const pass = expect === true ? r.ok === true : r.ok === false && r.code === expect
    out.push({ id, pass, r })
    assert.ok(pass, id)
  }
  mkdirSync('/opt/cursor/artifacts', { recursive: true })
  writeFileSync(
    '/opt/cursor/artifacts/m2b-tenant-resolver.json',
    JSON.stringify({ pass: out.filter((x) => x.pass).length, total: out.length, out }, null, 2),
  )
})
