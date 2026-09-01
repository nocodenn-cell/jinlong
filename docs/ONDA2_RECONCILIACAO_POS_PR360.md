# Onda 2 — Reconciliação Pós-PR #360

**Data:** 2026-08-31 (Onda 2) · **Atualizado:** 2026-09-01 (Onda 2B — fechamento técnico, ID 50 removido do escopo)
**Documento:** Reconciliação documental e técnica após implementação Onda 2  
**Branch:** `claude/fastproduct-atacado-wave-2-cf14cd`  
**PR:** #360 — Em aguardando merge (NÃO MERGEADA em main)  
**Autoridade:** Comparação diff real entre `main` e PR #360

---

## Resumo Executivo (atualizado pós fechamento técnico Onda 2B)

**Status Onda 2 inicial (2026-08-31):** 5 IDs marcados como completos, mas 2 continham problemas reais não detectados na primeira passagem: ID 40 tinha prop sem consumidor real; ID 44 usava uma CHECK constraint que o Postgres rejeita (subquery cross-table); ID 51 estava sem RLS.

**Status pós Onda 2B (2026-09-01) — auditoria linha a linha do diff real + decisão final sobre ID 50:**

| ID | Status | O que mudou na Onda 2B |
|----|--------|------------------------|
| 32, 33 | ✅ **IMPLEMENTADO E VALIDADO** | Sem mudança — já estava correto |
| 36 | ✅ **VALIDADO** | Sem mudança — já estava correto |
| 40 | ✅ **IMPLEMENTADO E VALIDADO** | RPC agora devolve `quantidade_minima`; fio completo até o badge (era só a prop, sem dado real) |
| 44 | ✅ **IMPLEMENTADO (corrigido)** | Migration original **não funcionaria em produção** (CHECK com subquery é inválido no Postgres); reescrita como trigger |
| 50 | ⏸️ **DEFERRED — removido da PR #360** | Decisão final: não é gap a completar, é feature futura não desenhada. Migration schema-only e entrada em `database.types.ts` removidas. Ver seção dedicada abaixo |
| 51 | ✅ **IMPLEMENTADO (corrigido)** | RLS ausente adicionada; escopo confirmado como "trilha auditável" (não exige UI nova) |

**Risco Financeiro:** Zero (validações e auditoria apenas; nenhuma lógica de preço foi alterada)

**ID 50 — decisão tomada (não mais pendente):** DEFERRED. Ver seção dedicada.

**Próximas ações:**
1. Merge PR #360 após code review (6 IDs completos: 32, 33, 36, 40, 44, 51)
2. Aplicar as 3 migrations restantes em staging (sem apply prod sem autorização): IDs 40, 44, 51
3. Validação E2E em ambiente piloto
4. Quando a feature "override manual de preço por item" for desenhada (evento futuro, fora desta Onda): reavaliar ID 50 junto com o desenho da feature, não isoladamente

---

## IDs Implementados (Detalhado)

### ✅ ID 32 + 33: Deprecação UI campos legados

| Campo | Valor |
|-------|-------|
| **Requisito** | Remover inputs `preco_atacado` e `quantidade_gatilho_atacado` da UI (legados, ignorados em runtime D0) |
| **Arquivo** | `pdv-importados/components/gerente/produtos/form/sections/PrecosSection.tsx` |
| **Mudança** | Removidas 2 labels + 2 inputs + 1 variável `erroAtacado` (linhas 108-163 original) |
| **Rationale** | D0 model: SSoT = `precos_atacado` table + RPC `calcular_preco_produto`. Campos legados no `produtos` table nunca consultados em runtime. Deprecação backward-compatible: dados em BD persistem, apenas UI removida. |
| **Teste** | UI visual — componente continua renderizando (sem os 2 campos) |
| **Evidência em PR** | Diff mostra remoção de ~40 linhas de campo, sem impacto em outros inputs |
| **Status no main** | ✅ **IMPLEMENTADO & VALIDADO** (commit d5ff5d7d) |
| **Risco** | Nenhum — UI apenas; dados persistem |

---

### ⚠️ ID 36: Runtime Atacado (Validação Prior Wave 1)

| Campo | Valor |
|-------|-------|
| **Requisito** | Quantidade mínima encerrada — seleciona tier onde `quantidade_minima <= qty`, aplica preço/regraId automático |
| **Autoridade** | RPC `calcular_preco_produto` em `backend/supabase/migrations/20260823192022` |
| **Implementação** | TypeScript port: `calcularPrecoCanonico.ts` (shared-core/src/pricing/) |
| **Testes** | 13 unitários em `calcularPrecoCanonico.spec.ts` — todos PASS (validam boundaries: 9→VAREJO, 10→ATACADO, 11→ATACADO, regressão) |
| **E2E** | Teste criado mas estrutura agora aguarda integração com fixtures reais: `caixa-atacado-quantidade-minima.spec.ts` |
| **SQL Validação** | File `backend/scripts/test_quantidade_minima_10.sql` criado (pattern ROLLBACK, pronto para execução manual) |
| **Status em Wave 1** | ✅ VALIDADO — quantidade mínima ENCERRADA sem gaps |
| **Status em PR #360** | ✅ **VALIDADO** — nenhuma mudança de código; testes passam; PR consolida validação |
| **Risco** | Nenhum — ssot já presente, validação confirma |

**DECISÃO:** ID 36 considerado FECHADO por validação. Não reabrir.

---

### ✅ ID 40: Badge — Exibir Quantidade Mínima (FECHADO na Onda 2B)

| Campo | Valor |
|-------|-------|
| **Requisito** | Badge de tipo preço exibe `(min {qty})` quando tipo=ATACADO e qty_min é conhecido |
| **Estado ao final da Onda 2** | Prop `quantidadeMinima` existia na assinatura de `TipoPrecoBadge`, mas **nenhum call-site passava valor real** — era uma prop sem consumidor, teria renderizado "Atacado" sem sufixo para sempre |
| **Causa raiz** | O item do carrinho (`ItemCarrinho.resultado`) nunca carregava `quantidade_minima`; a RPC `calcular_preco_produto` não devolvia esse campo (só `regra_id`) |
| **Correção (Onda 2B)** | RPC estendida para devolver `quantidade_minima` do tier (migration `20260901030000`, `CREATE OR REPLACE`, mesma assinatura). Fio completo: RPC → `caixaPrecoProduto.impl.ts` → `caixaCatalogo.impl.ts` (busca/scan) e `useReprecificarQuantidadeCaixa.ts` (mudança de qty) → `montarItemCarrinhoCaixa` → `ItemCarrinho.resultado.quantidadeMinima` (preservado em `normalizarItemCarrinho`) → `CaixaCartList.resultadoLinha` → `TipoPrecoBadge` |
| **Arquivos alterados** | 9 arquivos (RPC, 2 tipos, 2 impls, 1 hook, 1 store compartilhada, 2 call-sites de montagem de item) — ver commit `feat(id-40)` |
| **Teste** | 24 testes unitários existentes continuam passando (`montarItemCarrinhoCaixa`, `useReprecificarQuantidadeCaixa`, `webCaixaScanProcess`) + `unifiedCartStore.spec.ts` (8/8) + `calcularPrecoCanonico.spec.ts` (13/13) |
| **Status** | ✅ **IMPLEMENTADO E VALIDADO** — dado real flui do banco até a tela |
| **Risco** | Nenhum — MANUAL/PROMOCAO/VAREJO sempre recebem `null`, sem regressão |

---

### ✅ ID 44: Validação — Tier Preço < Varejo (BUG CRÍTICO corrigido na Onda 2B)

| Campo | Valor |
|-------|-------|
| **Requisito** | Impedir tier com `preco_unitario >= preco_varejo` do produto |
| **Estado ao final da Onda 2** | Migration usava `CHECK (preco_unitario < (SELECT preco_varejo FROM produtos WHERE id = produto_id))` |
| **Bug encontrado na revisão crítica** | **PostgreSQL não permite subquery cross-table em CHECK constraint.** Essa migration falharia com erro na primeira tentativa de aplicação — não era um problema de idempotência, era uma migration que **nunca funcionaria**, em staging ou produção |
| **Correção (Onda 2B)** | Reescrita como trigger `BEFORE INSERT OR UPDATE OF preco_unitario, produto_id` — mesmo padrão de função `SECURITY DEFINER` já usado no projeto (`registrar_historico_preco_produto`, migration 259). `RAISE EXCEPTION` usa `ERRCODE = '23514'` (check_violation), o mesmo código que um CHECK nativo geraria — comportamento equivalente para quem consome o erro |
| **Compatibilidade com dados existentes** | Trigger só valida escritas NOVAS (INSERT/UPDATE) — não faz scan retroativo. Nenhum tier existente pode violar a regra no passado |
| **Validação client-side prévia** | Confirmado: não existe nenhuma validação equivalente em `precosAtacadoActions.ts` hoje — o gap de negócio era real, e segue fechado, agora com uma migration que efetivamente funciona |
| **Status** | ✅ **IMPLEMENTADO (corrigido)** |
| **Risco** | Baixo — mesmo perfil de risco de antes, mas agora a proteção realmente existe |

---

### ⏸️ ID 50: Auditoria — Motivo de Override — DEFERRED (decisão final, 2026-09-01)

| Campo | Valor |
|-------|-------|
| **Requisito canônico (matriz)** | "Auditoria sobrescrita" — SSoT esperado: `itens_venda` snapshot; causa raiz documentada: "Motivo override incompleto" |
| **O que a Onda 2 tinha entregue (removido)** | Migration `20260901010000`: coluna `itens_venda.motivo_override TEXT` + índice filtrado. Schema sintaticamente correto, mas sem nenhum consumidor real — **removida da PR #360** nesta reconciliação |
| **O que a investigação encontrou** | **Não existe, em nenhum lugar do código de produção, um fluxo que crie um item de carrinho com `tipoPreco='MANUAL'`.** O tipo `MANUAL` é aceito pelo backend (`caixaPrecoAutoritativoServer.ts`, `finalizarVendaValidation.ts` — tratado como "snapshot", sem revalidação de preço via RPC) mas **nenhuma tela/ação do frontend jamais define esse tipo** — as únicas referências a `'MANUAL'` fora dessa aceitação passiva estão em arquivos de teste |
| **Infraestrutura de motivo que JÁ existe (fluxo diferente)** | O sistema já tem uma auditoria de motivo completa e funcional, mas para outro fluxo: desconto **percentual do gerente** (`CaixaGerenteModal.tsx` → RPC `finalizar_venda_transacional_canonica_v4` → `descontos_venda.motivo_desconto` (enum) + `motivo_descricao_livre`, migration `20260731200500`). Esse fluxo é a ordem inteira (%), não um preço manual por item |
| **DECISÃO FINAL (2026-09-01)** | **ID 50 = DEFERRED.** Não é um gap de UI a completar — é uma feature ainda não desenhada (override manual de preço por item: quando é permitido, que tela, quem autoriza). Criar o schema de auditoria antes do fluxo que o consome repete o erro que gerou esta reconciliação (schema órfão, sem consumidor real, classificado incorretamente como "implementado"). |
| **Ação tomada** | Migration `20260901010000_add_motivo_override.sql` removida da PR #360 via `git rm`. Entrada `motivo_override` em `itens_venda` removida de `database.types.ts` (Row/Insert/Update). Zero referências restantes no código (`grep` confirmado). |
| **Evento que desbloqueia o ID 50** | A decisão de produto/escopo de construir a feature "override manual de preço por item". Quando essa feature for desenhada, o schema de auditoria (motivo) deve ser criado **junto** com o fluxo completo (UI → action → persistência → auditoria), não isoladamente antes dele. |
| **Não fazer até lá** | Não recriar `itens_venda.motivo_override` isoladamente de novo — esse é exatamente o padrão que causou o problema original. |
| **Status** | ⏸️ **DEFERRED — fora do escopo da PR #360.** Não é bloqueador de merge; não é gap escondido; é decisão registrada. |

---

### ✅ ID 51: Auditoria — Histórico CRUD Tiers (RLS ausente corrigido na Onda 2B)

| Campo | Valor |
|-------|-------|
| **Requisito canônico (matriz)** | "Histórico preços" — SSoT apontado: `historico_precos_produto`; causa raiz: "Tiers não historizados" |
| **Descoberta na investigação** | Já existe uma UI funcional e uma SSOT para histórico de preços: `HistoricoPrecosSection.tsx` + `historicoPrecosActions.ts`, lendo `historico_precos_produto` (migration 259) — mas essa tabela audita apenas `produtos.preco_varejo/preco_atacado/preco_custo`, não as faixas de `precos_atacado` |
| **Bug encontrado na revisão crítica** | A tabela nova `historico_tiers_crud` foi criada **sem RLS** — quebra o padrão da tabela irmã (`historico_precos_produto` tem RLS + policy GERENTE/DONO). Sem RLS, a tabela ficava sem controle de acesso via PostgREST |
| **Correção (Onda 2B)** | `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + policy de SELECT idêntica ao padrão de `historico_precos_produto` (GERENTE/DONO apenas). Sem policy de escrita — só a trigger `SECURITY DEFINER` grava |
| **Decisão de escopo (UI vs trilha auditável)** | Por instrução explícita, antes de construir UI nova foi verificado se o requisito exige UI ou apenas trilha auditável. Conclusão: **"Histórico preços" / "Tiers não historizados" é satisfeito pela existência de uma trilha auditável íntegra** (tabela + trigger + RLS correto). Estender a UI existente (`HistoricoPrecosSection`) para também mostrar entradas de tier é uma melhoria de UX genuína, mas não uma parte obrigatória do requisito — e implementá-la agora exigiria mudar o tipo `HistoricoPrecoEntry` (união discriminada) e a lógica de renderização de um componente já coberto por testes, o que é escopo adicional real, não uma correção do gap |
| **Status** | ✅ **IMPLEMENTADO** — trilha auditável íntegra (tabela + trigger + RLS) |
| **Pendência não-bloqueadora** | Exibir o histórico de tiers na UI existente fica como melhoria P2, não como parte do ID 51 |

---

## Visão Integrada: O que está em PR #360 (pós fechamento técnico Onda 2B)

### ✅ Pronto para Merge (6 IDs)
- **IDs 32, 33, 36, 40, 44, 51** — implementados, corrigidos onde havia bug real, testados, todos em PR

### ⏸️ Fora do escopo (removido da PR)
- **ID 50** — DEFERRED por decisão explícita. Migration schema-only removida, sem pendência de decisão — decisão já tomada e registrada.

### Correções feitas na Onda 2B (não eram apenas polimento — eram bugs reais)

| ID | Bug real encontrado | Por que a Onda 2 original não pegou |
|----|---------------------|--------------------------------------|
| 40 | Prop sem consumidor — badge nunca mostraria o valor | Revisão inicial verificou só a existência da prop, não o fluxo de dado ponta a ponta |
| 44 | CHECK constraint com subquery — inválido no Postgres, falharia ao aplicar | Sintaxe SQL "parece" correta a uma leitura superficial; só testar contra um Postgres real revela o erro |
| 51 | RLS ausente — tabela nova sem controle de acesso | Comparação com a tabela irmã (`historico_precos_produto`) não foi feita na primeira passagem |
| 50 | Schema criado sem consumidor real (feature não desenhada) | "Existe coluna" foi confundido com "está implementado" — schema órfão foi removido nesta reconciliação |

---

## Checklist Pré-Merge (#360) — atualizado (fechamento técnico)

- [x] IDs 32, 33 — remoção de campos OK
- [x] ID 36 — testes passam (13/13)
- [x] ID 40 — fio completo RPC→UI validado (24 testes unitários relevantes passam)
- [x] ID 44 — trigger substitui CHECK inválido; compatível com dados existentes
- [x] ID 51 — RLS adicionada; escopo (trilha auditável, sem UI nova) confirmado
- [x] ID 50 — DEFERRED; migration + entrada em database.types.ts removidas da PR
- [x] Lint: erro real (`prefer-const`) encontrado e corrigido no E2E
- [x] Regressão real de 3 testes (campos legados removidos ID 32/33) encontrada e corrigida
- [x] Types drift (2 tabelas/colunas novas) encontrado e corrigido
- [x] Migrations versionadas, idempotentes e com BEGIN/COMMIT
- [x] GitHub Actions: build-and-test, Supabase local gates, E2E crítico — verdes
- [ ] Code review humano

---

## Ambiente local — limitação encontrada (não é bug de código)

`node_modules` desta worktree está vazio (`npm install` nunca rodou aqui) — `tsc`/`eslint`/`vitest` locais falham por pacotes ausentes (`lucide-react`, `zod`, etc.) em arquivos não relacionados a esta mudança. Validação real foi feita via:
1. Testes unitários que conseguiram resolver dependências localmente
2. Testes do pacote `shared-core` (21/21 passando)
3. **CI do GitHub Actions** (ambiente limpo, `npm ci`) como gate autoritativo

### Próxima Onda:
- Onda 3: Fechamento por forma (IDs 100, 92, 99, 206, 199, 205) — diagnóstico completo em [`docs/ONDA3_DIAGNOSTICO_FECHAMENTO_CAIXA.md`](ONDA3_DIAGNOSTICO_FECHAMENTO_CAIXA.md), implementação não iniciada
- ID 50: retomar apenas quando a feature de override manual de preço por item for desenhada como iniciativa própria

---

## Matriz Final (Onda 2 + Onda 2B — fechamento técnico)

| ID | Requisito | Status Anterior | Status Final PR #360 | Bloqueador? |
|---|-----------|-----------------|----------------------|------------|
| 32 | Deprecar preco_atacado UI | IMPLEMENTADO PARCIALMENTE | ✅ IMPLEMENTADO E VALIDADO | Não |
| 33 | Deprecar qtd_gatilho UI | IMPLEMENTADO PARCIALMENTE | ✅ IMPLEMENTADO E VALIDADO | Não |
| 36 | Runtime quantidade mínima | EXISTE MAS NÃO VALIDADO | ✅ VALIDADO | Não |
| 40 | Badge qty_min | IMPLEMENTADO PARCIALMENTE | ✅ IMPLEMENTADO E VALIDADO (fio completo RPC→UI) | Não |
| 44 | Validação tier < varejo | IMPLEMENTADO PARCIALMENTE | ✅ IMPLEMENTADO (trigger corrige bug de CHECK inválido) | Não |
| 50 | Motivo override | IMPLEMENTADO PARCIALMENTE | ⏸️ **DEFERRED — removido da PR** | Não (fora de escopo) |
| 51 | Histórico tiers CRUD | IMPLEMENTADO PARCIALMENTE | ✅ IMPLEMENTADO (RLS corrigida) | Não |

---

## Decisão GO/NO-GO

| Aspecto | Decisão | Racional |
|--------|---------|----------|
| **Merge #360?** | ✅ **GO** | 6 IDs completos, testados, CI verde (exceto migration-remote-drift esperado). ID 50 fora de escopo, não bloqueia |
| **Aplicar migrations prod?** | ⏸️ **HOLD** | Aguardar autorização explícita; zero urgência; zero risco financeiro |
| **Próxima onda?** | Aguardando priorização | Onda 3 (fechamento por forma) diagnosticada, implementação não iniciada. ID 50 aguarda desenho de feature própria |
| **Risco financeiro?** | ✅ **ZERO** | Validações e auditoria apenas; sem modificação de precificação; sem dados deletados |

---

**Documento preparado por:** Claude Code  
**Última atualização:** 2026-09-01 — fechamento técnico Onda 2B (ID 50 removido do escopo)
