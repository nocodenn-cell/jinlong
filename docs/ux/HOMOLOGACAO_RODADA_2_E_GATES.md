# Homologação — Rodada 2 e gates (UX-IA-01)

| Campo | Valor |
|---|---|
| Data | 2026-10-09 |
| Ambiente | Local e isolado: Supabase local (401 migrations + seed) + `next dev`, árvore descartável com #512 + #514 + #515 mergeados (sem conflito). Nada remoto. Stack, servidor e `.env.local` removidos ao final. |
| Perfis | DONO (novo nesta rodada), além do GERENTE/ADMIN/OPERADOR da rodada 1 |

## 1. Resultado

| Verificação | Resultado |
|---|---|
| Árvore integrada #512+#514+#515: `tsc` | limpo |
| Suíte completa | 360 arquivos verdes; 1 falha em teste de **integração que se ativa sozinho com Postgres local** (`productUpdater.semRpc.integracao`, "Expected 3 parts in JWT"): formato de chave do ambiente, sem relação com navegação (mesma família do achado N6 da rodada 1) |
| Financeiro (#515) como DONO, desktop e **375 px**: 7 controles + seletor de vistas; Comissões marca só ela; Categorias na barra | OK |
| **375 px**: nenhuma das telas alteradas tem rolagem horizontal da página (Financeiro, Comissões, Funcionários, Configurações, Vendas, Compras, Estoque, Relatórios × 3 views) | OK |
| Mobile: botão de busca abre a paleta, foco no campo, "comiss" → *Comissões · Financeiro*, Enter navega e a barra do Financeiro aparece | OK |
| **Chinês** (DONO em ZH): barra do Financeiro (概览·应收·应付·账户与对账·税务·佣金·分类), seletor (概览 \| 收支结果), seções migradas ("热销商品", "库存差异（审计）") | OK |
| Funcionários → link "Comissões" só em OPERADOR/GERENTE (nenhum em DONO) | OK |

## 2. Achados novos (não bloqueiam)
1. **i18n pré-existente nas views executivas:** em ZH, os títulos dos painéis que já existiam (Curva ABC, Encalhe, Reposição, Cobertura, DRE…) continuam **em português fixo**; só as seções migradas (que usam o dicionário) saem em chinês. Resultado: tela mista em ZH. As colunas acrescentadas no #514 (Cliente, Valor imobilizado, Média/dia) seguem o padrão PT fixo do painel. Recomendação: PR de i18n dos painéis executivos (PR 9).
2. **Aba ativa fora da área visível** na barra rolável a 375 px (ex.: "Contas e conciliação" parcialmente cortada). Padrão pré-existente dos hubs; melhoria: rolar a aba ativa para dentro da área visível.

## 3. Gates de autorização
| Gate | Estado |
|---|---|
| A3 — GERENTE forja `go_autorizado` (RLS) | **Correção pronta e testada localmente** em #516 (trigger). Smoke: 6 falhas antes, 13/13 depois; migration idempotente; guards do repositório OK. **Não aplicada em banco remoto.** |
| A1 — Implantação/Diagnóstico abrem por URL para GERENTE | **Decisão de produto pendente** (recomendação: manter Implantação, restringir Diagnóstico) |
| A2 — `executarDiagnosticoCaixaAction` sem guarda no TS (o banco bloqueia) | Higiene; PR pequeno à parte, ainda não aberto |
| Menus/hubs/links respeitam perfis | OPERADOR redirecionado em todas as rotas `/admin` testadas; GERENTE sem Interno; DONO como GERENTE; ADMIN com Interno; nenhuma mudança em `adminPolicy` nos PRs de navegação |

## 4. Não testado
Cmd+K no Mac e leitor de tela; dispositivo móvel real; períodos longos/virada de fuso; cliente a prazo e desconto autorizado (exigem token de gerente).
