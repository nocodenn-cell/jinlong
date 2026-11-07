# Checklist de instalação — primeiro cliente (F1)

**Data:** 2026-11-07 · **Plano:** `docs/auditorias/PLANO_LIBERACAO_PRIMEIRO_CLIENTE_2026-11-06.md` (fase F, PR F1)
**Escopo contratado para o primeiro cliente:** web · loja única · um caixa · venda presencial · dinheiro, PIX, débito e crédito · **sem fiscal (sem NFC-e/NF-e emitidas pelo sistema)** · **sem fiado**.
**Status deste documento:** checklist. **Nada foi aplicado** em produção, homologação ou banco. Não há evidência de E2E de interface (plano, P0-4).

Legenda: `[ ]` pendente · **NÃO COMPROVADO** = não confirmado no código ou no ambiente. Caminhos são relativos à raiz do repositório.

Documentos complementares (não duplicar aqui):
- F2 contas e formas: `docs/ops/INSTALACAO_CONTAS_FINANCEIRAS_FORMAS_PAGAMENTO.md`
- F3 usuários, PIN e troca: `docs/ops/INSTALACAO_USUARIOS_PIN_TROCA_OPERADOR.md`
- F4 manual do operador: `MANUAL_OPERADOR_RESUMIDO.md`
- F6 rollback e suporte: `docs/ops/PLAYBOOK_ROLLBACK_E_SUPORTE_PRIMEIRO_CLIENTE.md`
- Catálogo de implantação já existente na aplicação: `pdv-importados/app/admin/implantacao/implantacaoCatalog.ts`

---

## 0. Bloqueadores antes de qualquer instalação em cliente real

Estes itens vêm do plano. Sem eles, **não instalar**.

- [ ] **Decisões D-04 a D-11 do dono registradas.** Plano §9: aprovadas em 2026-11-06 (D-04, D-05, D-06, D-07, D-09, D-11). D-12 (termos/fiscal, F5) não está no escopo deste checklist.
- [ ] **Migrations D1 a D5 e D2 aplicadas em produção, ou a loja de teste validada em homologação.** Plano §9: escritas e validadas em banco descartável (2026-11-07). Aplicação em produção **não autorizada nem feita**.
- [ ] **Migration `20261104120000` (privilégios de `anon`) aplicada em produção.** Plano P0-1, prioridade. Ver `docs/auditorias/PLANO_LIBERACAO_PRIMEIRO_CLIENTE_2026-11-06.md` §1.
- [ ] **Backup e PITR verificados** no painel e backup lógico com hash antes de cada migration (ver §2).
- [ ] **E2E de interface executado** (plano P0-4: "NÃO TESTADO"). Mínimo: login, venda em dinheiro, venda em PIX, pagamento dividido, cancelamento, fechamento de caixa.

---

## 1. Escopo: o que fica DESLIGADO na loja do cliente

| Item | Como garantir | Evidência |
|---|---|---|
| Emissão fiscal automática (NFC-e) | `pdv_config.auto_enqueue_fiscal = false` (padrão de loja nova) | `pdv-importados/lib/provisionamento/provisionamentoDefaults.ts:5-12`; `backend/supabase/migrations/20260621000500_209_fiscal_campos_loja_pdvconfig.sql:66` |
| Fiado (venda a prazo sem pagamento total) | **Não há chave de configuração para desligar.** O caixa aceita finalizar com saldo pendente, exigindo a seleção de um cliente, e o saldo vira contas a receber. Mitigação: operador orientado a não fazer (manual). Ver lacuna L-F2. | `pdv-importados/app/caixa/CaixaPageClient.tsx:1113-1120`, `:1184` |
| Importação internacional (`import_*`) | Não usar. Pipeline "não grava em estoque, custo, AP nem preço: manter desligado". | `PROXIMOS_PASSOS.md` (P1, item sobre pipeline de importação internacional) |
| Multi-loja, transferências, painel do dono | Fora do escopo (loja única). Recursos `multi_loja`, `transferencias`, `painel_dono` só aparecem no plano REDE do fallback. | `pdv-importados/lib/cobranca/planos.ts:10-14` (tipo `Recurso`), `:33-35` (`PLANOS_FALLBACK`) |
| PDV local Tauri (`pdv-local`) | Fora do escopo declarado ("versão web"). **NÃO COMPROVADO** que o cliente não usará o app desktop. | `pdv-local/README.md` (existe, não lido em detalhe) |

---

## 2. Backup antes de qualquer migration (produção)

Seguir `docs/ops/BACKUP_RESTAURACAO_SEM_PITR.md`:

- [ ] §1 — no painel, anotar PITR (sim/não), retenção e data/hora do último backup diário. **Sem isso, não autorizar produção** (texto do próprio documento).
- [ ] §2 — `pg_dump -Fc` somente leitura, `pg_restore --list`, `sha256sum`. Guardar fora do repositório.
- [ ] §3 — restore em contêiner descartável com contagens iguais às da origem. **Plano P0-3 indica que isso não foi feito em produção.**

---

## 3. Configuração da loja (aplicação)

Tela: **Configurações** (`/gerente/configuracoes`, ação `atualizarConfiguracoesPdvAction`, `pdv-importados/app/gerente/configuracoes/actions.ts:134-180`).

- [ ] Dados da loja (nome, CNPJ se houver, logo): `atualizarDadosLojaAction` (`actions.ts:89`). **NÃO COMPROVADO** quais campos são obrigatórios para o cupom.
- [ ] Idioma padrão e tema (campos `idioma_padrao`, `tema_padrao`, `actions.ts:134-180`). Tela de configuração: `pdv-importados/app/gerente/configuracoes/actions.ts`; a interface de formulário não foi lida.
- [ ] Formato de impressão **TERMICA** e impressão automática do cupom (`imprimir_cupom_auto`) — padrão do provisionamento (`provisionamentoDefaults.ts:5-12`). **Impressora térmica não foi testada** (plano, PDV-100: "Nenhum equipamento foi usado na validação").
- [ ] Regime tributário e CFOP/CST: mantidos nos padrões do provisionamento (`SIMPLES_NACIONAL`, `5102`, `00`). Não usados sem fiscal, mas a ação valida CST e CFOP (`actions.ts:134-160`).
- [ ] **Limite de sangria sem gerente**: padrão de **R$ 200** no código (`pdv-importados/app/caixa/CaixaPageClient.tsx:175`). Origem da atualização **NÃO COMPROVADO**. Definir com o dono e registrar.
- [ ] **Exigência de PIN do caixa e bloqueio por inatividade** (`exigir_pin_operador`, `bloqueio_inatividade_min`): sem tela no repositório. **Decidir antes da instalação.** Ver `INSTALACAO_USUARIOS_PIN_TROCA_OPERADOR.md` §3.5 e lacuna L1 daquele documento.

---

## 4. Contas financeiras e formas de pagamento (obrigatório para PIX e cartão)

Detalhe em `INSTALACAO_CONTAS_FINANCEIRAS_FORMAS_PAGAMENTO.md`.

- [ ] Plano da empresa inclui o recurso `financeiro` (**NÃO COMPROVADO** qual plano foi contratado; no fallback, `BASICO` não tem o recurso). Ver `pdv-importados/lib/cobranca/planos.ts:29`, `:33-35`.
- [ ] Conta **BANCO** ativa criada na aba "Contas e saldos" (`/admin/financeiro?tab=contas`).
- [ ] PIX, Cartão débito e Cartão crédito **vinculados** à conta bancária (`financeiro_contas_forma`).
- [ ] Dinheiro: sem conta ou conta **RESERVA** (gaveta).
- [ ] Venda de teste em cada uma das três formas concluída (ver F2 §5).

---

## 5. Usuários e perfis (obrigatório)

Detalhe em `INSTALACAO_USUARIOS_PIN_TROCA_OPERADOR.md`.

- [ ] DONO do cliente criado com e-mail e senha; acessa `/admin`.
- [ ] GERENTE (se houver) criado pelo DONO.
- [ ] Um OPERADOR por pessoa; nenhum login compartilhado.
- [ ] Cada operador entrou e caiu em `/caixa`.
- [ ] PINs do caixa definidos, **se** a loja exigir PIN (§3 acima).
- [ ] Senha do gerente para desconto e sangria definida no servidor. **NÃO COMPROVADO** como; ver F3 §5 e L1.
- [ ] Recuperação de senha testada, ou orientado o contato de suporte (rota `/auth/esqueci-senha` existe; envio de e-mail **NÃO COMPROVADO**).

---

## 6. Catálogo, estoque e preços

- [ ] Categorias cadastradas (`/gerente/categorias-produtos`).
- [ ] Produtos cadastrados pelo gerente. **O caixa não cadastra produto:** afirmação do manual atual (`MANUAL_OPERADOR_RESUMIDO.md`, "Produto não encontrado"). **NÃO COMPROVADO** no código do caixa; não foi feita busca específica por botão de cadastro rápido.
- [ ] **Produtos vendidos a granel** (balança) têm `unidade_medida` diferente de `UN`. D3 bloqueia fração em `UN`, e o default do cadastro é `UN` (plano §9). Pré-checagem em `docs/ops/PLAYBOOK_ROLLBACK_E_SUPORTE_PRIMEIRO_CLIENTE.md` §3.
- [ ] **Atacado**: preço de atacado só vale com quantidade mínima (gatilho). Produtos antigos com preço de atacado sem gatilho **são ignorados** pela venda até serem editados (plano §9, D6). Rodar a consulta da §3 do playbook.
- [ ] Estoque inicial: lançado por recebimento ou acerto, conforme o processo do cliente. **NÃO COMPROVADO** o fluxo de acerto de inventário na tela.

---

## 7. Operação do caixa (validar com o operador)

- [ ] Abrir caixa com operador e fundo (`CaixaAbrirTurnoModal`; "Abrir caixa", "Valor inicial (fundo)", `pt.json` 1241–1244).
- [ ] Venda com 4 formas e pagamento dividido. Confirmar que **Falta** chega a 0,00 antes de finalizar (`pt.json` `pdv_pgto_diferenca`, 1309).
- [ ] Troca de operador (ver F3 §4).
- [ ] **Fechamento com venda em espera bloqueado** (D1). Confirmar que a mensagem aparece e é compreendida. O operador vê mensagem genérica se o erro não for mapeado (ver lacuna L-F3).
- [ ] Sangria e suprimento com motivo (`CaixaMovimentacaoModal.tsx:37-41`).
- [ ] Cancelamento de venda (D2): em caixa fechado, o estorno em dinheiro vai ao caixa aberto único. Com **dois caixas abertos** o cancelamento é recusado (`CANCELAR_VENDA_CAIXA_ABERTO_AMBIGUO`). Para uma loja com um caixa, não há ambiguidade.

---

## 8. Gate de implantação (catálogo da aplicação)

Itens em `pdv-importados/app/admin/implantacao/implantacaoCatalog.ts:38-84`. Regras do gate em `:94-112`:
- Item **obrigatório** só passa como `CONCLUIDO`. `NA` **não** libera item obrigatório.
- Grupo `fiscal` (`fiscal.stub` | `fiscal.nfce`) exige **pelo menos um** item `CONCLUIDO`, mesmo com "sem fiscal" (ver lacuna L-F1).

Itens que este checklist cobre diretamente:
- [ ] `ambiente.url`, `ambiente.vars`, `ambiente.service_role`, `ambiente.storage` (obrigatórios).
- [ ] `loja.criada`, `loja.config`, `loja.pdv` (obrigatórios); `loja.impressora` opcional.
- [ ] `usuarios.dono`, `usuarios.gerente`, `usuarios.operadores`, `usuarios.login`, `usuarios.recuperacao_senha`.
- [ ] `cadastro.categorias`, `cadastro.produtos`, `cadastro.clientes`, `cadastro.fornecedores`.
- [ ] `operacao.abrir_caixa`, `operacao.venda`, `operacao.desconto`, `operacao.cancelamento`, `operacao.sangria`, `operacao.suprimento`, `operacao.fechar_caixa`.
- [ ] `financeiro.recebimento`, `financeiro.contas_pagar`, `financeiro.dashboard`. **NÃO COMPROVADO** se `financeiro.recebimento` se refere ao recebimento de mercadoria ou ao financeiro de contas a receber; ver L-F4.
- [ ] `homologacao.dados`, `homologacao.execucao_1`, `homologacao.execucao_2`, `homologacao.fluxo_completo`, `homologacao.cliente_treinado`, `homologacao.aceite`.

---

## 9. Lacunas encontradas neste checklist

- **L-F1 — Gate exige fiscal mesmo sem fiscal.** O grupo `fiscal` exige um item `CONCLUIDO` (`implantacaoCatalog.ts:106-112`). Para "sem fiscal", a equipe precisa marcar `fiscal.stub` como `CONCLUIDO` com observação, ou o gate não libera. Decidir: aceitar `NA` no grupo ou marcar `fiscal.stub`. Mudança de código fora deste PR.
- **L-F2 — Fiado não é bloqueado no caixa.** Ver §1. Operador é orientado, mas a tela aceita pagamento parcial com cliente (`CaixaPageClient.tsx:1113-1120`).
- **L-F3 — Erros de D2 e D5 chegam ao operador de forma genérica.** `pdv-importados/app/caixa/server/caixaErroOperador.ts` não mapeia `PAGAMENTO_SEM_CONTA_FINANCEIRA`, `CANCELAR_VENDA_CAIXA_ABERTO_AMBIGUO` nem `CANCELAR_VENDA_CAIXA_FECHADO_SEM_CAIXA_ABERTO` (busca por `cancelar_venda` só acha `cancelar_venda_saldo_caixa_insuficiente`, linha 151). Caem na mensagem padrão (`caixaErroOperador.ts:189-192`). O detalhe fica só no log do servidor (`caixaErroOperador.ts:108-121`). O erro de fechamento com venda em espera (D1) é mapeado (`caixaErroOperador.ts:140-142`).
- **L-F4 — Item `financeiro.recebimento` ambíguo** (ver §8).
- **L-F5 — Sem item de contas e formas no gate.** `implantacaoCatalog.ts` não tem item para conta financeira nem vínculo de forma. Pedido: incluir `financeiro.contas_formas` como obrigatório (mudança de código, fora deste PR).
- **L-F6 — Sem tela para PIN exigido, bloqueio de inatividade e senha do gerente.** Ver F3 §8 (L1).
- **L-F7 — Plano do cliente.** O recurso `financeiro` depende do plano, que não foi confirmado (F2 R1).
- **L-F8 — Impressora térmica e leitor de código de barras não testados** (plano PDV-100).
- **L-F9 — Checklist antigo de ativação fiscal.** `docs/CHECKLIST_ATIVACAO_FOCUS_1_DIA.md` trata da ativação fiscal (Focus NFe), fora do escopo. Não usar para este cliente.
