# Provisionamento de empresas: procedimento de CONTINGÊNCIA (manual)

> Status: **vigente enquanto o hub comercial não estiver homologado.**
> Decisão do dono (28/10/2026): o hub comercial é o ponto **oficial** de provisionamento. O teste grátis usará o
> mesmo mecanismo. O app das lojas **não** cria empresas. Enquanto o hub não for homologado, o provisionamento
> **automático fica bloqueado**. O procedimento manual abaixo existe **só como contingência**, com documentação e
> controle. Não se criam mecanismos de provisionamento independentes.

## 1. Como o bloqueio funciona

| Camada | Controle | Padrão |
|---|---|---|
| Banco | `public.plataforma_provisionar_empresa(jsonb, uuid)` é uma porta *fail closed*. O núcleo transacional fica em `internal.plataforma_provisionar_empresa_nucleo`, sem `EXECUTE` para `anon`, `authenticated` ou `service_role`. | **bloqueado** (`saas.parametros.provisionamento_automatico = 'bloqueado'`) |
| Banco | `public.plataforma_iniciar_trial` (teste grátis) chama a mesma porta e fica bloqueado pelo mesmo interruptor. | bloqueado |
| App (`pdv-importados`) | `app/teste-gratis/actions.ts` recusa antes de criar qualquer usuário no Auth, a menos que `PROVISIONAMENTO_AUTOMATICO_HABILITADO=true` (exatamente). | bloqueado (variável ausente) |
| App (`pdv-importados`) | O assistente `/admin/provisionamento` está fechado: `requireAdminSession` sempre falha depois do corte do ADMIN (#623). | fechado |
| Hub | Não há função de provisionamento no hub ainda. | n/a |

Migration: `backend/supabase/migrations/20261028121000_provisionamento_automatico_bloqueado.sql`. Rollback em
`backend/supabase/rollback/`.

Erros que você pode ver:
- `PROVISIONAMENTO_AUTOMATICO_BLOQUEADO`: caminho automático, fora da contingência.
- `PROVISIONAMENTO_CONTINGENCIA_SEM_RESPONSAVEL`: o chamado foi informado sem o responsável.

## 2. Quem pode executar

- **Somente** quem tem sessão SQL direta no banco como `postgres`, isto é, o SQL Editor do Supabase ou `psql` com a
  senha do banco. Na prática são **os responsáveis técnicos da plataforma, autorizados pelo dono**.
- Não dá para executar pela API (PostgREST/Edge Functions). Esses caminhos não conseguem fazer
  `SET LOCAL fp.provisionamento_*`, e `anon` e `authenticated` não têm `EXECUTE`.
- **Produção exige autorização expressa do dono para cada execução.** Registre a autorização no chamado.
- Vale o princípio dos 4 olhos: uma pessoa executa e outra revisa o payload e o resultado.

## 3. Pré-requisitos (checklist)

1. Há um chamado aberto (ex.: `CHAMADO-2026-0123`) com: razão social, CNPJ (se houver), nome da loja ou lojas,
   e nome e e-mail do DONO.
2. O chamado registra a autorização do dono, com data e hora (Brasília) e canal.
3. O usuário DONO já foi criado no **Supabase Auth** (Dashboard → Authentication → Add user, convite por e-mail)
   e você tem o `id` (uuid) dele.
4. O DONO **não** pertence a outra empresa. O núcleo recusa com `TRIAL_USUARIO_JA_EXISTE` ou com o erro do vínculo.
5. Há backup recente do banco (PITR ou dump), com o horário anotado no chamado.

## 4. Execução (uma transação, com trilha de auditoria)

```sql
BEGIN;
-- Identificação obrigatória: sem as duas, a porta recusa.
SET LOCAL fp.provisionamento_contingencia = 'CHAMADO-2026-0123';
SET LOCAL fp.provisionamento_responsavel  = 'Nome Sobrenome <email@dominio>';

SELECT public.plataforma_provisionar_empresa($json$
{
  "empresa":  { "nome": "Razão Social da Empresa" },
  "lojas":    [ { "chave": "l1", "nome": "Matriz" } ],
  "usuarios": [ { "id": "<uuid do DONO no Auth>", "nome": "Nome do Dono", "papel": "DONO" } ]
}
$json$::jsonb, NULL);

-- Conferência ANTES do COMMIT (o revisor confere):
SELECT id, chamado, responsavel, executado_por, papel_jwt, payload_sha256, empresa_nome, resultado, em
  FROM internal.provisionamento_contingencia_log ORDER BY id DESC LIMIT 1;
SELECT v.usuario_id, v.empresa_id, v.loja_id, v.papel, v.ativo
  FROM public.usuario_vinculos v WHERE v.usuario_id = '<uuid do DONO no Auth>';

COMMIT;   -- ou ROLLBACK se algo divergir
```

Se der erro, a transação inteira é desfeita, porque o núcleo é atômico. Nada fica pela metade.

## 5. Trilha de auditoria

Cada execução de contingência grava uma linha em `internal.provisionamento_contingencia_log`:

| coluna | conteúdo |
|---|---|
| `chamado` | valor de `fp.provisionamento_contingencia` |
| `responsavel` | valor de `fp.provisionamento_responsavel` |
| `executado_por` | `session_user`, o usuário real da sessão SQL, e não o dono da função |
| `papel_jwt` | papel JWT da requisição, se houver (esperado: nulo, porque é sessão SQL direta) |
| `payload_sha256` | hash SHA-256 do payload. Anexe o payload ao chamado para conferência |
| `empresa_nome`, `resultado` | empresa criada e retorno do núcleo (ids de empresa, lojas e vínculos) |
| `em` | data e hora (UTC no banco; converta para Brasília no chamado) |

O log fica no schema `internal`, sem acesso por `PUBLIC`. Ele não é apagado no rollback da migration.

Depois do COMMIT:
1. Cole no chamado a linha do log, o `payload_sha256` e o resultado.
2. O revisor confere se a empresa, as lojas e o vínculo DONO batem com o pedido.
3. Envie o convite ou a senha inicial ao DONO pelo canal oficial.

## 6. Controles e proibições

- **Não** mude `saas.parametros.provisionamento_automatico` para `habilitado` e **não** defina
  `PROVISIONAMENTO_AUTOMATICO_HABILITADO=true` antes da homologação do hub. Essas mudanças exigem decisão
  registrada do dono.
- **Não** crie empresas, lojas ou vínculos com `INSERT` manual. Use apenas a porta acima, que é atômica e registra
  a trilha.
- **Não** use contas de outra empresa como DONO.
- Revise o log mensalmente: toda linha precisa ter um chamado correspondente.

## 7. Saída da contingência (quando o hub for homologado)

1. O hub passa a chamar a mesma porta. O teste grátis também.
2. Com decisão registrada do dono, faça
   `UPDATE saas.parametros SET valor = 'habilitado' WHERE chave = 'provisionamento_automatico';` e defina
   `PROVISIONAMENTO_AUTOMATICO_HABILITADO=true` no ambiente do app, se o teste grátis continuar no app.
3. Atualize este documento.
