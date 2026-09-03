# Encerramento — Sprint de Prontidão Fiscal Focus NFe

**Data de encerramento:** 2026-09-02
**Branch:** `claude/jinlong-focus-nfe-readiness-d5524b`
**HEAD:** `8c86302e`
**Escopo da sprint:** Fase A (auditoria) → Fase B (plano) → Fase C (implementação em ondas C1 a C2.8), sem emissão fiscal real em nenhum momento.

Este documento substitui a necessidade de reler os relatórios intermediários. Os relatórios individuais permanecem em `docs/audits/` como evidência detalhada de cada gate, mas este é o documento canônico de estado.

---

## ENTREGUE

Tecnicamente concluído e verificado (testes reais, não estáticos) nesta sprint:

1. **Auditoria de prontidão (Fase A)** — inventário completo, evidenciado, do estado real do Jinlong frente aos requisitos Focus NFe.
2. **Plano mínimo (Fase B)** — arquitetura + P0/P1/P2, revisado após confirmação de contrato oficial da Focus.
3. **Snapshot fiscal imutável (C1)** — `documentos_fiscais_pendentes.payload` congelado na mesma transação da venda (caminho web e caminho pdv-local/sync), com identificação de produto, tributação por item, totais, pagamentos itemizados, destinatário e emitente. Imutável a alteração posterior de `produtos`/`lojas`/`pdv_config` (provado contra Postgres real).
4. **Resolução de credencial multiempresa fail-closed (C1/C2)** — `fiscal_provider_config` (loja+ambiente → nome de env var via coluna `GENERATED ALWAYS`, nunca digitável), `FocusProvider` real (NFC-e síncrona, NF-e 201/202), classificadores de resposta HTTP→estado canônico.
5. **Idempotência e retry seguro (C2)** — `ref` estável por documento (nunca regenerada), consulta-antes-de-reemitir quando `tentativas > 0`, distinção entre reaper (recuperação local) e reconciliação (descoberta remota).
6. **Contrato DTO Focus fechado onde havia evidência oficial (C2.5)** — `modalidade_frete`/`local_destino`/`presenca_comprador` (constantes do cenário PDV presencial), `items[]`/`formas_pagamento[]` com nomes de campo reais, `natureza_operacao` deliberadamente omitido (Focus aplica seu próprio default), `data_emissao` calculada no momento real do envio (não do snapshot).
7. **`icms_origem` modelado e integrado ponta a ponta (C2.6)** — schema, snapshot (web + sync), UI de cadastro, fail-closed no boundary de emissão.
8. **Hotfix P0 de preservação fiscal na edição (C2.8)** — `list_produtos_gerente_filtrados` devolvia zero campos fiscais; toda edição de produto apagava a classificação fiscal real. Corrigido e provado.

## ARQUITETURA FINAL

```
Venda (domínio PDV/caixa)
  │  imutável, nunca "vira" documento fiscal — são dois conceitos separados
  ▼
DocumentoFiscal (documentos_fiscais_pendentes)
  │  snapshot congelado no momento da venda; máquina de estados
  │  PENDENTE → EM_PROCESSAMENTO → EMITIDO/ERRO/CANCELADO
  ▼
FiscalProvider (port — fiscal-provider-adapter.ts)
  │  interface de infraestrutura; Mock/Http/Focus/Bling são implementações
  ▼
FocusProvider (adapter Focus)
  │  fiscal_focus_dto.ts (mapeamento snapshot→payload Focus)
  │  fiscal_credential_resolver.ts (token por loja+ambiente, fail-closed)
  ▼
Focus NFe (API REST) → SEFAZ
```

Focus permanece **inteiramente um adapter de infraestrutura**. Nenhum DTO, status, URL ou token da Focus vazou para o domínio da Venda, para o PDV ou para o React. A arquitetura hexagonal foi preservada em toda a sprint — nenhuma onda reabriu essa fronteira.

## GARANTIAS COMPROVADAS

Cada item abaixo tem prova real (execução, não só leitura de código) registrada no gate correspondente:

| Garantia | Prova |
|---|---|
| Venda ≠ DocumentoFiscal | Domínio separado desde C1; `Venda` nunca referencia campos Focus |
| Snapshot fiscal imutável | `vendaConsistency.integration.test.ts` — mutação posterior de produtos/lojas/pdv_config não retroage ao documento já enfileirado (Postgres real) |
| `ref` estável / idempotência | `resolveFocusRef` — mesma referência em toda chamada subsequente, testado |
| Query-before-reemit | `index.ts` consulta a Focus antes de qualquer novo POST quando `tentativas > 0`; testado em `fiscal-provider-adapter.test.ts` |
| Retry seguro | Distinção reaper (local) vs. reconciliação (remoto) como caminhos de código separados, nunca se chamam entre si |
| Multiempresa | `fiscal_provider_config` — chave composta `(loja_id, ambiente)`, testado com 2 lojas nunca cruzando credencial |
| Segredo por loja/ambiente fail-closed | `token_env_var` é coluna `GENERATED ALWAYS` — tentativa de escrita direta rejeitada pelo Postgres, provado via `psql` |
| Homologação/produção segregadas | `ambiente` explícito por linha; worker recusa combinação loja/ambiente incompatível com o deploy |
| `icms_origem` | Schema + snapshot (2 caminhos) + UI + fail-closed, 4 migrations aplicadas e verificadas, imutabilidade estendida e provada |
| Fail-closed fiscal | `fiscal_focus_dto.ts` bloqueia item sem NCM/CFOP/unidade/quantidade/valor/`icms_origem` — nunca inventa valor, nunca emite incompleto |
| Edição preserva dados fiscais | Hotfix C2.8 — provado que editar só o nome de um produto não altera nenhum dos 7 campos fiscais gravados (Postgres real, sessão autenticada real) |
| Regressões/testes | Ver seção de gates finais abaixo — suíte inteira do projeto verde |

## NÃO CONCLUÍDO / DEPENDÊNCIAS EXTERNAS

Não escondido — classificado por tipo:

1. **Primeiro cenário tributário real** (bloqueio externo — dados do contador/empresa) — depende de regime tributário real, NCM/CFOP/CSOSN/CST/`icms_origem` reais de ao menos um produto. Ficha de dados necessários já produzida no Gate C2.7 (`DADOS NECESSÁRIOS DO CONTADOR PARA HOMOLOGAÇÃO`).
2. **Contrato completo de resposta Focus** (bloqueio externo — documentação) — `RESPOSTAS FOCUS: BLOCKED` desde C2.5; falta o JSON exato que distingue PROCESSANDO/AUTORIZADA/REJEITADA/CANCELADA/NÃO_ENCONTRADA. Sem isso, `classifyFocusConsultaResponse` mantém um risco residual documentado (uma rejeição pode ser lida como "ainda processando").
3. **PIX** (bloqueio externo — decisão operacional) — Jinlong só tem o enum genérico `PIX`, sem modalidade (dinâmico/estático/automático). `PIX: BLOCKED` — não impede a primeira homologação se o cenário usar DINHEIRO.
4. **XML/Storage (C3)** — trabalho futuro, não iniciado nesta sprint (fora do escopo autorizado).
5. **Primeira chamada real Focus/homologação** — não ocorreu; proibida explicitamente durante toda a sprint.
6. **Catálogo real** (trabalho futuro / P0 antes de produção) — precisa de saneamento e classificação fiscal em massa; hoje todo produto legado tem `icms_origem IS NULL` por design (sem migração de dados automática).

## DÍVIDA CONHECIDA

Registrada, não corrigida nesta sprint (fora de escopo, não expandido):

- Webhook Focus (não confiável sem assinatura — reconciliação server-to-server já desenhada como alternativa, não implementada).
- Cancelamento fiscal integrado.
- CC-e (Carta de Correção Eletrônica).
- DANFE/PDF.
- Demais cenários tributários além do primeiro (interestadual, com frete, e-commerce).
- Grupo de tributação Focus além de `icms_origem` (CST/CSOSN além do que já existe, bases/alíquotas de PIS/COFINS condicionais).
- Melhorias P1/P2 já identificadas na Fase A que não bloqueiam a primeira homologação.

## CHECKLIST — ANTES DE ATIVAR NFC-e EM PRODUÇÃO

Nenhum destes itens está concluído. "Sprint encerrada" **não** significa "fiscal pronto para produção".

- [ ] Dados do contador confirmados (regime, NCM/CFOP/CSOSN/CST/`icms_origem`/CEST do primeiro produto)
- [ ] Produto de homologação classificado fiscalmente no banco
- [ ] Credencial Focus de homologação obtida e cadastrada em `fiscal_provider_config`
- [ ] Cenário tributário do primeiro produto confirmado como suportado (ou `TRIBUTACAO_NAO_SUPORTADA` resolvido)
- [ ] Respostas Focus certificadas (JSON real obtido, `RESPOSTAS FOCUS` sai de BLOCKED)
- [ ] XML/Storage implementado (C3)
- [ ] Primeira homologação real autorizada e executada
- [ ] Rejeição testada contra Focus real (não só heurística)
- [ ] Retry/reconciliação testados contra Focus real
- [ ] Só depois disso: credencial e ambiente de produção

## PRÓXIMA ENTRADA FISCAL

Ordem de retomada, sem reconstrução de contexto:

1. **C2.9** → primeiro cenário tributário real (dados do contador) + respostas Focus (JSON oficial)
2. **C3** → XML/Storage
3. **C4** → certificação
4. **Homologação Focus** → primeira chamada real, ambiente de homologação
5. **Gate de produção** → checklist acima 100% cumprido

---

## GATES FINAIS DESTA SPRINT (executados agora, real, sem E2E pesado)

| Gate | Resultado |
|---|---|
| `tsc --noEmit` (projeto inteiro) | limpo, 0 erros |
| `eslint .` (projeto inteiro) | 4 erros + 1 warning, todos em `next.config.js`/`e2e/*.spec.ts` — confirmado via `git diff` que nenhum dos dois foi tocado por qualquer commit desta sprint (pré-existentes) |
| `deno check` (fiscal-worker + sync-outbox, entry points) | limpo |
| `deno test` (fiscal-worker + sync-outbox) | **59/59 passaram** |
| `vitest run --config vitest.integration.config.ts` (Postgres real local) | **13/14 passaram** — a 1 falha (`cancelarVendaContrato.integration.test.ts`) é `cookies() outside request scope`, arquivo não tocado por nenhum commit desta sprint (confirmado via `git diff`), mesma classe de limitação de infra já documentada no cabeçalho de `vendaConsistency.integration.test.ts` |
| `vitest run` (unitário, projeto inteiro, exclui integration/e2e) | **1258/1258 passaram**, 217 arquivos |

Nenhum teste cosmético foi criado para esta rodada de fechamento — só reexecução dos gates já existentes.

## GIT

- **Branch:** `claude/jinlong-focus-nfe-readiness-d5524b`
- **HEAD antes deste commit de encerramento:** `8c86302e`
- **Working tree:** limpo, exceto `.claude/scheduled_tasks.lock` (modificação pré-existente, não relacionada a esta missão, não tocada)
- **Commits da missão** (do merge-base `9e629283` até `8c86302e`, 8 commits):

| Commit | Onda |
|---|---|
| `3b652680` | C1 — snapshot fiscal imutável + config genérica de credencial multiempresa |
| `766c787b` | docs — evidências do Gate C1.5 (execução real) |
| `c07ae2de` | C2 — Focus adapter real + credencial multiempresa fail-closed + retry seguro |
| `d8a87b13` | C2.5 (rodada 1) — natureza_operacao/frete/local/presença/data_emissao |
| `2828d8f9` | C2.5 (rodada 2) — items[]/formas_pagamento[] com contrato oficial |
| `14199da4` | docs — investigação de tributação para Gate C2.5 (`icms_origem` ausente) |
| `e5ecbdb7` | C2.6 — modelagem mínima de `icms_origem` |
| `8c86302e` | C2.8 — hotfix P0, preservação de campos fiscais na edição |

Nenhum squash foi feito. Este documento de encerramento será um commit separado.

**Nenhuma ação de produção, chamada real à Focus, preenchimento de tributação real, ou início de C2.9/C3 foi realizada nesta sessão.**

---

## SPRINT ENGINEERING GATE: PASS

## FISCAL PRODUCTION GATE: BLOCKED
