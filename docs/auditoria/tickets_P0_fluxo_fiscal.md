# Auditoria 6 — Mapa dos Fluxos Críticos

Rastreamento ponta a ponta com marcação de onde cada elo quebra.

```
  Abrir caixa           OK   — 230_caixa_status_fechamento / trigger 206 impede venda sem caixa aberto
       |
       v
  Venda                 OK   — finalizar_venda_transacional_canonica_v4 (mig 272/274)
       |                       backend RECALCULA totais e rejeita divergência > 0,02  [bom]
       v
  Pagamento             OK   — split em vendas_pagamentos, valida soma <= líquido
       |
       v
  Baixa de estoque      OK   — decrementar_estoque_seguro (lock otimista + version)
       |                  !! DAT-01: quantidade não gravada no ledger
       |                  !! FLX-01: ledger sem FK
       v
  Financeiro            OK   — 24702_finalizar_venda_v4_contas_receber_automatico
       |
       v
  Fiscal            ✗ ROMPIDO — FLX-02: enfileiração default=false E cron desagendado
       |                        Nenhum documento fiscal é gerado. Elo morto nas duas pontas.
       v
  Auditoria             OK   — venda_eventos (229), auditoria de desconto (272)
                            !! FLX-03: token de desconto pode ser dispensado por env var
```

## Veredito do fluxo

A espinha transacional **Caixa → Venda → Pagamento → Estoque → Financeiro** está sólida: é atômica, tem lock, tem idempotência e o backend é autoritativo nos cálculos. Esse é um ponto forte real do projeto e deve ser dito.

A quebra é **no elo fiscal**, e é total — não é degradação, é ausência. Somado a DAT-01 (detector de divergência cego), o sistema hoje vende sem emitir e sem conseguir provar que o estoque bate.

---

## FLX-02

**Título:** Elo fiscal rompido nas duas pontas — enfileiração desligada por default e cron do worker desagendado

**Descrição do problema:**
Não existe caminho pelo qual uma venda gere documento fiscal hoje. Duas causas independentes e simultâneas:

1. **Ponta de entrada:** a flag `AUTO_ENQUEUE_FISCAL_ON_SALE` tem **default `false`** em `caixaSalesRuntimeConfig.ts:21`. Se a variável não estiver no `.env`, a venda finaliza sem enfileirar documento fiscal, silenciosamente.
2. **Ponta de saída:** o cron `fiscal-worker-every-minute` foi **desagendado** pela migration `285_desagenda_fiscal_worker_cron.sql`. Mesmo que algo fosse enfileirado, nada processaria a fila.

A própria migration 285 documenta o histórico: o Vault estava vazio desde sempre, o job rodou 1.440x/dia reportando `succeeded` sem jamais fazer uma requisição HTTP, e o monitoramento baseado em `cron.job_run_details` mostrava verde. Em 4 meses: 2 documentos fiscais contra 56 vendas.

**Impacto operacional:** Vendas concluem sem NFC-e/NF-e. Em operação real com faturamento isso é **exposição fiscal direta** — venda sem documento é infração tributária, não bug de software. Não é um risco de Go-Live: é um impeditivo regulatório de Go-Live.

**Evidência encontrada:**
- Default inseguro: `pdv-importados/lib/config/caixaSalesRuntimeConfig.ts:19-22` → `AUTO_ENQUEUE_FISCAL_ON_SALE: false`
- Consumo da flag: `pdv-importados/app/caixa/server/caixaFiscalEnqueueServer.ts:31` → `if (!getCaixaSalesRuntimeConfig().autoEnqueueFiscalOnSale) return`
- Passagem à RPC: `pdv-importados/app/caixa/server/caixaVendas.impl.ts:296` → `p_fiscal_auto_enqueue: runtimeCfg.autoEnqueueFiscalOnSale`
- Cron desligado: `backend/supabase/migrations/285_desagenda_fiscal_worker_cron.sql:1-30` (contexto integral, inclusive a admissão "nunca fez nada e reportou sucesso 1.440x/dia")
- Provider ausente: mesma migration, item 2 → `FISCAL_PROVIDER_TYPE ?? 'mock'`, MockProvider gera chave `NFE-MOCK-<venda>-<rand>`
- Bloqueio de formato: `backend/supabase/migrations/280_check_formato_chave_fiscal.sql` → constraint rejeita a chave mock, então religar sem provider real causaria falha em loop

**Comportamento atual:** Zero documentos fiscais gerados. Nenhum alerta — o desligamento é silencioso em ambas as pontas.

**Comportamento esperado:** Decisão executiva explícita e registrada (ADR-E), entre:
- **(a) Go-Live sem fiscal:** aceitável apenas se o piloto for com operação que não exige emissão. Exige *gate* explícito no app bloqueando venda quando fiscal está off, para não vender achando que emite.
- **(b) Go-Live com fiscal:** exige provider real configurado (Focus NFe), Vault populado, cron reagendado, flag em `true`, e teste de emissão ponta a ponta em homologação.

**Risco:** Passivo fiscal/tributário; multa; impossibilidade de operar com cliente que exige nota. Risco de governança: o monitoramento reportava verde sobre um módulo morto.

**Prioridade sugerida:** **P0**

**Arquivos prováveis para correção:**
- `pdv-importados/lib/config/caixaSalesRuntimeConfig.ts` (default e/ou *fail-closed*)
- `pdv-importados/app/caixa/server/caixaFiscalEnqueueServer.ts`
- nova migration para reagendar cron (se opção b)
- `.env.example` — documentar `AUTO_ENQUEUE_FISCAL_ON_SALE` e `FISCAL_PROVIDER_TYPE`
- **ADR-E no Vault** registrando a decisão
