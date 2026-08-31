# Runbook canônico — Backup & Restore (Jinlong)

> **Referência única** para recuperação de dados. Documentos históricos (`P0-2`, `P0-3`, auditoria) apontam para este arquivo.
>
> **Produção (ORIGEM):** projeto `jinlong` · ref `PROJECT_REF_JINLONG` · org `NatureCode` (`ORG_ID_NATURECODE`)

---

## Estado atual (reverificação 2026-08-31)

| Campo | Valor |
|-------|-------|
| Plano org (API Management) | **Free** (`get_organization` → `plan: "free"`) |
| Backup automático plataforma | **Não incluído** (Free) |
| PITR | **Não disponível** (Free) |
| `backup.sh` agendado | **Não** (artefato repo; sem workflow/cron) |
| Restore ensaiado | **Não** |
| IDs 183–187 | **FAIL** (ver auditoria) |

**Histórico:** em 2026-08-27, P0-2 também classificou **FAIL** — ver [`../piloto-d0/P0-2_BACKUP_EVIDENCIA.md`](../piloto-d0/P0-2_BACKUP_EVIDENCIA.md).

---

## Decisão recomendada: A — Backup gerenciado Supabase (Pro)

Para cliente pagante, **Opção A** é a menor solução adequada em risco operacional.

### Comparação A vs B

| Critério | A — Supabase Pro (gerenciado) | B — Dump externo (`pg_dump` / `backup.sh`) |
|----------|-------------------------------|--------------------------------------------|
| **Custo** | ~**$25/mês** org Pro + compute (~$10/mês micro incluso via crédito) | Infra storage + CI/cron; tempo de engenharia recorrente |
| **Complexidade** | Baixa — ativa no painel | Alta — secrets, cron, storage off-site, rotação, alertas |
| **Frequência** | Diário automático (7 dias retenção Pro) | Depende do schedule (ex.: cron 24h) |
| **Retenção** | 7 dias (Pro) | Configurável (`RETENTION_DAYS=7` no script) |
| **Segurança** | Backups na plataforma; sem `service_role` em cron | Risco de vazamento de credenciais PG em CI/VM |
| **Monitoramento** | Dashboard + API `GET .../database/backups` | Precisa construir (falha de job, idade do dump) |
| **RPO sustentado** | **≤ 24h** (daily backup) — **atende D0-06** | ≤ 24h **se** agendado diário **e** monitorado |
| **RTO** | Restore UI/API para projeto novo; depende do tamanho do DB | Dump + restore manual; tipicamente mais lento |
| **Restore** | Restore to New Project (Pro+) | `pg_restore` em DESTINO isolado |
| **Manutenção** | Baixa | Alta (script, OS, retenção, testes) |
| **Risco operacional** | **Menor** | Maior (drift, credencial, job silencioso) |

**Quando B seria justificável:** org não pode migrar para Pro; requisito legal de cópia off-site em bucket próprio (complementar A, não substituir).

---

## Metas D0-06

| Meta | Valor | Status atual |
|------|-------|--------------|
| RPO | ≤ 24h | **NÃO ATENDE** |
| RTO | ≤ 8h úteis | **NÃO ATENDE** (sem drill) |

---

## Gate humano obrigatório (antes de qualquer ação paga ou com dados)

1. **Upgrade Pro** — decisão de cobrança (~$25/mês). **Não executar sem autorização explícita.**
2. **`SUPABASE_ACCESS_TOKEN`** — para listar backups via API e registrar evidência ID 184.
3. **Restore drill (P0-3)** — preencher [`../piloto-d0/P0-3_HUMAN_GATE.md`](../piloto-d0/P0-3_HUMAN_GATE.md):
   - ref **DESTINO** ≠ `PROJECT_REF_JINLONG`
   - frase de autorização datada
4. **Dump manual (Opção B)** — autorização explícita para usar credenciais PG de produção; **não usar `service_role` nem `.env` sem gate.**

**Produção permanece somente leitura** durante investigação e drill.

---

## Procedimento — Opção A (após upgrade Pro autorizado)

### Fase 1 — Habilitar backup automático (IDs 183–184)

1. Humano: Dashboard → Organization → upgrade **Pro** (confirmar cobrança).
2. Aguardar **primeiro backup diário** (até 24h após upgrade).
3. Evidência:
   - Dashboard → Database → Backups (captura), **ou**
   - `GET https://api.supabase.com/v1/projects/PROJECT_REF_JINLONG/database/backups` com `SUPABASE_ACCESS_TOKEN`
4. Registrar em P0-2: data/hora, contagem de backups, retenção visível.

### Fase 2 — Restore drill (ID 185)

1. Dashboard ORIGEM → Database → Backups → **Restore to a New Project**.
2. Anotar ref **DESTINO** em P0-3 **antes** de confirmar.
3. Aguardar conclusão (projeto DESTINO isolado).
4. **Validação** (DESTINO apenas — contagens agregadas, sem PII em Git):

```sql
-- Executar no DESTINO; comparar ordem de grandeza com ORIGEM (read-only)
SELECT 'produtos' AS t, count(*) FROM produtos
UNION ALL SELECT 'categorias', count(*) FROM categorias
UNION ALL SELECT 'marcas', count(*) FROM marcas
UNION ALL SELECT 'estoque', count(*) FROM estoque
UNION ALL SELECT 'vendas', count(*) FROM vendas
UNION ALL SELECT 'itens_venda', count(*) FROM itens_venda
UNION ALL SELECT 'vendas_pagamentos', count(*) FROM vendas_pagamentos
UNION ALL SELECT 'caixas', count(*) FROM caixas
UNION ALL SELECT 'movimentacoes_caixa', count(*) FROM movimentacoes_caixa
UNION ALL SELECT 'movimentos_estoque_log', count(*) FROM movimentos_estoque_log
UNION ALL SELECT 'contas_receber', count(*) FROM contas_receber
UNION ALL SELECT 'contas_pagar', count(*) FROM contas_pagar
UNION ALL SELECT 'venda_eventos', count(*) FROM venda_eventos;
```

5. Invariantes opcionais: `sum(total) FROM vendas WHERE status='CONCLUIDA'` (ordem de grandeza); checksum de `count(*)` por tabela crítica documentado em evidência interna (não commitar PII).

6. Medir RTO: T0 = clique restore → T1 = query acima retorna → registrar minutos.

7. Destruir DESTINO após evidência (pause/delete project).

### Fase 3 — RPO/RTO (IDs 186–187)

- **RPO:** documentar “backup diário, retenção 7d” → **ATENDE** meta 24h.
- **RTO:** se drill < 8h úteis → **ATENDE**; senão documentar desvio e plano.

---

## Procedimento — Opção B (somente se A inviável e autorizado)

1. Criar projeto DESTINO vazio; preencher P0-3.
2. Autorização escrita para dump read-only da ORIGEM.
3. `pg_dump -Fc` ou `supabase db dump` → artefato criptografado off-site.
4. `pg_restore` **somente no DESTINO**.
5. Mesma validação SQL acima.
6. Agendar repetição + monitoramento de idade do dump.

**Nota:** Opção B **não** reclassifica ID 183 como gerenciado; no máximo cobre 184 se monitorado, com maior risco.

---

## IDs da auditoria — critérios de PASS

| ID | PASS quando |
|----|-------------|
| 183 | Backup automático real ativo (Pro+ daily) |
| 184 | Lista/captura/API comprova execuções recentes |
| 185 | Restore em DESTINO isolado + validação contagens |
| 186 | RPO documentado ≤ 24h sustentado pelo mecanismo |
| 187 | RTO medido no drill ≤ 8h úteis (ou desvio aceito formalmente) |

**Não marcar GAP CLOSED** até 185 validado.

---

## Referências

- [Supabase Backups](https://supabase.com/docs/guides/platform/backups)
- [Supabase Pricing](https://supabase.com/pricing)
- D0-06: [`../piloto-d0/DEFINICAO_FUNCIONAL_D0.md`](../piloto-d0/DEFINICAO_FUNCIONAL_D0.md)
- Evidência histórica: [`../piloto-d0/P0-2_BACKUP_EVIDENCIA.md`](../piloto-d0/P0-2_BACKUP_EVIDENCIA.md)
- Gate restore: [`../piloto-d0/P0-3_HUMAN_GATE.md`](../piloto-d0/P0-3_HUMAN_GATE.md)
- Matriz auditoria: [`../AUDITORIA_PRONTIDAO_CLIENTE_PAGANTE.md`](../AUDITORIA_PRONTIDAO_CLIENTE_PAGANTE.md)
