# Recuperação de acesso após revogação de tokens (tranche 20261028120100)

**Status:** procedimento validado em banco descartável (`backend/scripts/recuperacao-acesso-tokens.test.sql`, PASSOU).
**Aplicação em produção:** só depois da autorização do dono e da aplicação da tranche (ver `TRANCHE_SEGURANCA_MIGRATIONS_2026-11-05.md`).

## 1. O que revoga um token

A partir da `20261028120100`, um token de desconto ou de autorização pendente é **revogado** (marcado `usado = true`, `revogado_em`, motivo e trilha em `internal.tokens_revogacao_log`) quando:

| Evento | Revoga |
|---|---|
| Usuário inativado (`usuarios.ativo = false`) | todos os tokens pendentes em que ele é **emissor**, **aprovador**, **gerente** ou **solicitante** |
| Perfil alterado (`usuarios.perfil`) | idem |
| Vínculo desativado ou removido (`usuario_vinculos`) | tokens pendentes ligados à empresa/loja daquele vínculo |

**Irreversível por SQL:** reativar o usuário **não** devolve um token revogado. Isso foi testado (`REC-3`).

## 2. Impacto por papel

| Papel | Efeito imediato | Como recupera |
|---|---|---|
| **Gerente** (aprovador) | Tokens pendentes que ele aprovou param de valer. | Reativação do usuário, se foi inativado por engano. Depois, ele aprova **novos** tokens normalmente. |
| **Operador** (emissor) | Tokens pendentes dele param. Ao voltar a operar, precisa de um token novo aprovado pelo gerente. | Reativação e novo token. |
| **DONO** | Mesmo efeito dos gerentes, para tokens em que é aprovador. | Idem. |

## 3. Procedimento de recuperação (passo a passo)

### 3.1 Confirmar o motivo antes de reativar
1. Quem inativou o usuário, quando, e por quê. Consultar `internal.tokens_revogacao_log` (motivo e quantidade).
2. Se foi inativação por engano, reativar o usuário. Se foi desligamento, **não** reativar.

### 3.2 Gerente volta a aprovar (na loja)
1. Gerente ativo e vinculado à loja.
2. No PDV, o operador pede desconto; o gerente informa a senha no fluxo de autorização (`validar-gerente`, Edge Function). A Edge Function grava um **novo** token.
3. Teste de conferência: o desconto aprovado precisa ser aceito na venda. Se recusado com `GERENTE_TOKEN_INVALIDO_OU_REVOGADO` ou `TOKEN_GERENTE_REVOGADO`, o problema é o vínculo do gerente, não o token novo.

### 3.3 Operador volta a operar
1. Operador ativo, com vínculo ativo na loja.
2. Abrir caixa normalmente (novo caixa ou retomada conforme o fluxo do PDV).
3. Vendas que exigem desconto ou sangria pedem token novo.

## 4. Sincronização offline (PDV)

O PDV grava as vendas localmente (`pdv-local`, tabela `outbox`) e envia ao servidor (`sync-outbox`). Comportamento verificado no código:

- Uma venda com token **revogado** é recusada pelo servidor com `GERENTE_TOKEN_INVALIDO_OU_REVOGADO` (`sync-outbox/index.ts`).
- O dispositivo tenta de novo com espera crescente (15 s, dobrando, até 1 h). Após **12 falhas consecutivas** (`OUTBOX_MAX_SYNC_FAILURES`, padrão 12), o item vai para **ERRO** (fila de falhas).
- **"Reprocessar fila de falhas" não resolve esse caso**: reenvia o mesmo payload com o mesmo token revogado, que volta a falhar.

### 4.1 Verificação (antes de qualquer alteração)
No PDV, na tela de sincronização (resumo da outbox): anotar **PENDENTE** e **ERRO**. Em cada item de ERRO, conferir `last_error`.

### 4.2 Tratamento
- **Itens PENDENTE:** nada a fazer. Com o token ainda válido, o envio funciona. Se o token foi revogado, os itens chegam a ERRO em algumas horas.
- **Itens ERRO com `GERENTE_TOKEN_INVALIDO_OU_REVOGADO`:** a venda **já foi feita no caixa**, mas não existe no servidor. Não há reprocessamento automático que resolva. Opções, nesta ordem:
  1. Gerente **re-aprova o desconto** e a venda é reenviada com o novo token (**requer suporte no PDV; não existe hoje**). Até lá, não usar.
  2. Registro **manual** no servidor, com autorização do DONO, dupla conferência e trilha (padrão da contingência em `docs/PROVISIONAMENTO_CONTINGENCIA.md`).
- Registrar cada caso com: loja, caixa, número da venda local, valor, desconto aplicado, token revogado e decisão.

## 5. Teste de validação

`backend/scripts/recuperacao-acesso-tokens.test.sql` cobre:

| Caso | Verifica |
|---|---|
| REC-1 | token válido vale na loja |
| REC-2 | inativar gerente revoga o token, marca como usado e grava trilha |
| REC-3 | reativar gerente **não** ressuscita o token revogado |
| REC-4 | gerente reativado aprova token novo, que vale |
| REC-5 | papel `authenticated` **não consegue reabrir** token consumido (0 linhas) |
| REC-6 | operador inativado revoga o token pendente; reativado emite token novo e volta a operar |
| REC-7 | a regra que o sync usa recusa token revogado |

Resultado registrado em `TRANCHE_VALIDACAO_2026-11-05.md`.

## 6. Limitações

- Não há, no PDV, reenvio de venda com token novo. Até existir, vendas em ERRO com token revogado exigem decisão manual do DONO.
- O procedimento não recupera tokens revogados. Ele recupera o **acesso** de pessoas, não os tokens.
- A validação foi feita com o banco descartável e a regra de servidor. Não há teste de ponta a ponta com um dispositivo real.
