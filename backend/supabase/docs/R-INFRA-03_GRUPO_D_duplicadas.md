# R-INFRA-03 — Grupo D: duplicadas numéricas (análise pré-limpeza)

Objetivo: confirmar referências e **equivalência de conteúdo** antes de qualquer remoção.
Resultado: **NÃO preparar remoção mecânica** — os pares divergem em conteúdo. Requer revisão
par-a-par. **Nenhuma exclusão feita.**

## Referências externas (repo/CI/código)
Nenhuma das 3 cópias numéricas é referenciada por código, workflow de CI, JSON ou outra
migration (busca em `*.ts/*.tsx/*.yml/*.yaml/*.json/*.md/*.sql`). Remoção não quebraria imports.

## Equivalência de conteúdo (diff) — achado que muda a recomendação

| Par (numérica × timestamp canônica) | diff | Natureza |
|---|---|---|
| `253_clientes_tipo_endereco_e_view_gerente` × `20260620200253_244_…` | 85 linhas | **Divergem** — variantes diferentes da mesma feature |
| `246_remover_venda_fiado` × `20260620222629_245_…` | 276 linhas | **Não são a mesma migration**: `245` tem 6L (só remove fiado); `246` tem 272L e **redefine a v4**. Colisão de nome. |
| `24703_vendas_em_espera_e_consulta_rapida` × `20260710163032_255_…` | 3 linhas | Quase idêntica (só comentário/1 linha) |

## Diagnóstico
- **Canônica = versão TIMESTAMP** (é a rastreada/aplicada em prod) — confirmado.
- As cópias **numéricas** não são duplicatas triviais:
  - `24703` ≈ `255`: cópia pré-tracking praticamente idêntica → **segura para arquivar**.
  - `253` e `246`: conteúdo materialmente diferente da versão canônica. `246` inclusive carrega
    uma definição completa da v4. Remover cegamente = **perda de informação histórica**.

## Recomendação (aguardando aprovação — nada removido)
1. `24703_vendas_em_espera_e_consulta_rapida` → **arquivar** (mover para `migrations/_archive/`).
2. `253_…` e `246_…` → **revisão par-a-par** antes de decidir: comparar contra o corpo vivo em prod
   e contra a versão canônica; só então arquivar. Não excluir nesta fase.
3. Em nenhum caso `git rm` sem arquivamento — preservar em `_archive/` mantém o SSOT histórico e é
   reversível. **Sem impacto em produção** (arquivos não são aplicados; apenas saem do diretório ativo).
