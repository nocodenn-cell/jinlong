# Procedimento: validar o gate de drift no GitHub Actions (sem merge)

**Status:** preparado, **não executado**. Exige autorização expressa do dono para `git push` de uma branch de teste e para abrir um PR (draft). Nenhuma etapa aqui faz merge, deploy ou alteração de produção/homologação.

**Objetivo:** confirmar, no Actions real, a fiação descrita em `docs/auditorias/RELATORIO_DRIFT_MIGRATIONS_PRODUCAO.md` §23 (modo informativo em PR sem produção; bloqueante em produção, em PR que altera o gate, em push para `main` e em `workflow_dispatch`; `adiada_aplicada` sempre bloqueante).

**Custo:** minutos de Actions. O job de drift é leve; o workflow `ci-backend-supabase.yml` roda jobs pesados (Supabase local, Edge), então o PR de teste deve tocar `backend/**` para acionar o drift.

## 0. Pré-requisitos (locais, sem rede)

1. Branch local com o estado auditado (commits `9f34251d` … `21a9308f` e os seguintes desta etapa).
2. Testes locais verdes antes de qualquer push:
   ```bash
   cd backend
   node --test scripts/drift-gate-mode.test.mjs scripts/drift-gate-policy.test.mjs \
     scripts/drift-gate-workflow.test.mjs scripts/deferred-manifest-integrity.test.mjs \
     scripts/p0-exit-modes.test.mjs scripts/p0-migration-status.test.mjs
   cd ..
   node --test scripts/ops/deploy-governance-guard.test.mjs
   ```
3. Confirmar que `git status` está limpo.

## 1. Branch e PR de teste (exige autorização do dono)

```bash
git switch -c teste/drift-gate-validacao
# Alteração mínima e reversível em backend/ (não produtiva), ex.: um comentário em backend/README.md
git commit -am "teste: valida gate de drift (não mesclar)"
git push -u origin teste/drift-gate-validacao      # AUTORIZAÇÃO NECESSÁRIA
gh pr create --draft --base main --head teste/drift-gate-validacao \
  --title "teste: validação do gate de drift (NÃO MESCLAR)" \
  --body "Validação de fiação do workflow. Não mesclar."   # AUTORIZAÇÃO NECESSÁRIA
```

## 2. Cenários e resultado esperado

| # | Cenário | Como provocar | Modo esperado (log `[drift-gate-mode]`) | Resultado esperado do job `migration-remote-drift` |
|---|---|---|---|---|
| A | PR sem caminhos de produção | Alteração só em `backend/README.md` | `informative` | Divergência comum **não** falha; o log mostra `MODO INFORMATIVO (--warn-only)` e o relatório completo |
| B | PR com migration | Adicionar um arquivo vazio em `backend/supabase/migrations/` (**não** usar versão real; ver nota) | `blocking` | **Falha** (divergência comum) |
| C | PR que altera o gate | Alterar um comentário em `backend/scripts/drift-gate-mode.mjs` | `blocking` | **Falha** |
| D | PR sem diff confirmado | Não reproduzível sem alterar a base; validado só por teste unitário (`diffOk: false`) | `blocking` | — |
| E | Workflow de push para main | Não dispara sem merge. Validar com `workflow_dispatch` do `migration-drift-main.yml` na branch de teste | `blocking` (o workflow não usa `--warn-only`) | **Falha** com a divergência atual |
| F | `adiada_aplicada` | Não reproduzível sem alterar o remoto. Coberto por teste unitário | `blocking` sempre | — |

**Nota sobre B:** o arquivo de teste deve ter versão inexistente e **ser removido** antes de qualquer merge. Não usar versão de migration real. Como o PR só é `draft` e não será mesclado, o arquivo não entra em produção. Se o dono preferir, o cenário B pode ser substituído por alteração em `backend/supabase/config.toml` (também caminho de produção), sem criar migration.

Comandos de observação:

```bash
gh pr checks <N>                                  # estado de cada job
gh run list --workflow=ci-backend-supabase.yml --branch teste/drift-gate-validacao
gh run view <RUN_ID> --log | grep -E "drift-gate-mode|MODO|Caminhos|Migrations|DRIFT|Resultado"
gh workflow run migration-drift-main.yml --ref teste/drift-gate-validacao   # cenário E
gh run view <RUN_ID> --log | grep -E "BLOCKING|DRIFT|Resultado|exit"
```

## 3. Critérios de aceite

- A: job verde; log contém `modo=informative` e o relatório de drift.
- B e C: job vermelho; log contém `modo=blocking` e o motivo.
- E: job vermelho com a divergência real; **não** há `--warn-only` no log do comando.
- Nenhum job usa `continue-on-error`.
- Os secrets só são lidos pelo job de drift (nomes, nunca valores, no log).

## 4. Limpeza (exige autorização)

```bash
gh pr close <N>                                  # AUTORIZAÇÃO NECESSÁRIA (sem --delete-branch: a exclusão da branch é um passo separado)
git push origin --delete teste/drift-gate-validacao   # AUTORIZAÇÃO NECESSÁRIA
git switch - && git branch -D teste/drift-gate-validacao
```

## 5. O que este procedimento não prova

- Não prova que `git diff` falhará de forma fechada na CI (cenário D) nem o comportamento de `adiada_aplicada` com o remoto real (cenário F). Ambos têm cobertura unitária apenas.
- Não prova a aplicação de migrations; este procedimento não aplica nada.
- Não substitui a revisão CODEOWNERS nem o label `deploy-prod:aprovado`.

## 6. Quem decide

- Autorizar a branch e o PR de teste (passos 1).
- Autorizar a limpeza (passo 4).
- Decidir se o resultado de A–E é suficiente para ativar o modo novo em produção do gate.
