# Checklist do Piloto — Loja do Cliente (25/08/2026)

Imprimir esta página. Marcar cada item com caneta. Se algo falhar, **parar e ligar para o
suporte** — não seguir para o próximo item nem forçar o operador a continuar.

Suporte: ver telefone em `CHECKLIST_IMPLANTACAO_CLIENTE.md`.

---

## Antes de sair para a loja (técnico/CTO)

- [ ] Build do sistema rodou sem erro numa rede normal (fora de qualquer ambiente restrito)
- [ ] Testado numa vez, do início ao fim, num ambiente de teste: login → abrir caixa → vender →
      pagar → fechar caixa → reabrir a página e conferir que a venda continua lá
- [ ] Domínio/endereço do site que a loja vai usar está confirmado e anotado abaixo:

  Endereço: `______________________________________________`

- [ ] Usuário do operador já criado (nome + e-mail real do operador, senha anotada em local seguro)
- [ ] Pelo menos 5 produtos cadastrados com código de barras, preço normal, preço de atacado e
      quantidade mínima de atacado
- [ ] Saldo inicial de caixa combinado com o cliente (valor: `R$ ________`)

---

## Na loja, com o operador (checklist presencial)

### 1. Login
- [ ] Acessar o endereço no navegador
- [ ] Página carrega em poucos segundos, sem tela em branco
- [ ] Login com e-mail/senha do operador funciona
- [ ] Cai na tela do PDV (não em erro, não em página em branco)

### 2. Abrir caixa
- [ ] Botão de abrir caixa está visível
- [ ] Informa o valor inicial combinado
- [ ] Confirma — caixa muda para "aberto"

### 3. Primeira venda — preço normal
- [ ] Busca um produto (digitando ou com leitor de código de barras, se disponível)
- [ ] Produto aparece no carrinho com o preço **normal** (varejo)
- [ ] Consegue mudar a quantidade
- [ ] Consegue remover o item e adicionar de novo

### 4. Segunda venda — preço de atacado
- [ ] Escolhe um produto com quantidade mínima de atacado configurada
- [ ] Adiciona a quantidade **igual ou maior** que o mínimo
- [ ] Confirma visualmente que o preço aplicado foi o de **atacado**, não o normal
- [ ] Adiciona quantidade **abaixo** do mínimo num teste separado e confirma que o preço volta a
      ser o **normal**

### 5. Pagamento
- [ ] Testar pagamento em **Dinheiro** — troco calculado corretamente
- [ ] Testar pagamento em **PIX** (se disponível no ambiente da loja)
- [ ] Testar pagamento em **Cartão de Débito**
- [ ] Testar pagamento em **Cartão de Crédito**
- [ ] Em cada teste: mensagem de "venda finalizada" aparece, carrinho limpa sozinho

### 6. Comprovante
- [ ] Comprovante aparece na tela (ou imprime, se houver impressora conectada)
- [ ] Valores no comprovante batem com o que foi vendido

### 7. Cancelamento (só se o técnico confirmar que está liberado para este piloto)
- [ ] Cancela uma venda de teste
- [ ] Comprovante do cancelamento mostra o valor certo (o que realmente foi devolvido, não o
      valor original se houve devolução parcial antes)

### 8. Fechar caixa
- [ ] Menu de operações → Fechar caixa
- [ ] Sistema mostra o resumo do dia (vendas, valor esperado)
- [ ] Confirma o fechamento
- [ ] Sistema desloga ou volta para a tela de login

### 9. Depois de fechar — reabrir e conferir
- [ ] Recarregar a página (F5) ou fechar e abrir o navegador de novo
- [ ] Fazer login de novo
- [ ] As vendas feitas continuam aparecendo no histórico/relatório do dia
- [ ] O caixa continua marcado como fechado (não "esqueceu" o fechamento)

---

## Se algo der errado

1. **Não insistir tentando de novo várias vezes** — anotar exatamente o que aconteceu (tela,
   mensagem de erro, o que foi clicado antes) e ligar para o suporte.
2. Se a segunda tentativa do mesmo passo também falhar, **parar o teste** e seguir o plano de
   rollback (ver `PILOTO_CLIENTE_2026-08-24.md`, seção 18, ou `ROLLBACK_HOTLINE_PLAYBOOK.md`).
3. Nunca deixar o operador da loja trabalhando sozinho com o sistema instável.

---

## Assinatura de encerramento do teste presencial

Técnico responsável: `___________________________`  Data/hora: `______________`

Resultado geral do teste: ☐ Sucesso completo ☐ Sucesso com ressalvas ☐ Falhou — reagendar

Observações:

`_______________________________________________________________________`

`_______________________________________________________________________`
