# 02 — Contratos do Import Intelligence (proposta)

Contratos de entrada e saída do motor, contrato de tributo (persistência), códigos de erro e divergência, e assinaturas propostas das RPCs. Nada disto está implementado.

**Fonte de verdade dos exemplos:** os números desta página são os de `fixtures/casos/15-exemplo-doc-02/`, conferidos à mão. Se algo divergir, prevalece o fixture e este documento deve ser corrigido. O contrato TypeScript formal está em `07-MOTOR-CONTRATO-MINIMO.md` §3.

---

## 1. Regras gerais de contrato

| Regra | Motivo |
|---|---|
| Valores monetários, taxas e quantidades são **strings decimais** (`"123.450000"`), nunca número JSON | Evita perda de precisão |
| Todo payload tem `schema_version` (string) | Evolução sem quebrar leitura antiga |
| IDs são UUID, ou id textual estável quando o item vem de documento sem UUID | Idempotência e rastreio |
| Listas são ordenadas por `id` antes de cálculo e de hash | Determinismo (I-02) |
| Datas em `YYYY-MM-DD`; instantes em ISO 8601 com `Z` | Sem fuso implícito |
| Erros são códigos estáveis em caixa alta (`LANDED_*`, `IMPORT_*`) | Compatível com `IMPORT_NFE_*` e `OC_*` |
| Nenhum campo de tenant é aceito como autorização. Tenant vem da sessão | ESPEC §8 |

---

## 2. Entrada do motor: `LandedCostInput`

Exemplo: fixture `15-exemplo-doc-02` (input). Reproduz o exemplo do documento de Sprint 0.

```json
{
  "schema_version": "1",
  "processo": { "id": "proc-001", "loja_importadora_id": "loja-0000-0001", "moeda_base": "BRL" },
  "politica": {
    "escala_intermediaria": 10,
    "escala_persistencia": 4,
    "escala_unitario": 6,
    "arredondamento": "HALF_UP",
    "ordem_residuo": "MAIOR_RESTO_ITEM_ID_ASC"
  },
  "cambios": [
    { "moeda": "USD", "taxa": "5.4321000000", "fonte": "DECLARADA_DI", "data": "2026-09-30" }
  ],
  "itens": [
    {
      "id": "item-001",
      "produto_id": "prod-001",
      "moeda": "USD",
      "valor_mercadoria_moeda": "1200.000000",
      "valor_aduaneiro_brl": "6518.520000",
      "quantidade_comercial": "120.000",
      "unidade_comercial": "CX",
      "fator_para_estoque": "12.000000",
      "quantidade_estoque": "1440.000",
      "peso_liquido_kg": "96.000",
      "peso_bruto_kg": "104.000",
      "volume_m3": "0.420"
    }
  ],
  "despesas": [
    {
      "id": "desp-01", "tipo": "FRETE_INTERNACIONAL", "moeda": "USD", "valor": "300.000000",
      "incorporavel": true,
      "atribuicao": { "modo": "RATEIO", "criterio": "PESO_BRUTO",
        "justificativa": "Frete aéreo cobrado por peso bruto no conhecimento" }
    },
    {
      "id": "desp-02", "tipo": "ARMAZENAGEM", "moeda": "BRL", "valor": "180.00",
      "incorporavel": true,
      "atribuicao": { "modo": "DIRETA", "item_id": "item-001",
        "justificativa": "Armazenagem exclusiva deste item, conforme recibo" }
    }
  ],
  "descontos": [
    { "id": "desc-01", "escopo": "PROCESSO", "moeda": "USD", "valor": "50.000000",
      "criterio": "VALOR_ADUANEIRO", "justificativa": "Desconto comercial documentado na invoice" }
  ],
  "tributos": [
    { "id": "trib-01", "tributo_codigo": "CATALOGO_NAO_CLASSIFICADO",
      "status_recuperabilidade": "PENDENTE_VALIDACAO", "valor_apurado_brl": "0.00",
      "item_id": null, "regra": null }
  ]
}
```

**Notas sobre o exemplo**

- `incorporavel: true` significa que **DECISÃO-03 já foi registrada** para frete e armazenagem. Com `"DECISAO_03"`, o motor geraria `DECISAO_INCORPORAVEL_PENDENTE` (fixture 11).
- `valor_aduaneiro_brl` é a base documentada usada pelo rateio `VALOR_ADUANEIRO`. Se estivesse `null`, o desconto ficaria sem base e geraria `VALOR_ADUANEIRO_AUSENTE` (fixture 17).
- `tributo_codigo: CATALOGO_NAO_CLASSIFICADO` é marcador de exemplo. Códigos reais vêm do catálogo de regras (`03-MATRIZ-FISCAL.md`).
- O tributo entra com `status_recuperabilidade` **e** `regra` (snapshot). Com `regra: null` e status pendente, o motor não tenta classificar.

### 2.1 Validações de entrada (erros que impedem o cálculo)

| Campo | Regra | Código |
|---|---|---|
| `schema_version` | `"1"` | `LANDED_SCHEMA_VERSAO` |
| `processo.moeda_base` | `"BRL"` | `LANDED_MOEDA_BASE` |
| Qualquer decimal | Formato `-?\d+(\.\d+)?` | `LANDED_DECIMAL_FORMATO` |
| Qualquer decimal | Casas ≤ escala do campo (dinheiro 6, taxa 10, quantidade 3, fator 6, imposto 2) | `LANDED_DECIMAL_ESCALA_EXCEDIDA` |
| Campo obrigatório | Não nulo | `LANDED_DADO_AUSENTE` |
| `cambios[].taxa` | > 0 | `LANDED_CAMBIO_INVALIDO` |
| Moeda de item ou despesa | Existe em `cambios` ou é `BRL` | `LANDED_CAMBIO_AUSENTE` |
| `valor_mercadoria_moeda` | ≥ 0 | `LANDED_VALOR_NEGATIVO` |
| `quantidade_comercial` | > 0 | `LANDED_QTD_INVALIDA` |
| `fator_para_estoque` | > 0 | `LANDED_FATOR_INVALIDO` |
| `quantidade_estoque` | Igual a `comercial × fator` exatamente | `LANDED_QTD_FATOR_INCONSISTENTE` |
| `atribuicao.criterio` | Um dos 5 critérios | `LANDED_CRITERIO_INVALIDO` |
| `atribuicao.item_id` ou `descontos[].item_id` | Item existe | `LANDED_ITEM_INEXISTENTE` |
| `justificativa` | ≥ 10 caracteres sem contar espaços nas extremidades | `LANDED_JUSTIFICATIVA_AUSENTE` |
| Base do rateio por peso ou volume | Presente em todos os itens | `LANDED_DADO_AUSENTE` |
| Soma da base do critério | > 0 | `LANDED_RATEIO_BASE_ZERO` |
| Tributo incorporado | Tem `item_id` | `LANDED_TRIBUTO_ALOCACAO_AUSENTE` |
| Saída de custo de item | ≥ 0 | `LANDED_CUSTO_NEGATIVO` |
| Invariante de conservação | Diferença zero | `LANDED_CONSERVACAO_FALHOU` |

**Não bloqueia com erro, bloqueia com divergência:** `DECISAO_03` pendente, tributo `PENDENTE_VALIDACAO`, base de rateio `VALOR_ADUANEIRO` ausente. Ver §5.

---

## 3. Saída do motor: `LandedCostOutput`

Saída do fixture `15-exemplo-doc-02` (`expected.json`). O campo `input_hash` é acrescentado pelo adapter e não faz parte do motor puro (`07-MOTOR-CONTRATO-MINIMO.md` §3).

```json
{
  "schema_version": "1",
  "engine_version": "landed-cost-ref/0.1.0",
  "status": "BLOQUEADO",
  "divergencias": [
    { "codigo": "TRIBUTO_PENDENTE", "severidade": "BLOQUEANTE", "referencia": "trib-01",
      "mensagem": "tributo sem status de recuperabilidade validado" }
  ],
  "itens": [
    {
      "item_id": "item-001",
      "produto_id": "prod-001",
      "quantidade_estoque": "1440.000",
      "componentes_brl": {
        "mercadoria": "6518.5200",
        "despesas_incorporadas": "1809.6300",
        "tributos_nao_recuperaveis": "0.0000",
        "descontos": "-271.6050"
      },
      "custo_total_brl": "8056.5450",
      "custo_unitario_brl": "5.594823",
      "residuo_unitario_brl": "-0.0001200000",
      "residuo_total_brl": "0.0000000000"
    }
  ],
  "rateios": [
    { "origem_id": "desp-01", "componente": "despesas", "criterio": "PESO_BRUTO",
      "base_total": "104.000", "item_id": "item-001", "base_item": "104.000",
      "valor_alocado_brl": "1629.6300000000",
      "justificativa": "Frete aéreo cobrado por peso bruto no conhecimento" },
    { "origem_id": "desc-01", "componente": "descontos", "criterio": "VALOR_ADUANEIRO",
      "base_total": "6518.5200000000", "item_id": "item-001", "base_item": "6518.5200000000",
      "valor_alocado_brl": "-271.6050000000",
      "justificativa": "Desconto comercial documentado na invoice" }
  ],
  "despesas_nao_incorporadas": [],
  "conservacao": {
    "entradas_brl": "8328.1500",
    "descontos_brl": "271.6050",
    "saidas_brl": "8056.5450",
    "diferenca_brl": "0.0000000000",
    "ok": true
  }
}
```

### 3.1 Conferência à mão

| Número | Cálculo | Resultado |
|---|---|---|
| Mercadoria | 1200 USD × 5,4321 | 6518,52 BRL |
| Frete | 300 USD × 5,4321 = 1629,63, rateado por peso bruto (um item) | 1629,63 |
| Armazenagem | direta | 180,00 |
| Desconto | 50 USD × 5,4321 = 271,605, com valor aduaneiro como base (um item) | −271,605 |
| Custo total | 6518,52 + 1629,63 + 180 − 271,605 | **8056,545** |
| Unitário | 8056,545 ÷ 1440 = 5,594822916… | **5,594823** (escala 6) |
| Resíduo unitário | 8056,545 − 5,594823 × 1440 = 8056,545 − 8056,54512 | **−0,00012** |
| Conservação | 8328,15 − 271,605 = 8056,545 | diferença 0 |

**Leitura do resíduo unitário:** o unitário arredondado multiplicado pela quantidade não volta exatamente ao total. A diferença é gravada em `residuo_unitario_brl` (escala 10 na saída: `-0.0001200000`). Não é descartada nem absorvida no último item.

### 3.2 Regras da saída

- `status ∈ {OK, BLOQUEADO}`. Erro de validação não gera saída; retorna `ok: false` com código de §2.1.
- `BLOQUEADO` ocorre com qualquer divergência `BLOQUEANTE`. Mesmo bloqueado, o motor calcula os números disponíveis, para revisão.
- Saída é determinística: mesma entrada gera mesma saída, inclusive `rateios` e resíduos.

---

## 4. Contrato de tributo: `TributoLancamento` (persistência)

Campos exigidos pela Etapa D da missão. Este é o contrato **persistido**. O motor recebe apenas um subconjunto (status, regra e valor apurado). Cada tributo é um registro, nunca uma coluna fixa.

| Campo | Tipo | Obrigatório | Descrição | Regra |
|---|---|---|---|---|
| `id` | uuid | Sim | Identidade | Imutável |
| `processo_id` | uuid | Sim | Processo | FK |
| `tributo_codigo` | texto | Sim | Código no catálogo de regras | Deve existir em `tributo_catalogo` |
| `fundamento` | texto | Sim | Referência normativa usada na classificação | Texto validado pela contabilidade; não inventado pelo sistema |
| `documento_origem_id` | uuid | Sim, se houver documento | DI/DUIMP, guia, recibo | FK para `DocumentoImportacao` |
| `item_id` | texto | Não | Item afetado | Nulo = processo inteiro |
| `valor_apurado_brl` | decimal | Sim | Valor do documento de origem | ≥ 0, escala 2 |
| `valor_recolhido_brl` | decimal | Não | Valor efetivamente pago | ≥ 0; pode diferir do apurado |
| `empresa_titular_cnpj` | texto (14) | Sim | Empresa que recolhe e pode recuperar | CNPJ validado |
| `status_recuperabilidade` | enum | Sim | Ver `03-MATRIZ-FISCAL.md` §3 | Sem default |
| `credito_potencial_brl` | decimal | Sim | Crédito ainda não aprovado | ≥ 0 |
| `credito_reconhecido_brl` | decimal | Sim | Crédito aprovado | ≥ 0; só com `validado_por` |
| `regra_id` | uuid | Sim | Regra aplicada | FK para `tributo_regra` |
| `regra_vigencia_inicio` | data | Sim | Vigência da regra | Cópia no lançamento |
| `regra_vigencia_fim` | data | Não | Fim de vigência | Nulo = em vigor |
| `validado_por` | uuid | Só se `RECONHECIDO` | Responsável pela validação | FK para `usuarios` |
| `validado_em` | timestamptz | Só se validado | Momento | — |
| `supersede_de` | uuid | Não | Lançamento corrigido | Append-only |
| `criado_por`, `criado_em` | — | Sim | Autoria | — |

**Regras de integridade**

- `valor_recolhido_brl ≠ valor_apurado_brl` gera `TRIBUTO_RECOLHIMENTO_DIVERGENTE` (aviso).
- `credito_reconhecido_brl > 0` sem `validado_por` é rejeitado.
- `regra_vigencia_inicio` posterior à data do documento de origem gera `TRIBUTO_REGRA_FORA_VIGENCIA` (bloqueante). **Pendência P-01:** o snapshot do motor ainda não carrega vigência.
- Retificação: novo registro com `supersede_de`. Nunca `UPDATE`.

---

## 5. Códigos de divergência

Divergências **não** interrompem o cálculo. Geram `status: BLOQUEADO` (ou `OK` se só avisos).

| Código | Severidade | Quando | Fixture |
|---|---|---|---|
| `DECISAO_INCORPORAVEL_PENDENTE` | BLOQUEANTE | Despesa com `incorporavel = "DECISAO_03"`; fica fora do custo | 11 |
| `TRIBUTO_PENDENTE` | BLOQUEANTE | Lançamento com `PENDENTE_VALIDACAO` | 12, 15 |
| `VALOR_ADUANEIRO_AUSENTE` | BLOQUEANTE | Rateio por `VALOR_ADUANEIRO` com item sem base; a despesa fica fora do custo | 17 |
| `NFE_TOTAL_NAO_CONCILIADO` | BLOQUEANTE | `Σ duplicatas` ≠ valor econômico da NF-e, fora da tolerância (DECISÃO-05). Não é do motor; é da guarda de integração | — |
| `NFE_CUSTO_DIVERGE_LANDED` | AVISO | Custo landed difere do custo da nota (esperado, registrado) | — |
| `QTD_NFE_DIVERGE_RECEBIDA` | AVISO | Quantidade da NF-e ≠ recebida | — |
| `DESPESA_DUPLICADA_SUSPEITA` | AVISO | Mesma despesa em dois documentos | — |
| `TRIBUTO_RECOLHIMENTO_DIVERGENTE` | AVISO | Apurado ≠ recolhido | — |
| `TRIBUTO_REGRA_FORA_VIGENCIA` | BLOQUEANTE | Regra não vigente na data do documento | — (P-01) |
| `PRODUTO_NAO_VINCULADO` | BLOQUEANTE | Item sem `produto_id` na publicação | — |
| `ESTOQUE_NAO_RECEBIDO` | AVISO | Quantidade de estoque sem entrada registrada | — |

---

## 6. Assinaturas propostas das RPCs (não implementadas)

Padrões: `SECURITY DEFINER`, `SET search_path = public`, `REVOKE ALL FROM PUBLIC, anon`, `GRANT EXECUTE TO authenticated, service_role`. Idempotência por `p_idempotency_key` com `payload_hash`, como em `criar_confirmar_remessa_entrada`. Autorização por perfil e loja, depois `fp_pode_loja` (ESPEC §6). Para qualquer RPC do módulo, **também** checar o contrato do módulo (DECISÃO-14).

| RPC proposta | Parâmetros | Retorno | Papel | Idempotente |
|---|---|---|---|---|
| `import_criar_processo` | `p_loja_id`, `p_referencia`, `p_idempotency_key` | `uuid` | DONO, GERENTE da loja | Sim |
| `import_registrar_documento` | `p_processo_id`, `p_tipo`, `p_id_externo`, `p_hash_arquivo`, `p_payload`, `p_idempotency_key` | `uuid` | DONO, GERENTE | Sim (hash) |
| `import_registrar_despesa` | `p_processo_id`, `p_tipo`, `p_moeda`, `p_valor`, `p_documento_id`, `p_idempotency_key` | `uuid` | DONO, GERENTE | Sim |
| `import_definir_rateio` | `p_despesa_id`, `p_criterio`, `p_justificativa` | `void` | DONO, GERENTE | Sim (nova versão) |
| `import_registrar_tributo` | `p_processo_id`, `p_payload_tributo`, `p_idempotency_key` | `uuid` | DONO, GERENTE | Sim |
| `import_validar_tributo` | `p_tributo_id`, `p_status`, `p_fundamento` | `void` | Validador (DECISÃO-03) | Sim |
| `import_calcular_custo` | `p_processo_id`, `p_idempotency_key` | `jsonb` (`versao`, `status`, `input_hash`) | DONO, GERENTE | Sim (`input_hash`) |
| `import_publicar_custo` | `p_versao_id` | `jsonb` | DONO | Sim |
| `import_retificar_processo` | `p_processo_id`, `p_motivo` | `uuid` (nova versão) | DONO | Sim |

**Regras comuns**

- Nenhuma RPC aceita `loja_id` ou `empresa_id` como autorização. O parâmetro seleciona; a checagem decide.
- `payload_hash` diferente para a mesma chave ⇒ `IMPORT_IDEMPOTENCY_PAYLOAD_DIVERGENTE`.
- Toda escrita ocorre em transação com `FOR UPDATE` no processo.

---

## 7. Contratos de leitura das integrações

| Porta | Campos consumidos | Fonte real (hoje) | Observação |
|---|---|---|---|
| `NfeEntradaReader.itens` | `id`, `produto_id`, `quantidade_nfe`, `quantidade_conferida`, `custo_unitario`, `atualizar_custo`, `status_conferencia` | `importacoes_nfe_itens` (`296`) | `custo_unitario` tem escala 2 (A-06) |
| `NfeEntradaReader.duplicatas` | `numero_duplicata`, `data_vencimento`, `valor` | `importacoes_nfe_duplicatas` (`296:151-161`) | — |
| `NfeEntradaReader.cabecalho` | `chave_acesso`, `numero_nf`, `fornecedor_id`, `status`, `ordem_compra_id` | `importacoes_nfe` (`075`, `296`, `20260918`) | Sem total da nota (A-11) |
| `EntradaEstoqueReader.recebimentos_oc` | `ordem_id`, `ordem_item_id`, `origem`, `entrada_id`, `importacao_nfe_id`, `remessa_id`, `quantidade`, `movimento_estoque_id` | `ordens_compra_recebimentos` (`20260918:107-131`) | Vínculo estruturado |
| `EntradaEstoqueReader.kardex` | `id`, `produto_id`, `tipo_codigo`, `quantidade_delta`, `remessa_id`, `observacao`, `created_at` | `movimentos_estoque_log` (`034:47-57`) | Sem custo nem FK para NF-e (A-09) |
| `ObrigacaoReader.titulos` | `id`, `nfe_importacao_id`, `fornecedor_id`, `valor_total`, `vencimento`, `status` | `contas_pagar` (`108`) | `status` em maiúsculas |
| `ProdutoCatalogReader.produto` | `id`, `unidade_medida`, `ncm`, `loja_id`, `status_publicacao` | `produtos` | `preco_custo` **não** é lido direto: usar a view `produtos_custos` com papel de custo (N1) |

---

## 8. Versionamento de contrato

- `schema_version` muda quando um campo obrigatório é adicionado ou um significado muda.
- `engine_version` (`landed-cost/MAJOR.MINOR.PATCH`) muda quando o cálculo muda para a mesma entrada. Mudança exige: teste de regressão com saída antiga salva, explicação da diferença e atualização dos `expected.json` afetados.
- Contrato TypeScript: `shared-core/src/import/types.ts` (a implementar). Referência humana: `07-MOTOR-CONTRATO-MINIMO.md` §3.
