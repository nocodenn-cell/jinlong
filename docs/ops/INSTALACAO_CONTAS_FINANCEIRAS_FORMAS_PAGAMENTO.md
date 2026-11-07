# Instalação — contas financeiras e formas de pagamento (F2)

**Data:** 2026-11-07 · **Escopo:** web, loja única, sem fiscal, sem fiado · **Plano:** `docs/auditorias/PLANO_LIBERACAO_PRIMEIRO_CLIENTE_2026-11-06.md` (fase F, PR F2; decisão D-07 / P0-5)
**Status deste documento:** instruções derivadas do código. **Nada foi executado** em produção, homologação ou banco. Itens marcados **NÃO COMPROVADO** não foram confirmados no código e precisam ser verificados na instalação.

---

## 1. Por que este passo é obrigatório

Desde a migration D5, uma venda com forma **PIX**, **CARTAO_DEBITO** ou **CARTAO_CREDITO** só é gravada se a loja tiver uma **conta financeira ativa** vinculada àquela forma. Sem ela, o banco recusa a venda com a exceção `PAGAMENTO_SEM_CONTA_FINANCEIRA`.

- Regra no banco: `backend/supabase/migrations/20261107110000_d5_pagamento_exige_conta_financeira.sql` (trigger `BEFORE INSERT` em `vendas_pagamentos`, linhas 1–45). A regra vale também para o sync do PDV, por estar no banco.
- Função que resolve a conta da forma: `internal.financeiro_conta_forma(loja, forma)` em `backend/supabase/migrations/20261006180000_financeiro_contas_operacionais.sql:33-39`. Exige `financeiro_contas_forma` com a forma **e** `contas_financeiras.ativo = true` **e** `contas_financeiras.loja_id` igual à loja da venda.
- **Dinheiro não exige conta.** A gaveta do PDV funciona sem vínculo.

**Consequência para a instalação:** nenhuma venda em PIX ou cartão funciona antes deste passo ser concluído. O provisionamento automático **não** cria contas (ver §3).

---

## 2. Passo a passo (tela do dono ou gerente)

Pré-requisitos:
- Usuário **DONO** ou **GERENTE** da loja (rotas `/admin/*` aceitam `GERENTE` e `DONO`: `pdv-importados/lib/admin/policy/adminPolicy.ts:56`).
- Plano da empresa com o recurso `financeiro` (ver §4, risco R1).

### 2.1 Criar a conta bancária (uma por loja, para PIX e cartões)

1. Entrar no painel e abrir **Financeiro** (`/admin/financeiro`). Rota e gate: `pdv-importados/app/admin/financeiro/page.tsx`, `pdv-importados/lib/cobranca/planos.ts:73`.
2. Abrir a aba **"Contas e saldos"** (`?tab=contas`). Rótulo: `pdv-importados/app/admin/financeiro/_components/financeiroTabs.ts` (`'contas': 'Contas e saldos'`). A aba é renderizada em `FinanceiroWorkspace.tsx:112-114`.
3. No formulário **"Cadastrar conta financeira"** (`FinanceiroContas.tsx:255-270`, operação `CRIAR_CONTA`):
   - **Nome**: livre (ex.: nome do banco da loja).
   - **Tipo**: escolher **"Banco"** (`financeiro_tipo_banco`). Para PIX e cartão a conta **precisa** ser do tipo `BANCO`. Ver regra abaixo.
   - **Data inicial**: data de hoje (preenchida por padrão, `FinanceiroContas.tsx:268`).
   - **Saldo inicial**: pode ficar em 0 (padrão do formulário, `FinanceiroContas.tsx:269`).
4. Confirmar. A operação chama a RPC `financeiro_comando_operacional` (`pdv-importados/app/admin/financeiro/financeiroLojaActions.ts:82`).

Regra de tipo, no banco (`20261006180000_financeiro_contas_operacionais.sql`, operação `CONFIGURAR_CONTA_FORMA`): PIX e cartões só aceitam conta **BANCO ativa**; DINHEIRO só aceita conta **RESERVA** ou nenhuma conta.

### 2.2 Vincular cada forma à conta

1. Na mesma aba, no bloco **"Formas de pagamento → conta financeira"** (`FinanceiroContas.tsx:226-251`, operação `CONFIGURAR_CONTA_FORMA`):
   - **Forma**: PIX, Cartão crédito ou Cartão débito (o formulário também lista Dinheiro, `FinanceiroContas.tsx:15-18`).
   - **Conta**: a conta do passo 2.1.
2. Repetir para **cada uma das três formas**: PIX, CARTAO_DEBITO e CARTAO_CREDITO. Cada uma precisa de vínculo próprio. Dinheiro pode ficar **"Sem conta vinculada"** (`financeiro_forma_sem_conta`).
3. Conferir na própria tela o resumo em lista (`FinanceiroContas.tsx:257-266` mostra `forma: conta` ou "não configurada").

Os três vínculos podem apontar para a mesma conta BANCO (o seed de testes faz isso, ver §5).

### 2.3 Conferir

- Na lista de contas, a conta aparece **ativa** (sem o sufixo "inativa").
- Na lista de formas, PIX, Cartão crédito e Cartão débito aparecem com o nome da conta, não com "não configurada".
- Ver §5 para a venda de teste.

### 2.4 Formas de pagamento no PDV

As formas do PDV são cadastradas pelo provisionamento com os códigos `DINHEIRO`, `PIX`, `CARTAO_DEBITO`, `CARTAO_CREDITO` (`pdv-importados/lib/provisionamento/provisionamentoDefaults.ts:20-25`). Conferir que as 4 formas estão ativas na loja; a tela de configuração do PDV não foi localizada para esse fim (ver NÃO COMPROVADO N3).

---

## 3. O que o sistema NÃO faz sozinho

| Item | Evidência | Situação |
|---|---|---|
| Criar conta financeira no provisionamento | `pdv-importados/lib/provisionamento/provisionamentoDefaults.ts:20-25` cria só `formas_pagamento`; `pdv-importados/lib/cobranca/trialBootstrap.ts:26-31` idem | Não cria `contas_financeiras` nem `financeiro_contas_forma`. **Configuração manual obrigatória.** |
| Checklist de implantação exigir conta | `pdv-importados/app/admin/implantacao/implantacaoCatalog.ts:38-84` | Não há item de contas/formas no catálogo. Ver lacuna L3 em `INSTALACAO_PRIMEIRO_CLIENTE_CHECKLIST.md`. |
| Mensagem amigável ao operador quando a conta falta | `pdv-importados/app/caixa/server/caixaErroOperador.ts:124-190` não mapeia `PAGAMENTO_SEM_CONTA_FINANCEIRA` | O operador vê a mensagem padrão genérica; o detalhe só vai ao log do servidor (`caixaErroOperador.ts:108-120`) e ao Sentry (`pdv-importados/app/caixa/server/caixaVendas.impl.ts:334-342`). |

---

## 4. Riscos e pré-condições

| # | Risco | Evidência | Ação |
|---|---|---|---|
| R1 | Plano sem o recurso `financeiro` bloqueia a tela de contas (`bloqueioPorPlano`). Nos valores de fallback, o plano `BASICO` **não** inclui `financeiro`; `ATACADO` e `REDE` incluem. | `pdv-importados/lib/cobranca/planos.ts:29`, `:33-35`, `:73`; `pdv-importados/app/admin/financeiro/page.tsx` (`bloqueioPorPlano('financeiro')`) | **NÃO COMPROVADO** qual plano o primeiro cliente contratou nem o conteúdo real de `saas.planos` (o fallback é placeholder, `planos.ts:1-6`). Confirmar antes da instalação. Se o plano não tiver `financeiro`, a conta não pode ser criada pela tela. |
| R2 | Venda PIX/cartão antes da configuração é recusada | `20261107110000_d5...sql:29-31` | Concluir §2 antes de treinar a equipe. |
| R3 | Produção: lojas que já vendem PIX/cartão sem conta ativa | Plano §9 (atualização D4 e D5) | Antes de aplicar D5 em produção, rodar a pré-checagem da `docs/ops/PLAYBOOK_ROLLBACK_E_SUPORTE_PRIMEIRO_CLIENTE.md` §3.2. **NÃO TESTADO em produção.** |
| R4 | Cartão só vira saldo bancário na liquidação do recebível (após taxa) | `pdv-importados/src/lib/i18n/pt.json`, chave `financeiro_formas_hint` | Informar o dono. Não é configuração de instalação. |

---

## 5. Verificação de ponta a ponta (a executar na instalação)

1. Com as três formas vinculadas, abrir o caixa e vender **1 unidade** de produto com total de R$ 1,00 (ou o menor valor cadastrado), pagando em **PIX**. Esperado: venda concluída.
2. Repetir em **CARTAO_DEBITO** e **CARTAO_CREDITO**. Esperado: venda concluída.
3. Em uma segunda loja de teste **sem** vínculo (se existir), tentar PIX. Esperado: falha com `PAGAMENTO_SEM_CONTA_FINANCEIRA`. **Não fazer em loja de cliente.**
4. Conferir o recebível/extrato na aba **"PIX e cartões"** (`financeiroTabs.ts`: `'recebiveis': 'PIX e cartões'`). **NÃO COMPROVADO** que cada venda gera o lançamento esperado nessa aba: o plano (§9, "Validação com Docker") registra "contas a receber: NÃO TESTADO" (`docs/auditorias/PLANO_LIBERACAO_PRIMEIRO_CLIENTE_2026-11-06.md`, golden flow bloco 7).

Referência de teste de banco: `backend/scripts/d4-d5-troco-conta-pagamento.test.sql` (D5-1..3). Executado em banco descartável em 2026-11-07 (plano §9, "Validação com Docker").

---

## 6. Referência do seed de teste (não usar em cliente)

O seed E2E cria, na loja matriz de teste, uma conta `BANCO` chamada "E2E Conta Banco" e vincula PIX, CARTAO_DEBITO e CARTAO_CREDITO a ela (`pdv-importados/scripts/seed-dev-users.mjs`, função `ensureFormasFinanceirasLojaMatriz`, commit `f7d31bc0`). É o mesmo modelo de vínculo, mas **nunca copiar o nome ou os dados de teste para a loja do cliente.**

---

## 7. Lacunas deste passo (NÃO COMPROVADO / a decidir)

- **N1 — Caminho de fiado:** ao finalizar com saldo pendente, o caixa pede cliente e registra o saldo como contas a receber (`pdv-importados/app/caixa/CaixaPageClient.tsx:1113-1120`, `:1184`). Isso contraria "sem fiado". Documentado no manual do operador; a correção no código não é deste PR.
- **N2 — Venda sem linha de pagamento:** o trigger D5 só dispara em `vendas_pagamentos`. Plano §9 (D4/D5) registra o risco; confirmar no E5 que a UI sempre grava linha de pagamento.
- **N3 — Tela de formas do PDV:** não foi localizada na varredura de `pdv-importados/app/gerente/configuracoes` (só CST, CFOP, regime, idioma e impressão, `pdv-importados/app/gerente/configuracoes/actions.ts:134-180`). **NÃO COMPROVADO** como se ativa/desativa uma forma. Não é pré-requisito para D5 se as quatro formas estiverem ativas por provisionamento.
- **N4 — Conta bancária inativa depois da venda:** se a conta for inativada, a função de D5 (`financeiro_conta_forma`) passa a recusar PIX e cartão na loja. Procedimento de troca de conta não documentado.
