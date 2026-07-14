# Checklist operacional — demonstração Jinlong (congelado)

**Status:** DEMO CANDIDATE · baseline `main` `6636aab6` · produção Ready  
**Escopo:** apenas Web `/caixa` + catálogo/estoque admin. Sem PRs históricas, sem features novas.

## Pré-requisitos (antes do cliente)

- [x] Vercel Production: `SUPABASE_SERVICE_ROLE_KEY` presente (estoque inicial no cadastro chama RPC via service_role)
- [ ] Produto DEMO ativo com código de barras conhecido, estoque > 0, preço varejo preenchido
- [ ] Mesmo produto com preço atacado + faixa (`precos_atacado`) ou gatilho ≥ mínimo do sistema (padrao jinlong = **6**)
- [ ] Cliente cadastrado em `/admin/clientes` (obrigatório para pagamento parcial)
- [ ] Operador (ou gerente) com sessão válida e loja correta
- [ ] Navegador em produção (domínio Jinlong / deploy `6636aab6`)
- [ ] Local (se mostrar): sync fresco do catálogo após login — **não** demo estoque insuficiente no Local

## Roteiro (ordem)

| # | Passo | Esperado | Conferir |
|---|--------|----------|----------|
| 1 | Produto existente | Nome/código/preço no catálogo | `/admin/catalogo` |
| 2 | Estoque / kardex (se cadastro novo) | Saldo = inicial; movimento ENTRADA | `/admin/estoque` · sem toast de erro |
| 3 | Cliente cadastrado | Cliente da loja selecionável | `/admin/clientes` |
| 4 | Operador logado | Acesso a `/caixa` | Header logado |
| 5 | Abertura caixa | Status aberto | Valor inicial se pedido |
| 6 | Venda varejo | Qty 1 · preço varejo · DINHEIRO/PIX · recibo · estoque −1 | Recibo modal · saldo |
| 7 | Venda atacado | Mesmo SKU · qty ≥ faixa/padrao · preço ATACADO | Comparar unitário |
| 8 | Pagamento parcial | Underpay + cliente · CR gerado · venda OK | `/admin/financeiro` aba receber |
| 9 | Fechamento caixa | Fecha sem erro | Não apontar `caixas.saldo_atual` |

## Fora do roteiro (congelado / pós-go-live)

- Venda em espera + crédito (`cliente_id`)
- BA-012 estoque insuficiente no PDV Local
- BA-002 prova via coluna `saldo_atual`
- Merge de PRs `loop/*` históricas (#173–#179, #178 local)
- UX cosmética / módulos novos

## Evidência técnica (freeze)

- Prod: Vercel `pdv-importados` production Ready · sha `6636aab6`
- DB jinlong: `v4` overload=1 · `calcular_preco_produto` · `ajustar_estoque_manual(...p_ator_id)` · min atacado padrao=6
- Testes críticos congelamento: preço canônico 9 · golden Local 9 · parcial/erro caixa 9 · extras validação 22 — todos PASS · **NO_P0**
