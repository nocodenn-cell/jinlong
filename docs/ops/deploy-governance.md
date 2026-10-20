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

`20261010120000_caixa_sem_loja_padrao.sql` **não** foi aplicada até agora porque o passo `migrate` falha
antes de aplicar qualquer coisa: o histórico de produção tem 37 versões sem arquivo correspondente no repo
(aplicadas via MCP com o timestamp real; ver `backend/supabase/migration-human-gates.json`), e a documentação
diz que "uma versão no histórico sem arquivo correspondente faz o passo falhar". **Isso é uma proteção acidental.**
Se alguém reconciliar o histórico (adicionar esses arquivos ou fazer `migration repair`), o próximo merge
aplica 20261010120000 automaticamente e quebra o PDV legado.

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

## Configurações externas (exigem autorização; NÃO aplicadas)
1. **Supabase → Project Settings → Integrations → GitHub → desligar "Deploy to production"** (manter a
   integração conectada, se quiser os checks em PR). Esta é a única medida que impede tecnicamente
   o deploy automático de migrations e de Edge Functions em merges. Com ela, a liberação de 20261010120000 e
   a publicação de edges passam a ser exclusivamente manuais.
2. **GitHub → Branch protection da main → exigir o check `deploy-governance`.**

Não usar `[db.migrations] enabled = false` em `config.toml`: desligaria as migrations no `supabase db reset`
do CI. Não adicionar `[remotes]` de produção: faria o passo `configure` sobrescrever auth/api de produção com
os valores locais.
