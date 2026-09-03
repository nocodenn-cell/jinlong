// B-P0.1 (Onda C1, prontidão Focus NFe) — teste do enriquecimento fiscal do
// caminho de sync (pdv-local → sync-outbox). Prova, sem rede e sem Focus
// real, que:
//   1. a flag de ativação continua desligada por padrão (comportamento
//      preexistente preservado);
//   2. quando ativa, o payload enviado a `fiscal_enfileirar_documento_venda`
//      inclui a classificação fiscal do produto (ncm/cfop/csosn/cest/
//      cst_pis/cst_cofins/unidade_medida) e o emitente (loja), buscados uma
//      única vez no momento do enqueue;
//   3. produto sem `cfop_produto` cai para o `cfop_padrao` de `pdv_config`
//      (mesmo fallback documentado na migration 210).
//
// Fake mínimo do SupabaseClient — cobre só os métodos realmente chamados por
// `maybeEnqueueFiscalDocumentAfterSyncedVenda`. Não depende de rede nem de
// um Postgres real; roda com `deno test`.

import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { maybeEnqueueFiscalDocumentAfterSyncedVenda, type VendaPayloadFiscalSync } from "./fiscal_enqueue_after_venda_sync.ts";

type Row = Record<string, unknown>;

/** Fake mínimo: cada tabela responde de acordo com o mapa `tables` passado. */
function fakeSupabase(tables: {
  caixas?: Row | null;
  produtos?: Row[];
  pdv_config?: Row | null;
  lojas?: Row | null;
  vendas?: Row | null;
  vendas_pagamentos?: Row[];
  /** Sprint C2.11 (P0-2) — simula erro na leitura de vendas_pagamentos. */
  vendas_pagamentos_error?: string;
  /** Hotfix (achado Codex) — simula erro na leitura de produtos. */
  produtos_error?: string;
}) {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];

  const client = {
    from(table: string) {
      return {
        select(_cols: string) {
          const builder = {
            eq(_col: string, _val: unknown) {
              return builder;
            },
            in(_col: string, _vals: unknown[]) {
              return builder;
            },
            async maybeSingle() {
              if (table === "caixas") return { data: tables.caixas ?? null, error: null };
              if (table === "pdv_config") return { data: tables.pdv_config ?? null, error: null };
              if (table === "lojas") return { data: tables.lojas ?? null, error: null };
              if (table === "vendas") return { data: tables.vendas ?? null, error: null };
              return { data: null, error: null };
            },
            then(resolve: (v: { data: unknown; error: { message: string } | null }) => void) {
              // usado por `produtos` (sem maybeSingle — retorna lista via `.in`) e
              // por `vendas_pagamentos` (Sprint C2.10 — lista via `.eq`).
              if (table === "produtos") {
                if (tables.produtos_error) {
                  return resolve({ data: null, error: { message: tables.produtos_error } });
                }
                return resolve({ data: tables.produtos ?? [], error: null });
              }
              if (table === "vendas_pagamentos") {
                if (tables.vendas_pagamentos_error) {
                  return resolve({ data: null, error: { message: tables.vendas_pagamentos_error } });
                }
                return resolve({ data: tables.vendas_pagamentos ?? [], error: null });
              }
              return resolve({ data: null, error: null });
            },
          };
          return builder;
        },
      };
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      return { data: "doc-id-fake", error: null };
    },
    // deno-lint-ignore no-explicit-any
  } as any;

  return { client, rpcCalls };
}

function noopLog(_p: Record<string, unknown>) {}

Deno.test("desligado por padrão — não chama RPC de enqueue", async () => {
  const prev = Deno.env.get("AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE");
  Deno.env.delete("AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE");
  try {
    const { client, rpcCalls } = fakeSupabase({});
    const payload: VendaPayloadFiscalSync = {
      venda_id: "11111111-1111-4111-8111-111111111111",
      forma_pagamento: "DINHEIRO",
      total_bruto: 100,
      total_desconto: 0,
      total_liquido: 100,
      itens: [{ produto_id: "22222222-2222-4222-8222-222222222222", quantidade: 1, preco_original: 100, preco_unitario: 100 }],
    };
    await maybeEnqueueFiscalDocumentAfterSyncedVenda(client, payload, noopLog);
    assertEquals(rpcCalls.length, 0);
  } finally {
    if (prev !== undefined) Deno.env.set("AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE", prev);
  }
});

Deno.test("ativo — payload inclui classificação fiscal do produto e emitente", async () => {
  const prevFlag = Deno.env.get("AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE");
  Deno.env.set("AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE", "true");
  try {
    const produtoId = "22222222-2222-4222-8222-222222222222";
    const lojaId = "33333333-3333-4333-8333-333333333333";
    const caixaId = "44444444-4444-4444-8444-444444444444";

    const { client, rpcCalls } = fakeSupabase({
      caixas: { loja_id: lojaId },
      produtos: [{
        id: produtoId,
        nome: "Produto Teste",
        codigo_barras: "7898512340004",
        ncm: "85171231",
        cfop_produto: null, // sem CFOP próprio — deve cair no cfop_padrao
        csosn: "102",
        cest: "1234567",
        cst_pis: "01",
        cst_cofins: "01",
        unidade_medida: "UN",
        icms_origem: "1",
      }],
      pdv_config: { cfop_padrao: "5405", regime_tributario: "SIMPLES_NACIONAL" },
      vendas: { data: "2026-09-02T12:00:00Z" },
      // Sprint C2.11 (P0-2): vendas_pagamentos é a SSOT — sem fallback
      // escalar, este teste precisa fornecer a linha real (pagamento único
      // legítimo) para que o enqueue prossiga.
      vendas_pagamentos: [{ forma_pagamento: "DINHEIRO", valor: 100 }],
      lojas: {
        id: lojaId,
        cnpj: "12345678000199",
        inscricao_estadual: "123456789",
        razao_social: "Loja Teste LTDA",
        nome_fantasia: "Loja Teste",
        endereco_logradouro: "Rua Teste",
        endereco_numero: "100",
        endereco_complemento: null,
        endereco_bairro: "Centro",
        endereco_cidade: "São Paulo",
        endereco_uf: "SP",
        endereco_cep: "01000000",
        cnae: "4781400",
        numero_serie_nfce: 1,
        numero_serie_nfe: 1,
      },
    });

    const payload: VendaPayloadFiscalSync = {
      venda_id: "11111111-1111-4111-8111-111111111111",
      caixa_id: caixaId,
      operador_id: "55555555-5555-4555-8555-555555555555",
      forma_pagamento: "DINHEIRO",
      total_bruto: 100,
      total_desconto: 0,
      total_liquido: 100,
      itens: [{ produto_id: produtoId, quantidade: 1, preco_original: 100, preco_unitario: 100 }],
    };

    await maybeEnqueueFiscalDocumentAfterSyncedVenda(client, payload, noopLog);

    assertEquals(rpcCalls.length, 1);
    assertEquals(rpcCalls[0].fn, "fiscal_enfileirar_documento_venda");
    const sent = rpcCalls[0].args.p_payload as Record<string, unknown>;
    assertExists(sent);

    const itens = sent.itens as Array<Record<string, unknown>>;
    assertEquals(itens.length, 1);
    assertEquals(itens[0].nome, "Produto Teste");
    assertEquals(itens[0].codigo_barras, "7898512340004");
    assertEquals(itens[0].ncm, "85171231");
    assertEquals(itens[0].cfop, "5405"); // fallback para cfop_padrao — produto não tinha cfop_produto
    assertEquals(itens[0].csosn, "102");
    assertEquals(itens[0].cest, "1234567");
    assertEquals(itens[0].cst_pis, "01");
    assertEquals(itens[0].cst_cofins, "01");
    assertEquals(itens[0].unidade_medida, "UN");
    // Onda C2.6: icms_origem capturado do produto, sem inferência.
    assertEquals(itens[0].icms_origem, "1");
    // Sprint C2.11 (P0-2): a chave do snapshot precisa ser
    // `preco_unitario_original` — é o nome que `fiscal_focus_dto.ts`
    // (`mapSnapshotItemToFocus`) lê para montar `valor_unitario_comercial`;
    // o caminho web já grava com esse nome (itens_venda.preco_unitario_
    // original). Não pode existir a chave antiga `preco_original` solta.
    assertEquals(itens[0].preco_unitario_original, 100);
    assertEquals(itens[0].preco_original, undefined);

    // Consistência de forma com o caminho web: pagamentos é sempre array,
    // nunca um campo escalar "forma_pagamento" solto no payload.
    assertEquals(sent.forma_pagamento, undefined);
    const pagamentos = sent.pagamentos as Array<Record<string, unknown>>;
    assertEquals(pagamentos.length, 1);
    assertEquals(pagamentos[0].forma_pagamento, "DINHEIRO");
    assertEquals(pagamentos[0].valor, 100);

    assertEquals(sent.data_venda, "2026-09-02T12:00:00Z");
    // Genuinamente indisponível no payload de sync hoje — reportado, não inventado.
    assertEquals(sent.cliente_id, null);
    assertEquals(sent.destinatario, null);

    const emitente = sent.emitente as Record<string, unknown>;
    assertExists(emitente);
    assertEquals(emitente.loja_id, lojaId);
    assertEquals(emitente.cnpj, "12345678000199");
    assertEquals(emitente.regime_tributario, "SIMPLES_NACIONAL");
  } finally {
    if (prevFlag !== undefined) Deno.env.set("AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE", prevFlag);
    else Deno.env.delete("AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE");
  }
});

// ---------------------------------------------------------------------------
// Sprint C2.10 (P0-5) — pagamento misto preservado no caminho sync: lê
// vendas_pagamentos (SSOT) em vez de reconstruir 1 elemento a partir do
// campo escalar forma_pagamento/total_liquido.
// ---------------------------------------------------------------------------

Deno.test("P0-5 — pagamento misto (dinheiro + PIX) no sync: pagamentos[] reflete as 2 linhas de vendas_pagamentos, não o escalar", async () => {
  const prevFlag = Deno.env.get("AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE");
  Deno.env.set("AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE", "true");
  try {
    const produtoId = "22222222-2222-4222-8222-222222222222";
    const { client, rpcCalls } = fakeSupabase({
      produtos: [{ id: produtoId, nome: "Produto", codigo_barras: null, ncm: null, cfop_produto: null, csosn: null, cest: null, cst_pis: null, cst_cofins: null, unidade_medida: "UN", icms_origem: null }],
      vendas: { data: "2026-09-03T10:00:00Z" },
      vendas_pagamentos: [
        { forma_pagamento: "DINHEIRO", valor: 60 },
        { forma_pagamento: "PIX", valor: 40 },
      ],
    });

    const payload: VendaPayloadFiscalSync = {
      venda_id: "11111111-1111-4111-8111-111111111111",
      // Campo escalar do payload de sync ainda existe (RN legada), mas NÃO
      // deve ser usado quando vendas_pagamentos já tem as linhas reais —
      // valor propositalmente DIFERENTE da soma real (100) pra provar que
      // não é ele quem popula o resultado.
      forma_pagamento: "DINHEIRO",
      total_bruto: 100,
      total_desconto: 0,
      total_liquido: 100,
      itens: [{ produto_id: produtoId, quantidade: 1, preco_original: 100, preco_unitario: 100 }],
    };

    await maybeEnqueueFiscalDocumentAfterSyncedVenda(client, payload, noopLog);

    const sent = rpcCalls[0].args.p_payload as Record<string, unknown>;
    const pagamentos = sent.pagamentos as Array<Record<string, unknown>>;
    assertEquals(pagamentos.length, 2); // não reduzido a 1 forma
    assertEquals(pagamentos.find((p) => p.forma_pagamento === "DINHEIRO")?.valor, 60);
    assertEquals(pagamentos.find((p) => p.forma_pagamento === "PIX")?.valor, 40);
    const soma = pagamentos.reduce((acc, p) => acc + (p.valor as number), 0);
    assertEquals(soma, 100); // soma dos pagamentos == total
  } finally {
    if (prevFlag !== undefined) Deno.env.set("AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE", prevFlag);
    else Deno.env.delete("AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE");
  }
});

// ---------------------------------------------------------------------------
// Sprint C2.11 (P0-2, achado Codex) — o fallback escalar anterior era uma
// degradação silenciosa: podia transformar uma venda mista real em
// pagamento único no documento fiscal sem qualquer sinal do que aconteceu.
// `vendas_pagamentos` é SSOT fiscal; leitura vazia ou com erro agora é
// FAIL-CLOSED (zero enqueue), nunca reconstrução a partir do escalar.
// ---------------------------------------------------------------------------

Deno.test("P0-2 — vendas_pagamentos vazio inesperado -> FAIL-CLOSED, zero RPC (não reconstrói pagamento escalar)", async () => {
  const prevFlag = Deno.env.get("AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE");
  Deno.env.set("AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE", "true");
  try {
    const produtoId = "22222222-2222-4222-8222-222222222222";
    const { client, rpcCalls } = fakeSupabase({
      produtos: [{ id: produtoId, nome: "Produto", codigo_barras: null, ncm: null, cfop_produto: null, csosn: null, cest: null, cst_pis: null, cst_cofins: null, unidade_medida: "UN", icms_origem: null }],
      vendas_pagamentos: [], // vazio de propósito — leitura "funcionou" mas não achou nada
    });

    const payload: VendaPayloadFiscalSync = {
      venda_id: "11111111-1111-4111-8111-111111111111",
      forma_pagamento: "CARTAO_CREDITO",
      total_bruto: 50,
      total_desconto: 0,
      total_liquido: 50,
      itens: [{ produto_id: produtoId, quantidade: 1, preco_original: 50, preco_unitario: 50 }],
    };

    await maybeEnqueueFiscalDocumentAfterSyncedVenda(client, payload, noopLog);

    // Fail-closed: nenhum documento fiscal enfileirado com um pagamento
    // reconstruído a partir do escalar payload.forma_pagamento.
    assertEquals(rpcCalls.length, 0);
  } finally {
    if (prevFlag !== undefined) Deno.env.set("AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE", prevFlag);
    else Deno.env.delete("AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE");
  }
});

Deno.test("P0-2 — erro ao ler vendas_pagamentos -> FAIL-CLOSED, zero RPC (não reconstrói pagamento escalar)", async () => {
  const prevFlag = Deno.env.get("AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE");
  Deno.env.set("AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE", "true");
  try {
    const produtoId = "22222222-2222-4222-8222-222222222222";
    const { client, rpcCalls } = fakeSupabase({
      produtos: [{ id: produtoId, nome: "Produto", codigo_barras: null, ncm: null, cfop_produto: null, csosn: null, cest: null, cst_pis: null, cst_cofins: null, unidade_medida: "UN", icms_origem: null }],
      vendas_pagamentos_error: "connection reset (simulado)",
    });

    const payload: VendaPayloadFiscalSync = {
      venda_id: "11111111-1111-4111-8111-111111111111",
      forma_pagamento: "CARTAO_CREDITO",
      total_bruto: 50,
      total_desconto: 0,
      total_liquido: 50,
      itens: [{ produto_id: produtoId, quantidade: 1, preco_original: 50, preco_unitario: 50 }],
    };

    await maybeEnqueueFiscalDocumentAfterSyncedVenda(client, payload, noopLog);

    assertEquals(rpcCalls.length, 0);
  } finally {
    if (prevFlag !== undefined) Deno.env.set("AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE", prevFlag);
    else Deno.env.delete("AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE");
  }
});

Deno.test("P0-2 — pagamento único legítimo (linha real em vendas_pagamentos) continua enfileirando normalmente", async () => {
  const prevFlag = Deno.env.get("AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE");
  Deno.env.set("AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE", "true");
  try {
    const produtoId = "22222222-2222-4222-8222-222222222222";
    const { client, rpcCalls } = fakeSupabase({
      produtos: [{ id: produtoId, nome: "Produto", codigo_barras: null, ncm: null, cfop_produto: null, csosn: null, cest: null, cst_pis: null, cst_cofins: null, unidade_medida: "UN", icms_origem: null }],
      vendas_pagamentos: [{ forma_pagamento: "CARTAO_CREDITO", valor: 50 }],
    });

    const payload: VendaPayloadFiscalSync = {
      venda_id: "11111111-1111-4111-8111-111111111111",
      forma_pagamento: "CARTAO_CREDITO",
      total_bruto: 50,
      total_desconto: 0,
      total_liquido: 50,
      itens: [{ produto_id: produtoId, quantidade: 1, preco_original: 50, preco_unitario: 50 }],
    };

    await maybeEnqueueFiscalDocumentAfterSyncedVenda(client, payload, noopLog);

    assertEquals(rpcCalls.length, 1);
    const sent = rpcCalls[0].args.p_payload as Record<string, unknown>;
    const pagamentos = sent.pagamentos as Array<Record<string, unknown>>;
    assertEquals(pagamentos.length, 1);
    assertEquals(pagamentos[0].forma_pagamento, "CARTAO_CREDITO");
    assertEquals(pagamentos[0].valor, 50);
  } finally {
    if (prevFlag !== undefined) Deno.env.set("AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE", prevFlag);
    else Deno.env.delete("AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE");
  }
});

// ---------------------------------------------------------------------------
// Hotfix (achado Codex) — erro/leitura incompleta de `produtos` também
// precisa ser fail-closed, mesma disciplina já aplicada a
// `vendas_pagamentos` (P0-2, C2.11). Antes, um erro aqui só virava warning
// e o snapshot congelava com NCM/CFOP/CSOSN/CEST/CST/icms_origem NULL para
// todo item — permanentemente, já que o snapshot é imutável.
// ---------------------------------------------------------------------------

Deno.test("HOTFIX (achado Codex) — erro ao ler produtos -> FAIL-CLOSED, zero RPC (nunca congela snapshot com classificação fiscal NULL)", async () => {
  const prevFlag = Deno.env.get("AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE");
  Deno.env.set("AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE", "true");
  try {
    const produtoId = "22222222-2222-4222-8222-222222222222";
    const { client, rpcCalls } = fakeSupabase({
      produtos_error: "connection reset (simulado)",
      vendas_pagamentos: [{ forma_pagamento: "DINHEIRO", valor: 50 }],
    });

    const payload: VendaPayloadFiscalSync = {
      venda_id: "11111111-1111-4111-8111-111111111111",
      forma_pagamento: "DINHEIRO",
      total_bruto: 50,
      total_desconto: 0,
      total_liquido: 50,
      itens: [{ produto_id: produtoId, quantidade: 1, preco_original: 50, preco_unitario: 50 }],
    };

    await maybeEnqueueFiscalDocumentAfterSyncedVenda(client, payload, noopLog);

    assertEquals(rpcCalls.length, 0);
  } finally {
    if (prevFlag !== undefined) Deno.env.set("AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE", prevFlag);
    else Deno.env.delete("AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE");
  }
});

Deno.test("HOTFIX (achado Codex) — leitura de produtos incompleta (menos linhas que IDs pedidos) -> FAIL-CLOSED, zero RPC", async () => {
  const prevFlag = Deno.env.get("AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE");
  Deno.env.set("AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE", "true");
  try {
    const produtoId1 = "22222222-2222-4222-8222-222222222222";
    const produtoId2 = "33333333-3333-4333-8333-333333333333";
    const { client, rpcCalls } = fakeSupabase({
      // Só devolve 1 dos 2 produtos pedidos — leitura genuinamente
      // incompleta (não um erro explícito, mas igualmente perigosa).
      produtos: [{ id: produtoId1, nome: "Produto 1", codigo_barras: null, ncm: "12345678", cfop_produto: "5405", csosn: "102", cest: null, cst_pis: "01", cst_cofins: "01", unidade_medida: "UN", icms_origem: "0" }],
      vendas_pagamentos: [{ forma_pagamento: "DINHEIRO", valor: 100 }],
    });

    const payload: VendaPayloadFiscalSync = {
      venda_id: "11111111-1111-4111-8111-111111111111",
      forma_pagamento: "DINHEIRO",
      total_bruto: 100,
      total_desconto: 0,
      total_liquido: 100,
      itens: [
        { produto_id: produtoId1, quantidade: 1, preco_original: 50, preco_unitario: 50 },
        { produto_id: produtoId2, quantidade: 1, preco_original: 50, preco_unitario: 50 },
      ],
    };

    await maybeEnqueueFiscalDocumentAfterSyncedVenda(client, payload, noopLog);

    assertEquals(rpcCalls.length, 0);
  } finally {
    if (prevFlag !== undefined) Deno.env.set("AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE", prevFlag);
    else Deno.env.delete("AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE");
  }
});
