# Auditoria de Regras de Negócio — Go-Live

> Validação das regras implementadas vs. operação de uma loja de importados.
> Análise de leitura de código (sem alteração). Gerado por Hermes em 2026-08-03.
> Classificação aplicada: **CONFIRMADO** (evidência em código/dado) · **RISCO**
> (possibilidade, exige validação) · **NÃO PROBLEMA** (intencional) · **MELHORIA**
> (não impede Go-Live). Sem tickets por suspeita.

> ⚠️ **Nota de consolidação (2026-08-05).** Dois ajustes normativos foram aplicados a este
> documento, ambos por prevalência de autoridade superior:
> 1. Os achados desta frente foram renomeados de `RN-XXX` para **`FRN-XX`**. O prefixo
>    `RN-XXX` é namespace reservado e permanente do Cap. 7 de
>    `docs/ARQUITETURA_REGRAS_NEGOCIO.md`. Correspondência: `RN-001`→`FRN-01`,
>    `RN-002`→`FRN-02`, `RN-003`→`FRN-03`.
> 2. O achado de NCM foi **reclassificado por ADR-002** (aprovada em 2026-08-04) — ver `FRN-01`.
>
> **Fila oficial de execução:** `docs/GO_LIVE_IMPLEMENTATION_GUIDE.md`.

## Resposta à pergunta central
**"O usuário consegue executar algo que não deveria?"**

SIM, em 2 pontos confirmados por código (o terceiro foi reclassificado por ADR-002):
1. **GERENTE = DONO = ADMIN** em 22/23 recursos; 9 rotas `/admin` (incl. `configuracoes`,
   `suspensao`) fora da policy → gerente pode suspender vendas / alterar fiscal sem ser dono.
2. **Comissão calcula 0%** quando `usuarios.comissao_percentual` está nulo (campo sem UI) →
   operador "recebe" comissão zero sem perceber.

Reclassificado: **venda de produto sem NCM** — é comportamento **correto e aprovado** por
ADR-002/RN-002. O risco real é o documento fiscal ficar em erro, não a venda ocorrer. Ver `FRN-01`.

---

## Matriz de regras por domínio

### Venda / PDV

| Regra | Veredito | Evidência |
|---|---|---|
| Fluxo de venda completo | ✅ NÃO PROBLEMA | `finalizarVendaValidation.ts` + `finalizarVendaCaixaImpl` (idempotency, baixa estoque RPC) |
| Desconto permitido/bloqueado por limite | ✅ NÃO PROBLEMA | `descontoGerenteToken`+`%` obrigatórios juntos (l.80-88); `maxDescontoPercentual` da Edge Fn |
| Autorização de gerente | ✅ NÃO PROBLEMA | `validarGerenteDescontoImpl` → Edge Fn `validar-gerente` (token com expiração) |
| Múltiplas formas de pagamento | ✅ NÃO PROBLEMA | `pagamentos: array` (l.76); `FORMAS_PAGAMENTO_CAIXA` enum (4) |
| Troco | ✅ NÃO PROBLEMA | `somaPagamentos <= totalLiquido + EXCESSO_PAGAMENTO_EPS` (l.107) |
| Cancelamento | ✅ NÃO PROBLEMA | `cancelarVendaImpl` + `vendas_canceladas_auditoria` |
| Devolução | 🟡 RISCO | botão `devolverAcao` no detalhe; **sem tabela de trilha** (F5-VAL-15) |
| Troca | ⚪ NÃO AVALIADO | sem fluxo dedicado encontrado; tratar como devolução+novavenda |
| Venda sem cliente | ✅ NÃO PROBLEMA | `clienteId` opcional (l.78) — varejo permite |
| Venda sem fornecedor do produto | ✅ NÃO PROBLEMA (**ADR-006**) | engine não exige fornecedor — decisão aprovada. 113 produtos sem fornecedor bloqueiam **Compras**, não Vendas (F2-FOR-001) |
| Venda de produto sem estoque | 🟡 RISCO | caixa **não valida saldo**; depende de `decrementar_estoque_seguro` (RPC não lida) |
| Venda de produto inativo | ✅ NÃO PROBLEMA (bloqueia) | `evaluateProduct` (productEngine.ts:46) + erro em `recalcularItensNoServidor` (l.180-182) |

### Produto

| Regra | Veredito | Evidência |
|---|---|---|
| Produto sem fornecedor pode ser vendido? | ✅ NÃO PROBLEMA (**ADR-006**) | engine exige só `ativo+PUBLICADO`. ADR-006: *"Produto pode existir sem fornecedor; venda permanece permitida"*. Fornecedor é requisito de **compra** (F2-FOR-001), nunca de cadastro ou venda |
| Produto sem NCM pode ser vendido? | ✅ NÃO PROBLEMA (**ADR-002**) | engine não exige NCM — **correto**. Exigência vive só em `fiscal_enfileirar_documento_venda`. Risco residual é fila fiscal em erro, não venda indevida (`FRN-01`) |
| Produto sem categoria pode ser publicado? | 🟡 CONFIRMADO (intencional) | engine não exige categoria; 82 públicos sem categoria (F2-PROD-001) |
| Produto sem custo gera margem? | 🟡 RISCO | `preco_custo` nulo → relatório sinaliza `custo_confiavel=false` (tratado, não inventa) |
| Produto sem preço entra no PDV? | ✅ NÃO PROBLEMA | `preco_varejo` obrigatório p/ publicar; `calcular_preco_produto` valida |

### Estoque

| Regra | Veredito | Evidência |
|---|---|---|
| Entrada aumenta saldo | ✅ NÃO PROBLEMA | `receber_ordem_compra` (InventoryMovementWriter) |
| Venda reduz saldo | ✅ NÃO PROBLEMA | `decrementar_estoque_seguro` (finalizarVendaCaixaImpl) |
| Cancelamento devolve saldo | 🟡 RISCO | depende de `vendas_canceladas_auditoria` → estorno (não lido) |
| Ajuste manual exige autorização | ✅ NÃO PROBLEMA | `atualizarEstoqueProduto` → `assertGerenteSession` (ajuste só GERENTE) |
| Transferência mantém origem/destino | ✅ NÃO PROBLEMA | `transferir_estoque_seguro(p_loja_origem, p_loja_destino)` + idempotência |

### Preços

| Regra | Veredito | Evidência |
|---|---|---|
| Preço varejo / atacado / gatilho | ✅ NÃO PROBLEMA | `calcular_preco_produto` RPC; `quantidade_minima_atacado` |
| Margem mínima | ✅ NÃO PROBLEMA (**corrigido 2026-08-05**) | A afirmação anterior (*"sem regra de margem mínima encontrada"*) era **falsa**. A regra existe e é **RN-008 `Vigente`**: 9 triggers `trg_fn_*_margem` em `backend/supabase/migrations/{124,125,126}` sobre `produtos`, `precos_atacado` e `regras_preco` |
| Custo maior que venda | 🟡 CONFIRMADO (aviso) | `PrecosSection` alerta; permitido com flag (F1-15/F2-PROD-005) |
| Alteração histórica de preço | 🟡 RISCO | `historico_precos_produto` vazio (F5-VAL-04) |

### Financeiro / Caixa

| Regra | Veredito | Evidência |
|---|---|---|
| Abertura de caixa | ✅ NÃO PROBLEMA | `abrirCaixaOperadorImpl` |
| Fechamento | ✅ NÃO PROBLEMA | `calcular_valor_sistema_dinheiro_caixa` RPC vs contado |
| Sangria / Suprimento | ✅ NÃO PROBLEMA | `registrarMovimentacaoImpl` + `autorizarMovimentacaoGerenteImpl` |
| Divergência de caixa | ✅ NÃO PROBLEMA (intencional) | `LIMITE_DIVERGENCIA_FECHAMENTO = 5` (R$ 5 tolerância) |
| Saldo atual | ✅ NÃO PROBLEMA | RPC de valor sistema |

### Permissões

| Perfil | Veredito | Evidência |
|---|---|---|
| OPERADOR | ✅ NÃO PROBLEMA | `assertGerenteSession` barra em ajuste/cadastro |
| GERENTE | 🔴 CONFIRMADO (excesso) | = DONO=ADMIN em 22/23 recursos (F1-07) |
| DONO | ✅ NÃO PROBLEMA | perfil correto |
| ADMIN | 🔴 CONFIRMADO (excesso) | 9 rotas `/admin` fora da policy (F1-08/F6-PER-001) |

---

## Achados CONFIRMADOS problemáticos (detalhe)

### FRN-01 🟡 — NCM ausente: exigência pertence à emissão, não à publicação (**ADR-002**)
- **Reclassificado em 2026-08-05.** A redação original (🔴 P0, *"bloquear Publicar sem NCM"*)
  contradizia **ADR-002**, aprovada em 2026-08-04. A ADR prevalece.
- **Regra vigente (ADR-002 / RN-002):** NCM **não** é requisito de cadastro, publicação, venda,
  pedido ou recebimento. A **única** fronteira de exigência é `fiscal_enfileirar_documento_venda`.
- **Comportamento atual:** `evaluateProduct` (productEngine.ts:46) exige só `ativo && PUBLICADO` —
  **correto**. O defeito real é (a) o campo estar oculto no cadastro (`modoCompleto=false`),
  produzindo 105/113 produtos sem NCM, e (b) a exigência não existir na fronteira fiscal.
- **Arquivo:** `components/gerente/produtos/ProdutoFormModal.tsx` · família `fiscal_*`.
- **Classificação:** RISCO FISCAL OPERACIONAL (P1). Cruzado F1-03 / F2B-03 / RN-002 / ADR-002.
- **Critério de aceite:** NCM visível no nível 1 do cadastro; fila fiscal recusa documento sem NCM;
  **nenhum** bloqueio de publicação ou de venda (teste de regressão obrigatório).

### FRN-02 🔴 — Comissão calcula 0% quando `comissao_percentual` nulo
- **Regra esperada:** comissão = base × % do operador.
- **Comportamento atual:** `carregarResumoComissoes` → RPC `resumo_comissoes_por_operador` depende de
  `usuarios.comissao_percentual`; campo existe no banco mas **sem UI para preenchê-lo** (F6-CMP-001) →
  nulo → comissão zerada para todos.
- **Arquivo:** `app/gerente/comissoes/actions.ts:51` · `app/admin/funcionarios/*` (sem campo).
- **Classificação:** CONFIRMADO (campo sem preenchimento + RPC dependente). Cruzado F6-CMP-001.
- **Critério de aceite:** `% comissão` gravável na tela; RPC usa o valor; resumo não zera sem motivo.

### FRN-03 🔴 — GERENTE=DONO=ADMIN / rotas fora da policy
- **Regra esperada:** gerente não acessa financeiro sensível nem `suspensao`/`configuracoes`.
- **Comportamento atual:** 22/23 recursos `ALL_ADMIN_PROFILES`; 9 rotas ausentes de `RESOURCE_PROFILES`
  (fallback `allow`); `configuracoes`/`suspensao` acessíveis por qualquer gerente.
- **Arquivo:** `lib/admin/policy/adminPolicy.ts` (F1-07/F1-08/F6-PER-001).
- **Classificação:** CONFIRMADO. Cruzado F1-08/F6-PER-001.
- **Critério de aceite:** sensíveis → `['DONO','ADMIN']`; 9 rotas mapeadas; fallback `deny`.

## Itens de RISCO (exigem validação, não correção ainda)

- **RV-001** Venda sem estoque: confirmar se `decrementar_estoque_seguro` bloqueia saldo negativo.
- **RV-002** Devolução sem trilha: confirmar se há gravação em alguma tabela (F5-VAL-15).
- **RV-003** Cancelamento devolve estoque: confirmar se o estorno de saldo ocorre na RPC.

## Itens NÃO PROBLEMA (intencionais — registrados p/ não confundir)

- Venda sem cliente (varejo), venda de inativo (bloqueada), troco, múltiplas formas,
  autorização de gerente, ajuste só GERENTE, sangria/suprimento com autorização,
  divergência de caixa com tolerância R$ 5.
- **Produto sem fornecedor** (ADR-006) e **produto sem NCM** (ADR-002) — decisões aprovadas,
  não defeitos.

> **Ressalva sobre custo ausente (`custo_confiavel`).** A cobertura verificada aqui é a de
> `relatorio_margem_por_venda_periodo`. **ADR-007 é absoluta e ainda não está propagada** a
> todos os caminhos (RN-031/RN-035 = `Divergente`, ticket BR-03; risco R4 do
> `GO_LIVE_FINAL_CHECKLIST`). Não tratar como resolvido: `relatorio_curva_abc_periodo`,
> dashboards e exports **não** foram verificados.

## Conexão com frentes anteriores
F1 (parametrização), F2/F2B (cadastros), F3 (dados), F5 (trilha), F6/F6.1 (coerência/expansão).
Esta auditoria **não duplica** — consolida o que é regra de negócio e cruza os IDs originais.
Autoridade normativa sobre todos os vereditos: `docs/ARQUITETURA_REGRAS_NEGOCIO.md` (Cap. 7 e 8).
