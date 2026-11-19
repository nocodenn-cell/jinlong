# Fluxo oficial de desenvolvimento — Jinlong

**Vigência:** proposta de 2026-11-11, para aprovação do dono. Complementa `CONTRIBUTING.md`, `docs/CI_POLICY.md` e o template `.github/pull_request_template.md`. Onde houver conflito, o `CI_POLICY.md` vale para checks obrigatórios e este documento vale para o fluxo.

**Princípios de referência:** o documento "Princípios de Engenharia do Jinlong" não está versionado no repositório (ver `GITHUB_AUDIT.md`, seção 0). Os critérios usados aqui são os oito da missão: redução de complexidade, preservação arquitetural, redução de acoplamento, SSoT, testabilidade, segurança, previsibilidade e manutenibilidade. Se o documento for versionado, revisar este arquivo contra ele.

## 1. Fluxo de estados do PR

```
ABERTO → EM REVISÃO → APROVADO → PRONTO PARA MERGE → MERGED
```

Estados de bloqueio **não** são etapas. São flags que se acumulam sobre qualquer estado:

| Flag | Quando usar | Quem remove |
|---|---|---|
| `bloqueado:decisao` | Depende de decisão do dono (produto, fiscal, RBAC) | O dono registra a decisão no PR |
| `bloqueado:dependencia` | Depende de outro PR ou de migration deferida | O autor, ao mesclar a dependência |
| `bloqueado:migration` | Tem migration fora do manifesto de adiadas ou colisão de versão | Manifesto atualizado e versão única |
| `bloqueado:check` | Check obrigatório vermelho | Autor, com correção |
| `nao-mesclar` | Marcado explicitamente como não mesclável (ex.: #537) | Só o dono |

Um PR com qualquer flag `bloqueado:*` ou `nao-mesclar` **não avança** para `PRONTO PARA MERGE`.

## 2. Padrão de título

Formato: `tipo(escopo): assunto no imperativo, até 72 caracteres`

- `tipo` ∈ `feat`, `fix`, `refactor`, `docs`, `test`, `perf`, `chore`, `sec`, `ci`.
- `escopo` é o domínio ou a pasta principal: `caixa`, `estoque`, `leads`, `fiscal`, `drift`, `anon`, `sync`.
- **Não** usar `[NÃO FAZER MERGE]`, `DRAFT`, `teste:` ou `WIP` no título. Use o estado de draft do GitHub e a flag `nao-mesclar`.

Exemplos bons: `sec(anon): restringe privilégios de anon em public`, `fix(sync): checa token antes do fallback de RPC`.

## 3. Padrão de descrição

O template `.github/pull_request_template.md` continua válido. Acrescentar os campos abaixo, porque a auditoria mostrou que eles faltavam nos PRs de maior risco:

```markdown
## Resumo
<o que muda e por quê, em 3 linhas no máximo>

## Dependências
- Depende de: #<n> (ou "nenhuma")
- Bloqueia: #<n> (ou "nenhum")
- Sobrepõe: #<n> nos arquivos <lista> (ou "nenhuma")

## Migrations (obrigatório se houver arquivo em backend/supabase/migrations)
- Versão: <14 dígitos>; versão única confirmada contra main e PRs abertos: sim/não
- Entrada em deferred-migrations.json: sim (motivo) / não (aplicação automática será feita no deploy)
- Rollback: <caminho> ou "não se aplica"
- Ordem de aplicação em relação a outras migrations: <texto>

## Evidência de teste
- Comando(s) executado(s): <colar>
- Resultado: <passou/falhou, com contagem>
- Ambiente: <local, homologação com cópia>

## Riscos e reversão
- Impacto em dinheiro, estoque, fiscal, RBAC ou isolamento entre empresas: <sim/não e qual>
- Como reverter: <texto>

## Checklist
(manter o checklist existente do template)
```

## 4. Taxonomia de labels

Sete grupos, sem sobreposição. **Nenhum label autoriza merge ou deploy.** Autorização é sempre registrada em comentário assinado pelo dono.

| Grupo | Prefixo | Valores | Uso |
|---|---|---|---|
| Tipo | `tipo:` | `feature`, `fix`, `security`, `docs`, `chore`, `test` | Um por PR |
| Área | `area:` | `pdv`, `caixa`, `estoque`, `financeiro`, `fiscal`, `leads`, `site`, `auth`, `infra` | Um ou dois |
| Risco | `risco:` | `baixo`, `medio`, `alto`, `critico` | Um por PR. `critico` = dinheiro, RBAC, isolamento entre empresas ou migration |
| Bloqueio | `bloqueado:` | `decisao`, `dependencia`, `migration`, `check` | Quando aplicável (ver seção 1) |
| Revisão | `revisao:` | `pendente`, `aprovada`, `solicitada` | Espelha o estado de review |
| Migration | `migration:` | `nenhuma`, `aplicar-homolog`, `deferida` | Uma por PR com SQL |
| Especial | (sem prefixo) | `nao-mesclar`, `dependabot`, `auto-gerado` | Casos fixos |

**Labels a remover ou fundir** (o repositório hoje tem `deploy-prod:aprovado` em #675 e labels sem padrão):
- `deploy-prod:aprovado` → **não** é label de workflow. Substituir por comentário formal de autorização do dono, referenciado no manifesto de adiadas. O label existe hoje, mas não deve ser usado como sinal de merge.
- Labels de dependência (`dependencies`, `github-actions`) ficam, porque o Dependabot os cria.

Total proposto: **7 grupos, cerca de 30 valores.** Não criar labels fora desses grupos sem revisão.

## 5. Regras de aprovação

| Tipo de PR | Revisões humanas | Quem | Observação |
|---|---|---|---|
| Docs, chore sem código de produção | 1 | Qualquer membro com write | |
| Dependabot (versão menor/patch) | 1 | Tech-lead | Checks obrigatórios verdes |
| Dependabot (major) | 1 + teste manual | Tech-lead | Não mesclar sem leitura do changelog |
| Código de app (`pdv-importados`, `pdv-local`, `shared-core`) | 1 | Dono da área (CODEOWNERS) | |
| Migration, RLS, RPC, Edge Function | 2 | Backend-lead **e** security | Obrigatório `migration:` |
| Mudança de RBAC, auth, permissão | 2 | Security **e** dono do produto | Ex.: #623 |
| Financeiro, fiscal, estoque (valor) | 2 | Backend-lead **e** fiscal ou financeiro | |
| CI, workflows, proteção de branch | 1 | Tech-lead | Altera o gate: registrar no PR |

Autor **não** aprova o próprio PR. Quando o autor for o único com contexto, o dono substitui o segundo revisor e registra o motivo.

## 6. Critérios de merge

Todos os itens abaixo, sem exceção:

1. Checks obrigatórios de `docs/CI_POLICY.md` verdes no commit atual.
2. Revisões exigidas pela tabela da seção 5, no commit atual (nova revisão se houve push depois da aprovação).
3. Nenhuma flag `bloqueado:*` nem `nao-mesclar`.
4. Dependências mescladas antes (campo "Depende de" vazio ou com PRs já em `main`).
5. Se há migration: versão única confirmada (script da seção 7); entrada no manifesto se for adiada; rollback presente quando a migration altera dado.
6. Se há migration que altera dinheiro, estoque, RBAC ou isolamento: evidência de teste em homologação com cópia do banco.
7. Autorização explícita do dono para merge de PR de risco `critico` (comentário, não label).
8. Branch atualizada com `main` se o PR toca arquivo que outro PR aberto também toca (ver seção 8).

**Merge** usa **squash** como padrão, para histórico linear. Commit de merge só em caso de release. Rebase só na branch do próprio autor, nunca em `main`.

## 7. Verificação de versão de migration (proposta de CI)

Hoje nenhum gate impede duas migrations com a mesma versão. A auditoria encontrou três casos. A verificação proposta é simples:

```bash
# Falha se duas migrations do mesmo PR ou de main usam a mesma versão
ls backend/supabase/migrations/ | sed -E 's/^([0-9]{14})_.*/\1/' | sort | uniq -d
```

Estender para comparar com `origin/main` e com os PRs abertos (script a escrever). **Esta alteração é de CI e exige autorização do dono.**

## 8. Governança de branches

**Nomes:** `tipo/escopo-descricao` (ex.: `fix/sync-token-fallback`). Prefixos de `CONTRIBUTING.md`: `feat/`, `fix/`, `refactor/`, `docs/`, `test/`, `perf/`, `chore/`. Branches de agente (`claude/…`, `cursor/…`) são aceitas, mas devem ter PR aberto em até 48 h ou ser removidas.

**Vida útil:**
- Branch sem commit por 30 dias e sem PR: marcar para revisão.
- Branch com PR fechado sem merge: excluir em até 7 dias após o fechamento, **depois** de confirmar que não há trabalho exclusivo (`git log origin/main..<branch>` vazio ou já reaproveitado).
- Branch de PR mesclado: excluir automaticamente (`delete_branch_on_merge` já está ativo; respeitar).

**Empilhamento:** um PR só aponta para outro PR como base se a dependência for explícita no campo "Depende de". Quando o PR-base for mesclado, **rebasear o PR empilhado sobre `main`** e trocar a base na interface. A auditoria encontrou PRs empilhados que ficaram com diff duplicado (#657 e #656).

**Cópias de trabalho:** não criar uma nova branch para a mesma regra de negócio sem checar `gh pr list --search <palavra>` antes. Isso evita as três cópias de M1 e as duas de D1.

**Proibido sem autorização:** force push em `main`, exclusão de branch com PR aberto, reescrita de migration que esteja no manifesto de adiadas.

## 9. Frequência e responsável

| Revisão | Frequência | Responsável |
|---|---|---|
| PRs abertos: estado, checks e conflito | Semanal | Tech-lead |
| Manifesto de adiadas | Semanal, e antes de cada deploy | Tech-lead + dono |
| Branches sem PR | Mensal | Tech-lead |
| Proteção de branch e rulesets | Mensal | Tech-lead (ajustes exigem autorização do dono) |
| Dependabot | Semanal (PRs criados segunda-feira) | Tech-lead |
