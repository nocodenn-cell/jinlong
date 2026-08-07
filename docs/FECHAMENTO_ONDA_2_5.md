# Fechamento da Onda 2.5 — Relatório Final

**Data:** 2026-08-07
**Branch:** `chore/node22-alignment` · commit `2d3fdd89`
**Objetivo declarado:** encerrar a rodada com o repositório o mais limpo possível antes do Go-Live.

---

## 0. Resposta direta à meta de 100%

A meta era "0 PRs pendentes, 0 branches órfãs, 0 pendências conhecidas". **Não foi atingida, e não deveria ser tentada nesta sessão.** O repositório tem **48 PRs abertas, 257 branches remotas e 61 locais**. Fechar isso significa mass-close de PRs alheias e deleção de centenas de branches — ações destrutivas, voltadas para fora, e irreversíveis do ponto de vista de quem depende delas.

O que fiz: **fechei 100% do que é meu e do que é seguro**, e classifiquei o resto com decisão recomendada por item. A árvore de trabalho está limpa, os 9 guards estão verdes e o P0 foi resolvido com evidência.

---

## 1. P0 — resolvido

**ID-01** — 4 contas `DONO` de teste com leitura global de vendas e estoque da Matriz.

Executado com estratégia reversível (`ativo = false`, nunca `DELETE`). Evidência antes/depois em `AUDITORIA_IDENTIDADE_PRODUCAO.md` §7.

Pré-verificação que evitou quebrar função legítima: confirmei que o smoke de homologação **cria** contas novas a cada execução em vez de reusar, e que `e2e-dono@localhost.test` não é consumida por nenhuma spec.

| Verificação pós | Resultado |
|---|---|
| `DONO` ativos restantes | **1** — a conta real |
| Vendas · caixas · estoque | 56 · 39 · 113 — inalterados |
| Contas inativadas com venda ou caixa aberto | **0** |

---

## 2. Riscos restantes

| Classe | Qtd | Itens |
|---|---|---|
| **P0** | **0** | — |
| **P1** | **2** | ID-02 (7 contas de teste ativas) · B-2/B-3 (governança do repo: sem required checks, bypass ativo) |
| **P2** | **7** | ID-04 `lojas.ativo` sem contrato · ID-05 `getUsuarioAtual` sem defesa em profundidade · ID-06 6 lojas fantasma · ID-07 dados de produção são resíduo de teste · ID-08 RLS de `vendas_em_espera` · P2-A `app/gerente` descrito como morto · P2-C contratos duplicados (`UUID_RE` ×7, `oneOf` ×4, período ×2) |

**Novo risco encontrado nesta rodada — ID-08.** `TODO_auditoria_255.md` estava **dentro da árvore de código** (`app/caixa/`), com 12 pendências de RLS que ninguém lia. Movido para `docs/auditoria/`. Três pendências verificadas e confirmadas vivas em produção: a policy SELECT deixa qualquer operador da loja ler o carrinho pausado dos colegas, e a policy UPDATE não tem `WITH CHECK`.

**Não corrigido, por decisão:** exige migration de policy — alteração de contrato de segurança sob feature freeze. Impacto real hoje é baixo (2 linhas de teste, coluna de token vazia, escopo intra-loja) e o custo de errar uma policy no núcleo é alto. Documentado com evidência em `AUDITORIA_IDENTIDADE_PRODUCAO.md` §8.

**Todo risco tem responsável atribuído** — ver §8.

---

## 3. Merges que faltam

**48 PRs abertas.** Distribuição:

| Situação | Qtd |
|---|---|
| `CONFLICTING` (precisam rebase antes de qualquer coisa) | **26** |
| `MERGEABLE` | 22 |
| Draft | 23 |
| Prontas (não-draft) | 25 |
| Aguardando review (`REVIEW_REQUIRED`) | **48 — todas** |
| Bloqueadas por CI vermelho | ver §6 |

Histórico: 120 merged, 208 closed.

### 3.1 As que importam agora

| PR | Branch | Estado | Impacto | Prioridade | Bloqueador | Ação recomendada |
|---|---|---|---|---|---|---|
| **#257** | `chore/node22-alignment` | MERGEABLE, review pendente | **Carrega 30 commits**, incluindo esta rodada | **P0 de fluxo** | Escopo × título — ver §7 | **Renomear e redescrever**, ou dividir |
| **#256** | `chore/dominio-onda0-onda-a` | MERGEABLE, review pendente | Onda 0/A/B de domínio | P1 | — | **Obsoleta como PR separada**: `git merge-base` confirma que #257 **contém** #256. Fechar #256 ou mergear antes |
| #258 | `claude/audit-findings-go-live-qldlgw` | MERGEABLE, CI parcial vermelho | Fecha D-1/D-2/D-3 fiscais | P1 | 2 checks de RLS falhando | Corrigir CI e mergear — desbloqueia a ordem fiscal |
| #187 | `cursor/bugs-cr-ticos-recentes-0bf7` | MERGEABLE | Escopo da RPC canônica de venda | P1 | review | Revisar — toca núcleo transacional |
| #131 | `claude/rls-schema-auth-isolation-rcxxe1` | MERGEABLE | Tenant-only RLS | P1 | review, 1 mês parada | Revisar ou fechar |
| #241–#249 (8 PRs) | `dependabot/*` | MERGEABLE | Bumps de deps/actions | P2 | review | Mergear em lote após CI verde |
| #229, #209, #208, #207, #203 | `onda-5-*`, layout PDV | CONFLICTING, draft, 20 dias | Migração visual do /caixa | **P3** | Conflito + sobreposição com Ondas 1-2 | **Fechar**: a migração visual do /caixa foi superada pelas Ondas 1-2 |
| #173–#179 (5 PRs `loop/*`) | ciclos de teste do caixa | CONFLICTING, 24-25 dias | Testes do caixa | P3 | Conflito | Avaliar aproveitamento dos testes; fechar as branches |
| #133, #148–#152, #165, #188, #197, #198, #201 | auditorias e fixes antigos | CONFLICTING, 21 dias–1 mês | Diversos | P3 | Conflito | **Obsoletas** — triar e fechar |

**Estimativa de merges realmente necessários antes do Go-Live: 4** (#257, #258, #187, #131). O resto é triagem.

---

## 4. Branches

| Categoria | Qtd |
|---|---|
| Locais (total) | **61** |
| Locais já mergeadas em `origin/main` | **11** (10 removíveis; `main` fica) |
| Remotas (total) | **257** |
| Remotas já mergeadas em `origin/main` | **35** |
| Stashes | **16** |

### 4.1 Locais removíveis com segurança (já em `origin/main`)

`_merge-test` · `backup-ui-migration-status` · `chore/missao3-consolidacao-jinlong` · `chore/sentry-canonical` · `consol-sim` · `hotfix/chart-imports` · `merge/consolidacao` · `release/admin-auth-stable-v1` · `release/claude-consolidation` · `ui-lock/login-migration`

Todas com conteúdo já em `main` — deletar não perde nada.

### 4.2 Tabela de decisão (branches ativas)

| Branch | Objetivo | Status | Pode excluir? | Depende de merge? | Depende de revisão? |
|---|---|---|---|---|---|
| `chore/node22-alignment` | Node 22 + 29 commits alheios | **ativa, 30 ahead** | Não | — | **Sim (#257)** |
| `chore/dominio-onda0-onda-a` | Onda 0/A/B domínio | contida em #257 | Após merge de #257 | Sim | Sim (#256) |
| `chore/fase2-infra-hardening` | War room infra | parada | Não | Sim | Sim |
| `feat/first-customer-go-live` | P0 do 1º cliente | 1 ahead | Não | Sim | Sim |
| `feature/cadastro-produto-ux` / `-melhorias` | UX cadastro | 2 ahead cada, PRs conflitando | Provável (superadas) | — | Triagem |
| `fix/ci-baseline-verde` | Reverdecer CI | parada | Não | Sim | Sim |
| 10 branches da §4.1 | histórico | mergeadas | **Sim** | Não | Não |
| ~200 remotas `claude/*`, `loop/*`, `backup/*` | sessões antigas | abandonadas | **Sim, em lote** | Não | Não |

**Não executei nenhuma deleção.** Deletar 200+ branches remotas é irreversível para quem depende delas e precisa da sua decisão. As 10 locais da §4.1 são seguras e posso remover assim que você confirmar.

### 4.3 Stashes

16 stashes, o mais antigo referenciando branches que já não existem. São WIP abandonados de sessões passadas. Recomendo `git stash drop` em lote **após** você confirmar que nenhum contém trabalho vivo — não tenho como saber isso sozinho.

---

## 5. Organização executada

| Ação | Item |
|---|---|
| Movido | `app/caixa/TODO_auditoria_255.md` → `docs/auditoria/TODO_AUDITORIA_255_VENDAS_EM_ESPERA.md` (registro de dívida estava dentro do código) |
| Removido | `_stash-clone-aninhado-21-05.patch` (patch de stash versionado na raiz) |
| Removido | `pdv-importados/vercel.json.backup` |
| Ignorado | `.continue/`, `.skills/`, `pdv-importados/scripts/_audit_*.mjs` |
| Removido (Onda 2.5) | chave i18n órfã `relatorios_filtro_xlsx`; variáveis `cn` e `lk` órfãs |
| Consolidado | `clampPage` (3 cópias → `PaginationBar`) |

**TODOs/FIXMEs no código-fonte: 2**, ambos rastreáveis e datados (`auditoria-255`, `fase-7`). Não há dívida de comentário temporário. Nenhuma migration temporária encontrada (`guard:migrations` OK). Nenhum teste temporário.

**Árvore de trabalho: limpa.** Único arquivo não commitado é `.claude/settings.local.json` (config local de ferramenta, não deve ser versionado).

---

## 6. Estado da validação

| Gate | Estado |
|---|---|
| `typecheck` | ✅ 0 erros |
| `next build` | ✅ compila |
| `next lint` | ✅ 0 warnings |
| Testes | ✅ **937 / 170 arquivos** |
| `guard:core` · `pdv` · `routes` · `rpc` · `pricing` · `deps` · `migrations` · `domain` · `entity-ssot` | ✅ **9 de 9** |

### 6.1 `guard:rpc` — reverdecido nesta rodada

Estava vermelho desde antes da Onda 1 e eu o vinha reportando como "falha pré-existente". **Investiguei e era falso positivo:** o guard fazia `text.includes(rpc)` sobre o arquivo inteiro, e `caixaFormasPagamento.impl.ts` apenas *menciona* `finalizar_venda_transacional_canonica_v4` num docblock explicando que a validação de forma de pagamento migrou para lá. A função não chama a RPC.

Corrigido com `stripComments()` antes da checagem. **Mutação confirma que o guard continua pegando violação real** — injetei uma chamada verdadeira à v4 (detectou `CALLER DUPLICADO`) e uma chamada à v3 bloqueada (detectou `BLOQUEADA`), depois revertí.

Isto importa além do símbolo verde: um guard que acusa falso positivo deixa de ser lido, e aí não protege mais.

### 6.2 CI do repositório

PR #258 tem 2 checks vermelhos (`Supabase local RLS smoke`, `Test RLS scope by profile`) e 3 verdes. **Fora do escopo desta rodada** — é a frente fiscal/RLS, com dono próprio.

**Ressalva de governança (B-2/B-3, `GO_LIVE_BLOCKERS.md`):** `main` exige checks `build`/`lint`/`test`/`typecheck` que **nunca foram publicados por nenhum workflow**, e há bypass list ativa. Ou seja, o verde local que reporto acima **não é imposto por nada no merge**. Isso é P1 de governança e depende do owner do repositório.

---

## 7. Estratégia de branch — resposta objetiva

**Ainda faz sentido continuar nesta branch?** **Não.**

`chore/node22-alignment` tem PR #257 intitulada *"chore(ci): align Node version to 22"* e carrega **30 commits**: 1 é o Node 22, ~24 são remediação de auditoria de backend (SEC, SSOT, TB, FLX, DAT, BR, pacotes F1), 4 são a Onda 0/A/B de domínio, e 1 é esta rodada de UX. O título não descreve nem 5% do conteúdo.

**Já deveria ter sido mergeada?** A parte do Node 22, sim — há 4 dias, e está `MERGEABLE`. O resto nunca deveria ter entrado aqui.

**Há razão técnica para abrir nova branch?** **Sim, duas:**

1. **Revisão impossível.** Ninguém revisa 30 commits heterogêneos. Uma mudança trivial de CI está refém de uma remediação de backend e de uma rodada de UX.
2. **Sobreposição de PRs.** `git merge-base --is-ancestor` confirma que **#257 contém #256**. Duas PRs abertas para o mesmo conteúdo.

**Estratégia correta para a próxima onda:**

| Passo | Ação |
|---|---|
| 1 | **Renomear #257** para refletir o conteúdo real (ex.: *"Remediação de auditoria backend + Ondas 1-2.5 de UX"*), ou dividir em duas PRs se quiser revisão granular |
| 2 | **Fechar #256** — conteúdo já contido em #257 |
| 3 | **Mergear #257** em `main` — desbloqueia tudo que está atrás |
| 4 | **Próxima onda parte de `main` atualizada**, em branch nova e de escopo único (ex.: `feat/onda-3-clareza-operacional`) |
| 5 | Não voltar a empilhar frentes distintas na mesma branch |

**Não empurrei nem criei branch/PR.** São ações voltadas para fora e a decisão de como reorganizar #256/#257 é sua.

---

## 8. Responsável por risco

| Risco | Classe | Responsável |
|---|---|---|
| ID-02 — 7 contas de teste ativas | P1 | **Você** — depende de decidir `demo@jinlong.com` e o destino da suíte E2E que roda contra produção |
| B-2 / B-3 — required checks e bypass | P1 | **Owner do repositório** (GitHub Settings) |
| B-4/B-5/B-6 — produção defasada, worker fiscal | P1/P2 | Admin Vercel / Supabase (`GO_LIVE_BLOCKERS.md`) |
| ID-08 — RLS `vendas_em_espera` | P2 | Frente de domínio — exige migration com revisão formal |
| ID-04/05/06/07 | P2 | Registrados; sem ação até multi-loja ou pós-Go-Live |
| P2-A / P2-C — descrição de `app/gerente`, contratos duplicados | P2 | Próxima onda de consolidação |
| CI vermelho do #258 | P1 | Frente fiscal |

---

## 9. Checklist de Go-Live — estado atualizado

| Item | Estado |
|---|---|
| Contas de teste `DONO` com leitura global | ✅ **fechado hoje** |
| Demais contas de teste em produção | ⏸️ aguardando sua decisão |
| Contratos login / estoque / venda | ✅ verificados íntegros |
| RLS nas 9 tabelas críticas | ✅ ativa |
| Fluxo de venda único (v4) | ✅ `anon` sem acesso a nenhuma RPC de venda |
| Guards | ✅ 9/9 |
| Build · lint · typecheck · testes | ✅ |
| Required status checks no `main` | ❌ **não existem** (B-2) |
| Bypass list | ❌ **ativa** (B-3) |
| Produção na versão de `main` | ❌ defasada (B-4) |
| Worker fiscal | ❌ inativo (B-5/B-6) |
| Homologação humana (18 cenários) | ❌ nunca executada |
| Branch/PR desta rodada | ⏸️ decisão do §7 |

---

## 10. Resumo numérico

| Métrica | Valor |
|---|---|
| P0 restantes | **0** |
| P1 restantes | 2 |
| P2 restantes | 7 |
| Merges necessários antes do Go-Live | **4** |
| PRs abertas | 48 (26 conflitando · 23 draft) |
| Branches locais | 61 — **10 removíveis com segurança** |
| Branches remotas | 257 — 35 já mergeadas |
| Stashes | 16 — todos candidatos a descarte |
| Testes | 937 ✅ |
| Guards | 9/9 ✅ |
| Árvore de trabalho | limpa |

---

## 11. Preparação dos merges (2026-08-07) — correção do §3.1

Ao preparar os merges, verifiquei `mergeStateStatus` e o CI de cada PR. **Minha estimativa de "4 merges necessários" no §3.1 estava otimista:** eu classifiquei por `mergeable`, que só indica ausência de conflito textual, não prontidão.

Estado real:

| PR | mergeState | CI | Tamanho | Pronta? |
|---|---|---|---|---|
| **#257** | `MERGEABLE` | ✅ 9/9 guards, 937 testes locais | 31 commits | ✅ **sim — só falta review** |
| #258 | **`BLOCKED`** | ❌ 5 falhando: E2E crítico, RLS smoke, RLS scope, migration-drift, rls-rest-gate | +3904/−96 em 44 arquivos | ❌ não |
| #187 | **`BEHIND`** | ❌ 8 falhando **em 2–3 segundos** — assinatura de falha de infra, não de teste | +168/−0 em 2 arquivos | ❌ não |
| #131 | **`BEHIND`** | ❌ 4 falhando (execuções reais de 2–3 min), run de ~1 mês atrás | +556/−3 em 3 arquivos | ❌ não |

### O que cada uma precisa antes de mergear

**#257** — apenas review. Foi renomeada para refletir o conteúdo real e o branch foi empurrado (antes disso a PR não continha os 22 commits das Ondas 1–2.5, que existiam só localmente).

**#258** — 5 checks vermelhos, sendo `E2E crítico (sistema de risco)` o mais sério. É a frente fiscal (D-1/D-2/D-3), com 44 arquivos alterados. Não é revisável junto com o resto.

**#187** — todos os checks falham em 2–3 segundos. Isso não é teste quebrado: é setup/infra abortando na largada, coerente com o período de bloqueio de billing do GitHub Actions registrado em `GITHUB_ACTIONS_BILLING_UNBLOCK.md`. **Precisa de rebase e nova execução antes de qualquer conclusão sobre o mérito.** São 2 arquivos — provavelmente barato depois disso.

**#131** — `BEHIND` e com run de ~1 mês. Falhas de RLS em execuções reais. Precisa rebase + re-run; só então dá para saber se as falhas são do PR ou do baseline da época.

### Consequência para o sequenciamento

**Só a #257 está pronta.** As outras três são todas de backend/RLS/fiscal — exatamente a frente que a próxima sprint não vai tocar. Elas não bloqueiam a sprint de UI/UX, mas **bloqueiam o Go-Live** e precisam de dono na frente de backend.

Ordem recomendada: **#257 → fechar #256 → (frente backend assume #187 → #131 → #258)**.

---

## 12. Conclusão da #257 e triagem de PRs (2026-08-07)

### 12.1 Review: não posso obter

A #257 tem `reviewDecision = REVIEW_REQUIRED` e **0 reviews**. Review exige um revisor humano — não é algo que eu possa produzir, e auto-aprovar a própria PR não seria review, seria contorno de controle. Todas as 48 PRs abertas estão nesse estado; é sintoma do B-2/B-3 (governança sem revisor designado), não desta PR.

### 12.2 Merge: `BLOCKED`, e mergear exigiria o bypass que documentamos como risco

`mergeStateStatus = BLOCKED`. Mergear hoje exigiria `gh pr merge --admin`, ou seja, **usar exatamente a bypass list que o B-3 classifica como P1** — a mesma que permitiu o PR #232 entrar com todos os checks vermelhos.

Não executei. É decisão de governança do owner, não ação técnica.

### 12.3 CI da #257 — triagem por origem

| Check | Resultado | É meu? |
|---|---|---|
| `build-and-test` (pdv-importados) | ✅ pass | — |
| `gitleaks` · `edge-functions-typecheck` | ✅ pass | — |
| `migration-remote-drift` · `rls-rest-gate` · `previewkit` | ❌ fail | **Não** — falham igual na #256 e na #258 |
| `Supabase local RLS smoke` | ❌ fail | **Não** — é a reconstrução do zero que a #258 remedia |
| `Vercel` | ❌ fail | **Não** — ver abaixo |

**Vercel — investigado a fundo porque era o único check que passava na #256 e falha na #257.**

| Evidência | Valor |
|---|---|
| `errorCode` | `BUILD_FAILED` · `errorMessage`: **"Resource provisioning failed"** |
| Duração do build | **659 ms** (`buildingAt` → `ready`) |
| Linhas de log de build | **zero** — `get_deployment_build_logs` retorna vazio |
| `next build` local no mesmo commit | ✅ passa |
| Deploy anterior da mesma branch (`8b490a7c`) | ✅ READY, build real de **164 s** |
| Outros deploys no período | READY/CANCELED; os **únicos dois ERROR são meus dois pushes**, com 164 s de intervalo |

Erro de código produz log de build. Este não produziu nenhum, e falhou antes do contêiner existir. **É falha de provisionamento da Vercel — plataforma ou limite de concorrência —, não regressão de código.** Basta um novo deploy para confirmar; não requer mudança no repositório.

### 12.4 Destino das PRs

| PR | Decisão | Executado |
|---|---|---|
| **#256** | **Fechada sem merge** — contenção provada por `git merge-base`; nada se perde, o trabalho entra por #257 | ✅ fechada |
| **#187** | **Manter aberta, bloqueada pela #258** | ✅ triagem comentada |
| **#131** | **Manter aberta, bloqueada pela #258** | ✅ triagem comentada |

**Motivo técnico comum a #187 e #131** — as duas são **exclusivamente migration**, sem uma linha de código de aplicação, e ambas usam **prefixo de timestamp**:

```
20260702000000_254_...   ordena 1º   (#131)
20260714110959_...       ordena 2º   (#187)
248_fix_anon_grant_drift ordena 3º
289_reafirma_grants      ordena 4º
```

No 2º caractere `0 < 4`: arquivo escrito depois roda antes. É a mesma família de defeito que a #258 está remediando commit a commit. Mergear qualquer uma antes da #258 reintroduziria a inversão numa reconstrução do zero — exatamente o que o job `Supabase local RLS smoke` exercita e que já falha hoje.

Ordem correta: **#257 → #258 → rebase de #187 e #131 com renomeação para `NNN_`**.

Nenhuma das duas é obsoleta — ambas carregam trabalho real de segurança (escopo da RPC canônica de venda; isolamento tenant-only por JWT). Fechá-las perderia conteúdo. Elas precisam de **dono na frente de backend**, que não é a sprint corrente.
