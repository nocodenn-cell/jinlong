# Tickets — Regras de Negócio + Cálculos (Go-Live)

> Gerado por Hermes. **Só problemas CONFIRMADOS por código/dado real** e **RISCOS que exigem
> validação**. Sem tickets por suspeita. Itens NÃO PROBLEMA / MELHORIA foram registrados
> apenas nos auditórios, não viram ticket. Cruzado com F1/F2/F2B/F3/F5/F6/F6.1.

> ⚠️ **Nota de consolidação (2026-08-05).** Os tickets de regra desta frente foram renomeados
> de `RN-XXX` para **`FRN-XX`**. O prefixo `RN-XXX` é **namespace reservado e permanente** do
> catálogo de Regras de Negócio (`docs/ARQUITETURA_REGRAS_NEGOCIO.md` Cap. 7) e não pode ser
> reutilizado com outro sentido. Correspondência: `RN-001`→**`FRN-01`**, `RN-002`→**`FRN-02`**.
>
> **Fila oficial de execução:** `docs/GO_LIVE_IMPLEMENTATION_GUIDE.md`. Este arquivo é
> **detalhe de ticket**, não ordem de execução.

**Status de todos:** `OPEN`

---

## TICKET RC-001 🔴 (P0 — cálculo incorreto → info falsa)
**Título:** KPI de Vendas Admin calcula sobre página parcial
**Categoria:** Cálculos / Vendas Admin
**Severidade:** 🔴 Bloqueante (informação falsa)
**Problema:** `app/admin/vendas/page.tsx:146-161` soma `reduce(vendasDaPagina)`; a action retorna
`hasMore` (cursor). RPC correta `obterKpisVendas`→`kpis_venda_eventos_gerente` existe mas não é usada.
**Evidência:** `app/admin/vendas/page.tsx` l.146-161; `app/gerente/vendas/actions.ts:152-195`.
**Arquivo:** `app/admin/vendas/page.tsx` · `app/gerente/vendas/actions.ts`.
**Regra esperada:** KPI reflete o período filtrado inteiro.
**Comportamento atual:** KPI reflete só a página visível.
**Critério de aceite:** KPI usa `obterKpisVendas`; validar com <1 página, múltiplas páginas, filtro de
período, vendas canceladas e comparação com `sum(total_liquido)` no banco.
**Dependência:** F3-001 (dados reais).
**Cruzado:** F6.1-VEN-001.
**Status:** OPEN

---

## TICKET RC-002 🔴 (P0 — cálculo incorreto → info falsa)
**Título:** Comissão calcula 0% por `comissao_percentual` sem preenchimento
**Categoria:** Cálculos / Comissões
**Severidade:** 🔴 Bloqueante (informação falsa)
**Problema:** `resumo_comissoes_por_operador` depende de `usuarios.comissao_percentual`, que existe no
banco mas **não tem UI para preenchê-lo** (F6-CMP-001). Campo nulo → comissão zerada para todos.
**Evidência:** `app/gerente/comissoes/actions.ts:51`; `usuarios.comissao_percentual` (sem campo em
`FuncionarioEditarModal`/schemas — F6-CMP-001).
**Arquivo:** `app/gerente/comissoes/actions.ts` · `app/admin/funcionarios/actions.ts`.
**Regra esperada:** comissão = base × % do operador.
**Comportamento atual:** % nulo → comissão 0.
**Critério de aceite:** `% comissão` gravável na tela; RPC usa o valor; resumo não zera sem motivo;
teste com operador com % definido.
**Dependência:** F6-CMP-001 (campo na UI).
**Cruzado:** F6-CMP-001.
**Status:** OPEN

---

## TICKET FRN-01 🟡 (P1 — reclassificado por ADR-002)
**Título:** NCM ausente só deve bloquear a emissão fiscal, nunca a publicação ou a venda
**Categoria:** Regras de Negócio / Produto-Fiscal
**Severidade:** 🟡 Risco fiscal operacional (**não** bloqueia Go-Live por si)
**Autoridade:** **ADR-002** + **RN-002** (`docs/ARQUITETURA_REGRAS_NEGOCIO.md` Cap. 8)

> **Reclassificação de 2026-08-05.** A redação original deste ticket (P0, *"bloquear Publicar sem
> NCM"*) **contradizia ADR-002**, aprovada pela direção em 2026-08-04:
> *"NCM não é obrigatório no cadastro. Torna-se obrigatório apenas em operação fiscal."*
> O esclarecimento normativo de ADR-002 é explícito: *"Cadastro, publicação, venda, pedido e
> recebimento **não** verificam NCM."* A ADR prevalece; o ticket foi alinhado a ela.

**Problema real (o que permanece válido):** 105 de 113 produtos estão sem NCM (F1-03) e o campo
está oculto no cadastro (2 cliques + `modoCompleto=false`), o que **produz** a ausência do dado.
Quando o fiscal for ligado (FLX-02), a fila fiscal acumulará documentos em erro.
**Não é problema:** `evaluateProduct` exigir só `ativo && PUBLICADO`. Isso está **correto** por
ADR-002 e por RN-018 (cadastro incompleto é permitido; bloqueio ocorre na operação que exige o dado).
**Evidência:** `shared-core/src/engine/productEngine.ts:46`; `components/gerente/produtos/ProdutoFormModal.tsx:135`.
**Arquivo:** `ProdutoFormModal.tsx` (visibilidade do campo) · família `fiscal_*` (fronteira de exigência).
**Regra esperada (ADR-002):** `fiscal_enfileirar_documento_venda` é a **única** fronteira de
exigência de NCM. Sem NCM → documento fiscal em erro/DLQ; a **venda permanece válida** (P2 > P4).
**Comportamento atual:** exigência não implementada em nenhuma camada; campo oculto no cadastro.
**Critério de aceite:**
1. NCM visível no nível 1 do cadastro (UX — reduz a origem do problema);
2. `fiscal_enfileirar_documento_venda` recusa/parqueia documento sem NCM com erro claro;
3. **Nenhum** bloqueio de `Publicar`, de venda, de pedido ou de recebimento por NCM ausente —
   teste de regressão que prove isso.
**Dependência:** FLX-02 (decisão de escopo fiscal). Sem fiscal ligado, item é P2.
**Cruzado:** F1-03, F2B-03, RN-002, ADR-002.
**Status:** OPEN

---

## TICKET FRN-02 🔴 (P0 — usuário executa o que não deveria / governança)
**Título:** GERENTE=DONO=ADMIN e 9 rotas `/admin` fora da policy
**Categoria:** Regras de Negócio / Permissões
**Severidade:** 🔴 Bloqueante (governança)
**Problema:** 22/23 recursos `ALL_ADMIN_PROFILES`; 9 rotas ausentes de `RESOURCE_PROFILES` (fallback
`allow`); `configuracoes`/`suspensao` acessíveis por qualquer gerente (pode suspender vendas / alterar fiscal).
**Evidência:** `lib/admin/policy/adminPolicy.ts` (F1-07/F1-08).
**Arquivo:** `lib/admin/policy/adminPolicy.ts` · middleware.
**Regra esperada:** gerente não acessa financeiro sensível nem `suspensao`/`configuracoes`.
**Comportamento atual:** gerente acessa tudo.
**Critério de aceite:** sensíveis → `['DONO','ADMIN']`; 9 rotas mapeadas; fallback `deny`.
**Dependência:** F1-08.
**Cruzado:** F1-08, F6-PER-001.
**Status:** OPEN

---

## TICKET RC-003 🟡 (P1 — RISCO, exige validação)
**Título:** Venda de produto sem estoque (backend não valida saldo)
**Categoria:** Regras de Negócio / Estoque
**Severidade:** 🟡 Risco (validar RPC)
**Problema:** `recalcularItensNoServidor` não checa saldo; `finalizarVendaCaixaImpl` chama
`decrementar_estoque_seguro`. Não confirmado se a RPC bloqueia saldo negativo.
**Evidência:** `app/caixa/server/caixaPrecoAutoritativoServer.ts` (sem checagem); `app/caixa/actions.ts:269`.
**Arquivo:** `decrementar_estoque_seguro` (RPC) · `caixaVendas.impl`.
**Regra esperada:** venda sem saldo deve alertar/bloquear (ou saldo negativo proibido).
**Comportamento atual:** backend do caixa não valida (depende da RPC).
**Critério de aceite:** executar venda com saldo 0 e confirmar se a RPC bloqueia; se permitir,
criar correção (alerta de venda sem estoque no PDV).
**Status:** OPEN (VALIDAÇÃO)

---

## TICKET RC-004 🟡 (P1 — RISCO, exige validação)
**Título:** Devolução de venda sem tabela de trilha dedicada
**Categoria:** Regras de Negócio / Auditoria
**Severidade:** 🟡 Risco (validar)
**Problema:** botão `devolverAcao` no detalhe de venda; não há tabela de devolução (F5: ⚪ NÃO VALIDADO).
**Evidência:** `app/admin/vendas/_components/VendasTable.tsx:307`.
**Arquivo:** `app/gerente/vendas/VendaDetalhe*` · action de devolução.
**Regra esperada:** devolução grava quem/quando/valor/estoque revertido.
**Comportamento atual:** sem trilha dedicada confirmada.
**Critério de aceite:** após F5-VAL-15, devolução grava em tabela dedicada.
**Dependência:** F5-VAL-15.
**Cruzado:** F6.1-VEN-002.
**Status:** OPEN (VALIDAÇÃO)

---

## RESUMO

| ID | Tipo | Prio | Título curto | Cruzado |
|---|---|:--:|---|---|
| RC-001 | Cálculo | 🔴 P0 | KPI Vendas Admin página parcial | F6.1-VEN-001 |
| RC-002 | Cálculo | 🔴 P0 | Comissão 0% (campo sem UI) | F6-CMP-001 |
| **FRN-01** | Regra | 🟡 P1 | NCM exigido **só na emissão** (ADR-002) | F1-03/F2B-03 · RN-002 |
| **FRN-02** | Regra | 🔴 P0 | GERENTE=ADMIN + rotas fora policy | F1-08/F6-PER-001 |
| RC-003 | Regra | 🟡 P1 | Venda sem estoque (RISCO) | — |
| RC-004 | Regra | 🟡 P1 | Devolução sem trilha (RISCO) | F5-VAL-15/F6.1-VEN-002 |

**Total:** 6 tickets · 3 🔴 P0 (confirmados) · 3 🟡 P1 (risco/validação).
**Não duplicados** de F1/F2/F5/F6/F6.1: cada item acima cruza o ID original; a correção vive no ticket da frente específica.

**Renomeações desta consolidação:** `RN-001`→`FRN-01` (e **rebaixado a P1** por ADR-002) ·
`RN-002`→`FRN-02`. O prefixo `RN-XXX` pertence exclusivamente ao Cap. 7 da arquitetura.
