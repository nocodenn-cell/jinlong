# Inspeção pré-push — `codex/reconcile-db-final`

**Para:** decidir com evidência se a branch deve ser publicada.
**Por que este documento existe:** a branch está **apenas na sua máquina** (`C:\fastproduct`) e não
tem ref no `origin` (`git ls-remote origin | grep codex` → vazio). Não consigo rodar `git status`,
listar commits nem ver o diff dela deste ambiente — é exatamente o bloqueio que trava o item
`venda_finance_context`. O que segue é o roteiro para **você** gerar essa evidência.

> Rodar isto **não** publica nada. São comandos de leitura, exceto onde indicado.

---

## 1. Coleta (somente leitura)

Na raiz do repositório, com a branch em check-out:

```bash
git rev-parse --abbrev-ref HEAD          # confirme: codex/reconcile-db-final

# a) estado da working tree
git status

# b) commits da branch que não estão em main
git log --oneline --no-merges origin/main..HEAD

# c) diff já commitado (resumo e por arquivo)
git diff --stat origin/main...HEAD
git diff --name-status origin/main...HEAD

# d) o que ainda NÃO está commitado
git status --porcelain          # linhas com M/A/D não-staged ou ?? = pendente
git diff                        # não-staged
git diff --cached               # staged e não commitado

# e) migrations que a branch adiciona/remove
git diff --name-status origin/main...HEAD -- backend/supabase/migrations/
```

## 2. Verificação de segredos (obrigatória antes de qualquer push)

```bash
# nenhum .env real deve aparecer
git diff --name-only origin/main...HEAD | grep -E '\.env($|\.)' || echo "OK: nenhum .env no diff"

# varredura do repo com a config já existente
gitleaks detect --config .gitleaks.toml --no-banner
```

O CI também roda `secret-scan.yml` (job `gitleaks`) — mas verifique **antes**, porque o push já
expõe o conteúdo.

## 3. Gates

```bash
npm run guard:all
npx turbo run typecheck --filter=pdv-importados --filter=@fastproduct/shared-core
npm run lint
cd pdv-importados && npx vitest run && cd ..
npm run build

# específicos de schema
node backend/supabase/scripts/validate-phase3-2.mjs
node backend/supabase/scripts/validate-phase1-backport.mjs
node backend/supabase/scripts/reconcile-prod-repo-inventory.mjs
```

**Atenção — `guard:migrations` mudou.** O guard passou a falhar se existir diretório de migrations
com `.sql` fora de `backend/supabase/migrations/` (ver [ADR-011](./adr/ADR-011-ssot-unico-migrations.md)).
Se a branch foi criada antes do PR #297, ela ainda contém `pdv-importados/supabase/migrations/` e o
guard **vai falhar** até o merge/rebase — comportamento esperado, não regressão.

## 4. As três perguntas que decidem o `venda_finance_context`

A evidência que falta para reclassificar o item. Responda com saída de comando, não de memória:

```bash
# 1) A migration de retirada existe e o que ela faz?
git show --stat HEAD -- backend/supabase/migrations/20260810222702_retire_obsolete_venda_finance_context.sql
git log --format='%h %an %ad %s' --date=short -1 -- backend/supabase/migrations/20260810222702_retire_obsolete_venda_finance_context.sql

# 2) A 20260808130200 foi removida nesta branch? Em qual commit e por quê?
git log --oneline --diff-filter=D -- backend/supabase/migrations/20260808130200_24704_reapply_venda_finance_context_idempotent.sql
git log --diff-filter=D -1 --format='%H%n%an%n%ad%n%n%B' -- backend/supabase/migrations/20260808130200_24704_reapply_venda_finance_context_idempotent.sql

# 3) Existe ADR formalizando a retirada?
git diff --name-only origin/main...HEAD -- docs/adr/
```

A pergunta (3) é a decisiva. `FASE_3_1` §4.2 **rejeitou** descartar o espelho e condicionou
qualquer reversão futura a *"**ADR +** remoção/obsolescência explícita no repo **e** nota de
tracking"*. Se não houver ADR, a retirada contraria uma decisão registrada — o que não a invalida,
mas exige formalização antes de virar verdade do repositório.

## 5. Relação com o PR #297

| | PR #297 (`claude/jinlong-doc-assimilation-f155hr`) | `codex/reconcile-db-final` |
|---|---|---|
| Base | `origin/main` (`639d881`) | a confirmar com §1(b) |
| Toca migrations? | **Não cria nem altera nenhuma.** Só arquiva o fork legado `pdv-importados/supabase/migrations/` | **Sim** — adiciona `20260810222702`, aparentemente remove `20260808130200` |
| `venda_finance_context` | Mantém o arquivo e **bloqueia** o apply, sem decidir o mérito | Decide pela **retirada** |
| Conflito de merge esperado | Em `backend/supabase/migrations/` e nos docs `FASE_3_*` (que o #297 marcou como superseded) | idem |

**Ordem sugerida:** publicar `codex/reconcile-db-final` **antes** de mergear o #297. O #297 é
majoritariamente documental e já registra a divergência; se a retirada for a decisão vigente, ajusto
os documentos do #297 para refletir isso **antes** do merge, em vez de mergear texto que vira
obsoleto no mesmo dia.

## 6. Critério de decisão

Publique se, e somente se:

- [ ] §2 não acusou segredo algum;
- [ ] §1(d) não mostra arquivo pendente que você não pretendia enviar;
- [ ] §3 verde (exceto `guard:migrations`, pelo motivo do §3);
- [ ] §4 respondida — em especial se existe ADR da retirada.

Se algum item falhar, publique mesmo assim **numa branch de inspeção** (`git push -u origin
codex/reconcile-db-final`) apenas para eu auditar, deixando claro que não é candidata a merge.
Publicar não mergeia nada, e destrava a reconciliação.
