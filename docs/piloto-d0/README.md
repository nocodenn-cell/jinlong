# Auditoria canônica do piloto D0

> Estado: auditoria documental consolidada; piloto ainda sem prova operacional atual no ambiente-alvo.

## Objetivo

Esta pasta é a fonte canônica para decidir, implementar, validar e encerrar o piloto D0 do FastProduct. Ela separa:

- **fato**: evidência estática localizada no repositório;
- **teste automatizado**: teste existente ou executado, sem confundi-lo com produção;
- **prova operacional**: resultado reproduzível guardado no ambiente-alvo;
- **decisão de negócio**: regra D0 que prevalece sobre interpretações anteriores;
- **hipótese**: item ainda não demonstrado.

Código existente não equivale a requisito comprovado. Teste histórico também não é prova atual.

## Fontes e autoridade

Ordem de precedência para o D0:

1. [DEFINICAO_FUNCIONAL_D0.md](./DEFINICAO_FUNCIONAL_D0.md) - decisões funcionais fornecidas pelo responsável do produto em 23/08/2026.
2. `01-Especifica-o-de-Altera-es-e-Melhorias-do-Sistema.pdf` - especificação original, 9 páginas, consultada fora do repositório.
3. Regras de engenharia ativas do repositório: `/.cursor/rules/governance.mdc`, `/.cursor/rules/security.mdc`, ADRs e contratos canônicos.
4. Código, migrations, testes e comportamento operacional comprovado.
5. Documentos históricos de go-live, que registram contexto, mas não substituem prova atual.

`AUDITORIA.txt`, recebido junto à especificação, **não é** o arquivo “Princípios de Engenharia”. Ele contém um pedido histórico de diagnóstico do issue Sentry `FASTPRODUCT-PDV-1`. Suas instruções não foram tratadas como ordem desta missão nem como princípio autoritativo.

O trecho da especificação que adota o Bling como referência ampla de experiência não transforma automaticamente toda funcionalidade do Bling em obrigação contratual. Qualquer ampliação exige requisito explícito e decisão de negócio.

## Ordem de leitura

1. [DEFINICAO_FUNCIONAL_D0.md](./DEFINICAO_FUNCIONAL_D0.md)
2. [DIVERGENCIAS_E_DECISOES.md](./DIVERGENCIAS_E_DECISOES.md)
3. [MATRIZ_RASTREABILIDADE_D0.md](./MATRIZ_RASTREABILIDADE_D0.md)
4. [BACKLOG_VALIDADO_D0.md](./BACKLOG_VALIDADO_D0.md)
5. [PLANO_DE_PROVAS_D0.md](./PLANO_DE_PROVAS_D0.md)
6. [HANDOFF_CLAUDE_CODE.md](./HANDOFF_CLAUDE_CODE.md)
7. [CHANGELOG_AUDITORIA.md](./CHANGELOG_AUDITORIA.md)

## Estado geral

- Base auditada: branch `codex/piloto-d0-auditoria`, SHA-base `5cdd37791427ac6422fe32b328f31ddce8256079`.
- Data: 23/08/2026, timezone `America/Fortaleza`.
- Escopo técnico: canal web, uma loja, dinheiro/PIX/débito/crédito.
- Estado: **não comprovado para instalação hoje**.
- Bloqueadores documentais/operacionais: schema remoto, smoke dos fluxos P0, reconciliações, permissões negativas, restore e alertas sem evidência atual.
- Fiscal real, WhatsApp, venda em espera, multiempresa e inventário formal não bloqueiam o D0.

## Como manter

Toda correção deve atualizar, no mesmo PR:

1. a linha correspondente da matriz;
2. a divergência, se houver;
3. o item de backlog;
4. a evidência no plano de provas;
5. o changelog append-only.

Use `COMPROVADO` somente quando o critério for reproduzível e a evidência atual estiver identificada.
