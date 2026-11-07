import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RPC_VENDA_ITENS,
  RPC_VENDA_ITENS_V2,
  escolherGravacaoVendaDispositivo,
} from "./gravacaoVendaDispositivo.ts";

const LOJA = "d1000000-0000-4000-8000-00000000000a";

const base = {
  strictManagerDiscountAuth: true,
  hasManagerDiscount: true,
  temTokenGerente: true,
  modo: "dispositivo" as const,
  lojaId: LOJA,
  parcelado: false,
};

describe("escolherGravacaoVendaDispositivo", () => {
  it("dispositivo com token estrito grava na RPC publicada e confere o token na loja", () => {
    const escolha = escolherGravacaoVendaDispositivo(base);
    assert.equal(escolha.rpc, RPC_VENDA_ITENS);
    assert.equal(escolha.conferirTokenNaLoja, true);
    assert.equal(escolha.rpc.includes("offline_com_token"), false);
  });

  it("parcelas > 1 usam a v2 publicada, ainda conferindo o token", () => {
    const escolha = escolherGravacaoVendaDispositivo({ ...base, parcelado: true });
    assert.equal(escolha.rpc, RPC_VENDA_ITENS_V2);
    assert.equal(escolha.conferirTokenNaLoja, true);
  });

  it("sem modo estrito, sem token, legado ou sem loja não chama a conferência", () => {
    assert.equal(escolherGravacaoVendaDispositivo({ ...base, strictManagerDiscountAuth: false }).conferirTokenNaLoja, false);
    assert.equal(escolherGravacaoVendaDispositivo({ ...base, temTokenGerente: false }).conferirTokenNaLoja, false);
    assert.equal(escolherGravacaoVendaDispositivo({ ...base, hasManagerDiscount: false }).conferirTokenNaLoja, false);
    assert.equal(escolherGravacaoVendaDispositivo({ ...base, modo: "legado" }).conferirTokenNaLoja, false);
    assert.equal(escolherGravacaoVendaDispositivo({ ...base, modo: undefined }).conferirTokenNaLoja, false);
    assert.equal(escolherGravacaoVendaDispositivo({ ...base, lojaId: null }).conferirTokenNaLoja, false);
    assert.equal(escolherGravacaoVendaDispositivo({ ...base, lojaId: "" }).conferirTokenNaLoja, false);
  });
});
