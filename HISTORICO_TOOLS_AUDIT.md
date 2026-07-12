# HISTORICO_TOOLS_AUDIT — Ferramentas do Histórico de Vendas

> Fase 3 da missão Go-Live Jinlong. Data: 2026-07-12.
> Escopo: validar cada botão do painel de ferramentas do histórico do caixa
> (`app/caixa/CaixaHistoricoSheet.tsx` → componente `HistoricoFerramentas`).
> Nenhuma implementação nova. Somente identificação e documentação de status.

## Resumo dos botões

| Botão | Status | Habilitado quando | Gera saída? | Usa venda correta? | Resiste a refresh? |
|---|---|---|---|---|---|
| **Imprimir cupom** | ✅ funciona | há seleção **e** itens | sim (modal de recibo reimprimível) | sim | sim |
| **Imprimir etiqueta** | ⛔ stub desabilitado | sempre `disabled` | não | n/a | n/a |
| **Exportar itens (CSV do detalhe)** | ✅ funciona | há seleção **e** itens | sim (`venda-<numero>.csv`) | sim | sim |
| **Exportar lista (CSV)** | ✅ funciona | sempre | sim (`historico-operador.csv`) | sim (lista carregada) | sim |
| **Gerar NF-e** | ⛔ stub desabilitado | sempre `disabled` | não | n/a | n/a |

> Observação: não existe um botão separado "Exportar planilha" (xlsx). A
> exportação de planilha é feita via **CSV com BOM UTF-8**, que o Excel/Google
> Sheets abrem diretamente como planilha (ver §3).

---

## 1. Imprimir cupom ✅

**Fluxo:** `HistoricoFerramentas` → `onImprimirCupom(selecionadoId)` →
`handleImprimirCupomHistorico` (`CaixaPageClient.tsx`).

- **Gera documento?** Sim. Rebusca o detalhe no servidor
  (`obterDetalheHistoricoVendaCaixa`), monta o recibo com
  `historicoDetalheParaRecibo(...)` e abre `CaixaReciboModal` em modo reimpressão.
- **Usa a venda correta?** Sim — usa o `vendaId` selecionado; o recibo é montado
  a partir dos dados **rebuscados no backend**, não do estado da lista.
- **Funciona após refresh?** Sim — é uma server action que consulta o banco a
  cada clique, independente de cache do cliente.
- **Guarda de segurança:** se `itens.length === 0`, exibe mensagem de erro e não
  abre o recibo. Botão desabilitado quando não há itens.

## 2. Imprimir etiqueta ⛔ (stub)

```tsx
<Button ... disabled title={m.caixa.historico_tool_etiqueta_todo}>
  {m.caixa.historico_tool_imprimir_etiqueta}
</Button>
```

- **Existe rota?** Não a partir do caixa. **Existe** funcionalidade de etiquetas
  no painel do gestor: `app/admin/estoque/imprimir-etiquetas` e
  `app/gerente/estoque/...` — porém para **produtos**, não para a venda do histórico.
- **Gera PDF?** Não a partir deste botão (desabilitado).
- **Usa produto correto?** n/a.
- **Conclusão:** placeholder intencional (`title=…_etiqueta_todo`). Não quebra —
  apenas não faz nada. Recomendação: ocultar até implementar, ou linkar para a
  rota de etiquetas de produto do gerente.

## 3. Exportar CSV (detalhe e lista) ✅

Implementação: `exportarDetalheCsv` / `exportarListaCsv` → `downloadCsvBrowser`
(`lib/gerente/gerenteCadastroUi.ts`) → `objectsToCsv` (`lib/csv.ts`).

- **Dados corretos?** Sim.
  - Lista: `numero_venda, hora, cliente, total, status, forma_pagamento, qtd_itens`.
  - Detalhe: `produto, quantidade, preco_unitario, total_linha`.
- **Encoding?** ✅ **UTF-8 com BOM** (`﻿`) e `charset=utf-8` no `Blob`.
  Acentuação (ç, ã, ú) e caracteres chineses abrem corretos no Excel.
- **Escape?** ✅ RFC 4180 (`escapeCsvCell`): aspas duplicadas, campos com
  vírgula/quebra de linha são envolvidos em aspas.
- **Valores?** Exporta valores **numéricos crus** (ex.: `12.5`), não formatados
  em BRL. Correto para reimportação/planilha. ⚠️ Ponto de atenção: o separador
  decimal é `.` (ponto); em Excel PT-BR configurado para vírgula decimal, a
  coluna pode precisar de conversão. Não é bug — é escolha de formato de dados.
- **Abre como planilha?** Sim — o BOM faz o Excel/Sheets reconhecerem UTF-8 e
  abrirem em colunas.
- **Funciona após refresh?** Sim — a lista é recarregada via server action ao
  abrir o histórico; o CSV usa o estado recém-carregado.

## 4. Gerar NF-e ⛔ (stub)

```tsx
<Button ... disabled title={m.caixa.historico_tool_nfe_todo}>
  {m.caixa.historico_tool_gerar_nfe}
</Button>
```

**Status da integração fiscal (identificação, sem implementar):**

- Existe um **pipeline fiscal** no backend: `enfileirarDocumentoFiscalPosVenda`
  (`app/caixa/server/caixaFiscalEnqueueServer.ts`) → RPC
  `fiscal_enfileirar_documento_venda`, com máquina de estados fiscal
  (`migrations/092_fiscal_state_machine.sql`) e outbox.
- O tipo de documento default é **`NFC_E_STUB`** (`resolveFiscalDocType`), ou seja,
  **stub** — não há emissor fiscal real conectado. Só vira `NFCE`/`NFE` se
  `FISCAL_DEFAULT_DOC_TYPE` for configurado **e** houver provedor.
- O enqueue automático é **gated** por `autoEnqueueFiscalOnSale` (runtime config).
- **Conclusão:** a infraestrutura de enfileiramento existe, mas **não há emissão
  fiscal produtiva**. O botão "Gerar NF-e" no histórico é um placeholder
  desabilitado coerente com esse estado.

> ⚠️ **Decisão de negócio pré-go-live (R1):** se a loja precisa emitir documento
> fiscal no dia 1, isso é uma lacuna que exige integração com provedor fiscal —
> fora do escopo desta missão (proibido implementar feature nova / mexer em RPC
> de venda sem confirmação).

## Conclusão da Fase 3

Ferramentas **operacionais e prontas**: Imprimir cupom, Exportar CSV (detalhe e
lista). Ferramentas **desabilitadas por design** (stubs, sem risco): Imprimir
etiqueta e Gerar NF-e. Nenhum botão gera erro ou usa venda incorreta. A única
lacuna relevante para o negócio é a **emissão fiscal real (NF-e)**, que depende
de decisão/integração externa.
