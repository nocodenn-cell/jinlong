# Relatório de CI — PR #257

**Data:** 2026-08-07 · **Run:** [31214280115](https://github.com/nocodenn-cell/fastproduct/actions/runs/31214280115)
**Método:** log de cada job falhando, lido até a linha de erro. Nenhuma conclusão por inferência.

---

## Resumo

| Classe | Qtd |
|---|---|
| Regressão desta PR | **0** |
| Problema pré-existente do repositório | 3 |
| Falha de infraestrutura externa | 2 |
| Verde | 5 |

**Nenhum check vermelho é causado por esta PR.** Os três pré-existentes já falhavam na #256 e na #258, e todos têm correção em andamento na #258.

---

## Checks verdes

`build-and-test` (pdv-importados) · `build-and-test` (pdv-local) · `gitleaks` · `edge-functions-typecheck` · `Vercel Preview Comments`

---

## Checks vermelhos

### 1. `rls-rest-gate` — pré-existente

**Causa raiz:** HTTP **401 em todas as requisições**, inclusive nas que deveriam devolver `200`. O relatório do gate diz `"note": "esperado []"`, o que faz parecer negativa de policy; não é. Os JWTs guardados em `RLS_SMOKE_JWT_PAINEL` / `RLS_SMOKE_JWT_CAIXA` venceram em **2026-05-17**.

**Responsável:** configuração (segredos de CI).
**Ação:** já existe correção na #258 — `p0-rls-rest-smoke.mjs` passa a emitir o token em cada execução via `POST /auth/v1/token`, em vez de guardar um `access_token` que sempre vence. Nada a fazer nesta PR.
**Bloqueia Go-Live:** **sim, indiretamente.** Um gate marcado obrigatório passou ~3 meses sem validar nada. O risco não é o vermelho de hoje — é o verde falso de antes.

### 2. `Supabase local RLS smoke` — pré-existente

**Causa raiz:** a reconstrução do banco a partir das migrations para em `224_rls_initplan_wrap_auth_select.sql`:

```
ERROR: policy "clientes_write_gerente_loja" for table "clientes" does not exist (SQLSTATE 42704)
At statement: 11 — ALTER POLICY "clientes_write_gerente_loja" ON public.clientes
```

A 224 contém 94 statements `ALTER POLICY` que assumem policies já existentes. Em produção funcionou porque lá existiam; num banco limpo, não.

**Responsável:** código (migration).
**Ação:** **já identificada e deliberadamente adiada pela #258**, cujo relatório registra a 224 como "registrada mas NÃO corrigida — exige janela própria".
**Bloqueia Go-Live:** **sim.** Enquanto a reconstrução do zero não passar, não há como provar que o esquema em produção é reproduzível a partir do repositório.

### 3. `migration-remote-drift` — infraestrutura externa

**Causa raiz — não é drift.** O job nem chega a comparar migrations: falha no `supabase link`.

```
npm warn exec ... will be installed: supabase@2.112.0
failed to get api keys: SchemaError(Expected a string matching the RegExp
  ^...T(?:(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z))$
  at [2]["inserted_at"])
```

A CLI 2.112.0 valida `inserted_at` da resposta de API keys contra um regex que exige `Z` final; a API passou a devolver um formato que não casa. **Erro de contrato entre CLI e API do Supabase**, não do repositório.

Agravante: `npx supabase` é usado **sem versão fixa** em 10 pontos de `.github/workflows/ci-backend-supabase.yml`. Cada execução baixa a última CLI, então qualquer release do Supabase pode quebrar o CI sem nenhum commit nosso — foi o que houve.

**Responsável:** infraestrutura/configuração.
**Ação:** fixar a versão da CLI (`npx supabase@<versão-boa>` ou `supabase` em `devDependencies`). Uma linha por ponto de uso. **Não aplicada** — mexe no workflow de backend, frente que a sprint corrente não toca; ver §"Dependência de decisão".
**Bloqueia Go-Live:** **não** por si só, mas cega a detecção de drift, que é um controle relevante.

### 4. `Vercel` — infraestrutura externa

**Causa raiz:** provisionamento, não build.

| Evidência | Valor |
|---|---|
| `errorCode` / `errorMessage` | `BUILD_FAILED` / **"Resource provisioning failed"** |
| Duração (`buildingAt` → `ready`) | **659 ms** |
| Linhas de log de build | **zero** |
| `next build` local, mesmo commit | ✅ passa |
| Deploy anterior da mesma branch (`8b490a7c`) | ✅ READY, build real de **164 s** |
| Deploys ERROR no período | **apenas os 2 pushes desta PR**, com 164 s de intervalo |

Erro de código gera log de build. Este não gerou nenhum e falhou antes de o contêiner existir. Dois pushes seguidos falhando idêntico, com tudo antes verde, é assinatura de limite de concorrência ou indisponibilidade momentânea.

**Responsável:** infraestrutura (Vercel).
**Ação:** novo deploy. Nenhuma mudança no repositório.
**Bloqueia Go-Live:** **não.**

### 5. `previewkit` — infraestrutura externa (consequência do #4)

Depende do preview da Vercel; falha junto. Falha igual na #256.

---

## Dependência de decisão humana

Duas ações estão prontas e **não executadas**, porque pertencem à frente de backend/infra que a sprint corrente não toca:

1. **Fixar a versão da CLI Supabase** em `ci-backend-supabase.yml` — resolve o check #3.
2. **Novo deploy na Vercel** — resolve #4 e #5.

Ambas são reversíveis e de baixo risco. Aguardando sua liberação para aplicá-las fora do escopo de UX.

---

## Conclusão

A #257 está tecnicamente pronta: árvore limpa, nada pendente localmente, 954 testes verdes, build/lint/typecheck verdes, 9/9 guards. **O que falta é review humano** — `reviewDecision = REVIEW_REQUIRED`, 0 reviews.

Nenhum dos 5 vermelhos vem desta PR. Três apontam para trabalho real da frente de backend (#258); dois são infraestrutura externa.
