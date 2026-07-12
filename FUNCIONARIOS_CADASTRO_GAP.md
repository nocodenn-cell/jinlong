# FUNCIONARIOS_CADASTRO_GAP — Cadastro de Funcionários

> Fase 4 da missão Go-Live Jinlong. Data: 2026-07-12.
> Resultado: **GAP identificado — não implementado.** Ver "Por que não foi
> implementado" abaixo. Implementar exige autorização explícita (schema + criação
> de usuário + feature nova, todos fora do escopo autônomo permitido).

## Fluxo esperado (missão)

```
Gerente → Cadastro funcionário → Banco → Permissão → Login → PDV
```

## Estado atual (validação de código)

| Etapa | Existe? | Evidência |
|---|---|---|
| Gerente autenticado | ✅ | `usuarios.perfil in ('OPERADOR','GERENTE','DONO')`, guardas RLS `perfil in ('GERENTE','DONO')`. |
| **UI de cadastro de funcionário** | ❌ | Nenhuma rota/tela em `app/gerente` ou `app/admin`. Grep por `signUp`, `admin.createUser`, `inviteUserByEmail`, insert em `usuarios` → **nenhum resultado**. |
| Gravação no banco (`auth.users` + `usuarios`) | ⚠️ parcial | Tabela `usuarios` existe (`001_schema_inicial.sql`), referencia `auth.users(id)`. Mas **não há caminho na aplicação** que insira nela. |
| Permissão (perfil) | ✅ modelo existe | Coluna `perfil` + RLS por perfil já modelados. Falta só a **atribuição via UI**. |
| Login do funcionário | ✅ | `app/login/LoginForm.tsx` (Supabase `signInWithPassword`) funciona para qualquer usuário já existente. Note: **`signup` está desabilitado** no Supabase Auth (confirmado em teste `mensagemErroUsuario.test.ts`). |
| Acesso ao PDV | ✅ | `middleware.ts` libera `/caixa` para sessão válida; perfil lido em `caixa/page.tsx`. |

## Diagnóstico

O modelo de dados e o login **já suportam** múltiplos operadores. O que falta é
**o meio de criar um funcionário sem sair para o console do Supabase**:

1. Não existe tela de "novo funcionário" para o gerente.
2. `signup` público está desabilitado (correto por segurança), então o funcionário
   não se auto-cadastra.
3. Criar o usuário hoje exige: criar o usuário em **Supabase Auth** (via console ou
   service role) **e** inserir a linha correspondente em `public.usuarios` com
   `nome` + `perfil`.

**Impacto no go-live:** o gerente **não consegue** cadastrar um novo operador
amanhã sem apoio do desenvolvedor / acesso ao Supabase. Este é o risco **R2** do
`PDV_OPERATIONAL_AUDIT.md`.

## Por que não foi implementado nesta execução autônoma

A implementação mínima cruza **três** limites que a própria missão exige confirmar
antes de executar:

- **Criar usuários** (regra: "precisar remover/criar dados" → confirmar). A criação
  em Supabase Auth exige a **service_role key** e a chamada `auth.admin.createUser`.
- **Alterar schema / RLS** (regra: "precisar alterar schema existente" → confirmar).
  Um fluxo seguro provavelmente precisa de uma migration isolada (ex.: função
  `SECURITY DEFINER` para o gerente criar operador, ou policy de INSERT em
  `usuarios`).
- **Feature nova** (regra: "nenhuma feature nova"). Uma tela de cadastro é feature.

Por segurança, **documentei e parei**, conforme a regra "Se encontrar risco alto:
documentar, criar relatório, não executar".

## Caminho mínimo recomendado (para aprovação)

Ordem sugerida quando autorizado:

1. **Migration isolada** (`2xx_gerente_cadastrar_operador.sql`):
   - Função `SECURITY DEFINER` `gerente_cadastrar_operador(email, nome, perfil, senha_temp)`
     que valida `auth.uid()` como GERENTE/DONO e cria o par `auth.users` + `usuarios`.
   - **Não** tocar em `vendas`, `fn_registrar_comissao`, `trg_registrar_comissao`
     nem em `finalizar_venda_transacional_canonica_v4`.
2. **Server action** `cadastrarFuncionario` chamando a RPC (nunca expor service_role
   ao cliente).
3. **Tela** `app/gerente/funcionarios` (form: nome, e-mail, perfil, senha temporária)
   + listagem/desativação (`usuarios.ativo`).
4. **Regressão:** garantir que o novo operador loga e acessa `/caixa`.

### Alternativa imediata (sem código, para o dia 1)

Se o go-live for antes de implementar o item acima, o gerente/dono cria os
operadores manualmente no **Supabase Studio** (Authentication → Add user) e insere
a linha em `public.usuarios` (`id` = id do auth user, `nome`, `perfil='OPERADOR'`,
`ativo=true`). Documentar esse procedimento no runbook da loja.

## Conclusão da Fase 4

Gap real e relevante para autonomia da loja (**R2**). Modelo e login prontos;
falta a camada de cadastro. **Não implementado** por exigir schema + criação de
usuário + feature nova — pendente de autorização explícita.
