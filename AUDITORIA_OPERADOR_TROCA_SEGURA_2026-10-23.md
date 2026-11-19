# Auditoria — Operador de caixa e Troca Segura de Operador (PDV web Jinlong)

Data: 2026-10-23 · Módulo: `pdv-importados` (PDV web `/caixa`) com referência ao `pdv-local` (desktop Tauri) · Escopo: só leitura, sem migrations, deploy, push ou merge.

> **Resumo.** No PDV web, o "operador" **é o usuário autenticado no Supabase** (JWT). O turno (`public.caixas`) pertence a esse usuário, e o banco exige `auth.uid() = p_operador_id = caixas.operador_id` em toda venda. Por isso hoje **não existe troca de operador sem fechar o turno** no web. O PDV desktop já resolveu isso ("caixa do terminal" + PIN), mas confia na chave do dispositivo, não no JWT. A proposta separa três papéis que hoje se misturam numa coluna só: **operador ativo** (quem está digitando), **vendedor** (quem recebe a comissão) e **responsável financeiro pelo turno** (quem abriu o caixa e responde pela gaveta).

---

## 1. Diagnóstico do funcionamento atual

| # | Pergunta | Resposta (evidência) |
|---|---|---|
| 1 | Quem renderiza `Vendedor / 销售员` | `pdv-importados/app/caixa/CaixaVendedorSelect.tsx`, montado em `CaixaPageClient.tsx:1757`. Some quando a loja tem menos de 2 vendedores. |
| 2 | O seletor muda o quê? | **Só o vendedor da venda.** O operador não muda. O valor fica no `localStorage` (`jl:caixa:vendedor:<operadorId>`, em `caixaVendedor.ts`) e só é gravado **depois** da venda concluída, pela RPC `definir_vendedor_venda` (`server/caixaVendedor.impl.ts:35`). Quando o vendedor é o próprio operador, nada é gravado (`NULL` = operador). |
| 3 | De onde vem `Op: Dono Demo` | `app/caixa/page.tsx:27-48`, nesta ordem: `user_metadata.full_name` → `usuarios.nome` → parte do e-mail antes do `@` → `user.id`. O valor desce como `operadorLabel` até `CaixaPdvTopBar.tsx:58` (`m.caixa.topbar_operador`). |
| 4 | Usuário × funcionário × vendedor × caixa × turno | **Usuário** = `auth.users` com `public.usuarios`, ligado 1:1 pelo mesmo `id`. **Funcionário** = o mesmo usuário com um vínculo em `usuario_vinculos (empresa_id, loja_id, papel DONO/GERENTE/OPERADOR)` (`20261019120000_multiempresa_fase1_base.sql:48`). **Vendedor** = qualquer usuário ativo da loja (`listar_vendedores_loja`, `20261021200000…:518`). **Caixa = turno** = uma linha em `public.caixas` com `operador_id` (quem abriu) e no máximo um `ABERTO` por operador (`uq_caixas_operador_aberto`, `20260731202100…:51`). Não existe entidade "estação" no web: `p_terminal_id` é a constante `'web-caixa'` (`server/caixaVendas.impl.ts:325`). |
| 5 | Já existe troca, bloqueio ou senha? | **Web:** nenhuma troca. O bloqueio por inatividade **faz logout** (`components/security/SessionIdleLogout.tsx`, ligado por `NEXT_PUBLIC_IDLE_LOGOUT_MINUTES`). A autorização de gerente usa a Edge `validar-gerente`, que emite um token (`server/caixaGerenteDesconto.impl.ts:50`). **Desktop:** troca completa por PIN, com tela de bloqueio, bloqueio em 3 min, cache offline cifrado e auditoria (`pdv-local/src/operador/*`, `src-tauri/src/operador.rs`). **Banco:** `usuario_pin`, `pdv_operador_eventos` e `pdv_config.exigir_pin_operador` (`20261021230000_pdv_operador_pin_p0.sql`). |
| 6 | Como vendas e movimentações registram responsáveis | **Venda web:** `finalizar_venda_transacional_canonica_v4` com `p_operador_id = user.id`, que vem do servidor (`caixaVendas.impl.ts:303`). O banco valida em `20260916120000_sec04…:95-129`: recusa `p_operador_id ≠ auth.uid()` e `caixas.operador_id ≠ uid`. Depois vêm `vendas.vendedor_id` (opcional), `gerente_id` e `descontos_venda` (desconto com gerente) e `venda_eventos` (ledger). **Movimentação:** `registrar_movimentacao` com `v_uid = COALESCE(auth.uid(), p_operador_id)` exige `c.operador_id = v_uid` ou gerente (`20261007170000_ssot_002…:33-97`). **Venda desktop:** `operador_id` vem do payload do dispositivo: o operador do PIN tem prioridade e, sem PIN, vale `PDV_OPERADOR_ID` (`pdv-local/src-tauri/src/db.rs:442`). Vai por `registrar_venda_com_itens` com service_role, sem amarrar ao dono do caixa. |
| 7 | Permissões front × banco | **Front:** o `perfil` do usuário chega a `CaixaPageClient` só para decidir o que a tela mostra. `page.tsx:37` barra usuário inativo ou sem loja. **Servidor/banco:** `fp_assert_loja`, `fp_usuario_pode_loja` (com `papeis[]`), `fp_pode_loja`, as checagens de operador e caixa listadas acima, e RLS. As funções do PIN são SECURITY DEFINER com `REVOKE` de anon/authenticated. |
| 8 | Isolamento empresa/loja/estação | Empresa e loja ficam isoladas por `usuario_vinculos` + `fp_*` + RLS (multiempresa fases 1–5). Estação: só no desktop (`pdv_dispositivos`, chave do dispositivo com HMAC no `sync-outbox`). No web não há estação. O carrinho persistido fica isolado por dono (`CaixaCarrinhoAuthSync.tsx`, `setCartOwnerForSession(uid, lojaId)`). |
| 9 | O que é reutilizável | Ver seção 3. |

---

## 2. Evidências-chave (código e banco)

- **Amarração operador ↔ JWT ↔ caixa (web).** Em `backend/supabase/migrations/20260916120000_sec04_token_gerente_vinculo_loja_v4.sql`:
  - linha 107: `IF v_auth_uid IS NOT NULL AND p_operador_id IS DISTINCT FROM v_auth_uid THEN RAISE 'FINALIZAR_VENDA_CANONICA_OPERADOR_INVALIDO'`
  - linha 125: `IF v_caixa_operador_id IS DISTINCT FROM v_uid THEN RAISE 'FINALIZAR_VENDA_CANONICA_CAIXA_OPERADOR_INVALIDO'`
- **Um turno aberto por operador.** `CREATE UNIQUE INDEX uq_caixas_operador_aberto ON caixas(operador_id) WHERE status='ABERTO'`.
- **Abertura e fechamento por usuário.** `app/caixa/server/caixaSessaoOperador.impl.ts`: `writer.open({operadorId: user.id})` e `fechar_caixa_atomico(p_operador_id)`. O status sai de `obter_status_caixa_operador(p_operador_id)`.
- **Vendedor gravado em dois passos.** A venda é gravada primeiro, e `definir_vendedor_venda` roda depois. Só o operador da venda, em até 24 h, ou um gerente pode chamar (`20261021200000…:491-498`). Se falhar, a comissão fica com o operador e a falha aparece em "Falhas".
- **PIN já pronto no banco.** PBKDF2-SHA256 com 150k iterações, derivado no servidor (`lib/pdv/pinOperador.ts`). Erros: 5 bloqueiam por 5 min; 10 só o gerente libera (`pdv_pin_registrar_tentativa`). Eventos `ENTROU/SAIU/BLOQUEIO_AUTO/PIN_ERRADO/OVERRIDE_GERENTE` ficam em `pdv_operador_eventos`. **O PDV web ainda não usa nada disso.** Só aparece em `database.types.ts`, na tela "Meu PIN" e em Funcionários.
- **Troca no desktop.** `pdv-local/src-tauri/src/operador.rs:1` diz "caixa do terminal (opção A: a troca não fecha o caixa)". `sair()` limpa o operador e registra `SAIU/BLOQUEIO_AUTO`. O carrinho continua na tela.

---

## 3. O que já existe e pode ser reutilizado

| Peça | Onde | Uso na Troca Segura |
|---|---|---|
| Supabase Auth (senha) | `lib/supabase/*`, `/login` | **Credencial do novo operador no web.** É a única identidade que o banco aceita (`auth.uid()`). |
| `usuario_pin` + `derivarPinHash` + `pdv_pin_registrar_tentativa` | migration PIN P0, `lib/pdv/pinOperador.ts` | Desbloquear a tela do **mesmo** operador depois de inatividade (não troca a identidade) |
| `pdv_operador_eventos` | migration PIN P0 | **Trilha de auditoria** das trocas. Os tipos `ENTROU/SAIU/BLOQUEIO_AUTO` já existem. |
| `pdv_config.exigir_pin_operador`, `bloqueio_inatividade_min` | migration PIN P0 | Flags por loja; reutilizar e não criar outras |
| `listar_vendedores_loja`, `CaixaVendedorSelect` | comissão P0 | Lista de funcionários autorizados da loja (quem pode operar = vínculo ativo na loja) |
| `fp_usuario_pode_loja(uid, loja, papeis)` | multiempresa fase 1 | Validar no servidor quem pode operar o caixa de uma loja |
| `CaixaCarrinhoAuthSync` | `app/caixa/` | Já troca o dono do carrinho quando a sessão muda e já reage a `onAuthStateChange` |
| `LockScreen`, `PinPad`, `useOperadorPin` (desktop) | `pdv-local/src/operador/` | Modelo de UX e textos PT/中文 ("Trocar operador / 切换操作员") |
| `fechar_caixa_atomico` + snapshot por forma | `caixaFechamentoServer`, `fechamentoPorForma.impl.ts` | Base da futura "passagem de turno com conferência" |

---

## 4. Lacunas reais

**Segurança**
1. **Nome do operador falsificável.** O rótulo `Op:` dá prioridade a `user_metadata.full_name`, que o próprio usuário pode editar via `auth.updateUser`. O cadastro (`usuarios.nome`) deveria ser a fonte única. É só exibição (o banco grava o `id`), mas engana na conferência visual e em prints.
2. **Bloqueio por inatividade = logout.** Ou o caixa fica aberto e desbloqueado, ou o operador perde a sessão. Não existe bloqueio de tela com desbloqueio pelo mesmo operador.
3. **Sem auditoria de quem esteve no caixa web.** `pdv_operador_eventos` não recebe nada do web: login, logout e inatividade não ficam registrados por caixa.
4. **Mais de uma aba.** A sessão Supabase é compartilhada entre as abas do navegador. Se alguém entra com outro usuário numa aba, as outras continuam mostrando o operador antigo até recarregar. O servidor está protegido, porque o `user.id` vem do cookie e a v4 valida. A **interface** é que mente, e um carrinho meio montado pode ser finalizado em nome do novo usuário.

**Operação**
5. **Sem troca de operador sem fechar o turno.** Hoje é fechar o caixa de A e abrir o de B (com contagem), ou B usar o login de A, que é exatamente o risco que se quer eliminar.
6. **"Operador" e "responsável financeiro" são a mesma coluna** (`caixas.operador_id` e `vendas.operador_id`). Não há como registrar "B vendeu no turno de A".
7. **Estação inexistente no web.** Dois navegadores do mesmo usuário operam o mesmo caixa ao mesmo tempo sem detecção (`p_terminal_id='web-caixa'`).
8. **Divergência web × desktop.** O desktop grava vendas com `operador_id` ≠ `caixas.operador_id` (caixa do terminal). O web proíbe. Relatórios por operador e o fechamento leem o mesmo `caixas.operador_id` com significados diferentes conforme a origem.

---

## 5. Proposta funcional (modelo)

### 5.1 Três papéis, sem duplicar identidade

| Papel | Fonte da verdade | Muda quando |
|---|---|---|
| **Responsável financeiro pelo turno** | `caixas.operador_id` (**mantido**, só ganha documentação desse significado) | Abertura, e no futuro uma transferência formal com conferência |
| **Operador ativo** | **Novo:** `caixa_operadores` (estado) + `pdv_operador_eventos` (trilha) | Troca de operador |
| **Vendedor** | `vendas.vendedor_id` (já existe) | Por venda, no seletor |

**Por que uma tabela nova.** `pdv_operador_eventos` é um log de eventos, sem estado e sem restrição. Garantir **um único operador ativo por caixa** (sem concorrência) exige um índice único parcial sobre uma linha de estado. É a única tabela nova proposta:

```sql
caixa_operadores (
  id uuid pk, caixa_id uuid fk caixas, usuario_id uuid fk usuarios, loja_id uuid,
  inicio timestamptz default now(), fim timestamptz null,
  motivo_fim text check (motivo_fim in ('TROCA','FECHAMENTO','EXPULSO_GERENTE','SESSAO_OBSOLETA')),
  sessao_ref text  -- id da aba/sessão que assumiu (detecção de aba obsoleta)
)
UNIQUE (caixa_id) WHERE fim IS NULL          -- um operador ativo por caixa
UNIQUE (usuario_id) WHERE fim IS NULL        -- ninguém opera dois caixas ao mesmo tempo
```

`vendas.operador_id` passa a significar **o operador ativo** no momento da venda. É o comportamento que o desktop já tem, e nenhuma coluna nova é necessária em `vendas`.

### 5.2 Regra no servidor (mudança mínima na v4 e em `registrar_movimentacao`)

Troca da checagem `caixas.operador_id = uid` por:

```
operador_permitido(caixa) = COALESCE(<usuario_id ativo em caixa_operadores>, caixas.operador_id)
exigir operador_permitido(caixa) = auth.uid()  AND  fp_usuario_pode_loja(auth.uid(), caixa.loja_id, ARRAY['DONO','GERENTE','OPERADOR'])
```

Isso **impede o operador substituído de operar**: assim que B assume, a sessão de A, mesmo que ainda válida em outra aba, recebe `CAIXA_OPERADOR_INVALIDO`. Caixa sem linha ativa continua com o comportamento atual, então a mudança é retrocompatível. A checagem `auth.uid() = p_operador_id` **continua**.

### 5.3 Credencial

- **Troca de identidade (A → B) no web = login real do Supabase de B** (senha, ou OTP no futuro). O PIN **não** pode criar uma sessão de B no web sem um esquema de autenticação próprio, e a Etapa 3 proíbe isso.
- **PIN = desbloqueio do mesmo operador** depois de inatividade, verificado no servidor (`derivarPinHash` + `pdv_pin_registrar_tentativa` via server action com service_role; o ator vem da sessão validada, como em `pdv_pin_loja_gerida`).
- No desktop continua o modelo atual (PIN + chave do dispositivo). Ele passa a gravar `caixa_operadores` também (via `sync-outbox`) para relatórios unificados.

---

## 6. UX da barra superior

```
[ Op: Ana Souza · Operadora ▾ ]  [Turno de: Dono Demo · aberto 08:02]  [🔒 Bloquear]  [⇄ Trocar operador / 切换操作员]
```

- `Op:` sempre de `usuarios.nome` (corrige a lacuna 1). O papel vem do vínculo.
- "Turno de" aparece **só quando o responsável ≠ operador ativo**, deixando a separação visível.
- **Bloquear** (F12 / Ctrl+L): cobre a tela e pede o PIN do mesmo operador. O carrinho é mantido.
- **Trocar operador**: tela "Quem vai usar o caixa? / 谁来使用收银台？" com os funcionários da loja (`listar_vendedores_loja` filtrado por vínculo ativo), depois e-mail pré-preenchido e senha.
- O seletor `Vendedor / 销售员` continua no rodapé, **com padrão = operador ativo** (a chave do `localStorage` já é por operador).

---

## 7. Fluxo detalhado de troca

1. **Pré-condições (cliente, depois confirmadas no servidor):** carrinho vazio, ou estacionado em "venda em espera" no nome de A; nenhuma finalização em andamento (`finalizando`/`processandoCaixa` em `CaixaPageClient`); nenhum pagamento TEF/PIX pendente; nenhum modal de gerente aberto. Se algo falhar, a ação é bloqueada com o motivo na tela.
2. A clica **Trocar operador**. A server action `iniciarTrocaOperador()` grava `SAIU (motivo=TROCA)` em `pdv_operador_eventos`, **não** encerra a linha ativa (A continua dono até B assumir) e devolve um `troca_id`.
3. A interface faz `supabase.auth.signOut({ scope: 'local' })` (só este navegador), limpa o carrinho persistido de A (`resetCarrinhoPersistido`) e mostra a tela de seleção.
4. B escolhe o nome e digita a **própria senha** em `signInWithPassword`.
5. Com B autenticado, a server action `assumirCaixa(caixa_id, troca_id, sessao_ref)` chama uma RPC SECURITY DEFINER `assumir_caixa_operador`, que, numa transação:
   - valida `fp_usuario_pode_loja(auth.uid(), caixa.loja_id, …)`, caixa `ABERTO` e B sem outro caixa aberto e sem outro caixa ativo;
   - faz `SELECT … FOR UPDATE` no caixa (serializa duas trocas simultâneas);
   - encerra a linha ativa (`fim=now(), motivo_fim='TROCA'`) e cria a de B;
   - grava `ENTROU` com `detalhe = {caixa_id, anterior: A, troca_id}`.
6. Em todas as abas, `onAuthStateChange` / `BroadcastChannel('jl-caixa')` recebe a mudança de usuário e força `location.reload()`. Uma aba antiga que tentar vender recebe o erro do servidor, que a interface traduz como "Outro operador assumiu este caixa".
7. **Vendas em espera de A** continuam no nome de A (`operador_id`). B só as retoma pelo fluxo de retomada já existente, que já trata reivindicação concorrente (`caixaVendaEspera.claim`).
8. **Fechamento:** continua com o responsável (`caixas.operador_id`) ou um gerente. A RPC de fechamento encerra a linha ativa (`motivo_fim='FECHAMENTO'`).
9. **Futuro — transferência formal com conferência:** `transferir_responsabilidade_caixa(caixa, valor_contado, formas)` reaproveita o cálculo de `fechar_caixa_atomico` e o snapshot por forma, mas em vez de fechar grava a contagem parcial e troca `caixas.operador_id` para B (a regra de um caixa aberto por operador continua valendo).

---

## 8. Impactos

| Área | Impacto |
|---|---|
| **Banco** | Uma tabela (`caixa_operadores`) com RLS de leitura por `fp_pode_loja`, sem escrita direta. Duas RPCs (`assumir_caixa_operador`, `registrar_evento_operador_web`). Ajuste de uma condição na v4, em `registrar_movimentacao`, `estornar_movimentacao` e `obter_status_caixa_operador` (que passa a encontrar o caixa onde o usuário é o operador **ativo**). Nenhuma coluna alterada, nenhum dado migrado. |
| **Autenticação** | Nenhuma nova. Supabase Auth para a identidade, PIN existente para o desbloqueio. |
| **Auditoria** | `pdv_operador_eventos` passa a receber eventos `origem='online'` do web. Somar uma aba "Operadores" em `/admin/auditoria` (hoje lê `venda_eventos`, `descontos_venda`…). |
| **Relatórios e comissão** | `vendas.operador_id` = operador ativo, como no desktop. Relatórios por turno continuam por `caixa_id`. Comissão não muda (o padrão de `vendedor_id` já é o operador). |
| **Fechamento cego** | Não muda: o caixa, os valores e o responsável são os mesmos. |

---

## 9. Plano incremental (cada fase entregável sozinha)

| Fase | Entrega | Banco? | Risco |
|---|---|---|---|
| **F0** | Rótulo `Op:` a partir de `usuarios.nome`; aviso entre abas (`BroadcastChannel` + reload na troca de usuário) | Não | Baixo |
| **F1** | Botão **Trocar operador** = logout local + login de B com as pré-condições do passo 1. B abre o **próprio** caixa (modelo atual). Eventos `SAIU/ENTROU` via RPC | 1 RPC | Baixo |
| **F2** | **Bloquear tela com PIN** (mesmo operador) no lugar do logout por inatividade quando `exigir_pin_operador` está ligado | Não (reaproveita o PIN P0) | Baixo/médio |
| **F3** | `caixa_operadores` + `assumir_caixa_operador` + ajuste na v4 e nas movimentações: **troca sem fechar o turno** | Sim (ADR) | **Médio/alto**: mexe na RPC canônica de venda |
| **F4** | Desktop grava `caixa_operadores` pelo `sync-outbox`; relatórios unificados | Sim | Médio |
| **F5** | Transferência formal de responsabilidade com conferência de numerário | Sim | Médio |

A F3 exige um **ADR** e uma decisão de negócio (ver Riscos), porque altera o SSoT de "quem pode vender neste caixa".

---

## 10. Matriz de testes e riscos de regressão

**Testes (por camada)**

| Cenário | Tipo | Resultado esperado |
|---|---|---|
| A troca para B com carrinho vazio | e2e (Playwright) | Barra mostra B; eventos `SAIU(A)`/`ENTROU(B)`; venda seguinte com `operador_id=B` |
| Troca com carrinho cheio / finalizando / TEF pendente | comportamento (RTL) | Botão bloqueado com o motivo |
| Aba antiga de A tenta vender depois que B assumiu | SQL (pgTAP em `backend/supabase/tests`) + e2e | `CAIXA_OPERADOR_INVALIDO` e mensagem traduzida |
| Duas trocas simultâneas no mesmo caixa | SQL (duas transações) | Uma vence; a outra recebe erro de unicidade ou lock |
| B já tem outro caixa aberto | SQL | Recusado |
| B de outra loja ou empresa | SQL | `SEM_PERMISSAO` (`fp_usuario_pode_loja`) |
| Usuário inativo ou sem vínculo | SQL + page | Recusado / redirect |
| PIN errado 5× / 10× no desbloqueio | unit + SQL | 5 min / só o gerente libera |
| Caixa sem `caixa_operadores` (legado) | SQL | Comportamento atual idêntico (regressão zero) |
| Fechamento depois de trocas | integração | Valores iguais aos de hoje; linha ativa encerrada |
| Vendedor ≠ operador depois da troca | unit (`caixaVendedor.test.ts`) | Padrão = novo operador; `localStorage` separado por operador |
| Venda em espera de A retomada por B | integração | Reivindicação pelo fluxo existente, sem duplicar |
| Desktop offline com PIN (regressão) | Rust (`operador.rs` tests) | Sem mudança |

**Riscos de regressão**
- **v4 (F3):** é a RPC mais crítica do sistema. Mitigação: condição aditiva (`COALESCE(ativo, caixas.operador_id)`), testes de contrato existentes (`finalizarVendaCaixa.integration.test.ts`, `vendaConsistency.integration.test.ts`) e a guarda de assinatura do `20260809120837_finalize_v4_scope_guard_22args.sql`.
- **`obter_status_caixa_operador`:** se B passa a "ver" o caixa de A, o botão "Abrir caixa" de B some. Revisar a interface do turno.
- **Gaveta compartilhada:** com troca sem fechamento, uma diferença no fechamento cego **não identifica mais quem errou**. Por isso a F5 (conferência na passagem) é recomendada para lojas com rotatividade alta.
- **Drift de migrations:** `PROXIMOS_PASSOS.md` registra drift main × produção justamente na migration do PIN. Confirmar antes da F2/F3.

---

## Decisão pendente (negócio)

Na Jinlong, a gaveta física é **do turno** (vários operadores, um responsável), como no desktop, ou **de cada operador** (cada um abre e fecha o seu)?
- **Do turno:** seguir F0 → F3 (troca sem fechar o turno), com F5 recomendada.
- **De cada operador:** F0 → F2 bastam. A "troca" vira o operador sair do caixa dele e o colega abrir o próprio, sem mexer na v4.

---

## 11. Implementação F0–F3 (2026-10-23) — decisão: gaveta do turno

Decisão de negócio: **a gaveta é do turno** (vários operadores, um responsável). Implementado neste worktree, **sem aplicar migration em nenhum ambiente remoto**, sem push nem merge.

### O que foi entregue

| Fase | Entrega | Onde |
|---|---|---|
| F0 | `Op:` vem de `usuarios.nome` (o cadastro) antes de `user_metadata` | `pdv-importados/app/caixa/page.tsx` |
| F0 | Troca/bloqueio numa aba recarrega as outras abas (`BroadcastChannel jl-caixa-operador`); o servidor barra a aba antiga de qualquer forma | `app/caixa/CaixaTrocaOperador.tsx` |
| F1 | Botão **Trocar operador** (pré-condições: carrinho vazio, nada finalizando) → libera o caixa → logout → `/login?reason=troca_operador` | `CaixaTrocaOperador.tsx`, `CaixaPdvTopBar.tsx`, `app/login/LoginForm.tsx` |
| F1 | Turno liberado aparece para quem entrar: **Assumir este caixa**; o responsável vê "Seu turno está com X" | `CaixaTrocaAvisos` |
| F1 | "Turno de: X" na barra quando o responsável ≠ operador ativo | `CaixaTrocaControles` |
| F2 | **Bloquear** (botão ou inatividade, `pdv_config.bloqueio_inatividade_min`) quando a loja exige PIN e o usuário tem PIN; desbloqueio pelo PIN do **mesmo** usuário, conferido no servidor (PBKDF2, contador 5/10, eventos `PIN_ERRADO`/`BLOQUEADO`) | `server/caixaTrocaOperador.impl.ts` |
| F3 | Tabela `caixa_operadores` (um ativo por caixa, ninguém ativo em dois), RPCs `liberar_/assumir_/bloquear_caixa_operador`, `desbloquear_caixa_operador` (só service_role), `pdv_troca_contexto`; trilha em `pdv_operador_eventos` | `backend/supabase/migrations/20261023200000_pdv_troca_operador_caixa.sql` + rollback |

### Regra única no servidor

`internal.fp_operador_ativo_caixa(caixa, responsável)`: caixa nunca trocado ⇒ o responsável (comportamento de hoje); com histórico ⇒ só o operador ativo **não bloqueado**; liberado ou bloqueado ⇒ ninguém. Aplicada por troca de texto **verificada** (falha a migration se o trecho não existir) em: `finalizar_venda_transacional_canonica_v4`, `registrar_movimentacao`, `estornar_movimentacao`, `obter_status_caixa_operador`, `fechar_caixa_atomico`, `resolver_caixa_pagador`. Leituras do turno (`calcular_valor_sistema_*`, `listar_caixas_fechamento_formas` e policies PERMISSIVE de SELECT em `caixas`, `movimentacoes_caixa`, `vendas`, `vendas_pagamentos`, `caixas_fechamento_formas`) aceitam também quem **participou** do turno. `tenant_guard` multiempresa aplicada na tabela nova.

### Ajustes em relação à proposta (§7)

- **Quem fecha** é o operador ativo (quem conta a gaveta); `caixas.operador_id` continua sendo o responsável e o fechamento registra `SAIU motivo=FECHAMENTO`. Responsável que não está operando recebe `CAIXA_NAO_ENCONTRADO`; gerente/dono assume e fecha.
- **Bloqueio fica no banco** (`caixa_operadores.bloqueado_em`), não só na tela: recarregar a página não desbloqueia, e o bloqueado não vende nem movimenta.
- Caixa bloqueado não pode ser liberado; para outra pessoa operar, o próprio operador desbloqueia ou um gerente assume (evento `ENTROU forcado=true`).

### Testes executados

- `node backend/scripts/pdv-troca-operador.test.mjs` — **16/16** sobre o esquema real (todas as migrations em PGlite): legado sem regressão, liberar/assumir, substituído não vende nem movimenta, concorrência, bloqueio e desbloqueio só por service_role, isolamento entre empresas, gerente forçando, outro caixa aberto, fechamento, leitura do turno, trilha, multiempresa e rollback.
- `node backend/scripts/multiempresa-fase2-cobertura.test.mjs` — continua falhando **como já falhava em `main`** (tabelas de comissão, importação e PIN sem guarda; contagem do rollback). Nenhum objeto da troca aparece nas listas de falha.
- `pdv-importados`: typecheck limpo; testes do caixa, login, recibo e PIN — ver resultado final no resumo da sessão.

### Pendências

- Aplicar a migration em homologação (`jinlong-homolog-palm`) e testar com dois usuários reais antes de produção; produção só depois.
- Tela de gerente com o histórico de `caixa_operadores` / `pdv_operador_eventos` em `/admin/auditoria`.
- Vendas em espera continuam com quem as criou (B não vê as de A).
- `retomar_caixa_atomico` não foi alterado (reabertura continua pelo responsável).
- F4 (PDV desktop gravando `caixa_operadores`) e F5 (transferência formal com conferência de numerário).
