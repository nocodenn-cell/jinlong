# FASE 6.1 — Onda 3: Mapa do Dualismo do Caixa (auditoria pré-implementação)

**Objetivo:** definir a fonte única do PDV oficial antes de colapsar a bifurcação.
**Método:** leitura estática + histórico git. Nenhum código alterado nesta etapa.

---

## 1. A flag

| Aspecto | Fato |
|---|---|
| Nome | `NEXT_PUBLIC_CAIXA_PDV_LAYOUT` |
| Natureza | **Build-time** (inlined no bundle client pelo Next; mudar exige redeploy) |
| Resolução | `CaixaPageClient.tsx:141-142` → `=== "default" ? "default" : "classic"` |
| Default efetivo | **`classic`** — qualquer valor ≠ `"default"` (inclusive ausente) resulta em classic |
| Flag satélite | `NEXT_PUBLIC_CAIXA_PDV_LAYOUT_PREVIEW_BANNER` — banner "PDV clássico" exibido só no classic (produção: oculto salvo `1`; dev: visível salvo `0`) |

**Histórico decisivo (git):** o commit `9a9da6a` **inverteu o default** — antes era `=== "classic" ? "classic" : "default"` (classic como opt-in de homologação), depois `=== "default" ? "default" : "classic"` (classic promovido a padrão; dragon virou escape hatch).

**Docs desatualizados:** `VERCEL_ENVIRONMENT_CHECKLIST.md:191` e `.env.example` ainda descrevem a era pré-`9a9da6a` ("definir `classic` apenas em Preview/staging; não em Production") — instrução hoje inócua: com o código atual, setar `classic` ou não setar nada dá o mesmo resultado. **Nenhum documento ou exemplo jamais instrui setar `default`.**

## 2. Rotas

- **Uma única rota consome o dualismo:** `/caixa` (`app/caixa/page.tsx` → `CaixaPageClient`).
- `stories/caixa/CaixaHeader.stories.tsx` usa ambos os valores (documentação Storybook, não produção).
- e2e/scripts **não** setam a flag — os testes rodam no default do código (= classic).

## 3. Camadas do dualismo (código)

### 3.1 Resolução e atributo
- `CaixaPageClient.tsx:141` — resolve a env.
- `CaixaPageClient.tsx:1203` — `data-caixa-layout={pdvLayoutVariant}` no root (gatilho do override CSS).

### 3.2 Encanamento de prop (`layoutVariant`/`variant`/derivados)

| Componente | Prop | Dualismo interno |
|---|---|---|
| `CaixaPdvTopBar` | dono do tipo `CaixaPdvLayoutVariant` | ternários quase idênticos nos 2 ramos (diferenças de borda) |
| `CaixaHeader` | `layoutVariant` | **comportamental**: `!classic` renderiza bloco de data/hora (linha 81); classic o oculta |
| `CaixaPdvOperadorTabs` | `layoutVariant` → `classicChrome` | repassa a `PagamentoPanel` |
| `CaixaEmAbertoList` | `layoutVariant` | classes `muted`/`card` (dragon usa `amber-400`, `jl-*`) |
| `CaixaRailTurnoSummary` | `layoutVariant` | classes |
| `CaixaPdvMetodoPagamentoSelector` | `variant: "default"\|"classic"` | **comportamental** (chrome do seletor de pagamento) |
| `CaixaCartList` | `listEmptyVariant: "default"\|"pdv_classic"` | empty state diferente por layout |
| `CaixaFooter` | `layout: "full"\|"classic_summary"` | **comportamental**: classic_summary só mostra resumo financeiro (total/finalizar ficam na coluna do carrinho); full tem collapse próprio |

### 3.3 Ternários no `CaixaPageClient` (17)
- **Visuais** (classes: `bg-background`/`bg-card`/`border-border` vs `dragon-glass-card`/`jl-*`): linhas 1206, 1299, 1334, 1343, 1355, 1384.
- **Comportamentais**: 1069 `pdvClassicAtalhos` (**classic ganha atalhos extras**: excluir venda, finalizar, focar busca), 1232 banner preview (só classic), 1254 (bloco condicional), 1307 `listEmptyVariant`, 1313/1408 (blocos só-classic), 1457 `CaixaFooter layout`.
- **Encanamento**: 392, 1363, 1393, 1402.

### 3.4 CSS
- `.caixa-oriental-root` (`theme-oriental.css`) — base **dark** (gradiente slate + glow âmbar via `::before`) com override claro `[data-caixa-layout='classic']` (fundo `--surface-soft`, sem glass). Após o colapso: achatar para a versão clara, remover `::before` e o seletor de atributo.
- `dragon-glass-backdrop`/`dragon-glass-card`/`dragon-elev-2` nos **6 modais do caixa** — **não fazem parte do dualismo** (aparecem nos dois layouts); pertencem à migração de Modal (Onda 5.2). Ficam.

## 4. Decisão: fonte única do PDV oficial

> **O layout oficial do PDV é `classic` (claro, "cara de Bling").**

Evidências que sustentam a decisão:
1. **Código:** `classic` é o default desde `9a9da6a`; `default` (dragon) só existe como escape explícito.
2. **Docs/env:** nenhuma instrução em nenhum ambiente jamais mandou setar `default`; os dois estados plausíveis da env em produção (ausente, ou `classic` da era de homologação) resultam ambos em classic.
3. **Contrato de fase:** Fase 0 (Layout Compiler) travou o sistema no tema claro; o ramo dragon do caixa é o último resquício funcional do tema aposentado.
4. **e2e:** roda no default do código — os testes críticos já validam o classic.

Limitação registrada: env vars do Vercel não são legíveis via API nesta sessão e o domínio de produção é bloqueado pelo proxy — a confirmação é pela tríade código+docs+histórico acima. Reversão: 1 `git revert` restaura o dualismo.

## 5. Plano de colapso (implementação da Onda 3)

1. `CaixaPageClient`: remover env read + `pdvLayoutVariant`; resolver os 17 ternários mantendo o ramo classic (atalhos extras ficam **incondicionais**); remover `data-caixa-layout`; remover banner preview + `showClassicLayoutPreviewBanner`.
2. Remover prop/type de `CaixaPdvTopBar` (tipo `CaixaPdvLayoutVariant`), `CaixaHeader` (bloco datetime do dragon sai), `CaixaPdvOperadorTabs` (`classicChrome` fixo), `CaixaEmAbertoList`, `CaixaRailTurnoSummary`, `CaixaPdvMetodoPagamentoSelector`.
3. `CaixaCartList`: fixar empty state `pdv_classic`; `CaixaFooter`: fixar `classic_summary` **se** nenhum outro caller usar `full` (verificar).
4. Deletar `CaixaPdvLayoutPreviewBanner.tsx` (existia para homologar o layout então-opcional; obsoleto com classic oficial).
5. CSS: achatar `.caixa-oriental-root` para a versão clara.
6. Atualizar `CaixaHeader.stories.tsx` e docstring de `useCaixaKeyboardShortcuts`; corrigir `.env.example`/`VERCEL_ENVIRONMENT_CHECKLIST.md` (flag deixa de existir).
7. Gates: `next build`, suíte completa, e2e crítico se executável no ambiente; smoke manual no preview.
