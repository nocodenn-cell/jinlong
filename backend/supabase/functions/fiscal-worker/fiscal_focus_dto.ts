// Onda C2.3 (prontidão Focus NFe), fechada parcialmente no Gate C2.5 com
// evidência oficial adicional (colada pelo usuário: doc.focusnfe.com.br/
// reference/emitir_nfce). Princípio inalterado: NÃO inventar nome de campo
// nem valor de campo sem fonte confirmada.
//
// Campos confirmados pela documentação oficial da Focus para o envelope de
// emissão NFC-e/NF-e: cnpj_emitente, data_emissao, modalidade_frete,
// local_destino, presenca_comprador, natureza_operacao, destinatário (quando
// aplicável), items[], formas_pagamento[].
//
// O que este arquivo mapeia com fonte E nome confirmados (Gate C2.5):
//   - cnpj_emitente    <- payload.emitente.cnpj
//   - modalidade_frete <- constante "9" (Sem frete) — ver justificativa abaixo
//   - local_destino    <- constante "1" (operação interna) — idem
//   - presenca_comprador <- constante "1" (presencial) — idem
//
// `data_emissao` NÃO é responsabilidade deste mapeador (ver
// fiscal-provider-adapter.ts): a Focus exige emissão com data/hora PRÓXIMA do
// momento real do envio HTTP, com timezone — usar o `data_venda` congelado no
// snapshot C1 seria semanticamente errado para uma venda que ficou pendente
// (erro/retry/reprocesso manual) e só é reemitida bem depois. `data_venda`
// (fato de negócio imutável — quando a venda aconteceu) e `data_emissao`
// (quando a REQUISIÇÃO HTTP realmente sai) são coisas diferentes por
// definição — a segunda só pode ser calculada no momento do envio, nunca lida
// de um snapshot congelado. Ver decisão completa em
// docs/audits/AUDITORIA_PRONTIDAO_FOCUS_NFE_FASE_C_GATE_C2_5.md.
//
// `natureza_operacao` — DECISÃO (não gap): a documentação oficial confirma
// que, se omitido, a Focus aplica seu próprio padrão para venda ao
// consumidor. O Jinlong não tem hoje nenhuma regra de negócio própria para
// esse campo (não existe em produto/loja/pdv_config), então o campo fica
// DELIBERADAMENTE ausente do envelope — o comportamento default documentado
// passa a pertencer exclusivamente à Focus (infraestrutura), não ao domínio
// Jinlong. Isso NÃO é "VENDA" nem qualquer string mágica: é a AUSÊNCIA
// deliberada do campo, decisão diferente de inventar um valor.
//
// `modalidade_frete`/`local_destino`/`presenca_comprador` — mapeados como
// constantes derivadas do modelo de negócio já confirmado em toda a auditoria
// desta missão (Jinlong é PDV de varejo presencial — "venda no balcão"; não
// existe, em nenhum ponto do domínio auditado, captura de frete/entrega nem
// de endereço de destinatário): "9" (sem frete), "1" (operação interna — não
// há como hoje detectar interestadual/exterior, pois o snapshot não captura
// UF do destinatário; ver GAP correspondente), "1" (presencial). Isso não é
// inventar dado fiscal (como CST/CSOSN/NCM seriam) — é aplicar um enum
// CONFIRMADO a um fato operacional já conhecido e estável do negócio.
//
// items[]/formas_pagamento[]/destinatario continuam GAP: a página
// confirmada nesta rodada (doc.focusnfe.com.br/reference/emitir_nfce) não
// detalha o schema interno desses objetos — o usuário apontou
// https://campos.focusnfe.com.br/nfe/NotaFiscalXML.html como a fonte
// completa, mas WebFetch/WebSearch falharam nesta sessão (mesmo erro de
// infraestrutura já registrado na Fase B) — não foi possível consultar.
// PENDENTE, não inventado. Ver Gate C2.5.

import { asString, isRecord } from "./fiscal_http.ts";

export type FocusNfceEnvelopeKnownFields = {
  cnpj_emitente?: string;
  modalidade_frete?: "0" | "1" | "2" | "9";
  local_destino?: "1" | "2" | "3";
  presenca_comprador?: "1" | "4";
};

export type FocusNfceGap = {
  campo: string;
  motivo: string;
};

export type FocusNfceOmittedByDesign = {
  campo: string;
  motivo: string;
};

export type FocusNfceMapResult = {
  /** Só os campos com fonte E nome de campo confirmados. Deliberadamente
   * incompleto — ver `gaps`. Nunca popular isto com valor inventado. */
  body: FocusNfceEnvelopeKnownFields;
  gaps: FocusNfceGap[];
  /** Campos que o contrato Focus aceita omitir — não são "faltando", são uma
   * decisão consciente de deixar o comportamento default documentado da
   * Focus prevalecer, por não existir regra de negócio Jinlong própria. */
  omittedByDesign: FocusNfceOmittedByDesign[];
};

const GAPS_ESTRUTURAIS: readonly FocusNfceGap[] = [
  {
    campo: "items[]",
    motivo:
      "Array confirmado como obrigatório; schema de cada item (nomes de campo Focus) não confirmado nesta sessão " +
      "(WebFetch/WebSearch indisponíveis — https://campos.focusnfe.com.br/nfe/NotaFiscalXML.html não pôde ser consultado). " +
      "Dados disponíveis em payload.itens[] do snapshot, sem o DE-PARA de nomes.",
  },
  {
    campo: "formas_pagamento[]",
    motivo:
      "Array confirmado como obrigatório; schema de cada entrada (nomes de campo Focus) não confirmado nesta sessão " +
      "pelo mesmo motivo acima. Dados disponíveis em payload.pagamentos[] do snapshot.",
  },
  {
    campo: "local_destino_interestadual_exterior",
    motivo:
      "local_destino é mapeado como '1' (operação interna) por padrão — não há hoje, em nenhum ponto do snapshot, " +
      "captura de UF do destinatário, então não é possível detectar venda interestadual ('2') ou para o exterior ('3'). " +
      "Se o Jinlong algum dia vender para cliente identificado de outro estado, este campo precisa de dado que não existe hoje.",
  },
];

const OMITTED_BY_DESIGN: readonly FocusNfceOmittedByDesign[] = [
  {
    campo: "natureza_operacao",
    motivo:
      "Documentação oficial confirma: se omitido, a Focus aplica seu próprio padrão para venda ao consumidor. " +
      "Jinlong não tem regra de negócio própria para este campo (não existe em produto/loja/pdv_config) — decisão " +
      "deliberada de deixar o default pertencer à Focus (infraestrutura), não inventar valor no domínio.",
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

  // Constantes de negócio confirmadas — não dependem do payload (Jinlong PDV
  // presencial, sem frete, sem captura de entrega). Ver justificativa no
  // cabeçalho do arquivo.
  body.modalidade_frete = "9";
  body.presenca_comprador = "1";
  body.local_destino = "1";

  if (isRecord(payload?.destinatario)) {
    gaps.push({
      campo: "destinatario",
      motivo: "payload.destinatario presente no snapshot, mas schema Focus de destinatário não confirmado nesta sessão.",
    });
  }

  return { body, gaps, omittedByDesign: [...OMITTED_BY_DESIGN] };
}

/** Nomes dos campos estruturalmente sempre-gap (independem do payload de entrada) — usado em testes de boundary. */
export function gapsEstruturais(): readonly FocusNfceGap[] {
  return GAPS_ESTRUTURAIS;
}

export function omittedByDesign(): readonly FocusNfceOmittedByDesign[] {
  return OMITTED_BY_DESIGN;
}
