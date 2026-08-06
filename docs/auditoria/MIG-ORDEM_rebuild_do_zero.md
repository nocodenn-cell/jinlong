# MIG-ORDEM — A cadeia de migrations não reconstrói do zero

**Descoberto em:** 2026-08-06, ao investigar o CI vermelho do PR #257.
**Origem:** não é um achado das auditorias anteriores; apareceu ao reproduzir localmente
os jobs de CI que sobem Supabase local (`supabase db reset` / `supabase start`).
**Status:** ABERTO — registrado, não corrigido. Ver "Decisão" no fim.

## Sintoma

Cinco checks do PR #257 falham, todos com a mesma causa de fundo:

| Check | Falha |
|---|---|
| `Supabase local RLS smoke` | cadeia de migrations aborta |
| `Test RLS scope by profile` | cadeia de migrations aborta |
| `E2E crítico (sistema de risco)` | depende de base local |
| `e2e-playwright` | depende de base local |
| `previewkit` | deploy de preview |

`rls-rest-gate` falha por outro motivo, independente: os JWTs de smoke
(`RLS_SMOKE_JWT_PAINEL` / `RLS_SMOKE_JWT_CAIXA`) retornam **401** — token expirado
ou revogado. Não tem relação com ordenação de migrations.

## Causa raiz

O diretório mistura dois esquemas de nomenclatura:

- **209** arquivos legados `NNN_nome.sql` (`001` … `302`)
- **42** arquivos `YYYYMMDDHHMMSS_nome.sql`

O Supabase ordena por comparação **lexicográfica** da versão. Como `"2026…"` começa com
`2` seguido de `0`, todo timestamp de 2026 ordena **entre** os legados `1xx` e `2xx`:

```
001 … 199   →   TODOS os 2026xxxxxxxxxx   →   205 … 302
```

Confirmado no log de `supabase start`: logo após
`Applying migration 20260801120000_recebimento_conferencia_explicita.sql`
vem `Applying migration 205_force_com_nf.sql`.

**A ordem de aplicação não é a ordem de autoria.** Migrations de agosto/2026 rodam antes
de migrations numeradas 205–302 que foram escritas antes delas.

## Falhas concretas já observadas

### 1. `20260730093000_revoga_operador_cadastro_produto_pdv.sql` — CORRIGIDA

O bloco 2 faz cirurgia textual em `ajustar_estoque_manual` procurando:

```sql
  v_estoque_inicial := p_motivo_codigo = 'ACERTO_INVENTARIO'
```

Mas o corpo escrito por `20260718135500` quebra a atribuição em duas linhas e deixa uma
linha em branco antes do `IF`:

```sql
  v_estoque_inicial :=
    p_motivo_codigo = 'ACERTO_INVENTARIO'
    AND COALESCE(BTRIM(p_observacao), '') = 'Estoque inicial no cadastro de produto';

  IF v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN')
```

O `position()` nunca casou → `RAISE EXCEPTION 'MIG_GATE_AJUSTE_NAO_ENCONTRADO'` →
**a cadeia inteira abortava**. Em produção o sintoma ficou mascarado pelo reparo de
histórico (`backend/docs/auditoria/supabase-migration-repair-20260802`).

**Correção aplicada:** o bloco passou a emitir `NOTICE` em vez de `EXCEPTION` quando
nenhum dos formatos casa, e os guard rails finais passaram a rodar só no caminho em que
esta migration de fato reescreveu a função. É seguro porque a migration **289**
(versão `20260805151822`, posterior) reescreve `ajustar_estoque_manual` já sem a exceção
de OPERADOR **e verifica o efeito** no mesmo commit
(`MIG289_SSOT01_STRING_MAGICA_REMANESCENTE`, `MIG289_SSOT01_OPERADOR_REMANESCENTE`).

### 2. `224_rls_initplan_wrap_auth_select.sql` — NÃO CORRIGIDA

```sql
ALTER POLICY "clientes_write_gerente_loja" ON public.clientes ...
```

A policy é criada em `112`, **removida** em `20260710212349_265_clientes_insert_operador_pdv.sql`
(`DROP POLICY IF EXISTS`) e alterada em `224`. Ordem pretendida: 112 → 224 → 265.
Ordem real: 112 → 265 → **224 falha**.

## Por que NÃO foi corrigido statement a statement

Guardar o `ALTER POLICY` com `IF EXISTS` deixaria o CI verde, mas a alteração de policy
**simplesmente não seria aplicada** — o banco reconstruído teria RLS diferente de produção,
e os jobs de RLS passariam validando um conjunto de policies que não é o real.
Verde falso em código de segurança é pior que vermelho honesto.

## O que foi verificado e está OK

A má ordenação **não** produz regressão de autorização nas duas funções endurecidas:
`269_ajustar_estoque_manual_service_ator.sql` e `270_criar_produto_com_estoque_inicial.sql`
são legados `2xx`, portanto rodam **por último**, e ambos mantêm o gate estrito
`GERENTE/DONO/ADMIN` sem exceção de OPERADOR. Conferido por leitura direta dos dois arquivos.

## Impacto

- Nenhum ambiente pode ser reconstruído do zero de forma fiel a produção.
- Todo job de CI que sobe Supabase local é estruturalmente inválido enquanto isso durar.
- Não é regressão do Pacote 5: os commits `4108ff92`, `a0af2969`, `f6a9ebb6`, `9330f1f9`
  e `1f3d16d1` não tocam nenhum dos arquivos envolvidos.

## Decisão (2026-08-06)

Registrar e seguir para o Pacote 6. Este item vira ticket próprio, **adjacente ao SSOT-02**
(que já está no Pacote 6 como "CI que verifica efeito real de migration" e é explicitamente
o último item do pacote). Faz sentido tratá-los juntos: não adianta um CI que valida efeito
de migration sobre uma cadeia que não reconstrói.

**Caminho provável quando for atacado:** gerar um baseline único a partir do schema de
produção (squash) e manter migrations incrementais a partir dali — prática padrão nesse
cenário. Alternativa (renumerar as 251 migrations para que a ordem lexicográfica volte a
coincidir com a de autoria) é mais invasiva e também exige reparo de histórico em produção.

**Pendência separada:** renovar `RLS_SMOKE_JWT_PAINEL` e `RLS_SMOKE_JWT_CAIXA`
(hoje 401 no `rls-rest-gate`).
