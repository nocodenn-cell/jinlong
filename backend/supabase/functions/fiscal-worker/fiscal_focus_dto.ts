// Onda C2.3 (prontidão Focus NFe) — mapeamento do snapshot fiscal canônico (C1,
// `documentos_fiscais_pendentes.payload`) para o envelope NFC-e/NF-e da Focus.
//
// Princípio desta missão, reforçado explicitamente pelo usuário nesta onda: NÃO
// inventar nome de campo nem valor de campo que a documentação fornecida não
// confirmou. Este mapeador só popula o que tem fonte E nome de campo confirmados;
// tudo mais vira um "gap" reportado, nunca um default silencioso.
//
// Campos confirmados pela documentação oficial da Focus (colada pelo usuário na
// Fase B desta missão) para o envelope de emissão NFC-e/NF-e: cnpj_emitente,
// data_emissao, modalidade_frete, local_destino, presenca_comprador,
// natureza_operacao, destinatário (quando aplicável), items[], formas_pagamento[].
//
// O que este arquivo consegue mapear com fonte e nome confirmados:
//   - cnpj_emitente  <- payload.emitente.cnpj
//   - data_emissao   <- payload.data_venda
//
// O que fica como GAP (não inventado — ver `FocusNfceGap` para o motivo de cada um):
//   - natureza_operacao: não existe em nenhum cadastro do domínio Jinlong hoje
//     (produto/loja/pdv_config). É decisão de negócio (config de operação? config
//     fiscal da loja? valor fixo exigido pelo contrato?) — não uma coluna já
//     existente que só faltava ler. C2 NÃO usa "VENDA" nem qualquer outra string
//     mágica aqui.
//   - modalidade_frete / local_destino / presenca_comprador: a documentação
//     fornecida confirma que são campos do envelope, mas não seus valores/enum
//     válidos nem onde no domínio Jinlong eles nasceriam.
//   - items[]: confirmado como array obrigatório; o schema de CADA item (nomes de
//     campo tipo `codigo_produto`/`descricao`/`quantidade_comercial`/
//     `valor_unitario_comercial`/tributos por item etc.) não foi fornecido nesta
//     missão. `payload.itens[]` do snapshot já tem os dados (ncm/cfop/csosn/cest/
//     cst_pis/cst_cofins/quantidade/preco_unitario/unidade_medida/nome/
//     codigo_barras) — falta só o DE-PARA para os nomes de campo reais da Focus.
//   - formas_pagamento[]: idem — array confirmado, schema de cada entrada não.
//     `payload.pagamentos[]` do snapshot já tem os dados.
//   - destinatario: confirmado como "quando aplicável"; schema Focus não
//     confirmado. `payload.destinatario` do snapshot já tem os dados quando a
//     venda tem cliente identificado (ver C1, prova ao vivo no Gate C1.5).

import { asString, isRecord } from "./fiscal_http.ts";

export type FocusNfceEnvelopeKnownFields = {
  cnpj_emitente?: string;
  data_emissao?: string;
};

export type FocusNfceGap = {
  campo: string;
  motivo: string;
};

export type FocusNfceMapResult = {
  /** Só os campos com fonte E nome de campo confirmados. Deliberadamente
   * incompleto — ver `gaps`. Nunca popular isto com valor inventado. */
  body: FocusNfceEnvelopeKnownFields;
  gaps: FocusNfceGap[];
};

const GAPS_ESTRUTURAIS: readonly FocusNfceGap[] = [
  {
    campo: "natureza_operacao",
    motivo:
      "Sem fonte em nenhum cadastro do domínio (produto/loja/pdv_config). Decisão de negócio pendente — " +
      "não inventado (nem 'VENDA' nem qualquer outro default).",
  },
  {
    campo: "modalidade_frete",
    motivo: "Campo confirmado pela documentação Focus; valores/enum válidos e fonte no domínio não confirmados.",
  },
  {
    campo: "local_destino",
    motivo: "Campo confirmado pela documentação Focus; valores/enum válidos e fonte no domínio não confirmados.",
  },
  {
    campo: "presenca_comprador",
    motivo: "Campo confirmado pela documentação Focus; valores/enum válidos e fonte no domínio não confirmados.",
  },
  {
    campo: "items[]",
    motivo:
      "Array confirmado como obrigatório; schema de cada item (nomes de campo Focus) não fornecido. " +
      "Dados disponíveis em payload.itens[] do snapshot, sem o DE-PARA de nomes.",
  },
  {
    campo: "formas_pagamento[]",
    motivo:
      "Array confirmado como obrigatório; schema de cada entrada (nomes de campo Focus) não fornecido. " +
      "Dados disponíveis em payload.pagamentos[] do snapshot, sem o DE-PARA de nomes.",
  },
];

export function buildFocusNfceEnvelope(payload: Record<string, unknown> | null | undefined): FocusNfceMapResult {
  const gaps: FocusNfceGap[] = [...GAPS_ESTRUTURAIS];
  const body: FocusNfceEnvelopeKnownFields = {};

  const emitente = isRecord(payload?.emitente) ? (payload!.emitente as Record<string, unknown>) : null;
  const cnpj = emitente ? asString(emitente.cnpj) : null;
  if (cnpj) {
    body.cnpj_emitente = cnpj;
  } else {
    gaps.push({ campo: "cnpj_emitente", motivo: "payload.emitente.cnpj ausente ou vazio no snapshot desta venda." });
  }

  const dataVenda = payload ? asString(payload.data_venda) : null;
  if (dataVenda) {
    body.data_emissao = dataVenda;
  } else {
    gaps.push({ campo: "data_emissao", motivo: "payload.data_venda ausente no snapshot desta venda." });
  }

  if (isRecord(payload?.destinatario)) {
    gaps.push({
      campo: "destinatario",
      motivo: "payload.destinatario presente no snapshot, mas schema Focus de destinatário não confirmado.",
    });
  }

  return { body, gaps };
}

/** Nomes dos campos estruturalmente sempre-gap (independem do payload de entrada) — usado em testes de boundary. */
export function gapsEstruturais(): readonly FocusNfceGap[] {
  return GAPS_ESTRUTURAIS;
}
