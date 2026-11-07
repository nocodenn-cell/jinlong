/**
 * Escolhe como a edge grava uma venda vinda do PDV.
 *
 * `public.registrar_venda_offline_com_token` é proposta (fase31-propostas), não migration.
 * Chamá-la com STRICT_MANAGER_DISCOUNT_AUTH=true derruba a sync: a função não existe no banco
 * publicado e o evento fica em ERRO_RPC_REGISTRAR_VENDA. A gravação continua em
 * registrar_venda_com_itens (ou _v2 quando há parcelas). No dispositivo ativado, o token de
 * gerente é conferido antes por fp_token_gerente_vale_na_loja (migration 20261028120100).
 */

export const RPC_VENDA_ITENS = "registrar_venda_com_itens";
export const RPC_VENDA_ITENS_V2 = "registrar_venda_com_itens_v2";

export type RpcGravacaoVenda = typeof RPC_VENDA_ITENS | typeof RPC_VENDA_ITENS_V2;

export type GravacaoVendaDispositivo = {
  rpc: RpcGravacaoVenda;
  conferirTokenNaLoja: boolean;
};

export function escolherGravacaoVendaDispositivo(input: {
  strictManagerDiscountAuth: boolean;
  hasManagerDiscount: boolean;
  temTokenGerente: boolean;
  modo: "dispositivo" | "legado" | undefined;
  lojaId: string | null | undefined;
  parcelado: boolean;
}): GravacaoVendaDispositivo {
  const loja = typeof input.lojaId === "string" && input.lojaId.length > 0;
  return {
    rpc: input.parcelado ? RPC_VENDA_ITENS_V2 : RPC_VENDA_ITENS,
    conferirTokenNaLoja: input.strictManagerDiscountAuth
      && input.hasManagerDiscount
      && input.temTokenGerente
      && input.modo === "dispositivo"
      && loja,
  };
}
