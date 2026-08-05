# Cobertura dos Requisitos do Cliente — FastProduct / Jīn Lóng ERP

> **Natureza:** artefato de fechamento da Rodada R1. Somente leitura. Nenhuma regra nova.
> **Data:** 2026-08-04
> **Pergunta que este documento responde:** *tudo o que o cliente pediu está coberto?*

## Nota de fonte — leia antes da tabela

**Não existe no repositório um documento único intitulado "especificação do cliente".**
Registrar isso é parte da resposta: o escopo contratado do piloto está distribuído em três
documentos, e é essa a referência usada aqui.

| Fonte usada | Papel | Caminho |
|---|---|---|
| **Contrato do piloto D0** | Define IN / OUT do escopo contratado | `docs/FEATURE_FREEZE_PILOTO.md` |
| **Perfil operacional do 1º cliente** | Detalha o que o cliente precisa executar no dia a dia | `Jinlong/09_OPERACAO_PRIMEIRO_CLIENTE.md` |
| **Critérios de aceite comercial** | O que precisa existir para o cliente comprar/usar | `docs/GO_LIVE_IMPLEMENTATION_GUIDE.md` §8.3 |

**Evidência de estado:** `docs/AUDITORIA_FUNCIONAL_COMPLETA_GO_LIVE.md` (22 telas, runtime,
2026-08-03) e `docs/AUDITORIA_F1_PARAMETRIZACAO.md` (banco, 2026-08-03). Onde a auditoria diz
"não verificado", esta tabela **não** afirma cobertura.

**Consequência de governança (registrada, não é ticket):** a ausência de um documento único de
requisitos torna "o cliente pediu X" uma afirmação não rastreável. Consolidar isso é trabalho de
R2 — fora do escopo desta rodada.

---

## 1. Cobertura — escopo contratado do piloto (D0)

Legenda: **✔ Implementado** = existe e foi verificado · **◐ Parcial** = existe com lacuna
verificada · **✗ Não iniciado** = sem implementação.

| Requisito | Implementado | Parcial | Não iniciado | Arquivos |
|---|:---:|:---:|:---:|---|
| **Venda no PDV web** (bip, busca, carrinho, finalização) | ✔ | | | `pdv-importados/app/caixa/*`, `finalizar_venda_transacional_canonica_v4` |
| **Pagamentos: dinheiro, PIX, débito, crédito** (com split) | ✔ | | | `app/caixa/hooks/useCaixaPagamentos.tsx`, mig `246` (fiado removido) |
| **Sem fiado no PDV** (requisito negativo do contrato) | ✔ | | | migs `246_remover_venda_fiado`, `284_devolucoes_remove_fiado` |
| **Abertura e fechamento de caixa** | ✔ | | | `app/caixa/server/cashSession.ts`, `fechar_caixa_atomico` (207/227) |
| **Sangria / suprimento com aprovação de gerente** | ✔ | | | `registrar_movimentacao`, `aprovar_movimentacao`, mig `047` |
| **Desconto com autorização de gerente** | ✔ | | | `shared-core/src/managerDiscount/policy.ts`, mig `122` |
| **Preço varejo / atacado automático** | ✔ | | | `calcular_preco_produto` (mig 250) + espelho offline |
| **Cadastro unitário de produto** | ✔ | | | `/admin/catalogo`, `criar_produto_com_estoque_inicial` (mig 270) |
| **Import CSV de catálogo** | ✔ | | | `/admin/catalogo` (import), `docs/AUDITORIA_CATALOGO_PRODUTO.md` |
| **Import NF-e de entrada** | ✔ | | | `/admin/estoque/importar-nfe`, `importar_nfe_transacao` |
| **Gestão de estoque** (ajuste, transferência, kardex) | ✔ | | | `/admin/estoque/*`, `ajustar_estoque_manual` (269), `transferir_estoque_seguro` |
| **Recebimento de mercadoria** | | ◐ | | `remessas` + `registrar_conferencia_remessa` (`20260801120000`); `receber_ordem_compra` (110) **ainda não usa o fluxo de conferência** — FLX-04 / ADR-004 |
| **Vendas no admin + cancelamento** | ✔ | | | `/admin/vendas`, `cancelar_venda_transacional` |
| **Contas a receber** | ✔ | | | `/admin/financeiro`, `registrar_liquidacao_receber` |
| **Contas a pagar** | | ◐ | | `/admin/financeiro`, `registrar_pagamento_contas_pagar` — **sem CHECK `valor_pago <= valor_total`** (TB-07 / RN-003) |
| **Cadastro de clientes** | | ◐ | | `/admin/clientes` — validação só em TS; **sem CHECK de CPF/CNPJ/e-mail no banco** (TB-04 / RN-010) |
| **Cadastro de fornecedores** | | ◐ | | `/admin/fornecedores` — **sem `loja_id`; CNPJ único global; vazamento entre tenants** (TB-05, P0 / ADR-001) |
| **Perfis e permissões** (DONO / GERENTE / OPERADOR) | | ◐ | | Guarda de rota 20/20 verificada; **GERENTE = DONO = ADMIN em 22 de 23 recursos** (F1-07) e 9 rotas `/admin` fora da policy (F1-08) |
| **Multi-idioma PT / 中文** | ✔ | | | `shared-core/src/i18n/*`, `resolveLocale.spec.ts` |
| **Dashboard e relatórios** | | ◐ | | RPCs `kpis_*` / `relatorio_*` — **margem e Curva ABC não confiáveis**: 66 de 113 produtos sem custo (F1-13) e ADR-007 ainda não propagada (BR-03) |
| **Trilha de auditoria** | | ◐ | | Cobre **operação** (6 tipos de evento); **não cobre cadastro** — bloqueador B1 da auditoria funcional |
| **Emissão fiscal NFC-e** | | ◐ | | Infra completa (worker, máquina de estado mig 092, DLQ); **`auto_enqueue_fiscal = false` em 7/7 lojas** (F1-02) e 105/113 produtos sem NCM (F1-03). Contratualmente **mock no D0** — ligar é decisão de escopo (FLX-02) |
| **Parametrização da empresa/loja** (CNPJ, razão social, IE, endereço) | | | ✗ | `lojas` — **7 de 7 lojas sem nenhum desses dados** (F1-01) |
| **Formas de pagamento parametrizáveis** | | | ✗ | Hardcoded; não existe tabela (F1-05) |

---

## 2. Requisitos explicitamente FORA do escopo D0

Não são lacunas. Estão declarados como OUT no contrato do piloto.

| Item | Onde está declarado |
|---|---|
| Venda em espera | `FEATURE_FREEZE_PILOTO.md` — OUT (existe código, fora do contrato) |
| Inventário cego / formal | OUT |
| Conciliação bancária | OUT |
| Multi-loja no piloto | OUT (a arquitetura é multi-tenant; o piloto é uma loja) |
| Desktop / outbox offline | OUT no D0 (`pdv-local` existe, não entra no D0) |
| CRM, promo engine | OUT |

---

## 3. Resposta objetiva

> **Tudo que o cliente pediu está coberto?**

**Não integralmente. 12 requisitos plenamente cobertos, 9 parciais, 2 não iniciados.**

**Leitura correta desse número:** nenhuma lacuna é de *ausência de funcionalidade nuclear*.
As 9 parciais são lacunas de **integridade, isolamento e parametrização** — exatamente os
Pacotes 1–6 do `GO_LIVE_IMPLEMENTATION_GUIDE.md`. As 2 não iniciadas (dados cadastrais da loja e
formas de pagamento parametrizáveis) são **operacionais/configuração**, não desenvolvimento
de produto.

| Categoria | Qtd | Consequência para o Go-Live |
|---|---|---|
| ✔ Coberto | 12 | Nenhuma ação |
| ◐ Parcial | 9 | 7 já estão nos pacotes R1; 2 dependem de operação (fiscal, auditoria de cadastro) |
| ✗ Não iniciado | 2 | **Bloqueia o primeiro cliente real** — loja sem CNPJ não emite nada e não assina nada |

**O que este documento acrescenta ao que já se sabia:** os dois itens `✗` não estavam em nenhum
dos 7 pacotes (0–6) de implementação, porque não são código — são preenchimento de dados e uma decisão
de produto sobre parametrização de pagamento. Sem eles, o Pacote 1–6 pode terminar 100% verde e
o cliente ainda assim não operar. Isso está registrado no checklist final (Entrega 5), não como
ticket novo.
