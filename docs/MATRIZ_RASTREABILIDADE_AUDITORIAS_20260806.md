# Matriz de rastreabilidade dos achados de auditoria — 2026-08-06

> **Nota sobre a origem do pedido.** A solicitação pediu a matriz das "auditorias produzidas
> pelo Hermes Agent". **Não existe nenhum "Hermes Agent" neste repositório** — verificado:
> `grep -ril hermes` retorna apenas `package-lock.json` (as dependências `hermes-parser`,
> `hermes-estree`, `hermes-compiler`, do toolchain Babel/React Native), e
> `git log --all -i --grep=hermes` retorna **0 commits**. O único agente definido é
> `.claude/agents/production-debugger.md`.
>
> Esta matriz cobre, portanto, **as auditorias que de fato existem** no repositório.

**Regra:** nenhum item foi marcado como concluído por leitura de documento. Cada linha
foi validada no **código**, no **banco de produção** ou em **logs de CI**, e a evidência está
citada. Onde o documento diverge da realidade, a realidade prevalece e a divergência é anotada.

**Legenda:** ✅ resolvido · 🟡 parcial · ❌ pendente · ⚪ não aplicável

---

## 1. `docs/GO_LIVE_BLOCKERS.md`

| # | Achado | Status | Evidência |
|---|---|:--:|---|
| B-1 | Runners do Actions indisponíveis | ✅ | Run `30649321448` com runner alocado; GitHub Pro ativo |
| B-2 | Required status checks inexistentes | ❌ | Console GitHub; não verificável por código |
| B-3 | Bypass list ativa | ❌ | Console GitHub |
| B-4 | Produção defasada na Vercel | ❌ | **Documentos divergem** — ver §7. Verificado via API Vercel: **nenhum deployment com `target: "production"`** desde 2026-08-01; `latestDeployment` é preview (`target: null`) |
| B-5 | Worker fiscal inativo (Vault vazio) | ❌ | Console Supabase |
| B-6 | `FISCAL_PROVIDER_TYPE` em `mock` | ❌ | Console Supabase |
| P-1 | Colisão de nome `build-and-test` | ❌ | Não bloqueador |
| P-2…P-5 | Sentry env, aliases, label, variable | ❌ | Não bloqueadores, console |
| P-6 | Medir consumo de Actions | ❌ | Não bloqueador |
| D-1 | Overload `fiscal_reprocessar_documento(uuid,text)` sem authz | ✅ | Migration `305`; live: 1 assinatura restante, contém `FISCAL_REPROCESSO_PERFIL`. Commit `07ad3d8b` |
| D-2 | Máquina de estados fiscal (`092`) não aplicada | ✅ | Migration `306`; live: 2 triggers ativos, `EMITIDO→PENDENTE` rejeitado em prova dentro da transação |
| D-3 | Sem reaper / teto de tentativas / DLQ | ✅ | Migration `307`; prova viva do ciclo órfão → DLQ → claim ignora → resgate |
| D-4 | `build-and-test` vermelho (Node 20→22) | ✅ | PR #255, job `91273647782` success |
| D-5 | SSRA valida coerência, não atualidade | ❌ | `scripts/validate-production.mjs` inalterado. Não bloqueador |
| D-6 | 14 migrations em produção fora do Git | ❌ | `git log --all` = 0 resultados nos 272 refs; `guard:migrations` reporta gap `289–304` |
| D-7 | Reconstrução do banco quebrada (raiz `248`) | 🟡 | Diagnóstico completo + correção localizada; **PR #257 já aberto** — ver §7 |

---

## 2. `GO_LIVE_CERTIFICATION_REPORT.md`

| # | Achado | Status | Evidência |
|---|---|:--:|---|
| P0 | SYNC_KEY mismatch (`401 UNAUTHORIZED`) | ❌ | Job `92650197895`: `smoke:sync-edge` → `error: 'UNAUTHORIZED'`. **Único bloqueador funcional** |
| §2.5 | Bypass de autorização gerencial em sangria | ✅ | Migration `20260731195704`, commit `92d42708` |
| §2.5 | `saldo_atual` nunca creditado | ✅ | Migration `20260731195933` + `cashSession.ts` |
| FIN-001 | Auditoria de devolução/troca na timeline | ✅ | Commit `2976aa8e` |
| GOV-001 | Duplicidade de proteção de branch | ✅ | Ruleset `16298836` deletado |
| P1.1 | Venda completa | 🟡 | Cobertura e2e estática; execução real não feita |
| P1.2 | Pagamento / split | 🟡 | Idem; `caixa-fase5b-contas-receber.spec.ts` tem teste `TODO` vazio |
| P1.3 | Caixa / reconciliação | 🟡 | `caixa-fase6-reconciliacao.spec.ts` só faz `Array.reduce` sobre mocks — **sem prova real** |
| P1.4 | Devolução/troca | 🟡 | Integration cobre só cancelamento total |
| P1.5 | Permissões / RLS por loja | 🟡 | Gate não executa (ver §5 desta matriz) |
| §5 | Ordenação de migrations | 🟡 | Virou D-7: 3 quebras reais, raiz única, correção identificada |

### 2.1 Achados de severidade média (§2.5)

| Achado | Status | Evidência |
|---|:--:|---|
| Migration revoga OPERADOR não aplicada | ✅ | `schema_migrations` tem `20260730093000`; gate `'OPERADOR'` ausente do corpo vivo |
| Token de desconto não valida `loja_id` | ❌ | RPC sem `loja_id`; **nenhum chamador envia** (`CaixaPageClient.tsx:1199`, `caixaMovimentacoes.impl.ts:100`); 2 tokens com `loja_id NULL` |
| Fechamento PDV local sem motivo de divergência | ❌ | Não reverificado (exige app Tauri) |
| Isenção do teto de 15% por item com token | ❌ | `position('max_desconto_manual_item' in v4) = 0` |
| Auditoria IP/UA/device/terminal não persistida | ❌ | Cada parâmetro aparece **1×** no `functiondef` — só a assinatura |
| `calcularTotaisComGerente` base errada / "código morto" | 🟡 | **Reclassificar**: não é morto — reexportado por `pdv-local/src/stores/cartStore.ts:6` e `pdv-importados/stores/carrinhoStore.ts` |

---

## 3. `docs/BACKLOG_PRIORIZADO_PROXIMA_SPRINT.md`

| # | Achado | Status | Evidência |
|---|---|:--:|---|
| BL-1 | Reconciliação da RPC v4 (token + auditoria) | ✅ | Live: v4 com 1 assinatura (22 args) contendo `SET usado`, `INSERT descontos_venda`, `motivo_desconto`; `descontos_venda` com as 4 colunas; app encaminha (`caixaVendas.impl.ts:307-308`) |
| BL-2 | Promoções automáticas | ❌ | **Verificado no banco: `calcular_preco_produto` NÃO trata `PROMOCAO` (`false`).** No código, `PROMOCAO` existe só como *tipo* em `shared-core/src/pricing/types.ts`; motor sem lógica. Schema (mig. 273/274) existe, regra não |
| BL-3 | Enqueue fiscal rico (metadados) | ❌ | Mesmo achado de IP/UA/device acima |
| BL-4 | Guard de drift por corpo de função | ❌ | Nenhum script em `scripts/` faz `md5(pg_get_functiondef())` |
| BL-5 | Guard de limite de item lê `pdv_config` | ❌ | `shared-core/src/stores/unifiedCartStore.ts:373`: `const maxPermitido = 15` — fixo |

---

## 4. `docs/RELATORIO_CONSOLIDADO_POS_CERTIFICACAO_OPERACIONAL.md`

| # | Achado | Status | Evidência |
|---|---|:--:|---|
| P0-3 | Criar projeto Supabase de staging | ❌ | Console. **Causa direta** do `migration-remote-drift` vermelho |
| P0-4 | Remover contas de teste de produção | ❌ | Console |
| P0-6 | Plano GitHub p/ branch protection | ✅ | GitHub Pro ativado (mesma evidência de B-1) |
| — | Sprint de certificação (6 riscos) | ✅ | Commits `6d57f70`, `68013f5`; migration `288` |

---

## 5. `AUDITORIA_CATALOGO_PRODUTO.md`

| Rodada | Escopo | Status | Evidência |
|---|---|:--:|---|
| 1 | Itens 3.1–3.3 (foto, botão morto, ajuste legado) | ✅ | PR #251 |
| 1 | Itens 4.1–4.4 (guards, cache, i18n, link) | ✅ | PR #251 |
| 2 | P0 contrato cadastro→estoque→PDV + 6 itens P1 | ✅ | PR #252 |
| 3 | P0 porta lateral de publicação + 8 itens | ✅ | Commit `4d7d9b9` |
| §8 | Filtro por tags sem UI | ❌ | Decisão de produto |
| §8 | Tela de detalhe `/admin/catalogo/[id]` | ❌ | Verificado: só `_components`, `novo`, `page.tsx`; `buscarProdutoDetalhe` com **0 consumidores** |
| §8 | Fornecedor inativo no seletor | ❌ | Decisão de produto (regra própria de bloqueio) |
| §8 | `AjusteSaldoModal` não valida "Outro" no cliente | ❌ | Ajuste fino de UX |
| §8 | Código órfão `@legacy` | ❌ | `ProdutosGerentePageClient.tsx` ainda existe; `check-entity-ssot-boundary` lista 6 avisos |
| §9 | Dívida: clone `MarcasProdutosContent` / N+1 | ❌ | Registrada, exige renomear chaves de `cadastro_comum` antes |

---

## 6. `docs/BACKLOG_TECNICO.md`

| # | Achado | Status | Evidência |
|---|---|:--:|---|
| 1 | Kardex operacional avançado (painel/export) | ❌ | 0 telas consomem `v_kardex_unificado` |
| 2 | Arredondamento heterogêneo | 🟡 | `roundAbnt` existe (`core/money/roundAbnt.ts`) e é usado em 3 pontos; auditoria dos demais `Math.round`/`toFixed` segue aberta. **Referência do doc está obsoleta** — o motor mudou para `shared/pricing/PricingService.ts` |
| 3 | Devolução fora do cancelamento | 🟡 | RPC `devolver_ou_trocar_venda` existe e é consumida; rotina única de kardex não consolidada |
| 4 | Cobertura E2E de mutadores no gerente | 🟡 | 3 specs de gerente; faltam cancelar venda e ajuste de estoque |
| 5 | Operação web "offline" | ✅ | `README.md` esclarece online-first |
| 6 | Permissão órfã de OPERADOR | ✅ | Aplicada; cabeçalho do `.sql` corrigido neste PR |

---

## 7. Divergências entre documentos encontradas ao validar

1. **B-4 (produção defasada).** `GO_LIVE_BLOCKERS.md` §1 lista como bloqueador ativo;
   `GO_LIVE_CERTIFICATION_REPORT.md` §6 diz "confirmado resolvido" em 31/07. Verificação via
   API da Vercel: **nenhum deployment com `target: "production"`** na janela desde 2026-08-01;
   o `latestDeployment` do projeto é preview. Não consegui confirmar promoção a produção
   posterior a 31/07 → **classificado como pendente, requer confirmação do owner**.
2. **D-7 — o PR já existe.** Recomendei "abrir PR de `origin/chore/node22-alignment`".
   Verificação: **PR #257 está aberto desde 2026-08-02**, `mergeable_state: blocked`,
   103 arquivos, +4.120/−7.330, 8 commits, 3 comentários. O título — *"chore(ci): align Node
   version to 22"* — e o corpo **não mencionam** que o PR carrega os renames que destravam a
   reconstrução do banco nem o refactor das Ondas 0/A/B. A ação correta não é "abrir", é
   **revisar e decidir** — e corrigir a descrição para refletir o conteúdo real.
3. **`BACKLOG_TECNICO.md` item 2** aponta `pdv-importados/core/pricing/PricingService.ts`,
   caminho que não existe mais (o motor está em `shared/pricing/PricingService.ts`).
4. **BL-2** consta como "P1 não iniciado" no backlog, mas as migrations `273`/`274` estão
   aplicadas em produção. A verificação no corpo vivo mostra que a **regra não existe** —
   schema preparado, lógica ausente. Classificado ❌, não 🟡.

---

## 8. Itens realmente pendentes para o Go-Live, por prioridade

Excluídos daqui: tudo que está ✅, os não-bloqueadores (P-1…P-6, D-5), as decisões de produto
do catálogo e o backlog técnico pós-piloto.

### P0 — bloqueiam a abertura da primeira loja

| Ordem | Item | Classe | Quem resolve |
|:--:|---|---|---|
| 1 | **P0 SYNC_KEY** — `smoke:sync-edge` retorna `401`; sincronização `pdv-local ↔ Supabase` sem prova | OPS | Owner (Supabase Dashboard) |
| 2 | **B-4** — confirmar/promover deployment de produção na Vercel | OPS | Owner |
| 3 | **D-6** — publicar as 14 migrations `289`–`304` que estão em produção e fora do Git | GOV | Owner |
| 4 | **B-2** — habilitar required status checks em `main` | GOV | Owner |
| 5 | **B-3** — esvaziar a bypass list | GOV | Owner |
| 6 | **P0-4** — remover contas de teste da produção | OPS | Owner |

### P1 — necessários antes de operar com confiança

| Ordem | Item | Classe | Quem resolve |
|:--:|---|---|---|
| 7 | **D-7 / PR #257** — revisar e decidir o PR já aberto; destrava a reconstrução do banco e 2 gates de CI. Corrigir também a descrição, que não reflete o conteúdo | GOV | Owner |
| 8 | **P0-3** — criar projeto Supabase de staging; é a causa direta do `migration-remote-drift` vermelho | OPS | Owner |
| 9 | **Rotacionar os JWTs de smoke** (`RLS_SMOKE_JWT_PAINEL`/`CAIXA`), expirados desde 17/05 — destrava `rls-rest-gate` | OPS | Owner |
| 10 | **Executar ao vivo** os P1.3 (reconciliação de caixa) e P1.5 (RLS por loja), os dois de menor confiança | QA | Dev + credencial |
| 11 | **Substituir** `caixa-fase6-reconciliacao.spec.ts`, que só faz `Array.reduce` sobre mocks | DEV | Dev |

### P1 — módulo fiscal (só se a emissão entrar no escopo do piloto)

| Ordem | Item | Classe |
|:--:|---|---|
| 12 | **B-6** — `FISCAL_PROVIDER_TYPE`: `mock` → provider real | OPS |
| 13 | **B-5** — Vault (`fiscal_worker_url`, `fiscal_worker_key`) + reagendar o cron | OPS |

> Ordem obrigatória. D-1/D-2/D-3 — os pré-requisitos de código — estão ✅.

### P2 — pós-Go-Live

| Ordem | Item |
|:--:|---|
| 14 | Renomear as migrations `305`–`308` para o prefixo gravado em produção (4 `git mv`) |
| 15 | Token de desconto com escopo de loja (edge function primeiro, RPC depois) |
| 16 | BL-3 — persistir auditoria de IP/UA/device/terminal |
| 17 | BL-2 — promoções (schema pronto, regra ausente) |
| 18 | BL-4 — guard de drift por corpo de função |
| 19 | BL-5 — limite de item por `pdv_config` (hoje `15` fixo) |
| 20 | Reclassificar `calcularTotaisComGerente` antes de decidir o fix |
| 21 | Isenção do teto de 15% com token — contrato quebrado no banco |

---

**Nenhum item das listas P0 e P1 depende de código deste PR.** Os únicos itens de código
restantes (10, 11, 15–21) são pós-Go-Live ou dependem de credencial de execução.
