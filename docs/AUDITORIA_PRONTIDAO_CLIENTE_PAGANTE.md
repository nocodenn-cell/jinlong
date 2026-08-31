# AUDITORIA DE PRONTIDÃO PARA CLIENTE PAGANTE — JINLONG

> **Documento canônico** — Single Source of Truth da prontidão operacional e backlog de fechamento.
> Cada correção referencia ID aqui e atualiza status com evidência (PR/SHA).

---

## 1. Executive Summary

| Campo | Valor |
|-------|-------|
| **SHA auditada** | `9e6292838f708cd0e5b0404a09601dd7c4047591` |
| **Data auditoria** | 2026-08-31 |
| **Última atualização** | 2026-08-31 (Onda 1 Lotes 1–4C — IDs 221, 222, 121, 122, 5, 6, 27, 28, 219, 220 fechados/parciais) |
| **Ambiente** | Código + migrations/RPCs/tests/docs; produção somente leitura (evidência documental/API) |
| **Total capacidades** | 250 (IDs 1–250 únicos, validados) |
| **P0** | 117 |
| **P1** | 72 |
| **P2** | 28 |
| **P3** | 33 |

**Saneamento Etapa 0:** matriz regenerada no repositório; IDs 1–250 únicos; tipografia da coluna "Bloqueia piloto?" normalizada (`Não`); scores recalculados.

---

## Fechamentos — Onda 1 / Lote 1 (IDs 221, 222)

**Data:** 2026-08-31 · Branch: `cursor/onda1-hover-selection-221-222-0a79`

### ID 221 — Hover ícones / ações

| Campo | Valor |
|-------|-------|
| Status anterior | IMPLEMENTADO PARCIALMENTE |
| Status novo | **IMPLEMENTADO E VALIDADO** |
| Reprodução | Em tema `dragon-light`, `.gerente-row-actions` com `opacity: 0` até `tr:hover` — ações/ícones invisíveis sem hover; hover de linha em `.gerente-table-dragon` usava `rgba(255,255,255,0.035)` (quase invisível no light) |
| Causa raiz | Legado dark/terminal em `theme-oriental.css` (`opacity: 0` + hover branco 3.5%) sem override adequado no tema claro |
| Arquivos | `pdv-importados/styles/theme-oriental.css`, `pdv-importados/VISUAL_PHILOSOPHY.md` |
| Solução | Em `dragon-light`: `opacity: 1` em `.gerente-row-actions`; hover de linha âmbar legível; `focus-within` preserva ações no teclado |
| Teste | `tests/visual-hover-selection.ssot.test.ts` (4 asserts) |
| Evidência | `/opt/cursor/artifacts/onda1-221-actions-before.png`, `onda1-221-actions-after.png` |
| Alcance | Tabelas que usam `gerente-row-actions` / `CadastroLinhaAcoesPadrao` / `CadastroRowActions` |
| Compartilha causa com 222? | **Não** (mesmo tema light, regras CSS distintas) |

### ID 222 — Seleção de texto

| Campo | Valor |
|-------|-------|
| Status anterior | IMPLEMENTADO PARCIALMENTE |
| Status novo | **IMPLEMENTADO E VALIDADO** |
| Reprodução | `body` com `selection:bg-success/35 selection:text-success-foreground` → texto branco sobre wash verde claro (contraste ~1.4:1) |
| Causa raiz | `success-foreground` = branco (`--color-fg-on-success`) inadequado para seleção em fundo claro |
| Arquivos | `pdv-importados/app/layout.tsx`, `pdv-importados/app/globals.css` |
| Solução | SSOT `::selection` em `globals.css`: brand 28% + `var(--color-fg)`; removidas classes Tailwind antigas do `body` |
| Teste | `tests/visual-hover-selection.ssot.test.ts` |
| Evidência | `/opt/cursor/artifacts/onda1-222-selection-before.png`, `onda1-222-selection-after.png` |
| Alcance | Global (toda a app) — intencional |

**Nota:** o conflito histórico `--accent` / `hsl(#hex)` (AUDITORIA_CONSISTENCIA_VISUAL P0-01) já estava mitigado em `tailwind.config.js` (`accent → var(--color-brand)`); Button canônico usa `.fp-btn--*` e não depende desse anti-padrão.

---

## Fechamentos — Onda 1 / Lote 2 (IDs 121, 122)

**Data:** 2026-08-31 · Branch: `cursor/onda1-categoria-marca-121-122-0a79` · PR **#354** · HEAD `bf817646`

### Reconciliação com trabalho prévio

| Item | Situação |
|------|----------|
| Fluxo formulário produto (quick-create → lista) | Já corrigido em `e1327e62` / PR #330 (`mergeOpcoesFiltrosPreservandoLocal` + `onOpcaoCriada` → estado local). **Não duplicado.** |
| Fix `revalidatePath` categorias admin (`9018490e`) | Existia só em branch `claude/sprint-ux-onda2-pdv-busca` — **não estava na main**. Portado neste lote. |
| IDs 221/222 | Não reabertos. |

### ID 121 — Categoria imediata

| Campo | Valor |
|-------|-------|
| Status anterior | IMPLEMENTADO PARCIALMENTE |
| Status novo | **IMPLEMENTADO E VALIDADO** |
| Reprodução (formulário) | Quick-create → opção entra no `<select>` e fica selecionada; refresh stale de props não apaga (testes `ProdutoFormModal.categoriaOpcoes`) |
| Reprodução (gestão `/admin/categorias-produtos`) | Após create/rename/toggle, lista podia ficar stale: `REVALIDATE_PATH` apontava para `/gerente/categorias-produtos` (redirect sem RSC) |
| Causa raiz (form) | Já resolvida (#330): estado local + merge por id (SSoT = tabela `categorias`; UI só espelha) |
| Causa raiz (gestão) | `revalidatePath` na rota legada errada; `router.refresh()` ausente em update/toggle |
| Arquivos | `app/gerente/categorias-produtos/actions.ts`, `CategoriasProdutosContent.tsx` (+ tests); form já coberto por #330 |
| Correção neste lote | Port do fix de paths admin + `router.refresh` em update/toggle (não reinventar lista paralela) |
| Testes | `categorias-produtos/actions.test.ts`, `CategoriasProdutosContent.behavior.test.tsx`, `ProdutoFormModal.categoriaOpcoes.behavior.test.tsx`, `mergeOpcoesFiltros.test.ts` |
| Evidência | `/opt/cursor/artifacts/onda1-121-122-vitest.log` |
| Duplicidade | Sem UNIQUE em `categorias.nome` — criar de novo com mesmo nome **ainda é permitido** pelo banco; o fix evita a *indução* a duplicar por lista stale |
| Permissões | Continua via `assertGerenteSession` + RLS; refresh não contorna auth |

### ID 122 — Marca imediata

| Campo | Valor |
|-------|-------|
| Status anterior | IMPLEMENTADO PARCIALMENTE |
| Status novo | **IMPLEMENTADO E VALIDADO** |
| Reprodução | Modo completo → quick-create marca → aparece/seleciona; merge preserva em refresh stale |
| Causa raiz (form) | Mesmo mecanismo de #330 (`onMarcasChange` + merge); faltava teste de paridade |
| Causa raiz (gestão `/admin/marcas-produtos`) | Já revalidava `/admin/marcas-produtos` + tag `catalogo-opcoes-filtro` — **sem gap de path** |
| Arquivos | Sem mudança de produção necessária além da cobertura; `marcas-produtos/actions.test.ts` (novo), `ProdutoFormModal.marcaOpcoes.behavior.test.tsx` (novo) |
| Correção neste lote | Validação + testes de regressão (código de form/actions já adequado na main) |
| Testes | `ProdutoFormModal.marcaOpcoes.behavior.test.tsx`, `marcas-produtos/actions.test.ts`, `mergeOpcoesFiltros.test.ts` |
| Evidência | `/opt/cursor/artifacts/onda1-121-122-vitest.log` |
| Duplicidade | Sem UNIQUE em `marcas.nome` — mesmo comportamento documentado da categoria |
| SSoT | Tabela `marcas`; sem cache paralelo permanente |
| Nota | Campo marca permanece atrás de "Modo completo" (fora de escopo promover UI) |

---

## Fechamentos — Onda 1 / Lote 3 (IDs 5, 6)

**Data:** 2026-08-31 · Branch: `cursor/onda1-busca-autocomplete-5-6-0a79` · PR **#355**

### Mapeamento matriz × GO operacional

| Matriz | Rótulo oficial | Pergunta operacional do GO |
|--------|----------------|----------------------------|
| **ID 5** | Autocomplete incremental | Sugestões úteis enquanto digita + lista navegável |
| **ID 6** | Pesquisa SKU/referência | Localizar por `codigo_interno` (e, com candidatos, localizar rápido entre similares) |

### Comportamento antes (main)

| Caso | Antes |
|------|--------|
| `cadeira v` (Enter) | `ambiguo` → toast; sem lista; limite 3 cortava candidatos |
| Digitação parcial | Sem typeahead |
| SKU `CAD-VERM-G` | Não buscava `codigo_interno` |
| Barcode | Match direto (OK) |

### ID 5 — Autocomplete incremental

| Campo | Valor |
|-------|-------|
| Status anterior | IMPLEMENTADO PARCIALMENTE |
| Status novo | **IMPLEMENTADO E VALIDADO** |
| Causa raiz | Sem debounce/typeahead; ambiguidade só toast; limite 3 |
| Solução | Port candidatos (lista + teclado) + `useCaixaBuscaSugestoes` (debounce 280ms, reusa `buscarProdutoParaCaixa`); skip se parece barcode |
| Arquivos | `CaixaCandidatosProduto.tsx`, `CaixaSearchBar.tsx`, `CaixaPageClient.tsx`, `caixaBuscaSugestoes.ts`, `useCaixaBuscaSugestoes.ts`, `caixaCatalogo.impl.ts`, i18n |
| Teclado | ↑↓ Enter Esc na lista |
| Scanner | Typeahead não dispara em `^\d{6,}$`; Enter/wedge segue pipeline |
| Testes | `caixaBuscaSugestoes.test.ts`, `CaixaSearchBar.behavior.test.tsx`, `caixaCatalogo.impl.test.ts`, `webCaixaScanProcess.test.ts` |
| Evidência | `/opt/cursor/artifacts/onda1-5-6-vitest.log` |
| Observação | Migration accent-insensitive existe em branch auxiliar — **não aplicada** neste lote (report only) |

### ID 6 — Pesquisa SKU/referência

| Campo | Valor |
|-------|-------|
| Status anterior | NÃO IMPLEMENTADO |
| Status novo | **IMPLEMENTADO E VALIDADO** |
| Causa raiz | Lookup do caixa não consultava `codigo_interno` |
| Solução | Após barcode, antes do nome: ILIKE em `codigo_interno` (limite 8, order nome); ambíguo → candidatos |
| Arquivos | `caixaCatalogo.impl.ts` (+ tests); DTO já expunha o campo no port de candidatos |
| SSoT | Tabela `produtos` via `buscarProdutoParaCaixaImpl` — sem catálogo paralelo |
| Testes | `caixaCatalogo.impl.test.ts` (SKU exato + parcial ambíguo) |
| Evidência | `/opt/cursor/artifacts/onda1-5-6-vitest.log` |

### Não alterado (regressão)

Preço/atacado/estoque/desconto/pagamento/persistência da venda — seleção só localiza; preço via `calcularPrecoProdutoCaixa` / pipeline canônico.

---

## Fechamentos — Onda 1 / Lote 4A (ID 27)

**Data:** 2026-08-31 · Branch: `cursor/onda1-historico-vendas-27-0a79` · PR **#356** · SHA `794841cd`

### Reprogramação (sem implementação) — ID 40 → Onda 2

| Campo | Valor |
|-------|-------|
| ID | **40** — Exibição faixa aplicada (atacado) |
| Decisão | **Reprogramado de Onda 1 para Onda 2 — Atacado Runtime** |
| Motivo | Depende do mesmo SSoT de pricing/faixas dos IDs 32–36; não propagar `regra_id`/threshold na UI antes de certificar o runtime do atacado |
| Prioridade | **P1 mantida** |
| Status | **IMPLEMENTADO PARCIALMENTE** (inalterado até implementação futura) |
| Implementação neste lote | **Não** |

### ID 27 — Histórico vendas do operador (lista + detalhe do dia)

| Campo | Valor |
|-------|-------|
| Status anterior | IMPLEMENTADO PARCIALMENTE |
| Status novo | **IMPLEMENTADO E VALIDADO** |
| Evidência antes | `listarHistoricoOperadorImpl` / `obterDetalheHistoricoVendaImpl` com `clienteNome: null` hardcoded (TODO fase-7); UI `CaixaHistoricoSheet` exibia `—` mesmo com `vendas.cliente_id` preenchido |
| Causa raiz | Join `vendas.cliente_id → clientes.nome` não implementado; mapper devolvia `clienteNome: null` fixo |
| SSoT | `vendas.cliente_id` → `clientes.nome` via relação PostgREST na mesma query |
| Solução | `.select(..., cliente_id, clientes(nome))` na lista e no detalhe; helper `extrairClienteNomeDeVenda` |
| Arquivos | `app/caixa/server/caixaVendaEspera.impl.ts`, `app/caixa/server/caixaVendaEspera.test.ts` |
| Dados adicionais | Somente `clientes.nome` (sem CPF/telefone/endereço) |
| N+1 | **Ausente** — join embutido; 1 query vendas + 1 batch `venda_eventos` (lista) / paralelo evento+pagamentos (detalhe), sem lookup por linha |
| Escopo operador | Preservado: `.eq('operador_id', userId)` inalterado em lista e detalhe |
| Venda sem cliente | `clienteNome: null` → UI continua `historico_sem_cliente` (`—`) |
| Legado sem `venda_eventos` | **Limitação residual documentada:** lista funciona (qtdItens=0); detalhe sem itens e impressão/export desabilitados — **não impede** exibir nome do cliente nem lista+detail do dia para vendas com `vendas` row; fora de escopo reconstruir ledger |
| Testes | `caixaVendaEspera.test.ts` — casos A–E (14 asserts) |
| Evidência | `/opt/cursor/artifacts/onda1-27-vitest.log` |

**Pergunta de fechamento:** *O requisito “Histórico vendas do operador (lista + detalhe do dia)” está funcional e suficientemente validado?* → **Sim**, para o escopo atual (dia corrente, operador logado, nome do cliente propagado).

---

## Fechamentos — Onda 1 / Lote 4B (ID 28)

**Data:** 2026-08-31 · Branch: `cursor/onda1-reimpressao-recibo-28-0a79` · PR **#357** · SHA `74fa200a`

### ID 28 — Reimpressão fiel do recibo pelo histórico

| Campo | Valor |
|-------|-------|
| Status anterior | IMPLEMENTADO PARCIALMENTE |
| Status novo | **IMPLEMENTADO E VALIDADO** |
| Evidência antes | `historicoDetalheParaRecibo` forçava `tipoPreco: 'VAREJO'`, `descontoGerentePercentual: 0`, `valorDescontoGerente: 0`; detalhe carregava itens só de `venda_eventos` (sem `tipo_preco` / preço original) |
| Causa raiz | Mapper de reimpressão ignorava SSoT relacional; detalhe não consultava `itens_venda` nem `descontos_venda` |
| SSoT | `vendas` (totais), `itens_venda` + `produtos(nome)` (itens/`tipo_preco`/`preco_unitario_original`), `descontos_venda` (desconto gerente), `vendas_pagamentos`, `venda_eventos` (fallback legado) |
| Solução | `obterDetalheHistoricoVendaImpl` passa a buscar em paralelo `itens_venda` e `descontos_venda`; `historicoDetalheParaRecibo` propaga `tipoPreco`, `precoOriginal`, desconto gerente e separa desconto de itens vs gerente |
| Fidelidade antes→depois | Antes: atacado/desconto gerente sumiam no cupom histórico; depois: paridade com recibo pós-venda (F12 usa caminho inline preservado) |
| Legado | Sem `itens_venda` → fallback `venda_eventos` com defaults seguros (`VAREJO`, sem gerente inventado) |
| N+1 | **Ausente** — 4 queries paralelas no detalhe (venda + evento + pagamentos + itens + desconto), sem lookup por linha |
| Escopo operador | Preservado: `.eq('operador_id', userId)` inalterado |
| Arquivos | `caixaVendaEspera.impl.ts`, `caixaHistoricoRecibo.ts`, testes |
| Testes | `caixaHistoricoRecibo.test.ts` (varejo, atacado, gerente, pagamentos, totais, legado, F12), `caixaVendaEspera.test.ts` (itens_venda, descontos_venda, fallback) |
| Evidência | `/opt/cursor/artifacts/onda1-28-vitest.log` (26/26) |

**Pergunta de fechamento:** *Reimpressão histórica reproduz fielmente a venda original?* → **Sim**, quando dados existem em `itens_venda`/`descontos_venda`; legado sem metadado mantém comportamento seguro.

---

## Fechamentos — Onda 1 / Lote 4C (IDs 219 + 220)

**Data:** 2026-08-31 · Branch: `cursor/onda1-i18n-219-220-0a79` · PR pendente

### ID 219 — PT-BR consistente (fluxo operacional piloto)

| Campo | Valor |
|-------|-------|
| Status anterior | IMPLEMENTADO PARCIALMENTE |
| Status novo | **IMPLEMENTADO PARCIALMENTE** |
| Escopo | `/caixa`, Server Actions do caixa, adapters cash (sessão/movimentação), scan pipeline |
| Gaps antes | Dezenas de literais PT em `*.impl.ts` retornados sem checar `idioma`; `webCaixaScanProcess` com “Código vazio.” / “Código lido:”; `MSG_CANCELAR_VENDA_PERFIL` fixo |
| Solução | SSOT `caixaMsgServidor` / `caixaMsgOperador` + chaves `err_srv_*` em `pt.json`/`zh.json`; migração dos impls operacionais listados |
| Arquivos | `caixaMensagensServidor.ts`, `pt.json`, `zh.json`, `caixaVendas.impl.ts`, `caixaVendaEspera.impl.ts`, `caixaCatalogo.impl.ts`, `cashSession.ts`, `cashMovement*.ts`, demais `app/caixa/server/*.impl.ts`, `webCaixaScanProcess.ts` |
| Testes | `caixaMensagensServidor.test.ts`, `caixa-i18n-parity.test.ts`, regressão `caixaErroOperador.test.ts` / `cashSession.test.ts` |
| Resíduos | Mensagens Zod em `finalizarVendaValidation.ts` (PT nos schemas); `caixaErroOperador` mantém mapa bilíngue paralelo (fora de pt.json); erros brutos de RPC/PostgREST podem vazar PT; admin/gerente fora do escopo |

### ID 220 — 简体中文 consistente (fluxo operacional piloto)

| Campo | Valor |
|-------|-------|
| Status anterior | IMPLEMENTADO PARCIALMENTE |
| Status novo | **IMPLEMENTADO PARCIALMENTE** |
| Evidência | Com `idioma=zh`, chaves `err_srv_*` retornam CN (ex.: sessão expirada → `会话已过期…`; cancelar perfil → `取消销售需要经理…`) |
| #355 autocomplete | `err_srv_busca_ambigua` / `err_srv_codigo_ambiguo` traduzidos e cobertos em teste |
| Paridade | `caixa-i18n-parity.test.ts` garante paridade `err_srv_*` + `msg_codigo_lido` entre PT/ZH |
| Resíduos | Mesmos de 219; UI client-side fora do lote pode ainda exibir PT em edge cases |

**Pergunta de fechamento:** *ZH no piloto operacional sem PT indevido nos fluxos corrigidos?* → **Parcialmente sim** nos server actions/adapters migrados; não i18n total do monorepo.

---

| EXISTE MAS NÃO VALIDADO | 1 | 1.4% |
| NÃO IMPLEMENTADO | 2 | 2.8% |
| NÃO SE APLICA AO PILOTO | 0 | 0.0% |

---

## Atualização P0 — Backup / Restore (IDs 183–187)

**Reverificação 2026-08-31:** org NatureCode **Free**; sem backup automático; PITR não; restore não ensaiado.

| ID | Status | Bloqueia? |
|----|--------|-----------|
| 183–187 | **NÃO IMPLEMENTADO** (FAIL) | **Sim** (risco dados) |

### Decisão operacional (2026-08-31, atualizada)

1. Opção A (Supabase Pro) foi **avaliada e aprovada tecnicamente**.
2. **Decisão de priorização consciente:** **não** contratar Pro / PITR / compute / add-ons neste momento.
3. IDs 183–187 permanecem **FAIL / ABERTO** — **não** viram PASS.
4. Tratamento: **Onda 7** do plano (backup sem novo custo — `pg_dump`/agendamento/restore drill), **não iniciar agora**.
5. `backup.sh` permanece artefato; **não** é solução até execução automática + restore comprovado.

**Runbook:** [`docs/runbooks/BACKUP_RESTORE_CANONICO.md`](runbooks/BACKUP_RESTORE_CANONICO.md)  
**Histórico:** [`docs/piloto-d0/P0-2_BACKUP_EVIDENCIA.md`](piloto-d0/P0-2_BACKUP_EVIDENCIA.md)  
**Gate restore:** [`docs/piloto-d0/P0-3_HUMAN_GATE.md`](piloto-d0/P0-3_HUMAN_GATE.md)

**`GAP P0 BACKUP/RESTORE REMAINS OPEN`** (adiado conscientemente para Onda 7).

---

## PLANO DE FECHAMENTO DOS GAPS

> Gerado em 2026-08-31. **Nenhuma correção de produto nesta entrega.**  
> Autorização para iniciar: `GO — ONDA 1`.

### Resumo quantitativo

| Métrica | Valor |
|---------|-------|
| **Gaps totais** (não validados) | **95** |
| Onda 1 | 12 |
| Onda 2 | 6 |
| Onda 3 | 6 |
| Onda 4 | 11 |
| Onda 5 | 21 |
| Onda 6 | 4 |
| Onda 7 | 5 |
| Onda 8 | 30 |
| **P0 restante em gaps** | 16 |
| **P1 restante em gaps** | 40 |
| Esforço XS | 2 |
| Esforço S | 51 |
| Esforço M | 19 |
| Esforço L | 23 |
| Esforço XL | 0 |
| Sem migration (estimado) | 89 |
| Com migration (estimado) | 6 — IDs: 51, 97, 98, 184, 183, 185 |
| Exigem hardware real | 11 — IDs: 71, 73, 82, 72, 80, 74, 75, 76, 78, 79, 81 |
| Exigem decisão humana | 10 — IDs: 72, 3, 16, 97, 98, 186, 184, 187, 183, 185 |
| Dependem serviço externo | 8 — IDs: 231, 233, 234, 235, 240, 241, 242, 249 |

### Critério de exclusão do plano

Não entram na tabela: `IMPLEMENTADO E VALIDADO`, `NÃO SE APLICA AO PILOTO`, `N/A by design`.

### Tabela ordenada (gaps não validados)

| Ordem | Onda | ID | Gap | Prioridade | Status atual | Esforço estimado | Risco | Dependências | Motivo da ordem |
| ----- | ---- | -: | --- | ---------- | ------------ | ---------------- | ----- | ------------ | --------------- |
| 1 | 1 | 121 | Categoria imediata | P0 | IMPLEMENTADO E VALIDADO | S | Baixo | — | Fechado Onda1 Lote2 |
| 2 | 1 | 5 | Autocomplete incremental | P1 | IMPLEMENTADO E VALIDADO | S | Baixo | — | Fechado Onda1 Lote3 |
| 3 | 1 | 6 | Pesquisa SKU/referência | P1 | IMPLEMENTADO E VALIDADO | S | Baixo | — | Fechado Onda1 Lote3 |
| 4 | 1 | 27 | Histórico vendas | P1 | IMPLEMENTADO E VALIDADO | S | Baixo | — | Fechado Onda1 Lote4A |
| 5 | 1 | 28 | Reimpressão cupom | P1 | IMPLEMENTADO E VALIDADO | S | Baixo | — | Fechado Onda1 Lote4B |
| 6 | 2 | 40 | Exibição faixa aplicada | P1 | IMPLEMENTADO PARCIALMENTE | S | Baixo | SSoT precos_atacado + calcular_preco_produto (IDs 32–36) | **Reprogramado Onda 2** — atacado runtime antes da UI de faixa |
| 7 | 1 | 122 | Marca imediata | P1 | IMPLEMENTADO E VALIDADO | S | Baixo | — | Fechado Onda1 Lote2 |
| 8 | 1 | 214 | Cliques adequados | P1 | IMPLEMENTADO PARCIALMENTE | S | Baixo | — | Quick win: bug UX/cadastro/PDV com superfície pequena e ganho imediato |
| 9 | 1 | 219 | PT-BR consistente | P1 | IMPLEMENTADO PARCIALMENTE | S | Baixo | Server actions caixa migrados | Fechado parcial Onda1 Lote4C — resíduos Zod/RPC |
| 10 | 1 | 220 | Chinês consistente | P1 | IMPLEMENTADO PARCIALMENTE | M | Médio | Paridade err_srv_* testada | Fechado parcial Onda1 Lote4C — não i18n total |
| 11 | 1 | 221 | Hover ícones visíveis | P2 | IMPLEMENTADO E VALIDADO | XS | Baixo | — | Fechado Onda1 Lote1 |
| 12 | 1 | 222 | Seleção texto legível | P2 | IMPLEMENTADO E VALIDADO | XS | Baixo | — | Fechado Onda1 Lote1 |
| 13 | 2 | 32 | Preço atacado runtime | P0 | IMPLEMENTADO PARCIALMENTE | S | Médio | SSoT precos_atacado + calcular_preco_produto (não criar paralelo) | Atacado runtime: SSoT já existe; validar E2E antes de corrigir |
| 14 | 2 | 33 | Qtd mínima atacado | P0 | IMPLEMENTADO PARCIALMENTE | S | Médio | SSoT precos_atacado + calcular_preco_produto (não criar paralelo) | Atacado runtime: SSoT já existe; validar E2E antes de corrigir |
| 15 | 2 | 36 | Aplicação automática faixa | P0 | EXISTE MAS NÃO VALIDADO | M | Alto | SSoT precos_atacado + calcular_preco_produto (não criar paralelo) | P0 bloqueador negócio atacado; validar antes de corrigir |
| 16 | 2 | 44 | Validação conflitos | P1 | IMPLEMENTADO PARCIALMENTE | S | Baixo | SSoT precos_atacado + calcular_preco_produto (não criar paralelo) | Atacado runtime: SSoT já existe; validar E2E antes de corrigir |
| 17 | 2 | 50 | Auditoria sobrescrita | P1 | IMPLEMENTADO PARCIALMENTE | M | Médio | SSoT precos_atacado + calcular_preco_produto (não criar paralelo) | Atacado runtime: SSoT já existe; validar E2E antes de corrigir |
| 18 | 2 | 51 | Histórico preços | P1 | IMPLEMENTADO PARCIALMENTE | M | Médio | SSoT precos_atacado + calcular_preco_produto (não criar paralelo) | Atacado runtime: SSoT já existe; validar E2E antes de corrigir |
| 19 | 3 | 100 | Integridade vendas×fechamento | P0 | IMPLEMENTADO PARCIALMENTE | M | Médio | vendas_pagamentos; fechar_caixa_atomico; Onda 2 preferível | Fechamento por forma: risco financeiro diário; depende vendas_pagamentos |
| 20 | 3 | 92 | Conferência por forma | P0 | IMPLEMENTADO PARCIALMENTE | L | Alto | vendas_pagamentos; fechar_caixa_atomico; Onda 2 preferível | P0 fechamento cego PIX/cartão; risco financeiro diário |
| 21 | 3 | 99 | Relatório diferenças | P1 | IMPLEMENTADO PARCIALMENTE | S | Baixo | vendas_pagamentos; fechar_caixa_atomico; Onda 2 preferível | Fechamento por forma: risco financeiro diário; depende vendas_pagamentos |
| 22 | 3 | 206 | Diferenças caixa | P1 | IMPLEMENTADO PARCIALMENTE | S | Baixo | vendas_pagamentos; fechar_caixa_atomico; Onda 2 preferível | Fechamento por forma: risco financeiro diário; depende vendas_pagamentos |
| 23 | 3 | 199 | Vendas por forma pag | P1 | IMPLEMENTADO PARCIALMENTE | M | Médio | vendas_pagamentos; fechar_caixa_atomico; Onda 2 preferível | Fechamento por forma: risco financeiro diário; depende vendas_pagamentos |
| 24 | 3 | 205 | Fechamentos caixa | P1 | IMPLEMENTADO PARCIALMENTE | M | Médio | vendas_pagamentos; fechar_caixa_atomico; Onda 2 preferível | Fechamento por forma: risco financeiro diário; depende vendas_pagamentos |
| 25 | 4 | 71 | Leitor USB barcode | P1 | IMPLEMENTADO PARCIALMENTE | S | Médio | Equipamento cliente; Onda 1–3 estáveis | Hardware: após software sólido; exige equipamento do cliente |
| 26 | 4 | 73 | Impressão comprovante | P1 | IMPLEMENTADO PARCIALMENTE | S | Médio | Equipamento cliente; Onda 1–3 estáveis | Hardware: após software sólido; exige equipamento do cliente |
| 27 | 4 | 82 | HW indisponível fallback | P1 | IMPLEMENTADO PARCIALMENTE | S | Médio | Equipamento cliente; Onda 1–3 estáveis | Hardware: após software sólido; exige equipamento do cliente |
| 28 | 4 | 72 | Impressora térmica | P1 | EXISTE MAS NÃO VALIDADO | M | Médio | Equipamento cliente; Onda 1–3 estáveis | Hardware: após software sólido; exige equipamento do cliente |
| 29 | 4 | 80 | Config/teste impressora | P2 | IMPLEMENTADO PARCIALMENTE | S | Médio | Equipamento cliente; Onda 1–3 estáveis | Hardware: após software sólido; exige equipamento do cliente |
| 30 | 4 | 74 | Impressão automática | P2 | NÃO IMPLEMENTADO | M | Baixo | Equipamento cliente; Onda 1–3 estáveis | Hardware: após software sólido; exige equipamento do cliente |
| 31 | 4 | 75 | Gaveta dinheiro HW | P3 | NÃO IMPLEMENTADO | L | Baixo | Equipamento cliente; Onda 1–3 estáveis | Hardware: após software sólido; exige equipamento do cliente |
| 32 | 4 | 76 | Abertura auto pós-dinheiro | P3 | NÃO IMPLEMENTADO | L | Baixo | Equipamento cliente; Onda 1–3 estáveis | Hardware: após software sólido; exige equipamento do cliente |
| 33 | 4 | 78 | Abertura manual autorizada | P3 | NÃO IMPLEMENTADO | L | Baixo | Equipamento cliente; Onda 1–3 estáveis | Hardware: após software sólido; exige equipamento do cliente |
| 34 | 4 | 79 | Auditoria abertura manual | P3 | NÃO IMPLEMENTADO | L | Baixo | Equipamento cliente; Onda 1–3 estáveis | Hardware: após software sólido; exige equipamento do cliente |
| 35 | 4 | 81 | Config/teste gaveta | P3 | NÃO IMPLEMENTADO | L | Baixo | Equipamento cliente; Onda 1–3 estáveis | Hardware: após software sólido; exige equipamento do cliente |
| 36 | 5 | 3 | Identificação operador | P0 | IMPLEMENTADO PARCIALMENTE | M | Médio | — | P1 operacional residual agrupado por domínio |
| 37 | 5 | 26 | Cancelamento venda | P0 | IMPLEMENTADO PARCIALMENTE | M | Médio | — | P1 operacional residual agrupado por domínio |
| 38 | 5 | 67 | Cancelamento/estorno | P0 | IMPLEMENTADO PARCIALMENTE | M | Médio | — | P1 operacional residual agrupado por domínio |
| 39 | 5 | 151 | Estorno por forma pag | P0 | IMPLEMENTADO PARCIALMENTE | M | Médio | — | P1 operacional residual agrupado por domínio |
| 40 | 5 | 155 | Auditoria completa | P0 | IMPLEMENTADO PARCIALMENTE | M | Médio | — | P1 operacional residual agrupado por domínio |
| 41 | 5 | 14 | Consulta estoque | P1 | IMPLEMENTADO PARCIALMENTE | S | Baixo | — | P1 operacional residual agrupado por domínio |
| 42 | 5 | 16 | Identificação vendedor | P1 | IMPLEMENTADO PARCIALMENTE | S | Médio | — | P1 operacional residual agrupado por domínio |
| 43 | 5 | 20 | Desconto total | P1 | IMPLEMENTADO PARCIALMENTE | S | Baixo | — | P1 operacional residual agrupado por domínio |
| 44 | 5 | 29 | Impressão/compartilhamento | P1 | IMPLEMENTADO PARCIALMENTE | S | Médio | — | P1 operacional residual agrupado por domínio |
| 45 | 5 | 68 | Venda a prazo | P1 | IMPLEMENTADO PARCIALMENTE | S | Médio | — | P1 operacional residual agrupado por domínio |
| 46 | 5 | 89 | Motivo obrigatório | P1 | IMPLEMENTADO PARCIALMENTE | S | Baixo | — | P1 operacional residual agrupado por domínio |
| 47 | 5 | 96 | Histórico | P1 | IMPLEMENTADO PARCIALMENTE | S | Baixo | — | P1 operacional residual agrupado por domínio |
| 48 | 5 | 135 | Estoque anterior | P1 | IMPLEMENTADO PARCIALMENTE | S | Baixo | — | P1 operacional residual agrupado por domínio |
| 49 | 5 | 136 | Estoque posterior | P1 | IMPLEMENTADO PARCIALMENTE | S | Baixo | — | P1 operacional residual agrupado por domínio |
| 50 | 5 | 149 | Autorização gerencial | P1 | IMPLEMENTADO PARCIALMENTE | S | Baixo | — | P1 operacional residual agrupado por domínio |
| 51 | 5 | 153 | Diferença a pagar | P1 | IMPLEMENTADO PARCIALMENTE | S | Médio | — | P1 operacional residual agrupado por domínio |
| 52 | 5 | 154 | Diferença a devolver | P1 | IMPLEMENTADO PARCIALMENTE | S | Baixo | — | P1 operacional residual agrupado por domínio |
| 53 | 5 | 196 | Vendas por operador | P1 | IMPLEMENTADO PARCIALMENTE | S | Baixo | — | P1 operacional residual agrupado por domínio |
| 54 | 5 | 225 | Cadastro produto intuitivo | P1 | IMPLEMENTADO PARCIALMENTE | S | Médio | — | P1 operacional residual agrupado por domínio |
| 55 | 5 | 97 | Reabertura autorizada | P1 | NÃO IMPLEMENTADO | M | Médio | — | P1 operacional residual agrupado por domínio |
| 56 | 5 | 98 | Auditoria reabertura | P1 | NÃO IMPLEMENTADO | M | Médio | — | P1 operacional residual agrupado por domínio |
| 57 | 6 | 180 | Recuperação pós falha | P1 | IMPLEMENTADO PARCIALMENTE | S | Médio | — | Confiabilidade residual comprovada (exceto backup) |
| 58 | 6 | 188 | Logs erros | P1 | IMPLEMENTADO PARCIALMENTE | S | Médio | — | Confiabilidade residual comprovada (exceto backup) |
| 59 | 6 | 190 | Falha rede | P1 | IMPLEMENTADO PARCIALMENTE | S | Médio | — | Confiabilidade residual comprovada (exceto backup) |
| 60 | 6 | 191 | Backend indisponível | P1 | IMPLEMENTADO PARCIALMENTE | S | Médio | — | Confiabilidade residual comprovada (exceto backup) |
| 61 | 7 | 186 | RPO conhecido | P0 | NÃO IMPLEMENTADO | S | Crítico | Decisão: sem Supabase Pro; infra dump/storage; P0-3 DESTINO | Decisão consciente: adiado (sem Pro); Onda 7 |
| 62 | 7 | 184 | Evidência backup | P0 | NÃO IMPLEMENTADO | M | Crítico | Decisão: sem Supabase Pro; infra dump/storage; P0-3 DESTINO | Decisão consciente: adiado (sem Pro); Onda 7 |
| 63 | 7 | 187 | RTO conhecido | P0 | NÃO IMPLEMENTADO | M | Crítico | Decisão: sem Supabase Pro; infra dump/storage; P0-3 DESTINO | Decisão consciente: adiado (sem Pro); Onda 7 |
| 64 | 7 | 183 | Backup automático | P0 | NÃO IMPLEMENTADO | L | Crítico | Decisão: sem Supabase Pro; infra dump/storage; P0-3 DESTINO | Decisão consciente: adiado (sem Pro); Onda 7 |
| 65 | 7 | 185 | Restore comprovado | P0 | NÃO IMPLEMENTADO | L | Crítico | Decisão: sem Supabase Pro; infra dump/storage; P0-3 DESTINO | Decisão consciente: adiado (sem Pro); Onda 7 |
| 66 | 8 | 46 | Limites inferior/superior | P2 | IMPLEMENTADO PARCIALMENTE | S | Baixo | — | P2/P3 evolução pós-estabilização |
| 67 | 8 | 54 | Atacado em espera | P2 | IMPLEMENTADO PARCIALMENTE | S | Médio | — | P2/P3 evolução pós-estabilização |
| 68 | 8 | 55 | Atacado ao recuperar | P2 | IMPLEMENTADO PARCIALMENTE | S | Médio | — | P2/P3 evolução pós-estabilização |
| 69 | 8 | 61 | Outros configuráveis | P2 | IMPLEMENTADO PARCIALMENTE | S | Baixo | — | P2/P3 evolução pós-estabilização |
| 70 | 8 | 115 | Imagem | P2 | IMPLEMENTADO PARCIALMENTE | S | Baixo | — | P2/P3 evolução pós-estabilização |
| 71 | 8 | 124 | Histórico alterações | P2 | IMPLEMENTADO PARCIALMENTE | S | Médio | — | P2/P3 evolução pós-estabilização |
| 72 | 8 | 140 | Divergências inventário | P2 | IMPLEMENTADO PARCIALMENTE | S | Médio | — | P2/P3 evolução pós-estabilização |
| 73 | 8 | 168 | Auditoria preços | P2 | IMPLEMENTADO PARCIALMENTE | S | Médio | — | P2/P3 evolução pós-estabilização |
| 74 | 8 | 171 | Auditoria config | P2 | IMPLEMENTADO PARCIALMENTE | S | Baixo | — | P2/P3 evolução pós-estabilização |
| 75 | 8 | 173 | Estado ant/post | P2 | IMPLEMENTADO PARCIALMENTE | S | Baixo | — | P2/P3 evolução pós-estabilização |
| 76 | 8 | 189 | Observabilidade | P2 | IMPLEMENTADO PARCIALMENTE | S | Baixo | — | P2/P3 evolução pós-estabilização |
| 77 | 8 | 198 | Vendas por categoria | P2 | IMPLEMENTADO PARCIALMENTE | S | Baixo | — | P2/P3 evolução pós-estabilização |
| 78 | 8 | 236 | Armazenamento doc | P2 | IMPLEMENTADO PARCIALMENTE | S | Baixo | — | P2/P3 evolução pós-estabilização |
| 79 | 8 | 248 | Etiquetas | P2 | IMPLEMENTADO PARCIALMENTE | S | Baixo | — | P2/P3 evolução pós-estabilização |
| 80 | 8 | 131 | Inventário formal | P2 | NÃO IMPLEMENTADO | M | Médio | — | P2/P3 evolução pós-estabilização |
| 81 | 8 | 30 | Orçamento | P3 | NÃO IMPLEMENTADO | L | Baixo | — | P2/P3 evolução pós-estabilização |
| 82 | 8 | 117 | Variantes cor/tamanho | P3 | NÃO IMPLEMENTADO | L | Baixo | — | P2/P3 evolução pós-estabilização |
| 83 | 8 | 174 | Estação/dispositivo | P3 | NÃO IMPLEMENTADO | L | Baixo | — | P2/P3 evolução pós-estabilização |
| 84 | 8 | 231 | DANFE | P3 | NÃO IMPLEMENTADO | L | Baixo | — | P2/P3 evolução pós-estabilização |
| 85 | 8 | 233 | Carta correção | P3 | NÃO IMPLEMENTADO | L | Baixo | — | P2/P3 evolução pós-estabilização |
| 86 | 8 | 234 | Inutilização | P3 | NÃO IMPLEMENTADO | L | Baixo | — | P2/P3 evolução pós-estabilização |
| 87 | 8 | 235 | Consulta SEFAZ | P3 | NÃO IMPLEMENTADO | L | Baixo | — | P2/P3 evolução pós-estabilização |
| 88 | 8 | 240 | E-mail | P3 | NÃO IMPLEMENTADO | L | Baixo | — | P2/P3 evolução pós-estabilização |
| 89 | 8 | 241 | E-commerce | P3 | NÃO IMPLEMENTADO | L | Baixo | — | P2/P3 evolução pós-estabilização |
| 90 | 8 | 242 | Marketplaces | P3 | NÃO IMPLEMENTADO | L | Baixo | — | P2/P3 evolução pós-estabilização |
| 91 | 8 | 243 | Fidelidade | P3 | NÃO IMPLEMENTADO | L | Baixo | — | P2/P3 evolução pós-estabilização |
| 92 | 8 | 244 | Gift cards | P3 | NÃO IMPLEMENTADO | L | Baixo | — | P2/P3 evolução pós-estabilização |
| 93 | 8 | 245 | CRM | P3 | NÃO IMPLEMENTADO | L | Baixo | — | P2/P3 evolução pós-estabilização |
| 94 | 8 | 249 | Integrações bancárias | P3 | NÃO IMPLEMENTADO | L | Baixo | — | P2/P3 evolução pós-estabilização |
| 95 | 8 | 250 | BI avançado | P3 | NÃO IMPLEMENTADO | L | Baixo | — | P2/P3 evolução pós-estabilização |

### Listas por onda

### Onda 1

**IDs (12):** ~~121~~, ~~5~~, ~~6~~, ~~27~~, ~~28~~, ~~40~~→Onda2, ~~122~~, 214, 219, 220, ~~221~~, ~~222~~  
**Fechados:** 221, 222 (Lote 1); 121, 122 (Lote 2); 5, 6 (Lote 3); 27 (Lote 4A); 28 (Lote 4B); 219, 220 (Lote 4C parcial). Restantes Onda 1: **214**. **ID 40 reprogramado para Onda 2** (status inalterado).

Quick win: bug UX/cadastro/PDV com superfície pequena e ganho imediato
### Onda 2

**IDs (7):** 32, 33, 36, **40**, 44, 50, 51

Atacado runtime: SSoT já existe; validar E2E antes de corrigir. **ID 40** (exibição faixa no carrinho) entrou nesta onda — depende de certificar runtime dos IDs 32–36.
### Onda 3

**IDs (6):** 100, 92, 99, 206, 199, 205

Fechamento por forma: risco financeiro diário; depende vendas_pagamentos
### Onda 4

**IDs (11):** 71, 73, 82, 72, 80, 74, 75, 76, 78, 79, 81

Hardware: após software sólido; exige equipamento do cliente
### Onda 5

**IDs (21):** 3, 26, 67, 151, 155, 14, 16, 20, 29, 68, 89, 96, 135, 136, 149, 153, 154, 196, 225, 97, 98

P1 operacional residual agrupado por domínio
### Onda 6

**IDs (4):** 180, 188, 190, 191

Confiabilidade residual comprovada (exceto backup)
### Onda 7

**IDs (5):** 186, 184, 187, 183, 185

Backup sem Pro: decisão consciente; pg_dump/restore drill futuro
### Onda 8

**IDs (30):** 46, 54, 55, 61, 115, 124, 140, 168, 171, 173, 189, 198, 236, 248, 131, 30, 117, 174, 231, 233, 234, 235, 240, 241, 242, 243, 244, 245, 249, 250

P2/P3 evolução pós-estabilização


### Método obrigatório por gap

`IDENTIFICAR` → `REPRODUZIR` → `CAUSA RAIZ` → `MENOR CORREÇÃO` → `TESTE PROPORCIONAL` → `VALIDAÇÃO` → `ATUALIZAR AUDITORIA`

Antes de alterar código, responder: ID · evidência · causa raiz · SSoT · menor correção · risco regressão · prova de término.

Registro ao fechar ID: status anterior → novo · causa · solução · teste · evidência · PR · SHA.

---

## 3. Matriz completa (250 IDs)

| ID | Domínio | Capacidade | Prioridade | Status | Evidência UI | Evidência código | Evidência DB/RPC | Teste/evidência | Risco | Gap | Menor ação necessária | Bloqueia piloto? |
| -- | ------- | ---------- | ---------- | ------ | ------------ | ---------------- | ---------------- | --------------- | ----- | --- | --------------------- | ---------------- |
| 1 | A.PDV | Abertura de caixa | P0 | IMPLEMENTADO E VALIDADO | CaixaAbrirTurnoModal | abrirCaixaOperador | caixas | caixa-modais-abrir-fechar.spec.ts | Baixo | pdv-local operador_id null | — | Não |
| 2 | A.PDV | Fundo/troco inicial | P0 | IMPLEMENTADO E VALIDADO | CaixaAbrirTurnoModal | cashSession.open | caixas.valor_inicial | caixa-fluxos-criticos.spec.ts | Baixo | pdv-local prompt | — | Não |
| 3 | A.PDV | Identificação operador | P0 | IMPLEMENTADO PARCIALMENTE | page.tsx operadorLabel | auth.uid()→operador_id | caixas/vendas.operador_id | login-contrato-perfil.spec.ts | Médio | Sem PIN/troca operador | Política terminal | Não |
| 4 | A.PDV | Pesquisa por nome | P0 | IMPLEMENTADO E VALIDADO | CaixaSearchBar | caixaCatalogo ILIKE | produtos | webCaixaScanProcess.test.ts | Baixo | — | — | Não |
| 5 | A.PDV | Autocomplete incremental | P1 | IMPLEMENTADO E VALIDADO | useCaixaBuscaSugestoes + CaixaCandidatosProduto | buscarProdutoParaCaixa | produtos | caixaBuscaSugestoes + CaixaSearchBar.behavior | Baixo | — | — | Não |
| 6 | A.PDV | Pesquisa SKU/referência | P1 | IMPLEMENTADO E VALIDADO | caixaCatalogo.impl | codigo_interno ILIKE | produtos.codigo_interno | caixaCatalogo.impl.test.ts | Baixo | — | — | Não |
| 7 | A.PDV | Código de barras | P0 | IMPLEMENTADO E VALIDADO | useCaixaScanPipeline | webCaixaScanProcess | produtos.codigo_barras | caixa-golden-flow-cycle5.spec.ts | Baixo | Keyboard-wedge | — | Não |
| 8 | A.PDV | Inclusão rápida produto | P3 | NÃO SE APLICA AO PILOTO | Removido | pdv_cadastro_removido.md | — | caixaSemCadastroProduto.test.ts | Baixo | SSoT /admin/catalogo | — | Não |
| 9 | A.PDV | Scanner repete qty | P0 | IMPLEMENTADO E VALIDADO | webCaixaScanProcess | unifiedCartStore.adicionarItem | — | webCaixaScanProcess.test.ts | Baixo | — | — | Não |
| 10 | A.PDV | Alterar quantidade | P0 | IMPLEMENTADO E VALIDADO | CaixaCartList | atualizarQuantidade | — | CaixaCartList.behavior.test.tsx | Baixo | — | — | Não |
| 11 | A.PDV | Remover item | P0 | IMPLEMENTADO E VALIDADO | CaixaCartList | removerItem | — | carrinhoStore.behavior.test.ts | Baixo | — | — | Não |
| 12 | A.PDV | Cancelar item (linha) | P0 | IMPLEMENTADO E VALIDADO | CaixaCartList | removerItem | — | carrinhoStore.behavior.test.ts | Baixo | — | — | Não |
| 13 | A.PDV | Preço/subtotal/total | P0 | IMPLEMENTADO E VALIDADO | CaixaCartList | finalizarVendaValidation RPC v4 | itens_venda/vendas | caixa-golden-flow-cycle5.spec.ts | Baixo | — | — | Não |
| 14 | A.PDV | Consulta estoque | P1 | IMPLEMENTADO PARCIALMENTE | CaixaConsultaRapidaModal F3 | caixaEstoqueServer | estoque | — | Baixo | Não inline carrinho | — | Não |
| 15 | A.PDV | Política sem estoque | P0 | IMPLEMENTADO E VALIDADO | Erro UI | decrementar_estoque_seguro | 017/127 | finalizarVendaCaixa.integration.test.ts | Baixo | Bloqueia venda | — | Não |
| 16 | A.PDV | Identificação vendedor | P1 | IMPLEMENTADO PARCIALMENTE | — | operador_id=comissão | comissoes_vendedores | — | Médio | Sem picker vendedor | — | Não |
| 17 | A.PDV | Cliente opc/obrig | P0 | IMPLEMENTADO E VALIDADO | CaixaSelecionarClienteModal | pagamentoParcialExigeCliente | vendas.cliente_id | caixa-fase5b-golden-flow-ui.spec.ts | Baixo | Obrig. só parcial | — | Não |
| 18 | A.PDV | Vincular cliente | P0 | IMPLEMENTADO E VALIDADO | CaixaSelecionarClienteModal | p_cliente_id RPC | clientes | caixa-fase5b-golden-flow-ui.spec.ts | Baixo | — | — | Não |
| 19 | A.PDV | Desconto item | P1 | IMPLEMENTADO E VALIDADO | aplicarDescontoManual | trigger limite desconto | pdv_config | finalizarVendaValidation.test.ts | Baixo | — | — | Não |
| 20 | A.PDV | Desconto total | P1 | IMPLEMENTADO PARCIALMENTE | Por linha agregado | finalizarVendaValidation | — | — | Baixo | Sem campo global | — | Não |
| 21 | A.PDV | Limite desconto perfil | P0 | IMPLEMENTADO E VALIDADO | pdv_config | trigger 122 | pdv_config | finalizarVendaValidation.test.ts | Baixo | — | — | Não |
| 22 | A.PDV | Autoriz. gerencial desconto | P0 | IMPLEMENTADO E VALIDADO | CaixaGerenteModal | descontoGerenteToken | descontos_venda | — | Médio | — | — | Não |
| 23 | A.PDV | Venda em espera | P2 | IMPLEMENTADO E VALIDADO | CaixaEmAbertoList | colocar_venda_em_espera | vendas_em_espera | caixa-venda-em-espera.spec.ts | Médio | D0-04 fora contrato | — | Não |
| 24 | A.PDV | Recuperar espera | P2 | IMPLEMENTADO E VALIDADO | retomarVendaEmEspera | retomar_venda_em_espera | vendas_em_espera | caixa-venda-em-espera.spec.ts | Médio | Preço stale | Repricing | Não |
| 25 | A.PDV | Múltiplas em espera | P2 | IMPLEMENTADO E VALIDADO | CaixaEmAbertoList | listar_vendas_em_espera | vendas_em_espera | caixa-venda-em-espera.spec.ts | Baixo | RLS amplo TODO255 | — | Não |
| 26 | A.PDV | Cancelamento venda | P0 | IMPLEMENTADO PARCIALMENTE | VendaCancelarModal admin | cancelar_venda_transacional | vendas_canceladas_auditoria | cancelarVendaContrato.integration.test.ts | Médio | OPERADOR sem cancel caixa; sem e2e | E2E cancel | Não |
| 27 | A.PDV | Histórico vendas | P1 | IMPLEMENTADO E VALIDADO | CaixaHistoricoSheet | listarHistoricoOperadorImpl | vendas+clientes(nome) | caixaVendaEspera.test.ts | Baixo | Legado sem venda_eventos: itens vazios | — | Não |
| 28 | A.PDV | Reimpressão cupom | P1 | IMPLEMENTADO E VALIDADO | CaixaHistoricoSheet | historicoDetalheParaRecibo | itens_venda+descontos_venda | caixaHistoricoRecibo.test.ts | Baixo | Legado sem itens_venda: fallback evento | — | Não |
| 29 | A.PDV | Impressão/compartilhamento | P1 | IMPLEMENTADO PARCIALMENTE | CaixaReciboModal | buildReciboEscPos | — | CaixaReciboModal.i18n.test.tsx | Médio | Não-fiscal; WebUSB | Homolog física | Não |
| 30 | A.PDV | Orçamento | P3 | NÃO IMPLEMENTADO | — | — | — | piloto-d0 freeze | Baixo | Fora D0 | — | Não |
| 31 | B.ATACADO | Preço varejo | P0 | IMPLEMENTADO E VALIDADO | PrecosSection | calcular_preco_produto fallback | produtos.preco_varejo | d0-pricing-tiers-ssot.test.sql | Baixo | — | — | Não |
| 32 | B.ATACADO | Preço atacado runtime | P0 | IMPLEMENTADO PARCIALMENTE | PrecosSection legacy | precos_atacado tier | precos_atacado | d0-pricing-tiers-ssot.test.sql | Médio | produtos.preco_atacado ignorado RPC | Alinhar UI copy | Não |
| 33 | B.ATACADO | Qtd mínima atacado | P0 | IMPLEMENTADO PARCIALMENTE | quantidade_gatilho UI | precos_atacado.quantidade_minima | precos_atacado | d0-pricing-tiers-ssot.test.sql | Médio | Campos legacy confusos | Deprecar UI legacy | Não |
| 34 | B.ATACADO | Faixas por quantidade | P0 | IMPLEMENTADO E VALIDADO | FaixasAtacadoEditor | calcular_preco_produto | precos_atacado | calcularPrecoCanonico.spec.ts | Baixo | — | — | Não |
| 35 | B.ATACADO | Múltiplas faixas | P0 | IMPLEMENTADO E VALIDADO | FaixasAtacadoEditor | ORDER BY qty_min DESC | precos_atacado | d0-pricing-tiers-ssot.test.sql | Baixo | — | — | Não |
| 36 | B.ATACADO | Aplicação automática faixa | P0 | EXISTE MAS NÃO VALIDADO | webCaixaScanProcess | calcular_preco_produto | precos_atacado | unit/SQL only | Alto | Sem E2E runtime atacado | E2E qty≥tier | Sim |
| 37 | B.ATACADO | Recalc ao aumentar qty | P0 | IMPLEMENTADO E VALIDADO | useReprecificarQuantidadeCaixa | calcular_preco_produto | — | useReprecificarQuantidadeCaixa.test.tsx | Baixo | — | — | Não |
| 38 | B.ATACADO | Recalc ao diminuir qty | P0 | IMPLEMENTADO E VALIDADO | useReprecificarQuantidadeCaixa | calcular_preco_produto | — | calcularPrecoCanonico.spec.ts | Baixo | — | — | Não |
| 39 | B.ATACADO | Retorno varejo abaixo mín | P0 | IMPLEMENTADO E VALIDADO | CaixaCartList badge | RPC fallback varejo | produtos.preco_varejo | d0-pricing-tiers-ssot.test.sql | Baixo | — | — | Não |
| 40 | B.ATACADO | Exibição faixa aplicada | P1 | IMPLEMENTADO PARCIALMENTE | TipoPrecoBadge | PriceTooltip | — | CaixaCartList.behavior.test.tsx | Baixo | Não mostra threshold qty | UX tier label | Não |
| 41 | B.ATACADO | Cadastro faixas | P0 | IMPLEMENTADO E VALIDADO | FaixasAtacadoEditor | criarFaixaAtacado | precos_atacado | productUpdater.test.ts | Baixo | Copy fallback stale | — | Não |
| 42 | B.ATACADO | Edição faixas | P0 | IMPLEMENTADO E VALIDADO | FaixasAtacadoEditor | atualizar_produto_com_faixa_atacado | precos_atacado | productUpdater.test.ts | Baixo | — | — | Não |
| 43 | B.ATACADO | Desativar faixas | P0 | IMPLEMENTADO E VALIDADO | inativarFaixaAtacado | ativo=false | precos_atacado | d0-pricing-tiers-ssot.test.sql | Baixo | — | — | Não |
| 44 | B.ATACADO | Validação conflitos | P1 | IMPLEMENTADO PARCIALMENTE | validarFaixa UI | unique index qty | precos_atacado | — | Baixo | Sem valid tier<varejo CRUD | — | Não |
| 45 | B.ATACADO | Faixas sobrepostas | P2 | N/A by design | — | maior qty_min vence | precos_atacado | d0-pricing-tiers-ssot.test.sql | Baixo | Esperado | — | Não |
| 46 | B.ATACADO | Limites inferior/superior | P2 | IMPLEMENTADO PARCIALMENTE | Zod qty>=1 | CHECK DB | precos_atacado | — | Baixo | Sem max tiers | — | Não |
| 47 | B.ATACADO | Preço absoluto por faixa | P0 | IMPLEMENTADO E VALIDADO | FaixasAtacadoEditor | preco_unitario | precos_atacado | — | Baixo | Não % desconto | — | Não |
| 48 | B.ATACADO | Seleção manual varejo/atacado | P3 | N/A by design | — | automático qty | — | — | Baixo | Por design D0 | — | Não |
| 49 | B.ATACADO | Sobrescrever preço | P1 | IMPLEMENTADO E VALIDADO | aplicarDescontoManual | tipoPreco MANUAL | itens_venda | finalizarVendaValidation.test.ts | Baixo | — | — | Não |
| 50 | B.ATACADO | Auditoria sobrescrita | P1 | IMPLEMENTADO PARCIALMENTE | — | itens_venda snapshot | itens_venda | — | Médio | Motivo override incompleto | — | Não |
| 51 | B.ATACADO | Histórico preços | P1 | IMPLEMENTADO PARCIALMENTE | HistoricoPrecosSection | historico_precos_produto | historico_precos_produto | — | Médio | Tiers não historizados | Audit tier CRUD | Não |
| 52 | B.ATACADO | Margem/custo coerente | P0 | IMPLEMENTADO E VALIDADO | PrecosSection | trigger 125/124 | produtos/precos_atacado | productUpdater.test.ts | Baixo | — | — | Não |
| 53 | B.ATACADO | Atacado no cancelamento | P0 | IMPLEMENTADO E VALIDADO | — | snapshot itens_venda | 303 migration | cancelarVendaContrato.integration.test.ts | Baixo | — | — | Não |
| 54 | B.ATACADO | Atacado em espera | P2 | IMPLEMENTADO PARCIALMENTE | caixaVendaEspera | JSONB snapshot | vendas_em_espera | caixa-venda-em-espera.spec.ts | Médio | Preço congelado | Repricing | Não |
| 55 | B.ATACADO | Atacado ao recuperar | P2 | IMPLEMENTADO PARCIALMENTE | CaixaPageClient draft | restore snapshot | — | — | Médio | Sem revalidação tiers | — | Não |
| 56 | B.ATACADO | Atacado devolução | P0 | IMPLEMENTADO E VALIDADO | VendaDevolucaoModal | devolver_ou_trocar_venda | 303 migration | devolucao-troca-cadeia.test.ts | Baixo | — | — | Não |
| 57 | C.PAG | Dinheiro | P0 | IMPLEMENTADO E VALIDADO | CaixaPdvMetodoPagamentoSelector | DINHEIRO | formas_pagamento | caixa-golden-flow-cycle5.spec.ts | Baixo | — | — | Não |
| 58 | C.PAG | PIX | P0 | IMPLEMENTADO E VALIDADO | Selector PIX | PIX RPC v4 | vendas_pagamentos | caixa-venda-multi-pagamento.spec.ts | Baixo | Manual/registro | — | Não |
| 59 | C.PAG | Débito | P0 | IMPLEMENTADO E VALIDADO | Selector débito | CARTAO_DEBITO | vendas_pagamentos | caixa-venda-multi-pagamento.spec.ts | Baixo | — | — | Não |
| 60 | C.PAG | Crédito | P0 | IMPLEMENTADO E VALIDADO | Selector crédito | CARTAO_CREDITO | vendas_pagamentos | caixa-fase5b-golden-flow-ui.spec.ts | Baixo | — | — | Não |
| 61 | C.PAG | Outros configuráveis | P2 | IMPLEMENTADO PARCIALMENTE | Enum fixo UI | formas_pagamento table | formas_pagamento | 302 migration | Baixo | UI não carrega DB dinâmico | — | Não |
| 62 | C.PAG | Múltiplas formas | P0 | IMPLEMENTADO E VALIDADO | useCaixaPagamentos | p_pagamentos jsonb | vendas_pagamentos | caixa-venda-multi-pagamento.spec.ts | Baixo | — | — | Não |
| 63 | C.PAG | Pagamentos parciais | P0 | IMPLEMENTADO E VALIDADO | CaixaPdvOperadorTabs | contas_receber | contas_receber | caixa-fase5b-golden-flow-ui.spec.ts | Baixo | Exige cliente | — | Não |
| 64 | C.PAG | Cálculo troco | P0 | IMPLEMENTADO E VALIDADO | caixaPagamentoSaldo | calcularTroco | — | caixaPagamentoSaldo tests | Baixo | — | — | Não |
| 65 | C.PAG | Bloqueio troco inválido | P0 | IMPLEMENTADO E VALIDADO | finalizarVendaValidation | validação troco | — | finalizarVendaValidation.test.ts | Baixo | — | — | Não |
| 66 | C.PAG | Registro por forma | P0 | IMPLEMENTADO E VALIDADO | — | vendas_pagamentos | vendas_pagamentos | caixa-fase6-reconciliacao.spec.ts | Baixo | — | — | Não |
| 67 | C.PAG | Cancelamento/estorno | P0 | IMPLEMENTADO PARCIALMENTE | cancelar_venda | estorno caixa/CR | devolucoes | cancelarVendaValorEstornado.test.ts | Médio | Sem e2e estorno cartão | — | Não |
| 68 | C.PAG | Venda a prazo | P1 | IMPLEMENTADO PARCIALMENTE | Pagamento parcial+CR | contas_receber | contas_receber | caixa-fase5b-contas-receber.spec.ts | Médio | Fiado bloqueado formas_pagamento | — | Não |
| 69 | C.PAG | Integração CR | P1 | IMPLEMENTADO E VALIDADO | /admin/financeiro | AR writer | contas_receber | ar-receipts-reconciliation.test.sql | Baixo | — | — | Não |
| 70 | C.PAG | Anti pagamento duplicado | P0 | IMPLEMENTADO E VALIDADO | idempotency_key | finalizar_venda v4 | vendas | finalizarVendaCaixa.integration.test.ts | Baixo | — | — | Não |
| 71 | D.HW | Leitor USB barcode | P1 | IMPLEMENTADO PARCIALMENTE | useCaixaScanPipeline | keyboard-wedge | — | webCaixaScanProcess.test.ts | Médio | Sem driver HID nativo | — | Não |
| 72 | D.HW | Impressora térmica | P1 | EXISTE MAS NÃO VALIDADO | useThermalPrinter | webUsbAdapter escpos | — | mock unit | Médio | Sem homolog física | Teste loja real | Não |
| 73 | D.HW | Impressão comprovante | P1 | IMPLEMENTADO PARCIALMENTE | CaixaReciboModal | buildReciboEscPos | — | CaixaReciboModal.i18n.test.tsx | Médio | Screen+WebUSB | — | Não |
| 74 | D.HW | Impressão automática | P2 | NÃO IMPLEMENTADO | — | — | — | — | Baixo | Manual pós-venda | — | Não |
| 75 | D.HW | Gaveta dinheiro HW | P3 | NÃO IMPLEMENTADO | — | — | — | ADR-CAIXA-002 | Baixo | Só saldo lógico | — | Não |
| 76 | D.HW | Abertura auto pós-dinheiro | P3 | NÃO IMPLEMENTADO | — | — | — | — | Baixo | Sem kick ESC/POS | — | Não |
| 77 | D.HW | Não abrir PIX/cartão | P3 | NÃO SE APLICA AO PILOTO | — | — | — | — | Baixo | Sem HW gaveta | — | Não |
| 78 | D.HW | Abertura manual autorizada | P3 | NÃO IMPLEMENTADO | — | — | — | — | Baixo | — | — | Não |
| 79 | D.HW | Auditoria abertura manual | P3 | NÃO IMPLEMENTADO | — | — | — | — | Baixo | — | — | Não |
| 80 | D.HW | Config/teste impressora | P2 | IMPLEMENTADO PARCIALMENTE | useThermalPrinter connect | WebUSB filter | — | — | Médio | Sem tela config dedicada | — | Não |
| 81 | D.HW | Config/teste gaveta | P3 | NÃO IMPLEMENTADO | — | — | — | — | Baixo | — | — | Não |
| 82 | D.HW | HW indisponível fallback | P1 | IMPLEMENTADO PARCIALMENTE | CaixaReciboModal print | window.print fallback | — | — | Médio | Venda não depende HW | — | Não |
| 83 | D.HW | Display cliente | P3 | NÃO SE APLICA AO PILOTO | — | — | — | — | Baixo | Backlog | — | Não |
| 84 | D.HW | Balança | P3 | NÃO SE APLICA AO PILOTO | — | — | — | — | Baixo | Backlog | — | Não |
| 85 | E.CAIXA | Abertura | P0 | IMPLEMENTADO E VALIDADO | CaixaAbrirTurnoModal | abrirCaixaOperador | caixas | caixa-modais-abrir-fechar.spec.ts | Baixo | — | — | Não |
| 86 | E.CAIXA | Fundo inicial | P0 | IMPLEMENTADO E VALIDADO | CaixaAbrirTurnoModal | valor_inicial | caixas | caixa-fluxos-criticos.spec.ts | Baixo | — | — | Não |
| 87 | E.CAIXA | Sangria | P0 | IMPLEMENTADO E VALIDADO | CaixaPdvOperacoesMenu | registrar_movimentacao | movimentacoes_caixa | caixa-fluxos-criticos.spec.ts | Baixo | — | — | Não |
| 88 | E.CAIXA | Suprimento | P0 | IMPLEMENTADO E VALIDADO | CaixaPdvOperacoesMenu | registrar_movimentacao | movimentacoes_caixa | caixa-fluxos-criticos.spec.ts | Baixo | — | — | Não |
| 89 | E.CAIXA | Motivo obrigatório | P1 | IMPLEMENTADO PARCIALMENTE | Modal movimento | validation actions | movimentacoes_caixa | — | Baixo | — | — | Não |
| 90 | E.CAIXA | Controle por operador | P0 | IMPLEMENTADO E VALIDADO | Status caixa operador | obter_status_caixa_operador | caixas.operador_id | cashSession.test.ts | Baixo | — | — | Não |
| 91 | E.CAIXA | Saldo esperado | P0 | IMPLEMENTADO E VALIDADO | Fechamento modal | calcular_valor_sistema_dinheiro_caixa | 053 migration | financial-adversarial-gates.test.sql | Baixo | Só dinheiro | — | Não |
| 92 | E.CAIXA | Conferência por forma | P0 | IMPLEMENTADO PARCIALMENTE | Fechamento recibo | — | — | missao3 artifact | Alto | PIX/cartão ausentes fechamento | UI breakdown formas | Sim |
| 93 | E.CAIXA | Valor contado | P0 | IMPLEMENTADO E VALIDADO | CaixaFechamentoReciboModal | fechar_caixa_atomico | caixas.valor_fechamento | caixa-fluxos-criticos.spec.ts | Baixo | Só dinheiro físico | — | Não |
| 94 | E.CAIXA | Diferença esp×contado | P0 | IMPLEMENTADO E VALIDADO | Fechamento recibo | fechar_caixa_atomico diff | caixas.diferenca | caixa-fluxos-criticos.spec.ts | Baixo | Só dinheiro | — | Não |
| 95 | E.CAIXA | Fechamento | P0 | IMPLEMENTADO E VALIDADO | CaixaFechamentoReciboModal | fechar_caixa_atomico | caixas status FECHADO | caixa-modais-abrir-fechar.spec.ts | Baixo | — | — | Não |
| 96 | E.CAIXA | Histórico | P1 | IMPLEMENTADO PARCIALMENTE | — | listagem caixas | caixas | — | Baixo | Sem página relatório dedicada | — | Não |
| 97 | E.CAIXA | Reabertura autorizada | P1 | NÃO IMPLEMENTADO | — | — | — | GO_LIVE §167 FAIL | Médio | D0-05 adiado | RPC reabertura | Não |
| 98 | E.CAIXA | Auditoria reabertura | P1 | NÃO IMPLEMENTADO | — | — | — | BACKLOG D0-004 | Médio | — | — | Não |
| 99 | E.CAIXA | Relatório diferenças | P1 | IMPLEMENTADO PARCIALMENTE | Recibo fechamento | caixas.diferenca | caixas | — | Baixo | Sem agregado período | — | Não |
| 100 | E.CAIXA | Integridade vendas×fechamento | P0 | IMPLEMENTADO PARCIALMENTE | caixa-fase6-reconciliacao | calcular_valor_sistema | caixas/vendas | caixa-fase6-reconciliacao.spec.ts | Médio | Reconciliação dinheiro only | — | Não |
| 101 | F.CAD | Descrição | P0 | IMPLEMENTADO E VALIDADO | ProdutoFormModal | productUpdater | produtos | productUpdater.test.ts | Baixo | — | — | Não |
| 102 | F.CAD | SKU/referência | P1 | IMPLEMENTADO E VALIDADO | ProdutoFormModal | codigo_interno | produtos | qa-produtos-modulo.spec.ts | Baixo | Não busca caixa | — | Não |
| 103 | F.CAD | Código barras | P0 | IMPLEMENTADO E VALIDADO | ProdutoFormModal | codigo_barras | produtos | qa-produtos-modulo.spec.ts | Baixo | — | — | Não |
| 104 | F.CAD | Categoria | P0 | IMPLEMENTADO E VALIDADO | ProdutoFormModal | categoria_id | categorias | qa-produtos-modulo.spec.ts | Baixo | — | — | Não |
| 105 | F.CAD | Marca | P1 | IMPLEMENTADO E VALIDADO | ProdutoFormModal | marca_id | marcas | — | Baixo | — | — | Não |
| 106 | F.CAD | Unidade | P0 | IMPLEMENTADO E VALIDADO | ProdutoFormModal | unidade | produtos | — | Baixo | — | — | Não |
| 107 | F.CAD | Fornecedor | P1 | IMPLEMENTADO E VALIDADO | FornecedorCombobox | fornecedor_id | fornecedores | — | Baixo | Inline legado | — | Não |
| 108 | F.CAD | Custo | P0 | IMPLEMENTADO E VALIDADO | PrecosSection | preco_custo nullable D0-02 | produtos | productUpdater.test.ts | Baixo | — | — | Não |
| 109 | F.CAD | Preço varejo | P0 | IMPLEMENTADO E VALIDADO | PrecosSection | preco_varejo | produtos | — | Baixo | — | — | Não |
| 110 | F.CAD | Faixas atacado | P0 | IMPLEMENTADO E VALIDADO | FaixasAtacadoEditor | precos_atacado | precos_atacado | productUpdater.test.ts | Baixo | — | — | Não |
| 111 | F.CAD | Margem | P1 | IMPLEMENTADO E VALIDADO | PrecosSection display | trigger 125 | produtos | — | Baixo | — | — | Não |
| 112 | F.CAD | Estoque mínimo | P1 | IMPLEMENTADO E VALIDADO | ProdutoFormModal | estoque_minimo | estoque | — | Baixo | — | — | Não |
| 113 | F.CAD | Localização física | P2 | IMPLEMENTADO E VALIDADO | ProdutoFormModal | localizacao_prateleira | produtos | — | Baixo | — | — | Não |
| 114 | F.CAD | Ativo/inativo | P0 | IMPLEMENTADO E VALIDADO | ProdutoFormModal | ativo | produtos | — | Baixo | — | — | Não |
| 115 | F.CAD | Imagem | P2 | IMPLEMENTADO PARCIALMENTE | ProdutoFormModal | storage upload | produtos.imagem | — | Baixo | — | — | Não |
| 116 | F.CAD | Observações | P2 | IMPLEMENTADO E VALIDADO | ProdutoFormModal | observacoes | produtos | — | Baixo | — | — | Não |
| 117 | F.CAD | Variantes cor/tamanho | P3 | NÃO IMPLEMENTADO | — | — | — | — | Baixo | Fora escopo | — | Não |
| 118 | F.CAD | Barcode duplicado | P0 | IMPLEMENTADO E VALIDADO | ProdutoFormModal | unique constraint | produtos | productUpdater.test.ts | Baixo | — | — | Não |
| 119 | F.CAD | Cadastro rápido | P3 | NÃO SE APLICA AO PILOTO | Removido caixa | pdv_cadastro_removido | — | — | Baixo | — | — | Não |
| 120 | F.CAD | Cadastro completo | P0 | IMPLEMENTADO E VALIDADO | /admin/catalogo | criar_produto_com_estoque_inicial | produtos | qa-produtos-modulo.spec.ts | Baixo | — | — | Não |
| 121 | F.CAD | Categoria imediata | P0 | IMPLEMENTADO E VALIDADO | SelectComCadastroRapido + mergeOpcoes | criarCategoriaProduto | categorias | categoriaOpcoes + actions A3 | Baixo | — | — | Não |
| 122 | F.CAD | Marca imediata | P1 | IMPLEMENTADO E VALIDADO | SelectComCadastroRapido + mergeOpcoes | criarMarcaProduto | marcas | marcaOpcoes + actions.test | Baixo | — | — | Não |
| 123 | F.CAD | Persistência refresh | P0 | IMPLEMENTADO E VALIDADO | /admin/catalogo | productReader | produtos | qa-produtos-modulo.spec.ts | Baixo | — | — | Não |
| 124 | F.CAD | Histórico alterações | P2 | IMPLEMENTADO PARCIALMENTE | HistoricoPrecosSection | historico_precos_produto | historico_precos_produto | — | Médio | Só preços produto | — | Não |
| 125 | G.EST | Entrada | P0 | IMPLEMENTADO E VALIDADO | /admin/estoque/recebimento | confirmar_remessa_entrada | estoque | gerente-transferencias.spec.ts | Baixo | — | — | Não |
| 126 | G.EST | Saída por venda | P0 | IMPLEMENTADO E VALIDADO | /caixa finalize | decrementar_estoque_seguro | estoque/estoque_baixas | finalizarVendaCaixa.integration.test.ts | Baixo | — | — | Não |
| 127 | G.EST | Reversão cancelamento | P0 | IMPLEMENTADO E VALIDADO | VendaCancelarModal | cancelar_venda_transacional | estoque_reposicoes_cancelamento | cancelarVendaContrato.integration.test.ts | Baixo | — | — | Não |
| 128 | G.EST | Reversão devolução | P0 | IMPLEMENTADO E VALIDADO | VendaDevolucaoModal | devolver_ou_trocar_venda | estoque_reposicoes_devolucao | devolucao-troca-cadeia.test.ts | Baixo | — | — | Não |
| 129 | G.EST | Ajuste manual | P0 | IMPLEMENTADO E VALIDADO | AjusteSaldoModal | ajustar_estoque_manual | movimentos_estoque_log | inventoryAdjustment.test.ts | Baixo | — | — | Não |
| 130 | G.EST | Motivo ajuste | P0 | IMPLEMENTADO E VALIDADO | AjusteSaldoModal | motivo enum | movimentos_estoque_log | actions.validation.test.ts | Baixo | — | — | Não |
| 131 | G.EST | Inventário formal | P2 | NÃO IMPLEMENTADO | — | — | — | ADR-008 | Médio | Só ACERTO_INVENTARIO unitário | — | Não |
| 132 | G.EST | Kardex/histórico | P0 | IMPLEMENTADO E VALIDADO | KardexSheet | v_kardex_unificado | v_kardex_unificado | kardex-unificado matrix.test.ts | Baixo | — | — | Não |
| 133 | G.EST | Usuário responsável | P0 | IMPLEMENTADO E VALIDADO | KardexSheet | operador_id log | movimentos_estoque_log | — | Baixo | — | — | Não |
| 134 | G.EST | Data/hora | P0 | IMPLEMENTADO E VALIDADO | KardexSheet | created_at | movimentos_estoque_log | — | Baixo | — | — | Não |
| 135 | G.EST | Estoque anterior | P1 | IMPLEMENTADO PARCIALMENTE | KardexSheet | saldo_anterior col | v_kardex_unificado | — | Baixo | — | — | Não |
| 136 | G.EST | Estoque posterior | P1 | IMPLEMENTADO PARCIALMENTE | KardexSheet | saldo_posterior | v_kardex_unificado | — | Baixo | — | — | Não |
| 137 | G.EST | Estoque mínimo | P1 | IMPLEMENTADO E VALIDADO | EstoqueTable | estoque_minimo | estoque | — | Baixo | — | — | Não |
| 138 | G.EST | Alerta estoque baixo | P1 | IMPLEMENTADO E VALIDADO | StockAlertBadge | v_estoque_baixo | v_estoque_baixo | gerente.spec.ts | Baixo | — | — | Não |
| 139 | G.EST | Transferência lojas | P1 | IMPLEMENTADO E VALIDADO | /admin/estoque/transferencias | transferir_estoque_seguro | transferencias | gerente-transferencias.spec.ts | Baixo | Piloto 1 loja | — | Não |
| 140 | G.EST | Divergências inventário | P2 | IMPLEMENTADO PARCIALMENTE | /admin/relatorios | v_estoque_ledger_divergencia | view divergência | — | Médio | Detector não auto-fix | — | Não |
| 141 | G.EST | Sem movimentação | P2 | IMPLEMENTADO E VALIDADO | /admin/relatorios sem-giro | relatorio_produtos_sem_giro | — | — | Baixo | — | — | Não |
| 142 | G.EST | Curva ABC estoque | P2 | IMPLEMENTADO E VALIDADO | RelatoriosContent | relatorio_curva_abc_periodo | — | RelatoriosContent.behavior.test.tsx | Baixo | — | — | Não |
| 143 | H.TROCA | Localizar venda original | P0 | IMPLEMENTADO E VALIDADO | /admin/vendas | VendaDetailSheet | vendas | admin-vendas-devolucao-troca.spec.ts | Baixo | — | — | Não |
| 144 | H.TROCA | Devolução parcial | P0 | IMPLEMENTADO E VALIDADO | VendaDevolucaoModal | devolver_ou_trocar_venda | venda_pos_venda_itens | devolucao-troca-cadeia.test.ts | Baixo | — | — | Não |
| 145 | H.TROCA | Devolução total | P0 | IMPLEMENTADO E VALIDADO | VendaDevolucaoModal | devolver_ou_trocar_venda | — | admin-vendas-devolucao-troca.spec.ts | Baixo | Status fica CONCLUIDA | — | Não |
| 146 | H.TROCA | Reintegração estoque | P0 | IMPLEMENTADO E VALIDADO | — | estoque_reposicoes_devolucao | estoque | devolucao-troca-cadeia.test.ts | Baixo | — | — | Não |
| 147 | H.TROCA | Motivo | P1 | IMPLEMENTADO E VALIDADO | VendaDevolucaoModal | motivo campo | venda_pos_venda_operacoes | — | Baixo | — | — | Não |
| 148 | H.TROCA | Operador responsável | P0 | IMPLEMENTADO E VALIDADO | — | p_operador_id | venda_pos_venda_operacoes | — | Baixo | — | — | Não |
| 149 | H.TROCA | Autorização gerencial | P1 | IMPLEMENTADO PARCIALMENTE | GERENTE+ UI | RLS perfil | — | admin-vendas-devolucao-troca.spec.ts | Baixo | — | — | Não |
| 150 | H.TROCA | Reembolso coerente | P0 | IMPLEMENTADO E VALIDADO | — | devolucoes valor | devolucoes | cancelarVendaValorEstornado.test.ts | Baixo | — | — | Não |
| 151 | H.TROCA | Estorno por forma pag | P0 | IMPLEMENTADO PARCIALMENTE | — | caixa/CR ajuste | — | devolucao-troca-cadeia.test.ts | Médio | Cartão manual | — | Não |
| 152 | H.TROCA | Troca produto | P1 | IMPLEMENTADO E VALIDADO | VendaDevolucaoModal TROCA | venda_substituta_id | — | devolucao-troca-cadeia.test.ts | Baixo | — | — | Não |
| 153 | H.TROCA | Diferença a pagar | P1 | IMPLEMENTADO PARCIALMENTE | Troca flow | — | — | — | Médio | Troca manual 2 vendas | — | Não |
| 154 | H.TROCA | Diferença a devolver | P1 | IMPLEMENTADO PARCIALMENTE | Devolução parcial | proporcional preço | — | devolucao-troca-cadeia.test.ts | Baixo | — | — | Não |
| 155 | H.TROCA | Auditoria completa | P0 | IMPLEMENTADO PARCIALMENTE | /admin/auditoria | venda_pos_venda_operacoes | venda_eventos | — | Médio | Status venda ambíguo | — | Não |
| 156 | I.PERM | Usuários individuais | P0 | IMPLEMENTADO E VALIDADO | /admin/funcionarios | usuarios table | usuarios | login-contrato-perfil.spec.ts | Baixo | — | — | Não |
| 157 | I.PERM | Perfil DONO | P0 | IMPLEMENTADO E VALIDADO | middleware | 044 migration Pattern A | usuarios | test-rls-scope.mjs | Baixo | — | — | Não |
| 158 | I.PERM | Perfil ADMIN | P0 | IMPLEMENTADO E VALIDADO | /admin/provisionamento | 044/251 RLS | usuarios | smoke-fase1-provisionamento | Baixo | — | — | Não |
| 159 | I.PERM | Perfil GERENTE | P0 | IMPLEMENTADO E VALIDADO | /admin/* | assertGerenteSession | usuarios | login-contrato-perfil.spec.ts | Baixo | — | — | Não |
| 160 | I.PERM | Perfil OPERADOR | P0 | IMPLEMENTADO E VALIDADO | /caixa only | middlewareAdminDecision | usuarios | login-contrato-perfil.spec.ts | Baixo | — | — | Não |
| 161 | I.PERM | Demais perfis | P3 | NÃO SE APLICA AO PILOTO | 4 perfis canônicos | usuarios_perfil_check | — | — | Baixo | — | — | Não |
| 162 | I.PERM | Isolamento loja | P0 | IMPLEMENTADO E VALIDADO | RLS | 042/044 migrations | loja_id | test-rls-scope.mjs (42 rules) | Alto | — | — | Não |
| 163 | I.PERM | Restrições admin | P0 | IMPLEMENTADO E VALIDADO | adminPolicy | loadAdminContext | — | admin-gerente-authority.test.ts | Baixo | Algumas páginas layout-only | — | Não |
| 164 | I.PERM | Autoriz. gerenciais | P0 | IMPLEMENTADO E VALIDADO | CaixaGerenteModal | descontoGerenteToken | descontos_venda | — | Baixo | — | — | Não |
| 165 | I.PERM | Auditoria vendas | P1 | IMPLEMENTADO E VALIDADO | /admin/auditoria | venda_eventos | venda_eventos | fluxo-operacional-completo.spec.ts | Baixo | — | — | Não |
| 166 | I.PERM | Auditoria cancelamentos | P0 | IMPLEMENTADO E VALIDADO | /admin/auditoria | vendas_canceladas_auditoria | 050 migration | cancelarVendaContrato.integration.test.ts | Baixo | — | — | Não |
| 167 | I.PERM | Auditoria estoque | P1 | IMPLEMENTADO E VALIDADO | KardexSheet | movimentos_estoque_log | v_kardex_unificado | — | Baixo | — | — | Não |
| 168 | I.PERM | Auditoria preços | P2 | IMPLEMENTADO PARCIALMENTE | HistoricoPrecosSection | historico_precos_produto | — | — | Médio | Tiers fora | — | Não |
| 169 | I.PERM | Auditoria descontos | P0 | IMPLEMENTADO E VALIDADO | — | descontos_venda | descontos_venda | — | Baixo | — | — | Não |
| 170 | I.PERM | Auditoria financeira | P1 | IMPLEMENTADO E VALIDADO | /admin/financeiro | AR/AP ledger | contas_* | financial-idempotency test | Baixo | — | — | Não |
| 171 | I.PERM | Auditoria config | P2 | IMPLEMENTADO PARCIALMENTE | /admin/configuracoes | pdv_config | pdv_config | — | Baixo | Sem trail dedicado | — | Não |
| 172 | I.PERM | Usuário/data/hora | P0 | IMPLEMENTADO E VALIDADO | Auditoria UI | created_at operador | ledgers | — | Baixo | — | — | Não |
| 173 | I.PERM | Estado ant/post | P2 | IMPLEMENTADO PARCIALMENTE | — | historico_precos | — | — | Baixo | Parcial domínios | — | Não |
| 174 | I.PERM | Estação/dispositivo | P3 | NÃO IMPLEMENTADO | — | — | — | — | Baixo | — | — | Não |
| 175 | I.PERM | Proteção backend | P0 | IMPLEMENTADO E VALIDADO | — | RLS+RPC guards | scope-guard v4 | test-rls-scope.mjs | Alto | — | — | Não |
| 176 | J.CONF | Venda idempotente | P0 | IMPLEMENTADO E VALIDADO | loading UI | idempotency_key v4 | vendas | finalizarVendaCaixa.integration.test.ts | Baixo | — | — | Não |
| 177 | J.CONF | Pagamento anti-dup | P0 | IMPLEMENTADO E VALIDADO | useCaixaPagamentos | p_pagamentos v4 | vendas_pagamentos | financial-idempotency test | Baixo | — | — | Não |
| 178 | J.CONF | Estoque anti-dup baixa | P0 | IMPLEMENTADO E VALIDADO | — | decrementar_estoque_seguro | estoque_baixas | 127 migration | Baixo | — | — | Não |
| 179 | J.CONF | Ops transacionais | P0 | IMPLEMENTADO E VALIDADO | — | RPCs atômicos | — | p0-venda-homologacao.matrix.test.ts | Baixo | — | — | Não |
| 180 | J.CONF | Recuperação pós falha | P1 | IMPLEMENTADO PARCIALMENTE | mensagemErroUsuario | retry idempotency | — | mensagemErroUsuario.test.ts | Médio | Sem DR comprovado | — | Não |
| 181 | J.CONF | Erros compreensíveis | P1 | IMPLEMENTADO E VALIDADO | caixaErroOperador | mensagemErroParaUsuario | — | mensagemErroUsuario.test.ts | Baixo | — | — | Não |
| 182 | J.CONF | Loading anti-duplo clique | P0 | IMPLEMENTADO E VALIDADO | CaixaPageClient | finalize guard | — | caixa-golden-flow-cycle5.spec.ts | Baixo | — | — | Não |
| 183 | J.CONF | Backup automático | P0 | NÃO IMPLEMENTADO | — | backup.sh repo only | — | P0-2 FAIL | Crítico | Decisão: sem Pro; Onda 7 | pg_dump agendado futuro | Sim |
| 184 | J.CONF | Evidência backup | P0 | NÃO IMPLEMENTADO | — | — | — | P0-2 FAIL | Crítico | Sem execução automática | Onda 7 | Sim |
| 185 | J.CONF | Restore comprovado | P0 | NÃO IMPLEMENTADO | — | — | — | P0-3 bloqueado | Crítico | Sem drill | Onda 7 | Sim |
| 186 | J.CONF | RPO conhecido | P0 | NÃO IMPLEMENTADO | — | D0-06 meta 24h | — | P0-2 | Crítico | Meta não demonstrada | Onda 7 | Sim |
| 187 | J.CONF | RTO conhecido | P0 | NÃO IMPLEMENTADO | — | D0-06 meta 8h | — | P0-2 | Crítico | Meta não demonstrada | Onda 7 | Sim |
| 188 | J.CONF | Logs erros | P1 | IMPLEMENTADO PARCIALMENTE | — | console/server logs | system_alerts | — | Médio | Sem Sentry prod comprovado | — | Não |
| 189 | J.CONF | Observabilidade | P2 | IMPLEMENTADO PARCIALMENTE | /api/health | gitSha deployment | — | SSRA CI | Baixo | — | — | Não |
| 190 | J.CONF | Falha rede | P1 | IMPLEMENTADO PARCIALMENTE | — | pdv-local outbox | sync-outbox | outboxEventValidate.test.ts | Médio | Web caixa online-only | — | Não |
| 191 | J.CONF | Backend indisponível | P1 | IMPLEMENTADO PARCIALMENTE | Erro UI | mensagemErroUsuario | — | — | Médio | Web sem offline | — | Não |
| 192 | J.CONF | Integridade retry | P0 | IMPLEMENTADO E VALIDADO | idempotency | claim anti-duplicata | vendas_em_espera | caixaVendaEspera.claim.test.ts | Baixo | — | — | Não |
| 193 | J.CONF | RLS ops críticas | P0 | IMPLEMENTADO E VALIDADO | — | 42 RLS rules CI | — | test-rls-scope.mjs | Alto | — | — | Não |
| 194 | K.REL | Vendas do dia | P0 | IMPLEMENTADO E VALIDADO | /admin/relatorios | relatorio_vendas_por_dia | — | RelatoriosContent.behavior.test.tsx | Baixo | — | — | Não |
| 195 | K.REL | Vendas por período | P0 | IMPLEMENTADO E VALIDADO | RelatoriosContent | relatorio_*_periodo | — | gerente.spec.ts | Baixo | — | — | Não |
| 196 | K.REL | Vendas por operador | P1 | IMPLEMENTADO PARCIALMENTE | RelatoriosContent | relatorio_margem_por_venda | vendas.operador_id | — | Baixo | Sem report dedicado operador | — | Não |
| 197 | K.REL | Vendas por produto | P0 | IMPLEMENTADO E VALIDADO | RelatoriosContent | relatorio_top_produtos | — | — | Baixo | — | — | Não |
| 198 | K.REL | Vendas por categoria | P2 | IMPLEMENTADO PARCIALMENTE | — | via produto join | — | — | Baixo | Sem RPC dedicada | — | Não |
| 199 | K.REL | Vendas por forma pag | P1 | IMPLEMENTADO PARCIALMENTE | — | vendas_pagamentos agreg | vendas_pagamentos | — | Médio | Sem UI report dedicada | — | Não |
| 200 | K.REL | Estoque atual | P0 | IMPLEMENTADO E VALIDADO | /admin/estoque | gerente_estoque_list | estoque | gerente.spec.ts | Baixo | — | — | Não |
| 201 | K.REL | Movimentação estoque | P0 | IMPLEMENTADO E VALIDADO | KardexSheet | v_kardex_unificado | — | — | Baixo | — | — | Não |
| 202 | K.REL | Abaixo mínimo | P1 | IMPLEMENTADO E VALIDADO | RelatoriosContent | v_estoque_baixo | v_estoque_baixo | — | Baixo | — | — | Não |
| 203 | K.REL | Curva ABC | P2 | IMPLEMENTADO E VALIDADO | RelatoriosContent | relatorio_curva_abc | — | — | Baixo | D0-10 pós-piloto opcional | — | Não |
| 204 | K.REL | Margem/lucro | P1 | IMPLEMENTADO E VALIDADO | RelatoriosContent | relatorio_margem/resumo | — | — | Baixo | — | — | Não |
| 205 | K.REL | Fechamentos caixa | P1 | IMPLEMENTADO PARCIALMENTE | Recibo fechamento | caixas histórico | caixas | — | Médio | Sem report agregado | — | Não |
| 206 | K.REL | Diferenças caixa | P1 | IMPLEMENTADO PARCIALMENTE | Fechamento recibo | caixas.diferenca | caixas | — | Baixo | — | — | Não |
| 207 | K.REL | Contas a pagar | P1 | IMPLEMENTADO E VALIDADO | /admin/financeiro AP | payableReader | contas_pagar | ap-payments-reconciliation.test.sql | Baixo | — | — | Não |
| 208 | K.REL | Contas a receber | P1 | IMPLEMENTADO E VALIDADO | /admin/financeiro AR | receivableReader | contas_receber | ar-receipts-reconciliation.test.sql | Baixo | — | — | Não |
| 209 | L.UX | Teclado eficiente | P1 | IMPLEMENTADO E VALIDADO | useCaixaKeyboardShortcuts | F-keys atalhos | — | useCaixaKeyboardShortcuts.behavior.test.tsx | Baixo | — | — | Não |
| 210 | L.UX | Scanner eficiente | P0 | IMPLEMENTADO E VALIDADO | useCaixaScanPipeline | auto-focus search | — | webCaixaScanProcess.test.ts | Baixo | — | — | Não |
| 211 | L.UX | Foco pós-item busca | P1 | IMPLEMENTADO E VALIDADO | CaixaSearchBar | focus restore | — | — | Baixo | — | — | Não |
| 212 | L.UX | Enter confirma | P1 | IMPLEMENTADO E VALIDADO | Caixa keyboard | Enter handlers | — | — | Baixo | — | — | Não |
| 213 | L.UX | Atalhos frequentes | P1 | IMPLEMENTADO E VALIDADO | CaixaPdvOperacoesMenu | F3/F6/F12 Ctrl+Shift | — | caixa-pagamento-atalhos.spec.ts | Baixo | — | — | Não |
| 214 | L.UX | Cliques adequados | P1 | IMPLEMENTADO PARCIALMENTE | Caixa layout | — | — | caixa-golden-flow-cycle5.spec.ts | Baixo | — | — | Não |
| 215 | L.UX | Feedback visual | P1 | IMPLEMENTADO E VALIDADO | Toast/badge | — | — | — | Baixo | — | — | Não |
| 216 | L.UX | Anti duplo clique | P0 | IMPLEMENTADO E VALIDADO | loading states | finalize guard | — | caixa-golden-flow-cycle5.spec.ts | Baixo | — | — | Não |
| 217 | L.UX | Confirma destrutivas | P1 | IMPLEMENTADO E VALIDADO | Modais confirm | AlertDialog | — | — | Baixo | — | — | Não |
| 218 | L.UX | Monetário BR | P0 | IMPLEMENTADO E VALIDADO | formatDecimalBRL | money formatters | — | — | Baixo | — | — | Não |
| 219 | L.UX | PT-BR consistente | P1 | IMPLEMENTADO PARCIALMENTE | caixaMsgServidor | pt.json err_srv_* | Zod/RPC residuais | caixaMensagensServidor.test.ts | Baixo | — | Lote 4C | Não |
| 220 | L.UX | Chinês consistente | P1 | IMPLEMENTADO PARCIALMENTE | caixaMsgServidor zh | paridade test | UI fora escopo | caixa-i18n-parity.test.ts | Médio | Zod PT em finalize | Lote 4C | Não |
| 221 | L.UX | Hover ícones visíveis | P2 | IMPLEMENTADO E VALIDADO | Tabelas cadastro/admin | theme-oriental.css dragon-light | — | visual-hover-selection.ssot.test.ts | Baixo | — | — | Não |
| 222 | L.UX | Seleção texto legível | P2 | IMPLEMENTADO E VALIDADO | layout body | globals.css ::selection | tokens brand/fg | visual-hover-selection.ssot.test.ts | Baixo | — | — | Não |
| 223 | L.UX | Disabled/loading claro | P1 | IMPLEMENTADO E VALIDADO | Button disabled | loading props | — | — | Baixo | — | — | Não |
| 224 | L.UX | Ops sem nav extra | P0 | IMPLEMENTADO E VALIDADO | /caixa single page | — | — | caixa.spec.ts | Baixo | — | — | Não |
| 225 | L.UX | Cadastro produto intuitivo | P1 | IMPLEMENTADO PARCIALMENTE | ProdutoFormModal | multi-step | — | qa-produtos-modulo.spec.ts | Médio | Legacy fields atacado confusos | — | Não |
| 226 | L.UX | Venda rápida balcão | P0 | IMPLEMENTADO E VALIDADO | /caixa flow | scan→pay | — | caixa-golden-flow-cycle5.spec.ts | Baixo | — | — | Não |
| 227 | M.FISC | NF-e emissão | P3 | NÃO SE APLICA AO PILOTO | FiscalStubNotice | NFC_E_STUB queue | documentos_fiscais | D0-09 | Baixo | Stub honesto | Contratar Focus | Não |
| 228 | M.FISC | NFC-e emissão | P3 | NÃO SE APLICA AO PILOTO | FiscalStubNotice | fiscal-worker mock | — | smoke_fiscal_emissao_real.sql | Baixo | Pós-piloto | — | Não |
| 229 | M.FISC | Importação NF-e | P1 | IMPLEMENTADO E VALIDADO | /admin/estoque/importar-nfe | confirmar_importacao_nfe | importacoes_nfe | nfe-conferencia tests | Baixo | Sem e2e UI | — | Não |
| 230 | M.FISC | XML | P1 | IMPLEMENTADO E VALIDADO | ImportarNfePageClient | parse XML | importacoes_nfe | actions.validation.test.ts | Baixo | Entrada only | — | Não |
| 231 | M.FISC | DANFE | P3 | NÃO IMPLEMENTADO | — | — | — | D0-09 | Baixo | — | — | Não |
| 232 | M.FISC | Cancelamento fiscal | P3 | NÃO SE APLICA AO PILOTO | — | — | — | BL2 auditoria | Baixo | Pós-piloto | — | Não |
| 233 | M.FISC | Carta correção | P3 | NÃO IMPLEMENTADO | — | — | — | — | Baixo | — | — | Não |
| 234 | M.FISC | Inutilização | P3 | NÃO IMPLEMENTADO | — | — | — | — | Baixo | — | — | Não |
| 235 | M.FISC | Consulta SEFAZ | P3 | NÃO IMPLEMENTADO | — | — | — | — | Baixo | — | — | Não |
| 236 | M.FISC | Armazenamento doc | P2 | IMPLEMENTADO PARCIALMENTE | Fiscal tab | documentos_fiscais_* | — | — | Baixo | Stub only | — | Não |
| 237 | M.FISC | Fiscal→estoque | P1 | IMPLEMENTADO E VALIDADO | importar-nfe | confirmar_importacao_nfe | estoque | nfe-conferencia-flx05.test.sql | Baixo | — | — | Não |
| 238 | M.FISC | Fiscal→financeiro | P1 | IMPLEMENTADO E VALIDADO | importar-nfe | contas_pagar NF | contas_pagar | nfe-conferencia tests | Baixo | — | — | Não |
| 239 | N.INT | WhatsApp | P3 | NÃO SE APLICA AO PILOTO | — | D0-08 backlog | — | — | Baixo | — | — | Não |
| 240 | N.INT | E-mail | P3 | NÃO IMPLEMENTADO | — | — | — | — | Baixo | — | — | Não |
| 241 | N.INT | E-commerce | P3 | NÃO IMPLEMENTADO | — | — | — | — | Baixo | — | — | Não |
| 242 | N.INT | Marketplaces | P3 | NÃO IMPLEMENTADO | — | — | — | — | Baixo | — | — | Não |
| 243 | N.INT | Fidelidade | P3 | NÃO IMPLEMENTADO | — | — | — | — | Baixo | — | — | Não |
| 244 | N.INT | Gift cards | P3 | NÃO IMPLEMENTADO | — | — | — | — | Baixo | — | — | Não |
| 245 | N.INT | CRM | P3 | NÃO IMPLEMENTADO | — | — | — | — | Baixo | — | — | Não |
| 246 | N.INT | Display cliente | P3 | NÃO SE APLICA AO PILOTO | — | — | — | — | Baixo | — | — | Não |
| 247 | N.INT | Balança | P3 | NÃO SE APLICA AO PILOTO | — | — | — | — | Baixo | — | — | Não |
| 248 | N.INT | Etiquetas | P2 | IMPLEMENTADO PARCIALMENTE | /admin/estoque/imprimir-etiquetas | — | — | gerente e2e | Baixo | — | — | Não |
| 249 | N.INT | Integrações bancárias | P3 | NÃO IMPLEMENTADO | — | — | — | — | Baixo | PIX manual | — | Não |
| 250 | N.INT | BI avançado | P3 | NÃO IMPLEMENTADO | — | — | — | — | Baixo | Relatórios básicos OK | — | Não |

---

## 4. BLOQUEADORES P0 (não prontos)

| Ordem | ID | Capacidade | Status | Nota |
|-------|-----|------------|--------|------|
| 1 | 183–187 | Backup/restore/RPO/RTO | NÃO IMPLEMENTADO | **Aberto consciente** — Onda 7 (sem Pro) |
| 2 | 36 | Atacado automático runtime | EXISTE MAS NÃO VALIDADO | Onda 2 — validar E2E primeiro |
| 3 | 92 | Conferência fechamento por forma | IMPLEMENTADO PARCIALMENTE | Onda 3 |

---

## 5. Decisão final de prontidão

# NOT READY FOR PAID PILOT

Bloqueadores ativos: **atacado não validado (36)**, **fechamento por forma (92)**, **backup/restore aberto por decisão (183–187)**.

**Próximo passo autorizado somente com:** `GO — ONDA 1`
