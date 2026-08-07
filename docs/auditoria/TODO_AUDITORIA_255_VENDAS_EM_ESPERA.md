/**
 * TODOs pós-auditoria migration 255 — NÃO bloqueiam os fluxos pedidos pelo cliente.
 * Registrar aqui; não implementar neste ciclo salvo se virarem requisito.
 *
 * - [ ] Apertar RLS SELECT de vendas_em_espera (hoje qualquer usuário da loja lê)
 * - [ ] Remover coluna desconto_gerente_token do persist (ou nunca SELECT)
 * - [ ] UNIQUE (operador_id, numero_local) WHERE status = EM_ESPERA
 * - [ ] Validar p_caixa_id pertence ao operador/loja
 * - [ ] Marcar CONVERTIDA após finalizar venda retomada
 * - [ ] Ledger/auditoria de park/resume/discard/consulta rápida (eventos explícitos)
 * - [ ] Testes SQL das RPCs vendas_em_espera (unitários mínimos de parse: caixaVendaEspera.test.ts)
 * - [x] E2E park → refresh → resume → F9 (e2e/caixa-venda-em-espera.spec.ts — exige migration 255 no ambiente)
 * - [ ] WITH CHECK na policy UPDATE de vendas_em_espera
 * - [ ] Histórico PDV: vendas.cliente_id (Fase 7) para coluna Cliente
 * - [ ] Histórico PDV: impressão de etiqueta no caixa
 * - [ ] Histórico PDV: emissão NF-e pelo operador
 * - [ ] Histórico PDV: vendas antigas sem venda_eventos → itens vazios no drill-down
 */
export {}
