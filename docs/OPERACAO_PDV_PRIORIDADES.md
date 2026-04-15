# Operação PDV — Prioridades Implementadas

Documento de execução prática para os itens priorizados:
1) E2E crítico caixa -> outbox -> nuvem -> gerente
2) Observabilidade mínima
3) Runbook de incidente
4) Hardening de concorrência/idempotência
5) Governança de ambiente/segredos
6) Métricas de performance no PDV local

---

## 1) E2E crítico (automação viável no estado atual)

### 1.1 Smoke de sync (outbox -> nuvem)

Comando:

```powershell
cd C:\Naturecode\fastproduct\pdv-local
npm run env:check
npm run smoke:sync-edge
```

Esse smoke valida:
- assinatura HMAC (`X-SYNC-*`) aceita pela Edge `sync-outbox`
- resposta JSON com `ok=true`
- `request_id` para correlação operacional

### 1.2 E2E painel gerente (nuvem -> gerente)

Comando:

```powershell
cd C:\Naturecode\fastproduct\pdv-importados
npm run env:check
npm run test:e2e
```

Cobertura atual:
- login e acesso a `/gerente`
- páginas críticas (estoque/produtos)

> Nota: o fluxo completo “registrar venda no desktop e confirmar no gerente” depende de ambiente com dados e usuário de teste estáveis. O smoke + E2E atual já reduz regressão silenciosa de integração.

---

## 2) Observabilidade mínima

Implementado:
- `sync-outbox` agora registra logs estruturados com:
  - `request_id`
  - `stage` (`sync_start`, `event_processed`, `event_failed`, `sync_end`, `sync_fatal`)
  - `correlation_id` (usa `venda_id` quando o evento é venda)
  - `duration_ms`, contadores de processados/falhas
- respostas da Edge incluem `request_id`
- PDV local mostra indicadores operacionais rápidos:
  - status de sync (ok/pendente/offline)
  - média local de latência (leitura->item, finalizar, sync)

---

## 3) Runbook de incidente (operação de loja)

### Sintoma: “venda não sobe”
1. Validar internet e horário do equipamento.
2. No PDV local, conferir indicador de sync (canto inferior) e faixa de outbox.
3. Executar “Repor na fila” se houver DLQ.
4. Rodar smoke:
   - `npm run smoke:sync-edge` em `pdv-local`.
5. Se falhar:
   - revisar `SYNC_ENDPOINT` e `SYNC_KEY`
   - validar secret `SYNC_KEY` na Edge
6. Escalar com:
   - `request_id` do smoke/erro
   - horário local
   - `DEVICE_FINGERPRINT` e print do resumo da fila

### Sintoma: “erro de permissão”
1. Validar login do usuário.
2. Revisar perfil (`OPERADOR/GERENTE/DONO`) e políticas RLS.
3. Repetir ação e registrar mensagem amigável exibida.

---

## 4) Hardening de concorrência e idempotência

Implementado no PDV local:
- bloqueio anti duplo clique em `Finalizar` (`isFinalizandoVenda`)
- bloqueio de concorrência de sync com `syncInFlightRef` (evita chamadas paralelas)
- foco automático no input principal para operação rápida e consistente

No backend `sync-outbox`:
- correlação por evento (`correlation_id`) facilita rastreio de duplicidade

---

## 5) Governança de ambiente e segredos

Scripts de validação adicionados:

- `pdv-importados`: `npm run env:check`
- `pdv-local`: `npm run env:check`

Regras:
- segredo nunca em repositório
- `.env.example` apenas placeholders
- divergência de env bloqueia execução de smoke/deploy

---

## 6) Métricas de performance no PDV local

Exibidas no cabeçalho do PDV:
- `Leitura->item` (ms)
- `Finalizar` (ms)
- `Sync` (ms)

Uso:
- acompanhar degradação por rede/estação
- comparar antes/depois de mudanças

