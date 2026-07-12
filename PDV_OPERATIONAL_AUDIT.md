# PDV_OPERATIONAL_AUDIT — Auditoria Operacional do Caixa

> Fase 1 da missão Go-Live Jinlong. Data: 2026-07-12.
> Objetivo: garantir que o operador consegue vender do login à baixa de estoque
> sem falhas. Auditoria estática de código (rotas, actions, RPCs). Não altera
> nenhum fluxo de venda.

## Legenda de status

- ✅ **funcionando** — caminho implementado e conectado ao backend
- ⚠️ **risco / atenção** — funciona, mas há dependência frágil ou condição de erro relevante
- ❌ **quebrado** — caminho ausente ou não conectado

## Fluxo principal auditado

```
Login → Abrir Caixa → Buscar produto → Adicionar item → Aplicar desconto
→ Selecionar cliente → Pagamento → Finalizar venda → Baixa estoque → Histórico
```

| Etapa | Status | Tela / Componente | Action | RPC / Backend | Observações |
|---|---|---|---|---|---|
| **Login** | ✅ | `app/login/LoginForm.tsx` | Supabase Auth (`signInWithPassword`) | `auth.users` + `usuarios` | `middleware.ts` protege `/caixa`, `/gerente`, `/admin`. Perfil lido de `usuarios.perfil` (OPERADOR/GERENTE/DONO). |
| **Guarda de rota** | ✅ | `middleware.ts` | `middlewareAdminDecision` | sessão normalizada | Sessão inválida → redirect `/login`. `clearStaleSessionIfNeeded` trata sessão expirada. |
| **Abrir caixa** | ✅ | `CaixaAbrirTurnoModal` → `CaixaPageClient` | `abrirCaixaOperador(valorInicial)` | `INSERT` em `caixas` (`caixaSessaoOperador.impl.ts`) | Status verificado por `obter_status_caixa_operador`. |
| **Buscar produto** | ✅ | `CaixaSearchBar` + `scan-pipeline` | `buscarProdutoComPrecoCaixa` / `buscarProdutoParaCaixa` | busca de catálogo + `calcular_preco_produto` | Pipeline de scan com telemetria (`/api/caixa/scan-telemetry`). |
| **Adicionar item** | ✅ | `CaixaCartList` + `carrinhoStore` | client-side (store) | preço autoritativo em `caixaPrecoAutoritativoServer` | Preço recalculado no servidor na finalização (não confia no cliente). |
| **Aplicar desconto** | ✅ | `CaixaGerenteModal` | `validarGerenteDesconto` | `validar_gerente` (rate-limited, bcrypt) | Token de gerente com expiração e lock por tentativas. Desconto validado no servidor. |
| **Selecionar cliente** | ✅ | `CaixaSelecionarClienteModal` | `buscarClientesPaginadosAction` | tabela `clientes` (view gerente) | Opcional — venda sem cliente é permitida ("sem cliente"). |
| **Pagamento** | ✅ | `CaixaPdvMetodoPagamentoSelector` / `CaixaPdvOperadorTabs` | client-side (parcelas) | — | Suporta **pagamento parcial / múltiplas formas** (Fase 5a já em produção). Diferença calculada em tempo real. |
| **Finalizar venda** | ✅ | `CaixaPdvCartSaleBar` / `CaixaFooter` | `finalizarVendaCaixa` → `caixaVendas.impl.ts` | **`finalizar_venda_transacional_canonica_v4`** | RPC canônica transacional (**intocada**). Validação em `finalizarVendaValidation.ts`. |
| **Baixa de estoque** | ✅ | — (dentro da RPC) | — | dentro de `finalizar_venda_…_v4` (transacional) | Estoque decrementado atomicamente na mesma transação da venda. |
| **Comissão** | ✅ | — (trigger) | — | `trg_registrar_comissao` / `fn_registrar_comissao` | Registrada por trigger (**intocada**). |
| **Fiscal (NF-e/NFC-e)** | ⚠️ | — | `enfileirarDocumentoFiscalPosVenda` | `fiscal_enfileirar_documento_venda` | Enfileiramento **gated** por `autoEnqueueFiscalOnSale`. Doc default `NFC_E_STUB` (stub). Emissão fiscal real não está ativa — ver `HISTORICO_TOOLS_AUDIT.md`. |
| **Recibo / cupom** | ✅ | `CaixaReciboModal` + `caixaHistoricoRecibo.ts` | — | dados da venda | Recibo gerado pós-venda e reimprimível do histórico. |
| **Histórico** | ✅ | `CaixaHistoricoSheet` | `listarHistoricoOperadorCaixa` / `obterDetalheHistoricoVendaCaixa` | consultas `vendas`/itens | Lista + detalhe + ferramentas — ver Fase 3. |
| **Fechar caixa** | ✅ | `CaixaGerenteModal` / turno | `fecharCaixaOperador` | `fechar_caixa_atomico` + `calcular_valor_sistema_dinheiro_caixa` | Reconciliação com pagamento parcial (Fase 6 em produção). |
| **Sangria / suprimento** | ✅ | `CaixaMovimentacaoModal` | `registrarMovimentacao` / `autorizarMovimentacaoGerente` | `registrar_movimentacao`, `aprovar_movimentacao`, `obter_limite_sangria_sem_gerente` | Movimentações acima do limite exigem gerente. |
| **Venda em espera** | ✅ | `CaixaEmAbertoList` | `colocarVendaEmEsperaCaixa` / `retomar…` / `descartar…` | `colocar/retomar/descartar_venda_em_espera` | Ver `TECH_DEBT_VENDA_ESPERA_CLIENTE.md` (dívida técnica conhecida, não bloqueante). |

## Itens quebrados (❌)

Nenhum caminho do fluxo principal de venda foi encontrado quebrado. O operador
consegue percorrer login → venda → baixa de estoque → histórico.

## Riscos / atenção (⚠️)

| # | Risco | Impacto | Prioridade |
|---|---|---|---|
| R1 | **Emissão fiscal (NF-e/NFC-e) opera em modo stub** (`NFC_E_STUB`) e o enqueue é gated. Não há emissão fiscal real. | Alto para conformidade fiscal, **mas não bloqueia a venda**. A loja precisa saber que não emite documento fiscal válido ainda. | **ALTA** (decisão de negócio antes do go-live) |
| R2 | **Cadastro de funcionário não tem UI** (ver `FUNCIONARIOS_CADASTRO_GAP.md`). Criar operador exige acesso ao Supabase. | Gerente não cria operador sozinho amanhã. | **ALTA** |
| R3 | Botões "Imprimir etiqueta" e "Gerar NF-e" no histórico estão **desabilitados** (stubs). | Expectativa frustrada, mas não quebra nada. | MÉDIA |
| R4 | Dívida técnica em venda-em-espera com cliente (`TECH_DEBT_VENDA_ESPERA_CLIENTE.md`). | Edge case, documentado. | BAIXA |

## Conclusão da Fase 1

O **núcleo transacional de venda está funcional e íntegro**: login, abertura de
caixa, busca, carrinho, desconto com gerente, pagamento (inclusive parcial),
finalização atômica com baixa de estoque e comissão por trigger, recibo e
histórico. Os pontos que exigem decisão antes do go-live são **fiscais (R1)** e
**operacionais de gestão de usuários (R2)** — ambos documentados em relatórios
próprios. Nenhum deles impede o operador de registrar vendas.
