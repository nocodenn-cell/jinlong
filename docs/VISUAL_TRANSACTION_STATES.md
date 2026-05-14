# Estados visuais da transação de bip (caixa web)

Este documento alinha **o que o operador vê** com **pipeline**, **carrinho** e **telemetria**, para evitar UX divergente entre PRs. Complementa `docs/RECONNECT_REPLAY_POLICY.md` (ACK visual, replay) e `docs/CONTRATO_PIPELINE_BIP.md` (motor).

---

## 1. Camadas de verdade

| Camada | O que representa |
|--------|------------------|
| **Toast / banner** (`setCaixaMensagem`) | Feedback imediato ao utilizador (pode ser provisório até reconciliação). |
| **Pipeline** (`ScanState`, snapshot `subscribe`) | Estado da **fila de leituras** (não confundir com estado fiscal ou pagamento). |
| **Carrinho** (Zustand) | Itens e preços do **cupom atual** (`cupomSessionId` ativo). |
| **Telemetria** | Observabilidade; **não** é fonte de verdade para UX síncrona. |

---

## 2. Estados visuais (contrato de produto)

Termo | Significado | Onde aparece | Notas |
|-------|-------------|--------------|--------|
| **Provisório** | Feedback ou linha ainda sujeita a RPC/regras (ex.: toast “adicionado” antes de preço remoto aplicado, se um dia houver UI explícita). | Hoje: principalmente **carrinho** + RPC `aplicarPrecoRpcParaLinha` em curso. | Não existe spinner dedicado no bip; evolução futura documenta-se aqui. |
| **Confirmado (ACK visual)** | Operador viu resultado inequívoco da leitura **neste** cupom (sucesso ou aviso pós-add). | Toast/banner + evento `scan_to_visual_ack_ms`. | Ver definição em `RECONNECT_REPLAY_POLICY.md` §2. |
| **Reconciliado** | Preço/regras alinhados com servidor para a linha (quando aplicável). | Após `aplicarPrecoRpcParaLinha` sem `stale_cupom`/`aborted`. | Falha aqui não apaga ACK visual já mostrado; política de correção é negócio (fora deste doc). |
| **Falhado** | Leitura não concluiu com sucesso (`failed`, `not_found`, `network`, …). | Toast de erro + `scan_failed` em telemetria. | Sem mutação de carrinho em sucesso. |
| **Cancelado** | Leitura retirada da fila ou abortada (`cancelled` / `aborted`); sem ACK de sucesso. | Pipeline + ausência de toast de sucesso. | `stale_cupom` **sem toast** (evita fantasma). |

---

## 3. Regras para novos estados ou UI

Antes de introduzir um novo “modo” visual ou de pipeline, o PR deve responder:

1. **Impacto operacional** — o que o caixa faz se falhar a meio?  
2. **Observabilidade** — que evento `HumanTelemetryPayload` reflete o estado?  
3. **Replay / reconnect** — o que acontece após refresh ou novo cupom? (`RECONNECT_REPLAY_POLICY.md`)  
4. **UX** — provisório vs confirmado está explícito para o operador?  
5. **Persistência** — precisa de coluna ou só `payload` na telemetria?

---

## 4. Cenários cobertos por testes automatizados

| Cenário | Onde |
|---------|------|
| Burst FIFO, `queue_full`, flush + novo cupom, double submit, reconnect proxy | `shared-core/src/pdv/scan-pipeline-golden.spec.ts` |
| Invariantes (shutdown sem órfão, término único na telemetria) | `shared-core/src/pdv/scan-pipeline-invariants.spec.ts` |
| `stale_cupom` sem busca; abort cooperativo na busca | `pdv-importados/app/caixa/scan-pipeline/webCaixaScanProcess.test.ts` |
| Helper `raceWithScanAbort` | `pdv-importados/app/caixa/scan-pipeline/webCaixaScanAbort.test.ts` |

**Pendentes (Playwright / futuro):** `visibilitychange` / suspend de aba, double Enter + scanner físico no mesmo tick, reconnect real de rede.

---

## Changelog

| Data | Alteração |
|------|-----------|
| (inicial) | Estados visuais, camadas, regras para novos estados, índice de testes. |
