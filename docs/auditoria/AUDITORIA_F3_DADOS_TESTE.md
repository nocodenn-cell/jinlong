# Auditoria Frente 3 — Dados de Teste Misturados com Produção

> Auditoria de limpeza dos cadastros mestres e operacionais. Análise somente-leitura,
> evidência extraída do banco (`service_role`) em 2026-08-03. Nenhum dado foi alterado.
> Acompanhamento de execução: criar fila de limpeza `docs/auditoria/tickets/` se aprovado.

**Base analisada:** 113 produtos · 56 vendas · 56 itens · 1 cliente · 12 usuários ·
61 eventos de venda · 2 documentos fiscais · 39 caixas.

---

## 1. Veredito

🔴 **A base atual é 100% de desenvolvimento/teste.** Não há nenhum registro real de
produção em nenhuma entidade operacional:
- **0 clientes reais** (1 cliente de teste: `AO andre oliveira PF`)
- **12/12 usuários** são contas seed (E2E/Probe/Smoke/Demo)
- **56/56 vendas** e **39/39 caixas** foram feitas por essas contas de teste
- **28 produtos** têm nome de teste (QA CSV, SMOKE, CTR); **22 publicados**

Isso tem dois lados: (a) a limpeza é trivial porque quase tudo é descartável; (b) o
**Go-Live exige popular dados reais** — a base não está "misturada", ela está *vazia de
produção*. O risco não é vender dado de teste por engano (todas as vendas estão sob contas
fake), e sim **abrir a loja sem nenhum dado real e com lixo de teste ainda publicado**.

---

## 2. Relatório de limpeza (formato solicitado)

| Tipo | Quantidade | Exemplos | Ação |
|---|---:|---|---|
| **Produto teste** | **28** (22 publicados) | `QA CSV NOVO 1778596755070`, `QA CSV SEG 1778597056316`, `[SMOKE:DONE] [SMOKE] pdv-estoque`, `[CTR:DONE] pdv`, `[TX270:DONE] [TX270] com estoque` | **REMOVER** (ou mover p/ loja de homolog se houver) |
| **Produto genérico** | 1 | `PRODUTO PROMO DEMO` | **REMOVER** |
| **Cliente teste** | 0 (1 cliente existe, mas é `AO andre oliveira PF` — nome real, CPF real `999.999.888-52`) | — | **MANTER** como cliente piloto; confirmar se é real |
| **Venda teste** | **4** (3 por item de teste, 1 por ID) | `00e2e001-…0001`, `c3c38d47-…`, `3b8f4c81-…`, `9b920294-…` | **REMOVER** (cascata em itens_venda, venda_eventos, documentos_fiscais) |
| **Movimentação fictícia** | 56 itens_venda + 61 venda_eventos | todos ligados às 4 vendas teste + caixas fake | **REMOVER** em cascata |
| **Nota fiscal simulada** | **2** | `documentos_fiscais_pendentes`: 1 EMITIDO, 1 PENDENTE (provider nulo = mock) | **REMOVER** (não são NF reais — provider mock) |
| **Usuário desenvolvedor** | **12/12 (100%)** | `Dono E2E`, `Gerente E2E`, `Operador E2E`, `Probe Dono`(×2), `Dono Smoke 1784432057537`, `E2E Admin FastProduct`, `Dono Demo`, `Operador Teste`, `Demo Gerente` | **REMOVER/REBAIXAR**: reter 1 Dono real (convite), demais inativar ou excluir |
| **Registro com nome genérico** | 1 (produto) + categorias manuais (`galo`, `mobilia`, `casa`) | `PRODUTO PROMO DEMO`; categorias `galo`×2, `mobilia`×2, `geladeira`×2 | **REMOVER** categorias órfãs; produto genérico remover |
| **Caixa de teste** | **39/39** | todos abertos por contas E2E/Probe/Smoke | **REMOVER** (histórico de caixa fake) |
| **Loja de teste** | 5 lojas com prefixo `PROBE_*`/`SMOKE_*` | (ver F1) | **REMOVER** antes do Go-Live |

---

## 3. Padrões de detecção (para o script de limpeza)

Regex aplicado: `/teste|TESTE|QA\b|QA[ _]|SMOKE|CTR[: ]|TX\d|\[CTR|\[SMOKE|@localhost|example|PROBE_|SMOKE_|Demo|E2E/i`

Sinais específicos encontrados:
- **Produtos:** prefixo `QA CSV NOVO/SEG <timestamp>`, `[SMOKE:DONE] [SMOKE]`, `[CTR:DONE]`, `[TX270:DONE]`
- **Usuários:** sufixo `E2E`, prefixo `Probe `, `Smoke `, `Demo `
- **Documentos fiscais:** `provider = null` + `chave_fiscal` mock (sem série SEFAZ real)
- **Categorias manuais:** nomes repetidos (`galo`, `mobilia`, `geladeira`) sem produtos reais

---

## 4. Impacto

### 4.1 Impacto no financeiro
- Faturamento total registrado: **R$ 2.916,60**
- Faturamento de vendas teste: **R$ 262,80** (9,0% do total) — ligado a produtos QA
- **Risco:** se o Go-Live abrir sem limpar, o Dashboard financeiro mostra R$ 2.916,60 de
  "histórico", dos quais 9% são puramente de teste e 91% são vendas de produtos reais
  *mas feitas por operadores fake*. O caixa de fechamento e o fluxo de caixa inicial
  estariam contaminados.

### 4.2 Impacto nos relatórios
- **Curva ABC / Margem:** 28 produtos de teste com preços artificiais distorcem o ranque
  de produtos e o cálculo de margem (vários com `preco_custo=0`).
- **Relatório de vendas:** 56 vendas aparecem como "histórico da loja" — um operador
  real acharia a loja "já em operação" com dados falsos.
- **Indicadores de estoque baixo:** 68 produtos sem estoque (vistos na F2) somados aos
  de teste inflariam o alerta de reposição.

### 4.3 Impacto nos indicadores (KPIs do EMS)
- **Ticket médio:** calculado sobre 56 vendas fake → indicador sem significado.
- **Taxa de conversão / clientes recorrentes:** 1 cliente apenas → KPI de relacionamento
  inútil até popular base real.
- **Alertas de estoque:** falso positivo massivo por produtos de teste sem saldo.

---

## 5. Plano de limpeza (ordem segura — respeitar FK)

1. **`documentos_fiscais_pendentes`** — remover os 2 mock (cascata não bloqueia vendas)
2. **`venda_eventos`** — remover eventos das 4 vendas teste
3. **`itens_venda`** — remover 56 itens das vendas teste
4. **`vendas`** — remover 4 vendas teste
5. **`caixas`** — remover 39 caixas de teste (todas são fake)
6. **`produtos`** — remover 28 de teste + 1 genérico (verificar FKs em estoque/itens)
7. **`categorias`/`marcas`** — remover manuais órfãs (`galo`, `mobilia`, `casa`…)
8. **`usuarios`** — inativar/excluir 11 contas seed; criar 1 Dono real por convite
9. **`lojas`** — remover `PROBE_*`/`SMOKE_*` (F1)
10. **`clientes`** — manter `AO andre oliveira PF` como piloto; criar reais no Go-Live

> ⚠️ **Não executar sem aprovação.** Esta é uma auditoria; a limpeza deve ser um ticket
> próprio (F3-CLEANUP) com backup prévio e validação de FK. Recomenda-se rodar em
> ambiente de staging primeiro.

---

## 6. Descoberta-chave para o Go-Live

A base não está "misturada" — está **100% vazia de produção**. Portanto o plano de Go-Live
tem duas frentes obrigatórias e não apenas uma de limpeza:

- **Frente A — Limpeza:** remover todo o lixo de teste (acima).
- **Frente B — População:** criar dados reais (1 Dono, operadores reais, fornecedores
  reais, produtos reais via NF-e/CSV, clientes reais).

O critério de "pronto" da Frente 3 não é "sem dados de teste", é "**com dados reais e sem
dados de teste**".

---

## 7. Limites

- Análise por padrão de nome/ID; nomes reais disfarçados de teste podem escapar (ex.:
  se alguém cadastrou "Produto X" manualmente — não detectado, mas é legítimo).
- `usuarios` não tem coluna `email` no schema atual; classificação de dev usou `nome`/
  `perfil`. O e-mail real pode estar em `auth.users`/`funcionarios` (não auditado aqui).
- Nenhuma credencial de usuário foi usada; apenas `service_role`.
