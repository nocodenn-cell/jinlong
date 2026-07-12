# BACKEND_FRONTEND_CONNECTION_AUDIT — Tela → Action → RPC → Banco

> Fase 5 da missão Go-Live Jinlong. Data: 2026-07-12.
> Mapeamento estático das conexões entre frontend (telas/actions) e backend
> (RPCs/tabelas Supabase). Foco: PDV e Funcionários. Nenhuma alteração de código.

## Legenda

- ✅ conectado e coerente · ⚠️ conectado com ressalva · ❌ desconectado / ausente

---

## PDV — Produtos / Preços / Estoque / Vendas / Pagamentos / Histórico

| Domínio | Tela / Componente | Server Action | RPC / Backend | Tabela(s) | Status |
|---|---|---|---|---|---|
| **Produtos (busca)** | `CaixaSearchBar`, `scan-pipeline` | `buscarProdutoParaCaixa`, `buscarProdutoComPrecoCaixa`, `consultarProdutoRapidoCaixa` | busca de catálogo | `produtos`, `catalogo` | ✅ |
| **Preços** | carrinho / busca | `calcularPrecoProdutoCaixa`, `carregarRegrasPrecoCaixa` | `calcular_preco_produto` | `produtos`, regras de preço, `pdv_config` | ✅ Preço **reautorizado no servidor** na finalização (`caixaPrecoAutoritativoServer`). |
| **Cotação USD/BRL** | context / preço | `obterCotacaoUsdBrl` | serviço de cotação | config | ✅ |
| **Estoque (baixa)** | — (dentro da venda) | `finalizarVendaCaixa` | dentro de `finalizar_venda_transacional_canonica_v4` | `estoque`, `estoque_baixas` | ✅ atômico na transação da venda |
| **Vendas (finalizar)** | `CaixaPdvCartSaleBar` / `CaixaFooter` | `finalizarVendaCaixa` → `caixaVendas.impl.ts` | **`finalizar_venda_transacional_canonica_v4`** | `vendas`, itens, `estoque` | ✅ RPC canônica (intocada) |
| **Vendas (cancelar)** | histórico / gerente | `cancelarVenda` | `cancelar_venda_transacional` | `vendas` | ✅ |
| **Pagamentos (parcial)** | `CaixaPdvMetodoPagamentoSelector`, `CaixaPdvOperadorTabs` | via `finalizarVendaCaixa` (parcelas) | dentro de `…canonica_v4` | `venda_pagamentos` | ✅ pagamento parcial/múltiplo (Fase 5a) |
| **Contas a receber** | reconciliação | `registrarLiquidacaoReceber` (gerente) | `registrar_liquidacao_receber` | `contas_receber` | ✅ automação Fase 5b (UNIQUE venda_id) |
| **Histórico (lista)** | `CaixaHistoricoSheet` | `listarHistoricoOperadorCaixa` | consulta | `vendas` | ✅ |
| **Histórico (detalhe)** | `CaixaHistoricoSheet` | `obterDetalheHistoricoVendaCaixa` | consulta | `vendas`, itens, `venda_pagamentos` | ✅ |
| **Recibo / cupom** | `CaixaReciboModal` | `obterDetalheHistoricoVendaCaixa` | consulta | `vendas` | ✅ reimpressão do histórico |
| **Etiqueta (do histórico)** | `HistoricoFerramentas` | — | — | — | ❌ stub desabilitado (existe rota de etiqueta de **produto** no gerente) |
| **NF-e (do histórico)** | `HistoricoFerramentas` | — (stub) | `fiscal_enfileirar_documento_venda` existe, tipo `NFC_E_STUB` | `fiscal_*` outbox | ⚠️ pipeline existe, **sem emissor real** |
| **Abrir/Fechar caixa** | `CaixaAbrirTurnoModal` | `abrirCaixaOperador`, `fecharCaixaOperador` | insert `caixas`, `fechar_caixa_atomico`, `calcular_valor_sistema_dinheiro_caixa` | `caixas`, movimentações | ✅ |
| **Sangria/suprimento** | `CaixaMovimentacaoModal` | `registrarMovimentacao`, `autorizarMovimentacaoGerente`, `cancelar/estornarMovimentacao` | `registrar_movimentacao`, `aprovar_movimentacao`, `cancelar_movimentacao`, `estornar_movimentacao`, `obter_limite_sangria_sem_gerente` | movimentações caixa | ✅ |
| **Venda em espera** | `CaixaEmAbertoList` | `colocar/listar/retomar/descartarVendaEmEsperaCaixa` | `colocar/listar/retomar/descartar_venda_em_espera` | `vendas_em_espera` | ✅ (dívida técnica documentada) |
| **Desconto gerente** | `CaixaGerenteModal` | `validarGerenteDesconto` | `validar_gerente` (bcrypt, rate-limit) | `pdv_config`, tokens | ✅ |
| **Config do caixa** | `CaixaPageClient` | `obterConfiguracoesParaCaixaWeb` | `pdv_config_para_caixa_web`, `pdv_config_flags_visuais` | `pdv_config` | ✅ |

## Funcionários — Cadastro / Permissões / Comissão

| Domínio | Tela / Componente | Server Action | RPC / Backend | Tabela(s) | Status |
|---|---|---|---|---|---|
| **Cadastro de funcionário** | — | — | — | `usuarios` (existe) | ❌ **sem UI** — ver `FUNCIONARIOS_CADASTRO_GAP.md` (R2) |
| **Login** | `app/login/LoginForm.tsx` | Supabase `signInWithPassword` | Supabase Auth | `auth.users` + `usuarios` | ✅ (`signup` desabilitado) |
| **Permissões (perfil)** | `middleware.ts`, `caixa/page.tsx` | leitura `usuarios.perfil` | RLS por perfil | `usuarios` | ✅ modelo pronto; atribuição só via banco (falta UI) |
| **Comissão (registro)** | — (automático) | — | `trg_registrar_comissao` / `fn_registrar_comissao` | `comissoes` | ✅ trigger (intocado) |
| **Comissão (relatório)** | `app/admin/comissoes`, `app/gerente/comissoes` | actions de relatório | `resumo_comissoes_por_operador`, `detalhe_comissoes_operador`, `marcar_comissoes_pagas` | `comissoes` | ✅ |

## Achados

1. **PDV totalmente conectado** para o fluxo transacional (produto → preço →
   estoque → venda → pagamento → histórico → recibo). Preço e desconto são
   reautorizados no servidor — não há confiança cega no cliente.
2. **Duas pontas soltas no histórico** (etiqueta, NF-e) são **stubs desabilitados**
   — desconexão intencional, sem erro em runtime.
3. **Emissão fiscal (⚠️):** RPC de enfileiramento existe, mas o tipo default é
   `NFC_E_STUB` — não há emissor fiscal real conectado (R1).
4. **Cadastro de funcionário (❌):** a única desconexão real Tela→Backend. O
   backend (`usuarios`, RLS por perfil, comissão por trigger) está pronto; falta a
   camada de UI/action de criação (R2).

## Conclusão da Fase 5

O acoplamento frontend↔backend do **núcleo de venda é sólido e íntegro**. As
lacunas são periféricas ao ato de vender: **fiscal (R1)** e **gestão de usuários
(R2)** — ambas já documentadas e dependentes de decisão/autorização.
