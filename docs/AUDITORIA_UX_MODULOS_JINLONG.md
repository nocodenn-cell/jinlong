# Auditoria UX + Design System + Módulos Comerciais — Jinlong / FastProduct

## Contexto

Objetivo do pedido: encontrar o que impede o sistema de **parecer um ERP profissional pronto para um cliente real (primeiro pagante)**. Escopo restrito a (1) Design System / UX e (2) módulos comerciais ausentes. **Diagnóstico e roadmap apenas — nenhuma alteração de código.**

App principal auditado: `pdv-importados` (Next.js App Router). Backend: `backend/supabase` (186 migrations). O painel real é `/admin/*`; as rotas `/gerente/*` hoje só redirecionam (`app/gerente/[...path]/page.tsx` → `legacyGerenteRedirect`).

Conclusão-resumo: **o backend é muito mais completo que a UI**. Vários módulos existem em banco e até em componentes, mas não estão “plugados” na navegação nem no PDV. Os bloqueios para o primeiro cliente são mais de **superfície (UX + surfacing de módulos)** do que de engenharia pesada.

---

## PARTE 1 — Design System / UX

### 1.1 Tipografia / tamanho de fonte

**Situação atual**
- Base do `body` = **15px** (`app/globals.css:50`). Razoável.
- Mas **não existe escala tipográfica** no `tailwind.config.js` (nenhum `theme.fontSize` — usa o default do Tailwind).
- Uso massivo de fontes minúsculas medido no código (`app` + `components`):
  - `text-xs` (12px): **453 ocorrências**
  - `text-[11px]`: **166**
  - `text-[10px]`: **109**
  - `text-[12px]`: **95**
  - `text-[9px]`: **11**
  - **86 arquivos** usam fontes de 9–11px.
- Tabelas de relatório em `text-[12px]` (`app/admin/relatorios/_components/RelatoriosContent.tsx:151`), nav secundária em `text-[11px]`, badges/avatars em `text-[9px]`.

**Problema para o cliente**
Telas densas com números pequenos (relatórios, estoque, auditoria, financeiro) são cansativas e passam sensação de “sistema de dev”, não de produto. Operador de caixa e dono (muitas vezes 40+) forçam a vista. É a queixa nº1 de “parece pequeno demais”.

**Prioridade: P1** (não bloqueia venda, mas mata a primeira impressão).

**Solução recomendada**
1. Definir escala tipográfica única no `tailwind.config.js` (`theme.extend.fontSize`) com tokens semânticos: `display / h1 / h2 / body (15–16px) / label (14px) / caption (13px mínimo)`. **Piso de 13px** para qualquer texto lido pelo operador.
2. Subir base para 16px em telas operacionais (PDV, estoque, financeiro), mantendo densidade só onde é tabela grande.
3. Fazer um “sweep” substituindo `text-[9px]/[10px]/[11px]` por tokens (`caption`), começando por: **PDV/caixa, Estoque, Relatórios, Auditoria**.

**Complexidade: Média** (mecânica, mas espalhada por ~86 arquivos — melhor via tokens + find/replace controlado).

---

### 1.2 Botões — padrão de cores

**Situação atual**
- Existe `Button` shadcn com variantes (`components/ui/button.tsx`): `default (bg-primary = navy #0f172a), destructive, outline, secondary, ghost, link`. Bom contrato.
- **Mas ele é ignorado em muitos lugares.** CTAs hardcoded convivem sem regra:
  - Azul cru `bg-blue-600` em `app/error.tsx`, `app/caixa/error.tsx`, `app/demo-fluxo`, `app/gerente/compras/OcDetalheModal.tsx`, `app/gerente/estoque/imprimir-etiquetas/...` etc.
  - Âmbar/ouro `bg-amber-500 / text-amber-400` em ~176 ocorrências, usado ao mesmo tempo como **marca** (dragão dourado), **estado de aviso** e **nav ativa** (`SidebarNav.tsx:61` usa `rgba(251,191,36,…)`).
  - Login usa ouro cerimonial `#d4af37`; token de acento do sistema é azul `#2563eb`; primary de botão é navy. **Três “cores principais” diferentes** dependendo da tela.
- **Resíduo de dark theme**: componentes ainda usam cores pensadas para fundo escuro (`text-amber-400`, `bg-amber-950/25`, `bg-blue-900/30`) mesmo com o tema agora **claro-único** (`tailwind.config.js:8`, `darkMode` desativado). Ex.: `components/caixa/CaixaMessageBanner.tsx:22`, `app/caixa/CaixaCartList.tsx:480`.

**Problema para o cliente**
Sem convenção, o usuário não aprende “azul = confirmar, vermelho = perigo”. Botões dourados que às vezes são marca e às vezes aviso confundem. Resíduo de dark theme gera contraste estranho / “bug visual”.

**Prioridade: P1.**

**Solução recomendada — convenção única (documentar + aplicar)**
| Intenção | Token/variante | Cor |
|---|---|---|
| Ação principal / confirmação | `Button variant=default` | 1 cor só (recomendo o **azul `#2563eb`** já existente como `--accent`, ou o navy — escolher **uma**) |
| Ação secundária | `variant=secondary/outline` | neutro slate |
| Perigo (excluir/cancelar) | `variant=destructive` | vermelho `--destructive` |
| Marca / decorativo | ouro `#d4af37` **só** em branding e loader — **nunca** em botão de ação |
| Aviso/atenção | âmbar **só** em badges/toasts, nunca como CTA |

1. Escolher **uma** cor de ação principal e alinhar `--primary` = `--accent`.
2. Proibir `bg-blue-*`/`bg-amber-*` cru em botões via lint (regra ESLint/`no-restricted-syntax`) — forçar uso do `Button`.
3. Remover resíduos de dark (`*-400/*-900/*-950`) das telas claras.

**Complexidade: Média** (decisão rápida + varredura guiada).

---

### 1.3 Campos e formulários

**Situação atual**
- `Input` (`components/ui/input.tsx`) usa `border-input` = `hsl(214 31.8% 91.4%)` (slate-200 clarinho) sobre fundo branco.
- Regra global `* { border-color: var(--jl-border-2) }` (`app/globals.css:81`) com `--jl-border-2 = #e2e8f0` (slate-200) — borda **muito clara**, quase invisível em card branco → é a origem literal de **“bordas dos inputs desaparecem”**.
- Foco depende de `ring` (`--ring = 222 84% 4.9%` navy) — ok, mas só aparece no `focus-visible`; em repouso o campo “some”.
- Animações: cross-fade global de rota via `@view-transition` 180ms (`app/globals.css:96`) + `transition-colors` difundido; há CSS “agressivo” (`styles/theme-fix-aggressive.css`, 262 linhas) e `unstick-gerente.css` corrigindo instabilidade de sticky header — sinal de que já houve “tremor” de layout.

**Problema para o cliente**
Formulário de cadastro com bordas fantasmas parece quebrado/sem acabamento. Transições em excesso + sticky remendado dão sensação de instabilidade.

**Prioridade: P1** (cadastros são o coração de “ERP sério”).

**Solução recomendada**
1. Escurecer a borda de repouso de inputs para **slate-300 (`#cbd5e1`)** — visível em card branco, mantendo leveza.
2. Estados explícitos e consistentes: `rest` (borda visível) → `hover` (borda +1 tom) → `focus` (ring azul + borda azul) → `error` (borda vermelha + mensagem). Padronizar no `Input`/`Textarea`/`Select`, não caso a caso.
3. Reduzir transições a `hover/focus` locais; avaliar desligar o `@view-transition` global se estiver contribuindo para flicker.

**Complexidade: Baixa–Média** (concentrado em 3–4 componentes base + tokens de borda).

---

### 1.4 Performance percebida

**Situação atual**
- **Só 2 arquivos `loading.tsx`** em toda a `app/` (`app/admin/loading.tsx`, `app/caixa/loading.tsx`). Rotas admin pesadas (estoque, financeiro, relatórios, auditoria, vendas) **não têm loading de rota** → tela “congela” na navegação = lentidão percebida mesmo quando o servidor responde.
- Layout admin é `force-dynamic` + `fetchCache: force-no-store` + `revalidate: 0` (`app/admin/layout.tsx`) → **toda** navegação re-renderiza no servidor sem cache. Isso é lentidão **real** somada à falta de feedback.
- **Já existe o ativo de marca ideal**: `components/branding/DragonOuroLoader.tsx` — dragão dourado em órbita (`text-amber-500`, `role=status`, `aria-label="Carregando"`). Usado só em login, busca do caixa e financeiro. **Não é o loader global.**

**Diagnóstico separado (conforme pedido):**
- **Lentidão real**: `force-dynamic` sem cache no layout admin; relatórios/estoque batem RPC a cada visita.
- **Falta de feedback**: ausência de `loading.tsx` na maioria das rotas.

**Problema para o cliente**
Clicar e “não acontecer nada” por 1–2s lê como travado. É a maior causa de “sistema lento” percebido — e aqui é 80% falta de feedback.

**Prioridade: P0 para o feedback visual** (barato e alto impacto); **P2 para acelerar cache** (mais arriscado).

**Solução recomendada**
1. **Loading institucional Jinlong**: promover `DragonOuroLoader` a loader global. Criar `loading.tsx` em cada rota admin pesada usando o dragão dourado + skeleton (`components/ui/skeleton.tsx`, `components/gerente/DataTableSkeleton.tsx` já existem).
   - Sobre o “caractere mandarim de prosperidade”: usar o dragão dourado (já é o símbolo da marca 金龙 = dragão dourado) como indicador. Se quiser o ideograma, **福** (fú, prosperidade) ou **金** (jīn, ouro/riqueza) em ouro pulsante funciona — mas manter **texto “Carregando…”** junto para **não parecer erro/símbolo solto**. Recomendo dragão + micro-legenda.
2. Onde não dá para acelerar agora, o loader institucional cobre a percepção.
3. Depois (P2): revisar `force-dynamic`/`no-store` — cachear dashboards que não precisam ser tempo-real.

**Complexidade: Baixa** (feedback) / **Média** (cache real).

---

## PARTE 2 — Módulos comerciais

> Legenda situação: ✅ existe e surfaced · 🟡 existe mas órfão/parcial · 🔴 ausente.
> O backend cobre quase tudo (tabelas: `usuarios, clientes, estoque, movimentos_estoque_log, tipos_movimento_estoque, movimentos_caixa, movimentacoes_caixa, vendas_pagamentos, comissoes_vendedores, venda_eventos, vendas_canceladas_auditoria, contas_pagar/receber, fornecedores…`).

### 2.1 Funcionários + permissões — 🔴 maior lacuna

**Situação atual**
- Tabela `usuarios` existe, mas papel é **enum fixo e grosso**: `perfil in ('OPERADOR','GERENTE','DONO','ADMIN')`. **Não há tabela de permissões por módulo** (nenhuma `permissoes`/`roles`/`role_permissions`).
- **Não existe nenhuma UI** para cadastrar funcionário / convidar usuário / gerenciar acesso (busca por `novo usuário|convidar|invite|createUser` = 0 resultados).
- Operador de caixa: existe contexto de operador no PDV (`CaixaPdvOperadorTabs`, `caixaSessaoOperador`), mas **quem cria o operador?** Hoje, presumivelmente, só via SQL/Supabase manual.
- Auditoria de ações: ✅ **existe e é boa** — `app/admin/auditoria` + `AuditoriaTimeline` cobrindo desconto/cancelamento/ajuste, com tabelas `venda_eventos` e `vendas_canceladas_auditoria`.

**Problema para o cliente**
O dono não consegue, sozinho, **cadastrar seus funcionários e dar acesso**. Sem isso, o cliente depende de você para operar — inviável para vender. É o **P0 mais crítico** do lote comercial.

**Prioridade: P0** (bloqueia operação autônoma do cliente).

**Solução recomendada**
1. UI `/admin/funcionarios`: listar, criar (nome, perfil, idioma, ativo), convidar via Supabase Auth (invite/`inviteUserByEmail` ou senha provisória), ativar/desativar.
2. **Permissões por módulo**: começar com **RBAC leve por perfil** (mapa perfil→módulos visíveis já dá 80% do valor) e evoluir para tabela `permissoes` granular só se um cliente exigir. Não construir ACL completa no MVP.
3. Reaproveitar `usuarios` + RLS existentes; auditoria já cobre o “quem fez o quê”.

**Complexidade: Média** (UI + fluxo de convite Auth; RBAC simples). Granular = Alta (adiar).

---

### 2.2 Estoque real — ✅ o mais maduro

**Situação atual**
- `/admin/estoque` implementado com **entrada, saída, ajuste, inventário** (`EstoqueTable.tsx` tem `ENTRADA/SAIDA/AJUSTE/INVENTARIO`) e **histórico de movimentação** via **Kardex** (`KardexSheet.tsx`) sobre `movimentos_estoque_log` + `tipos_movimento_estoque`.
- `AjusteSaldoModal.tsx` cobre ajuste/inventário. Recebimento e transferências têm rotas próprias.

**Problema para o cliente**
Baixo. Principal risco é **descoberta/nomenclatura** (usuário achar “entrada de mercadoria”) e o tamanho de fonte da tabela.

**Prioridade: P2** (funcional; polir, não construir).

**Solução recomendada**
1. Validar ponta-a-ponta os 5 fluxos (entrada/saída/ajuste/inventário/histórico) com dados reais.
2. Melhorar rótulos e a legibilidade da tabela (ver 1.1).
3. Garantir que toda venda no PDV baixa estoque e aparece no Kardex.

**Complexidade: Baixa** (QA + polish).

---

### 2.3 Financeiro básico — 🟡 parcial

**Situação atual**
- **Formas de pagamento**: hardcoded e funcionais no PDV — `dinheiro, pix, débito, crédito` (`CaixaPdvMetodoPagamentoSelector.tsx:17`), gravadas em `vendas_pagamentos`. Não configurável (ok p/ MVP).
- **Fechamento de caixa + conferência de operador**: ✅ existe server-side robusto — `caixaFechamentoServer.ts` (`calcular_valor_sistema_dinheiro_caixa`, `LIMITE_DIVERGENCIA_FECHAMENTO`), sangria/suprimento em `movimentacoes_caixa`.
- **Resumo diário**: parcial — dados existem (`movimentos_caixa`, vendas), mas não há um “resumo do dia” consolidado óbvio no admin.
- `/admin/financeiro` + contas a pagar/receber existem.

**Problema para o cliente**
O núcleo (fechar caixa, conferir operador) existe. Falta a **visão consolidada diária** que o dono abre de manhã (“quanto entrou ontem, por forma de pagamento, divergências”).

**Prioridade: P1.**

**Solução recomendada**
1. Tela/painel **“Resumo do dia”**: total vendido, por forma de pagamento, nº de vendas, cancelamentos, divergência de caixa — reaproveitando os RPCs de fechamento e `vendas_pagamentos`.
2. Expor claramente o fluxo de conferência de operador no fechamento.

**Complexidade: Baixa–Média** (agregação sobre dados já existentes).

---

### 2.4 Clientes — 🟡 construído mas órfão

**Situação atual**
- **CRUD completo existe** (`app/gerente/clientes/actions.ts`: `buscarClientesPaginadosAction`, `salvarClienteAction` insert/update, `excluirClienteAction` soft+hard delete) + modais (`ClienteEditarModal`, `ClientesListClient`).
- **MAS não está na navegação**: rota `clientes` **redireciona para catálogo** (`routes.ts` → `LEGACY_GERENTE_REDIRECTS.clientes = ROUTES.admin.catalogo`). Não há item “Clientes” no `adminV2SidebarNav.ts`.
- **Histórico de compras: stub.** `vendas.cliente_id` existe no schema, mas comentário de migration diz `ultima_compra=NULL até a Fase 7 (vendas.cliente_id)` → não computado.
- **Identificação no PDV: ausente.** Nenhuma seleção de cliente no checkout (`cliente_id` não aparece em `CaixaPageClient`).

**Problema para o cliente**
Vender “ERP com CRM de clientes” e não ter onde acessar clientes nem vincular a venda é uma promessa quebrada. Está a poucas horas de existir (código pronto, só desconectado).

**Prioridade: P1** (P0 se o cliente-alvo valoriza cadastro de clientes/fiado).

**Solução recomendada**
1. **Surfacing rápido**: adicionar item “Clientes” no sidebar e rota `/admin/clientes` apontando para os componentes já existentes; remover o redirect para catálogo.
2. Vincular `cliente_id` na venda do PDV (seletor opcional de cliente) → habilita histórico.
3. Computar histórico/última compra (a “Fase 7” já prevista).

**Complexidade: Baixa** (surfacing) / **Média** (vínculo PDV + histórico).

---

### 2.5 Relatórios — 🟡 bom, incompleto

**Situação atual**
- `/admin/relatorios` (`RelatoriosContent.tsx`) tem: **vendas por dia, top produtos (mais vendidos), estoque baixo**, com gráfico e filtros de período.
- **Falta relatório de fechamento** consolidado no admin (o fechamento vive no módulo caixa).

**Problema para o cliente**
Cobre 3 dos 4 pedidos. O dono vai procurar “fechamento” em Relatórios e não achar.

**Prioridade: P2.**

**Solução recomendada**
1. Adicionar aba **“Fechamento / caixa”** em Relatórios reaproveitando dados de `movimentos_caixa`/fechamento.
2. Aumentar fonte das tabelas (ver 1.1).

**Complexidade: Baixa.**

---

### 2.6 Impressão de etiquetas — 🟡 existe, órfão, sem impressora térmica

**Situação atual**
- Página completa existe: `app/gerente/estoque/imprimir-etiquetas/` (`ImprimirEtiquetasPageClient.tsx` 287 linhas + `EtiquetaCarrinho.tsx`) com fluxo de carrinho de etiquetas e **geração de PDF**.
- **Só PDF** — nenhuma integração com impressora térmica/etiqueta (0 ocorrências de `ZPL/Zebra/Argox/Elgin/Brother/térmica`).
- **Órfã na navegação**: redirect `estoque/imprimir-etiquetas → admin.estoque` (`routes.ts`) e sem item no sidebar.

**Problema para o cliente**
Loja de importados vive de etiqueta com código de barras/preço. PDF genérico raramente casa com a etiqueta térmica real do cliente (dimensão, gap). E hoje nem está acessível pelo menu.

**Prioridade: P1** (P0 se o primeiro cliente etiqueta produto — comum em importados).

**Solução recomendada**
1. **Surfacing**: item “Etiquetas” no sidebar + rota admin (código já existe).
2. Confirmar dados necessários por etiqueta: nome, preço, código de barras (EAN), SKU.
3. Impressoras comuns: manter **PDF com tamanho de etiqueta configurável** (100x50, 50x30 etc.) como caminho universal; validar 1 impressora térmica alvo (ex.: Elgin/Argox) do cliente real antes de investir em ZPL nativo.

**Complexidade: Baixa** (surfacing) / **Média** (templates de tamanho + validação em impressora real).

---

## Ordem ideal de execução — rumo ao primeiro cliente pagante

Princípio: **desbloquear operação autônoma primeiro, depois polir a percepção**. Muita coisa é “conectar o que já existe”, não construir.

**Bloco 0 — Bloqueadores de operação (P0)**
1. **Funcionários + acesso** (`/admin/funcionarios` + convite Auth + RBAC por perfil). Sem isso o cliente não roda sozinho.
2. **Loading institucional Jinlong** global (promover `DragonOuroLoader` + `loading.tsx` nas rotas admin). Barato, resolve “sistema lento”.

**Bloco 1 — Surfacing de módulos prontos (P1, baixo custo, alto valor percebido)**
3. **Clientes** no menu (remover redirect, rota admin) + vínculo `cliente_id` no PDV.
4. **Etiquetas** no menu (código pronto) + tamanho de etiqueta configurável.
5. **Resumo do dia** no Financeiro (agregação sobre fechamento/pagamentos).

**Bloco 2 — Coerência visual (P1)**
6. Convenção de **botões** (uma cor de ação; remover azul/âmbar crus e resíduo dark).
7. **Bordas de input** visíveis + estados hover/focus/error padronizados.
8. **Escala tipográfica** + sweep de fontes minúsculas (PDV, estoque, relatórios, auditoria).

**Bloco 3 — Completude e polish (P2)**
9. Relatório de **fechamento** em Relatórios.
10. QA ponta-a-ponta do **Estoque** (5 fluxos).
11. Otimização de **cache real** (`force-dynamic`) nos dashboards.
12. Permissões **granulares** por módulo (só se um cliente exigir).

---

## Verificação (como validar o diagnóstico / futuras entregas)
- **UX**: rodar `npm run dev:web`, percorrer PDV → Estoque → Financeiro → Relatórios medindo (a) fontes <13px, (b) bordas de input em cards brancos, (c) feedback ao navegar (loading). Comparar antes/depois.
- **Módulos**: confirmar no menu a presença de Funcionários/Clientes/Etiquetas; criar um funcionário e logar como ele; vincular cliente numa venda e ver histórico; imprimir uma etiqueta.
- **Backend já existente**: `usuarios`, `clientes`, `movimentos_estoque_log`, `vendas_pagamentos`, `movimentos_caixa` — validar via Supabase MCP/`execute_sql` que os dados fluem do PDV para relatórios/kardex.

## Escopo / não-objetivos
- **Nenhum código alterado nesta entrega** — somente diagnóstico e roadmap.
- Não inclui integrações fiscais (NF-e), e-commerce ou multi-loja além do que já existe.
