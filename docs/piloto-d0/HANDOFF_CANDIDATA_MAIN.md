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
- correção separada dos mocks financeiros preexistentes que bloqueiam o
  typecheck integral do `shared-core`;
- aceite humano dos gates operacionais e do GO.

## Provas locais

- vermelho em `main`: pricing `D0_PRICING_Q4`; RPC atômica de remessa ausente;
- verde na candidata: pricing 9/9, offline 9/9, consumidores web 12/12,
  validações de remessa 8/8 e duas suítes SQL transacionais;
- gate financeiro canônico: 8/8 suítes, incluindo 6 cenários concorrentes;
- TypeScript: backend, web e PDV local verdes; `shared-core` mantém duas falhas
  preexistentes fora do diff;
- build web, lint focado, guard de migrations, traduções e hook equivalentes
  verdes.
