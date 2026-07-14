#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_TYPES = new Set([
  "VENDA_REGISTRADA",
  "CAIXA_ABERTO",
  "CAIXA_FECHADO",
  "MOVIMENTO_CAIXA",
]);

function isRecord(x) {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function isUuid(v) {
  return typeof v === "string" && UUID_RE.test(v.trim());
}

function asError(message) {
  return { ok: false, error: message };
}

function ok() {
  return { ok: true };
}

function validateVendaPayload(payload) {
  if (!isRecord(payload)) return asError("payload.venda deve ser objeto");
  if (!isUuid(payload.venda_id)) return asError("venda_id inválido");
  if (typeof payload.forma_pagamento !== "string" || !payload.forma_pagamento.trim()) {
    return asError("forma_pagamento inválida");
  }
  for (const k of ["total_bruto", "total_desconto", "total_liquido"]) {
    if (typeof payload[k] !== "number" || !Number.isFinite(payload[k])) {
      return asError(`${k} inválido`);
    }
  }
  if (!Array.isArray(payload.itens) || payload.itens.length === 0) {
    return asError("itens inválido");
  }
  for (const item of payload.itens) {
    if (!isRecord(item)) return asError("item inválido");
    if (!isUuid(item.produto_id)) return asError("item.produto_id inválido");
    if (typeof item.quantidade !== "number" || !Number.isFinite(item.quantidade) || item.quantidade <= 0) {
      return asError("item.quantidade inválido");
    }
    for (const k of ["preco_original", "preco_unitario"]) {
      if (typeof item[k] !== "number" || !Number.isFinite(item[k])) {
        return asError(`item.${k} inválido`);
      }
    }
  }
  return ok();
}

function validateCaixaAbertoPayload(payload) {
  if (!isRecord(payload)) return asError("payload.caixa_aberto deve ser objeto");
  if (!isUuid(payload.id)) return asError("id caixa inválido");
  if (typeof payload.valor_inicial !== "number" || !Number.isFinite(payload.valor_inicial)) {
    return asError("valor_inicial inválido");
  }
  return ok();
}

function validateCaixaFechadoPayload(payload) {
  if (!isRecord(payload)) return asError("payload.caixa_fechado deve ser objeto");
  if (!isUuid(payload.id)) return asError("id caixa inválido");
  if (typeof payload.data_fechamento !== "string" || !payload.data_fechamento.trim()) {
    return asError("data_fechamento inválida");
  }
  if (typeof payload.valor_fechamento !== "number" || !Number.isFinite(payload.valor_fechamento)) {
    return asError("valor_fechamento inválido");
  }
  if (payload.fechamento_observacao !== undefined && payload.fechamento_observacao !== null) {
    if (typeof payload.fechamento_observacao !== "string") {
      return asError("fechamento_observacao inválida");
    }
    if (payload.fechamento_observacao.length > 500) {
      return asError("fechamento_observacao muito longa");
    }
  }
  return ok();
}

function validateMovimentoPayload(payload) {
  if (!isRecord(payload)) return asError("payload.movimento deve ser objeto");
  if (!isUuid(payload.id)) return asError("id movimento inválido");
  if (!isUuid(payload.caixa_id)) return asError("caixa_id inválido");
  if (payload.tipo !== "SANGRIA" && payload.tipo !== "SUPRIMENTO") {
    return asError("tipo movimento inválido");
  }
  if (typeof payload.valor !== "number" || !Number.isFinite(payload.valor)) {
    return asError("valor movimento inválido");
  }
  return ok();
}

function validateNormalizedEvent(event) {
  if (!isRecord(event)) return asError("evento deve ser objeto");
  if (!isUuid(event.id)) return asError("id evento inválido");
  if (typeof event.created_at !== "string" || !event.created_at.trim()) {
    return asError("created_at inválido");
  }
  if (!EVENT_TYPES.has(event.tipo)) return asError("tipo inválido");
  if (!isRecord(event.payload)) return asError("payload inválido");

  if (event.tipo === "VENDA_REGISTRADA") return validateVendaPayload(event.payload);
  if (event.tipo === "CAIXA_ABERTO") return validateCaixaAbertoPayload(event.payload);
  if (event.tipo === "CAIXA_FECHADO") return validateCaixaFechadoPayload(event.payload);
  return validateMovimentoPayload(event.payload);
}

function normalizeOutboxRecord(record) {
  return {
    id: record.id,
    tipo: record.tipo,
    created_at: record.created_at,
    payload: JSON.parse(record.payload_json),
  };
}

function runCase(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    return true;
  } catch (err) {
    console.error(`❌ ${name}: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

function assertValid(record) {
  const normalized = normalizeOutboxRecord(record);
  const r = validateNormalizedEvent(normalized);
  if (!r.ok) throw new Error(r.error);
}

function assertInvalid(record) {
  const normalized = normalizeOutboxRecord(record);
  const r = validateNormalizedEvent(normalized);
  if (r.ok) throw new Error("evento inválido passou na validação");
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.resolve(__dirname, "..", "contracts", "sync-outbox-event-v1.schema.json");
if (!fs.existsSync(schemaPath)) {
  console.error(`[contract-smoke] schema não encontrado: ${schemaPath}`);
  process.exit(1);
}

const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
if (schema.$id !== "https://fastproduct.local/schemas/sync-outbox-event-v1.schema.json") {
  console.error("[contract-smoke] $id inesperado no schema.");
  process.exit(1);
}

const base = {
  id: "11111111-1111-4111-8111-111111111111",
  created_at: "2026-04-18T10:00:00Z",
};

const validCases = [
  {
    ...base,
    tipo: "VENDA_REGISTRADA",
    payload_json: JSON.stringify({
      venda_id: "22222222-2222-4222-8222-222222222222",
      caixa_id: "33333333-3333-4333-8333-333333333333",
      operador_id: "44444444-4444-4444-8444-444444444444",
      troco_inicial_caixa: 50,
      forma_pagamento: "DINHEIRO",
      total_bruto: 100,
      total_desconto: 10,
      total_liquido: 90,
      desconto_gerente_percentual: 10,
      desconto_gerente_valor: 10,
      gerente_id: "55555555-5555-4555-8555-555555555555",
      desconto_gerente_token: "tok_abc",
      itens: [
        {
          item_id: "66666666-6666-4666-8666-666666666666",
          produto_id: "77777777-7777-4777-8777-777777777777",
          nome: "Produto X",
          quantidade: 2,
          preco_original: 50,
          preco_unitario: 45,
        },
      ],
    }),
  },
  {
    ...base,
    tipo: "CAIXA_ABERTO",
    payload_json: JSON.stringify({
      id: "88888888-8888-4888-8888-888888888888",
      operador_id: "99999999-9999-4999-8999-999999999999",
      data_abertura: "2026-04-18T09:00:00Z",
      valor_inicial: 100,
      status: "ABERTO",
    }),
  },
  {
    ...base,
    tipo: "CAIXA_FECHADO",
    payload_json: JSON.stringify({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      data_fechamento: "2026-04-18T20:00:00Z",
      valor_fechamento: 230.5,
    }),
  },
  {
    ...base,
    tipo: "CAIXA_FECHADO",
    payload_json: JSON.stringify({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      data_fechamento: "2026-04-18T21:00:00Z",
      valor_fechamento: 100,
      fechamento_observacao: "Contagem conferida com gerente",
    }),
  },
  {
    ...base,
    tipo: "MOVIMENTO_CAIXA",
    payload_json: JSON.stringify({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      caixa_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      tipo: "SANGRIA",
      valor: 30,
      observacao: "retirada",
      created_at: "2026-04-18T12:00:00Z",
    }),
  },
];

const invalidCases = [
  {
    ...base,
    tipo: "TIPO_INVALIDO",
    payload_json: JSON.stringify({}),
  },
  {
    ...base,
    tipo: "VENDA_REGISTRADA",
    payload_json: JSON.stringify({
      venda_id: "nao-uuid",
      forma_pagamento: "DINHEIRO",
      total_bruto: 100,
      total_desconto: 10,
      total_liquido: 90,
      itens: [],
    }),
  },
  {
    ...base,
    tipo: "MOVIMENTO_CAIXA",
    payload_json: JSON.stringify({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      caixa_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      tipo: "OUTRO",
      valor: 10,
    }),
  },
  {
    ...base,
    tipo: "CAIXA_FECHADO",
    payload_json: JSON.stringify({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      data_fechamento: "2026-04-18T22:00:00Z",
      valor_fechamento: 1,
      fechamento_observacao: "x".repeat(501),
    }),
  },
];

let allOk = true;
allOk = runCase("schema versionado e legível", () => {
  if (schema.type !== "object") throw new Error("schema.type deve ser object");
}) && allOk;

for (const [idx, c] of validCases.entries()) {
  allOk = runCase(`caso válido #${idx + 1}`, () => assertValid(c)) && allOk;
}
for (const [idx, c] of invalidCases.entries()) {
  allOk = runCase(`caso inválido #${idx + 1}`, () => assertInvalid(c)) && allOk;
}

if (!allOk) {
  process.exit(1);
}

// BA-010: fechamento Local deve chamar a RPC atômica (não UPDATE direto em caixas).
const syncOutboxPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "supabase",
  "functions",
  "sync-outbox",
  "index.ts",
);
const syncSrc = fs.readFileSync(syncOutboxPath, "utf8");
allOk =
  runCase("CAIXA_FECHADO usa fechar_caixa_pdv_atomico", () => {
    if (!syncSrc.includes('rpc("fechar_caixa_pdv_atomico"') &&
        !syncSrc.includes("rpc('fechar_caixa_pdv_atomico'")) {
      throw new Error("processCaixaFechado deve chamar fechar_caixa_pdv_atomico");
    }
    const fechadoFn = syncSrc.slice(
      syncSrc.indexOf("async function processCaixaFechado"),
      syncSrc.indexOf("async function processMovimentoCaixa"),
    );
    if (fechadoFn.includes('.from("caixas")') && fechadoFn.includes(".update(")) {
      throw new Error("processCaixaFechado não deve fazer UPDATE direto em caixas");
    }
  }) && allOk;

if (!allOk) {
  process.exit(1);
}

console.log("✅ Contract smoke OK (sync-outbox v1)");
