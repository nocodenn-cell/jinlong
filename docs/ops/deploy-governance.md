# Governança de deploy

## Causa raiz (2026-10-20)
A integração GitHub→Supabase do projeto de produção está ligada à `main`, com working directory `backend`
e a opção **Deploy to production** ativa. Pela documentação oficial
(<https://supabase.com/docs/guides/deployment/branching/github-integration>), **cada push/merge na main**:
1. `migrate`: aplica **todo** arquivo de `backend/supabase/migrations` sem entrada no histórico — inclusive
   arquivos com timestamp mais antigo que a última aplicada (só gera warning);
2. `deploy`: publica as Edge Functions de `backend/supabase/functions`.

Evidência: 25 s após o merge do #589 (14:48:47 BRT) foram publicadas `sync-outbox` v77 e `validar-gerente` v52,
idênticas às versões anteriores.

`20261010120000_caixa_sem_loja_padrao.sql` **não** foi aplicada até agora, embora o check "Supabase Preview"
do merge do #589 (commit 962bd219, 14:48:40–14:48:56 BRT) tenha concluído com **success**. A documentação atual
diz que arquivos com timestamp anterior à última migration aplicada ainda rodam (com warning); na prática, ela
foi ignorada porque é *out-of-order* (20261010 < 20261019…, já aplicadas) — comportamento equivalente ao
`db push` sem `--include-all`. Além disso o histórico de prod tem 37 versões sem arquivo no repo (aplicadas via
MCP; ver `backend/supabase/migration-human-gates.json`). O log detalhado do passo `migrate` só é visível no
Dashboard (não acessível por MCP/GitHub). **Conclusão: é uma proteção acidental e não documentada.** Qualquer
mudança de comportamento da integração, reset/reconciliação do histórico ou renomeação do arquivo para um
timestamp novo faria o próximo merge aplicá-la automaticamente e quebrar o PDV legado.

## Processos separados
| Processo | Gatilho | Controle |
|---|---|---|
| CI | `pull_request` → main | Workflows `ci-*`, `secret-scan`, `deploy-governance` (obrigatórios) |
| Frontend (Vercel) | merge na main que toca `pdv-importados/` | Política atual da Vercel; inalterada |
| Migrations de produção | **manual** | Runbook com transação + `schema_migrations` com a versão real; janela autorizada; nunca `db push` |
| Edge Functions | **manual, por versão** | `supabase functions deploy <nome>` a partir de um commit/tag registrado; anotar a versão resultante |

## Controles no repositório (este PR)
- `.github/deploy-governance/deferred-migrations.json`: migrations adiadas. O check falha se o arquivo for
  editado, removido ou renomeado (mesmo com label). Para liberar, um PR remove a entrada do manifesto.
- `deploy-governance.yml`: PR que toque `backend/supabase/migrations/`, `backend/supabase/functions/`,
  `backend/supabase/config.toml` ou o manifesto exige o label `deploy-prod:aprovado`.
- CODEOWNERS para `config.toml`, o manifesto e este documento.
- `backend/supabase/migration-check-project-deferred.json`: adiadas que já estão aplicadas no **projeto de verificação do CI** (homolog `jinlong-homolog-palm`). O check `migration-remote-drift` aceita essas versões **só** quando `SUPABASE_MIGRATION_CHECK_PROJECT_REF` é exatamente o `checkProjectRef` do registro. Em qualquer outro projeto (produção inclusive), ou para versão fora do registro, a aplicação continua bloqueando (`adiada_aplicada`). O mesmo vale para `remoteOnlyAccepted`: versões que existem só no remoto do homolog (sem arquivo no repo), aceitas só com o ref do homolog. Não libera produção: a adiada segue no manifesto e exige a liberação descrita nele.

## Configurações externas
1. ✅ **Feito pelo usuário em 2026-10-20 ~16:10 BRT.** **Supabase → Project Settings → Integrations → GitHub → desligar "Deploy to production"** (manter a
   integração conectada, se quiser os checks em PR). Esta é a única medida que impede tecnicamente
   o deploy automático de migrations e de Edge Functions em merges. Com ela, a liberação de 20261010120000 e
   a publicação de edges passam a ser exclusivamente manuais.
2. **GitHub → Branch protection da main → exigir o check `deploy-governance`.**

Não usar `[db.migrations] enabled = false` em `config.toml`: desligaria as migrations no `supabase db reset`
do CI. Não adicionar `[remotes]` de produção: faria o passo `configure` sobrescrever auth/api de produção com
os valores locais.

## Estados do gate de drift (`migration-remote-drift`)

O gate tem quatro estados. **Só PASS libera.** Nenhum outro estado é aprovação.

| Estado | Código | Quando | Efeito no CI |
|---|---|---|---|
| PASS | 0 | comparação real concluída, sem drift (ALIGNED), ou com decisão humana já registrada (HUMAN_GATE) | job verde |
| FAIL | 1 | drift bloqueante: divergência real entre Local e Remote | job vermelho |
| ERROR | 2 | falha inesperada do script (parse, ref de base, status desconhecido) | job vermelho |
| BLOCKED | 3 | infraestrutura indisponível: projeto pausado, sem acesso, sem `supabase link`, secrets ausentes, PR de fork | job vermelho com `::error title=BLOCKED::` |

- **BLOCKED não é drift.** Indisponibilidade nunca é apresentada como divergência de migrations.
- **SKIPPED não existe neste job.** Um job pulado conta como sucesso no branch protection; por isso o job não tem `if:` de pulo. Fork e falta de secrets viram BLOCKED explícito.
- **Sem `continue-on-error` e sem `--warn-only`** no caminho do gate.
- **Teste:** `backend/scripts/p0-migration-status.test.mjs` cobre os quatro estados e os casos de fail-closed (status desconhecido, comparação ausente, `warnOnly` não aprova BLOCKED).

### Lacuna de branch protection (pendente, configuração externa)

Em 2026-11-28, a proteção da `main` exige estes checks: `build-and-test`, `gitleaks`, `Supabase local gates (RLS smoke + scope + REST)`, `edge-functions-typecheck`, `outbox-contract` e `anti-replay-diagnostic-gate`.

**`migration-remote-drift` não está entre eles, e `deploy-governance` também não está**, apesar da seção "Configurações externas" acima. Consequência: **hoje, nem FAIL nem BLOCKED do gate de drift impedem o merge pela branch protection.**

Para o gate valer como barreira, um administrador do repositório precisa adicionar `migration-remote-drift` (e `deploy-governance`, se for a intenção do item 2 acima) como check obrigatório da `main`. Isso é configuração do GitHub, não do repositório, e não foi alterado nesta entrega.
