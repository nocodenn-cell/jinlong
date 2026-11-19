# Instalação — usuários, PIN do caixa e troca de operador (F3)

**Data:** 2026-11-07 · **Escopo:** web, loja única, sem fiscal, sem fiado · **Plano:** `docs/auditorias/PLANO_LIBERACAO_PRIMEIRO_CLIENTE_2026-11-06.md`, fase F (PR F3)
**Status:** documento derivado do código, **sem execução em ambiente**. Nomes de telas e botões vêm de `pdv-importados/src/lib/i18n/pt.json` (o app usa essas chaves). Itens **NÃO COMPROVADO** precisam de confirmação na instalação.

Convenções: `pt.json` = `pdv-importados/src/lib/i18n/pt.json`. Caminhos são relativos à raiz do repositório.

---

## 1. Perfis e quem cria o quê

| Perfil | Pode | Fonte |
|---|---|---|
| **DONO** | Cria e edita OPERADOR e GERENTE; define e desbloqueia PIN de ambos | `pdv-importados/app/admin/funcionarios/funcionarioPolicies.ts:4-45`; `actions.ts:53`, `:310` |
| **GERENTE** | Cria e edita apenas OPERADOR; define e desbloqueia PIN de OPERADOR | `funcionarioPolicies.ts:33-45`; `perfisAtribuiveisPorAtor` (`:21-27`) |
| **OPERADOR** | Usa o caixa (`/caixa`). Não acessa `/admin` nem `/gerente` | `pdv-importados/lib/admin/policy/adminPolicy.ts:56` (`ALL_ADMIN_PROFILES = GERENTE, DONO`), `:195-200` (redirect para `/caixa`) |

Regras de edição: DONO e ADMIN não são editados pela tela de funcionários (`funcionarioPolicies.ts:34-35`). Ninguém desativa a própria conta pela linha da lista (`funcionarioPolicies.ts:40-42`).

---

## 2. Cadastrar um funcionário

Tela: **Funcionários** (`/admin/funcionarios`, `pdv-importados/lib/navigation/routes.ts:47`). Botão **"Novo funcionário"** (`pt.json` `funcionarios.novo`, linha 2130).

Campos do formulário (`pdv-importados/app/admin/funcionarios/FuncionarioEditarModal.tsx`):

| Campo | Rótulo (`pt.json`) | Observação |
|---|---|---|
| Nome | "Nome" (`field_nome`, 2174) | obrigatório |
| E-mail | "E-mail" (`field_email`, 2175) | é o login do funcionário (ver §6) |
| Perfil | "Perfil" (`field_perfil`, 2177) | opções: **Operador** (`perfil_operador`, 2150) e **Gerente** (`perfil_gerente`, 2151). Mostradas só as permitidas ao usuário logado (`FuncionarioEditarModal.tsx:310-322`) |
| Senha | "Senha inicial" (`field_senha`, 2179) | mínimo de caracteres exibido na tela (`field_senha_hint`: "Mínimo {n} caracteres.") |
| PIN do caixa | "PIN do caixa (opcional)" (`field_pin`, 2119) | 4 dígitos; pode ser deixado em branco (ver §3) |
| Idioma | `FuncionarioEditarModal.tsx:324` | opcional |
| Telefone, CPF, cargo, admissão, observações | `FuncionarioEditarModal.tsx:403-444` | não são necessários para operar |

Ao salvar, a ação `criarFuncionarioAction` valida o perfil com `podeAtribuirPerfil` (`pdv-importados/app/admin/funcionarios/actions.ts:310-311`). Se o perfil não for permitido, a tela mostra "Você não tem permissão para criar este perfil."

**Antes de dar acesso ao funcionário:** confirmar que o login funciona (ver §6) e que a conta está **ativa** na lista.

---

## 3. PIN do caixa

### 3.1 O que é (e o que não é)

- O **PIN do caixa** é um código de **4 dígitos por pessoa**, guardado com hash (`pdv-importados/lib/pdv/pinOperador.ts`, `PBKDF2`, `20261021230000_pdv_operador_pin_p0.sql`).
- Serve para **desbloquear o caixa** depois de um bloqueio, e só desbloqueia o **mesmo operador** (`pdv-importados/app/caixa/server/caixaTrocaOperador.impl.ts:85-90`).
- **Não é um "PIN de gerente".** No código não há PIN de gerente. A autorização de desconto e de sangria acima do limite usa a **senha do gerente** (ver §5).
- **Não entra no sistema.** O texto de "Meu PIN do caixa" diz "PIN de 4 números para entrar e trocar de operador no PDV sem e-mail e senha" (`pt.json` `meu_pin.subtitulo`, 1930). **Isso não confere com o código:** a troca de operador termina com logout e novo login por e-mail e senha (`pdv-importados/app/caixa/CaixaTrocaOperador.tsx:121`), e o PIN só é pedido na tela de bloqueio (`CaixaTrocaOperador.tsx:296-393`). Não há ação de login por PIN no repositório web (busca por `loginPin`/`signInWithPin`, sem resultado). **Usar a tela de bloqueio como única função do PIN até o texto ser corrigido.** Ver lacuna L2.

### 3.2 Como definir

Dois caminhos:

**a) Pelo gerente/dono** (equipe):
1. **Funcionários** → linha do funcionário → botão **"Definir PIN"** (ou **"Trocar PIN"** se já tiver). Rótulos: `pt.json` `funcionarios.pin_definir` (2114), `pin_trocar` (2115). O botão só aparece para funcionário **ativo**, que **não seja o próprio usuário** e que o gerente pode editar (`pdv-importados/app/admin/funcionarios/FuncionarioRowActions.tsx:51-55`).
2. Modal **"PIN do caixa — {nome}"** (`pin_modal_titulo`, 2117): digitar o PIN e repetir.
3. A mensagem de sucesso diz: "PIN salvo. O funcionário deve trocá-lo no primeiro uso." (`pin_salvo`, 2122). O gerente grava `trocar_no_primeiro_uso` (`definirPinFuncionarioAction`, `actions.ts:601-624`).
   **NÃO COMPROVADO:** que o caixa force a troca do PIN no primeiro uso. O campo existe no banco (`20261021230000_pdv_operador_pin_p0.sql`, coluna `trocar_no_primeiro_uso`), mas a tela de bloqueio não foi lida para essa regra.

**b) Pelo próprio funcionário**:
1. Menu **"Meu PIN do caixa"** (`/caixa/meu-pin`, `pdv-importados/app/caixa/meu-pin/page.tsx`).
2. Botões **"Criar meu PIN"** / **"Trocar meu PIN"** (`meu_pin.definir_meu` 1931, `trocar_meu` 1932), campos "Novo PIN" (1934) e "Repita o PIN" (1935), botão **"Salvar PIN"** (1936).
3. Mensagem: "PIN salvo. Ele vale no caixa após a próxima sincronização do PDV." (`meu_pin.salvo`, 1937). **Atenção:** o PIN pode só valer depois da sincronização. Confirmar na instalação (NÃO COMPROVADO o intervalo).

### 3.3 Regras do PIN

Implementadas em `pdv-importados/lib/pdv/pinRegras.ts:1-18` (mesma regra de `public.pdv_pin_obvio` no banco):
- Exatamente 4 dígitos (`erro_formato`).
- Não pode ser repetido (ex.: 1111) nem estar na lista de sequências/comuns (ex.: 1234, 4321, 2580, 1010, 6969) (`erro_obvio`).
- Os dois campos precisam ser iguais (`erro_confirmacao`).

### 3.4 Bloqueio por tentativas

Servidor (`20261021230000_pdv_operador_pin_p0.sql:131-147`):
- **5 erros seguidos**: bloqueio de **5 minutos**. Mensagem: "Muitas tentativas. Tente de novo em 5 minutos." (`pt.json` `troca_erro_pin_bloqueado`, 1201).
- **10 erros**: bloqueio até **o gerente liberar** no painel. Mensagem: "PIN bloqueado. O gerente precisa liberar no painel." (1202).
- Liberação pelo gerente: botão **"Desbloquear"** na linha do funcionário (`funcionarios.pin_desbloquear`, 2116), ação `desbloquearPinFuncionarioAction` (`actions.ts:626-650`).
- O bloqueio por tentativas zera quando o PIN é redefinido ou quando o gerente desbloqueia.

Também existe **"Liberar / apagar PIN"** na tela "Meu PIN do caixa" para a equipe (`meu_pin.resetar`, 1943). **NÃO COMPROVADO** quem vê esse botão (a tela de equipe não foi aberta além da leitura das chaves).

### 3.5 Quando o PIN é exigido

- A loja só exige PIN se `pdv_config.exigir_pin_operador = true`. Padrão **false** (`20261021230000_pdv_operador_pin_p0.sql:27`).
- O bloqueio por inatividade usa `pdv_config.bloqueio_inatividade_min`. Padrão de 3 minutos no front (`pdv-importados/app/caixa/caixaTrocaOperadorRegras.ts:6`).
- **Não existe tela no repositório que grave `exigir_pin_operador` nem `bloqueio_inatividade_min`.** A tela de configurações do PDV só grava CST, CFOP, regime, idioma, tema, impressão e formato (`pdv-importados/app/gerente/configuracoes/actions.ts:134-180`). **NÃO COMPROVADO** como ligar a exigência de PIN na loja do cliente. Ver lacuna L1.
- Se a exigência estiver desligada, o botão **"Bloquear"** não aparece no caixa (`CaixaTrocaOperador.tsx:216`, `ctx.pin.exigido`).

---

## 4. Troca de operador (no caixa)

Tela: **PDV** (`/caixa`). Botão **"Trocar operador"** (`pt.json` `caixa.troca_btn`, 1176). Botão **"Bloquear"** (1177) só com PIN exigido (§3.5).

Passo a passo, conforme o código:

1. **Pré-condições** (`pdv-importados/app/caixa/CaixaTrocaOperador.tsx`, parâmetro `motivoBloqueada` do hook, linhas 62–73; textos em `pt.json` 1180–1181):
   - Não pode haver **venda em andamento** no cupom. Mensagem: "Finalize ou coloque em espera a venda atual antes de trocar de operador."
   - Não pode haver **finalização em curso**. Mensagem: "Aguarde a venda em andamento terminar antes de trocar de operador."
2. Clicar em **"Trocar operador"** → diálogo **"Trocar operador?"** (1178). Texto: "O turno continua aberto. Você sai do caixa e o próximo operador entra com o próprio login e assume a gaveta. Vendas em espera ficam no seu nome." (1179).
3. Confirmar. O caixa é liberado (mensagem "Caixa liberado. Saindo para o próximo operador…", 1182) e a sessão vai para a tela de login com `reason=troca_operador` (`CaixaTrocaOperador.tsx:121`).
4. O próximo operador entra com **e-mail e senha** (`pdv-importados/app/login/LoginForm.tsx:241-277`) e cai no `/caixa` (`adminPolicy.ts:195-200`).
5. Ao entrar, o turno aberto aparece como **"Turno aberto aguardando operador"** (`troca_liberados_titulo`, 1183). O operador usa **"Assumir este caixa"** (`troca_assumir_btn`, 1185).

Casos de erro (`pt.json` 1195–1204):
- "Outro operador está neste caixa. Só um gerente pode assumir." (`troca_erro_em_uso`)
- "Você já tem outro caixa aberto. Feche-o antes de assumir este." (`troca_erro_outro_caixa`)
- "Você não é o operador ativo deste caixa." (`troca_erro_nao_operador`)
- "Este turno já foi fechado." (`troca_erro_caixa_fechado`)

**Gerente pode assumir** o caixa de outro operador (texto em `troca_proprio_em_uso`, 1187). **NÃO COMPROVADO:** o fluxo exato da tela do gerente para isso, e se o gerente precisa de PIN nesse caso.

---

## 5. Autorização do gerente (desconto e sangria)

Não é PIN. É a **senha do gerente**, validada no servidor pela Edge Function `validar-gerente` (`backend/supabase/functions/validar-gerente/index.ts:1-8`, `:174-195`). A senha é comparada com `pdv_config.gerente_senha_bcrypt` (`backend/supabase/functions/_shared/gerente-auth.ts`, `:246-310`). O usuário gerente precisa ser `GERENTE` ou `DONO` e estar ativo.

Pontos de uso na tela:
- **Desconto gerente**: botão "Desconto gerente" (`pt.json` 1409). Modal **"Autorização do gerente"** (1446) com passo **"Senha"** (1447, placeholder "Senha do gerente", 1448) e passo **"Percentual de desconto (máx. {max}%)"** (1455). Regra: **"Desconto só vale para venda paga totalmente em dinheiro."** (1419).
- **Sangria acima do limite**: o limite padrão é R$ 200 no código (`pdv-importados/app/caixa/CaixaPageClient.tsx:175`). Acima dele, o modal pede a senha do gerente (`CaixaMovimentacaoModal.tsx:71`, mensagem em `pt.json` 1480).

**NÃO COMPROVADO:** onde a senha do gerente é **definida** na instalação. A tela de funcionários não grava `gerente_senha_bcrypt`, e a tela de configurações do PDV também não (`app/gerente/configuracoes/actions.ts`). Só há referências em scripts de ambiente (`docs/AMBIENTES_E_RELEASE.md:161`, `docs/CHECKLIST_UNIFICACAO_FLUXO_VENDAS.md:122`), que usam senha de teste. Ver lacuna L1.

---

## 6. Login e recuperação de senha

- Login: **e-mail** e **senha** (`pdv-importados/app/login/LoginForm.tsx:241-277`).
- Recuperação: rota `/auth/esqueci-senha` existe (`pdv-importados/app/auth/esqueci-senha`), e `/auth/redefinir-senha`. **NÃO COMPROVADO:** envio de e-mail em produção (depende da configuração do provedor de autenticação).
- Funcionário desativado perde o acesso: a ativação/desativação grava um bloqueio longo no Auth (`funcionarioPolicies.ts:42-45`, `banDurationParaAtivo`) e revoga tokens pendentes (`docs/ops/RECUPERACAO_ACESSO_TOKENS.md` §1).
- **Reativar não devolve token revogado.** Ver `docs/ops/RECUPERACAO_ACESSO_TOKENS.md` §1–3.

---

## 7. Checklist de usuários (para executar na instalação)

- [ ] DONO do cliente cadastrado e acessando `/admin`.
- [ ] Um GERENTE cadastrado (se o cliente tiver) e acessando `/admin`.
- [ ] Um OPERADOR por pessoa que vai vender. Nenhum login compartilhado.
- [ ] Cada operador entrou uma vez e confirmou que cai em `/caixa`.
- [ ] Cada operador com **PIN do caixa** definido (pelo gerente ou por "Meu PIN do caixa"), se a loja for usar bloqueio.
- [ ] Senha do gerente definida no servidor, **conferida** por venda de teste com desconto (§5). **NÃO COMPROVADO** como é feito; ver L1.
- [ ] Teste de troca de operador: um operador troca para outro e o segundo assume o caixa (§4).
- [ ] Teste de PIN errado 5 vezes: bloqueio de 5 minutos aparece; o gerente desbloqueia (§3.4). **Só se a loja exigir PIN.**
- [ ] Dados de teste de usuários **removidos** ou desativados antes de liberar o cliente.

---

## 8. Lacunas (para decisão do dono ou do time técnico)

- **L1 — Configuração de PIN e senha do gerente sem tela.** `exigir_pin_operador`, `bloqueio_inatividade_min` e `gerente_senha_bcrypt` são lidos pelo sistema mas não há tela no repositório que os grave (§3.5, §5). Sem isso, a instalação depende de SQL manual, sem registro de quem fez.
- **L2 — Texto de "Meu PIN do caixa" diz que o PIN serve para entrar.** O código só usa o PIN para desbloquear (§3.1). Corrigir o texto ou implementar login por PIN antes de treinar o operador.
- **L3 — Forçar troca de PIN no primeiro uso não comprovado** (§3.2).
- **L4 — Papel do gerente na troca de operador.** O fluxo de "assumir o caixa de outro operador" não foi percorrido (§4).
- **L5 — Sem PIN de gerente.** Se o cliente espera "PIN de gerente" (como o pedido de F3 sugeria), isso **não existe**. A autorização usa senha do gerente (§5). Decidir qual dos dois o cliente quer.
