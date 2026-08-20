# Checklist do Primeiro Dia Operacional (Gerente)

**Responsável:** Gerente da loja / supervisor  
**Horário:** Abertura até fechamento  
**Objetivo:** Validar que a loja conseguiu fazer vendas o dia inteiro sem suporte técnico  

---

## Abertura (1ª venda)

### 9:00 — Login e abertura de caixa

- [ ] Operador faz login com sucesso
- [ ] Tela do PDV carrega e não está em branco
- [ ] Clica "Abrir caixa"
- [ ] Modal de saldo inicial aparece
- [ ] Insere saldo inicial (ex.: R$ 100)
- [ ] Clica "Confirmar" → Caixa abre
- [ ] Relógio do turno aparece no topo

**Se falhar:** Ligue para [SUPORTE] imediatamente. Não continue.

---

## Operação (9:00–18:00)

### A cada venda, validar:

- [ ] **Código/nome:** Operador escaneia ou digita → produto aparece em < 2s
- [ ] **Quantidade:** Teclado numérico funciona; enter adiciona
- [ ] **Preço:** Valor visível no carrinho (não vazio, não vermelho)
- [ ] **Total:** Número grande em preto, atualiza ao cada item
- [ ] **Desconto:** Se há desconto, aparece a linha "descontos"
- [ ] **Forma de pagamento:** PIX / Dinheiro / Cartão / Cheque
- [ ] **Finalizar:** Verde, clicável, abre modal
- [ ] **Confirmação:** Mensagem verde = sucesso; vermelha = erro (se erro, anotar e ligar para suporte)

### Checklist a cada 2h:

**09:00 / 11:00 / 13:00 / 15:00 / 17:00**

```
Hora: ______
Vendas realizadas desde última checagem: ____
Valor bruto aproximado: R$ ______
Operador conseguiu finalizar todas sem dúvida visual? ☐ SIM ☐ NÃO
Erros ou travamentos? ☐ NÃO ☐ SIM, descrever:
_________________________________________
```

### Cenários extras a testar (se houver tempo):

- [ ] Desconto gerente (operador digita percentual, gerente aprova com senha)
- [ ] Cancelamento de venda (dentro do mesmo turno)
- [ ] Troca de produto (remove item, adiciona outro)
- [ ] Forma de pagamento mista (50% dinheiro + 50% PIX)

---

## Acompanhamento

### A cada 4h, verifique um número de vendas no sistema:

**Log visual (tela PDV):**
- [ ] Campo "Número de vendas do turno" incrementa

**Se tiver acesso ao admin:**

```
Ir para: Relatorios > Vendas > Hoje
Conferir que há N vendas registradas
Somar totais e comparar com caixa físico (opcional)
```

---

## Problema? Ative o hotline

**Se der qualquer erro operacional, não tente resolver sozinho:**

1. Anote o erro **exatamente como aparece** (screenshot se possível)
2. Anote a hora
3. Ligar para (81) 98865-9993
4. Descrever: "Operador não conseguiu fazer venda porque…"

**CTO vai:**
- Diagnosticar em < 10 min
- Enviar correção ou workaround
- Recarregar o navegador no seu lado
- Confirmar que funciona

**Você continua operando enquanto isso.**

---

## Antes do Fechamento (17:30)

### Avisos

- [ ] Operador recebeu aviso: "Faltam 30 min para fechar caixa"
- [ ] Nenhuma venda nova foi iniciada após 17:45
- [ ] Todos os itens do carrinho foram finalizados

### Relatório de vendas (informativo)

```
Total de vendas do dia: ____
Valor bruto: R$ ________
Valor em desconto: R$ ________
Valor líquido: R$ ________
Tickets PIX: ____
Tickets Dinheiro: ____
Tickets Cartão: ____
```

---

## Fechamento (18:00)

### Operador fecha caixa

- [ ] Clica "Operações" → "Fechar caixa"
- [ ] Resumo do dia aparece (vendas, totais)
- [ ] Insere o saldo físico do caixa (conta o dinheiro)
- [ ] Compara com saldo esperado do sistema
- [ ] Se divergir > R$ 5: **não tira do operador**; anota e comunica
- [ ] Clica "Confirmar encerramento"
- [ ] Sistema salva; página redireciona

- [ ] **Caixa fechado com sucesso**

---

## Depois do fechamento

### Validar integridade

**Sumarizador de vendas (gerente pode rodar):**

```
RESUMO DO DIA — 2026-07-29
Total de vendas: 47
Venda menor: R$ 12.50
Venda maior: R$ 189.90
Ticket médio: R$ 58.14
Desconto total (gerente): R$ 0
```

- [ ] Números fazem sentido com a operação do dia

**Se houver acesso ao financeiro:**

- [ ] Todas as 47 vendas aparecem no relatório
- [ ] Nenhuma venda falta ou está duplicada
- [ ] Status = "finalizada" para todas

---

## Fim do dia — Relatório para CTO

**Se tudo correu bem:**

```
✅ Primeiro dia OK
- 47 vendas sem erros
- Sem downtime
- Operador aprendeu o fluxo
- Pronto para operação normal
```

**Se houver algum problema:**

```
⚠️ Issues encontradas:
1. [Descrição do problema]
   - Hora: XX:XX
   - Impacto: [venda perdida / operador confuso / sistema travou]
   - Solução implementada: [se houver]

2. [Próximo problema]
```

---

## Próximos passos

- Dia 2: Operação normal (sem gerente supervisionando)
- Dia 7: Reunião com operador + gerente + CTO para feedback
- Dia 30: Reunião de renovação + planejamento de features V2

---

**Contato suporte:** (81) 98865-9993 / [EMAIL]  
**Escalação:** CTO on-call 24h
