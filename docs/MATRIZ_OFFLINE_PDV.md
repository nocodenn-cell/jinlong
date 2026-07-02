# Matriz offline e degradação — PDV (web × desktop)

Anexo do [ADR-PDV-001](./adr/ADR-PDV-centro-de-gravidade.md) (§2 e §6). Entregável da fase **R0** do [roadmap](./ROADMAP.md).

**Regra de leitura:** cada célula responde "funciona **sem internet**?" com **sim / não / parcial / N/A** e a evidência de código. Onde algo não está implementado, está escrito explicitamente — sem "TODO vago".

**Contexto da decisão (ADR §1/§6):** o caixa **web é o PDV canónico e é online-first**; o **desktop está congelado** (código preservado, fora do caminho comercial). A coluna desktop documenta capacidade real do código, não oferta comercial.

| Capacidade | Web (`pdv-importados`) — offline? | Desktop (`pdv-local`, congelado) — offline? | Evidência |
|---|---|---|---|
| Scan / entrada de código | **Não.** Resolução de SKU é busca remota em server action; a fila serial local apenas ordena leituras | **Sim.** Catálogo em cache SQLite, lookup local | Web: `app/caixa/CaixaPageClient.tsx` + `app/caixa/scan-pipeline/webCaixaScanProcess.ts` · Desktop: `pdv-local/src/catalogoLookup.ts`, `usePdvLocalCatalogo.ts` |
| Preço no bip | **Não.** Preço autoritativo via RPC `calcular_preco_produto` antes da linha aparecer (ADR §4, modelo A) | **Sim.** Pricing local com teste golden de equivalência ao RPC | Web: `app/caixa/server/caixaPrecoAutoritativoServer.ts` · Desktop: `pdv-local/src/pricing/offlineRpcEquivalence.golden.test.ts` |
| Desconto de gerente | **Não.** Token emitido pela Edge `validar-gerente` (rate-limited) | **Não.** Também depende da Edge — hash local foi removido (bcrypt server-side, migration 067) | `backend/supabase/functions/validar-gerente/` · `pdv-local/README.md` ("A validação do desconto é feita pela Edge") |
| Finalizar venda | **Não.** RPC transacional `finalizar_venda_transacional_canonica_v4` | **Sim.** Persistência SQLite + outbox `VENDA_REGISTRADA`, sync posterior | Web: `app/caixa/server/caixaVendas.impl.ts` (`docs/venda-golden-flow.md`) · Desktop: `pdv-local/src/lib/outboxEventValidate.ts:12` |
| Abrir / fechar caixa | **Não.** RPCs (`fechar_caixa_atomico`, 207/227) | **Sim.** Eventos `CAIXA_ABERTO` / `CAIXA_FECHADO` na outbox | Migrations `207_fechar_caixa_atomico_rpc.sql`, `227_fechar_caixa_pdv_atomico.sql` · `outboxEventValidate.ts:13-14` |
| Sangria / suprimento | **Não.** RPC `registrar_movimentacao` + aprovação por token de gerente | **Parcial.** Evento `MOVIMENTO_CAIXA` existe na outbox; aprovação de gerente offline **não definida** (token é server-side) | Migrations `045`/`046` · `outboxEventValidate.ts:15` |
| Fiscal (NFC-e) | **Parcial por design (assíncrono).** Venda conclui sem fiscal; documento entra na fila e o `fiscal-worker` processa quando houver rede | **Parcial.** Enqueue opcional pós-sync (flag `AUTO_ENQUEUE_FISCAL_ON_SYNCED_SALE`) — nunca offline de fato | `backend/supabase/functions/fiscal-worker/` · migration `062_fiscal_enqueue_on_sale_rpc.sql` |
| TEF / PIX integrado | **Não implementado em nenhum runtime.** Forma de pagamento é registro manual (sem gateway/conciliação) | Idem | `app/caixa/caixaMetodoPagamento.ts` — sem integração de adquirente no repositório |
| Recibo / impressão | **Parcial.** Recibo em modal + impressão do navegador; **sem driver de impressora térmica** no repositório | **Não implementado** (sem módulo de impressão) | `app/caixa/CaixaReciboModal.tsx` |
| Painel gerente / relatórios | **Não.** 100% online (Supabase RLS em tempo real) | **N/A.** Desktop não tem painel gerencial | `app/admin/`, `app/gerente/` |
| Telemetria do bip | **Parcial.** Coleta local com sink persistido; ingestão exige rede (best-effort, não bloqueia venda) | **Não integrada** (pipeline de scan não é usado no desktop) | `app/caixa/scan-pipeline/persistedCaixaScanTelemetrySink.ts` + `/api/caixa/scan-telemetry` |

## Consequências operacionais (mensagem oficial)

1. **Sem internet, o caixa web não vende.** Essa é a política aceita (ADR §2/§6) — não prometer o contrário em material comercial ou de suporte.
2. **Fiscal nunca bloqueia venda** em nenhum runtime — é fila assíncrona com retentativa.
3. **O desktop não é a resposta de contingência do piloto** enquanto congelado. Se offline virar requisito de mercado, o caminho é a fase **R7** (descongelar com paridade: login de operador, contrato único, auto-update) — não uma ativação improvisada.

## Manutenção

Documento vivo com o ADR: qualquer mudança de capacidade nas linhas acima (ex.: cache de catálogo no browser, TEF, impressão térmica) exige atualizar esta matriz no mesmo PR.
