# Auditoria de Impressão — FastProduct / Jīn Lóng

**Data:** 20/08/2026
**Escopo:** Toda a funcionalidade de impressão (backend + frontend)
**Motivação:** Treinamento do cliente #1 em 21/08/2026
**Fora de escopo (confirmado com o solicitante):** NFC-e/NF-e (DANFE), impressão de contas a receber/pagar (AR/AP desligado no piloto)

---

## 📋 Resumo Executivo

O sistema implementa uma infraestrutura de impressão em **três camadas**:

1. **Recibo de venda** (Caixa/PDV) → impressora térmica via WebUSB (ESC/POS) + fallback de impressão via navegador
2. **Etiquetas de produtos** (Estoque) → PDF com código de barras, download em lote
3. **Relatórios gerenciais** (Analytics) → exportação CSV/XLSX

**Achado crítico:** o comprovante de **sangria/suprimento** — que o time acreditava já estar implementado — **não existia**. Após registrar a movimentação, o sistema apenas mostrava um toast de confirmação, sem nenhuma opção de impressão. **Esta lacuna foi corrigida nesta auditoria** (ver seção 6).

Três outras lacunas foram identificadas (comprovante de devolução/troca, de cancelamento, e relatório de fechamento de caixa) — nenhuma delas estava na lista de prioridades para o treinamento de amanhã, então foram documentadas como recomendação para a próxima sprint, não corrigidas agora, para não introduzir risco de última hora em fluxos financeiros sensíveis (ver seção 7).

---

## 1. Mapeamento Completo dos Pontos de Impressão

| # | Funcionalidade | Status Encontrado | Mecanismo |
|---|---|---|---|
| 1 | Recibo de venda | ✅ Funcional | Térmica (ESC/POS via WebUSB) + browser print |
| 2 | Reimpressão F12 (última venda) | ✅ Funcional | Reabre `CaixaReciboModal` com `lastReciboRef` |
| 3 | Reimpressão via histórico (qualquer venda) | ✅ Funcional | `CaixaHistoricoSheet` → botão "Imprimir cupom" |
| 4 | Recibo de sangria/suprimento | ❌ Não existia → ✅ **Corrigido nesta auditoria** | Novo: browser print |
| 5 | Etiquetas de produtos (avulsa/lote) | ✅ Funcional | PDF (jsPDF) + código de barras (bwip-js), até 500/lote |
| 6 | Etiqueta pelo histórico do caixa | ⚠️ Botão desabilitado (TODO explícito no código) | — |
| 7 | Relatórios gerenciais (vendas, produtos, estoque, margem, curva ABC) | ⚠️ Só exportação CSV/XLSX — sem impressão/PDF dedicado | `useRelatoriosGerenteExports.ts` |
| 8 | Comprovante de fechamento de caixa | ❌ Não existe | Apenas toast textual com resumo |
| 9 | Comprovante de devolução/troca | ❌ Não existe | RPC retorna só IDs/valores, sem dados de recibo |
| 10 | Comprovante de cancelamento de venda | ❌ Não existe | Mesma situação do item 9 |
| 11 | NFC-e/NF-e (DANFE) | 🚫 Fora de escopo | Confirmado como não prioritário |
| 12 | Impressão de contas a receber/pagar | 🚫 Fora de escopo | AR/AP desligado no piloto |

---

## 2. Backend — Funções e RPCs Relacionadas

Não existem RPCs dedicadas a "imprimir" — a impressão é 100% client-side, construída a partir de dados que as actions já retornam. As funções relevantes de **relatório** (fonte dos dados exportáveis) estão em:

- `relatorio_vendas_por_dia_periodo()`, `relatorio_top_produtos_periodo()`, `relatorio_resumo_executivo_periodo()` — `20260818000000_reconcile_production_report_functions.sql`
- `relatorio_margem_por_venda_periodo()` — `20260621003400_238_relatorio_margem_por_venda.sql`
- `relatorio_curva_abc()` — `20260621003500_239_relatorio_curva_abc.sql`
- `relatorio_previsao_estoque()` — `20260621003600_240_relatorio_previsao_estoque.sql`

**Lacuna de backend identificada:** `devolver_ou_trocar_venda` (RPC) retorna apenas `operacao_id, venda_id, tipo, valor_estornado, valor_caixa_estornado, status_venda` — não retorna os itens devolvidos nem dados suficientes para montar um comprovante. Se a impressão de devolução for implementada no futuro, a RPC precisará ser estendida (ou uma query complementar precisará buscar os itens).

---

## 3. Frontend — Componentes e Hooks Existentes

### Recibo de venda (funcional)
- [`hooks/useThermalPrinter.ts`](../pdv-importados/hooks/useThermalPrinter.ts) — hook de estado da impressora térmica (WebUSB)
- [`lib/thermal-printer/webUsbAdapter.ts`](../pdv-importados/lib/thermal-printer/webUsbAdapter.ts) — singleton `WebUsbPrinter`, suporta Epson, Bematech, Zebra, Star, HPRT, Prolific
- [`lib/thermal-printer/escpos.ts`](../pdv-importados/lib/thermal-printer/escpos.ts) — construtor de comandos ESC/POS (CP1252, 32/64 colunas)
- [`app/caixa/CaixaReciboModal.tsx`](../pdv-importados/app/caixa/CaixaReciboModal.tsx) — modal com os dois caminhos de impressão (térmica direta + `window.print()` via iframe oculto)

### Reimpressão
- **F12**: `useCaixaKeyboardShortcuts.ts` → `onReimprimir` → reabre `CaixaReciboModal` com a última venda (`lastReciboRef`)
- **Histórico**: `CaixaHistoricoSheet.tsx` → botão "Imprimir cupom" funciona para qualquer venda selecionada (não só a última)

### Etiquetas
- [`lib/etiqueta/gerarPdf.ts`](../pdv-importados/lib/etiqueta/gerarPdf.ts) — geração de PDF via jsPDF (import dinâmico), limite de 500 etiquetas/lote para não travar o navegador
- [`lib/etiqueta/gerarBarcode.ts`](../pdv-importados/lib/etiqueta/gerarBarcode.ts) — código de barras via bwip-js (EAN13/CODE128/CODE39)
- [`app/gerente/estoque/imprimir-etiquetas/ImprimirEtiquetasPageClient.tsx`](../pdv-importados/app/gerente/estoque/imprimir-etiquetas/ImprimirEtiquetasPageClient.tsx) — busca por código, adição em lote por categoria, carrinho de etiquetas

### Relatórios
- [`app/gerente/relatorios/useRelatoriosGerenteExports.ts`](../pdv-importados/app/gerente/relatorios/useRelatoriosGerenteExports.ts) — exporta CSV/XLSX (vendas por dia, top produtos, estoque baixo)
- **Sem** botão "Imprimir" dedicado e **sem** CSS `@media print` na página de relatórios — um `Ctrl+P` do navegador imprimiria a página inteira, incluindo sidebar/navbar do admin

---

## 4. Mapeamento Backend → Frontend (Lacunas Órfãs)

| Fluxo | Backend fornece dados suficientes? | Frontend consome/imprime? | Classificação |
|---|---|---|---|
| Recibo de venda | ✅ | ✅ | Completo |
| Sangria/Suprimento | ✅ (`registrarMovimentacao` retorna saldo) | ❌ → ✅ corrigido | **Frontend incompleto → corrigido** |
| Fechamento de caixa | ✅ (`fecharCaixaOperador` retorna sistema/contado/diferença) | ❌ | **Frontend incompleto** |
| Devolução/Troca | ⚠️ Parcial (RPC não retorna itens) | ❌ | **Backend + Frontend incompletos** |
| Cancelamento de venda | A validar (não investigado a fundo — fora do escopo prioritário) | ❌ | **Frontend incompleto** |
| Relatórios | ✅ | ⚠️ Só CSV/XLSX | **Frontend parcial** |

Nenhuma função backend foi encontrada "órfã" (sem consumidor no frontend) — todas as lacunas são do lado do frontend (ou de dados insuficientes retornados pela RPC, no caso da devolução).

---

## 5. UX/UI da Impressão — Avaliação

| Critério | Recibo de venda | Etiquetas | Sangria/Suprimento (pós-fix) |
|---|---|---|---|
| Feedback visual ao imprimir | ✅ Status "Conectando…"/"Imprimindo…" | ✅ Loading no botão de gerar PDF | ✅ Modal com botão "Imprimir comprovante" |
| Impressão térmica vs. navegador | ✅ Detecta suporte WebUSB e alterna automaticamente | N/A (sempre PDF) | ⚠️ Só navegador (ver seção 7) |
| Fallback sem impressora conectada | ✅ Cai para `window.print()` quando WebUSB não é suportado | ✅ PDF sempre funciona | ✅ Sempre via navegador |
| Reconexão automática (sem repicker) | ✅ `printer.reconnect()` silencioso ao montar | N/A | N/A |
| Detecção de desconexão física | ✅ Evento `usb.disconnect` | N/A | N/A |
| Mobile/tablet | ⚠️ WebUSB não é suportado em Safari/iOS — cai corretamente para browser print, mas não foi testado em tablet Android | ✅ PDF funciona em qualquer dispositivo | ✅ Mesma lógica do recibo |

**Observação:** o app usa `role="dialog"` + `aria-modal` nos modais de impressão, e o ESC/POS já trata corretamente acentuação (CP1252) — um problema comum de recibos térmicos mal configurados. Boa cobertura de acessibilidade e i18n (PT/ZH) em todos os componentes de impressão.

---

## 6. ✅ Correção Aplicada Nesta Auditoria: Comprovante de Sangria/Suprimento

### Problema
Ao registrar uma sangria ou suprimento no caixa, o operador só via um toast de texto (`"Sangria registrada com sucesso · R$ 100,00"`) — nenhuma opção de imprimir um comprovante físico para o operador guardar ou anexar à conferência de caixa. Isso é uma lacuna operacional relevante: em qualquer PDV, a retirada/entrada de dinheiro da gaveta normalmente exige um comprovante assinável.

### Correção implementada

**Novo componente:** [`app/caixa/CaixaMovimentacaoReciboModal.tsx`](../pdv-importados/app/caixa/CaixaMovimentacaoReciboModal.tsx)
- Segue o mesmo padrão comprovado do `CaixaReciboModal.tsx` (iframe oculto + `window.print()`, sem `window.open()`, evitando o problema S5148 já mitigado no recibo de venda)
- Mostra: tipo (sangria/suprimento), valor, motivo, saldo antes/depois, data/hora, operador
- Botões "Imprimir comprovante" e "Fechar"

**Hook atualizado:** [`app/caixa/hooks/useCaixaStatusMovimentacoes.ts`](../pdv-importados/app/caixa/hooks/useCaixaStatusMovimentacoes.ts)
- Novo estado `comprovanteMovimentacao`, populado automaticamente após sucesso da movimentação (tanto o caminho direto quanto o caminho que exige aprovação de gerente)
- `saldoAntes` é derivado matematicamente do saldo final retornado pela API (a API não retorna o saldo pré-movimentação diretamente, então: `saldoAntes = saldoDepois + valor` para sangria, `saldoAntes = saldoDepois - valor` para suprimento)

**Página principal:** [`app/caixa/CaixaPageClient.tsx`](../pdv-importados/app/caixa/CaixaPageClient.tsx)
- Renderiza o novo modal automaticamente assim que uma movimentação é confirmada com sucesso

**i18n:** novas chaves adicionadas em `pt.json` e `zh.json` (`comprovante_movimentacao_*`, `btn_imprimir_comprovante`, `btn_fechar_comprovante`) — paridade mantida nos dois idiomas.

### Decisão de escopo: só impressão via navegador (sem térmica)

Optei por **não** estender o ESC/POS (impressão térmica direta) para este comprovante nesta rodada, por três razões:
1. **Risco vs. prazo:** o treinamento é amanhã; a impressão via navegador reaproveita 100% do padrão já testado em produção no recibo de venda, minimizando chance de bug novo
2. **Suficiência:** a impressão via navegador já resolve a necessidade operacional (ter um papel para conferência)
3. **Não é XOR:** a impressão térmica pode ser adicionada depois sem quebrar nada, reaproveitando o `EscPosBuilder` já existente em `escpos.ts` — ver recomendação na seção 7

### Validação
- `npm run typecheck` — sem novos erros nos arquivos alterados (o projeto tem ~320 erros pré-existentes de dependências ausentes no `node_modules` deste worktree — não relacionados a esta mudança; confirmado comparando com arquivos irmãos não tocados, como `CaixaReciboModal.tsx`, que apresentam os mesmos erros de baseline)
- `pt.json`/`zh.json` validados como JSON sintaticamente corretos
- `cashMovementReader.test.ts` (suite de testes existente de movimentação) — 3/3 passando
- **Não foi possível rodar o app no navegador nesta sessão** (servidor de dev na porta 3000 ocupado por outra sessão, e o servidor Vite alternativo do worktree tem uma dependência ausente — `@vitejs/plugin-react-swc`) — **recomendo fortemente testar manualmente o fluxo de sangria/suprimento no navegador antes do treinamento de amanhã.**

---

## 7. Lacunas Não Corrigidas — Recomendações para Próxima Sprint

Nenhuma das lacunas abaixo estava na lista de prioridades para o treinamento de amanhã. Documentadas aqui para planejamento, **não corrigidas nesta auditoria** para evitar risco de última hora em fluxos financeiros.

### 7.1 Comprovante de fechamento de caixa
**Situação:** ao fechar o caixa, o sistema mostra só um toast: `"Sistema: R$ X · Contado: R$ Y · Diferença: R$ Z"`. Não há nenhum documento (impresso ou PDF) para o operador arquivar.
**Recomendação:** modal de resumo do fechamento (semelhante ao novo comprovante de movimentação), com todos os totais + lista de movimentações do turno, e botão de impressão.
**Esforço estimado:** médio (4-6h) — dados já existem em `fecharCaixaOperador()` e em `obterMovimentacoesCaixa()`, só falta compor a UI.

### 7.2 Comprovante de devolução/troca
**Situação:** `devolver_ou_trocar_venda` retorna só IDs e valores agregados — não retorna os itens devolvidos. `VendaDevolucaoModal.tsx` não tem nenhum botão de impressão.
**Recomendação:** estender a RPC (ou adicionar uma query complementar) para retornar os itens devolvidos, e criar um modal de comprovante similar ao de venda.
**Esforço estimado:** médio-alto (6-8h) — envolve mudança de contrato de RPC, que exige mais cautela/testes.

### 7.3 Comprovante de cancelamento de venda
**Situação:** mesma lacuna do item 7.2, em `VendaCancelarModal.tsx`.
**Esforço estimado:** médio (4-6h), assumindo reaproveitamento do padrão de 7.2.

### 7.4 Impressão dedicada de relatórios gerenciais
**Situação:** só existe exportação CSV/XLSX. Um `Ctrl+P` nativo do navegador imprime a página toda, incluindo sidebar e elementos de navegação do admin (sem CSS `@media print` dedicado).
**Recomendação:** adicionar uma folha de estilo `@media print` para a rota `/admin/relatorios` (e `/gerente/relatorios`) que oculte sidebar/navbar/filtros e formate tabelas para impressão em A4. Alternativa mais robusta: gerar PDF client-side com jsPDF (biblioteca já usada para etiquetas).
**Esforço estimado:** baixo para CSS de impressão (2-3h), médio-alto para PDF estruturado (8h+).
**Nota para amanhã:** se o cliente precisar imprimir um relatório durante o treinamento, a exportação **XLSX/CSV pode ser aberta no Excel/Google Sheets e impressa por lá** como contorno — funciona, mas não é uma experiência de um clique.

### 7.5 Etiqueta individual pelo histórico do caixa
**Situação:** botão "Imprimir etiqueta" em `CaixaHistoricoSheet.tsx` está permanentemente desabilitado, com tooltip indicando TODO explícito no código-fonte.
**Recomendação:** confirmar se é uma funcionalidade planejada ou código morto a remover. Não investigado a fundo — baixa prioridade.

### 7.6 Impressão térmica do comprovante de movimentação
**Situação:** a correção da seção 6 usa só impressão via navegador.
**Recomendação:** adicionar `buildComprovanteMovimentacaoEscPos()` em `escpos.ts` (reaproveitando o `EscPosBuilder` já existente) e um método `printComprovanteMovimentacao` no hook `useThermalPrinter`, espelhando exatamente o padrão de `printRecibo`.
**Esforço estimado:** baixo (2-3h) — é composição de peças já existentes e testadas.

---

## 8. Checklist de Validação Antes do Treinamento

- [ ] **Recibo de venda** — testar impressão térmica (se houver impressora física disponível) e fallback via navegador
- [ ] **F12** — finalizar uma venda e reimprimir com F12
- [ ] **Reimpressão via histórico** — abrir uma venda antiga no histórico e reimprimir
- [ ] **Sangria** — registrar uma sangria e confirmar que o comprovante aparece automaticamente e imprime corretamente (**fluxo novo, testar com atenção**)
- [ ] **Suprimento** — mesma validação, para suprimento
- [ ] **Sangria acima do limite** (exige senha de gerente) — confirmar que o comprovante aparece após a aprovação, não antes
- [ ] **Etiquetas** — gerar um PDF de etiquetas em lote e conferir código de barras/preço
- [ ] **Relatórios** — se o cliente pedir para imprimir, usar exportação XLSX como contorno (ver 7.4)

---

## 9. Arquivos Alterados Nesta Auditoria

| Arquivo | Tipo de mudança |
|---|---|
| `pdv-importados/app/caixa/CaixaMovimentacaoReciboModal.tsx` | Novo componente |
| `pdv-importados/app/caixa/hooks/useCaixaStatusMovimentacoes.ts` | Estado + lógica de comprovante |
| `pdv-importados/app/caixa/CaixaPageClient.tsx` | Import + renderização do novo modal |
| `pdv-importados/src/lib/i18n/pt.json` | Novas chaves de i18n |
| `pdv-importados/src/lib/i18n/zh.json` | Novas chaves de i18n (paridade) |

Nenhuma funcionalidade existente foi removida ou alterada em seu comportamento — a mudança é estritamente aditiva.
