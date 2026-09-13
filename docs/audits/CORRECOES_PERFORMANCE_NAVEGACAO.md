# Correções de Performance — Navegação Autenticada

- **Base:** [`RELATORIO_MEDICAO_NAVEGACAO_AUTENTICADA.md`](./RELATORIO_MEDICAO_NAVEGACAO_AUTENTICADA.md) e [`AUDITORIA_AUTH_PERFORMANCE.md`](./AUDITORIA_AUTH_PERFORMANCE.md).
- **Branch:** `perf/auth-navegacao-autenticada`, a partir de `main` `8bc56764`.

> **Atualização de 2026-09-13:** C3 e C4 foram retiradas pelos reverts `8209c321` e `3a2572d5`. O diretório `app/caixa` voltou integralmente ao estado anterior a `998dacbc`. As demais otimizações permanecem. As descrições históricas de C3/C4 abaixo não representam o código atual; veja [a validação da reversão](./REVERSAO_PRE_CARGA_CAIXA_PR411.md).

**Classificação da evidência:**

| Rótulo | Significado |
|---|---|
| **MEDIDO** | Cronometrado (produção nos relatórios-base, ou Postgres local nesta entrega) |
| **OBSERVADO** | Visto no código ou verificado por teste automatizado |
| **INFERIDO** | Estimado a partir de MEDIDO + OBSERVADO |
| **NÃO MEDIDO** | Ainda não medido, com motivo |

> Testes verdes não são prova de performance. Os tempos de produção **depois** das correções são **NÃO MEDIDO**: dependem do deploy. O roteiro de nova medição está na §4.

---

## 1. O que foi corrigido

| # | Correção | Arquivos principais | Regra de acesso/negócio |
|---|---|---|---|
| C1 | **Sessão:** leitura do perfil (`usuarios`) em **paralelo** com `auth.getUser()`, no middleware e no RSC. O `sub` do token no cookie é só uma dica; o resultado só é usado se `getUser()` confirmar o mesmo id, senão é relido sequencialmente | `lib/admin/auth/sessionConsistency.ts` | Inalterada: sem `getUser()` válido não há sessão; `ativo`/`loja_id` continuam bloqueando; a leitura roda com o JWT do request (PostgREST + RLS). Teste: `sessionConsistency.parallel.test.ts` |
| C2 | **Perfil único por request:** `getUsuarioAtual` passa a derivar do mesmo cache de `getRawSession` (antes eram dois caches lendo `usuarios` com colunas diferentes) | `lib/auth/usuarioAtual.ts` | Mesma semântica: stale/anônimo → anônimo; erro de auth/perfil → exceção |
| C3 | **Caixa (página):** removidos o 2º `auth.getUser()` e a 2ª leitura de `usuarios.perfil` | `app/caixa/page.tsx` | Mesmo redirect de sessão expirada; mesmos erros |
| C4 | **Caixa (abertura):** regras de preço, limite de sangria, configurações, status do turno (+ movimentações se aberto) e vendas em espera carregados **no Server Component, em paralelo**. Antes eram 5 Server Actions pós-hidratação, executadas em série pelo Next | `app/caixa/actions.ts` (`carregarBootstrapCaixa`), `app/caixa/server/caixaBootstrap.ts`, `app/caixa/caixaBootstrapTypes.ts`, hooks `useCaixaBootstrapData`, `useCaixaStatusMovimentacoes`, `useCaixaVendasEmEspera`, `CaixaPageClient.tsx` | Mesmas impls e mesmas checagens de sessão de cada action. Recargas após mutações/turno continuam pelas actions |
| C5 | **Vendas:** removido o `auth.getUser()` redundante após `assertGerenteSession()` | `app/gerente/vendas/actions.ts` | `assertGerenteSession` continua obrigatório em toda action |
| C6 | **Relatórios:** as 8 leituras (6 RPCs + 2 views) em `Promise.all`; sem-giro e vendas detalhadas em paralelo com o pacote principal | `app/gerente/relatorios/actions.ts`, `app/admin/relatorios/page.tsx` | Mesmas consultas, parâmetros e precedência de `rpcErro` |
| C7 | **Fuso dos relatórios:** `relatorio_tz_validado` valida nomes IANA carregando só o fuso pedido, sem varrer `pg_timezone_names` | `backend/supabase/migrations/20260913090000_relatorio_tz_validado_sem_pg_timezone_names.sql` | Equivalência verificada (§2.3); TimeZone do chamador preservado; grants preservados |
| C8 | **Categorias/Marcas:** N+1 de `HEAD count` por linha → **uma** leitura com contagem embutida (`select('id, produtos(count)')`) | `app/gerente/categorias-produtos/actions.ts`, `app/gerente/marcas-produtos/actions.ts`, `app/gerente/shared/contagemProdutosEmbutida.ts` | Mesma FK e mesma RLS de `produtos`. Sintaxe aceita pelo PostgREST de produção (GET somente leitura) |
| C9 | **Dashboard:** de 5 estágios sequenciais para 2; flags visuais e contagem de estoque baixo compartilhadas com o layout por `cache()` por request | `app/admin/dashboard/page.tsx`, `app/admin/layout.tsx`, `lib/admin/sinaisVisuaisAdmin.ts` | Mesmas consultas, mesmas métricas, mesma ordem de mensagens de erro |

### Não alterado de propósito

- **`getClaims()` no middleware:** o middleware é hoje quem bloqueia conta inativa/sem loja nas Server Actions do `/caixa`. Havia dúvida razoável de segurança, então não foi feito (AUDITORIA_AUTH_PERFORMANCE §8).
- **Prefetch dos links:** o prefetch é o que entrega o shell de loading imediato. Sem ele, o clique fica sem resposta até o servidor responder (medido: até 5,9 s). O custo de cada prefetch caiu com C1 (auth em paralelo no middleware). Nenhum prefetch foi removido.
- **Middleware para prefetch e Server Actions:** a proteção continua em todas as requisições.

---

## 2. Antes × depois

### 2.1 Idas ao Supabase por navegação (OBSERVADO no código; testes onde indicado)

"Profundidade" = número de etapas sequenciais até a última resposta.

| Fluxo | Antes | Depois | Evidência |
|---|---|---|---|
| Qualquer rota `/admin/*` — middleware | `getUser` → `usuarios` (2, profundidade 2) | `getUser` ‖ `usuarios` (2, profundidade 1) | OBSERVADO + `sessionConsistency.parallel.test.ts` (perfil iniciado antes de `getUser`) |
| Qualquer rota `/admin/*` — RSC | `getUser` → `usuarios` (2, profundidade 2) | `getUser` ‖ `usuarios` (2, profundidade 1) | idem |
| Prefetch de link | 2 em série (middleware) | 2 em paralelo | idem |
| Dashboard (página + layout, `show_stock_alerts` desligado em produção) | 11 consultas, 5 estágios (fuso → caixas → lote de 7 → [lista] → operadores); flags lidas 2× | 10 consultas, 2 estágios; flags lidas 1× | OBSERVADO |
| Relatórios | fuso + 8 em série + 2 em paralelo (≈10 estágios) | fuso + 10 em paralelo (2 estágios) | OBSERVADO |
| Categorias (página com N linhas) | 1 listagem + **N** `HEAD count` | 1 listagem + **1** contagem embutida | `contagemProdutosEmbutida.test.ts` (nenhuma consulta direta a `produtos`) |
| Marcas | 1 + **N** | 1 + **1** | idem |
| Abertura do Caixa | RSC: `getUser` + 2 leituras de perfil; depois **5 Server Actions em série** no cliente, cada uma com middleware (2) + `getUser` + RPC | RSC: sessão 2 (em paralelo) + 5 cargas em paralelo no mesmo request; **0 Server Actions na montagem** (caixa fechado) | OBSERVADO. Medido antes em produção: actions começavam 3–6 ms após o fim da anterior |
| Cada action de Vendas (listar/KPIs) | `assertGerenteSession` + `getUser` extra | `assertGerenteSession` | OBSERVADO |

### 2.2 Tempos (produção)

| Rota | Antes (MEDIDO, relatório-base) | Depois |
|---|---|---|
| Relatórios | mediana 4,8 s; pior 12,4 s | **NÃO MEDIDO**, aguarda deploy. INFERIDO: pior caso limitado pela RPC mais lenta em paralelo (≈2,1 s no pior dado medido) em vez da soma (≈10,9 s) |
| Caixa (operacional) | 2,7–3,0 s | **NÃO MEDIDO**. Pré-carga retirada: a montagem voltou às actions anteriores; a estimativa de ganho da pré-carga não se aplica. |
| Dashboard | 0,7–1,4 s por clique; 12,4 s no F5 frio | **NÃO MEDIDO** |
| Categorias/Marcas | ~4 s por request na rajada N+1 | **NÃO MEDIDO** |
| 1ª navegação fria (auth) | até 7,9 s só de auth (4 idas em série) | **NÃO MEDIDO**. INFERIDO: profundidade 4 → 2. O custo de abrir conexão no Supabase permanece (§3) |

### 2.3 Validação de fuso (MEDIDO no Postgres local)

| Medida | Antes | Depois |
|---|---|---|
| Custo da validação numa conexão nova | 75,6 / 143,9 / 419,6 ms (`EXISTS … pg_timezone_names`) | 1,3 / 2,5 / 1,5 ms |
| Produção (antes, relatório-base) | 745 ms (`EXPLAIN ANALYZE`) | NÃO MEDIDO (a migration ainda não foi aplicada em produção) |
| Equivalência de resultado | — | **0 divergências em 3.638 entradas:** os 1.196 nomes de `pg_timezone_names`, variantes em minúsculas e maiúsculas, e 50 casos de borda (NULL, vazio, espaços, abreviações, POSIX como `EST5/EDT` e `GMT/0`, caminhos, injeção) |
| TimeZone do chamador | — | Preservado (`SET LOCAL TimeZone='Asia/Tokyo'` antes → `Asia/Tokyo` depois) |
| Grants | — | `authenticated` EXECUTE = true; `anon` = false (inalterados) |

A migration também foi aplicada numa transação com `ROLLBACK` no Postgres local: `relatorio_vendas_por_dia_periodo` executou normalmente com a função nova.

---

## 3. O que permanece

1. **Custo de abrir conexão no Supabase após ociosidade** (AUDITORIA_AUTH_PERFORMANCE §4.3). É infraestrutura, não código. As correções reduzem quantas chamadas pagam esse custo e colocam em paralelo as que restam, mas não o eliminam. A investigação de pool e compute segue recomendada (O7).
2. **Duas idas de auth por request** (middleware + RSC) continuam, por segurança. Eliminar uma exigiria `getClaims()` com revisão de segurança (O1).
3. **Impls do Caixa que chamam `auth.getUser()` diretamente** (status, limite, configurações, movimentações) voltaram às actions pós-hidratação. A hipótese de deduplicação dessas cargas no mesmo render RSC deixou de se aplicar com a reversão de C3/C4.
4. **Relatório de sem-giro e vendas detalhadas** releem o fuso (`relatorio_settings`) cada um. Mesma observação de deduplicação.
5. **A migration C7 precisa ser aplicada em produção** pelo fluxo normal do projeto. Enquanto não for, C6 já paraleliza, mas cada RPC ainda pode pagar a validação antiga.

---

## 4. Como medir depois do deploy

Repetir o método do relatório-base:
- 3 rodadas de clique por rota;
- F5 por rota;
- experimento frio após ~25 min ocioso;
- `edge_logs` do Supabase por janela, para contar idas de auth e profundidade.

**Critérios de aceite sugeridos (a validar):**

| Rota | Meta |
|---|---|
| Relatórios | mediana < 2 s |
| Caixa operacional | < 1,5 s |
| Categorias | < 1 s |
| 1ª navegação fria | < 2,5 s |
