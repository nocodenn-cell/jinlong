# Handoff da candidata D0 recomposta sobre main

## Base e limites

- Base: `main` em `ede1f459785f79ced4df0cd9a97a6ccdd3e26220`.
- Branch: `codex/piloto-d0-main-clean`.
- Sem alterações de dependências, seed, gate financeiro canônico ou migrations
  históricas.
- Sem merge, deploy, alteração de dados ou aplicação remota de migrations.

## Escopo funcional

1. Tiers ativos do produto são a única autoridade de preço atacadista em
   runtime; sem tier aplicável, prevalece varejo.
2. Remessa e recebimento exigem itens estritamente positivos, com validação na
   UI, servidor e banco, atomicidade e idempotência.
3. Inventário físico continua aceitando zero.

## Pendências externas

- homologação das duas migrations no ambiente autorizado;
- fechamento comercial dos 27 produtos legados sem tier ativo;
- aceite humano dos gates operacionais e do GO.

O runbook financeiro histórico foi deliberadamente omitido por conter
procedimentos de rollback vinculados a um estado antigo do schema.
