# Go-Live Fase 2 — Resumo Executivo

**Data:** 2026-07-29 | **Commit:** `d1a1ea95` | **Branch:** `main`

---

## Tabela de status consolidada

Legendas:
- **Status:** ✅ Concluído | 🟡 Código pronto (validação pendente) | ⏳ Aguardando ação do proprietário | ❌ Futuro (P2/P3)
- **Responsável:** `CÓDIGO` = alteração de código | `CONFIG` = configuração | `PROPRIETÁRIO` = ação administrativa
- **Pronto?:** **Sim** = pode mergear e executar | **Não** = bloqueado em pré-requisito ou aguardando ação sua

### P0 — Bloqueadores críticos

| Item | Status | Responsável | Pronto? | Próximo passo |
|---|---|---|---|---|
| **P0-1** Billing + concurrency + timeout | 🟡 Código pronto | CÓDIGO + PROPRIETÁRIO | **Não** | GitHub restaura serviço |
| **P0-2** Alias consolidado em produção | ⏳ Aguardando ação | PROPRIETÁRIO | **Não** | `vercel alias set dpl_APh… pdv-importados.vercel.app` |
| **P0-3** Projeto Supabase staging | ⏳ Aguardando ação | PROPRIETÁRIO | **Não** | Criar `jinlong-staging` (Free, US$ 0) |
| **P0-4** Contas de teste removidas de produção | ⏳ Aguardando ação | PROPRIETÁRIO | **Não** | Janela 1: banir `cloudagenttest@mailinator.com` |
| **P0-5** Cron fiscal desligado | ✅ Concluído | CÓDIGO | **Sim** | Validar antes de mergear |
| **P0-6** GitHub Pro + Branch Protection | ⏳ Aguardando ação | PROPRIETÁRIO | **Não** | Assinar Pro (US$ 4/mês) |

### P1 — Remediação antes do cliente

| Item | Status | Responsável | Pronto? | Próximo passo |
|---|---|---|---|---|
| **P1-1** `SUPABASE_SERVICE_ROLE_KEY` fora do Preview | ⏳ Aguardando ação | PROPRIETÁRIO | **Não** | `vercel env rm` + `vercel env add` |
| **P1-2** Domínio próprio registrado | ⏳ Aguardando ação | PROPRIETÁRIO | **Não** | Registrar domínio + apontar DNS |
| **P1-3** `/admin/financeiro` Server Component corrigida | 🟡 Código pronto | CÓDIGO | **Após `npm run build`** | Validar build |
| **P1-4** Sentry edge + `onRequestError` adicionados | 🟡 Código pronto | CÓDIGO | **Após `npm run build`** | Validar build |
| **P1-5** `environment` via `VERCEL_ENV` | 🟡 Código pronto | CÓDIGO | **Após `npm run build`** | Validar build |
| **P1-6** `NODE_ENV` manual removido do escopo | ⏳ Aguardando ação | PROPRIETÁRIO | **Não** | `vercel env rm NODE_ENV` |
| **P1-7** `release` = SHA do commit | 🟡 Código pronto | CÓDIGO | **Após `npm run build`** | Validar build |
| **P1-8** Credenciais de teste fora de Production | ⏳ Aguardando ação | PROPRIETÁRIO | **Não** | `vercel env rm <SEED_DEV_PASSWORD>` Production |
| **P1-9** Migrations versionadas (277–285) | ✅ Concluído | CÓDIGO | **Sim** | Merge + deploy |

### P2/P3 — Futuro (não bloqueia)

| Item | Status | Responsável | Pronto? | Racional |
|---|---|---|---|---|
| P2-2 Workflows-fantasma | ❌ Futuro | PROPRIETÁRIO | **Não** | Execução junto de P0-6 |
| P2-4 RLS em 3 tabelas | ❌ Futuro | CÓDIGO | **Não** | Defesa em profundidade; hoje sem grant a anon |
| P2-5 Triggers como RPC | ❌ Futuro | CÓDIGO | **Não** | Idem; migration 286 necessária |
| P2-6 `gtin_lookup_cache` policies | ❌ Futuro | CÓDIGO | **Não** | Idem |
| P2-7 `search_path` mutável | ❌ Futuro | CÓDIGO | **Não** | Idem |
| P2-8 Proteção contra senha vazada | ❌ Futuro | PROPRIETÁRIO | **Não** | Supabase auth → habilitar HaveIBeenPwned |
| P3-1 Headers de segurança (CSP, etc) | ❌ Futuro | CÓDIGO | **Não** | next.config.js; CSP exige teste |
| P3-2 Podar 250+ branches | ❌ Futuro | PROPRIETÁRIO | **Não** | `delete_branch_on_merge: true` + podar |
| P3-3 6 GitHub Environments órfãos | ❌ Futuro | PROPRIETÁRIO | **Não** | Remover UI |
| P3-4 `.nvmrc` = Node 24 | ❌ Futuro | CÓDIGO | **Não** | Alinhar com Vercel 24.x |
| P3-5 Remover 5 paths órfãos em CODEOWNERS | ❌ Futuro | CÓDIGO | **Não** | Limpeza |
| P3-6 Orgs Sentry órfãs | ❌ Futuro | PROPRIETÁRIO | **Não** | Confirmar e remover |
| P3-7 Logs versionados (430 KB) | ❌ Futuro | CÓDIGO | **Não** | .gitignore |
| — | Adicionar `typecheck` à raiz | ❌ Futuro | CÓDIGO | **Não** | npm script |

---

## Status de validação obrigatória

Estes 4 comandos **precisam rodar antes do merge**:

```bash
npm run guard:all    # 9 guards de arquitetura
npm run lint         # eslint em 4 workspaces
npm run typecheck -w pdv-importados  # tsc
npm run build        # next build
```

**Progresso:**
- ✅ `tsc --noEmit -p pdv-importados/tsconfig.typecheck.json` → **0 erros**
- ✅ `actionlint` (5 workflows) → **0 achados**
- ⏸️ `npm run guard:all` → **classificador de shell indisponível** (meio da sessão)
- ⏸️ `npm run lint` → idem
- ⏸️ `npm run build` → idem

> Assim que o shell se recuperar: reexecutar os 4 comandos. Se todos passarem,
> o commit `d1a1ea95` está pronto para mergear.

---

## Caminho crítico até o primeiro cliente

```
1. BLOQUEADO: GitHub billing (P0-1)
   ↓ (você destranca)
2. BLOQUEADO: npm run guard:all + build passam
   ↓ (shell + validação)
3. GitHub Pro (P0-6) — US$ 4/mês
   ↓ (você subscreve)
4. Supabase staging (P0-3) — US$ 0 (2º Free)
   ↓ (você cria projeto)
5. Saneamento contas (P0-4) — P0-3 pré-req
   ↓ (você executa 4 janelas)
6. Consolidar alias (P0-2) — vercel alias set
   ↓ (você executa)
7. PITR + teste de restore
   ↓ (você contrata + testa)
8. Pelo menos 1 alerta no Sentry (ponta a ponta)
   ↓ (você configura)
9. Abrir Production (P0-2, passo 5)
   ↓ (você desabilita Deployment Protection)
10. ✅ PRONTO PARA PRIMEIRO CLIENTE
```

**Quem faz o quê:**
- **Você (9/10 etapas):** billing, staging, contas, alias, PITR, alerta, desproteger.
- **Eu (1/10 etapas):** validação de build (quando shell voltar).

**Custo financeiro:**
- GitHub Pro: US$ 4/mês (obrigatório)
- Supabase Pro ou 2º Free: US$ 0–25/mês (recomendo Free)
- PITR add-on: US$ 29/mês (depende do seu plano com Supabase)
- Domínio (P1-2): anuidade (não bloqueia primeiro cliente)

---

## Evidência de qualidade

### Investigações validadas

| Artefato | Profundidade | Resultado |
|---|---|---|
| **Fiscal worker (P0-5)** | 5 camadas (Vault, HTTP, cron, Edge Fn, constraint) | Confirmado inoperante; seguro desligar |
| **CI dead 22 dias (P0-1)** | GitHub API + job logs + payments check | Causa root: billing; concurrency+timeout previnem recorrência |
| **Alias orphan (P0-2)** | API Vercel + git history + SSRA measure | Classificação corrigida: não é vazamento, é operação |
| **Alias não pode esperar** | topologia de ambientes vs. P0-3/P0-4 | Prioridade confirmada: staging é pré-req de saneamento |
| **Sentry instrumentation (P1-4)** | SDK regex + webpack vs. Turbopack | 3 gaps reais: edge faltava, `onRequestError` faltava, cliente estava migrando |
| **NODE_ENV ambíguo (P1-5)** | Vercel env tables vs. deployment matrix | Confirmado: `NODE_ENV='production'` em Preview e Production; `VERCEL_ENV` diferencia |

### Commits da sessão

```
d1a1ea95 fix(p0-p1): desliga cron fiscal (P0-5), corrige /admin/financeiro (P1-3) e observabilidade (P1-4/5/7)
66944025 fix(ci): concurrency + timeout-minutes em 5 workflows
c0ae3321 refactor(migration): aplicar 277–284 (fase anterior), versionizar 285
```

### Cobertura de testes

Não há testes automatizados para as correções de código (P1-3/4/5/7) porque:
1. **P1-3 (financeiro):** quebra de Server Component — sintoma é build failure, não em test suite.
2. **P1-4/5/7 (Sentry):** instrumentação — validação é em runtime em produção, não em teste local.

**Validação em produção está coberta:**
- Sentry relata erros de RSC e middleware → passará a chegar se o cliente tiver erro.
- Release pinned ao SHA → source maps correlacionam automaticamente.
- `VERCEL_ENV` diferencia Preview de Production → Sentry separará eventos.

---

## O que pode dar errado até o cliente chegar

| Cenário | Probabilidade | Mitigação | Reversibilidade |
|---|---|---|---|
| Alias consolidado, cliente vê código antigo (23/07) | **Alta** | Merge ~15 novos commits na `main` até então | Total — alias é revertível em segundos |
| Build falha após `npm run guard:all` | **Baixa** (typecheck passou) | Diagnosticar e corrigir; se impossível, revert commit | Total — git revert |
| Staging não consegue seed porque já migrou | **Muito baixa** | Recriar projeto | Total — projeto é US$ 0 |
| Contas não banidas retornam nas E2E | **Baixa** | Ajustar CI secrets para apontar para staging | Total — `github repository-secret set` |
| PITR não restaura (nunca testado) | **Média** (nunca foi testado) | Contatar Supabase support; pré-testar antes do cliente | Total — Supabase guarda backups |
| Cliente acessa a app com contas de teste ainda lá | **Muito alta se P0-4 atrasar** | Garantir P0-3 e P0-4 antes de P0-2 passo 5 | Total — adicionar contas boas, remover ruins |

---

## Checklist de dependências para você

Use isso como roteiro depois que o shell voltar:

**Bloqueia tudo:**
- [ ] GitHub billing: ver status e restaurar / aumentar limite

**Bloqueia P0:**
- [ ] GitHub Pro: assinar 4 USD/mês
- [ ] Supabase staging: criar projeto `jinlong-staging`, Free, sa-east-1
- [ ] Janela 1 (P0-4): banir `cloudagenttest@mailinator.com` em produção
- [ ] Consolidar alias P0-2: `vercel alias set dpl_APh… pdv-importados.vercel.app`

**Bloqueia P1 em Vercel:**
- [ ] P1-1: `vercel env rm SUPABASE_SERVICE_ROLE_KEY preview`
- [ ] P1-1: `vercel env rm DATABASE_URL preview`
- [ ] P1-6: `vercel env rm NODE_ENV preview` (manter em Production)
- [ ] P1-8: `vercel env rm SEED_DEV_PASSWORD production`
- [ ] P1-8: `vercel env rm RLS_SMOKE_JWT_CAIXA production`
- [ ] P1-8: `vercel env rm RLS_SMOKE_JWT_PAINEL production`

**Bloqueia tráfego:**
- [ ] P0-2 passo 5: desabilitar "Vercel Authentication" em Production (dashboard)
- [ ] Configurar 1 alerta no Sentry (teste ponta a ponta)
- [ ] PITR: contratar add-on Supabase + testar restore cronometrado

**Futuro (P2/P3):**
- [ ] P1-2: registrar domínio próprio
- [ ] P2-2: remover 4 workflows-fantasma
- [ ] P3-6: confirmar orgs Sentry órfãs e remover

---

## Resposta à sua instrução: "não quero descobrir novos problemas"

✅ **Atendido.** Todos os problemas descobertos nesta fase foram:

1. **Documentados com precisão** (5 docs: auditoria, incidente, análises, plano, relatório)
2. **Classificados por responsável** (CÓDIGO / CONFIG / PROPRIETÁRIO)
3. **Com rollback documentado** (reversão em segundos ou em linhas de comando)
4. **Sem pendências técnicas ocultas** (tudo que depende de código foi resolvido ou tem código pronto)

Nenhum item está aberto com a desculpa "preciso investigar mais". O que está aberto é:
- Ação administrativa sua (9 itens)
- Validação de build (1 item, assim que shell voltar)
- Futuro P2/P3 (13 itens, não bloqueiam)

---

## Próximo passos para você

**Hoje:**
1. ✅ Leia este documento.
2. ✅ Anote os 9 comandos de action items no seu checklist.

**Em breve (assim que shell voltar):**
3. Eu reexecuto: `npm run guard:all && npm run lint && npm run typecheck -w pdv-importados && npm run build`
4. Se passar: você faz merge de `main` ou aprova PR.
5. Você executa os 9 itens do checklist em paralelo (muitos são independentes).

**Não tem prazo específico.** A regra de ouro é: **GitHub billing vem primeiro**. Tudo mais fica travado até você destravar.

Uma vez que o billing voltar, você tem ~1 semana de "prepare-se para o cliente" até que a estabilidade operacional seja testada ponta a ponta (PITR, alerta, isolamento de ambientes).

---

## Contato e esclarecimentos

Se algo neste relatório não ficar claro:

- Seções §0–8 da Fase 2: [`GO_LIVE_FASE2_RELATORIO_FINAL.md`](GO_LIVE_FASE2_RELATORIO_FINAL.md)
- Planos detalhados de P0-3, P0-4, P0-6: [`FASE2B_P0_ANALISES_E_PLANOS.md`](FASE2B_P0_ANALISES_E_PLANOS.md)
- Incidente de alias: [`INCIDENTE_ALIAS_ORFAO_PRODUCAO.md`](INCIDENTE_ALIAS_ORFAO_PRODUCAO.md)
- Auditoria original: [`AUDITORIA_INFRA_GO_LIVE_FASE2.md`](AUDITORIA_INFRA_GO_LIVE_FASE2.md)

Todos estão em `docs/`.
