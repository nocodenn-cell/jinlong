# produtos_custos: proposta de corre��o e gate de valida��o

Data: 2026-10-13. Base: main `072f130b9c2792e3c5be364771238e7a43fd8177`.
Estado: implementa��o preparada; valida��o integrada BLOCKED; sprint n�o conclu�da.
Produ��o n�o foi consultada nem alterada nesta execu��o. O diagn�stico fornecido pelo respons�vel � a refer�ncia de produ��o.

## Causa raiz e depend�ncias

`20261009180000_protege_preco_custo_operador.sql` criou a view com `security_invoker=off` deliberadamente. A fase B (`20261009180001`) revogou SELECT de tabela e concedeu apenas colunas sem custo, pois OPERADOR e GERENTE compartilham o papel PostgreSQL authenticated. RLS filtra linhas, sem distinguir colunas por perfil. Trocar apenas a op��o para invoker impede tamb�m o acesso gerencial por falta de privil�gio nas colunas sens�veis.

O alerta indica uma fronteira privilegiada que precisa ser revisada; n�o demonstra, por si s�, explora��o. Nesta execu��o n�o houve acesso indevido demonstrado. A defini��o existente exige uid correspondente a usu�rio ativo GERENTE/DONO/ADMIN e permite ADMIN global ou loja do pr�prio usu�rio. DONO global em outras pol�ticas hist�ricas n�o autoriza ampliar esta view.

Depend�ncias de aplica��o: `lib/gerente/produtos/custosProdutos.ts`, `app/admin/produtos/productReader.ts`, `app/caixa/server/caixaConsultaRapida.impl.ts`, `app/gerente/estoque/importar-nfe/actions.ts`. O helper l� a view, preserva custos nulos por falta de autoriza��o e lan�a erro real de permiss�o, evitando sobrescrever custo por sil�ncio.

Quatro RPCs invoker passaram a juntar a view na fase A: `dashboard_gerente_resumo`, `relatorio_margem_por_venda_periodo`, `relatorio_produtos_sem_giro_periodo` e `relatorio_resumo_executivo_periodo`. A fase A tamb�m protegeu system_alerts e criou `pdv_registrar_alertas_margem_venda`, privilegiada e sem retorno de custo ao operador. Nenhuma dessas fun��es � alterada aqui.

As policies de produtos de `20260816140000` usam `auth_usuario_eh_admin`, `auth_usuario_loja_id` e `auth_usuario_gerencial_loja`; a leitura atende o cat�logo da loja e a escrita � gerencial. A policy de usuarios de `20260731202000` permite leitura gerencial da loja. Introspec��o de privil�gios/RLS vigentes no banco isolado permanece pendente; os arquivos n�o comprovam o estado aplicado.

## Corre��o proposta

Migration: `20261013080436_produtos_custos_security_invoker.sql`.

1. Aborta se authenticated ainda conseguir ler alguma coluna de custo diretamente (pr�-requisito N1 fase B).
2. Obt�m a consulta existente com pg_get_viewdef, qualificando rela��es com search_path pg_catalog. Transfere essa consulta sem copiar ou reescrever sua autoriza��o para uma fun��o SQL STABLE SECURITY DEFINER em `jinlong_security`.
3. Mant�m propriet�rio postgres, search_path restrito e EXECUTE somente para authenticated/service_role. PUBLIC/anon n�o t�m EXECUTE nem USAGE no schema privado. A fun��o n�o aceita par�metros nem SQL din�mico de usu�rio.
4. A view p�blica passa a invoker sobre a fun��o; nomes, ordem e tipos/typmods de suas quatro colunas s�o preservados pelos casts derivados do cat�logo. CREATE OR REPLACE preserva sua identidade e depend�ncias. Nenhum GRANT � adicionado �s tabelas.

Trade-off: a necessidade de leitura privilegiada continua, agora numa fun��o privada explicitamente autorizada, em vez de uma view privilegiada. Isso n�o substitui testes de autoriza��o nem elimina todos os poss�veis alertas do Advisor. Conferir que `jinlong_security` n�o � schema exposto da API; no config local somente public/graphql_public s�o expostos. O schema privado n�o depende de RLS para suas tabelas, pois nenhuma tabela foi criada.

Uma view invoker diretamente sobre produtos exigiria devolver SELECT das colunas sens�veis ao papel compartilhado, contrariando a prote��o N1. N�o foi escolhida. A fun��o preserva a consulta vigente, inclusive eventual drift: comparar sua prosrc com a defini��o auditada antes de liberar aplica��o em produ��o. N�o presumir que o SQL do reposit�rio prova as regras do banco remoto.

## Evid�ncias e testes

| Verifica��o | Resultado nesta execu��o | Evid�ncia |
|---|---|---|
| Base main verificada | PASS | origin/main e conector GitHub: 072f130b |
| Sequ�ncia de migrations | PASS | node scripts/migration-sequence-guard.mjs: nenhuma colis�o, 283 timestamps ap�s inclus�o |
| Migra��o criada pelo CLI | PASS | Supabase CLI 2.117.0, supabase migration new produtos_custos_security_invoker --workdir backend |
| Banco local | BLOCKED | docker info: pipe dockerDesktopLinuxEngine inexistente; TCP 127.0.0.1:54322 indispon�vel |
| Replay da migration e testes SQL | BLOCKED | Sem PostgreSQL local; su�te escrita, n�o executada |
| Vitest do helper/guard | BLOCKED | Depend�ncias ausentes no checkout isolado; tentativa de disponibilizar node_modules negada; MODULE_NOT_FOUND |
| Build | BLOCKED | Depend�ncias indispon�veis; nenhum componente frontend alterado |
| Advisor local | BLOCKED | Sem stack local para advisor; alerta eliminado ainda n�o demonstrado |
| Cadastro, estoque, pre�os, NF-e e relat�rios reais | BLOCKED | Sem API/banco local; nenhuma opera��o comercial de produ��o utilizada |
| VENDEDOR | BLOCKED / n�o represent�vel no schema atual | usuarios_perfil_check aceita OPERADOR, GERENTE, DONO, ADMIN; n�o alterar esse contrato nesta sprint |

`backend/supabase/tests/produtos_custos_security.test.sql` prepara 20 assertions pgTAP com fixtures descart�veis e rollback: GERENTE local/externo, DONO local, ADMIN global, inativo com uid v�lido, OPERADOR, sem uid, anon, valores exatos de custo/m�dio, leitura direta/infer�ncia negada e cat�logo sem custo permitido. Executa consultas sob o papel authenticated, n�o apenas introspec��o. A chamada SQL direta � fun��o privada tamb�m � testada como OPERADOR. Ainda n�o h� resultado de execu��o dessas assertions.

Ap�s restaurar o Docker, executar apenas na stack local descart�vel:

```powershell
supabase start --workdir backend
supabase db reset --local --workdir backend
supabase test db --workdir backend
supabase db advisors --local --type security --workdir backend
node scripts/migration-sequence-guard.mjs
```

Com depend�ncias instaladas e chaves EXCLUSIVAMENTE locais: executar os testes Vitest de custosProdutos/n1-preco-custo-guard, o smoke adversarial `backend/scripts/n1-preco-custo-authz-smoke.mjs` (recusa URL remota), build do pdv-importados e os fluxos de cadastro, estoque, precifica��o, importa��o NF-e e as quatro RPCs gerenciais. Confirmar tipagem/embeds PostgREST, inclusive filtro produto_id da consulta r�pida. O smoke existente n�o substitui todos esses fluxos.

## Rollback

N�o devolver GRANT SELECT de custos em produtos. Em transa��o, recuperar `prosrc` da fun��o privada e executar `CREATE OR REPLACE VIEW public.produtos_custos WITH (security_invoker=off) AS <prosrc>`, preservando os casts/tipos da consulta original. S� depois remover a fun��o sem CASCADE; manter o schema caso contenha outros objetos. Recarregar schema PostgREST. Testar rollback no ambiente isolado antes de us�-lo.

Esse rollback retorna exatamente � consulta privilegiada anterior e reintroduz o alerta security_definer_view; n�o � mitiga��o permanente. Requer a mesma autoriza��o expl�cita de produ��o que qualquer aplica��o. Nenhum script de rollback deve ser colocado na pasta de migrations como migration execut�vel autom�tica.

## Decis�es

Merge: **NO-GO** at� replay, 20 assertions, regress�es, build e Advisor passarem e revis�o confirmar a fronteira privilegiada.
Produ��o: **NO-GO** por testes pendentes e aus�ncia de autoriza��o expl�cita. PR deve permanecer draft, sem auto-merge.

Riscos remanescentes: SQL ainda n�o executado; compatibilidade de RETURNS TABLE/typmods e depend�ncias precisa ser confirmada; desempenho da fun��o set-returning n�o inlin�vel pode materializar mais custos autorizados do que o filtro externo solicita; medir cat�logo e RPCs com volume representativo. Nenhuma amplia��o de autoriza��o � intencional. N�o declarar encerramento da sprint por passar apenas o guard de sequ�ncia.
