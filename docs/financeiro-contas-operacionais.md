# Contas financeiras operacionais (sprint)

## Já existia

- Contas `BANCO`/`RESERVA`, movimentos imutáveis, baixas parciais, transferências, recebíveis de cartão/PIX, painel e extrato.
- Dinheiro de venda continua no domínio do caixa/PDV (não gera movimento bancário automático).

## Lacuna fechada nesta entrega

- Conta padrão por loja/forma (`financeiro_contas_forma`) via `financeiro_comando_operacional`.
- Novas vendas: PIX com banco configurado liquida automaticamente (taxa 0); cartões herdam conta e ficam `PENDENTE` até liquidação.
- Histórico: configurar default **não** relança vendas antigas nem reconstrói saldos.
- Turno pode ser vinculado explicitamente a uma reserva (`VINCULAR_TURNO_CONTA`); turnos históricos exigem associação manual.
- Extrato mostra usuário e origem; saldo exibido é sempre a soma dos movimentos oficiais.
- Ações rápidas fixas no Financeiro e no Estoque (pt/zh, botões ≥56px).

## Fora de escopo

- Conexão bancária / execução real de pagamentos.
- Publicação e migration no Jinlong remoto (homologação local isolada apenas, se autorizada).

## PDV nesta mesma branch

- Desconto comercial no dinheiro (até 10%) na finalização, com autorização comercial (`AUTORIZACAO_COMERCIAL`).
- Botões +/- maiores e CTA “Adicionar mais itens”.
- Preserva desconto manual, pagamento dividido e venda em espera dos commits `ccfac6f6` / `2de640ef`.
