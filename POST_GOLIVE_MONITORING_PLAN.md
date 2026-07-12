# POST_GOLIVE_MONITORING_PLAN — Operação Assistida Jinlong

> Plano de monitoramento para as primeiras semanas de produção. Baseado nos
> componentes de observabilidade **já existentes** no repositório. Data: 2026-07-12.

## Objetivo

Detectar cedo qualquer regressão que impeça o operador de vender, e dar ao
gerente/dono sinais claros sem depender do desenvolvedor.

## Componentes de observabilidade já disponíveis

| Camada | Ferramenta | Onde |
|---|---|---|
| Erros de runtime (front/back) | **Sentry** | `sentry.client.config.js`, `sentry.server.config.js`, `instrumentation.ts` |
| Saúde da aplicação | **Health endpoints** | `GET /api/health`, `GET /api/gerente/health` |
| Alertas de negócio | **system_alert** | `registrar_system_alert` (RPC) via `app/caixa/server/registrarAlertasLevesVenda.ts`; visíveis em `/admin/auditoria` |
| Banco / RLS / índices | **Supabase advisors + logs** | `get_advisors`, `get_logs` (MCP Supabase) |
| Build / deploy / runtime web | **Vercel** | Deployments, Runtime Logs, Runtime Errors |
| Fila fiscal | cron fiscal | `.github/workflows/fiscal-cron.yml` (documentar estado — fiscal em stub, R1) |

## Janela crítica: Dia 1 e Semana 1

### Verificações de abertura (todo dia, antes de abrir a loja)
1. `GET /api/health` → 200. Se falhar, **não abrir**; checar Vercel/Supabase.
2. `GET /api/gerente/health` → 200.
3. Deploy de produção no Vercel = **Ready** (não "Error"/"Building" travado).
4. Sentry sem novos *issues* não triados nas últimas 12h.

### Durante o expediente (monitorar a cada ~2h)
- **Sentry**: novos erros em `/caixa` ou nas server actions de venda.
- **Auditoria (`/admin/auditoria`)**: alertas leves de venda (divergências).
- **Vercel Runtime Errors**: picos de 5xx.

### Fim do dia
- Conferir **fechamento de caixa** reconciliado (Fase 6) — divergência = investigar.
- Anotar qualquer incidente no runbook da loja.

## Métricas-chave (KPIs de saúde operacional)

| Métrica | Fonte | Alvo | Ação se fora do alvo |
|---|---|---|---|
| Taxa de erro em `finalizarVendaCaixa` | Sentry / logs | < 0,5% das vendas | Investigar payload/RPC v4; **não alterar** a RPC sem autorização |
| Latência p95 finalizar venda | Sentry perf / DevTools | < 2,5 s | Ver `get_advisors` (índices), Supabase logs |
| 5xx no `/caixa` | Vercel Runtime | ~0 | Checar env vars (Supabase), deploy |
| Divergência de reconciliação de caixa | `/admin/auditoria` | 0 recorrente | Revisar movimentações/pagamento parcial |
| Alertas `system_alert` de venda | auditoria | tendência estável | Triar por tipo |
| Documentos fiscais pendentes | fila fiscal | conforme R1 | **R1**: emissão em stub — alinhar com decisão de negócio |

## Limiares de alerta sugeridos (configurar no Sentry)

- **P1 (acordar alguém):** qualquer erro em `finalizar_venda*` / falha de login em massa / `/api/health` 5xx.
- **P2 (mesmo dia):** erros recorrentes no histórico, export, ou reconciliação.
- **P3 (semana):** warnings de performance, advisors do Supabase.

## Rotina de acompanhamento (Operação Assistida)

- **Diário (Semana 1):** revisar Sentry + auditoria + Vercel; registrar no
  `RISK_REGISTER_GOLIVE.md` qualquer risco novo.
- **Semanal (Semana 2–4):** rodar `get_advisors` (Supabase) para índices/segurança;
  revisar KPIs; decidir sobre R1 (fiscal) e melhorias de performance (lazy-load de
  modais do PDV — ver `PDV_PERFORMANCE_UX_AUDIT.md`).

## Runbook de incidente (resumo)

1. **Operador não consegue vender:** checar `/api/health` → Vercel deploy → Supabase
   status → Sentry (erro específico). Reverter para o último deploy Ready se preciso.
2. **Login falha:** verificar Supabase Auth e env vars `NEXT_PUBLIC_SUPABASE_*`.
3. **Caixa não reconcilia:** conferir movimentações e pagamentos parciais da venda.
4. **Escalonar** ao desenvolvedor apenas se envolver `vendas`, comissão ou a RPC v4
   (áreas protegidas — nenhuma alteração sem autorização explícita).

## Limitações conhecidas a vigiar

- **R1 Fiscal:** emissão NF-e em stub — vigiar acúmulo na fila fiscal e a decisão de
  negócio pendente.
- **Pré-existentes de CI** (`guard:core`, 1 teste de venda): não afetam runtime, mas
  mantêm o CI vermelho — ver `GO_LIVE_FINAL_STATUS.md`.
