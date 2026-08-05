# Auditoria Frente 2 — Cadastros Inconsistentes (Go-Live)

> Análise somente-leitura de **todos os cadastros mestres** do Jīn Lóng ERP.
> Evidência extraída diretamente do banco (`service_role`, consulta paginada) em 2026-08-03.
> Nenhum dado foi alterado. Fila de execução: `docs/auditoria/tickets/GO_LIVE_TICKETS_F2_CADASTROS.md`

**Base analisada:** 113 produtos · 111 linhas de estoque · 56 vendas · 12 categorias ·
2 marcas · 0 fornecedores · 1 cliente · 12 usuários · 56 itens de venda.

---

## 1. Veredito

⚠️ **Não pronto para Go-Live**, mas **nenhum bloqueador absoluto** nesta frente.

> **Reclassificação de 2026-08-05 por ADR-006.** Esta seção declarava **fornecedor inexistente**
> (F2-PROD-003 / F2-FOR-001) como bloqueador de Go-Live. A ADR-006, aprovada em 2026-08-04, decide
> o contrário: *"Produto pode existir sem fornecedor. Venda permanece permitida. Processos de
> compra exigem fornecedor."*
>
> Consequência: F2-FOR-001 **bloqueia Compras**, não a abertura da loja. Rebaixado de
> 🔴 bloqueador para **P1**, executado no **Pacote 3** (depois de `fornecedores.loja_id` — TB-05).
> É proibido introduzir exigência de fornecedor no cadastro, na publicação ou na venda de produto.

Os demais 🔴 (produto sem categoria, histórico de preço ausente) são severos, porém
**não impedem a loja de abrir** — são dívidas de qualidade/auditoria (P1/P2), pós-R1.

> **GAP 1 resolvido nesta versão:** separou-se **Severidade** (risco técnico) de
> **Bloqueador de Go-Live** (decisão de produto/negócio). Após ADR-006, **nenhum** achado
> desta frente é bloqueador.

---

## 2. PRODUTOS

| Item pedido | Resultado | Severidade | Bloqueador GL | Ticket |
|---|---|:--:|:--:|---|
| Produtos sem categoria | **93/113** (82 publicados) | 🔴 | ❌ P1 | F2-PROD-001 |
| Produtos sem marca | **111/113** (99 publicados) | 🟠 | ❌ P1 | F2-PROD-002 |
| Produtos sem fornecedor | **113/113** (tabela `fornecedores` vazia) | 🟠 | ❌ P1 (**ADR-006**) | F2-PROD-003 |
| Produtos sem preço (varejo) | **0** — todos têm varejo | 🟢 | ❌ | — |
| Preço inválido (margem negativa) | **1** (`QA CSV UPD…` varejo 19,99 < custo 38) | 🟠 | ❌ P1 | F2-PROD-005 |
| Preço atacado vazio | **70/113** | 🟠 | ❌ P1 | F2-PROD-004 |
| Custo vazio | **66/113** | 🟠 | ❌ P1 | F2-PROD-004 |
| Produtos duplicados (mesmo nome) | **8 grupos**: caneta×6, gato branco×4, gato×3, papel×2, regua×2, cadeira ferro×2, cachorro grande×2, quadro negro×2 | 🟠 | ❌ P1 | F2-PROD-006 |
| Códigos de barras duplicados | **0** (EANs únicos) | 🟢 | ❌ | F2-PROD-011 |
| Produtos ativos sem estoque | **68/101** publicados sem saldo | 🟠 | ❌ P1 | F2-PROD-007 |
| Produtos inativos vendidos | **2** (`QA CSV UPD…` INATIVO; `[SMOKE:DONE]…` DRAFT) | 🟡 | ❌ P2 | F2-PROD-008 |

**Categorias/Marcas:**
- 12 categorias, **7 inativas**; 2 produtos publicados apontam para categoria inativa → F2-PROD-009 🟡
- 0 produto aponta para categoria/marca inexistente (sem órfãos de FK) ✅
- 2 marcas; 111 produtos sem marca (já coberto)

### Modelo de produto — suporte a operação profissional

| Capacidade | Existe? | Estado na base | Bloqueador GL | Ticket |
|---|:--:|---|:--:|---|
| Campo **custo** | ✅ | existe, mas **66/113 vazio** | ❌ P1 | F2-PROD-004 |
| **Venda varejo** | ✅ | todos têm; aparece no PDV | ❌ | OK |
| **Venda atacado** | ✅ | existe; **70/113 vazio** | ❌ P1 | F2-PROD-004 |
| **Margem** | ✅ (cálculo no form) | exibida onde há custo; 1 caso negativo | ❌ P1 | F2-PROD-005 |
| **Histórico de alteração de preço** | ❌ | tabela existe, **0 registros** | ❌ P2 | F2-PROD-010 |

---

## 3. CLIENTES

| Item pedido | Resultado | Severidade | Bloqueador GL | Ticket |
|---|---|:--:|:--:|---|
| Duplicados (CPF/CNPJ) | **0** (1 cliente) | 🟢 | ❌ | F2-CLI-001 |
| Duplicados (telefone) | **0** | 🟢 | ❌ | F2-CLI-001 |
| Dados incompletos (sem doc) | **0** | 🟢 | ❌ | — |
| Teste misturado | **0** (1 real: `AO andre oliveira PF`) | 🟢 | ❌ | — |
| Sem identificação | **0** | 🟢 | ❌ | — |

---

## 4. FORNECEDORES

| Item pedido | Resultado | Severidade | Bloqueador GL | Ticket |
|---|---|:--:|:--:|---|
| Incompletos | tabela **vazia** (0 registros) | 🔴 | ✅ **SIM** | F2-FOR-001 |
| Teste | 0 | 🟢 | ❌ | — |
| Relacionamento produto↔fornecedor | **quebrado por omissão**: 113 produtos, 0 fornecedores | 🔴 | ✅ **SIM** | F2-PROD-003 |

**Impacto do bloqueador:** sem fornecedor, a compra fica sem rastreabilidade, a reposição
futura fica comprometida e o histórico comercial fica incompleto — exatamente o que a
especificação do Jīn Lóng veda ao exigir "Fornecedor principal" no cadastro.

---

## 5. FUNCIONÁRIOS / USUÁRIOS

| Item pedido | Resultado | Severidade | Bloqueador GL | Ticket |
|---|---|:--:|:--:|---|
| Sem perfil | **0** | 🟢 | ❌ | F2-USR-002 |
| Sem permissão (divergência) | 0 — porém **5 contas DONO** é excesso (seed) | 🟠 | ❌ P1 | F2-USR-001 |
| Inativos operando | **0 inativos**; revogação de sessão não verificada em runtime | 🟢 | ❌ | F2-USR-002 |

Distribuição: DONO 5 · GERENTE 3 · OPERADOR 3 · ADMIN 1 (12 total).

---

## 6. Priorização (dois eixos)

### Bloqueadores de Go-Live (decisão de produto — abrir a loja exige)
1. **F2-PROD-003 / F2-FOR-001** — fornecedor inexistente (especificação exige Fornecedor principal)

### P1 — antes do primeiro cliente (severos, mas não bloqueiam abertura)
2. F2-PROD-001 — 82 publicados sem categoria
3. F2-PROD-002 — 99 sem marca
4. F2-PROD-004 — 66 sem custo / 70 sem atacado
5. F2-PROD-005 — margem negativa não sinalizada
6. F2-PROD-006 — 8 nomes duplicados
7. F2-PROD-007 — 68 publicados sem estoque
8. F2-USR-001 — 5 DONOs

### P2 — pós Go-Live (qualidade/auditoria)
9. F2-PROD-010 — histórico de preço inexistente
10. F2-PROD-008 — inativos vendidos (regra no PDV)
11. F2-PROD-009 — categorias inativas associadas
12. F2-CLI-001 — duplicidade em importação futura
13. F2-PROD-011 / F2-USR-002 — manter validações (OK hoje)

---

## 7. Evidência bruta (amostra)

```
produtos: 113 | publicados: 101
  semCategoria: 93 (publicados: 82)
  semMarca: 111 (publicados: 99)
  atacadoVazio: 70 | custoVazio: 66
  margemNegativa: 1 -> ["QA CSV UPD 1778596755070", 19.99, 38]
  eanDuplicados: [] | nomesDuplicados: 8 grupos
  ativosSemEstoque: 68 | inativosVendidos: 2
categorias: 12 (7 inativas) | marcas: 2
historico_precos_produto: 0
clientes: 1 | fornecedores: 0 | usuarios: 12 (DONO5 GERENTE3 OPERADOR3 ADMIN1)
```

**Ciclo de correção:** Hermes encontra → classifica (Bloqueador / P1 / P2) → cria ticket →
Claude corrige → Hermes re-roda a sondagem e confirma (`fornecedores > 0`,
`produtos PUBLICADO sem categoria = 0` etc.).

---

## 8. Limites

- Análise de **dados de banco + leitura de componentes**. Fluxos de tela da Frente 2 (UX)
  foram cobertos em `docs/AUDITORIA_F2_CADASTROS_UX.md` e `docs/AUDITORIA_F2B_CADASTRO_PRODUTO.md`.
- A base é de **seed/desenvolvimento**; números absolutos mudarão com a carga real, mas a
  *ausência de regras* (não obrigar fornecedor/categoria, não gravar histórico) é
  independente dos dados e permanece válida.
- Nenhuma credencial de usuário foi usada; apenas `service_role` via script de sondagem.
