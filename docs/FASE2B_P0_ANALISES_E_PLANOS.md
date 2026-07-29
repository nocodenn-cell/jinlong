# Fase 2B — Análises e planos: P0-3, P0-4, P0-6

**Data:** 2026-07-29
**Escopo:** os três P0 cuja resolução é decisão/execução do dono da conta, não alteração de código.

---

# P0-3 · Arquitetura de ambientes

## Estado atual

Um único projeto Supabase (`kbabmewnahysfvlybiak`, sa-east-1) atende produção,
Preview e testes. Um único projeto Vercel (`pdv-importados`) com Preview e
Production apontando para o **mesmo** `NEXT_PUBLIC_SUPABASE_URL`.

## Comparação das três topologias

| Critério | **A — Ambiente único** (hoje) | **B — Staging + Produção** | **C — Dev + Staging + Produção** |
|---|---|---|---|
| Projetos Supabase | 1 | 2 | 3 |
| Custo Supabase/mês | US$ 0 (Free) | +US$ 25 (Pro) ou US$ 0 (2º Free) | +US$ 25–50 |
| Preview escreve em prod | **Sim** | Não | Não |
| E2E contra dados reais | **Sim** | Não | Não |
| Testar migration antes de prod | **Não** | Sim | Sim |
| Gate de drift do CI é confiável | **Não** (compara prod com prod) | Sim | Sim |
| Contas de teste no banco do cliente | **Sim** (13) | Não | Não |
| Complexidade operacional | mínima | média | alta |
| Adequado ao piloto de 1 cliente | **Não** | **Sim** | excessivo |

**Nota sobre o "2º Free":** o Supabase permite 2 projetos ativos no Free por
organização. Um staging em Free é viável tecnicamente, com duas ressalvas: pausa
automática após 7 dias de inatividade (aceitável para staging) e ausência de PITR
(irrelevante em staging). **Isto torna a Opção B viável a custo zero.**

## Recomendação: **Opção B**, com staging em Free

Justificativa técnica de por que **não pode esperar**:

1. **O gate de drift do CI é inócuo hoje.** `ci-backend-supabase.yml` compara
   migrations locais contra `SUPABASE_MIGRATION_CHECK_PROJECT_REF`. Esse secret
   aponta para o projeto de produção. O gate compara produção consigo mesma e
   sempre passa. É um gate decorativo.
2. **Toda migration estreia em produção.** As 277–284 foram aplicadas direto no
   banco do cliente. Funcionou, mas por inspeção manual, não por processo.
3. **P0-4 não tem solução estável sem B.** Remover as contas de teste sem ter
   onde recriá-las significa perder a capacidade de rodar E2E — elas voltariam.
4. **250+ branches podem escrever em produção.** Qualquer Preview deploy carrega
   `SUPABASE_SERVICE_ROLE_KEY`, que ignora RLS por definição.

## Plano de execução (B)

| # | Passo | Comando/Local | Rollback |
|---|---|---|---|
| 1 | Criar projeto `jinlong-staging`, região `sa-east-1` | Dashboard Supabase | excluir projeto |
| 2 | Aplicar migrations 001→285 | `supabase db push --project-ref <novo>` | recriar projeto |
| 3 | Semear usuários de teste (os 13 de P0-4) | `npm run seed:dev-users -w pdv-importados` | — |
| 4 | Repontar escopo **Preview** da Vercel | `vercel env rm <VAR> preview` + `vercel env add <VAR> preview` para `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` | `vercel env pull` guardado no passo 0 restaura |
| 5 | Repontar `SUPABASE_MIGRATION_CHECK_PROJECT_REF` | GitHub Secrets | valor anterior anotado |
| 6 | Repontar `PLAYWRIGHT_*` e `CI_*` | GitHub Secrets | idem |
| 7 | Validar: deploy de Preview grava em staging, não em prod | contar linhas em `vendas` nos dois projetos antes/depois | — |

**Passo 0 obrigatório:** `vercel env pull .env.preview.bak --environment=preview`
e o equivalente para production, guardados fora do repositório. Sem isso o
rollback do passo 4 é reconstrução manual.

---

# P0-4 · Contas de teste em produção

## Inventário classificado

15 contas em `auth.users`. Classificação por origem e destino:

### PRODUÇÃO — preservar (1)

| Conta | Último login | Ação |
|---|---|---|
| `aoliveiradamata@gmail.com` | 2026-07-27 | **manter** — dono/operador real |

### TESTE — migrar para staging, remover de produção (10)

| Conta | Último login | Origem | Senha em |
|---|---|---|---|
| `e2e-admin@fastproduct.dev` | 2026-07-19 | E2E | `PLAYWRIGHT_TEST_PASSWORD` |
| `e2e-gerente@localhost.test` | 2026-07-18 | E2E | `PLAYWRIGHT_TEST_PASSWORD` |
| `e2e-operador@localhost.test` | 2026-07-18 | E2E | `PLAYWRIGHT_CAIXA_TEST_PASSWORD` |
| `e2e-dono@localhost.test` | nunca | E2E | `SEED_DEV_PASSWORD` |
| `operador.test@example.com` | 2026-07-10 | teste manual | `SEED_DEV_PASSWORD` |
| `gerente.test@example.com` | 2026-06-15 | teste manual | `SEED_DEV_PASSWORD` |
| `demo-gerente@localhost.test` | 2026-07-10 | demo | `SEED_DEV_PASSWORD` |
| `demo-operador@localhost.test` | 2026-06-23 | demo | `SEED_DEV_PASSWORD` |
| `demo@jinlong.com` | **2026-07-29** | demo comercial | `SEED_DEV_PASSWORD` |
| `email-do-test@exemplo.com` | nunca | teste | desconhecida |

> `demo@jinlong.com` logou **hoje**. Antes de remover, confirmar se há demo
> comercial agendada dependendo dela. Candidata a manter em staging e apontar as
> demos para lá.

### OBSOLETO — remover sem substituição (4)

| Conta | Motivo |
|---|---|
| `cloudagenttest@mailinator.com` | **e-mail não confirmado** + domínio descartável **público**: qualquer pessoa lê a caixa e dispara reset de senha. Prioridade máxima da lista. |
| `probe.dono.1784431715968@fp-homolog.com` | resíduo de probe automatizado, 19/07, nunca logou |
| `probe.dono.1784431787527@fp-homolog.com` | idem |
| `smoke.dono.1784432057537@fp-homolog.com` | resíduo de smoke, 19/07, nunca logou |

## Plano seguro de limpeza

**Nada é apagado automaticamente.** Sequência em 4 janelas:

### Janela 1 — imediata, sem esperar P0-3

Apenas `cloudagenttest@mailinator.com`. É a única com vetor de tomada de conta
por terceiro (mailinator é público). Não depende de staging porque não há E2E
que a use.

```sql
-- 1. Verificar que não tem dados vinculados
select id, email from auth.users where email = 'cloudagenttest@mailinator.com';
select count(*) from public.vendas       where operador_id = '<id>';
select count(*) from public.movimentos_caixa where operador_id = '<id>';
select count(*) from public.usuarios     where id = '<id>';

-- 2. Banir (reversível) em vez de excluir
update auth.users
   set banned_until = 'infinity'
 where email = 'cloudagenttest@mailinator.com';
```
**Rollback:** `set banned_until = null`.
**Só excluir** após 48 h sem incidente, e só se as contagens do passo 1 forem 0.

### Janela 2 — depois de P0-3 (staging pronto)

As 3 contas de probe/smoke. Nunca logaram, não têm dados. Mesmo procedimento:
banir → 48 h → excluir.

### Janela 3 — depois de seed em staging

As 10 contas de teste. Pré-condição: `npm run seed:dev-users` executado com
sucesso no staging **e** um ciclo de E2E verde apontando para staging. Sem isso,
remover de produção quebra os testes e alguém as recria.

### Janela 4 — rotação

Depois que nenhuma conta de teste existir em produção, rotacionar
`PLAYWRIGHT_TEST_PASSWORD`, `PLAYWRIGHT_CAIXA_TEST_PASSWORD` e
`SEED_DEV_PASSWORD`, e remover `SEED_DEV_PASSWORD` do escopo Production da Vercel.

### Regra de exclusão

Excluir usuário em `auth.users` com FK em `vendas`/`movimentos_caixa` **falha ou
cascateia** — em ERP, apagar o operador de uma venda destrói rastreabilidade
fiscal e contábil. Por isso:

> Conta com **qualquer** vínculo transacional **não é excluída**. Fica banida
> permanentemente. Banir remove o acesso; excluir removeria a auditoria.

Das 14 candidatas, as que logaram e podem ter operado caixa
(`demo@jinlong.com`, `e2e-*`, `*.test@example.com`, `demo-*`) são fortes
candidatas a **banir permanentemente, nunca excluir**.

---

# P0-6 · Branch protection

## O que foi medido

```
GET /repos/nocodenn-cell/fastproduct/branches/main/protection
→ 403 "Upgrade to GitHub Pro or make this repository public to enable this feature"

GET /repos/nocodenn-cell/fastproduct/rulesets              → 403 (idem)
GET /repos/nocodenn-cell/fastproduct/vulnerability-alerts   → 404 (desabilitado)
GET /repos/nocodenn-cell/fastproduct/secret-scanning/alerts → 404 (desabilitado)
GET /repos/nocodenn-cell/fastproduct/code-scanning/alerts   → 403 (não habilitado)

repo: private=true, security_and_analysis=null
owner: conta de usuário (não organization)
collaborators: 1 (nocodenn-cell, admin)
default_workflow_permissions: read          ← já seguro
allowed_actions: all, sha_pinning_required: false
```

## Matriz: o que depende de pagamento e o que não

| Recurso | Free + privado | Como obter | Custo |
|---|---|---|---|
| **Branch protection / rulesets** | ❌ | GitHub Pro | US$ 4/mês |
| **Required status checks** | ❌ | GitHub Pro | US$ 4/mês |
| **CODEOWNERS com efeito** | ❌ (arquivo existe, é inerte) | GitHub Pro | US$ 4/mês |
| **PR obrigatório antes do merge** | ❌ | GitHub Pro | US$ 4/mês |
| **Dependabot alerts** (CVE) | ❌ | GitHub Pro | US$ 4/mês |
| **Secret scanning + Push protection** | ❌ | GitHub Advanced Security | caro (enterprise) |
| **Code scanning (CodeQL)** | ❌ | GHAS | caro |
| Dependabot **version updates** (PRs) | ✅ | `.github/dependabot.yml` | **US$ 0** — já feito |
| `permissions:` mínimo por workflow | ✅ | declarado no YAML | **US$ 0** — já feito |
| Pin de actions por SHA | ✅ | referência imutável | **US$ 0** — já feito |
| `concurrency` + `timeout-minutes` | ✅ | YAML | **US$ 0** — já feito |
| Secret scanning **próprio** | ✅ | `secret-scan.yml` (gitleaks) já existe | **US$ 0** |
| Assinatura de commits | ✅ | GPG/SSH local | **US$ 0** |

### Correção de um erro comum

Migrar para uma **Organization no plano Free não resolve**. Rulesets em
repositório privado de org Free continuam bloqueados; só liberam no **Team**
(US$ 4/usuário/mês). Organization Free só ajuda se o repo virar **público** —
o que está fora de questão para o código de um ERP comercial.

## Conclusão

O único recurso realmente indispensável e bloqueado é **branch protection com
required checks**. Sem ele, `main` aceita push direto sem revisão e sem CI —
e é justamente o que permitiu que 38 commits chegassem a `main` durante os 22
dias em que o CI estava morto.

**GitHub Pro a US$ 4/mês** destrava branch protection, required checks,
CODEOWNERS efetivo e Dependabot alerts de uma vez. É o menor custo absoluto
para fechar o P0.

**Não implementei mitigação por hook local**, conforme a instrução "Não
contornar". Um `pre-push` seria contornável com `--no-verify` e daria falsa
sensação de controle.

## Configuração a aplicar assim que o Pro estiver ativo

```bash
gh api -X PUT repos/nocodenn-cell/fastproduct/branches/main/protection \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["gitleaks", "build-and-test"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "require_code_owner_reviews": true,
    "dismiss_stale_reviews": true
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": true,
  "required_conversation_resolution": true
}
JSON
```

**Pré-condição:** só aplicar `required_status_checks` **depois** que o CI voltar
a executar (P0-1). Exigir checks que não rodam trava todo merge.

`enforce_admins: false` de propósito: com um único colaborador admin, ativar
isso cria risco de auto-bloqueio sem ninguém para destravar.

**Ordem correta:** Pro → P0-1 resolvido → CI verde → aplicar required checks.

**Antes de aplicar, limpar os 4 workflows-fantasma** (`architecture-validation`,
`ci-agents`, `ci-core`, `ci-visual-baseline`) — estão registrados na API sem
arquivo no repo e poluem a lista de contextos selecionáveis.
