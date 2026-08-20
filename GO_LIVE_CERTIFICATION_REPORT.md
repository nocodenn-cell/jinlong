# Go-Live Certification Report — Jinlong PDV

**Atualizado:** 2026-08-19
**Decisão histórica de implantação (2026-08-09):** 🟢 **GO** — preservada como evidência do fechamento anterior.
**Estado do bloco AR/AP (Fase 2C, §11):** 🟡 **APTO PARA REAUDITORIA** — os 4 P0 e os 6 P1 da auditoria adversarial (§10.9) foram remediados, com gate de regressão automatizado no CI. Reauditoria independente desse bloco específico ainda não foi executada.
**Estado do bloco de comissões — DB-05 A→F (§12):** 🟢 **CERTIFICADO** (backend e frontend). Ver §12 para commits, gates, auditoria adversarial e dívidas residuais. **Fase 3A permanece NÃO LIBERADA** — a certificação de DB-05 fecha o bloco de comissões, não a liberação da próxima fase, que depende também da reauditoria pendente do bloco AR/AP (§11) e das dívidas de reconciliação global listadas em §12.8.
**Estado do gate financeiro (Fase 6 + PR [#309](https://github.com/nocodenn-cell/fastproduct/pull/309), 2026-08-19):** 🟢 **6/6 REPRODUZÍVEL DO ZERO** — antes passava **1/6** num banco reconstruído; o `4/6` observado localmente era resíduo de execuções manuais. Fechadas as lacunas (a) GATES 12–23 + `ROLLBACK` e (b) `seed.sql`. **O E2E saiu de produção** — os dois jobs (`e2e-critical` e `e2e-playwright`) sobem stack Supabase local e efêmera; **baseline provada** no run de 2026-08-19T21:08: 0 vendas, 0 caixas, 0 lojas novas e **0 logins** em produção, contra 2 logins no run anterior. O GATE 9 deixou de ser infalsificável (revogava o que ia testar) e agora cobre `anon` e a ACL de `PUBLIC`. **⚠️ Janela crítica ainda NÃO recomendada** — não por falta de auditoria do ledger (feita: §14.1, paridade 307/307), mas porque a reconciliação de catálogo (Fase 1B) segue aberta e não há ambiente de ensaio com schema equivalente ao de produção. Ver §14, [docs/FASE_6_GATE_FINANCEIRO_VALIDACAO.md](docs/FASE_6_GATE_FINANCEIRO_VALIDACAO.md) e [docs/AUDITORIA_CATALOGO_PROD_VS_REPO_2026-08.md](docs/AUDITORIA_CATALOGO_PROD_VS_REPO_2026-08.md).
**🔒 Correção de RLS em produção (2026-08-19):** `relatorio_consistencia_vendas` (4 args) permanecia executável por `authenticated` **via herança de PUBLIC** — a `20260818000001` revogou só `FROM authenticated`. Função `SECURITY DEFINER` sem guarda de loja ⇒ GERENTE da loja B lia agregados da loja A. Corrigido em `20260819000000` (PR [#307](https://github.com/nocodenn-cell/fastproduct/pull/307)) e **aplicado em produção** na PR [#309](https://github.com/nocodenn-cell/fastproduct/pull/309) — verificado: `proacl` de `relatorio_consistencia_vendas` e de `verificar_consistencia_venda` restrito a `postgres`/`service_role`. Ver §14.2.
**Produção canônica:** https://pdv-importados.vercel.app  
**Projeto Vercel:** `pdv-importados` (team `jinlong`)  
**Supabase:** projeto `jinlong` (dashboard do time Jinlong)

---

## 1. Resumo executivo histórico — decisão Go/No-Go de 2026-08-09

> ## 🟢 GO HISTÓRICO — SUPERADO PARA O BLOCO FINANCEIRO PELO §10
>
> Fechamento P0 (Passos 1–5) concluído. Produção = `main`, SSRA verde, schema alinhado ao Git, correções críticas aplicadas, UI/UX waves integradas. Checklist `/admin/implantacao` (loja **Matriz**) autorizado com `go_autorizado = true` em **2026-08-09**.

| Bloco | Status | Evidência |
|---|---|---|
| Produção = `main` | ✅ | `/api/health` → `gitSha=2afa14ca…` |
| SSRA | ✅ Success | [run 31316048037](https://github.com/nocodenn-cell/fastproduct/actions/runs/31316048037) |
| Schema Git ↔ prod | ✅ | Migrations Aug/2026 + claim + scope-guard 22 args |
| Correções críticas | ✅ | #284 / #285 (scope-guard + claim espera) |
| UI/UX waves | ✅ | [#286](https://github.com/nocodenn-cell/fastproduct/pull/286) |
| Gate implantação | ✅ | `go_autorizado=true` (loja Matriz) |

---

## 2. Evidências de produção (Passo 4–5)

| Campo | Valor |
|---|---|
| **SHA produção** | `2afa14ca3cc5c00ee8361d29a06934610350b7ac` |
| **Deployment ID** | `dpl_FXFHdqB6de5hZxgTSABuF2P9tUkq` |
| **Host** | `pdv-importados.vercel.app` |
| **Ref** | `main` (merge [#286](https://github.com/nocodenn-cell/fastproduct/pull/286) em 2026-08-09T13:29:48Z) |
| **SSRA** | ✅ Success — platform `deploymentId` === `/api/health` |
| **Health** | `GET /api/health` → `{ deploymentId, gitSha: 2afa14ca… }` |

---

## 3. Trilha P0 de integração (2026-08-09)

| Passo | Conteúdo | PR / merge |
|---|---|---|
| 1 | UI/UX fechamento (#268) → `main` | [#282](https://github.com/nocodenn-cell/fastproduct/pull/282) → `28b14b76` |
| 2 | Schema Aug/2026 + fiscal D-1–D-3 (#267) | [#283](https://github.com/nocodenn-cell/fastproduct/pull/283) → `cfec6040` |
| 3 | Scope-guard v4 + claim espera (#281/#269) | [#284](https://github.com/nocodenn-cell/fastproduct/pull/284) → `3369b055` |
| 3b | Hotfix 22 args + versões `schema_migrations` | [#285](https://github.com/nocodenn-cell/fastproduct/pull/285) → `cb45e52f` |
| 4 | Redeploy + SSRA | Produção + CI verde |
| 5 | UI/UX waves (#270–#280) | [#286](https://github.com/nocodenn-cell/fastproduct/pull/286) → `2afa14ca` |

### Schema (destaques)

- Claim anti-duplicata: `20260809120659_fix_venda_em_espera_claim_anti_duplicata`
- Scope-guard v4 (**22 args**, `p_limite_credito_gerente_token`): `20260809120837_finalize_v4_scope_guard_22args`
- Validação prod: `finalizar_venda_transacional_canonica_v4` → `pronargs=22`; wrapper com guards de loja/caixa; `*_unscoped` sem EXECUTE para `authenticated`

### UI/UX waves (#286)

Catálogo #270 · Clientes #272 · Funcionários #273 · Dashboard #271 · Comissões #278 · Relatórios #276 · Configurações #279 · Fornecedores #280  
(Superseded: #277, #274)

---

## 4. Histórico — certificação 2026-07-31 (arquivo)

A versão anterior deste relatório concluiu **NO-GO** por SYNC_KEY / evidências incompletas (ver `docs/archive/go-live-pre-2026-08-09/`). Esse estado foi **superado** pelo fechamento P0 de 2026-08-09 acima. Não usar o veredito antigo como status atual.

---

## 5. Riscos residuais do fechamento de 2026-08-09 (não bloqueavam aquele GO)

| Item | Classificação | Nota |
|---|---|---|
| E2E crítico (Playwright sync-fluxo) | Sistema de risco | Não é gate SSRA; monitorar pós-piloto |
| P1-01 `venda_finance_context` | P1 → ✅ **encerrado** | Reaplicação `20260808130200` aposentada e **removida do repositório**; convergência oficial é a tombstone `20260810222702_retire_obsolete_venda_finance_context.sql`. ⚠️ Instrução de reaplicação humana superseded em 2026-08-13 — **não aplicar**. Autorização: [ADR-012](./docs/adr/ADR-012-aposentadoria-venda-finance-context.md) · fonte única: [reconciliação 2026-08-13](./docs/RECONCILIACAO_venda_finance_context_2026-08-13.md). Convergência de branches confirmada em 2026-08-17 (§7 da reconciliação). |
| `GL-DENO-LOCK` | Go-Live separado | `fiscal-worker --frozen` PASS; `sync-outbox` e `validar-gerente --frozen` FAIL; todas passam com `--no-lock`. Corrigir em tarefa separada antes do Go-Live. |
| Branches/PRs legados | Higiene P2 | Passo 8 do plano de fechamento |

---

## 6. Autorização GO (`/admin/implantacao`)

| Campo | Valor |
|---|---|
| Loja | **Matriz** (`a0000001-0000-4000-8000-000000000001`) |
| `go_autorizado` | **true** |
| Data/hora | **2026-08-09** (UTC; ver `go_autorizado_em` no banco) |
| Autorizado por | DONO Demo (`ac5baea3-8cbb-4475-b822-c01d8ee6d8c7`) — autorização do dono/cliente registrada neste fechamento |
| Itens P0 | Todos obrigatórios + grupo fiscal (`fiscal.stub`) = **CONCLUIDO** com evidências (PRs/deploys) |

---

## 7. Documentos canônicos

| Documento | Papel |
|---|---|
| **Este arquivo** | Certificação técnica + evidências |
| [`GO_LIVE_EXECUTIVO_RESUMO.md`](./GO_LIVE_EXECUTIVO_RESUMO.md) | Decisão executiva PRONTO PARA GO-LIVE |
| [`docs/FASE_6_GATE_FINANCEIRO_VALIDACAO.md`](./docs/FASE_6_GATE_FINANCEIRO_VALIDACAO.md) | Gate financeiro 6/6 e pendências da Fase 6 |
| [`docs/AUDITORIA_CATALOGO_PROD_VS_REPO_2026-08.md`](./docs/AUDITORIA_CATALOGO_PROD_VS_REPO_2026-08.md) | Diff de catálogo produção × repositório — base da Fase 1B |
| [`docs/BACKLOG_TECNICO.md`](./docs/BACKLOG_TECNICO.md) | Pendências técnicas abertas |
| [`docs/archive/go-live-pre-2026-08-09/`](./docs/archive/go-live-pre-2026-08-09/) | Status/NO-GO anteriores (arquivados) |

---

## 8. Auditoria contábil e de regras de negócio — Issue #298

**Data da varredura:** 2026-08-13

**Natureza:** auditoria e diagnóstico; nenhuma correção de achado, migration remota, alteração de produção ou merge foi executado.
**Escopo técnico auditado:** checkout `codex/reconcile-db-final` no commit `eb6c5c48b3d2534edde3e745185dcd6d2190efba`.

### 8.1 Veredito geral

**NÃO CERTIFICADO.** A implementação contém invariantes fortes para venda, preço, split, estoque, cancelamento e isolamento por loja, mas a cadeia financeira completa não é reconciliável com evidência suficiente. Há dois `FAIL` P0 comprovados (recebimentos/pagamentos sem efeito no fluxo de caixa e comissão não disparada nas inserções canônicas), além de múltiplas fontes de leitura para o mesmo conceito de faturamento e lacunas de teste de banco.

Os documentos obrigatórios `Especificação de Alterações e Melhorias do Sistema.pdf` e `Princípios-de-Engenharia.txt` **não estão presentes** no checkout, nos arquivos ignorados nem no histórico Git consultado (`rg --files -uu` e `git rev-list --objects --all`). Portanto, regras que dependem desses documentos não foram reconstruídas por memória: ficaram `NÃO COMPROVADO`. A Issue #298 foi lida integralmente e usada como fonte explícita do escopo, não como substituta silenciosa dos documentos ausentes.

### 8.2 Baseline anterior — separado desta auditoria

| Evidência | Resultado | Veredito |
|---|---|---|
| branch local/remota e `HEAD` | `codex/reconcile-db-final` e `origin/codex/reconcile-db-final` em `eb6c5c48...` | PASS |
| commit | `fix(sync-outbox): project synced sales into sale event ledger`; altera Edge, smoke contratual e E2E | PASS |
| PR associado ao head | `gh pr view` e busca GitHub: nenhum PR | NÃO COMPROVADO como gate de PR |
| status remoto | Vercel `success`; Vercel Preview Comments `success`; Supabase Preview `skipped`; SSRA `skipped` | NÃO COMPROVADO para CI completo |
| workflow de PR no commit | nenhum workflow de PR retornado | NÃO COMPROVADO |
| `node backend/scripts/sync-outbox-contract-smoke.mjs` | PASS, inclusive projeção `SALE_REGISTERED` | PASS local |
| `npm run check:edge -w backend` | PASS nas três Edge Functions | PASS local |

**Conclusão da frente anterior:** não existe check remoto falhando nem bloqueio técnico real observado no `sync-outbox`; a correção está encerrada no limite das evidências locais. A ausência de PR e os checks remotos pulados impedem afirmar que houve gate remoto completo. Isso é risco residual da frente anterior e não foi misturado aos achados contábeis abaixo.

### 8.3 Matriz requisito → regra → implementação → persistência → autorização → auditoria → teste → veredito

| Requisito/regra | Implementação e persistência | Autorização/auditoria | Evidência/teste | Veredito |
|---|---|---|---|---|
| venda sem cliente | `cliente_id` é opcional no fluxo v4 | sessão autenticada na action/RPC | implementação estática; fonte oficial externa ausente | NÃO COMPROVADO |
| varejo/atacado automático | preço é resolvido/revalidado no servidor e a UI reprecifica ao cruzar quantidade | RPC canônica; snapshot em `itens_venda` | testes `useReprecificarQuantidadeCaixa` existentes; não executados nesta rodada | NÃO COMPROVADO |
| preço manual/desconto | v4 revalida preço e grava motivo/snapshot | token/perfil quando aplicável | constraints e guardas em migrations 272/274/279 | PASS estático forte |
| centavos/arredondamento | `numeric(10,2)`, `round_abnt`, identidade `total_liquido = total_bruto - total_desconto` | banco | `finalizarVendaValidation.test.ts` PASS | PASS no escopo coberto |
| total do cabeçalho × itens | CHECK protege apenas identidade intralinha; não existe constraint para `vendas.total_desconto = SUM(itens)` | não aplicável | dívida explicitamente documentada na migration `20260731201200` | FAIL (P1) |
| split/múltiplas formas | `vendas_pagamentos`; soma validada pela RPC canônica | RLS por venda/loja | `finalizarVendaCaixa.integration.test.ts` PASS | PASS no contrato mockado |
| troco | cálculo/UI de dinheiro | operador autenticado | teste de componente existente, sem prova de persistência própria | NÃO COMPROVADO |
| idempotência/duplo clique/timeout após commit | UUID da venda e chave de idempotência; locks e conflito | RPC transacional | cobertura estática e testes de input; sem fault injection após commit | NÃO COMPROVADO |
| venda online → ledger | RPC v4 registra `SALE_REGISTERED` | sessão/RPC | migrations 228/229/235/243 | PASS estático forte |
| venda offline → ledger | Edge chama `ensure_venda_evento_registrado(..., 'sync_outbox')` | Edge autenticada por chave; RPC idempotente | smoke contratual PASS | PASS local |
| venda → estoque | baixa atômica, locks e kardex | RPC/Edge; isolamento por loja | migrations 016/070/127; não houve teste DB nesta rodada | NÃO COMPROVADO em runtime |
| estoque negativo | guardas de saldo nas RPCs canônicas | banco | evidência estática; sem concorrência real executada | NÃO COMPROVADO |
| custo/margem históricos | venda grava `custo_unitario_snap` no servidor | RPC canônica | migration 300 e relatório snapshot-only | PASS estático forte |
| comissão | trigger calcula ao mudar venda para `CONCLUIDA` | `SECURITY DEFINER`; exceções são engolidas | vendas canônicas são inseridas já `CONCLUIDA`, mas trigger é apenas `AFTER UPDATE OF status` | FAIL (P0) |
| comissão por margem histórica | cálculo lê `produtos.preco_custo` atual, não `itens_venda.custo_unitario_snap`; uma única regra/percentual representa agregado multi-item | trilha parcial | migration 261 linhas 72 e 217–228 | FAIL (P1) |
| recebimento parcial/total | `liquidacoes_receber` + atualização de `valor_aberto/status` sob `FOR UPDATE` | gerente/dono/admin e loja | migration 112; tests de adapter PASS | PASS para saldo do título |
| recebimento → caixa/fluxo | RPC de liquidação não grava `movimentacoes_caixa`, não altera caixa e não há referência a caixa | autorização existe, correlação financeira não | migration 112 linhas 204–272 | FAIL (P0) |
| conta a pagar parcial/total | histórico em `contas_pagar_pagamentos`, limite por saldo e CHECK | gerente/dono/admin e loja | migration 299 | PASS estático forte |
| pagamento AP → caixa/fluxo | RPC de pagamento só insere histórico e atualiza conta; não registra saída de caixa | autorização existe, correlação de caixa não | migration 299 linhas 49–125 | FAIL (P0) |
| inadimplência | status e vencimento permitem listar abertos/parciais vencidos | RLS por loja | reader filtra títulos; regra oficial de aging ausente | NÃO COMPROVADO |
| cancelamento total | RPC bloqueia linha, restaura estoque, registra devolução/auditoria/evento e cancela CR aberto/parcial | gerente/dono/admin da loja | contrato integrado existente; executado sem ambiente DB real nesta rodada | NÃO COMPROVADO em runtime |
| cancelamento após recebimento parcial | título é marcado `CANCELADO`, mas liquidações anteriores não são estornadas nem vinculadas a devolução de caixa | trilha não fecha o dinheiro recebido | migration 303 linhas 35–80 | FAIL (P0) |
| devolução parcial | operação idempotente, itens, estoque, devolução, ledger | gerente/dono/admin da loja | migration 303 | PASS estático forte |
| devolução em crédito do cliente | reduz saldo do CR, mas persiste a devolução com forma `PIX` | trilha contradiz a forma real | migration 303 linhas 203–209 | FAIL (P1) |
| abertura/fechamento de caixa | abertura persiste `valor_inicial/saldo_atual`; fechamento é RPC atômica com lock | operador/perfis e loja | `cashSession.ts`, migrations 207/230 | PASS estático forte |
| reabertura de caixa | nenhuma RPC/ação explícita encontrada; abrir novo turno não prova reabertura | — | busca exaustiva por `reabrir/reabertura` | FAIL (P1) |
| sangria/suprimento/estorno | ledger `movimentacoes_caixa`, idempotência, aprovação e saldos antes/depois | perfil/token/loja | migrations 045/046/280 | PASS estático forte |
| virada de dia | relatórios usam limites TZ sargable; caixa é sessão por timestamps | autorização varia por RPC | migration `20260809163502`; sem cenário E2E de virada | NÃO COMPROVADO |
| fiscal/NCM | NCM nullable no catálogo; fiscal é stub por decisão registrada | fila e worker; emissão real não provada | `GO_LIVE_FINANCEIRO_FISCAL.md` e auditoria BL2 | NÃO COMPROVADO para operação fiscal real |
| venda → fiscal | enqueue opcional e distinto online/offline | Edge/RPC service role validada por loja | flag offline default desligada; nenhum E2E remoto nesta rodada | NÃO COMPROVADO |
| compra/NF-e antes de entrada | fluxo de conferência explícita e entrada idempotente/kardex | gerente/loja | migrations 296 e `20260801120000` | PASS estático forte |
| produto sem fornecedor/custo | schema aceita relações/campos opcionais em pontos do catálogo; UI contém validações próprias | regras divididas entre UI e DB | fonte oficial externa ausente | NÃO COMPROVADO |
| limite de crédito parametrizável | migration 298 implementa modo/limite por loja no v4 | RPC canônica | sem teste DB executado nesta rodada | NÃO COMPROVADO |
| dashboard/relatórios | admin dashboard lê `vendas`; gerente vendas/KPIs e auditoria leem `venda_eventos`; relatórios leem `vendas/itens_venda` | RLS/RPC por loja | consumidores comprovados em código | FAIL (P1, múltiplas fontes) |
| cross-loja/RLS/RBAC | policies por loja e validações internas nas RPCs críticas | authenticated + predicado de loja | testes locais de UI não provam catálogo remoto de grants/policies | NÃO COMPROVADO em runtime |

### 8.4 Mapa das regras e fontes de verdade

| Conceito | Fonte que deve ser tratada como autoridade pela arquitetura existente | Fontes derivadas/concorrentes observadas | Estado |
|---|---|---|---|
| venda e itens | `vendas` + `itens_venda` gravadas pela RPC canônica | `venda_eventos` é ledger/projeção | coerência parcial; falta constraint entre cabeçalho e linhas |
| pagamentos da venda | `vendas_pagamentos` (fallback legado em `vendas.forma_pagamento`) | cálculos de caixa mantêm dois caminhos | compatível, mas aumenta superfície de reconciliação |
| caixa esperado | `calcular_valor_sistema_dinheiro_caixa` / modelo E(c) | `caixas.saldo_atual` é cache operacional, não SSOT | decisão arquitetural explícita |
| contas a receber | `contas_receber` + `liquidacoes_receber` | dashboards/clientes derivados | saldo do título é coerente; efeito de caixa ausente |
| contas a pagar | `contas_pagar` + `contas_pagar_pagamentos` | relatórios/UI | saldo do título é coerente; efeito de caixa ausente |
| comissão | `comissoes_vendedores` derivada do trigger | configurações, regras por funcionário e produto | derivação não dispara no caminho canônico e snapshot é incompleto |
| estoque | `estoque` para saldo + kardex/logs para trilha | tabelas auxiliares de baixas/reposições | forte em código; runtime não comprovado |
| fiscal | `documentos_fiscais_pendentes/eventos` | venda/ledger | stub/opt-in; fiscal real não certificado |
| faturamento gerencial | nenhuma fonte única consumida por todas as telas | admin usa `vendas`; gerente/auditoria usam `venda_eventos` | FAIL de SSOT de leitura |

### 8.5 Reconciliação financeira

```text
Venda
  ├─ itens/preço/desconto/custo snapshot ........ parcial PASS
  ├─ pagamentos da venda ........................ parcial PASS
  ├─ caixa em dinheiro da venda ................. parcial PASS (E(c) + cache)
  ├─ contas a receber da venda .................. parcial PASS
  │    └─ liquidação posterior → caixa .......... FAIL
  ├─ comissão ................................... FAIL
  ├─ estoque/kardex ............................. NÃO COMPROVADO em runtime
  ├─ fiscal ..................................... NÃO COMPROVADO (stub/flags)
  └─ cancelamento/devolução
       ├─ venda/estoque/ledger ................... parcial PASS estático
       ├─ recebimento já realizado .............. FAIL
       └─ crédito do cliente auditado como PIX .. FAIL
```

Não é possível seguir qualquer R$ 1,00 recebido ou pago depois da venda até um movimento de caixa: as RPCs financeiras persistem o título e seu histórico, mas não a entrada/saída de caixa. Também não é possível provar que toda venda gera comissão, porque o trigger atual não é disparado por inserção direta em estado concluído.

### 8.6 Achados priorizados, causa raiz, risco, menor correção e teste de regressão

| ID | Sev. | Problema e causa raiz comprovada | Risco | Menor correção possível (não aplicada) | Teste obrigatório |
|---|---|---|---|---|---|
| FIN-298-01 | P0 | `registrar_liquidacao_receber` atualiza AR sem entrada de caixa/ledger; fronteiras foram implementadas separadamente | recebimento existe financeiramente, mas não no caixa/fluxo | dentro da mesma transação, registrar movimento financeiro/caixa segundo regra oficial de forma e caixa; se a regra não exigir caixa físico, registrar ledger financeiro correlacionado | integração DB: liquidação parcial/total por forma, retry e rollback, conciliando CR, histórico, caixa e ledger |
| FIN-298-02 | P0 | pagamento de AP não gera saída de caixa/ledger | fluxo e saldo diário superestimados | mesma estratégia incremental do item anterior, sem nova fonte paralela | integração DB: AP parcial/total, excesso, retry, concorrência e caixa fechado |
| FIN-298-03 | P0 | comissão depende de `AFTER UPDATE OF status`; escritores inserem `CONCLUIDA` | comissão omitida silenciosamente em vendas online/offline | adequar o trigger ao evento real de persistência ou chamar cálculo uma vez no escritor canônico, mantendo `UNIQUE`/idempotência | venda online e sync geram exatamente uma comissão; retry não duplica; cancelamento/devolução seguem regra oficial |
| FIN-298-04 | P0 | cancelamento zera/cancela CR parcial, mas não estorna liquidações nem dinheiro já recebido | dinheiro recebido fica sem contrapartida de estorno | calcular somente o recebido, gerar estorno correlacionado por forma e preservar histórico imutável | venda a crédito, recebimento parcial, cancelamento, retry e saldo final zero/reconciliado |
| FIN-298-05 | P1 | comissão por margem usa custo atual do produto e salva só a regra/percentual do último item para um total multi-item | alteração histórica muda a regra aplicada e a trilha não reconstrói o cálculo | usar `custo_unitario_snap` e persistir detalhe por item ou snapshot JSON mínimo no registro existente | venda multi-item com regras distintas; alterar custo/regra depois e provar resultado imutável |
| FIN-298-06 | P1 | devolução `CREDITO_CLIENTE` é auditada em `devolucoes.forma_pagamento='PIX'` | relatórios por forma e auditoria mentem | persistir a forma real suportada (ajustando constraint existente) ou separar natureza do ajuste sem fingir PIX | devolução em crédito não aparece como PIX e reconcilia saldo do título |
| FIN-298-07 | P1 | admin dashboard usa `vendas`; gerente/auditoria usam `venda_eventos` | divergência quando projeção falta/atrasa ou cancelamento é interpretado diferente | escolher uma leitura canônica e fazer as demais derivações explicitamente reconciliadas | dataset controlado com venda, sync, cancelamento e devolução produz mesmos KPIs em todas as telas |
| FIN-298-08 | P1 | não existe guarda relacional entre total/desconto do cabeçalho e soma dos itens | cabeçalho e linhas podem divergir apesar dos CHECKs locais | validar na única RPC escritora e no verificador de consistência, evitando trigger global se desnecessário | payload divergente deve abortar atomicamente; centavos e quantidade fracionada cobertos |
| FIN-298-09 | P1 | nenhuma reabertura explícita de caixa foi encontrada | requisito operacional sem implementação/prova | não implementar até obter a regra oficial; documentar se “novo turno” substitui reabertura | cenário oficial de caixa fechado, autorização, data operacional e trilha |
| FIN-298-10 | P2 | testes financeiros executados são majoritariamente adapters/UI/mocks; não cobrem efeitos multi-tabela reais | regressões SQL podem passar com suíte verde | adicionar harness DB local/staging isolado, sem bypass administrativo no fluxo testado | matriz transacional completa com asserts em todas as tabelas afetadas |

Todas as correções propostas são incrementais e preservam as tabelas/RPCs atuais. Nenhuma nova camada ou engine é recomendada sem necessidade. Para FIN-298-01/02/04/09, a regra oficial ausente deve ser anexada e decidida antes de qualquer mudança.

### 8.7 Evidência executada nesta rodada

- `node backend/scripts/sync-outbox-contract-smoke.mjs`: **PASS**.
- `npm run check:edge -w backend`: **PASS**.
- `npx vitest run` em 10 arquivos focados de venda, cancelamento, AR/AP, comissão e relatórios: **10 arquivos / 32 testes PASS**.
- Esses testes provam validação/adapters/contratos mockados; **não** provam os efeitos multi-tabela de um Postgres/Supabase real.
- Nenhuma query de mutação foi executada contra produção e nenhuma migration remota foi aplicada.

### 8.8 Itens não comprovados e risco residual

- requisitos linha a linha dos dois documentos oficiais ausentes;
- catálogo real atual de funções, triggers, constraints, grants e policies no banco remoto;
- reconciliação dos dados reais existentes (`vendas`, eventos, pagamentos, caixa, AR/AP, comissões, estoque e fiscal);
- concorrência real de duas sessões, timeout depois do commit e retry de rede;
- virada de dia/fuso em E2E;
- operação fiscal real e cancelamento fiscal;
- regra contábil oficial para recebimento/pagamento não-dinheiro e sua relação com caixa físico;
- regra oficial de comissão sobre venda realizada versus recebida;
- regra oficial de reabertura de caixa.

### 8.9 Ordem recomendada das correções

1. Anexar os dois documentos oficiais e fechar as ambiguidades de recebimento/pagamento, comissão e reabertura.
2. Corrigir FIN-298-01, FIN-298-02 e FIN-298-04 em uma cadeia financeira transacional testável.
3. Corrigir FIN-298-03 e FIN-298-05, incluindo cancelamento/devolução de comissão conforme regra oficial.
4. Unificar/reconciliar as leituras de KPI (FIN-298-07).
5. Fortalecer a identidade cabeçalho × itens (FIN-298-08) e a forma de devolução (FIN-298-06).
6. Executar matriz DB local/staging isolada e somente então repetir reconciliação read-only dos dados reais.
7. Reavaliar o veredito; não promover `PASS` a partir de existência de código ou teste mockado.

### 8.10 Resposta final da Issue #298

> É possível afirmar, com evidência, que os números financeiros do Jinlong são consistentes e que suas principais regras de negócio possuem uma única fonte de verdade?

**NÃO.** Recebimentos e pagamentos posteriores não fecham com caixa/fluxo; a comissão pode não ser criada no caminho canônico; cancelamento após recebimento parcial não fecha o estorno; dashboards usam fontes diferentes; e os requisitos oficiais e o estado remoto do banco não estavam disponíveis para prova completa.

---

## 9. PLANO DE REMEDIAÇÃO — AUDITORIA CONTÁBIL E REGRAS DE NEGÓCIO

**Status histórico desta seção:** plano aprovado e parcialmente executado nas Fases 1A, 1B, 2A e 2B. O estado executado, as evidências e os bloqueios posteriores são autoritativamente consolidados no §10. Não interpretar os verbos futuros desta seção como estado atual.

**Princípios de execução:** corrigir causa antes de consumidor; uma autoridade por conceito; histórico financeiro append-only; idempotência obrigatória; transação única por comando; isolamento por loja validado dentro da RPC; nenhuma inferência automática sobre dados antigos; migrations imperativas criadas pelo comando oficial somente após aprovação.

### 9.1 Regras de negócio aprovadas

Os arquivos `Especificação de Alterações e Melhorias do Sistema.pdf` e `Princípios-de-Engenharia.txt` continuam ausentes do checkout. Essa ausência permanece como lacuna documental, mas o dono aprovou explicitamente em 2026-08-13 as oito regras abaixo para esta remediação; elas passam a ser a autoridade de execução até que documento oficial posterior as substitua formalmente.

| ID | Regra aprovada | Efeito obrigatório | Status |
|---|---|---|---|
| DB-01 | Todas as formas integram o realizado financeiro; somente `DINHEIRO` afeta gaveta | separar fluxo financeiro de espécie | APROVADA — Opção A |
| DB-02 | AR/AP em dinheiro exigem caixa aberto explicitamente identificado; seleção automática só quando houver exatamente um elegível | nunca reutilizar/reabrir caixa original | APROVADA — Opção B |
| DB-03 | AP pago com dinheiro da gaveta usa sangria autorizada e correlacionada | um único escritor do saldo físico | APROVADA — Opção C |
| DB-04 | Comissão nasce integralmente na venda concluída | não depende de recebimento nesta etapa; exatamente uma comissão | APROVADA — Opção A |
| DB-05 | Cancelamento estorna integralmente; devolução estorna proporcionalmente; troca separa origem/substituta; comissão paga recebe ajuste negativo | histórico append-only | APROVADA — Opção A |
| DB-06 | KPIs separados: vendas brutas, líquidas, recebido, saldo a receber, entradas, saídas, espécie esperada e margem por custo histórico | transações são fonte; `venda_eventos` reconcilia/audita | APROVADA — Opção A |
| DB-07 | “Reabrir” cria novo turno excepcional vinculado | turno fechado nunca volta a `ABERTO` | APROVADA — Opção B |
| DB-08 | Gerente ativo somente na própria loja; dono/admin conforme RBAC; motivo e auditoria obrigatórios; sem janela temporal nesta fase | proibir cross-loja para gerente; não criar regra de dia/virada | APROVADA COM ALTERAÇÃO |

**Decisão arquitetural já existente que deve ser preservada:** `docs/architecture/inventario_financial_autoridade.md` separa `financial` de `cash`, e `docs/adr/ADR-caixa-contrato-financeiro-pos-cancelamento.md` define `calcular_valor_sistema_dinheiro_caixa` como autoridade do esperado em espécie. Portanto, `movimentacoes_caixa` permanece ledger de sangria/suprimento/estorno operacional; não deve receber novos tipos de venda, AR ou AP sem um novo ADR explícito.

### 9.2 Causa estrutural compartilhada e arquitetura-alvo

FIN-298-01, FIN-298-02 e FIN-298-04 compartilham a mesma causa: os históricos financeiros terminam no domínio `financial` sem correlação idempotente com a liquidez/caixa. A correção deve ser única:

```text
Comando financeiro com idempotency_key
  → RPC financeira canônica (lock + auth + loja)
    → histórico append-only do próprio domínio
      AR: liquidacoes_receber
      AP: contas_pagar_pagamentos
    → atualização do saldo do título
    → efeito em caixa físico somente se forma=DINHEIRO e houver caixa autorizado
    → leitura de fluxo financeiro deriva dos históricos, não do cache do caixa
    → auditoria por correlação/origem/reversão
```

Não criar tabela genérica de lançamentos na primeira correção. Os históricos existentes são a fonte de verdade de realizado financeiro; `calcular_valor_sistema_dinheiro_caixa` continua sendo a API do esperado em dinheiro; `caixas.saldo_atual` continua cache/contador físico; `movimentacoes_caixa` continua restrita a operações do caixa. Se DB-01 exigir um razão contábil geral além desses históricos, isso é expansão de escopo e requer ADR próprio.

### 9.3 Plano por achado

#### FIN-298-01 — AR liquidado sem caixa/fluxo (P0)

1. **Problema:** `registrar_liquidacao_receber` insere em `liquidacoes_receber` e reduz `contas_receber.valor_aberto`, mas encerra a transação sem correlação com caixa físico ou fluxo consolidado.
2. **Evidência:** `backend/supabase/migrations/112_clientes_contas_receber_loja_isolamento.sql:204-272`; adapter `pdv-importados/app/admin/financeiro/receivableWriter.ts:62-88`; auditoria §8.3/FIN-298-01.
3. **Regra esperada:** DB-01/DB-02 aprovadas: todas as formas entram no realizado; somente `DINHEIRO` afeta um caixa aberto explicitamente identificado, com seleção automática apenas se houver exatamente um elegível.
4. **Causa raiz:** o contrato da RPC não recebe `idempotency_key`, caixa ou origem; a tabela de liquidações não modela correlação/reversão; o inventário de autoridade proíbe hoje a aresta `financial → cash`.
5. **SSOT:** `liquidacoes_receber` para recebimento realizado; `contas_receber` para saldo; `calcular_valor_sistema_dinheiro_caixa` para espécie; uma única RPC financeira orquestra a transação.
6. **Solução mínima:** estender a RPC e o histórico com `idempotency_key`, `loja_id` derivada/validada, `caixa_id` opcional, `origem` e campos de reversão; `UNIQUE` por escopo estável (`titulo_id`, `idempotency_key`). Para dinheiro aprovado por DB-01/02, bloquear o caixa, validar `ABERTO`/mesma loja, atualizar o contador físico e incluir as liquidações em dinheiro na fórmula E(c) exatamente uma vez. Para PIX/cartão, apenas o fluxo financeiro é afetado.
7. **Componentes afetados:** migration da RPC/tabela; `receivableWriter.ts`; tipos Supabase gerados; action/modal que coleta/seleciona caixa para dinheiro; função E(c).
8. **Impacto arquitetural:** preserva tabelas e RPC existentes; fortalece SSOT e idempotência; cria parâmetros contratuais e possível aresta controlada para `cash`; exige migration e pequena mudança frontend; não afeta sync de venda; cross-loja deve ser recusado na RPC.
9. **Histórico:** operações futuras ficam corretas. Liquidações antigas são detectáveis por ausência de `idempotency_key/caixa_id`, mas não é seguro inferir caixa. Backfill automático é proibido; repair somente com fonte externa/turno comprovado. Script de diagnóstico read-only deve separar `SEM_CAIXA_COMPROVÁVEL`, `CAIXA_UNÍVOCO` e `AMBÍGUO`. Repair deve usar chave determinística e `ON CONFLICT`/registro de execução para impedir dupla contabilização.
10. **Testes antes do código:** contrato exige key; parcial R$40 de R$100 deixa R$60; total posterior deixa zero; retry retorna o mesmo resultado sem segunda linha; duas sessões com keys diferentes serializam e nunca excedem saldo; mesma key com payload diferente falha; dinheiro em caixa aberto aumenta E/cache uma vez; PIX não altera espécie; caixa fechado/cross-loja/usuário inativo falham; erro após insert simulado faz rollback total; E2E mostra histórico e saldo reconciliados.

#### FIN-298-02 — AP pago sem caixa/fluxo (P0)

1. **Problema:** `registrar_pagamento_contas_pagar` grava `contas_pagar_pagamentos` e atualiza o título sem saída correlacionada.
2. **Evidência:** `backend/supabase/migrations/20260806002925_299_tb07_pagamento_contas_pagar_limite_saldo.sql:49-125`; `pdv-importados/app/admin/financeiro/payablePayment.ts:24-47`; auditoria FIN-298-02.
3. **Regra esperada:** DB-01/02/03 aprovadas: toda forma entra no realizado; dinheiro exige caixa explícito e AP em espécie usa sangria autorizada correlacionada.
4. **Causa raiz:** simétrica ao AR: contrato sem key/caixa/origem e ausência deliberada de aresta para cash.
5. **SSOT:** `contas_pagar_pagamentos` para pagamento realizado; `contas_pagar` para saldo/status; E(c) apenas para dinheiro autorizado.
6. **Solução mínima:** aplicar o mesmo contrato de correlação/idempotência do AR, sem função genérica concorrente. Bloquear a conta com `FOR UPDATE` (o corpo atual seleciona sem lock), validar saldo, inserir histórico e atualizar título numa transação. Se DB-03 permitir gaveta, debitar com guarda de saldo e caixa aberto, e subtrair o histórico DINHEIRO na fórmula E(c) uma vez.
7. **Componentes:** migration AP; `payablePayment.ts`; UI apenas para caixa/origem; tipos; E(c) condicional.
8. **Impacto:** preserva arquitetura; compartilha convenções, não implementação duplicada; altera contrato; exige migration/frontend; sem sync/offline; validação cross-loja dentro da RPC.
9. **Histórico:** pagamentos antigos detectáveis, mas caixa não inferível. Sem backfill automático. Repair segue a mesma classificação e chave determinística do AR. Contas com `valor_pago` diferente da soma do histórico devem ser bloqueadas para análise, não “corrigidas” silenciosamente.
10. **Testes:** parcial/total; excesso; retry; duas sessões concorrentes no último saldo; dinheiro insuficiente/caixa fechado; PIX/transferência sem efeito em espécie; rollback; cross-loja; soma de pagamentos = `valor_pago`; fluxo consolidado recebe uma saída.

#### FIN-298-03 — comissão não nasce no fluxo canônico (P0)

1. **Problema:** vendas são inseridas já `CONCLUIDA`, mas `trg_registrar_comissao` executa somente `AFTER UPDATE OF status`; um trigger `AFTER INSERT` também seria cedo demais porque os itens são inseridos depois do cabeçalho.
2. **Evidência:** migration 261 em `backend/supabase/migrations/20260711020053_261_comissoes_vendedores_regra_e_congelamento.sql:39-42,245-248`; inserção do cabeçalho antes dos itens em migration 300, linhas 271 em diante; offline `registrar_venda_com_itens` em migration 014; auditoria FIN-298-03.
3. **Regra esperada:** DB-04/05 aprovadas: comissão integral na conclusão; estorno integral no cancelamento, proporcional na devolução, operações separadas na troca e ajuste negativo append-only se já paga.
4. **Causa raiz:** o gerador está acoplado a uma transição de estado que os escritores atuais não realizam e não ao ponto em que a venda completa (itens + pagamentos) já existe; exceções são engolidas, tornando falha silenciosa.
5. **SSOT:** uma função PostgreSQL idempotente `processar comissão da venda` deve concentrar cálculo; os escritores canônicos a chamam ao final da mesma transação no evento aprovado por DB-04. Não duplicar cálculo em frontend/Edge.
6. **Solução mínima:** extrair o corpo do trigger para função chamável por `venda_id`, com retorno observável e `UNIQUE (venda_id, operador_id)`; chamá-la ao fim da RPC v4 e de `registrar_venda_com_itens`, depois de itens/pagamentos/AR. Remover ou reduzir o trigger legado somente após provar que nenhum escritor depende dele. Não usar `AFTER INSERT vendas`.
7. **Componentes:** migration comissão; RPC v4 vigente; `registrar_venda_com_itens`; smoke sync; diagnósticos/observabilidade. Frontend não deve calcular comissão.
8. **Impacto:** preserva DB-led; reduz duplicação; altera internamente dois escritores; exige migration e mudança Edge somente se a assinatura offline mudar (preferência: não mudar); cross-loja derivada do caixa; falha deve ser observável. Decidir se comissão pode abortar venda ou gerar pendência auditável.
9. **Histórico:** vendas `CONCLUIDA` sem linha são detectáveis por `LEFT JOIN`. Backfill é possível somente quando regra/custo histórico puder ser reconstruído. `UNIQUE` evita duplicação. Vendas com comissão existente nunca devem ser recalculadas automaticamente.
10. **Testes:** online e offline geram exatamente uma linha; retry da venda/key não duplica; venda multi-item só calcula após todos os itens; falha controlada gera comportamento decidido/alerta; cross-loja; venda sem regra; comissão fixa/percentual; concorrência de duas chamadas; cancel/devolução conforme DB-05.

#### FIN-298-04 — cancelamento após recebimento parcial (P0)

1. **Problema:** cancelamento marca CR `CANCELADO/0`, mas preserva liquidações positivas sem lançar compensações nem devolver o dinheiro.
2. **Evidência:** `backend/supabase/migrations/20260806090414_303_ssot04_kardex_cancelamento_devolucao.sql:35-80`; liquidações append-only atuais na migration 112; auditoria FIN-298-04.
3. **Regra esperada:** pagamentos históricos não podem ser apagados; DB-01/02 exigem compensação por forma e efeito físico somente para dinheiro em caixa explicitamente identificado. Cancelamento fiscal continua separado.
4. **Causa raiz:** cancelar trata `valor_aberto`, não o valor já liquidado; o histórico não possui tipo/reversão; não existe idempotency key do cancelamento ligada às liquidações.
5. **SSOT:** liquidações originais + linhas compensatórias vinculadas; RPC de cancelamento continua orquestradora da venda/estoque/AR/caixa/evento numa transação.
6. **Solução mínima:** adicionar semântica append-only (`RECEBIMENTO`/`ESTORNO`, `liquidacao_origem_id`, key, caixa/origem) ao histórico; no cancelamento, bloquear venda, CR, liquidações e caixa; calcular `recebido líquido`; criar uma compensação por recebimento/forma; nunca deletar/reescrever a linha original. O saldo aberto pode ir a zero/status cancelado somente depois dos estornos. Reusar o mesmo componente de efeito físico definido em FIN-298-01.
7. **Componentes:** migration do histórico/RPC de cancelamento; action de cancelamento apenas se precisar escolher destino/caixa; timeline financeira; tipos.
8. **Impacto:** fortalece auditoria/idempotência; não cria segundo ledger; altera contrato de cancelamento possivelmente; exige migration; sync não cancela hoje, portanto sem mudança salvo requisito; isolamento por loja obrigatório.
9. **Histórico:** detectar `vendas.status='CANCELADA'` com soma de recebimentos líquida positiva e sem compensação. Repair é necessário se houver casos; não pode escolher forma/caixa sem evidência. Repair idempotente por `cancelamento:{venda_id}:liquidacao:{id}` e deve provar soma líquida zero sem duplicar caixa.
10. **Testes:** venda R$100, recebimentos R$30 DINHEIRO + R$20 PIX, cancelamento cria duas compensações, CR cancelado, líquido zero, espécie reduz somente R$30; retry idêntico; cancel concorrente com nova liquidação serializa; caixa fechado segue regra decidida; falha em estoque/caixa reverte tudo; nenhuma linha original é alterada/apagada.

#### FIN-298-05 — comissão usa custo atual e snapshot agregado insuficiente (P1)

1. **Problema:** cálculo consulta `produtos.preco_custo`; registro agregado guarda somente uma `regra_id/percentual_aplicado`, embora itens possam usar regras diferentes.
2. **Evidência:** migration 261 linhas 72, 217-228; a própria nota assume uma única regra; migration 300 já grava `itens_venda.custo_unitario_snap` a partir do servidor.
3. **Regra esperada:** custo histórico é `custo_unitario_snap`; DB-04/05 fixam comissão na venda concluída e compensações pós-venda append-only.
4. **Causa raiz:** evolução das regras por item foi comprimida no schema legado de uma linha agregada e o cálculo não migrou para o snapshot já existente.
5. **SSOT:** item vendido (`itens_venda`) fornece preço/custo histórico; função canônica de comissão escolhe regra; `comissoes_vendedores` guarda total e um snapshot verificável do cálculo.
6. **Solução mínima:** trocar custo atual por `iv.custo_unitario_snap`; adicionar `calculo_snapshot jsonb` versionado à linha existente contendo por item: item/produto, quantidade, base, custo snap, regra, percentual/fixo e comissão. Não criar tabela de detalhe inicialmente; reavaliar somente se consultas relacionais por item forem requisito.
7. **Componentes:** mesma migration/função de FIN-298-03; tipos e tela de detalhe somente para exibir auditoria se solicitado.
8. **Impacto:** preserva agregado atual; fortalece SSOT/histórico; adiciona coluna/contrato de leitura; sem frontend para calcular; cobre online/offline pelo mesmo escritor.
9. **Histórico:** venda sem `custo_unitario_snap` ou regra histórica inequívoca é `NÃO RECONSTRUÍVEL`. Backfill somente para vendas com snapshots/regra histórica suficientes; não recalcular com configuração atual. Linhas existentes ganham `snapshot_status='LEGADO_NAO_COMPROVADO'` ou permanecem nulas, conforme migration aprovada.
10. **Testes:** dois itens com regras diferentes; alteração posterior de custo/regra não muda comissão; custo null não vira zero silenciosamente; snapshot soma exatamente o total; arredondamento por item e agregado; retry mantém snapshot original.

#### FIN-298-06 — crédito do cliente auditado como PIX (P1)

1. **Problema:** ramo `CREDITO_CLIENTE` reduz AR, mas insere `devolucoes.forma_pagamento='PIX'`.
2. **Evidência:** migration 303 linhas 203-209; auditoria FIN-298-06.
3. **Regra esperada:** comprovado que não é PIX; nomenclatura contábil final deve ser validada no documento oficial.
4. **Causa raiz:** constraint/domínio de `devolucoes.forma_pagamento` não suportava crédito do cliente; o escritor usou um valor aceito para atravessar o schema.
5. **SSOT:** `venda_pos_venda_operacoes.forma_estorno` já guarda `CREDITO_CLIENTE`; `devolucoes` deve preservar a mesma natureza, não traduzir.
6. **Solução mínima:** ampliar o domínio/constraint existente e persistir `CREDITO_CLIENTE`; não criar coluna paralela.
7. **Componentes:** migration de constraint e RPC `devolver_ou_trocar_venda`; leitores/filtros/tipos que enumeram formas.
8. **Impacto:** reduz duplicação e mentira semântica; altera enumeração contratual; exige migration e possível ajuste UI; sem sync; loja permanece derivada da venda.
9. **Histórico:** detecção exata por `venda_pos_venda_operacoes.forma_estorno='CREDITO_CLIENTE'` + `devolucoes.operacao_id` + forma PIX. Repair é `UPDATE` idempotente apenas desse conjunto; antes/depois contar mesmas linhas/valores e provar que PIX legítimo não é tocado.
10. **Testes:** crédito persiste crédito; PIX legítimo continua PIX; repair fixture distingue ambos; relatórios por forma reclassificam sem alterar valor total; retry não duplica devolução.

#### FIN-298-07 — KPIs com `vendas` e `venda_eventos` (P1)

1. **Problema:** admin/relatórios leem transações; gerente/auditoria leem ledger. A RPC de eventos soma `SALE_REGISTERED` separadamente de cancelamentos e não representa por si só faturamento líquido/devoluções.
2. **Evidência:** `pdv-importados/app/admin/dashboard/page.tsx:166-179`; `app/gerente/actions.ts:45`; `app/gerente/vendas/actions.ts:172`; `app/admin/auditoria/actions.ts:140,182`; migration 264 de KPIs do ledger; relatórios da migration `20260809163502`.
3. **Regra esperada:** DB-06 aprovada: métricas separadas de vendas brutas/líquidas, recebido, saldo a receber, entradas, saídas, espécie esperada e margem histórica.
4. **Causa raiz:** o ledger foi criado como projeção/auditoria e depois adotado por uma tela gerencial, enquanto relatórios legados permaneceram transacionais; não há contrato canônico de métricas.
5. **SSOT:** tabelas transacionais (`vendas`, `itens_venda`, `vendas_pagamentos`, `devolucoes`, AR/AP) são autoridades de estado/valor; uma única família de RPCs materializa os KPIs; `venda_eventos` permanece ledger de auditoria e reconciliação, não segunda regra financeira.
6. **Solução mínima:** especificar dicionário de métricas; criar/ajustar uma RPC canônica por conjunto de KPIs; migrar consumidores um a um; manter query de reconciliação transação × evento e alerta de divergência. Não alterar tabelas de origem.
7. **Componentes:** migrations das RPCs; actions de admin/gerente/relatórios; tipos; testes de contrato. Tela de auditoria continua em eventos.
8. **Impacto:** fortalece SSOT e reduz duplicação; altera contratos de leitura, não de escrita; migration e frontend; online/offline cobertos quando ambos persistem `vendas`; cross-loja dentro da RPC; índices somente após `EXPLAIN`.
9. **Histórico:** sem backfill se transações estão completas. Eventos ausentes devem ser diagnosticados/reparados separadamente com key determinística, nunca somados duas vezes. Divergência histórica impede ativar novo KPI até reconciliar.
10. **Testes:** dataset com online/offline, split, cancelamento total, devolução parcial, troca, virada de dia e duas lojas; cada KPI tem fórmula e valor esperado; todos os consumidores retornam o mesmo número; ledger reconciliado; performance medida; RLS/cross-loja.

#### FIN-298-08 — guarda cabeçalho × soma dos itens (P1)

1. **Problema:** o v4 online recalcula itens e compara totais declarados, mas o escritor offline `registrar_venda_com_itens` confia nos totais recebidos; os CHECKs da tabela não garantem igualdade intertabelas nem protegem todos os escritores.
2. **Evidência:** migration 300 valida `FINALIZAR_VENDA_CANONICA_TOTAIS_DIVERGENTES` e persiste valores calculados; migration 014 insere parâmetros; migration `20260731201200` declara explicitamente a dívida intertabelas.
3. **Regra esperada:** total bruto/desconto/líquido deve ser derivado dos itens e ajustes com arredondamento oficial; fórmula exata de acréscimo/global depende dos documentos ausentes.
4. **Causa raiz:** invariantes estão na RPC online e no frontend, não em uma função compartilhada por todos os escritores; CHECK não alcança outras tabelas.
5. **SSOT:** função PostgreSQL pura de cálculo/validação reutilizada pelas RPCs canônicas; persistência continua em `vendas/itens_venda`.
6. **Solução mínima:** extrair/reusar cálculo servidor e validar dentro de `registrar_venda_com_itens` antes do insert. Após persistência, ampliar `verificar_consistencia_venda` para detectar divergência. Evitar trigger intertabela complexo/deferido enquanto dois escritores controlados bastarem.
7. **Componentes:** migration de função + RPC offline e, se necessário, v4; smoke sync; verificador; nenhum cálculo novo no frontend.
8. **Impacto:** preserva arquitetura, reduz duplicação e cobre offline; altera erro do sync (outbox retém divergência); migration; Edge sem mudança de contrato preferencialmente; nenhuma mudança cross-loja.
9. **Histórico:** query de diagnóstico compara soma arredondada dos itens e ajustes ao cabeçalho. Não alterar automaticamente vendas antigas; classificar origem e regra disponível. Repair somente com item/snapshot suficiente, chave/artefato e aprovação contábil.
10. **Testes:** centavos, quantidade com 3 casas, desconto por item/global, acréscimo permitido, split, payload offline divergente aborta atomicamente, retry após correção, venda antiga inconsistente detectada pelo verificador.

#### FIN-298-09 — reabertura de caixa não comprovada (P1)

1. **Problema:** nenhuma implementação de produto foi localizada. A única rotina chamada `reopenCaixaIfNeeded` está em `dev-tools/pdv-stress-client.ts:214-237` e cria um **novo** caixa diretamente; artefato operacional anterior também registra “sem reabertura autorizada”.
2. **Evidência:** busca completa por `reabrir/reabertura/REABERT`; `backend/artifacts/missao3_go_nogo_producao_jinlong_20260718.md:26,43`; ausência em RPC/actions/UI.
3. **Regra esperada:** DB-07/08 aprovadas: criar novo turno excepcional vinculado; turno anterior imutável; usuário ativo; motivo obrigatório; gerente apenas na própria loja; dono/admin conforme RBAC; sem janela temporal.
4. **Causa raiz:** requisito não formalizado no domínio; ferramentas de stress usam “reabrir” como sinônimo incorreto de abrir novo turno.
5. **SSOT:** se “novo turno” vencer, `cashSession.open`/INSERT canônico e vínculo opcional ao turno anterior; se reabrir o mesmo turno vencer, RPC exclusiva + histórico append-only de fechamentos/reaberturas. Nunca frontend direto.
6. **Solução mínima:** RPC de retomada que cria novo turno com vínculo, motivo, ator e loja, sob lock/idempotência; nunca atualizar o status do turno anterior e não introduzir prazo/janela nesta fase.
7. **Componentes:** decisão/ADR; possivelmente migration RPC/auditoria; `cashSession.ts`; UI gerencial; dev-tool; autorização matrix.
8. **Impacto:** exige migration/frontend/RBAC e auditoria; preserva fechamento e reduz risco temporal; não altera sync/offline nesta fase e não introduz regra de virada de dia.
9. **Histórico:** nenhum backfill. Caixas previamente fechados não devem ser marcados como reabertos sem evento real. Eventual repair limita-se a nomenclatura de artefatos, não dados.
10. **Testes:** se proibido, tentativa falha e novo turno mantém fechamento anterior; se permitido, somente perfil/loja/janela corretos, motivo obrigatório, snapshot anterior imutável, concorrência de duas reaberturas gera uma, venda durante transição bloqueada, novo fechamento reconciliado, virada de dia coberta.

### 9.4 Critério de aprovação por achado

| Achado | Problema | Causa | Solução mais simples | SSOT/sem duplicação | Idempotência/auditoria/loja | Testável/reversível | Histórico/dupla contagem |
|---|---|---|---|---|---|---|---|
| 01 AR | comprovado | comprovada | sim, estender ledger/RPC | sim | DB-01/02 aprovadas; key/auditoria/loja obrigatórias | sim | sim; alto risco sem keys |
| 02 AP | comprovado | comprovada | sim, simétrico ao AR + sangria | sim | DB-01/02/03 aprovadas | sim | sim; alto risco sem keys |
| 03 comissão | comprovado | comprovada | sim, função chamada no fim | sim | DB-04 aprovada; falha deve ser observável | sim | backfill parcial; unique evita dupla |
| 04 cancel+AR | comprovado | comprovada | sim, compensação append-only | sim | DB-01/02 aprovadas | sim | repair provável; alto risco |
| 05 snapshot comissão | comprovado | comprovada | sim, JSON versionado | sim | sim | sim | reconstrução limitada |
| 06 crédito=PIX | comprovado | comprovada | sim, corrigir domínio/valor | sim | sim | sim | repair exato/idempotente |
| 07 KPI | comprovado | comprovada | sim, RPC canônica | sim | DB-06 aprovada | sim | sem repair após reconciliação |
| 08 totais | comprovado parcialmente por escritor | comprovada | sim, função compartilhada | sim | sim | sim | repair não automático |
| 09 reabertura | ausência comprovada; regra agora aprovada | causa comprovada | novo turno vinculado | sim | DB-07/08 aprovadas | sim | sem backfill |

As oito células de negócio estão fechadas. A implementação continua condicionada à aprovação explícita deste plano final, ao baseline remoto read-only e aos testes definidos antes de qualquer migration.

### 9.5 Ordem única de execução — versão preliminar arquivada

> Esta sequência foi recalculada após a aprovação de DB-01…DB-08. A versão executável vigente está em §9.8; em caso de divergência, §9.8 prevalece.

#### FASE 0 — decisões, documentos e baseline read-only

- **Objetivo:** obter documentos, assinar DB-01…DB-08, congelar fórmulas e medir dados afetados sem mutação.
- **Achados:** todos; bloqueia especialmente 01/02/04/05/07/09.
- **Dependências:** anexar documentos oficiais; confirmar schema remoto por leitura; reconciliar catálogo de migrations.
- **Componentes:** este SSOT, ADR financeiro/caixa, matriz de autorização, queries diagnósticas versionadas apenas após aprovação do plano.
- **Migrations:** nenhuma.
- **Testes/provas:** contagens de divergências; catálogo de grants/RLS/functions; amostra controlada sem escrita em produção.
- **Risco:** baixo; risco de decisão errada se pulada.
- **Aceite:** todas as decisões assinadas e população histórica quantificada.
- **Rollback:** não aplicável.
- **Não alterar:** produção, schema, dados, regras ou dashboards.

#### FASE 1 — contratos de idempotência e invariantes

- **Objetivo:** preparar fundação usada pelos P0 sem ainda mudar consumidores.
- **Achados:** 01/02/04/08; base para 07.
- **Dependências:** DB-01/02/03 e fórmula monetária oficial.
- **Componentes:** históricos AR/AP, RPCs, função de cálculo/validação de venda, verificador de consistência.
- **Migrations esperadas:** (1) correlação/idempotência/reversão financeira; (2) invariante compartilhada de totais. Criar nomes/versionamento via `supabase migration new` somente na implementação.
- **Testes:** SQL de constraints, mesma key/payload, key/payload divergente, locks, RLS, cross-loja, cálculo de centavos.
- **Risco:** alto, pois altera contratos; deploy compatível em duas etapas (schema aditivo → callers → constraints NOT NULL quando seguro).
- **Aceite:** antigas assinaturas permanecem compatíveis durante rollout ou falham de modo planejado; nenhuma duplicação em concorrência.
- **Rollback:** primeiro desligar callers novos; funções anteriores restituíveis; colunas aditivas preservadas até confirmar ausência de uso.
- **Não alterar:** `movimentacoes_caixa` para virar ledger geral; fiscal; estoque; UI não relacionada.

#### FASE 2 — P0 transacionais AR/AP/cancelamento

- **Objetivo:** fechar dinheiro realizado e compensações na mesma transação.
- **Achados:** 01, 02 e 04.
- **Dependências:** Fase 1 e DB-01/02/03.
- **Componentes:** RPCs AR/AP/cancelamento, E(c) se aplicável, adapters/UI de caixa, timelines.
- **Migrations esperadas:** uma migration de comportamento AR/AP/cancelamento sobre o contrato aditivo; separar em duas se rollback/lock exigir.
- **Testes:** matriz descrita nos achados; fault injection, concorrência e idempotência obrigatórias; E2E por forma.
- **Risco:** P0/alto; possibilidade de dupla contabilização durante rollout. Usar feature gate server-side ou deploy coordenado, nunca dois escritores ativos.
- **Aceite:** para cada comando, soma do histórico, saldo do título, fluxo e espécie reconciliam; retry é no-op sem perder resposta.
- **Rollback:** desativar novo efeito antes de restaurar função; não apagar históricos criados; compensar, nunca deletar.
- **Não alterar:** vendas_pagamentos históricos, eventos fiscais, regra de comissão.

#### FASE 3 — comissão e semântica pós-venda

- **Objetivo:** gerar comissão uma vez com custo/regra históricos e corrigir crédito do cliente.
- **Achados:** 03, 05 e 06.
- **Dependências:** DB-04/05; snapshots de venda; Fase 2 para política de cancelamento/recebimento.
- **Componentes:** função/RPC comissão, dois escritores de venda, schema de snapshot, devolução/enumerações.
- **Migrations esperadas:** (1) comissão canônica + snapshot + invocação; (2) domínio `CREDITO_CLIENTE` — pode ser commit/migration isolada por baixo acoplamento.
- **Testes:** online/offline, multi-item, custo alterado, retry, cancel/devolução, repair fixture de crédito.
- **Risco:** alto para comissão histórica; baixo-médio para forma de devolução.
- **Aceite:** toda venda elegível tem exatamente uma comissão auditável; soma do snapshot fecha; crédito nunca aparece como PIX.
- **Rollback:** manter função anterior disponível durante canário; remover chamadas novas antes de restaurar trigger; coluna snapshot é aditiva.
- **Não alterar:** regra percentual sem decisão; frontend não calcula comissão.

#### FASE 4 — consumidores e KPI

- **Objetivo:** fazer todas as telas consumirem definições únicas.
- **Achados:** 07 e efeitos visuais de 01/02/04/06.
- **Dependências:** DB-06; fases 2/3; reconciliação eventos × transações sem divergência material.
- **Componentes:** RPCs de KPI, actions admin/gerente/relatórios, tipos e labels das métricas.
- **Migrations esperadas:** RPCs canônicas de leitura; índices somente com plano comprovado.
- **Testes:** golden dataset multi-loja/online/offline/pós-venda; período/fuso; comparação de todos consumidores; EXPLAIN/performance.
- **Risco:** médio; números podem mudar corretamente e exigir comunicação operacional.
- **Aceite:** mesmo KPI/filtro retorna mesmo valor em todas as telas; auditoria mostra origem e fórmula.
- **Rollback:** feature flag/read path anterior, mantendo ambos apenas durante janela curta de comparação; não manter duas autoridades após aceite.
- **Não alterar:** ledger de eventos como trilha; dados transacionais.

#### FASE 5 — reabertura e repair histórico

- **Objetivo:** implementar apenas a decisão DB-07/08 e reparar somente casos comprovados.
- **Achados:** 09 e histórico de 01-06/08.
- **Dependências:** fases anteriores estáveis; inventário read-only aprovado; backup e dry-run.
- **Componentes:** possível RPC/UI/auditoria de reabertura; scripts separados por achado; tabela/artefato de execução e checksums.
- **Migrations esperadas:** reabertura apenas se aprovada; nenhuma migration de repair deve misturar schema e dados volumosos sem plano de lock.
- **Testes:** dry-run, reexecução idempotente, contagens antes/depois, amostra manual, rollback compensatório.
- **Risco:** muito alto para repair; executar por lote, janela e loja.
- **Aceite:** cada registro afetado tem classificação, origem, ação e prova; zero dupla contabilização; ambiguidades permanecem não reparadas.
- **Rollback:** repair reversível por linhas compensatórias/mapa de execução; nunca apagar histórico.
- **Não alterar:** registros ambíguos, comissões já pagas sem decisão, caixas fechados sem evento real.

#### FASE 6 — certificação final

- **Objetivo:** repetir a cadeia `REQUISITO → ... → VEREDITO` com ambiente isolado e reconciliação read-only final.
- **Achados:** todos.
- **Dependências:** fases 0-5 e CI/PRs verdes.
- **Componentes:** suíte SQL/RPC, contract tests, E2E, anti-replay, relatórios e SSOT.
- **Migrations:** nenhuma nova; qualquer correção reabre a fase correspondente.
- **Testes:** matriz completa, duas sessões, timeout pós-commit, virada de dia, cross-loja, usuário inativo, fechamento/reabertura, online/offline.
- **Risco:** baixo operacional em staging; leitura de produção sem mutação.
- **Aceite:** critérios DONE abaixo.
- **Rollback:** não aplicável à certificação.
- **Não alterar:** produção durante coleta de prova.

### 9.6 Estratégia preliminar de commits e PRs — substituída por §9.8

Usar **PRs encadeados**, não um PR gigante nem branches totalmente independentes. AR/AP/cancelamento compartilham contrato e devem derivar da mesma base; comissão e KPI dependem dos resultados anteriores. Cada PR precisa ser reversível e não pode incluir repair de produção.

1. `docs(financeiro): fechar decisões da remediação contábil` — documentos/ADRs/matriz, sem código.
2. `test(financeiro): definir contratos de idempotência e reconciliação` — testes inicialmente vermelhos/harness isolado, se a política do repositório aceitar test-first no mesmo PR de implementação; caso contrário, primeiro commit do PR 3.
3. `fix(financeiro): correlacionar liquidações e pagamentos com idempotência` — schema aditivo + RPCs AR/AP.
4. `fix(cancelamento): compensar recebimentos preservando histórico` — depende do PR 3.
5. `fix(vendas): unificar validação servidor de totais` — pode correr após a base documental, mas deve aterrissar antes de KPI.
6. `fix(comissoes): gerar cálculo canônico após venda completa` — depende de DB-04/05.
7. `fix(comissoes): congelar cálculo multi-item pelo snapshot` — pode ser segundo commit/PR do anterior conforme tamanho.
8. `fix(financeiro): preservar crédito do cliente nas devoluções` — pequeno e isolado, mas validar depois do contrato pós-venda.
9. `fix(dashboard): adotar KPIs financeiros canônicos` — último consumidor.
10. `fix(caixa): aplicar decisão de reabertura` — PR separado e somente se aprovada.
11. `ops(financeiro): reparar histórico comprovado` — PR/scripts separados, nunca aplicado automaticamente por merge.
12. `docs(certificacao): registrar reconciliação final`.

Cada PR de banco deve conter: migration gerada pelo CLI, rollback documentado, testes SQL/RPC, diff de grants/RLS, `db reset`/migration list local, advisors, plano de deploy e compatibilidade com o PR anterior. Não misturar deploy remoto, backfill e mudança de aplicação no mesmo passo irreversível.

### 9.7 Resumo executivo do plano

1. **Quantidade:** 4 P0 e 5 P1.
2. **Causas compartilhadas:** ausência de contrato idempotente entre financial e cash (3 achados); comissão ligada ao evento errado e snapshot legado (2); leitura gerencial sem contrato de métricas; invariantes diferentes entre escritores online/offline; reabertura ausente no domínio.
3. **Decisões:** DB-01 a DB-08 aprovadas; permanece apenas a lacuna documental dos dois arquivos oficiais, sem bloquear as regras explicitamente aprovadas acima.
4. **Migrations previstas:** aproximadamente 5-7 migrations de schema/comportamento, criadas somente na execução: contrato financeiro; efeitos AR/AP/cancelamento; totais; comissão/snapshot; crédito do cliente; KPIs; reabertura opcional.
5. **Repair:** provavelmente necessário para cancelamentos com recebimento, comissões ausentes e crédito rotulado PIX; condicionado a diagnóstico. AR/AP antigos sem caixa comprovável não admitem repair automático.
6. **Ordem:** decisões → contratos/invariantes → P0 AR/AP/cancelamento → comissão/pós-venda → KPIs/UI → repair/reabertura → certificação.
7. **PRs:** encadeados e pequenos; repair separado de schema/aplicação.
8. **Risco residual:** regras oficiais ausentes, dados históricos ambíguos, fiscal real fora desta remediação, estado remoto ainda a confirmar e possibilidade de integração externa não versionada.
9. **DONE objetivo:** documentos/decisões assinados; todas as operações críticas possuem key e correlação; testes de concorrência/retry/fault injection passam; AR/AP/caixa/comissão/cancelamento reconciliam por forma; KPIs únicos coincidem em todas as telas; zero divergência inexplicada no dataset de certificação; RLS/cross-loja e grants aprovados; repair executado apenas onde determinístico; SSOT atualizado com evidências e veredito final.

### 9.8 Plano final pós-decisões — versão autoritativa para aprovação

Esta seção substitui a natureza provisória das fases anteriores. A ordem 1–6 continua correta, com dois ajustes:

1. Fase 0 deixa de decidir regras e passa a congelar contratos aprovados e medir o baseline.
2. Reabertura sai da fase de repair e entra na Fase 3 como correção de domínio independente. Fase 5 fica exclusivamente para repair histórico.

#### 9.8.1 Dependências recalculadas

```text
DB-01 + DB-02
  └─ contrato financeiro comum (idempotência, caixa explícito, forma, origem)
       ├─ AR realizado e espécie (FIN-298-01)
       ├─ cancelamento pós-recebimento (FIN-298-04)
       └─ KPIs recebido/entradas/caixa (FIN-298-07)

DB-03 + contrato financeiro comum
  └─ AP ↔ sangria atômica/correlacionada (FIN-298-02)
       └─ KPIs saídas/caixa (FIN-298-07)

invariante de venda completa (FIN-298-08)
  └─ evento correto de comissão (FIN-298-03)
       └─ snapshot e estornos de comissão (FIN-298-05)
            └─ KPIs/margem e repair de comissão

semântica pós-venda
  ├─ cancelamento financeiro (FIN-298-04)
  └─ crédito do cliente sem PIX fictício (FIN-298-06)

DB-07 + DB-08
  └─ novo turno excepcional vinculado (FIN-298-09)
       └─ consumidores de caixa e certificação
```

**Causas compartilhadas consolidadas:**

- **C1 — contrato financeiro incompleto:** FIN-298-01/02/04 e parte de 07. Uma fundação, três comportamentos; não criar implementações isoladas.
- **C2 — evento/snapshot de comissão inadequados:** FIN-298-03/05. Uma função canônica chamada depois da venda completa e reutilizada pelos escritores online/offline.
- **C3 — múltiplas definições de leitura:** FIN-298-07. Consumidores só mudam depois que os fatos financeiros e pós-venda estiverem corretos.
- **C4 — invariantes diferentes por escritor:** FIN-298-08, pré-requisito para comissão e reconciliação offline.
- **C5 — conceito ausente de retomada:** FIN-298-09, resolvido por novo turno vinculado, nunca mutação do fechamento.

#### 9.8.2 Matriz executável final

| Fase | Correção | Dependência | Migration esperada | Testes definidos antes da implementação | Critério de aceite | PR |
|---|---|---|---|---|---|---|
| 0 | Congelar DB-01…08 em ADR/matriz; inventariar schema/grants/RLS e quantificar dados afetados | decisões aprovadas; acesso read-only | nenhuma | queries read-only de contagem/reconciliação; snapshot de catálogo; nenhuma mutação | contratos assinados no SSOT; populações históricas e assinaturas atuais conhecidas | PR-0 `docs(financeiro): congelar regras da remediação contábil` |
| 1A | Contrato comum AR/AP: `idempotency_key`, origem, forma, caixa explícito quando dinheiro, correlação e reversão | DB-01/02/03; baseline | migration aditiva de colunas/constraints/índices/RLS; sem tornar campos novos obrigatórios no primeiro deploy | contrato de key; payload divergente; RLS; cross-loja; usuário inativo; caixa elegível 0/1/N | schema aditivo compatível; unique impede duplicação; nenhum efeito financeiro ainda duplicado | PR-1 `fix(financeiro): adicionar contrato idempotente de liquidações e pagamentos` |
| 1B | Invariante compartilhada de totais para v4 e offline; ampliar verificador | fórmula já aprovada no domínio de venda; round ABNT | migration de função de cálculo/validação e atualização de `registrar_venda_com_itens`/verificador | centavos; quantidade 3 casas; desconto/acréscimo; payload offline divergente; rollback; retry | online/offline aceitam os mesmos totais; divergência aborta antes de qualquer persistência parcial | PR-2 `fix(vendas): unificar validação servidor de totais` |
| 2A | AR: liquidação realizada para todas as formas; `DINHEIRO` vinculado ao caixa escolhido e contado uma vez em E(c)/contador físico | 1A; DB-01/02 | migration de comportamento da RPC AR e fórmula E(c), preservando assinatura antiga apenas durante rollout | parcial/total; retry; concorrência; dinheiro/PIX/cartão; caixa fechado; 0/1/N caixas; timeout/rollback | título + histórico + fluxo fecham; apenas dinheiro altera espécie; mesma key é no-op | PR-3 `fix(financeiro): reconciliar recebimentos com fluxo e caixa` |
| 2B | AP: todas as formas no realizado; dinheiro cria/usa sangria autorizada correlacionada na mesma unidade transacional | 1A; DB-03; mecanismo atual de sangria | migration da RPC AP + correlação AP↔sangria; não criar novo escritor de `saldo_atual` | parcial/total; excesso; retry; aprovação; sangria negada; saldo insuficiente; concorrência; rollback | AP só confirma dinheiro quando a sangria correlata confirma; uma key gera uma saída | PR-4 `fix(financeiro): vincular pagamento em dinheiro à sangria` |
| 2C | Cancelamento após recebimento: compensações append-only por liquidação/forma e espécie | 2A; semântica de reversão de 1A | migration da RPC de cancelamento e tipos/referências de compensação | R$100 com R$30 dinheiro + R$20 PIX; retry; cancel×liquidação concorrentes; caixa fechado; falha de estoque | recebido líquido zero; somente R$30 sai da espécie; originais imutáveis; venda/estoque/AR/evento atômicos | PR-5 `fix(cancelamento): compensar recebimentos preservando histórico` |
| 3A | Comissão canônica no final da venda completa, exatamente uma vez, para v4 e offline | 1B; DB-04 | migration de função explícita idempotente + invocação nos dois escritores; aposentadoria controlada do trigger inválido | online/offline; retry; duas sessões; itens já presentes; regra fixa/percentual; falha observável | toda venda elegível gera exatamente uma comissão após itens; nenhuma duplicação | PR-6 `fix(comissoes): gerar comissão após venda concluída` |
| 3B | Comissão usa `custo_unitario_snap`, snapshot multi-item e ajustes negativos de cancelamento/devolução/troca | 3A; 2C; DB-05 | migration aditiva de snapshot/lançamentos compensatórios e atualização das RPCs pós-venda | multi-item/regras distintas; custo alterado; cancel integral; devolução parcial; troca; comissão já paga | total fecha com snapshot; histórico original imutável; ajuste proporcional reproduzível | PR-7 `fix(comissoes): congelar cálculo e estornar pós-venda` |
| 3C | Persistir `CREDITO_CLIENTE` sem traduzir para PIX | contrato pós-venda estabilizado; DB-01 | migration de constraint/domínio e RPC de devolução | crédito versus PIX legítimo; filtros; retry; fixture de repair | nenhuma operação de crédito nova aparece como PIX; totais não mudam | PR-8 `fix(financeiro): preservar forma crédito nas devoluções` |
| 3D | Novo turno excepcional vinculado ao turno fechado, RBAC aprovado e motivo obrigatório; sem regra temporal | DB-07/08; contrato de abertura/fechamento atual | migration de vínculo/auditoria + RPC canônica; fechamento permanece imutável | gerente mesma loja; gerente cross-loja; dono/admin; usuário inativo; motivo vazio; concorrência; 0/1 turno novo | nunca ocorre `FECHADO→ABERTO`; exatamente um novo turno vinculado; auditoria completa | PR-9 `fix(caixa): criar retomada em novo turno vinculado` |
| 4A | RPCs canônicas dos oito KPIs aprovados, calculadas das transações oficiais | 2A/2B/2C/3B/3C; DB-06 | migration de RPCs de leitura; índices somente após plano/EXPLAIN | golden dataset: venda, split, AR, AP, cancel, devolução, troca, duas lojas, fuso | fórmulas nomeadas; valores reproduzíveis; cross-loja bloqueado; performance aceitável | PR-10 `fix(relatorios): definir kpis financeiros canônicos` |
| 4B | Migrar admin/gerente/relatórios para as RPCs; `venda_eventos` fica apenas auditoria/reconciliação | 4A; reconciliação evento×transação verde | nenhuma ou somente grants finais, se necessários | contract/UI/E2E comparando consumidores; fallback controlado; flags removidas após canário | mesmo KPI/filtro retorna o mesmo valor em todas as telas; nenhuma query financeira concorrente | PR-11 `fix(dashboard): consumir fonte financeira única` |
| 5A | Diagnóstico e repair de AR/AP/cancelamentos históricos determinísticos | Fase 2 certificada | sem migration automática; scripts de dry-run/repair separados | reexecução idempotente; checksum; contagens antes/depois; casos ambíguos preservados | zero dupla contabilização; somente registros comprovados reparados | PR-12 `ops(financeiro): preparar repair histórico determinístico` |
| 5B | Backfill de comissões ausentes/snapshot e reclassificação crédito→PIX quando inequivocamente detectável | Fase 3 certificada | scripts separados; nunca junto das migrations de schema | vendas com/sem snapshot; comissão já existente; crédito ligado por `operacao_id`; dry-run | existentes não recalculadas; não reconstruíveis classificados; PIX legítimo intocado | PR-13 `ops(comissoes): preparar backfill auditável` |
| 6 | Certificação completa e reconciliação final | PRs 1–13 aprovados; staging isolado | nenhuma | SQL/RPC/contrato/E2E; retry; duplo clique; timeout pós-commit; concorrência; virada; cross-loja; offline; fechamento/retomada | definição DONE §9.8.5 integralmente satisfeita e evidenciada | PR-14 `docs(certificacao): fechar remediação contábil` |

#### 9.8.3 Estratégia final de migrations

- Projeto usa migrations imperativas (`schema_paths=[]`); cada arquivo deve ser criado pelo CLI oficial na etapa de implementação, nunca ter timestamp inventado no plano.
- Rollout financeiro em **expand → migrate callers → enforce**:
  1. adicionar campos/constraints compatíveis;
  2. publicar RPCs e callers idempotentes;
  3. observar/reconciliar;
  4. somente depois exigir campos obrigatórios ou remover overloads legados.
- `SECURITY DEFINER` somente onde já for necessário ao contrato, sempre com `search_path`, `auth.uid()`, perfil, usuário ativo, loja e caixa validados internamente; `REVOKE FROM PUBLIC/anon` e grants mínimos explícitos.
- Não misturar schema, repair histórico e aplicação remota no mesmo commit ou migration.
- Não ampliar `movimentacoes_caixa` para AR. No AP em dinheiro, reutilizar a sangria existente e acrescentar correlação, conforme DB-03.
- E(c) recebe termos de AR em dinheiro e sangrias AP exatamente uma vez. Como AP já entra via sangria, não somar novamente `contas_pagar_pagamentos` em E(c).
- Views novas, se inevitáveis, devem ser `security_invoker`; preferência por RPCs com filtro de loja explícito.
- Índices novos apenas para FKs/unique de idempotência e planos de KPI comprovados por `EXPLAIN`.

#### 9.8.4 Catálogo de testes de regressão obrigatório

| Suite | Casos mínimos | Bug impedido |
|---|---|---|
| `financial_contract` | key repetida; key igual/payload diferente; origem/forma/caixa; 0/1/N caixas elegíveis | duplicidade e caixa implícito |
| `ar_rpc` | parcial, total, excesso, dinheiro, PIX, cartão, caixa fechado, cross-loja, usuário inativo | FIN-298-01 |
| `ap_rpc_sangria` | parcial/total, aprovação, saldo insuficiente, sangria rejeitada, retry e rollback | FIN-298-02 |
| `cancel_after_receipt` | combinações de formas, compensações, concorrência cancel×recebimento, falha intermediária | FIN-298-04 |
| `sale_totals` | ABNT/centavos, frações, desconto/acréscimo, online/offline, cabeçalho divergente | FIN-298-08 |
| `commission_creation` | venda insert `CONCLUIDA`, online/offline, retry, concorrência, falha observável | FIN-298-03 |
| `commission_snapshot` | custo alterado, duas regras, cancel, devolução parcial, troca, comissão paga | FIN-298-05 |
| `customer_credit_return` | crédito, PIX legítimo, filtros e repair fixture | FIN-298-06 |
| `cash_resume` | novo turno vinculado, turno antigo imutável, RBAC, ativo, motivo, cross-loja, concorrência | FIN-298-09 |
| `financial_kpis_golden` | oito KPIs, duas lojas, online/offline, pós-venda, AR/AP, período/fuso | FIN-298-07 |
| `fault_injection` | timeout antes/depois de cada efeito crítico e replay da mesma key | commit incerto/dupla contabilização |
| `full_reconciliation_e2e` | venda→pagamento→caixa→AR→comissão→estoque→fiscal stub→cancel/devolução | regressão sistêmica |

Todos os testes de banco devem executar com papéis reais (`authenticated` e perfis), sem usar service role para provar autorização funcional. Service role pode preparar/limpar fixture isolada, nunca ser o ator do cenário de RBAC.

#### 9.8.5 Critério objetivo de DONE pós-decisões

O plano só estará concluído quando:

1. cada recebimento/pagamento tiver origem, forma, loja, usuário, key e correlação reproduzíveis;
2. apenas dinheiro alterar espécie; PIX/cartão nunca alterarem gaveta;
3. AP em dinheiro possuir exatamente uma sangria autorizada correlata;
4. cancelamento preservar originais e produzir compensações exatas por forma;
5. toda venda concluída online/offline produzir exatamente uma comissão;
6. comissão usar custo histórico e snapshot multi-item, com estornos append-only;
7. crédito do cliente nunca ser contabilizado como PIX;
8. os oito KPIs aprovados terem fórmula única e mesmos resultados em todos os consumidores;
9. venda online/offline obedecer à mesma invariante de totais;
10. retomada criar novo turno vinculado, sem mutar o turno fechado, com RBAC/ativo/motivo/loja auditados e sem regra temporal;
11. testes de idempotência, concorrência, timeout pós-commit, cross-loja e E2E passarem;
12. repair histórico ser determinístico, idempotente e separado, deixando ambiguidades explicitamente não reparadas;
13. advisors, grants, RLS, migrations locais e reconciliação final não apresentarem P0/P1 aberto;
14. este SSOT registrar evidências executadas e novo veredito, sem declarar `PASS` por existência de código.

**Estado desta versão do plano:** texto pré-execução, superado quanto ao andamento pelo §10. As Fases 1A–2B foram implementadas localmente; a continuação foi bloqueada pela auditoria adversarial.

---

## 10. Estado executado do bloco financeiro — Fases 1A–2B e auditoria adversarial

**Data de consolidação:** 2026-08-14
**Status autoritativo:** `BLOQUEADO`
**Escopo:** trabalho local versionado das Fases 1A, 1B, 2A e 2B, seguido de auditoria adversarial independente. Nenhuma migration remota, alteração em produção, repair, merge ou certificação financeira foi realizada nessas unidades.

Esta seção substitui, para fins de estado corrente, as descrições prospectivas de §9.5–§9.8. As regras aprovadas de §9.1 permanecem vigentes. Nenhuma fase abaixo deve ser descrita como certificada enquanto os bloqueios adversariais permanecerem abertos.

### 10.1 Histórico de commits

| Fase | Branch | Commit | Status |
|---|---|---|---|
| 1A | `codex/financial-idempotency-contract` | `968cd66d` | IMPLEMENTADA |
| 1B | `codex/sale-totals-invariant` | `1ad8c808` | IMPLEMENTADA |
| 2A | `codex/ar-receipts-reconciliation` | `15277500` | IMPLEMENTADA COM BLOQUEIOS POSTERIORES |
| 2B | `codex/ap-payments-reconciliation` | `1782c1db` | IMPLEMENTADA COM BLOQUEIOS POSTERIORES |

### 10.2 Decisões de negócio vigentes

As oito decisões abaixo estão **APROVADAS**. Elas substituem recomendações ou alternativas anteriores que possam permanecer no histórico da auditoria:

1. **APROVADA — realizado versus gaveta:** toda liquidação AR e todo pagamento AP integram o histórico financeiro realizado; somente `DINHEIRO` altera a gaveta física.
2. **APROVADA — caixa identificado:** operações AR/AP em espécie exigem caixa aberto identificado. Exatamente um elegível pode ser selecionado automaticamente; havendo mais de um, a seleção é explícita. Nunca reutilizar ou reabrir automaticamente o caixa da venda original.
3. **APROVADA — AP em espécie:** dinheiro retirado da gaveta para AP usa sangria autorizada, idempotente e vinculada; AP não é writer independente do contador físico.
4. **APROVADA — nascimento da comissão:** comissão nasce integralmente na venda efetivamente concluída, inclusive quando inserida diretamente como `CONCLUIDA`, exatamente uma vez e sem depender de recebimentos.
5. **APROVADA — pós-venda da comissão:** cancelamento integral estorna integralmente; devolução parcial estorna proporcionalmente; troca preserva operações separadas; comissão paga recebe ajuste negativo append-only.
6. **APROVADA — KPIs:** separar vendas brutas, vendas líquidas, recebido, saldo a receber, entradas, saídas, espécie esperada e margem por custo histórico. Transações oficiais são fonte; `venda_eventos` é ledger de auditoria/reconciliação.
7. **APROVADA — reabertura:** “reabrir” significa criar novo turno excepcional vinculado; o turno fechado permanece imutável e nunca sofre `FECHADO → ABERTO`.
8. **APROVADA — retomada:** sem janela temporal nesta fase; gerente ativo somente na própria loja; dono/admin conforme RBAC; motivo obrigatório; turno anterior imutável; vínculo e auditoria completos.

### 10.3 Fase 1A — contrato EXPAND de idempotência e correlação

**Objetivo:** criar estrutura aditiva para correlação financeira antes de alterar comportamento.
**Causa raiz:** históricos AR/AP não possuíam chave de comando, origem, snapshot de loja/caixa nem referência append-only para compensações; AP também não possuía vínculo formal com sangria.
**Migration:** `backend/supabase/migrations/20260813231034_financial_idempotency_correlation_expand.sql`.

Implementado:

- `liquidacoes_receber`: `idempotency_key`, `origem`, `loja_id`, `caixa_id`, `operacao_tipo`, `operacao_origem_id`;
- `contas_pagar_pagamentos`: os mesmos campos e `movimentacao_caixa_id`;
- UNIQUE parcial `(titulo_id, idempotency_key)` para AR;
- UNIQUE parcial `(conta_id, idempotency_key)` para AP;
- UNIQUE parcial de `contas_pagar_pagamentos.movimentacao_caixa_id`, estabelecendo vínculo 1:1 AP ↔ sangria;
- índices de caixa e operação de origem;
- tipos de operação `RECEBIMENTO/ESTORNO` e `PAGAMENTO/ESTORNO`;
- referências de reversão append-only, sem apagar ou reescrever fatos originais.

Os campos permaneceram nullable para compatibilidade com legado e dados preexistentes. Esta fase não alterou RPCs nem criou efeito financeiro ou físico. O teste estático versionado `financial-idempotency-correlation-contract.test.mjs` passou em **5/5** casos.

**Riscos residuais da unidade:** integridade operacional ainda dependia da migração dos callers; NULL continuou identificando legado; nenhuma correlação histórica foi inferida; a compatibilidade estrutural não garantia por si só replay, autorização ou atomicidade.

### 10.4 Fase 1B — invariantes de totais e centavos

**Causa raiz:** escritores online e offline validavam a mesma venda em camadas diferentes; o frontend aceitava tolerância de até R$ 0,02 e não podia ser a autoridade final.
**Migration:** `backend/supabase/migrations/20260813232133_sale_totals_invariant.sql`.
**SSOT criado:** `internal.calcular_totais_venda(jsonb, numeric)`.

Escritores migrados para consumir o cálculo PostgreSQL:

- `finalizar_venda_transacional_canonica_v4` — venda online;
- `registrar_venda_com_itens` — venda offline/sync-outbox;
- `verificar_consistencia_venda` — diagnóstico posterior.

Fórmula consolidada:

```text
total_bruto = ROUND_ABNT(Σ(preco_original × quantidade), 2)
desconto_itens = ROUND_ABNT(total_bruto - ROUND_ABNT(Σ(preco_unitario × quantidade), 2), 2)
desconto_global = ROUND_ABNT(liquido_itens × percentual / 100, 2)
total_desconto = ROUND_ABNT(desconto_itens + desconto_global, 2)
total_liquido = ROUND_ABNT(total_bruto - total_desconto, 2)
```

- Quantidades admitem até três casas; preços, pagamentos e totais são validados em duas casas.
- PostgreSQL `numeric` e `public.round_abnt` são a autoridade; `number` no frontend calcula apenas UX/previsão.
- Cabeçalho divergente dos itens, inclusive R$ 0,01, é rejeitado.
- Split de pagamentos é somado em `numeric`; pagamento imediato não pode exceder o líquido, e a diferença pode permanecer em `contas_receber` como saldo parcial.
- Retry online/offline preserva o resultado por `venda_id`; testes de falha provaram rollback da transação local.

**Evidência original:** teste PostgreSQL real com `BEGIN/ROLLBACK`, centavos (`0,01`, `0,10`, `1,99`), quantidade fracionária, desconto percentual, múltiplos itens, split, parcial, retry e divergência de R$ 0,01; Vitest do validator/frontend e typecheck passaram.

**Riscos residuais atualizados:** a auditoria adversarial comprovou que o cálculo aceita `preco_unitario > preco_original` e permite compensação entre itens; a regra de acréscimo ainda requer decisão de negócio oficial. Também comprovou que retry offline compara apenas totais, não todo o payload, e que o diagnóstico criado nessa fase possui falha de autorização cross-loja. Portanto, a unidade não está certificada.

### 10.5 Fase 2A — recebimentos AR, realizado e caixa físico

**Causa raiz:** a RPC anterior registrava `liquidacoes_receber` e reduzia `contas_receber.valor_aberto`, mas não usava a chave da Fase 1A, não correlacionava caixa, não atualizava o contador físico e não incluía AR em espécie no caixa esperado.
**Migration:** `backend/supabase/migrations/20260813234233_ar_receipts_reconciliation.sql`.

SSOT pretendido:

| Dimensão | Fonte |
|---|---|
| fato realizado AR | `liquidacoes_receber` |
| saldo do título | `contas_receber.valor_aberto/status` |
| contador físico | `caixas.saldo_atual` |
| esperado em espécie | `calcular_valor_sistema_dinheiro_caixa` |

Fluxo implementado em uma RPC transacional:

```text
lock título → validar ator/perfil/loja/key/payload → validar caixa quando DINHEIRO
→ inserir liquidação → atualizar saldo/status → incrementar contador somente em DINHEIRO
→ retornar criação ou replay
```

- PIX, cartão e demais formas não recebem `caixa_id` nem alteram gaveta.
- DINHEIRO exige caixa aberto da loja; um elegível pode ser automático, N exige seleção explícita.
- Mesma key + mesmo payload retorna replay; payload divergente, inclusive R$ 0,01, é rejeitado.
- Lock do título serializa concorrência; teste manual em duas sessões produziu uma liquidação e um efeito físico.
- Fault injection após o INSERT comprovou rollback de liquidação, título e gaveta.
- Contratos TypeScript passaram a exigir `idempotencyKey`, aceitar `caixaId` e retornar `liquidacaoId`, `idempotentReplay` e `caixaId`.
- Nenhum repair foi feito. Banco local tinha zero liquidações antigas; universo remoto permaneceu `NÃO COMPROVADO`.

**Testes versionados:** total/parcial em PIX e DINHEIRO, dois parciais, retry, payload divergente, caixas 0/1/N, fechado, outra loja, ator sem permissão, R$ 0,01, rollback, saldo e efeito físico. Vitest de reader/writer, Shared Core, typecheck e migration guard passaram.

**Riscos residuais atualizados:** ADMIN ainda consegue liquidar título AR cross-loja; replay devolve estado corrente do título em vez do snapshot resultante do comando original; tipos gerados estão defasados; migration e app exigem deploy coordenado e quebram caller antigo sem key. A prova concorrente não foi preservada como teste automatizado.

### 10.6 Fase 2B — pagamentos AP vinculados à sangria

**Decisão aplicada:** AP em dinheiro não escreve diretamente na gaveta; deve usar a sangria oficial, autorizada e correlacionada.
**Causa raiz:** a RPC anterior registrava pagamento e `valor_pago/status`, mas não utilizava chave, não criava vínculo físico, não era segura contra retry/concorrência e permitia exceção cross-loja.
**Migration:** `backend/supabase/migrations/20260814000154_ap_payments_reconciliation.sql`.

SSOT pretendido:

| Dimensão | Fonte |
|---|---|
| fato realizado AP | `contas_pagar_pagamentos` |
| saldo/estado do título | `contas_pagar.valor_pago/status` |
| sangria | `movimentacoes_caixa` |
| contador físico | `caixas.saldo_atual` |
| esperado em espécie | `calcular_valor_sistema_dinheiro_caixa` |

Fluxo implementado:

```text
lock AP → validar usuário ativo/perfil/mesma loja/key/saldo
→ validar caixa quando DINHEIRO → inserir pagamento
→ chamar registrar_movimentacao(tipo=sangria)
→ se pendente, validar/consumir token gerencial e aprovar_movimentacao
→ vincular pagamento à sangria → atualizar valor_pago/status → commit
```

- Formas não físicas não aceitam caixa e não alteram gaveta.
- DINHEIRO usa `registrar_movimentacao`; AP não se tornou segundo writer de `saldo_atual`.
- Sangria acima do limite exige token válido, ativo, não usado, não expirado e da mesma loja; o consumo integra a transação.
- UNIQUE em `movimentacao_caixa_id` impede uma sangria vinculada a dois pagamentos.
- Concorrência manual em duas sessões retornou o mesmo pagamento e a mesma sangria, com uma retirada.
- Fault injection após efeito físico comprovou rollback de pagamento, movimento, título e contador.
- Contratos TypeScript passaram a exigir `idempotencyKey`, aceitar `caixaId/autorizacaoToken` e retornar IDs de pagamento/sangria e replay.
- Nenhum repair remoto ou inferência de vínculo histórico foi realizado.

**Testes versionados:** total/parcial não físico, total/parcial em dinheiro, retry, payload divergente, caixas inexistente/fechado/outra loja/0/1/N, ator sem permissão, R$ 0,01, vínculo 1:1, reaproveitamento de movimento, token gerencial, rollback e ausência de efeito não físico. Vitest, Shared Core, typecheck e migration guard passaram.

**Riscos residuais atualizados:** chave da sangria é `ap:` + key e perde `conta_id`, gerando colisão legítima entre APs diferentes no mesmo caixa; replay devolve estado corrente; rollout quebra caller antigo; tipos gerados estão defasados; concorrência/timeout não possuem regressão automatizada.

### 10.7 Writers de `caixas.saldo_atual`

Arquitetura pretendida:

```text
caixas.saldo_atual = contador físico mutável
calcular_valor_sistema_dinheiro_caixa = autoridade do valor esperado em espécie
```

| Writer encontrado | Função | Classificação | Justificativa/risco |
|---|---|---|---|
| trigger de venda em dinheiro | creditar venda concluída em espécie | LEGÍTIMO | fato de venda e efeito físico, idempotência depende da venda/trigger |
| `registrar_liquidacao_receber` | creditar AR recebido em espécie | LEGÍTIMO COM BLOQUEIO | escritor previsto para AR; falha cross-loja de ADMIN permanece |
| `registrar_movimentacao` | sangria/suprimento/estorno aprovado | LEGÍTIMO | mecanismo oficial de movimentos operacionais |
| `aprovar_movimentacao` | aplicar movimento anteriormente pendente | LEGÍTIMO | consome autorização e materializa delta uma vez |
| cancelamento/devolução | compensar espécie devolvida | LEGÍTIMO | writers específicos de reversão, não ledgers concorrentes |
| fechamento | registra fechamento/contagem | LEGÍTIMO | não deve recalcular por fórmula concorrente; fechamento normal usa E(c) |
| `recalcular_saldo_caixa` | sobrescrever contador por recálculo | **INDEVIDO** | `SECURITY DEFINER`, executável por authenticated, sem guarda suficiente de ator/loja e fórmula incompleta que omite vendas, AR e devoluções |

### 10.8 Matriz atual de fontes de verdade

| Conceito | Fonte oficial | Consumidores/derivações | Risco atual |
|---|---|---|---|
| total da venda | `internal.calcular_totais_venda` + cabeçalho/itens persistidos | v4, offline, verificador | aceita acréscimo implícito; decisão pendente |
| AR | `contas_receber` | saldo em aberto, cancelamento futuro, relatórios | isolamento ADMIN falho |
| recebimento | `liquidacoes_receber` | realizado, E(c) quando dinheiro | replay atual; legado nullable |
| AP | `contas_pagar` | saldo/status, relatórios | estado corrente no replay |
| pagamento AP | `contas_pagar_pagamentos` | realizado, vínculo com sangria | colisão da chave física |
| caixa físico | `caixas.saldo_atual` | operação e fechamento | writer concorrente indevido |
| caixa esperado | `calcular_valor_sistema_dinheiro_caixa` | fechamento/reconciliação | coerente para venda+AR+movimentos-devolução; recálculo concorrente diverge |
| sangria | `movimentacoes_caixa` | contador e E(c) | AP entra uma vez via sangria; chave AP mal escopada |
| idempotência | índices parciais AR/AP e índice por caixa em movimentos | RPCs AR/AP | escopos não equivalentes no AP |
| replay | RPCs AR/AP | UI/retry pós-timeout | retorna fato original com estado corrente do título |
| auditoria | históricos AR/AP, movimentos e `venda_eventos` | reconciliação/diagnóstico | diagnóstico de venda exposto cross-loja; reversões futuras ausentes |
| KPIs | ainda não consolidado | dashboards/relatórios | fontes concorrentes; Fase 4 não executada |

### 10.9 AUDITORIA ADVERSARIAL PÓS-FASES 1A–2B

**Veredito:** `BLOQUEADO`
**Objetivo:** tentar quebrar integridade, idempotência, atomicidade, autorização, isolamento, arquitetura e rollout sem alterar código ou dados.

#### P0 abertos

| ID | Severidade | Evidência | Causa raiz | Impacto | Menor correção proposta, não implementada |
|---|---|---|---|---|---|
| ADV-P0-01 | P0 | `recalcular_saldo_caixa` é `SECURITY DEFINER`, executável por `authenticated`, escreve diretamente em `saldo_atual`, não guarda adequadamente ator/loja e calcula apenas abertura + movimentos | writer legado concorrente ao E(c) | usuário autenticado pode atingir caixa cross-loja e sobrescrever contador com fórmula que apaga venda/AR/devolução | revogar acesso direto, validar RBAC/loja e delegar ao cálculo oficial se a função permanecer |
| ADV-P0-02 | P0 | AR usa `IF v_perfil <> 'ADMIN' AND loja divergente` | exceção legada preservada contra a regra de isolamento | ADMIN pode liquidar título e afetar caixa de outra loja | aplicar mesma-loja a todos os atores operacionais na RPC AR |
| ADV-P0-03 | P0 | `internal.calcular_totais_venda` aceita `preco_unitario > preco_original`; teste adversarial 10→11 e 10→9 resultou desconto agregado zero | validação agregada não prova relação monetária por item | acréscimo oculto pode ser cobrado sem persistência explícita | **DECISÃO DE NEGÓCIO PENDENTE:** definir se acréscimo por item existe; rejeitar se proibido ou modelá-lo explicitamente se permitido |
| ADV-P0-04 | P0 | `verificar_consistencia_venda` é `SECURITY DEFINER`, executável por `authenticated`, sem `auth.uid()` ou guarda de loja | diagnóstico criado como endpoint privilegiado sem autorização interna | leitura financeira cross-loja por UUID de venda | revogar execução ampla ou validar usuário ativo/perfil/loja dentro da função |

#### P1 abertos

| ID | Severidade | Evidência | Causa raiz | Impacto | Menor correção proposta, não implementada |
|---|---|---|---|---|---|
| ADV-P1-01 | P1 | sangria AP deriva `ap:` + key; UNIQUE do movimento é `(caixa_id,key)`, mas pagamento usa `(conta_id,key)` | `conta_id` perdido na derivação | keys legítimas iguais em APs distintos colidem | incluir escopo estável do AP na chave física |
| ADV-P1-02 | P1 | replay AR/AP retorna saldo/status atuais do título | fato imutável e estado corrente misturados | resposta pós-timeout pode diferir da resposta original | retornar só fato imutável ou persistir snapshot pós-operação |
| ADV-P1-03 | P1 | migrations 2A/2B removem assinatura antiga e exigem key imediatamente | etapas MIGRATE/ENFORCE combinadas | banco novo+app antigo e banco antigo+app novo falham | definir rollout compatível/coordenado antes de produção |
| ADV-P1-04 | P1 | retry offline confronta somente três totais | identidade semântica reduzida a UUID+totais | payload distinto com mesmos totais recebe sucesso; estoque/fiscal podem divergir | comparar payload canônico completo ou hash persistido |
| ADV-P1-05 | P1 | `database.types.ts` ainda declara assinaturas/retornos antigos AR/AP | tipos não regenerados | compilador e mocks escondem drift do banco | regenerar tipos após schema certificado |
| ADV-P1-06 | P1 | concorrência real foi prova manual; não há harness versionado; timeout após commit não foi automatizado | evidência operacional não convertida em regressão | locks/idempotência podem regredir sem CI detectar | versionar duas conexões e fault injection pós-commit |

### 10.10 Matriz de status pós-auditoria

| Área | PASS | FAIL | NÃO COMPROVADO |
|---|---|---|---|
| idempotência | UNIQUE e retry sequencial AR/AP | colisão AP; replay não histórico; retry offline incompleto | timeout pós-commit automatizado |
| atomicidade | AR/AP e sangria na mesma transação; fault injection local | — | integrações/triggers externos futuros |
| totais | SSOT PostgreSQL online/offline | acréscimo oculto por item | regra oficial de acréscimo |
| centavos | ABNT e rejeição de R$ 0,01 | — | extremos do domínio real |
| AR | dinheiro/PIX/parciais reconciliados | ADMIN cross-loja; rollout/replay | histórico remoto/estorno futuro |
| AP | pagamento+sangria atômicos | colisão/rollout/replay | histórico remoto/estorno futuro |
| sangria | mecanismo oficial e token consumido | recálculo pode apagar efeito | regressão concorrente automatizada |
| caixa | E(c) evita dupla contagem AP | writer alternativo inseguro | dataset remoto |
| cross-loja | AP mesma loja | AR ADMIN, diagnóstico e recálculo | integrações service role futuras |
| RBAC | usuários ativos nas novas RPCs | auxiliares expostas sem guarda suficiente | política final DONO/ADMIN além das decisões aprovadas |
| grants | RPCs AR/AP revogadas de PUBLIC/anon | diagnóstico e recálculo executáveis por authenticated | inventário de toda superfície legada |
| online/offline | ambos chamam cálculo PostgreSQL | replay offline compara só totais | equivalência integral estoque/fiscal |
| rollout | app novo+banco novo no mesmo estado local | combinações mistas incompatíveis | estratégia operacional Vercel |
| tipos | contratos manuais Shared Core atualizados | `database.types.ts` divergente | geração contra remoto |
| auditoria | fatos guardam ator, loja, forma, origem e vínculos | diagnóstico cross-loja; replay ambíguo | estornos AR/AP ainda não implementados |
| histórico remoto | — | — | produção não consultada; repair não executado |

### 10.11 Rollout comprovadamente arriscado

O plano exigia `EXPAND → MIGRATE CALLERS → ENFORCE`, mas 2A/2B combinaram publicação do novo contrato e exigência da key. Estado observado:

| Banco | App | Resultado esperado/evidenciado |
|---|---|---|
| antigo | antigo | contrato legado funciona; sem novas garantias |
| novo | antigo | **FAIL comprovado:** parâmetros default chegam sem key e RPC rejeita `*_IDEMPOTENCY_KEY` |
| antigo | novo | **FAIL contratual:** app envia parâmetros desconhecidos para a assinatura antiga |
| novo | novo | funciona nos testes locais, sujeito aos P0/P1 desta seção |

Dois deployments Vercel simultâneos, página antiga aberta, retry iniciado antes do deploy e cliente offline antigo pertencem aos cenários mistos. Nenhuma solução de rollout foi aprovada nesta consolidação.

### 10.12 Testes e evidências consolidados

#### TESTES VERSIONADOS

| Unidade | Evidência | Resultado registrado |
|---|---|---|
| 1A | `financial-idempotency-correlation-contract.test.mjs` | 5/5 PASS; schema EXPAND aditivo/nullable e índices verificados estaticamente |
| 1B | `sale-totals-invariant.test.sql` com `BEGIN/ROLLBACK` | centavos, fração, desconto, split, parcial, retry, rollback e R$ 0,01 PASS |
| 1B | `finalizarVendaValidation.test.ts` | validator/UI PASS; frontend não é autoridade |
| 2A | `ar-receipts-reconciliation.test.sql` com `BEGIN/ROLLBACK` | cenários obrigatórios AR, caixas, RBAC, efeito físico e rollback PASS |
| 2A | reader/writer + Shared Core | Vitest 4 + 5 testes PASS na execução da fase |
| 2B | `ap-payments-reconciliation.test.sql` com `BEGIN/ROLLBACK` | cenários obrigatórios AP/sangria/token/vínculo/rollback PASS |
| 2B | payable reader/writer + Shared Core | Vitest 3 + 5 testes PASS |
| transversal | `npm run typecheck -w pdv-importados` | PASS nas fases 2A/2B |
| migrations | `npm run guard:migrations` | PASS, sem colisão |
| RPC/schema guard | testes contratuais e consultas a `pg_proc`/assinaturas/grants | PASS para presença dos contratos esperados; auditoria revelou grants auxiliares indevidos |
| sync-outbox | smoke/contrato do writer offline já existente | PASS local registrado; não prova equivalência completa de efeitos posteriores |
| Git | `git diff --check` | PASS nos gates das fases |
| banco | `supabase db lint --local` | novas RPCs sem achado próprio ao final; erros preexistentes em fiscal/produto/v3 permaneceram fora do escopo |

#### PROVAS MANUAIS

- duas sessões concorrentes AR: mesmo `liquidacao_id`, uma criação e um replay, um efeito;
- duas sessões concorrentes AP: mesmo pagamento e sangria, uma retirada física;
- consulta adversarial de preço acima do original: payload aceito e acréscimo compensado;
- grants efetivos: diagnóstico e recálculo executáveis por `authenticated`;
- chamadas antigas contra banco novo: rejeição imediata por key ausente;
- busca global de writers do contador físico;
- quantificação histórica exclusivamente local: zero linhas AR/AP legadas no fixture disponível; produção não consultada.

As provas concorrentes e de timeout após commit ainda não constituem regressão automatizada. Testes unitários com mocks provam adaptação de parâmetros, não atomicidade/RBAC do PostgreSQL.

### 10.13 Estado atual do bloco financeiro

#### Implementado

- contrato EXPAND de correlação/idempotência AR/AP;
- cálculo monetário PostgreSQL compartilhado entre online/offline;
- liquidação AR realizada e efeito físico exclusivo de DINHEIRO;
- pagamento AP realizado e sangria correlacionada em DINHEIRO;
- contratos TypeScript dos adapters atualizados;
- suítes SQL transacionais e testes locais descritos acima.

#### Comprovado

- rollback atômico local de AR e AP;
- centavos e R$ 0,01 nos casos testados;
- PIX/cartão não alteram gaveta;
- DINHEIRO altera uma vez nos retries testados;
- AP usa `movimentacoes_caixa` e não segundo writer próprio;
- E(c) inclui AR em dinheiro e não duplica AP, pois AP entra pela sangria.

#### Bloqueado

- **4 P0:** recálculo inseguro/incompleto, AR ADMIN cross-loja, acréscimo monetário não definido/oculto e diagnóstico financeiro cross-loja;
- **6 P1:** colisão da chave AP, replay corrente, rollout incompatível, retry offline parcial, tipos divergentes e ausência de regressão concorrente/timeout;
- nenhuma fase está certificada financeiramente enquanto esses achados estiverem abertos.

#### Não comprovado

- estado de produção/remoto após as quatro unidades;
- universo histórico e necessidade exata de repair;
- rollout real em Vercel com versões simultâneas;
- timeout após commit automatizado;
- equivalência completa online/offline para estoque, fiscal e efeitos posteriores;
- regra oficial para acréscimo por item.

#### Próxima fase planejada e permitida

`Fase 2C — remediação dos achados adversariais`, condicionada a autorização explícita e a decisão de negócio sobre acréscimos.

#### Fase proibida no momento

`Fase 3A — comissão`.

**A Fase 3A não está autorizada enquanto os bloqueios da auditoria adversarial não forem resolvidos e revalidados.**

---

## 11. Remediação executada dos achados adversariais — Fase 2C

**Data:** 2026-08-14
**Escopo:** correção dos P0 e P1 comprovados na auditoria adversarial independente (§10.9), com regressão automatizada.
**Ambiente:** Postgres/Supabase local. Nenhuma migration remota, repair, backfill, merge ou alteração de produção.
**Estado do bloco financeiro:** `APTO PARA REAUDITORIA`. A Fase 3A continua **não autorizada**.

### 11.1 Correções implementadas

| ID | Causa raiz | Migration / arquivo | Correção | Teste | Resultado |
|---|---|---|---|---|---|
| P0-1 | `caixas` tinha `UPDATE` amplo para `authenticated` (`arwdDxtm`); as policies autorizavam o operador dono e GERENTE/DONO/ADMIN da loja | `20260814012644_protect_cash_balance_authority.sql` | `REVOKE UPDATE` + `GRANT UPDATE (status)`; trigger `BEFORE INSERT` força `saldo_atual := valor_inicial` | GATE 1 | PASS — 4 perfis recebem `permission denied`; abertura normaliza 999999 para 250 |
| P0-2 | `recalcular_saldo_caixa` era `SECURITY DEFINER` + `authenticated`, sem `auth.uid()`, perfil ou loja, com fórmula concorrente ao E(c) | `20260814013015_drop_recalcular_saldo_caixa.sql` | `DROP FUNCTION` (código morto comprovado) | GATE 2 | PASS — função ausente do catálogo |
| P0-3 | o crédito do contador nasce do trigger em `vendas_pagamentos`; o escritor offline não gravava esse fato | `20260814013215_reconcile_offline_cash_sales.sql` | offline passa a gravar o mesmo fato canônico; nenhum writer novo de `saldo_atual` | GATE 3, GATE 4 | PASS — offline 200/200 reconciliado; retry sem crédito duplo; a sangria de R$180 que falhava passa |
| P0-4 | `IF v_perfil <> 'ADMIN' AND loja divergente` em AR | `20260814013447_enforce_store_scoped_receivables.sql` | mesma-loja para todos os atores, na forma idêntica à do AP | GATE 6 | PASS — matriz de 8 casos |
| P0-5 | nenhum escritor ancorava `preco_original` ao catálogo; o ramo MANUAL da v4 só checava `unit <= original`; o offline não validava nada | `20260814013845_unify_online_offline_price_invariant.sql` e `20260814014205_offline_resolve_tipo_preco.sql` | `internal.validar_precos_venda` chamada pelos dois escritores; `tipo_preco` offline resolvido pelo resolvedor canônico | GATE 5 e matriz de equivalência | PASS — 8/8 casos com decisão idêntica online × offline |
| P1-1 | replay offline comparava apenas os três totais | `20260814090345_validate_offline_replay_payload.sql` | identidade lógica passa a ser `(venda_id, conjunto canônico de itens)`, comparada contra `itens_venda` | GATE 11 | PASS — produto, quantidade e preço divergentes recusados com totais idênticos |
| P1-2 | `verificar_consistencia_venda` e `relatorio_consistencia_vendas` eram `SECURITY DEFINER` + `authenticated`, sem guarda | `20260814015032_harden_diagnostics_and_ap_idempotency.sql` | revogadas de `authenticated`, mantidas em `service_role` | GATE 9 | PASS |
| P1-3 | a chave da sangria `ap:<key>` perdia `conta_id`, enquanto o UNIQUE do movimento é `(caixa_id, key)` | `20260814015032_harden_diagnostics_and_ap_idempotency.sql` | chave passa a `ap:<conta_id>:<key>` | GATE 10 | PASS — duas contas, mesma chave, mesmo caixa geram 2 sangrias; replay não gera a terceira |
| P1-4 | `operacao_tipo='ESTORNO'` e `operacao_origem_id` foram provisionados na Fase 1A e nunca usados; o cancelamento de AP era `UPDATE` direto de status | `20260814095445_auditable_ar_ap_reversals.sql` | 3 RPCs append-only: `estornar_liquidacao_receber`, `estornar_pagamento_contas_pagar`, `cancelar_conta_pagar` | GATE 12 | PASS — 13 cenários |
| P1-5 | os tipos declaravam assinaturas de 4 e 5 argumentos e `Returns: undefined`; os adapters usam `SupabaseClient` sem `<Database>` | `database.types.ts` regenerado e `financialRpcContract.ts` | gate de tipos que falha a compilação se o contrato divergir | falsificação com a assinatura antiga | PASS — `tsc` falha com TS2344/TS2322 e volta a passar |
| P1-6 | as migrations 2A/2B fundiram MIGRATE e ENFORCE | §11.6 | requisito operacional de deploy coordenado | análise A/B/C/D | documentado |
| P2 | o replay mistura fato imutável e estado corrente | §11.7 | contrato documentado, implementação preservada | — | documentado |

### 11.2 Writers finais de `caixas.saldo_atual`

Estado após as correções. `authenticated` perdeu o `UPDATE` amplo na tabela (`authenticated=ardDxtm`) e a única coluna gravável passou a ser `status`.

| Writer | Tipo | `authenticated` | Guarda | Classificação |
|---|---|---|---|---|
| `trg_caixas_saldo_inicial` | trigger `BEFORE INSERT` | n/a | força `saldo_atual := valor_inicial` | **LEGÍTIMO** |
| `trg_creditar_saldo_caixa_venda_dinheiro` | trigger em `vendas_pagamentos` | não | fato de venda; online e offline gravam o mesmo fato | **LEGÍTIMO** |
| `registrar_liquidacao_receber` | RPC `DEFINER` | sim | ativo, perfil, mesma loja e caixa ABERTO da loja | **LEGÍTIMO COM GUARDA** |
| `estornar_liquidacao_receber` | RPC `DEFINER` | sim | idem, mais origem obrigatoriamente `RECEBIMENTO` e ainda não estornada | **LEGÍTIMO COM GUARDA** |
| `registrar_movimentacao` | RPC `DEFINER` | sim | caixa da loja do usuário, limite e token de sangria | **LEGÍTIMO COM GUARDA** |
| `aprovar_movimentacao` | RPC `DEFINER` | não | consome autorização e materializa o delta uma vez | **LEGÍTIMO** |
| `estornar_movimentacao` | RPC `DEFINER` | sim | `uq_movimentacoes_caixa_estorno_ativo` impede reversão dupla | **LEGÍTIMO COM GUARDA** |
| `cancelar_venda_transacional` | RPC `DEFINER` | sim | `u.loja_id = caixa.loja_id` e perfil | **LEGÍTIMO COM GUARDA** |
| `devolver_ou_trocar_venda` | RPC `DEFINER` | sim | idem | **LEGÍTIMO COM GUARDA** |
| `fechar_caixa_atomico` | RPC `DEFINER` | sim | `auth.uid() = p_operador_id` | **LEGÍTIMO COM GUARDA** |
| `fechar_caixa_pdv_atomico` | RPC `DEFINER` | não | `service_role` (Edge) | **LEGÍTIMO** |
| backfill da migration 045 | migration | n/a | one-shot histórico, já executado | **HISTÓRICO/MIGRATION** |
| `recalcular_saldo_caixa` | — | — | removida | **CÓDIGO MORTO — REMOVIDO** |
| `UPDATE` direto na tabela | REST/PostgREST | **não** | `saldo_atual` fora do grant de coluna | **INDEVIDO — FECHADO** |

**Gate:** nenhum writer INDEVIDO acessível por `authenticated`; nenhum writer legado concorrendo com o SSOT; cada fato financeiro altera o contador no máximo uma vez; online e offline produzem o mesmo fato de pagamento.

### 11.3 Matriz de autorização executada — AR

| Ator | Loja | Resultado |
|---|---|---|
| OPERADOR | mesma | REJEITADO `LIQUIDACAO_PERFIL` |
| GERENTE | mesma | PERMITIDO |
| DONO | mesma | PERMITIDO |
| ADMIN | mesma | PERMITIDO |
| GERENTE | outra | REJEITADO `LIQUIDACAO_LOJA_DIVERGENTE` |
| DONO | outra | REJEITADO `LIQUIDACAO_LOJA_DIVERGENTE` |
| ADMIN | outra | REJEITADO `LIQUIDACAO_LOJA_DIVERGENTE` |
| ADMIN inativo | mesma | REJEITADO `LIQUIDACAO_PERFIL` |

Escrita direta em `caixas.saldo_atual`: OPERADOR, GERENTE, DONO e ADMIN recebem `permission denied for table caixas`.

### 11.4 Equivalência online × offline

| Dimensão | Estado |
|---|---|
| totais | mesma função `internal.calcular_totais_venda` (Fase 1B) |
| preços | mesma função `internal.validar_precos_venda`; 8/8 casos com decisão idêntica |
| `tipo_preco` | resolvido pelo mesmo `calcular_preco_produto` nos dois caminhos |
| limite de desconto manual | `trg_fn_itens_venda_limite_desconto` passa a avaliar também o caminho offline |
| pagamentos | ambos gravam `vendas_pagamentos` |
| contador físico | um único trigger, a partir do mesmo fato |
| retries | identidade canônica de itens nos dois caminhos |
| estoque | **divergência conhecida** — a baixa continua na Edge, fora da transação da RPC |

### 11.5 Limites conhecidos e não implementados

1. **Paridade total de preço** exige ampliar o contrato da Edge: `parseSingleVendaItem` normaliza o item para `{produto_id, quantidade, preco_original, preco_unitario}` e descarta `tipo_preco` e promoção. As duas regras acrescentadas são tipo-independentes e valem nos dois escritores, mas a validação de faixa e promoção da v4 segue exclusiva do caminho online.
2. **Venda offline sem `caixa_id`** não resolve a loja e portanto não recebe a âncora de catálogo, apenas a regra de acréscimo. Tornar `caixa_id` obrigatório no payload é unidade separada.
3. **Estoque offline** é baixado pela Edge depois da RPC, fora da transação. Uma falha entre os dois passos ainda deixa estoque e venda divergentes.
4. **Repair histórico** não foi executado. Liquidações e pagamentos legados com `idempotency_key IS NULL` permanecem como estão.
5. **`DELETE` em `caixas`** continua concedido a `authenticated`, limitado pela policy e pelas FKs. Não é caminho de corrupção do contador, já que um caixa com movimento não pode ser apagado, mas é superfície remanescente.

### 11.6 Rollout — P1-6

`ROLLOUT INCOMPATÍVEL, FALHA FECHADA` — requisito operacional: **deploy coordenado de banco e aplicação**.

| Banco | App | Comportamento |
|---|---|---|
| antigo | antiga | funciona, sem as garantias desta remediação |
| novo | antiga | **falha fechada** — a chamada legada resolve para a nova função por defaults e é rejeitada em `LIQUIDACAO_IDEMPOTENCY_KEY`. Nada é gravado |
| antigo | nova | **falha fechada** — o PostgREST não encontra a função de 7 ou 9 argumentos. Nada é gravado |
| novo | nova | estado alvo |

- **Página antiga aberta e request iniciado antes do deploy:** caem no cenário banco novo com app antiga. O operador vê erro técnico e recarregar resolve.
- **Retry pós-timeout:** com app novo, `idempotent_replay` devolve o fato original sem segundo efeito.
- **Rollback da aplicação sem rollback do banco:** recria o cenário banco novo com app antiga para toda a base. AR e AP ficam indisponíveis até o banco também voltar.
- **Rollback do banco:** cada migration tem bloco `ROLLBACK` documentado no cabeçalho.

**Overload temporário foi avaliado e descartado.** Manter as assinaturas antiga e nova simultaneamente reintroduz exatamente o risco que o §9.5 classificava como o mais grave da Fase 2: dois escritores financeiros ativos, um deles sem chave de idempotência, com janela real de dupla contabilização. O `DROP` da assinatura antiga troca disponibilidade por corretude, que é a escolha correta num bloco financeiro. A menor solução segura é a janela de deploy coordenado.

### 11.7 Replay AR/AP — P2

Contrato **mantido**. Nenhum consumidor real é prejudicado: a resposta de replay devolve o estado verdadeiro e atual do agregado, que é o que a UI precisa exibir. A distinção fica registrada:

| Campo | Natureza |
|---|---|
| `liquidacao_id` / `pagamento_id`, `valor`, `caixa_id`, `movimentacao_caixa_id` | **fato imutável** — idêntico ao da resposta original |
| `idempotent_replay` | metadado do comando |
| `valor_aberto`, `valor_pago`, `status` | **estado corrente do agregado** — pode diferir da resposta original se houve outra operação no intervalo |

Alterar o payload apenas para torná-lo reproduzível byte a byte criaria um snapshot persistido sem consumidor, aumentando superfície sem fechar risco.

### 11.8 Regressão automatizada

`npm run test:financial -w fastproduct-backend` executa 5 suítes e está integrado ao job `supabase-local-gates` do workflow `ci-backend-supabase.yml`, logo após `test:rls-scope`. Nenhum workflow novo foi criado.

| Suíte | Cobertura |
|---|---|
| `financial-idempotency-correlation-contract.test.mjs` | contrato EXPAND da Fase 1A |
| `sale-totals-invariant.test.sql` | invariante de totais da Fase 1B |
| `ar-receipts-reconciliation.test.sql` | reconciliação AR da Fase 2A |
| `ap-payments-reconciliation.test.sql` | reconciliação AP da Fase 2B |
| `financial-adversarial-gates.test.sql` | GATES 1 a 12 dos P0/P1 |

Antes desta unidade as quatro primeiras existiam sem nenhum invocador — o `PASS` registrado em §10.12 vinha de execução manual. As suítes 2A/2B também não tinham nenhum ator ADMIN, razão estrutural de terem passado 100% com o ADMIN cross-loja aberto.

**Gates falsificados** — o teste falha quando o bug volta e passa quando corrigido: GATE 1 devolvendo `UPDATE(saldo_atual)` a `authenticated`; GATE 2 recriando `recalcular_saldo_caixa`; GATE 9 devolvendo o grant do diagnóstico; gate de tipos devolvendo a assinatura de 4 argumentos.

`test-rls-scope.mjs` também foi corrigido: duas asserções estavam desatualizadas desde as Fases 1B e 2A e nunca haviam falhado porque a suíte não rodava em lugar nenhum. Resultado atual: 42/42.

### 11.9 Risco residual

**COMPROVADO (fechado e com gate):** escrita direta do contador, writer legado, venda offline em dinheiro, ADMIN cross-loja em AR, acréscimo e bruto acima da tabela, desconto manual offline sem teto, retry offline por totais, diagnósticos cross-loja, colisão da chave AP, ausência de estorno AR/AP e tipos divergentes.

**TEÓRICO:** estoque offline fora da transação da RPC; venda offline sem `caixa_id` sem âncora de catálogo; validação de faixa e promoção ausente no offline; `DELETE` em `caixas` para `authenticated`.

**NÃO COMPROVADO:** estado remoto e de produção após esta remediação; universo histórico e necessidade de repair; rollout real na Vercel com dois deployments; concorrência real entre processos distintos, já que as provas seguem em transação única; e a comissão (FIN-298-03), que permanece aberta porque `trg_registrar_comissao` continua `AFTER UPDATE OF status`.

### 11.10 Estado e próxima fase

- **P0:** 5 de 5 fechados, com gate de regressão.
- **P1:** 6 de 6 endereçados — 4 corrigidos em código, 2 resolvidos por decisão documentada.
- **P2:** avaliado; contrato mantido e documentado.
- **Fase 3A — comissão:** continua **NÃO AUTORIZADA**. Depende de reauditoria independente desta remediação e de FIN-298-03, que não foi tocado.

> **Atualização 2026-08-14 (posterior a esta seção):** FIN-298-03 e os demais achados de comissão (FIN-298-05, DB-04, DB-05) foram endereçados na unidade DB-05 A→F, documentada e certificada em **§12**. Isso fecha o bloco de comissões especificamente, mas não substitui a reauditoria independente do bloco AR/AP descrito nesta seção nem libera a Fase 3A por si só — ver §12.7 e §12.8.

---

## 12. DB-05 — Comissões: implementação, certificação backend e reconciliação frontend

**Data de consolidação:** 2026-08-14
**Branch:** `codex/ap-payments-reconciliation`
**Status autoritativo:** `DB-05 CERTIFICADO` (backend e frontend). Fecha o bloco de comissões (FIN-298-03, FIN-298-05, DB-04, DB-05 de §9.1). **Não libera Fase 3A** — ver §12.7/§12.8.

### 12.1 Commits

| Unidade | Objetivo | Commit |
|---|---|---|
| DB-05A | Liquidação líquida: pagamento consome ajustes atomicamente (bruto/compensado/líquido) | `62515109` |
| DB-05B | Ajuste processado só após a operação pós-venda completa (multi-item) | `78044c0d` |
| DB-05C | Snapshot histórico por item — ajuste não recalcula com dados atuais | `b58386ec` |
| DB-05D | Cancelamento independente da ordem entre apuração da comissão e o próprio cancelamento | `562fbe69` |
| DB-05E | Ledger append-only, auditável, tipo real distinguível (CANCELAMENTO/DEVOLUCAO/TROCA) | `fd9bdfc0` |
| DB-05F | Concorrência real — duas sessões PostgreSQL independentes, não `BEGIN/ROLLBACK` sequencial | `684882bb` |
| Base | Compensação inicial pós-cancelamento/devolução (achado original) | `cb932494` |
| Reconciliação frontend | UI de comissões consumindo o contrato líquido do backend | `3c2a6e90` |

Todos os commits pertencem à branch `codex/ap-payments-reconciliation`, publicada em `origin/codex/ap-payments-reconciliation`.

### 12.2 O que cada unidade prova

**Pagamento bruto/compensado/líquido (DB-05A).** `liquidar_comissoes` consome `comissoes_ajustes` atomicamente sob `FOR UPDATE`, em ordem estável (`created_at, id`), e devolve `{pagamento_id, valor_bruto, valor_compensado, valor_liquido, comissoes_pagas, idempotent_replay}`. Provado com dados reais: comissão 44,95 → paga 44,95 (bruto=44,95, compensado=0) → devolução 40% → ajuste 17,98 → nova comissão 44,95 → segundo pagamento com **bruto=44,95, compensado=17,98 (exato), líquido=26,97**. Retry com a mesma `idempotency_key` devolve o mesmo pagamento (`idempotent_replay=true`), sem segunda linha.

**Multi-item (DB-05B).** O gatilho de ajuste pós-venda é `CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED` em `venda_pos_venda_operacoes` (não mais `FOR EACH STATEMENT` em `venda_pos_venda_itens`), disparando uma única vez por operação, depois que todos os itens já foram inseridos. Provado com uma operação real de dois itens diferentes: nenhum ajuste existe após o primeiro item; exatamente um ajuste, integral, nasce depois do segundo.

**Snapshot histórico (DB-05C).** `comissoes_itens` congela por item, no momento da venda: quantidade, preço, regra resolvida, tipo de cálculo e percentual/valor fixo. `internal.calcular_comissao_venda(venda, efetivo=true)`, quando há snapshot, lê exclusivamente `comissoes_itens` — nenhuma consulta a `produtos.preco_custo`, regra ativa ou `configuracoes_gerais` atuais. Provado alterando custo do produto e a config global de comissão (5%→99%) **depois** da venda e **antes** da devolução: o ajuste resultante permaneceu idêntico à comissão original, ignorando os 99%.

**Cancelamento independente de ordem (DB-05D).** Falsificado antes da correção: Ordem A (venda→comissão→cancelamento) fechava com comissão+ajuste+líquido zero; Ordem B (venda→cancelamento antes da apuração→processamento atrasado) perdia o fato inteiro (0 comissões, 0 ajustes, sem fila de recuperação). Corrigido extraindo o congelamento para `internal.apurar_comissao_original`, chamada pelo próprio gatilho de cancelamento antes de compensar. Provado que as duas ordens agora convergem para o mesmo estado econômico exato.

**Ledger imutável e auditável (DB-05E).** `ON DELETE CASCADE` em `comissoes_ajustes` (que apagava o ledger junto com o fato pai) virou `RESTRICT`; gatilho `BEFORE UPDATE OR DELETE OR TRUNCATE` rejeita qualquer mutação, para qualquer role. `TROCA` deixou de ser gravada como `DEVOLUCAO` (defeito real, falsificado e corrigido). Duas views novas (`comissoes_ajustes_auditoria`, `comissoes_reconstrucao_auditoria`) reconstroem ator, origem e consumo por pagamento sem duplicar dado — reaproveitam o que DB-05A já calcula.

**Concorrência real (DB-05F).** `backend/scripts/test-commission-concurrency.mjs` abre sessões `psql` independentes (processos separados, não `BEGIN/ROLLBACK` na mesma transação) e prova, com bloqueio real observado via timeout, 6 cenários: pagamento × devolução, dois pagamentos simultâneos, mesmo ajuste concorrente, cancelamento × geração da comissão, duas devoluções distintas concorrentes, pagamento × novo ajuste. Falsificado removendo o `FOR UPDATE` de `liquidar_comissoes`: produziu um **deadlock real** entre duas sessões — prova de que o lock é estrutural, não decorativo.

### 12.3 Auditoria adversarial independente

Uma auditoria adversarial foi conduzida como etapa separada, com a regra explícita "migration histórica não é prova do schema efetivo" — toda alegação foi verificada contra a definição **efetiva** no catálogo pós-migrations (`\sf`, `pg_get_triggerdef`, `pg_proc`), não contra o texto da migration.

Uma primeira passada dessa auditoria citou incorretamente código superseded (`marcar_comissoes_pagas` de `103_comissoes.sql`, o trigger `FOR EACH STATEMENT` da migration base) e concluiu F1/F2 como ainda quebrados. Reexecutada contra o estado efetivo, com dados reais e falsificação de 3 proteções críticas (pagamento ignorando ajuste, processamento multi-item antecipado, concorrência permitindo pagamento duplicado — as três restauradas byte-a-byte após confirmar que o teste ficava vermelho), o veredito revisado foi:

```
F1 pagamento:                        FALSIFICADO (mecanismo correto)
F2 multi-item:                       FALSIFICADO (trigger correto, não o legado citado)
F3 ordem (D):                        FALSIFICADO (ordens convergem)
F4 snapshot:                         FALSIFICADO (ajuste usa só o congelado)
F5 concorrência pagamento/devolução: FALSIFICADO (lock serializa corretamente)
```

Validação do zero (`supabase db reset --local` → seed → RLS → `test:financial` → concorrência → `check:types-drift` → typecheck → vitest → lint → build): todos os passos `PASS`, incluindo os 6 cenários de concorrência real integrados ao `test:financial` (6/6 suítes).

### 12.4 Certificação residual final — online×offline, isolamento loja A/B, TROCA

Três dívidas deixadas explicitamente abertas pela auditoria de §12.3 foram fechadas numa rodada de certificação residual dedicada, com a mesma regra de falsificar antes de aceitar.

**Online × offline.** Vendas economicamente idênticas por `finalizar_venda_transacional_canonica_v4` (online) e `registrar_venda_com_itens` (offline), comparadas ponta a ponta: comissão original, cancelamento, devolução parcial + pagamento, devolução total. **Convergente** nos 3 sub-cenários — mesmos valores exatos nos dois caminhos.

**Isolamento loja A/B.** Primeira tentativa falsificou (pagamento da loja A pareceu consumir ajuste da loja B), mas a causa era débito pré-existente de uma fixture anterior no mesmo usuário, não vazamento — refeito com fixture limpa e confirmação prévia de saldo zero. Resultado: pagamento da loja A não toca ajuste da loja B; liquidação cross-loja é rejeitada (`COMISSOES_LIQUIDAR_PERMISSAO`); sob RLS real (`SET LOCAL ROLE authenticated`, não superusuário), gerente da loja A lê zero linhas do resumo da loja B. **PASS.**

**TROCA real com `venda_substituta_id`.** Primeira tentativa falsificou (RPC de detalhe não rastreava `venda_substituta_id`), mas a causa era um erro de metodologia do teste: o gatilho de ajuste é `DEFERRABLE INITIALLY DEFERRED` e a leitura ocorreu antes de `SET CONSTRAINTS ALL IMMEDIATE`, então o ajuste ainda não existia no momento da leitura. Corrigido e refeito via `devolver_ou_trocar_venda` (RPC canônica real, não simulação por insert cru), com venda substituta já `CONCLUIDA`: `venda_substituta_id` gravado corretamente, ajuste com tipo real `TROCA` e valor exato, rastreável pela RPC de detalhe do frontend, comissão da venda substituta permanece intacta e independente, retry idempotente. **PASS.**

Nenhum código de produto foi alterado durante essa rodada; apenas os dois erros de metodologia de teste acima foram corrigidos antes de aceitar qualquer resultado.

### 12.5 Reconciliação frontend (commit `3c2a6e90`)

**Achado:** as telas `/gerente/comissoes` e `/admin/comissoes` somavam `comissoes_vendedores.valor_comissao` bruto diretamente e exibiam esse número como "Pago"/"Pendente" — `comissoes_ajustes` e `comissoes_pagamentos` nunca eram lidos pelo frontend. O botão "marcar pago" chamava `marcar_comissoes_pagas` (`RETURNS integer`), descartando o detalhamento bruto/compensado/líquido/pagamento que `liquidar_comissoes` já calcula.

**Correção:** duas RPCs de relatório pré-DB-05 (`resumo_comissoes_por_operador`, `detalhe_comissoes_operador` — anteriores ao bloco A→F, não certificadas por ele) foram redefinidas para projetar as views certificadas de DB-05E, sem fórmula nova (`JOIN`/`GROUP BY`/`jsonb_agg` sobre números já calculados). A ação de liquidação passou a chamar `liquidar_comissoes` diretamente, com chave de idempotência determinística por (loja, operador, conjunto de ids). Nenhuma função, gatilho, tabela ou view do conjunto certificado A→F foi tocada.

**Resultado visível:** quatro KPIs com semântica explícita (bruto apurado / ajustes lançados / líquido pago / saldo a compensar) em vez de bruto disfarçado de líquido; detalhe por comissão mostra o histórico de ajustes com tipo real, ator e origem; após pagar, um modal mostra o resultado real da RPC (bruto/compensado/líquido/id do pagamento), não uma contagem.

**Testes:** 29 testes automatizados (19 de comportamento de componente + 8 de contrato da action + 2 pré-existentes), cobrindo comissão sem ajuste, devolução parcial, comissão totalmente/parcialmente compensada, retry idempotente e os três tipos de ajuste. Verificação end-to-end feita contra um Supabase local real, autenticado como gerente, com os valores do resumo/detalhe/modal de liquidação batendo exatamente com o cálculo independente via SQL direto. Checagem adversarial: duas devoluções parciais sucessivas na mesma venda produzem duas entradas distintas no array de ajustes retornado pela RPC de detalhe, não uma colapsada.

**Validação completa:** 6/6 gates financeiros do backend (incluindo concorrência DB-05F) re-verificados inalterados após reset limpo; `check:types-drift` limpo; `typecheck`/`lint`/`vitest` (923/923)/`build` — todos verdes.

### 12.6 CI do zero

A sequência `supabase db reset --local` → seed de usuários E2E → smoke RLS → `test:rls-scope` (42/42) → `test:financial` (6/6, incluindo concorrência real) → `check:types-drift` → `typecheck` → `vitest` (923/923) → `lint` → `build` → `check:edge` (3 Edge Functions) foi executada do zero, sem flake observado, tanto na certificação do backend (§12.3) quanto após a reconciliação do frontend (§12.5).

### 12.7 Veredito

```
DB-05 BACKEND: PASS
FRONTEND DB-05: PASS
FINANCEIRO DB-05: CERTIFICADO
FASE 3A: NÃO LIBERADA
```

`FASE 3A: NÃO LIBERADA` é uma decisão de escopo, não uma falha técnica de DB-05: a próxima fase depende também da reauditoria independente ainda pendente do bloco AR/AP (§11.10) e das dívidas de reconciliação global listadas em §12.8, que não pertencem ao bloco de comissões.

### 12.8 Dívidas residuais conhecidas — escopo de certificação global, não FAIL de DB-05

As dívidas abaixo foram identificadas durante o trabalho de DB-05 mas pertencem à certificação global do sistema, não ao bloco de comissões em si. Não rebaixam o veredito de §12.7.

| Dívida | Natureza | Nota |
|---|---|---|
| Online × offline ponta a ponta em escopo global | Certificação global | §12.4 prova convergência **para comissões**. A equivalência online/offline de outros domínios (estoque, fiscal, AR/AP) já tem limites conhecidos documentados em §11.5 e continua fora deste fechamento. |
| Isolamento loja A/B em escopo global | Certificação global | §12.4 prova isolamento **para comissões e para a RPC de resumo do frontend**. Outras telas/domínios não foram re-testados nesta rodada. |
| TROCA com `venda_substituta_id` em outros fluxos | Certificação global | §12.4 prova a TROCA real de comissão ponta a ponta. Efeitos de TROCA em estoque/fiscal fora do escopo de comissão não foram re-verificados aqui. |
| Outras telas do frontend ainda não reconciliadas com o contrato líquido do backend | Reconciliação frontend↔backend | §12.5 reconciliou especificamente `/gerente/comissoes` e `/admin/comissoes`. Nenhuma outra tela financeira (AR, AP, caixa, relatórios) foi auditada ou alterada nesta unidade. |

---

## 13. Sprint Reconciliação Global Backend↔Frontend

Fecha explicitamente a última linha de §12.8 (AR, AP, caixa, estoque, relatórios não auditados). Branch `claude/backend-frontend-global-reconciliation`, a partir de `origin/main` (SHA `d65aabd3673903a2fb917a78256e3a7a5b1e5e55`, confirmado idêntico ao PR #302 antes de iniciar).

### 13.1 Metodologia

Nove domínios auditados em paralelo (PDV/vendas, caixa, contas a pagar/receber, estoque, catálogo/preço/atacado, auditoria, sync/offline, RBAC/RLS, dashboard/relatórios) comparando o contrato SSOT do backend (migrations, RLS, RPCs) contra o consumo real do frontend. Comissões (DB-05) verificado apenas quanto a regressão, sem reauditar — nenhuma divergência.

Regra seguida em toda a correção: **backend é SSOT**; nenhuma fórmula/regra é duplicada em React; nenhuma migration nova sem prova de insuficiência do contrato existente; nenhum P1 corrigido sem antes revalidar contra o SSOT atual (dois achados de P0/P1 caíram nessa revalidação — ver §13.3).

### 13.2 P0 — 4 encontrados, 3 corrigidos, 1 falso positivo

| # | Domínio | Achado | Veredito | Correção |
|---|---|---|---|---|
| 1 | Estoque | `registrarRecebimentoOC` chamava `receber_ordem_compra(uuid,jsonb)` — assinatura dropada pela migration 295. Recebimento de OC 100% quebrado (`PGRST202`). | CONFIRMADO | Restaura o fluxo de dois passos exigido: `registrar_conferencia_ordem_compra` → `receber_ordem_compra(uuid)`. |
| 2 | Dashboard/relatórios | `/admin/dashboard`: início do período calculado com hora local do processo Node (UTC em produção), não o dia civil em `America/Sao_Paulo`. KPIs de "hoje" deslocados até 3h. | CONFIRMADO | Novo helper isolado e testado (`inicioDoDiaCivilEmUtc`/`ymdEmFuso`), só corrige o cálculo de fronteira. |
| 3 | Dashboard/relatórios | `/gerente/relatorios/vendas` (Relatório Avançado): mesmo bug de fuso, bounds locais em vez de RPC/timezone-aware. | CONFIRMADO | Mesmo helper aplicado à query direta (`.gte`/`.lt` com bounds corretos). |
| 4 | Catálogo/preço/atacado | Gatilho de atacado por produto supostamente nunca lido pelo motor de preço. | **FALSO POSITIVO** | Investigação encontrou que `sincronizarFaixaAtacado`→`criarFaixaAtacado` já grava a faixa em `precos_atacado` corretamente no fluxo de criação. Única lacuna real é mais estreita (edição não re-sincroniza) e vira P2 sem correção — forçar o caminho existente causaria erro de duplicata (`criarFaixaAtacado` não faz upsert). |

### 13.3 P1 — 13 encontrados, 10 corrigidos, 2 já resolvidos (dead code / cobertos por outra correção), 1 falso positivo

| # | Domínio | Achado | Veredito | Correção |
|---|---|---|---|---|
| A | PDV/vendas | BR-01 (limite de crédito): override gerencial existe no backend (`p_limite_credito_gerente_token`) mas nunca é coletado/enviado pelo caixa web. | CONFIRMADO | Fluxo reativo: captura `FINALIZAR_VENDA_CANONICA_LIMITE_CREDITO_*`, abre modal mínimo reaproveitando a validação de senha gerencial existente (mesma tabela `tokens_desconto_gerente`), reenvia com o token. |
| B1 | Contas a receber | `registrar_liquidacao_receber` rejeita liquidação cross-loja para todos os perfis; admin listava e oferecia "Liquidar" para títulos de qualquer loja. | CONFIRMADO | Substitui o botão por aviso "Outra loja" quando `título.loja_id ≠ ator.loja_id`; listagem em si (visão macro RLS-legítima) preservada. |
| B2 | Contas a pagar | Mesmo padrão em `registrar_pagamento_contas_pagar`/`cancelar_conta_pagar` (ambos confirmados loja-scoped por leitura direta da migration). | CONFIRMADO | Mesmo tratamento em `ContasPagarListClient`. |
| B3 | Contas a receber | `estornar_liquidacao_receber` (Fase 1A) nunca tinha consumidor no frontend — nem ação, nem trilha visível. | CONFIRMADO | `reverse()`/`listLiquidacoes()` novos em `ReceivableLiquidationService`/`Reader`; painel de histórico + estorno em `FinanceiroReceberExtras`. |
| B4 | Contas a receber (gerente) | Seletor de caixa ausente na liquidação do gerente (`FinanceiroGerentePageClient.tsx`). | **JÁ RESOLVIDO** | Componente é código morto (`@legacy`, "NÃO reutilizar", zero rotas apontando para ele). A superfície ativa (`/admin/financeiro`) já tem o seletor correto. |
| C | Estoque | Kardex lia só `movimentos_estoque_log`, omitindo devoluções de cliente e estornos de cancelamento (gravados em tabelas de reposição separadas). | CONFIRMADO | Fonte trocada para a view canônica `v_kardex_unificado` (migration 291). Confirmado com dados reais em verificação visual: eventos `ENTRADA_DEVOLUCAO_CLIENTE`/`ENTRADA_CANCELAMENTO_VENDA` agora aparecem. |
| D1 | Auditoria | `documentos_fiscais_eventos.actor_user_id`/`actor_role` gravados pelo backend mas nunca selecionados/exibidos. | CONFIRMADO | Join com `usuarios(nome)` nos dois pontos que carregam a timeline (page.tsx + action de refresh); exibe ator no evento. |
| D2 | Auditoria | Trilha de estorno AR/AP sem UI. | **JÁ RESOLVIDO** | Mesma correção de B3 cobre a exibição (histórico mostra linhas `ESTORNO`). Estorno pontual de AP permanece P2 (não corrigido, fora do escopo P0/P1). |
| E1 | Sync/offline | Schema do evento (`sync-outbox-event-v1.schema.json`) e validador local (`outboxEventValidate.ts`) ainda modelavam `caixa_id` como opcional/nulo, embora o RPC exija desde a migration 20260814105031. | CONFIRMADO | `caixa_id` passa a `required`/`uuid` no schema; validador local rejeita antes do envio. |
| E2 | Sync/offline | Suspeita de baixa de estoque no Edge Function usar o payload em vez do fato persistido em retries divergentes. | **FALSO POSITIVO** | Migration `20260814090345` já garante, por construção (`RETURN` antecipado em divergência), que payload e `itens_venda` persistido são idênticos no momento da baixa. Nenhuma mudança. |
| E3 | Sync/offline (Rust) | `RegistrarVendaInput.caixa_id: Option<String>` — Tauri aceitava e persistia venda local sem caixa. | CONFIRMADO | `validar_caixa_id_obrigatorio` rejeita na fronteira do comando, antes de qualquer escrita SQLite/enfileiramento. |
| E4 | Sync/offline (Rust) | `reqwest::blocking::Client::new()` sem timeout em 4 pontos — rede instável trava o comando indefinidamente. | CONFIRMADO | `http_client_with_timeout()` (30s) compartilhado, substitui os 4 call sites. |
| F | Dashboard/relatórios | `v_estoque_ledger_divergencia` (migration 291) existe mas não é consumida por nenhuma tela. | CONFIRMADO | Nova seção "Divergência de estoque" em `/admin/relatorios` (aba Estoque), mesmo padrão read-only de `Cobertura de Estoque`. Confirmado com dados reais em verificação visual. |

### 13.4 Contratos reconciliados (frontend passou a consumir o que já existia — zero migrations novas)

`receber_ordem_compra`/`registrar_conferencia_ordem_compra` · `relatorio_*_periodo` (via novo helper de fuso, não RPC nova) · `registrar_liquidacao_receber`/`registrar_pagamento_contas_pagar`/`cancelar_conta_pagar` (escopo de loja) · `estornar_liquidacao_receber` · `v_kardex_unificado` · `documentos_fiscais_eventos.actor_user_id/actor_role` · `sync-outbox-event-v1.schema.json` (`caixa_id` obrigatório) · `v_estoque_ledger_divergencia` · `p_limite_credito_gerente_token` (BR-01).

Nenhuma função, tabela, view, trigger ou policy do backend foi criada, alterada ou removida nesta sprint.

### 13.5 Verificação

```
TESTES AFETADOS:      PASS (por domínio, incremental)
TYPECHECK:             PASS (pdv-importados, pdv-local)
LINT:                  PASS (eslint --max-warnings 0, arquivos tocados)
VITEST:                PASS — 181/181 arquivos, 955/955 testes (pdv-importados)
                        PASS — 11/11 arquivos, 58/58 testes (pdv-local)
CARGO CHECK/TEST/CLIPPY: PASS — 5/5 testes Rust, 0 warnings
BUILD:                 PASS (next build, produção)
CHECK:EDGE:             PASS (sync-outbox, validar-gerente, fiscal-worker — deno check)
CHECK:TYPES-DRIFT:      PASS (6287 linhas em dia — sem migration nesta sprint)
RLS (test:rls-scope):   PASS — 42/42 regras
FINANCIAL GATES:        PASS — 6/6 suítes (incluindo concorrência DB-05F), reconfirmado após
                        reset limpo — uma falha inicial (GATE19) era dado residual de sessão
                        de teste anterior no Postgres local compartilhado, não regressão
VERIFICAÇÃO VISUAL:     PASS — dashboard (KPIs "hoje" corretos), /admin/relatorios (divergência
                        de estoque visível com dados reais), /admin/financeiro (AR e AP sem
                        crash), /admin/estoque (kardex mostra devolução/cancelamento com dados
                        reais), /caixa (renderiza; aviso de hidratação dev-only não bloqueante,
                        do painel de debug client-only, sem relação com as correções)
```

### 13.6 Riscos residuais

| Item | Nota |
|---|---|
| OC (item C-1) e Relatório Avançado de Vendas (item F-2) sem teste automatizado dedicado pré-existente | Validados por leitura direta do contrato SQL + typecheck + build + verificação visual; sem suíte de regressão prévia para estender. |
| Estorno pontual de pagamento AP (`estornar_pagamento_contas_pagar`) | Classificado P2 desde a auditoria original — backend expõe, frontend não consome. Fora do escopo desta sprint (só P0/P1). |
| Edição de produto não re-sincroniza faixa de atacado | P2, ver §13.2 item 4. Fluxo de criação (majoritário) funciona corretamente. |
| RBAC: `pricing_config_versions_escrita`/`historico_precos_produto_leitura` sem ADMIN na policy | P2 — nenhuma tela hoje escreve/lê essas tabelas como ADMIN; drift latente, não explorável no momento. |

### 13.7 Veredito

```
SPRINT BACKEND↔FRONTEND: FECHADA
P0 ABERTOS: 0
P1 ABERTOS: 0
APTA PARA PR: SIM
CADASTRO DE PRODUTO UX: NÃO INICIADO
FASE 3A: NÃO LIBERADA
```

`FASE 3A: NÃO LIBERADA` permanece — decisão de escopo (§12.7), não afetada por este fechamento. Esta sprint fecha a última linha pendente de §12.8; os riscos residuais de §13.6 são P2, documentados, e não bloqueiam PR.

---

## 14. Fechamento pré-treinamento do cliente #1 — PR #309 (2026-08-19)

**PR:** [#309](https://github.com/nocodenn-cell/fastproduct/pull/309) — *tira o E2E de produção, fecha vazamento entre lojas e corrige material de treinamento*
**Natureza:** Fases 1 e 2 do plano de fechamento de pendências. Escrita em produção **autorizada e executada**; retratos de rollback versionados em `backend/scripts/rollback/`.

> **Nota de nomenclatura.** A *Fase 1B* citada aqui e em §14.4 é a **reconciliação de catálogo**
> derivada de [`docs/AUDITORIA_CATALOGO_PROD_VS_REPO_2026-08.md`](docs/AUDITORIA_CATALOGO_PROD_VS_REPO_2026-08.md).
> **Não confundir** com a *Fase 1B — invariantes de totais e centavos* do bloco financeiro (§10.4),
> já concluída. São trilhas distintas que coincidiram no rótulo.

### 14.1 Auditoria do ledger — encerrada, com paridade

O item 7 do backlog exigia comparar o ledger de produção com a contagem de arquivos do repositório antes de qualquer janela crítica. **Executado e fechado.**

| Medida | Antes de #309 | Depois de #309 | Repositório |
|---|---:|---:|---:|
| `supabase_migrations.schema_migrations` | 305 | **307** | 307 |

As duas migrations que faltavam — `20260814015032` e `20260819000000` — entraram na aplicação de #309. Verificado em produção, somente leitura: ambas presentes no ledger, `count(*) = 307`, **paridade de chaves com o repositório**.

> ⚠️ **Paridade de chaves não é paridade de catálogo.** Este é o achado central de §14.4: o ledger bate e os objetos não. A auditoria do ledger fecha; a reconciliação de catálogo não.

### 14.2 Correções aplicadas em produção

| # | Correção | Evidência |
|---|---|---|
| 1 | **RLS / vazamento entre lojas.** `verificar_consistencia_venda` era `SECURITY DEFINER` sem guarda de ator, perfil ou loja, e executável por `authenticated`/`anon`/`PUBLIC`. Fechada. | `proacl` = `postgres=X/postgres, service_role=X/postgres` — verificado pós-merge |
| 2 | **`relatorio_consistencia_vendas` (4 args).** Mesma classe: `EXECUTE` herdado de `PUBLIC` sobrevivia ao `REVOKE ... FROM authenticated` da `20260818000001`. Fechada. | `proacl` = `postgres=X/postgres, service_role=X/postgres` — verificado pós-merge |
| 3 | **Idempotência de AP (fix P1-3).** A chave física da sangria de AP passou a carregar o escopo da conta. Estava fora do ar porque a `20260814015032` nunca chegou a produção. | ledger contém `20260814015032`; `GATE10_COLISAO_DE_CHAVE` cobre a regressão |
| 4 | **Migrations guardadas por `to_regprocedure`.** `20260819000000` e `20260814015032` faziam `REVOKE` sobre uma sobrecarga inexistente em produção; `REVOKE` não aceita `IF EXISTS`, então **abortavam inteiras** — e o bloco P1-3 da segunda nunca rodava. Cada alvo passou a ser guardado. | testadas nos dois cenários: banco completo (3 alvos) e formato de produção (2 alvos, 1 ignorado com `NOTICE`) |
| 5 | **Usuários e dados de robô removidos.** 8 caixas abandonados fechados, 6 lojas de teste removidas (`Probe …`, `Smoke Homolog …`), todas originadas dos runs de E2E contra produção. | `backend/scripts/rollback/lojas-teste.pre-2026-08-19.sql` (round-trip verificado) |
| 6 | **GATE 9 deixou de ser infalsificável.** A suíte executava um `REVOKE` das funções de diagnóstico imediatamente antes de o gate asseverar que estavam revogadas — consertava o que ia testar. Bloco removido; o gate agora cobre `anon` e inspeciona a ACL para pegar a concessão a `PUBLIC`. | falsificação verificada: `GRANT ... TO PUBLIC` produz `GATE9_DIAGNOSTICO_EXPOSTO` |

> **Correção ao registro da Fase 6.** A Fase 6 (§5) registrou o GATE 9 como *falsificado*. **Ele não era** — o gate se auto-consertava. A asserção era vazia, não falsa.

### 14.3 E2E fora de produção — baseline provada

Causa raiz: os dois jobs de E2E rodavam contra o projeto de produção. Cada PR gravava dado real na loja do cliente — 11 vendas de R$ 68,00 nos runs de #307 e #308, além das lojas de sonda e dos caixas abandonados.

Desativar as contas de robô à mão não resolvia: `seed-dev-users.mjs` faz `upsert ... ativo: true`, então o PR seguinte as reativava. **Enquanto o pipeline apontasse para produção, qualquer limpeza se desfazia sozinha.**

Ambos os jobs passaram a subir stack Supabase local e efêmera (`ci-supabase-local-start.sh` + `db reset`), com credenciais geradas no runner e guard sobre o **alvo efetivo** (`SB_URL` resolvido e conteúdo dos `.env`), não sobre os secrets — checar secrets reprovaria sempre, por um motivo que já não se aplica.

**Baseline medida no run de 2026-08-19T21:08:** 0 vendas, 0 caixas, 0 lojas novas e **0 logins** em produção — contra 2 logins no run anterior, quando só o `e2e-critical` havia sido corrigido.

**Exposição residual, registrada e não tratada:** o job `anti-replay-diagnostic-gate` (`ci-backend-supabase.yml`) ainda usa `SYNC_ENDPOINT`/`SYNC_KEY` de produção e escreve em `sync_request_nonces` (22 linhas). É tabela interna de anti-replay, não dado de negócio — decisão separada, ver item 12 do backlog.

### 14.4 Pendências — Fase 1B é o próximo passo

O que **fechou** com #309 e com a auditoria de catálogo:

- ✅ item 7 do backlog — auditoria do ledger (§14.1)
- ✅ vazamento em `verificar_consistencia_venda` e em `relatorio_consistencia_vendas`
- ✅ fix P1-3 da idempotência de AP no ar
- ✅ E2E fora de produção, com baseline provada
- ✅ material de treinamento corrigido contra a UI atual (manual do operador 1.0 → 1.1; checklist de implantação com provisionamento real de usuário)

O que **continua aberto** — agrupado como **Fase 1B (reconciliação de catálogo)**:

| # | Pendência | Classificação |
|---|---|---|
| 1B-1 | `fiscal_enfileirar_documento_venda` — produção só tem a sobrecarga de **3 args**; a Edge `sync-outbox` chama com **4** (`p_loja_id`). `PGRST202`, e o erro **não falha o batch**. | 🟠 latente hoje (0 vendas do sync em produção), 🔴 no dia em que o `pdv-local` entrar |
| 1B-2 | Produção tem **15 políticas RLS a mais** que o repositório; `perfis`, `pdv_config` e `tokens_desconto_gerente` nascem **sem policy** num `db reset`. | 🔴 bloqueia janela crítica e segunda loja |
| 1B-3 | `Filial demo` existe no repositório (`036_loja_filial_demo.sql`) e **não existe em produção** — removida à mão. `db reset` a recria. | 🟡 divergência de dado semente |
| 1B-4 | Sobrecarga `relatorio_consistencia_vendas(3 args)` removida à mão em produção; nenhuma migration do repositório a remove. | 🟡 catalogar na baseline |
| 1B-5 | 7 funções e 2 tabelas de domínio (`perfis`, `venda_engine_shadow_runs`) só em produção. | 🟠 |
| 1B-6 | Deltas de colunas/índices/constraints não auditados objeto a objeto. | 🟠 |

**A Fase 1B não bloqueia o treinamento do cliente #1** — decisão do dono, 2026-08-19. Nenhum dos itens acima é alcançável pelo operador na loja única do piloto: 1B-1 é latente até o `pdv-local` entrar, 1B-2 afeta disaster-recovery e a segunda loja, e os demais são higiene de catálogo. O que a Fase 1B bloqueia é a **janela crítica** e a **segunda loja**.

**Pré-requisito não resolvido:** a reconciliação de baseline (`supabase db pull`) não tem onde ser ensaiada. `create_branch` foi tentado e recusado — branching exige plano Pro e a organização está no Free. Ver [docs/AMBIENTES_E_RELEASE.md](docs/AMBIENTES_E_RELEASE.md) §1.

---

## 15. Testes de Impressão — 2026-08-20

Os 5 recibos implementados em PR #311/#312 (fechamento de caixa, cancelamento, devolução/troca, sangria/suprimento, além do cupom de venda já existente) foram executados de ponta a ponta com dados reais, num Supabase local isolado (Docker, zero contato com produção) — não apenas revisados por código. Detalhe completo em [docs/ROTEIRO_TESTE_IMPRESSAO_2026-08-20.md](docs/ROTEIRO_TESTE_IMPRESSAO_2026-08-20.md).

| Recibo | Resultado |
|---|---|
| Cupom de venda | ✅ Validado — item, total, pagamento corretos; mecanismo anti-venda-duplicada (P0-1) disparou e foi resolvido sem duplicar a venda |
| Suprimento | ✅ Validado — saldo antes/depois, motivo, valor corretos |
| Sangria | ✅ Validado — matemática confere |
| Fechamento de caixa | ✅ Validado — nome da loja resolve corretamente (sem cair em fallback) |
| Devolução | ✅ Validado — **lista de itens aparece completa**, confirmando que a migration `20260820120000_devolver_ou_trocar_venda_retorna_itens.sql` funciona corretamente quando aplicada |
| Cancelamento | ⚠️ Validado tecnicamente (dados corretos no recibo isolado), **mas revelou um risco real ao combinar com devolução prévia** — ver §15.1 |

Não validado neste ciclo: `/admin/relatorios` (impressão de relatório) travou em "Carregando…" no ambiente de teste local, de forma reproduzível; causa não confirmada — pode ser flakiness do servidor de desenvolvimento (mesmo padrão observado e resolvido em outras telas durante os mesmos testes) ou um problema real. Recomenda-se checagem manual antes do treinamento.

### 15.1 ✅ Corrigido — reembolso e reposição de estoque duplicados no cancelamento pós-devolução

Ao testar deliberadamente o caso adversário "devolver parte de uma venda, depois cancelar a mesma venda", `cancelar_venda_transacional` **não descontava o que já havia sido devolvido**: o recibo de cancelamento mostrava o valor total original como estornado (de novo), e a leitura do código-fonte confirmou que o mesmo problema afetava a reposição de estoque (repunha a quantidade original do item, não a quantidade líquida ainda não devolvida).

**Corrigido e testado no mesmo dia** — migration [`20260820150000_fix_cancelar_venda_desconta_devolucoes_previas.sql`](backend/supabase/migrations/20260820150000_fix_cancelar_venda_desconta_devolucoes_previas.sql), `CREATE OR REPLACE` sem mudança de assinatura. A função passa a descontar, tanto no estoque quanto no estorno de caixa, o que já foi devolvido via `venda_pos_venda_operacoes`/`estoque_reposicoes_devolucao`. Testado no Supabase local (zero contato com produção): cenário de venda R$4.000 → devolve R$2.000 → cancela → `valor_estornado` correto de R$2.000 (antes retornava R$4.000), estoque e saldo de caixa batendo exatamente com o esperado; teste de regressão (cancelamento sem devolução prévia) preserva o comportamento original. Detalhe completo em [docs/DECISAO_CANCELAMENTO_REEMBOLSO_DUPLICADO.md](docs/DECISAO_CANCELAMENTO_REEMBOLSO_DUPLICADO.md).

**⚠️ Pendente: aplicação em produção.** A migration está commitada e testada localmente, mas **não foi aplicada automaticamente em produção** — isso exige uma decisão explícita separada (é uma função financeira `SECURITY DEFINER`), não deve ser feita silenciosamente como parte de um commit de documentação. Enquanto não for aplicada em produção, o comportamento antigo continua valendo lá, e a recomendação de não demonstrar o fluxo combinado devolução+cancelamento amanhã permanece válida.

---

## 16. Testes de Atacado/Varejo — 2026-08-20

A engine de preço automático (`calcular_preco_produto`, usada online e espelhada offline) foi validada com 8 cenários via chamada direta à RPC (varejo, faixa única, múltiplas faixas, limite exato, produto sem atacado). Detalhe completo em [docs/TESTE_ATACADO_VAREJO_2026-08-20.md](docs/TESTE_ATACADO_VAREJO_2026-08-20.md).

- ✅ **Resolução de faixa correta em todos os cenários**, incluindo o caso de borda mais arriscado (múltiplas faixas — 3+ e 10+ — resolvendo sempre para a maior faixa aplicável) e o limite exato (inclusivo).
- ✅ **Online e offline são idênticos** para quantidade fracionada — comparação linha a linha do código confirma que `quantidadeParaRpcPreco` (online) e `quantidadeParaCadeiaPreco` (offline) implementam exatamente a mesma regra (`Math.max(1, Math.floor(n))`), com comentário no código-fonte declarando explicitamente que uma espelha a outra. Não há divergência conhecida.
- ⚠️ **Promoções automáticas não estão implementadas** — nem online, nem offline. A tabela `regras_preco` existe no schema mas `calcular_preco_produto` nunca a lê; uma migration recente (`hardening_tipo_preco_remove_promocao_residual`) removeu explicitamente `'PROMOCAO'` como tipo de preço válido. Isso é diferente do risco originalmente suspeitado ("validação de promoção só existe online") — o quadro real é que a funcionalidade simplesmente não existe ainda em nenhum dos dois lados (item BL-2 do backlog). Ver [docs/COMUNICADO_PROMOCOES_AUTOMATICAS.md](docs/COMUNICADO_PROMOCOES_AUTOMATICAS.md) para alinhamento de expectativa com o cliente.
- Não validado ao vivo pela UI neste ciclo (tentativa esbarrou no mesmo travamento de ambiente de dev mencionado em §15): venda de atacado completa até o recibo/estoque com um produto de múltiplas faixas. A validação foi feita por chamada direta à RPC (mesmo código que a UI usa) e por comparação de código-fonte — não por execução de UI. Uma venda varejo real *foi* validada por UI em §15 (produto diferente).

### Veredito consolidado (§15 + §16)

**Permanece 🟢 GO para o treinamento do cliente #1 amanhã (2026-08-21).** O núcleo financeiro e de precificação está validado com evidência real de execução — o gate de 6/6 (§14), os 5 recibos de impressão e os 8 cenários de preço atacado/varejo todos passaram. O achado de cancelamento pós-devolução (§15.1) foi corrigido e testado no mesmo dia — só falta a decisão explícita de aplicar a migration em produção. O item de promoções automáticas (§16) não é um bug, é uma expectativa a alinhar com o cliente ([docs/COMUNICADO_PROMOCOES_AUTOMATICAS.md](docs/COMUNICADO_PROMOCOES_AUTOMATICAS.md)) — não bloqueia um piloto de loja única com supervisão próxima.

---
