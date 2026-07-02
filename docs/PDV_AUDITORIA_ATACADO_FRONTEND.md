# PDV — Auditoria: vazamento da regra de "atacado" no frontend

| Campo | Valor |
|-------|-------|
| **Status** | Auditoria — leitura direta do código, sem alterações |
| **Régua usada** | [`PDV_FASE3_STATE_MACHINE_SPEC.md` §5.1](./PDV_FASE3_STATE_MACHINE_SPEC.md#51-atacado-é-regra-de-domínio-do-backend--nunca-um-modo-de-ui) — "atacado" é regra de domínio resolvida no backend; o frontend só pode exibir `tipoPreco` como rótulo, nunca usá-lo para decidir o que renderizar, habilitar ou calcular |
| **Escopo verificado** | `pdv-importados/`, `shared-core/`, `shared/`, `pdv-local/` (excluído `backend/supabase/`, que é onde a regra deveria estar) |

Pergunta respondida: existe, no código real já em produção, algum lugar em que o frontend decide algo (não apenas exibe algo) com base em atacado/varejo? Resposta curta: **sim, um caso real, isolado ao runtime desktop offline, e já com salvaguarda própria** (teste golden de equivalência). O caixa web (`pdv-importados`), que é o escopo das Fases 0–4 deste roadmap, está limpo — 100% dirigido por RPC, sem cálculo de elegibilidade de atacado no cliente.

---

## 1. Achado real — `shared/pricing/PricingService.ts` recalcula elegibilidade de atacado no cliente

```ts
// shared/pricing/PricingService.ts:100-107
const regraAtacado = regrasAtivas.find(r =>
  r.tipo === 'ATACADO' &&
  item.quantidade >= (r.minQuantidade || 1) &&
  this.verificarCondicoesRegra(item, r, ctx)
)
```

`calcularPrecoItem` (mesmo arquivo, linhas 34-80) decide `tipoPreco = 'ATACADO'` comparando `quantidade >= minQuantidade` — isto é a mesma lógica de precedência (tier > catálogo > varejo) que `calcular_preco_produto` resolve no Postgres, reimplementada em TypeScript.

**Onde é usado:** só em `pdv-local/src/App.tsx:203` (`pricingService.calcularPrecoItem(...)`) — o app desktop/offline (Tauri). Confirmado por grep: `pdv-importados/app/caixa/*` **nunca** importa `PricingService`; o caixa web é 100% RPC-driven.

**Por que existe:** é uma exceção **declarada e testada**, não um acidente. `pdv-local/src/pricing/offlineRpcEquivalence.golden.test.ts` é um teste golden que verifica, para uma matriz de cenários canônicos, que o motor offline produz exatamente o mesmo resultado que a RPC SQL — a justificativa (comentário inline no código-fonte: "exceção declarada ao RPC-only") é que o app desktop precisa vender sem rede, e nesse caso não há RPC para chamar.

**Por que ainda é uma violação a registrar, mesmo sendo intencional:**

1. É duplicação real de regra de negócio. Se `calcular_preco_produto` mudar (nova faixa de desconto, novo critério de elegibilidade) e o golden test não for atualizado no mesmo PR, o offline diverge silenciosamente do backend até o próximo sync/reconciliação.
2. `pdv-local/src/App.tsx:751-777` usa o `tipoPreco` **calculado localmente** (não recebido do backend) para escolher entre dois badges com estilos diferentes — uma decisão de UI, mesmo que só cosmética, dirigida por elegibilidade computada no cliente, não por um rótulo passivamente recebido.

**Classificação:** violação real da regra "atacado nunca é decidido no frontend" — mas **fora do domínio coberto pelas Fases 0-4** (que tratam do `PDVSaleState`/`PDVViewState`/`OperatorView` do caixa **web**). `pdv-local` roda uma arquitetura diferente (SQLite local, outbox, outro ADR — ver `docs/adr/ADR-PDV-centro-de-gravidade.md` §2, "o que pode falhar sem impedir venda", que já reconhece o desktop como tendo cache/regras locais por desenho). Não é algo a "corrigir" silenciosamente aqui — é uma decisão de arquitetura já tomada (offline precisa de motor local) que precisa de dono explícito se for revisitada.

---

## 2. Achados ambíguos — vale registrar, não são violação clara

| # | Local | O que faz | Por que é ambíguo |
|---|-------|-----------|----------------------|
| 1 | `shared-core/src/stores/unifiedCartStore.ts:362` — `const precoOriginal = patch.tipoPreco === 'ATACADO' ? precoVarejoRef : patch.precoUnitario` | Dentro de `sincronizarPrecoCalculadoRpc`, que aplica um patch **já computado pelo backend** (resposta de `calcular_preco_produto`). O `tipoPreco` usado na condição vem do RPC, não é recalculado. | Tecnicamente é um `if` sobre `tipoPreco`, mas só decide **qual valor vira `precoOriginal`** para exibição de preço riscado/cálculo de desconto — não decide o que renderizar nem habilita/desabilita nada. Fica registrado para confirmação futura de que nunca afeta algo além de exibição/soma de desconto. |
| 2 | `pdv-local/src/App.tsx:751-777` — badge de ATACADO/VAREJO | Mesmo padrão visual das badges legítimas do caixa web (achado A abaixo), mas o valor exibido vem do cálculo local do achado 1 desta seção, não de um RPC. | Herda a violação do §1 — a badge em si é só exibição, mas o dado que ela exibe já nasceu de uma decisão do cliente. |

---

## 3. Caixa web (`pdv-importados/app/caixa/*`) — limpo, exemplos de uso legítimo (rótulo, nunca decisão)

Confirma que o padrão correto já existe e é o majoritário no código real — `tipoPreco`/`atacado` aparece só como campo de exibição, sempre alimentado por uma resposta de RPC ou pela ação server-side que a envolve:

- `CaixaCartList.tsx` (`TipoPrecoBadge`, badge + preço riscado) — `res.tipoPreco` vem de `item.resultado`, populado só por RPC (`caixaCatalogo.impl.ts`, `webCaixaScanProcess.ts`, `caixaPrecoAutoritativoServer.ts`).
- `CaixaReciboModal.tsx:249-250` — rótulo `[atacado]` no recibo, sem branch de layout.
- `CaixaFooter.tsx` / `CaixaPageClient.tsx:236-244` — "economia atacado" é um total **derivado por exibição** (soma de `(precoOriginal - precoUnitario) * quantidade` sobre itens já marcados `ATACADO` pelo backend), não uma decisão nova.
- `PriceTooltip.tsx`, `VendaDetailSheet.tsx`, `CatalogoTable.tsx` (admin) — tabelas/tooltips mostrando valores de catálogo (`preco_atacado`) ou o `tipo_preco` de uma venda já concluída.
- Todas as Server Actions em `pdv-importados/app/caixa/server/*.ts` que chamam `calcular_preco_produto`/reautorizam preço server-side — é exatamente onde essa validação deveria estar (fora do browser).

Um não-achado que vale registrar: `unifiedCartStore.regras: unknown[]` existe no estado da store, mas **nunca é lido** para nenhuma decisão de preço no caminho web — é campo morto no fluxo online (confirmado por grep; `PricingService` só é importado em `pdv-local/src/App.tsx` e dois arquivos de teste).

---

## 4. Conclusão e próximos passos (não executados aqui)

- O contrato formalizado na Fase 0 (§5.1) já está sendo respeitado pelo `OperatorView`/`SaleStateMachine` implementados nesta branch, e pelo caixa web em produção hoje.
- A única duplicação real de regra é o motor offline do `pdv-local`, já isolada e testada por golden test — **não é uma pendência desta auditoria**, é uma decisão de arquitetura pré-existente que fica documentada aqui para visibilidade, não corrigida.
- Se a regra de atacado mudar no backend no futuro, `pdv-local/src/pricing/offlineRpcEquivalence.golden.test.ts` precisa ser atualizado no mesmo PR — vale considerar (fora do escopo desta auditoria) adicionar isso como item explícito de checklist de PR, no mesmo espírito da seção "Pipeline operacional / caixa" que já existe em `.github/pull_request_template.md`.
- Nenhum código foi alterado por esta auditoria.

---

## Histórico

| Data | Alteração |
|------|-----------|
| 2026-07-02 | Auditoria inicial — vazamento de regra de atacado no frontend, contra o contrato da Fase 0 §5.1. |
