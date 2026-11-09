# Fase 3.1 — Compatibilidade código × banco de produção (2026-11-05)

**Método:** (1) extraídos os nomes de RPC chamados por `.rpc('…')` em `pdv-importados/` e `backend/supabase/functions/` (excluídos testes e `node_modules`); (2) extraídos os nomes de tabela de `.from('…')`; (3) consultados somente leitura em `kbabmewnahysfvlybiak` (`pg_proc`, `information_schema`); (4) cada objeto ausente foi ligado à migration que o cria.

**Resultado:** 135 RPCs chamadas pelo app, **6 ausentes** em produção. 80 tabelas referenciadas, **0 ausentes** (o único candidato, `salt`, é um falso positivo: `Buffer.from('salt')` em teste).

---

## 1. RPCs ausentes em produção

| RPC | Chamada em | Criada por | Classificação | Efeito |
|---|---|---|---|---|
| `fp_token_gerente_vale_na_loja` | `backend/supabase/functions/sync-outbox/index.ts` (linha 760) | `20261028120100` (pendente) | **Bloqueia operação** | Venda offline do dispositivo com desconto de gerente é recusada (`GERENTE_TOKEN_INVALIDO_OU_REVOGADO`). Ver `FASE3_1_PENDENCIAS_TECNICAS.md`, seção 3 |
| `fp_sou_dono_da_empresa` | `app/admin/assinatura/actions.ts` (linha 47), `gateDono` | `20261028101000` (pendente) | **Quebra funcionalidade secundária** | Página de assinatura: DONO não consegue gerenciar. A mensagem "Somente o DONO gerencia a assinatura" é **falsa** para um DONO real |
| `cobranca_reservar_assinar` | `app/admin/assinatura/actions.ts` (linha 139) | `20261028101000` (pendente) | Quebra funcionalidade secundária | Só é alcançada depois de `gateDono`. Sem ela, nenhuma assinatura é criada no Asaas (idempotência) |
| `cobranca_liberar_assinar` | `app/admin/assinatura/actions.ts` | `20261028101000` (pendente) | Quebra funcionalidade secundária | Liberação do lock de assinatura |
| `commercial_solicitar_contratacao` | `app/admin/assinatura/actions.ts` (linha 102) | `20261023130000` (**GROWTH-001, adiada no manifesto**) | **Bloqueia operação** (contratação) | Com autoatendimento desligado (padrão), é o **único** caminho de contratação do DONO. Hoje não há contratação funcionando em produção |
| `commercial_trial_garantir_lead` | `app/teste-gratis/actions.ts` (linha 81) | `20261023130000` (GROWTH-001) | Quebra funcionalidade secundária | Registro do lead do teste grátis. A chamada não verifica `error`, então a falha é silenciosa |

### 1.1 Risco de segurança

Nenhuma das seis ausências abre acesso: são RPCs que **não existem**, então o comportamento é fail-closed. O risco está na direção inversa: o **código novo assume regras que a produção não tem**. Exemplos:

- `sync-outbox` trata o token de dispositivo como válido só se a RPC nova existir. Sem ela, a venda é recusada (seguro, mas quebra o PDV offline).
- `fp_token_gerente_vale_na_loja` deve ser o caminho que impede token de outra empresa. Em produção, o caminho antigo (`internal.token_gerente_fora_da_loja`, versão de `20260916120000`) não considera empresa do emissor (vazamento entre tenants, já documentado em `20261028100000`). Com 1 empresa, não é explorável hoje.

### 1.2 Página de assinatura e provisionamento (atenção especial)

**Assinatura do DONO**
- Leitura: `fp_minha_assinatura` existe e funciona.
- Gestão: bloqueada por `fp_sou_dono_da_empresa` ausente. `podeGerenciar` fica `false`.
- Contratação: bloqueada por `commercial_solicitar_contratacao` ausente (GROWTH-001 adiada). O autoatendimento está desligado por padrão (`lib/cobranca/autoatendimento.ts`).
- **Resultado para o cliente:** o DONO vê a assinatura, não consegue alterá-la nem contratar. Hoje não há uma ação que funcione.

**Provisionamento**
- `plataforma_provisionar_empresa` existe em produção (versão aberta, antes da 121000). Nenhuma RPC de provisionamento está ausente.
- `plataforma_iniciar_trial` existe em produção. Ao aplicar a 121000, ele passa a ser bloqueado pelo interruptor, o que deve ser comunicado.
- O código do admin de provisionamento (`app/admin/provisionamento/`) usa a RPC atual; nenhuma função nova é chamada.

---

## 2. Tabelas e colunas introduzidas pelas migrations pendentes

| Objeto | Migration | Usado pelo app | Classificação |
|---|---|---|---|
| `saas.assinar_locks`, `saas.webhook_eventos` (colunas) | `20261028101000` | Sim (`cobranca_*`) | Já coberto pelas RPCs acima |
| `saas.assinaturas.plano_pendente`, `addons_pendentes`, `qtd_lojas_pendente` | `20261028101000` | **Não** encontrado em código fora de SQL | Funcionalidade ainda não utilizada pelo app |
| `internal.tokens_revogacao_log` | `20261028120100` | Não | Auditoria, não usado pelo app |
| `tokens_desconto_gerente` e `tokens_autorizacao_operacao`: colunas e índices | `20261028120100` | Indireto (via RPCs) | Coberto por `fp_token_gerente_vale_na_loja` |
| `internal.provisionamento_contingencia_log` | `20261028121000` | Não | Auditoria da contingência |
| `saas.parametros` (chave `provisionamento_automatico`) | `20261028121000` | Não diretamente | Interruptor do provisionamento |
| `importacoes_nfe_itens.valor_unitario_documento`, `valor_total_documento`, `fator_conversao` | `20261030130000` | **Não** encontrado no app | Funcionalidade ainda não utilizada, mas a 130000 depende delas |
| `importacoes_nfe_itens.quantidade_estoque` | `20261030140000` | Há ocorrências em módulos de importação (`app/admin/importacoes/`) que não foram confirmadas como sendo desta tabela | **Não verificado**: confirmar antes da 140000 |
| `movimentos_estoque_log.transferencia_id` | `20261029155000` | **Não** | Funcionalidade ainda não utilizada |

**Nota:** `idempotency_key` aparece em 21 arquivos, mas como **parâmetro** de RPC (`p_idempotency_key`), não como coluna. Não é um objeto ausente.

---

## 3. Resumo por classificação

| Classificação | Itens |
|---|---|
| **Bloqueia operação** | `fp_token_gerente_vale_na_loja` (PDV offline com desconto); `commercial_solicitar_contratacao` (contratação) |
| **Quebra funcionalidade secundária** | `fp_sou_dono_da_empresa`, `cobranca_reservar_assinar`, `cobranca_liberar_assinar` (gestão de assinatura); `commercial_trial_garantir_lead` (lead do teste grátis, falha silenciosa) |
| **Risco de segurança (código espera regra que não existe)** | Caminho antigo de token entre empresas; contratação e gestão de assinatura sem a validação de DONO por empresa |
| **Funcionalidade ainda não utilizada** | Colunas `*_pendente` da cobrança; colunas NF-e 130000/140000 (exceto a dependência da própria migration); `transferencia_id` |

---

## 4. Limite desta verificação

- Foram comparados **nomes**, não assinaturas (argumentos e tipos) nem corpos. Uma RPC pode existir com assinatura diferente. Não foi feita essa comparação nesta etapa.
- Chamadas construídas dinamicamente (nome em variável) não aparecem na extração.
- Tabelas não foram comparadas coluna a coluna, salvo as listadas na seção 2.
