# Playbook de rollback e suporte — primeiro cliente (F6)

**Data:** 2026-11-07 · **Plano:** `docs/auditorias/PLANO_LIBERACAO_PRIMEIRO_CLIENTE_2026-11-06.md` (fase F, PR F6)
**Escopo:** web · loja única · sem fiscal · sem fiado.
**Status:** documento de procedimento. **Nenhum rollback foi executado em produção ou homologação.** Os rollbacks abaixo foram ensaiados em cópia descartável (`d16_rb`, plano §9, "Validação com Docker", 2026-11-07).

**Não incluir** neste arquivo telefones, e-mails, nomes de pessoas de contato ou credenciais. Os campos `[ ... ]` são preenchidos fora do repositório.

---

## 1. Ordem de rollback

Ordem do plano: **D2 → D5 → D4 → D3 → D1** (ordem inversa à de aplicação). É a sequência ensaiada em 2026-11-07 (plano §9). O plano não justifica a ordem item a item; D4 é o único que reescreve uma função (o wrapper de finalização), e os demais são triggers.

| Ordem | Migration | Arquivo de rollback | O que desfaz | Efeito colateral |
|---|---|---|---|---|
| 1 | D2 `20261107120000` | `backend/supabase/rollback/20261107120000_d2_estorno_dinheiro_caixa_aberto.rollback.sql` | Remove os triggers de `devolucoes` e as funções de estorno ao caixa aberto | Volta a debitar estorno do caixa da venda, mesmo fechado (P0-9, S9b/S12) |
| 2 | D5 `20261107110000` | `backend/supabase/rollback/20261107110000_d5_pagamento_exige_conta_financeira.rollback.sql` | Remove o trigger que exige conta financeira para PIX/cartão | **PIX e cartão voltam a gerar recebível PENDENTE sem conta** (P0-5). Não é rollback neutro |
| 3 | D4 `20261107100000` | `backend/supabase/rollback/20261107100000_d4_valor_recebido_troco.rollback.sql` | Remove colunas `valor_recebido` e `troco` e restaura o wrapper de `finalizar_venda_transacional_canonica_v4` | **Perde os valores de troco e valor recebido já gravados** (ver §4.3) |
| 4 | D3 `20261106110000` | `backend/supabase/rollback/20261106110000_d3_quantidade_inteira_produto_un.rollback.sql` | Remove o trigger de quantidade inteira em produto UN | Volta a aceitar fração em UN (P0-8) |
| 5 | D1 `20261106100000` | `backend/supabase/rollback/20261106100000_d1_fechamento_bloqueia_vendas_em_espera.rollback.sql` | Remove o trigger que bloqueia o fechamento com venda em espera | Volta a permitir fechar com venda `EM_ESPERA` (P0-6) |

Rollback **de segurança** (não entra nesta sequência, só com decisão do responsável): `backend/supabase/rollback/20261104120000_sec_anon_privilegios_minimos.rollback.sql`. Ele **reintroduz o vazamento** de `v_vendas_dia`, `v_top_produtos` e `v_venda_consistencia_anomalias` (cabeçalho do próprio arquivo). Preferir correção para frente.

---

## 2. Quando agir: sintoma → causa → ação

Antes de qualquer rollback, o caminho preferido é **corrigir a configuração**. A tabela aponta a migration relacionada.

| Sintoma relatado pelo operador | Migration | Esperado? | Ação |
|---|---|---|---|
| "Venda não finaliza no PIX / cartão" | D5 | Sim, se a loja não tem conta vinculada | Configurar conta e vínculo (`INSTALACAO_CONTAS_FINANCEIRAS_FORMAS_PAGAMENTO.md` §2). **Não** fazer rollback de D5 para contornar. |
| "Não consigo fechar o caixa; mensagem de venda em espera" | D1 | Sim | Finalizar ou colocar em espera e devolver as vendas em espera do turno. Ver `pdv-importados/app/caixa/server/caixaErroOperador.ts:140-142` (mensagem mapeada). |
| "Quantidade fracionada recusada em produto" | D3 | Sim, se o produto é `UN` | Corrigir `unidade_medida` do produto (balança: KG, G, L, M etc.). |
| "Cancelamento recusado: caixa ambíguo ou sem caixa aberto" | D2 | Sim (limitação conhecida) | Deixar **um** caixa aberto antes de cancelar venda de caixa fechado. Ver plano, "Ressalvas" de D2. |
| "Troco errado ou valor recebido não aparece" | D4 | Verificar | Conferir o valor da linha de dinheiro e `valor_recebido` (ver §3.5). Não fazer rollback de D4 sem snapshot (§4.3). |
| "Erro genérico ao finalizar" (qualquer forma) | — | Não | Coletar dados (§5) e suspender vendas se houver risco (§4.1). Não aplicar rollback sem diagnóstico. |

---

## 3. Pré-checagens (somente leitura)

Executar antes de aplicar uma migration ou quando houver suspeita. **Nenhuma destas consultas foi executada em produção.**

### 3.1 D3 — itens fracionados em produto UN

Copiada do cabeçalho de `backend/supabase/migrations/20261106110000_d3_quantidade_inteira_produto_un.sql`:

```sql
SELECT iv.id, iv.venda_id, p.nome, iv.quantidade
FROM public.itens_venda iv JOIN public.produtos p ON p.id = iv.produto_id
WHERE p.unidade_medida = 'UN' AND iv.quantidade <> trunc(iv.quantidade);
```

Resultado esperado antes de aplicar: **0 linhas**. Com linhas, corrigir o cadastro da unidade antes do deploy. Em cópia local de 2026-11-07: 0 linhas.

### 3.2 D5 — lojas que vendem PIX ou cartão sem conta ativa

Consulta de apoio (plano §9 pede essa pré-checagem; a query é a versão deste playbook, validar a sintaxe no banco antes de usar):

```sql
SELECT DISTINCT c.loja_id
FROM public.vendas_pagamentos vp
JOIN public.vendas v ON v.id = vp.venda_id
JOIN public.caixas c ON c.id = v.caixa_id
WHERE vp.forma_pagamento IN ('PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO')
  AND NOT EXISTS (
    SELECT 1
    FROM public.financeiro_contas_forma f
    JOIN public.contas_financeiras cf ON cf.id = f.conta_financeira_id
    WHERE f.loja_id = c.loja_id
      AND f.forma_pagamento = vp.forma_pagamento
      AND cf.ativo
      AND cf.loja_id = c.loja_id
  );
```

Em homologação local (2026-11-07): 1 loja, dados de teste. **Produção: NÃO TESTADO** (exige autorização).

### 3.3 D6 — preço de atacado sem gatilho

Do plano §9 (D6):

```sql
SELECT id, nome FROM produtos
WHERE preco_atacado IS NOT NULL AND quantidade_gatilho_atacado IS NULL;
```

Resultado: produtos afetados. A venda ignora o preço de atacado nesses produtos até a edição. Corrigir o cadastro. Em homologação local: 0 linhas.

### 3.4 D1 — vendas em espera abertas

Coluna e valor vêm de `backend/supabase/migrations/20261106100000_d1_fechamento_bloqueia_vendas_em_espera.sql:24-25`:

```sql
SELECT v.* FROM public.vendas_em_espera v WHERE v.status = 'EM_ESPERA';
```

Usar antes do fechamento do turno, para saber quais vendas precisam ser finalizadas ou devolvidas.

### 3.5 D4 — valores de troco e recebido já gravados

```sql
SELECT id, venda_id, forma_pagamento, valor, valor_recebido, troco
FROM public.vendas_pagamentos
WHERE valor_recebido IS NOT NULL OR troco IS NOT NULL;
```

Usar como snapshot antes de qualquer rollback de D4 (§4.3).

---

## 4. Procedimento de rollback

### 4.1 Passo 0 — conter

1. Registrar: hora (Brasília), loja, caixa, sintoma, quem reportou (nome do cargo; sem dados pessoais do cliente).
2. **Suspender vendas da loja** se o problema puder gerar venda errada: configuração `vendas_suspensas = 'true'`, tela **Suspensão** em `/admin/suspensao` (`backend/supabase/migrations/105_suspensao_vendas.sql`; a finalização respeita essa flag em `pdv-importados/app/caixa/CaixaPageClient.tsx:1094-1096`). Reativar depois do rollback ou da correção.
3. Não tentar "corrigir" dados diretamente no banco sem decisão do responsável.

### 4.2 Passo 1 — backup e autorização

1. Backup lógico antes de qualquer migration, conforme `docs/ops/BACKUP_RESTAURACAO_SEM_PITR.md` §2. **Obrigatório** antes do rollback em produção.
2. Autorização do dono registrada no chamado.

### 4.3 Passo 2 — snapshot dos dados que o rollback apaga

- **D4**: executar a consulta §3.5 e guardar o resultado em arquivo fora do repositório. O rollback remove as colunas `valor_recebido` e `troco` (`20261107100000_d4_valor_recebido_troco.rollback.sql`, `DROP COLUMN`). Sem snapshot, esses dados **não voltam**.
- **D2**: estornos já gravados permanecem. Anotar as devoluções de caixa fechado do período (tabela `devolucoes`).
- **D5**: não apaga dados. Anotar as vendas PIX/cartão feitas durante a vigência (para conciliação).

### 4.4 Passo 3 — ensaio

Repetir o rollback em cópia descartável do banco antes de produção. O ensaio de 2026-11-07 (`d16_rb`) passou para a sequência D2 → D5 → D4 → D3 → D1, com a diferença de fim de linha CRLF no wrapper de D4.

### 4.5 Passo 4 — executar (em ordem, uma migration por vez)

Para cada item da §1, na ordem:

1. Executar o arquivo de rollback, com `psql -v ON_ERROR_STOP=1` ou no SQL Editor com transação.
2. Conferir os triggers removidos:

```sql
SELECT tgname, tgrelid::regclass
FROM pg_trigger
WHERE tgname IN (
  'trg_devolucoes_caixa_desembolso_ai',
  'trg_devolucoes_caixa_desembolso_bi',
  'trg_vendas_pagamentos_exige_conta',
  'trg_vendas_pagamentos_valor_recebido',
  'trg_itens_venda_quantidade_inteira_un',
  'trg_caixas_bloqueia_fechamento_em_espera'
) AND NOT tgisinternal;
```

Resultado esperado após remover um item: a linha correspondente **não** aparece. Os nomes vêm dos arquivos de rollback e das migrations.

3. Conferir a função de D4 (`finalizar_venda_transacional_canonica_v4`) com o corpo original, se o rollback de D4 foi executado. O ensaio confirmou idêntica a menos do CRLF.

### 4.6 Passo 5 — verificar e reabrir

1. Venda de teste em dinheiro, PIX (se houver conta) e cartão.
2. Fechamento de caixa de teste.
3. Reativar vendas (`vendas_suspensas = 'false'`).
4. Registrar no ops log o que foi feito, com a sequência, horários e quem executou.

---

## 5. Suporte

### 5.1 Canais

- Operador → gerente da loja (primeiro nível).
- Gerente → suporte: `[CONTATO DO SUPORTE — preencher fora do repositório]`, horário `[HORÁRIO — a definir]`.
- Decisão de rollback e de produção: `[CONTATO DO DONO — preencher fora do repositório]`.

### 5.2 O que coletar (sem dados sensíveis)

- Loja, caixa, data e hora (Brasília).
- Mensagem exibida na tela (texto exato).
- Forma de pagamento e se havia cliente selecionado.
- Foto da tela **sem** dados de cliente, CPF ou PIN.
- Logs: a mensagem genérica de erro gera um registro no servidor `caixa.erro_operador.fallback` com o detalhe técnico (`pdv-importados/app/caixa/server/caixaErroOperador.ts:108-121`). O erro de RPC de finalização vai para o Sentry com a tag `caixa.finalizar_venda.rpc_error` (`pdv-importados/app/caixa/server/caixaVendas.impl.ts:334-342`).

**Nunca pedir** senha, PIN, token ou chave de API por mensagem.

### 5.3 Códigos de erro e tratamento

| Código (detalhe técnico) | Tela do operador | Tratamento |
|---|---|---|
| `PAGAMENTO_SEM_CONTA_FINANCEIRA` | Mensagem genérica (L-F3) | Configurar conta da forma (F2 §2). |
| `FECHAR_CAIXA_VENDAS_EM_ESPERA` | Mensagem mapeada (`caixaErroOperador.ts:140-142`) | Resolver vendas em espera do turno. |
| `CANCELAR_VENDA_CAIXA_ABERTO_AMBIGUO` | Mensagem genérica | Deixar um só caixa aberto e repetir. |
| `CANCELAR_VENDA_CAIXA_FECHADO_SEM_CAIXA_ABERTO` | Mensagem genérica | Abrir um caixa e repetir. |
| `CANCELAR_VENDA_SALDO_CAIXA_INSUFICIENTE` | Mensagem mapeada (`caixaErroOperador.ts:151-152`) | Conferir o saldo do caixa aberto. |
| `GERENTE_TOKEN_INVALIDO_OU_REVOGADO` (sync do PDV local) | — | Ver `docs/ops/RECUPERACAO_ACESSO_TOKENS.md` §4. |

Códigos dos arquivos: `backend/supabase/migrations/20261107110000_d5...sql:29`, `20261106100000_d1...sql:33`, `20261107120000_d2...sql` (cabeçalho, `CANCELAR_VENDA_*`).

### 5.4 Vendas em PDV local (`pdv-local`) — fora do escopo

Se o cliente usar o app desktop, usar `docs/ops/RECUPERACAO_ACESSO_TOKENS.md` §4 para itens em ERRO na outbox. **NÃO COMPROVADO** que o cliente não usa o desktop.

---

## 6. Recuperação de acesso

- Usuário desativado por engano: ver `docs/ops/RECUPERACAO_ACESSO_TOKENS.md` §3.1 e §1 (reativar **não** devolve tokens revogados).
- Senha esquecida: `/auth/esqueci-senha` (envio de e-mail **NÃO COMPROVADO**).
- PIN bloqueado: gerente desbloqueia pelo botão "Desbloquear" na tela Funcionários (ver `INSTALACAO_USUARIOS_PIN_TROCA_OPERADOR.md` §3.4).

---

## 7. Lacunas do playbook

- **P-1** — Backup e restauração em produção não comprovados (plano P0-3). Sem isso, rollback em produção é de risco não medido.
- **P-2** — Sem registro de quem aplicou os rollbacks em produção (não há ferramenta de auditoria de migrations neste playbook).
- **P-3** — Consultas da §3 não rodadas em produção (nem a de D5, que é a de maior risco).
- **P-4** — Contatos e horário de suporte não definidos no repositório (intencional; preencher fora dele).
- **P-5** — Mensagens genéricas para erros de D2 e D5 (ver `INSTALACAO_PRIMEIRO_CLIENTE_CHECKLIST.md` L-F3).
- **P-6** — Não há procedimento escrito para reverter `vendas_suspensas` por falha. A flag é ligada e desligada na tela de suspensão, mas o fluxo de reativação não foi testado (**NÃO COMPROVADO**).
