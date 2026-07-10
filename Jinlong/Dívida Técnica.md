# 🏚️ Dívida Técnica — Jīn Lóng

> [[Home]] | [[Bugs]] | [[Auditoria]]

---

## TODOs Explícitos no Código

| # | Local | Descrição | Impacto |
|---|---|---|---|
| 1 | `backend/supabase/functions/fiscal-worker/fiscal-provider-adapter.ts` | `TODO: Implementar integração específica com Bling` | Sem suporte Bling para NF-e |

**Total de arquivos com TODO/FIXME:** 2 arquivos, 3 TODOs

---

## Código Legado

### RPCs Legadas (Banco)

| RPC | Status | Risco |
|---|---|---|
| `registrar_venda_com_itens(...)` | Mantida para compatibilidade com desktop antigo | Sem guard de preço; sem captura de eventos; sem idempotência v4 |
| `decrementar_estoque_idempotente(...)` | Revogada para `authenticated` (migrations 070/071); mantida para `service_role` | Acesso direto por service_role pode bypassar validações |
| `finalizar_venda_transacional_canonica_v2` | Bloqueada | Inacessível para authenticated; mantida como artefato no schema |
| `finalizar_venda_transacional_canonica_v3` | Bloqueada | Idem |

### Stores Legados (Frontend)

| Arquivo | Status | Risco |
|---|---|---|
| `stores/unifiedCartStore.ts` | Marcado como "experimental" | Convive com `carrinhoStore.ts` padrão; pode causar confusão |

---

## Componentes Duplicados

| Componente | Localização A | Localização B | Impacto |
|---|---|---|---|
| `MetricCard` | `components/gerente/MetricCard.tsx` | `components/ui/admin-v2/MetricCard.tsx` | Divergência visual; mudança em um não afeta o outro |
| `Button` base | `components/ui/button.tsx` | `components/ui/button-tokenized.tsx` | Dois sistemas de botão; confusão sobre qual usar |

---

## Cores e Tokens Inconsistentes

### Classes Tailwind Hardcoded (sem tokens `--fp-*`)

Encontradas em vários arquivos do caixa e gerente:
- `text-green-600` — deveria usar `text-fp-success` ou variante token
- `bg-red-100` — deveria usar token de estado de erro
- `text-yellow-500` — deveria usar token de atenção
- Badge "ATAC" usa `bg-green-*` diretamente

**Impacto:** Troca de tema/white-label futura exige busca manual de cada cor hardcoded.

### Tokens Antigos vs Novos
- Tokens `--fp-*` são o padrão novo (definidos em `globals.css`)
- Componentes mais antigos podem referenciar variáveis Tailwind ou cores diretas
- `button-tokenized.tsx` é a versão "nova" — `button.tsx` é a versão "antiga" ainda em uso

---

## Arquivos Órfãos / Suspeitos

| Arquivo | Evidência de Orfandade | Ação Sugerida |
|---|---|---|
| `stores/unifiedCartStore.ts` | "experimental" — não há evidência de uso production | Confirmar se em uso; remover se não |
| `CURSOR_PROMPT_SESSAO_AUTONOMA_CANONICO.md` | Arquivo de sessão do Cursor em `docs/` | Mover para `.cursor/` ou deletar |
| `CURSOR_PROMPT_SESSAO_AUTONOMA_V2.md` | Idem | Idem |
| `CURSOR_PROMPT_SESSAO_AUTONOMA_V3.md` | Idem | Idem |
| `CURSOR_PROMPT_SESSAO_COMPLETA.md` | Idem | Idem |

---

## Imports e Dependências

### Imports de Caminhos Inconsistentes
- `shared-core` é importado como `@fastproduct/shared-core` no web e via alias `@core` no desktop
- Dois caminhos de import diferentes para o mesmo código — requer atenção em refatorações

### Dependências Críticas (auditadas pelo CI)

| Dependência | Versão | Monitoramento |
|---|---|---|
| Next.js | 15.x | `guard:deps` no CI |
| React | 19.x | `guard:deps` no CI |
| Supabase JS | Ver `package.json` | `npm audit` no CI |
| Tauri | 2.x | CI pdv-local |
| Vitest | 3.2 | Fixo no CI |
| Playwright | 1.49 | Fixo no CI |

---

## Migrations com Lacunas Propositais

O diretório de migrations tem 186 arquivos mas numeração vai até 258. As lacunas são **propositais** (migrations puladas, reenumeradas ou de branches diferentes). O CI valida a sequência com `guard:migrations`.

**Risco:** Se o CI não estiver rodando `guard:migrations`, uma lacuna acidental passaria despercebida.

---

## Documentação Técnica Órfã em `docs/`

Há mais de 50 arquivos `.md` em `docs/`. Muitos são checklists pontuais que podem estar desatualizados. Exemplos:

| Arquivo | Risco |
|---|---|
| `docs/HOMOLOGACAO_PACOTE_032_036.md` | Homologação pontual — pode estar desatualizado |
| `docs/AUDITORIA_CONSISTENCIA_VISUAL.md` | Auditoria visual — pode não refletir estado atual |
| `docs/ADMIN_AUTH_STABILITY_CHECKPOINT.md` | Checkpoint de autenticação — pode estar obsoleto |
| `docs/ADMIN_AUTH_STRUCTURAL_AUDIT.md` | Auditoria estrutural — pode estar obsoleto |
| `FASE_3_PROGRESS.md` | Estado da Fase 3 — Fase 3.1 concluída, 3.2 pendente |

---

## Lógica Espalhada

| Lógica | Espalhamento | Ideal |
|---|---|---|
| Cálculo de preço atacado | `PricingService.ts` + `shared-core/pricing/` + RPCs no banco | Fonte única: `shared-core` (80% OK) |
| Validação de estoque | `CartEngine` + RPC `decrementar_estoque_seguro` + guard na UI | Necessário ter nos dois (negócio + banco); documentar |
| Arredondamento monetário | `roundAbnt` no `shared-core` + possível `Math.round` fora do motor | Consolidar em `roundAbnt` |
| Normalização de idioma | `normalizeIdioma()` em `lib/idioma/` | OK — ponto único |
| Regras de preço (prioridade) | `shared-core/pricing/resolution.ts` | OK — ponto único |

---

## Componentes Gigantes / Responsabilidade Excessiva

| Componente | Problema |
|---|---|
| `CaixaPageClient.tsx` | Componente principal do caixa; integra pipeline scan, carrinho, pagamento, desconto gerente, modais — potencialmente >500 linhas |
| `ProdutoFormModal.tsx` | 5 seções de formulário em um único modal — pode ser pesado para mobile |
| `DataTablePage.tsx` | Componente genérico usado em múltiplos contextos — pode ter props excessivas |

---

## Guard Scripts (Validação Arquitetural)

O CI roda guards que previnem regressão arquitetural:

| Guard | O que valida |
|---|---|
| `guard:core` | `core/` não importa código web-specific (React, Next) |
| `guard:pdv` | Invariantes de PDV (fluxo, preço) |
| `guard:routes` | Apenas rotas permitidas existem (caixa, gerente, admin) |
| `guard:rpc` | Apenas RPCs canônicas são chamadas (não as legadas) |
| `guard:pricing` | Motor de preço usa resoluções corretas |
| `guard:deps` | Versões de dependências dentro do range permitido |
| `guard:migrations` | Sequência de migrations sem lacunas acidentais |

**Risco se os guards forem removidos ou bypassados:** Qualquer um dos padrões acima pode ser violado sem que o time perceba.

---

## Impacto Financeiro da Dívida

| Item | Impacto se não endereçado |
|---|---|
| Arredondamento heterogêneo | Diferenças de centavos em relatórios fiscais |
| Buraco no kardex (devolução) | Inconsistência de estoque → recompra incorreta |
| Drift de GRANTs | Ambiente novo quebrado sem diagnóstico fácil |
| Cores hardcoded | Custo de refatoração maior em white-label futuro |
| TODOs de Bling | Clientes Bling sem fiscal = churn |

---

> Ver bugs derivados em [[Bugs]] · Violações arquiteturais em [[Auditoria]]
