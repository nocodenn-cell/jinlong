# Plano — teste controlado de provisionamento em produção

**Status: proposta para aprovação do dono. Não executar sem autorização específica.** Este teste cria empresa, loja e usuários reais em produção.

## Por que em produção

Homologação (`jinlong-homolog-palm`) não reproduz a configuração de produção (levantamento de 2026-10-23, somente leitura):

| Item | Produção | Homologação |
|---|---|---|
| Migrations | Até `20261022110000` (438) | Até `20261019170000` (417): faltam cobrança/trial, PIN do operador e hub comercial |
| RPCs do trial (`trial_registrar_tentativa`, `plataforma_iniciar_trial`) e schema `saas` | Existem | **Ausentes**: `/teste-gratis` não funciona |
| `pdv_config.gerente_senha_sha256` | Não existe | Existe e é `NOT NULL`: com o código atual, o provisionamento falharia |
| Tabela `perfis`; colunas de PIN em `pdv_config` | Existem | Ausentes |
| Tabelas / funções em `public` + `internal` | 128 / 403 | 91 / 288 |
| Usuários | 11 | 0 |
| App apontando para o ambiente | `app.jinlong.app` | Nenhum (e a chave `service_role` não está disponível para rodar o app contra ela) |

Já ficou provado **sem gravar nada em produção**:
- **Lado banco dos dois fluxos:** `backend/scripts/provisionamento-wizard-trial.test.sql` passa no banco representativo (`supabase/postgres:17.6.1.084` + migrations da `main`). As 4 RPCs de provisionamento e trial desse banco são byte a byte iguais às de produção (md5).
- **Produção, transação descartada:** o payload antigo de `pdv_config` falhava (`42703`) e o novo grava.
- **Ainda não provado:**
  - Supabase Auth real (`createUser`, `signUp`, e-mail de verificação, sessão);
  - captcha;
  - a interface;
  - o caminho da Vercel até o banco.

## Escopo do teste

1. **Wizard** (`/admin/provisionamento`, sessão de plataforma): 1 empresa, 1 loja, DONO + 1 GERENTE + 1 OPERADOR.
2. **Trial** (`/teste-gratis`): 1 cadastro com verificação de e-mail.

## Dados fictícios

- **Empresa:** `ZZ TESTE CONTROLADO 2026-10-XX`, sem CNPJ. Plano do trial: `BASICO`.
- **Loja:** `ZZ Loja Teste`, código gerado.
- **E-mails:** caixas que o dono controla (aliases `+teste-wizard-dono`, `+teste-wizard-gerente`, `+teste-wizard-operador`, `+teste-trial`). É preciso receber a verificação.
- **Senhas:** geradas na hora; não ficam no repositório nem em chat.

## Pré-condições

1. Backup do dia `success` e restore drill `success` (`backup-scheduled.yml` e `backup-restore-test.yml`).
2. Janela fora do horário de loja; uma pessoa acompanhando.
3. **Cobrança Asaas não ativa em produção.** Confirmar antes que o trial não gera cobrança real; se gerar, adiar.
4. Limite de e-mails do Supabase Auth: são 4 envios, dentro da cota.

## Execução e verificação

| Passo | Ação | Verificação (somente leitura, pelo SQL Editor ou MCP) |
|---|---|---|
| 1 | Wizard: criar empresa, loja e equipe | Tela mostra `validacao` toda `true`. SQL: `empresas`, `lojas`, `pdv_config` da loja, 4 `formas_pagamento` ativas, 36 itens de checklist (3 concluídos), 3 vínculos ativos |
| 2 | Login como DONO (janela anônima) | Vê só a própria loja; `/admin/implantacao` abre; nenhuma loja da Jinlong aparece |
| 3 | Login como GERENTE e como OPERADOR | GERENTE: painel da loja. OPERADOR: caixa abre com a loja certa e as 4 formas de pagamento |
| 4 | `/teste-gratis` com o e-mail de trial | Mensagem de sucesso; e-mail de verificação recebido; após confirmar, login leva a `/admin/assinatura`. SQL: empresa trial com `trial_fim` ≈ +15 dias, `pdv_config` e 4 formas criados (antes do #625 o bootstrap falhava calado) |
| 5 | Isolamento | SQL: nenhum vínculo cruzado entre a empresa teste, o trial e a Jinlong. Login de um usuário Jinlong não mostra as empresas de teste |
| 6 | Erros | `query_logs`: nenhum erro de Postgres/API/Auth no período. Vercel: nenhum erro de runtime |

**Critério de parada:** qualquer passo falhando. Parar, registrar o erro e ir para a limpeza.

## Limpeza (proposta: desativar, não apagar)

Apagar dados multi-tenant em produção é arriscado; o script `LIMPEZA_DADOS_TESTE_D0` apaga **todos** os tenants e **não** deve ser usado. Proposta:

1. Desativar: `empresas.status = 'INATIVA'`, `usuarios.ativo = false`, `usuario_vinculos.ativo = false` e os usuários de Auth banidos (Dashboard → Authentication), filtrando pelo `empresa_id` dos testes.
2. Registrar os `empresa_id`/`loja_id`/`user_id` criados no relatório do PR #630.
3. Exclusão física só com aprovação separada, num script por `empresa_id` revisado antes.

## Impactos conhecidos

- Contagem de empresas/lojas em métricas e no hub comercial (`ZZ` no nome facilita filtrar).
- 4 e-mails transacionais de Auth.
- Nenhuma migration aplicada e nenhum deploy.
