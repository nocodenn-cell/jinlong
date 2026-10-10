import http from 'k6/http'
import { check } from 'k6'
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js'

/**
 * Finaliza venda canônica v4 autenticada (PostgREST RPC).
 * Persistência real: vendas + estoque + caixa.
 */
export function finalizarVendaV4(apiUrl, anonKey, accessToken, ctx) {
  const vendaId = uuidv4()
  const itemId = uuidv4()
  const preco = Number(ctx.preco)
  const payload = {
    p_venda_id: vendaId,
    p_caixa_id: ctx.caixa_id,
    p_operador_id: ctx.operador_id,
    p_loja_id: ctx.loja_id,
    p_forma_pagamento: 'DINHEIRO',
    p_total_bruto: preco,
    p_total_desconto: 0,
    p_total_liquido: preco,
    p_pagamentos: [{ forma_pagamento: 'DINHEIRO', valor: preco }],
    p_itens: [
      {
        item_id: itemId,
        produto_id: ctx.produto_id,
        quantidade: 1,
        preco_original: preco,
        preco_unitario: preco,
        tipo_preco: 'VAREJO',
      },
    ],
  }

  const res = http.post(
    `${apiUrl}/rest/v1/rpc/finalizar_venda_transacional_canonica_v4`,
    JSON.stringify(payload),
    {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      tags: { op: 'finalize_v4', loja: String(ctx.loja_codigo || '') },
      timeout: '30s',
    },
  )

  let statusRpc = null
  let persisted = false
  try {
    const body = res.json()
    const row = Array.isArray(body) ? body[0] : body
    statusRpc = row && row.status
    persisted = statusRpc === 'CONCLUIDA'
  } catch (_) {
    statusRpc = null
  }

  check(res, {
    'finalize http 2xx': (r) => r.status >= 200 && r.status < 300,
    'finalize CONCLUIDA': () => persisted,
  })

  return {
    ok: persisted,
    http_status: res.status,
    rpc_status: statusRpc,
    venda_id: vendaId,
    total: preco,
    duration_ms: res.timings.duration,
    body_excerpt: String(res.body).slice(0, 240),
  }
}

function authHeaders(anonKey, accessToken) {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
}

function parseJson(res) {
  try {
    return res.json()
  } catch (_) {
    return null
  }
}

/** Bipagem no /caixa: preço autoritativo por produto/loja. */
export function calcularPrecoProduto(apiUrl, anonKey, accessToken, ctx) {
  const res = http.post(
    `${apiUrl}/rest/v1/rpc/calcular_preco_produto`,
    JSON.stringify({ p_produto_id: ctx.produto_id, p_quantidade: 1, p_loja_id: ctx.loja_id }),
    { headers: authHeaders(anonKey, accessToken), tags: { op: 'scan_preco' }, timeout: '30s' },
  )
  const body = parseJson(res)
  const ok = res.status === 200 && body !== null && body.erro == null && Number(body.preco) >= 0
  check(res, { 'scan preço ok': () => ok })
  return { ok, duration_ms: res.timings.duration, http_status: res.status }
}

/** Pré-finalização no servidor do /caixa: produto ativo e publicado. */
export function validarProdutosVenda(apiUrl, anonKey, accessToken, ctx) {
  const res = http.get(
    `${apiUrl}/rest/v1/produtos?id=in.(${ctx.produto_id})&select=id,preco_varejo,ativo,status_publicacao`,
    { headers: authHeaders(anonKey, accessToken), tags: { op: 'prevalidacao' }, timeout: '30s' },
  )
  const body = parseJson(res)
  const ok = res.status === 200 && Array.isArray(body) && body.length === 1 && body[0].ativo === true
  check(res, { 'prevalidação produto ok': () => ok })
  return { ok, duration_ms: res.timings.duration, http_status: res.status }
}

/**
 * Leitura independente pós-commit (RLS do operador): venda CONCLUIDA, total e pagamentos.
 * Itens não são legíveis por perfil CAIXA (policy itens_gerente) — validados na reconciliação SQL.
 */
export function lerVendaPersistida(apiUrl, anonKey, accessToken, venda) {
  const res = http.get(
    `${apiUrl}/rest/v1/vendas?id=eq.${venda.venda_id}&select=id,status,total_liquido,vendas_pagamentos(valor)`,
    { headers: authHeaders(anonKey, accessToken), tags: { op: 'readback' }, timeout: '30s' },
  )
  const body = parseJson(res)
  const row = Array.isArray(body) && body.length === 1 ? body[0] : null
  const pago = row ? row.vendas_pagamentos.reduce((s, p) => s + Number(p.valor), 0) : -1
  const ok =
    row !== null &&
    row.status === 'CONCLUIDA' &&
    Math.abs(Number(row.total_liquido) - venda.total) < 0.005 &&
    Math.abs(pago - venda.total) < 0.005
  check(res, { 'readback venda persistida': () => ok })
  return { ok, duration_ms: res.timings.duration, http_status: res.status }
}
