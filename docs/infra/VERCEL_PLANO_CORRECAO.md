# Plano de correção — CI/CD Vercel do site e do ERP/PDV

**Data:** 2026-10-16 · **Branch:** `claude/jinlong-vercel-deploy-audit-1fab39`
Diagnóstico: `VERCEL_AUDITORIA_SITE_PDV.md`. Arquitetura: `VERCEL_ARQUITETURA_DEPLOY.md`.

**Princípio:** a menor mudança que resolve. Nenhuma pipeline nova; nenhum projeto, domínio, variável ou configuração de painel alterado. Tudo o que muda está versionado neste PR e só passa a valer depois do merge.

---

## 1. Configuração anterior (registro para rollback)

| Projeto | Campo | Valor antes deste PR | Onde |
|---|---|---|---|
| `pdv-importados` | Ignored Build Step | `if [ "$VERCEL_ENV" == "production" ]; then exit 1; else exit 0; fi` | **painel** (continua lá; fica sem efeito enquanto `ignoreCommand` existir no `vercel.json`) |
| `pdv-importados` | `pdv-importados/vercel.json` | `{ "$schema": "…", "regions": ["gru1"] }` | repositório |
| `jinlong-site` | `site/vercel.json` | `{ "$schema": "…", "regions": ["gru1"], "ignoreCommand": "sh scripts/vercel-ignore.sh" }` (inalterado) | repositório |
| `jinlong-site` | `site/scripts/vercel-ignore.sh` | versão que constrói sempre que `VERCEL_GIT_PREVIOUS_SHA` está vazio | repositório (commit `19f05be5`) |
| GitHub | `release-validate.yml` | `if: … && github.event.deployment.environment == 'production'` | repositório |
| Ambos | Root Directory, install, build, Node, Production Branch, domínios, variáveis | ver auditoria §3 | painel — **não alterados** |

## 2. Mudanças executadas neste PR

### M1 — Site: Preview só quando a branch mexe no site
`site/scripts/vercel-ignore.sh`
- Com `VERCEL_GIT_PREVIOUS_SHA`: comportamento idêntico ao anterior.
- **Só em Preview** e só sem `VERCEL_GIT_PREVIOUS_SHA` (primeiro push da branch): busca a `main` (`git fetch --depth=200 origin main`) e compara o *merge-base* com o `HEAD`. Se a busca ou o merge-base falharem → **constrói** (regra "nunca ignora por dúvida" mantida).
- Produção sem base continua construindo.
- Efeito medido no histórico real: **20 de 25** Previews do site da janela seriam ignorados (≈ 15 min de build), sem ignorar nenhum dos que tinham mudança relevante.

### M2 — ERP: produção só quando algo do ERP mudou; ignore versionado
`pdv-importados/vercel.json` (`ignoreCommand`) + `pdv-importados/scripts/vercel-ignore.sh` (novo)
- Preview/development: **ignora sempre** (mesma política do painel; motivo: Preview usa segredos do Supabase de produção).
- Produção: ignora **só** se todo arquivo alterado desde o último deploy de produção estiver em `site/`, `docs/`, `.github/` ou for `*.md` da raiz. Qualquer outro caminho — inclusive `backend/`, `pdv-local/`, `shared*/`, lockfile, `vercel.json` da raiz ou um diretório novo — **constrói**. Sem base, base inexistente ou erro do git → constrói.
- Verificado que o ERP não importa nada de `site/`, `docs/` nem `.github/` (busca de imports relativos em `pdv-importados/`, `shared-core/`, `shared/`).
- Efeito medido: 1 de 14 builds de produção da janela seria ignorado (`072f130b`, só docs). O ganho maior é futuro: merges só do site deixam de republicar o ERP.

### M3 — Gate SSRA reativado
`.github/workflows/release-validate.yml`: o filtro passa a aceitar `Production – pdv-importados` (nome atual do ambiente) além de `production` (legado). Deploys do `jinlong-site` não disparam o gate.

### M4 — Testes
- `scripts/vercel-site-ignore.test.mjs`: casos novos I2–I6 (primeiro push de branch só do ERP ignora; mudança no site em commit intermediário constrói; mudança no site feita pela `main` depois do fork não conta; sem remoto constrói; com base usa a base).
- `scripts/vercel-pdv-ignore.test.mjs` (novo): 14 casos (Preview sempre ignorado; ERP, compartilhados, lockfile, backend, pdv-local, diretório novo constroem; só site/docs/.github/`*.md` da raiz ignoram; vários commits; sem base; redeploy).
- Resultado local: `node --test scripts/vercel-site-ignore.test.mjs scripts/vercel-pdv-ignore.test.mjs` → **35/35**.

### O que este PR NÃO muda
Domínios, DNS, variáveis de ambiente, Supabase (Auth, Redirect URLs, secrets), configurações de painel, projetos Vercel, fluxo financeiro/comercial do PDV, required checks do GitHub.

## 3. Riscos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| ERP deixar de publicar uma mudança real | Baixa | lista de **exclusão** fechada (tudo fora dela constrói); falha de git → constrói; 14 testes; replay do histórico sem falso negativo |
| `git fetch` da `main` não funcionar no ambiente de build da Vercel (credencial do clone) | Média | o script constrói nesse caso (comportamento atual). Verificar no log do Preview deste PR (V5). Se falhar, o ganho de M1 não aparece, mas nada piora |
| Preview do site ignorado quando deveria construir | Baixa | só com prova (diff vazio desde o merge-base); impacto restrito a Preview; *Redeploy* manual resolve |
| SSRA voltar a rodar e falhar | Média | o gate só lê (compara `deploymentId`); falha não desfaz deploy. Se falhar, é um achado real de produção a investigar |
| `vercel.json` sobrepõe o ignore do painel | Esperado | é a intenção (configuração versionada). Rollback = revert |

## 4. Validação

| # | Cenário | Como validar | Esperado | Status |
|---|---|---|---|---|
| V1 | Alteração exclusiva no PDV | teste `produção: mudança no ERP`; replay de 13 builds reais | ERP constrói; site ignora (I2) | ✅ local |
| V2 | Alteração exclusiva no site | teste `produção: só site/`; teste D do site | site constrói; ERP ignora | ✅ local |
| V3 | Alteração compartilhada (lockfile/`package.json`) | testes E (site) e "compartilhadas" (ERP) | os dois constroem | ✅ local |
| V4 | Merge na `main` | após o merge: deployments dos dois projetos para o SHA do merge | ERP constrói (o PR muda `pdv-importados/`); site constrói (o PR muda `site/`) | ⏳ após merge |
| V5 | Preview de PR | log do Preview do `jinlong-site` para este PR | script roda; build ocorre (PR muda `site/`); mostrar se o `git fetch` da main funcionou | ⏳ ver PR |
| V6 | Deploy de produção | primeiro merge **só de docs** depois deste PR | ERP: `[ignore-step] só site/, docs/…: ignorando build`; site: ignorado | ⏳ após merge |
| V7 | Navegação site → login → ERP | depende da Fase 2/4 (domínios) | link "Entrar" do site abre `/login` do ERP | ⏳ autorização |
| V8 | Autenticação e logout | roteiro A1–A9 de `docs/site/HOMOLOGACAO_APP_JINLONG_APP.md` | inalterado por este PR (nenhuma mudança de auth) | n/a neste PR |
| V9 | Domínios | `curl -I` em `jinlong.app`, `www`, `app` | inalterados por este PR | ✅ registrado na auditoria §7 |
| V10 | Ausência de builds desnecessários | após 1 semana: repetir a classificação da auditoria §4 | Previews do site só em branches com mudança no site; ERP sem build de produção em merges só de site/docs | ⏳ |
| V11 | SSRA | próximo deploy de produção do ERP | `release-validate` com conclusão `success` (não `skipped`) | ⏳ após merge |

Lembrete: **um deploy `CANCELED` sozinho não é erro.** Confirmar pelo log ("Ignored Build Step command returned exit code 0") ou por `buildSkipped: true`.

## 5. Rollback

| Mudança | Rollback | Tempo |
|---|---|---|
| M1, M2, M3 | `git revert <merge>` na `main` (ou PR de revert). O ignore do ERP volta automaticamente ao comando do painel, que **não foi apagado** | minutos |
| Só M2 (ERP) | remover `ignoreCommand` de `pdv-importados/vercel.json` | um commit |
| Emergência: ERP não publicou algo que deveria | commit na `main` que toque `pdv-importados/` (qualquer caminho fora da lista de exclusão força o build), ou remover `ignoreCommand` de `pdv-importados/vercel.json`. Não presumir que um *Redeploy* pelo painel pule o ignore step (a documentação da Vercel não garante isso) | ≈ 4 min |
| Deploy ruim em produção (qualquer projeto) | *Instant Rollback* do projeto afetado — independente entre site e ERP | segundos |

## 6. Pendências que exigem autorização

| # | Ação | Tipo | Observação |
|---|---|---|---|
| P1 | **Merge deste PR** | repositório | ativa M1–M3 |
| P2 | Variáveis do `jinlong-site`: `NEXT_PUBLIC_SITE_URL` e `NEXT_PUBLIC_ERP_URL` | painel Vercel | hoje vazias; o site usa os padrões |
| P3 | Fases 2–4 de domínios (`app.jinlong.app`, Redirect URLs do Supabase, secret `VALIDAR_GERENTE_ALLOWED_ORIGINS`, mover `jinlong.app`/`www`, `site_url`) | **produção** | runbook `docs/site/MIGRACAO_SITE_ERP_DOMINIOS.md`; decidir canônico `jinlong.app` vs `www` |
| P4 | Supabase de homologação no escopo Preview do ERP; retirar segredos de produção do escopo Preview | **produção/segurança** | pré-requisito para Preview do ERP |
| P5 | Corrigir nomes truncados `STRICT_MANAGER_DISCOUNT_AUT` → `…_AUTH` e `NEXT_PUBLIC_IDLE_LOGOUT_MINUTE` → `…_MINUTES` (ou remover) | **produção / fluxo comercial** | hoje sem efeito; o desconto usa o padrão estrito. Confirmar o valor pretendido antes de cadastrar |
| P6 | Remover `NODE_ENV` manual das variáveis do ERP | painel | Next.js já define |
| P7 | Desligar concorrência elástica do `jinlong-site` | painel / custo | opcional |
| P8 | Remover `vercel.json` da raiz (inerte) | repositório | opcional; não lido por nenhum projeto |
| P9 | Workflow de CI leve para `site/` e para os testes dos ignore steps | repositório | hoje não rodam no GitHub; criar só se aprovado (custo de Actions) |
| P10 | Desligar comentários do bot da Vercel em cada commit no `pdv-importados` | painel | só ruído |
| P11 | Confirmar plano da Vercel (Hobby não permite uso comercial) | conta | — |
