# Saneamento do backlog de PRs e issues — 2026-10-23

Escopo: os 43 PRs e a issue abertos no início da missão (`nocodenn-cell/fastproduct`), mais o PR #629 criado durante ela. Nenhuma alteração em produção, nenhuma migration aplicada, nenhum secret criado, nenhuma branch apagada. Produção só foi consultada em modo somente leitura.

## Como foi verificado

- **Banco representativo:** container isolado `supabase/postgres:17.6.1.084` (a versão de produção) com as 437 migrations da `main` aplicadas em ordem, uma transação por arquivo, como no CLI. Storage e `auth.jwt()` foram criados como stubs mínimos, porque esses serviços não sobem num container só de Postgres. Calibração: os tipos gerados desse banco são idênticos, byte a byte, ao `database.types.ts` versionado.
- **Produção (somente leitura):** `schema_migrations` (com `created_by`), privilégios, definições de função (md5 do corpo normalizado), versões das Edge Functions e advisor de segurança.
- **"Já está na main?":** existência com `git cat-file -e origin/main:<path>` e conteúdo por hash de blob.
  - **Erro meu, corrigido:** a primeira rodada usou `git rev-parse ref:path`, que ecoa o caminho quando o arquivo não existe. Isso me levou a encerrar #537 e #491 como "absorvidos" com afirmação falsa. Os dois foram **reabertos** com comentário de correção, e todas as contagens abaixo são da rodada corrigida.

## Pipeline de produção (P0)

- A integração GitHub→Supabase **não publica nada no merge**. Evidências:
  - `validar-gerente` não é republicada desde o merge #589 (2026-10-20 17:48Z), apesar de 29 merges depois.
  - Toda migration desde 10-20 tem `created_by` = e-mail do dono, ou seja, foi aplicada à mão.
  - A adiada `20261010120000` segue sem aplicar.
  - Conferido de novo 30 s após o merge do #628: nada mudou.
- **`20261023120000` (#628):** está na main e **não aplicada** em produção. Pré-condições conferidas em 2026-10-23 13:08Z. Runbook com pré-checagem, backup, aplicação, pós-checagem e rollback **testados**: `docs/runbooks/APLICAR_20261023120000_REVOKE_ESTOQUE.md`.
- **Advisor de produção depois do merge e da aplicação de #618:**
  - **resolvidos:** `security_definer_view`, `function_search_path_mutable` e RLS desligado;
  - **seguem abertos:** leaked password protection, `authenticated_security_definer_function_executable` (135, cresceu com a multiempresa) e `rls_enabled_no_policy` (25).

## Tabela

| PR/Issue | Problema | Prioridade | Ação executada | Estado final | Pendência |
|---|---|---|---|---|---|
| #618 | Alerta `security_definer_view` em `produtos_custos` | P0 | Mock de `rpc` nos testes; tipos regenerados (`check:types-drift`); matriz de acesso validada no banco representativo (ADMIN 2 lojas, GERENTE/DONO só a própria, OPERADOR e inativo 0, anon sem acesso, coluna de custo bloqueada); idempotência e rollback testados | **Mergeado** (pelo dono) | Nenhuma: migration já estava em produção; advisor confirma o alerta resolvido |
| #621 | Recursão infinita na RLS de `perfis` | P0 | Guarda `to_regclass` (a tabela só existe em produção); validado em PGlite (recursão some, regras mantidas, idempotente) | **Mergeado** (pelo dono) | Nenhuma: migration já em produção, efeito idêntico |
| #625 | `pdv_config.gerente_senha_sha256 NOT NULL` quebra provisionamento e e2e | P0 | Migration validada: vermelho→verde, aplicação dupla idempotente; no schema de produção (**a coluna não existe**) é no-op. Merge autorizado sob condição, mas **não executado**: o PR altera `pdv-importados` e todo merge que toca esse app gera deploy de **produção** na Vercel (#618 e #621 geraram) | Aberto, checks obrigatórios e e2e **verdes** | Decisão do dono sobre o deploy de frontend. Em produção, o código atual envia `gerente_senha_sha256: ''` via PostgREST para uma coluna que não existe: provável falha no provisionamento de loja e no trial (não reproduzido, para não escrever em produção) |
| #624 | CALC-001.1 importação (landed cost etc.) | P1 | Revisado: sem migrations; `shared-core/src/import` com 203 testes OK | Aberto | e2e falha só pelo bug do #625; rerodar depois do merge do #625 |
| #629 *(novo)* | Issue #586: kardex sem vínculo SAÍDA↔ENTRADA | P1 | Coluna `transferencia_id` + reescrita só dos 2 INSERTs (corpo idêntico ao de produção, md5); teste vermelho→verde; rollback restaura o corpo byte a byte; tipos regenerados; teste no CI | Aberto | Aprovação específica (migration); e2e falha pelo bug do #625 |
| Issue #586 | Idem | P1 | Implementada em #629; comentário na issue | **Aberta** (correto) | Fechar só depois da aplicação e verificação em produção |
| #620 | Escopo de gerente por empresa + correções Asaas | P0 | **Corrigido.** A migration `20261022120000` tratava qualquer `loja_id` nulo como fora e quebrava casos legítimos (falha do CI no sec04). Nova regra: mantém o corpo de produção e acrescenta só a fronteira de empresa para token de DONO/ADMIN (empresa da loja do emissor, vínculo DONO ativo ou vínculo na própria loja). sec04 ganhou os casos entre empresas. Validado: a lógica atual de produção **vaza entre empresas** (reproduzido); a nova passa sec04, c1, fase1 e fase2 | Aberto (draft) | Revisão do dono. Produção tem 1 empresa, então o vazamento ainda não é explorável. Vercel "couldn't verify an account" vem de commits antigos do PR (autor), não de código |
| #623 | Remover ADMIN do escopo das lojas | P0 | **Corrigido.** Recebeu a correção do #620. Sua migration reescrevia a mesma função com o mesmo defeito, e agora está alinhada (mesma regra, sem ADMIN). `fp_admin_legado`/`auth_usuario_eh_admin` (corpo constante `false`) viraram SECURITY INVOKER, resolvendo a falha do `c1-secdef`. Validado no contexto das 3 migrations | Aberto (draft) | Revisão do dono (migração de dados de ADMIN; rollback no PR) |
| #627 | Reconciliação de migrations, Fase 1 (docs) | P0 | Não alterado (ativo em outro worktree) | Aberto (draft) | Atualizar: #618 e #621 já estão na main |
| #546 | Sentry 10→11 (major) | P2 | `withSentryConfig` passou para `@sentry/nextjs/config` na v11 (conferido no tarball, sem executar); corrigidos os dois `next.config.js`; merge da main (o projeto Vercel `hub` não existia na base antiga); lockfile normalizado | Aberto, CI rodando | Avaliar CI; outros pontos da v11 só aparecem em runtime |
| #583 | Grupo dev-minor-patch | P2 | Dependência fantasma: `pdv-importados` usava `@testing-library/react` sem declarar; declarada (lockfile só com isso). Fixture de Storage sem `ON CONFLICT (bucket_id, name)` (o CLI 2.121 mudou o índice); reproduzido e corrigido no banco representativo | Aberto, CI rodando | Também sobe pglite 0.3→0.5 (testes em PGlite dirão) |
| #544, #547, #548, #549 | Falha de secret em execuções do Dependabot | P2 | Diagnóstico (ver abaixo). Nenhum secret criado | Abertos | Decisão sobre a política de CI para Dependabot; #547/#549 são majors de ESLint, não avaliados a fundo |
| #543 | `produtos_custos` com fronteira privada (alternativa ao #618) | P0 | **Encerrado**: substituído por #618 (aplicado em produção); migration `20261013080436` nunca aplicada | Fechado | Teste SQL da branch reaproveitável (branch preservada) |
| #446 | Multiempresa Fase 1 aditiva | P0 | **Encerrado**: substituído por `20261019120000`…`170000` (main e produção); `20261003090000` nunca aplicada; scripts só servem à migration descartada | Fechado | Branch preservada |
| #497 | Diagnóstico de reconciliação de 10-08 | P2 | **Encerrado**: superado por `docs/MIGRATIONS_RECONCILIACAO_2026-10-16.md` e #627; o lote citado está aplicado; e2e passa hoje | Fechado | Branch preservada |
| #537 | Import Intelligence/multiempresa ("NÃO FAZER MERGE") | P1 | Encerrado e **reaberto** (erro meu de método); 28 arquivos ausentes da main, incluindo testes `f1/f3/f4/f5/m1` | Aberto | Consolidar: portar testes úteis; migrations alternativas superadas (uma colide com a versão `20261010120000`) |
| #491 | Site bilíngue | P2 | Encerrado e **reaberto** (mesmo erro); site absorvido, mas 5 arquivos ausentes (3 skills `.claude`, `.gitattributes`, `site/app/icon.svg`) | Aberto | Portar skills e ícone ou descartá-los explicitamente |
| #490 | Vercel Speed Insights (bot) | P2 | Avaliado: base no branch do site; Speed Insights não está ligado na main | Aberto | Não integrar sem confirmar que não gera cobrança na Vercel (orçamento R$ 0) |
| #487, #488, #498, #499, #500 | Pilha "forbidden migrations" para bloquear `20261006120000` | P1 | Avaliado: a migration alvo já foi aplicada e a guarda foi substituída por `deploy-governance`; mas há **testes únicos fora da main** (`test-fiscal-insert-auth`, `test-financeiro-comportamental-p1`, `integridade-financeira-pos-ops02`, `ssot-004-insert-fiscal-negativo`) | Abertos | Consolidar os testes num PR novo e então encerrar a pilha |
| #492, #493, #495, #496 | Experimentos multiempresa M1/M2 | P1 | Avaliado: a main implementou de outro jeito (`fp_empresa_selecionada`, fases 1–5); restam **testes negativos e docs únicos** (`test-m1-matriz-negativa`, `test-m2b-tenant-resolver`…) | Abertos (draft) | Portar os testes negativos de isolamento (valor P0 para multiempresa) e então encerrar |
| #448 | Fiscal Focus NFC-e, Sprint P0 | P1 | Avaliado: fiscal segue stub; migration `20261003120000` não aplicada; 7 arquivos únicos | Aberto (draft) | Retomar na fase fiscal (antes do 2º cliente) |
| #485, #486, #506 | Diagnóstico e guarda do backup via JIT | P2 | Avaliado: backup diário funciona pelo método CLI (token); o JIT ficou só como fallback no workflow | Abertos | Decidir: remover o fallback JIT (e encerrar) ou manter e integrar a guarda |
| #484, #489 | Checklists ops / restore sintético / smoke presencial | P2 | Avaliado: conteúdo único (scripts e checklists) | Abertos | Consolidar com `docs/runbooks/` atuais |
| #508 | Auditoria 360° (doc) | P2 | Avaliado: doc único | Aberto (draft) | Decidir se vira histórico em `docs/` |
| #529, #530, #532, #533, #534 | Capacidade/carga (k6, STG-01) | P2 | Avaliado: pilha cumulativa com conteúdo único | Abertos | Consolidar num só (provavelmente #534) depois de confirmar a inclusão |
| #541, #542, #550 | UX (hub de estoque, ficha de clientes, tokens) | P2 | Avaliado: conflitos com a main; componentes únicos (12 e 13 arquivos ausentes); #550 sem arquivos únicos | Abertos (draft) | Rebase e decisão de produto; #550 provavelmente superado pelo loop UX (#561–#563), mas não verificado em detalhe |

## Atualização 2026-10-23 14:40 UTC

- **#625 não mergeado.** Condição do dono: o merge não pode acionar deploy em produção. A Vercel publica `pdv-importados` em produção a cada merge que toca o app, e o #625 toca. Migrations não seriam aplicadas (integração com deploy desligado; conferido de novo às 14:23 UTC).
- **#620/#623:** bloqueios de segurança corrigidos e validados (tabela acima). Merge só com aprovação específica.
- **Runbook de `20261023120000`:**
  - plano final para aprovação;
  - scripts únicos `ops/aplicar_20261023120000.sql` e `ops/rollback_20261023120000.sql`, testados;
  - restore drill obrigatório;
  - as 4 revisões do Codex atendidas.
- Pré-checagem de produção às 14:33 UTC: `true/true/true`.

## Atualização 2026-10-23 14:50 UTC — #625 integrado

- **Merge autorizado pelo dono e executado** às 14:39 UTC (`ed3dee81`), preso ao head verificado `f9375d3e`. Antes do merge: 6/6 checks obrigatórios verdes, 0 threads abertas, nenhum comentário novo desde 2026-10-22.
- **Banco de produção inalterado pelo merge:** 438 versões, última `20261022110000`, `20261022020000` não aplicada, conferido 25 s depois. A migration do #625 é no-op em produção (a coluna não existe).
- **Deploy de frontend:** `dpl_A76Fy7VBAawRjgfpypEGcng5ej94` `READY` (build de 3 min). `app.jinlong.app` responde 200 em `/login` e `/teste-gratis`; `/admin/provisionamento` redireciona para o login. Nenhum erro de runtime na Vercel na última hora. Rollback instantâneo disponível: `dpl_9bhzzmZ555diWngsHbW5Yisob24d` (#618).
- **Provisionamento testado em produção sem gravar nada:** um bloco `DO` que sempre termina em exceção (rollback total) criou uma loja temporária e tentou os dois payloads do app.
  - o **antigo** falha com `42703 column "gerente_senha_sha256" of relation "pdv_config" does not exist`: o bug **existia em produção**, provisionamento de loja nova e trial quebrados;
  - o **novo** grava a linha.
  - Depois, 0 lojas de teste e 0 `pdv_config` órfãos.
  - Não foi feito provisionamento ponta a ponta pela interface em produção, porque criaria empresa, loja e usuário reais.
- **#624 e #629** atualizados com a main (`a8729ecf`, `7e578f7a`). No #629, os tipos auto-mesclados são idênticos aos gerados (main + `20261023130000`) e o teste do kardex passa. e2e e demais checks rodando de novo.

## Atualização 2026-10-23 15:10 UTC — provisionamento, #629, #620/#623

**Homologação não reproduz produção.**
- `jinlong-homolog-palm` foi populado desde de manhã, mas parou em `20261019170000` (417 migrations contra 438 em produção).
- Não tem as RPCs do trial nem o schema `saas`, nem a tabela `perfis`.
- Tem `gerente_senha_sha256 NOT NULL`, o oposto de produção.
- Não tem usuários nem app apontando para ele.
- Tabela completa e plano de teste controlado em `docs/runbooks/TESTE_CONTROLADO_PROVISIONAMENTO_PRODUCAO.md`, **para aprovação**. Nenhuma empresa, loja ou usuário foi criado em produção.

**Provisionamento ponta a ponta (lado banco) no banco representativo:** `backend/scripts/provisionamento-wizard-trial.test.sql`, OK.
- **Wizard:** empresa + loja + `pdv_config` + 4 formas + 36 itens (3 concluídos) + 3 vínculos.
- **Trial:** limite de 3 por IP em 24 h respeitado, `trial_fim` +15 dias, bootstrap completo, vínculo DONO.
- **Permissões:** RPCs só `service_role`; DONO, GERENTE e OPERADOR do wizard e DONO do trial veem só a própria empresa.
- Nenhum erro no log do Postgres.
- **Fidelidade:** as 4 RPCs são byte a byte iguais às de produção (md5).
- **Duas falhas de *harness* corrigidas no próprio teste**, nenhuma no produto:
  - comparação de vínculos feita sob RLS dava falso positivo;
  - `auth.role()` da imagem local só lê `request.jwt.claim.role`. Em produção lê também o JSON `claims` (conferido), então o OPERADOR vê a loja.
- **Achado:** `bootstrapLojaTrial` engole erros (`.catch(console.error)`). Antes do #625, um trial em produção teria criado loja sem `pdv_config` sem avisar. Produção tem 1 loja, então nenhum trial foi afetado.

**#629: validação completa** (comentário no PR):
- segurança idêntica antes e depois (dono, SECURITY DEFINER, `search_path`, ACL, wrapper, policies, grants);
- `authenticated` não consegue forjar o vínculo;
- concorrência 3×10: 30/30 pares corretos e saldos consistentes;
- rollback byte a byte;
- tipos idênticos aos gerados.
- **Continua sem merge** até aprovação específica.

**#620:** `check:types-drift` falhava porque `20261022121000` cria `cobranca_liberar_assinar`, `cobranca_reservar_assinar` e `fp_sou_dono_da_empresa`. Branch atualizada com a main e tipos regenerados (diff = só as 3 funções) em `a86edfad`.
- **Observação de deploy:** as mudanças de Edge Functions (`validar-gerente`, `sync-outbox`, `_shared/gerente-auth`) precisam de deploy manual depois do merge (integração desligada). O fallback para `pdv_config id=1` só vira vazamento entre empresas a partir da 2ª empresa.

**#623:** a falha atual é de testes, não do produto. O trigger novo `PERFIL_ADMIN_DESCONTINUADO` bloqueia corretamente fixtures que ainda criam `ADMIN` em cerca de 20 arquivos de teste (ex.: `devolucao-d13`, `financial-adversarial-gates`, `item7-storage`, `fase1-hardening`, `test-rls-scope`). Vários deles testam comportamento **específico de ADMIN** ("ADMIN atualiza imagem de outra loja"), então reescrevê-los exige decidir o comportamento esperado sem ADMIN, caso a caso.
- **Decisão de produto do dono/autor**, não correção mecânica.
- Depois disso, os tipos também precisarão ser regenerados (herdam as 3 funções do #620).

## Dependabot e secrets (sem secret criado)

- **Build (`pdv-importados`):**
  - O build só exige `NEXT_PUBLIC_SUPABASE_ANON_KEY` não vazia; a URL já cai em `example.supabase.co`.
  - A anon key é pública por desenho (vai no bundle do navegador), então replicá-la nos secrets de Dependabot tem risco ~nulo.
- **Supabase local gates:** exigem `PLAYWRIGHT_TEST_PASSWORD`, e `migration-remote-drift` usa `SUPABASE_ACCESS_TOKEN`.
  - **Não** replicar esses dois para Dependabot: PRs de Dependabot rodam `npm ci` de versões novas de terceiros, e qualquer script de instalação lê o ambiente.
  - Recomendação: no workflow, tratar `github.actor == 'dependabot[bot]'` como fork (senha aleatória de uso único para a stack local). É mudança de política de CI e precisa de aprovação.
- **Observação:** depois que pushei commits em #546 e #583, as execuções passaram a usar os secrets de Actions (gatilho humano). Por isso o `build-and-test` desses dois já não falha por secret.

## Números

- **PRs corrigidos (código empurrado):** 4 (#618, #621, #546, #583) + 1 novo (#629). #625 validado sem precisar de mudança.
- **Encerrados:** 3 (#543 substituído; #446 substituído; #497 superado). 2 encerramentos desfeitos por erro meu de método (#537, #491).
- **Mergeados durante a missão (pelo dono):** #621 e #618.
- **Continuam úteis/abertos:** 39 (38 do backlog original + #629).
- **Prontos para merge** (obrigatórios verdes, sem regressão conhecida): #625. #546 e #583 aguardam o CI; #624 e #629, o merge do #625.
- **Dependem de aprovação humana:** #625 e #629 (migrations); #620 e #623 (autenticação e permissões); aplicação manual de `20261023120000`; política de CI para Dependabot.
- **Impedem o go-live:** aplicar `20261023120000`; #620/#623 (isolamento de gerente entre empresas); leaked password protection; itens do `CHECKLIST_CORTE_PRIMEIRO_CLIENTE_PAGANTE.md` (preço, termos, smoke presencial, cobrança manual). O e2e quebrado (#625) afeta CI e bancos novos, **não** produção.
