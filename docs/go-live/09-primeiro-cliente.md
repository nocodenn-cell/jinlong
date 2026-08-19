# 09 — Onboarding do primeiro cliente pagante

Voltar ao [plano](00-README.md). Este arquivo **orquestra**; o detalhe operacional está em
[`CHECKLIST_IMPLANTACAO_CLIENTE.md`](../../CHECKLIST_IMPLANTACAO_CLIENTE.md) (dia 0 técnico),
[`CHECKLIST_PRIMEIRO_DIA.md`](../../CHECKLIST_PRIMEIRO_DIA.md) (gerente) e
[`MANUAL_OPERADOR_RESUMIDO.md`](../../MANUAL_OPERADOR_RESUMIDO.md) (balcão).

---

## 1. Limites a comunicar — antes de assinar

Um cliente **pagante** precisa saber disso por escrito. Não são defeitos ocultos; são limites
documentados que ele vai encontrar.

| Limite | O que significa na prática |
|---|---|
| 🔴 **Fiscal é stub** | O sistema **não emite documento fiscal real**. `FISCAL_DEFAULT_DOC_TYPE=NFC_E_STUB`; a operação fiscal real está `NÃO COMPROVADA` (§8.3). Se o cliente precisa de NFC-e válida, **isso não está pronto**. |
| 🟠 **Reabertura de caixa** | Turno fechado nunca reabre. A regra aprovada (DB-07) é criar **novo turno excepcional vinculado**, e não foi localizada implementação de produto. |
| 🟠 **KPIs podem divergir entre telas** | Admin lê `vendas`; gerente/auditoria leem `venda_eventos` (FIN-298-07, aberto). |
| 🟡 **Telas financeiras não reconciliadas** | Só `/gerente/comissoes` e `/admin/comissoes` foram reconciliadas com o contrato líquido (§12.8). AR, AP, caixa e relatórios não. |
| 🟡 **Desktop tem riscos offline conhecidos** | [05](05-deploy-desktop.md) §2. Se possível, começar só com o web. |
| 🟡 **Sem ambiente de staging** | Correções e testes acontecem contra o mesmo banco de produção. |

## 2. Configuração da loja

| # | Passo | Onde |
|---|---|---|
| 1 | Criar a loja (razão social, CNPJ, endereço, timezone) | `/admin` |
| 2 | Criar usuários: dono, gerente(s), operador(es) | `/admin` |
| 3 | Definir perfis conforme a matriz de autorização | [`docs/AUTHORIZATION_MATRIX.md`](../AUTHORIZATION_MATRIX.md) |
| 4 | Configurar `pdv_config` da loja (limites de desconto, fechamento cego) | `/admin` |
| 5 | Definir modo e limite de crédito por loja (BR-01) | `/admin` |
| 6 | Configurar formas de pagamento aceitas | `/admin` |
| 7 | Cadastrar regras de comissão por funcionário | `/admin` |
| 8 | Configurar categorias financeiras | `/admin` |

> **Isolamento por loja é levado a sério** e validado dentro das RPCs. Gerente só atua na própria
> loja (DB-08). Não tente contornar criando usuário "global".

## 3. Dados iniciais

### 3.1 Ordem que importa

Respeitar as dependências: **categorias → marcas → fornecedores → produtos → estoque inicial →
clientes**.

| # | Dado | Cuidado |
|---|---|---|
| 1 | Categorias e categorias financeiras | — |
| 2 | Marcas | — |
| 3 | Fornecedores | multi-tenant por loja |
| 4 | **Produtos** | preço de custo, varejo, atacado, `quantidade_gatilho_atacado`, `estoque_minimo` |
| 5 | **Estoque inicial** | usar o fluxo de estoque inicial do cadastro; **não** editar tabela direto |
| 6 | Clientes | LGPD aplicável — só o necessário |

### 3.2 Cuidados com produtos

- **Custo correto desde o início.** A comissão por margem usa `custo_unitario_snap` gravado na
  venda. Custo errado no cadastro contamina a comissão de forma **não reconstruível depois**.
- **NCM é opcional** no catálogo (fiscal é stub), mas se o cliente pretende emitir nota no futuro,
  preencher agora evita retrabalho.
- **Código de barras é único por loja** (migration `102`, reaplicada em `20260816100949`).
- Faixa de atacado: conferir `quantidade_gatilho_atacado` — é o que dispara a reprecificação.

### 3.3 Importação em massa

Se houver planilha do cliente, validar **antes** de importar: duplicidade de código de barras,
custo zerado ou nulo, e faixa de atacado sem gatilho. Produto com `preco_custo` nulo **não vira
zero silenciosamente** na comissão — mas gera cálculo que ninguém consegue auditar depois.

## 4. Treinamento

### 4.1 Operador de caixa (~1h)

Base: [`MANUAL_OPERADOR_RESUMIDO.md`](../../MANUAL_OPERADOR_RESUMIDO.md).

1. Abrir caixa e informar valor inicial
2. Venda simples · leitura de código de barras
3. Venda com múltiplas formas de pagamento (split)
4. Desconto — **exige token de gerente** (`STRICT_MANAGER_DISCOUNT_AUTH=true`)
5. Venda em espera: colocar, retomar, descartar
6. Sangria e suprimento
7. Fechar caixa e conferir a diferença
8. O que fazer quando algo dá errado → [10](10-troubleshooting.md)

### 4.2 Gerente (~1h)

Base: [`CHECKLIST_PRIMEIRO_DIA.md`](../../CHECKLIST_PRIMEIRO_DIA.md).

1. Painel e KPIs — **e a ressalva de que telas podem divergir** (§1)
2. Autorizar desconto por token
3. Contas a receber: registrar recebimento parcial e total
4. Contas a pagar: registrar pagamento
5. Cancelamento e devolução/troca
6. Comissões: leitura do relatório
7. Conferência de fechamento de caixa
8. Transferências e ajuste de estoque

### 4.3 Dono (~30min)

1. Visão macro multi-loja
2. `/admin/implantacao` e o gate de Go-Live
3. Relatórios: margem, curva ABC, previsão de estoque
4. Limites do sistema (§1) — **esta conversa é obrigatória**

## 5. Primeira semana

| Dia | Foco |
|---|---|
| D0 | Acompanhamento presencial ou remoto o dia inteiro. Fechamento de caixa conferido em conjunto. |
| D+1 | Conferir comissões e reconciliação AR/AP do dia anterior |
| D+2 a D+5 | Contato diário no fechamento |
| D+7 | Revisão da semana: divergências, dúvidas recorrentes, ajuste de treinamento |

## 6. Checklist de saída

- [ ] Limites do §1 comunicados **por escrito** e aceitos
- [ ] Loja, usuários e perfis criados
- [ ] `pdv_config`, crédito e formas de pagamento configurados
- [ ] Regras de comissão cadastradas
- [ ] Catálogo importado e **custos conferidos**
- [ ] Estoque inicial lançado pelo fluxo correto
- [ ] Operador, gerente e dono treinados
- [ ] `go_autorizado = true` registrado para a loja
- [ ] Acompanhamento da primeira semana agendado

→ Próximo: [10-troubleshooting.md](10-troubleshooting.md)
