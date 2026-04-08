# Template de Monitoramento Pos-Release

Use este template nas primeiras 2 horas apos publicar.

## Cabecalho da janela

- Sistema: `fastproduct`
- Ambiente: `producao` ou `homologacao`
- Inicio da janela: `HH:MM`
- Fim previsto: `HH:MM`
- Responsavel: `NOME`
- Canal de comunicacao: `Slack/WhatsApp/Teams`

## Checklist a cada 30 minutos

- [ ] Aplicacao responde (login e navegacao basica).
- [ ] Fluxo de caixa funcional (abrir, vender, fechar).
- [ ] Estoque baixa corretamente apos venda.
- [ ] Fila fiscal sem crescimento anormal de erros.
- [ ] Contas a receber cria e liquida sem falhas.
- [ ] Sem erro critico recorrente em logs.

## Registro de status (preencher)

### T+00
- Status geral:
- Incidentes:
- Acao tomada:

### T+30
- Status geral:
- Incidentes:
- Acao tomada:

### T+60
- Status geral:
- Incidentes:
- Acao tomada:

### T+90
- Status geral:
- Incidentes:
- Acao tomada:

### T+120 (encerramento)
- Status final:
- Pendencias:
- Decisao: `OPERACAO ESTAVEL` ou `ACIONAR PLANO DE ACAO`

## Criterios de alerta (escalacao imediata)

- Indisponibilidade continua acima de 5 minutos.
- Erro recorrente em venda/caixa/fiscal.
- Divergencia de estoque apos operacoes validas.
- Falha de liquidacao de contas a receber.

## Criterio de rollback

Executar rollback quando houver:
- perda de funcionalidade critica sem workaround;
- inconsistencia de dados com risco operacional;
- falha persistente sem previsao curta de correcao.
