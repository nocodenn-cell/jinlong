# Estoque — correções P0

Base: `origin/main` em `069339477cf93af9a3fb5ae48b330c912e540c4c`.

## Comportamento

- Conferência: quantidade ou observação diferente da versão salva bloqueia a confirmação. Registrar, recarregar e conferir a versão salva libera a operação. Campos ficam bloqueados durante registro/confirmação.
- Ajuste: o formulário envia saldo e mínimo originais. A função `ajustar_estoque_manual_seguro` compara esses valores sob `FOR UPDATE`, antes de escrever ou registrar Kardex.
- Alterar apenas o mínimo preserva o saldo corrente, mesmo se houve uma movimentação após abrir o formulário. Uma alteração concorrente do mínimo é rejeitada.
- Clientes sem os valores originais falham com segurança. A função antiga não executa mais ajustes sem essa proteção.
- O cadastro atômico de produto usa a função segura com valores originais `0/0`, preservando estoque inicial e idempotência.

## Validação local

Testes de componentes e serviços cobrem alterações não salvas, campo vazio, zero, observação, falha ao registrar, envio dos valores originais e mensagem de conflito.

`backend/scripts/estoque-ajuste-concorrente.test.mjs` executa a migration em PostgreSQL descartável em memória (PGlite), com dados sintéticos. Cobre ajuste, conflito de saldo/mínimo, mínimo isolado, zero, repetição, autorização, permissões e cadastro inicial idempotente. Os conflitos são reproduzidos após uma escrita concorrente simulada; não é um teste de carga com múltiplas sessões.

## Entrega

A migration foi preparada e testada localmente. Não foi aplicada em produção. Coordenar sua aplicação com a publicação da aplicação: a versão antiga não poderá ajustar saldo após a migration; a nova depende da função segura. Não usar fallback para a função antiga.

## Invariante para a próxima fase

**Uma entrega física = um único crédito de estoque.** Documento fiscal ou cobrança recebidos depois devem ser associados à entrada existente, sem creditar mercadoria novamente. A sprint seguinte implementou a porta Entradas e associação explícita de um documento a uma entrega física completa. Ver `estoque-sprint-entradas.md` para comportamento e limites.
