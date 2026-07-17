# ADR — Imutabilidade da venda após conclusão

| Campo | Valor |
|--------|--------|
| **ID** | ADR-VENDAS-001 |
| **Título** | Vendas concluídas são imutáveis — não existe reabertura de venda |
| **Status** | **Aceito** |
| **Data** | 2026-07-17 |
| **Contexto** | Fase 5 (Vendas/PDV) — Entrega 7 do plano em `FASE_5_VENDAS_AUDITORIA_E_PLANO.md`. Decisão de produto explícita, sem sign-off pendente. |

---

## Contexto

O plano da Fase 5 previa avaliar duas opções para "reabertura de venda concluída":

1. Reabertura real — reverter uma venda `CONCLUIDA` para edição de itens dentro de uma janela de tempo curta.
2. Nunca editar uma venda concluída — o caminho de correção é sempre cancelamento e/ou devolução, seguido de nova venda se necessário.

A Fase 5 já entrega, antes desta decisão:

- **Cancelamento** de venda (`cancelar_venda_transacional`, migrations 050/059/272), reversível por completo, com auditoria (quem pediu, quem autorizou, motivo, hora).
- **Devolução parcial ou troca** (`devolver_ou_trocar_venda`, migration 248/272), item a item, com estorno financeiro e reposição de estoque, também auditada.

Ambos já cobrem o universo real de "eu errei algo nesta venda" sem precisar tocar na linha original de `vendas`.

## Decisão

**Venda `CONCLUIDA` é imutável. Não existe, e não haverá, uma operação de "reabrir venda" que volte uma venda concluída para edição de itens.**

O fluxo oficial de correção pós-venda é:

```
Erro identificado numa venda concluída
  ├─ Venda inteira errada/indevida  → CANCELAMENTO (reverte tudo: estoque, caixa, contas a receber)
  ├─ Parte da venda errada          → DEVOLUÇÃO PARCIAL (item a item, estorno proporcional)
  └─ Cliente precisa do item certo  → cancelamento/devolução + NOVA VENDA
```

Nenhuma RPC, Server Action ou tela deve permitir `UPDATE` de `itens_venda`/totais de uma venda com `status = 'CONCLUIDA'`.

### Por que não reabertura real

- **Imutabilidade fiscal**: uma venda com NF-e emitida não pode ter itens/valores alterados — o instrumento legal para isso é cancelamento (dentro do prazo) ou carta de correção, nunca edição direta. Qualquer "reabertura" teria que, no mínimo, ser bloqueada para vendas com documento fiscal — criando dois comportamentos diferentes para a mesma operação (com NF-e vs. sem NF-e), que é exatamente o tipo de regra condicional que o golden-flow do PDV proíbe explicitamente ("Não adicionar branches condicionais no fluxo de venda").
- **Estoque/financeiro já corretos por outra via**: reabertura exigiria reverter e reaplicar baixa de estoque, recalcular `contas_receber`, e reconciliar `caixas.saldo_atual` — todo esse mecanismo já existe e já é auditado em cancelamento/devolução. Duplicá-lo para "editar in-place" é reimplementar o mesmo problema com mais risco (uma venda em edição é um estado intermediário que nenhum relatório, dashboard ou reconciliação de caixa hoje sabe interpretar).
- **Auditoria mais simples**: cancelamento e devolução são operações discretas, com motivo obrigatório e timestamp único. Uma venda que pode ser reaberta e reeditada múltiplas vezes tem uma história de mudanças que precisaria de versionamento próprio para ser auditável — complexidade que este ADR opta por não introduzir.

## Consequências

- **Positivas**: zero código novo de domínio para esta entrega; nenhuma alteração em `vendas`, na view de consistência (migration 244) ou nos relatórios financeiros. O golden-flow de venda continua com um único caminho de escrita por operação (finalizar, cancelar, devolver).
- **Negativas**: o operador que "só quer trocar a forma de pagamento" ou "só quer corrigir 1 item" precisa cancelar/devolver e refazer, em vez de editar in-place — mais passos manuais no caixa. Mitigado pelo item de backlog abaixo.

## Item de backlog decorrente: "Duplicar/Refazer Venda"

Para reduzir a fricção operacional de ter que remontar o carrinho do zero após um cancelamento, fica registrado no backlog (fora do escopo desta Fase 5, a priorizar separadamente):

**Duplicar/Refazer Venda** — a partir de uma venda do histórico (concluída ou cancelada), criar um novo rascunho de carrinho com os mesmos itens e quantidades (preços revalidados no momento da nova finalização, nunca copiados da venda antiga). Não reabre nem referencia a venda original como "a mesma venda" — é uma venda nova e independente, com seu próprio `venda_id`, auditoria e (se aplicável) documento fiscal.

- Não reserva nem baixa estoque até a nova venda ser de fato finalizada (mesma garantia de orçamento/venda-em-espera).
- Reaproveita a infraestrutura já existente de "carregar itens no carrinho" (usada por venda em espera — Entrega 3/4/5 — e por orçamento — Entrega 6): um novo endpoint `duplicar_venda`/`refazer_venda` só precisa produzir a mesma forma `ItemCarrinho[]` que `retomar_venda_em_espera`/`obter_orcamento` já produzem, sem tocar na venda original.
- Preço é sempre revalidado pela finalização normal (v4) — nunca herda o preço congelado da venda antiga, evitando vender por um preço desatualizado.

## Referências

- `FASE_5_VENDAS_AUDITORIA_E_PLANO.md` — plano de entregas da Fase 5.
- `docs/venda-golden-flow.md` — fluxo canônico de finalização (congelado).
- `backend/supabase/migrations/050_cancelar_venda_transacional.sql`, `059_cancelar_venda_split_e_auditoria_nao_dinheiro.sql`, `248_devolver_ou_trocar_venda.sql`, `272_cancelamento_devolucao_token_gerente.sql` — cancelamento e devolução, os caminhos oficiais de correção.

## Histórico

| Data | Alteração |
|------|-----------|
| 2026-07-17 | Decisão aceita: sem reabertura de venda; fluxo oficial é cancelamento/devolução + nova venda. Item de backlog "Duplicar/Refazer Venda" registrado. |
