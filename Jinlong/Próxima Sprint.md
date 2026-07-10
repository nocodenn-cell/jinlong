# 🚀 Próxima Sprint — Jīn Lóng

> Gerado automaticamente em: 2026-07-10
> Contexto: Feature Freeze ativo — piloto 1º cliente pagante (canal web)
> [[Home]] | [[Dashboard]] | [[Roadmap]] | [[Backlog]]

---

## Objetivo da Sprint

**Pilotar o 1º cliente pagante com segurança.**

Não há features novas. A sprint é inteiramente focada em go-live: verificação de infraestrutura, conteúdo do onboarding e homologação com evidências.

---

## Sprint: Go-Live Piloto (Estimativa: 5–7 dias úteis)

### Tarefa 1 — Executar P0 Checklist T1–T12 em Staging
**Prioridade:** 🔴 P0 — Bloqueador absoluto
**Impacto no negócio:** Sem isso, o sistema não está pronto para produção real.
**Estimativa:** 1 dia

**Passos:**
```
1. cd backend
2. npx supabase link --project-ref <REF_STAGING>
3. npx supabase migration list → verificar colunas Remote sem lacunas
4. node scripts/p0-migration-status.mjs → esperar saída "ALINHADO"
5. Se drift: npx supabase db push → repetir passo 3-4
6. SQL Editor: executar `verify_p0_producao.sql` (checklist PDV) + aplicar migration `256` se RPC ausente
7. Admin: `/admin/diagnostico-caixa` ou `npm run check:caixa-pre-producao`
8. Smoke 023: executar smoke_023_finalizar_venda_token_gerente.sql
9. npx supabase functions deploy sync-outbox validar-gerente
10. Configurar secrets: SYNC_KEY, FISCAL_* (se aplicável)
11. Configurar .env.local / Vercel com NEXT_PUBLIC_SUPABASE_URL e ANON_KEY
12. Smoke de venda web: operador → /caixa → finalizar venda → gerente → /admin/vendas
13. Registrar evidências em docs/CHECKLIST_P0_STAGING.md
```

**Arquivos:**
- `docs/P0_CHECKLIST_OPERACIONAL.md`
- `docs/CHECKLIST_DEPLOY_SUPABASE.md`
- `backend/supabase/scripts/verify_p0_producao.sql`
- `backend/supabase/scripts/smoke_023_finalizar_venda_token_gerente.sql`
- `backend/supabase/migrations/256_pdv_diagnostico_pre_producao.sql`
- `pdv-importados/app/admin/diagnostico-caixa/`

---

### Tarefa 2 — Contas a Pagar (Rota Gerente)
**Prioridade:** 🔴 P0 — Comprometido com cliente no escopo D0
**Impacto no negócio:** Feature prometida no contrato do piloto.
**Estimativa:** 1–2 dias

**O que falta:**
- Rota `/gerente/financeiro/contas-pagar`
- Tabela/migration se não existe
- CRUD básico (listar, marcar como pago)
- Integração no menu do painel gerente

**Arquivos:**
- `pdv-importados/app/gerente/financeiro/` (criar subpasta `contas-pagar/`)
- `docs/PLANO_FASE_2_VALOR_PERCEBIDO.md` (referência de especificação)

---

### Tarefa 3 — Script / Runbook de Onboarding do 1º Cliente
**Prioridade:** 🔴 P0 — Necessário antes do go-live
**Impacto no negócio:** Sem roteiro estruturado, implantação é frágil e lenta.
**Estimativa:** 0,5 dia

**O que entregar:**
- Roteiro passo a passo em `docs/RUNBOOK_PRIMEIRO_CLIENTE.md` (atualizar se já existe)
- Seed de catálogo mínimo para o cliente (5–10 produtos de teste)
- Script de criação de usuários (OPERADOR + GERENTE + DONO)
- Checklist de validação ao vivo com o cliente

**Arquivos:**
- `docs/RUNBOOK_PRIMEIRO_CLIENTE.md`
- `docs/ROTEIRO_DEMO.md`
- `pdv-importados/docs/SEED_DEV_E2E.md` (referência)

---

### Tarefa 4 — Homologação Formal com Evidências (Staging → Prod)
**Prioridade:** 🔴 P0 — Gate obrigatório de go-live
**Impacto no negócio:** Sem evidências registradas, não há auditoria do que foi validado.
**Estimativa:** 0,5 dia (após Tarefa 1)
**Dependência:** Tarefa 1 concluída

**O que registrar:**
- Screenshots ou logs de cada etapa do P0 Checklist
- Resultado do `verify_p0_producao.sql`
- Smoke de venda bem-sucedida
- Checklist assinado em `docs/CHECKLIST_P0_STAGING.md`
- Tabela de evidências de `docs/DONE_DEFINITION_PILOTO.md` §4.3 e §7

**Arquivos:**
- `docs/CHECKLIST_P0_STAGING.md`
- `docs/DONE_DEFINITION_PILOTO.md`

---

### Tarefa 5 — Repetir P0 em Produção e Promover
**Prioridade:** 🔴 P0 — Último passo de go-live
**Impacto no negócio:** Promover staging → produção com o cliente real.
**Estimativa:** 0,5 dia (após Tarefa 4)
**Dependência:** Tarefa 4 concluída; cliente aprovado

**Passos:**
```
1. Repetir T1–T12 com project-ref de PRODUÇÃO
2. Verificar Vercel prod apontando para o projeto correto
3. Deploy Vercel (npx vercel --prod ou git push main)
4. Validar /api/health pós-deploy
5. Smoke de venda ao vivo com o cliente
6. GO/NO_GO: docs/CHECKLIST_EXECUCAO_GO_LIVE.md
```

---

## Tarefas da Próxima Sprint (Pós Go-Live Imediato)

> Podem iniciar na mesma sprint se houver capacidade, ou na sprint seguinte.

### Tarefa 6 — Sign-off ADR-PDV-001
**Prioridade:** 🟡 P1
**Estimativa:** 0,5 dia
**Ação:** Atualizar `docs/adr/ADR-PDV-centro-de-gravidade.md` de "Proposto" para "Aceito" com justificativa da implementação existente.

---

### Tarefa 7 — Documentar MATRIZ_OFFLINE_PDV.md
**Prioridade:** 🟡 P1
**Estimativa:** 1 dia
**Ação:** Criar `docs/MATRIZ_OFFLINE_PDV.md` com:
- Comportamento web em queda de rede (erros esperados, recuperação)
- Comportamento desktop em queda de rede (modo offline completo)
- Comportamento em reconexão (sync automático)
- Fluxos degradados aceitos vs. bugs a corrigir

---

## O que NÃO entra nesta Sprint

| Item | Motivo |
|---|---|
| Venda em Espera | Feature Freeze |
| NFC-e Focus real | Feature Freeze (sem checklist Focus completo) |
| Redesign visual / unificação de tokens | Feature Freeze |
| Kardex avançado | Feature Freeze |
| Auto-update Tauri | Feature Freeze / P3 |
| Bling adapter | Feature Freeze |
| E2E mutadores gerente | Feature Freeze (não bloqueia piloto) |
| Acessibilidade Fase 3.2 | Feature Freeze |
| Multi-loja | Feature Freeze / P3 |

---

## Critérios de Encerramento da Sprint

- [ ] P0 Checklist T1–T12 executado em **staging** com evidências
- [ ] P0 Checklist T1–T12 executado em **produção** com evidências
- [ ] Contas a pagar funcionando em staging
- [ ] Runbook de onboarding atualizado e validado
- [ ] Smoke de venda bem-sucedida com o 1º cliente em produção
- [ ] `docs/DONE_DEFINITION_PILOTO.md` preenchido e assinado
- [ ] Nenhum bug P0 aberto sem mitigação

---

> Ver histórico de entregas em [[Changelog]] · Backlog completo em [[Backlog]] · Roadmap em [[Roadmap]]
