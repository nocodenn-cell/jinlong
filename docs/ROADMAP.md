# Roadmap arquitetural — fastproduct (R0–R8)

> **Este é o único roadmap canônico do monorepo.** Substitui o roadmap anterior (feito/curto/médio/longo prazo) e absorve a sequência de [ROADMAP_PDV_INVARIANTES_OPERACIONAIS.md](./ROADMAP_PDV_INVARIANTES_OPERACIONAIS.md) (F0–F6). Reconstruído em 2026-07-02 a partir de auditoria de evidências do repositório (código, migrations, testes, auditorias, CI). Nenhuma fase avança sem a anterior estar fechada ou provada desnecessária.

## Por que o roadmap anterior foi substituído

1. A premissa da "Fase 2 — Valor Percebido" ("núcleo concluído, sem trabalho de estabilização") foi refutada pela [auditoria de drift](../AUDITORIA_DRIFT_PRODUCAO_REPOSITORIO.md) (P0: schema de produção não reproduzível a partir do repo).
2. O roadmap de invariantes proibia implementação pesada antes do ADR assinado (F0) — e F2/F3/F5 foram implementadas com o ADR em aberto.
3. Existiam ≥6 documentos com pretensão de roadmap, nenhum descrevendo o estado real.

## As fases

| Fase | Nome | Classe | Estado |
|------|------|--------|--------|
| **R0** | Decisão de centro de gravidade | Crítica | **Concluída (2026-07-02)** — [ADR-PDV-001 aceito](./adr/ADR-PDV-centro-de-gravidade.md): web-first, desktop congelado, preço modelo A; [matriz offline](./MATRIZ_OFFLINE_PDV.md) publicada |
| **R1** | Reconciliação de schema e governança de migrations | Crítica | Pendente |
| **R2** | Gate de produção (financeiro + P0) | Crítica | Pendente (bloqueada por R1) |
| **R3** | Autoridade única (gaps client-only + contrato de venda) | Crítica | Pendente |
| **R4** | Observabilidade por invariante | Importante | Pendente |
| **R5** | Consolidação de superfície (um painel, um carrinho, poda de docs) | Importante | Pendente |
| **R6** | Valor de produto (venda em espera, faixas atacado, UX cadastro) | Importante | Pendente |
| **R7** | Desktop/offline | Condicional | **Adormecida por decisão** (ADR §1: desktop congelado; reavaliar pós-piloto) |
| **R8** | Escala (multi-loja real, concorrência, realtime) | Opcional agora | Pendente |

### R1 — Reconciliação de schema e governança de migrations

Executa as fases A–D da [auditoria de drift](../AUDITORIA_DRIFT_PRODUCAO_REPOSITORIO.md):

- **Primeiro passo obrigatório:** re-rodar o diff prod↔repo (a auditoria é de 2026-06-20; houve backports timestampados depois).
- Baseline via `supabase db pull`; squash do histórico divergente com arquivamento em `migrations/_archive/`; numeração **timestamp** daqui em diante.
- Remover `*_rollback_*.sql` do diretório de migrations e resolver colisões de numeração (225/235/244–246 duplicadas).
- **Deletar** `pdv-importados/supabase/migrations/` (diretório obsoleto e não canônico).
- Reautorar deltas pendentes: `descontos_venda.operador_id/aplicado_em` (P1 compliance); decidir `system_alerts` (R4) e `venda_finance_context`.
- **Resolver o fiado**: app ainda referencia FIADO/`contas_receber` que produção removeu (`245_remover_venda_fiado`).
- Gate de CI: `supabase db diff` vazio como condição de merge que toque schema.

**Saída:** `migration list` idêntico em prod/staging/repo; ambiente novo criado do zero passa nos smokes; CI bloqueia drift.

### R2 — Gate de produção

- Gate financeiro 5/5 PASS ([pdv-production-financial-gate.md](./pdv-production-financial-gate.md)) sobre ambiente reconciliado — o gate **já exige** paridade de migrations (pré-requisito P1), por isso depende de R1.
- [P0 operacional](./P0_CHECKLIST_OPERACIONAL.md) completo + SSRA + smoke i18n (360/QQ).
- Ativação fiscal real (Focus) se o piloto exigir NFC-e.
- Restore de backup ensaiado uma vez (lacuna de DR identificada na auditoria).

### R3 — Autoridade única

Fecha os riscos **Altos** da [auditoria multi-authority](./MULTI_AUTHORITY_ARCHITECTURE_AUDIT.md):

- Espelhar no server as regras hoje só-client: kill-switch `vendas_suspensas`, limite de sangria, divergência de fechamento.
- Trazer sessão de operador do caixa (`auth.getUser()` inline) e `scan-telemetry` para o modelo `adminPolicy`.
- Extrair **contrato de venda único** em `shared-core` consumido pelo Zod web e pelo ingest da Edge (desktop congelado ⇒ 2 consumidores). Resolver a divergência quantidade 3-decimais vs `Math.floor`.
- Documentar precedência de pricing em contrato único (as autoridades por camada permanecem por design).

### R4 — Observabilidade por invariante

- `system_alerts` em produção; agregação da telemetria de scan (p50/p95 bip→linha, scans presos, `double_finalize_attempt` — métricas já enumeradas em [SCAN_PIPELINE_STATE_MACHINE.md §7](./SCAN_PIPELINE_STATE_MACHINE.md)).
- Alertas: sync/DLQ, fila fiscal parada; `pdv-consistency-check` agendado.
- Documento "onde ver estas métricas". Definir retenção de dados/LGPD da telemetria.

### R5 — Consolidação de superfície

- **Um** painel gerencial (terminar `/gerente`→`/admin` ou decidir o inverso); deletar `legacy/admin`.
- Um ponto de entrada de carrinho (remover shims `stores/carrinhoStore.ts`); definir fronteira `shared/` vs `shared-core/`.
- Poda documental: ~10 documentos vivos, resto para `docs/_archive/`; limpar raiz do repo.

### R6 — Valor de produto

Conteúdo do [PLANO_FASE_2_VALOR_PERCEBIDO.md](./PLANO_FASE_2_VALOR_PERCEBIDO.md) (o plano é bom; a premissa/ordem estavam erradas): venda em espera (sobre o contrato de R3), faixas de atacado UI, UX de cadastro, completar Auditoria Visual com `system_alerts` e descontos com `aplicado_em`.

### R7 — Desktop/offline (condicional)

Adormecida pelo ADR §1. Se offline virar requisito: descongelar **com paridade** (login de operador — fases 2–3 do [plano service_role](./PLANO_RETIRADA_SERVICE_ROLE_PDV_LOCAL.md), contrato único de R3, reuso do pipeline de scan, auto-update Tauri, gate financeiro do outbox). Proibido estado "meio vivo": ou congelado, ou com paridade.

### R8 — Escala

Testes de concorrência multi-terminal na mesma loja (**antes** de abrir 2º caixa simultâneo), ativação de 2ª loja (schema 032–036 pronto), Realtime sobre `venda_eventos`, kardex materializado, plano de feature flags/ambiente único, avaliação do modelo C de preço (cache no browser).

## Grafo de dependências

```
R0 ──► R1 ──► R2   ◄── caminho mínimo para produção defensável
 │      │      └──► R4 ──► R8
 │      └──────────► R6 ◄── R3, R5
 ├──► R3 ──► R5 ──► R6
 └──► R7 (adormecida; depende de R0 + R3 se descongelar)
```

**Bloqueios formais:** R1 bloqueia R2 e R6 · R3 bloqueia R5 e R6 · R2 bloqueia R4 · R4+R6 bloqueiam R8.

## Regras de execução

1. Uma fase por vez; cada fase começa re-auditando se continua necessária.
2. Golden flow de venda permanece **congelado** ([venda-golden-flow.md](./venda-golden-flow.md)); o gate financeiro re-roda após qualquer merge que toque o entorno do núcleo.
3. Eliminar duplicação antes de criar abstração; nenhum padrão novo sem necessidade demonstrada.
4. Se uma decisão deste roadmap se provar errada durante a execução, interromper e revisar o roadmap com evidências — não contornar em silêncio.
