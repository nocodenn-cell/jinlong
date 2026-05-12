# Contrato — handlers async do pipeline de bip (cooperação com `AbortSignal`)

Documento **obrigatório** para qualquer adapter que implemente `ScanPipelineHandler`.  
Complementa [`SCAN_PIPELINE_STATE_MACHINE.md`](./SCAN_PIPELINE_STATE_MACHINE.md) e [`RECONNECT_REPLAY_POLICY.md`](./RECONNECT_REPLAY_POLICY.md).

---

## 1. Regra de ouro

O runtime cancela trabalho em curso com **`AbortSignal`**. Isso só funciona se o handler **cooperar**.

Se o handler ignorar o sinal (ex.: `await rpcLongo()` sem observar `signal.aborted`), o runner **bloqueia** — o PDV parece “travado” mesmo com `shutdown` / `flush` corretos.

---

## 2. Checklist técnico (cada operação longa)

- [ ] Aceitar `AbortSignal` no contexto (`ctx.signal`) e **ligá-lo** a qualquer I/O assíncrono que suporte cancelamento.
- [ ] Em cadeias `await`, usar **`Promise.race`** com o abort (ou `AbortController` nativo da API) para não ficar preso após `abort()`.
- [ ] **Verificar `signal.aborted`** (ou o resultado do race) **após** cada `await` que possa demorar (rede, RPC, timeouts artificiais).
- [ ] **Evitar side-effects tardios** depois de `aborted` (não atualizar carrinho, não emitir toast de sucesso, não aplicar preço a cupom errado).

---

## 3. Anti-padrões

| Anti-padrão | Risco |
|-------------|--------|
| `await buscar()` sem abort | Flush / novo cupom / teardown não destrava |
| Toast de sucesso antes de confirmar `!signal.aborted` | UX “fantasma” |
| Retry implícito sem política | Drift com `RECONNECT_REPLAY_POLICY.md` |

---

## 4. Onde isto aparece no código e nos testes

- **Adapter web:** `pdv-importados/app/caixa/scan-pipeline/webCaixaScanAbort.ts` (`raceWithScanAbort`) + `webCaixaScanProcess.ts` — server action de catálogo, `getSession` e RPC de preço correm em `Promise.race` com o `AbortSignal` do pipeline.
- `shared-core/src/pdv/scan-pipeline-golden.spec.ts` — handlers lentos do motor em teste.
- `shared-core/src/pdv/scan-pipeline-invariants.spec.ts` — shutdown imediato exige handler cooperativo.
- `pdv-importados/app/caixa/scan-pipeline/webCaixaScanProcess.test.ts` — `stale_cupom` e abort cooperativo na busca.
- `pdv-importados/app/caixa/scan-pipeline/webCaixaScanAbort.test.ts` — helper `raceWithScanAbort`.

---

## Changelog

| Data | Alteração |
|------|-----------|
| (inicial) | Checklist obrigatório + anti-padrões + ligação a testes. |
| 2026-05 | Referência ao adapter web (`webCaixaScanAbort` + `raceWithScanAbort` em busca/sessão/pricing). |
