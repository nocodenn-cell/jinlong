# PDV_CLEANUP_REPORT — Limpeza Visual do Caixa

> Fase 2 da missão Go-Live Jinlong. Data: 2026-07-12.
> Escopo: **somente remoção de texto/componente visual não-operacional**. Nenhuma
> alteração de fluxo de venda, RPC, schema ou migration.

## 1. Remoção executada — Banner "Lead time típico de importação"

**Motivo:** informação de importação/logística não é operacional para o caixa. O
operador vê o banner o tempo todo durante a venda sem que ele afete nenhuma ação.

**Componente:** `pdv-importados/app/caixa/CaixaOperadorContextBar.tsx` — este
componente **só** renderizava o chip do lead time. Foi removido integralmente.

Alterações:

| Arquivo | Mudança |
|---|---|
| `app/caixa/CaixaOperadorContextBar.tsx` | **Arquivo removido** (renderizava apenas o banner). |
| `app/caixa/CaixaPageClient.tsx` | Removidas as 2 renderizações (`<CaixaOperadorContextBar .../>`) nos layouts `classic` e padrão, e o `import`. |
| `src/lib/i18n/pt.json` | Removida a chave `caixa.lead_time_importacao_banner`. |
| `src/lib/i18n/zh.json` | Removida a chave `caixa.lead_time_importacao_banner` (paridade pt/zh). |

**Preservado (não é lixo):** as configurações `lead_time_min_dias` /
`lead_time_max_dias` continuam existindo e são usadas na tela do gerente
(`app/gerente/configuracoes/ConfiguracoesGerentePageClient.tsx`). Só a **exibição
no caixa** foi removida — o parâmetro de negócio permanece intacto.

Validação: `JSON.parse` OK em pt.json e zh.json; nenhuma referência remanescente a
`lead_time_importacao_banner` nem a `CaixaOperadorContextBar` no código.

## 2. Varredura de textos de dev / placeholders / avisos temporários

Busca no diretório `app/caixa` por textos de desenvolvimento, placeholders,
mensagens internas, avisos temporários e componentes mortos.

| Item encontrado | Status | Ação |
|---|---|---|
| `CaixaPdvLayoutPreviewBanner.tsx` — "aviso de preview de layout" | **Gated por env** (`NEXT_PUBLIC_CAIXA_PDV_LAYOUT_PREVIEW_BANNER` + `NODE_ENV`) | **Mantido.** Não aparece para o operador em produção sem a flag. Remover mexeria na lógica de layout → risco desnecessário. |
| `scan-pipeline/CaixaScanPipelineDevPanel.tsx` — painel de debug do scanner | **Gated** (só renderiza sob flag de dev) | **Mantido.** Ferramenta de diagnóstico, invisível em produção. |
| `app/caixa/TODO_auditoria_255.md` | Arquivo de anotação interna (não é UI) | **Mantido** (não impacta a tela; fora do escopo de "limpeza visual"). |
| Botões "Imprimir etiqueta" e "Gerar NF-e" no histórico (`disabled`, `title=…_todo`) | Placeholders **desabilitados** com tooltip de "em breve" | **Mantido** — ver `HISTORICO_TOOLS_AUDIT.md`. São stubs intencionais e desabilitados, não texto solto na tela de venda. |

Nenhum outro texto de desenvolvimento, placeholder ativo ou componente morto
renderizado no fluxo de venda foi encontrado.

## 3. Risco

**Baixo.** A mudança é puramente de apresentação: remove um chip informativo e a
string i18n correspondente. Não toca em `finalizar_venda_transacional_canonica_v4`,
`fn_registrar_comissao`, `trg_registrar_comissao`, na tabela `vendas`, nem em
qualquer migration.

## 4. Recomendações de acompanhamento (não executadas — fora do escopo seguro)

- Os stubs "Imprimir etiqueta" e "Gerar NF-e" no histórico poderiam ser **ocultados**
  (em vez de exibidos desabilitados) até serem implementados, para não gerar
  expectativa no gerente. Decisão de produto — não alterado nesta fase.
