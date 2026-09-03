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
    /** Nome capturado no cliente offline (opcional) — usado só se a busca a `produtos` não achar a linha. */
    nome?: string;
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

/** Colunas fiscais de `produtos` — mesmo conjunto usado pelo snapshot do caixa web
 * (20260902130000_fiscal_payload_snapshot_venda.sql). B-P0.1 (Onda C1). */
type ProdutoFiscalRow = {
  id: string;
  nome: string | null;
  codigo_barras: string | null;
  ncm: string | null;
  cfop_produto: string | null;
  csosn: string | null;
  cest: string | null;
  cst_pis: string | null;
  cst_cofins: string | null;
  unidade_medida: string | null;
  /** Onda C2.6 (prontidão Focus NFe) — mesmo conjunto do caminho web (20260902140300). */
  icms_origem: string | null;
};

type LojaFiscalRow = {
  id: string;
  cnpj: string | null;
  inscricao_estadual: string | null;
  razao_social: string | null;
  nome_fantasia: string | null;
  endereco_logradouro: string | null;
  endereco_numero: string | null;
  endereco_complemento: string | null;
  endereco_bairro: string | null;
  endereco_cidade: string | null;
  endereco_uf: string | null;
  endereco_cep: string | null;
  cnae: string | null;
  numero_serie_nfce: number | null;
  numero_serie_nfe: number | null;
};

/**
 * Opcional: alinha vendas do PDV local (pós-sync) ao mesmo RPC do caixa web.
 * Desligado por predefinição — exige `AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE=true` na Edge.
 * Erros não propagam (não falham o batch de outbox).
 *
 * B-P0.1 (Onda C1, prontidão Focus NFe): o payload passa a incluir a
 * classificação fiscal do produto (ncm/cfop/csosn/cest/cst_pis/cst_cofins) e
 * o emitente (loja), buscados AQUI — uma única vez, no momento do enqueue —
 * e congelados no `payload` de `documentos_fiscais_pendentes`. Depois deste
 * ponto nenhuma alteração posterior em `produtos`/`lojas`/`pdv_config`
 * modifica o documento; o fiscal-worker só lê o payload já persistido.
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

  const produtoIds = Array.from(
    new Set((payload.itens ?? []).map((i) => i.produto_id).filter((id): id is string => isUuid(id))),
  );

  const produtosFiscal = new Map<string, ProdutoFiscalRow>();
  if (produtoIds.length > 0) {
    const { data, error } = await supabase
      .from("produtos")
      .select("id, nome, codigo_barras, ncm, cfop_produto, csosn, cest, cst_pis, cst_cofins, unidade_medida, icms_origem")
      .in("id", produtoIds);
    if (error) {
      log({
        level: "warn",
        stage: "fiscal_enqueue_sync",
        venda_id: payload.venda_id,
        detail: `produtos_fiscal_lookup:${error.message}`,
      });
    } else {
      for (const row of (data ?? []) as ProdutoFiscalRow[]) produtosFiscal.set(row.id, row);
    }
  }

  // B-P0.1 (gate de completude): data_venda persistida pela RPC de sync
  // (`registrar_venda_com_itens`) — buscada aqui, não recomputada com
  // `new Date()`, para refletir o instante real da venda.
  let dataVenda: string | null = null;
  {
    const { data, error } = await supabase.from("vendas").select("data").eq("id", payload.venda_id).maybeSingle();
    if (error) {
      log({ level: "warn", stage: "fiscal_enqueue_sync", venda_id: payload.venda_id, detail: `data_venda_lookup:${error.message}` });
    } else if (data?.data) {
      dataVenda = String(data.data);
    }
  }

  // Sprint C2.10 (P0-5): lê `vendas_pagamentos` diretamente — a MESMA fonte
  // (SSOT) que o caminho web já usa em `finalizar_venda_transacional_
  // canonica_v4_unscoped` — em vez de reconstruir um array de 1 elemento a
  // partir do campo escalar `payload.forma_pagamento`. `registrar_venda_
  // com_itens` (Sprint C2.10) grava 1 linha por forma quando o chamador
  // envia `p_pagamentos`, ou 1 única linha (comportamento de sempre) quando
  // não envia — esta leitura reflete corretamente os dois casos sem
  // precisar saber qual caminho a RPC tomou. Nunca deriva split a partir do
  // total; lê o que foi de fato persistido.
  //
  // Sprint C2.11 (P0-2, achado Codex): o fallback anterior ("leitura vazia
  // ou com erro -> reconstrói 1 pagamento escalar a partir do payload de
  // sync") era uma DEGRADAÇÃO SILENCIOSA — podia transformar uma venda
  // mista real em pagamento único no documento fiscal, sem qualquer sinal
  // de que isso aconteceu. `vendas_pagamentos` é a SSOT fiscal (mesma fonte
  // que o caminho web usa sem fallback nenhum); `registrar_venda_com_itens`
  // SEMPRE grava pelo menos 1 linha quando o total é positivo (branch
  // escalar OU branch de split, nunca os dois ausentes) — então uma leitura
  // vazia ou com erro aqui não é "venda sem pagamento", é sinal de que
  // ALGO deu errado (corrida, permissão, rede) e não há como montar um
  // snapshot fiscal confiável. Fail-closed: não enfileira documento fiscal
  // nenhum nesta rodada (a venda em si não é afetada — só o auto-enqueue
  // fiscal, que já é opcional/best-effort por design desta função) em vez
  // de arriscar um pagamento fiscal incorreto.
  const { data: pagamentosData, error: pagamentosErr } = await supabase
    .from("vendas_pagamentos")
    .select("forma_pagamento, valor")
    .eq("venda_id", payload.venda_id);
  if (pagamentosErr) {
    log({
      level: "error",
      stage: "fiscal_enqueue_sync",
      venda_id: payload.venda_id,
      detail: `vendas_pagamentos_lookup_falhou_fail_closed:${pagamentosErr.message}`,
    });
    return;
  }
  if (!pagamentosData || pagamentosData.length === 0) {
    log({
      level: "error",
      stage: "fiscal_enqueue_sync",
      venda_id: payload.venda_id,
      detail: "vendas_pagamentos_vazio_inesperado_fail_closed",
    });
    return;
  }
  const pagamentos: Array<{ forma_pagamento: string; valor: number }> = (pagamentosData as Array<{ forma_pagamento: string; valor: number }>)
    .map((p) => ({ forma_pagamento: p.forma_pagamento, valor: roundMoney2(p.valor) }));

  let cfopPadrao: string | null = null;
  let regimeTributario: string | null = null;
  let loja: LojaFiscalRow | null = null;
  if (loja_id) {
    const [{ data: pdvConfigRow, error: pdvConfigErr }, { data: lojaRow, error: lojaErr }] = await Promise.all([
      supabase.from("pdv_config").select("cfop_padrao, regime_tributario").eq("loja_id", loja_id).maybeSingle(),
      supabase
        .from("lojas")
        .select(
          "id, cnpj, inscricao_estadual, razao_social, nome_fantasia, endereco_logradouro, endereco_numero, endereco_complemento, endereco_bairro, endereco_cidade, endereco_uf, endereco_cep, cnae, numero_serie_nfce, numero_serie_nfe",
        )
        .eq("id", loja_id)
        .maybeSingle(),
    ]);
    if (pdvConfigErr) {
      log({ level: "warn", stage: "fiscal_enqueue_sync", venda_id: payload.venda_id, detail: `pdv_config_lookup:${pdvConfigErr.message}` });
    } else if (pdvConfigRow) {
      cfopPadrao = pdvConfigRow.cfop_padrao ?? null;
      regimeTributario = pdvConfigRow.regime_tributario ?? null;
    }
    if (lojaErr) {
      log({ level: "warn", stage: "fiscal_enqueue_sync", venda_id: payload.venda_id, detail: `loja_fiscal_lookup:${lojaErr.message}` });
    } else if (lojaRow) {
      loja = lojaRow as LojaFiscalRow;
    }
  }

  const fiscalPayload = {
    origem: "pdv_local_sync",
    venda_id: payload.venda_id,
    loja_id,
    caixa_id: payload.caixa_id ?? null,
    operador_id: payload.operador_id ?? null,
    data_venda: dataVenda,
    // cliente_id/destinatario: N/A neste caminho — `VendaPayload` do sync-outbox
    // (backend/supabase/functions/sync-outbox/index.ts, tipo `VendaPayload`) não
    // carrega cliente/crédito hoje; não inventado, reportado como gap upstream.
    cliente_id: null,
    destinatario: null,
    // Sprint C2.10 (P0-5): lido de vendas_pagamentos (SSOT) acima — preserva
    // split real quando existir, mesmo formato do caminho web.
    pagamentos,
    totais: {
      bruto: roundMoney2(payload.total_bruto),
      desconto: roundMoney2(payload.total_desconto),
      liquido: roundMoney2(payload.total_liquido),
    },
    itens: (payload.itens ?? []).map((i) => {
      const p = produtosFiscal.get(i.produto_id);
      return {
        produto_id: i.produto_id,
        nome: p?.nome ?? i.nome ?? null,
        codigo_barras: p?.codigo_barras ?? null,
        quantidade: i.quantidade,
        // Sprint C2.11 (P0-2, achado Codex): a chave do snapshot fiscal
        // precisa ser `preco_unitario_original` — é o nome que o caminho
        // web grava (20260902130000_fiscal_payload_snapshot_venda.sql,
        // coluna `itens_venda.preco_unitario_original`) e que `fiscal_focus_
        // dto.ts` (`mapSnapshotItemToFocus`) efetivamente lê para montar
        // `valor_unitario_comercial`. A variável de entrada `i.preco_original`
        // continua com esse nome porque é assim que o pdv-local (Tauri)
        // já envia no payload de sync (`VendaPayloadFiscalSync.itens[].
        // preco_original`) — só a CHAVE DE SAÍDA do snapshot muda, sem
        // mapper/compensação, para que web e sync produzam o mesmo
        // contrato semântico fiscal.
        preco_unitario_original: roundMoney2(i.preco_original),
        preco_unitario: roundMoney2(i.preco_unitario),
        desconto_unitario: roundMoney2(Math.max(0, i.preco_original - i.preco_unitario)),
        tipo_preco: tipoPrecoItem(i),
        unidade_medida: p?.unidade_medida ?? null,
        ncm: p?.ncm ?? null,
        cfop: p?.cfop_produto ?? cfopPadrao,
        csosn: p?.csosn ?? null,
        cest: p?.cest ?? null,
        cst_pis: p?.cst_pis ?? null,
        cst_cofins: p?.cst_cofins ?? null,
        // Onda C2.6: código de origem ICMS, capturado do produto no momento
        // da venda — sem inferência/derivação, NULL quando ainda não
        // classificado (mesmo caminho web, migration 20260902140300).
        icms_origem: p?.icms_origem ?? null,
      };
    }),
    emitente: loja
      ? {
        loja_id: loja.id,
        cnpj: loja.cnpj,
        inscricao_estadual: loja.inscricao_estadual,
        razao_social: loja.razao_social,
        nome_fantasia: loja.nome_fantasia,
        endereco_logradouro: loja.endereco_logradouro,
        endereco_numero: loja.endereco_numero,
        endereco_complemento: loja.endereco_complemento,
        endereco_bairro: loja.endereco_bairro,
        endereco_cidade: loja.endereco_cidade,
        endereco_uf: loja.endereco_uf,
        endereco_cep: loja.endereco_cep,
        cnae: loja.cnae,
        numero_serie_nfce: loja.numero_serie_nfce,
        numero_serie_nfe: loja.numero_serie_nfe,
        regime_tributario: regimeTributario,
      }
      : null,
  };

  const { error: rpcErr } = await supabase.rpc("fiscal_enfileirar_documento_venda", {
    p_venda_id: payload.venda_id,
    p_tipo_doc: tipoDoc,
    p_payload: fiscalPayload,
    p_loja_id: loja_id,  // valida que a venda pertence à loja deste worker (migration 114)
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
