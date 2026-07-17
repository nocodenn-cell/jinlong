/**
 * TODOs pós-auditoria migration 255 — NÃO bloqueiam os fluxos pedidos pelo cliente.
 * Registrar aqui; não implementar neste ciclo salvo se virarem requisito.
 *
 * - [x] Apertar RLS SELECT de vendas_em_espera (migration 270 — Fase 5, Entrega 3)
 * - [ ] Remover coluna desconto_gerente_token do persist (ou nunca SELECT)
 * - [x] UNIQUE (operador_id, numero_local) WHERE status = EM_ESPERA (migration 270)
 * - [x] Validar p_caixa_id pertence ao operador/loja (migration 270)
 * - [x] Marcar CONVERTIDA após finalizar venda retomada (migration 270, marcar_venda_em_espera_convertida)
 * - [x] Ledger/auditoria de park/resume/discard (migration 271, vendas_em_espera_eventos) — consulta rápida ainda sem ledger próprio
 * - [ ] Testes SQL das RPCs vendas_em_espera (unitários mínimos de parse: caixaVendaEspera.test.ts)
 * - [x] E2E park → refresh → resume → F9 (e2e/caixa-venda-em-espera.spec.ts — exige migration 255 no ambiente)
 * - [x] WITH CHECK na policy UPDATE de vendas_em_espera (migration 270)
 * - [x] Histórico PDV: vendas.cliente_id para coluna Cliente (Fase 5, Entrega 9 — migration 276 fecha drift + join em caixaVendaEspera.impl.ts; não era "Fase 7", já é Fase 5b em produção)
 * - [x] Histórico PDV: impressão de etiqueta no caixa (Fase 5, Entrega 9 — reusa lib/etiqueta/gerarPdf.ts)
 * - [ ] Histórico PDV: emissão NF-e pelo operador — bloqueado pela Fase 6 (Fiscal), aguardando credenciais Focus NFe; reimpressão de NF-e já emitida agora mostra numero_nf quando presente
 * - [ ] Histórico PDV: vendas antigas sem venda_eventos → itens vazios no drill-down
 */
export {}
