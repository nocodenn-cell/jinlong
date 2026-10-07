// Onda C2.3, fechada em duas rodadas do Gate C2.5 com evidência oficial da
// Focus (doc.focusnfe.com.br + campos.focusnfe.com.br, ambas coladas pelo
// usuário nesta missão). Princípio inalterado: NÃO inventar nome de campo nem
// valor de campo sem fonte confirmada.

import { asString, isRecord } from "./fiscal_http.ts";

export type FocusNfceEnvelopeKnownFields = {
  natureza_operacao?: string;
  cnpj_emitente?: string;
  modalidade_frete?: "0" | "1" | "2" | "9";
  local_destino?: "1" | "2" | "3";
  presenca_comprador?: "1" | "4";
  items?: Record<string, unknown>[];
  formas_pagamento?: Record<string, unknown>[];
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
  body: FocusNfceEnvelopeKnownFields;
  gaps: FocusNfceGap[];
  omittedByDesign: FocusNfceOmittedByDesign[];
  /** true = existe pelo menos um gap que impede uma emissão real completa
   * hoje (mesmo sem inventar nada). Não bloqueia testes com fake HTTP. */
  bloqueante: boolean;
};

// Sprint P0 Focus (2026-10-03): `natureza_operacao` SAIU desta lista. A Focus
// confirmou oficialmente que o campo é obrigatório na NFC-e e não tem valor
// padrão — a premissa anterior ("omitido = padrão da Focus") estava errada.
// Agora é lido do snapshot (`payload.natureza_operacao`) e, ausente, bloqueia
// a emissão. Nenhum valor é inventado aqui.
const OMITTED_BY_DESIGN: readonly FocusNfceOmittedByDesign[] = [
  {
    campo: "unidade_tributavel / quantidade_tributavel / valor_unitario_tributavel",
    motivo:
      "Confirmado: opcionais, com fallback documentado para os equivalentes comerciais quando omitidos. Jinlong não " +
      "tem conceito de unidade tributável distinta da comercial em nenhum ponto do domínio — omitidos, deixando o " +
      "fallback da Focus valer.",
  },
  {
    campo: "inclui_no_total",
    motivo: "Confirmado: default = 1 (sim). Jinlong não tem conceito de item que não soma ao total — omitido.",
  },
  {
    campo: "valor_bruto",
    motivo:
      "Confirmado: pode ser calculado automaticamente pela Focus quando omitido. Omitido deliberadamente para não " +
      "duplicar uma regra de arredondamento em paralelo à da Focus.",
  },
];

// ---------------------------------------------------------------------------
// ITEM (C2.5.1) — contrato oficial confirmado em campos.focusnfe.com.br/nfe/
// ItemNotaFiscalXML.html (colado pelo usuário). Mapeia snapshot.itens[] ->
// items[] da Focus. NUNCA reconsulta `produtos` — só o que já está congelado.
// ---------------------------------------------------------------------------

const CAMPOS_ITEM_OBRIGATORIOS = [
  "codigo_produto",
  "descricao",
  "codigo_ncm",
  "cfop",
  "unidade_comercial",
  "quantidade_comercial",
  "valor_unitario_comercial",
  "icms_origem",
] as const;

/** Onda C2.6 — códigos de origem ICMS confirmados pela Focus (tag `orig`), 0-8. */
const ICMS_ORIGEM_VALIDOS = new Set(["0", "1", "2", "3", "4", "5", "6", "7", "8"]);

function isPlausibleGtin(v: string): boolean {
  // GTIN-8/12/13/14 — só dígitos, tamanho padrão. Jinlong não distingue
  // "código de barras GTIN" de "código de barras proprietário" no cadastro;
  // esta checagem de formato é a única forma de não inventar essa distinção.
  return /^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(v);
}

export type FocusItemMapResult = { item: Record<string, unknown> | null; gaps: FocusNfceGap[] };

export function mapSnapshotItemToFocus(item: Record<string, unknown>, numeroItem: number): FocusItemMapResult {
  const gaps: FocusNfceGap[] = [];
  const out: Record<string, unknown> = { numero_item: numeroItem };
  const prefix = (campo: string) => `items[${numeroItem}].${campo}`;

  // codigo_produto <- produto_id (UUID, já no snapshot, identificador interno
  // estável). `produtos.codigo_interno` seria semanticamente mais alinhado a
  // "código interno do produto", mas não está congelado no snapshot C1 —
  // registrado como melhoria futura, NÃO bloqueante (produto_id já satisfaz
  // o contrato formal: String[1-60], identificador interno único e estável).
  const produtoId = asString(item.produto_id);
  if (produtoId) out.codigo_produto = produtoId;
  else gaps.push({ campo: prefix("codigo_produto"), motivo: "produto_id ausente no item do snapshot." });

  const nome = asString(item.nome);
  if (nome) out.descricao = nome;
  else gaps.push({ campo: prefix("descricao"), motivo: "nome do produto ausente no snapshot." });

  const ncm = asString(item.ncm);
  if (ncm) out.codigo_ncm = ncm;
  else {
    gaps.push({
      campo: prefix("codigo_ncm"),
      motivo:
        "NCM obrigatório pela Focus, mas ausente no item — o cadastro do produto na Jinlong permite NCM nulo " +
        "(gap de dado, não de mapeamento; ver idx_produtos_sem_ncm já existente no banco).",
    });
  }

  const cest = asString(item.cest);
  if (cest) out.cest = cest; // opcional — confirmado "obrigatório só quando aplicável"; omitido corretamente quando ausente

  const cfop = asString(item.cfop);
  if (cfop) out.cfop = cfop;
  else gaps.push({ campo: prefix("cfop"), motivo: "CFOP ausente no item do snapshot." });

  const unidade = asString(item.unidade_medida);
  if (unidade) out.unidade_comercial = unidade;
  else gaps.push({ campo: prefix("unidade_comercial"), motivo: "unidade_medida ausente no item do snapshot." });

  const quantidade = typeof item.quantidade === "number" ? item.quantidade : null;
  if (quantidade != null) out.quantidade_comercial = quantidade;
  else gaps.push({ campo: prefix("quantidade_comercial"), motivo: "quantidade ausente/inválida no item do snapshot." });

  // valor_unitario_comercial <- preco_unitario_original (valor de lista,
  // ANTES do desconto) — não preco_unitario (já líquido) — para não duplicar
  // o desconto (uma vez implícito no unitário, outra vez em valor_desconto).
  // Convenção padrão de NF-e (vProd bruto + vDesc separado); não confirmada
  // campo a campo nesta rodada, mas fortemente implícita pela própria
  // existência de valor_bruto E valor_desconto como campos SEPARADOS — sinalizado
  // aqui para validação em homologação real, não apresentado como 100% certo.
  const precoOriginal = typeof item.preco_unitario_original === "number" ? item.preco_unitario_original : null;
  if (precoOriginal != null) out.valor_unitario_comercial = precoOriginal;
  else gaps.push({ campo: prefix("valor_unitario_comercial"), motivo: "preco_unitario_original ausente/inválido no item do snapshot." });

  const descontoUnit = typeof item.desconto_unitario === "number" ? item.desconto_unitario : 0;
  if (quantidade != null && descontoUnit > 0) {
    out.valor_desconto = Math.round(descontoUnit * quantidade * 100) / 100;
  }
  // valor_bruto: omitido de propósito — ver omittedByDesign.

  const codigoBarras = asString(item.codigo_barras);
  if (codigoBarras && isPlausibleGtin(codigoBarras)) {
    out.codigo_barras_comercial = codigoBarras;
  }
  // codigo_barras_proprio_comercial: nunca preenchido — Jinlong não distingue
  // formato GTIN de código proprietário no cadastro; sem essa distinção
  // confiável, preencher arriscaria classificar errado (não inventado).

  // icms_origem (Onda C2.6, Gate C2.5 tributação): único subcampo do grupo
  // ICMS confirmado E modelado no domínio até aqui (produtos.icms_origem,
  // migration 20260902140000; congelado no snapshot desde 20260902140300).
  // Fail-closed no boundary: ausente ou fora de '0'..'8' BLOQUEIA o item —
  // nunca inventa/deriva um valor (produtos.origem é conceito diferente e
  // não é lido aqui). Distinto do gap geral de tributação logo abaixo, que
  // continua cobrindo CST/CSOSN/base/valor — esses seguem não confirmados.
  const icmsOrigem = asString(item.icms_origem);
  if (icmsOrigem && ICMS_ORIGEM_VALIDOS.has(icmsOrigem)) {
    out.icms_origem = icmsOrigem;
  } else {
    gaps.push({
      campo: prefix("icms_origem"),
      motivo: icmsOrigem
        ? `icms_origem '${icmsOrigem}' fora do domínio confirmado ('0'..'8') — produto precisa ser reclassificado.`
        : "icms_origem ausente no item do snapshot — produto ainda não classificado (produtos.icms_origem NULL). " +
          "Não derivado de produtos.origem (conceito diferente, proibido nesta missão).",
    });
  }

  // Tributação (grupos ICMS-CST/CSOSN/PIS/COFINS restantes): BLOQUEADO nesta
  // rodada — o material confirmado não incluiu os nomes de campo desses
  // grupos (só a lista geral de campos não-tributários do item + icms_origem
  // acima). Ver TRIBUTAÇÃO no Gate C2.5.
  gaps.push({
    campo: prefix("tributacao_icms_pis_cofins"),
    motivo: "Grupo de campos ICMS (CST/CSOSN)/PIS/COFINS (além de icms_origem) não confirmado pela documentação recebida nesta sessão.",
  });

  const bloqueante = gaps.some((g) => CAMPOS_ITEM_OBRIGATORIOS.some((campo) => g.campo.endsWith(campo)));
  return { item: bloqueante ? null : out, gaps };
}

// ---------------------------------------------------------------------------
// PAGAMENTO (C2.5.2) — contrato oficial confirmado em campos.focusnfe.com.br/
// nfe/FormaPagamentoXML.html + lista de códigos colada pelo usuário.
// ---------------------------------------------------------------------------

/** Códigos Jinlong com mapeamento inequívoco confirmado. */
const FORMA_PAGAMENTO_CONFIRMADA: Readonly<Record<string, string>> = {
  DINHEIRO: "01",
  CARTAO_CREDITO: "03",
  CARTAO_DEBITO: "04",
};

/**
 * PIX — Sprint P0 Focus (contrato confirmado pela Focus em 2026-10-03): a
 * NFC-e aceita 17 = PIX estático, 20 = PIX dinâmico, 23 = PIX automático.
 *
 * O domínio Jinlong só registra `PIX` (CHECK em vendas/vendas_pagamentos),
 * sem a modalidade. O código Focus só é escolhido quando a entrada de
 * pagamento do snapshot traz `pix_modalidade` explícita; sem ela a forma fica
 * BLOQUEADA — nunca presumimos uma modalidade. Hoje nenhum ponto do domínio
 * preenche `pix_modalidade` (gap de domínio documentado).
 */
const PIX_MODALIDADE_FOCUS: Readonly<Record<string, string>> = {
  ESTATICO: "17",
  DINAMICO: "20",
  AUTOMATICO: "23",
};

export type FocusPagamentoMapResult = { entrada: Record<string, unknown> | null; gap: FocusNfceGap | null };

export function mapPagamentoToFocus(
  pagamento: { forma_pagamento: string; valor: number; pix_modalidade?: string | null },
): FocusPagamentoMapResult {
  const codigoJinlong = (pagamento.forma_pagamento ?? "").trim().toUpperCase();
  const modalidadePix = (pagamento.pix_modalidade ?? "").trim().toUpperCase();
  const codigoFocus = codigoJinlong === "PIX"
    ? PIX_MODALIDADE_FOCUS[modalidadePix]
    : FORMA_PAGAMENTO_CONFIRMADA[codigoJinlong];

  if (!codigoFocus) {
    const motivo = codigoJinlong === "PIX"
      ? (modalidadePix
        ? `pix_modalidade '${modalidadePix}' fora do contrato (ESTATICO=17, DINAMICO=20, AUTOMATICO=23).`
        : "PIX sem pix_modalidade no snapshot — a Focus exige 17 (estático), 20 (dinâmico) ou 23 (automático) e o " +
          "domínio Jinlong não registra a modalidade; nenhuma modalidade é presumida.")
      : `Código de pagamento Jinlong '${codigoJinlong}' sem mapeamento confirmado para a Focus.`;
    return { entrada: null, gap: { campo: `formas_pagamento[].${codigoJinlong || "(vazio)"}`, motivo } };
  }

  return {
    entrada: {
      forma_pagamento: codigoFocus,
      valor_pagamento: pagamento.valor,
      // indicador_pagamento="0" (à vista): `payload.pagamentos[]` só contém
      // pagamentos efetivamente recebidos no ato da venda (vendas_pagamentos,
      // C1) — saldo pendente/a prazo vira contas_receber, um documento
      // totalmente separado, nunca uma entrada deste array. Portanto todo
      // pagamento que chega aqui é, por construção do domínio, à vista.
      indicador_pagamento: "0",
      // tipo_integracao/cnpj_credenciadora/bandeira_operadora/
      // numero_autorizacao: NÃO preenchidos — Jinlong não captura esses dados
      // transacionais de cartão em nenhum ponto do domínio hoje (confirmado
      // ausentes em vendas_pagamentos). Gap reportado, não inventado.
    },
    gap: (codigoJinlong === "CARTAO_CREDITO" || codigoJinlong === "CARTAO_DEBITO")
      ? {
        campo: `formas_pagamento[].${codigoJinlong}.dados_transacionais`,
        motivo: "tipo_integracao/cnpj_credenciadora/bandeira_operadora/numero_autorizacao não capturados pelo Jinlong hoje.",
      }
      : null,
  };
}

/**
 * Sprint C2.9 (P0-5, achado Codex) — fecha os 3 cenários de destinatário:
 *   - NFC-e anônima (sem `payload.destinatario`): sempre READY, nada exigido.
 *   - NFC-e identificada (`payload.destinatario` presente): BLOQUEADA — sem
 *     UF no snapshot (clientes só tem nome/documento/tipo), não é possível
 *     determinar `local_destino` (interno/interestadual/exterior) com
 *     segurança; enviar "1" (interno) por padrão seria adivinhar.
 *   - NF-e: destinatário é OBRIGATÓRIO pelo próprio contrato Focus (não é
 *     nota ao consumidor anônimo) — ausência ou identificação incompleta
 *     (nome/documento) bloqueia.
 * Nenhum dos três cenários é resolvido inventando UF ou dado de cliente —
 * cada um vira gap explícito, reportado, não mascarado.
 */
function validarDestinatario(payload: Record<string, unknown> | null | undefined, tipoDoc: string | undefined, gaps: FocusNfceGap[]): void {
  const destinatario = isRecord(payload?.destinatario) ? (payload!.destinatario as Record<string, unknown>) : null;
  const ehNfe = (tipoDoc ?? "").trim().toUpperCase() === "NFE";

  if (ehNfe) {
    if (!destinatario) {
      gaps.push({
        campo: "destinatario",
        motivo: "NF-e exige destinatário identificado (não é nota ao consumidor anônimo) — payload.destinatario ausente.",
      });
      return;
    }
    const nome = asString(destinatario.nome);
    const documento = asString(destinatario.documento);
    if (!nome || !documento) {
      gaps.push({
        campo: "destinatario.identificacao",
        motivo: `NF-e exige nome+documento do destinatário — ausente(s): ${[!nome && "nome", !documento && "documento"].filter(Boolean).join(", ")}.`,
      });
    }
    // UF ainda ausente do snapshot mesmo para NF-e — mesma limitação abaixo.
  }

  if (destinatario) {
    // Não há hoje UF do destinatário no snapshot (clientes só tem nome/
    // documento/tipo) — não é possível detectar interestadual/exterior.
    // Bloqueante (não apenas reportado): enviar local_destino="1" (interno)
    // sem saber a UF real seria adivinhar um campo fiscal.
    gaps.push({
      campo: "local_destino_interestadual_exterior",
      motivo: "Sem UF do destinatário no snapshot — não detectável quando a venda é para cliente identificado fora do estado.",
    });
  }
}

export function buildFocusNfceEnvelope(payload: Record<string, unknown> | null | undefined, tipoDoc?: string): FocusNfceMapResult {
  const gaps: FocusNfceGap[] = [];
  const body: FocusNfceEnvelopeKnownFields = {};

  // Obrigatório e sem default na Focus (confirmado 2026-10-03). O domínio
  // Jinlong ainda não tem fonte para este valor (nem loja, nem pdv_config,
  // nem produto) — só o snapshot pode trazê-lo. Ausente => bloqueia.
  const naturezaOperacao = asString(payload?.natureza_operacao);
  if (naturezaOperacao) body.natureza_operacao = naturezaOperacao;
  else {
    gaps.push({
      campo: "natureza_operacao",
      motivo:
        "Obrigatório na NFC-e e sem valor padrão na Focus; o snapshot da venda não traz natureza_operacao " +
        "(o domínio Jinlong ainda não define essa informação). Emissão bloqueada — nenhum valor presumido.",
    });
  }

  const emitente = isRecord(payload?.emitente) ? (payload!.emitente as Record<string, unknown>) : null;
  const cnpj = emitente ? asString(emitente.cnpj) : null;
  if (cnpj) body.cnpj_emitente = cnpj;
  else gaps.push({ campo: "cnpj_emitente", motivo: "payload.emitente.cnpj ausente ou vazio no snapshot desta venda." });

  // Constantes do CENÁRIO ATUAL (PDV físico presencial, sem frete, operação
  // interna) — isoladas aqui como política do cenário, não regra fiscal
  // universal. Venda interestadual/entrega/e-commerce exigirão outra regra.
  body.modalidade_frete = "9";
  body.presenca_comprador = "1";
  body.local_destino = "1";
  const gapsAntesDestinatario = gaps.length;
  validarDestinatario(payload, tipoDoc, gaps);
  const bloqueanteDestinatario = gaps.length > gapsAntesDestinatario;

  const itensRaw = Array.isArray(payload?.itens) ? (payload!.itens as unknown[]) : [];
  const items: Record<string, unknown>[] = [];
  itensRaw.forEach((raw, idx) => {
    if (!isRecord(raw)) return;
    const { item, gaps: itemGaps } = mapSnapshotItemToFocus(raw, idx + 1);
    gaps.push(...itemGaps);
    if (item) items.push(item);
  });
  if (itensRaw.length === 0) {
    gaps.push({ campo: "items[]", motivo: "payload.itens ausente/vazio no snapshot." });
  } else {
    body.items = items;
  }

  const pagamentosRaw = Array.isArray(payload?.pagamentos) ? (payload!.pagamentos as unknown[]) : [];
  const formasPagamento: Record<string, unknown>[] = [];
  pagamentosRaw.forEach((raw) => {
    if (!isRecord(raw)) return;
    const forma = asString(raw.forma_pagamento) ?? "";
    const valor = typeof raw.valor === "number" ? raw.valor : 0;
    const { entrada, gap } = mapPagamentoToFocus({ forma_pagamento: forma, valor, pix_modalidade: asString(raw.pix_modalidade) });
    if (gap) gaps.push(gap);
    if (entrada) formasPagamento.push(entrada);
  });
  if (pagamentosRaw.length === 0) {
    gaps.push({ campo: "formas_pagamento[]", motivo: "payload.pagamentos ausente/vazio no snapshot." });
  } else if (formasPagamento.length > 0) {
    body.formas_pagamento = formasPagamento;
  }
  // Se todos os pagamentos foram bloqueados (ex.: só PIX sem modalidade),
  // formas_pagamento fica ausente do corpo — os gaps individuais já
  // reportam o motivo exato, não silenciado.

  const bloqueanteItens = itensRaw.length === 0 || items.length < itensRaw.filter((r) => isRecord(r)).length;
  // Sprint C2.9 (P0-4, achado Codex): antes só bloqueava se TODOS os
  // pagamentos falhassem o mapeamento — uma venda mista (ex.: dinheiro +
  // PIX) com PIX bloqueado (PENDENTE REGRA) passava com formas_pagamento
  // contendo só o dinheiro, um total DIFERENTE do total_liquido real da
  // venda. Corrigido para exigir mapeamento COMPLETO — mesmo padrão de
  // bloqueanteItens acima — nunca reduz venda mista a uma única forma.
  const bloqueantePagamentos = pagamentosRaw.length === 0 ||
    formasPagamento.length < pagamentosRaw.filter((r) => isRecord(r)).length;
  // Sprint P0 Focus: soma das formas de pagamento precisa bater com o total
  // líquido congelado da venda (quando o snapshot o traz) — nunca envia um
  // total de pagamentos diferente do total da nota.
  let bloqueanteTotal = false;
  const totais = isRecord(payload?.totais) ? (payload!.totais as Record<string, unknown>) : null;
  const totalLiquido = typeof totais?.liquido === "number" ? totais.liquido : null;
  if (totalLiquido != null && formasPagamento.length > 0) {
    const soma = formasPagamento.reduce((acc, f) => acc + (typeof f.valor_pagamento === "number" ? f.valor_pagamento : 0), 0);
    if (Math.abs(Math.round(soma * 100) - Math.round(totalLiquido * 100)) > 0) {
      bloqueanteTotal = true;
      gaps.push({
        campo: "formas_pagamento[].valor_pagamento",
        motivo: `Soma dos pagamentos (${soma.toFixed(2)}) diferente do total líquido da venda (${totalLiquido.toFixed(2)}).`,
      });
    }
  }

  const bloqueante = !naturezaOperacao || !cnpj || bloqueanteItens || bloqueantePagamentos || bloqueanteDestinatario ||
    bloqueanteTotal || gaps.some((g) => g.campo.includes("tributacao"));

  return { body, gaps, omittedByDesign: [...OMITTED_BY_DESIGN], bloqueante };
}

export function omittedByDesign(): readonly FocusNfceOmittedByDesign[] {
  return OMITTED_BY_DESIGN;
}
