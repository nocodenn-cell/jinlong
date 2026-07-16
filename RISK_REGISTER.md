# Risk Register — FastProduct Go-Live

**Data:** 2026-07-16 · Severidade: 🔴 alta · 🟠 média · 🟡 baixa · Probabilidade e Impacto em (P/I) de 1–5.

| ID | Risco | Sev | P/I | Evidência | Mitigação | Dono |
|---|---|:---:|:---:|---|---|---|
| R1 | **Migrations do repo não aplicadas em produção** (248, 250–253, 256) | 🔴 | 3/5 | ledger jinlong tem 18; repo tem 193; esses ausentes | Homologar 248 + gate financeiro; aplicar em ordem (`DEPLOY_ORDER.md`) com confirmação | Você + RM |
| R2 | **Migration 248 (devolução/troca) validada só em local** | 🟠 | 3/4 | `SMOKE_OK` só no Docker local; 2 bugs de RPC já corrigidos | Homologar em `jinlong` antes do go-live; gate financeiro 5/5 | Você |
| R3 | **Numeração de migration duplicada** (dois `259`, dois `268`) | 🟡 | 2/2 | ledger + repo | Timestamp é autoritativo; `guard:migrations` OK; normalizar pós-go-live | Eng |
| R4 | **Ordem de aplicação de RPC** (268 dropa overloads v4) | 🟠 | 2/4 | `268_drop_v4_overloads` + `268_reconcile_..._single_overload` | Aplicar reconcile logo após o drop; nunca aplicar drop isolado | Você |
| R5 | **Segunda autoridade Supabase `ageguard`** | 🟡 | 1/4 | status **INACTIVE** | Manter inativo; garantir que nenhum `*_SUPABASE_URL` de prod aponte para ela | RM |
| R6 | **Valores de cofre não auditáveis por API** (Vercel/GitHub) | 🟠 | 3/3 | sem API de leitura de env var | Checklist manual de dashboard (`AUDITORIA_AMBIENTES_PRODUCAO.md` §7) | Você |
| R7 | **4 nomes de variáveis órfãos** em cofres | 🟡 | 2/2 | 0 uso no repo | Confirmar não-uso externo → remover | Você |
| R8 | **33 funções `SECURITY DEFINER` executáveis por `anon`** | 🟠 | 2/4 | security advisors | Revisar cada uma; restringir grant se não for intencional | Eng + Você |
| R9 | **Leaked Password Protection desligado** | 🟡 | 2/3 | security advisor | Habilitar no Supabase Auth (toggle) | Você |
| R10 | **RLS habilitado sem policy** (`gerente_auth_attempts` + 1) | 🟡 | 2/3 | security advisor INFO | Confirmar se acesso só service_role é intencional; senão adicionar policy | Eng |
| R11 | **Provider fiscal abstrato** (sem emissão real) | 🟠 | 3/4 | 1 teste; roadmap Fase 5 | Congelar escopo fiscal no piloto **ou** integrar Focus real | PO |
| R12 | **UI dupla `/gerente` ↔ Admin V2** | 🟡 | 2/3 | `check:entity-ssot` 5 @legacy | Consolidar com gate por módulo (P2); risco de manutenção divergente | Eng |
| R13 | **CI GitHub bloqueado por quota** (gitleaks/e2e falham em ~3s) | 🟡 | 3/2 | jobs sem runner | Vercel é build autoritativo; e2e crítico manual antes do corte | RM |
| R14 | **Perf DB não otimizada** (21 auth_rls_initplan, 97 índices não usados) | 🟡 | 3/2 | performance advisors, 0 ERROR | Otimizar pós-go-live; não bloqueia piloto | Eng |
| R15 | **`cliente_id` em `vendas_em_espera`** (débito conhecido) | 🟡 | 2/2 | `TECH_DEBT_VENDA_ESPERA_CLIENTE.md` | Controlado; sem ação para o piloto | PO |

**Top-3 bloqueadores reais de go-live:** R1, R2 (banco) e R6 (config de cofre). Todos exigem **sua confirmação** por serem mutação/validação de produção.
