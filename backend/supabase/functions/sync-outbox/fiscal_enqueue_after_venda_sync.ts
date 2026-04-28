import type { SupabaseClient } from "@supabase/supabase-js";

/** Payload mínimo já validado por `parseVendaPayload` / `processVenda`. */
export type VendaPayloadFiscalSync = {
  venda_id: string;
  caixa_id?: string | null;
  operador_id?: string | null;
  forma_pagamento: string;
  total_bruto: number;
  total_desconto: number;
  total_liquido: number;
  itens: Array<{
    produto_id: string;
    quantidade: number;
    preco_original: number;
    preco_unitario: number;
  }>;
};

function isUuid(s: string | null | undefined): s is string {
  if (!s || typeof s !== "string") return false;
  const t = s.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t);
}

function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100;
}

function resolveFiscalDocType(raw: string | undefined): "NFC_E_STUB" | "NFCE" | "NFE" {
  const t = (raw ?? "").trim().toUpperCase();
  if (t === "NFCE" || t === "NFE") return t;
  return "NFC_E_STUB";
}

function tipoPrecoItem(i: { preco_original: number; preco_unitario: number }): "ATACADO" | "VAREJO" {
  return i.preco_unitario < i.preco_original ? "ATACADO" : "VAREJO";
}

/**
 * Opcional: alinha vendas do PDV local (pós-sync) ao mesmo RPC do caixa web.
 * Desligado por predefinição — exige `AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE=true` na Edge.
 * Erros não propagam (não falham o batch de outbox).
 */
export async function maybeEnqueueFiscalDocumentAfterSyncedVenda(
  supabase: SupabaseClient,
  payload: VendaPayloadFiscalSync,
  log: (p: Record<string, unknown>) => void,
): Promise<void> {
  const rawFlag = (Deno.env.get("AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE") ?? "").trim().toLowerCase();
  if (rawFlag !== "true" && rawFlag !== "1") return;

  const tipoDoc = resolveFiscalDocType(Deno.env.get("FISCAL_DEFAULT_DOC_TYPE"));

  let loja_id: string | null = null;
  const caixaId = payload.caixa_id?.trim() ?? "";
  if (isUuid(caixaId)) {
    const { data, error } = await supabase.from("caixas").select("loja_id").eq("id", caixaId).maybeSingle();
    if (error) {
      log({
        level: "warn",
        stage: "fiscal_enqueue_sync",
        venda_id: payload.venda_id,
        detail: `loja_lookup:${error.message}`,
      });
    } else if (data && data.loja_id != null) {
      loja_id = String(data.loja_id);
    }
  }

  const fiscalPayload = {
    origem: "pdv_local_sync",
    venda_id: payload.venda_id,
    loja_id,
    caixa_id: payload.caixa_id ?? null,
    operador_id: payload.operador_id ?? null,
    forma_pagamento: payload.forma_pagamento,
    pagamentos: [{
      forma_pagamento: payload.forma_pagamento,
      valor: roundMoney2(payload.total_liquido),
    }],
    totais: {
      bruto: roundMoney2(payload.total_bruto),
      desconto: roundMoney2(payload.total_desconto),
      liquido: roundMoney2(payload.total_liquido),
    },
    itens: (payload.itens ?? []).map((i) => ({
      produto_id: i.produto_id,
      quantidade: i.quantidade,
      preco_original: roundMoney2(i.preco_original),
      preco_unitario: roundMoney2(i.preco_unitario),
      desconto_unitario: roundMoney2(Math.max(0, i.preco_original - i.preco_unitario)),
      tipo_preco: tipoPrecoItem(i),
    })),
  };

  const { error: rpcErr } = await supabase.rpc("fiscal_enfileirar_documento_venda", {
    p_venda_id: payload.venda_id,
    p_tipo_doc: tipoDoc,
    p_payload: fiscalPayload,
  });

  if (rpcErr) {
    log({
      level: "warn",
      stage: "fiscal_enqueue_sync",
      venda_id: payload.venda_id,
      tipo_doc: tipoDoc,
      error: rpcErr.message,
    });
  }
}
