import { assertEquals, assertRejects } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { aplicarDecisao, horarioDispositivo, parseDecisao, sha256Hex } from "./revisaoOffline.ts";

function deps() {
  const chamadas: string[] = [];
  return {
    chamadas,
    d: {
      processar: () => {
        chamadas.push("processar");
        return Promise.resolve();
      },
      enfileirar: (status: string) => {
        chamadas.push(`fila:${status}`);
        return Promise.resolve();
      },
    },
  };
}

Deno.test("PROCESSAR grava e não enfileira", async () => {
  const { chamadas, d } = deps();
  assertEquals(await aplicarDecisao({ acao: "PROCESSAR" }, d), { resultado: "PROCESSADO" });
  assertEquals(chamadas, ["processar"]);
});

Deno.test("RECONCILIAR grava e deixa trilha RECONCILIADO_AUTO", async () => {
  const { chamadas, d } = deps();
  const r = await aplicarDecisao({ acao: "RECONCILIAR", classificacao: "ANTES_INATIVACAO", motivo: "RECEBIDO_ANTES" }, d);
  assertEquals(r, { resultado: "RECONCILIADO", classificacao: "ANTES_INATIVACAO" });
  assertEquals(chamadas, ["processar", "fila:RECONCILIADO_AUTO"]);
});

Deno.test("REVISAO NÃO grava: só guarda na fila PENDENTE (nada some, nada entra sem DONO/GERENTE)", async () => {
  for (const c of ["APOS_INATIVACAO", "NAO_COMPROVAVEL"]) {
    const { chamadas, d } = deps();
    const r = await aplicarDecisao({ acao: "REVISAO", classificacao: c, motivo: "X" }, d);
    assertEquals(r, { resultado: "EM_REVISAO", classificacao: c, motivo: "X" });
    assertEquals(chamadas, ["fila:PENDENTE"]);
  }
});

Deno.test("REJEITAR lança com o motivo e não toca em nada", async () => {
  const { chamadas, d } = deps();
  await assertRejects(() => aplicarDecisao({ acao: "REJEITAR", motivo: "EVENTO_OPERADOR_SEM_VINCULO" }, d), Error, "EVENTO_OPERADOR_SEM_VINCULO");
  assertEquals(chamadas, []);
});

Deno.test("decisão inválida/ausente ⇒ falha fechado", async () => {
  for (const raw of [null, undefined, "PROCESSAR", [], {}, { acao: "OK" }, { acao: "REVISAO" }, { acao: "RECONCILIAR", classificacao: "NAO_COMPROVAVEL" }]) {
    const { chamadas, d } = deps();
    await assertRejects(() => aplicarDecisao(raw, d), Error, "DECISAO_SYNC_INVALIDA");
    assertEquals(chamadas, []);
  }
  assertEquals(parseDecisao({ acao: "PROCESSAR" }).acao, "PROCESSAR");
});

Deno.test("falha ao enfileirar revisão propaga (evento fica no PDV para reenvio)", async () => {
  await assertRejects(() =>
    aplicarDecisao({ acao: "REVISAO", classificacao: "NAO_COMPROVAVEL" }, {
      processar: () => Promise.resolve(),
      enfileirar: () => Promise.reject(new Error("SYNC_REVISAO_INDISPONIVEL")),
    }), Error, "SYNC_REVISAO_INDISPONIVEL");
});

Deno.test("horário do dispositivo: formato SQLite (UTC) e ISO; lixo ⇒ null", () => {
  assertEquals(horarioDispositivo("2026-10-20 13:45:00"), "2026-10-20T13:45:00.000Z");
  assertEquals(horarioDispositivo("2026-10-20T10:45:00-03:00"), "2026-10-20T13:45:00.000Z");
  assertEquals(horarioDispositivo("ontem"), null);
  assertEquals(horarioDispositivo(""), null);
  assertEquals(horarioDispositivo(null), null);
});

Deno.test("sha256 estável do payload (mesmo valor que o banco compara)", async () => {
  assertEquals(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});
