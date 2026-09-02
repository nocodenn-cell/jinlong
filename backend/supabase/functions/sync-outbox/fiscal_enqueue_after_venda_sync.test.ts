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
            then(resolve: (v: { data: unknown; error: null }) => void) {
              // usado só por `produtos` (sem maybeSingle — retorna lista via `.in`)
              if (table === "produtos") return resolve({ data: tables.produtos ?? [], error: null });
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
      }],
      pdv_config: { cfop_padrao: "5405", regime_tributario: "SIMPLES_NACIONAL" },
      vendas: { data: "2026-09-02T12:00:00Z" },
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
