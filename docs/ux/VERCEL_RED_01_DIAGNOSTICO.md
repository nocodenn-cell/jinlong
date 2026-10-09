# VERCEL-RED-01 — Diagnóstico dos deployments em erro/cancelados

| Campo | Valor |
|---|---|
| Data | 2026-10-09 |
| Natureza | **Somente leitura.** Nenhum deploy, merge, alteração de projeto Vercel, migration ou acesso a dado real. |
| Fontes | Vercel (projetos, deployments, eventos de build), `git` (main e branches remotas), `gh` (PRs, checks), arquivos do repositório |
| Limite | A API consultada **não expõe** Root Directory, Production Branch nem o texto do Ignored Build Step. Onde isso vale, a conclusão é **inferida do comportamento** e marcada como tal. |

## 1. Tabela

| Projeto | Branch | Estado | Causa-raiz | Configuração atual | Correção recomendada | Impacto |
|---|---|---|---|---|---|---|
| `jinlong-site` | **todas** (12 deployments listados, de `ux/*` a `main`) | **ERROR** em ~1,5 s | O Root Directory configurado é `site`, e **`site/` não existe em `main`** (nem em nenhuma branch que parta dela). Evento do build: *"The specified Root Directory "site" does not exist"*, logo após o clone. O erro vem **antes** de qualquer Ignored Build Step | Root Directory = `site` (inferido pelo erro e pelas mensagens de commit); projeto criado em 2026-10-08; `live:false` | Levar `site/` para `main`. **Já existe**: PR #494 (esqueleto mínimo + script) e PR #507 (site completo), ambos abertos | Ruído em **todo PR** (check vermelho extra); nenhum build real do site; **nenhuma regressão no ERP** |
| `jinlong-site` | `main` | ERROR (mesma causa) | idem | idem | idem | O site comercial **não tem deploy de produção** hoje |
| `pdv-importados` | **toda branch ≠ `main`** (~30 deployments listados) | **CANCELED** em 0 s | **Ignored Build Step** (a própria Vercel indica `errorLink …#ignored-build-step`). Padrão observado: 100% das branches canceladas, 100% das pushes em `main` constroem | Comando **não está no repositório** (não há script de ignore para o ERP; só `pdv-importados/vercel.json` com `regions`) → está **no painel** (Settings › Git). Regra efetiva inferida: "só constrói `main`" | **Não mudar sem decisão** (ver §3). Provável proteção intencional: previews do ERP sem Supabase isolado apontariam para o banco real | **Nenhum preview do painel existe** para PRs; custo de build baixo; produção intacta |
| `pdv-importados` | `main` | **READY** (produção, `4a1da068`) | — | — | — | Produção saudável |

## 2. Respostas às perguntas da missão

1. **Root Directory do site em `main` e nas branches.** `site/` existe em `feat/site-comercial-bilingue-v1` (#491), `feat/site-integrar-main` (#507) e `hotfix/vercel-site-ignore-step` (#494). **Não existe em `main`** nem em nenhuma branch `ux/*`, `cursor/*`, `rescue/*`, `fix/*`.
2. **Só em `main`? Renomeado? Ausente nas antigas?** Nenhum dos três: o site **nunca chegou à `main`**; vive em branches de feature. Não foi renomeado. As branches antigas e as novas, cortadas da `main`, não o têm.
3. **Configurações Git/Production Branch/Root/Ignored Build Step/monorepo.** Parcialmente verificável. Repositório: `vercel.json` na raiz (`framework nextjs`, `buildCommand npm run build`, `github.silent`, `autoJobCancelation`), `pdv-importados/vercel.json` (`regions gru1`), e **uma branch com `site/vercel.json` + `ignoreCommand`**. Painel: **não lido** (ver "Preciso de você").
4. **Por que `pdv-importados` cancela.** Ignored Build Step ativo que devolve "ignorar" para qualquer branch ≠ `main`. Confirmado pela API (`errorLink`) e pelo padrão 100%/0%. O **texto exato** do comando não é legível por aqui.
5. **Constroem só quando seus arquivos mudam?** **Não.** `pdv-importados`: constrói em todo push de `main` (inclusive os que só mexem em docs/backend, pelo que se vê) e em **nenhuma** branch; a regra é por branch, não por arquivo. `jinlong-site`: hoje não constrói nunca (erro). Há um script correto por arquivo pronto em #494 (`site/scripts/vercel-ignore.sh`, com 16 testes).
6. **Builds duplicados/desnecessários/erros recorrentes.** Cada push gera **2 deployments**: um `jinlong-site` ERROR + um `pdv-importados` CANCELED. O erro recorrente é só o do site. Efeito colateral: duas entradas vermelhas/cinzas por commit em todo PR do repositório.
7. **GitHub Actions × Vercel.** São independentes. No #515: Actions = `validate-production (SSRA)` *skipping*; sem falha. Vercel = `jinlong-site` **fail**, `pdv-importados` pass (cancelado conta como "pass"), `Vercel Preview Comments` pass. Na `main`, os últimos runs de Actions estão `success`/`skipped`. **Nenhum erro real de CI está sendo mascarado pelo vermelho do Vercel**, mas dá para confundir os dois.

## 3. Pontos que mudam a recomendação

- **A correção já existe e está parada.** #494 e #507 resolvem a causa; o que falta é decidir a ordem e mergear. Os dois adicionam `site/vercel.json`, então **vão conflitar**.
- **Mergear `site/` na `main` não conserta as branches abertas.** Os deployments `ux/*`, `cursor/*` etc. continuam em ERROR **até receberem a `main` nova** (merge/rebase). Só branches cortadas depois ficam limpas. Esperar o vermelho persistir nos PRs já abertos.
- **Com só o esqueleto (#494)** o script ignora (`exit 0`) porque não há `site/package.json`: o resultado passa a ser **CANCELED limpo**, não ERROR. Ao entrar o site completo (#507), o script passa a comparar caminhos e só constrói se algo relevante mudou.
- **Habilitar preview do ERP não é inócuo.** Um preview do `pdv-importados` com variáveis de Preview apontando para o Supabase de produção exporia login e dados reais em URL de PR. Por isso **não** recomendo desligar o Ignored Build Step do ERP como correção genérica.

## 4. Menor correção sustentável (proposta — nada aplicado)

| Passo | O que | Onde | Risco |
|---|---|---|---|
| 1 | Mergear **#494** (4 arquivos: `site/vercel.json`, `site/scripts/vercel-ignore.sh`, teste, `.gitattributes`). Sem aplicação, sem tocar ERP/backend/config remota | GitHub → `main` | Muito baixo: só cria `site/` |
| 2 | Rebasear **#507** sobre `main` (resolver o conflito em `site/vercel.json`, manter a versão com `ignoreCommand`) e mergear quando o site for aprovado | GitHub | Médio: traz o app do site; faz o `jinlong-site` construir de verdade |
| 3 | Branches abertas: `git merge main` (ou rebase) para sair do ERROR | por branch | Baixo; é rotina |
| 4 | **ERP**: manter o cancelamento. Se quiserem previews, criar política **explícita**: só `ux/*`/`feat/*`, **Preview env apontando para um Supabase isolado**, nunca o de produção | Painel Vercel | Alto se feito errado; só com decisão |
| 5 | (Opcional, depois) Ignored Build Step do ERP **por caminho** (`pdv-importados/**`, `shared-core/**`, `backend/**`) para `main` não construir em commit só de docs | Painel ou `pdv-importados/vercel.json` | Baixo-médio: errar aqui deixa de publicar mudança real |

## 5. Plano de validação
1. Após o passo 1: abrir um PR **novo** de docs e confirmar que `jinlong-site` fica **CANCELED** (não ERROR) e que `pdv-importados` continua como está.
2. Conferir no deployment de `main` que `jinlong-site` não fica em ERROR e que `pdv-importados` (produção) segue READY.
3. `node --test scripts/vercel-site-ignore.test.mjs` verde na CI.
4. Após o passo 2: mudança só em `docs/` → site **CANCELED**; mudança em `site/` → site **constrói**; mudança em `pdv-importados/` → site **ignora**, ERP segue a regra atual.
5. Não deve haver nenhuma mudança no deployment de produção do ERP em nenhum passo.

## 6. Rollback
- Passos 1–2: `git revert` do merge em `main` (apenas remove `site/`; volta ao estado atual de ERROR no site, sem efeito no ERP). Nada remoto foi alterado, então não há o que desfazer no Vercel.
- Passo 3: reverter o merge na branch.
- Passos 4–5 (painel): anotar o valor anterior do Ignored Build Step/variáveis **antes** de editar; restaurar o texto anterior. Em produção, usar **Instant Rollback** para o deployment READY anterior (`dpl_HXLsPCc8kLBe994D1ahcFsLqpakn`, `main@4a1da068`) se um build real falhar.

## 7. Preciso de você (não consigo ler por aqui)
1. Para os **dois** projetos: **Root Directory**, **Production Branch** e o **texto do Ignored Build Step** (Settings › Git / General).
2. O **Preview** do `pdv-importados` tem variáveis de ambiente? Elas apontam para qual Supabase?
3. Os checks `Vercel – …` são **obrigatórios** na proteção da `main`? (se sim, o vermelho do site bloqueia merge).
4. O site comercial deve ir para `main` agora (#494 → #507) ou continua em desenvolvimento?
