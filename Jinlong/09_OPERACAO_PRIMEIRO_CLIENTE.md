# 09 — Operação Primeiro Cliente

> Checklist, validações e riscos para o piloto D0.
> Fonte: `docs/FEATURE_FREEZE_PILOTO.md`, `docs/RUNBOOK_PRIMEIRO_CLIENTE.md`, `docs/P0_CHECKLIST_OPERACIONAL.md`
> [[00_DASHBOARD_PROJETO]] · [[06_ROADMAP]] · [[04_PDV]]

---

## Perfil do Piloto (Contrato D0)

| Item | Decisão |
|---|---|
| **Canal** | Web (`pdv-importados`) — sem desktop/outbox |
| **Pagamentos** | Dinheiro, PIX, débito, crédito — **sem fiado** no PDV |
| **Fiscal** | Mock/stub — NFC-e Focus só se contrato exigir |
| **Loja** | Uma loja (Matriz) |
| **Catálogo** | Assistido (time Jinlong) + cadastro unitário + import CSV |
| **Financeiro** | Receber + pagar em `/admin/financeiro` |
| **Fora do escopo** | Venda em espera, inventário cego, conciliação, multi-loja |

---

## Checklist de Abertura

### Fase 1 — Infraestrutura Supabase

- [ ] `supabase link` para projeto correto (staging → prod)
- [ ] `npx supabase migration list` — sem lacunas entre Local e Remote
- [ ] `node scripts/p0-migration-status.mjs` → saída **ALINHADO**
- [ ] Se drift: `npx supabase db push` → repetir verificação
- [ ] **Resolver conflito migration 255** (dois arquivos `255_*`) — decisão humana
- [ ] Aplicar migration `256` se RPC `pdv_diagnostico_pre_producao` ausente
- [ ] Executar `backend/supabase/scripts/verify_p0_producao.sql`
- [ ] Deploy Edge Functions: `sync-outbox`, `validar-gerente`, `fiscal-worker`
- [ ] Secrets configurados: `SYNC_KEY` (se desktop futuro), `FISCAL_*` (se aplicável)

### Fase 2 — Aplicação Web

- [ ] `.env.local` / Vercel com `NEXT_PUBLIC_SUPABASE_URL` e `ANON_KEY` corretos
- [ ] Deploy Vercel (branch `main` ou promoção staging → prod)
- [ ] Validar `/api/health` pós-deploy (SSRA)
- [ ] Acessar `/admin/diagnostico-caixa` — checklist OK
- [ ] `npm run check:caixa-pre-producao` — sem falhas críticas

### Fase 3 — Onboarding Cliente

Seguir `docs/RUNBOOK_PRIMEIRO_CLIENTE.md`:

- [ ] **Criar loja nova** (nunca reutilizar Matriz de teste `a0000001-…`)
- [ ] Criar usuários no Supabase Auth (e-mail real, Auto Confirm)
- [ ] Vincular em `public.usuarios` (NUNCA em `public.perfis`)
  - DONO → `/admin/dashboard`
  - GERENTE → `/admin/dashboard`
  - OPERADOR → `/caixa`
- [ ] Seed catálogo mínimo (5–10 produtos)
- [ ] Configurar idioma (`pt` ou `zh`)

### Fase 4 — Validação Operacional

- [ ] DONO loga → `/admin/dashboard`
- [ ] DONO troca idioma PT ↔ 中文 → persiste após logout
- [ ] OPERADOR loga → `/caixa` (sem acesso admin)
- [ ] OPERADOR abre caixa → bip produto → finaliza venda
- [ ] GERENTE/DONO vê venda em `/admin/vendas`
- [ ] Smoke 023: desconto gerente por token (`smoke_023_finalizar_venda_token_gerente.sql`)
- [ ] Contas a receber/pagar visíveis em `/admin/financeiro`
- [ ] Cancelamento de venda funciona

### Fase 5 — Homologação e Go/No-Go

- [ ] Registrar evidências em `docs/CHECKLIST_P0_STAGING.md`
- [ ] Preencher `docs/DONE_DEFINITION_PILOTO.md` §4.3 e §7
- [ ] GO/NO-GO: `docs/CHECKLIST_EXECUCAO_GO_LIVE.md`
- [ ] Smoke ao vivo com o cliente em produção

---

## Validações Necessárias

| Validação | Ferramenta | Critério de aceite |
|---|---|---|
| Migrations alinhadas | `migration list` | Local = Remote |
| GRANTs corretos | `verify_p0_producao.sql` | Sem FALHA |
| RLS funcional | `test:rls-scope` (CI) | Passa localmente |
| Diagnóstico PDV | `/admin/diagnostico-caixa` | Sem FALHA crítica |
| Venda end-to-end | Smoke manual | Venda aparece em admin |
| Desconto gerente | Smoke 023 | Token aceito |
| Health pós-deploy | `/api/health` | 200 + deployment ID |

---

## Treinamento do Operador

### Operador de Caixa (OPERADOR)
1. Login → redirecionado para `/caixa`
2. Abrir caixa (saldo inicial)
3. Bip produto ou busca por nome
4. Verificar preço (varejo/atacado automático)
5. Aplicar desconto (se autorizado)
6. Escolher forma de pagamento (split se necessário)
7. Finalizar venda
8. Fechar caixa ao fim do turno

**Idioma:** sempre português (sem seletor no caixa).

### Gerente/Dono (GERENTE/DONO)
1. Login → `/admin/dashboard`
2. Cadastrar produtos em `/admin/catalogo`
3. Gerenciar estoque em `/admin/estoque`
4. Ver vendas e cancelar em `/admin/vendas`
5. Financeiro em `/admin/financeiro`
6. Trocar idioma PT ↔ 中文 na sidebar

---

## Riscos para o Piloto

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Migration 255 conflitante | Alta | Alto | Decidir renumeração antes do deploy |
| GRANT drift em prod | Média | Alto | `verify_p0_producao.sql` + migration `255_grant_baseline…` |
| Operador sem treinamento | Média | Médio | Sessão ao vivo + runbook impresso |
| Queda de internet | Alta (web only) | Alto | Informar cliente: D0 requer conexão |
| Expectativa de NF-e | Média | Médio | Confirmar contrato: fiscal mock no D0 |
| Conta em `public.perfis` | Baixa | Alto | Runbook proíbe; usar só `usuarios` |
| Loja de teste reutilizada | Média | Alto | Criar loja nova sempre |

---

## Contatos e Documentos de Referência

| Documento | Path |
|---|---|
| Feature Freeze | `docs/FEATURE_FREEZE_PILOTO.md` |
| P0 Checklist | `docs/P0_CHECKLIST_OPERACIONAL.md` |
| Runbook onboarding | `docs/RUNBOOK_PRIMEIRO_CLIENTE.md` |
| Checklist staging | `docs/CHECKLIST_P0_STAGING.md` |
| Go/No-Go | `docs/CHECKLIST_EXECUCAO_GO_LIVE.md` |
| Done definition | `docs/DONE_DEFINITION_PILOTO.md` |
| Roteiro demo | `docs/ROTEIRO_DEMO.md` |
| Diagnóstico PDV | [[04_PDV#Diagnóstico Pré-Produção]] |

---

## Critérios de Encerramento do Piloto D0

- [ ] Cliente operando vendas reais por ≥ 1 semana
- [ ] Zero bugs P0 abertos sem mitigação
- [ ] Evidências T1–T12 registradas para produção
- [ ] `DONE_DEFINITION_PILOTO.md` assinado
- [ ] Feature Freeze pode ser revisado pelo sponsor

---

> Sprint go-live: [[Próxima Sprint]] · Roadmap P0: [[06_ROADMAP#P0 Detalhado]]
