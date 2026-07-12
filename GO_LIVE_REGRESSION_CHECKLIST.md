# GO_LIVE_REGRESSION_CHECKLIST — Jinlong ERP/PDV

> Fase 7 da missão Go-Live. Data: 2026-07-12.
> Checklist manual para o gerente/QA validar antes de liberar a loja. Marque cada
> item ao testar em ambiente de produção com credenciais reais.

## Como usar

Percorra na ordem. `[ ]` = pendente, `[x]` = validado, `[!]` = falhou (anote).
Os itens marcados **⚠️** têm ressalva conhecida (ver relatórios das Fases 1–5).

---

### 1. Login e acesso
- [ ] Login do gerente com e-mail/senha entra em `/gerente`
- [ ] Login do operador entra em `/caixa`
- [ ] Sessão expirada redireciona para `/login?reason=sessao_expirada`
- [ ] Usuário sem sessão é bloqueado em `/caixa`, `/gerente`, `/admin`

### 2. Abrir caixa
- [ ] Abrir turno com valor inicial cria o caixa
- [ ] Status "caixa aberto" aparece no topo
- [ ] Reabrir a página mantém o caixa aberto (persistência)

### 3. Produto
- [ ] Buscar por nome retorna produto
- [ ] Buscar/escanear por código de barras adiciona item
- [ ] Preço exibido confere com o catálogo
- [ ] Produto sem estoque é sinalizado corretamente

### 4. Venda (carrinho + desconto + cliente)
- [ ] Adicionar múltiplos itens soma corretamente
- [ ] Alterar quantidade recalcula total
- [ ] Aplicar desconto exige validação do gerente (senha)
- [ ] Desconto acima do limite é bloqueado
- [ ] Selecionar cliente associa à venda
- [ ] Venda **sem cliente** ("sem cliente") é permitida

### 5. Pagamento
- [ ] Pagamento único (dinheiro) finaliza
- [ ] Pagamento em cartão finaliza
- [ ] **Pagamento parcial / múltiplas formas** soma e fecha a diferença
- [ ] Troco/diferença calculado corretamente

### 6. Finalizar venda + estoque
- [ ] Finalizar gera a venda (número sequencial)
- [ ] **Estoque é decrementado** após a venda
- [ ] Comissão do operador é registrada (verificar em `/gerente/comissoes`)
- [ ] Venda aparece no histórico imediatamente

### 7. Histórico
- [ ] Abrir histórico lista as vendas do operador
- [ ] Selecionar venda mostra o detalhe (itens + pagamentos)
- [ ] Lista e detalhe corretos **após refresh** da página

### 8. Impressão / Exportação
- [ ] **Imprimir cupom** do histórico abre o recibo da venda correta
- [ ] Recibo funciona após refresh
- [ ] **Exportar CSV (detalhe)** baixa `venda-<n>.csv` e abre no Excel com acentos corretos
- [ ] **Exportar CSV (lista)** baixa `historico-operador.csv` com dados corretos
- [ ] ⚠️ **Imprimir etiqueta** — botão desabilitado (stub, esperado)
- [ ] ⚠️ **Gerar NF-e** — botão desabilitado (stub; emissão fiscal não ativa — R1)

### 9. Funcionário
- [ ] Login de um operador **já existente** acessa o PDV
- [ ] ⚠️ **Cadastro de novo funcionário** — sem UI hoje; criar via Supabase Studio (R2, ver `FUNCIONARIOS_CADASTRO_GAP.md`)
- [ ] Permissão respeitada: operador não acessa `/gerente`/`/admin`

### 10. Estoque (gestão)
- [ ] Ajuste manual de estoque reflete no saldo
- [ ] Recebimento de mercadoria atualiza estoque
- [ ] Transferência entre locais funciona
- [ ] Saldo pós-venda confere com o esperado

### 11. Financeiro / Caixa
- [ ] Sangria acima do limite exige aprovação do gerente
- [ ] Suprimento registrado corretamente
- [ ] **Fechar caixa** reconcilia valores (inclusive com pagamento parcial)
- [ ] Contas a receber geradas para vendas a prazo (Fase 5b)

### 12. Regressão de segurança (não pode ter mudado)
- [ ] `finalizar_venda_transacional_canonica_v4` intocada
- [ ] `fn_registrar_comissao` / `trg_registrar_comissao` intocados
- [ ] Estrutura de `vendas` inalterada
- [ ] Migrations aprovadas inalteradas
- [ ] Banner de lead time **não aparece mais** no caixa (Fase 2)

---

## Itens com ressalva conhecida (não bloqueiam a venda)

| Ref | Item | Situação |
|---|---|---|
| R1 | Emissão fiscal NF-e/NFC-e | Pipeline em modo stub — decisão de negócio |
| R2 | Cadastro de funcionário | Sem UI — usar Supabase Studio no dia 1 |
| R3 | Etiqueta / NF-e no histórico | Stubs desabilitados |
| R4 | Venda em espera com cliente | Dívida técnica documentada |

## Assinatura de liberação

- [ ] Todos os itens **sem ⚠️** validados
- [ ] Ressalvas R1 e R2 comunicadas ao dono da loja
- Responsável: ______________________  Data: ____/____/____
