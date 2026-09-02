# Auditoria de Prontidão — Integração Focus NFe (Fase A: Inventário — Fechamento)

**Data:** 2026-09-02
**Branch:** `claude/jinlong-focus-nfe-readiness-d5524b`
**Status:** Fase A fechada. Nenhum código foi alterado. Aguardando aprovação para Fase B/C.

Este documento substitui o rascunho inicial da Fase A por uma versão com prova direta (leitura completa de arquivos, rastreamento de caminhos de chamada ponta a ponta, e verificação estática rigorosa) em vez de relato agregado de subagentes. Onde uma verificação exigiria acesso a um banco de produção real ou à internet e isso não foi possível nesta sessão, isso é declarado explicitamente como limitação — nenhuma conclusão foi apresentada como comprovada sem a evidência que a sustenta.

**Limitações desta sessão (declaradas):**
- MCP do Supabase (projeto real) e MCP "Neon" falharam ao conectar (timeout / certificado). Nenhuma leitura foi feita contra um banco vivo. Toda conclusão sobre schema/RLS vem de leitura estática das migrations em `backend/supabase/migrations/` (confirmado como caminho canônico — `supabase/` na raiz está vazio).
- `WebFetch` e `WebSearch` retornaram erro de infraestrutura ("issue with the selected model") em todas as tentativas. Não foi possível consultar `doc.focusnfe.com.br` diretamente nesta sessão. Onde a missão já forneceu fatos externos confirmados com a Focus, eles são tratados como dados de entrada do usuário, não como algo que esta auditoria verificou de forma independente — isso é marcado explicitamente item a item.

---

## 0. Decisão D0-09 — contexto histórico, não bloqueio desta missão

Em 2026-08-27 (`docs/piloto-d0/DEFINICAO_FUNCIONAL_D0.md`, decisão D0-09), o projeto decidiu manter a emissão fiscal real fora do piloto vigente ("stub honesto"), com `EXT-D0-001` (Focus real) classificado P3/bloqueado até contratação comercial, certificado A1 e homologação SEFAZ/Focus. Conforme instrução do usuário, isso é registrado como **contexto histórico de produto**, não como bloqueio arquitetural desta auditoria. A missão atual é preparar a arquitetura para homologação — sem emitir nota real, sem certificado real, sem alterar produção, sem aplicar migration em produção.

Também se reconfirma (evidência: `044_usuario_perfil_admin_rls.sql:5-7`, `001_schema_inicial.sql:13-20`, e busca exaustiva por `usuario_roles` = 0 ocorrências em todo o repositório) que **nunca existiu tabela `usuario_roles`** — o controle de papel é a coluna `usuarios.perfil IN ('OPERADOR','GERENTE','DONO','ADMIN')`. Uma memória de projeto anterior que atribuía isso à migration 102 está incorreta (102 trata de índice único de código de produto por loja).

---

## 1. Matriz de inventário

Legenda de PRIORIDADE PROVISÓRIA: P0 (bloqueador de 1ª emissão segura em homologação) / P1 (bloqueador de produção) / P2 (hardening) / — (não aplicável, já adequado).

### 1.1 Separação Venda × DocumentoFiscal

| Item | Status | Evidência | Gap | Risco | Prioridade |
|---|---|---|---|---|---|
| Enum de status de `vendas` | READY | `vendas.status CHECK IN ('CONCLUIDA','CANCELADA')`, `001_schema_inicial.sql:253`; reafirmado em todas as 33 versões subsequentes da RPC de finalização, última em `20260902100000_finalizar_venda_retry_payload_divergente.sql:300,490` | — | — | — |
| Status fiscal isolado em tabela própria | READY | `documentos_fiscais_pendentes.status` (`PENDENTE\|EM_PROCESSAMENTO\|EMITIDO\|ERRO\|CANCELADO`), FK `venda_id`, sem coluna de status fiscal em `vendas` | — | — | — |
| Separação mantida em TODOS os caminhos reais (não só schema) | READY | Rastreados os 3 caminhos que escrevem em `documentos_fiscais_pendentes`: (a) insert inline na RPC de venda (`20260902100000...sql:475-483`, dentro de `BEGIN...EXCEPTION WHEN OTHERS THEN RAISE WARNING` — falha de enqueue **nunca** aborta a venda); (b) RPC `fiscal_enfileirar_documento_venda` chamada pelo Edge Function `sync-outbox` (`fiscal_enqueue_after_venda_sync.ts:97-112`, erro só vira `log warn`, não falha o batch); (c) mesma RPC chamada por `caixaFiscalEnqueueServer.ts` (código morto — ver §1.3). Nenhum dos 3 caminhos bloqueia ou reverte a venda em caso de falha fiscal | — | — | — |

### 1.2 `FiscalProvider` / `FocusProvider` — contrato exato

| Item | Status | Evidência | Gap | Risco | Prioridade |
|---|---|---|---|---|---|
| Interface do port | READY | `fiscal-provider-adapter.ts:74-76`: `interface FiscalProvider { callProvider(doc: FiscalDoc, config: ProviderConfig): Promise<ProviderResult> }` — contrato mínimo, uma função | — | — | — |
| `MockProvider` | READY (mock intencional) | linhas 79-92: gera `chave_fiscal` = `NFE-MOCK-{venda_id8}-{hex4}`, `protocolo` = `PROTO-{hex6}` | — | — | — |
| `HttpProvider` genérico | READY | linhas 95-193: Bearer token, timeout via `AbortController`, espera `{chave_fiscal, protocolo}` no corpo | — | — | — |
| `FocusProvider` | READY (transporte) / MISSING (payload de negócio) | linhas 200-306: Basic Auth (`token:` base64, linha 227), monta URL com `{ref}` ou `?ref=`, extrai chave/protocolo tolerando `nfe`/`nfce` aninhados (linhas 16-58, 9 nomes de campo possíveis), classifica HTTP transitório (5xx/408/429/425/503/504) | Corpo enviado (linhas 229-236) é `{ref, documento_id, venda_id, tipo_doc, correlation_id, payload}` — o próprio comentário do código (linha 198) admite: "envelope FastProduct até mapearmos o DTO Focus". Não é o schema de itens/impostos (`items[].ncm/cfop/icms...`) que uma API de emissão fiscal real exige | Mesmo com payload de venda corrigido, o adapter não traduz para o formato que a Focus espera — sem isso, qualquer chamada real seria rejeitada por payload inválido, não por falta de transporte | P0 |
| Modelo síncrono | CONFLICT (achado) | Adapter faz `POST` e espera `{chave,protocolo}` na mesma resposta (linhas 222-267) | A missão declara (contexto confirmado pelo usuário) que a Focus opera com referência/consulta — modelo tipicamente assíncrono para autorização SEFAZ. O adapter atual não tem segundo passo de consulta | Timeout/erro falso-negativo se a Focus não autorizar no mesmo request/response | P0 |
| `BlingProvider` | fora de escopo | placeholder, delega a `HttpProvider`, `// TODO` explícito (linha 311) | — | — | — |

### 1.3 Rastreamento ponta a ponta — `payload = NULL` (P0 mais crítico)

Existem **dois caminhos reais que inserem em `documentos_fiscais_pendentes`**, não um. Um terceiro está confirmado morto.

| Caminho | Status | Evidência | Payload contém dados fiscais do item? |
|---|---|---|---|
| (a) Inline na RPC de venda web | READY (existe e é testado) / MISSING (payload) | `caixaVendas.impl.ts:305`: `p_fiscal_auto_enqueue: runtimeCfg.autoEnqueueFiscalOnSale` (flag `AUTO_ENQUEUE_FISCAL_ON_SALE`, default `false` em `caixaSalesRuntimeConfig.ts:21`) → RPC `finalizar_venda_transacional_canonica_v4` → dispara o insert em `20260902100000...sql:475-483`: `INSERT INTO documentos_fiscais_pendentes (venda_id, tipo_doc, status) VALUES (..., 'NFC_E_STUB', 'PENDENTE')` — **sem coluna `payload`**, fica `NULL` (default da tabela) | **Não.** Nenhum campo de item/NCM/CFOP |
| (b) `fiscal_enfileirar_documento_venda` via `sync-outbox` (desktop/pdv-local) | READY (existe, real, gated) | `fiscal_enqueue_after_venda_sync.ts:71-102`, ativo só com `AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE=true` (default off) → monta `fiscalPayload` com `itens[].{produto_id, quantidade, preco_original, preco_unitario, desconto_unitario, tipo_preco}` → `supabase.rpc('fiscal_enfileirar_documento_venda', {p_venda_id, p_tipo_doc, p_payload: fiscalPayload, p_loja_id})` | **Não.** Tem itens (produto/qtd/preço) mas nenhum campo tributário (NCM/CFOP/CSOSN/CEST/CST) |
| (c) `enfileirarDocumentoFiscalPosVenda` (`caixaFiscalEnqueueServer.ts`) | **MISSING — código morto confirmado** | Definida em `caixaFiscalEnqueueServer.ts:19-84` (payload rico, com itens+totais+pagamentos), re-exportada em `caixaActionsInternals.ts:10`. Busca exaustiva por `enfileirarDocumentoFiscalPosVenda(` (sintaxe de chamada) em todo `.ts/.tsx` do repo = **0 ocorrências** fora da própria definição/re-export. As únicas outras menções estão em `VENDA_CONSISTENCY_ANALYSIS.md` e `IMPLEMENTACAO_CONSISTENCIA_VENDAS.md` (documentos de análise, não código executado) | N/A — nunca executa |

**Cobertura de teste do caminho (a):** `vendaConsistency.integration.test.ts:79,174-180` chama a RPC real (`SUPABASE_SERVICE_ROLE_KEY` presente em CI — `ci-pdv-importados.yml:295,319,521,557`) com `p_fiscal_auto_enqueue: true` e afirma que a linha em `documentos_fiscais_pendentes` é criada com `status: 'PENDENTE'`. **Não afirma nada sobre o conteúdo do `payload`** — por isso o gap não é pego por CI.

**Menor correção possível (não implementada nesta fase):** o caminho (c) já resolve o problema de payload rico para o fluxo web — tem tratamento de erro correto, monta itens/totais/pagamentos, e chama a RPC certa (4 args, compatível com a assinatura vigente pós-`fase1b`). A correção de menor superfície é **conectar essa função já existente ao call-site real** em `caixaVendas.impl.ts` (ou substituir o insert inline por uma chamada equivalente dentro da própria transação SQL), em vez de escrever lógica nova. Para os campos fiscais do item (NCM/CFOP/CSOSN/CEST/CST/CST-PIS/CST-COFINS), nenhum dos dois caminhos os inclui hoje — precisam ser adicionados à montagem do payload (web) e à função de sync (`fiscal_enqueue_after_venda_sync.ts`), buscando-os do cadastro do produto no momento da venda.

**Prioridade: P0.**

### 1.4 Snapshot fiscal — o que já pode ser congelado, o que falta

| Dado | Onde já é congelado hoje | Evidência |
|---|---|---|
| Preço unitário original/final, desconto, tipo de preço, custo snapshot | `itens_venda` (colunas `preco_unitario_original, preco_unitario, desconto_unitario, custo_unitario_snap`), gravadas linha a linha, validadas no servidor | `20260902100000...sql:169-219,340-348` |
| Forma de pagamento, split, troco | `vendas_pagamentos` | mesma migration, linhas 358-373 |
| Operador, timestamp, empresa (via caixa→loja) | `vendas` (header) | `20260902100000...sql:296-301` |
| **NCM/CFOP/CSOSN/CEST/CST do item vendido** | **Em lugar nenhum** — nenhuma `ALTER TABLE itens_venda` (todas as migrations que tocam `itens_venda` foram revisadas: `235`, `249`, `bl2_promocao...`, `fix_drift...`, `checks_matematicos...`) adiciona coluna fiscal | busca exaustiva confirmada |
| Unidade de medida do item | **Não carregada nem no DTO da venda**: `caixaProdutoSql.ts` (`PRODUTO_COLS`) não inclui `unidade_medida` nem colunas fiscais na query que abastece o caixa | referenciado por subagente, não re-lido linha a linha nesta rodada — nível de confiança médio, recomenda-se confirmação direta antes de Fase C |

**Conclusão:** hoje não há nem snapshot fiscal do item, nem busca dinâmica funcional no momento da emissão (porque nenhum dos dois caminhos de enqueue reais popula esses campos). O "risco de produto alterado depois da venda" citado na missão é real mas secundário — o problema imediato é que o dado nunca chega a existir na fila, snapshot ou não. **Prioridade: P0** (parte do mesmo bloqueador de 1.3).

### 1.5 Produto fiscal × Empresa × Operação — onde cada dado pertence

Não presumido — mapeado o que já existe e onde:

| Dado | Pertence hoje a | Evidência | Avaliação |
|---|---|---|---|
| CNPJ, IE, razão social, nome fantasia, CNAE, endereço, séries NF-e/NFC-e | `lojas` (= empresa emissora) | `20260621000500_209_fiscal_campos_loja_pdvconfig.sql:6-23` | Correto — dado de empresa, não de produto nem de operação |
| Regime tributário, CFOP padrão, CST padrão, `auto_enqueue_fiscal` | `pdv_config` (1:1 com `loja_id`) | mesma migration, linhas 61-70 | Correto — é configuração operacional da loja, não do CNPJ em si; separação intencional já existe no modelo (não é bagunça) |
| NCM, CFOP (override), CSOSN, CEST, CST-PIS, CST-COFINS | `produtos` | `20260621000600_210_fiscal_campos_produto.sql:9-15`, comentário linha 4: "alimentam o payload para o Focus NFe" | Correto — são atributos intrínsecos do produto (classificação fiscal), não da operação |
| Código IBGE do município | **Nenhum lugar** | busca exaustiva por `ibge` em `backend/` = 0 ocorrências | Pertenceria a `lojas` (endereço do emitente) — mas não crio a coluna nesta fase; registro apenas como gap comprovado, decisão de criar fica para Fase B |
| Identificador da empresa no Focus (multiempresa) | **Nenhum lugar** | busca exaustiva por `provider_empresa\|focus_empresa\|conta.?guarda.?chuva` = 0 ocorrências | Ver §1.6 — não crio coluna sem confirmar o mecanismo real da Focus |
| CRT numérico (1/2/3) | **Nenhum lugar** — só existe o enum textual `regime_tributario` | — | Seria um mapeamento de código (regra), não necessariamente uma coluna nova — decisão de Fase B |

**Avaliação geral:** o modelo de propriedade dos dados **está correto** (produto = classificação fiscal do item; loja = identidade do emitente; pdv_config = política operacional da loja). Não há evidência de que o cadastro de produto tenha virado "depósito indiscriminado de regras tributárias" — os únicos 6 campos fiscais em `produtos` são exatamente os que dependem do item em si.

### 1.6 Identificação Focus multiempresa — o que é fato confirmado vs. o que não pude verificar

A missão declara como requisito confirmado com a Focus: conta guarda-chuva com múltiplas empresas, cadastráveis manualmente ou via API (`doc.focusnfe.com.br/reference/empresas`), e uso de "referência" para idempotência (`doc.focusnfe.com.br/reference/referencia`). **Isso é tratado aqui como dado de entrada do usuário/negócio, não como algo que esta sessão verificou de forma independente** — `WebFetch` e `WebSearch` falharam por erro de infraestrutura em todas as tentativas (3x), então não consultei a documentação da Focus diretamente.

O que a auditoria do código pode afirmar com evidência:
- Não existe hoje nenhuma coluna que amarre `lojas.id` a um identificador de empresa no lado da Focus — **MISSING, comprovado por busca exaustiva**.
- O `FocusProvider` atual usa um único conceito de `ref` (linha 214-216: `documento_id` ou `venda_id`, nunca `empresa`/`loja`) para toda a URL/idempotência — ele **não tem, hoje, nenhum lugar para colocar um identificador de empresa por requisição**, seja no path, query ou header.

**Não vou propor o nome/formato de uma coluna nova para isso sem confirmar com a documentação real da Focus como esse identificador é efetivamente usado nas chamadas (path? header? nem existe, e a conta guarda-chuva se resolve pelo token?).** Fica registrado como **UNKNOWN quanto ao mecanismo exato**, e **MISSING quanto à existência de qualquer suporte no código atual**, com a ressalva de que a verificação externa não pôde ser feita nesta sessão. Recomendo, antes de decidir a coluna em Fase B, uma nova tentativa de consulta à documentação Focus (esta sessão ou apontada pelo usuário) — ou que o usuário confirme diretamente o mecanismo, já que a missão indica que já houve contato com o fornecedor.

**Prioridade provisória: P0** (é pré-requisito para multiempresa real), mas **a implementação específica não deve ser decidida sem essa confirmação**.

### 1.7 `pdv_config` — RLS de escrita: reproduzido, não hipotetizado

| Verificação pedida | Resultado | Evidência |
|---|---|---|
| RLS atual | Habilitado | `058_pdv_config_rls_e_rpc_caixa_web.sql:28`: `ALTER TABLE public.pdv_config ENABLE ROW LEVEL SECURITY` |
| Policies existentes | **Zero** | Busca de `CREATE POLICY` referenciando `pdv_config` nas 393 migrations = 0 resultados (confirmado 2x, com padrões diferentes) |
| GRANTs de base | Explicitamente revogados de `anon` **e** `authenticated` | `058...sql:30-31`: `REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public.pdv_config FROM anon; ... FROM authenticated;` — nenhuma migration posterior (checadas as 4 migrations com "pdv_config" no nome: `026`, `054`, `067`, `20260618011922_114`) reconcede | Confirmado — nenhuma dessas 4 tem `GRANT`/`POLICY`/`ROW LEVEL SECURITY` |
| Papel usado pelo fluxo de escrita real | `authenticated` via cookie de sessão (**não** `service_role`) | `atualizarConfiguracoesPdvAction` (`app/gerente/configuracoes/actions.ts:131-174`) usa `createClient()` de `lib/supabase/server.ts:5-30`, que é `createServerClient` do `@supabase/ssr` com a chave pública (`assertSupabasePublicEnv()`) — não há client `service_role` em nenhum ponto desse arquivo |
| Caminho real de escrita | `.from('pdv_config').upsert(payload, { onConflict: 'loja_id' })` — chamada direta à tabela, **não** via RPC `SECURITY DEFINER` | `actions.ts:162-165` |
| Existe RPC que contorne a RLS? | **Não** para escrita. A única RPC relacionada (`pdv_config_para_caixa_web`, `20260807000525_313...sql:9-34`) é **somente leitura** (retorna campos não sensíveis) | confirmado por leitura completa da função |
| O formulário realmente falha? | **Não executado contra banco real nesta sessão** (MCP Supabase indisponível) — mas a combinação RLS-sem-policy + REVOKE-explícito-de-authenticated + client-sem-service_role é, por definição do Postgres, uma negação de acesso (RLS sem política = deny-all; e mesmo sem RLS, o GRANT já foi revogado) | limitação declarada |

**Classificação: CONFLICT**, não "possível bug" — a contradição entre o que a UI tenta fazer e o que o banco permite está provada por leitura direta de todas as camadas envolvidas (migration, RLS, client, RPC). O único elo que falta é a execução ao vivo, que não foi possível nesta sessão; a confiança nessa conclusão é alta, não especulativa. **Prioridade: P1** (não é specific da Focus, mas está na mesma tela de configurações fiscais/PDV que este trabalho toca — ver decisão anterior do usuário de incluir isso nesta branch).

### 1.8 Idempotência — identificador real e reutilizável

| Item | Status | Evidência |
|---|---|---|
| Identificador estável usado como referência ao provider | READY | `fiscal-provider-adapter.ts:215`: `const ref = refField === "venda_id" ? doc.venda_id : doc.id` — **o mesmo `documento_id` (chave primária de `documentos_fiscais_pendentes`) é reenviado em toda tentativa/retry**, nunca regenerado. Configurável via `FISCAL_FOCUS_REF_FIELD` |
| Campo que armazena a referência retornada pelo provider | READY | `provider_ref` (`037_fiscal_emissao_real_worker.sql:15`), populado por `fiscal_marcar_emitido` a partir de `result.provider_ref` (`index.ts:84`, `fiscal-provider-adapter.ts:288`: `asString(record.ref) ?? asString(record.referencia) ?? ref`) |
| Constraint de unicidade | READY | Índice único parcial `(venda_id, tipo_doc) WHERE status <> 'CANCELADO'` (`037:39-41`), reafirmado no `ON CONFLICT` de `fiscal_enfileirar_documento_venda` (`fase1b...sql:178`) |
| Proteção de concorrência no claim | READY | `FOR UPDATE SKIP LOCKED` em `fiscal_claim_documentos` (`307...sql:139-161`), com exclusão explícita de documentos já na DLQ (linha 152-154, **provado** pelo bloco `DO $verify$` da própria migration, linhas 310-316: `MIG307_CLAIM_RESSUSCITOU_DOCUMENTO_DA_DLQ`) |
| Proteção contra dupla emissão real pós-crash | **PARTIAL — reavaliado** | O reaper (`307`) resgata documentos presos em `EM_PROCESSAMENTO` e os reenfileira; o worker então chama `callProvider` de novo **com o mesmo `ref`** (é o mesmo `doc.id`, nunca muda). Isso significa que, **do lado do Jinlong, a referência enviada à Focus é sempre a mesma para o mesmo documento** — a proteção contra duplicidade depende inteiramente de a Focus deduplicar corretamente por essa referência, o que é exatamente o mecanismo que a missão descreve como já confirmado com o fornecedor. **Esta não é uma falha comprovada do lado Jinlong** — o código já faz a parte que lhe cabe (referência estável, nunca recriada). O risco residual é 100% do lado do comportamento real da Focus, não verificável nesta sessão |

**Prioridade: P1** (validar em homologação real antes de produção; não é um retrabalho de código necessariamente — pode ser só teste).

### 1.9 Worker fiscal — retry / timeout / DLQ / crash

Mapeado por leitura completa de `index.ts` e `307...sql`:

- Claim: `fiscal_claim_documentos` — `SKIP LOCKED`, exclui DLQ, restrito a `service_role` (`REVOKE ALL ... FROM PUBLIC, anon, authenticated`, `GRANT ... TO service_role`).
- Sucesso: `fiscal_marcar_emitido` grava chave/protocolo/`provider_ref`; se essa RPC falhar (rede caiu entre o `callProvider` OK e o `UPDATE`), o worker tenta `fiscal_marcar_erro` com `transitorio: true` — ou seja, mesmo um sucesso do provider que falhe ao persistir vira um retry, não um erro definitivo (`index.ts:79-114`).
- Erro transitório: `fiscal_marcar_erro` com backoff quadrático (`093_fiscal_marcar_erro_backoff_quadratico.sql`, capado em 3600s, confirmado também na fórmula do reaper: `LEAST(3600, 60 * power(2, LEAST(tentativas,6)))`).
- Erro definitivo: `fiscal_marcar_erro_normalizado`, com categoria/hint/URL de próximo passo.
- Documento preso (worker morto no meio do processamento): `fiscal_reaper_documentos` — reenfileira com backoff se `tentativas < max`, senão move para DLQ e marca `ERRO` não-retryable. **Provado por execução real dentro da própria migration** (`DO $verify$`, `307...sql:259-336`): insere documento de teste, força `EM_PROCESSAMENTO` com timestamp antigo, roda o reaper, confirma DLQ + `ERRO`, confirma que `fiscal_claim_documentos` não ressuscita da DLQ, confirma que `fiscal_reprocessar_documento` limpa a DLQ corretamente.
- Máquina de estados: `tr_documentos_fiscais_estado_bi/bu` (`306...sql:18-75`) bloqueia qualquer transição fora de `PENDENTE→{EM_PROCESSAMENTO,ERRO,CANCELADO}`, `ERRO→{PENDENTE,EM_PROCESSAMENTO,CANCELADO}`, `EM_PROCESSAMENTO→{EMITIDO,ERRO,PENDENTE,CANCELADO}`, `EMITIDO→{CANCELADO}`. **A própria migration verifica, antes de terminar, que os 2 triggers existem em `pg_trigger`** (linhas 89-93) — se não existissem, a migration inteira falharia (é transacional, `BEGIN...COMMIT`). Isso eleva a confiança de "triggers presentes em produção" de UNKNOWN para READY (com a ressalva de que não consultei o banco ao vivo nesta sessão).

**Possibilidade de dupla emissão:** ver §1.8 — mitigada do lado Jinlong (referência estável), risco residual depende do provider.

**Prioridade:** o worker em si é READY; o que falta é orquestração externa (agendamento) — ver §1.11. Não é P0 de código, é P0 operacional (configuração).

### 1.10 Webhooks

| Item | Status | Evidência |
|---|---|---|
| Endpoint de recebimento de webhook (qualquer provider) | **MISSING** | Busca de `webhook` (case-insensitive) em todo `.ts` do repositório = **0 arquivos**. Confirma-se também por listagem de Edge Functions: só `fiscal-worker`, `sync-outbox`, `validar-gerente`, `_shared` |
| Infraestrutura equivalente reaproveitável (de outro provider) | **MISSING** | Não existe — nenhum outro provider do projeto (impressora térmica é hardware local via WebUSB, não tem webhook; Sentry é outbound, não recebe webhook) |

Não há nada para reaproveitar — um endpoint novo é necessário. Precisa seguir o fluxo já preferido pela missão (validar estrutura → localizar documento por referência → consultar Focus server-to-server → aplicar transição via RPC já existente `fiscal_marcar_emitido`/`fiscal_marcar_erro` → auditar via `documentos_fiscais_eventos`, que precisa de 1 novo valor de enum `WEBHOOK_RECEBIDO`). **Prioridade: P0** (é o único jeito seguro de fechar o ciclo assíncrono real da Focus, dado que ela não assina o payload).

### 1.11 Reconciliação

| Item | Status | Evidência |
|---|---|---|
| Seleção de documentos pendentes/incertos | READY (mecanismo) | `fiscal_reaper_documentos` já seleciona por `status='EM_PROCESSAMENTO' AND parado_desde < now() - timeout` — mas isso cobre só "preso no processamento", não "PENDENTE há muito tempo sem claim" nem "consulta de status real na Focus" |
| Agendamento ativo | **MISSING (deliberado)** | `vercel.json` sem `crons`; `pg_cron` do worker foi **desagendado** em `20260731201800_desagenda_fiscal_worker_cron.sql` (justificado por só 2 documentos em 4 meses); `fiscal_reaper_documentos` nunca foi agendada — confirmado pelo próprio time em `20260819230000_remove_funcoes_sem_consumidor.sql:26-29` ("é salvaguarda... item 20 do backlog", não deletar) |
| Consulta individual por referência (contra a Focus) | **MISSING** | 0 ocorrências de função de consulta/polling em qualquer provider — o `FocusProvider` só tem `callProvider` (emitir), não `consultarDocumento` |

**Prioridade: P0** para o mecanismo de consulta por referência (pré-requisito para o fluxo de webhook do §1.10 e para reconciliação); **P1/operacional** para o agendamento em si (a função já existe e é testada — só falta ligar o cron, decisão de baixo risco).

### 1.12 Persistência XML/PDF/Metadados — o que se perde hoje

| Dado | Persistido? | O que se perderia se a Focus ficasse indisponível |
|---|---|---|
| Status, chave, protocolo, provider_ref, erro normalizado, correlation_id, timeline de eventos | Sim (`documentos_fiscais_pendentes` + `documentos_fiscais_eventos`) | Nada — está no nosso banco |
| Payload enviado (itens/totais no momento da emissão) | Parcial — depende de qual caminho gerou o documento (ver §1.3); hoje frequentemente `NULL` | Se `NULL`: perde-se a reconstrução do que foi vendido, mesmo tendo `itens_venda` (a menos que se faça JOIN retroativo, que é frágil se o produto mudou depois) |
| XML assinado | **Não persistido — 0 colunas** | Perde-se 100% se a Focus indisponibilizar (a missão confirma que a Focus só garante XML por *consulta*, não fornece feed; se a consulta falhar ou o vendor sair do ar permanentemente, não há cópia local) |
| PDF/DANFE | **Não persistido — 0 colunas** | Idem — e a missão confirma que a Focus **não garante contratualmente** nem o XML fora do momento da emissão além de consulta pontual; DANFE é responsabilidade do Jinlong |

**Prioridade: P1** (obrigação legal antes de produção real; não bloqueia homologação, mas deve estar desenhado antes).

### 1.13 Cancelamento — Venda × DocumentoFiscal mantidos separados

Confirmado (não apenas citado): busca de `fiscal` (case-insensitive) na **versão mais recente** de `cancelar_venda_transacional` (`20260820150000_fix_cancelar_venda_desconta_devolucoes_previas.sql`) = **0 ocorrências**. `VendaCancelarModal.tsx:152-160` mostra apenas texto estático avisando o operador para agir manualmente.

**Não proponho acoplamento direto** (ex.: cancelar venda chamar automaticamente o provider) como solução — isso violaria a separação conceitual que a missão exige. O que falta é uma **política explícita e visível**: ao cancelar uma venda cujo documento fiscal está `EMITIDO`, o sistema deveria pelo menos **sinalizar/registrar** que existe um documento fiscal ativo pendente de tratamento (evento de auditoria, ou um estado de alerta no painel fiscal), deixando a ação fiscal (cancelamento/CC-e) como um fluxo separado e deliberado no domínio fiscal — não uma consequência automática do cancelamento da venda. **Prioridade: P1** (a política em si, não o acoplamento).

### 1.14 Permissões — enforcement provado

| Operação | Enforcement | Evidência |
|---|---|---|
| Claim de documentos (worker) | `service_role` apenas | `REVOKE ALL ... FROM PUBLIC, anon, authenticated` + `GRANT ... TO service_role` (`307...sql:165-166`) |
| Reaper | `service_role` apenas | idem, linhas 122-123 |
| Reprocessar manualmente | `authenticated` com checagem interna `perfil IN ('GERENTE','DONO','ADMIN')` + `service_role` | `307...sql:168-257`, checagem nas linhas 182-194 |
| Enfileirar documento (`fiscal_enfileirar_documento_venda`) | Operador dono da venda OU `GERENTE/DONO/ADMIN` (com escopo de loja quando `p_loja_id` informado) | `fase1b...sql:108-148` |
| Visualizar documento/evento (SELECT) | `GERENTE/DONO/ADMIN`, escopado por loja via join `vendas→caixas.loja_id` | `094_fiscal_rls_loja_scope_transferencias_idempotencia.sql:27-46`; timeline: `066...sql:36-44` |
| Configuração fiscal do PDV (`pdv_config`) | Enforcement existe (RLS deny-all) mas **contra o próprio fluxo de escrita da aplicação** — ver §1.7 | mesma evidência de §1.7 |
| Editar dados fiscais da empresa (`lojas`) | GERENTE/DONO/ADMIN, **sem escopo por loja** (achado adjacente, incluído nesta branch por decisão do usuário) | `044_usuario_perfil_admin_rls.sql:216-224` — `USING` não compara `lojas.id = usuarios.loja_id` |

**Prioridade:** núcleo fiscal (claim/reaper/reprocessar/enfileirar/visualizar) = READY, nada a fazer. `pdv_config` e `lojas` = P1 (achados adjacentes, escopo já aprovado pelo usuário para esta branch).

### 1.15 Auditoria — cobertura real de transições

Trigger `tg_documentos_fiscais_eventos_au` (`066...sql:91-258`) mapeado transição a transição:

| Transição | Chega à timeline? | Como |
|---|---|---|
| INSERT (qualquer origem) | Sim | trigger `AFTER INSERT` → evento `ENFILEIRADO` |
| `PENDENTE/ERRO → EM_PROCESSAMENTO` | Sim | evento `CLAIM` |
| `* → ERRO` (mudança de status) | Sim | evento `ERRO` |
| Atualização de erro **sem** mudar status (ex.: retry consecutivo) | Sim | ramo específico que compara `ultimo_erro`/`fiscal_error_code` mesmo com `NEW.status = OLD.status` |
| `* → EMITIDO` | Sim | evento `EMITIDO`, payload com chave/protocolo/provider_ref |
| `* → CANCELADO` | Sim | evento `CANCELADO` |
| `ERRO → PENDENTE` via trigger automático | Não (pulado deliberadamente) — **mas** é coberto por evento explícito nas RPCs `fiscal_reprocessar_documento` (`REPROCESSO_MANUAL`) e `fiscal_enfileirar_documento_venda` (`REENFILEIRADO`) | comentário linha 48: "Pula ERRO -> PENDENTE (tratado por RPC reprocesso ou reenfileiramento explícito)" — confirmado que as RPCs realmente inserem o evento (`307...sql:229-252`, `fase1b...sql:454-474`) |
| Webhook recebido | **Não é possível hoje** | tipo de evento não existe no `CHECK` (`066...sql:17-27`: só 7 valores, nenhum é webhook) |

**Conclusão:** cobertura de auditoria é **essencialmente completa** para o que já existe hoje — a única lacuna comprovada é a ausência do tipo `WEBHOOK_RECEBIDO`, necessária apenas quando o webhook (§1.10) for implementado. **Prioridade: P0** (acompanha o webhook, não é independente).

### 1.16 Testes — cobertura real em todo o repositório, não só `fiscal-worker/`

| Camada | Cobertura | Evidência | Tipo de teste |
|---|---|---|---|
| `fiscal-worker/` (provider adapter, classificação de erro, loop de retry do `index.ts`) | **MISSING — 0 arquivos** | Confirmado por listagem direta do diretório: nenhum `*.test.ts`/`*.spec.ts` | — |
| Caminho (a) de enqueue (inline na RPC de venda) | READY (existência) / MISSING (conteúdo do payload) | `vendaConsistency.integration.test.ts:148-192` — roda contra Postgres real (`SUPABASE_SERVICE_ROLE_KEY`, presente em CI), afirma criação do documento com `status: 'PENDENTE'`, não afirma nada sobre `payload` | Integração real, não mock |
| Presença do `FiscalStubNotice` (não emitir aparência de nota real) | READY | `p0-venda-homologacao.matrix.test.ts:74-78` | String-matching sobre código-fonte (guarda de regressão, não executa lógica) |
| Existência de enqueue + referência à RPC certa | READY (regressão estrutural) | `p0-roteiro-operacional.matrix.test.ts:87-93`: `expect(read('caixaFiscalEnqueueServer.ts')).toContain('fiscal_enfileirar_documento_venda')` | String-matching — **não prova que a função é chamada em produção**, só que o texto existe no arquivo (e o arquivo é código morto, ver §1.3) |
| Formatação da timeline de eventos na UI | READY | `fiscalEventTimeline.test.ts` | Unitário puro (funções de formatação, sem I/O) |
| Prova de comportamento real da máquina de estados/reaper/DLQ | READY, mas **não é suíte de regressão CI repetível** | Blocos `DO $verify$` embutidos nas migrations 306/307 — executam uma vez, no momento do deploy, e falham a migration inteira se o comportamento esperado não ocorrer. Não rodam de novo a cada PR | Prova viva pontual, não teste automatizado tradicional |
| Contrato de assinatura da RPC de venda | READY | `contrato-finalizar-venda-v4.test.ts` | Regressão estrutural (compara SQL fonte com contrato versionado) |

**Correção à afirmação inicial "zero cobertura":** imprecisa. O correto é: **zero cobertura de qualquer tipo para o `fiscal-worker/` (a peça que efetivamente chamaria a Focus)**; cobertura real, porém incompleta (não valida payload), para a criação do documento fiscal pelo caminho web; cobertura por guarda de regressão textual (não comportamental) para a existência de código; e prova pontual não-repetível para a máquina de estados/DLQ/reaper via migrations auto-verificadas. **Prioridade: P0** (especificamente o `fiscal-worker/`, que é onde qualquer mudança no adapter/DTO Focus aconteceria).

### 1.17 Código morto / legado — apenas o comprovado

| Item | Status | Evidência |
|---|---|---|
| `fiscal_providers.ts` (`processWithMockProvider`, `processWithHttpProvider`) | **ELIMINAR (confirmado)** | Busca de import/uso em todo `backend/` = 0 ocorrências fora do próprio arquivo |
| `fiscal-validation.ts` (`validateProviderResultSimple`) | **ELIMINAR (confirmado)** | idem — 0 ocorrências |
| `caixaFiscalEnqueueServer.ts` / `enfileirarDocumentoFiscalPosVenda` | **NÃO eliminar — REUTILIZAR** | Único export do arquivo, nunca chamado (ver §1.3), mas é a peça correta para resolver P0.1/P0.2 — eliminar seria jogar fora trabalho aproveitável; a ação certa é conectá-lo, não apagá-lo |
| Duas versões de `fiscal_enfileirar_documento_venda` (3 args vs 4 args) coexistindo entre repo/produção | **Já resolvido** | `fase1b_fiscal_enfileirar_assinatura_unica.sql` explicitamente une os corpos e remove a sobrecarga de 3 args — não há mais duplicação ativa, é histórico já corrigido |
| Dois caminhos de enqueue paralelos (inline SQL vs. RPC dedicada via sync) | **Não é duplicação a eliminar** | Servem contextos genuinamente diferentes (venda síncrona web vs. sync assíncrono de desktop) — mas divergem em completude de payload, o que é o problema real (ver §1.3), não a existência de dois caminhos em si |

---

## 2. REUTILIZAR (Single Source of Truth — não recriar)

- Tabela/schema `documentos_fiscais_pendentes` (status, provider, provider_ref, chave, protocolo, correlation_id, campos de erro normalizado).
- Máquina de estados (`tr_documentos_fiscais_estado_bi/bu`).
- Timeline de auditoria (`documentos_fiscais_eventos` + triggers `tg_..._ai/au`).
- DLQ (`documentos_fiscais_dlq`) e `fiscal_reaper_documentos`.
- Port `FiscalProvider` e as classes `MockProvider`/`HttpProvider`/`FocusProvider` (estender, não duplicar).
- RPC `fiscal_enfileirar_documento_venda` (assinatura única pós-`fase1b`, com validação de loja, SEM_NF, trilha de auditoria).
- RPC `fiscal_claim_documentos`, `fiscal_marcar_emitido`, `fiscal_marcar_erro`, `fiscal_marcar_erro_normalizado`, `fiscal_reprocessar_documento`.
- Função `enfileirarDocumentoFiscalPosVenda` (`caixaFiscalEnqueueServer.ts`) — conectar, não recriar.
- Colunas fiscais já existentes em `produtos` (NCM/CFOP/CSOSN/CEST/CST-PIS/CST-COFINS) e `lojas` (CNPJ/IE/razão/endereço/séries).
- Padrão de secrets server-side (Supabase Edge secrets, `timingSafeEqualSecret`).
- RLS por loja já madura em `documentos_fiscais_pendentes`/`documentos_fiscais_eventos`/DLQ.
- `unified-logger.ts` (estender com correlation_id, não substituir).

## 3. COMPLETAR (correto mas incompleto)

- Payload de enqueue: conectar `enfileirarDocumentoFiscalPosVenda` ao call-site real; enriquecer com campos fiscais do item (NCM/CFOP/CSOSN/CEST/CST) em ambos os caminhos reais (web e sync).
- `FocusProvider`: mapear o corpo real esperado pela Focus (DTO de itens/impostos) — hoje é envelope genérico.
- `FocusProvider`: adicionar função de consulta por referência (hoje só emite, não consulta).
- Timeline de eventos: adicionar tipo `WEBHOOK_RECEBIDO` ao `CHECK` constraint.
- `documentos_fiscais_eventos`/schema: colunas de referência a XML/PDF (Storage), não os blobs em si.
- Reconciliação: agendar `fiscal_reaper_documentos` (já pronta) + implementar consulta individual sob demanda/administrativa.
- Cancelamento: política de sinalização (não acoplamento automático) entre cancelamento de venda e documento fiscal `EMITIDO`.
- Testes: suíte para `fiscal-worker/` (hoje zero) cobrindo os cenários de idempotência da missão.
- `correlation_id`: propagar como header HTTP ao provider e no logger do lado web.

## 4. CORRIGIR (problemas comprovados)

- `pdv_config`: RLS sem policy de escrita bloqueia (por análise estática completa, ver §1.7) o fluxo real de "Configurações fiscais do PDV" — corrigir com policy consistente com o padrão já usado em `lojas`, **ou** confirmar ao vivo antes (recomendo confirmar em homolog antes de tocar, para não corrigir um sintoma sem saber a causa real de produção).
- `lojas`: policy de escrita sem escopo por loja (`lojas_write_gerente`) — risco de segurança multiempresa real, comprovado por leitura direta do `USING`.

## 5. NÃO TOCAR (adequado, não modificar)

- Separação Venda × DocumentoFiscal (schema e todos os caminhos de escrita).
- Máquina de estados fiscal.
- Modelo de papéis `usuarios.perfil`.
- RLS de `documentos_fiscais_pendentes`/`documentos_fiscais_eventos`/DLQ.
- RPCs de claim/marcar-emitido/marcar-erro/reaper (lógica de retry/backoff/DLQ já correta e testada).
- Propriedade dos dados fiscais (produto vs. loja vs. pdv_config) — já está no lugar certo.
- `fiscal_enfileirar_documento_venda` (assinatura única pós-`fase1b`) — não reabrir esse histórico.

## 6. ELIMINAR/CONSOLIDAR (somente duplicação/código morto comprovado)

- `fiscal_providers.ts` (funções `processWithMockProvider`/`processWithHttpProvider`) — confirmado sem nenhum import.
- `fiscal-validation.ts` (`validateProviderResultSimple`) — confirmado sem nenhum import.

Nenhum outro item do domínio fiscal tem duplicação comprovada — especificamente, os dois caminhos de enqueue (inline SQL vs. RPC via sync) **não** são candidatos a eliminação, pois atendem contextos distintos.

---

## 7. Fila proposta por prioridade provisória (candidatos — decisão de escopo permanece com o usuário)

### P0 CANDIDATOS (bloqueadores da 1ª emissão segura em homologação)
1. Payload de enqueue vazio/incompleto nos dois caminhos reais (§1.3, §1.4).
2. DTO real da Focus não mapeado no `FocusProvider` (§1.2).
3. Modelo síncrono do adapter vs. comportamento assíncrono real da Focus — adicionar consulta por referência (§1.2, §1.11).
4. Identificador de empresa Focus (multiempresa) — **decisão de implementação pendente de confirmação externa** (§1.6).
5. Webhook — endpoint novo, idempotente, sem confiar cegamente no payload (§1.10).
6. Novo tipo de evento `WEBHOOK_RECEBIDO` na timeline (§1.15, acompanha item 5).
7. Testes automatizados do `fiscal-worker/` (§1.16) — hoje zero, é onde qualquer mudança de adapter aconteceria.

### P1 CANDIDATOS (bloqueadores de produção)
1. Persistência de XML/PDF (Storage + colunas de referência) (§1.12).
2. Política de sinalização entre cancelamento de venda e documento fiscal `EMITIDO` (§1.13).
3. CC-e (inexistente, não investigado a fundo nesta rodada — mantém-se o achado da Fase A anterior).
4. `pdv_config` — corrigir/confirmar RLS de escrita (§1.7, achado adjacente incluído por decisão do usuário).
5. `lojas` — corrigir escopo por loja na policy de escrita (achado adjacente incluído por decisão do usuário).
6. Agendamento do `fiscal_reaper_documentos` (código já pronto, só falta ligar) (§1.11).
7. Propagação de `correlation_id` como header HTTP + logger web (§1.9).
8. Código IBGE do município em `lojas` — depende de confirmação de que é realmente exigido no cenário do piloto.

### P2 (hardening não bloqueante)
1. Inutilização de numeração (delegada à Focus — Jinlong só representa/consulta).
2. Estado de contingência SEFAZ distinto de erro comum — avaliar se cabe em `fiscal_error_category` existente antes de criar estado novo.
3. GTIN/CST-ICMS-não-Simples/alíquotas no produto — só se o piloto atender regime fora do Simples Nacional.
4. Unidade tributável separada da comercial.
5. Eliminar `fiscal_providers.ts`/`fiscal-validation.ts` (baixo risco, mas não é bloqueador de nada — pode ser feito a qualquer momento).

---

## 8. Revisão adversarial da própria auditoria

**Algum MISSING na verdade já existe?**
Um caso relevante foi corrigido nesta rodada: a auditoria inicial tratava o "risco de dupla emissão real" como um gap de código (implicitamente MISSING). Provou-se que o Jinlong já faz a parte que lhe cabe (referência estável `doc.id`, nunca regenerada entre retries) — o risco residual é inteiramente do lado do comportamento de deduplicação da Focus, não uma lacuna do nosso código. Reclassificado de "bloqueador" para "validar em homologação".

**Algum READY está sendo declarado apenas porque existe código?**
Sim, um caso foi corrigido: os triggers da máquina de estados (092/306) foram inicialmente marcados UNKNOWN quanto a estarem realmente presentes em produção (citando drift histórico documentado). Nesta rodada, a leitura completa da migration 306 mostrou que ela é **autoverificante** — o próprio `DO $verify$` consulta `pg_trigger` e lança exceção se os triggers não existirem, dentro de uma transação `BEGIN...COMMIT`. Isso eleva a confiança de UNKNOWN para READY (com a ressalva honesta de que não consultei o banco de produção ao vivo nesta sessão — a evidência é da migration, não de uma query direta).

**Algum "bug" é apenas hipótese?**
`pdv_config` deixou de ser tratado como "possível bug" (hipótese) e passou a CONFLICT comprovado por leitura de três camadas independentes (RLS+GRANT da migration, ausência total de policy em 393 migrations, client sem `service_role` no código da action). Ainda assim, mantive a ressalva de que não executei contra um banco real — a diferença é que agora a conclusão é sustentada por prova estrutural completa, não por suspeita.

**Alguma proposta criaria segunda fonte de verdade?**
O ponto de maior risco identificado é `enfileirarDocumentoFiscalPosVenda` — se a correção de P0.1 fosse feita reescrevendo a lógica de payload *dentro* da RPC SQL (PL/pgSQL) **em vez de** conectar a função TS já existente, isso criaria duas implementações paralelas de "como montar o payload fiscal de uma venda" (uma em SQL, outra em TS morta). A recomendação registrada em §3/COMPLETAR é explicitamente reaproveitar a função TS existente para o caminho web, evitando essa duplicação.

**Alguma mudança pode ser evitada reutilizando estrutura existente?**
Sim — o caminho inteiro de P0.1/P0.2 no fluxo web não precisa de nova função: precisa apenas conectar `enfileirarDocumentoFiscalPosVenda` (já madura, já com tratamento de erro correto, já usando a RPC certa) ao ponto real de chamada em `caixaVendas.impl.ts`, e enriquecer o payload que ela monta com os campos fiscais do produto.

**Algum P0 pode na verdade ser P1/P2?**
O item "código IBGE do município" foi rebaixado de P0 (rascunho inicial) para P1 nesta versão — é um campo de cadastro que bloqueia a validade de um XML real, mas não impede testar o restante da integração (payload/webhook/idempotência/reconciliação) em homologação com dados de teste. Da mesma forma, "GTIN/CST-ICMS-não-Simples" permanece P2 porque depende de uma decisão de negócio (quais regimes tributários o piloto realmente atende) que não foi confirmada nesta auditoria.

**Alguma implementação proposta aumentaria acoplamento à Focus?**
O maior risco aqui é o item P0.4 (identificador de empresa Focus): criar uma coluna com um nome/formato específico da Focus em `lojas` sem confirmar o mecanismo real correria o risco de acoplar a modelagem da empresa ao vocabulário de um único provider. Por isso esta auditoria **deliberadamente não propõe** a coluna nem seu formato — registra o gap e deixa a decisão de design para a Fase B, condicionada a confirmar o mecanismo real (o que não foi possível nesta sessão por falha de `WebFetch`/`WebSearch`). O mesmo cuidado se aplica ao DTO do `FocusProvider`: ele já vive isolado no adapter (boundary correto) — o mapeamento do payload deve continuar ali, sem vazar para `itens_venda`/UI/PDV.

---

## 9. Fechamento

Fase A encerrada. Nenhuma implementação foi feita. Os candidatos P0/P1/P2 acima são propostas para aprovação — não uma decisão tomada. Pontos que exigem uma decisão do usuário antes da Fase B:
1. Como confirmar o mecanismo real de identificação de empresa multiempresa da Focus (nova tentativa de busca nesta sessão, ou informação direta do usuário)?
2. Confirmar `pdv_config`/`lojas` (RLS) em ambiente de homologação real antes de propor a correção exata, ou seguir direto para a correção com base na análise estática?
3. Escopo de regimes tributários do piloto (para decidir se GTIN/CST-não-Simples entram em P1 ou seguem em P2).

Aguardando aprovação item a item antes de qualquer Fase B/C.
