# Sprint P0 — Prontidão Focus NFe (fechamento)

**Data:** 2026-10-03
**Branch:** `feat/fiscal-p0-focus-xml`
**Escopo:** código, testes, documentação e gates. Nada aplicado em produção, nenhum cron habilitado, nenhuma NFC-e real enviada, nenhum deploy.

## 1. Contrato Focus confirmado

Fonte: resposta oficial da Focus recebida pelo cliente em 2026-10-03. Nada além disso foi assumido.

| # | Contrato | Onde está no código |
|---|---|---|
| 1 | Emissão NFC-e devolve `caminho_xml_nota_fiscal`, `caminho_danfe` e `qrcode_url` | `extractFocusArtefatos` → colunas `focus_xml_path`, `focus_danfe_path`, `focus_qrcode_url` |
| 2–4 | Links sem expiração e sem autenticação; XML e DANFCe disponíveis por 5 anos | `baixarXmlFocus`: GET **sem** `Authorization` |
| 5 | Cancelamento devolve `caminho_xml_cancelamento` (com `status = cancelado` e `numero_protocolo`) | `classifyByFocusStatus` → `focus_xml_cancelamento_path`, `cancelamento_protocolo` |
| 6 | PIX na NFC-e: 17 estático, 20 dinâmico, 23 automático | `PIX_MODALIDADE_FOCUS` (`fiscal_focus_dto.ts`) |
| 7 | `natureza_operacao` é obrigatória e não tem default | Lida do snapshot; ausente, bloqueia antes do POST |
| 8 | Contingência offline automática via `habilita_contingencia_offline_nfce = true` | Configuração da empresa na Focus; nada no código (ver §6) |
| 9 | Webhooks via `/v2/hooks` | Não implementado nesta sprint (ver §5) |
| 10 | Limite de 100 requisições/minuto por token | Já tratado: 429 é erro transitório com backoff; ver §6 |
| 11 | Produção exige token de produção, certificado A1, CSC/ID token de produção e `habilita_nfce = true` | Checklist de homologação (§6) |

> Correção de premissa: os documentos da Fase B / Gate C2.5 registravam `natureza_operacao` como "omitível, a Focus aplica padrão". Isso estava errado. O campo saiu de `OMITTED_BY_DESIGN`.

## 2. Matriz P0

| Item | Estado | Evidência | Falta |
|---|---|---|---|
| P0.1 DTO | **BLOCKED** | `natureza_operacao` obrigatória e PIX 17/20/23 implementados; total dos pagamentos conferido com `totais.liquido`. Testes: `fiscal_focus_dto.test.ts` (9, 9b, 6–6c, 8–8c, CSOSN) e `fiscal_focus_p0.test.ts` (EMISSÃO) | Três pendências, nenhuma de código: (1) nomes dos campos de tributação ICMS CST/CSOSN/PIS/COFINS, que ainda não foram confirmados — continua gap bloqueante por item; (2) o domínio não tem fonte para `natureza_operacao`; (3) o domínio não registra a modalidade PIX (`vendas_pagamentos` só aceita `PIX`) |
| P0.2 Classificação | **DONE** | O `status` do corpo é a fonte (`classifyByFocusStatus`); status desconhecido vira erro transitório; `autorizado` sem chave nunca vira EMITIDO | Confirmar o JSON real em homologação |
| P0.3 Cancelado | **DONE** | `cancelado` nunca vira `autorizado`; fluxo de cancelamento com lease; `CANCELADO→EMITIDO` recusado pelo trigger; XML de cancelamento separado. Testes: SQL T3–T5, Deno CANCELAMENTO, cadeia [C] | Falta tela/ação de gerente que dispare `mode: "cancelar"` |
| P0.4 Reaper/worker | **DONE (cron desligado)** | `fiscal_reaper_documentos` recupera `EM_PROCESSAMENTO` antigo (SQL T6); cadeia claim → consulta → emissão → XML → Storage → auditoria provada em banco real (cadeia [A]–[D]) | Habilitar o cron só depois da homologação real |
| P0.5 XML | **DONE** | Referência persistida; GET sem autenticação; validação de HTTP e de XML bem formado; SHA-256; Storage create-only com leitura de confirmação; `XML_ARMAZENADO`; idempotente. Testes: Deno XML (11), SQL T1/T2/T4, cadeia [B] | Storage real não foi re-executado nesta sprint (na cadeia, o Storage está em memória; o Storage real já tinha sido provado em `test-fiscal-xml-concorrencia.ts`) |
| P0.6 already_processed | **DONE** | Consulta a **mesma** referência e aplica o estado remoto; consulta inconclusiva vira erro transitório e passa pelo retry seguro. Nunca usa outra referência. Testes: Deno ORQUESTRAÇÃO e cadeia [D] | Ver nota abaixo |

Nota sobre P0.6:
- **[FATO]** O termo `already_processed` foi informado pelo cliente.
- **[INFERÊNCIA]** O código o detecta no campo `codigo` do corpo de erro (mesmo formato `codigo`/`mensagem` já usado nas respostas de erro da Focus).
- **Pendente:** confirmar em homologação.

## 3. Fluxos implementados

**Emissão**

```
claim → identidade congelada → retry seguro (consulta antes de qualquer re-POST)
      → POST /v2/nfce?ref=<ref> (gap bloqueante = zero POST)
      → status Focus → already_processed? consulta a mesma ref
      → autorizado:              fiscal_marcar_emitido_focus (EMITIDO + referências, 1 transação)
      → processando_autorizacao: nada (continua EM_PROCESSAMENTO; reaper/consulta resolvem)
      → erro_autorizacao:        ERRO normalizado
      → cancelado:               fiscal_marcar_cancelado
      → denegado:                ERRO não-retryable FOCUS_DENEGADO
```

**XML da autorização**

```
fiscal_claim_documentos_xml (EMITIDO ou CANCELADO; devolve focus_xml_path)
  → GET no caminho devolvido pela Focus, sem Authorization
  → HTTP 2xx + XML bem formado → SHA-256
  → upload create-only no bucket privado → leitura de confirmação (hash)
  → fiscal_marcar_xml_armazenado → evento XML_ARMAZENADO
```

- Sem referência persistida: consulta a mesma referência (GET) e grava a referência original (`fiscal_registrar_referencias_focus`) antes de armazenar.
- Resolução do caminho:
  - URL absoluta `https://` é usada como veio.
  - Caminho relativo começando com `/` usa a origem do mesmo ambiente Focus, sem acrescentar `/v2`.
  - Qualquer outra forma é recusada.

**Cancelamento** (`POST fiscal-worker {mode:"cancelar", documento_id, justificativa}`)

```
identidade congelada = atual → fiscal_iniciar_cancelamento (lease; JA_CANCELADO / EM_ANDAMENTO)
  → já houve tentativa? consulta a mesma ref antes (cancelado → confirma sem novo DELETE)
  → DELETE /v2/nfce/<ref> {justificativa 15–255}
  → status=cancelado → fiscal_marcar_cancelado (CANCELADO, protocolo, caminho)
  → qualquer outra resposta → fiscal_marcar_cancelamento_erro (continua EMITIDO)
```

- O XML de cancelamento tem fila, colunas `xml_cancelamento_*`, RPCs e path próprios (`<id>-cancelamento.xml`).
- O XML da autorização nunca é sobrescrito.

**Fora do escopo:** anulação de NF-e modelo 55 fora do prazo de cancelamento. Não implementado.

## 4. Banco (migration `20261003120000`, não aplicada em nenhum ambiente remoto)

- Colunas:
  - referências Focus (imutáveis após gravadas);
  - pedido e resultado do cancelamento;
  - fila do XML de cancelamento.
- Trigger de estado:
  - corpo anterior intacto;
  - guardas novas de imutabilidade e de transição do XML de cancelamento.
- RPCs novas, todas só `service_role`:
  - `fiscal_marcar_emitido_focus`
  - `fiscal_registrar_referencias_focus`
  - `fiscal_iniciar_cancelamento`
  - `fiscal_marcar_cancelado`
  - `fiscal_marcar_cancelamento_erro`
  - `fiscal_claim_documentos_xml_cancelamento`
  - `fiscal_marcar_xml_cancelamento_{armazenado,bloqueado,erro}`
- A fila do XML de autorização passa a aceitar documentos `CANCELADO`.
- Rollback: `backend/supabase/rollback/20261003120000_…rollback.sql`, testado localmente (rollback e reaplicação).
- Dependência: depende das 26 migrations fiscais/caixa ainda pendentes em produção. Aplicar só depois delas, com autorização.

## 5. Webhook (revisão de arquitetura, não implementado)

- **[FATO]** A Focus oferece webhooks via `/v2/hooks`. Payload e assinatura não fazem parte do contrato recebido.
- **[INFERÊNCIA]** O desenho atual permite adicionar o webhook sem substituir worker nem reaper. O handler só precisaria:
  1. receber a referência;
  2. chamar `consultarDocumento` (fonte de verdade);
  3. aplicar o estado com `applyFocusRemoteState`, que já trata `autorizado`/`cancelado`/`denegado`, é idempotente e é protegido pelo trigger de estado.
- Worker e reaper continuam como fallback de confiabilidade.

## 6. Requisitos para homologação e produção (não verificados por código)

| Item | Responsável |
|---|---|
| Token de homologação e de produção cadastrados como secret (`fiscal_provider_config.token_env_var`) | Operacional |
| Certificado A1 válido, CSC/ID token de produção, `habilita_nfce = true` na empresa Focus | Operacional |
| `habilita_contingencia_offline_nfce = true`, se a loja quiser contingência automática (configuração na Focus) | Decisão operacional |
| Nomes dos campos de tributação ICMS CST/CSOSN/PIS/COFINS | Documentação Focus |
| Fonte de `natureza_operacao` no domínio (ex.: por loja), congelada no snapshot | Decisão de produto/fiscal |
| Modalidade PIX usada pela loja (17/20/23), registrada no domínio e congelada no snapshot como `pagamentos[].pix_modalidade` | Decisão operacional |
| Volume dentro de 100 req/min/token (o worker processa até 100 documentos por chamada) | Operação do cron, quando for habilitado |

**[FATO]** Testes verdes não significam que a produção está pronta: a emissão real continua bloqueada pelo P0.1.

## 7. Gates executados

| Gate | Resultado |
|---|---|
| `deno check` fiscal-worker (`index.ts`) | PASS |
| `deno test` fiscal-worker | **160/160 PASS** (121 antigos ajustados + 39 novos). Localmente, `deno.land` está bloqueado pelo proxy, então rodou com o import map mapeando `std/assert` para `jsr:@std/assert` |
| `backend/scripts/fiscal-focus-p0.test.sql` (Postgres 17 local, todas as migrations) | **PASS** (52 asserções) |
| Rollback + reaplicação da migration | PASS |
| `backend/scripts/test-fiscal-focus-p0-cadeia.ts` (banco local real) | **26/26 PASS** |
| `tsc --noEmit` pdv-importados (`database.types.ts` regenerado, só adições) | PASS |
| CI: passos novos `Fiscal — Focus P0` (SQL) e `Test Edge Functions (fiscal-worker)` | Adicionados ao `ci-backend-supabase.yml` |
