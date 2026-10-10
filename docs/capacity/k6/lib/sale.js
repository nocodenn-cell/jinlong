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
    duration_ms: res.timings.duration,
    body_excerpt: String(res.body).slice(0, 240),
  }
}
