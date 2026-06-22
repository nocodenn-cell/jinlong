# Plano de Execução — Fase 2 (Valor Percebido)

> Documento de produto. Papel assumido: **Diretor de Produto ERP + Especialista em Operação de Varejo**.
> Stack confirmada: Next.js 15 (App Router) + React 19 + TypeScript + Supabase (PostgreSQL, RLS por loja) + Edge Functions Deno. Carrinho em Zustand+persist (`shared-core/src/stores/unifiedCartStore.ts`).

---

## Context

A Fase 1 (núcleo operacional) está concluída e validada por execução (25/25): venda varejo/atacado, estoque atômico, anti-oversell, pagamentos, caixa, RLS multi-loja, WITH CHECK e anti-fraude de preço. **Não há mais trabalho de estabilização do núcleo nesta fase.**

A Fase 2 muda o eixo de *confiabilidade* para *valor percebido pelo lojista*. O objetivo é entregar funcionalidades que o operador e o dono **sentem no dia a dia**, com o menor risco possível, sem tocar em venda/estoque/caixa/financeiro já validados.

Decisões de produto já tomadas (confirmadas com o solicitante):
- **Venda em Espera** será **persistida no banco** (sobrevive a troca de terminal, auditável, multi-operador). Opera **antes** da finalização — não toca no núcleo transacional.
- **Auditoria Visual** será uma **timeline unificada somente-leitura** sobre os ledgers que **já existem e já são gravados** hoje.

Regras invioláveis desta fase:
- Não refatorar o núcleo operacional.
- Não alterar venda, estoque, caixa ou financeiro já validados (RPCs `finalizar_venda_*`, `cancelar_venda_*`, `decrementar_estoque_seguro`, fechamento de caixa).
- Não abrir frentes fora do roadmap. Sem IA, CRM, fidelidade, marketplace ou integrações novas.

---

## Visão geral dos 4 itens

| # | Item | O que entrega ao lojista | Toca o núcleo? | Complexidade | Risco |
|---|------|--------------------------|----------------|--------------|-------|
| 1 | Venda em Espera | Atender vários clientes sem perder o carrinho | Não (pré-venda) | Média | Baixo |
| 2 | Auditoria Visual | Dono enxerga "quem fez o quê" sem SQL | Não (read-only) | Baixa–Média | Muito baixo |
| 3 | UX Cadastro de Produto | Cadastrar mais rápido e com menos erro | Não (CRUD existente) | Baixa | Baixo |
| 4 | Gestão Visual de Faixas de Atacado | Configurar preços por quantidade sem dev | Não (tabela já existe) | Média | Baixo–Médio |

---

## 1. Venda em Espera (Parked / Hold Sale)

### Objetivo operacional
Permitir que o operador **pause uma venda em andamento** (cliente foi buscar mais um item, esqueceu o cartão, fila travada) e **atenda outro cliente imediatamente**, retomando a venda pausada depois — **sem perder itens, quantidades, descontos ou cliente associado**. É a feature nº 1 de fluidez de balcão em varejo de alto giro.

### Como o mercado resolve
- **Bling:** "Salvar venda" no PDV gera uma venda em rascunho recuperável por lista; volta exatamente como estava.
- **Omie:** Pedido de venda em status *rascunho/aberto*; o PDV reaproveita o mesmo pedido até faturar.
- **Linx (Microvix/Big):** "Venda em espera" / "ticket suspenso" é nativo — botão dedicado no PDV, lista de tickets suspensos com identificação (nome/número), padrão do varejo.
- **TOTVS (Chef/Varejo):** "Conta/comanda em aberto" — mesma mecânica de suspender e retomar, central na operação de loja.
- **Sankhya:** Pré-venda/pedido em aberto convertido em nota no faturamento; rascunho persistido no servidor.

**Convergência:** todos persistem **no servidor** (não só no terminal) e oferecem **lista nomeada de vendas suspensas**. Nossa decisão (persistir no banco) está alinhada ao padrão de mercado.

### Fluxo ideal do usuário
1. Operador monta o carrinho normalmente (itens, descontos, cliente opcional).
2. Clica **"Colocar em Espera"** → informa um rótulo curto (nome do cliente, nº senha, "moça do casaco azul").
3. Carrinho é salvo no banco e a tela limpa instantaneamente para o próximo cliente.
4. Aba/painel **"Em Espera"** mostra a lista de vendas pausadas **do operador/loja** com rótulo, total, hora e nº de itens.
5. Operador clica **"Retomar"** → o carrinho volta exatamente como estava (preços recalculados no servidor por segurança).
6. Conclui a venda pelo fluxo de finalização **já existente e validado** (sem qualquer alteração nele). Ao concluir, o registro em espera é marcado como `CONVERTIDA`/removido.
7. Opcional: descartar uma venda em espera (com motivo, auditável).

### Desenho técnico (sem tocar o núcleo)
- **Nova tabela** `vendas_em_espera`: `id`, `loja_id`, `operador_id`, `caixa_id` (opcional), `rotulo` (text), `itens` (jsonb — snapshot de `ItemCarrinho[]`), `totais` (jsonb), `cliente_id` (FK opcional), `desconto_gerente_percentual`/`token` (opcional), `status` (`EM_ESPERA|RETOMADA|CONVERTIDA|DESCARTADA`), `criada_em`, `atualizada_em`, `descartada_motivo`.
- **RLS por loja** seguindo o padrão existente (`usuarios.loja_id`): operador vê as próprias + gerente/dono veem as da loja. Espelhar o padrão de `venda_eventos`.
- **RPCs novas e isoladas:** `colocar_venda_em_espera(...)`, `retomar_venda_em_espera(p_id)`, `descartar_venda_em_espera(p_id, p_motivo)`. Nenhuma toca `vendas`/`itens_venda`/`estoque`/`caixas`.
- **Estado:** reusar o Zustand `useCartStore` (`shared-core/src/stores/unifiedCartStore.ts`) — adicionar ações `salvarEmEspera()` / `carregarDeEspera(payload)` que apenas serializam/restauram o estado atual. **Recálculo de preço autoritativo no retorno** via RPC já existente `calcular_preco_produto` (proteção anti-fraude da Fase 1 preservada).
- **UI:** botão em `CaixaPdvOperacoesButtons.tsx`; nova aba em `CaixaPdvOperadorTabs.tsx`; listagem com `DataTable`/`Sheet` do design system.

### Riscos
- **Estoque:** itens em espera **não** reservam estoque → ao retomar, um item pode ter zerado. Mitigação: recálculo no retorno + a proteção anti-oversell da Fase 1 atua na finalização (comportamento correto, não bug). Sinalizar visualmente itens indisponíveis ao retomar.
- **Desconto gerente com token expirado:** token pode vencer enquanto em espera. Mitigação: ao retomar, se token expirou, remover desconto gerente e exigir nova autorização (mesma regra atual).
- **Crescimento da tabela:** vendas em espera abandonadas. Mitigação: índice por `loja_id`/`status` e limpeza/expiração configurável (ex.: descartar automaticamente após fechamento de caixa, sem deletar — vira `DESCARTADA`).

### Dependências
- Nenhuma externa. Reusa carrinho (Zustand), `calcular_preco_produto`, padrão RLS de `venda_eventos`, componentes do PDV. **Bloqueia a finalização? Não** — usa o fluxo de finalização intocado.

---

## 2. Auditoria Visual (Timeline Unificada)

### Objetivo operacional
Dar ao **dono/gerente** uma tela única que responda **"quem fez o quê, quando e por quê"** sem precisar de SQL ou suporte técnico. Os dados **já são gravados** pela Fase 1 — falta a janela de visualização. Aumenta a sensação de controle e confiança no sistema (alto valor percebido por baixo custo).

### O que já existe (e será apenas exposto)
- `venda_eventos` (ledger de vendas e cancelamentos) — **já tem UI parcial** em `/admin/vendas`.
- `vendas_canceladas_auditoria` (motivo, operador, valor estornado).
- `movimentos_estoque_log` / Kardex — **já tem UI** (Sheet em `/admin/estoque`).
- `system_alerts` (margem negativa, preço fora do padrão, estoque inconsistente) — **gravado, SEM tela**.
- `descontos_venda` (autorização gerente + operador que finalizou) — **gravado, SEM tela**.

### Como o mercado resolve
- **Bling/Omie:** "Histórico"/"Log de atividades" por registro e por usuário; trilha de alterações de cadastro e operações.
- **Linx:** Auditoria de PDV (cancelamentos, sangrias, descontos) com filtro por operador/terminal/período — foco em prevenção de perdas.
- **TOTVS (Protheus):** Log de auditoria robusto (LOGACESSO) — quem alterou o quê, antes/depois.
- **Sankhya:** Auditoria de campos e ações por usuário, consultável na interface.

**Convergência:** uma **linha do tempo filtrável por operador/período/tipo de evento**, voltada a prevenção de perdas e conferência. É exatamente o que entregaremos.

### Fluxo ideal do usuário
1. Dono entra em **Admin → Auditoria** (nova rota `/admin/auditoria`).
2. Vê uma **timeline cronológica** mesclando os ledgers: venda concluída, venda cancelada (+motivo), ajuste de estoque (+observação), alerta do sistema (margem/preço), desconto de gerente aplicado.
3. Filtra por **período, operador, loja e tipo de evento** (reusar `FilterBar` + `dateRangePresets.ts`).
4. Clica num evento → **Sheet de detalhe** com o payload completo (itens, valores, antes/depois quando aplicável).
5. Cada linha mostra **ícone/cor por tipo** e **identificação do responsável** (operador/gerente).

### Desenho técnico (somente leitura)
- **RPC de leitura unificada** `listar_eventos_auditoria(p_loja_id, p_inicio, p_fim, p_tipos[], p_operador_id, p_offset, p_limit)` que faz `UNION ALL` normalizado sobre as tabelas existentes, retornando colunas comuns (`ocorrido_em`, `tipo`, `operador`, `resumo`, `detalhe jsonb`). **Nenhum INSERT/UPDATE/DELETE.**
- Reusar `assertAdminSession` / `adminPolicy` para autorização e RLS por loja já vigente.
- **UI:** nova página em `app/admin/auditoria/page.tsx` (Server Component) + `actions.ts` (Server Action chamando a RPC) + `_components/AuditoriaTimeline.tsx` (`'use client'`) com `DataTable`/`Sheet`/`Badge` do `components/ui/admin-v2/`.
- Preencher de quebra os 2 gaps (`system_alerts`, `descontos_venda`) ficando visíveis dentro da própria timeline (resolve o gap sem criar telas avulsas).

### Riscos
- **Performance do UNION** em períodos longos. Mitigação: filtro de período obrigatório (default 7/30 dias), paginação por offset/limit, uso dos índices `*_occurred_at`/`criado_em` já existentes.
- **Inconsistência de schema entre ledgers.** Mitigação: normalização feita na RPC, não no app.
- Risco operacional **muito baixo**: zero escrita, zero mudança no núcleo.

### Dependências
- Depende apenas de tabelas/índices já existentes. Independente dos demais itens. Pode ser feito em paralelo.

---

## 3. Melhorias de UX do Cadastro de Produto

### Objetivo operacional
Reduzir **tempo e erro** ao cadastrar/editar produtos. Hoje há duas modais (`NovoProdutoModal.tsx` rápido e `ProdutosEditarCatalogoModal.tsx` completo) com 15+ campos (inclusive fiscais NCM/CSOSN/CFOP) em inputs HTML nativos. O cadastro funciona, mas a densidade fiscal intimida e há fricção (sem agrupamento claro, feedback de margem só no submit, sem foco em campos críticos).

### Como o mercado resolve
- **Bling:** Cadastro em **abas** (Dados gerais, Estoque, Fiscal, Imagens); campos fiscais separados dos comerciais; sugestão de NCM.
- **Omie:** Formulário seccionado com campos fiscais colapsáveis e validação inline.
- **Linx:** Cadastro orientado a varejo com foco em preço/estoque na frente e fiscal ao fundo.
- **TOTVS/Sankhya:** Cadastro denso porém organizado por pastas/abas, com obrigatoriedade condicional (campo fiscal só exigido se emite NF).

**Convergência:** **agrupar por seções/abas** (Comercial → Estoque → Fiscal), **inline validation**, e **mostrar a margem em tempo real**. Melhoria de forma, não de função — baixo risco.

### Fluxo ideal do usuário (escopo da melhoria, sem novos campos)
1. Modal organizada em **3 seções**: **Comercial** (nome, código de barras, preços varejo/atacado/custo, gatilho), **Estoque/Classificação** (categoria, marca, unidade, fornecedor), **Fiscal** (NCM, CSOSN, CFOP, CEST, CST) — fiscal **colapsado por padrão**.
2. **Indicador de margem em tempo real** ao digitar preço de custo/venda (verde/amarelo/vermelho), espelhando a regra do trigger `trg_produtos_margem_biu` **antes** do submit — evita o erro de salvar e ser bloqueado.
3. **Validação inline** (Zod já existe) por campo, com mensagens claras (NCM = 8 dígitos, preço > 0).
4. **Foco automático** no nome ao abrir; **Enter** avança; salvar com atalho de teclado.
5. Mensagem de sucesso e opção **"salvar e cadastrar outro"** para cadastro em lote.

### Desenho técnico
- **Sem mudança de schema, sem mudança de RPC/actions.** Reorganização de `NovoProdutoModal.tsx` / `ProdutosEditarCatalogoModal.tsx` usando o design system "Jin Long" e `DragonModal` existentes.
- Indicador de margem é **cálculo puramente client-side** espelhando a regra já conhecida (custo vs venda); não substitui o trigger do banco (que continua sendo a autoridade).
- Reusar `criarProduto()` / `atualizarDadosProdutoGerente()` (`app/gerente/produtos/actions.ts`) inalterados.

### Riscos
- **Baixíssimo.** Mudança cosmética/ergonômica. Único cuidado: não alterar nomes de campos enviados às actions (contrato com Zod/RPC). Validar paridade dos campos após a reorganização.

### Dependências
- Independente. Pode rodar em paralelo. Boa candidata a "quick win" inicial.

---

## 4. Gestão Visual de Faixas de Atacado

### Objetivo operacional
Permitir que o gerente **crie e edite faixas de preço por quantidade** (ex.: 5un=R$90, 10un=R$80, 20un=R$70) **pela interface**, sem depender de dev/SQL. A modelagem **já existe e já é aplicada na venda** (`precos_atacado` + `calcular_preco_produto`, migrations 077/124), mas **não há UI** — hoje o gerente só configura a faixa única simples (`preco_atacado` + `quantidade_gatilho_atacado`). Isso destrava o atacado escalonado, diferencial competitivo para o lojista.

### Como o mercado resolve
- **Bling:** "Tabelas de preços" e preço por quantidade configuráveis por produto/lista.
- **Omie:** Tabelas de preço com faixas e regras por cliente/quantidade.
- **Linx:** Preço por faixa de quantidade nativo no varejo/atacado.
- **TOTVS:** Tabelas de preço com regras escalonadas por quantidade e vigência.
- **Sankhya:** Política de preços com faixas e múltiplas tabelas.

**Convergência:** **grade editável de faixas** (quantidade mínima → preço) por produto, com validação de sobreposição e de margem. Vamos expor exatamente o que o banco já suporta.

### Fluxo ideal do usuário
1. No produto, aba/seção **"Faixas de Atacado"** (dentro da modal de edição ou rota `/gerente/produtos/[id]/faixas`).
2. **Grade de faixas**: lista ordenada por `quantidade_minima` com `preço unitário` e status ativo.
3. **Adicionar faixa** → informar quantidade mínima e preço; **editar/remover** inline.
4. **Pré-visualização** mostrando "para X unidades, preço aplicado = Y" (espelhando a lógica de `calcular_preco_produto`: maior `quantidade_minima` aplicável vence).
5. **Validações na tela**: impedir faixas duplicadas/sobrepostas (respeitando os índices únicos existentes) e avisar sobre margem negativa antes de salvar (trigger `trg_fn_precos_atacado_margem` é a autoridade final).

### Desenho técnico
- **CRUD novo sobre tabela existente** `precos_atacado` (não altera a tabela nem a função de cálculo). Server actions novas + RPCs simples `upsert_faixa_atacado` / `remover_faixa_atacado` respeitando RLS (GERENTE/DONO já têm permissão de escrita na tabela).
- **UI:** componente de grade reutilizando `DataTable`/inputs do design system; integrar como nova seção da modal de produto (alinha com o item 3).
- **Pré-visualização** reusa a lógica de prioridade já documentada (faixa específica → catálogo → varejo); idealmente chamando `calcular_preco_produto` para garantir paridade com a venda.

### Riscos
- **Conflito com a faixa simples do catálogo** (`produtos.preco_atacado` + `quantidade_gatilho_atacado`). Mitigação: deixar claro na UI a precedência (faixa específica vence catálogo) e, opcionalmente, ocultar/explicar o campo simples quando houver faixas detalhadas. **Não remover** o campo simples (é usado como fallback no cálculo).
- **Margem negativa / preço abaixo do custo.** Mitigação: validação na UI + trigger do banco como guarda final (Fase 1 preservada).
- **Sobreposição de quantidade mínima.** Mitigação: validar contra os índices únicos existentes antes do upsert.

### Dependências
- **Depende do item 3** para encaixe ideal na UX (compartilham a modal de produto). Tecnicamente independente do banco. Recomendado **logo após** o item 3.

---

## Ordem de implementação recomendada

Sequência por **valor/risco** e por **dependência de UX compartilhada**, não por preferência técnica:

1. **Auditoria Visual** (read-only, risco mínimo, dados já existem) — *quick win* de alto valor percebido pelo dono; valida o pipeline da Fase 2 sem qualquer risco ao núcleo.
2. **UX Cadastro de Produto** (cosmético, baixo risco) — prepara a base de UI da modal de produto para o item 4.
3. **Gestão Visual de Faixas de Atacado** (encaixa na modal já melhorada no passo 2; CRUD sobre tabela existente).
4. **Venda em Espera** (maior superfície: nova tabela + RPCs + estado do PDV) — feita por último com o time já "aquecido" nos padrões da Fase 2, mantendo o fluxo de finalização validado intocado.

> Observação: itens 1 e 2 podem correr **em paralelo** se houver capacidade — são totalmente independentes.

---

## Verificação (por item, end-to-end)

- **Auditoria Visual:** gerar eventos reais no PDV (uma venda, um cancelamento com motivo, um ajuste de estoque, disparar um `system_alert` de margem) → abrir `/admin/auditoria` → confirmar que todos aparecem na timeline com operador, hora e detalhe corretos; testar filtros por período/operador/tipo; confirmar isolamento por loja (RLS) logando como usuários de lojas diferentes.
- **UX Cadastro de Produto:** cadastrar e editar um produto cobrindo as 3 seções; tentar salvar com margem negativa (confirmar aviso na UI **e** bloqueio do trigger); confirmar que os campos enviados às actions são idênticos aos atuais (sem regressão no contrato Zod/RPC).
- **Faixas de Atacado:** criar 3 faixas (5/10/20 un) num produto → no PDV, lançar 7, 15 e 25 unidades e confirmar que o preço aplicado bate com a pré-visualização e com `calcular_preco_produto`; tentar faixa duplicada/sobreposta (confirmar bloqueio); tentar preço abaixo do custo (confirmar guarda).
- **Venda em Espera:** montar carrinho com desconto e cliente → colocar em espera com rótulo → atender outra venda → retomar e confirmar restauração idêntica (com recálculo de preço); finalizar pelo fluxo existente; testar retomada com item que zerou estoque (anti-oversell atua) e com token de gerente expirado (exige nova autorização); confirmar RLS (operador vê só as suas, gerente vê as da loja).

### Comandos de apoio
- Migrations: `/home/user/fastproduct/backend/supabase/migrations/` (seguir numeração sequencial; padrão de RLS por `usuarios.loja_id`).
- RLS: `backend/package.json` → `test:rls-policies`.
- Edge/typecheck: `check:edge` e build do `pdv-importados` (Next 15).

---

## Fora de escopo (reafirmado)
Sem IA, CRM, fidelidade, marketplace ou integrações. Sem refatorar núcleo. Sem alterar venda/estoque/caixa/financeiro validados. Qualquer item que exija tocar esses módulos deve ser reavaliado antes de prosseguir.
