# Piloto Cliente — Jinlong (segunda-feira, 25/08/2026)

**Sprint:** noturna autônoma, 2026-08-22/23 (com acompanhamento e correção de conflito de merge em 2026-08-23)  
**Branch:** `claude/jinlong-pilot-prep-7tjrbs`  
**Base SHA:** `fba6d8e657f0ce42b921582c934bb2f02fb538c1` (= `origin/main` no início da sprint)  
**HEAD final:** `c6954a34c396c0994ae30bc36b32eb87d16b2adf` (merge de reconciliação com `main`; ver nota abaixo)  
**Recomendação final:** 🟡 **APTO COM RESTRIÇÕES** (ver §11 e §19)

---

## 1. Branch, base e HEAD

| Item | Valor |
|---|---|
| Branch | `claude/jinlong-pilot-prep-7tjrbs` |
| Base (`origin/main` no início) | `fba6d8e` — `fix(migrations): reconcilia drift do par 20260820150000/20260820233832 (#316)` |
| HEAD final | `c6954a3` — merge de `origin/main` para reconciliar conflito (ver nota) |
| Commits nesta sprint | 8 (2 merges de PRs abertas + 4 commits trazidos por elas + 1 cherry-pick + 1 doc) + 1 merge de reconciliação pós-CI — ver §6 |
| Push | `git push -u origin claude/jinlong-pilot-prep-7tjrbs` executado (ver §5) |
| PR | draft #317, base `main` ← `claude/jinlong-pilot-prep-7tjrbs` — https://github.com/nocodenn-cell/fastproduct/pull/317 |

**Nota (2026-08-23, pós-abertura da PR):** enquanto a PR ficava em observação, as PRs #314 e #315
— já incorporadas nesta branch por merge direto das branches de origem — foram mescladas em `main`
por outro caminho (merge do GitHub), e #315 recebeu correções adicionais de code review nesse
meio-tempo. Isso gerou um conflito de merge real (`mergeable_state: dirty`) em 6 arquivos de
CI/E2E. Resolvido tomando a versão de `main` para esses 6 arquivos (comprovadamente mais completa —
continha as correções do code review que a cópia desta branch não tinha); a migration RLS e os dois
documentos do piloto não foram afetados. Todos os gates foram revalidados após a resolução (ver
comentário na PR #317 com o detalhamento) — sem regressão. HEAD passou de `677b889` para `c6954a3`.

---

## 2. Objetivo e escopo real da sprint

Preparar a versão mais **segura e operacional possível** do Jinlong (workspace `pdv-importados`,
Next.js, acessado via navegador em `https://pdv-importados.vercel.app` ou domínio do cliente —
**não** o `pdv-local` Tauri, que não faz parte deste piloto) para um teste presencial controlado
em uma loja de cliente na segunda-feira 25/08/2026.

Escopo **deliberadamente não ampliado**: nenhuma funcionalidade nova de orçamento, fiscal real,
WhatsApp, backup automatizado ou relatórios completos foi implementada. O trabalho desta sprint
foi: (a) reconhecer o estado real do repositório e de PRs abertas relevantes; (b) rodar os gates
existentes de fato, sem fabricar resultado; (c) incorporar correções já escritas, revisadas e
testadas por sessões anteriores mas ainda não mescladas em `main`, quando diretamente relevantes
a P0 do piloto; (d) documentar honestamente o que pôde e o que não pôde ser comprovado neste
ambiente de execução.

---

## 3. Estado inicial encontrado

- `main` em `fba6d8e`, working tree limpo, 0 ahead/behind do remoto.
- Documentação de auditorias/go-live anteriores extensa (`GO_LIVE_CERTIFICATION_REPORT.md`,
  `GO_LIVE_EXECUTIVO_RESUMO.md`, `CHECKLIST_IMPLANTACAO_CLIENTE.md`,
  `RELATORIO_VALIDACAO_FLUXOS_2026-08-20.md`, `CORRECOES_ESTABILIZACAO.md`,
  `TECH_DEBT_VENDA_ESPERA_CLIENTE.md`, entre outros). O go-live original (loja Matriz) já
  aconteceu em 09/08/2026 e está em produção; este piloto de 25/08 é uma **segunda loja/cliente**
  do mesmo sistema multi-tenant (`lojas`/`loja_id` já existe no schema).
- `RELATORIO_VALIDACAO_FLUXOS_2026-08-20.md` afirma os 3 fluxos principais "OPERACIONAL" mas
  **não traz nenhum comando, log ou evidência bruta reproduzível** — apenas checkmarks. Não foi
  tratado como prova nesta sprint; usado só como indicação de onde olhar.
- **3 Pull Requests abertas e não mescladas** diretamente relevantes ao piloto foram localizadas
  via `list_pull_requests`/`search` do GitHub e analisadas antes de qualquer código novo ser
  escrito (Fase 1, conforme exigido pela missão):
  - **PR #314** — `fix(vendas): recibo de cancelamento usa o valor realmente estornado, não o
    total da venda`. 12/12 testes novos, verificação manual em navegador documentada.
  - **PR #315** — `fix(ci): estabiliza readiness e teardown dos E2E com Supabase local`. Esta PR
    já continha a investigação completa do `AuthRetryableFetchError`/`GoTrueAdminApi.listUsers`
    pedida explicitamente pela missão (ver §7.3) — reaproveitada, não re-derivada.
  - **PR #296** — `fix(supabase): isola descontos_venda por loja no RLS`. Corrige um vazamento
    **cross-loja real** (P0 de confiabilidade: "nenhum acesso cross-loja"), confirmado por
    leitura direta da policy vigente em `main` (§4.3).
- Nenhuma dessas 3 PRs estava mesclada em `main`; nenhuma delas é ancestral do HEAD desta sessão
  antes da sprint (verificado com `git merge-base --is-ancestor`).

---

## 4. Mudanças realizadas

Nenhum código de produto foi escrito do zero nesta sprint. As três correções abaixo já existiam,
prontas, revisadas e testadas em branches remotas — o trabalho desta sprint foi **avaliar o
risco, confirmar que resolvem um problema real de P0/P1 do piloto, e integrá-las** à branch
designada, com testes e gates revalidados após cada integração (nenhuma foi aceita "por
confiança"; guard:all + typecheck + vitest completo rodaram de novo depois de cada uma).

### 4.1 — Recibo de cancelamento mostra o valor realmente estornado (PR #314)

**Problema real:** `VendaCancelarModal.tsx` montava o comprovante de cancelamento com
`vendaAtiva.total_liquido` (o total ORIGINAL da venda) em vez do `valorEstornado` retornado pela
RPC `cancelar_venda_transacional`. Com devolução parcial prévia + cancelamento do restante, o
cupom impresso mentia o valor que efetivamente saiu do caixa.

**Evidência:** cenário determinístico — venda de 5un (R$ 112,50) → devolução de 2un (R$ 45,00) →
cancelamento das 3 restantes. Esperado no recibo: R$ 67,50. Sem o fix: R$ 112,50 (errado).
12/12 testes novos comprovam a regressão (revertendo via `git stash`, 6/12 falham exatamente no
ponto esperado: `expected 112.5 to be 67.5`).

**Relevância:** P0-16 (cancelamento certificado) e confiabilidade financeira ("nenhum dado
administrativo baseado em fonte diferente da transação real").

**Reversibilidade:** sim — reverter o merge commit `0a5aff4` isoladamente é seguro (não há
dependência de outro commit desta sprint sobre ele).

### 4.2 — Estabilização de readiness/timeout do E2E local (PR #315)

Ver §7.3 para a investigação completa do `AuthRetryableFetchError`. Resumo das 3 correções:

1. Novo step `backend/scripts/ci-e2e-readiness-check.mjs` — valida Postgres/PostgREST/GoTrue
   (inclusive a MESMA chamada `admin.auth.admin.listUsers()` que falhava) antes do E2E crítico
   começar, com diagnóstico automático em caso de falha (sem vazar credenciais).
2. `playwright.config.ts`: timeout por teste 30s → 90s (alinhado ao que `e2e/helpers/login.ts` já
   documentava precisar para compile frio do `next dev`).
3. `expectCaixaShellVisible`: trocado o seletor obsoleto ("Venda PDV", removido de propósito da UI)
   pelo placeholder de busca de produto — corrige 9 specs que falhavam deterministicamente.

Além disso, dois commits adicionais da mesma PR corrigem: NULL em colunas de token do GoTrue no
seed local (`auth.users` sem `confirmation_token`/`recovery_token`/etc. quebra
`admin.listUsers()` de forma 100% determinística em qualquer `db reset`) e o contrato de
login por perfil/idioma no E2E.

**Relevância:** resposta direta à investigação obrigatória da Fase 2 da missão — determina que a
falha é infraestrutura de teste, não produto (§7.3).

**Reversibilidade:** sim — toca apenas CI workflow, `config.toml`/`seed.sql` do Supabase local e
specs/config do Playwright. Nenhum código de produto.

### 4.3 — Isolamento por loja em `descontos_venda` (cherry-pick de PR #296)

**Problema real, confirmado por leitura direta do código em `main` antes de agir** (não apenas
citado pela PR): a policy RLS vigente em `backend/supabase/migrations/008_descontos_venda_rls.sql`
checa **somente o perfil** (`GERENTE`/`DONO`), nunca `loja_id`:

```sql
CREATE POLICY "descontos_venda_select_gerente_dono"
  ON public.descontos_venda FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO')
    )
  );
```

Isso significa que um GERENTE autenticado da loja do piloto **enxergaria e poderia alterar**
descontos de venda de **qualquer outra loja** (inclusive a Matriz, já em produção) via
`/admin/auditoria` ou PostgREST direto — violação direta do P0 "nenhum acesso cross-loja",
agravada justamente por este piloto introduzir uma segunda loja no mesmo banco.

**Correção:** nova migration `20260811110000_descontos_venda_rls_loja_scope.sql` substitui as 4
policies (SELECT/INSERT/UPDATE/DELETE) para escopar via `vendas → caixas.loja_id`: GERENTE só
enxerga descontos de vendas da própria loja; DONO/ADMIN mantêm visão de todas. Inserção via
SECURITY DEFINER (`finalizar_venda_*`) continua funcionando (RLS não se aplica a SECURITY
DEFINER).

**Como foi integrada:** cherry-pick do commit isolado (não da branch inteira, que estava 19
commits atrás da tip de `main` e traria histórico irrelevante) — apenas `backend/package.json`
teve conflito trivial (soma de duas listas de scripts npm, sem perda), resolvido manualmente e
verificado como JSON válido antes do commit.

**Teste:** `pdv-importados/tests/descontos-venda-rls-loja-scope.matrix.test.ts` — 2/2 PASS
(matriz de casos, sem precisar de banco vivo — testa a estrutura de decisão, não a policy live).
Script standalone `backend/scripts/assert-descontos-venda-rls-loja.mjs` fica disponível para
validar a policy contra um Supabase local ou de homologação **quando um estiver acessível**
(não pôde ser rodado nesta sessão — ver §7.5).

**Relevância:** P0 confiabilidade — item mais crítico desta sprint, por ser um vazamento de dados
entre lojas ativo em produção até este merge.

**Reversibilidade:** sim, é uma migration aditiva (`DROP POLICY IF EXISTS` + `CREATE POLICY`);
reverter reaplicaria as policies antigas (menos seguras, mas sem quebrar nada).

### 4.4 — O que foi deliberadamente NÃO feito

- Nenhuma migration nova além da de §4.3 foi criada.
- Nenhuma tentativa de "consertar" o `check:routes` (falha pré-existente, string de rota
  hardcoded em ~10 arquivos) — confirmado idêntico no HEAD original antes da sprint
  (`git checkout fba6d8e -- .` reproduz a mesma lista de violações). Não bloqueia o piloto
  (é um guard de SSOT de navegação, não um defeito funcional) e corrigi-lo tocaria ~10 arquivos
  fora do escopo cirúrgico desta sprint.
- Nenhuma tentativa de reescrever `scripts/pre-deploy-checklist.sh` (script legado com contagem
  de teste hardcoded desatualizada — "737 passed" — e uso de `npm run test` na raiz via turbo,
  que herda o mesmo problema de fail-fast entre workspaces visto em `check:all`). Documentado
  como dívida de tooling, não do produto (os mesmos comandos, rodados diretamente por workspace,
  passam — ver §7).
- Nenhuma tentativa de contornar a limitação de rede do sandbox desabilitando verificação de TLS,
  removendo `HTTPS_PROXY` ou qualquer outro bypass — proibido pelas regras de segurança da sessão.

---

## 5. Arquivos e migrations alterados

29 arquivos, +1953/−214 linhas, sobre a base `fba6d8e`. Nenhum arquivo de segredo, `.env*` com
valor real, ou credencial foi tocado (verificado por `git diff` completo antes do push — ver §7
"revisão final").

**Migration nova (única migration desta sprint):**
- `backend/supabase/migrations/20260811110000_descontos_venda_rls_loja_scope.sql` — aditiva.
  **Atualização 24/08/2026 (fora desta sessão, autorização explícita):** aplicada em produção
  (`kbabmewnahysfvlybiak`) via MCP `apply_migration`, registrada como `20260824092128`. Verificado
  por `SELECT` em `pg_policies` que as 4 policies exigem `u.loja_id = c.loja_id` para GERENTE.
  Ver `backend/supabase/README.md` (seção "Migrations aplicadas via MCP") e
  `backend/supabase/migration-human-gates.json` para o par git/remoto reconciliado.

Lista completa por área:

| Área | Arquivos |
|---|---|
| Backend/CI | `.github/workflows/ci-pdv-importados.yml`, `backend/package.json`, `backend/scripts/ci-e2e-readiness-check.mjs` (novo), `backend/scripts/assert-descontos-venda-rls-loja.mjs` (novo), `backend/supabase/config.toml`, `backend/supabase/seed.sql`, `backend/supabase/migrations/20260811110000_descontos_venda_rls_loja_scope.sql` (novo) |
| PDV — cancelamento | `pdv-importados/app/caixa/caixaActionTypes.ts`, `pdv-importados/app/caixa/server/caixaVendas.impl.ts`, `pdv-importados/app/gerente/vendas/actions.ts`, `pdv-importados/app/gerente/vendas/VendaCancelarModal.tsx` + 3 arquivos de teste novos |
| Auditoria/RLS | `pdv-importados/app/admin/auditoria/actions.ts`, `pdv-importados/docs/SECURITY.md`, `pdv-importados/tests/descontos-venda-rls-loja-scope.matrix.test.ts` (novo) |
| E2E | 9 specs em `pdv-importados/e2e/`, `pdv-importados/e2e/helpers/{caixaShell,login}.ts`, `pdv-importados/playwright.config.ts` |
| Documentação trazida pela PR #314 | `docs/ALINHAMENTO_AMBIENTES_2026-08-20.md` (novo, 413 linhas — evidência da verificação visual do fix de recibo) |

---

## 6. Commits criados nesta sprint

Todos na branch `claude/jinlong-pilot-prep-7tjrbs`, sobre a base `fba6d8e`:

| Hash | Mensagem |
|---|---|
| `0a5aff4` | merge: incorpora fix(vendas) recibo de cancelamento com valor real estornado (PR #314) |
| `ec59b07` | (trazido pelo merge acima) fix(vendas): recibo de cancelamento usa o valor realmente estornado, não o total da venda |
| `caac14e` | merge: incorpora estabilização de readiness/timeout do E2E local (PR #315) |
| `461aa2f` | (trazido pelo merge acima) fix(ci): estabiliza readiness e teardown dos E2E com Supabase local |
| `ae0906a` | (trazido pelo merge acima) fix(ci): corrige NULL em colunas de token de auth.users no seed local |
| `486927a` | (trazido pelo merge acima) fix(ci): corrige contrato de login por perfil e isolamento de idioma no E2E |
| `677b889` | fix(supabase): isola descontos_venda por loja no RLS (cherry-pick PR #296) |

Nenhum commit usa `--amend`, `--no-verify` ou força push. Todos os merges são `--no-ff` com
histórico completo preservado (2 pais visíveis em `git log --graph`).

---

## 7. Testes executados, comandos e resultados

Todos os comandos abaixo foram executados de fato nesta sessão, na branch final (após todas as
integrações de §4), não apenas planejados. Ambiente: sandbox com Node 22.22.2 / npm 10.9.7,
`npm ci` limpo (1453 pacotes).

### 7.1 — Verdes (evidência real)

| Comando | Resultado |
|---|---|
| `npm run lint` (turbo, 4 pacotes) | ✅ 0 erros, 1 warning pré-existente (`@typescript-eslint/no-explicit-any` em `e2e/caixa-pagamento-atalhos.spec.ts`, não introduzido nesta sprint) |
| `npx tsc --noEmit -p tsconfig.typecheck.json` em `pdv-importados` | ✅ exit 0, 0 erros |
| `npx tsc --noEmit -p tsconfig.typecheck.json` em `pdv-local` | ✅ exit 0, 0 erros |
| `npx vitest run` em `pdv-importados` | ✅ **192 arquivos, 1074 testes passando, 2 skipped, 0 falhas** |
| `npx vitest run` em `shared-core` | ✅ 28 arquivos, 181 testes passando |
| `npx vitest run` em `pdv-local` | ✅ 11 arquivos, 58 testes passando |
| `npm run guard:core` | ✅ nenhuma regra de negócio na UI |
| `npm run guard:pdv` | ✅ guard rails do fluxo de venda presentes |
| `npm run guard:routes` | ✅ 27 rotas /admin têm página |
| `npm run guard:rpc` | ✅ fluxo de venda único: v4 (web) / registrar_venda_com_itens (PDV local) |
| `npm run guard:pricing` | ✅ online RPC-only |
| `npm run guard:deps` | ✅ vitest/react únicos na árvore |
| `npm run guard:migrations` | ✅ 315 migrations (125 numeradas + 190 timestamp), nenhuma colisão |
| `npm run guard:domain` | ✅ |
| `npm run check:entity-ssot -w pdv-importados` | ✅ (1 aviso legado, pré-existente) |
| `npm run check:vendabilidade` | ✅ vendabilidade centralizada |
| `npx vitest run tests/descontos-venda-rls-loja-scope.matrix.test.ts` | ✅ 2/2 (teste novo desta sprint) |

`guard:all` completo e o typecheck de `pdv-importados` foram **rerodados depois de cada uma** das
3 integrações de §4 — não só uma vez no fim — para isolar qual mudança poderia ter quebrado algo
(nenhuma quebrou).

### 7.2 — Falhas confirmadas como pré-existentes (não atribuídas a esta sprint)

| Comando | Resultado | Evidência de que é pré-existente |
|---|---|---|
| `node scripts/check-routes-invariant.mjs` (`npm run check:routes`) | ❌ FAIL — 10 arquivos com string de rota hardcoded | Rodado também sobre `fba6d8e` puro (`git checkout fba6d8e -- .` temporário, depois revertido) — **lista de violações idêntica**, byte a byte |
| `npx tsc --noEmit` em `shared-core` (não é o `vitest`, é o typecheck isolado) | ❌ 2 erros em `src/financial/financial.spec.ts` (mocks incompletos de `ReceivableLiquidationService`/`ReceivableReader`) | `git diff` mostra o arquivo **idêntico** ao de `fba6d8e` — não tocado nesta sprint. Os mesmos testes passam via `vitest run` (o vitest usa uma configuração de TS mais permissiva que o `tsc --noEmit` standalone) |
| `bash scripts/pre-deploy-checklist.sh` | ❌ script aborta cedo (exit 1) | Bug do próprio script: `set -e` + `TEST_OUTPUT=$(npm run test 2>&1 \| grep "Tests")` na raiz, onde `npm run test` (turbo, todos os workspaces) herda o mesmo efeito cascata de `check:all` (ver 7.4) e a contagem hardcoded ("737 passed") já não bate com os 1313 testes atuais. Os comandos individuais que o script tenta encapsular (lint/typecheck/test/build) foram todos rodados diretamente nesta sprint com resultado real documentado aqui — o script em si é dívida de tooling, não um gate confiável hoje |

### 7.3 — Investigação obrigatória: `GoTrueAdminApi.listUsers` / `AuthRetryableFetchError`

Conforme exigido pela Fase 2 da missão, a causa raiz foi determinada — **reaproveitando a
investigação já completa da PR #315** (§4.2), não re-derivada do zero, e validada por leitura
do próprio código/PR, não por confiança cega:

> **Causa raiz: infraestrutura de teste, não produto.** `admin.auth.admin.listUsers()` falhava
> com `AuthRetryableFetchError: {}` (corpo vazio — assinatura de erro de rede de baixo nível, não
> um erro HTTP do GoTrue). `supabase start` só garante que o healthcheck do Docker Compose passou,
> não que o GoTrue já aceita a chamada específica que o teste faz. O seed de usuários (que usa a
> mesma Auth admin) já tinha rodado com sucesso **antes**, na mesma execução — ou seja, não era
> "Auth nunca ficou pronto", o serviço ficava instável/indisponível num instante **posterior** da
> suíte. Contribuíram também: (2) orçamento de timeout do Playwright incoerente com o que
> `login.ts` sempre precisou (30s configurado vs. 90s documentado como necessário para compile
> frio do `next dev`), mascarando a causa real atrás de "Target page ... closed"; e (3) um
> seletor de UI obsoleto (`expectCaixaShellVisible` procurando "Venda PDV", removido de propósito
> da interface) que quebrava 9 specs deterministicamente, sem relação com timing.

Não é: instabilidade genérica sem causa, configuração incorreta de credenciais, nem defeito
funcional do produto. É, sim: falta de readiness real antes de uma dependência (Auth admin),
orçamento de timeout desalinhado, e débito de teste (seletor obsoleto) — todos corrigidos pela
PR #315, integrada nesta sprint (§4.2).

**Limitação mantida documentada, não mascarada** (herdada da própria PR #315): mesmo com as 3
correções, `caixa-venda-em-espera.spec.ts` encontra um bug de especificidade de seletor
(`getByRole('status')` resolve 3 elementos simultâneos) — fora do escopo de infraestrutura,
não corrigido nesta sprint nem na PR de origem.

### 7.4 — `npm run build` (produção)

❌ **Falhou nesta sessão**, por um motivo de ambiente sandbox, não de código:

```
app/layout.tsx
`next/font` error:
Failed to fetch `Noto Sans SC` from Google Fonts.
[Error: self-signed certificate in certificate chain] { code: 'SELF_SIGNED_CERT_IN_CHAIN' }
```

Investigado antes de aceitar como bloqueio: `curl https://fonts.googleapis.com/...` → HTTP 200;
`node -e "fetch('https://fonts.googleapis.com/...')"` → HTTP 200; `node -e "fetch('https://
fonts.gstatic.com/...')"` → conecta (404 de rota, não erro de TLS). Ou seja, o Node deste
sandbox **consegue** alcançar e validar TLS contra os hosts de fontes do Google usando fetch
padrão — o cliente HTTP interno que o `next/font/google` usa durante o build não confia na CA do
proxy da sessão pelo mesmo caminho, e não há forma permitida de contornar isso (proibido
desabilitar verificação de TLS ou remover `HTTPS_PROXY`). Nenhum arquivo de fonte (`app/layout.tsx`,
`app/login/layout.tsx`) foi tocado por esta sprint — confirmado por `git diff`.

**Não atribuído a regressão de código.** Builds anteriores em CI/Vercel (rede real, sem proxy
MITM) tiveram sucesso documentado (SSRA verde, `GO_LIVE_EXECUTIVO_RESUMO.md` §Evidências,
deploy `dpl_FXFHdqB6de5hZxgTSABuF2P9tUkq`). **Ação necessária antes do piloto:** rodar
`npm run build -w pdv-importados` numa rede normal (ex.: a própria pipeline de CI, ou localmente
fora deste sandbox) para confirmar build verde nesta branch especificamente — isto NÃO foi
comprovado nesta sessão e é a maior lacuna desta sprint (ver §9 e §19).

### 7.5 — Fase 4 (validação end-to-end em ambiente local): NÃO COMPROVADA

Tentativa real, não hipotética, de rodar o roteiro completo da Fase 4 da missão
(reset local → migrations → seed → login → abrir caixa → venda varejo → venda atacado →
pagamento → conferências → cancelamento → fechamento → reload):

1. `docker ps` inicialmente falhou: **daemon Docker não estava rodando** no sandbox
   (`dial unix /var/run/docker.sock: connect: no such file or directory`).
2. Daemon iniciado manualmente (`dockerd` em background) — subiu com sucesso.
3. `npx supabase start` (mesmo comando usado pelo CI, `backend/scripts/ci-supabase-local-start.sh`)
   tentou baixar as imagens Docker do stack (`postgres`, `gotrue`, `postgrest`, `storage-api`,
   `studio`, `edge-runtime`) e **todas as tentativas de pull falharam com HTTP 403 Forbidden**,
   tanto via `ghcr.io` (redirecionado para `pkg-containers.githubusercontent.com`) quanto via
   Docker Hub (redirecionado para `production.cloudfront.docker.com`) — a política de rede do
   proxy da sessão nega essas duas CDNs de blob storage de imagem, mesmo após os 4 retries
   automáticos do supabase CLI se esgotarem.
4. `npx supabase stop --no-backup` executado para limpar o estado parcial (sem containers
   remanescentes — confirmado por `docker ps -a` vazio).

**Conclusão:** o ambiente local com banco vivo (Postgres + Auth + PostgREST) **não pôde ser
levantado nesta sessão**, por bloqueio de rede do sandbox — não por falta de Docker CLI, não por
erro de configuração do projeto, não por falta de credenciais. Todos os passos da Fase 4 que
dependem de um banco vivo (login real, abertura/fechamento de caixa, venda varejo/atacado,
conferência de estoque/caixa/auditoria, comprovante) são portanto **NÃO COMPROVADOS** nesta
sprint — não inventados, não assumidos como corretos por extrapolação dos testes unitários.
Os gates que dependem de conexão com banco (`gate:pdv`, `stress:pdv`, `stress:pdv:check`,
`validate:production`) também não puderam ser executados pelo mesmo motivo (os dois primeiros
exigem Postgres vivo; o último exige `VERCEL_TOKEN`, fora do escopo desta sessão local).

Uso de Supabase **remoto** para contornar isso foi deliberadamente **não considerado** — proibido
explicitamente pelas regras de segurança desta sessão.

---

## 8. Evidências do fluxo completo

Não há evidência de execução ao vivo do fluxo P0 completo nesta sessão (ver §7.5). O que existe
como evidência real e verificável:

- **Nível unitário/comportamental:** 1074 testes passando em `pdv-importados` cobrindo, entre
  outros, idempotência de movimentação de caixa, atalhos de teclado do PDV, formulário de
  produto (incl. preço de atacado e quantidade mínima), cancelamento de venda com valor
  correto (novo nesta sprint), fluxo de scanner de código de barras.
- **Nível estrutural:** todos os guards de arquitetura (`guard:core`, `guard:pdv`, `guard:rpc`,
  `guard:pricing`, `guard:domain`) confirmam que o fluxo de venda usa um único caminho canônico
  (RPC v4 web / `registrar_venda_com_itens` local), sem lógica de negócio duplicada na UI.
- **Nível de segurança:** a policy RLS de `descontos_venda` foi lida diretamente do arquivo de
  migration vigente em `main` antes do fix (§4.3) — não é uma suposição, é o texto exato da
  policy que estava ativa.
- **Nível "documentação anterior" (não gerada nesta sessão, citada com ressalva):**
  `RELATORIO_VALIDACAO_FLUXOS_2026-08-20.md` afirma os 3 fluxos operacionais, mas sem log/comando
  reproduzível — tratado como indício, não como prova, nesta sprint.

**O que falta, explicitamente, para ter evidência de ponta a ponta:** rodar a Fase 4 completa
(§7.5) num ambiente com Docker funcional e egress de rede liberado para `ghcr.io`/Docker Hub —
ou, alternativamente, num ambiente de homologação Supabase já provisionado, respeitando a
proibição de aplicar migrations em banco remoto de produção.

---

## 9. Matriz `Requisito | PASS | FAIL | NÃO COMPROVADO | Evidência`

| # | Requisito (P0/P1 da missão) | Status | Evidência |
|---|---|---|---|
| 1 | Login do operador | NÃO COMPROVADO | Depende de banco vivo (§7.5); código e testes unitários de auth presentes e passando |
| 2 | Abertura de caixa | NÃO COMPROVADO | Idem — `caixaMovimentacoes.impl.ts` e testes de idempotência passam isoladamente |
| 3 | Pesquisa de produto | NÃO COMPROVADO | `caixaCatalogo.impl.ts`/`webCaixaScanProcess.ts` existem e têm teste unitário; sem banco vivo não há prova ao vivo |
| 4 | Leitura por código de barras | NÃO COMPROVADO (código presente) | `useScannerDetector.test.tsx` 3/3 PASS (nível de hook); fluxo completo com produto real não testado ao vivo |
| 5 | Inclusão/remoção de item | NÃO COMPROVADO | `CaixaCartList.behavior.test.tsx` 4/4 PASS; sem banco vivo |
| 6 | Preço de varejo | NÃO COMPROVADO (lógica testada) | `calcularPrecoCanonico.spec.ts` 9/9 PASS em `shared-core` |
| 7 | Preço de atacado automático por qtde mínima | NÃO COMPROVADO (lógica testada) | Mesma suíte acima cobre a regra de precedência varejo/atacado; execução real com produto configurado não feita |
| 8 | Seleção manual de preço (se já certificada) | NÃO COMPROVADO | Fora do que pôde ser exercitado sem banco vivo |
| 9 | Desconto dentro das permissões | NÃO COMPROVADO (guard estrutural OK) | `STRICT_MANAGER_DISCOUNT_AUTH` existe como flag; fluxo de aprovação de gerente não exercitado ao vivo |
| 10 | Pagamento em Dinheiro/PIX/Débito/Crédito | NÃO COMPROVADO | `useCaixaPagamentos.behavior.test.tsx` 4/4 PASS (nível de hook); fluxo completo com RPC real não exercitado |
| 11 | Finalização da venda exatamente uma vez | NÃO COMPROVADO (idempotência testada) | `finalizarVendaCaixa.integration.test.ts`/`finalizarVendaValidation.test.ts` cobrem idempotency key; prova ao vivo pendente |
| 12 | Baixa correta de estoque | NÃO COMPROVADO | Depende de RPC + banco vivo |
| 13 | Crédito correto no caixa | NÃO COMPROVADO | Idem |
| 14 | Registro correto nos dados administrativos | NÃO COMPROVADO | Idem |
| 15 | Impressão/visualização do comprovante | PASS (parcial) | Recibo de cancelamento agora usa valor correto (12/12 testes novos, §4.1); comprovante de venda normal não teve nova evidência de impressão real gerada nesta sprint |
| 16 | Cancelamento de venda | PASS (correção aplicada) | §4.1 — bug real corrigido e testado; execução ao vivo do fluxo completo não comprovada |
| 17 | Encerramento de caixa | NÃO COMPROVADO | Depende de banco vivo |
| 18 | Persistência após reload/reinício | NÃO COMPROVADO | Não exercitado nesta sessão |
| 19 | Isolamento de dados por loja e perfil | PASS (vazamento corrigido) | §4.3 — leitura direta da policy antes/depois; teste de matriz 2/2 PASS; validação contra banco vivo pendente (`assert-descontos-venda-rls-loja.mjs` pronto, não executado) |
| 20 | Funcionamento com internet instável | NÃO COMPROVADO | Não exercitado |
| — | Nenhuma venda duplicada | NÃO COMPROVADO (idempotência testada em unidade) | — |
| — | Nenhum saldo de caixa divergente | NÃO COMPROVADO | — |
| — | Nenhuma baixa de estoque duplicada | NÃO COMPROVADO | — |
| — | Nenhum acesso cross-loja | PASS (vazamento conhecido corrigido) | §4.3 |
| — | Nenhum dado administrativo de fonte diferente da transação real | PASS (parcial, recibo de cancelamento) | §4.1 |
| — | Nenhum erro silencioso | NÃO COMPROVADO | — |
| — | Auditoria mínima das operações críticas | PASS (estrutural) | `admin/auditoria/actions.ts` documentado e mantido consistente com o fix de §4.3 |
| — | Mensagens compreensíveis ao operador | NÃO AVALIADO nesta sprint | Fora do escopo desta rodada (P1, sem P0 pendente que justificasse tempo nisso) |
| — | Nenhum dado sensível em logs | PASS (parcial) | `ci-e2e-readiness-check.mjs` documentado explicitamente para não vazar credenciais no diagnóstico; não houve varredura completa de logs de produção nesta sprint |
| — | Lint | PASS | §7.1 |
| — | Typecheck (app) | PASS | §7.1 |
| — | Testes unitários | PASS | §7.1 (1313 testes no total, 3 workspaces) |
| — | Guards de arquitetura | PASS | §7.1 |
| — | Build de produção | NÃO COMPROVADO | §7.4 — bloqueio de ambiente sandbox, ação pendente |
| — | Migrations locais aplicadas | NÃO COMPROVADO | §7.5 — Docker/rede bloqueados no sandbox |

---

## 10. Riscos restantes

1. **Build não confirmado verde nesta sessão** (§7.4) — risco de que exista algum outro problema
   de build além do fetch de fontes, não descoberto por não ter chegado a rodar até o fim. Mitigação:
   rodar `npm run build -w pdv-importados` numa rede normal ANTES de sair para a loja (ver §16).
2. **Nenhuma validação ao vivo de venda/caixa/estoque nesta sprint** (§7.5) — todo o P0 funcional
   depende de evidência de sessões anteriores (não geradas com o mesmo rigor de comando+log
   exigido por esta missão) ou de uma validação a ser feita antes de segunda-feira.
3. **`STRICT_MANAGER_DISCOUNT_AUTH` e regras de desconto/atacado** não foram exercitadas ao vivo
   nesta sessão — a lógica pura tem teste unitário, mas a integração com RLS/RPC real não.
4. **Duas outras PRs abertas relacionadas a bugs "críticos recentes"** (#306 — SECURITY DEFINER em
   diagnósticos, #304 — recebimento de OC quebrado, #299 — venda do PDV local não aparece no
   painel do gerente) **não foram avaliadas nem integradas nesta sprint** — estão fora do fluxo
   P0 de venda presencial do piloto (compras/OC e sync do PDV local não fazem parte do escopo
   desta rodada, conforme §2), mas ficam registradas aqui para o CTO decidir se algum é relevante
   antes de segunda.
5. **`check:routes` continua falhando** (pré-existente, §7.2) — risco cosmético/manutenção, não
   funcional; não bloqueia o piloto mas é dívida visível.
6. **`shared-core` typecheck standalone com 2 erros pré-existentes** em um arquivo de teste — não
   afeta o app compilado (vitest passa), mas é sinal de tipagem de mock desatualizada.

---

## 11. Funcionalidades deliberadamente fora do piloto

Conforme o escopo definido pela missão: orçamento, venda em espera com cliente associado
(débito técnico já documentado em `TECH_DEBT_VENDA_ESPERA_CLIENTE.md`, Fase 7), fiscal real
(worker em modo mock), integração WhatsApp, backup automatizado, relatórios completos além dos
já certificados em rodadas anteriores. Nenhum desses foi tocado nesta sprint.

---

## 12. Instruções exatas de instalação na máquina do cliente

Este piloto usa o **app web** (`pdv-importados`), não o `pdv-local` (Tauri). Passos (reaproveitados
de `CHECKLIST_IMPLANTACAO_CLIENTE.md`, já existente e validado em rodada anterior — não
reescritos do zero):

1. No navegador da máquina do cliente, acessar a URL de produção configurada (Vercel — confirmar
   com o CTO qual domínio está apontado para esta branch/deploy antes de ir à loja; **esta sprint
   não fez deploy, apenas preparou o código na branch** — deploy é decisão humana pós-PR).
2. Confirmar que a página carrega em menos de 5s e o formulário de login aparece.
3. Criar o usuário operador em DUAS etapas obrigatórias (documentado com o motivo exato em
   `CHECKLIST_IMPLANTACAO_CLIENTE.md` §2 — pular a etapa B faz toda venda ser recusada com
   `FINALIZAR_VENDA_CANONICA_USUARIO_INVALIDO`):
   - Passo A: Supabase Auth → criar usuário com e-mail real (nunca `.test`/`.local`/`example.com`).
   - Passo B: `INSERT INTO public.usuarios (id, nome, perfil, loja_id, ativo, idioma_preferido)`
     com o UUID do passo A e o `loja_id` **desta loja específica do piloto** (não reusar o
     `LOJA_MATRIZ_ID` a menos que seja intencional).
4. Cadastrar no mínimo 5 produtos com código de barras, preço de varejo, preço de atacado e
   quantidade mínima de atacado, e estoque inicial.
5. Cadastrar um turno de operador com saldo inicial de caixa de teste.

---

## 13. Pré-requisitos da máquina

- Navegador atualizado (Chrome/Edge recomendado).
- Conexão de internet mínima 10 Mbps (o app depende do Supabase remoto — não há modo 100%
  offline neste workspace; isso é esperado e não é uma regressão desta sprint).
- Resolução de tela: validar visualmente a tela `/caixa` na resolução real da máquina do cliente
  antes do teste presencial — não avaliado nesta sprint (P1, sem P0 pendente).

---

## 14. Variáveis de ambiente necessárias (nomes apenas, sem valores)

Conforme `.env.example` na raiz do repositório:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL` (apenas backend/scripts, nunca no frontend)
- `NEXT_PUBLIC_APP_URL`
- `FISCAL_PROVIDER_TYPE`, `FISCAL_PROVIDER_URL`, `FISCAL_PROVIDER_TOKEN`, `FISCAL_PROVIDER_TIMEOUT_MS`, `FISCAL_ENVIRONMENT`, `FISCAL_FOCUS_REF_FIELD` (fiscal fica em modo mock para este piloto — não configurar como `focus`/`bling` real)
- `AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE`, `FISCAL_DEFAULT_DOC_TYPE`
- `USE_UNIFIED_SALES_FLOW`, `STRICT_MANAGER_DISCOUNT_AUTH`
- `NEXT_PUBLIC_IDLE_LOGOUT_MINUTES`
- `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` (opcional, observabilidade)

Nenhum valor real foi lido, exibido ou incluído nesta sessão ou neste documento.

---

## 15. Procedimento de login e preparação

Ver §12 passos 3–5. Depois de criado o operador: fazer logout/login uma vez para confirmar que a
sessão persiste, e **completar uma venda de teste real antes de liberar o operador do cliente**
(prova que o Passo B — `loja_id`/`perfil` — ficou correto; sem isso, login funciona mas toda
venda é recusada).

---

## 16. Checklist para antes de sair para a loja

- [ ] Rodar `npm run build -w pdv-importados` numa rede normal (fora deste sandbox) e confirmar
      exit 0 — **item pendente desta sprint, §7.4, é o mais crítico da lista**
- [ ] Rodar a Fase 4 completa (reset local → seed → login → venda varejo → venda atacado →
      pagamento → cancelamento → fechamento → reload) num ambiente com Docker/rede liberados, ou
      em homologação — **item pendente desta sprint, §7.5**
- [ ] Confirmar com o CTO qual domínio/deploy Vercel vai receber esta branch antes do piloto
      (esta sprint não fez deploy)
- [ ] **Correção (achado de review, 24/08/2026):** `backend/scripts/assert-descontos-venda-rls-loja.mjs`
      é um assert **estático** (só lê o arquivo `.sql`, nunca conecta no banco — ver docstring do
      próprio script). Ele NÃO confirma que a policy está de fato aplicada no ambiente do piloto.
      A confirmação real, contra o banco de produção, foi feita fora desta sprint via
      `SELECT policyname, qual FROM pg_policies WHERE tablename='descontos_venda'` (ver §5) — repita
      essa query contra o banco que vai atender o piloto antes de liberar o operador, não confie só
      no script estático
- [ ] Confirmar `loja_id` da loja do piloto criado em `public.lojas` antes de cadastrar o operador
- [ ] Seguir `CHECKLIST_IMPLANTACAO_CLIENTE.md` (Dia 0) e `CHECKLIST_PRIMEIRO_DIA.md` (Dia 1) já
      existentes no repositório — não foram reescritos, continuam válidos
- [ ] Levar o número de suporte 24h já citado em `CHECKLIST_IMPLANTACAO_CLIENTE.md`

---

## 17. Checklist do teste presencial

Ver `CHECKLIST_PILOTO_CLIENTE_2026-08-24.md` (documento curto e imprimível, criado junto com
este).

---

## 18. Plano de rollback

Reaproveitado de `ROLLBACK_HOTLINE_PLAYBOOK.md` (já existente, não reescrito nesta sprint) e do
próprio `CHECKLIST_IMPLANTACAO_CLIENTE.md` §Rollback: se a venda de teste falhar duas vezes,
voltar para a branch/deploy estável anterior (`main` em `fba6d8e`, ou o deploy de produção atual
da Vercel), o CTO diagnostica o problema, e o piloto é reagendado — nunca forçar o operador a
trabalhar com o sistema instável. Como todos os commits desta sprint são reversíveis
individualmente (§4, campo "Reversibilidade" de cada um), um rollback parcial (reverter só a PR
de RLS, ou só a de recibo) também é possível sem perder as outras correções, caso um problema seja
isolado a uma delas.

---

## 19. Critérios objetivos de GO/NO-GO e recomendação final

A missão define GO apenas com evidência real de: build verde, migrations locais completas, login
funcional, abertura/fechamento de caixa, venda única persistida, estoque correto, financeiro
correto, isolamento por loja, regra de atacado correta, comprovante correto, ausência de
regressão crítica conhecida.

**Desta lista, nesta sessão:**
- ✅ Isolamento por loja — corrigido e evidenciado (§4.3)
- ✅ Ausência de regressão crítica conhecida — guards + 1313 testes verdes, nenhuma regressão
  introduzida (confirmado item a item contra o HEAD original)
- ✅ Comprovante (cancelamento) — corrigido e evidenciado (§4.1)
- ❌ Build verde — **não comprovado nesta sessão** (bloqueio de ambiente, §7.4)
- ❌ Migrations locais completas / login / caixa / venda / estoque / financeiro / atacado ao vivo
  — **não comprovados nesta sessão** (bloqueio de Docker/rede, §7.5)

Como dois critérios centrais de GO (build verde e validação funcional ao vivo) permanecem
**não comprovados por bloqueio de ambiente desta sessão específica** — não por defeito encontrado
no produto — a classificação honesta não pode ser "APTO". Ao mesmo tempo, o trabalho desta sprint
identificou e corrigiu, com evidência real, um vazamento de segurança cross-loja ativo e um bug
de valor incorreto em comprovante, sem introduzir nenhuma regressão mensurável — o que não
justifica "NÃO APTO" (não há falha nova bloqueante encontrada, apenas verificação pendente).

## 🟡 Recomendação final: **APTO COM RESTRIÇÕES**

**Restrição obrigatória antes do piloto de segunda-feira:** completar §16 (build verde fora do
sandbox + Fase 4 completa em ambiente com Docker/rede liberados ou homologação) antes de liberar
o operador do cliente para a primeira venda real. Sem isso, a decisão de GO desta sprint não tem
lastro em execução ao vivo — apenas em código revisado, testado em unidade e estruturalmente
consistente.
