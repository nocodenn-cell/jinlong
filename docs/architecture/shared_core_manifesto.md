# Manifesto do `shared-core` — genérico × específico do Jinlong

**Origem:** auditoria de modularidade + plano de execução (Fase 4.0).
**Regra:** estar em `shared-core` **não** torna um módulo reutilizável. "Reutilizável" só vale depois de passar o critério (a)–(f) da Fase 5 do plano.

Classificação por evidência do código (imports, dependências, conceitos). `A confirmar` = sem evidência suficiente.

| Pasta (`shared-core/src/…`) | Classe | Evidência | Observação |
|---|---|---|---|
| `result/`, `observability/{runAction,logFailure,types}` | **Candidato genérico** | 0 imports externos; 3 arquivos de teste | `observability/vendaTrace.ts` é específico do Jinlong (venda) |
| `formatting/`, `locale/`, `i18n/` | **Candidato genérico** | puros; dependem só entre si | moeda default BRL em `formatting/types`: decidir |
| `pricing/` | **Candidato genérico (com SQL)** | pura; golden tests com o desktop | autoridade é `calcular_preco_produto` no Postgres (ADR-007) |
| `managerDiscount/` | **Candidato genérico** | puro, com teste | |
| `customers/` | **Candidato genérico** | contratos + policies; poucos vínculos no banco | `loja_id` nos contratos |
| `products/`, `engine/`, `catalog/` | **Genérico + específico misturados** | enum `origem: china_manual/brasil_nf/brasil_sem_nf`; faixa de atacado | separar núcleo de extensões do Jinlong |
| `inventory/`, `cash/`, `financial/` | **A confirmar** | contratos limpos, mas a escrita atravessa a RPC de venda (ADR-008/009/010) | não extrair isolados; ver seção 10 do plano |
| `caixa/` (`mapRegrasPreco`, `variantesChaveLeitura`, `checkoutSnapshot`) | **Específico do Jinlong** | conceitos de caixa/PDV | ADR-009: utilitário de PDV, não é o domínio `cash/` |
| `pdv/` (scan-pipeline, invariants, saleEvent) | **Específico do Jinlong** | 57 menções a "caixa", 35 a "venda" | |
| `stores/unifiedCartStore`, `cart/` | **Específico do Jinlong** | zustand `persist` em localStorage; acoplado a preço e desconto de gerente | |
| `../navigation/routes.ts` (fora de `src/`) | **Específico do Jinlong** | rotas `/gerente`, `/caixa`, `/admin` | deve sair do `shared-core` (Fase 2.7) |

## Invariantes hoje verdadeiras (verificadas)
- Fora de testes e de arquivos de configuração, `shared-core` importa apenas `zustand` (1 arquivo: `stores/unifiedCartStore.ts`) e nenhum import relativo escapa do pacote. Congelado pelo `boundary-ratchet-guard` (regra `shared-core-externals`).
- Nenhum arquivo executável importa `pdv-importados`, `pdv-local` ou Supabase.
- `npm run typecheck` e `npm run test` do pacote rodam **dentro do monorepo** (incluindo os `*.test.ts`).
- **Ainda não é autossuficiente fora do monorepo** (spike 0.6): faltam como devDependencies `vitest`, `@types/node` e `jsdom`, e `react` como peer (via `zustand`). Ver `modularizacao_sprint1_evidencias.md`, seção 4.
